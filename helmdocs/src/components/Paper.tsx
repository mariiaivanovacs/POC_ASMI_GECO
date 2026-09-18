import { useEffect, useRef } from 'react';
import type { Field, Line, Section } from '../data/types';
import { assemble, ruleText } from '../engine/assemble';
import { PLACEHOLDER, fieldByKey, sectionLabel, signatureFields, templateStats } from '../engine/template';
import { Ic } from './ui/Icons';

export type PaperMode = 'static' | 'dynamic' | 'live';

/** A text selection made on the paper: which prose line it sits in, the text, and where to anchor a popover. */
export interface PaperSelection { sectionId: string; lineIndex: number; text: string; x: number; y: number; problem?: string }

export interface PaperSeal { png: string; signer: string; signedAt: string; hash: string; state: 'valid' | 'broken' }
interface Props { fields: Field[]; sections: Section[]; mode: PaperMode; values: Record<string, string>; formCode?: string; onSelect?: (sel: PaperSelection | null) => void; seal?: PaperSeal | null }

function Value({ k, fields, values, mode }: { k: string; fields: Field[]; values: Record<string, string>; mode: PaperMode }) {
  const f = fieldByKey(fields, k);
  if (mode === 'dynamic') return <span className="fld dynamic" data-testid="merge-field" data-key={k}>{'{{' + k + '}}'}</span>;
  const v = (mode === 'static' ? f?.sample : values[k]) || '';
  if (mode === 'static') return <span className={'fld static' + (f?.manual ? ' manual' : '')} data-testid="static-field" data-key={k} title={f?.manual ? 'Added from a selection' : undefined}>{v || '______'}</span>;
  return v ? <span className="fld val" data-testid="live-field" data-key={k}>{v}</span> : <span className="fld miss" data-testid="live-field" data-key={k} data-missing="true">______</span>;
}

function TextLine({ line, fields, values, mode, sectionId, index }: { line: Extract<Line, { kind: 'text' }>; fields: Field[]; values: Record<string, string>; mode: PaperMode; sectionId: string; index: number }) {
  const parts: JSX.Element[] = [];
  let last = 0, i = 0;
  for (const m of line.text.matchAll(PLACEHOLDER)) {
    if (m.index! > last) parts.push(<span key={i++}>{line.text.slice(last, m.index)}</span>);
    parts.push(<Value key={i++} k={m[1]} fields={fields} values={values} mode={mode} />);
    last = m.index! + m[0].length;
  }
  if (last < line.text.length) parts.push(<span key={i++}>{line.text.slice(last)}</span>);
  return <p data-line={sectionId + ':' + index}>{parts}</p>;
}

