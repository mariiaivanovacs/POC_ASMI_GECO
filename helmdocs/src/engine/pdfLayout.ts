// Where each piece of text sits on a PDF page — used to highlight detected fields on the real page (step 1) and to
// write new values and the signature onto the original PDF (export). Coordinates are PDF points, origin top-left.
export interface Rect { page: number; x: number; y: number; w: number; h: number; size: number }
interface Line { text: string; xs: number[]; xEnd: number; top: number; h: number; size: number }
export interface PageLayout { width: number; height: number; lines: Line[] }
export interface PdfLayout { pages: PageLayout[] }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadPdf(bytes: ArrayBuffer): Promise<any> {
  const pdfjs = await import('pdfjs-dist');
  const worker = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  return pdfjs.getDocument({ data: bytes.slice(0) }).promise;
}

let ctx: CanvasRenderingContext2D | null | undefined;
function measure(s: string, size: number): number {
  if (ctx === undefined) { try { ctx = document.createElement('canvas').getContext('2d'); } catch { ctx = null; } }
  if (!ctx) return s.length * size * 0.5;
  ctx.font = size + 'px Helvetica, Arial, sans-serif';
  return ctx.measureText(s).width;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function layoutOf(doc: any): Promise<PdfLayout> {
  const pages: PageLayout[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const vp = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    type Item = { str: string; transform: number[]; width: number; height: number };
    const items = (content.items as Item[]).filter((i) => typeof i.str === 'string' && i.str.length);
    // group by baseline into lines, left to right
    const rows: { base: number; items: Item[] }[] = [];
    for (const it of items) {
      const base = it.transform[5];
      const row = rows.find((r) => Math.abs(r.base - base) <= 2);
      if (row) row.items.push(it); else rows.push({ base, items: [it] });
    }
    rows.sort((a, b) => b.base - a.base);
    const lines: Line[] = rows.map((r) => {
      r.items.sort((a, b) => a.transform[4] - b.transform[4]);
      let text = ''; const xs: number[] = []; let size = 10; let xEnd = 0;
      for (const it of r.items) {
        size = Math.abs(it.transform[3]) || it.height || size;
        const x0 = it.transform[4];
        if (text && x0 - xEnd > size * 0.15) { xs.push(xEnd); text += ' '; }
        // spread the item's width over its characters in proportion to their measured widths
        const total = measure(it.str, size) || 1;
        let acc = 0;
        for (const ch of it.str) { xs.push(x0 + (acc / total) * it.width); acc += measure(ch, size); text += ch; }
        xEnd = x0 + it.width;
      }
      return { text, xs, xEnd, top: vp.height - r.base - size * 0.85, h: size * 1.15, size };
    });
    pages.push({ width: vp.width, height: vp.height, lines });
  }
  return { pages };
}

const squash = (s: string) => s.replace(/\s+/g, ' ').trim();

/** Every place `needle` appears on the pages (first occurrence per line). Whitespace-insensitive, case-sensitive first, then case-insensitive. */
export function findRects(layout: PdfLayout, needle: string, max = 4): Rect[] {
  const n = squash(needle);
  if (!n) return [];
  const out: Rect[] = [];
  for (const ci of [false, true]) {
    layout.pages.forEach((pg, pi) => {
      for (const l of pg.lines) {
        const hay = ci ? l.text.toLowerCase() : l.text;
        const idx = hay.indexOf(ci ? n.toLowerCase() : n);
        if (idx < 0) continue;
        const end = idx + n.length;
        const x = l.xs[idx];
        const xr = end < l.xs.length ? l.xs[end] : l.xEnd;
        out.push({ page: pi, x, y: l.top, w: Math.max(4, xr - x), h: l.h, size: l.size });
      }
    });
    if (out.length) break;
  }
  return out.slice(0, max);
}

/** The blank signature line ("Signature: ______") — where the signature image goes. */
export function findSignatureLine(layout: PdfLayout): Rect | null {
  for (let pi = layout.pages.length - 1; pi >= 0; pi--) {
    const pg = layout.pages[pi];
    for (let i = pg.lines.length - 1; i >= 0; i--) {
      const l = pg.lines[i];
      const m = l.text.match(/_{4,}/);
      if (m && m.index !== undefined && /sign/i.test(l.text)) {
        const x = l.xs[m.index], end = m.index + m[0].length;
        return { page: pi, x, y: l.top, w: (end < l.xs.length ? l.xs[end] : l.xEnd) - x, h: l.h, size: l.size };
      }
    }
  }
  for (let pi = layout.pages.length - 1; pi >= 0; pi--) {
    const l = [...layout.pages[pi].lines].reverse().find((x) => /^\s*signature\b/i.test(x.text));
    if (l) { const k = l.text.toLowerCase().indexOf('signature') + 'signature'.length + 2; const x = l.xs[Math.min(k, l.xs.length - 1)] ?? l.xEnd; return { page: pi, x, y: l.top, w: 160, h: l.h, size: l.size }; }
  }
  return null;
}
