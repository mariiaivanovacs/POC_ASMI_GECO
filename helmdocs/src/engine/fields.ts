import type { Field, FieldType, Line, Role, Rule, Section, Table } from '../data/types';

// ---------------------------------------------------------------------------
// Marine lexicon — list-type fields get their options from the matched group.
// ---------------------------------------------------------------------------
export const LEXICON: { group: string; role: Role; options: string[]; labelHint: RegExp }[] = [
  {
    group: 'HKC hazardous materials', role: 'material', labelHint: /material|substance|hazard/i,
    options: ['Asbestos', 'Lead (Pb)', 'Polychlorinated biphenyls (PCB)', 'Organotin compounds (TBT)', 'Cadmium (Cd)', 'Mercury (Hg)', 'Hexavalent chromium (Cr VI)', 'Ozone-depleting substances (ODS)', 'Polybrominated biphenyls (PBB)', 'Polybrominated diphenyl ethers (PBDE)', 'Radioactive substances', 'Perfluorooctane sulfonic acid (PFOS)', 'HBCDD'],
  },
  {
    group: 'Permit types', role: 'other', labelHint: /permit|work type|type of work/i,
    options: ['Hot work', 'Confined space entry', 'Working at height', 'Electrical isolation', 'Lifting operation', 'Painting / blasting'],
  },
  {
    group: 'Toxic industrial waste', role: 'material', labelHint: /waste|residue/i,
    options: ['Paint residue', 'Spent solvent', 'Oily rags', 'Used lubricating oil', 'Blasting grit', 'Contaminated PPE', 'Oily bilge water'],
  },
  {
    group: 'Incident classes', role: 'other', labelHint: /incident|injury|classification|class/i,
    options: ['Near miss', 'First aid', 'Medical treatment', 'Lost-time injury', 'Dangerous occurrence', 'Occupational disease'],
  },
  {
    group: 'Risk levels', role: 'other', labelHint: /risk|severity|likelihood|rating/i,
    options: ['Low', 'Medium', 'High'],
  },
  {
    group: 'Departments', role: 'other', labelHint: /department|trade|section/i,
    options: ['Hull & coatings', 'Mechanical', 'Electrical', 'Piping', 'Scaffolding', 'QA / HSE', 'Office'],
  },
  {
    group: 'Scope 3 categories', role: 'other', labelHint: /scope|category/i,
    options: ['Cat 1 Purchased goods & services', 'Cat 4 Upstream transport', 'Cat 5 Waste', 'Cat 6 Business travel', 'Cat 7 Employee commuting'],
  },
];

export const REGIMES: { test: RegExp; name: string; short: string }[] = [
  { test: /MEPC\.?\s?269|Hong Kong Convention|Inventory of Hazardous Materials|\bIHM\b|Declaration of Conformity/i, name: 'Hong Kong Convention · IMO MEPC.269(68) · IHM', short: 'HKC / IHM' },
  { test: /\bSHMS\b|Safety and Health Management System/i, name: 'WSH (Safety and Health Management System) Regulations · MOM', short: 'WSH SHMS' },
  { test: /bizSAFE/i, name: 'WSH Council · bizSAFE Level 3 / 4', short: 'bizSAFE' },
  { test: /incident report|iReport|Incident Reporting/i, name: 'WSH (Incident Reporting) Regulations · MOM iReport', short: 'WSH Incident' },
  { test: /permit[- ]to[- ]work|hot work permit|confined space/i, name: 'WSH (Shipbuilding and Ship-repairing) Regulations · Permit-to-Work', short: 'PTW' },
  { test: /toxic industrial waste|consignment note|EPMA|e-Tracking/i, name: 'Environmental Protection and Management Act · NEA e-Tracking', short: 'NEA TIW' },
  { test: /scope 3|\bESG\b|ISSB|SGX RegCo|greenhouse gas/i, name: 'SGX RegCo · ISSB-aligned climate reporting · Scope 3', short: 'ESG / Scope 3' },
];

// ---------------------------------------------------------------------------
// Value validators
// ---------------------------------------------------------------------------
export function imoValid(v: string): boolean {
  const d = v.replace(/^\s*IMO\s*/i, '').trim();
  if (!/^\d{7}$/.test(d)) return false;
  let sum = 0;
  for (let i = 0; i < 6; i++) sum += parseInt(d[i]) * (7 - i);
  return sum % 10 === parseInt(d[6]);
}

