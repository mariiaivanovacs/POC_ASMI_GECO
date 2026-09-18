import { describe, expect, it } from 'vitest';
import { buildSeed } from '../../src/data/seed';
import { DEFAULT_DEADLINES, computeReminders, countdownText, diffValues, dueDate, groupByMonth, laterThan, parseDate, urgencyOf } from '../../src/engine/reminders';

const NOW = new Date(2026, 8, 18, 10).getTime(); // 18 Sep 2026
const { templates, docs } = buildSeed(NOW);

describe('deadline rules', () => {
  it('parse dates in both forms', () => {
    expect(parseDate('17 Sep 2026')).toBe(new Date(2026, 8, 17).getTime());
    expect(parseDate('2026-09-17')).toBe(new Date(2026, 8, 17).getTime());
    expect(parseDate('soon')).toBeNull();
  });
  it('field-based, quarter-end and month-end bases', () => {
    const ihm = docs.find((d) => d.id === 'd_01')!; // date_work = 18 Sep
    expect(dueDate(ihm, DEFAULT_DEADLINES.find((r) => r.regimeShort === 'HKC / IHM')!)).toBe(new Date(2026, 8, 25).getTime());
    const shms = docs.find((d) => d.regimeShort === 'WSH SHMS')!;
    expect(new Date(dueDate(shms, DEFAULT_DEADLINES.find((r) => r.regimeShort === 'WSH SHMS')!)).getDate()).toBe(30);
    const esg = docs.find((d) => d.regimeShort === 'ESG / Scope 3')!;
    expect(new Date(dueDate(esg, DEFAULT_DEADLINES.find((r) => r.regimeShort === 'ESG / Scope 3')!)).getMonth()).toBe(8);
  });
  it('urgency bands and countdown wording', () => {
    expect(urgencyOf(-1)).toBe('overdue'); expect(urgencyOf(0)).toBe('today'); expect(urgencyOf(7)).toBe('soon'); expect(urgencyOf(8)).toBe('later');
    const r = computeReminders(docs, templates, DEFAULT_DEADLINES, NOW);
    expect(countdownText(r.find((x) => x.urgency === 'today')!)).toBe('due today');
  });
});

describe('reminders from the library', () => {
  const rs = computeReminders(docs, templates, DEFAULT_DEADLINES, NOW);
  it('one reminder per unsent document, sorted by due date', () => {
    expect(rs.length).toBe(docs.filter((d) => d.status !== 'sent').length);
    for (let i = 1; i < rs.length; i++) expect(rs[i].due).toBeGreaterThanOrEqual(rs[i - 1].due);
  });
  it('missing fields come from the mandatory check; an unsigned signature block is flagged; a complete reviewed doc is ready', () => {
    const ihmDraft = rs.find((r) => r.doc.id === 'd_01')!; // haz = No, description filled, signatory blank in v1 but values full
    expect(ihmDraft.missing).toContain('Not signed');
    const tiw = rs.find((r) => r.doc.regimeShort === 'NEA TIW')!;
    expect(tiw.doc.status).toBe('reviewed');
    expect(tiw.missing).toEqual(['Not signed']);
    expect(tiw.ready).toBe(false);
  });
  it('hours left scale with what is missing plus review / sign / send overheads', () => {
    const tiw = rs.find((r) => r.doc.regimeShort === 'NEA TIW')!;
    expect(tiw.hoursLeft).toBe(0.2); // reviewed: sign 0.1 + send 0.1
    const draft = rs.find((r) => r.doc.status === 'draft' && r.missing.length > 1)!;
    expect(draft.hoursLeft).toBeGreaterThan(0.35);
  });
  it('groups into the next three months with overdue items kept in the current month', () => {
    const g = groupByMonth(rs, NOW, 3);
    expect(g.map((x) => x.key)).toEqual(['2026-09', '2026-10', '2026-11']);
    expect(g[0].items.length).toBeGreaterThan(0);
    expect(g[0].items.every((r) => r.monthKey === '2026-09' || r.urgency === 'overdue')).toBe(true);
    expect(g[0].hours).toBeGreaterThan(0);
    const all = groupByMonth(rs, NOW, 12);
    expect(laterThan(rs, all)).toHaveLength(0);
  });
  it('a custom rule moves the deadline', () => {
    const rules = DEFAULT_DEADLINES.map((r) => (r.regimeShort === 'HKC / IHM' ? { ...r, days: 30 } : r));
    const a = computeReminders(docs, templates, DEFAULT_DEADLINES, NOW).find((r) => r.doc.id === 'd_01')!;
    const b = computeReminders(docs, templates, rules, NOW).find((r) => r.doc.id === 'd_01')!;
    expect(b.due - a.due).toBe(23 * 86_400_000);
  });
  it('a document whose regime has no rule still gets a month-end reminder', () => {
    const odd = { ...docs[0], regimeShort: 'Unclassified', templateId: 'nope' };
    const r = computeReminders([odd], templates, DEFAULT_DEADLINES, NOW)[0];
    expect(r.rule.basis).toBe('month-end');
    expect(r.template).toBeNull();
    expect(r.hoursLeft).toBe(0.3); // 0.25 rounded to one decimal
  });
});

describe('versions', () => {
  it('seeded documents carry a history that matches their status', () => {
    for (const d of docs) {
      expect(d.versions.length).toBe(d.status === 'draft' ? 1 : d.status === 'reviewed' ? 2 : 3);
      expect(d.versions[d.versions.length - 1].status).toBe(d.status);
    }
  });
  it('diff lists only changed fields', () => {
    expect(diffValues({ a: '1', b: '2' }, { a: '1', b: '3', c: 'x' })).toEqual([{ key: 'b', from: '2', to: '3' }, { key: 'c', from: '', to: 'x' }]);
  });
});
