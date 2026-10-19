import type { ExType, Exercise, Lang, Payload, Structure, Widgets } from '../data/types';
import { ALL_TYPES } from './generate';

// Qwen (DashScope) is OpenAI-compatible. The server-side relay in vite.config.ts forwards /api/qwen/chat/completions and
// injects DASHSCOPE_API_KEY, so no key is ever held by the browser. (Identifiers keep the old 'Qwen' names to avoid churn.)
export const DEEPSEEK_BASE = '/api/qwen';
export const DEEPSEEK_MODEL = 'qwen-plus';
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
    { "type": "photo", "title": "...", "step": null, "level": "all", "en": { "title": "Photo checkpoint", "body": "what to photograph and why", "btn": "Take photo", "done": "what a passing check confirms", "item": "the equipment" }, "bm": {...}, "zh": {...} },
    { "type": "match", "title": "...", "step": null, "level": "new", "en": { "title": "...", "pairs": [["term","meaning"],["term","meaning"],["term","meaning"]], "hint": "...", "done": "..." }, "bm": {...}, "zh": {...} },
    { "type": "sign",  "title": "...", "step": 1, "level": "exp", "en": { "title": "Supervisor sign-off", "body": "...", "items": ["check 1","check 2","check 3"], "pin": "Supervisor PIN", "ready": "..." }, "bm": {...}, "zh": {...} },
    { "type": "cards", "title": "...", "step": null, "level": "new", "en": { "title": "...", "cards": [["term or rule","meaning or figure"],["...","..."],["...","..."]], "hint": "...", "done": "..." }, "bm": {...}, "zh": {...} },
    { "type": "fill",  "title": "...", "step": 2, "level": "all", "en": { "title": "...", "pre": "text before blank 1", "mid": "text between the blanks", "post": "text after blank 2", "ans": ["answer 1","answer 2"], "tokens": ["answer 1","answer 2","distractor","distractor"], "hint": "...", "ok": "...", "no": "..." }, "bm": {...}, "zh": {...} }
  ],
  "widgets": {
    "qaCaption": "...", "qa": [["question","short answer"],["...","..."],["...","..."]],
    "cards": [["term","meaning"],["term","meaning"],["term","meaning"]],
    "fill": { "pre": "text before blank 1", "mid": "text between blanks", "post": "text after blank 2", "ans": ["answer 1","answer 2"], "tokens": ["answer 1","answer 2","distractor","distractor"] }
  }
}`;

export function buildPrompt(text: string, structure: Structure, translate: boolean, onlyType?: ExType, avoid: string[] = []): { system: string; user: string } {
  const doc = text.length > MAX_DOC_CHARS ? text.slice(0, MAX_DOC_CHARS) + '\n[truncated]' : text;
  const system = 'You are an instructional designer for marine and offshore shipyard safety and technical training. You write short, concrete, practical training tasks for yard workers, strictly grounded in the document you are given. Never invent numbers, thresholds or rules that are not in the document. Answer with a single JSON object and nothing else.';
  const stepList = structure.steps.length ? structure.steps.map((s, i) => (i + 1) + '. ' + s).join('\n') : '(no explicit steps found)';
  const user = `Document title: ${structure.title}
Procedure steps extracted from the document (use these numbers for "step"):
${stepList}
Hazards mentioned: ${structure.hazards.map((h) => h.name).join(', ') || 'none detected'}. PPE / equipment: ${structure.ppe.join(', ') || 'none detected'}.

DOCUMENT:
"""
${doc}
"""

Produce training content as JSON with EXACTLY this shape (keys and types must match; "step" is the 1-based number from the step list above that the task tests, or null):
${SCHEMA}

