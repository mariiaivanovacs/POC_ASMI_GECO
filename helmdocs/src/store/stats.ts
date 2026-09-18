import type { Doc, DocStatus, Template } from '../data/types';

export const PERIOD_DAYS = 30;
const DAY = 86_400_000;

export interface Filter { templateId: string | null; status: DocStatus | null }
export const NO_FILTER: Filter = { templateId: null, status: null };

export function applyFilter(docs: Doc[], f: Filter): Doc[] {
  return docs.filter((d) => (!f.templateId || d.templateId === f.templateId) && (!f.status || d.status === f.status));
}

export function inPeriod(docs: Doc[], now = Date.now(), days = PERIOD_DAYS): Doc[] {
  return docs.filter((d) => now - d.createdAt <= days * DAY);
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (x: number) => Math.round(x * 10) / 10;

export interface Strip { generated: number; sent: number; pendingReview: number; awaitingSend: number; avgMinutes: number; manualMinutes: number; hoursSaved: number; total: number }
export function strip(docs: Doc[], now = Date.now()): Strip {
  const period = inPeriod(docs, now);
  const saved = period.reduce((a, d) => a + Math.max(0, d.manualMinutes - d.minutes), 0);
  return {
    generated: period.length,
    sent: period.filter((d) => d.status === 'sent').length,
    pendingReview: docs.filter((d) => d.status === 'draft').length,
    awaitingSend: docs.filter((d) => d.status === 'reviewed').length,
    avgMinutes: r1(mean(period.map((d) => d.minutes))),
    manualMinutes: Math.round(mean(period.map((d) => d.manualMinutes))),
    hoursSaved: r1(saved / 60),
    total: docs.length,
  };
}

export interface TemplateCard { template: Template; count: number; avgMinutes: number; pending: number; sent: number; draft: number; reviewed: number; series: number[]; hoursSaved: number; formCode: string; lastAt: number | null }
/** One card per template: counts, status split, a 6-week series and the form code printed on the source form. */
export function templateCards(templates: Template[], docs: Doc[], now = Date.now()): TemplateCard[] {
  return templates.map((t) => {
    const mine = docs.filter((d) => d.templateId === t.id);
    const series: number[] = [];
    for (let w = 5; w >= 0; w--) { const w1 = now - w * 7 * DAY, w0 = w1 - 7 * DAY; series.push(mine.filter((d) => d.createdAt > w0 && d.createdAt <= w1).length); }
    const code = t.sections[0]?.lines.find((l) => l.kind === 'text' && /^form\b/i.test(l.text)) as { text: string } | undefined;
    return {
      template: t, count: mine.length, avgMinutes: r1(mean(mine.map((d) => d.minutes))), pending: mine.filter((d) => d.status !== 'sent').length,
      sent: mine.filter((d) => d.status === 'sent').length, draft: mine.filter((d) => d.status === 'draft').length, reviewed: mine.filter((d) => d.status === 'reviewed').length,
      series, hoursSaved: r1(mine.reduce((a, d) => a + Math.max(0, d.manualMinutes - d.minutes), 0) / 60),
      formCode: code ? code.text.replace(/^form\s*/i, '').replace(/\s*rev\.?.*$/i, '') : t.regimeShort,
      lastAt: mine.length ? Math.max(...mine.map((d) => d.createdAt)) : null,
    };
  });
}

export interface DayPoint { label: string; day: number; count: number; sent: number }
export function perDay(docs: Doc[], days = 14, now = Date.now()): DayPoint[] {
  const start = new Date(now); start.setHours(0, 0, 0, 0);
  const out: DayPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d0 = start.getTime() - i * DAY;
    const d1 = d0 + DAY;
    const inDay = docs.filter((d) => d.createdAt >= d0 && d.createdAt < d1);
    const dt = new Date(d0);
    out.push({ label: dt.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][dt.getMonth()], day: d0, count: inDay.length, sent: inDay.filter((d) => d.status === 'sent').length });
  }
  return out;
}

export interface RegimePoint { regime: string; count: number; minutes: number }
export function byRegime(docs: Doc[]): RegimePoint[] {
  const m = new Map<string, RegimePoint>();
  for (const d of docs) {
    const p = m.get(d.regimeShort) || { regime: d.regimeShort, count: 0, minutes: 0 };
    p.count++; p.minutes += d.minutes;
    m.set(d.regimeShort, p);
  }
  return Array.from(m.values()).sort((a, b) => b.count - a.count);
}

export interface WeekPoint { label: string; helm: number; manual: number; saved: number }
export function perWeek(docs: Doc[], weeks = 4, now = Date.now()): WeekPoint[] {
  const out: WeekPoint[] = [];
  for (let i = weeks - 1; i >= 0; i--) {
    const w1 = now - i * 7 * DAY;
    const w0 = w1 - 7 * DAY;
    const inWeek = docs.filter((d) => d.createdAt > w0 && d.createdAt <= w1);
    const helm = inWeek.reduce((a, d) => a + d.minutes, 0);
    const manual = inWeek.reduce((a, d) => a + d.manualMinutes, 0);
    out.push({ label: i === 0 ? 'This week' : i + 'w ago', helm, manual, saved: Math.max(0, manual - helm) });
  }
  return out;
}

export interface StatusPoint { status: DocStatus; count: number }
export function byStatus(docs: Doc[]): StatusPoint[] {
  return (['draft', 'reviewed', 'sent'] as DocStatus[]).map((status) => ({ status, count: docs.filter((d) => d.status === status).length }));
}

export function docRows(docs: Doc[]) {
  return docs.map((d) => ({
    document: d.name, template: d.templateName, regime: d.regimeShort, vessel_or_site: d.vessel, status: d.status, generated: new Date(d.createdAt).toISOString().slice(0, 10),
    reviewed: d.reviewedAt ? new Date(d.reviewedAt).toISOString().slice(0, 10) : '', sent: d.sentAt ? new Date(d.sentAt).toISOString().slice(0, 10) : '', by: d.by,
    minutes: d.minutes, manual_minutes: d.manualMinutes, minutes_saved: Math.max(0, d.manualMinutes - d.minutes), exports: d.exports.join(' '),
  }));
}
