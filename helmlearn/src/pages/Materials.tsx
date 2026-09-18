import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Category, Material } from '../data/types';
import { STAGE_LABEL } from '../engine/pipeline';
import { CATEGORIES, catLabel, useStore } from '../store/useStore';
import { Topbar } from '../App';
import { Ic } from '../components/ui/Icons';
import { AudioWidget, FillBlank, Flashcards, QaMatch } from '../components/exercises/Widgets';

export function Materials() {
  const materials = useStore((s) => s.materials);
  const exercises = useStore((s) => s.exercises);
  const addMaterials = useStore((s) => s.addMaterials);
  const addMaterialFromUrl = useStore((s) => s.addMaterialFromUrl);
  const processMaterial = useStore((s) => s.processMaterial);
  const deleteMaterial = useStore((s) => s.deleteMaterial);
  const setCategory = useStore((s) => s.setCategory);
  const toast = useStore((s) => s.toast);

  const [selId, setSelId] = useState<string | null>(materials[0]?.id ?? null);
  const [filter, setFilter] = useState<Category | 'all'>('all');
  const [uploadCat, setUploadCat] = useState<Category>('safety');
  const [over, setOver] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  const visible = useMemo(() => materials.filter((m) => filter === 'all' || m.category === filter), [materials, filter]);
  const sel = materials.find((m) => m.id === selId) || visible[0] || null;
  const count = (id: string) => exercises.filter((e) => e.materialId === id).length;
  const processed = materials.filter((m) => m.status === 'processed').length;
  const total = exercises.length;

  const onFiles = (list: FileList | File[] | null) => {
    if (!list || !list.length) return;
    const added = addMaterials(Array.from(list), uploadCat);
    setSelId(added[0].id);
    toast(added.length + ' file' + (added.length > 1 ? 's' : '') + ' added — click "Process with AI" to read ' + (added.length > 1 ? 'them' : 'it'), 'ok');
  };

  const onAddUrl = () => {
    if (!urlInput.trim()) return;
    const added = addMaterialFromUrl(urlInput.trim(), uploadCat);
    if (added) {
      setSelId(added.id);
      setUrlInput('');
      toast('Page added — click "Process with AI" to fetch and read it', 'ok');
    }
  };

  return (
    <>
      <Topbar title="Materials" crumb={<>Training studio &nbsp;›&nbsp; <b>Materials</b></>} />
      <div className="content">
        <section style={{ width: 540, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div className={'dropzone' + (over ? ' over' : '')}
            onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); onFiles(e.dataTransfer.files); }}
            onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()} data-testid="dropzone">
            <div style={{ width: 46, height: 46, borderRadius: 14, background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue-d)' }}><Ic.upload /></div>
            <div style={{ flexGrow: 1 }}>
              <div style={{ fontFamily: 'var(--font-h)', fontSize: 14, fontWeight: 700 }}>Drop a safety SOP, emergency plan, OEM manual or refresher deck</div>
              <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3 }}>PDF · Word (.docx) · PowerPoint (.pptx) · .txt · .md · up to 200 pages</div>
            </div>
            <select className="input" style={{ width: 150, height: 34 }} value={uploadCat} onChange={(e) => setUploadCat(e.target.value as Category)} onClick={(e) => e.stopPropagation()} aria-label="Category for uploads" data-testid="upload-category">
              {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel[c]}</option>)}
            </select>
            <input ref={fileInput} type="file" multiple accept=".pdf,.docx,.pptx,.txt,.md" style={{ display: 'none' }} onChange={(e) => { onFiles(e.target.files); e.target.value = ''; }} data-testid="file-input" />
          </div>

          <div className="row-between" style={{ gap: 8, padding: '0 4px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexGrow: 1, minWidth: 0 }}>
              <Ic.link size={14} />
              <input className="input" style={{ height: 34, flexGrow: 1 }} placeholder="Or paste a web page URL — MOM/WSH guidance, an SOP hosted online…"
                value={urlInput} onChange={(e) => setUrlInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && onAddUrl()} data-testid="url-input" />
            </div>
            <button className="btn sm" onClick={onAddUrl} disabled={!urlInput.trim()} data-testid="add-url">Add</button>
          </div>

          <div className="row-between" style={{ padding: '4px 4px 0' }}>
            <div style={{ fontFamily: 'var(--font-h)', fontSize: 15, fontWeight: 700 }}>Material library</div>
            <div style={{ fontSize: 12, color: 'var(--ink2)' }} data-testid="library-stats">{processed} processed · {total} exercises</div>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className={'chip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>All</button>
            {CATEGORIES.map((c) => <button key={c} className={'chip' + (filter === c ? ' on' : '')} onClick={() => setFilter(c)}>{catLabel[c]}</button>)}
          </div>

          <div className="stack" style={{ overflow: 'auto', minHeight: 0, flexGrow: 1, paddingBottom: 4 }} data-testid="library">
            {visible.length === 0 && <div className="empty card">No materials in this category yet — drop a file above.</div>}
            {visible.map((m) => (
              <MaterialRow key={m.id} m={m} selected={sel?.id === m.id} count={count(m.id)}
                onSelect={() => setSelId(m.id)} onProcess={() => { setSelId(m.id); processMaterial(m.id); }}
                onDelete={() => { if (window.confirm('Delete "' + m.name + '" and its exercises?')) { deleteMaterial(m.id); if (sel?.id === m.id) setSelId(null); } }}
                onCategory={(c) => setCategory(m.id, c)} />
            ))}
          </div>
        </section>

        <section style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          {sel ? <Preview m={sel} count={count(sel.id)} /> : <div className="card empty" style={{ flexGrow: 1 }}>Select a material to see its exercises.</div>}
        </section>
      </div>
    </>
  );
}

function MaterialRow({ m, selected, count, onSelect, onProcess, onDelete, onCategory }: { m: Material; selected: boolean; count: number; onSelect: () => void; onProcess: () => void; onDelete: () => void; onCategory: (c: Category) => void }) {
  const pill = { processed: 'done', processing: 'run', queued: 'queued', failed: 'failed' }[m.status];
  const label = { processed: 'Processed', processing: 'Processing', queued: 'Queued', failed: 'Failed' }[m.status];
  return (
    <div className={'mat' + (selected ? ' on' : '') + (m.status === 'failed' ? ' failed' : '')} onClick={onSelect} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && onSelect()} data-testid="material-row" data-status={m.status}>
      <div className="ext">{m.ext.slice(0, 4)}</div>
      <div style={{ minWidth: 0, flexGrow: 1 }}>
        <div className="mat-name" title={m.name}>
          {m.name}
          {m.sourceUrl && <a href={m.sourceUrl} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()} style={{ marginLeft: 6, color: 'var(--blue-d)' }} title={m.sourceUrl} data-testid="material-source-link"><Ic.link size={11} /></a>}
        </div>
        <div className="mat-meta">
          <select className={'cat ' + m.category} value={m.category} onChange={(e) => onCategory(e.target.value as Category)} onClick={(e) => e.stopPropagation()} style={{ border: 0, cursor: 'pointer' }} aria-label="Category" data-testid="row-category">
            {CATEGORIES.map((c) => <option key={c} value={c}>{catLabel[c]}</option>)}
          </select>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {m.pages ? m.pages + (m.ext === 'pptx' ? ' slides' : ' pages') + ' · ' : ''}
            {m.status === 'processed' ? count + ' exercises · ' + m.langs.map((l) => ({ en: 'EN', bm: 'BM', zh: '中文' }[l])).join(', ') : m.status === 'failed' ? m.error : m.status === 'processing' ? (m.note || STAGE_LABEL[m.stage || 'reading']) : m.kind}
          </span>
          {m.status === 'processed' && <span className={'tag' + (m.source === 'deepseek' ? '' : ' g')} title={m.note || ''} data-testid="source-badge">{m.source === 'deepseek' ? 'DeepSeek' : 'Offline'}</span>}
        </div>
        {m.status === 'processing' && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="bar" style={{ width: 200 }}><i style={{ width: m.pct + '%' }} /></div>
            <span style={{ fontSize: 11.5, color: 'var(--blue-d)', fontWeight: 700 }} data-testid="progress">{m.pct}%</span>
          </div>
        )}
      </div>
      {(m.status === 'queued' || m.status === 'failed') && (
        <button className={'btn primary sm' + (m.status === 'queued' ? ' pulse' : '')} onClick={(e) => { e.stopPropagation(); onProcess(); }} data-testid="process">
          <Ic.spark />{m.status === 'failed' ? 'Retry' : 'Process with AI'}
        </button>
      )}
      {m.status === 'processing' && <span className="pill run"><span className="spinner" style={{ borderColor: 'rgba(47,111,224,.3)', borderTopColor: '#2f6fe0' }} />{label}</span>}
      {m.status === 'processed' && <span className={'pill ' + pill}><span className="dot" />{label}</span>}
      <button className="ib" style={{ width: 32, height: 32, borderRadius: 9 }} onClick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="Delete material" data-testid="delete-material"><Ic.trash /></button>
    </div>
  );
}