const MONTHS = 'jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec';
export const DATE_RE = new RegExp('\\b(\\d{1,2}\\s+(?:' + MONTHS + ')[a-z]*\\.?\\s+\\d{4}|\\d{4}-\\d{2}-\\d{2}|\\d{1,2}[/.]\\d{1,2}[/.]\\d{2,4})\\b', 'i');
export const CODE_RE = /\b([A-Z]{2,6}(?:-[A-Z0-9]{1,6}){1,3})\b/;
export const IMO_RE = /\b(?:IMO\s*)?(\d{7})\b/i;
export const QTY_RE = /^([\d,]+(?:\.\d+)?)\s*(kg|g|t|tonnes?|L|litres?|m³|m3|m²|m2|m|mm|pcs|units?|hrs?|hours?|days?|%|mg\/kg|ppm|kWh|MWh|tCO2e|kgCO2e)?$/i;

export function isDate(v: string): boolean { return DATE_RE.test(v) && v.replace(DATE_RE, '').trim().length === 0; }
export function isYesNo(v: string): boolean { return /^(yes|no|y|n)$/i.test(v.trim()); }
export function isCode(v: string): boolean { return /\d/.test(v) && CODE_RE.test(v) && v.replace(CODE_RE, '').trim().length === 0; }
export function isQuantity(v: string): boolean { return QTY_RE.test(v.trim()) && !/^\d{7}$/.test(v.trim()); }

// ---------------------------------------------------------------------------
// Keys and labels
// ---------------------------------------------------------------------------
const ABBREV: Record<string, string> = { hazardous: 'haz', number: 'no', quantity: 'qty', description: 'desc', reference: 'ref', authorised: 'auth', authorized: 'auth' };
const KEY_STOP = new Set(['of', 'the', 'on', 'a', 'an', 'and', 'or', 'in', 'for', 'to', 'at', 'by']);

export function keyFor(label: string): string {
  const all = label.toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
  const words = (all.length <= 2 ? all : all.filter((w) => !KEY_STOP.has(w))).map((w) => ABBREV[w] || w);
  return (words.slice(0, 4).join('_') || 'field').replace(/^\d/, 'f$&');
}

const ROLE_RULES: [RegExp, Role][] = [
  [/\bIMO\b/i, 'imo'],
  [/vessel|ship name|\bship\b|craft/i, 'vessel'],
  [/work order|job (no|number|order)|\bWO\b|permit no|report no|incident no|consignment no|reference no|ref\.? no/i, 'workorder'],
  [/\bdate\b|valid (from|to|until)|expiry/i, 'date'],
  [/quantity|\bqty\b|amount|volume|weight|mass|litres|tonnes|hours|headcount|number of/i, 'quantity'],
  [/material|substance|waste type|product/i, 'material'],
  [/company|supplier|contractor|customer|organisation|organization|yard|employer/i, 'company'],
  [/authori[sz]ed (person|signatory|by)|signatory|signed by|prepared by|approved by|reviewed by|verified by|reported by|declared by|contact person|responsible person|supervisor|permit issuer|permit holder|assessor|auditor/i, 'signatory'],
];

const LABEL_STOP = /^(note|notes|remark|remarks|instruction|instructions|warning|caution|see|e\.?g|tel|fax|http|https|www|page|form|rev|revision|ref|title)$/i;
const SIGNATURE_RE = /^(signature|signed|signed by|name (and|&) signature|stamp|company stamp|initials)\b/i;
const UNDERSCORES = /_{3,}/;
const CONDITIONAL_HINT = /\(?\b(if applicable|if yes|only if|where applicable|when applicable|if any)\b\)?/i;

function roleFor(label: string, value: string): Role {
  for (const [re, role] of ROLE_RULES) if (re.test(label)) return role;
  if (isYesNo(value)) return 'yesno';
  if (value && imoValid(value)) return 'imo';
  return 'other';
}

function lexiconFor(label: string, value: string) {
  const v = value.toLowerCase();
  const short = v.split(/\s+/).length <= 5;
  for (const g of LEXICON) if (short && g.options.some((o) => new RegExp('\\b' + o.toLowerCase().split(' (')[0].replace(/[^a-z0-9 ]/g, '') + '\\b').test(v.replace(/[^a-z0-9 ]/g, ' ')))) return g;
  for (const g of LEXICON) if (g.labelHint.test(label) && /\b(type|category|class|list|level|rating|department)\b/i.test(label)) return g;
  return null;
}

interface Typed { type: FieldType; options?: string[]; confidence: number; role: Role }

