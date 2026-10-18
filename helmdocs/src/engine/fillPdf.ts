import type { Doc, Field, Template } from '../data/types';
import { evaluateRule } from './assemble';
import { lineKeys } from './fields';
import { findRects, findSignatureLine, layoutOf, loadPdf, rectOf, sourceLines, underscoreRun, type PdfLayout, type Rect } from './pdfLayout';
import { dataUrlBytes, shortHash, verifySeal } from './signature';

type Tpl = Pick<Template, 'id' | 'fields' | 'sections' | 'regimeShort' | 'regime' | 'name'>;
/** replace = write over the old value · blank = write on a printed blank line · after = write right after a label */
export interface Placement { field: Field; rect: Rect; text: string; changed: boolean; mode: 'replace' | 'blank' | 'after'; tail: boolean }
export interface FillPlan { placements: Placement[]; unplaced: Field[]; signature: Rect | null }


/** Keys of fields that sit in a section the rules currently leave out (e.g. Section 4 when hazardous material = No). */
function omittedKeys(t: Tpl, values: Record<string, string>): Set<string> {
  const out = new Set<string>();
  for (const s of t.sections) if (s.rule && !evaluateRule(s.rule, values, s, t.fields).included) for (const k of lineKeys(s.lines)) out.add(k);
  return out;
}

/**
 * Where every field's new value goes on the original PDF: the occurrence of the field's sample on the line it was
 * detected on (so two fields with the same sample — e.g. one person as contact and signatory — each keep their own spot),
 * otherwise the first occurrence no other field has claimed.
 */
export function planFill(layout: PdfLayout, t: Tpl, values: Record<string, string>): FillPlan {
  const omitted = omittedKeys(t, values);
  const used = new Set<string>();
  const id = (r: Rect) => r.page + ':' + Math.round(r.x) + ':' + Math.round(r.y);
  const lineText = (r: Rect) => layout.pages[r.page].lines.find((l) => Math.abs(l.top - r.y) < 0.5)?.text || '';
  const ws = (x: string) => x.replace(/\s+/g, '').toLowerCase();
  const placements: Placement[] = [];
  const unplaced: Field[] = [];
  // fields with the most specific (longest) anchors claim their spots first
  const anchorOf = (f: Field) => f.sample.trim() || f.anchor || f.anchorAfter || '';
  const order = [...t.fields].filter((f) => anchorOf(f)).sort((a, b) => anchorOf(b).length - anchorOf(a).length);
  for (const f of order) {
    const src = sourceLines(layout, f.source || '');
    let rect: Rect | null = null;
    let mode: Placement['mode'] = 'replace';
    if (f.sample.trim()) {
      // the form came filled in: overwrite the old value, on the line it was detected on
      const rects = findRects(layout, f.sample, 12).filter((r) => !used.has(id(r)));
      const s0 = ws(f.source || '');
      const onSource = rects.find((r) => { const lt = ws(lineText(r)); return !!s0 && (lt.includes(s0) || s0.includes(lt)); });
      rect = onSource || (f.sample.trim().length >= 4 ? rects[0] : null) || null;
    } else if (f.anchor && /^_+$/.test(f.anchor)) {
      // a printed blank line: the n-th underscore run on the source line
      mode = 'blank';
      for (const { page, line } of src) { const r = underscoreRun(page, line, f.anchorNth ?? 0); if (r && !used.has(id(r))) { rect = r; break; } }
    } else if (f.anchor) {
      // a partly printed blank ("__.10.2026", "+7 (9___) ____-___-___"): replace the whole token
      const hits: Rect[] = [];
      for (const { page, line } of src) for (let k = line.text.indexOf(f.anchor); k >= 0; k = line.text.indexOf(f.anchor, k + 1)) hits.push(rectOf(page, line, k, k + f.anchor.length));
      const rects = (hits.length ? hits : findRects(layout, f.anchor, 12)).filter((r) => !used.has(id(r)));
      rect = rects[f.anchorNth ?? 0] || rects[0] || null;
    } else if (f.anchorAfter) {
      // nothing printed to write on ("ИНН" then spaces): write right after the label
      mode = 'after';
      let hit: Rect | null = null;
      for (const { page, line } of src) { const k = line.text.indexOf(f.anchorAfter); if (k >= 0) { hit = rectOf(page, line, k, k + f.anchorAfter.length); break; } }
      hit = hit || findRects(layout, f.anchorAfter, 1)[0] || null;
      if (hit) rect = { ...hit, x: hit.x + hit.w + 6, w: 160 };
    }
    if (!rect) { unplaced.push(f); continue; }
    used.add(id(rect));
    const text = omitted.has(f.key) ? 'N/A' : (values[f.key] ?? '');
    // does printed text continue after this spot on the same line? then a longer value must shrink rather than overrun it
    const ln = layout.pages[rect.page].lines.find((l) => Math.abs(l.top - rect!.y) < 0.5);
    const tail = !!ln && ln.xEnd > rect.x + rect.w + 3;
    placements.push({ field: f, rect, text, changed: text !== f.sample.trim(), mode, tail });
  }
  return { placements, unplaced, signature: findSignatureLine(layout) };
}

