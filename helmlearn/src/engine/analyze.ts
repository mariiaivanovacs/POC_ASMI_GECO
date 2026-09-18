import type { Fact, Hazard, Structure, Term } from '../data/types';

const IMPERATIVES = [
  'obtain', 'check', 'confirm', 'remove', 'post', 'test', 'wear', 'isolate', 'stop', 'report', 'muster', 'take',
  'keep', 'clear', 'inspect', 'clip', 'attach', 'verify', 'ensure', 'display', 'record', 'cover', 'ventilate',
  'sound', 'raise', 'leave', 'move', 'throw', 'close', 'open', 'lock', 'tag', 'measure', 'tighten', 'torque',
  'replace', 'fit', 'align', 'connect', 'disconnect', 'drain', 'purge', 'never', 'do not', 'always', 'use',
  'hold', 'lower', 'lift', 'secure', 'sign', 'apply', 'shut', 'start', 'wait', 'call', 'evacuate',
];

const HAZARDS: [RegExp, string][] = [
  [/\b(fire|ignition|ignite|flame|spark)/i, 'Fire / ignition'],
  [/\b(flammable|combustible)/i, 'Flammable materials'],
  [/\b(h2s|h₂s|hydrogen sulphide|hydrogen sulfide)/i, 'H₂S gas'],
  [/\b(toxic|poison)/i, 'Toxic atmosphere'],
  [/\b(oxygen[- ]deficien|low oxygen|asphyxia)/i, 'Oxygen deficiency'],
  [/\b(gas release|gas leak|methane|lng|vapou?r cloud)/i, 'Gas release'],
  [/\b(fall(s|ing)? from height|working at height|height|scaffold)/i, 'Fall from height'],
  [/\b(falling object|dropped object)/i, 'Falling objects'],
  [/\b(confined space|enclosed space|tank entry|void space|cofferdam)/i, 'Confined space'],
  [/\b(engulf|drown|man overboard|overboard)/i, 'Man overboard / engulfment'],
  [/\b(electric|electrocution|live circuit|switchboard)/i, 'Electrical'],
  [/\b(hot surface|burn|scald)/i, 'Hot surfaces / burns'],
  [/\b(pressure|pressuri[sz]ed|bar\b)/i, 'Stored pressure'],
  [/\b(crush|pinch|suspended load|swing)/i, 'Crush / suspended load'],
  [/\b(cryogenic|frostbite|-16[0-9]|−16[0-9])/i, 'Cryogenic exposure'],
  [/\b(noise|hearing)/i, 'Noise'],
];

const PPE: [RegExp, string][] = [
  [/\b(helmet|hard hat)/i, 'Helmet / hard hat'],
  [/\b(harness)/i, 'Full-body harness'],
  [/\b(lanyard)/i, 'Twin lanyard'],
  [/\b(extinguisher)/i, 'Fire extinguisher'],
  [/\b(gas detector|multi-gas|gas monitor)/i, 'Gas detector'],
  [/\b(breathing apparatus|\bba\b|scba)/i, 'Breathing apparatus'],
  [/\b(eebd|escape breathing)/i, 'EEBD'],
  [/\b(glove)/i, 'Gloves'],
  [/\b(face shield|welding helmet|goggles|eye protection)/i, 'Eye / face protection'],
  [/\b(fire[- ]resistant|coverall|flame[- ]retardant)/i, 'Fire-resistant coveralls'],
  [/\b(fire blanket)/i, 'Fire blanket'],
  [/\b(lifejacket|life jacket|lifebuoy|life buoy)/i, 'Lifejacket / lifebuoy'],
  [/\b(safety boots|boots)/i, 'Safety boots'],
  [/\b(hearing protection|ear ?plugs|ear ?muffs)/i, 'Hearing protection'],
  [/\b(torch|flashlight)/i, 'Intrinsically safe torch'],
  [/\b(tripod|winch|lifeline)/i, 'Rescue tripod and lifeline'],
  [/\b(radio)/i, 'Radio'],
];

const GLOSSARY: Term[] = [
  { term: 'Fire watch', def: 'Person who watches for fire during and after hot work' },
  { term: 'Permit to work', def: 'Written authorisation to carry out hazardous work' },
  { term: 'Flash point', def: 'Lowest temperature at which vapour ignites' },
  { term: 'LEL', def: 'Lower explosive limit of a flammable gas' },
  { term: 'PEL', def: 'Permissible exposure limit for a toxic gas' },
  { term: 'Muster station', def: 'Where you report when the alarm sounds' },
  { term: 'EEBD', def: '15-minute emergency escape breathing device' },
  { term: 'SWL', def: 'Safe working load marked on lifting gear' },
  { term: 'Banksman', def: 'The only person giving crane signals' },
  { term: 'Tag line', def: 'Rope used to control load rotation, never to carry weight' },
  { term: 'Toe board', def: 'Board that stops tools falling from a platform' },
  { term: 'Mid rail', def: 'Guardrail halfway between top rail and deck' },
  { term: 'ESD', def: 'Emergency shutdown system' },
  { term: 'Area Authority', def: 'Person responsible for the work area who closes the permit' },
  { term: 'Attendant', def: 'Person who stays outside a confined space and keeps contact' },
  { term: 'Isolation', def: 'Separating equipment from every energy source before work' },
  { term: 'LOTO', def: 'Lock-out, tag-out of an isolated energy source' },
  { term: 'Injector', def: 'Component that sprays fuel into the cylinder at high pressure' },
  { term: 'Bunkering', def: 'Transfer of fuel to a vessel' },
  { term: 'Safety zone', def: 'Area around a transfer where ignition sources are excluded' },
];

