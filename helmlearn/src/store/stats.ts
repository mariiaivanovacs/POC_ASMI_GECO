import type { Attempt, Certificate, Enrollment, Exercise, Learner, Material } from '../data/types';

const DAY = 86_400_000;
const QUIZ_TYPES = new Set(['mcq', 'scen', 'audio', 'match', 'seq', 'cards', 'fill']);
const PRACTICAL_TYPES = new Set(['photo', 'sign']);

export interface Ctx { learners: Learner[]; materials: Material[]; exercises: Exercise[]; attempts: Attempt[]; enrollments: Enrollment[]; certificates?: Certificate[]; now: number }

const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function attemptsOf(ctx: Ctx, learnerId: string, materialId?: string): Attempt[] {
  return ctx.attempts.filter((a) => a.learnerId === learnerId && (!materialId || a.materialId === materialId));
}

export function moduleProgress(ctx: Ctx, learnerId: string, materialId: string): number {
  const total = ctx.exercises.filter((e) => e.materialId === materialId).length;
  if (!total) return 0;
  const passed = new Set(attemptsOf(ctx, learnerId, materialId).filter((a) => a.passed).map((a) => a.exerciseId));
  return clamp((passed.size / total) * 100);
}

export function modulesOf(ctx: Ctx, learnerId: string): Material[] {
  return ctx.enrollments.filter((e) => e.learnerId === learnerId).map((e) => ctx.materials.find((m) => m.id === e.materialId)).filter((m): m is Material => !!m);
}

export function overallProgress(ctx: Ctx, learnerId: string): number {
  const mods = modulesOf(ctx, learnerId);
  const v = mean(mods.map((m) => moduleProgress(ctx, learnerId, m.id)));
  return v === null ? 0 : clamp(v);
}

export function quizAvg(ctx: Ctx, learnerId: string, materialId?: string): number | null {
  const v = mean(attemptsOf(ctx, learnerId, materialId).filter((a) => QUIZ_TYPES.has(a.type)).map((a) => a.score));
  return v === null ? null : clamp(v);
}

export function practical(ctx: Ctx, learnerId: string): number | null {
  const xs = attemptsOf(ctx, learnerId).filter((a) => PRACTICAL_TYPES.has(a.type));
  if (!xs.length) return null;
  return clamp((xs.filter((a) => a.passed).length / xs.length) * 100);
}

export function activeDays(ctx: Ctx, learnerId: string, days = 7): number {
  const from = ctx.now - days * DAY;
  return new Set(attemptsOf(ctx, learnerId).filter((a) => a.at >= from).map((a) => new Date(a.at).toDateString())).size;
}

export function participation(ctx: Ctx, learnerId: string): number {
  return clamp((activeDays(ctx, learnerId) / 7) * 100);
}

export function lastActive(ctx: Ctx, learnerId: string): { days: number | null; label: string } {
  const xs = attemptsOf(ctx, learnerId);
  if (!xs.length) return { days: null, label: 'Never' };
  const last = Math.max(...xs.map((a) => a.at));
  const h = (ctx.now - last) / 3_600_000;
  if (h < 1) return { days: 0, label: 'Just now' };
  if (h < 12) return { days: 0, label: Math.round(h) + ' h ago' };
  const d = Math.floor((ctx.now - last) / DAY);
  if (d === 0) return { days: 0, label: 'Today' };
  if (d === 1) return { days: 1, label: 'Yesterday' };
  return { days: d, label: d + ' d ago' };
}

export function aiScore(ctx: Ctx, learnerId: string): number {
  const q = quizAvg(ctx, learnerId);
  const p = overallProgress(ctx, learnerId);
  return q === null ? clamp(p * 0.4) : clamp(q * 0.6 + p * 0.4);
}

export type Flag = { kind: 'risk' | 'ok' | 'none'; text: string };
export function flag(ctx: Ctx, learnerId: string): Flag {
  const la = lastActive(ctx, learnerId);
  const q = quizAvg(ctx, learnerId);
  if (la.days === null) return { kind: 'risk', text: 'Not started' };
  if (la.days >= 5) return { kind: 'risk', text: 'Inactive ' + la.days + ' days' };
  if (q !== null && q < 70) return { kind: 'risk', text: 'Low quiz score' };
  if (overallProgress(ctx, learnerId) === 100) return { kind: 'ok', text: 'Certified' };
  return { kind: 'none', text: 'On track' };
}

