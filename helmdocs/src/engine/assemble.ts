import type { Field, Rule, Section, Template } from '../data/types';
import { imoValid } from './fields';
import { PLACEHOLDER, fieldByKey, sectionLabel } from './template';

export type Values = Record<string, string>;
type Tpl = Pick<Template, 'fields' | 'sections' | 'regimeShort' | 'name'>;

export interface RuleResult { included: boolean; reason: string; short: string }

export function ruleText(rule: Rule): string {
  return rule.field + (rule.op === 'eq' ? ' = ' : rule.op === 'neq' ? ' ≠ ' : ' is not empty') + (rule.op === 'notEmpty' ? '' : rule.value);
}

export function evaluateRule(rule: Rule | null, values: Values, section: Section, fields: Field[]): RuleResult {
  if (!rule) return { included: true, reason: sectionLabel(section) + ' is always included.', short: 'always' };
  const v = (values[rule.field] || '').trim();
  const norm = (s: string) => s.toLowerCase().replace(/^y$/, 'yes').replace(/^n$/, 'no');
  const included = rule.op === 'eq' ? norm(v) === norm(rule.value) : rule.op === 'neq' ? norm(v) !== norm(rule.value) : v.length > 0;
  const f = fieldByKey(fields, rule.field);
  const actual = v ? v : '(empty)';
  return {
    included,
    short: (included ? 'included · ' : 'omitted · ') + rule.field + ' = ' + actual,
    reason: sectionLabel(section) + ' is ' + (included ? 'INCLUDED' : 'OMITTED') + ' because ' + rule.field + ' = ' + actual + (f ? ' (' + f.label + ')' : '') + '. Rule: included when ' + ruleText(rule) + '.',
  };
}

export interface RenderedLine { kind: 'pair' | 'text'; key?: string; label?: string; value: string; missing: boolean; parts?: { text: string; key?: string; missing?: boolean }[] }
export interface RenderedSection { section: Section; included: boolean; rule: RuleResult; lines: RenderedLine[] }
export interface Assembled { sections: RenderedSection[]; included: number; omitted: number; text: string }

/** Fill the template with values and evaluate every conditional rule. */
export function assemble(t: Tpl, values: Values): Assembled {
  const sections = t.sections.map((s): RenderedSection => {
    const rule = evaluateRule(s.rule, values, s, t.fields);
    // the drawn signature rule replaces "Signature: ____" placeholder lines in every output
    const lines = s.lines.filter((l) => !(l.kind === 'text' && /^(signature|signed)\b|_{3,}/i.test(l.text))).map((l): RenderedLine => {
      if (l.kind === 'pair') {
        const f = fieldByKey(t.fields, l.key);
        const v = (values[l.key] || '').trim();
        return { kind: 'pair', key: l.key, label: f ? f.label : l.key, value: v, missing: !v };
      }
      const parts: { text: string; key?: string; missing?: boolean }[] = [];
      let last = 0;
      for (const m of l.text.matchAll(PLACEHOLDER)) {
        if (m.index! > last) parts.push({ text: l.text.slice(last, m.index) });
        const v = (values[m[1]] || '').trim();
        parts.push({ text: v || '______', key: m[1], missing: !v });
        last = m.index! + m[0].length;
      }
      if (last < l.text.length) parts.push({ text: l.text.slice(last) });
      return { kind: 'text', value: parts.map((p) => p.text).join(''), missing: parts.some((p) => p.missing), parts };
    });
    return { section: s, included: rule.included, rule, lines };
  });
  const text = sections.filter((r) => r.included).map((r) => [r.section.heading, ...r.lines.map((l) => (l.kind === 'pair' ? l.label + ': ' + (l.value || '______') : l.value)), ...(r.section.table ? [r.section.table.cols.join(' | '), ...r.section.table.rows.map((row) => row.join(' | '))] : [])].filter(Boolean).join('\n')).join('\n\n');
  return { sections, included: sections.filter((s) => s.included).length, omitted: sections.filter((s) => !s.included).length, text };
}

// ---------------------------------------------------------------------------
// Pre-submission checks
// ---------------------------------------------------------------------------
export interface Check { id: string; label: string; ok: boolean; detail: string }

function includedFields(t: Tpl, values: Values): Field[] {
  const keys = new Set<string>();
  for (const s of t.sections) {
    if (!evaluateRule(s.rule, values, s, t.fields).included) continue;
    for (const l of s.lines) {
      if (l.kind === 'pair') keys.add(l.key);
      else for (const m of l.text.matchAll(PLACEHOLDER)) keys.add(m[1]);
    }
  }
  return t.fields.filter((f) => keys.has(f.key));
}

