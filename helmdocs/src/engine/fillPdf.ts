import type { Doc, Field, Template } from '../data/types';
import { evaluateRule } from './assemble';
import { lineKeys } from './fields';
import { findRects, findSignatureLine, layoutOf, loadPdf, type PdfLayout, type Rect } from './pdfLayout';
import { dataUrlBytes, shortHash, verifySeal } from './signature';

type Tpl = Pick<Template, 'id' | 'fields' | 'sections' | 'regimeShort' | 'regime' | 'name'>;
export interface Placement { field: Field; rect: Rect; text: string; changed: boolean }
export interface FillPlan { placements: Placement[]; unplaced: Field[]; signature: Rect | null }

const squash = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

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
  const placements: Placement[] = [];
  const unplaced: Field[] = [];
  // fields with the most specific (longest) samples claim their spots first
  const order = [...t.fields].filter((f) => f.sample.trim()).sort((a, b) => b.sample.length - a.sample.length);
  for (const f of order) {
    const rects = findRects(layout, f.sample, 12).filter((r) => !used.has(id(r)));
    const src = squash(f.source || '');
    const onSource = rects.find((r) => { const lt = squash(lineText(r)); return !!src && (lt.includes(src) || src.includes(lt)); });
    const pick = onSource || (f.sample.trim().length >= 4 ? rects[0] : undefined);
    if (!pick) { unplaced.push(f); continue; }
    used.add(id(pick));
    const text = omitted.has(f.key) ? 'N/A' : (values[f.key] ?? '');
    placements.push({ field: f, rect: pick, text, changed: text !== f.sample });
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
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const pdf = await PDFDocument.load(bytes.slice(0));
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const safe = (s: string) => Array.from(s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-')).map((ch) => { try { font.encodeText(ch); return ch; } catch { return '?'; } }).join('');
  for (const p of plan.placements) {
    if (!p.changed) continue;
    const page = pdf.getPage(p.rect.page);
    const H = page.getHeight(), W = page.getWidth();
    const r = p.rect;
    page.drawRectangle({ x: r.x - 1, y: H - r.y - r.h, width: r.w + 2, height: r.h, color: rgb(1, 1, 1) });
    const text = safe(p.text);
    if (!text) continue;
    let size = r.size;
    const room = Math.max(r.w, W - 36 - r.x);
    while (size > 6 && font.widthOfTextAtSize(text, size) > room) size -= 0.5;
    page.drawText(text, { x: r.x, y: H - r.y - r.size * 0.85, size, font, color: rgb(0.05, 0.1, 0.35) });
  }
  const state = doc.signature ? verifySeal(t, doc) : 'none';
  if (doc.signature && state === 'valid' && plan.signature) {
    const s = plan.signature;
    const page = pdf.getPage(s.page);
    const H = page.getHeight();
    const img = await pdf.embedPng(dataUrlBytes(doc.signature.png));
    const at = placeSignature(layout, s, img.width / img.height);
    page.drawImage(img, { x: at.x, y: H - at.bottom, width: at.w, height: at.h });
  }
  const last = pdf.getPage(pdf.getPageCount() - 1);
  const foot = state === 'valid' ? 'Signed by ' + doc.signature!.signer + ' · sealed SHA-256 ' + shortHash(doc.signature!.hash) : state === 'broken' ? 'UNSIGNED COPY - content changed after signing' : 'Not signed';
  last.drawText(safe('Filled with HelmDocs from the original form · ' + doc.name + ' · ' + foot), { x: 36, y: 18, size: 6.5, font, color: rgb(0.45, 0.45, 0.45) });
  return { bytes: await pdf.save(), plan };
}