export function band(score: number): { text: string; kind: 'ok' | 'none' | 'risk' } {
  if (score >= 80) return { text: 'Above average', kind: 'ok' };
  if (score >= 60) return { text: 'On track', kind: 'none' };
  return { text: 'Needs support', kind: 'risk' };
}

export interface DayActivity { label: string; hours: number[]; total: number }
export function weeklyActivity(ctx: Ctx, learnerId: string, topModules: string[]): { days: DayActivity[]; total: number; prevTotal: number } {
  const days: DayActivity[] = [];
  let total = 0;
  const bucket = (from: number, to: number, matId: string | null) =>
    attemptsOf(ctx, learnerId).filter((a) => a.at >= from && a.at < to && (matId ? a.materialId === matId : !topModules.includes(a.materialId))).reduce((s, a) => s + a.seconds, 0) / 3600;
  for (let d = 6; d >= 0; d--) {
    const start = new Date(ctx.now - d * DAY); start.setHours(0, 0, 0, 0);
    const from = start.getTime(), to = from + DAY;
    const hours = [bucket(from, to, topModules[0] || null), bucket(from, to, topModules[1] || null), bucket(from, to, null)];
    if (!topModules[0]) hours[0] = 0;
    if (!topModules[1]) hours[1] = 0;
    const sum = hours.reduce((a, b) => a + b, 0);
    total += sum;
    days.push({ label: start.toLocaleDateString('en-GB', { weekday: 'short' }), hours, total: sum });
  }
  const prevFrom = ctx.now - 14 * DAY, prevTo = ctx.now - 7 * DAY;
  const prevTotal = attemptsOf(ctx, learnerId).filter((a) => a.at >= prevFrom && a.at < prevTo).reduce((s, a) => s + a.seconds, 0) / 3600;
  return { days, total, prevTotal };
}

export function topModules(ctx: Ctx, learnerId: string, n = 2): string[] {
  const counts = new Map<string, number>();
  for (const a of attemptsOf(ctx, learnerId)) counts.set(a.materialId, (counts.get(a.materialId) || 0) + 1);
  const ordered = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
  for (const m of modulesOf(ctx, learnerId)) if (!ordered.includes(m.id)) ordered.push(m.id);
  return ordered.slice(0, n);
}

export interface TrendPoint { label: string; values: (number | null)[] }
export function trend(ctx: Ctx, learnerId: string, mods: string[]): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (let d = 6; d >= 0; d--) {
    const start = new Date(ctx.now - d * DAY); start.setHours(0, 0, 0, 0);
    const from = start.getTime(), to = from + DAY;
    const values = mods.map((mid) => {
      const v = mean(attemptsOf(ctx, learnerId, mid).filter((a) => a.at >= from && a.at < to && QUIZ_TYPES.has(a.type)).map((a) => a.score));
      return v === null ? null : clamp(v);
    });
    out.push({ label: start.toLocaleDateString('en-GB', { weekday: 'short' }), values });
  }
  return out;
}

export interface ModuleRow { material: Material; progress: number; score: number | null; status: 'Completed' | 'Ongoing' | 'Not started'; tasks: number; minutes: number }
export function moduleRows(ctx: Ctx, learnerId: string): ModuleRow[] {
  return modulesOf(ctx, learnerId).map((m) => {
    const progress = moduleProgress(ctx, learnerId, m.id);
    const score = quizAvg(ctx, learnerId, m.id);
    const tasks = ctx.exercises.filter((e) => e.materialId === m.id).length;
    const minutes = Math.round(attemptsOf(ctx, learnerId, m.id).reduce((s, a) => s + a.seconds, 0) / 60);
    return { material: m, progress, score, status: progress === 100 ? 'Completed' : progress === 0 ? 'Not started' : 'Ongoing', tasks, minutes };
  });
}

