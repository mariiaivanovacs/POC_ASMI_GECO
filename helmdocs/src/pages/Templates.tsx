import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Field, FieldType, Section, Template, Upload } from '../data/types';
import { TYPES, TYPE_LABEL } from '../engine/fields';
import { sampleValues, signatureFields, templateStats } from '../engine/template';
import { useStore } from '../store/useStore';
import { Topbar } from '../App';
import { Ic, regimeColor, regimeIcon } from '../components/ui/Icons';
import { Paper, type PaperMode, type PaperSelection } from '../components/Paper';

const STAGE_LABEL: Record<string, string> = { reading: 'Reading the file', detecting: 'Detecting variable fields', templating: 'Building the dynamic template', ready: 'Ready' };

export function Templates() {
  const { id } = useParams();
  const nav = useNavigate();
  const templates = useStore((s) => s.templates);
  const uploads = useStore((s) => s.uploads);
  const docs = useStore((s) => s.docs);
  const addUploads = useStore((s) => s.addUploads);
  const processUpload = useStore((s) => s.processUpload);
  const deleteUpload = useStore((s) => s.deleteUpload);
  const saveTemplate = useStore((s) => s.saveTemplate);
  const deleteTemplate = useStore((s) => s.deleteTemplate);
  const editField = useStore((s) => s.editField);
  const removeField = useStore((s) => s.removeField);
  const createDoc = useStore((s) => s.createDoc);
  const addField = useStore((s) => s.addField);
  const toast = useStore((s) => s.toast);

  const [mode, setMode] = useState<PaperMode>('static');
  const [selection, setSelection] = useState<PaperSelection | null>(null);
  const [newLabel, setNewLabel] = useState('');
  const [newType, setNewType] = useState<FieldType | ''>('');
  const stripRef = useRef<HTMLDivElement>(null);
  const [over, setOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const upload = uploads.find((u) => u.id === id) || null;
  const template = templates.find((t) => t.id === id) || null;
  const sel: Upload | Template | null = upload || template || uploads[0] || templates[0] || null;
  const isUpload = !!sel && 'fileName' in sel;

  useEffect(() => { if (sel && sel.id !== id) nav('/templates/' + sel.id, { replace: true }); }, [sel, id, nav]);

  // the cards strip: uploads first, then saved templates — ◀ ▶ and the arrow keys move between them
  const order = [...uploads.map((u) => u.id), ...templates.map((t) => t.id)];
  const pos = sel ? order.indexOf(sel.id) : -1;
  const go = useCallback((delta: number) => {
    if (!order.length) return;
    const next = order[(pos + delta + order.length) % order.length];
    nav('/templates/' + next);
    setMode('static');
    setSelection(null);
  }, [order, pos, nav]);
  useEffect(() => {
    const el = stripRef.current?.querySelector('[data-active="true"]') as HTMLElement | null;
    el?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [sel?.id]);
  useEffect(() => { setSelection(null); }, [sel?.id, mode]);

  const onSelect = useCallback((ps: PaperSelection | null) => {
    setSelection(ps);
    if (ps && ps.lineIndex >= 0) { setNewLabel(ps.text.split(' ').slice(0, 3).join(' ').replace(/[^\w\s()/-]+$/, '')); setNewType(''); }
  }, []);
  const confirmAdd = () => {
    if (!sel || !selection || selection.lineIndex < 0) return;
    const r = addField(sel.id, selection.sectionId, selection.lineIndex, selection.text, newLabel, newType || undefined);
    toast(r.message, r.ok ? 'ok' : 'err');
    if (r.ok) { setSelection(null); window.getSelection()?.removeAllRanges(); }
  };

  const onFiles = (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    const added = addUploads(Array.from(list));
    nav('/templates/' + added[0].id);
    setMode('static');
    for (const u of added) processUpload(u.id);
  };

  const save = () => {
    if (!upload) return;
    const t = saveTemplate(upload.id);
    if (!t) { toast('Nothing to save — no fields were detected in this form.', 'err'); return; }
    toast('Saved "' + t.name + '" as a dynamic template (' + t.fields.length + ' fields)', 'ok');
    nav('/templates/' + t.id);
  };

  const removeTemplate = (t: Template) => {
    const n = docs.filter((d) => d.templateId === t.id).length;
    const msg = n ? 'Delete template "' + t.name + '"? ' + n + ' generated document' + (n === 1 ? '' : 's') + ' will stay in the library with a snapshot of the template, but no new documents can be assembled from it.' : 'Delete template "' + t.name + '"?';
    if (!window.confirm(msg)) return;
    deleteTemplate(t.id);
    toast('Template deleted' + (n ? ' · ' + n + ' document' + (n === 1 ? '' : 's') + ' kept in the library' : ''), 'ok');
    nav('/templates');
  };

  const fields: Field[] = sel ? sel.fields : [];
  const sections: Section[] = sel ? sel.sections : [];
  const values = sampleValues(fields);
  const stats = templateStats({ fields, sections });
  const fileName = sel ? (isUpload ? (sel as Upload).fileName : (sel as Template).name) : '';
  const ext = sel ? sel.ext : '';
  const formCode = sel ? (sections[0]?.lines.find((l) => l.kind === 'text' && /^form\b/i.test(l.text)) as { text: string } | undefined)?.text : undefined;
  const sigBlocks = signatureFields(fields, sections);
  const sigTag = (f: Field): string | null => {
    for (const b of sigBlocks) { if (b.signatory?.key === f.key) return 'signs here'; if (b.date?.key === f.key) return 'signing date'; }
    return f.manual ? 'added by you' : null;
  };

  return (
    <>
      <Topbar title="Templates" crumb={<>Document studio &nbsp;›&nbsp; <b>Templates</b> &nbsp;<span className="fr">FR-02 template management</span> <span className="fr">FR-04 document transformation</span></>}
        right={<button className="btn primary" onClick={() => fileInput.current?.click()} data-testid="upload-button"><Ic.upload size={16} />Upload form</button>} />
      <div className="content">
        <section style={{ width: 700, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div className={'dropzone' + (over ? ' over' : '')} style={{ padding: '12px 16px' }}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
            onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()} data-testid="dropzone">
            <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue-d)', flexShrink: 0 }}><Ic.upload size={18} /></div>
            <div style={{ flexGrow: 1, minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-h)', fontSize: 13.5, fontWeight: 700 }}>Drop a form you already fill in by hand — the AI turns it into a template that fills itself</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>PDF · Word (.docx) · .txt · .md — IHM declarations, permits, RA/SWP, incident reports, consignment notes</div>
            </div>
            <input ref={fileInput} type="file" multiple accept=".pdf,.docx,.txt,.md" style={{ display: 'none' }} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} data-testid="file-input" />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <button className="ib" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} onClick={() => go(-1)} disabled={order.length < 2} aria-label="Previous form" data-testid="template-prev"><Ic.back size={14} /></button>
            <div ref={stripRef} className="cardstrip" data-testid="template-strip" tabIndex={0} onKeyDown={(e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } }} aria-label="Forms and templates — use the arrow keys to switch">
              {uploads.map((u) => (
                <button key={u.id} className={'tcardmini up' + (sel?.id === u.id ? ' on' : '')} onClick={() => { nav('/templates/' + u.id); setMode('static'); }} data-testid="upload-chip" data-status={u.status} data-active={sel?.id === u.id} title={u.fileName}>
                  <span className="ico" style={{ background: u.status === 'failed' ? 'var(--red-l)' : 'var(--blue-l)', color: u.status === 'failed' ? 'var(--red-t)' : 'var(--blue-d)' }}>{u.status === 'processing' ? <span className="spinner" style={{ borderColor: 'rgba(47,111,224,.3)', borderTopColor: '#2f6fe0' }} /> : u.status === 'failed' ? <Ic.alert size={14} /> : <Ic.upload size={15} />}</span>
                  <span style={{ minWidth: 0 }}><b>{u.fileName}</b><small>{u.status === 'detected' ? u.fields.length + ' fields · not saved' : u.status === 'processing' ? 'reading…' : u.status === 'failed' ? 'failed' : 'queued'}</small></span>
                </button>
              ))}
              {templates.map((t) => { const I = regimeIcon(t.regimeShort); return (
                <button key={t.id} className={'tcardmini' + (sel?.id === t.id ? ' on' : '')} onClick={() => { nav('/templates/' + t.id); setMode('static'); }} data-testid="template-chip" data-active={sel?.id === t.id} title={t.name}>
                  <span className="ico" style={{ background: regimeColor(t.regimeShort), color: '#0c1517' }}><I size={15} /></span>
                  <span style={{ minWidth: 0 }}><b>{t.name}</b><small>{t.regimeShort} · {t.fields.length} fields</small></span>
                </button>
              ); })}
              {uploads.length + templates.length === 0 && <span style={{ fontSize: 12, color: 'var(--muted)', padding: '8px 4px' }}>No templates yet — drop a form above.</span>}
            </div>
            <button className="ib" style={{ width: 34, height: 34, borderRadius: 10, flexShrink: 0 }} onClick={() => go(1)} disabled={order.length < 2} aria-label="Next form" data-testid="template-next"><Ic.back size={14} style={{ transform: 'rotate(180deg)' }} /></button>
            {order.length > 1 && <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }} data-testid="template-pos">{pos + 1} / {order.length}</span>}
          </div>

          {sel ? (
            <>
              <div className="row-between" style={{ flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <div className="ext" style={{ width: 32, height: 32, borderRadius: 8, background: '#1a2c31', color: ext === 'pdf' ? '#ff9b9a' : ext === 'docx' ? '#8cc3f5' : 'var(--blue-d)' }}>{ext.slice(0, 4)}</div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} data-testid="doc-name">{fileName}</div>
                    <div style={{ fontSize: 11, color: 'var(--ink2)' }} data-testid="doc-meta">
                      {isUpload ? statusText(sel as Upload) : (sel as Template).pages + ' pages · saved template · ' + (sel as Template).regimeShort}
                      {' · '}{mode === 'static' ? 'viewing original document' : mode === 'dynamic' ? 'viewing as dynamic template' : ''}
                    </div>
                  </div>
                </div>
                <div className="seg" data-testid="mode-toggle">
                  <button className={mode === 'static' ? 'on' : ''} onClick={() => setMode('static')} data-testid="mode-static">Static form</button>
                  <button className={mode === 'dynamic' ? 'on' : ''} onClick={() => setMode('dynamic')} data-testid="mode-dynamic">Dynamic template</button>
                </div>
              </div>

              <div className="paper-wrap">
                {isUpload && (sel as Upload).status !== 'detected' ? (
                  <div className="paper" style={{ minHeight: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', gap: 8 }} data-testid="paper-state" data-status={(sel as Upload).status}>
                    <div style={{ width: 54, height: 54, borderRadius: 16, background: (sel as Upload).status === 'failed' ? 'var(--red-l)' : 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: (sel as Upload).status === 'failed' ? 'var(--red-t)' : 'var(--blue-d)' }}>{(sel as Upload).status === 'failed' ? <Ic.warn size={24} /> : <Ic.clock />}</div>
                    <div style={{ fontFamily: 'var(--font-h)', fontSize: 15, fontWeight: 700 }}>{(sel as Upload).status === 'failed' ? 'This form could not be read' : (sel as Upload).status === 'processing' ? STAGE_LABEL[(sel as Upload).stage || 'reading'] : 'Queued'}</div>
                    <div style={{ fontSize: 12.5, color: '#555', maxWidth: 380, lineHeight: 1.5 }}>{(sel as Upload).status === 'failed' ? (sel as Upload).error : 'The engine reads the file, finds the variable fields and marks conditional sections. The document appears here when it is done.'}</div>
                    {(sel as Upload).status === 'processing' && <div className="bar" style={{ width: 240, marginTop: 8 }}><i style={{ width: (sel as Upload).pct + '%' }} /></div>}
                    {(sel as Upload).status === 'failed' && <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn sm" onClick={() => processUpload(sel.id)} data-testid="retry">Retry</button>
                      <button className="btn sm danger" onClick={() => { deleteUpload(sel.id); nav('/templates'); }} data-testid="delete-upload">Remove</button>
                    </div>}
                  </div>
                ) : fields.length === 0 && sections.length === 0 ? (
                  <div className="paper empty" data-testid="paper-state" data-status="empty">Nothing to show.</div>
                ) : (
                  <div style={{ position: 'relative' }}>
                    <Paper fields={fields} sections={sections} mode={mode} values={values} formCode={formCode} onSelect={onSelect} />
                    {selection && (
                      selection.lineIndex >= 0 ? (
                        <div className="menu addfield" style={{ left: Math.max(150, Math.min(selection.x, 470)), top: selection.y + 8, transform: 'translateX(-50%)' }} onMouseDown={(e) => e.stopPropagation()} data-testid="add-field-popover">
                          <div style={{ fontSize: 11, color: 'var(--ink2)', marginBottom: 6 }}>Turn <b style={{ color: 'var(--ink)' }}>“{selection.text.length > 40 ? selection.text.slice(0, 40) + '…' : selection.text}”</b> into a field</div>
                          <div style={{ display: 'flex', gap: 6 }}>
                            <input className="input" style={{ height: 32, flexGrow: 1 }} value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmAdd()} placeholder="Field name" aria-label="Field name" autoFocus data-testid="add-field-label" />
                            <select className="input" style={{ height: 32, width: 92 }} value={newType} onChange={(e) => setNewType(e.target.value as FieldType | '')} aria-label="Field type" data-testid="add-field-type">
                              <option value="">Auto</option>
                              {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                            </select>
                          </div>
                          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'flex-end' }}>
                            <button className="btn sm" onClick={() => { setSelection(null); window.getSelection()?.removeAllRanges(); }}>Cancel</button>
                            <button className="btn sm primary" onClick={confirmAdd} disabled={!newLabel.trim()} data-testid="add-field-confirm"><Ic.spark size={11} />Add field</button>
                          </div>
                        </div>
                      ) : (
                        <div className="menu addfield" style={{ left: Math.max(160, Math.min(selection.x, 460)), top: selection.y + 8, transform: 'translateX(-50%)', fontSize: 12, color: 'var(--ink2)', display: 'flex', gap: 8, alignItems: 'flex-start' }} data-testid="add-field-popover" data-invalid="true">
                          <Ic.alert size={13} stroke="var(--amber-t)" /><span>{selection.problem || 'Select text inside one line that is not already a field.'}</span>
                        </div>
                      )
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="card empty" style={{ flexGrow: 1 }} data-testid="paper-state" data-status="none">
              <div style={{ fontFamily: 'var(--font-h)', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No form selected</div>
              <div>Drop a form above or reset the demo data from Settings.</div>
            </div>
          )}
        </section>

        <aside style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0 }}>
          <DetectionCard sel={sel} isUpload={isUpload} stats={stats} />

          <div className="card" style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: 16 }}>
            <div className="row-between">
              <div className="card-h">Detected fields</div>
              <div style={{ fontSize: 11, color: 'var(--ink2)' }} data-testid="field-count">{fields.length} fields · AI confidence</div>
            </div>
            <div className="stack" style={{ marginTop: 10, overflow: 'auto', minHeight: 0, gap: 6 }} data-testid="field-list">
              {fields.map((f) => (
                <FieldRow key={f.key} f={f} dyn={mode === 'dynamic'} tag={sigTag(f)} onLabel={(label) => sel && editField(sel.id, f.key, { label })} onType={(type) => sel && editField(sel.id, f.key, { type })}
                  onDelete={() => { if (sel && window.confirm('Remove the field "' + f.label + '"? Its text goes back to being fixed content.')) removeField(sel.id, f.key); }} />
              ))}
              {sel && fields.length === 0 && (isUpload ? (sel as Upload).status === 'detected' : true) && (
                <div className="empty" style={{ padding: '24px 12px' }} data-testid="no-fields">
                  <Ic.warn size={22} stroke="var(--amber-t)" />
                  <div style={{ fontWeight: 700, color: 'var(--ink)' }}>No variable fields detected</div>
                  <div style={{ fontSize: 12, lineHeight: 1.5 }}>The engine looks for labelled lines (<span className="kbd">Vessel name: …</span>), IMO numbers, work-order codes, dates and quantities. This file has none — it cannot become a template as it is.</div>
                </div>
              )}
              {sel && isUpload && (sel as Upload).status !== 'detected' && fields.length === 0 && <div className="empty" style={{ padding: 24, fontSize: 12.5 }}>{(sel as Upload).status === 'failed' ? 'Nothing detected — the file could not be read.' : 'Fields appear here as soon as detection finishes.'}</div>}
              {!sel && <div className="empty" style={{ padding: 24, fontSize: 12.5 }}>Select a form to see its fields.</div>}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 10, flexShrink: 0 }}>
            {sel && isUpload ? (
              <>
                <button className="btn" onClick={() => processUpload(sel.id)} disabled={(sel as Upload).status === 'processing'} data-testid="rescan"><Ic.refresh />Re-scan</button>
                <button className="btn primary" style={{ flexGrow: 1 }} onClick={save} disabled={(sel as Upload).status !== 'detected' || fields.length === 0} data-testid="save-template" title={fields.length === 0 ? 'No fields detected — nothing to save' : ''}>Save as template <Ic.arrow /></button>
              </>
            ) : sel ? (
              <>
                <button className="btn danger" onClick={() => removeTemplate(sel as Template)} data-testid="delete-template"><Ic.trash />Delete</button>
                <button className="btn primary" style={{ flexGrow: 1 }} onClick={() => { const d = createDoc(sel.id); if (d) nav('/assemble/' + d.id); }} data-testid="assemble-from-template">Assemble a document from this template <Ic.arrow /></button>
              </>
            ) : null}
          </div>
        </aside>
      </div>
    </>
  );
}

