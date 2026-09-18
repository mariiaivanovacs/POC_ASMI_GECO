import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { analyze } from '../../src/engine/analyze';
import { generate } from '../../src/engine/generate';
import { buildPrompt, parseLLMResponse } from '../../src/engine/llm';

const SOP = readFileSync('tests/e2e/fixtures/sop-hot-work.txt', 'utf8');
const st = analyze(SOP);
const fallback = generate('m', st, 1).widgets;

const GOOD = {
  exercises: [
    { type: 'mcq', title: 'Clearance distance', step: 3, level: 'all', en: { q: 'Within what distance must flammables be cleared?', opts: ['5 m', '11 m', '20 m'], correct: 1, hint: 'step 3', ok: 'Yes', no: 'No' }, bm: { q: 'Berapa jauh?', opts: ['5 m', '11 m', '20 m'], correct: 1, hint: 'langkah 3', ok: 'Ya', no: 'Tidak' } },
    { type: 'seq', title: 'Order', step: 1, level: 'new', en: { title: 'Order the steps', items: ['a', 'b', 'c', 'd'], hint: '', ok: 'ok', no: 'no' } },
    { type: 'bogus', title: 'x', en: {} },
    { type: 'scen', title: 'broken', en: { title: 'no options here' } },
  ],
  widgets: { qaCaption: 'Numbers', qa: [['a?', '1'], ['b?', '2'], ['c?', '3']], audioCaption: 'PA', audioTranscript: 'All crew, muster now.', audio: ['Muster', 'Ignore', 'Wait'], audioCorrect: 0, cards: [['x', 'y'], ['p', 'q'], ['r', 's']], fill: { pre: 'Clear within', mid: 'and watch for', post: 'after.', ans: ['11 m', '30 minutes'], tokens: ['11 m', '30 minutes', '5 m'] } },
};

describe('DeepSeek response parsing', () => {
  it('keeps valid exercises, drops invalid ones, records languages', () => {
    const r = parseLLMResponse(JSON.stringify(GOOD), 'wah', fallback);
    expect(r.exercises).toHaveLength(2);
    expect(r.exercises[0].type).toBe('mcq');
    expect(r.exercises[0].stepIndex).toBe(2);
    expect(r.exercises[0].i18n.bm).toBeDefined();
    expect(r.langs.sort()).toEqual(['bm', 'en']);
    expect(r.widgets.qa[0][1]).toBe('1');
    expect(r.widgets.audioCorrect).toBe(0);
    expect(r.missing).toContain('photo');
  });

  it('tolerates a fenced JSON block and falls back to local widgets when the widget block is bad', () => {
    const r = parseLLMResponse('```json\n' + JSON.stringify({ exercises: GOOD.exercises, widgets: { qa: 'nope' } }) + '\n```', 'wah', fallback);
    expect(r.exercises).toHaveLength(2);
    expect(r.widgets.qa).toEqual(fallback.qa);
  });

  it('throws readable errors on garbage or empty output', () => {
    expect(() => parseLLMResponse('not json', 'wah', fallback)).toThrow(/invalid JSON/);
    expect(() => parseLLMResponse(JSON.stringify({ exercises: [] }), 'wah', fallback)).toThrow(/no usable exercises/);
  });

  it('builds a grounded prompt with the document and the schema', () => {
    const p = buildPrompt(SOP, st, true);
    expect(p.user).toContain('11 m (35 ft)');
    expect(p.user).toContain('"widgets"');
    expect(p.user).toContain('Bahasa Melayu');
    expect(buildPrompt(SOP, st, false).user).toContain('omit "bm" and "zh"');
  });
});