export function cohortKpis(ctx: Ctx, ids: string[]) {
  const completions = ids.map((id) => overallProgress(ctx, id));
  const quizzes = ids.map((id) => quizAvg(ctx, id)).filter((q): q is number => q !== null);
  return {
    learners: ids.length,
    completion: completions.length ? clamp(mean(completions)!) : 0,
    quiz: quizzes.length ? clamp(mean(quizzes)!) : 0,
    risk: ids.filter((id) => flag(ctx, id).kind === 'risk').length,
  };
}

export function aiNote(ctx: Ctx, learner: Learner): string {
  const q = quizAvg(ctx, learner.id);
  const la = lastActive(ctx, learner.id);
  const exp = learner.level === 'exp';
  const weakest = weakestType(ctx, learner.id);
  if (la.days === null) return 'No tasks attempted yet. Suggested: a 5-minute audio version of the first module in ' + learner.lang + ', plus a nudge from ' + learner.sup + '.';
  if (la.days >= 5) return 'Last seen ' + la.label.toLowerCase() + '. Progress is stalling — a short refresher and a reminder from ' + learner.sup + ' are queued.';
  if (q !== null && q < 70) return (exp ? 'Fast-track path, but ' : 'New-hire path in ' + learner.lang + ' with hints on every task. ') + 'Quiz average is ' + q + '% — weakest task type is ' + weakest + '. A remediation set with 3 extra ' + weakest + ' tasks was added before the practical sign-off.';
  if (exp) return 'Fast-track path in ' + learner.lang + ': shorter explanations, no hints. Scores are steady' + (q !== null ? ' at ' + q + '%' : '') + ' — strongest on ' + strongestType(ctx, learner.id) + ' tasks; keep the practical sign-off for this week.';
  return 'New-hire path in ' + learner.lang + ' with hints on every task. Scores are healthy' + (q !== null ? ' (' + q + '%)' : '') + '; ' + strongestType(ctx, learner.id) + ' tasks score highest, so the path leans on those next.';
}

const TYPE_LABEL: Record<string, string> = { mcq: 'multiple-choice', seq: 'sequence', scen: 'scenario', audio: 'audio', photo: 'photo', match: 'matching', sign: 'sign-off', cards: 'flashcard', fill: 'fill-the-blank' };
function byType(ctx: Ctx, learnerId: string): [string, number][] {
  const m = new Map<string, number[]>();
  for (const a of attemptsOf(ctx, learnerId)) { if (!m.has(a.type)) m.set(a.type, []); m.get(a.type)!.push(a.score); }
  return Array.from(m.entries()).map(([t, xs]) => [t, mean(xs)!] as [string, number]).sort((a, b) => a[1] - b[1]);
}
export function weakestType(ctx: Ctx, learnerId: string): string { const x = byType(ctx, learnerId)[0]; return x ? TYPE_LABEL[x[0]] : 'scenario'; }
export function strongestType(ctx: Ctx, learnerId: string): string { const xs = byType(ctx, learnerId); const x = xs[xs.length - 1]; return x ? TYPE_LABEL[x[0]] : 'audio'; }

export function nextUp(ctx: Ctx, learnerId: string): { title: string; why: string } | null {
  const passed = new Set(attemptsOf(ctx, learnerId).filter((a) => a.passed).map((a) => a.exerciseId));
  for (const m of modulesOf(ctx, learnerId)) {
    const e = ctx.exercises.find((x) => x.materialId === m.id && !passed.has(x.id));
    if (e) return { title: TYPE_LABEL[e.type] + ' · ' + e.title, why: 'Next unfinished task in ' + m.short };
  }
  return null;
}

export function toCsv(rows: Record<string, string | number | null>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: string | number | null) => { const s = v === null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}

// ---- Retention (forgetting-curve) model, alerts and error analysis ---------------------------
// R(t) = 2^(-t / halfLife). Half-life grows 1.6x with every extra pass on the module (spaced repetition),
// starting at 5 days and capped at 60. A module is "due" when R drops below 0.6.
export const RETENTION_FLOOR = 0.6;
export const CERT_DAYS = 365;

export interface Retention { materialId: string; passes: number; lastPass: number | null; days: number | null; halfLife: number; pct: number | null; dueInDays: number | null; curve: number[] }

