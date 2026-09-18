import { describe, expect, it } from 'vitest';
import { buildSeed } from '../../src/data/seed';
import { applyFilter, byRegime, byStatus, docRows, perDay, perWeek, strip, templateCards } from '../../src/store/stats';
import { explain, search, suggestions, tokens } from '../../src/engine/search';

const NOW = 1_800_000_000_000;
const { templates, docs } = buildSeed(NOW);

describe('stats', () => {
  it('strip counts come from the documents', () => {
    const s = strip(docs, NOW);
    expect(s.generated).toBe(docs.length);
    expect(s.sent).toBe(docs.filter((d) => d.status === 'sent').length);
    expect(s.pendingReview).toBe(docs.filter((d) => d.status === 'draft').length);
    expect(s.avgMinutes).toBeGreaterThan(0);
    expect(s.manualMinutes).toBeGreaterThan(s.avgMinutes);
    expect(s.hoursSaved).toBeGreaterThan(0);
  });
  it('template cards, filters and charts are consistent', () => {
    const cards = templateCards(templates, docs);
    expect(cards.reduce((a, c) => a + c.count, 0)).toBe(docs.length);
    const ihm = cards.find((c) => c.template.id === 't_ihm')!;
    expect(applyFilter(docs, { templateId: 't_ihm', status: null })).toHaveLength(ihm.count);
    expect(applyFilter(docs, { templateId: 't_ihm', status: 'sent' }).length).toBe(ihm.sent);
    expect(perDay(docs, 14, NOW)).toHaveLength(14);
    expect(perDay(docs, 14, NOW).reduce((a, p) => a + p.count, 0)).toBe(docs.filter((d) => NOW - d.createdAt < 14 * 86_400_000 + 86_400_000).length);
    expect(byRegime(docs).reduce((a, p) => a + p.count, 0)).toBe(docs.length);
    expect(byStatus(docs).reduce((a, p) => a + p.count, 0)).toBe(docs.length);
    expect(perWeek(docs, 4, NOW)).toHaveLength(4);
    expect(perWeek(docs, 4, NOW).every((w) => w.saved >= 0)).toBe(true);
    expect(docRows(docs)[0]).toHaveProperty('minutes_saved');
  });
  it('an empty library gives zeros, never NaN', () => {
    const s = strip([], NOW);
    expect(s).toMatchObject({ generated: 0, avgMinutes: 0, manualMinutes: 0, hoursSaved: 0 });
  });
});

describe('assistant search', () => {
  it('tokenises with stop words and stems', () => {
    expect(tokens('Find the IHM declaration for MV Ocean Pioneer')).toEqual(['ihm', 'declaration', 'mv', 'ocean', 'pioneer']);
  });
  it('keeps work-order codes as one token and matches only that work order', () => {
    expect(tokens('WO-2409')).toEqual(['wo2409']);
    const r = search(docs, 'WO-2409');
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every((h) => JSON.stringify(h.doc).includes('WO-2409'))).toBe(true);
  });
  it('finds IHM documents for a vessel and explains why', () => {
    const r = search(docs, 'IHM declaration for MV Ocean Pioneer');
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits[0].doc.regimeShort).toBe('HKC / IHM');
    expect(r.hits[0].doc.vessel).toBe('MV Ocean Pioneer');
    expect(r.hits[0].why.map((w) => w.field)).toEqual(expect.arrayContaining(['vessel', 'regime']));
  });
  it('"pending" matches drafts and reviewed documents', () => {
    const r = search(docs, 'SHMS evidence still pending');
    expect(r.hits.length).toBeGreaterThan(0);
    expect(r.hits.every((h) => h.doc.regimeShort === 'WSH SHMS' && h.doc.status !== 'sent')).toBe(true);
  });
  it('explains a hit per matched field', () => {
    expect(explain([{ field: 'vessel', term: 'ocean' }, { field: 'vessel', term: 'pioneer' }, { field: 'regime', term: 'ihm' }])).toBe('vessel: ocean pioneer · regime: ihm');
  });
  it('returns nothing for an unrelated query', () => {
    expect(search(docs, 'zebra crossing').hits).toHaveLength(0);
    expect(search(docs, '').hits).toHaveLength(0);
  });
  it('suggestions are drawn from the library', () => {
    expect(suggestions(docs)[0]).toBe('IHM declaration for MV Ocean Pioneer');
    expect(suggestions([])).toHaveLength(0);
  });
});