export function inferType(label: string, value: string): Typed {
  const role = roleFor(label, value);
  const v = value.trim();
  const blank = !v || UNDERSCORES.test(v) || /^(tbc|tba|n\/?a|-)$/i.test(v);
  if (role === 'imo') return { type: 'id', role, confidence: !blank && imoValid(v) ? 97 : blank ? 80 : 74 };
  if (isYesNo(v) || /\(y\/n\)|\byes\s*\/\s*no\b/i.test(label)) return { type: 'yesno', role: role === 'other' ? 'yesno' : role, options: ['Yes', 'No'], confidence: blank ? 84 : 95 };
  if (!blank && isDate(v)) return { type: 'date', role: role === 'other' ? 'date' : role, confidence: 96 };
  if (blank && role === 'date') return { type: 'date', role, confidence: 82 };
  const lex = lexiconFor(label, v);
  if (lex) return { type: 'list', role: lex.role === 'material' ? 'material' : role, options: lex.options, confidence: blank ? 80 : 91 };
  if (!blank && isCode(v)) return { type: 'id', role: role === 'other' ? 'workorder' : role, confidence: 94 };
  if (blank && role === 'workorder') return { type: 'id', role, confidence: 80 };
  if (!blank && isQuantity(v)) return { type: 'number', role: role === 'other' ? 'quantity' : role, confidence: role === 'quantity' ? 96 : 88 };
  if (blank && role === 'quantity') return { type: 'number', role, confidence: 80 };
  const known = role !== 'other';
  return { type: 'text', role, confidence: blank ? (known ? 80 : 72) : known ? 92 : 84 };
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------
export interface Detection {
  fields: Field[];
  sections: Section[];
  signatureBlocks: number;
  conditionalSections: number;
  regime: string;
  regimeShort: string;
  title: string;
}

const HEADING_RE = /^(?:(\d{1,2})[.)]\s+(.+)|(?:part|section|annex|appendix)\s+[A-Z0-9]{1,3}\b[\s:.—–-]*(.*))$/i;

export function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t || t.length > 90 || t.includes(': ')) return false;
  if (HEADING_RE.test(t)) return true;
  const letters = t.replace(/[^A-Za-z]/g, '');
  return letters.length >= 3 && letters === letters.toUpperCase() && !isCode(t);
}

function headingText(line: string): string {
  const m = line.trim().match(HEADING_RE);
  if (!m) return line.trim();
  return m[1] ? m[1] + '. ' + m[2].trim() : line.trim();
}

function parsePipeTable(lines: string[]): Table | null {
  const rows = lines.map((l) => l.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()));
  if (rows.length < 2 || rows[0].length < 2) return null;
  const body = rows.slice(1).filter((r) => !r.every((c) => /^:?-+:?$/.test(c)));
  return { cols: rows[0], rows: body };
}

export function detectRegime(text: string): { name: string; short: string } {
  let best: { name: string; short: string; hits: number } | null = null;
  for (const r of REGIMES) {
    const hits = (text.match(new RegExp(r.test.source, 'gi')) || []).length;
    if (hits && (!best || hits > best.hits)) best = { name: r.name, short: r.short, hits };
  }
  return best ? { name: best.name, short: best.short } : { name: 'Regime not recognised — set it on save', short: 'Unclassified' };
}

