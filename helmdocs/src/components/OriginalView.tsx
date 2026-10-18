import { useEffect, useRef, useState } from 'react';
import type { Field } from '../data/types';
import { getOriginal, type Original } from '../engine/originals';
import { findRects, layoutOf, loadPdf, type PdfLayout, type Rect } from '../engine/pdfLayout';

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
      {doc && layout && (() => { const all: Mark[] = marks ? marks(layout) : fields.flatMap((f) => findRects(layout, f.sample, 2).map((r) => ({ r, key: f.key, label: f.label + ' · ' + f.type }))); return layout.pages.map((pg, i) => <PdfPage key={i} doc={doc} index={i} page={pg} width={width} rects={all.filter((m) => m.r.page === i)} />); })()}
      {(!doc || !layout) && <div className="paper" style={{ minHeight: 300 }}>Rendering pages…</div>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PdfPage({ doc, index, page, width, rects }: { doc: any; index: number; page: { width: number; height: number }; width: number; rects: Mark[] }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = width / page.width;
  useEffect(() => {
    let task: { cancel: () => void; promise: Promise<void> } | null = null;
    void doc.getPage(index + 1).then((p: { getViewport: (o: { scale: number }) => { width: number; height: number }; render: (o: unknown) => { cancel: () => void; promise: Promise<void> } }) => {
      const c = canvas.current; if (!c) return;
      const dpr = window.devicePixelRatio || 1;
      const vp = p.getViewport({ scale: scale * dpr });
      c.width = vp.width; c.height = vp.height;
      c.style.width = vp.width / dpr + 'px'; c.style.height = vp.height / dpr + 'px';
      task = p.render({ canvasContext: c.getContext('2d'), viewport: vp });
      task.promise.catch(() => undefined);
    });
    return () => task?.cancel();
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

function highlightHtml(html: string, fields: Pick<Field, 'key' | 'label' | 'sample'>[]): string {
  const doc = new DOMParser().parseFromString('<div>' + html + '</div>', 'text/html');
  doc.querySelectorAll('script,style,iframe,object').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((el) => { for (const a of Array.from(el.attributes)) if (/^on/i.test(a.name)) el.removeAttribute(a.name); });
  const samples = fields.map((f) => ({ f, s: f.sample.trim() })).filter((x) => x.s.length >= 2).sort((a, b) => b.s.length - a.s.length);
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = []; while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  for (const node of nodes) {
    let text = node.data;
    const hits: { start: number; end: number; f: Pick<Field, 'key' | 'label' | 'sample'> }[] = [];
    for (const { f, s } of samples) {
      const i = text.indexOf(s);
      if (i >= 0 && !hits.some((h) => i < h.end && i + s.length > h.start)) hits.push({ start: i, end: i + s.length, f });
    }
    if (!hits.length) continue;
    hits.sort((a, b) => a.start - b.start);
    const frag = doc.createDocumentFragment(); let at = 0;
    for (const h of hits) {
      frag.append(text.slice(at, h.start));
      const m = doc.createElement('mark'); m.className = 'ohl'; m.title = h.f.label; m.setAttribute('data-field', h.f.key); m.textContent = text.slice(h.start, h.end);
      frag.append(m); at = h.end;
    }
    frag.append(text.slice(at)); text = '';
    node.replaceWith(frag);
  }
  return (doc.body.firstChild as HTMLElement).innerHTML;
}

export function DocxView({ bytes, fields }: { bytes: ArrayBuffer; fields: Pick<Field, 'key' | 'label' | 'sample'>[] }) {
  const [html, setHtml] = useState<string | null>(null);
  useEffect(() => { let live = true; void import('mammoth').then((m) => m.convertToHtml({ arrayBuffer: bytes.slice(0) })).then((r) => live && setHtml(r.value)).catch(() => live && setHtml('<p>Could not render this Word file.</p>')); return () => { live = false; }; }, [bytes]);
  return <div className="paper original-docx" data-testid="original-docx" dangerouslySetInnerHTML={{ __html: html === null ? '<p>Rendering…</p>' : highlightHtml(html, fields) }} />;
}

function TextView({ text, fields }: { text: string; fields: Field[] }) {
  const esc = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return <div className="paper original-docx" data-testid="original-text" style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--font-m)', fontSize: 12.5 }} dangerouslySetInnerHTML={{ __html: highlightHtml(esc, fields) }} />;
}
