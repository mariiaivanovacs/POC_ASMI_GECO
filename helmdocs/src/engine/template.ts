import type { Field, FieldType, Line, Section, Template } from '../data/types';
import { LEXICON, inferType, keyFor, type Detection } from './fields';

export const PLACEHOLDER = /\{\{([a-z0-9_]+)\}\}/g;

/** Package a detection result as the dynamic-template body. */
export function buildTemplate(d: Detection): { fields: Field[]; sections: Section[] } {
  return { fields: d.fields.map((f) => ({ ...f })), sections: d.sections.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l })) })) };
}

export function uniqueKey(base: string, fields: Field[], except?: string): string {
  let key = base;
  let i = 2;
  while (fields.some((f) => f.key === key && f.key !== except)) key = base + '_' + i++;
  return key;
}

function mapKeys(sections: Section[], fn: (key: string) => string): Section[] {
  return sections.map((s) => ({
    ...s,
    rule: s.rule ? { ...s.rule, field: fn(s.rule.field) } : null,
    lines: s.lines.map((l): Line => (l.kind === 'pair' ? { kind: 'pair', key: fn(l.key) } : { kind: 'text', text: l.text.replace(PLACEHOLDER, (_, k) => '{{' + fn(k) + '}}') })),
  }));
}

/** Rename a field: the label changes and its merge key follows it everywhere it appears. */
export function renameField(fields: Field[], sections: Section[], key: string, label: string): { fields: Field[]; sections: Section[] } {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (!clean) return { fields, sections };
  const next = uniqueKey(keyFor(clean), fields, key);
  return {
    fields: fields.map((f) => (f.key === key ? { ...f, key: next, label: clean } : f)),
    sections: mapKeys(sections, (k) => (k === key ? next : k)),
  };
}

export function optionsFor(f: Field, type: FieldType): string[] | undefined {
  if (type === 'yesno') return ['Yes', 'No'];
  if (type === 'list') {
    if (f.options && f.options.length > 2) return f.options;
    const g = LEXICON.find((x) => x.labelHint.test(f.label));
    if (g) return g.options;
    return f.sample ? [f.sample] : [];
  }
  return undefined;
}

export function retypeField(fields: Field[], key: string, type: FieldType): Field[] {
  return fields.map((f) => (f.key === key ? { ...f, type, options: optionsFor(f, type) } : f));
}

/** Delete a field: its placeholders become the literal value seen in the form; rules that depended on it are dropped. */
export function deleteField(fields: Field[], sections: Section[], key: string): { fields: Field[]; sections: Section[] } {
  const f = fields.find((x) => x.key === key);
  if (!f) return { fields, sections };
  const literal = f.sample || '______';
  return {
    fields: fields.filter((x) => x.key !== key),
    sections: sections.map((s) => ({
      ...s,
      rule: s.rule && s.rule.field === key ? null : s.rule,
      lines: s.lines.map((l): Line => (l.kind === 'pair' && l.key === key ? { kind: 'text', text: f.label + ': ' + literal } : l.kind === 'text' ? { kind: 'text', text: l.text.replace(PLACEHOLDER, (m, k) => (k === key ? literal : m)) } : l)),
    })),
  };
}

export function sampleValues(fields: Field[]): Record<string, string> {
  const v: Record<string, string> = {};
  for (const f of fields) v[f.key] = f.sample;
  return v;
}

export function fieldByKey(fields: Field[], key: string): Field | undefined { return fields.find((f) => f.key === key); }

export function sectionLabel(s: Section): string {
  const m = s.heading.match(/^(\d{1,2})\./);
  return m ? 'Section ' + m[1] : s.heading || 'Section';
}

/** Plain-text rendering of a template with the given values (blanks for missing). */
export function renderLine(l: Line, fields: Field[], values: Record<string, string>, blank = '______'): string {
  if (l.kind === 'pair') { const f = fieldByKey(fields, l.key); return (f ? f.label : l.key) + ': ' + (values[l.key] || blank); }
  return l.text.replace(PLACEHOLDER, (_, k) => values[k] || blank);
}

export function templateStats(t: Pick<Template, 'fields' | 'sections'>) {
  return {
    fields: t.fields.length,
    conditional: t.sections.filter((s) => s.rule).length,
    signature: t.sections.filter((s) => s.signature).length,
  };
}

/**
 * Turn a text selection inside a prose line into a merge field. The selection must sit in a literal part of the
 * line (not inside an existing field); the first occurrence becomes {{key}} and the selection is kept as the sample.
 */
