import type { ExType, Exercise, Lang, Payload } from '../data/types';
import { toPayload } from './llm';

// Rules for the task editor. English owns a task's STRUCTURE — how many options/items/pairs/tokens there are, which
// option is correct and which tokens fill the blanks. Bahasa Melayu and 中文 only change wording: same counts, and the
// correct option / fill answers are mirrored from English by position, so every language grades the same way.

export type FieldKind = 'text' | 'long' | 'list' | 'pairs';
export interface FieldSpec { key: string; label: string; kind: FieldKind; correct?: boolean; ordered?: boolean; min?: number }

const FEEDBACK: FieldSpec[] = [
  { key: 'hint', label: 'Hint (new-hire path only)', kind: 'text' },
  { key: 'ok', label: 'Feedback when right', kind: 'text' },
  { key: 'no', label: 'Feedback when wrong', kind: 'text' },
];

export const FIELDS: Record<ExType, FieldSpec[]> = {
  mcq: [{ key: 'q', label: 'Question', kind: 'long' }, { key: 'opts', label: 'Options — tick the correct one', kind: 'list', correct: true, min: 3 }, ...FEEDBACK],
  scen: [{ key: 'title', label: 'Situation', kind: 'long' }, { key: 'opts', label: 'Options — tick the correct one', kind: 'list', correct: true, min: 2 },
    { key: 'ok', label: 'Feedback when right', kind: 'text' }, { key: 'no', label: 'Feedback when wrong', kind: 'text' }],
  seq: [{ key: 'title', label: 'Instruction', kind: 'long' }, { key: 'items', label: 'Steps — in the correct order (learners see them shuffled)', kind: 'list', ordered: true, min: 3 }, ...FEEDBACK],
  audio: [{ key: 'title', label: 'Question', kind: 'text' }, { key: 'body', label: 'Instruction', kind: 'text' }, { key: 'transcript', label: 'Spoken message', kind: 'long' },
    { key: 'opts', label: 'Options — tick the correct one', kind: 'list', correct: true, min: 2 }, ...FEEDBACK],
  photo: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'What to photograph and why', kind: 'long' }, { key: 'item', label: 'Equipment', kind: 'text' },
    { key: 'btn', label: 'Button label', kind: 'text' }, { key: 'done', label: 'Message when the photo passes', kind: 'text' }],
  match: [{ key: 'title', label: 'Instruction', kind: 'text' }, { key: 'pairs', label: 'Term → meaning', kind: 'pairs', min: 2 },
    { key: 'hint', label: 'Hint (new-hire path only)', kind: 'text' }, { key: 'done', label: 'Message when all matched', kind: 'text' }],
  sign: [{ key: 'title', label: 'Title', kind: 'text' }, { key: 'body', label: 'Instruction', kind: 'text' }, { key: 'items', label: 'Checks the supervisor confirms', kind: 'list', min: 2 },
    { key: 'pin', label: 'PIN label', kind: 'text' }, { key: 'ready', label: 'Message when ready to sign', kind: 'text' }],
  cards: [{ key: 'title', label: 'Instruction', kind: 'text' }, { key: 'cards', label: 'Front → back', kind: 'pairs', min: 3 },
    { key: 'hint', label: 'Hint (new-hire path only)', kind: 'text' }, { key: 'done', label: 'Message when all recalled', kind: 'text' }],
  fill: [{ key: 'title', label: 'Instruction', kind: 'text' }, { key: 'pre', label: 'Text before blank 1', kind: 'text' }, { key: 'mid', label: 'Text between the blanks', kind: 'text' },
    { key: 'post', label: 'Text after blank 2', kind: 'text' }, { key: 'tokens', label: 'Word choices — pick the two answers below', kind: 'list', min: 3 }, ...FEEDBACK],
};

export type Data = Record<string, unknown>;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** Positions of the fill answers within its tokens (English decides them; other languages mirror). */
export function fillAnsIdx(d: Data): [number, number] {
  const tokens = arr(d.tokens) as string[];
  const ans = arr(d.ans) as string[];
  return [tokens.indexOf(ans[0]), tokens.indexOf(ans[1])];
}

/** Copies English's structural choices (correct option, fill answers by position) onto a translation. */
export function mirrorStructure(type: ExType, en: Data, other: Data): Data {
  const out: Data = { ...other };
  if ('correct' in en) out.correct = en.correct;
  if (type === 'fill') {
    const [a, b] = fillAnsIdx(en);
    const tokens = arr(other.tokens) as string[];
    out.ans = [tokens[a], tokens[b]];
  }
  return out;
}

export interface Validation { ok: boolean; errors: string[]; payload: Payload | null }

