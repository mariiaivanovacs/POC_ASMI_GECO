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
