import type { Doc } from '../data/types';

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
export function tokens(q: string): string[] {
  return norm(q).split(' ').filter((w) => w && !STOP.has(w)).map(stem);
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

export function search(docs: Doc[], query: string, limit = 6): { hits: Hit[]; tokens: string[] } {
  const toks = tokens(query);
  if (!toks.length) return { hits: [], tokens: toks };
  const hits: Hit[] = [];
  const allowed = toks.filter((t) => STATUS_TERMS[t]).map((t) => STATUS_TERMS[t]);
  for (const doc of docs) {
    if (allowed.length && !allowed.every((a) => a.includes(doc.status))) continue;
    const hs = haystacks(doc).map((h) => ({ ...h, norm: ' ' + norm(h.text) + ' ' }));
    let score = 0;
    const why: { field: string; term: string }[] = [];
    for (const t of toks) {
      const terms = [t, ...(ALIASES[t] || [])];
      let best: { field: string; w: number } | null = null;
      for (const term of terms) for (const h of hs) {
        if (matches(h.norm, term) && (!best || h.weight > best.w)) best = { field: h.field, w: h.weight * (term === t ? 1 : 0.8) };
      }
      if (best) { score += best.w; why.push({ field: best.field, term: t }); }
    }
    // a status word alone never carries a hit when the query also names a vessel, regime or work order
    const content = toks.filter((t) => !STATUS_TERMS[t]);
    if (score > 0 && (!content.length || why.some((w) => !STATUS_TERMS[w.term]))) hits.push({ doc, score, why });
  }
  hits.sort((a, b) => b.score - a.score || b.doc.createdAt - a.doc.createdAt);
  return { hits: hits.slice(0, limit), tokens: toks };
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
