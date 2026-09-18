import type { Doc, DocStatus, Settings, Template } from './types';
import { SEED_FORMS } from './forms';
import { detectFields } from '../engine/fields';
import { buildTemplate, sampleValues } from '../engine/template';
import { docFileName, docVessel } from '../engine/assemble';
import { aggregate, parseTable } from '../engine/data';
import { DEFAULT_DEADLINES } from '../engine/reminders';

export const COMPANY = 'Harbourline Marine Services Pte Ltd';
export const DEFAULT_SETTINGS: Settings = {
  signatories: ['Rachel Tan, QA Manager', 'Mohd Rahman, WSH Officer', 'Sean Lim, Yard Supervisor', 'Melissa Tan, HSE Admin', 'Jasmine Ng, Finance', 'Kelvin Wong, Safety Coordinator'],
  reviewer: 'Melissa Tan',
  signatures: [],
  deadlines: DEFAULT_DEADLINES,
};

const DAY = 86_400_000;
export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.getDate() + ' ' + ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getMonth()] + ' ' + d.getFullYear();
}

/** Seed templates are produced by the real engine over the demo forms — the detection log numbers are computed, not typed. */
export function seedTemplates(now = Date.now()): Template[] {
  return SEED_FORMS.map((f, i) => {
    const t0 = performance.now();
    const d = detectFields(f.text);
    const built = buildTemplate(d);
    const ms = Math.max(1, Math.round(performance.now() - t0));
    return {
      id: 't_' + f.id, name: f.name, regime: d.regime, regimeShort: d.regimeShort, ext: f.ext, pages: f.pages, sourceText: f.text,
      fields: built.fields, sections: built.sections,
      detection: { pages: f.pages, fieldsFound: d.fields.length, conditionalSections: d.conditionalSections, signatureBlocks: d.signatureBlocks, regime: d.regime, ms },
      manualMinutes: f.manualMinutes, createdAt: now - (60 - i * 3) * DAY, seeded: true,
    };
  });
}

interface DocSpec { t: string; days: number; status: DocStatus; by: string; minutes: number; ext?: string; set?: Record<string, string>; data?: { name: string; csv: string; bind: { key: string; column: string; fn: 'sum' | 'avg' | 'count' | 'min' | 'max' }[] } }

