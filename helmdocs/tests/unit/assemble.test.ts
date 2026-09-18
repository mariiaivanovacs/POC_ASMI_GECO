import { describe, expect, it } from 'vitest';
import { assemble, docFileName, evaluateRule, missingMandatory, precheck, signatoryOk } from '../../src/engine/assemble';
import { sampleValues } from '../../src/engine/template';
import { DEFAULT_SETTINGS, seedTemplates } from '../../src/data/seed';

const T = seedTemplates(1_800_000_000_000);
const ihm = T.find((t) => t.id === 't_ihm')!;
const full = () => sampleValues(ihm.fields);

describe('conditional logic', () => {
  it('includes Section 4 when haz_material_present = Yes and omits it when No', () => {
    const yes = assemble(ihm, full());
    const s4 = yes.sections.find((s) => s.section.heading.startsWith('4.'))!;
    expect(s4.included).toBe(true);
    expect(s4.rule.reason).toMatch(/Section 4 is INCLUDED because haz_material_present = Yes/);
    const no = assemble(ihm, { ...full(), haz_material_present: 'No' });
    const s4n = no.sections.find((s) => s.section.heading.startsWith('4.'))!;
    expect(s4n.included).toBe(false);
    expect(s4n.rule.reason).toMatch(/OMITTED because haz_material_present = No/);
    expect(no.text).not.toContain('HAZARDOUS MATERIALS DECLARED');
    expect(yes.text).toContain('HAZARDOUS MATERIALS DECLARED');
    expect(yes.included).toBe(no.included + 1);
  });
  it('an empty controlling value omits the section and says so', () => {
    const r = evaluateRule({ field: 'x', op: 'eq', value: 'Yes' }, {}, ihm.sections[4], ihm.fields);
    expect(r.included).toBe(false);
    expect(r.reason).toContain('x = (empty)');
  });
  it('fills pair and inline placeholders, marking blanks', () => {
    const a = assemble(ihm, { ...full(), vessel_name: '' });
    const s2 = a.sections.find((s) => s.section.heading.startsWith('2.'))!;
    expect(s2.lines[0]).toMatchObject({ kind: 'pair', label: 'Vessel name', value: '', missing: true });
    expect(s2.lines[1]).toMatchObject({ value: '9876543', missing: false });
  });
});

describe('pre-submission checks', () => {
  const sig = DEFAULT_SETTINGS.signatories;
  it('all pass on a complete declaration', () => {
    const c = precheck(ihm, full(), sig);
    expect(c.every((x) => x.ok)).toBe(true);
    expect(c.map((x) => x.id)).toEqual(['mandatory', 'imo', 'signatory', 'qty_s4', 'regime']);
  });
  it('invalid IMO checksum fails only the IMO check', () => {
    const c = precheck(ihm, { ...full(), imo_no: '9876544' }, sig);
    expect(c.find((x) => x.id === 'imo')!.ok).toBe(false);
    expect(c.find((x) => x.id === 'mandatory')!.ok).toBe(true);
  });
  it('an unauthorised signatory is named', () => {
    const c = precheck(ihm, { ...full(), auth_person: 'Nobody Here, Intern' }, sig);
    const s = c.find((x) => x.id === 'signatory')!;
    expect(s.ok).toBe(false);
    expect(s.detail).toContain('Nobody Here');
    expect(signatoryOk('rachel tan', sig)).toBe(true);
    expect(signatoryOk('', sig)).toBe(false);
  });
  it('quantity is required only while the hazardous section is included', () => {
    const missingQty = precheck(ihm, { ...full(), qty: '' }, sig);
    expect(missingQty.find((x) => x.id === 'qty_s4')!.ok).toBe(false);
    expect(missingQty.find((x) => x.id === 'mandatory')!.detail).toContain('Quantity');
    const noHaz = precheck(ihm, { ...full(), haz_material_present: 'No', qty: '', material: '', location_board: '', hkc_threshold: '' }, sig);
    expect(noHaz.find((x) => x.id === 'qty_s4')!.ok).toBe(true);
    expect(noHaz.find((x) => x.id === 'mandatory')!.ok).toBe(true);
    expect(missingMandatory(ihm, { ...full(), haz_material_present: 'No', qty: '' })).toHaveLength(0);
  });
  it('missing mandatory fields block export', () => {
    expect(missingMandatory(ihm, { ...full(), vessel_name: '' }).map((f) => f.key)).toEqual(['vessel_name']);
  });
  it('templates without an IMO field do not show an IMO check', () => {
    const shms = T.find((t) => t.id === 't_shms')!;
    expect(precheck(shms, sampleValues(shms.fields), sig).some((x) => x.id === 'imo')).toBe(false);
  });
});

describe('file names', () => {
  it('derive from regime, vessel and work order', () => {
    expect(docFileName(ihm, full(), 'pdf')).toBe('HKC-IHM_MV-Ocean-Pioneer_WO-2418.pdf');
  });
});
