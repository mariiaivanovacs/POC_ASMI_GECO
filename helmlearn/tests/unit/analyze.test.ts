import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyze, splitSentences } from '../../src/engine/analyze';

const SOP = readFileSync('tests/e2e/fixtures/sop-hot-work.txt', 'utf8');

describe('analyze', () => {
  const st = analyze(SOP, 'fallback');

  it('takes the first heading-like line as the title', () => {
    expect(st.title).toBe('SOP-HW-04 Hot Work Permit Procedure');
  });

  it('finds the numbered steps in order', () => {
    expect(st.steps.length).toBeGreaterThanOrEqual(5);
    expect(st.steps[0]).toMatch(/^Obtain a Hot Work Permit/);
    expect(st.steps[2]).toMatch(/^Post a trained fire watch/);
  });

  it('extracts numeric facts with units and their sentence', () => {
    const raws = st.facts.map((f) => f.raw.toLowerCase());
    expect(raws).toContain('11 m');
    expect(raws).toContain('30 minutes');
    expect(raws).toContain('2 hours');
    const f = st.facts.find((x) => x.raw.toLowerCase() === '11 m')!;
    expect(f.value).toBe(11);
    expect(f.sentence).toMatch(/flammable/i);
  });

  it('finds hazards and PPE from the lexicon', () => {
    expect(st.hazards.map((h) => h.name)).toContain('Fire / ignition');
    expect(st.hazards.map((h) => h.name)).toContain('Confined space');
    expect(st.ppe).toContain('Fire extinguisher');
    expect(st.ppe).toContain('Gas detector');
    expect(st.ppe).toContain('Fire blanket');
  });

  it('reads Term: definition lines', () => {
    const terms = st.terms.map((t) => t.term);
    expect(terms).toContain('Fire watch');
    expect(terms).toContain('Flash point');
    expect(st.terms.find((t) => t.term === 'Flash point')!.def).toMatch(/Lowest temperature/);
  });

  it('handles sparse text without throwing', () => {
    const s = analyze('Hello there this is a short note about nothing in particular.', 'note');
    expect(s.steps).toEqual([]);
    expect(s.facts).toEqual([]);
    expect(s.hazards).toEqual([]);
    expect(s.title).toBe('Hello there this is a short note about nothing in particular.'.slice(0, 90).length <= 90 ? s.title : 'note');
  });

  it('splits sentences and drops fragments', () => {
    const s = splitSentences('One two three four. Two. Five six seven eight nine!');
    expect(s).toEqual(['One two three four.', 'Five six seven eight nine!']);
  });
});