// Fictional activity for MV Ocean Pioneer, Sea Falcon 7 and the Tuas yard over the last month.
const DOCS: DocSpec[] = [
  { t: 'ihm', days: 0.2, status: 'draft', by: 'Rachel Tan', minutes: 4, set: { vessel_name: 'MV Ocean Pioneer', work_order_no: 'WO-2421', desc: 'Replacement of engine-room gaskets, unit 2', haz_material_present: 'No', material: '', qty: '', location_board: '', hkc_threshold: '' } },
  { t: 'ihm', days: 1, status: 'sent', by: 'Rachel Tan', minutes: 6, set: { vessel_name: 'MV Ocean Pioneer', work_order_no: 'WO-2418' } },
  { t: 'ihm', days: 3, status: 'reviewed', by: 'Kelvin Wong', minutes: 7, set: { vessel_name: 'Sea Falcon 7', imo_no: '9074729', work_order_no: 'WO-2396', desc: 'Insulation panel replacement, accommodation deck', material: 'Asbestos', qty: '3.2 kg', location_board: 'Accommodation deck B', hkc_threshold: '0.1 % (Table A)' } },
  { t: 'ihm', days: 5, status: 'sent', by: 'Kelvin Wong', minutes: 5, set: { vessel_name: 'Sea Falcon 7', imo_no: '9074729', work_order_no: 'WO-2411', desc: 'Cable tray renewal, main deck', material: 'Cadmium (Cd)', qty: '0.8 kg', location_board: 'Main deck, cable trays', hkc_threshold: '100 mg/kg (Table B)' } },
  { t: 'ihm', days: 12, status: 'sent', by: 'Rachel Tan', minutes: 8, set: { vessel_name: 'MV Ocean Pioneer', work_order_no: 'WO-2402', desc: 'Hydraulic hose replacement, deck crane', haz_material_present: 'No', material: '', qty: '', location_board: '', hkc_threshold: '' } },
  { t: 'shms', days: 2, status: 'reviewed', by: 'Mohd Rahman', minutes: 16, ext: 'docx' },
  { t: 'shms', days: 1, status: 'draft', by: 'Mohd Rahman', minutes: 9, ext: 'docx', set: { audit_ref: 'SHMS-2026-CAL', element: 'Corrective action log', evidence_attached: 'No', non_conformity_no: '', desc: '', corrective_action_owner: '', target_close_out_date: '' } },
  { t: 'shms', days: 21, status: 'sent', by: 'Mohd Rahman', minutes: 14, ext: 'docx', set: { audit_ref: 'SHMS-2026-Q2', audit_period: 'Q2 2026', element: 'Emergency preparedness', no_records: '9', element_score: '88 %', non_conformity_no: 'NC-05', desc: 'Muster list not updated after crew change', corrective_action_owner: 'Kelvin Wong, Safety Coordinator' } },
  { t: 'bizsafe', days: 0.5, status: 'draft', by: 'Sean Lim', minutes: 3, set: { work_order_no: 'WO-2420', activity: 'Confined space entry — tank cleaning', location: 'Tank 2, starboard', hazard: 'Oxygen deficiency', control_measures: 'Gas test every 2 h, attendant at manway, forced ventilation' } },
  { t: 'bizsafe', days: 2, status: 'sent', by: 'Rachel Tan', minutes: 5, set: { work_order_no: 'WO-2415' } },
  { t: 'bizsafe', days: 7, status: 'sent', by: 'Sean Lim', minutes: 6, set: { vessel_name: 'Sea Falcon 7', work_order_no: 'WO-2409', activity: 'Confined space entry — tank 4 inspection', location: 'Tank 4, port side', hazard: 'Toxic atmosphere from residual cargo', control_measures: 'Gas-free certificate, continuous monitoring, rescue team on standby' } },
  { t: 'bizsafe', days: 15, status: 'sent', by: 'Sean Lim', minutes: 4, set: { work_order_no: 'WO-2398', activity: 'Working at height — mast painting', location: 'Foremast', hazard: 'Fall from height', control_measures: 'Full-body harness, double lanyard, anchor points inspected', risk_level: 'High', residual_risk_level: 'Low' } },
  { t: 'wsh', days: 3, status: 'draft', by: 'Sean Lim', minutes: 7 },
  { t: 'wsh', days: 18, status: 'sent', by: 'Melissa Tan', minutes: 9, set: { incident_no: 'INC-0088', incident_class: 'First aid', desc: 'Minor cut to hand while handling steel plate', injured_person: 'Tan Wei Ming, Fitter', injury_sustained: 'Yes', days_medical_leave: '0 days', hospital: 'Yard first-aid post' } },
  { t: 'ptw', days: 0.3, status: 'reviewed', by: 'Sean Lim', minutes: 4, set: { permit_no: 'PTW-HW-0316', vessel_name: 'MV Ocean Pioneer', imo_no: '9876543', work_order_no: 'WO-2418', location: 'Hull, section 5' } },
  { t: 'ptw', days: 1, status: 'sent', by: 'Sean Lim', minutes: 3, set: { permit_no: 'PTW-HW-0315', vessel_name: 'MV Ocean Pioneer', imo_no: '9876543', work_order_no: 'WO-2418', location: 'Hull, section 4' } },
  { t: 'ptw', days: 6, status: 'sent', by: 'Kelvin Wong', minutes: 5, set: { permit_no: 'PTW-CS-0312', permit_type: 'Confined space entry', work_order_no: 'WO-2409', location: 'Tank 4, port side' } },
  { t: 'ptw', days: 7, status: 'sent', by: 'Sean Lim', minutes: 4 },
  { t: 'tiw', days: 4, status: 'reviewed', by: 'Mohd Rahman', minutes: 6 },
  { t: 'tiw', days: 26, status: 'sent', by: 'Mohd Rahman', minutes: 7, set: { consignment_no: 'CN-2026-0822', waste_type: 'Spent solvent', qty: '210 L', packaging: '1 × 210 L steel drum' } },
  { t: 'esg', days: 6, status: 'sent', by: 'Jasmine Ng', minutes: 22, ext: 'docx', data: {
    name: 'fuel-and-power-FY2025.csv',
    csv: 'month,diesel_litres,electricity_kwh,supplier\nJan 2025,7100 L,26800 kWh,Sinopec Marine\nFeb 2025,6650 L,25100 kWh,Sinopec Marine\nMar 2025,7300 L,27400 kWh,Sinopec Marine\nApr 2025,6900 L,26200 kWh,Sinopec Marine\nMay 2025,7250 L,26900 kWh,Sinopec Marine\nJun 2025,7050 L,25600 kWh,Sinopec Marine\nJul 2025,7400 L,27100 kWh,Sinopec Marine\nAug 2025,6800 L,25900 kWh,Sinopec Marine\nSep 2025,7000 L,25300 kWh,Sinopec Marine\nOct 2025,7150 L,26000 kWh,Sinopec Marine\nNov 2025,6700 L,24800 kWh,Sinopec Marine\nDec 2025,6900 L,25400 kWh,Sinopec Marine',
    bind: [{ key: 'diesel_consumed', column: 'diesel_litres', fn: 'sum' }, { key: 'electricity_consumed', column: 'electricity_kwh', fn: 'sum' }],
  } },
  { t: 'esg', days: 2, status: 'draft', by: 'Jasmine Ng', minutes: 11, ext: 'docx', set: { customer: 'Pacific Bulk Carriers Pte Ltd', scope_3_category: 'Cat 4 Upstream transport', total_emissions: '' } },
];

