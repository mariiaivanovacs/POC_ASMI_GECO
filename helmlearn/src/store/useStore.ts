import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { Attempt, AuditAction, AuditEntry, AuditTarget, Category, Certificate, ExType, Exercise, Enrollment, Lang, Learner, Material, Provider, Refresher, Reminder, ReviewerRole, Settings, Stage } from '../data/types';
import { seedActivity, seedAudit, seedCertificates, seedLearners, seedMaterials } from '../data/seed';
import { extOf, kindOf, normalizeUrl } from '../engine/extract';
import { generate } from '../engine/generate';
import { runPipeline } from '../engine/pipeline';
import { buildCertificatePdf, certificateFileName, downloadBytes, verificationCode } from '../engine/certificate';
import { MATERIAL_COMPLIANCE, regimeById } from '../data/compliance';
import { canIssueCertificate, quizAvg, type Ctx } from './stats';
import { hashString, uid } from '../engine/rng';

export interface Toast { id: string; text: string; kind: 'ok' | 'err' | 'info' }

interface State {
  materials: Material[];
  exercises: Exercise[];
  learners: Learner[];
  attempts: Attempt[];
  enrollments: Enrollment[];
  settings: Settings;
  refreshers: Refresher[];
  reminders: Reminder[];
  acked: string[];
  audit: AuditEntry[];
  certificates: Certificate[];
  toasts: Toast[];
  storageOk: boolean;
  seededAt: number;

  addMaterials: (files: File[], category: Category) => Material[];
  addMaterialFromUrl: (url: string, category: Category) => Material | null;
  processMaterial: (id: string) => Promise<void>;
  deleteMaterial: (id: string) => void;
  setCategory: (id: string, category: Category) => void;
  updateExerciseTitle: (id: string, title: string) => void;
  deleteExercise: (id: string) => void;
  regenerateType: (materialId: string, type: ExType) => number;
  recordAttempt: (a: Omit<Attempt, 'id' | 'at'>) => void;
  publishModule: (materialId: string, depts: string[]) => number;
  setLang: (lang: Lang) => void;
  setPlayAs: (learnerId: string) => void;
  setPin: (pin: string) => void;
  setProvider: (provider: Provider) => void;
  setApiKey: (apiKey: string) => void;
  setTranslate: (translate: boolean) => void;
  scheduleRefresher: (learnerId: string, materialId: string, dueInDays?: number) => void;
  enrolLearner: (learnerId: string, materialId: string) => boolean;
  remindLearner: (learnerId: string, materialId: string) => Reminder;
  ackAlert: (id: string) => void;
  setReviewer: (name: string, role: ReviewerRole) => void;
  approveExercise: (id: string) => void;
  rejectExercise: (id: string, note: string) => void;
  issueCertificate: (learnerId: string, materialId: string) => Certificate | null;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;
  resetDemo: () => void;
}

const DEFAULT_SETTINGS: Settings = { pin: '1234', lang: 'en', playAs: 'l1', provider: 'local', apiKey: '', translate: true, reviewerName: '', reviewerRole: 'Trainer' };
const files = new Map<string, File>();
export const runtimeFiles = files;

function buildSeed() {
  const { materials, exercises } = seedMaterials();
  const { attempts, enrollments } = seedActivity(exercises);
  const learners = seedLearners();
  const certificates = seedCertificates();
  return { materials, exercises, learners, attempts, enrollments, certificates, seededAt: Date.now(), audit: seedAudit(materials, exercises, certificates, learners) };
}

function logAuditEntry(actor: string, role: string, action: AuditAction, targetType: AuditTarget, targetId: string, detail: string): AuditEntry {
  return { id: uid('log'), at: Date.now(), actor: actor || 'System', role: (role || 'System') as AuditEntry['role'], action, targetType, targetId, detail };
}

