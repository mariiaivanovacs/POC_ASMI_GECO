import type { ExType, Exercise, Lang, Payload, Structure, Widgets } from '../data/types';
import { ALL_TYPES } from './generate';

// DeepSeek is OpenAI-compatible. In dev the Vite proxy forwards /api/deepseek -> https://api.deepseek.com
// (see vite.config.ts) so the browser never hits a cross-origin API; in production put the same proxy in front.
export const DEEPSEEK_BASE = '/api/deepseek';
export const DEEPSEEK_MODEL = 'deepseek-chat';
const MAX_DOC_CHARS = 14_000;

export class LLMError extends Error {}

export interface LLMResult { exercises: Exercise[]; widgets: Widgets; langs: Lang[]; missing: ExType[] }

const SCHEMA = `{
  "exercises": [
    { "type": "mcq",   "title": "short title", "step": 3, "level": "all|new|exp",
      "en": { "q": "...", "opts": ["...","...","...","..."], "correct": 1, "hint": "...", "ok": "...", "no": "..." },
      "bm": { ...same keys in Bahasa Melayu... }, "zh": { ...same keys in Simplified Chinese... } },
    { "type": "seq",   "title": "...", "step": 1, "level": "new", "en": { "title": "...", "items": ["step 1","step 2","step 3","step 4"], "hint": "...", "ok": "...", "no": "..." }, "bm": {...}, "zh": {...} },
    { "type": "scen",  "title": "...", "step": 4, "level": "all", "en": { "title": "situation ... what do you do?", "opts": ["...","...","..."], "correct": 0, "ok": "...", "no": "..." }, "bm": {...}, "zh": {...} },
    { "type": "audio", "title": "...", "step": 2, "level": "all", "en": { "title": "...", "body": "...", "hint": "...", "opts": ["...","...","..."], "correct": 0, "ok": "...", "no": "...", "transcript": "a short spoken radio/PA message, 20-40 words" }, "bm": {...}, "zh": {...} },
    { "type": "photo", "title": "...", "step": null, "level": "all", "en": { "title": "Photo checkpoint", "body": "what to photograph and why", "btn": "Take photo", "done": "what a passing check confirms", "item": "the equipment" }, "bm": {...}, "zh": {...} },
    { "type": "match", "title": "...", "step": null, "level": "new", "en": { "title": "...", "pairs": [["term","meaning"],["term","meaning"],["term","meaning"]], "hint": "...", "done": "..." }, "bm": {...}, "zh": {...} },
    { "type": "sign",  "title": "...", "step": 1, "level": "exp", "en": { "title": "Supervisor sign-off", "body": "...", "items": ["check 1","check 2","check 3"], "pin": "Supervisor PIN", "ready": "..." }, "bm": {...}, "zh": {...} },
    { "type": "cards", "title": "...", "step": null, "level": "new", "en": { "title": "...", "cards": [["term or rule","meaning or figure"],["...","..."],["...","..."]], "hint": "...", "done": "..." }, "bm": {...}, "zh": {...} },
    { "type": "fill",  "title": "...", "step": 2, "level": "all", "en": { "title": "...", "pre": "text before blank 1", "mid": "text between the blanks", "post": "text after blank 2", "ans": ["answer 1","answer 2"], "tokens": ["answer 1","answer 2","distractor","distractor"], "hint": "...", "ok": "...", "no": "..." }, "bm": {...}, "zh": {...} }
  ],
  "widgets": {
    "qaCaption": "...", "qa": [["question","short answer"],["...","..."],["...","..."]],
    "audioCaption": "...", "audioTranscript": "spoken message 20-40 words", "audio": ["correct action","wrong action","wrong action"], "audioCorrect": 0,
    "cards": [["term","meaning"],["term","meaning"],["term","meaning"]],
    "fill": { "pre": "text before blank 1", "mid": "text between blanks", "post": "text after blank 2", "ans": ["answer 1","answer 2"], "tokens": ["answer 1","answer 2","distractor","distractor"] }
  }
}`;