/**
 * Where the signature image fits: sitting on the signature line's baseline, as large as possible (up to ~46 pt tall)
 * without covering any printed text above it — first over the blank line, then shifted right past the text above.
 */
export function placeSignature(layout: PdfLayout, s: Rect, aspect: number): { x: number; bottom: number; w: number; h: number } {
  const pg = layout.pages[s.page];
  const base = s.y + s.size * 0.85 + 2; // a little below the baseline, on the rule
  const lines = pg.lines.filter((l) => Math.abs(l.top - s.y) > 0.5);
  const collides = (x: number, w: number, h: number) => lines.some((l) => {
    const top = l.top, bottom = l.top + l.h * 0.9;
    const x0 = l.xs[0] ?? 0, x1 = l.xEnd;
    return bottom > base - h && top < base && x1 > x && x0 < x + w;
  });
  const starts = [s.x + 2, ...lines.filter((l) => l.top < s.y && l.top > s.y - 60).map((l) => l.xEnd + 10)].filter((x) => x < pg.width - 60);
  for (let h = 46; h >= 12; h -= 2) {
    const w = Math.min(h * aspect, Math.max(s.w, 160));
    const hh = w / aspect;
    for (const x of starts) if (x + w < pg.width - 24 && !collides(x, w, hh)) return { x, bottom: base, w, h: hh };
  }
  const w = Math.min(12 * aspect, 120);
  return { x: s.x + 2, bottom: base, w, h: w / aspect };
}