export function detectFields(text: string): Detection {
  const raw = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\t/g, '  ').trimEnd());
  const fields: Field[] = [];
  const byKey = new Map<string, Field>();
  const sections: Section[] = [];
  let signatureBlocks = 0;
  let sec: Section | null = null;
  let n = 0;
  const seenHeading = raw.some((l) => HEADING_RE.test(l.trim()));

  const open = (heading: string, title: boolean) => {
    sec = { id: 's' + n++, heading, title, lines: [], table: null, rule: null, signature: false };
    sections.push(sec);
    return sec;
  };
  const cur = () => sec || open('', true);

  const addField = (label: string, value: string, source: string, bare: boolean): Field => {
    const base = keyFor(label);
    let key = base;
    let i = 2;
    // same label with a different sample → a second field (e.g. two dates)
    while (byKey.has(key) && byKey.get(key)!.sample !== value.trim() && value.trim() && byKey.get(key)!.sample) key = base + '_' + i++;
    const existing = byKey.get(key);
    if (existing) return existing;
    const t = inferType(label, value);
    const blank = !value.trim() || UNDERSCORES.test(value);
    const f: Field = {
      key, role: t.role, label: label.trim().replace(/\s+/g, ' '), type: t.type, options: t.options,
      confidence: Math.min(99, bare ? Math.max(60, t.confidence - 20) : t.confidence),
      required: !bare, sample: blank ? '' : value.trim(), source,
    };
    fields.push(f);
    byKey.set(key, f);
    return f;
  };

  // bare-pattern scan inside prose lines: IMO numbers, work-order codes, dates
  const scanBare = (line: string): string => {
    let out = line;
    if (/^(form|rev|revision)\b/i.test(line)) return out;
    const imo = line.match(IMO_RE);
    if (imo && imoValid(imo[1])) { const f = addField('IMO number', imo[1], line, true); out = out.replace(imo[0], (imo[0].toLowerCase().startsWith('imo') ? 'IMO ' : '') + '{{' + f.key + '}}'); }
    const code = line.match(CODE_RE);
    if (code && /^(WO|INC|PTW|CN|RA|SWP|JOB|PO|TIW|SDOC|MD)\b/i.test(code[1])) { const f = addField('Work order no.', code[1], line, true); out = out.replace(code[1], '{{' + f.key + '}}'); }
    const d = line.match(DATE_RE);
    if (d) { const f = addField('Date', d[1], line, true); out = out.replace(d[1], '{{' + f.key + '}}'); }
    return out;
  };

  let i = 0;
  while (i < raw.length) {
    const line = raw[i].trim();
    if (!line) { i++; continue; }

    // pipe table block
    if (line.startsWith('|') && i + 1 < raw.length && raw[i + 1].trim().startsWith('|')) {
      const block: string[] = [];
      while (i < raw.length && raw[i].trim().startsWith('|')) block.push(raw[i].trim()), i++;
      const s = cur();
      const t = parsePipeTable(block);
      if (t) { if (s.table) open(s.heading, false).table = t; else s.table = t; }
      continue;
    }

    if (isHeading(line)) {
      const first = sections.length === 0;
      open(headingText(line), first && seenHeading && !HEADING_RE.test(line));
      i++;
      continue;
    }

    const s = cur();
    const m = line.match(/^([A-Za-z][^:]{0,70}?)\s*:\s*(.*)$/);
    if (m && m[1].split(/\s+/).length <= 9) {
      const label = m[1].trim();
      const value = m[2].trim();
      if (SIGNATURE_RE.test(label)) { s.signature = true; signatureBlocks++; s.lines.push({ kind: 'text', text: label + ': ' + (value || '______________________') }); i++; continue; }
      if (LABEL_STOP.test(label) || /^https?/i.test(value)) { s.lines.push({ kind: 'text', text: line }); i++; continue; }
      const f = addField(label, value, line, false);
      s.lines.push({ kind: 'pair', key: f.key });
      i++;
      continue;
    }

    if (UNDERSCORES.test(line) || SIGNATURE_RE.test(line)) { s.signature = true; signatureBlocks++; s.lines.push({ kind: 'text', text: line }); i++; continue; }
    s.lines.push({ kind: 'text', text: scanBare(line) });
    i++;
  }

  // conditional sections: a section becomes conditional on the nearest preceding Yes/No field
  let conditionalSections = 0;
  for (let k = 0; k < sections.length; k++) {
    const s = sections[k];
    if (s.title) continue;
    const yes = nearestYesNo(sections, fields, k);
    if (!yes) continue;
    const body = s.heading + ' ' + s.lines.map((l) => (l.kind === 'text' ? l.text : '')).join(' ');
    const hint = CONDITIONAL_HINT.test(s.heading) || CONDITIONAL_HINT.test(body);
    const shared = stems(yes.label).some((st) => stems(s.heading).includes(st));
    if (hint || shared) {
      s.rule = { field: yes.key, op: 'eq', value: 'Yes' } as Rule;
      conditionalSections++;
    }
  }

  const regime = detectRegime(text);
  const title = sections.find((s) => s.title)?.heading || sections[0]?.heading || 'Untitled form';
  return { fields, sections, signatureBlocks, conditionalSections, regime: regime.name, regimeShort: regime.short, title };
}

function nearestYesNo(sections: Section[], fields: Field[], idx: number): Field | null {
  for (let k = idx - 1; k >= 0; k--) {
    const keys = sections[k].lines.filter((l): l is { kind: 'pair'; key: string } => l.kind === 'pair').map((l) => l.key).reverse();
    for (const key of keys) {
      const f = fields.find((x) => x.key === key);
      if (f && f.type === 'yesno') return f;
    }
  }
  return null;
}

const STEM_STOP = new Set(['present', 'declared', 'required', 'details', 'section', 'applicable', 'other', 'information', 'number']);
function stems(s: string): string[] {
  return s.toLowerCase().replace(/\(.*?\)/g, ' ').split(/[^a-z]+/).filter((w) => w.length >= 5 && !STEM_STOP.has(w)).map((w) => w.replace(/(ous|ed|es|s|ing|al)$/, '').slice(0, 6));
}

// convenience used by the UI and tests
export const TYPE_LABEL: Record<FieldType, string> = { text: 'Text', number: 'Number', id: 'ID', date: 'Date', yesno: 'Yes-No', list: 'List' };
export const TYPES: FieldType[] = ['text', 'number', 'id', 'date', 'yesno', 'list'];
export function lineKeys(lines: Line[]): string[] {
  const out: string[] = [];
  for (const l of lines) {
    if (l.kind === 'pair') out.push(l.key);
    else for (const m of l.text.matchAll(/\{\{([a-z0-9_]+)\}\}/g)) out.push(m[1]);
  }
  return out;
}
