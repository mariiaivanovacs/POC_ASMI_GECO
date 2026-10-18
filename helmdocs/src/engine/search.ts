import type { DeadlineRule, Doc, Template } from '../data/types';
import { calendarEntries, type CalState } from './reminders';
import { verifySeal } from './signature';

const STOP = new Set(['the', 'for', 'a', 'an', 'of', 'to', 'in', 'on', 'me', 'find', 'show', 'all', 'which', 'is', 'are', 'this', 'month', 'doc', 'docs', 'document', 'documents', 'my', 'any', 'with', 'and', 'list', 'get', 'please', 'from', 'that', 'what', 'where', 'still', 'last']);
const ALIASES: Record<string, string[]> = {
  pending: ['draft', 'reviewed'], outstanding: ['draft', 'reviewed'], open: ['draft', 'reviewed'], unsent: ['draft', 'reviewed'], review: ['draft', 'reviewed'],
  declaration: ['ihm', 'hkc', 'sdoc'], ihm: ['hkc'], hazmat: ['ihm', 'hkc'], evidence: ['shms'], audit: ['shms'], permit: ['ptw'], permits: ['ptw'],
  incident: ['wsh'], waste: ['tiw', 'nea'], carbon: ['esg', 'scope'], emissions: ['esg', 'scope'], risk: ['bizsafe'], ra: ['bizsafe'], sent: ['sent'], submitted: ['sent'],
};

// status words act as constraints, not just scores: "pending" never returns a sent document
const STATUS_TERMS: Record<string, string[]> = { pending: ['draft', 'reviewed'], outstanding: ['draft', 'reviewed'], open: ['draft', 'reviewed'], unsent: ['draft', 'reviewed'], review: ['draft', 'reviewed'], draft: ['draft'], drafts: ['draft'], reviewed: ['reviewed'], sent: ['sent'], submitted: ['sent'] };

export function stem(w: string): string { return w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w; }
/** "WO-2409" stays one token (wo2409); hyphens inside codes are dropped on both sides of the match. */
export function norm(s: string): string { return s.toLowerCase().replace(/([a-z0-9])-([a-z0-9])/g, '$1$2').replace(/[^a-z0-9]+/g, ' ').trim(); }
const CODE_PREFIX = new Set(['wo', 'ptw', 'hw', 'cs', 'sdoc', 'ra', 'tiw', 'imo']);
export function tokens(q: string): string[] {
  const raw = norm(q).split(' ').filter(Boolean);
  // "WO 2433" is one work-order code, the same as "WO-2433"
  const merged: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    if (CODE_PREFIX.has(raw[i]) && /^\d{3,}$/.test(raw[i + 1] || '')) { merged.push(raw[i] + raw[i + 1]); i++; } else merged.push(raw[i]);
  }
  return merged.filter((w) => !STOP.has(w)).map(stem);
}

/** Edit distance with an early exit — small typos only. */
function within(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) { cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); best = Math.min(best, cur[j]); }
    if (best > max) return false;
    prev = cur;
  }
  return prev[b.length] <= max;
}
function fuzzy(hay: string, term: string): boolean {
  if (term.length < 4 || /\d/.test(term)) return false;
  const max = term.length >= 7 ? 2 : 1;
  return hay.split(' ').some((w) => w.length >= 3 && within(w, term, max));
}
// short tokens ("mv", "7", "wo") only match whole words; longer ones may be a prefix ("permit" → permits)
function matches(hay: string, term: string): boolean { return term.length <= 3 ? hay.includes(' ' + term + ' ') : hay.includes(' ' + term); }

export interface Hit { doc: Doc; score: number; why: { field: string; term: string }[] }

interface Haystack { field: string; text: string; weight: number }
function haystacks(d: Doc): Haystack[] {
  const values = Object.values(d.values).join(' ');
  return [
    { field: 'vessel', text: d.vessel, weight: 3 },
    { field: 'file', text: d.name.replace(/[-_.]/g, ' '), weight: 2 },
    { field: 'template', text: d.templateName, weight: 2 },
    { field: 'regime', text: d.regimeShort, weight: 3 },
    { field: 'status', text: d.status + (d.status !== 'sent' ? ' pending' : ''), weight: 3 },
    { field: 'by', text: d.by, weight: 2 },
    { field: 'values', text: values, weight: 1 },
  ];
}