/** The original PDF with every changed value written over the old one, the signature on the signature line, and a seal footer. */
export async function buildFilledPdf(bytes: ArrayBuffer, t: Tpl, doc: Pick<Doc, 'values' | 'signature' | 'name'>): Promise<{ bytes: Uint8Array; plan: FillPlan }> {
  const pdfjsDoc = await loadPdf(bytes);
  const layout = await layoutOf(pdfjsDoc);
  const plan = planFill(layout, t, doc.values);
  const lib = await import('pdf-lib');
  const { PDFDocument, StandardFonts, rgb } = lib;
  const pdf = await PDFDocument.load(bytes.slice(0));
  // Helvetica only covers Western European text; anything else (Cyrillic, Malay diacritics, …) needs an embedded Unicode font
  const needsUnicode = [...plan.placements.map((p) => p.text), doc.name, doc.signature?.signer || ''].some((x) => /[^\u0000-ÿ‘’“”–—…]/.test(x));
  const font = (needsUnicode && (await embedUnicode(pdf))) || (await pdf.embedFont(StandardFonts.Helvetica));
  // Values typed or signed with a PDF viewer's "Fill & Sign" are annotations drawn ABOVE the page, so nothing drawn on the
  // page can cover them: drop the annotations that sit on a spot being filled (or on the signature box)
  const sigBox = doc.signature && plan.signature ? (() => { const sb = plan.signature!; const at = placeSignature(layout, sb, 3); return { page: sb.page, x: Math.min(at.x, sb.x), y: sb.y - Math.max(at.h, sb.size * 3), w: Math.max(at.w, sb.w) + 20, h: Math.max(at.h, sb.size * 3) + sb.h }; })() : null;
  const zones = [...plan.placements.filter((p) => p.changed).map((p) => ({ page: p.rect.page, x: p.rect.x, y: p.rect.y - (p.mode === 'blank' ? p.rect.size * 2 : 0), w: p.rect.w, h: p.rect.h + (p.mode === 'blank' ? p.rect.size * 2.4 : 0) })), ...(sigBox ? [sigBox] : [])];
  removeAnnotationsOver(pdf, lib, zones);
  const safe = (s: string) => Array.from(s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')).map((ch) => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
  for (const p of plan.placements) {
    if (!p.changed) continue;
    const page = pdf.getPage(p.rect.page);
    const H = page.getHeight(), W = page.getWidth();
    const r = p.rect;
    // over an old value: white it out first; on a printed blank or after a label: keep the line and write on it
    if (p.mode === 'replace') page.drawRectangle({ x: r.x - 1, y: H - r.y - r.h, width: r.w + 2, height: r.h, color: rgb(1, 1, 1) });
    // a blank may carry drawn-in content that is not text (a date or name written in by hand, a stamp): clear the space
    // above the rule — but not the rule itself — before writing on it
    if (p.mode === 'blank') {
      // clear the whole blank — rule included, since hand-drawn entries sit on it — then redraw a clean rule
      const base = H - r.y - r.size * 0.85;
      page.drawRectangle({ x: r.x - 1, y: base - r.size * 0.35, width: r.w + 2, height: r.h + r.size * 0.6, color: rgb(1, 1, 1) });
      page.drawLine({ start: { x: r.x, y: base - r.size * 0.12 }, end: { x: r.x + r.w, y: base - r.size * 0.12 }, thickness: 0.6, color: rgb(0, 0, 0) });
    }
    const text = safe(p.text);
    if (!text) continue;
    let size = r.size;
    const room = p.mode === 'blank' ? Math.max(r.w - 4, 40) : p.tail ? r.w + 2 : Math.max(r.w, W - 36 - r.x);
    const minSize = p.tail ? Math.max(6, r.size * 0.72) : 6;
    while (size > minSize && font.widthOfTextAtSize(text, size) > room) size -= 0.25;
    const x = p.mode === 'blank' ? r.x + Math.max(2, (r.w - font.widthOfTextAtSize(text, size)) / 2) : r.x;
    page.drawText(text, { x, y: H - r.y - r.size * 0.85 + (p.mode === 'blank' ? 1.5 : 0), size, font, color: rgb(0.05, 0.1, 0.35) });
  }
  const state = doc.signature ? verifySeal(t, doc) : 'none';
  if (doc.signature && state === 'valid' && plan.signature) {
    const s = plan.signature;
    const page = pdf.getPage(s.page);
    const H = page.getHeight();
    const img = await pdf.embedPng(dataUrlBytes(doc.signature.png));
    const at = placeSignature(layout, s, img.width / img.height);
    // clear whatever was signed there before (a scanned or drawn signature is not text, so nothing else removes it)
    // across the whole blank, from just above the next printed line below (the caption) up to the image's free height,
    // then redraw the rule — nothing printed is erased because placeSignature kept that box free of text
    const pg = layout.pages[s.page];
    const below = pg.lines.filter((l) => l.top > s.y + 0.5).sort((a, b) => a.top - b.top)[0];
    const base = H - s.y - s.size * 0.85;
    const floor = below ? Math.max(H - below.top + 1, base - s.size * 1.2) : base - s.size * 0.8;
    const above = pg.lines.filter((l) => l.top + l.h < s.y - 0.5).sort((a, b) => b.top - a.top)[0];
    const ceiling = above ? Math.min(H - (above.top + above.h) - 1, base + 70) : base + 70;
    const left = Math.min(at.x, s.x) - 2, right = Math.max(at.x + at.w, s.x + s.w) + 2;
    page.drawRectangle({ x: left, y: floor, width: right - left, height: Math.max(base + at.h + 2, ceiling) - floor, color: rgb(1, 1, 1) });
    page.drawLine({ start: { x: s.x, y: base - s.size * 0.12 }, end: { x: s.x + s.w, y: base - s.size * 0.12 }, thickness: 0.6, color: rgb(0, 0, 0) });
    page.drawImage(img, { x: at.x, y: H - at.bottom, width: at.w, height: at.h });
  }
  const last = pdf.getPage(pdf.getPageCount() - 1);
  const foot = state === 'valid' ? 'Signed by ' + doc.signature!.signer + ' · sealed SHA-256 ' + shortHash(doc.signature!.hash) : state === 'broken' ? 'UNSIGNED COPY - content changed after signing' : 'Not signed';
  last.drawText(safe('Filled with HelmDocs from the original form · ' + doc.name + ' · ' + foot), { x: 36, y: 18, size: 6.5, font, color: rgb(0.45, 0.45, 0.45) });
  return { bytes: await pdf.save(), plan };
}

let unicodeFontBytes: Promise<ArrayBuffer | null> | null = null;
/** DejaVu Sans (free licence, public/fonts) — covers Cyrillic, Latin Extended and Greek. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function embedUnicode(pdf: any) {
  try {
    if (!unicodeFontBytes) unicodeFontBytes = fetch(import.meta.env.BASE_URL + 'fonts/DejaVuSans.ttf').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
    const bytes = await unicodeFontBytes;
    if (!bytes) return null;
    const fontkit = (await import('@pdf-lib/fontkit')).default;
    pdf.registerFontkit(fontkit);
    return await pdf.embedFont(bytes, { subset: true });
  } catch { return null; }
}

/** Remove annotations (FreeText, Ink, Stamp, form widgets …) whose rectangle overlaps any zone (top-left PDF coordinates). */
function removeAnnotationsOver(pdf: PDFDocumentT, lib: PdfLib, zones: { page: number; x: number; y: number; w: number; h: number }[]) {
  const { PDFName, PDFArray, PDFDict, PDFNumber } = lib;
  pdf.getPages().forEach((page, pi) => {
    const mine = zones.filter((z) => z.page === pi);
    const annots = page.node.Annots();
    if (!annots || !mine.length) return;
    const H = page.getHeight();
    for (let i = annots.size() - 1; i >= 0; i--) {
      const a = annots.lookup(i);
      if (!(a instanceof PDFDict)) continue;
      const rect = a.lookup(PDFName.of('Rect'));
      if (!(rect instanceof PDFArray) || rect.size() !== 4) continue;
      const [x1, y1, x2, y2] = rect.asArray().map((n) => (n instanceof PDFNumber ? n.asNumber() : 0));
      const top = H - Math.max(y1, y2), bottom = H - Math.min(y1, y2), left = Math.min(x1, x2), right = Math.max(x1, x2);
      if (mine.some((z) => left < z.x + z.w && right > z.x && top < z.y + z.h && bottom > z.y)) annots.remove(i);
    }
  });
}
type PdfLib = typeof import('pdf-lib');
type PDFDocumentT = import('pdf-lib').PDFDocument;
