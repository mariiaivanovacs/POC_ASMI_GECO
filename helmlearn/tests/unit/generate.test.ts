import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyze } from '../../src/engine/analyze';
import { ALL_TYPES, generate } from '../../src/engine/generate';

const SOP = readFileSync('tests/e2e/fixtures/sop-hot-work.txt', 'utf8');

describe('generate', () => {
  const st = analyze(SOP);
  const r = generate('m1', st, 42);

  it('drafts every exercise type from a rich SOP', () => {
    for (const t of ALL_TYPES) {
      expect(r.exercises.some((e) => e.type === t), 'missing type ' + t).toBe(true);
    }
    expect(r.missing).toEqual([]);
  });

  it('mcq options contain exactly one correct answer taken from the document', () => {
    const mcq = r.exercises.filter((e) => e.type === 'mcq');
    expect(mcq.length).toBeGreaterThan(0);
    for (const e of mcq) {
      const d = e.i18n.en.data as { opts: string[]; correct: number; q: string };
      expect(d.correct).toBeGreaterThanOrEqual(0);
      expect(d.correct).toBeLessThan(d.opts.length);
      expect(new Set(d.opts).size).toBe(d.opts.length);
      expect(d.q).toContain('_____');
    }
  });

  it('sequence keeps the document order as the answer', () => {
    const seq = r.exercises.find((e) => e.type === 'seq')!;
    const d = seq.i18n.en.data as { items: string[] };
    expect(d.items[0]).toMatch(/^Obtain/);
    expect(d.items[1]).toMatch(/^Remove/);
  });

  it('is deterministic for the same seed and different for another seed', () => {
    const a = generate('m1', st, 7);
    const b = generate('m1', st, 7);
    const c = generate('m1', st, 8);
    expect(JSON.stringify(a.exercises)).toBe(JSON.stringify(b.exercises));
    const mA = a.exercises.find((e) => e.type === 'mcq')!.i18n.en.data as { opts: string[]; correct: number };
    const mC = c.exercises.find((e) => e.type === 'mcq')!.i18n.en.data as { opts: string[]; correct: number };
    expect(mA.opts[mA.correct]).toBe(mC.opts[mC.correct]);
    expect(JSON.stringify(a.exercises)).not.toBe(JSON.stringify(c.exercises));
  });

  it('reports missing types on sparse text instead of failing', () => {
    const sparse = analyze('Hello there this is a short note about nothing in particular.', 'note');
    const s = generate('m2', sparse, 1);
    expect(s.exercises).toEqual([]);
    expect(s.missing).toEqual(ALL_TYPES);
    expect(s.widgets.fill.ans[0]).toBe('not available');
  });

  it('builds the materials-page widgets from facts and terms', () => {
    expect(r.widgets.qa.length).toBe(3);
    expect(r.widgets.cards.length).toBe(3);
    expect(r.widgets.audio.length).toBe(3);
    expect(r.widgets.audio[r.widgets.audioCorrect]).toMatch(/^Obtain/);
    expect(r.widgets.fill.tokens).toContain(r.widgets.fill.ans[0]);
  });

  it('can regenerate a single type', () => {
    const only = generate('m1', st, 3, 'scen');
    expect(only.exercises.every((e) => e.type === 'scen')).toBe(true);
    expect(only.exercises.length).toBeGreaterThan(0);
  });
});

describe('flashcards and fill-the-blank as playable tasks', () => {
  const st = analyze(readFileSync('tests/e2e/fixtures/sop-hot-work.txt', 'utf8'));
  const r = generate('m2', st, 7);

  it('drafts a flashcard task whose cards match the flashcard widget, and a fill task whose answers are in its tokens', () => {
    const cards = r.exercises.find((e) => e.type === 'cards');
    expect(cards).toBeTruthy();
    expect(cards!.i18n.en.type).toBe('cards');
    if (cards!.i18n.en.type === 'cards') {
      expect(cards!.i18n.en.data.cards.length).toBeGreaterThanOrEqual(3);
      expect(cards!.i18n.en.data.cards).toEqual(r.widgets.cards);
    }
    const fill = r.exercises.find((e) => e.type === 'fill');
    expect(fill).toBeTruthy();
    if (fill!.i18n.en.type === 'fill') {
      const d = fill!.i18n.en.data;
      expect(d.tokens).toEqual(expect.arrayContaining(d.ans));
      expect(d.ans[0]).not.toBe('not available');
    }
    expect(r.exercises.filter((e) => e.type === 'cards' || e.type === 'fill').every((e) => e.generated && e.reviewStatus === 'draft')).toBe(true);
  });

  it('skips fill when the text has fewer than two numeric facts instead of drafting a placeholder', () => {
    const thin = analyze('Welcome to the yard. Report to your supervisor before you start. Keep walkways clear and wear your helmet at all times.');
    const g = generate('m3', thin, 1);
    expect(g.exercises.some((e) => e.type === 'fill')).toBe(false);
    expect(g.missing).toContain('fill');
  });
});