function safeStorage(): Storage {
  const mem = new Map<string, string>();
  const memory: Storage = {
    get length() { return mem.size; },
    clear: () => mem.clear(), getItem: (k) => mem.get(k) ?? null, key: (i) => Array.from(mem.keys())[i] ?? null,
    removeItem: (k) => { mem.delete(k); }, setItem: (k, v) => { mem.set(k, v); },
  };
  try {
    const k = '__helmlearn_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return {
      get length() { return window.localStorage.length; },
      clear: () => window.localStorage.clear(),
      getItem: (key) => window.localStorage.getItem(key),
      key: (i) => window.localStorage.key(i),
      removeItem: (key) => window.localStorage.removeItem(key),
      setItem: (key, v) => { try { window.localStorage.setItem(key, v); } catch { storageFailed = true; memory.setItem(key, v); } },
    };
  } catch {
    storageFailed = true;
    return memory;
  }
}
let storageFailed = false;

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...buildSeed(),
      settings: DEFAULT_SETTINGS,
      refreshers: [],
      reminders: [],
      acked: [],
      toasts: [],
      storageOk: true,

      addMaterials: (fileList, category) => {
        const existing = get().materials;
        const added: Material[] = [];
        for (const f of fileList) {
          let name = f.name;
          let n = 2;
          while (existing.some((m) => m.name === name) || added.some((m) => m.name === name)) {
            name = f.name.replace(/(\.[a-z0-9]+)?$/i, ' (' + n++ + ')$1');
          }
          const ext = extOf(f.name);
          const id = uid('m');
          files.set(id, f);
          added.push({
            id, name, short: name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40), ext: ext || 'file', kind: kindOf(ext), category,
            pages: 0, status: 'queued', stage: null, pct: 0, error: null, text: null, structure: null, widgets: null,
            seed: hashString(name + f.size), createdAt: Date.now(), langs: ['en'], missingTypes: [], source: 'local', note: null, complianceIds: [], sourceUrl: null,
          });
        }
        set({ materials: [...added, ...existing] });
        return added;
      },

      addMaterialFromUrl: (rawUrl, category) => {
        let url: string;
        try { url = normalizeUrl(rawUrl); }
        catch { get().toast('That does not look like a valid URL.', 'err'); return null; }
        const existing = get().materials;
        let host = '';
        try { const u = new URL(url); host = u.hostname.replace(/^www\./, '') + (u.pathname !== '/' ? u.pathname : ''); } catch { host = url; }
        let name = host.slice(0, 60);
        let n = 2;
        while (existing.some((m) => m.name === name)) name = host.slice(0, 60) + ' (' + n++ + ')';
        const id = uid('m');
        const material: Material = {
          id, name, short: name.slice(0, 40), ext: 'url', kind: 'Web page', category,
          pages: 0, status: 'queued', stage: null, pct: 0, error: null, text: null, structure: null, widgets: null,
          seed: hashString(url), createdAt: Date.now(), langs: ['en'], missingTypes: [], source: 'local', note: null, complianceIds: [], sourceUrl: url,
        };
        set({ materials: [material, ...existing] });
        return material;
      },

      processMaterial: async (id) => {
        const m = get().materials.find((x) => x.id === id);
        if (!m || m.status === 'processing') return;
        const patch = (p: Partial<Material>) => set({ materials: get().materials.map((x) => (x.id === id ? { ...x, ...p } : x)) });
        patch({ status: 'processing', stage: 'reading', pct: 0, error: null });
        try {
          const st = get().settings;
          const r = await runPipeline(m, files.get(id) || null, (u) => patch({ stage: u.stage as Stage, pct: u.pct, note: u.note || null }), { provider: st.provider, apiKey: st.apiKey, translate: st.translate });
          const others = get().exercises.filter((e) => e.materialId !== id);
          set({
            exercises: [...others, ...r.exercises],
            materials: get().materials.map((x) => (x.id === id ? {
              ...x, status: 'processed', stage: 'ready', pct: 100, text: r.text, pages: r.pages, ext: r.ext, kind: r.kind,
              structure: r.structure, widgets: r.widgets, missingTypes: r.missing, error: null, source: r.source, langs: r.langs, note: r.note,
            } : x)),
          });
          if (r.note) get().toast(r.note, 'err');
          get().toast(r.exercises.length + ' exercises drafted from ' + m.short + (r.source === 'deepseek' ? ' by DeepSeek' : '') + (r.missing.length ? ' · no source for: ' + r.missing.join(', ') : ''), 'ok');
          const st2 = get().settings;
          set({ audit: [...get().audit, logAuditEntry(st2.reviewerName || 'System', st2.reviewerRole, 'material_processed', 'material', id, r.exercises.length + ' exercises drafted (' + r.source + ') from ' + m.short)] });
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Processing failed.';
          patch({ status: 'failed', stage: null, pct: 0, error: msg });
          get().toast(msg, 'err');
        }
      },

      deleteMaterial: (id) => {
        files.delete(id);
        set({
          materials: get().materials.filter((m) => m.id !== id),
          exercises: get().exercises.filter((e) => e.materialId !== id),
          enrollments: get().enrollments.filter((e) => e.materialId !== id),
          attempts: get().attempts.filter((a) => a.materialId !== id),
        });
      },

      setCategory: (id, category) => set({ materials: get().materials.map((m) => (m.id === id ? { ...m, category } : m)) }),
      updateExerciseTitle: (id, title) => set({ exercises: get().exercises.map((e) => (e.id === id ? { ...e, title: title.trim() || e.title } : e)) }),
      deleteExercise: (id) => set({ exercises: get().exercises.filter((e) => e.id !== id), attempts: get().attempts.filter((a) => a.exerciseId !== id) }),

      regenerateType: (materialId, type) => {
        const m = get().materials.find((x) => x.id === materialId);
        if (!m || !m.structure) return 0;
        const seed = m.seed + Date.now() % 100_000;
        const r = generate(materialId, m.structure, seed, type);
        const stamped = r.exercises.map((e) => ({ ...e, id: e.id + '_' + seed.toString(36) }));
        const kept = get().exercises.filter((e) => !(e.materialId === materialId && e.type === type && e.generated));
        set({ exercises: [...kept, ...stamped], materials: get().materials.map((x) => (x.id === materialId ? { ...x, seed } : x)) });
        return stamped.length;
      },

      recordAttempt: (a) => set({ attempts: [...get().attempts, { ...a, id: uid('a'), at: Date.now() }] }),

      publishModule: (materialId, depts) => {
        const targets = get().learners.filter((l) => depts.includes(l.dept));
        const existing = get().enrollments;
        const fresh = targets.filter((l) => !existing.some((e) => e.learnerId === l.id && e.materialId === materialId)).map((l) => ({ learnerId: l.id, materialId, at: Date.now() }));
        set({ enrollments: [...existing, ...fresh] });
        const m = get().materials.find((x) => x.id === materialId);
        const st = get().settings;
        set({ audit: [...get().audit, logAuditEntry(st.reviewerName || 'System', st.reviewerRole, 'module_published', 'module', materialId, fresh.length + ' learner(s) enrolled in ' + (m?.short || materialId) + ' across: ' + depts.join(', '))] });
        return fresh.length;
      },

      setLang: (lang) => set({ settings: { ...get().settings, lang } }),
      setPlayAs: (playAs) => set({ settings: { ...get().settings, playAs } }),
      setPin: (pin) => set({ settings: { ...get().settings, pin } }),
      setProvider: (provider) => set({ settings: { ...get().settings, provider } }),
      setApiKey: (apiKey) => set({ settings: { ...get().settings, apiKey: apiKey.trim() } }),
      setTranslate: (translate) => set({ settings: { ...get().settings, translate } }),
      scheduleRefresher: (learnerId, materialId, dueInDays = 3) => {
        const others = get().refreshers.filter((r) => !(r.learnerId === learnerId && r.materialId === materialId));
        set({ refreshers: [...others, { learnerId, materialId, at: Date.now(), due: Date.now() + dueInDays * 86_400_000 }] });
      },
      ackAlert: (id) => set({ acked: Array.from(new Set([...get().acked, id])) }),
      enrolLearner: (learnerId, materialId) => {
        if (get().enrollments.some((e) => e.learnerId === learnerId && e.materialId === materialId)) return false;
        const l = get().learners.find((x) => x.id === learnerId);
        const m = get().materials.find((x) => x.id === materialId);
        if (!l || !m) return false;
        const st = get().settings;
        set({
          enrollments: [...get().enrollments, { learnerId, materialId, at: Date.now() }],
          audit: [...get().audit, logAuditEntry(st.reviewerName || 'System', st.reviewerRole, 'learner_enrolled', 'learner', learnerId, l.name + ' enrolled in ' + m.short)],
        });
        return true;
      },
      remindLearner: (learnerId, materialId) => {
        const l = get().learners.find((x) => x.id === learnerId);
        const m = get().materials.find((x) => x.id === materialId);
        const st = get().settings;
        const reminder: Reminder = { learnerId, materialId, at: Date.now(), via: l?.sup || 'supervisor' };
        set({
          reminders: [...get().reminders.filter((r) => !(r.learnerId === learnerId && r.materialId === materialId)), reminder],
          audit: [...get().audit, logAuditEntry(st.reviewerName || 'System', st.reviewerRole, 'reminder_sent', 'learner', learnerId, 'Reminder to finish ' + (m?.short || materialId) + ' sent to ' + (l?.name || learnerId) + ' via supervisor ' + reminder.via)],
        });
        return reminder;
      },
      setReviewer: (reviewerName, reviewerRole) => set({ settings: { ...get().settings, reviewerName, reviewerRole } }),
      approveExercise: (id) => {
        const st = get().settings;
        const actor = st.reviewerName || 'Unnamed reviewer';
        set({ exercises: get().exercises.map((e) => (e.id === id ? { ...e, reviewStatus: 'approved', reviewedBy: actor, reviewedAt: Date.now(), reviewNote: null } : e)) });
        const e = get().exercises.find((x) => x.id === id);
        set({ audit: [...get().audit, logAuditEntry(actor, st.reviewerRole, 'exercise_approved', 'exercise', id, 'Approved "' + (e?.title || id) + '"')] });
      },
      rejectExercise: (id, note) => {
        const st = get().settings;
        const actor = st.reviewerName || 'Unnamed reviewer';
        set({ exercises: get().exercises.map((e) => (e.id === id ? { ...e, reviewStatus: 'rejected', reviewedBy: actor, reviewedAt: Date.now(), reviewNote: note || null } : e)) });
        const e = get().exercises.find((x) => x.id === id);
        set({ audit: [...get().audit, logAuditEntry(actor, st.reviewerRole, 'exercise_rejected', 'exercise', id, 'Rejected "' + (e?.title || id) + '"' + (note ? ': ' + note : ''))] });
      },
      issueCertificate: (learnerId, materialId) => {
        const state = get();
        const ctx: Ctx = { learners: state.learners, materials: state.materials, exercises: state.exercises, attempts: state.attempts, enrollments: state.enrollments, certificates: state.certificates, now: Date.now() };
        if (!canIssueCertificate(ctx, learnerId, materialId)) { state.toast('Not eligible yet — every task must be approved and the module 100% complete.', 'err'); return null; }
        const learner = state.learners.find((l) => l.id === learnerId);
        const material = state.materials.find((m) => m.id === materialId);
        if (!learner || !material) return null;
        const existing = state.certificates.find((c) => c.learnerId === learnerId && c.materialId === materialId);
        // A certificate inside its renewal window (or already lapsed) is replaced; a valid one is re-downloaded.
        const renew = !!existing && existing.expiresAt - Date.now() <= 30 * 86_400_000;
        let cert = existing;
        if (!cert || renew) {
          const issuedAt = Date.now();
          const regime = regimeById(material.complianceIds[0]);
          const expiresAt = issuedAt + (regime ? regime.renewalMonths : 12) * 30 * 86_400_000;
          cert = { id: uid('cert'), learnerId, materialId, issuedAt, expiresAt, code: verificationCode(learnerId, materialId, issuedAt), issuedBy: state.settings.reviewerName || 'HelmLearn' };
          set({ certificates: [...state.certificates.filter((c) => c !== existing), cert] });
          const actor = state.settings.reviewerName || 'System';
          set({ audit: [...get().audit, logAuditEntry(actor, state.settings.reviewerRole, 'certificate_issued', 'certificate', cert.id, (renew ? 'Renewed for ' : 'Issued to ') + learner.name + ' for ' + material.short + ' · ' + cert.code)] });
        }
        buildCertificatePdf({ learner, material, cert, regimes: material.complianceIds.map(regimeById).filter((r): r is NonNullable<typeof r> => !!r), score: quizAvg(ctx, learnerId, materialId) })
          .then((bytes) => downloadBytes(bytes, certificateFileName(learner, material), 'application/pdf'));
        return cert;
      },
      toast: (text, kind = 'info') => {
        const id = uid('t');
        set({ toasts: [...get().toasts, { id, text, kind }] });
        setTimeout(() => get().dismissToast(id), 3600);
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
      resetDemo: () => { files.clear(); const keep = get().settings; set({ ...buildSeed(), refreshers: [], reminders: [], acked: [], settings: { ...DEFAULT_SETTINGS, provider: keep.provider, apiKey: keep.apiKey, translate: keep.translate, reviewerName: keep.reviewerName, reviewerRole: keep.reviewerRole } }); },
    }),
    {
      name: 'helmlearn-v1',
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({ materials: s.materials, exercises: s.exercises, learners: s.learners, attempts: s.attempts, enrollments: s.enrollments, settings: s.settings, seededAt: s.seededAt, refreshers: s.refreshers, reminders: s.reminders, acked: s.acked, audit: s.audit, certificates: s.certificates }),
      // Runs synchronously while zustand computes the state it is about to set, BEFORE React ever
      // renders it — unlike onRehydrateStorage, which fires (and re-renders) one tick too late,
      // after a browser with pre-migration cached data has already crashed on the raw shape once.
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<State>;
        const materials = (p.materials || current.materials).map((m) => ({
          ...m,
          status: m.status === 'processing' ? ('queued' as const) : m.status,
          stage: m.status === 'processing' ? null : m.stage,
          pct: m.status === 'processing' ? 0 : m.pct,
          complianceIds: m.complianceIds || MATERIAL_COMPLIANCE[m.id] || [],
          source: m.source || 'local',
          note: m.note ?? null,
          sourceUrl: m.sourceUrl ?? null,
        }));
        const exercises = (p.exercises || current.exercises).map((e) => ({
          ...e,
          reviewStatus: e.reviewStatus || 'draft',
          reviewedBy: e.reviewedBy ?? null,
          reviewedAt: e.reviewedAt ?? null,
          reviewNote: e.reviewNote ?? null,
        }));
        return {
          ...current,
          ...p,
          materials,
          exercises,
          settings: { ...DEFAULT_SETTINGS, ...p.settings },
          refreshers: p.refreshers || current.refreshers,
          reminders: p.reminders || current.reminders,
          acked: p.acked || current.acked,
          audit: p.audit || current.audit,
          certificates: p.certificates || current.certificates,
        };
      },
      onRehydrateStorage: () => (state) => {
        if (state) useStore.setState({ storageOk: !storageFailed });
      },
    },
  ),
);

export const catLabel: Record<Category, string> = { safety: 'Safety SOP', emergency: 'Emergency', technical: 'Technical', refresher: 'Refresher', advanced: 'Advanced' };
export const CATEGORIES: Category[] = ['safety', 'emergency', 'technical', 'refresher', 'advanced'];