function sectionLabelOf(heading: string): string { const m = heading.match(/^(\d{1,2})\./); return m ? 'Section ' + m[1] : heading || 'Section'; }

function statusText(u: Upload): string {
  if (u.status === 'detected') return u.pages + ' page' + (u.pages === 1 ? '' : 's') + ' · ' + u.kind + ' · not saved yet';
  if (u.status === 'processing') return (STAGE_LABEL[u.stage || 'reading'] || 'Processing') + ' · ' + u.pct + '%';
  if (u.status === 'failed') return 'failed';
  return 'queued';
}

function DetectionCard({ sel, isUpload, stats }: { sel: Upload | Template | null; isUpload: boolean; stats: { fields: number; conditional: number; signature: number } }) {
  const u = isUpload ? (sel as Upload) : null;
  const status = u ? u.status : sel ? 'detected' : 'none';
  const det = sel ? sel.detection : null;
  const regime = sel ? (u ? u.regime : (sel as Template).regime) : '';
  const ms = det ? det.ms : 0;
  const Tick = ({ ok, wait }: { ok: boolean; wait?: boolean }) => (wait ? <span className="wait"><Ic.clock size={13} /></span> : ok ? <span className="ok"><Ic.check size={13} /></span> : <span className="no"><Ic.x size={12} /></span>);
  const stageIdx = u ? ['reading', 'detecting', 'templating', 'ready'].indexOf(u.stage || 'reading') : 3;
  return (
    <div className="aicard" data-testid="detection-card" data-status={status}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <div className="mark"><Ic.spark size={16} /></div>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-h)' }}>AI template detection</div>
          <div style={{ fontSize: 11, color: 'var(--blue-d)' }}>{status === 'detected' ? 'Offline engine read the form · ' + (ms >= 1000 ? (ms / 1000).toFixed(1) + ' s' : ms + ' ms') : status === 'processing' ? STAGE_LABEL[u!.stage || 'reading'] + '…' : status === 'failed' ? 'Could not read the file' : 'Waiting for a form'}</div>
        </div>
        <span className={'pill ' + (status === 'detected' ? 'ok' : status === 'processing' ? 'run' : status === 'failed' ? 'err' : 'none')} style={{ marginLeft: 'auto' }}><span className="dot" />{status === 'detected' ? 'Ready' : status === 'processing' ? 'Working' : status === 'failed' ? 'Failed' : 'Idle'}</span>
      </div>
      <div className="bar" style={{ marginTop: 12, height: 5 }}><i style={{ width: (status === 'detected' ? 100 : status === 'processing' ? u!.pct : 0) + '%', background: status === 'failed' ? 'var(--red)' : undefined }} /></div>
      <div className="log" data-testid="detection-log">
        {status === 'none' && <div><Tick ok={false} wait /><span>Drop a form to start.</span></div>}
        {status === 'failed' && <div><Tick ok={false} /><span>{u!.error}</span></div>}
        {status === 'processing' && <>
          <div><Tick ok={stageIdx > 0} wait={stageIdx <= 0} /><span>Reading {u!.fileName}{u!.pages ? ' — ' + u!.pages + ' page' + (u!.pages === 1 ? '' : 's') : ''}</span></div>
          <div><Tick ok={stageIdx > 1} wait={stageIdx <= 1} /><span>Detecting variable fields (labels, IMO numbers, work orders, dates, quantities)</span></div>
          <div><Tick ok={stageIdx > 2} wait={stageIdx <= 2} /><span>Marking conditional sections and signature blocks</span></div>
        </>}
        {status === 'detected' && det && <>
          <div><Tick ok /><span>Read {det.pages} page{det.pages === 1 ? '' : 's'}, recognised the form layout ({sel!.sections.filter((s) => !s.title).length} sections)</span></div>
          <div><Tick ok={stats.fields > 0} /><span>Found {stats.fields} variable field{stats.fields === 1 ? '' : 's'}{stats.fields === 0 ? ' — this form cannot become a template' : ''}</span></div>
          <div><Tick ok={stats.conditional > 0} wait={stats.conditional === 0} /><span>{stats.conditional > 0 ? 'Found ' + stats.conditional + ' conditional section' + (stats.conditional === 1 ? '' : 's') + ' (' + sel!.sections.filter((s) => s.rule).map((s) => s.heading.split(' ')[0].replace('.', '')).map((n) => 'Section ' + n).join(', ') + ')' : 'No conditional section found — no Yes/No field controls a later section'}</span></div>
          <div><Tick ok={stats.signature > 0} wait={stats.signature === 0} /><span data-testid="log-signature">{stats.signature > 0 ? 'Found ' + stats.signature + ' signature block' + (stats.signature === 1 ? '' : 's') + ' — ' + signatureFields(sel!.fields, sel!.sections).map((b) => sectionLabelOf(b.section.heading) + (b.signatory ? ': signed by {{' + b.signatory.key + '}}' : '') + (b.date ? ', dated {{' + b.date.key + '}}' : '')).join('; ') : 'No signature block found — no “Signature” line or ______ rule in the form'}</span></div>
          <div><Tick ok={!/not recognised/.test(regime)} wait={/not recognised/.test(regime)} /><span>{/not recognised/.test(regime) ? 'Regime not recognised — the pre-submission check will flag this' : 'Matched to regime: ' + regime}</span></div>
        </>}
      </div>
    </div>
  );
}