export function validate(type: ExType, d: Data, lang: Lang): Validation {
  const errors: string[] = [];
  const name = { en: 'English', bm: 'Bahasa Melayu', zh: '中文' }[lang];
  for (const f of FIELDS[type]) {
    const v = d[f.key];
    if (f.kind === 'list') {
      const xs = arr(v) as string[];
      if (xs.length < (f.min || 1)) errors.push(name + ': "' + f.label.split(' —')[0] + '" needs at least ' + (f.min || 1) + '.');
      if (xs.some((x) => !String(x ?? '').trim())) errors.push(name + ': an entry in "' + f.label.split(' —')[0] + '" is empty.');
      if (new Set(xs.map((x) => String(x).trim().toLowerCase())).size !== xs.length) errors.push(name + ': "' + f.label.split(' —')[0] + '" has duplicates.');
    } else if (f.kind === 'pairs') {
      const ps = arr(v) as string[][];
      if (ps.length < (f.min || 1)) errors.push(name + ': "' + f.label + '" needs at least ' + (f.min || 1) + ' pairs.');
      if (ps.some((p) => !String(p?.[0] ?? '').trim() || !String(p?.[1] ?? '').trim())) errors.push(name + ': a pair in "' + f.label + '" is half empty.');
    } else if (['q', 'title', 'body', 'transcript', 'pre'].includes(f.key) && !String(v ?? '').trim()) {
      errors.push(name + ': "' + f.label + '" is empty.');
    }
  }
  if ('correct' in d) {
    const n = arr(d.opts).length;
    if (!Number.isInteger(d.correct) || (d.correct as number) < 0 || (d.correct as number) >= n) errors.push(name + ': tick the correct option.');
  }
  if (type === 'fill') {
    const [a, b] = fillAnsIdx(d);
    if (a < 0 || b < 0) errors.push(name + ': pick both answers from the word choices.');
    else if (a === b) errors.push(name + ': the two answers must be different words.');
  }
  const payload = errors.length ? null : toPayload(type, d);
  if (!errors.length && !payload) errors.push(name + ': this task is incomplete.');
  return { ok: !errors.length, errors, payload };
}

export interface EditDraft { title: string; level: Exercise['level']; data: Partial<Record<Lang, Data>> }

export interface SaveResult { ok: boolean; errors: string[]; i18n: Exercise['i18n'] | null; dropped: { lang: Lang; reason: string }[] }

/**
 * Builds the i18n to save. English must be valid. A translation is kept only if it has the same structure as English
 * and is valid after mirroring; otherwise it is dropped with a reason (learners then see English, labelled
 * "English only") — an incomplete translation never blocks fixing the English.
 */
export function buildSave(type: ExType, draft: EditDraft): SaveResult {
  const en = draft.data.en;
  if (!en) return { ok: false, errors: ['English is required.'], i18n: null, dropped: [] };
  const v = validate(type, en, 'en');
  if (!v.ok) return { ok: false, errors: v.errors, i18n: null, dropped: [] };
  const i18n: Exercise['i18n'] = { en: v.payload! };
  const dropped: SaveResult['dropped'] = [];
  for (const l of ['bm', 'zh'] as const) {
    const d = draft.data[l];
    if (!d) continue;
    if (!sameCounts(type, en, d)) { dropped.push({ lang: l, reason: 'no longer matches the English options/items' }); continue; }
    const t = validate(type, mirrorStructure(type, en, d), l);
    if (t.ok) i18n[l] = t.payload!; else dropped.push({ lang: l, reason: t.errors[0].replace(/^[^:]+: /, '') });
  }
  return { ok: true, errors: [], i18n, dropped };
}

export type ListOp = { kind: 'add' } | { kind: 'remove'; i: number } | { kind: 'move'; i: number; d: -1 | 1 };

/**
 * Applies a list edit made on English to every language, so position i always means the same option/item/pair in
 * all of them. Added entries are blank in the translations (they then need re-translating). The correct option
 * follows a moved option; removing the correct option clears the tick so the editor asks for a new one.
 */
export function applyListOp(type: ExType, data: Partial<Record<Lang, Data>>, key: string, op: ListOp): Partial<Record<Lang, Data>> {
  const spec = FIELDS[type].find((f) => f.key === key)!;
  const blank = spec.kind === 'pairs' ? ['', ''] : '';
  const out: Partial<Record<Lang, Data>> = {};
  for (const [lang, d] of Object.entries(data) as [Lang, Data][]) {
    if (!d) continue;
    const xs = arr(d[key]).slice();
    const next: Data = { ...d };
    if (op.kind === 'add') xs.push(lang === 'en' ? blank : spec.kind === 'pairs' ? ['', ''] : '');
    else if (op.kind === 'remove') xs.splice(op.i, 1);
    else { const j = op.i + op.d; if (j < 0 || j >= xs.length) { out[lang] = d; continue; } [xs[op.i], xs[j]] = [xs[j], xs[op.i]]; }
    next[key] = xs;
    if (spec.correct && Number.isInteger(d.correct)) {
      const c = d.correct as number;
      if (op.kind === 'remove') next.correct = c === op.i ? -1 : c > op.i ? c - 1 : c;
      if (op.kind === 'move') { const j = op.i + op.d; next.correct = c === op.i ? j : c === j ? op.i : c; }
    }
    out[lang] = next;
  }
  return out;
}

/** True when a translation has the same number of options/items/pairs/tokens as English. */
export function sameCounts(type: ExType, en: Data, other: Data): boolean {
  return FIELDS[type].filter((f) => f.kind === 'list' || f.kind === 'pairs').every((f) => arr(en[f.key]).length === arr(other[f.key]).length);
}

/** Deep copy of a payload's data so the editor can mutate freely. */
export function cloneData(p: Payload | undefined): Data | undefined {
  return p ? (JSON.parse(JSON.stringify(p.data)) as Data) : undefined;
}