const UNIT_RE = /(\d+(?:[.,]\d+)?)\s?(m|ft|mm|cm|km|min|minutes?|hours?|h|hrs|sec|seconds?|bar|psi|ppm|%|°c|deg c|kg|t|tonnes?|days?|weeks?|months?|l|litres?|liters?|v|kv|a|amps?|nm|rpm|knots?)\b/gi;

export function splitSentences(text: string): string[] {
  const cleaned = text.replace(/\r/g, '').replace(/[ \t]+/g, ' ');
  const raw = cleaned.split(/(?<=[.!?])\s+|\n+/);
  return raw
    .map((s) => s.trim())
    .filter((s) => s.split(/\s+/).length >= 4)
    .map((s) => s.replace(/\s+/g, ' '));
}

function looksLikeStep(line: string): string | null {
  const m = line.match(/^\s*(?:step\s*)?(\d{1,2}|[a-z])[.)]\s+(.+)$/i);
  if (m && m[2].split(/\s+/).length >= 3) return m[2].trim();
  return null;
}

function isImperative(s: string): boolean {
  const first = s.toLowerCase().replace(/^[^a-z]+/, '');
  return IMPERATIVES.some((v) => first.startsWith(v + ' ') || first.startsWith(v + ','));
}

export function analyze(text: string, fallbackTitle = 'Uploaded material'): Structure {
  const lines = text.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean);
  const titleLine = lines.find((l) => l.length >= 6 && l.length <= 90 && !/[.:]$/.test(l));
  const title = (titleLine || fallbackTitle).replace(/^#+\s*/, '');
  const sentences = splitSentences(text);

  const HEADING = /^(purpose|scope|definitions?|references?|introduction|background|responsibilit(y|ies)|general)\b/i;
  const numbered = lines.map(looksLikeStep).filter((s): s is string => !!s && !HEADING.test(s));
  let steps = numbered.slice(0, 12);
  if (steps.length < 3) {
    steps = sentences.filter(isImperative).slice(0, 8);
  }
  steps = steps.map((s) => s.replace(/\.$/, ''));

  const hazards: Hazard[] = [];
  const seenH = new Set<string>();
  for (const s of sentences) {
    for (const [re, name] of HAZARDS) {
      if (!seenH.has(name) && re.test(s)) { seenH.add(name); hazards.push({ name, sentence: s }); }
    }
  }

  const ppe: string[] = [];
  for (const [re, name] of PPE) if (re.test(text) && !ppe.includes(name)) ppe.push(name);

  const facts: Fact[] = [];
  const seenF = new Set<string>();
  for (const s of sentences) {
    UNIT_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = UNIT_RE.exec(s))) {
      const raw = m[0];
      const value = parseFloat(m[1].replace(',', '.'));
      const unit = m[2];
      const key = raw.toLowerCase();
      if (seenF.has(key) || !isFinite(value)) continue;
      seenF.add(key);
      facts.push({ value, unit, sentence: s, raw });
    }
  }

  const terms: Term[] = [];
  const seenT = new Set<string>();
  const pushTerm = (t: string, d: string) => {
    const tt = t.trim().replace(/[*_]/g, '');
    const dd = d.trim().replace(/[.]$/, '');
    if (tt.length < 2 || tt.length > 40 || dd.length < 8 || dd.length > 120) return;
    const key = tt.toLowerCase();
    if (seenT.has(key)) return;
    seenT.add(key);
    terms.push({ term: tt, def: dd });
  };
  for (const l of lines) {
    let m = l.match(/^([A-Z][A-Za-z0-9 ()/-]{1,38})\s*[:—–-]\s+(.{8,120})$/);
    if (m) { pushTerm(m[1], m[2]); continue; }
    m = l.match(/^([A-Z][A-Za-z0-9 ()/-]{1,38}) (?:means|is defined as|refers to) (.{8,120})$/);
    if (m) pushTerm(m[1], m[2]);
  }
  if (terms.length < 3) {
    for (const g of GLOSSARY) {
      if (new RegExp('\\b' + g.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(text)) pushTerm(g.term, g.def);
    }
  }

  return { title, sentences, steps, hazards, ppe, facts, terms };
}