Rules:
- ${onlyType ? 'Draft ONLY "' + onlyType + '" tasks: 2 of them (1 if the document only supports one), testing different parts of the document. No other types.' + (avoid.length ? ' Do not repeat these existing tasks: ' + avoid.map((t) => '"' + t + '"').join(', ') + '.' : '') : 'Draft 2 "mcq", 1-2 "seq", 2 "scen", 1-2 "photo", 1 "match", 1 "sign", 1 "cards", 1 "fill" — skip a type only when the document has no material for it. Do not draft audio tasks.'}
- Each task must test something specific to THIS document (its steps, figures, roles, equipment, hazards) — never generic safety advice that would fit any document.
- A "seq" must list actions that genuinely happen in that order in the document.
- Definitions, card meanings, hints and feedback must not add facts the document does not state.
- The "title" inside each language block is a short instruction (e.g. "Complete the rule"), never the question sentence with blanks in it.
- Every correct answer must be verifiable from the document; wrong options must be plausible but clearly wrong for a trained worker.
- "opts" have exactly one correct index. "seq" items must be in the correct order. "pairs" and "cards" have 3 pairs. In "fill", both "ans" values must appear in "tokens" and the sentence must read naturally with them in place.
- ${translate ? 'Provide "bm" (Bahasa Melayu) and "zh" (Simplified Chinese) versions of every exercise with identical structure and the same correct indexes.' : 'Provide only "en"; omit "bm" and "zh".'}
- Plain language a shipyard worker understands. No markdown.`;
  return { system, user };
}

export async function callQwen(_apiKey: string, system: string, user: string, signal?: AbortSignal, maxTokens = 6000): Promise<string> {
  const res = await fetch(DEEPSEEK_BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: DEEPSEEK_MODEL, temperature: 0.4, max_tokens: maxTokens, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal,
  }).catch((e) => { throw new LLMError('Could not reach Qwen (' + (e instanceof Error ? e.message : 'network error') + '). Is the server relay running?'); });
  if (res.status === 401) throw new LLMError('Qwen rejected the API key (401). Check DASHSCOPE_API_KEY on the server.');
  if (res.status === 402) throw new LLMError('Qwen account has no balance (402).');
  if (res.status === 429) throw new LLMError('Qwen rate limit hit (429). Try again in a moment.');
  if (!res.ok) throw new LLMError('Qwen returned HTTP ' + res.status + '.');
  const json = await res.json().catch(() => { throw new LLMError('Qwen returned a non-JSON body.'); });
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new LLMError('Qwen returned an empty completion.');
  return content;
}

export async function testQwen(_apiKey = ''): Promise<string> {
  const res = await fetch(DEEPSEEK_BASE + '/chat/completions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: DEEPSEEK_MODEL, max_tokens: 5, messages: [{ role: 'user', content: 'Reply with: ok' }] }) }).catch(() => { throw new LLMError('Could not reach the server relay.'); });
  if (res.status === 503) throw new LLMError('Server has no DASHSCOPE_API_KEY configured.');
  if (res.status === 401) throw new LLMError('Key rejected (401).');
  if (!res.ok) throw new LLMError('HTTP ' + res.status);
  return 'Connected — Qwen (' + DEEPSEEK_MODEL + ') is answering through the server relay';
}

// ---- parsing / validation --------------------------------------------------------------------
type Raw = Record<string, unknown>;
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const isStrArr = (v: unknown, min: number): v is string[] => Array.isArray(v) && v.length >= min && v.every(isStr);
const isIdx = (v: unknown, n: number): v is number => Number.isInteger(v) && (v as number) >= 0 && (v as number) < n;
const isPairs = (v: unknown, min: number): v is [string, string][] => Array.isArray(v) && v.length >= min && v.every((p) => Array.isArray(p) && p.length === 2 && isStr(p[0]) && isStr(p[1]));

/** Validates raw task data for a type (the same rules applied to Qwen's output) and fills optional text defaults. */
export function toPayload(type: ExType, r: unknown): Payload | null { return payload(type, r); }

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
  } catch { throw new LLMError('Qwen answered with invalid JSON.'); }
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
    exercises.push({ id: materialId + '_ai_' + type + '_' + i, materialId, type, level, title: isStr(r.title) ? r.title : (type + ' task'), sourceRef: 'Qwen · ' + (step !== null ? 'step ' + (step + 1) : 'document'), stepIndex: step, i18n, generated: true, reviewStatus: 'draft', reviewedBy: null, reviewedAt: null, reviewNote: null });
  });
  if (!exercises.length) throw new LLMError('Qwen returned no usable exercises.');

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

// Stage 2: Qwen reads the document and pulls out its procedure steps, hazards, PPE and key terms. The rule-based
// analyzer only finds steps in numbered lists and hazards from a fixed keyword list, so prose SOPs and manuals came out
// near-empty. The regex result is the fallback, and its sentences/facts are kept (the offline widgets use them).
export async function extractWithQwen(text: string, fallback: Structure): Promise<Structure> {
  const doc = text.length > MAX_DOC_CHARS ? text.slice(0, MAX_DOC_CHARS) + '\n[truncated]' : text;
  const system = 'You extract the structure of marine and offshore safety and technical documents for a training team. Use only what the document says. Answer with a single JSON object and nothing else.';
  const user = `DOCUMENT:\n"""\n${doc}\n"""\n\nReturn JSON with exactly these keys:
{"title": "the document's own title",
 "steps": ["the procedure actions in the order the document gives them, one short imperative sentence each, 3-12 items"],
 "hazards": [{"name": "short hazard name, 1-4 words", "sentence": "the document sentence that describes it"}],
 "ppe": ["each piece of PPE or safety equipment the document requires, 1-4 words each"],
 "terms": [["term or abbreviation the document defines or relies on", "its meaning per the document, under 15 words"]]}
