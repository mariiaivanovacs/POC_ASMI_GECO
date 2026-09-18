import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { AggFn, DeadlineRule, Doc, DocStatus, ExportKind, Field, FieldType, Section, Settings, Signature, Stage, Template, Upload } from '../data/types';
import { DEFAULT_SETTINGS, buildSeed, fmtDate } from '../data/seed';
import { ExtractError, extOf, extractText, kindOf } from '../engine/extract';
import { detectFields } from '../engine/fields';
import { addFieldFromSelection, buildTemplate, deleteField, renameField, retypeField, sampleValues } from '../engine/template';
import { aggregate, parseTable } from '../engine/data';
import { makeSeal } from '../engine/signature';
import { docFileName, docVessel } from '../engine/assemble';
import { uid } from '../engine/rng';

export interface Toast { id: string; text: string; kind: 'ok' | 'err' | 'info' }

interface State {
  templates: Template[];
  docs: Doc[];
  uploads: Upload[];
  settings: Settings;
  toasts: Toast[];
  storageOk: boolean;
  seededAt: number;

  addUploads: (files: File[]) => Upload[];
  processUpload: (id: string) => Promise<void>;
  deleteUpload: (id: string) => void;
  editField: (ownerId: string, key: string, patch: { label?: string; type?: FieldType }) => void;
  removeField: (ownerId: string, key: string) => void;
  addField: (ownerId: string, sectionId: string, lineIndex: number, selected: string, label: string, type?: FieldType) => { ok: boolean; message: string };
  addAttachment: (docId: string, file: File) => Promise<{ ok: boolean; message: string }>;
  removeAttachment: (docId: string, attachmentId: string) => void;
  bindField: (docId: string, key: string, binding: { attachmentId: string; column: string; fn: AggFn } | null) => void;
  saveTemplate: (uploadId: string, name?: string) => Template | null;
  deleteTemplate: (id: string) => number;
  createDoc: (templateId: string) => Doc | null;
  setDocValue: (docId: string, key: string, value: string) => void;
  setDocStatus: (docId: string, status: DocStatus) => boolean;
  recordExport: (docId: string, kind: ExportKind) => void;
  deleteDoc: (id: string) => void;
  setSignatories: (list: string[]) => void;
  addSignature: (sig: Omit<Signature, 'id' | 'createdAt'>) => Signature;
  deleteSignature: (id: string) => void;
  setDefaultSignature: (id: string) => void;
  signDoc: (docId: string, signatureId: string) => { ok: boolean; message: string };
  restoreVersion: (docId: string, n: number) => boolean;
  setDeadlines: (rules: DeadlineRule[]) => void;
  unsignDoc: (docId: string) => void;
  setReviewer: (name: string) => void;
  toast: (text: string, kind?: Toast['kind']) => void;
  dismissToast: (id: string) => void;
  resetDemo: () => void;
}

const files = new Map<string, File>();
export const runtimeFiles = files;
let storageFailed = false;

function safeStorage(): Storage {
  const mem = new Map<string, string>();
  const memory: Storage = {
    get length() { return mem.size; },
    clear: () => mem.clear(), getItem: (k) => mem.get(k) ?? null, key: (i) => Array.from(mem.keys())[i] ?? null,
    removeItem: (k) => { mem.delete(k); }, setItem: (k, v) => { mem.set(k, v); },
  };
  try {
    const k = '__helmdocs_probe__';
    window.localStorage.setItem(k, '1');
    window.localStorage.removeItem(k);
    return {
      get length() { return window.localStorage.length; },
      clear: () => window.localStorage.clear(),
      getItem: (key) => window.localStorage.getItem(key),
      key: (i) => window.localStorage.key(i),
      removeItem: (key) => window.localStorage.removeItem(key),
      setItem: (key, v) => { try { window.localStorage.setItem(key, v); } catch { storageFailed = true; memory.setItem(key, v); useStore.setState({ storageOk: false }); } },
    };
  } catch {
    storageFailed = true;
    return memory;
  }
}

/** A checkpoint in the document's history. */
function snapshot(d: Doc, note: string, by: string, status: DocStatus = d.status): Doc {
  return { ...d, versions: [...(d.versions || []), { n: (d.versions?.length || 0) + 1, at: Date.now(), status, by, note, values: { ...d.values } }] };
}

