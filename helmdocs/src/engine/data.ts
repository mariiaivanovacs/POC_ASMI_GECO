import type { AggFn, Attachment } from '../data/types';

export const AGG_LABEL: Record<AggFn, string> = { sum: 'sum', avg: 'average', count: 'count', min: 'minimum', max: 'maximum' };
export const AGG_FNS: AggFn[] = ['sum', 'avg', 'count', 'min', 'max'];

/** Parse a CSV / TSV / semicolon table. The first row is the header. Quoted cells and trailing blank lines are handled. */
export function parseTable(text: string, name: string, id = 'a_' + Date.now().toString(36)): Attachment {
  const clean = text.replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (!clean) throw new Error('The file is empty.');
  const first = clean.split('\n')[0];
  const delim = [',', '\t', ';'].map((d) => ({ d, n: first.split(d).length })).sort((a, b) => b.n - a.n)[0];
  const lines = clean.split('\n');
  if (delim.n < 2 && lines.length < 2) throw new Error('No columns found — use a comma, tab or semicolon separated file with a header row.');
  const rows = lines.map((line) => splitRow(line, delim.d)).filter((r) => r.some((c) => c.trim()));
  const cols = rows[0].map((c, i) => c.trim() || 'column ' + (i + 1));
  const body = rows.slice(1).map((r) => cols.map((_, i) => (r[i] || '').trim()));
  if (!body.length) throw new Error('The file has a header row but no data rows.');
  return { id, name, cols, rows: body, addedAt: Date.now() };
}

function splitRow(line: string, d: string): string[] {
  const out: string[] = [];
  let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { if (q && line[i + 1] === '"') { cur += '"'; i++; } else q = !q; }
    else if (c === d && !q) { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const NUM_RE = /^-?[\d,]*\.?\d+/;
/** "12.5 kg" → { value: 12.5, unit: 'kg' }; non-numeric cells → null. */
const DATE_LIKE = /^\d{1,2}\s+[A-Za-z]{3}|^\d{4}-\d{2}-\d{2}|^\d{1,2}[/.]\d{1,2}[/.]\d{2,4}|^[A-Za-z]{3,}\s+\d{4}/;
export function toNumber(cell: string): { value: number; unit: string } | null {
  const t = cell.trim().replace(/^[$S€£]\s?/, '');
  if (DATE_LIKE.test(t)) return null; // dates are not quantities
  const m = t.match(NUM_RE);
  if (!m) return null;
  const value = parseFloat(m[0].replace(/,/g, ''));
  if (!Number.isFinite(value)) return null;
  return { value, unit: t.slice(m[0].length).trim().replace(/^[×x]\s*/, '') };
}

export interface AggResult { value: number; n: number; unit: string; text: string; skipped: number }

/** Aggregate one column. Units are kept when every numeric cell agrees on one. */
export function aggregate(att: Attachment, column: string, fn: AggFn): AggResult {
  const ci = att.cols.indexOf(column);
  if (ci < 0) throw new Error('Column "' + column + '" is not in ' + att.name);
  const nums = att.rows.map((r) => toNumber(r[ci] || '')).filter((x): x is { value: number; unit: string } => !!x);
  const n = fn === 'count' ? att.rows.filter((r) => (r[ci] || '').trim()).length : nums.length;
  const units = Array.from(new Set(nums.map((x) => x.unit).filter(Boolean)));
  const unit = fn === 'count' ? '' : units.length === 1 ? units[0] : '';
  let value = 0;
  if (fn === 'count') value = n;
  else if (!nums.length) value = 0;
  else if (fn === 'sum') value = nums.reduce((a, x) => a + x.value, 0);
  else if (fn === 'avg') value = nums.reduce((a, x) => a + x.value, 0) / nums.length;
  else if (fn === 'min') value = Math.min(...nums.map((x) => x.value));
  else value = Math.max(...nums.map((x) => x.value));
  const rounded = Math.round(value * 100) / 100;
  return { value: rounded, n, unit, text: formatNumber(rounded) + (unit ? ' ' + unit : ''), skipped: fn === 'count' ? 0 : att.rows.length - nums.length };
}

export function formatNumber(v: number): string {
  return Number.isInteger(v) ? v.toLocaleString('en-SG') : v.toLocaleString('en-SG', { maximumFractionDigits: 2 });
}

export function numericColumns(att: Attachment): string[] {
  return att.cols.filter((_, i) => att.rows.some((r) => toNumber(r[i] || '')));
}