function Preview({ m, count }: { m: Material; count: number }) {
  const w = m.widgets;
  const catL = catLabel[m.category];
  return (
    <>
      <div className="row-between">
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: 'var(--font-h)', fontSize: 15, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} data-testid="preview-title">Exercises generated · {m.short}</div>
          <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 2 }}>{m.status === 'processed' ? catL + ' · ' + count + ' exercises' + (m.missingTypes.length ? ' · no source in the text for: ' + m.missingTypes.join(', ') : '') + ' · every widget below works' : catL + ' · ' + m.kind}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}><span className="type">Q&amp;A match</span><span className="type">Audio</span><span className="type">Flashcards</span><span className="type">Fill the blank</span></div>
      </div>

      {m.status !== 'processed' || !w ? (
        <div className="card empty" style={{ flexGrow: 1 }} data-testid="preview-empty">
          <div style={{ width: 54, height: 54, borderRadius: 16, background: 'var(--blue-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--blue-d)' }}><Ic.clock /></div>
          <div style={{ fontFamily: 'var(--font-h)', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>
            {m.status === 'processing' ? STAGE_LABEL[m.stage || 'reading'] : m.status === 'failed' ? 'Processing failed' : 'Not processed yet'}
          </div>
          <div style={{ fontSize: 12.5, maxWidth: 360, lineHeight: 1.5 }}>
            {m.status === 'processing' ? 'The engine is reading the document and drafting exercises — they appear here at Ready.' : m.status === 'failed' ? m.error : 'Click "Process with AI" on this material to read it and draft exercises.'}
          </div>
          {m.status === 'processing' && <div className="shimmer" style={{ width: 260, marginTop: 8 }} />}
        </div>
      ) : (
        <div style={{ flexGrow: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 12, paddingBottom: 4 }}>
          <QaMatch w={w} />
          <AudioWidget w={w} />
          <Flashcards w={w} />
          <FillBlank w={w} />
          <Link to={'/builder/' + m.id} className="btn primary full" data-testid="open-builder">Open all {count} exercises in the task builder <Ic.arrow /></Link>
        </div>
      )}
    </>
  );
}