export function retention(ctx: Ctx, learnerId: string, materialId: string): Retention {
  const passed = attemptsOf(ctx, learnerId, materialId).filter((a) => a.passed);
  const passes = passed.length;
  const halfLife = Math.round(Math.min(60, 5 * Math.pow(1.6, Math.max(0, passes - 1))));
  if (!passes) return { materialId, passes: 0, lastPass: null, days: null, halfLife, pct: null, dueInDays: null, curve: [] };
  const lastPass = Math.max(...passed.map((a) => a.at));
  const days = (ctx.now - lastPass) / DAY;
  const r = (t: number) => Math.pow(2, -t / halfLife);
  const pct = clamp(r(days) * 100);
  const dueAt = halfLife * Math.log2(1 / RETENTION_FLOOR);
  const dueInDays = Math.round(dueAt - days);
  const curve = Array.from({ length: 31 }, (_, i) => clamp(r(days + i) * 100));
  return { materialId, passes, lastPass, days, halfLife, pct, dueInDays, curve };
}

export function retentionRows(ctx: Ctx, learnerId: string): Retention[] {
  return modulesOf(ctx, learnerId).map((m) => retention(ctx, learnerId, m.id));
}

export function certificate(ctx: Ctx, learnerId: string, materialId: string): { issued: number; expires: number; daysLeft: number } | null {
  if (moduleProgress(ctx, learnerId, materialId) < 100) return null;
  const passed = attemptsOf(ctx, learnerId, materialId).filter((a) => a.passed);
  const issued = Math.max(...passed.map((a) => a.at));
  const expires = issued + CERT_DAYS * DAY;
  return { issued, expires, daysLeft: Math.round((expires - ctx.now) / DAY) };
}

export type AlertKind = 'due' | 'soon' | 'inactive' | 'lowquiz' | 'notstarted' | 'cert';
export interface Alert { id: string; kind: AlertKind; severity: 'high' | 'medium' | 'low'; learnerId: string; materialId: string | null; text: string; action: 'refresher' | 'nudge' | 'recert' }