export interface SearchCtx { templates?: Template[]; rules?: DeadlineRule[]; now?: number }
export interface SearchResult { hits: Hit[]; tokens: string[]; exact: boolean; filters: string[]; total: number; words: string[] }

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const monthOf = (t: string) => MONTHS.findIndex((m) => m === t || (t.length >= 3 && m.startsWith(t)));

/**
 * Plain-language constraints pulled out of the question before keyword matching:
 * deadlines (overdue, due today / this week, upcoming), signing (signed / unsigned) and dates
 * ("submitted in October", "due in November", "this month", "last month", or a bare month = created in).
 */
function constraints(q: string, toks: string[], ctx: SearchCtx) {
  const lq = ' ' + norm(q) + ' ';
  const now = ctx.now ?? Date.now();
  const states = new Set<CalState>();
  const filters: string[] = [];
  const used = new Set<string>();
  if (/ (overdue|late|missed|past due) /.test(lq)) { states.add('overdue'); filters.push('overdue'); ['overdue', 'late', 'missed', 'past'].forEach((w) => used.add(w)); }
  if (/ due (today|now) /.test(lq)) { states.add('today'); filters.push('due today'); ['due', 'today', 'now'].forEach((w) => used.add(w)); }
  else if (/ (due (this|next) week|due soon|this week|soon) /.test(lq)) { states.add('today'); states.add('soon'); filters.push('due within 7 days'); ['due', 'week', 'soon', 'next'].forEach((w) => used.add(w)); }
  else if (/ (upcoming|coming up) /.test(lq)) { states.add('soon'); states.add('later'); filters.push('upcoming'); ['upcoming', 'coming', 'up'].forEach((w) => used.add(w)); }
  let signed: boolean | null = null;
  if (/ (unsigned|not signed|without (a )?signature|needs? (a )?signature) /.test(lq)) { signed = false; filters.push('not signed'); ['unsigned', 'not', 'signed', 'without', 'signature', 'need', 'needs'].forEach((w) => used.add(w)); }
  else if (/ signed /.test(lq)) { signed = true; filters.push('signed'); used.add('signed'); }
  // dates
  let range: { from: number; to: number; on: 'sent' | 'due' | 'created' } | null = null;
  const on: 'sent' | 'due' | 'created' = / (submitted|sent|filed) /.test(lq) ? 'sent' : / due /.test(lq) ? 'due' : 'created';
  const d = new Date(now);
  const mtok = toks.find((t) => monthOf(t) >= 0 && t.length >= 3 && !['mar', 'may'].includes(t) || ['march', 'may'].includes(t));
  if (/ this month /.test(lq)) { range = { from: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), to: new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime(), on }; ['this', 'month'].forEach((w) => used.add(w)); }
  else if (/ last month /.test(lq)) { range = { from: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), to: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), on }; ['month'].forEach((w) => used.add(w)); }
  else if (mtok) {
    const m = monthOf(mtok); const y = m > d.getMonth() + 2 ? d.getFullYear() - 1 : d.getFullYear();
    range = { from: new Date(y, m, 1).getTime(), to: new Date(y, m + 1, 1).getTime(), on }; used.add(mtok);
  }
  if (range) { filters.push((range.on === 'sent' ? 'submitted ' : range.on === 'due' ? 'due ' : 'created ') + new Date(range.from).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })); ['submitted', 'sent', 'filed', 'due', 'created', 'in', 'during'].forEach((w) => used.add(w)); if (range.on === 'sent') used.add('submitted'); }
  return { states, signed, range, filters, used };
}

