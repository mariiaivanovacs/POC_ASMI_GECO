import { describe, expect, it } from 'vitest';
import type { Field } from '../../src/data/types';
import { carryValues } from '../../src/engine/template';

const f = (key: string, label: string, role: Field['role'] = 'other', type: Field['type'] = 'text'): Field => ({ key, label, role, type, confidence: 90, required: true, sample: '', source: '' });

describe('carryValues — switching a document to another template', () => {
  const from = [f('vessel_name', 'Vessel name', 'vessel'), f('imo_no', 'IMO number', 'imo', 'id'), f('wo', 'Work order no.', 'workorder', 'id'), f('haz', 'Hazardous material present', 'yesno', 'yesno'), f('desc', 'Description of work')];
  const values = { vessel_name: 'MV Pacific Dawn', imo_no: '9321483', wo: 'WO-1', haz: 'Yes', desc: 'Pump overhaul' };

  it('carries by role, label and similar label; leaves the rest to fill', () => {
    const to = [f('vessel', 'Ship', 'vessel'), f('imo', 'IMO', 'imo', 'id'), f('work_order', 'Work order', 'workorder', 'id'), f('work_desc', 'Work description'), f('incident_date', 'Incident date', 'date', 'date')];
    const r = carryValues(from, values, to);
    expect(r.values.vessel).toBe('MV Pacific Dawn');
    expect(r.values.imo).toBe('9321483');
    expect(r.values.work_order).toBe('WO-1');
    expect(r.values.work_desc).toBe('Pump overhaul');
    expect(r.toFill.map((x) => x.key)).toEqual(['incident_date']);
  });

  it('keeps old values in the bag so switching back restores them', () => {
    const to = [f('vessel', 'Ship', 'vessel')];
    const r = carryValues(from, values, to);
    expect(r.values.desc).toBe('Pump overhaul');
    const back = carryValues(to, r.values, from);
    expect(back.values.desc).toBe('Pump overhaul');
    expect(back.toFill).toHaveLength(0);
  });

  it('never puts free text into a Yes/No field', () => {
    const to = [f('haz2', 'Hazardous material present', 'yesno', 'yesno')];
    expect(carryValues(from, { ...values, haz: 'maybe' }, to).values.haz2).toBe('');
  });
});

describe('carryValues — ambiguous roles', () => {
  it('does not pour a work-order number into every reference-code field', () => {
    const from = [f('work_order_no', 'Work order no.', 'workorder', 'id')];
    const to = [f('permit_no', 'Permit no.', 'workorder', 'id'), f('work_order_no2', 'Work order no.', 'workorder', 'id'), f('gas_cert', 'Gas-free certificate no.', 'workorder', 'id')];
    const r = carryValues(from, { work_order_no: 'WO-7' }, to);
    expect(r.values.permit_no).toBe('');
    expect(r.values.gas_cert).toBe('');
    expect(r.values.work_order_no2).toBe('WO-7');
  });
  it('does not copy one signatory into several signatory fields', () => {
    const from = [f('auth', 'Authorised person', 'signatory')];
    const to = [f('holder', 'Permit holder', 'signatory'), f('issuer', 'Permit issuer', 'signatory')];
    const r = carryValues(from, { auth: 'Rachel Tan' }, to);
    expect(r.values.holder).toBe('');
    expect(r.values.issuer).toBe('');
  });
});