export function missingMandatory(t: Tpl, values: Values): Field[] {
  return includedFields(t, values).filter((f) => f.required && !(values[f.key] || '').trim());
}

export function signatoryOk(value: string, signatories: string[]): boolean {
  const name = value.split(',')[0].trim().toLowerCase();
  if (!name) return false;
  return signatories.some((s) => s.split(',')[0].trim().toLowerCase() === name);
}

export function precheck(t: Tpl, values: Values, signatories: string[]): Check[] {
  const checks: Check[] = [];
  const active = includedFields(t, values);

  const missing = missingMandatory(t, values);
  checks.push({ id: 'mandatory', label: 'All mandatory fields present', ok: missing.length === 0, detail: missing.length ? 'Missing: ' + missing.map((f) => f.label).join(', ') : active.length + ' fields filled in the included sections' });

  const imos = active.filter((f) => f.role === 'imo');
  if (imos.length) {
    const bad = imos.filter((f) => !imoValid(values[f.key] || ''));
    checks.push({ id: 'imo', label: 'IMO number checksum valid', ok: bad.length === 0, detail: bad.length ? bad.map((f) => (values[f.key] || '(empty)') + ' fails the 7-digit IMO check digit').join('; ') : imos.map((f) => values[f.key]).join(', ') + ' passes the IMO check digit' });
  }

  const signers = active.filter((f) => f.role === 'signatory');
  if (signers.length) {
    const bad = signers.filter((f) => !signatoryOk(values[f.key] || '', signatories));
    checks.push({ id: 'signatory', label: 'Signatory on the authorised list', ok: bad.length === 0, detail: bad.length ? bad.map((f) => (values[f.key] || '(empty)') + ' is not on the authorised-signatory list (' + f.label + ')').join('; ') : signers.map((f) => values[f.key].split(',')[0]).join(', ') + ' authorised in Settings' });
  }

  const conditional = t.sections.filter((s) => s.rule);
  for (const s of conditional) {
    const rule = s.rule!;
    const r = evaluateRule(rule, values, s, t.fields);
    const nums = s.lines.filter((l): l is { kind: 'pair'; key: string } => l.kind === 'pair').map((l) => fieldByKey(t.fields, l.key)).filter((f): f is Field => !!f && f.type === 'number');
    if (!nums.length) continue;
    const empty = nums.filter((f) => !(values[f.key] || '').trim());
    const controller = fieldByKey(t.fields, rule.field);
    const controllerValue = (values[rule.field] || '').trim();
    let detail: string;
    if (r.included) {
      detail = empty.length
        ? sectionLabel(s) + ' needs ' + empty.map((f) => f.label.toLowerCase()).join(' and ') + ' before it can be filed'
        : nums.map((f) => f.label + ' ' + values[f.key]).join(', ') + ' recorded in ' + sectionLabel(s);
    } else if (!controllerValue) {
      detail = sectionLabel(s) + ' will be checked once ' + (controller?.label || rule.field) + ' is answered — nothing to record yet';
    } else {
      detail = sectionLabel(s) + ' is not required, because ' + (controller?.label || rule.field) + ' = ' + controllerValue + ' (this section applies when ' + ruleText(rule) + ')';
    }
    checks.push({
      id: 'qty_' + s.id,
      label: nums.map((f) => f.label).join(' / ') + ' recorded when ' + ruleText(rule),
      ok: !r.included || empty.length === 0,
      detail,
    });
  }

  checks.push({ id: 'regime', label: 'Regime reference recognised', ok: t.regimeShort !== 'Unclassified', detail: t.regimeShort !== 'Unclassified' ? t.regimeShort + ' — template matched to a known compliance regime' : 'Template is not matched to a regime; set one before submission' });
  return checks;
}

export function docFileName(t: Tpl, values: Values, ext: string): string {
  const f = (role: string) => t.fields.find((x) => x.role === role);
  const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const where = values[f('vessel')?.key || ''] || values[t.fields.find((x) => /site|workplace|location/i.test(x.label))?.key || ''] || 'Harbourline';
  const ref = values[f('workorder')?.key || ''] || '';
  return [slug(t.regimeShort), slug(where), slug(ref)].filter(Boolean).join('_') + '.' + ext;
}

export function docVessel(t: Tpl, values: Values): string {
  const f = t.fields.find((x) => x.role === 'vessel');
  if (f && values[f.key]) return values[f.key];
  const site = t.fields.find((x) => /site|workplace|location/i.test(x.label));
  return (site && values[site.key]) || 'Head office';
}
