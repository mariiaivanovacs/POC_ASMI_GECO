import { describe, expect, it } from 'vitest';
import { detectFields } from '../../src/engine/fields';
import { addFieldFromSelection, buildTemplate, deleteField, renameField, renderLine, retypeField, sampleValues, signatureFields, templateStats } from '../../src/engine/template';
import { seedTemplates } from '../../src/data/seed';
import { SEED_FORMS } from '../../src/data/forms';

const ihm = () => buildTemplate(detectFields(SEED_FORMS[0].text));

describe('template', () => {
  it('rename moves the merge key everywhere, including the conditional rule', () => {
    const t = ihm();
    const r = renameField(t.fields, t.sections, 'haz_material_present', 'Hazmat present');
    expect(r.fields.find((f) => f.label === 'Hazmat present')!.key).toBe('hazmat_present');
    expect(r.fields.some((f) => f.key === 'haz_material_present')).toBe(false);
    const s4 = r.sections.find((s) => s.heading.startsWith('4.'))!;
    expect(s4.rule!.field).toBe('hazmat_present');
    expect(r.sections.find((s) => s.heading.startsWith('3.'))!.lines.some((l) => l.kind === 'pair' && l.key === 'hazmat_present')).toBe(true);
  });
  it('rename to a label whose key already exists gets a suffix', () => {
    const t = ihm();
    const r = renameField(t.fields, t.sections, 'date', 'Date of work');
    expect(r.fields.find((f) => f.sample === '17 Sep 2026' && f.key !== 'date_work')!.key).toBe('date_work_2');
  });
  it('retype to Yes-No / List gives options', () => {
    const t = ihm();
    expect(retypeField(t.fields, 'location_board', 'yesno').find((f) => f.key === 'location_board')!.options).toEqual(['Yes', 'No']);
    expect(retypeField(t.fields, 'hkc_threshold', 'list').find((f) => f.key === 'hkc_threshold')!.options).toEqual(['1,000 mg/kg (Table A)']);
    expect(retypeField(t.fields, 'qty', 'text').find((f) => f.key === 'qty')!.options).toBeUndefined();
  });
  it('delete restores the literal text and drops rules that depended on the field', () => {
    const t = ihm();
    const r = deleteField(t.fields, t.sections, 'haz_material_present');
    expect(r.fields.some((f) => f.key === 'haz_material_present')).toBe(false);
    expect(r.sections.find((s) => s.heading.startsWith('4.'))!.rule).toBeNull();
    const s3 = r.sections.find((s) => s.heading.startsWith('3.'))!;
    expect(s3.lines).toContainEqual({ kind: 'text', text: 'Hazardous material present (HKC Appendix 1 / 2): Yes' });
  });
  it('renders lines with values or blanks', () => {
    const t = ihm();
    expect(renderLine({ kind: 'pair', key: 'vessel_name' }, t.fields, sampleValues(t.fields))).toBe('Vessel name: MV Ocean Pioneer');
    expect(renderLine({ kind: 'pair', key: 'vessel_name' }, t.fields, {})).toBe('Vessel name: ______');
  });
  it('seed templates come out of the real engine with computed logs', () => {
    const ts = seedTemplates(1_800_000_000_000);
    expect(ts).toHaveLength(7);
    for (const t of ts) {
      expect(t.detection.fieldsFound).toBe(t.fields.length);
      expect(templateStats(t).fields).toBeGreaterThanOrEqual(8);
      expect(t.detection.signatureBlocks).toBe(1);
    }
    expect(ts.find((t) => t.id === 't_ihm')!.detection.conditionalSections).toBe(1);
    expect(ts.map((t) => t.regimeShort)).toEqual(['HKC / IHM', 'WSH SHMS', 'bizSAFE', 'WSH Incident', 'PTW', 'NEA TIW', 'ESG / Scope 3']);
  });
});

describe('fields from a selection and signature blocks', () => {
  it('turns selected prose into a merge field and keeps the text as the sample', () => {
    const t = ihm();
    const s5 = t.sections.find((s) => s.heading.startsWith('5.'))!;
    const li = s5.lines.findIndex((l) => l.kind === 'text' && l.text.startsWith('The supplier declares'));
    const r = addFieldFromSelection(t.fields, t.sections, s5.id, li, 'complete and accurate', 'Accuracy statement');
    expect(r.field).toMatchObject({ key: 'accuracy_statement', sample: 'complete and accurate', manual: true, confidence: 100 });
    const line = r.sections.find((s) => s.id === s5.id)!.lines[li] as { kind: 'text'; text: string };
    expect(line.text).toContain('is {{accuracy_statement}} to the best');
    expect(r.fields).toHaveLength(t.fields.length + 1);
  });
  it('refuses selections inside an existing field, on pair lines, or without a name', () => {
    const t = ihm();
    const s2 = t.sections.find((s) => s.heading.startsWith('2.'))!;
    expect(addFieldFromSelection(t.fields, t.sections, s2.id, 0, 'MV Ocean', 'Ship').error).toMatch(/already the value/);
    const s5 = t.sections.find((s) => s.heading.startsWith('5.'))!;
    const li = s5.lines.findIndex((l) => l.kind === 'text' && l.text.startsWith('The supplier'));
    expect(addFieldFromSelection(t.fields, t.sections, s5.id, li, 'not in the line', 'X').error).toMatch(/not already part/);
    expect(addFieldFromSelection(t.fields, t.sections, s5.id, li, 'complete', '').error).toMatch(/name/);
    expect(addFieldFromSelection(t.fields, t.sections, 'nope', 0, 'a', 'b').error).toMatch(/no longer/);
  });
  it('identifies who signs and the signing date in the signature block', () => {
    const t = ihm();
    const blocks = signatureFields(t.fields, t.sections);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].section.heading).toMatch(/^5\./);
    expect(blocks[0].signatory?.key).toBe('auth_person');
    expect(blocks[0].date?.key).toBe('date');
  });
});