/** The paper document: the same component renders the original form, the dynamic template and the live assembled document. */
export function Paper({ fields, sections, mode, values, formCode, onSelect, seal }: Props) {
  const a = mode === 'live' ? assemble({ fields, sections, regimeShort: '', name: '' }, values) : null;
  const stats = templateStats({ fields, sections });
  const sig = signatureFields(fields, sections);
  const ref = useRef<HTMLDivElement>(null);

  // a selection inside one prose line is offered as a new field (Templates screen). The listener sits on the
  // document so releasing the mouse outside the paper, or selecting with the keyboard, still works.
  useEffect(() => {
    if (!onSelect) return;
    const handler = (e: Event) => {
      if ((e.target as Element | null)?.closest?.('.addfield')) return; // typing or clicking in the popover keeps the selection
      const selection = window.getSelection();
      const text = selection?.toString().replace(/\s+/g, ' ').trim() || '';
      if (!selection || !text || selection.rangeCount === 0) { onSelect(null); return; }
      const range = selection.getRangeAt(0);
      const host = ref.current;
      if (!host || !host.contains(range.commonAncestorContainer)) { onSelect(null); return; }
      const node = (n: Node | null) => (n && n.nodeType === Node.TEXT_NODE ? n.parentElement : (n as Element | null));
      const a = node(range.startContainer), b = node(range.endContainer);
      const r = range.getBoundingClientRect(); const hr = host.getBoundingClientRect();
      const at = { x: r.left - hr.left + r.width / 2, y: r.bottom - hr.top };
      const bad = (problem: string) => onSelect({ sectionId: '', lineIndex: -1, text, problem, ...at });
      if (a?.closest('.fld') || b?.closest('.fld')) { bad('“' + text + '” is already part of a field — pick text that is still fixed content.'); return; }
      if (a?.closest('.plbl') || b?.closest('.plbl')) { bad('That is a field label. Select a value or a sentence, not the label.'); return; }
      const start = a?.closest('[data-line]'), end = b?.closest('[data-line]');
      if (!start || start !== end) { bad('Select text inside one line — the selection crosses lines.'); return; }
      if (start.closest('.ptitle h2')) { bad('The form title stays fixed. Select text below it.'); return; }
      const [sectionId, idx] = (start.getAttribute('data-line') || '').split(':');
      onSelect({ sectionId, lineIndex: parseInt(idx), text, ...at });
    };
    document.addEventListener('mouseup', handler);
    document.addEventListener('keyup', handler);
    return () => { document.removeEventListener('mouseup', handler); document.removeEventListener('keyup', handler); };
  }, [onSelect]);

  return (
    <div className="paper" data-testid="paper" data-mode={mode} ref={ref} style={onSelect ? { position: 'relative' } : undefined}>
      {sections.map((s, idx) => {
        const rendered = a ? a.sections[idx] : null;
        if (s.title) {
          return (
            <div key={s.id}>
              <div className="ptitle">
                <div>
                  <h2 data-testid="paper-title">{s.heading || 'Untitled form'}</h2>
                  {s.lines.map((l, i) => (l.kind === 'text' && formCode && l.text === formCode) ? null : (l.kind === 'text' ? <div key={i} className="sub"><TextLine line={l} fields={fields} values={values} mode={mode} sectionId={s.id} index={i} /></div> : <div key={i} className="sub"><span className="plbl">{fieldByKey(fields, l.key)?.label}: </span><Value k={l.key} fields={fields} values={values} mode={mode} /></div>))}
                </div>
                {formCode && <div style={{ fontFamily: 'ui-monospace, monospace', fontSize: 10.5, color: '#4a4a4a', textAlign: 'right', whiteSpace: 'nowrap' }}>{formCode}</div>}
              </div>
              {mode === 'dynamic' && (
                <div className="banner-dyn" data-testid="dynamic-banner"><Ic.spark size={13} /><span>Template view — violet chips are merge fields the assembler fills in. {stats.fields} fields, {stats.conditional} conditional section{stats.conditional === 1 ? '' : 's'}, {stats.signature} signature block{stats.signature === 1 ? '' : 's'}.</span></div>
              )}
              {onSelect && (
                <div className="banner-dyn" style={{ background: '#e6f4f2', borderColor: '#46d3c4', color: '#0f5f57' }} data-testid="select-hint"><Ic.pen size={13} /><span>Missed something? Drag over any fixed text (a number, a name, a place) to turn it into a field.</span></div>
              )}
            </div>
          );
        }
        if (rendered && !rendered.included) {
          return (
            <div key={s.id} className="pcond out" data-testid="section-omitted" data-section={s.id}>
              <div className="ph"><span>{s.heading}</span><span className="cmark" style={{ color: '#888', borderColor: '#bbb', background: '#eee' }}>{rendered.rule.short}</span></div>
              <p style={{ color: '#999', fontSize: 11.5 }}>{sectionLabel(s)} is not part of this document. It will not appear in the PDF, Word or email copy.</p>
            </div>
          );
        }
        // keep the source order: runs of label/value pairs become a two-column grid, prose stays where it was
        const runs: ({ pairs: Extract<Line, { kind: 'pair' }>[] } | { text: Extract<Line, { kind: 'text' }>; index: number })[] = [];
        s.lines.forEach((l, li) => {
          if (l.kind === 'pair') { const last = runs[runs.length - 1]; if (last && 'pairs' in last) last.pairs.push(l); else runs.push({ pairs: [l] }); }
          else if (!/^(signature|signed)\b|_{3,}/i.test(l.text)) runs.push({ text: l, index: li });
        });
        const block = sig.find((x) => x.section.id === s.id);
        const who = block?.signatory ? (mode === 'dynamic' ? '{{' + block.signatory.key + '}}' : (mode === 'static' ? block.signatory.sample : values[block.signatory.key]) || '______') : '';
        const when = block?.date ? (mode === 'dynamic' ? '{{' + block.date.key + '}}' : (mode === 'static' ? block.date.sample : values[block.date.key]) || '______') : '';
        const body = (
          <>
            <div className="ph">
              <span>{s.heading}</span>
              {s.rule && mode !== 'static' && <span className="cmark" data-testid="conditional-marker">{mode === 'dynamic' ? 'conditional · when ' + ruleText(s.rule) : 'included · ' + ruleText(s.rule)}</span>}
              {s.signature && mode !== 'live' && <span className="cmark" style={{ color: '#1f8f57', background: '#e3f6ec', borderColor: '#7fd1a5' }} data-testid="signature-marker">signature block{block?.date ? ' · date' : ''}</span>}
            </div>
            {runs.map((run, ri) => 'pairs' in run ? (
              <div key={ri} className="pgrid">
                {run.pairs.map((l) => (
                  <div key={l.key} style={{ gridColumn: (fieldByKey(fields, l.key)?.sample || '').length > 40 ? '1 / -1' : undefined }}>
                    <span className="plbl">{fieldByKey(fields, l.key)?.label || l.key}: </span>
                    <Value k={l.key} fields={fields} values={values} mode={mode} />
                  </div>
                ))}
              </div>
            ) : <TextLine key={ri} line={run.text} fields={fields} values={values} mode={mode} sectionId={s.id} index={run.index} />)}
            {s.table && (
              <table>
                <thead><tr>{s.table.cols.map((c, i) => <th key={i}>{c}</th>)}</tr></thead>
                <tbody>{s.table.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
              </table>
            )}
            {s.signature && (
              <div className="psig" data-testid="signature-block">
                <div>
                  {mode === 'live' && seal?.state === 'valid' && <img className="sigimg" src={seal.png} alt={'Signature of ' + seal.signer} data-testid="signature-image" />}
                  {mode === 'dynamic' && <div style={{ marginBottom: 4 }}><span className="fld dynamic" data-testid="merge-field" data-key="signature">{'{{signature_image}}'}</span></div>}
                  <div className="line" />
                  <small>Signature{who ? <> — <b className={mode === 'dynamic' ? 'fld dynamic' : ''} data-testid="signature-who">{who}</b></> : ''}
                    {mode === 'live' && seal && <span className={'sealchip ' + seal.state} style={{ marginLeft: 8 }} data-testid="paper-seal" data-state={seal.state}>{seal.state === 'valid' ? 'sealed · ' + seal.hash.slice(0, 8) : 'seal broken'}</span>}
                  </small>
                </div>
                <div><div className="line" /><small>Date{when ? <> — <b className={mode === 'dynamic' ? 'fld dynamic' : ''} data-testid="signature-date">{when}</b></> : ''}</small></div>
              </div>
            )}
          </>
        );
        return s.rule ? <div key={s.id} className="pcond" data-testid="section-included" data-section={s.id}>{body}</div> : <div key={s.id} data-testid="section" data-section={s.id}>{body}</div>;
      })}
    </div>
  );
}
