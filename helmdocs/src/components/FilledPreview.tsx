import { useEffect, useState } from 'react';
import type { Doc, Template } from '../data/types';
import { buildFilledPdf, type FillPlan } from '../engine/fillPdf';
import { getOriginal } from '../engine/originals';
import { DocxView, PdfPages } from './OriginalView';
import { buildFilledDocx, type DocxFill } from '../engine/fillDocx';

/** Live preview of the original PDF with this document's values written onto it (rebuilt a moment after each edit). */
export function FilledPreview({ template, doc }: { template: Template; doc: Doc }) {
  const [out, setOut] = useState<{ bytes: ArrayBuffer; plan: FillPlan } | null>(null);
  const [dout, setDout] = useState<{ bytes: ArrayBuffer; fill: DocxFill } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const sigKey = doc.signature ? doc.signature.hash : '';
  useEffect(() => {
    let live = true;
    const t = setTimeout(async () => {
      try {
        const o = await getOriginal(template.id);
        if (o && o.ext === 'docx') { const f = await buildFilledDocx(o.bytes, template, doc); if (live) { setDout({ bytes: f.bytes.slice().buffer, fill: f }); setErr(null); } return; }
        if (!o || o.ext !== 'pdf') { if (live) setErr('The original file is not stored for this template.'); return; }
        const r = await buildFilledPdf(o.bytes, template, doc);
        if (live) { setOut({ bytes: r.bytes.slice().buffer, plan: r.plan }); setErr(null); }
      } catch (e) { if (live) setErr('Could not fill the original PDF (' + (e instanceof Error ? e.message : 'error') + ').'); }
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [template, doc.values, sigKey, doc.name]); // eslint-disable-line react-hooks/exhaustive-deps
  if (err) return <div className="paper" data-testid="filled-error">{err}</div>;
  if (dout) {
    const changed = dout.fill.placements.filter((p) => p.changed && p.text);
    return (
      <div data-testid="filled-preview" data-changed={changed.length} data-unplaced={dout.fill.unplaced.length} data-signed={dout.fill.signed}>
        {dout.fill.unplaced.length > 0 && <div className="rulecard out" style={{ marginBottom: 10 }} data-testid="filled-unplaced"><span>Not found in the original Word file, so not written into it: <b>{dout.fill.unplaced.map((f) => f.label).join(', ')}</b>.</span></div>}
        <DocxView key={dout.bytes.byteLength + ':' + changed.length + ':' + sigKey} bytes={dout.bytes} fields={changed.map((p) => ({ key: p.field.key, label: p.field.label, sample: p.text }))} />
      </div>
    );
  }
  if (!out) return <div className="paper" style={{ minHeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#666' }}>Filling the original form…</div>;
  const changed = out.plan.placements.filter((p) => p.changed);
  return (
    <div data-testid="filled-preview" data-changed={changed.length} data-unplaced={out.plan.unplaced.length}>
      {out.plan.unplaced.length > 0 && (
        <div className="rulecard out" style={{ marginBottom: 10 }} data-testid="filled-unplaced"><span>Not found on the original page, so not written onto it: <b>{out.plan.unplaced.map((f) => f.label).join(', ')}</b>. Use <b>Export clean PDF</b> to include them.</span></div>
      )}
      <PdfPages key={out.bytes.byteLength + ':' + changed.length + ':' + sigKey} bytes={out.bytes} marks={() => changed.map((p) => ({ r: p.rect, key: p.field.key, label: p.field.label + ': ' + p.text, color: 'rgba(34,160,90,1)' }))} />
    </div>
  );
}
