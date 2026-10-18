import type { Doc, Field, Template } from '../data/types';
import { evaluateRule } from './assemble';
import { lineKeys } from './fields';
import { dataUrlBytes, shortHash, verifySeal } from './signature';

type Tpl = Pick<Template, 'id' | 'fields' | 'sections' | 'regimeShort' | 'regime' | 'name'>;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

export interface DocxPlacement { field: Field; text: string; changed: boolean }
export interface DocxFill { bytes: Uint8Array; placements: DocxPlacement[]; unplaced: Field[]; signed: boolean }

interface Para { p: Element; nodes: { t: Element; start: number }[]; text: string }

function paragraphs(xml: Document): Para[] {
  return Array.from(xml.getElementsByTagNameNS(W, 'p')).map((p) => {
    const nodes: { t: Element; start: number }[] = [];
    let text = '';
    for (const t of Array.from(p.getElementsByTagNameNS(W, 't'))) { nodes.push({ t, start: text.length }); text += t.textContent || ''; }
    return { p, nodes, text };
  });
}

/** Replace characters [start, end) of a paragraph's text with `value`, keeping the formatting of the run where the value starts. */
function replaceRange(para: Para, start: number, end: number, value: string) {
  let first = true;
  for (const { t, start: s0 } of para.nodes) {
    const txt = t.textContent || '';
    const s1 = s0 + txt.length;
    if (s1 <= start || s0 >= end) continue;
    const a = Math.max(0, start - s0), b = Math.min(txt.length, end - s0);
    t.textContent = txt.slice(0, a) + (first ? value : '') + txt.slice(b);
    t.setAttribute('xml:space', 'preserve');
    first = false;
  }
}

function omittedKeys(t: Tpl, values: Record<string, string>): Set<string> {
  const out = new Set<string>();
  for (const s of t.sections) if (s.rule && !evaluateRule(s.rule, values, s, t.fields).included) for (const k of lineKeys(s.lines)) out.add(k);
  return out;
}

