import { describe, expect, it } from 'vitest';
import { makeSeal, sealPayload, sha256, shortHash, verifySeal } from '../../src/engine/signature';
import { seedTemplates } from '../../src/data/seed';
import { sampleValues } from '../../src/engine/template';

const ihm = seedTemplates(1_800_000_000_000)[0];
const PNG = 'data:image/png;base64,iVBORw0KGgo=';

describe('sha256', () => {
  it('matches the published test vectors', () => {
    expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(sha256('The quick brown fox jumps over the lazy dog')).toBe('d7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592');
    expect(sha256('a'.repeat(1000))).toBe('41edece42d63e8d9bf515a9ba6932e1c20cbc9f5a5d134645adb5db1b9737ea3');
  });
});

describe('the seal', () => {
  const values = sampleValues(ihm.fields);
  it('covers the template, the assembled content, the signer and the time', () => {
    const p = sealPayload(ihm, values, 'Rachel Tan, QA Manager', '2026-09-18T02:00:00.000Z');
    expect(p).toContain('t_ihm');
    expect(p).toContain('MV Ocean Pioneer');
    expect(p).toContain('Rachel Tan, QA Manager');
    expect(makeSeal(ihm, values, 'Rachel Tan', 'x')).toHaveLength(64);
  });
  it('is valid for the exact content and broken after any change', () => {
    const hash = makeSeal(ihm, values, 'Rachel Tan, QA Manager', '2026-09-18T02:00:00.000Z');
    const signature = { signatureId: 's1', png: PNG, signer: 'Rachel Tan, QA Manager', signedAt: '2026-09-18T02:00:00.000Z', hash };
    expect(verifySeal(ihm, { values, signature })).toBe('valid');
    expect(verifySeal(ihm, { values: { ...values, qty: '12.6 kg' }, signature })).toBe('broken');
    expect(verifySeal(ihm, { values, signature: { ...signature, signer: 'Someone Else' } })).toBe('broken');
    expect(verifySeal(ihm, { values, signature: null })).toBe('none');
    expect(verifySeal(null, { values, signature })).toBe('broken');
  });
  it('a change inside an omitted section does not break the seal (it was never part of the signed content)', () => {
    const noHaz = { ...values, haz_material_present: 'No' };
    const hash = makeSeal(ihm, noHaz, 'R', 't');
    expect(verifySeal(ihm, { values: { ...noHaz, qty: '999 kg' }, signature: { signatureId: 's', png: PNG, signer: 'R', signedAt: 't', hash } })).toBe('valid');
  });
  it('shortHash keeps the ends', () => { expect(shortHash('0123456789abcdef'.repeat(4))).toBe('01234567…cdef'); });
});
