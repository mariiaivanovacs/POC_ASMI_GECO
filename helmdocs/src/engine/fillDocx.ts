import type { Doc, Field, Template } from '../data/types';
import { evaluateRule } from './assemble';
import { lineKeys } from './fields';
import { dataUrlBytes, shortHash, verifySeal } from './signature';

type Tpl = Pick<Template, 'id' | 'fields' | 'sections' | 'regimeShort' | 'regime' | 'name'>;
const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

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


/** Put a run (the signature drawing) where characters [start, end) of the paragraph were, splitting the run that holds them. */
function insertRunAt(para: Para, start: number, end: number, run: Element) {
  const hit = para.nodes.find(({ t, start: s0 }) => start >= s0 && start <= s0 + (t.textContent || '').length);
  replaceRange(para, start, end, '');
  if (!hit) { para.p.appendChild(run); return; }
  const r = hit.t.parentNode as Element; // <w:r>
  const txt = hit.t.textContent || '';
  const cut = start - hit.start;
  const tail = r.cloneNode(true) as Element;
  hit.t.textContent = txt.slice(0, cut); hit.t.setAttribute('xml:space', 'preserve');
  const tailT = Array.from(tail.getElementsByTagNameNS(W, 't'))[0];
  if (tailT) { tailT.textContent = txt.slice(cut); tailT.setAttribute('xml:space', 'preserve'); }
  r.parentNode!.insertBefore(run, r.nextSibling);
  if (tailT && tailT.textContent) run.parentNode!.insertBefore(tail, run.nextSibling);
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
  const plan: { field: Field; pi: number; start: number; end: number; text: string; insert?: boolean }[] = [];
  const unplaced: Field[] = [];
  const ws = (x: string) => x.replace(/\s+/g, '').toLowerCase();
  const onSource = (f: Field) => { const s0 = ws(f.source || ''); return paras.map((p, pi) => ({ p, pi })).filter(({ p }) => { const t = ws(p.text); return !!s0 && !!t && (t === s0 || (t.length > 6 && s0.includes(t)) || (s0.length > 6 && t.includes(s0))); }); };
  const anchorOf = (f: Field) => f.sample.trim() || f.anchor || f.anchorAfter || '';
  for (const f of [...t.fields].filter((x) => anchorOf(x)).sort((a, b) => anchorOf(b).length - anchorOf(a).length)) {
    const text = omitted.has(f.key) ? 'N/A' : (doc.values[f.key] ?? '');
    let hit: { pi: number; start: number; end: number; insert?: boolean } | undefined;
    if (f.sample.trim()) {
      const sample = f.sample.trim();
      const hits: { pi: number; start: number; end: number }[] = [];
      paras.forEach((p, pi) => { for (let i = p.text.indexOf(sample); i >= 0; i = p.text.indexOf(sample, i + 1)) if (!claimed.has(pi + ':' + i)) hits.push({ pi, start: i, end: i + sample.length }); });
      const src = new Set(onSource(f).map((x) => x.pi));
      hit = hits.find((h) => src.has(h.pi)) || (sample.length >= 4 ? hits[0] : undefined);
    } else if (f.anchor && /^_+$/.test(f.anchor)) {
      for (const { p, pi } of onSource(f)) { const r = [...p.text.matchAll(/_+/g)][f.anchorNth ?? 0]; if (r && !claimed.has(pi + ':' + r.index)) { hit = { pi, start: r.index!, end: r.index! + r[0].length }; break; } }
    } else if (f.anchor) {
      for (const { p, pi } of onSource(f)) { const k = p.text.indexOf(f.anchor); if (k >= 0 && !claimed.has(pi + ':' + k)) { hit = { pi, start: k, end: k + f.anchor.length }; break; } }
    } else if (f.anchorAfter) {
      for (const { p, pi } of onSource(f)) {
        const k = p.text.indexOf(f.anchorAfter);
        if (k < 0) continue;
        const from = k + f.anchorAfter.length;
        const gap = p.text.slice(from).match(/^\s*/)![0].length;
        // write into the gap after the label, keeping one space either side
        hit = { pi, start: from, end: from + Math.max(0, gap - 1), insert: true };
        break;
      }
    }
    if (!hit) { unplaced.push(f); continue; }
    claimed.add(hit.pi + ':' + hit.start);
    plan.push({ field: f, ...hit, text });
  }
  // 2 · apply right-to-left inside each paragraph so earlier offsets stay valid
  for (const pl of [...plan].sort((a, b) => a.pi - b.pi || b.start - a.start)) {
    if (pl.text === pl.field.sample.trim() && pl.field.sample.trim()) continue;
    if (!pl.text && !pl.field.sample.trim()) continue; // blank stays a blank
    replaceRange(paras[pl.pi], pl.start, pl.end, pl.insert ? ' ' + pl.text : pl.text);
  }
  paras = paragraphs(xml);

  // 3 · signature image: over the blank above a "(подпись)" caption, else on a "Signature: ____" line (only while the seal matches)
  const state = doc.signature ? verifySeal(t, doc) : 'none';
  let signed = false;
  if (doc.signature && state === 'valid') {
    const CAP = /\(([^()]*?)\)/g;
    let target: { para: Para; start: number; end: number } | null = null;
    for (let k = paras.length - 1; k > 0 && !target; k--) {
      const caps = [...paras[k].text.matchAll(CAP)].map((m) => m[1]);
      const ci = caps.findIndex((c) => /подпис|signature|\bsign\b|tandatangan|签名|签字/iu.test(c));
      if (ci < 0) continue;
      let a = k - 1; while (a >= 0 && !paras[a].text.trim()) a--;
      if (a < 0) continue;
      const runs = [...paras[a].text.matchAll(/_{3,}/g)];
      const r = runs.length === caps.length ? runs[ci] : runs[Math.min(ci, runs.length - 1)];
      if (r) target = { para: paras[a], start: r.index!, end: r.index! + r[0].length };
    }
    if (!target) {
      const p = [...paras].reverse().find((x) => /sign|подпис/i.test(x.text) && /_{4,}/.test(x.text));
      const m = p?.text.match(/_{4,}/);
      if (p && m && m.index !== undefined) target = { para: p, start: m.index, end: m.index + m[0].length };
    }
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
      const { w, h } = pngSize(png);
      const cy = 400050; // ~0.44 inch tall, sits on the blank line
      const run = new DOMParser().parseFromString(drawingXml(rid, Math.round((cy * w) / h), cy), 'application/xml').documentElement;
      insertRunAt(target.para, target.start, target.end, xml.importNode(run, true) as Element);
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
  return { bytes: out, placements: plan.map((x) => ({ field: x.field, text: x.text, changed: !!x.text && x.text !== x.field.sample.trim() })), unplaced, signed };
}
