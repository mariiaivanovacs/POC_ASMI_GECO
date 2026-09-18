import type { ComplianceRegime } from './types';

// Reference only — a starting point for a demo, not legal advice. Renewal intervals are typical
// examples to verify against your own SOP and the current regulation; they are not authoritative.
export const REGIMES: ComplianceRegime[] = [
  {
    id: 'wah', name: 'Working at Heights', authority: 'MOM / WSH Council',
    summary: 'Anyone working at height on a scaffold, ladder or elevated platform must complete WAH training before doing so unsupervised.',
    evidence: 'Signed training record: course name, date, trainer/assessor, pass result, and the worker’s ID.',
    renewalMonths: 24, renewalNote: 'Typical practice — confirm your current refresher interval.',
  },
  {
    id: 'confined', name: 'Confined Space Entry', authority: 'MOM',
    summary: 'Entrants, attendants and supervisors for confined-space work must be trained on entry permits, atmosphere testing and rescue procedure.',
    evidence: 'Training record per role (entrant / attendant / supervisor) plus the entry permit log.',
    renewalMonths: 24, renewalNote: 'Typical practice — confirm your current refresher interval.',
  },
  {
    id: 'hotwork', name: 'Hot Work / Permit-to-Work', authority: 'MOM (Shipbuilding & Ship-Repairing)',
    summary: 'Welding, cutting and grinding in a yard or on a vessel under repair requires permit-to-work competency and a trained fire watch.',
    evidence: 'Permit-to-work training record and, per job, the signed hot work permit.',
    renewalMonths: 12, renewalNote: 'Typical practice — many yards refresh annually.',
  },
  {
    id: 'cranes', name: 'Crane & Lifting Operations', authority: 'MOM / WSH Council',
    summary: 'Riggers, signalmen and crane operators need certified training before they may work a lift.',
    evidence: 'Certification record per role, tied to the certificate’s own validity period.',
    renewalMonths: 36, renewalNote: 'Certificate validity varies by issuing body — verify the actual expiry on the certificate.',
  },
  {
    id: 'bizsafe', name: 'bizSAFe', authority: 'WSH Council',
    summary: 'Risk-management training and certification for WSH officers and risk-management champions, cascaded onto contractors doing work for bizSAFe-certified principals.',
    evidence: 'bizSAFe level certificate plus the underlying risk-management training record.',
    renewalMonths: 24, renewalNote: 'Typical bizSAFe certification cycle — confirm the level held.',
  },
  {
    id: 'firstaid', name: 'Workplace First-Aid', authority: 'MOM',
    summary: 'A minimum number of trained first-aiders must be present based on headcount.',
    evidence: 'First-aider certification record from an approved provider.',
    renewalMonths: 24, renewalNote: 'Typical certifying-body cycle (2–3 years) — verify against the certificate.',
  },
  {
    id: 'shms', name: 'Safety & Health Management System — training evidence', authority: 'MOM (SHMS Audit)',
    summary: 'An SHMS audit checks for documented training records across the safety programme, not a single course.',
    evidence: 'A current training record for every safety-critical role, available for audit sampling.',
    renewalMonths: 12, renewalNote: 'Tracks the annual audit cycle, not a single certificate expiry.',
  },
  {
    id: 'ihm', name: 'Hazardous Materials (IHM) Handling', authority: 'IMO / Hong Kong Convention',
    summary: 'Personnel who add, remove or handle materials on a ship’s Inventory of Hazardous Materials during repair need IHM-maintenance training.',
    evidence: 'IHM-maintenance training record, referenced against the job’s Material Declaration.',
    renewalMonths: 36, renewalNote: 'Verify against your class society’s current guidance.',
  },
  {
    id: 'igf', name: 'IGF Code Familiarisation (LNG bunkering)', authority: 'IMO / STCW',
    summary: 'Crew and yard personnel working on or around gas-fuelled vessels need IGF Code familiarisation training.',
    evidence: 'STCW-aligned familiarisation training record.',
    renewalMonths: 60, renewalNote: 'Follows the STCW refresher cycle — verify against current STCW requirements.',
  },
];

export const regimeById = (id: string): ComplianceRegime | undefined => REGIMES.find((r) => r.id === id);

// Which seed materials count toward which regimes.
export const MATERIAL_COMPLIANCE: Record<string, string[]> = {
  hw: ['hotwork', 'shms'],
  erp: ['shms'],
  rig: ['cranes', 'bizsafe'],
  wah: ['wah'],
  lng: ['igf'],
  eng: [],
};