export function buildPrompt(text: string, structure: Structure, translate: boolean): { system: string; user: string } {
  const doc = text.length > MAX_DOC_CHARS ? text.slice(0, MAX_DOC_CHARS) + '\n[truncated]' : text;
  const system = 'You are an instructional designer for marine and offshore shipyard safety and technical training. You write short, concrete, practical training tasks for yard workers, strictly grounded in the document you are given. Never invent numbers, thresholds or rules that are not in the document. Answer with a single JSON object and nothing else.';
  const user = `Document title: ${structure.title}
Numbered steps the document contains: ${structure.steps.length}. Hazards mentioned: ${structure.hazards.map((h) => h.name).join(', ') || 'none detected'}.

DOCUMENT:
"""
${doc}
"""

Produce training content as JSON with EXACTLY this shape (keys and types must match; "step" is the 1-based number of the document step the task tests, or null):
${SCHEMA}

Rules:
- Draft 2 "mcq", 1-2 "seq", 2 "scen", 1 "audio", 1-2 "photo", 1 "match", 1 "sign", 1 "cards", 1 "fill" — skip a type only when the document has no material for it.
- Every correct answer must be verifiable from the document; wrong options must be plausible but clearly wrong for a trained worker.
- "opts" have exactly one correct index. "seq" items must be in the correct order. "pairs" and "cards" have 3 pairs. In "fill", both "ans" values must appear in "tokens" and the sentence must read naturally with them in place.
- ${translate ? 'Provide "bm" (Bahasa Melayu) and "zh" (Simplified Chinese) versions of every exercise with identical structure and the same correct indexes.' : 'Provide only "en"; omit "bm" and "zh".'}
- Plain language a shipyard worker understands. No markdown.`;
  return { system, user };
}

export async function callDeepSeek(apiKey: string, system: string, user: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(DEEPSEEK_BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, temperature: 0.4, max_tokens: 6000, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal,
  }).catch((e) => { throw new LLMError('Could not reach DeepSeek (' + (e instanceof Error ? e.message : 'network error') + '). Is the dev proxy running?'); });
  if (res.status === 401) throw new LLMError('DeepSeek rejected the API key (401). Check Settings → API key.');
  if (res.status === 402) throw new LLMError('DeepSeek account has no balance (402).');
  if (res.status === 429) throw new LLMError('DeepSeek rate limit hit (429). Try again in a moment.');
  if (!res.ok) throw new LLMError('DeepSeek returned HTTP ' + res.status + '.');
  const json = await res.json().catch(() => { throw new LLMError('DeepSeek returned a non-JSON body.'); });
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new LLMError('DeepSeek returned an empty completion.');
  return content;
}

export async function testDeepSeek(apiKey: string): Promise<string> {
  const res = await fetch(DEEPSEEK_BASE + '/models', { headers: { Authorization: 'Bearer ' + apiKey } }).catch(() => { throw new LLMError('Could not reach DeepSeek. Is the dev proxy running?'); });
  if (res.status === 401) throw new LLMError('Key rejected (401).');
  if (!res.ok) throw new LLMError('HTTP ' + res.status);
  const j = await res.json().catch(() => ({}));
  const n = Array.isArray(j?.data) ? j.data.length : 0;
  return 'Connected — ' + n + ' model' + (n === 1 ? '' : 's') + ' available';
}