function FieldRow({ f, dyn, tag, onLabel, onType, onDelete }: { f: Field; dyn: boolean; tag: string | null; onLabel: (l: string) => void; onType: (t: FieldType) => void; onDelete: () => void }) {
  const [label, setLabel] = useState(f.label);
  useEffect(() => setLabel(f.label), [f.label]);
  const commit = () => { if (label.trim() && label.trim() !== f.label) onLabel(label); else setLabel(f.label); };
  return (
    <div className={'frow' + (dyn ? ' dyn' : '')} data-testid="field-row" data-key={f.key} data-type={f.type}>
      <div style={{ minWidth: 0, flexGrow: 1, display: 'flex', flexDirection: 'column' }}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} onBlur={commit} onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setLabel(f.label); (e.target as HTMLInputElement).blur(); } }} aria-label="Field label" data-testid="field-label" />
        <span className="key" data-testid="field-key">{'{{' + f.key + '}}'}{f.role !== 'other' && f.role !== 'yesno' ? ' · ' + f.role : ''}{tag && <span className="fr" style={{ marginLeft: 6, background: tag === 'added by you' ? 'var(--blue-l)' : 'var(--green-l)', color: tag === 'added by you' ? 'var(--blue-d)' : 'var(--green-t)' }} data-testid="field-tag">{tag}</span>}</span>
      </div>
      <select value={f.type} onChange={(e) => onType(e.target.value as FieldType)} aria-label="Field type" data-testid="field-type">
        {TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
      </select>
      <div className="conf">
        <svg width="56" height="6" viewBox="0 0 56 6" aria-hidden="true"><rect width="56" height="6" rx="3" fill="#e4eaf3" /><rect className="grow" width={Math.round((56 * f.confidence) / 100)} height="6" rx="3" fill={f.confidence >= 90 ? '#2fb673' : f.confidence >= 75 ? '#3b82f6' : '#f2a93b'} /></svg>
        <span data-testid="field-conf">{f.confidence}%</span>
      </div>
      <button className="ib" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={onDelete} aria-label={'Delete field ' + f.label} data-testid="field-delete"><Ic.trash size={12} /></button>
    </div>
  );
}
