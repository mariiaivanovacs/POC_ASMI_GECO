import { describe, expect, it } from 'vitest';
import { detectFields, detectRegime, imoValid, inferType, isCode, isDate, isQuantity, keyFor } from '../../src/engine/fields';
import { SEED_FORMS } from '../../src/data/forms';

describe('validators', () => {
  it('IMO checksum: 7 digits, weighted sum mod 10 equals the check digit', () => {
    expect(imoValid('9876543')).toBe(true);
    expect(imoValid('9074729')).toBe(true);
    expect(imoValid('IMO 9074729')).toBe(true);
    expect(imoValid('9876544')).toBe(false);
    expect(imoValid('1234568')).toBe(false);
    expect(imoValid('987654')).toBe(false);
    expect(imoValid('')).toBe(false);
  });
  it('dates, codes and quantities', () => {
    expect(isDate('17 Sep 2026')).toBe(true);
    expect(isDate('2026-09-17')).toBe(true);
    expect(isDate('17/09/2026')).toBe(true);
    expect(isDate('September')).toBe(false);
    expect(isCode('WO-2418')).toBe(true);
    expect(isCode('PTW-HW-0311')).toBe(true);
    expect(isCode('PERMIT-TO-WORK')).toBe(false);
    expect(isQuantity('12.5 kg')).toBe(true);
    expect(isQuantity('84,200 L')).toBe(true);
    expect(isQuantity('9876543')).toBe(false);
  });
  it('keys are stable slugs', () => {
    expect(keyFor('Work order no.')).toBe('work_order_no');
    expect(keyFor('Hazardous material present (HKC Appendix 1 / 2)')).toBe('haz_material_present');
    expect(keyFor('Valid to')).toBe('valid_to');
    expect(keyFor('Date of work')).toBe('date_work');
  });
});

describe('type inference', () => {
  it('maps values to the six field types', () => {
    expect(inferType('IMO number', '9876543')).toMatchObject({ type: 'id', role: 'imo', confidence: 97 });
    expect(inferType('IMO number', '1234568').confidence).toBeLessThan(80);
    expect(inferType('Date of work', '17 Sep 2026').type).toBe('date');
    expect(inferType('Hazardous material present', 'Yes')).toMatchObject({ type: 'yesno', options: ['Yes', 'No'] });
    expect(inferType('Material (HKC list)', 'Lead (Pb)')).toMatchObject({ type: 'list', role: 'material' });
    expect(inferType('Quantity', '12.5 kg')).toMatchObject({ type: 'number', role: 'quantity' });
    expect(inferType('Work order no.', 'WO-2418')).toMatchObject({ type: 'id', role: 'workorder' });
    expect(inferType('Vessel name', 'MV Ocean Pioneer')).toMatchObject({ type: 'text', role: 'vessel' });
    expect(inferType('Authorised person', 'Rachel Tan, QA Manager').role).toBe('signatory');
    expect(inferType('Auditor', 'Mohd Rahman, WSH Officer').type).toBe('text');
  });
  it('blank values in an empty form still get a type from the label', () => {
    expect(inferType('Vessel name', '______').type).toBe('text');
    expect(inferType('Date', '').type).toBe('date');
    expect(inferType('Quantity', '').type).toBe('number');
  });
});

describe('detectFields on the IHM declaration', () => {
  const ihm = SEED_FORMS.find((f) => f.id === 'ihm')!;
  const d = detectFields(ihm.text);
  it('finds the vessel, IMO, work order, dates, quantity, material, company and signatory', () => {
    const keys = d.fields.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['company', 'vessel_name', 'imo_no', 'work_order_no', 'date_work', 'haz_material_present', 'material', 'qty', 'auth_person']));
    expect(d.fields.find((f) => f.key === 'imo_no')!.sample).toBe('9876543');
    expect(d.fields.find((f) => f.key === 'auth_person')!.role).toBe('signatory');
    for (const f of d.fields) { expect(f.confidence).toBeGreaterThanOrEqual(60); expect(f.confidence).toBeLessThanOrEqual(99); }
  });
  it('marks Section 4 conditional on the Yes/No field and counts one signature block', () => {
    const s4 = d.sections.find((s) => s.heading.startsWith('4.'))!;
    expect(s4.rule).toEqual({ field: 'haz_material_present', op: 'eq', value: 'Yes' });
    expect(d.conditionalSections).toBe(1);
    expect(d.signatureBlocks).toBe(1);
    expect(d.sections.find((s) => s.heading.startsWith('5.'))!.signature).toBe(true);
  });
  it('recognises the regime and the title', () => {
    expect(d.regimeShort).toBe('HKC / IHM');
    expect(d.title).toBe("SUPPLIER'S DECLARATION OF CONFORMITY");
    expect(d.sections[0].title).toBe(true);
  });
  it('does not turn the form revision code into a field', () => {
    expect(d.fields.some((f) => f.sample === 'SDoC-01')).toBe(false);
  });
});

describe('detectFields across every seed form', () => {
  it('every demo form yields fields, a regime and a signature block', () => {
    for (const f of SEED_FORMS) {
      const d = detectFields(f.text);
      expect(d.fields.length, f.id).toBeGreaterThanOrEqual(8);
      expect(d.regimeShort, f.id).not.toBe('Unclassified');
      expect(d.signatureBlocks, f.id).toBe(1);
      expect(new Set(d.fields.map((x) => x.key)).size).toBe(d.fields.length);
    }
  });
  it('is deterministic', () => {
    const a = JSON.stringify(detectFields(SEED_FORMS[1].text));
    const b = JSON.stringify(detectFields(SEED_FORMS[1].text));
    expect(a).toBe(b);
  });
});

describe('edge cases', () => {
  it('prose with no labelled lines yields no fields and no regime', () => {
    const d = detectFields('This is a short memo about lunch arrangements.\nPlease bring your own cutlery.\nThanks.');
    expect(d.fields).toHaveLength(0);
    expect(d.conditionalSections).toBe(0);
    expect(d.regimeShort).toBe('Unclassified');
  });
  it('bare IMO numbers and work orders inside prose become low-confidence fields', () => {
    const d = detectFields('Work carried out on IMO 9074729 under WO-2409 on 10 Sep 2026.');
    expect(d.fields.map((f) => f.key).sort()).toEqual(['date', 'imo_no', 'work_order_no']);
    expect(d.fields.every((f) => f.confidence < 90 && !f.required)).toBe(true);
    expect(d.sections[0].lines[0]).toEqual({ kind: 'text', text: 'Work carried out on IMO {{imo_no}} under {{work_order_no}} on {{date}}.' });
  });
  it('an invalid bare IMO is ignored', () => {
    expect(detectFields('Vessel IMO 1234568 alongside.').fields).toHaveLength(0);
  });
  it('two different dates become two fields', () => {
    const d = detectFields('Issue date: 1 Sep 2026\nExpiry date: 1 Sep 2027');
    expect(d.fields.map((f) => f.key)).toEqual(['issue_date', 'expiry_date']);
  });
  it('pipe tables are kept as literal tables', () => {
    const d = detectFields('1. ITEMS\n| Item | Qty |\n|---|---|\n| Gasket | 4 |');
    expect(d.sections[0].table).toEqual({ cols: ['Item', 'Qty'], rows: [['Gasket', '4']] });
  });
  it('regime detection picks the strongest match', () => {
    expect(detectRegime('bizSAFE Level 3 risk assessment').short).toBe('bizSAFE');
    expect(detectRegime('nothing here').short).toBe('Unclassified');
  });
});
