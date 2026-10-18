// Where each piece of text sits on a PDF page — used to highlight detected fields on the real page (step 1) and to
// write new values and the signature onto the original PDF (export). Coordinates are PDF points, origin top-left.
export interface Rect { page: number; x: number; y: number; w: number; h: number; size: number }
export interface Line { text: string; xs: number[]; xEnd: number; top: number; h: number; size: number }
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
export function rectOf(page: number, l: Line, start: number, end: number): Rect {
  const x = l.xs[start] ?? l.xEnd;
  const xr = end < l.xs.length ? l.xs[end] : l.xEnd;
  return { page, x, y: l.top, w: Math.max(4, xr - x), h: l.h, size: l.size };
}

/** Lines whose text is the given source line (whitespace ignored — PDF text and extracted text space differently). */
export function sourceLines(layout: PdfLayout, source: string): { page: number; line: Line }[] {
  const k = (t: string) => t.replace(/\s+/g, '').toLowerCase();
  const src = k(source);
  if (!src) return [];
  const out: { page: number; line: Line }[] = [];
  layout.pages.forEach((pg, page) => { for (const line of pg.lines) { const t = k(line.text); if (t && (t === src || (t.length > 6 && src.includes(t)) || (src.length > 6 && t.includes(src)))) out.push({ page, line }); } });
  return out;
}

/** The n-th run of underscores on a line (0 = first). */
export function underscoreRun(page: number, l: Line, n: number): Rect | null {
  const runs = [...l.text.matchAll(/_+/g)];
  const r = runs[n];
  return r ? rectOf(page, l, r.index!, r.index! + r[0].length) : null;
}

export function findRects(layout: PdfLayout, needle: string, max = 4): Rect[] {
  const n = squash(needle);
  if (!n) return [];
  const out: Rect[] = [];
  for (const ci of [false, true]) {
    layout.pages.forEach((pg, pi) => {
      for (const l of pg.lines) {
        const hay = ci ? l.text.toLowerCase() : l.text;
        const nd = ci ? n.toLowerCase() : n;
        for (let idx = hay.indexOf(nd); idx >= 0; idx = hay.indexOf(nd, idx + 1)) out.push(rectOf(pi, l, idx, idx + n.length));
      }
    });
    if (out.length) break;
  }
  if (!out.length) {
    // last resort: ignore spacing entirely (text extracted with different spacing than the page draws)
    const target = n.replace(/\s+/g, '').toLowerCase();
    layout.pages.forEach((pg, pi) => {
      for (const l of pg.lines) {
        const idx: number[] = []; let flat = '';
        for (let k = 0; k < l.text.length; k++) if (!/\s/.test(l.text[k])) { idx.push(k); flat += l.text[k].toLowerCase(); }
        for (let at = flat.indexOf(target); at >= 0 && target; at = flat.indexOf(target, at + 1)) out.push(rectOf(pi, l, idx[at], idx[at + target.length - 1] + 1));
      }
    });
  }
  return out.slice(0, max);
}

/** The blank signature line ("Signature: ______") — where the signature image goes. */
const SIGN_CAPTION = /\((?:[^()]*?)(подпис|signature|sign\b|tandatangan|签名|签字)[^()]*\)/iu;
export function findSignatureLine(layout: PdfLayout): Rect | null {
  // "(подпись)" printed under a blank: the signature goes on the blank right above the caption
  for (let pi = layout.pages.length - 1; pi >= 0; pi--) {
    const pg = layout.pages[pi];
    for (const cap of pg.lines) {
      const m = cap.text.match(SIGN_CAPTION);
      if (!m || m.index === undefined) continue;
      const cx = ((cap.xs[m.index] ?? 0) + (cap.xs[m.index + m[0].length - 1] ?? cap.xEnd)) / 2;
      const above = pg.lines.filter((l) => l.top < cap.top && cap.top - l.top < cap.h * 3 && /_{3,}/.test(l.text)).sort((a, b) => b.top - a.top)[0];
      if (!above) continue;
      const runs = [...above.text.matchAll(/_{3,}/g)].map((r) => rectOf(pi, above, r.index!, r.index! + r[0].length));
      const best = runs.sort((a, b) => Math.abs(a.x + a.w / 2 - cx) - Math.abs(b.x + b.w / 2 - cx))[0];
      if (best) return best;
    }
  }
  for (let pi = layout.pages.length - 1; pi >= 0; pi--) {
    const pg = layout.pages[pi];
    for (let i = pg.lines.length - 1; i >= 0; i--) {
      const l = pg.lines[i];
      const m = l.text.match(/_{4,}/);
      if (m && m.index !== undefined && /sign|подпис|tandatangan/i.test(l.text)) {
        const x = l.xs[m.index], end = m.index + m[0].length;
        return { page: pi, x, y: l.top, w: (end < l.xs.length ? l.xs[end] : l.xEnd) - x, h: l.h, size: l.size };
      }
    }
  }
  for (let pi = layout.pages.length - 1; pi >= 0; pi--) {
    const l = [...layout.pages[pi].lines].reverse().find((x) => /^\s*(signature|подпись)/i.test(x.text));
    if (l) { const k = l.text.toLowerCase().indexOf('signature') + 'signature'.length + 2; const x = l.xs[Math.min(k, l.xs.length - 1)] ?? l.xEnd; return { page: pi, x, y: l.top, w: 160, h: l.h, size: l.size }; }
  }
  return null;
}