export function alerts(ctx: Ctx, ids: string[]): Alert[] {
  const out: Alert[] = [];
  for (const id of ids) {
    const l = ctx.learners.find((x) => x.id === id)!;
    const la = lastActive(ctx, id);
    if (la.days === null) { out.push({ id: id + ':notstarted', kind: 'notstarted', severity: 'medium', learnerId: id, materialId: null, text: l.name + ' has not started any module', action: 'nudge' }); continue; }
    if (la.days >= 5) out.push({ id: id + ':inactive', kind: 'inactive', severity: 'high', learnerId: id, materialId: null, text: l.name + ' inactive for ' + la.days + ' days — progress stalling', action: 'nudge' });
    const q = quizAvg(ctx, id);
    if (q !== null && q < 70) out.push({ id: id + ':lowquiz', kind: 'lowquiz', severity: 'high', learnerId: id, materialId: null, text: l.name + ' quiz average ' + q + '% — weakest on ' + weakestType(ctx, id) + ' tasks', action: 'refresher' });
    for (const r of retentionRows(ctx, id)) {
      const m = ctx.materials.find((x) => x.id === r.materialId);
      if (!m || r.pct === null || r.dueInDays === null) continue;
      if (r.pct < RETENTION_FLOOR * 100) out.push({ id: id + ':' + m.id + ':due', kind: 'due', severity: 'high', learnerId: id, materialId: m.id, text: l.name + ' — ' + m.short + ' retention down to ' + r.pct + '%, refresher overdue', action: 'refresher' });
      else if (r.dueInDays <= 7) out.push({ id: id + ':' + m.id + ':soon', kind: 'soon', severity: 'medium', learnerId: id, materialId: m.id, text: l.name + ' — ' + m.short + ' drops below ' + RETENTION_FLOOR * 100 + '% in ' + r.dueInDays + ' day' + (r.dueInDays === 1 ? '' : 's'), action: 'refresher' });
      const c = certificate(ctx, id, m.id);
      if (c && c.daysLeft <= 30) out.push({ id: id + ':' + m.id + ':cert', kind: 'cert', severity: c.daysLeft <= 0 ? 'high' : 'medium', learnerId: id, materialId: m.id, text: l.name + ' — ' + m.short + ' certificate ' + (c.daysLeft <= 0 ? 'expired' : 'expires in ' + c.daysLeft + ' days'), action: 'recert' });
    }
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

export interface TypeFailure { type: string; label: string; attempts: number; failed: number; rate: number }
export function failureByType(ctx: Ctx, ids: string[]): TypeFailure[] {
  const m = new Map<string, { a: number; f: number }>();
  for (const a of ctx.attempts.filter((x) => ids.includes(x.learnerId))) {
    const e = m.get(a.type) || { a: 0, f: 0 };
    e.a++; if (!a.passed) e.f++;
    m.set(a.type, e);
  }
  return Array.from(m.entries()).map(([type, v]) => ({ type, label: TYPE_LABEL[type] || type, attempts: v.a, failed: v.f, rate: v.a ? Math.round((v.f / v.a) * 100) : 0 })).sort((x, y) => y.rate - x.rate);
}

export interface MissedTask { exercise: Exercise; material: Material; failed: number; learners: number }
export function mostMissed(ctx: Ctx, ids: string[], n = 5): MissedTask[] {
  const m = new Map<string, { f: number; l: Set<string> }>();
  for (const a of ctx.attempts.filter((x) => ids.includes(x.learnerId) && !x.passed)) {
    const e = m.get(a.exerciseId) || { f: 0, l: new Set<string>() };
    e.f++; e.l.add(a.learnerId);
    m.set(a.exerciseId, e);
  }
  return Array.from(m.entries())
    .map(([exId, v]) => { const exercise = ctx.exercises.find((e) => e.id === exId); const material = exercise && ctx.materials.find((x) => x.id === exercise.materialId); return exercise && material ? { exercise, material, failed: v.f, learners: v.l.size } : null; })
    .filter((x): x is MissedTask => !!x)
    .sort((a, b) => b.learners - a.learners || b.failed - a.failed)
    .slice(0, n);
}

export function healthSummary(ctx: Ctx, ids: string[]) {
  const al = alerts(ctx, ids);
  const rows = ids.flatMap((id) => retentionRows(ctx, id).filter((r) => r.pct !== null));
  const avgRetention = rows.length ? clamp(rows.reduce((s, r) => s + (r.pct || 0), 0) / rows.length) : 0;
  return {
    due: al.filter((a) => a.kind === 'due').length,
    soon: al.filter((a) => a.kind === 'soon').length,
    inactive: al.filter((a) => a.kind === 'inactive' || a.kind === 'notstarted').length,
    lowquiz: al.filter((a) => a.kind === 'lowquiz').length,
    cert: al.filter((a) => a.kind === 'cert').length,
    avgRetention,
    total: al.length,
  };
}

// ---- Predictions: mistakes, repeat intervals, progress history ----------------------------------
export interface Prediction {
  materialId: string; short: string; retention: Retention;
  r7: number | null; r14: number | null; r30: number | null;
  failRate: number; failSource: 'learner' | 'cohort' | 'default';
  errNow: number | null; err30: number | null; mistakesNowPer10: number | null; mistakes30Per10: number | null;
  weakest: { type: string; label: string; rate: number; attempts: number }[];
  repeatEvery: number; dueInDays: number | null;
}

export function predict(ctx: Ctx, learnerId: string, materialId: string): Prediction {
  const m = ctx.materials.find((x) => x.id === materialId);
  const r = retention(ctx, learnerId, materialId);
  const mine = attemptsOf(ctx, learnerId, materialId);
  const cohort = ctx.attempts.filter((a) => a.materialId === materialId);
  let failRate = 0.15, failSource: Prediction['failSource'] = 'default';
  if (mine.length >= 3) { failRate = mine.filter((a) => !a.passed).length / mine.length; failSource = 'learner'; }
  else if (cohort.length >= 3) { failRate = cohort.filter((a) => !a.passed).length / cohort.length; failSource = 'cohort'; }
  const at = (d: number) => (r.curve.length ? r.curve[Math.min(30, d)] : null);
  const err = (rp: number | null) => (rp === null ? null : Math.min(1, 1 - (rp / 100) * (1 - failRate)));
  const errNow = err(r.pct), err30 = err(at(30));
  const byType = new Map<string, { a: number; f: number }>();
  for (const a of mine) { const e = byType.get(a.type) || { a: 0, f: 0 }; e.a++; if (!a.passed) e.f++; byType.set(a.type, e); }
  const weakest = Array.from(byType.entries()).map(([type, v]) => ({ type, label: TYPE_LABEL[type] || type, rate: Math.round((v.f / v.a) * 100), attempts: v.a })).filter((x) => x.rate > 0).sort((a, b) => b.rate - a.rate).slice(0, 2);
  const repeatEvery = Math.max(1, Math.round(r.halfLife * Math.log2(1 / RETENTION_FLOOR)));
  return {
    materialId, short: m?.short || materialId, retention: r, r7: at(7), r14: at(14), r30: at(30),
    failRate: Math.round(failRate * 100) / 100, failSource, errNow, err30,
    mistakesNowPer10: errNow === null ? null : Math.round(errNow * 10 * 10) / 10,
    mistakes30Per10: err30 === null ? null : Math.round(err30 * 10 * 10) / 10,
    weakest, repeatEvery, dueInDays: r.dueInDays,
  };
}

export function predictions(ctx: Ctx, learnerId: string): Prediction[] {
  return modulesOf(ctx, learnerId).map((m) => predict(ctx, learnerId, m.id));
}

export function progressHistory(ctx: Ctx, learnerId: string, days = 14): { label: string; pct: number }[] {
  const mods = modulesOf(ctx, learnerId);
  const total = mods.reduce((s, m) => s + ctx.exercises.filter((e) => e.materialId === m.id).length, 0);
  const mine = attemptsOf(ctx, learnerId).filter((a) => a.passed && mods.some((m) => m.id === a.materialId));
  const out: { label: string; pct: number }[] = [];
  for (let d = days; d >= 0; d--) {
    const end = new Date(ctx.now - d * DAY); end.setHours(23, 59, 59, 999);
    const cutoff = d === 0 ? ctx.now : end.getTime();
    const passed = new Set(mine.filter((a) => a.at <= cutoff).map((a) => a.exerciseId)).size;
    out.push({ label: d === 0 ? 'Today' : new Date(ctx.now - d * DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }), pct: total ? clamp((passed / total) * 100) : 0 });
  }
  return out;
}

// ---- Compliance coverage & certificate eligibility ---------------------------------------------
export function canIssueCertificate(ctx: Ctx, learnerId: string, materialId: string): boolean {
  const exs = ctx.exercises.filter((e) => e.materialId === materialId);
  if (!exs.length) return false;
  if (moduleProgress(ctx, learnerId, materialId) < 100) return false;
  return exs.every((e) => e.reviewStatus === 'approved');
}

export function reviewCoverage(ctx: Ctx, materialId: string): { approved: number; draft: number; rejected: number; total: number } {
  const exs = ctx.exercises.filter((e) => e.materialId === materialId);
  return {
    approved: exs.filter((e) => e.reviewStatus === 'approved').length,
    draft: exs.filter((e) => e.reviewStatus === 'draft').length,
    rejected: exs.filter((e) => e.reviewStatus === 'rejected').length,
    total: exs.length,
  };
}

export type RegimeStatus = 'compliant' | 'expiring' | 'expired' | 'not-covered';
export interface RegimeCoverage { regimeId: string; status: RegimeStatus; materialId: string | null; certificate: { issuedAt: number; expiresAt: number } | null }

export function complianceCoverage(ctx: Ctx, learnerId: string, regimeIds: string[]): RegimeCoverage[] {
  const mods = modulesOf(ctx, learnerId);
  return regimeIds.map((regimeId) => {
    const covering = mods.filter((m) => m.complianceIds.includes(regimeId));
    if (!covering.length) return { regimeId, status: 'not-covered' as RegimeStatus, materialId: null, certificate: null };
    let best: { status: RegimeStatus; materialId: string; certificate: { issuedAt: number; expiresAt: number } | null } | null = null;
    for (const m of covering) {
      const cert = ctx.certificates?.find((c) => c.learnerId === learnerId && c.materialId === m.id) || null;
      let status: RegimeStatus;
      if (!cert) status = 'not-covered';
      else if (cert.expiresAt <= ctx.now) status = 'expired';
      else if (cert.expiresAt - ctx.now <= 30 * DAY) status = 'expiring';
      else status = 'compliant';
      const rank: Record<RegimeStatus, number> = { compliant: 0, expiring: 1, expired: 2, 'not-covered': 3 };
      if (!best || rank[status] < rank[best.status]) best = { status, materialId: m.id, certificate: cert ? { issuedAt: cert.issuedAt, expiresAt: cert.expiresAt } : null };
    }
    return { regimeId, status: best!.status, materialId: best!.materialId, certificate: best!.certificate };
  });
}

export function cohortComplianceCoverage(ctx: Ctx, ids: string[], regimeId: string): { compliant: number; expiring: number; expired: number; notCovered: number; total: number; applicable: number } {
  let compliant = 0, expiring = 0, expired = 0, notCovered = 0, applicable = 0;
  for (const id of ids) {
    const hasModule = modulesOf(ctx, id).some((m) => m.complianceIds.includes(regimeId));
    if (!hasModule) continue;
    applicable++;
    const [row] = complianceCoverage(ctx, id, [regimeId]);
    if (row.status === 'compliant') compliant++;
    else if (row.status === 'expiring') expiring++;
    else if (row.status === 'expired') expired++;
    else notCovered++;
  }
  return { compliant, expiring, expired, notCovered, total: ids.length, applicable };
}

// ---- Content quality: how AI-drafted (and hand-written) tasks actually perform ----------------
export type QualityFlag = 'unproven' | 'too-hard' | 'too-easy' | 'slow' | 'healthy';
export interface ExerciseQuality {
  exerciseId: string;
  attempts: number;
  learners: number;
  passRate: number | null;
  avgScore: number | null;
  avgSeconds: number | null;
  flag: QualityFlag;
  reason: string;
}

export const MIN_EVIDENCE = 3;

export function exerciseQuality(ctx: Ctx, exerciseId: string): ExerciseQuality {
  const xs = ctx.attempts.filter((a) => a.exerciseId === exerciseId);
  const learners = new Set(xs.map((a) => a.learnerId)).size;
  const passRate = xs.length ? clamp((xs.filter((a) => a.passed).length / xs.length) * 100) : null;
  const avgScore = xs.length ? clamp(mean(xs.map((a) => a.score))!) : null;
  const avgSeconds = xs.length ? Math.round(mean(xs.map((a) => a.seconds))!) : null;
  let flag: QualityFlag = 'healthy';
  let reason = 'Pass rate in the expected band for a trained crew.';
  if (xs.length < MIN_EVIDENCE) { flag = 'unproven'; reason = xs.length ? 'Only ' + xs.length + ' attempt' + (xs.length === 1 ? '' : 's') + ' so far — not enough evidence to judge.' : 'Nobody has attempted this task yet.'; }
  else if (passRate! < 45) { flag = 'too-hard'; reason = 'Only ' + passRate + '% pass — check the wording and that the answer key matches the document.'; }
  else if (passRate! === 100 && xs.length >= 8) { flag = 'too-easy'; reason = passRate + '% pass across ' + xs.length + ' attempts — probably not testing anything.'; }
  else if (avgSeconds! > 240) { flag = 'slow'; reason = 'Averages ' + Math.round(avgSeconds! / 60) + ' min — learners struggle to parse it.'; }
  return { exerciseId, attempts: xs.length, learners, passRate, avgScore, avgSeconds, flag, reason };
}

const FLAG_RANK: Record<QualityFlag, number> = { 'too-hard': 0, slow: 1, 'too-easy': 2, unproven: 3, healthy: 4 };

export function moduleQuality(ctx: Ctx, materialId: string): { exercise: Exercise; q: ExerciseQuality }[] {
  return ctx.exercises
    .filter((e) => e.materialId === materialId)
    .map((exercise) => ({ exercise, q: exerciseQuality(ctx, exercise.id) }))
    .sort((a, b) => FLAG_RANK[a.q.flag] - FLAG_RANK[b.q.flag] || (a.q.passRate ?? 101) - (b.q.passRate ?? 101));
}

export interface QualitySummary { total: number; generated: number; attempted: number; flagged: number; tooHard: number; tooEasy: number; slow: number; unproven: number; passRate: number | null; generatedPassRate: number | null; handwrittenPassRate: number | null }

export function qualitySummary(ctx: Ctx, materialId?: string): QualitySummary {
  const exs = ctx.exercises.filter((e) => !materialId || e.materialId === materialId);
  const rows = exs.map((e) => ({ e, q: exerciseQuality(ctx, e.id) }));
  const rate = (list: typeof rows) => { const xs = ctx.attempts.filter((a) => list.some((r) => r.e.id === a.exerciseId)); return xs.length ? clamp((xs.filter((a) => a.passed).length / xs.length) * 100) : null; };
  return {
    total: exs.length,
    generated: exs.filter((e) => e.generated).length,
    attempted: rows.filter((r) => r.q.attempts > 0).length,
    flagged: rows.filter((r) => r.q.flag === 'too-hard' || r.q.flag === 'too-easy' || r.q.flag === 'slow').length,
    tooHard: rows.filter((r) => r.q.flag === 'too-hard').length,
    tooEasy: rows.filter((r) => r.q.flag === 'too-easy').length,
    slow: rows.filter((r) => r.q.flag === 'slow').length,
    unproven: rows.filter((r) => r.q.flag === 'unproven').length,
    passRate: rate(rows),
    generatedPassRate: rate(rows.filter((r) => r.e.generated)),
    handwrittenPassRate: rate(rows.filter((r) => !r.e.generated)),
  };
}

// ---- Learning pace: is this person going to finish the module in time? ------------------------
export const TARGET_DAYS = 21;
export type PaceStatus = 'done' | 'on-track' | 'slow' | 'overdue' | 'inactive' | 'not-started' | 'not-enrolled';
export interface Pace { status: PaceStatus; progress: number; daysEnrolled: number; daysLeft: number; projectedDays: number | null; lastActiveDays: number | null; label: string }

export function pace(ctx: Ctx, learnerId: string, materialId: string): Pace {
  const enr = ctx.enrollments.find((e) => e.learnerId === learnerId && e.materialId === materialId);
  const progress = moduleProgress(ctx, learnerId, materialId);
  if (!enr) return { status: 'not-enrolled', progress, daysEnrolled: 0, daysLeft: TARGET_DAYS, projectedDays: null, lastActiveDays: null, label: 'Not enrolled' };
  const daysEnrolled = Math.max(0, Math.floor((ctx.now - enr.at) / DAY));
  const daysLeft = TARGET_DAYS - daysEnrolled;
  const xs = attemptsOf(ctx, learnerId, materialId);
  const lastActiveDays = xs.length ? Math.floor((ctx.now - Math.max(...xs.map((a) => a.at))) / DAY) : null;
  const projectedDays = progress > 0 && daysEnrolled > 0 ? Math.round((daysEnrolled / progress) * 100) : null;
  if (progress >= 100) return { status: 'done', progress, daysEnrolled, daysLeft, projectedDays, lastActiveDays, label: 'Completed' };
  if (progress === 0) return { status: 'not-started', progress, daysEnrolled, daysLeft, projectedDays, lastActiveDays, label: daysEnrolled >= 3 ? 'Not started · enrolled ' + daysEnrolled + ' d ago' : 'Not started yet' };
  if (daysLeft < 0) return { status: 'overdue', progress, daysEnrolled, daysLeft, projectedDays, lastActiveDays, label: 'Overdue by ' + -daysLeft + ' d · ' + progress + '%' };
  if (lastActiveDays !== null && lastActiveDays >= 5) return { status: 'inactive', progress, daysEnrolled, daysLeft, projectedDays, lastActiveDays, label: 'Inactive ' + lastActiveDays + ' d · ' + progress + '%' };
  if (projectedDays !== null && projectedDays > TARGET_DAYS && daysEnrolled >= 3) return { status: 'slow', progress, daysEnrolled, daysLeft, projectedDays, lastActiveDays, label: 'Slow pace · finishes in ~' + (projectedDays - daysEnrolled) + ' d, ' + daysLeft + ' d left' };
  return { status: 'on-track', progress, daysEnrolled, daysLeft, projectedDays, lastActiveDays, label: 'On track · ' + progress + '%, ' + daysLeft + ' d left' };
}
