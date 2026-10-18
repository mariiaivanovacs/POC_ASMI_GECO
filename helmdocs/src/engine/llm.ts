import type { Field, FieldType, Section, Template } from '../data/types';
import { TYPES, type Detection } from './fields';
import { assemble, precheck, type Check } from './assemble';
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
  const system = 'You are an expert in marine and offshore compliance paperwork (IHM, SHMS, WSH, TIW, Scope 3 and similar forms). You turn a filled-in form into a reusable template by finding the values that change from job to job. Answer with a single JSON object and nothing else.';
  const found = d.fields.map((f) => ({ key: f.key, label: f.label, type: f.type, required: f.required, sample: f.sample }));
  const user = `FORM TEXT:
"""
${text.length > MAX_FORM_CHARS ? text.slice(0, MAX_FORM_CHARS) + '\n[truncated]' : text}
"""

A rule engine already detected these variable fields:
${JSON.stringify(found)}

Review that result against the form and return JSON with exactly this shape:
{
  "additions": [ { "label": "Human-readable name in plain words, e.g. \"Fire watch duration\" (never snake_case or camelCase)", "type": "text|number|id|date|yesno|list", "sample": "the EXACT characters from the form text that are the variable value" } ],
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