function drawingXml(rid: string, cx: number, cy: number): string {
  return `<w:r xmlns:w="${W}"><w:drawing><wp:inline xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="9101" name="HelmDocs signature"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="9101" name="signature.png"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:embed="${rid}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;
}

function pngSize(bytes: Uint8Array): { w: number; h: number } {
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return bytes.length > 24 ? { w: v.getUint32(16), h: v.getUint32(20) } : { w: 300, h: 100 };
}

/** The original Word file with each changed value written into its own runs, the signature image on the signature line and a seal note. */
export async function buildFilledDocx(bytes: ArrayBuffer, t: Tpl, doc: Pick<Doc, 'values' | 'signature' | 'name'>): Promise<DocxFill> {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(bytes.slice(0));
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('word/document.xml missing');
  const xml = new DOMParser().parseFromString(await docFile.async('string'), 'application/xml');
  const omitted = omittedKeys(t, doc.values);
  let paras = paragraphs(xml);

  // 1 · decide where each field goes (line it was detected on first; shared samples each keep their own paragraph)
  const claimed = new Set<string>();
  const plan: { field: Field; pi: number; start: number; text: string }[] = [];
  const unplaced: Field[] = [];
  for (const f of [...t.fields].filter((x) => x.sample.trim()).sort((a, b) => b.sample.length - a.sample.length)) {
    const sample = f.sample.trim();
    const hits: { pi: number; start: number }[] = [];
    paras.forEach((p, pi) => { let i = p.text.indexOf(sample); while (i >= 0) { if (!claimed.has(pi + ':' + i)) hits.push({ pi, start: i }); i = p.text.indexOf(sample, i + 1); } });
    const src = squash(f.source || '');
    const onSource = hits.find((h) => { const pt = squash(paras[h.pi].text); return !!src && (pt.includes(src) || src.includes(pt)); });
    const pick = onSource || (sample.length >= 4 ? hits[0] : undefined);
    if (!pick) { unplaced.push(f); continue; }
    claimed.add(pick.pi + ':' + pick.start);
    plan.push({ field: f, pi: pick.pi, start: pick.start, text: omitted.has(f.key) ? 'N/A' : (doc.values[f.key] ?? '') });
  }
  // 2 · apply right-to-left inside each paragraph so earlier offsets stay valid
  for (const pl of [...plan].sort((a, b) => a.pi - b.pi || b.start - a.start)) {
    if (pl.text === pl.field.sample.trim()) continue;
    replaceRange(paras[pl.pi], pl.start, pl.start + pl.field.sample.trim().length, pl.text);
  }
  paras = paragraphs(xml);

  // 3 · signature image on the "Signature: ____" line (only while the seal matches)
  const state = doc.signature ? verifySeal(t, doc) : 'none';
  let signed = false;
  if (doc.signature && state === 'valid') {
    const target = [...paras].reverse().find((p) => /sign/i.test(p.text) && /_{4,}/.test(p.text)) || [...paras].reverse().find((p) => /^\s*signature\b/i.test(p.text));
    if (target) {
      const png = dataUrlBytes(doc.signature.png);
      zip.file('word/media/helmdocs-signature.png', png);
      const relsPath = 'word/_rels/document.xml.rels';
      const rels = new DOMParser().parseFromString(await zip.file(relsPath)!.async('string'), 'application/xml');
      const rid = 'rIdHelmSig';
      if (!Array.from(rels.documentElement.children).some((r) => r.getAttribute('Id') === rid)) {
        const r = rels.createElementNS(rels.documentElement.namespaceURI, 'Relationship');
        r.setAttribute('Id', rid); r.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image'); r.setAttribute('Target', 'media/helmdocs-signature.png');
        rels.documentElement.appendChild(r);
        zip.file(relsPath, new XMLSerializer().serializeToString(rels));
      }
      const ctPath = '[Content_Types].xml';
      const ct = await zip.file(ctPath)!.async('string');
      if (!/Extension="png"/i.test(ct)) zip.file(ctPath, ct.replace('</Types>', '<Default Extension="png" ContentType="image/png"/></Types>'));
      const m = target.text.match(/_{4,}/);
      if (m && m.index !== undefined) replaceRange(target, m.index, m.index + m[0].length, ' ');
      const { w, h } = pngSize(png);
      const cy = 457200; // 0.5 inch tall
      const run = new DOMParser().parseFromString(drawingXml(rid, Math.round((cy * w) / h), cy), 'application/xml').documentElement;
      target.p.appendChild(xml.importNode(run, true));
      signed = true;
    }
  }

  // 4 · seal note at the end of the body
  const body = xml.getElementsByTagNameNS(W, 'body')[0];
  const note = state === 'valid' ? 'Signed by ' + doc.signature!.signer + ' · sealed SHA-256 ' + shortHash(doc.signature!.hash) : state === 'broken' ? 'UNSIGNED COPY — content changed after signing' : 'Not signed';
  const p = new DOMParser().parseFromString(`<w:p xmlns:w="${W}"><w:r><w:rPr><w:color w:val="777777"/><w:sz w:val="14"/></w:rPr><w:t xml:space="preserve">Filled with HelmDocs from the original form · ${doc.name.replace(/\.pdf$/, '.docx').replace(/[<&]/g, '')} · ${note}</w:t></w:r></w:p>`, 'application/xml').documentElement;
  const sect = Array.from(body.children).find((c) => c.localName === 'sectPr');
  body.insertBefore(xml.importNode(p, true), sect || null);

  zip.file('word/document.xml', new XMLSerializer().serializeToString(xml));
  const out = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  return { bytes: out, placements: plan.map((x) => ({ field: x.field, text: x.text, changed: x.text !== x.field.sample.trim() })), unplaced, signed };
}
