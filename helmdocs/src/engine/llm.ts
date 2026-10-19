import type { DeadlineRule, Doc, Field, FieldType, Section, Template } from '../data/types';
import { calendarEntries } from './reminders';
import { verifySeal } from './signature';
import { TYPES, type Detection } from './fields';
import { assemble, missingMandatory, precheck, type Check } from './assemble';
import { addFieldFromSelection, fieldByKey, renameField, retypeField } from './template';

// Qwen (DashScope) via the server-side relay in vite.config.ts: /api/qwen/chat/completions. The relay holds the API key;
// the browser never sees it. Every function here is best-effort — callers keep the offline rule-engine result when it fails.
export const QWEN_BASE = '/api/qwen';
export class LLMError extends Error {}

let healthCache: Promise<boolean> | null = null;
/** True when a server relay with a configured key answers (false on GitHub Pages / no key). Cached per page load. */
export function aiAvailable(): Promise<boolean> {
  if (!healthCache) {
    healthCache = fetch(QWEN_BASE + '/health', { signal: AbortSignal.timeout(4000) })
      .then(async (r) => r.ok && (await r.json().catch(() => ({})))?.ok === true)
      .catch(() => false);
  }
  return healthCache;
}
export function resetAiAvailability() { healthCache = null; }

async function callQwen(system: string, user: string, maxTokens: number, json: boolean, timeoutMs = 90_000): Promise<string> {
  const res = await fetch(QWEN_BASE + '/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ temperature: 0.2, max_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}), messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch((e) => { throw new LLMError(e instanceof Error && e.name === 'TimeoutError' ? 'Qwen took too long to answer.' : 'Could not reach the Qwen relay.'); });
  if (res.status === 503) throw new LLMError('The server has no Qwen API key configured.');
  if (res.status === 401) throw new LLMError('Qwen rejected the API key (401).');
  if (res.status === 429) throw new LLMError('Qwen rate limit hit (429). Try again in a moment.');
  if (!res.ok) throw new LLMError('Qwen returned HTTP ' + res.status + '.');
  const j = await res.json().catch(() => { throw new LLMError('Qwen returned a non-JSON body.'); });
  const content = j?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new LLMError('Qwen returned an empty answer.');
  return content;
}

function parseJson(content: string): Record<string, unknown> {
  try { return JSON.parse(content.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '')); }
  catch { throw new LLMError('Qwen answered with invalid JSON.'); }
}
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
/** Qwen occasionally answers with a key-like label (fire_watch_duration): turn it into words a person would read. */
const humanLabel = (l: string) => { const t = l.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
const MAX_FORM_CHARS = 12_000;

// ---------------------------------------------------------------------------------------------------------------------
// 1 · Template detection: Qwen reviews what the rule engine found and adds what it missed
// ---------------------------------------------------------------------------------------------------------------------
export interface Refined { fields: Field[]; sections: Section[]; added: number; changed: number; regime?: string }

export async function refineDetection(text: string, d: Detection): Promise<Refined> {
  const system = 'You are an expert in marine and offshore compliance paperwork (IHM, SHMS, WSH, TIW, Scope 3 and similar forms). You turn a form (filled in or blank, in any language) into a reusable template by finding the values that change from one filing to the next. Answer with a single JSON object and nothing else.';
  const found = d.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, sample: f.sample }));
  const user = `FORM TEXT:
"""
${text.length > MAX_FORM_CHARS ? text.slice(0, MAX_FORM_CHARS) + '\n[truncated]' : text}
"""

A rule engine already detected these variable fields:
${JSON.stringify(found)}

Review that result against the form and return JSON with exactly this shape:
{
  "additions": [ { "label": "Human-readable name in plain words IN THE SAME LANGUAGE AS THE FORM (e.g. \"Fire watch duration\", \"Должность\"; never snake_case)", "type": "text|number|id|date|yesno|list", "sample": "the EXACT characters from the form text that are the variable value — for an empty blank, the exact run of underscores" } ],
  "changes": [ { "key": "existing key", "label": "better label (optional)", "type": "better type (optional)", "required": true } ],
  "regime": "name of the compliance regime this form belongs to, or null"
}

Rules:
- Use type "number" for a measured quantity with a unit (e.g. 14 kg, 45 minutes, 0% LEL), "date" for dates, "id" for reference codes, "text" otherwise.
- "additions" are job-specific values the rule engine MISSED (vessel names, places, quantities, people, dates, ids written inside prose). "sample" must be copied character for character from the form text and must not already be a detected field's sample. Never add boilerplate wording, headings or legal text. At most 8.
- "changes" only where a detected field has a clearly wrong label, type or required flag. Omit anything that is fine. At most 8.
- Be conservative: an empty list is a good answer.`;
  const root = parseJson(await callQwen(system, user, 2000, true, 60_000));

  let fields = d.fields.map((f) => ({ ...f }));
  let sections: Section[] = d.sections.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l })) }));
  let changed = 0, added = 0;

  for (const c of (Array.isArray(root.changes) ? root.changes : []).slice(0, 8) as Record<string, unknown>[]) {
    const f = isStr(c.key) ? fieldByKey(fields, c.key) : undefined;
    if (!f) continue;
    const idx = fields.indexOf(f);
    let touched = false;
    if (typeof c.type === 'string' && (TYPES as string[]).includes(c.type) && c.type !== f.type) { fields = retypeField(fields, f.key, c.type as FieldType); touched = true; }
    if (typeof c.required === 'boolean' && c.required !== fields[idx].required) { fields = fields.map((x, i) => (i === idx ? { ...x, required: c.required as boolean } : x)); touched = true; }
    if (isStr(c.label) && c.label.trim() !== fields[idx].label) { const r = renameField(fields, sections, fields[idx].key, humanLabel(c.label)); fields = r.fields; sections = r.sections; touched = true; }
    if (touched) changed++;
  }

  for (const a of (Array.isArray(root.additions) ? root.additions : []).slice(0, 8) as Record<string, unknown>[]) {
    if (!isStr(a.label) || !isStr(a.sample)) continue;
    const sample = a.sample.replace(/\s+/g, ' ').trim();
    if (fields.some((f) => f.sample.trim().toLowerCase() === sample.toLowerCase())) continue;
    const type = typeof a.type === 'string' && (TYPES as string[]).includes(a.type) ? (a.type as FieldType) : undefined;
    let done = false;
    for (const s of sections) {
      for (let i = 0; i < s.lines.length && !done; i++) {
        if (s.lines[i].kind !== 'text') continue;
        const r = addFieldFromSelection(fields, sections, s.id, i, sample, humanLabel(a.label), type);
        if (r.field) { fields = r.fields; sections = r.sections; added++; done = true; }
      }
      if (done) break;
    }
  }
  return { fields, sections, added, changed, regime: isStr(root.regime) ? root.regime.trim() : undefined };
}

