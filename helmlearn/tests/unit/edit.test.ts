import { describe, expect, it } from 'vitest';
import { applyListOp, buildSave, mirrorStructure, validate, type Data } from '../../src/engine/edit';

const mcqEn: Data = { q: 'How long must the fan run first?', opts: ['15 min', '30 min', 'Until warm'], correct: 1, hint: 'Step 3', ok: 'Right', no: 'No' };
const mcqBm: Data = { q: 'Berapa lama kipas mesti dijalankan?', opts: ['15 minit', '30 minit', 'Sehingga panas'], correct: 1, hint: 'Langkah 3', ok: 'Betul', no: 'Tidak' };
const fillEn: Data = { title: 'Complete the rule', pre: 'Ventilate for', mid: 'and keep H2S below', post: '.', ans: ['30 minutes', '10 ppm'], tokens: ['30 minutes', '10 ppm', '5 minutes', '50 ppm'], hint: '', ok: 'ok', no: 'no' };
const fillZh: Data = { title: '补全规则', pre: '通风', mid: '并保持硫化氢低于', post: '。', ans: ['30 分钟', '10 ppm'], tokens: ['30 分钟', '10 ppm', '5 分钟', '50 ppm'], hint: '', ok: '对', no: '错' };

describe('task editor rules', () => {
  it('accepts a valid task and rejects missing pieces with readable reasons', () => {
    expect(validate('mcq', mcqEn, 'en').ok).toBe(true);
    expect(validate('mcq', { ...mcqEn, correct: -1 }, 'en').errors.join()).toMatch(/tick the correct option/);
    expect(validate('mcq', { ...mcqEn, opts: ['a', 'b'] }, 'en').errors.join()).toMatch(/at least 3/);
    expect(validate('mcq', { ...mcqEn, opts: ['a', '', 'c'] }, 'en').errors.join()).toMatch(/empty/);
    expect(validate('mcq', { ...mcqEn, opts: ['a', 'A', 'c'] }, 'en').errors.join()).toMatch(/duplicates/);
    expect(validate('fill', { ...fillEn, ans: ['30 minutes', '30 minutes'] }, 'en').errors.join()).toMatch(/different/);
    expect(validate('fill', { ...fillEn, ans: ['30 minutes', 'nope'] }, 'en').errors.join()).toMatch(/pick both answers/);
  });

  it('translations follow English: correct option and fill answers mirrored by position', () => {
    expect(mirrorStructure('mcq', { ...mcqEn, correct: 2 }, mcqBm).correct).toBe(2);
    const zh = mirrorStructure('fill', { ...fillEn, ans: ['5 minutes', '50 ppm'] }, fillZh);
    expect(zh.ans).toEqual(['5 分钟', '50 ppm']);
  });

  it('a list edit on English is applied to every language at the same position', () => {
    const moved = applyListOp('mcq', { en: mcqEn, bm: mcqBm }, 'opts', { kind: 'move', i: 1, d: -1 });
    expect(moved.en!.opts).toEqual(['30 min', '15 min', 'Until warm']);
    expect(moved.bm!.opts).toEqual(['30 minit', '15 minit', 'Sehingga panas']);
    expect(moved.en!.correct).toBe(0); // the tick follows the moved option
    const removed = applyListOp('mcq', { en: mcqEn, bm: mcqBm }, 'opts', { kind: 'remove', i: 1 });
    expect(removed.en!.correct).toBe(-1); // removing the correct option asks for a new tick
    const removedOther = applyListOp('mcq', { en: mcqEn, bm: mcqBm }, 'opts', { kind: 'remove', i: 0 });
    expect(removedOther.en!.correct).toBe(0);
    const added = applyListOp('mcq', { en: mcqEn, bm: mcqBm }, 'opts', { kind: 'add' });
    expect(added.bm!.opts).toHaveLength(4);
  });

  it('saving keeps good translations, drops stale ones with a reason, and never lets them block English', () => {
    const ok = buildSave('mcq', { title: 't', level: 'all', data: { en: { ...mcqEn, correct: 2 }, bm: mcqBm } });
    expect(ok.ok).toBe(true);
    expect((ok.i18n!.bm!.data as { correct: number }).correct).toBe(2);
    const added = applyListOp('mcq', { en: mcqEn, bm: mcqBm }, 'opts', { kind: 'add' });
    added.en!.opts = [...(added.en!.opts as string[]).slice(0, 3), 'Until the attendant says so'];
    const r = buildSave('mcq', { title: 't', level: 'all', data: added });
    expect(r.ok).toBe(true);
    expect(r.i18n!.bm).toBeUndefined();
    expect(r.dropped[0].lang).toBe('bm');
    expect(buildSave('mcq', { title: 't', level: 'all', data: { en: { ...mcqEn, q: '' } } }).ok).toBe(false);
  });
});