If the document has no explicit numbered procedure, derive the steps from the actions it tells the reader to take. Each step must say the same thing as the document: keep WHO does it and on whose signal or instruction, and never merge two roles into one step. Keep figures, units and codes exactly as written. Use [] for anything the document does not contain.`;
  const content = await callQwen('', system, user, undefined, 2500);
  let root: Raw;
  try { root = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')) as Raw; }
  catch { throw new LLMError('Qwen answered the extraction with invalid JSON.'); }
  const steps = isStrArr(root.steps, 1) ? (root.steps as string[]).slice(0, 12).map((s) => s.trim().replace(/\.$/, '')) : [];
  const hazards = Array.isArray(root.hazards)
    ? (root.hazards as Raw[]).filter((h) => h && isStr(h.name)).slice(0, 10).map((h) => ({ name: (h.name as string).trim(), sentence: isStr(h.sentence) ? h.sentence : '' }))
    : [];
  const ppe = Array.isArray(root.ppe) ? (root.ppe as unknown[]).filter(isStr).slice(0, 14).map((p) => p.trim()) : [];
  const terms = Array.isArray(root.terms)
    ? (root.terms as unknown[]).filter((t): t is [string, string] => Array.isArray(t) && isStr(t[0]) && isStr(t[1])).slice(0, 10).map(([term, def]) => ({ term: term.trim(), def: def.trim() }))
    : [];
  if (!steps.length && !hazards.length) throw new LLMError('Qwen found no steps or hazards in the document.');
  return {
    ...fallback,
    title: isStr(root.title) ? root.title.trim() : fallback.title,
    steps: steps.length ? steps : fallback.steps,
    hazards: hazards.length ? hazards : fallback.hazards,
    ppe: ppe.length ? ppe : fallback.ppe,
    terms: terms.length >= 3 ? terms : fallback.terms,
  };
}

const LANG_NAME: Record<'bm' | 'zh', string> = { bm: 'Bahasa Melayu', zh: 'Simplified Chinese' };

// Translating is a separate, parallel pass: the English draft returns in ~20-30 s and a slow or failed translation
// degrades to "English only" instead of throwing the whole draft away.
async function translateInto(lang: 'bm' | 'zh', exercises: Exercise[], signal?: AbortSignal): Promise<Map<string, Payload>> {
  const items = exercises.map((e) => ({ id: e.id, type: e.type, data: e.i18n.en.data }));
  const system = 'You are a professional marine-industry translator. Translate training task text faithfully. Keep numbers, units, codes and proper names unchanged. Answer with a single JSON object and nothing else.';
  const user = `Translate every human-readable string value in these training tasks into ${LANG_NAME[lang]}. Keep the JSON structure, keys, array order, the number of options/items, and every numeric index (e.g. "correct") EXACTLY the same. Do not translate keys.\n\nReturn {"items":[{"id":"...","data":{...translated...}}]}.\n\nINPUT:\n${JSON.stringify({ items })}`;
  const out = new Map<string, Payload>();
  try {
    const content = await callQwen('', system, user, signal, 4000);
    const root = JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')) as Raw;
    const arr = Array.isArray(root.items) ? (root.items as Raw[]) : [];
    for (const it of arr) {
      const src = exercises.find((e) => e.id === it.id);
      if (!src) continue;
      const p = payload(src.type, it.data);
      const en = src.i18n.en.data as unknown as Raw;
      const sameIdx = !('correct' in en) || (p && (p.data as unknown as Raw).correct === en.correct);
      if (p && sameIdx) out.set(src.id, p);
    }
  } catch { /* translation is best-effort */ }
  return out;
}

export async function generateWithQwen(apiKey: string, text: string, structure: Structure, materialId: string, translate: boolean, fallbackWidgets: Widgets, onDrafted?: (count: number) => void, only?: { type: ExType; avoid: string[] }): Promise<LLMResult> {
  const { system, user } = buildPrompt(text, structure, false, only?.type, only?.avoid);
  // Qwen now and then returns cut-off or malformed JSON; one retry saves the run from dropping to the offline engine.
  let r: LLMResult;
  try { r = parseLLMResponse(await callQwen(apiKey, system, user, undefined, 4500), materialId, fallbackWidgets); }
  catch (e) {
    if (!(e instanceof LLMError) || !/invalid JSON|no usable/.test(e.message)) throw e;
    r = parseLLMResponse(await callQwen(apiKey, system, user, undefined, 4500), materialId, fallbackWidgets);
  }
  if (only) {
    r = { ...r, exercises: r.exercises.filter((e) => e.type === only.type) };
    if (!r.exercises.length) throw new LLMError('Qwen returned no ' + only.type + ' tasks for this document.');
  }
  onDrafted?.(r.exercises.length);
  if (!translate) return r;
  const [bm, zh] = await Promise.all([translateInto('bm', r.exercises), translateInto('zh', r.exercises)]);
  for (const e of r.exercises) {
    const b = bm.get(e.id); if (b) e.i18n.bm = b;
    const z = zh.get(e.id); if (z) e.i18n.zh = z;
  }
  const langs: Lang[] = ['en'];
  if (bm.size) langs.push('bm');
  if (zh.size) langs.push('zh');
  return { ...r, langs };
}

/** Re-translates one task from its English version (task editor). Throws if neither language came back usable. */
export async function translateExercise(exercise: Exercise): Promise<{ bm?: Payload; zh?: Payload }> {
  const [bm, zh] = await Promise.all([translateInto('bm', [exercise]), translateInto('zh', [exercise])]);
  const out = { bm: bm.get(exercise.id), zh: zh.get(exercise.id) };
  if (!out.bm && !out.zh) throw new LLMError('Qwen could not translate this task. Check the connection and try again.');
  return out;
}