// ---------------------------------------------------------------------------------------------------------------------
// 2 · Pre-submission review: what a surveyor or auditor would catch that the rule checks cannot
// ---------------------------------------------------------------------------------------------------------------------
export interface Finding { severity: 'issue' | 'warn'; title: string; detail: string }

export async function reviewDocument(t: Template, values: Record<string, string>, signatories: string[]): Promise<Finding[]> {
  const rendered = assemble(t, values).text;
  const rule: Check[] = precheck(t, values, signatories);
  const system = 'You are a meticulous classification-society surveyor and WSH auditor reviewing a marine compliance document before it is submitted. You find real problems a person would miss. Answer with a single JSON object and nothing else.';
  const user = `DOCUMENT (${t.name} — ${t.regime}), exactly as it would be filed:
"""
${rendered.length > 8000 ? rendered.slice(0, 8000) + '\n[truncated]' : rendered}
"""

FIELD VALUES: ${JSON.stringify(Object.fromEntries(t.fields.map((f) => [f.label, values[f.key] || ''])))}

Mechanical checks already run (do not repeat them): ${JSON.stringify(rule.map((c) => ({ check: c.label, passed: c.ok })))}

Find problems the mechanical checks cannot: statements that contradict each other or a Yes/No answer, descriptions that are vague or too thin for an auditor, quantities or dates that look implausible or inconsistent (e.g. a date in the wrong year, a sign-off before the work), names or identifiers that do not match across fields, missing information a surveyor would ask for.

Return JSON: { "findings": [ { "severity": "issue" | "warn", "title": "5-9 words", "detail": "one or two sentences naming the exact field(s) and what to change" } ] }
"issue" = would likely cause rejection or a legal problem; "warn" = worth a second look. At most 6.
IMPORTANT: ground every finding in what the document itself says (contradictions between fields, impossible or implausible values, thin descriptions). Do NOT cite specific regulations, circulars, standards or numeric limits from memory — you may say a value "looks unusually low/high; confirm against the applicable permit or procedure". Keep each detail to two sentences. If the document is sound, return an empty list — do not invent problems.`;
  const root = parseJson(await callQwen(system, user, 1500, true, 60_000));
  const arr = Array.isArray(root.findings) ? (root.findings as Record<string, unknown>[]) : [];
  return arr.filter((f) => isStr(f.title) && isStr(f.detail)).slice(0, 6).map((f) => ({ severity: f.severity === 'issue' ? 'issue' : 'warn', title: String(f.title).trim(), detail: String(f.detail).trim() }));
}