export function search(docs: Doc[], query: string, limit = 20, ctx: SearchCtx = {}): SearchResult {
  const toks = tokens(query);
  if (!toks.length) return { hits: [], tokens: toks, exact: true, filters: [], total: 0, words: [] };
  const c = constraints(query, toks, ctx);
  const cal = (c.states.size || (c.range && c.range.on === 'due')) ? new Map(calendarEntries(docs, ctx.rules || [], ctx.now).map((e) => [e.doc.id, e])) : null;
  const content = toks.filter((t) => !c.used.has(t) && !(t === 'week' || t === 'month'));
  const allowed = content.filter((t) => STATUS_TERMS[t]).map((t) => STATUS_TERMS[t]);
  const passes = (doc: Doc) => {
    if (allowed.length && !allowed.every((a) => a.includes(doc.status))) return false;
    if (c.states.size) { const e = cal!.get(doc.id); if (!e || !c.states.has(e.state)) return false; }
    if (c.signed !== null) {
      const t = ctx.templates?.find((x) => x.id === doc.templateId) || null;
      const hasBlock = !!t && t.sections.some((s) => s.signature);
      const ok = !!doc.signature && verifySeal(t, doc) === 'valid';
      if (c.signed ? !ok : (!hasBlock || ok)) return false;
    }
    if (c.range) {
      const at = c.range.on === 'sent' ? doc.sentAt : c.range.on === 'due' ? cal!.get(doc.id)?.due ?? null : doc.createdAt;
      if (at === null || at < c.range.from || at >= c.range.to) return false;
    }
    return true;
  };
  const words = content.filter((t) => !STATUS_TERMS[t]);
  const scored: (Hit & { matched: number })[] = [];
  for (const doc of docs) {
    if (!passes(doc)) continue;
    const hs = haystacks(doc).map((h) => ({ ...h, norm: ' ' + norm(h.text) + ' ' }));
    let score = 0; let matched = 0;
    const why: { field: string; term: string }[] = [];
    for (const t of content) {
      const terms = [t, ...(ALIASES[t] || [])];
      let best: { field: string; w: number } | null = null;
      for (const term of terms) for (const h of hs) {
        const w = matches(h.norm, term) ? h.weight * (term === t ? 1 : 0.8) : fuzzy(h.norm, term) ? h.weight * 0.6 : 0;
        if (w && (!best || w > best.w)) best = { field: h.field, w };
      }
      if (best) { score += best.w; why.push({ field: best.field, term: t }); if (!STATUS_TERMS[t]) matched++; }
    }
    if (!words.length && (c.filters.length || allowed.length)) { scored.push({ doc, score: 1 + score, why, matched: 0 }); continue; }
    if (score > 0 && (!words.length || matched > 0)) scored.push({ doc, score, why, matched });
  }
  // every word matched first; if nothing matches all of them, show the closest partial matches and say so
  const full = scored.filter((h) => h.matched === words.length);
  const exact = full.length > 0 || scored.length === 0;
  const pool = full.length ? full : scored;
  const due = (d: Doc) => cal?.get(d.id)?.due ?? d.createdAt;
  pool.sort((a, b) => b.score - a.score || (c.states.size ? due(a.doc) - due(b.doc) : b.doc.createdAt - a.doc.createdAt));
  return { hits: pool.slice(0, limit).map(({ doc, score, why }) => ({ doc, score, why })), tokens: toks, exact, filters: c.filters, total: pool.length, words };
}

/** "vessel: mv ocean pioneer · regime: ihm, declaration" — one entry per matched field. */
export function explain(why: { field: string; term: string }[]): string {
  const m = new Map<string, string[]>();
  for (const w of why) m.set(w.field, [...(m.get(w.field) || []), w.term]);
  return Array.from(m.entries()).map(([f, terms]) => f + ': ' + terms.join(' ')).join(' · ');
}

export function suggestions(docs: Doc[]): string[] {
  const out: string[] = [];
  const vessel = docs.find((d) => d.regimeShort.includes('IHM'))?.vessel;
  if (vessel) out.push('IHM declaration for ' + vessel);
  if (docs.some((d) => d.regimeShort.includes('SHMS') && d.status !== 'sent')) out.push('SHMS evidence still pending');
  const other = docs.find((d) => d.regimeShort === 'PTW')?.vessel;
  if (other) out.push(other + ' permits');
  if (docs.some((d) => d.status === 'draft')) out.push('drafts waiting for review');
  return out.slice(0, 4);
}
