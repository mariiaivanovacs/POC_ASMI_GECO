import { describe, expect, it } from 'vitest';
import { aggregate, numericColumns, parseTable, toNumber } from '../../src/engine/data';

const csv = 'drum,material,quantity,collected\nD-01,Paint residue,190 kg,13 Sep 2026\nD-02,Paint residue,"205 kg",13 Sep 2026\nD-03,Paint residue,185 kg,13 Sep 2026\nD-04,Spent solvent,60 kg,13 Sep 2026\n';

describe('attached data', () => {
  it('parses CSV with a header, quoted cells and units', () => {
    const t = parseTable(csv, 'drums.csv', 'a1');
    expect(t.cols).toEqual(['drum', 'material', 'quantity', 'collected']);
    expect(t.rows).toHaveLength(4);
    expect(t.rows[1][2]).toBe('205 kg');
  });
  it('detects tab and semicolon separators', () => {
    expect(parseTable('a\tb\n1\t2', 'x.tsv').cols).toEqual(['a', 'b']);
    expect(parseTable('a;b\n1;2', 'x.csv').rows[0]).toEqual(['1', '2']);
  });
  it('refuses empty and header-only files', () => {
    expect(() => parseTable('', 'e.csv')).toThrow(/empty/);
    expect(() => parseTable('a,b\n', 'h.csv')).toThrow(/no data rows/);
    expect(() => parseTable('just one column', 'o.csv')).toThrow(/No columns/);
    expect(parseTable('reading\n20.9 %\n20.7 %', 'single.csv').cols).toEqual(['reading']);
  });
  it('numbers keep their unit; dates are not numbers', () => {
    expect(toNumber('12.5 kg')).toEqual({ value: 12.5, unit: 'kg' });
    expect(toNumber('84,200 L')).toEqual({ value: 84200, unit: 'L' });
    expect(toNumber('13 Sep 2026')).toBeNull();
    expect(toNumber('2026-09-13')).toBeNull();
    expect(toNumber('Paint residue')).toBeNull();
    expect(numericColumns(parseTable(csv, 'd.csv'))).toEqual(['quantity']);
  });
  it('aggregates a column with sum / avg / count / min / max and a shared unit', () => {
    const t = parseTable(csv, 'drums.csv');
    expect(aggregate(t, 'quantity', 'sum')).toMatchObject({ value: 640, n: 4, unit: 'kg', text: '640 kg', skipped: 0 });
    expect(aggregate(t, 'quantity', 'avg').text).toBe('160 kg');
    expect(aggregate(t, 'quantity', 'count').text).toBe('4');
    expect(aggregate(t, 'quantity', 'min').text).toBe('60 kg');
    expect(aggregate(t, 'quantity', 'max').text).toBe('205 kg');
    expect(aggregate(t, 'material', 'sum')).toMatchObject({ value: 0, n: 0, skipped: 4 });
    expect(() => aggregate(t, 'nope', 'sum')).toThrow(/not in/);
  });
  it('drops the unit when rows disagree', () => {
    const t = parseTable('q\n10 kg\n5 L', 'm.csv');
    expect(aggregate(t, 'q', 'sum').text).toBe('15');
  });
});