export function seedDocs(templates: Template[], now = Date.now()): Doc[] {
  return DOCS.map((s, i) => {
    const t = templates.find((x) => x.id === 't_' + s.t)!;
    const createdAt = now - s.days * DAY;
    const values = sampleValues(t.fields);
    for (const f of t.fields) if (f.type === 'date') values[f.key] = fmtDate(createdAt);
    const valid = t.fields.find((f) => f.key === 'valid_to' || f.key === 'review_date');
    if (valid) values[valid.key] = fmtDate(createdAt + (valid.key === 'review_date' ? 365 : 0) * DAY);
    Object.assign(values, s.set || {});
    const ext = s.ext || 'pdf';
    const attachments = s.data ? [parseTable(s.data.csv, s.data.name, 'a_seed_' + i)] : [];
    const bindings = s.data ? s.data.bind.map((b) => ({ key: b.key, attachmentId: attachments[0].id, column: b.column, fn: b.fn })) : [];
    for (const b of bindings) values[b.key] = aggregate(attachments[0], b.column, b.fn).text;
    // history: the draft as first created (signatory and one late field blank), then the review, then the send
    const blankKeys = t.fields.filter((f) => f.role === 'signatory' || f.type === 'number').map((f) => f.key);
    const v1: Record<string, string> = { ...values }; for (const k of blankKeys) v1[k] = '';
    const versions = [{ n: 1, at: createdAt, status: 'draft' as DocStatus, by: s.by, note: 'Draft created from template', values: v1 }];
    if (s.status !== 'draft') versions.push({ n: 2, at: createdAt + s.minutes * 60_000 + 20 * 60_000, status: 'reviewed' as DocStatus, by: 'Melissa Tan', note: 'Marked reviewed', values });
    if (s.status === 'sent') versions.push({ n: 3, at: createdAt + s.minutes * 60_000 + 55 * 60_000, status: 'sent' as DocStatus, by: s.by, note: 'Sent by email', values });
    return {
      id: 'd_' + String(i + 1).padStart(2, '0'), templateId: t.id, templateName: t.name, regimeShort: t.regimeShort,
      name: docFileName(t, values, ext), values, status: s.status, createdAt,
      reviewedAt: s.status !== 'draft' ? createdAt + s.minutes * 60_000 + 20 * 60_000 : null,
      sentAt: s.status === 'sent' ? createdAt + s.minutes * 60_000 + 55 * 60_000 : null,
      minutes: s.minutes, manualMinutes: t.manualMinutes, lastEditAt: createdAt + s.minutes * 60_000, by: s.by, vessel: docVessel(t, values), exports: s.status === 'sent' ? ['pdf', 'email'] : s.status === 'reviewed' ? ['pdf'] : [], attachments, bindings, signature: null, versions, seeded: true,
    };
  });
}

export function buildSeed(now = Date.now()) {
  const templates = seedTemplates(now);
  return { templates, docs: seedDocs(templates, now), seededAt: now };
}
