import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import { buildDocx, buildHtml, buildPdf, mailtoUrl, toCsv, toTsv, toXlsx, toXml } from '../../src/engine/export';
import { sampleValues } from '../../src/engine/template';
import { seedTemplates } from '../../src/data/seed';
import { makeSeal } from '../../src/engine/signature';

// jsdom's Blob has no arrayBuffer(); read it the browser way
const bytes = (b: Blob): Promise<ArrayBuffer> => new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as ArrayBuffer); r.readAsArrayBuffer(b); });
const ihm = seedTemplates(1_800_000_000_000)[0];
const inp = { template: ihm, doc: { values: sampleValues(ihm.fields), name: 'test.pdf', status: 'reviewed' as const, by: 'Melissa Tan' }, company: 'Harbourline' };
const rows = [{ document: 'a.pdf', status: 'sent', minutes: 5 }, { document: 'b, "quoted".pdf', status: 'draft', minutes: 12 }];

describe('document exports', () => {
  it('PDF is a real PDF with pages', async () => {
    const blob = await buildPdf(inp);
    const head = new TextDecoder().decode(new Uint8Array(await bytes(blob)).slice(0, 5));
    expect(head).toBe('%PDF-');
    expect(blob.size).toBeGreaterThan(2000);
  }, 20_000);
  it('DOCX is a zip with document.xml containing the assembled text', async () => {
    const blob = await buildDocx(inp);
    const zip = await JSZip.loadAsync(await bytes(blob));
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('MV Ocean Pioneer');
    expect(xml).toContain('HAZARDOUS MATERIALS DECLARED');
  }, 20_000);
  it('DOCX omits a section that the rule excludes', async () => {
    const blob = await buildDocx({ ...inp, doc: { ...inp.doc, values: { ...inp.doc.values, haz_material_present: 'No' } } });
    const zip = await JSZip.loadAsync(await bytes(blob));
    expect(await zip.file('word/document.xml')!.async('string')).not.toContain('HAZARDOUS MATERIALS DECLARED');
  }, 20_000);
  it('HTML escapes and includes the sections', () => {
    const html = buildHtml({ ...inp, doc: { ...inp.doc, values: { ...inp.doc.values, desc: '<b>x</b>' } } });
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('<h1>SUPPLIER');
  });
  it('mailto carries subject and summary', () => {
    const u = mailtoUrl(inp, 'surveyor@class.example');
    expect(u.startsWith('mailto:surveyor%40class.example?subject=')).toBe(true);
    expect(decodeURIComponent(u)).toContain('MV Ocean Pioneer');
  });
});

describe('signed exports', () => {
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
  const signedAt = '2026-09-18T02:00:00.000Z';
  const sign = (values: Record<string, string>) => ({ signatureId: 's1', png: PNG, signer: 'Rachel Tan, QA Manager', signedAt, hash: makeSeal(ihm, values, 'Rachel Tan, QA Manager', signedAt) });
  it('DOCX embeds the signature image and prints the seal when it is valid', async () => {
    const values = sampleValues(ihm.fields);
    const blob = await buildDocx({ ...inp, doc: { ...inp.doc, values, signature: sign(values) } });
    const zip = await JSZip.loadAsync(await bytes(blob));
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(true);
    const xml = await zip.file('word/document.xml')!.async('string');
    expect(xml).toContain('Signed by Rachel Tan, QA Manager');
    expect(xml).toContain('SHA-256');
  }, 20_000);
  it('a broken seal withholds the image and marks the copy unsigned', async () => {
    const values = sampleValues(ihm.fields);
    const seal = sign(values);
    const blob = await buildDocx({ ...inp, doc: { ...inp.doc, values: { ...values, qty: '1 kg' }, signature: seal } });
    const zip = await JSZip.loadAsync(await bytes(blob));
    expect(Object.keys(zip.files).some((f) => f.startsWith('word/media/'))).toBe(false);
    expect(await zip.file('word/document.xml')!.async('string')).toContain('UNSIGNED COPY');
    const html = buildHtml({ ...inp, doc: { ...inp.doc, values: { ...values, qty: '1 kg' }, signature: seal } });
    expect(html).not.toContain('<img class="sigimg"');
    expect(html).toContain('UNSIGNED COPY');
  }, 20_000);
  it('PDF with a valid seal is larger (carries the image) and still a PDF', async () => {
    const values = sampleValues(ihm.fields);
    const plain = await buildPdf({ ...inp, doc: { ...inp.doc, values } });
    const signed = await buildPdf({ ...inp, doc: { ...inp.doc, values, signature: sign(values) } });
    expect(new TextDecoder().decode(new Uint8Array(await bytes(signed)).slice(0, 5))).toBe('%PDF-');
    expect(signed.size).toBeGreaterThan(plain.size);
  }, 20_000);
});

describe('data extraction', () => {
  it('CSV quotes commas and quotes', () => {
    const csv = toCsv(rows);
    expect(csv.split('\n')[0]).toBe('document,status,minutes');
    expect(csv.split('\n')[2]).toBe('"b, ""quoted"".pdf",draft,12');
  });
  it('TSV uses tabs', () => { expect(toTsv(rows).split('\n')[1]).toBe('a.pdf\tsent\t5'); });
  it('XML wraps rows and escapes', () => {
    const xml = toXml([{ a: '<x & y>' }]);
    expect(xml).toContain('<record><a>&lt;x &amp; y&gt;</a></record>');
  });
  it('XLSX is a valid OOXML package with a sheet', async () => {
    const blob = await toXlsx(rows);
    const zip = await JSZip.loadAsync(await bytes(blob));
    expect(zip.file('xl/workbook.xml')).toBeTruthy();
    const sheet = await zip.file('xl/worksheets/sheet1.xml')!.async('string');
    expect(sheet).toContain('<t>a.pdf</t>');
    expect(sheet).toContain('<c r="C2"><v>5</v></c>');
  });
  it('empty rows give an empty CSV', () => { expect(toCsv([])).toBe(''); });
});