// ---- parsing / validation --------------------------------------------------------------------
type Raw = Record<string, unknown>;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isStrArr = (v: unknown, min: number): v is string[] => Array.isArray(v) && v.length >= min && v.every(isStr);
const isIdx = (v: unknown, n: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
const isPairs = (v: unknown, min: number): v is [string, string][] => Array.isArray(v) && v.length >= min && v.every((p) => Array.isArray(p) && p.length === 2 && isStr(p[0]) && isStr(p[1]));

function payload(type: ExType, r: unknown): Payload | null {
  if (!r || typeof r !== 'object') return null;
  const d = r as Raw;
  switch (type) {
    case 'mcq': return isStr(d.q) && isStrArr(d.opts, 3) && isIdx(d.correct, (d.opts as string[]).length) ? { type, data: { q: d.q, opts: d.opts as string[], correct: d.correct as number, hint: isStr(d.hint) ? d.hint : '', ok: isStr(d.ok) ? d.ok : 'Correct.', no: isStr(d.no) ? d.no : 'Not quite.' } } : null;
    case 'seq': return isStr(d.title) && isStrArr(d.items, 3) ? { type, data: { title: d.title, items: d.items as string[], hint: isStr(d.hint) ? d.hint : '', ok: isStr(d.ok) ? d.ok : 'Right order.', no: isStr(d.no) ? d.no : 'Not in order.' } } : null;
    case 'scen': return isStr(d.title) && isStrArr(d.opts, 2) && isIdx(d.correct, (d.opts as string[]).length) ? { type, data: { title: d.title, opts: d.opts as string[], correct: d.correct as number, ok: isStr(d.ok) ? d.ok : 'Right.', no: isStr(d.no) ? d.no : 'Not this one.' } } : null;
    case 'audio': return isStr(d.title) && isStr(d.transcript) && isStrArr(d.opts, 2) && isIdx(d.correct, (d.opts as string[]).length) ? { type, data: { title: d.title, body: isStr(d.body) ? d.body : '', hint: isStr(d.hint) ? d.hint : '', opts: d.opts as string[], correct: d.correct as number, ok: isStr(d.ok) ? d.ok : 'Right.', no: isStr(d.no) ? d.no : 'Listen again.', transcript: d.transcript } } : null;
    case 'photo': return isStr(d.body) ? { type, data: { title: isStr(d.title) ? d.title : 'Photo checkpoint', body: d.body, btn: isStr(d.btn) ? d.btn : 'Take photo', done: isStr(d.done) ? d.done : 'Photo captured.', item: isStr(d.item) ? d.item : 'equipment' } } : null;
    case 'match': return isPairs(d.pairs, 2) ? { type, data: { title: isStr(d.title) ? d.title : 'Match each term to its meaning', pairs: d.pairs.slice(0, 4), hint: isStr(d.hint) ? d.hint : '', done: isStr(d.done) ? d.done : 'All matched.' } } : null;
    case 'sign': return isStrArr(d.items, 2) ? { type, data: { title: isStr(d.title) ? d.title : 'Supervisor sign-off', body: isStr(d.body) ? d.body : '', items: d.items as string[], pin: isStr(d.pin) ? d.pin : 'Supervisor PIN', ready: isStr(d.ready) ? d.ready : 'Ready for sign-off.' } } : null;
    case 'cards': return isPairs(d.cards, 3) ? { type, data: { title: isStr(d.title) ? d.title : 'Recall the meaning of each term', cards: d.cards.slice(0, 5), hint: isStr(d.hint) ? d.hint : '', done: isStr(d.done) ? d.done : 'All cards recalled.' } } : null;
    case 'fill': {
      const ans = d.ans as string[];
      const tokens = d.tokens as string[];
      return isStr(d.pre) && isStrArr(ans, 2) && isStrArr(tokens, 2) && ans.slice(0, 2).every((a) => tokens.includes(a))
        ? { type, data: { title: isStr(d.title) ? d.title : 'Complete the rule', pre: d.pre, mid: isStr(d.mid) ? d.mid : '', post: isStr(d.post) ? d.post : '', ans: [ans[0], ans[1]], tokens, hint: isStr(d.hint) ? d.hint : '', ok: isStr(d.ok) ? d.ok : 'Both correct.', no: isStr(d.no) ? d.no : 'Not quite — the document says ' + ans[0] + ' and ' + ans[1] + '.' } }
        : null;
    }
  }
}

export function parseLLMResponse(content: string, materialId: string, fallbackWidgets: Widgets): LLMResult {
  let root: Raw;
  try {
    const cleaned = content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    root = JSON.parse(cleaned);
  } catch { throw new LLMError('DeepSeek answered with invalid JSON.'); }
  const rawEx = Array.isArray(root.exercises) ? (root.exercises as Raw[]) : [];
  const exercises: Exercise[] = [];
  const langsSeen = new Set<Lang>(['en']);
  rawEx.forEach((r, i) => {
    const type = r.type as ExType;
    if (!ALL_TYPES.includes(type)) return;
    const en = payload(type, r.en);
    if (!en) return;
    const i18n: Exercise['i18n'] = { en };
    for (const l of ['bm', 'zh'] as Lang[]) {
      const p = payload(type, r[l]);
      if (p) { i18n[l] = p; langsSeen.add(l); }
    }
    const step = Number.isInteger(r.step) && (r.step as number) >= 1 ? (r.step as number) - 1 : null;
    const level = r.level === 'new' || r.level === 'exp' ? r.level : 'all';
    exercises.push({ id: materialId + '_ai_' + type + '_' + i, materialId, type, level, title: isStr(r.title) ? r.title : (type + ' task'), sourceRef: 'DeepSeek · ' + (step !== null ? 'step ' + (step + 1) : 'document'), stepIndex: step, i18n, generated: true, reviewStatus: 'draft', reviewedBy: null, reviewedAt: null, reviewNote: null });
  });
  if (!exercises.length) throw new LLMError('DeepSeek returned no usable exercises.');

  const w = (root.widgets && typeof root.widgets === 'object' ? root.widgets : {}) as Raw;
  const fill = (w.fill && typeof w.fill === 'object' ? w.fill : {}) as Raw;
  const widgets: Widgets = {
    qaCaption: isStr(w.qaCaption) ? w.qaCaption : fallbackWidgets.qaCaption,
    qa: isPairs(w.qa, 3) ? w.qa.slice(0, 3) : fallbackWidgets.qa,
    audioCaption: isStr(w.audioCaption) ? w.audioCaption : fallbackWidgets.audioCaption,
    audioLen: fallbackWidgets.audioLen,
    audioTranscript: isStr(w.audioTranscript) ? w.audioTranscript : fallbackWidgets.audioTranscript,
    audio: isStrArr(w.audio, 3) ? (w.audio as string[]).slice(0, 3) : fallbackWidgets.audio,
    audioCorrect: isStrArr(w.audio, 3) && isIdx(w.audioCorrect, 3) ? (w.audioCorrect as number) : (isStrArr(w.audio, 3) ? 0 : fallbackWidgets.audioCorrect),
    cards: isPairs(w.cards, 3) ? w.cards.slice(0, 3) : fallbackWidgets.cards,
    fill: isStr(fill.pre) && isStrArr(fill.ans, 2) && isStrArr(fill.tokens, 2) && (fill.ans as string[]).every((a) => (fill.tokens as string[]).includes(a))
      ? { pre: fill.pre, mid: isStr(fill.mid) ? fill.mid : '', post: isStr(fill.post) ? fill.post : '', ans: [(fill.ans as string[])[0], (fill.ans as string[])[1]], tokens: fill.tokens as string[] }
      : fallbackWidgets.fill,
  };
  const missing = ALL_TYPES.filter((t) => !exercises.some((e) => e.type === t));
  return { exercises, widgets, langs: Array.from(langsSeen), missing };
}

export async function generateWithDeepSeek(apiKey: string, text: string, structure: Structure, materialId: string, translate: boolean, fallbackWidgets: Widgets): Promise<LLMResult> {
  const { system, user } = buildPrompt(text, structure, translate);
  const content = await callDeepSeek(apiKey, system, user);
  return parseLLMResponse(content, materialId, fallbackWidgets);
}