/** Time spent assembling: edit-to-edit gaps count, idle gaps over 10 minutes do not. */
function editingMinutes(d: Doc, now: number): number {
  const gap = (now - d.lastEditAt) / 60_000;
  return Math.round((d.minutes + (gap > 10 ? 0.5 : gap)) * 10) / 10;
}

/** Uploads (before save) and templates (after save) share the same field-editing code path. */
function editOwner(get: () => State, set: (p: Partial<State>) => void, ownerId: string, fn: (fields: Field[], sections: Section[]) => { fields: Field[]; sections: Section[] }) {
  const u = get().uploads.find((x) => x.id === ownerId);
  if (u) { const r = fn(u.fields, u.sections); set({ uploads: get().uploads.map((x) => (x.id === ownerId ? { ...x, fields: r.fields, sections: r.sections } : x)) }); return; }
  const t = get().templates.find((x) => x.id === ownerId);
  if (t) { const r = fn(t.fields, t.sections); set({ templates: get().templates.map((x) => (x.id === ownerId ? { ...x, fields: r.fields, sections: r.sections } : x)) }); }
}

export const useStore = create<State>()(
  persist(
    (set, get) => ({
      ...buildSeed(),
      uploads: [],
      settings: DEFAULT_SETTINGS,
      toasts: [],
      storageOk: true,

      addUploads: (list) => {
        const added: Upload[] = [];
        for (const f of list) {
          const id = uid('u');
          files.set(id, f);
          const ext = extOf(f.name);
          added.push({ id, fileName: f.name, ext: ext || 'file', kind: kindOf(ext), status: 'queued', stage: null, pct: 0, error: null, text: null, pages: 0, detection: null, fields: [], sections: [], regime: '', regimeShort: '', createdAt: Date.now() });
        }
        set({ uploads: [...added, ...get().uploads] });
        return added;
      },

      processUpload: async (id) => {
        const u = get().uploads.find((x) => x.id === id);
        if (!u || u.status === 'processing') return;
        const patch = (p: Partial<Upload>) => set({ uploads: get().uploads.map((x) => (x.id === id ? { ...x, ...p } : x)) });
        const file = files.get(id);
        if (!file && !u.text) { patch({ status: 'failed', error: 'The upload was interrupted by a reload — drop the file again.' }); return; }
        patch({ status: 'processing', stage: 'reading', pct: 0, error: null });
        const t0 = performance.now();
        try {
          let text = u.text || '';
          let pages = u.pages || 1;
          if (file) {
            const r = await extractText(file, (pct) => patch({ pct: Math.round(pct * 0.6) }));
            text = r.text; pages = r.pages;
            patch({ text, pages, kind: r.kind, ext: r.ext });
          }
          patch({ stage: 'detecting' as Stage, pct: 65 });
          await new Promise((r) => setTimeout(r, 120));
          const d = detectFields(text);
          patch({ stage: 'templating' as Stage, pct: 85 });
          await new Promise((r) => setTimeout(r, 120));
          const built = buildTemplate(d);
          const ms = Math.round(performance.now() - t0);
          patch({
            status: 'detected', stage: 'ready', pct: 100, fields: built.fields, sections: built.sections, regime: d.regime, regimeShort: d.regimeShort,
            detection: { pages, fieldsFound: d.fields.length, conditionalSections: d.conditionalSections, signatureBlocks: d.signatureBlocks, regime: d.regime, ms },
          });
          get().toast(d.fields.length ? d.fields.length + ' fields detected in ' + u.fileName : 'No variable fields detected in ' + u.fileName, d.fields.length ? 'ok' : 'err');
        } catch (e) {
          const msg = e instanceof ExtractError ? e.message : e instanceof Error ? e.message : 'Processing failed.';
          patch({ status: 'failed', stage: null, pct: 0, error: msg });
          get().toast(msg, 'err');
        }
      },

      deleteUpload: (id) => { files.delete(id); set({ uploads: get().uploads.filter((u) => u.id !== id) }); },

      editField: (ownerId, key, patch) => {
        editOwner(get, set, ownerId, (fields, sections) => {
          let f = fields, s = sections;
          if (patch.type) f = retypeField(f, key, patch.type);
          if (patch.label !== undefined) {
            const idx = f.findIndex((x) => x.key === key);
            const r = renameField(f, s, key, patch.label);
            const next = idx >= 0 ? r.fields[idx].key : key;
            if (next !== key) {
              // keep generated documents in step with the renamed merge key
              set({ docs: get().docs.map((d) => (d.templateId === ownerId && key in d.values ? { ...d, values: Object.fromEntries(Object.entries(d.values).map(([k, v]) => [k === key ? next : k, v])) } : d)) });
            }
            f = r.fields; s = r.sections;
          }
          return { fields: f, sections: s };
        });
      },

      removeField: (ownerId, key) => editOwner(get, set, ownerId, (fields, sections) => deleteField(fields, sections, key)),

      addField: (ownerId, sectionId, lineIndex, selected, label, type) => {
        let result = { ok: false, message: 'Nothing to add.' };
        editOwner(get, set, ownerId, (fields, sections) => {
          const r = addFieldFromSelection(fields, sections, sectionId, lineIndex, selected, label, type);
          result = r.field ? { ok: true, message: 'Added the field "' + r.field.label + '" ({{' + r.field.key + '}})' } : { ok: false, message: r.error || 'Could not add the field.' };
          return { fields: r.fields, sections: r.sections };
        });
        return result;
      },

      addAttachment: async (docId, file) => {
        const d = get().docs.find((x) => x.id === docId);
        if (!d) return { ok: false, message: 'Document not found.' };
        if (d.status === 'sent') return { ok: false, message: 'Sent documents are locked.' };
        const ext = extOf(file.name);
        if (!['csv', 'tsv', 'txt'].includes(ext)) return { ok: false, message: 'Attach a .csv, .tsv or .txt table — "' + file.name + '" is not one.' };
        if (file.size === 0) return { ok: false, message: 'The file is empty (0 bytes).' };
        try {
          const att = parseTable(await file.text(), file.name, uid('a'));
          set({ docs: get().docs.map((x) => (x.id === docId ? { ...x, attachments: [...x.attachments, att], lastEditAt: Date.now() } : x)) });
          return { ok: true, message: att.name + ' attached — ' + att.rows.length + ' rows × ' + att.cols.length + ' columns' };
        } catch (e) { return { ok: false, message: e instanceof Error ? e.message : 'Could not read the file.' }; }
      },

      removeAttachment: (docId, attachmentId) => {
        const d = get().docs.find((x) => x.id === docId);
        if (!d || d.status === 'sent') return;
        // fields that were calculated from it keep their last value but are no longer bound
        set({ docs: get().docs.map((x) => (x.id === docId ? { ...x, attachments: x.attachments.filter((a) => a.id !== attachmentId), bindings: x.bindings.filter((b) => b.attachmentId !== attachmentId) } : x)) });
      },

      bindField: (docId, key, binding) => {
        const d = get().docs.find((x) => x.id === docId);
        if (!d || d.status === 'sent') return;
        const others = d.bindings.filter((b) => b.key !== key);
        if (!binding) { set({ docs: get().docs.map((x) => (x.id === docId ? { ...x, bindings: others } : x)) }); return; }
        const att = d.attachments.find((a) => a.id === binding.attachmentId);
        if (!att) return;
        const value = aggregate(att, binding.column, binding.fn).text;
        const t = get().templates.find((x) => x.id === d.templateId);
        const values = { ...d.values, [key]: value };
        const now = Date.now();
        set({ docs: get().docs.map((x) => (x.id === docId ? { ...x, values, bindings: [...others, { key, ...binding }], lastEditAt: now, minutes: editingMinutes(x, now), status: 'draft', reviewedAt: null, name: t ? docFileName(t, values, 'pdf') : x.name } : x)) });
      },

      saveTemplate: (uploadId, name) => {
        const u = get().uploads.find((x) => x.id === uploadId);
        if (!u || u.status !== 'detected' || !u.fields.length || !u.detection) return null;
        const base = (name || u.fileName.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ')).trim();
        let title = base;
        let n = 2;
        while (get().templates.some((t) => t.name === title)) title = base + ' (' + n++ + ')';
        const t: Template = {
          id: uid('t'), name: title, regime: u.regime, regimeShort: u.regimeShort, ext: u.ext, pages: u.pages, sourceText: u.text || '',
          fields: u.fields, sections: u.sections, detection: u.detection, manualMinutes: 45, createdAt: Date.now(), seeded: false,
        };
        files.delete(uploadId);
        set({ templates: [t, ...get().templates], uploads: get().uploads.filter((x) => x.id !== uploadId) });
        return t;
      },

      deleteTemplate: (id) => {
        const affected = get().docs.filter((d) => d.templateId === id).length;
        set({ templates: get().templates.filter((t) => t.id !== id) });
        return affected; // documents keep their template snapshot
      },

      createDoc: (templateId) => {
        const t = get().templates.find((x) => x.id === templateId);
        if (!t) return null;
        const now = Date.now();
        const values: Record<string, string> = {};
        const latest = get().docs.filter((d) => d.templateId === templateId).sort((a, b) => b.createdAt - a.createdAt)[0];
        const anyLatest = get().docs.slice().sort((a, b) => b.createdAt - a.createdAt)[0];
        for (const f of t.fields) {
          // pre-fill: company / signatory from the form sample, vessel + work order from the most recent work order, dates today
          if (f.role === 'company') values[f.key] = f.sample;
          else if (f.role === 'vessel') values[f.key] = latest?.values[f.key] || anyLatest?.vessel || '';
          else if (f.role === 'imo') values[f.key] = latest?.values[f.key] || (anyLatest ? Object.entries(anyLatest.values).find(([k]) => /imo/.test(k))?.[1] || '' : '');
          else if (f.role === 'workorder' && f.key === 'work_order_no') values[f.key] = anyLatest ? Object.entries(anyLatest.values).find(([k]) => k === 'work_order_no')?.[1] || '' : '';
          else if (f.type === 'date') values[f.key] = fmtDate(now);
          else values[f.key] = '';
        }
        const d: Doc = {
          id: uid('d'), templateId, templateName: t.name, regimeShort: t.regimeShort, name: docFileName(t, values, 'pdf'), values, status: 'draft',
          createdAt: now, reviewedAt: null, sentAt: null, minutes: 1, manualMinutes: t.manualMinutes, lastEditAt: now, by: get().settings.reviewer, vessel: docVessel(t, values), exports: [], attachments: [], bindings: [], signature: null, versions: [], seeded: false,
        };
        d.versions = [{ n: 1, at: now, status: 'draft', by: d.by, note: 'Draft created from template', values: { ...values } }];
        set({ docs: [d, ...get().docs] });
        return d;
      },

      setDocValue: (docId, key, value) => {
        const d = get().docs.find((x) => x.id === docId);
        if (!d || d.status === 'sent') return;
        const t = get().templates.find((x) => x.id === d.templateId);
        const values = { ...d.values, [key]: value };
        const now = Date.now();
        const minutes = editingMinutes(d, now);
        set({ docs: get().docs.map((x) => (x.id === docId ? { ...x, values, bindings: x.bindings.filter((b) => b.key !== key), lastEditAt: now, minutes, status: 'draft', reviewedAt: null, name: t ? docFileName(t, values, 'pdf') : x.name, vessel: t ? docVessel(t, values) : x.vessel } : x)) });
      },

      setDocStatus: (docId, status) => {
        const d = get().docs.find((x) => x.id === docId);
        if (!d) return false;
        if (status === 'sent' && d.status !== 'reviewed') return false; // no send without a human review step
        const now = Date.now();
        const by = get().settings.reviewer;
        set({ docs: get().docs.map((x) => (x.id === docId ? snapshot({ ...x, status, reviewedAt: status === 'draft' ? null : x.reviewedAt || now, sentAt: status === 'sent' ? now : null }, status === 'reviewed' ? 'Marked reviewed' : status === 'sent' ? 'Sent' : 'Returned to draft', by) : x)) });
        return true;
      },

      recordExport: (docId, kind) => set({ docs: get().docs.map((x) => (x.id === docId ? { ...x, exports: Array.from(new Set([...x.exports, kind])) } : x)) }),
      deleteDoc: (id) => set({ docs: get().docs.filter((d) => d.id !== id) }),
      setSignatories: (list) => set({ settings: { ...get().settings, signatories: list } }),

      addSignature: (sig) => {
        const s: Signature = { ...sig, id: uid('sig'), createdAt: Date.now() };
        const others = get().settings.signatures.map((x) => (s.isDefault ? { ...x, isDefault: false } : x));
        const list = [...others, s];
        if (!list.some((x) => x.isDefault)) s.isDefault = true;
        set({ settings: { ...get().settings, signatures: list } });
        return s;
      },
      deleteSignature: (id) => {
        const rest = get().settings.signatures.filter((x) => x.id !== id);
        if (rest.length && !rest.some((x) => x.isDefault)) rest[0] = { ...rest[0], isDefault: true };
        set({ settings: { ...get().settings, signatures: rest } });
      },
      setDefaultSignature: (id) => set({ settings: { ...get().settings, signatures: get().settings.signatures.map((x) => ({ ...x, isDefault: x.id === id })) } }),

      // signing seals exactly the assembled content: the hash covers every included line, the signer and the time
      signDoc: (docId, signatureId) => {
        const d = get().docs.find((x) => x.id === docId);
        const sig = get().settings.signatures.find((x) => x.id === signatureId);
        const t = d ? get().templates.find((x) => x.id === d.templateId) : null;
        if (!d || !sig) return { ok: false, message: 'Signature not found.' };
        if (!t) return { ok: false, message: 'The template for this document was deleted — it cannot be signed.' };
        if (d.status === 'sent') return { ok: false, message: 'Sent documents are locked.' };
        const signedAt = new Date().toISOString();
        const hash = makeSeal(t, d.values, sig.owner, signedAt);
        set({ docs: get().docs.map((x) => (x.id === docId ? snapshot({ ...x, signature: { signatureId, png: sig.png, signer: sig.owner, signedAt, hash } }, 'Signed by ' + sig.owner + ' · seal ' + hash.slice(0, 8), sig.owner) : x)) });
        return { ok: true, message: 'Signed by ' + sig.owner + ' — sealed with SHA-256 ' + hash.slice(0, 8) + '…' };
      },
      restoreVersion: (docId, n) => {
        const d = get().docs.find((x) => x.id === docId);
        const v = d?.versions.find((x) => x.n === n);
        if (!d || !v || d.status === 'sent') return false;
        const t = get().templates.find((x) => x.id === d.templateId);
        const values = { ...v.values };
        const now = Date.now();
        set({ docs: get().docs.map((x) => (x.id === docId ? snapshot({ ...x, values, status: 'draft', reviewedAt: null, signature: null, bindings: [], lastEditAt: now, name: t ? docFileName(t, values, 'pdf') : x.name, vessel: t ? docVessel(t, values) : x.vessel }, 'Restored version ' + n, get().settings.reviewer, 'draft') : x)) });
        return true;
      },
      setDeadlines: (rules) => set({ settings: { ...get().settings, deadlines: rules } }),
      unsignDoc: (docId) => set({ docs: get().docs.map((x) => (x.id === docId && x.status !== 'sent' ? { ...x, signature: null } : x)) }),
      setReviewer: (name) => set({ settings: { ...get().settings, reviewer: name.trim() || get().settings.reviewer } }),
      toast: (text, kind = 'info') => {
        const id = uid('t');
        set({ toasts: [...get().toasts, { id, text, kind }] });
        setTimeout(() => get().dismissToast(id), 3600);
      },
      dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
      resetDemo: () => { files.clear(); set({ ...buildSeed(), uploads: [], settings: DEFAULT_SETTINGS }); },
    }),
    {
      name: 'helmdocs-v1',
      storage: createJSONStorage(() => safeStorage()),
      partialize: (s) => ({ templates: s.templates, docs: s.docs, uploads: s.uploads, settings: s.settings, seededAt: s.seededAt }),
      merge: (persisted, current) => {
        const p = (persisted || {}) as Partial<State>;
        // a reload mid-processing loses the File object: say so instead of spinning forever
        const uploads = (p.uploads || []).map((u) => (u.status === 'processing' ? { ...u, status: 'failed' as const, stage: null, pct: 0, error: 'Processing was interrupted by a reload — drop the file again.' } : u));
        const docs = (p.docs || current.docs).map((d) => ({ ...d, attachments: d.attachments || [], bindings: d.bindings || [], signature: d.signature || null, versions: d.versions?.length ? d.versions : [{ n: 1, at: d.createdAt, status: 'draft' as const, by: d.by, note: 'Draft created from template', values: { ...d.values } }] }));
        return { ...current, ...p, uploads, docs, settings: { ...DEFAULT_SETTINGS, ...(p.settings || {}), signatures: p.settings?.signatures || [], deadlines: p.settings?.deadlines?.length ? p.settings.deadlines : DEFAULT_SETTINGS.deadlines }, storageOk: !storageFailed };
      },
    },
  ),
);

export { sampleValues };