export function addFieldFromSelection(fields: Field[], sections: Section[], sectionId: string, lineIndex: number, selected: string, label: string, type?: FieldType): { fields: Field[]; sections: Section[]; field: Field | null; error?: string } {
  const text = selected.replace(/\s+/g, ' ').trim();
  const clean = label.replace(/\s+/g, ' ').trim();
  if (!text) return { fields, sections, field: null, error: 'Nothing selected.' };
  if (!clean) return { fields, sections, field: null, error: 'Give the field a name.' };
  const s = sections.find((x) => x.id === sectionId);
  const line = s?.lines[lineIndex];
  if (!s || !line) return { fields, sections, field: null, error: 'That line is no longer in the template.' };
  if (line.kind === 'pair') return { fields, sections, field: null, error: 'That text is already the value of the field "' + (fieldByKey(fields, line.key)?.label || line.key) + '".' };
  // only literal segments between existing placeholders may be turned into a field
  const parts = line.text.split(/(\{\{[a-z0-9_]+\}\})/);
  const idx = parts.findIndex((p) => !/^\{\{/.test(p) && p.includes(text));
  if (idx < 0) return { fields, sections, field: null, error: 'Select text that is not already part of a field.' };
  const inferred = inferType(clean, text);
  const key = uniqueKey(keyFor(clean), fields);
  const field: Field = { key, role: inferred.role, label: clean, type: type || inferred.type, options: optionsFor({ key, role: inferred.role, label: clean, type: type || inferred.type, confidence: 100, required: true, sample: text, source: line.text }, type || inferred.type), confidence: 100, required: true, sample: text, source: line.text, manual: true };
  parts[idx] = parts[idx].replace(text, '{{' + key + '}}');
  const next = sections.map((x) => (x.id !== sectionId ? x : { ...x, lines: x.lines.map((l, i) => (i === lineIndex ? { kind: 'text' as const, text: parts.join('') } : l)) }));
  return { fields: [...fields, field], sections: next, field };
}

/** Fields that sit in a signature block: who signs and the signing date. */
export function signatureFields(fields: Field[], sections: Section[]): { section: Section; signatory: Field | null; date: Field | null }[] {
  return sections.filter((s) => s.signature).map((s) => {
    const keys = s.lines.filter((l): l is { kind: 'pair'; key: string } => l.kind === 'pair').map((l) => l.key);
    const fs = keys.map((k) => fieldByKey(fields, k)).filter((f): f is Field => !!f);
    return { section: s, signatory: fs.find((f) => f.role === 'signatory') || null, date: fs.find((f) => f.type === 'date') || null };
  });
}

// ---------------------------------------------------------------------------------------------------------------------
// Switching a document to another template: carry what was already typed over to the matching fields
// ---------------------------------------------------------------------------------------------------------------------
const STOPWORDS = new Set(['of', 'the', 'no', 'number', 'nr', 'ref', 'a', 'an', 'and', 'for', 'on', 'if', 'applicable', 'name']);
const UNIQUE_ROLES = new Set(['vessel', 'imo', 'workorder', 'company', 'signatory']);
const labelTokens = (l: string) => l.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w && !STOPWORDS.has(w));
const normLabel = (l: string) => labelTokens(l).join(' ');
function overlap(a: string, b: string): number {
  const A = new Set(labelTokens(a)), B = new Set(labelTokens(b));
  if (!A.size || !B.size) return 0;
  let n = 0; for (const x of A) if (B.has(x)) n++;
  return n / Math.max(A.size, B.size);
}
function fits(to: Field, value: string): boolean {
  if (to.type === 'yesno') return /^(yes|no)$/i.test(value.trim());
  if (to.type === 'number') return /\d/.test(value);
  return true;
}

export interface Carry { values: Record<string, string>; carried: { from: Field | null; to: Field; how: string }[]; toFill: Field[] }

/**
 * Map a document's values onto another template's fields: same key → same role (vessel, IMO, work order, company,
 * signatory) → same label → similar label of a compatible type. Old values stay in the bag, so switching back restores them.
 */
export function carryValues(fromFields: Field[], values: Record<string, string>, toFields: Field[]): Carry {
  const out: Record<string, string> = { ...values };
  const carried: Carry['carried'] = [];
  const toFill: Field[] = [];
  const filled = fromFields.filter((f) => (values[f.key] || '').trim());
  const usedGeneric = new Set<string>();
  for (const to of toFields) {
    const have = (values[to.key] || '').trim();
    if (have && fits(to, have)) { carried.push({ from: fromFields.find((f) => f.key === to.key) || null, to, how: 'same field' }); continue; }
    let src: Field | undefined; let how = '';
    // a role alone is only trusted when it is unambiguous on both sides (one vessel field here, one there); reference
    // codes all look like "work orders" to the detector, so those also need the label to agree
    if (UNIQUE_ROLES.has(to.role) && toFields.filter((x) => x.role === to.role).length === 1) {
      const cands = filled.filter((f) => f.role === to.role);
      if (cands.length === 1 && (to.role !== 'workorder' || overlap(cands[0].label, to.label) >= 0.5)) { src = cands[0]; how = 'same meaning'; }
    }
    if (!src) { src = filled.find((f) => !usedGeneric.has(f.key) && normLabel(f.label) === normLabel(to.label) && normLabel(to.label)); how = 'same label'; }
    if (!src) {
      const best = filled.filter((f) => !usedGeneric.has(f.key) && (f.type === to.type || (to.type === 'text' && f.type !== 'yesno'))).map((f) => ({ f, s: overlap(f.label, to.label) })).sort((a, b) => b.s - a.s)[0];
      if (best && best.s >= 0.6) { src = best.f; how = 'similar label'; }
    }
    if (src && fits(to, values[src.key])) {
      out[to.key] = values[src.key];
      if (how !== 'same meaning') usedGeneric.add(src.key);
      carried.push({ from: src, to, how });
    } else {
      if (!(out[to.key] || '').trim()) out[to.key] = '';
      toFill.push(to);
    }
  }
  return { values: out, carried, toFill };
}
