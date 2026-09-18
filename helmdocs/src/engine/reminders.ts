import type { DeadlineRule, Doc, DocStatus, Template } from '../data/types';
import { missingMandatory } from './assemble';
import { verifySeal } from './signature';

const DAY = 86_400_000;

/** Default rules — the regime's own filing window where one exists, otherwise a sensible internal deadline. */
export const DEFAULT_DEADLINES: DeadlineRule[] = [
  { regimeShort: 'HKC / IHM', basis: 'field', field: 'date_work', days: 7, text: 'SDoC to the owner ≤ 7 days after work completion', estHours: 1 },
  { regimeShort: 'WSH Incident', basis: 'field', field: 'incident_date', days: 10, text: 'MOM iReport ≤ 10 days after the incident', estHours: 1.5 },
  { regimeShort: 'NEA TIW', basis: 'field', field: 'collection_date', days: 7, text: 'NEA e-Tracking ≤ 7 days after collection', estHours: 0.5 },
  { regimeShort: 'PTW', basis: 'field', field: 'valid_to', days: 0, text: 'Permit valid-to date — signed and sent before the shift', estHours: 0.5 },
  { regimeShort: 'bizSAFE', basis: 'field', field: 'assessment_date', days: 0, text: 'RA approved before work starts', estHours: 1 },
  { regimeShort: 'WSH SHMS', basis: 'quarter-end', field: '', days: 0, text: 'Internal audit pack closed by quarter end', estHours: 3 },
  { regimeShort: 'ESG / Scope 3', basis: 'month-end', field: '', days: 0, text: 'Customer questionnaire — month end', estHours: 4 },
];

export type Urgency = 'overdue' | 'today' | 'soon' | 'later';

export interface Reminder {
  doc: Doc; template: Template | null; rule: DeadlineRule;
  due: number; days: number; urgency: Urgency;
  missing: string[]; ready: boolean; hoursLeft: number; monthKey: string;
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function parseDate(v: string): number | null {
  const m = v.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m) { const mi = MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase()); if (mi >= 0) return new Date(parseInt(m[3]), mi, parseInt(m[1])).getTime(); }
  const iso = v.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3])).getTime();
  return null;
}
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
const endOfMonth = (t: number) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth() + 1, 0).getTime(); };
const endOfQuarter = (t: number) => { const d = new Date(t); const q = Math.floor(d.getMonth() / 3); return new Date(d.getFullYear(), q * 3 + 3, 0).getTime(); };

export function dueDate(doc: Doc, rule: DeadlineRule): number {
  if (rule.basis === 'quarter-end') return endOfQuarter(doc.createdAt);
  if (rule.basis === 'month-end') return endOfMonth(doc.createdAt);
  const basis = parseDate(doc.values[rule.field] || '') ?? startOfDay(doc.createdAt);
  return startOfDay(basis) + rule.days * DAY;
}

export function urgencyOf(days: number): Urgency { return days < 0 ? 'overdue' : days === 0 ? 'today' : days <= 7 ? 'soon' : 'later'; }

export function monthKey(t: number): string { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
export function monthLabel(key: string): string { const [y, m] = key.split('-').map(Number); return ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][m - 1] + ' ' + y; }

/**
 * Every unsent document gets a reminder: its due date from the regime rule, what is still missing
 * (the same mandatory check the pre-submission card runs) and an estimate of the hours left —
 * the rule's full effort scaled by the missing share, plus review / sign / send overheads.
 */
export function computeReminders(docs: Doc[], templates: Template[], rules: DeadlineRule[], now = Date.now()): Reminder[] {
  const today = startOfDay(now);
  const out: Reminder[] = [];
  for (const doc of docs) {
    if (doc.status === 'sent') continue;
    const rule = rules.find((r) => r.regimeShort === doc.regimeShort) || { regimeShort: doc.regimeShort, basis: 'month-end' as const, field: '', days: 0, text: 'Internal deadline — month end', estHours: 1 };
    const template = templates.find((t) => t.id === doc.templateId) || null;
    const due = dueDate(doc, rule);
    const days = Math.round((startOfDay(due) - today) / DAY);
    const hasSig = !!template && template.sections.some((s) => s.signature);
    const signed = template ? verifySeal(template, doc) === 'valid' : false;
    const missing = template ? missingMandatory(template, doc.values).map((f) => f.label) : [];
    if (hasSig && !signed) missing.push('Not signed');
    const required = template ? template.fields.filter((f) => f.required).length || 1 : 1;
    let hours = rule.estHours * (missing.filter((m) => m !== 'Not signed').length / required);
    if (doc.status === 'draft') hours += 0.25; // review
    if (hasSig && !signed) hours += 0.1; // sign
    hours += 0.1; // send
    if (!template) hours = 0.25;
    out.push({ doc, template, rule, due, days, urgency: urgencyOf(days), missing, ready: missing.length === 0 && doc.status === 'reviewed', hoursLeft: Math.max(0.1, Math.round(hours * 10) / 10), monthKey: monthKey(due) });
  }
  return out.sort((a, b) => a.due - b.due || a.doc.createdAt - b.doc.createdAt);
}

export interface MonthGroup { key: string; label: string; items: Reminder[]; hours: number }
/** The next N months (this month first); overdue items fall into the current month so they are never hidden. */
export function groupByMonth(reminders: Reminder[], now = Date.now(), months = 3): MonthGroup[] {
  const keys: string[] = [];
  const d = new Date(now);
  for (let i = 0; i < months; i++) keys.push(monthKey(new Date(d.getFullYear(), d.getMonth() + i, 1).getTime()));
  const current = keys[0];
  return keys.map((key) => {
    const items = reminders.filter((r) => r.monthKey === key || (key === current && r.due < startOfDay(now)));
    return { key, label: monthLabel(key), items, hours: Math.round(items.reduce((a, r) => a + r.hoursLeft, 0) * 10) / 10 };
  });
}

export function laterThan(reminders: Reminder[], groups: MonthGroup[]): Reminder[] {
  const shown = new Set(groups.flatMap((g) => g.items.map((r) => r.doc.id)));
  return reminders.filter((r) => !shown.has(r.doc.id));
}

export function countdownText(r: Reminder): string {
  if (r.urgency === 'overdue') return Math.abs(r.days) + ' day' + (Math.abs(r.days) === 1 ? '' : 's') + ' overdue';
  if (r.urgency === 'today') return 'due today';
  return r.days + ' day' + (r.days === 1 ? '' : 's');
}
export function statusWord(s: DocStatus): string { return s === 'draft' ? 'Draft' : s === 'reviewed' ? 'Reviewed' : 'Sent'; }

/** Fields whose value differs between two snapshots. */
export function diffValues(a: Record<string, string>, b: Record<string, string>): { key: string; from: string; to: string }[] {
  const keys = Array.from(new Set([...Object.keys(a), ...Object.keys(b)]));
  return keys.filter((k) => (a[k] || '') !== (b[k] || '')).map((k) => ({ key: k, from: a[k] || '', to: b[k] || '' }));
}
