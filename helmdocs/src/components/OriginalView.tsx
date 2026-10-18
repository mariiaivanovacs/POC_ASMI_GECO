import { useEffect, useRef, useState } from 'react';
import type { Field } from '../data/types';
import { getOriginal, type Original } from '../engine/originals';
import { findRects, layoutOf, loadPdf, type PdfLayout, type Rect } from '../engine/pdfLayout';
import { planFill } from '../engine/fillPdf';

/**
 * The uploaded form exactly as it was received — the real PDF pages (pdf.js), the Word document's own content
 * (mammoth → HTML) or the text file — with every detected field highlighted where its value sits.
 */
export function OriginalView({ ownerId, fields, onMissing }: { ownerId: string; fields: Field[]; onMissing?: () => void }) {
  const [orig, setOrig] = useState<Original | null | undefined>(undefined);
  useEffect(() => { let live = true; setOrig(undefined); void getOriginal(ownerId).then((o) => { if (live) { setOrig(o); if (!o) onMissing?.(); } }); return () => { live = false; }; }, [ownerId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (orig === undefined) return <div className="paper" style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Opening the original file…</div>;
  if (!orig) return null;
  if (orig.ext === 'pdf') return <PdfPages bytes={orig.bytes} fields={fields} />;
  if (orig.ext === 'docx') return <DocxView bytes={orig.bytes} fields={fields} />;
  return <TextView text={new TextDecoder().decode(orig.bytes)} fields={fields} />;
}

const HL = 'rgba(59,130,246,.22)';

/** Where each field sits on the page — its value if the form was filled in, otherwise the blank (or the gap after its label). */
function highlightMarks(layout: PdfLayout, fields: Field[]): Mark[] {
  const plan = planFill(layout, { id: '', name: '', regime: '', regimeShort: '', fields, sections: [] }, Object.fromEntries(fields.map((f) => [f.key, f.sample])));
  const placed = plan.placements.map((p) => ({ r: p.rect, key: p.field.key, label: p.field.label + ' · ' + p.field.type }));
  // repeated values (one person as contact and signatory) are highlighted wherever they appear
  const extra = fields.filter((f) => f.sample.trim().length >= 4).flatMap((f) => findRects(layout, f.sample, 3).filter((r) => !placed.some((m) => m.r.page === r.page && Math.abs(m.r.x - r.x) < 1 && Math.abs(m.r.y - r.y) < 1)).map((r) => ({ r, key: f.key, label: f.label + ' · ' + f.type })));
  return [...placed, ...extra];
}
const HL_LINE = 'rgba(59,130,246,.85)';

export interface Mark { r: Rect; key: string; label: string; color?: string }

export function PdfPages({ bytes, fields = [], marks }: { bytes: ArrayBuffer; fields?: Field[]; marks?: (layout: PdfLayout) => Mark[] }) {
  const host = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [doc, setDoc] = useState<any>(null);
  const [layout, setLayout] = useState<PdfLayout | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [width, setWidth] = useState(640);
  useEffect(() => { let live = true; loadPdf(bytes).then(async (d) => { if (!live) return; setDoc(d); setLayout(await layoutOf(d)); }).catch(() => live && setErr('Could not render this PDF.')); return () => { live = false; }; }, [bytes]);
  useEffect(() => { const el = host.current; if (!el) return; const ro = new ResizeObserver(() => setWidth(Math.min(820, el.clientWidth - 8))); ro.observe(el); return () => ro.disconnect(); }, []);
  if (err) return <div className="paper">{err}</div>;
  return (
    <div ref={host} style={{ display: 'flex', flexDirection: 'column', gap: 14, alignItems: 'center' }} data-testid="original-pdf">
      {doc && layout && (() => { const all: Mark[] = marks ? marks(layout) : highlightMarks(layout, fields); return layout.pages.map((pg, i) => <PdfPage key={i} doc={doc} index={i} page={pg} width={width} rects={all.filter((m) => m.r.page === i)} />); })()}
      {(!doc || !layout) && <div className="paper" style={{ minHeight: 300 }}>Rendering pages…</div>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PdfPage({ doc, index, page, width, rects }: { doc: any; index: number; page: { width: number; height: number }; width: number; rects: Mark[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = width / page.width;
  useEffect(() => {
    // one render at a time per canvas: a render that starts after this effect was cleaned up must not run at all,
    // otherwise two pdf.js renders paint the same canvas and the page comes out scrambled
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    let cancelled = false;
    void doc.getPage(index + 1).then((p: { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: unknown) => { cancel: () => void; promise: Promise<void> } }) => {
      const c = canvas.current; if (!c || cancelled) return;
      const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: scale * dpr });
      c.width = vp.width; c.height = vp.height;
      c.style.width = vp.width / dpr + 'px'; c.style.height = vp.height / dpr + 'px';
      task = p.render({ canvasContext: c.getContext('2d'), viewport: vp });
      task.promise.catch(() => undefined);
    });
    return () => { cancelled = true; task?.cancel(); };
  }, [doc, index, scale]);
  return (
    <div style={{ position: 'relative', boxShadow: '0 8px 28px rgba(0,0,0,.35)', background: '#fff', lineHeight: 0 }} data-testid="original-page">
      <canvas ref={canvas} />
      {rects.map(({ r, key, label, color }, k) => (
        <div key={key + k} title={label} data-testid="original-hl" data-field={key}
          style={{ position: 'absolute', left: r.x * scale - 2, top: r.y * scale - 1, width: r.w * scale + 4, height: r.h * scale + 2, background: color ? color.replace('1)', '.16)') : HL, borderBottom: '2px solid ' + (color || HL_LINE), borderRadius: 3, pointerEvents: 'auto', cursor: 'help' }} />
      ))}
    </div>
  );
}

type HlField = Pick<Field, 'key' | 'label' | 'sample'> & Partial<Pick<Field, 'anchor' | 'anchorNth' | 'anchorAfter' | 'source'>>;

/** Mark each field inside the paragraph it came from: its value, its blank (n-th underscore run) or the label it follows. */
function highlightHtml(html: string, fields: HlField[]): string {
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  doc.querySelectorAll('script,style,iframe,object').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => { for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name)) el.removeAttribute(a.name); });
  const ws = (x: string) => x.replace(/\s+/g, '').toLowerCase();
  const blocks = Array.from(doc.body.querySelectorAll('p,h1,h2,h3,h4,h5,h6,li,td,th,pre'));
  if (!blocks.length) blocks.push(doc.body);
  const done = new Set<string>();
  for (const block of blocks) {
    const walker = doc.createTreeWalker(block, NodeFilter.SHOW_TEXT);
    const nodes: { n: Text; start: number }[] = []; let text = '';
    while (walker.nextNode()) { const n = walker.currentNode as Text; nodes.push({ n, start: text.length }); text += n.data; }
    if (!text.trim()) continue;
    const bt = ws(text);
    const hits: { start: number; end: number; f: HlField }[] = [];
    const free = (a: number, b: number) => !hits.some((h) => a < h.end && b > h.start);
    for (const f of [...fields].sort((a, b) => (b.sample || b.anchor || '').length - (a.sample || a.anchor || '').length)) {
      const src = ws(f.source || '');
      const here = !src || bt === src || (bt.length > 6 && src.includes(bt)) || (src.length > 6 && bt.includes(src));
      let at = -1, end = -1;
      const sample = (f.sample || '').trim();
      if (sample.length >= 2) { at = text.indexOf(sample); end = at + sample.length; if (at >= 0 && !here && done.has(f.key + ':' + sample)) at = -1; }
      else if (here && f.anchor && /^_+$/.test(f.anchor)) { const r = [...text.matchAll(/_+/g)][f.anchorNth ?? 0]; if (r) { at = r.index!; end = at + r[0].length; } }
      else if (here && f.anchor) { at = text.indexOf(f.anchor); end = at + f.anchor.length; }
      else if (here && f.anchorAfter) { at = text.indexOf(f.anchorAfter); end = at + f.anchorAfter.length; }
      if (at >= 0 && free(at, end)) { hits.push({ start: at, end, f }); done.add(f.key + ':' + sample); }
    }
    // wrap each hit, splitting it across the text nodes it spans
    for (const h of hits.sort((a, b) => b.start - a.start)) {
      for (const { n, start } of [...nodes].reverse()) {
        const a = Math.max(h.start, start), b = Math.min(h.end, start + n.data.length);
        if (a >= b) continue;
        const range = doc.createRange(); range.setStart(n, a - start); range.setEnd(n, b - start);
        const m = doc.createElement('mark'); m.className = 'ohl'; m.title = h.f.label; m.setAttribute('data-field', h.f.key);
        range.surroundContents(m);
      }
    }
  }
  return (doc.body.firstChild as HTMLElement).innerHTML;
}

export function DocxView({ bytes, fields }: { bytes: ArrayBuffer; fields: HlField[] }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => { let live = true; void import('mammoth').then((m) => m.convertToHtml({ arrayBuffer: bytes.slice(0) })).then((r) => live && setHtml(r.value)).catch(() => live && setHtml('<p>Could not render this Word file.</p>')); return () => { live = false; }; }, [bytes]);
  return <div className="paper original-docx" data-testid="original-docx" dangerouslySetInnerHTML={{ __html: html === null ? '<p>Rendering…</p>' : highlightHtml(html, fields) }} />;
}

function TextView({ text, fields }: { text: string; fields: Field[] }) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return <div className="paper original-docx" data-testid="original-text" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-m)', fontSize: 12.5 }} dangerouslySetInnerHTML={{ __html: highlightHtml(esc, fields) }} />;
}