// ---------------------------------------------------------------------------------------------------------------------
// 3 · Draft a free-text field from the rest of the document
// ---------------------------------------------------------------------------------------------------------------------
export async function draftField(t: Template, field: Field, values: Record<string, string>): Promise<string> {
  const context = t.fields.filter((f) => f.key !== field.key && (values[f.key] || '').trim()).map((f) => f.label + ': ' + values[f.key]).join('\n');
  const system = 'You write precise, plain-English entries for marine and offshore compliance forms. Output only the text of the entry — no preamble, no quotes, no markdown.';
  const user = `Form: ${t.name} (${t.regime})
Field to write: "${field.label}"
${field.sample ? 'How this field was worded on a previous filled-in form (match the style and level of detail, not the facts): "' + field.sample + '"\n' : ''}
Facts already entered on this document:
${context || '(none yet)'}

Write the entry for "${field.label}" in 1-3 sentences, consistent with the facts above. Use only facts given above; where a specific detail is needed but not given, leave it out rather than inventing it.`;
  const out = (await callQwen(system, user, 300, false, 45_000)).trim().replace(/^["“]|["”]$/g, '');
  if (!out) throw new LLMError('Qwen returned an empty draft.');
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// 4 · Library assistant: answer a plain-language question about the company's documents
// ---------------------------------------------------------------------------------------------------------------------

/** view = which cards the page shows under the answer: deadline cards, document cards, both, or none (counts, greetings). */
export type DeadlineWindow = 'next' | 'overdue' | 'today' | 'week' | 'later' | 'all';
export interface LibraryAnswer { answer: string; docIds: string[]; view: 'deadlines' | 'documents' | 'both' | 'none'; window: DeadlineWindow | null }

/** One compact line of facts per document — what Qwen is allowed to answer from. */
/** The same countdown wording the deadline cards use, so the answer and the cards never disagree. */
function deadlinePhrase(due: number, now: number): string {
  const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
  const d1 = new Date(due); d1.setHours(0, 0, 0, 0);
  const days = Math.round((d1.getTime() - d0.getTime()) / 86_400_000);
  if (days < 0) return Math.abs(days) + ' day' + (days === -1 ? '' : 's') + ' overdue';
  if (days === 0) return 'due today';
  return 'due in ' + days + ' day' + (days === 1 ? '' : 's');
}

export function libraryFacts(docs: Doc[], templates: Template[], rules: DeadlineRule[], now = Date.now()) {
  const cal = new Map(calendarEntries(docs, rules, now).map((e) => [e.doc.id, e]));
  const day = (t: number | null | undefined) => (t ? new Date(t).toISOString().slice(0, 10) : null);
  return [...docs].sort((a, b) => b.createdAt - a.createdAt).slice(0, 80).map((d) => {
    const t = templates.find((x) => x.id === d.templateId) || null;
    const e = cal.get(d.id);
    const values = Object.fromEntries(Object.entries(d.values).filter(([, v]) => v && v.length <= 80).slice(0, 12));
    return {
      id: d.id, file: d.name, template: d.templateName, regime: d.regimeShort, vessel_or_site: d.vessel, status: d.status === 'sent' ? 'submitted' : d.status,
      // a submitted document has no open deadline: only its timeliness is kept
      created: day(d.createdAt), submitted: day(d.sentAt),
      ...(d.status === 'sent' ? { submitted_on_time: e?.state === 'ontime' } : { due: day(e?.due), deadline: e ? deadlinePhrase(e.due, now) : undefined }),
      signed: !!d.signature && verifySeal(t, d) === 'valid', signed_by: d.signature?.signer, prepared_by: d.by,
      missing: t ? missingMandatory(t, d.values).map((f) => f.label) : [], values,
    };
  });
}

export async function askLibrary(question: string, docs: Doc[], templates: Template[], rules: DeadlineRule[]): Promise<LibraryAnswer> {
  const facts = libraryFacts(docs, templates, rules);
  const today = new Date().toISOString().slice(0, 10);
  // outstanding documents in deadline order (overdue first) so "closest / next / most urgent" is never guessed
  const byDue = facts.filter((f) => f.status !== 'submitted' && 'due' in f && f.due).map((f) => f as typeof f & { due: string; deadline?: string }).sort((a, b) => (a.due < b.due ? -1 : a.due > b.due ? 1 : 0)).map((f) => ({ id: f.id, due: f.due, deadline: f.deadline }));
  const nameOf = (id: string) => { const f = facts.find((x) => x.id === id); return f ? f.template + ' · ' + f.vessel_or_site : id; };
  const group = (test: (deadline: string) => boolean) => byDue.filter((b) => b.deadline && test(b.deadline)).map((b) => ({ id: b.id, name: nameOf(b.id), deadline: b.deadline }));
  const totals = { documents: docs.length, draft: docs.filter((d) => d.status === 'draft').length, reviewed: docs.filter((d) => d.status === 'reviewed').length, submitted: docs.filter((d) => d.status === 'sent').length };
  const blankTemplates = templates.length;
  const system = 'You are the document assistant of a marine & offshore company\'s compliance library. You answer questions about the documents listed in the data, and nothing else. Answer with a single JSON object and nothing else.';
  const user = `Today is ${today}. Document totals: ${JSON.stringify(totals)}. (Separately there are ${blankTemplates} blank templates — forms to start new documents from; they are not documents.)
Documents ("deadline" is the exact wording the app shows on each deadline card — e.g. "due today", "1 day overdue", "due in 3 days"):
${JSON.stringify(facts)}

Deadlines, already worked out by the app (use these groups as they are — do not recompute from dates):
- most urgent outstanding document: ${JSON.stringify(byDue[0] ? { id: byDue[0].id, name: nameOf(byDue[0].id), deadline: byDue[0].deadline } : null)}
- overdue: ${JSON.stringify(group((x) => /overdue/.test(x)))}
- due today: ${JSON.stringify(group((x) => x === 'due today'))}
- due in the next 7 days: ${JSON.stringify(group((x) => { const m = x.match(/^due in (\d+)/); return !!m && +m[1] <= 7; }))}
- due later than 7 days: ${JSON.stringify(group((x) => { const m = x.match(/^due in (\d+)/); return !!m && +m[1] > 7; }))}
("this week" / "soon" = overdue + due today + due in the next 7 days.)

Question: """${question.slice(0, 500)}"""

Return {"answer": "...", "doc_ids": ["..."], "view": "deadlines" | "documents" | "both" | "none", "window": "next" | "overdue" | "today" | "week" | "later" | "all" | null}.
- "window" (only for deadline questions, else null): "next" = the single most urgent / closest deadline; "overdue"; "today" = due today; "week" = this week / soon / what to submit next (overdue + today + next 7 days); "later" = beyond 7 days; "all" = every open deadline. The app then shows the exact list of deadline cards and their counts itself.
- When "window" is set, "answer" is ONE short sentence that introduces that list in the user's language — do NOT count or list documents (the app does that, exactly); for "next" you may name the most urgent document with its deadline wording.
- "view": which cards to show under your answer. "deadlines" when the question is about due dates, deadlines, overdue, urgency or what to submit next; "documents" when the user wants to find or open documents; "both" when it is about specific documents AND their deadlines; "none" for counts, totals, greetings or general questions.
- For "closest / next / most urgent deadline": an overdue document comes before anything due in the future — use the deadline order above.
- When you state how far a deadline is, use the document's "deadline" wording exactly; never work it out yourself from dates.
- "answer": 1-3 short sentences in the SAME LANGUAGE as the question, using only the data above (counts, dates, names, what is missing). Be specific (numbers, dates, vessel names). For a greeting or small talk, answer briefly and say what you can help with.
- "doc_ids": ids of the documents the answer is about, most relevant first (max 12); [] if it is not about specific documents.
- Never show internal ids (like "d_04") in "answer": name a document by its template and vessel/site, or its file name without the extension.
- Deadlines concern only documents that are NOT yet submitted; a submitted document has no open deadline. For deadline questions put only outstanding documents in "doc_ids", overdue first.
- Templates are not documents; only mention templates if asked about them.
- Never invent documents, values or regulations that are not in the data.`;
  const root = parseJson(await callQwen(system, user, 600, true, 45_000));
  const known = new Set(docs.map((d) => d.id));
  const ids = Array.isArray(root.doc_ids) ? (root.doc_ids as unknown[]).filter((x): x is string => typeof x === 'string' && known.has(x)).slice(0, 12) : [];
  if (!isStr(root.answer)) throw new LLMError('Qwen returned no answer.');
  const window = (['next', 'overdue', 'today', 'week', 'later', 'all'] as const).find((w) => w === root.window) || null;
  const view = window ? 'deadlines' : (['deadlines', 'documents', 'both', 'none'] as const).find((v) => v === root.view) || (ids.length ? 'documents' : 'none');
  return { answer: String(root.answer).trim(), docIds: [...new Set(ids)], view, window };
}
