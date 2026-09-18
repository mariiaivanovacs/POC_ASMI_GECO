import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Doc, DocStatus } from '../data/types';
import { saveBlob, toCsv, toTsv, toXlsx, toXml } from '../engine/export';
import { explain, search, suggestions } from '../engine/search';
import { useStore } from '../store/useStore';
import { applyFilter, byRegime, byStatus, docRows, inPeriod, perDay, perWeek, strip, templateCards, type Filter, NO_FILTER, PERIOD_DAYS } from '../store/stats';
import { Topbar } from '../App';
import { Ic, regimeColor, regimeIcon } from '../components/ui/Icons';
import { DayBars, RegimeBars, StatusDonut, WeekBars } from '../components/charts/Charts';
import { RemindersPanel } from '../components/Reminders';
import { computeReminders } from '../engine/reminders';

type SortKey = 'date' | 'name' | 'template' | 'vessel' | 'status' | 'minutes';
const STATUS_LABEL: Record<DocStatus, string> = { draft: 'Draft', reviewed: 'Reviewed', sent: 'Sent' };

export function Library() {
  const nav = useNavigate();
  const templates = useStore((s) => s.templates);
  const docs = useStore((s) => s.docs);
  const setDocStatus = useStore((s) => s.setDocStatus);
  const deleteDoc = useStore((s) => s.deleteDoc);
  const createDoc = useStore((s) => s.createDoc);
  const toast = useStore((s) => s.toast);

  const [filter, setFilter] = useState<Filter>(NO_FILTER);
  const [sort, setSort] = useState<SortKey>('date');
  const [dir, setDir] = useState<1 | -1>(-1);
  const [menu, setMenu] = useState(false);
  const [query, setQuery] = useState('');

  const now = Date.now();
  const filtered = useMemo(() => applyFilter(docs, filter), [docs, filter]);
  const st = strip(filtered, now);
  const cards = templateCards(templates, docs);
  const days = perDay(filtered, 14, now);
  const regimes = byRegime(inPeriod(filtered, now));
  const weeks = perWeek(filtered, 4, now);
  const statuses = byStatus(filtered);
  const rows = useMemo(() => {
    const key = (d: Doc) => sort === 'date' ? d.createdAt : sort === 'name' ? d.name.toLowerCase() : sort === 'template' ? d.templateName : sort === 'vessel' ? d.vessel : sort === 'status' ? ['draft', 'reviewed', 'sent'].indexOf(d.status) : d.minutes;
    return filtered.slice().sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * dir);
  }, [filtered, sort, dir]);
  const toggleSort = (k: SortKey) => { if (sort === k) setDir(dir === 1 ? -1 : 1); else { setSort(k); setDir(k === 'date' || k === 'minutes' ? -1 : 1); } };
  const arrow = (k: SortKey) => (sort === k ? (dir === 1 ? ' ↑' : ' ↓') : '');
  const filterLabel = (filter.templateId ? (templates.find((t) => t.id === filter.templateId)?.name || 'deleted template') : 'all templates') + (filter.status ? ' · ' + STATUS_LABEL[filter.status] : '');

  const exportData = async (kind: 'csv' | 'xlsx' | 'tsv' | 'xml') => {
    setMenu(false);
    const data = docRows(rows);
    if (!data.length) { toast('Nothing to export — the current filter has no documents', 'err'); return; }
    const name = 'helmdocs-library-' + new Date().toISOString().slice(0, 10) + '.' + kind;
    if (kind === 'csv') saveBlob(new Blob([toCsv(data)], { type: 'text/csv' }), name);
    else if (kind === 'tsv') saveBlob(new Blob([toTsv(data)], { type: 'text/tab-separated-values' }), name);
    else if (kind === 'xml') saveBlob(new Blob([toXml(data)], { type: 'application/xml' }), name);
    else saveBlob(await toXlsx(data), name);
    toast('Exported ' + data.length + ' documents to ' + kind.toUpperCase(), 'ok');
  };

  const changeStatus = (d: Doc, status: DocStatus) => {
    if (status === d.status) return;
    if (status === 'sent' && d.status !== 'reviewed') { toast('"' + d.name + '" must be marked reviewed by a person before it can be sent', 'err'); return; }
    setDocStatus(d.id, status);
    toast(d.name + ' → ' + STATUS_LABEL[status], 'ok');
  };

  const result = useMemo(() => search(docs, query), [docs, query]);
  const sugg = useMemo(() => suggestions(docs), [docs]);

  return (
    <>
      <Topbar title="Library" crumb={<>Document studio &nbsp;›&nbsp; <b>Library</b> &nbsp;<span className="fr" title="FR-01 web access · FR-07 dashboards with ≥4 charts and interactive filtering · FR-08 CSV / XLSX / XML / TSV extraction">FR-01 · FR-07 · FR-08</span> <span style={{ color: 'var(--amber-t)', fontWeight: 600 }}>demo data</span></>}
        right={<button className="btn primary" onClick={() => { const t = templates[0]; if (!t) { toast('Save a template first', 'err'); return; } const d = createDoc(filter.templateId || t.id); if (d) nav('/assemble/' + d.id); }} data-testid="new-document"><Ic.pen size={15} />New document</button>} />
      <div className="content" style={{ paddingTop: 12 }}>
        <section style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 14, minHeight: 0, overflow: 'auto', paddingRight: 2 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 10 }} data-testid="stats-strip">
            <div className="stat"><small>Generated · last {PERIOD_DAYS} days</small><b data-testid="stat-generated">{st.generated}</b></div>
            <div className="stat"><small>Sent to authority / customer</small><b style={{ color: 'var(--green-t)' }} data-testid="stat-sent">{st.sent}</b></div>
            <div className="stat"><small>Pending human review</small><b style={{ color: 'var(--amber-t)' }} data-testid="stat-pending">{st.pendingReview}</b></div>
            <div className="stat" style={{ borderColor: 'var(--blue-t)' }}><small>Avg. minutes per document</small><b style={{ color: 'var(--blue-d)' }} data-testid="stat-avg">{st.avgMinutes}</b><span className="vs" data-testid="stat-manual">vs {st.manualMinutes} min manual*</span></div>
            <div className="stat"><small>Hours saved · last {PERIOD_DAYS} days</small><b style={{ color: 'var(--green-t)' }} data-testid="stat-saved">{st.hoursSaved} h</b></div>
          </div>

          <div className="grid2" style={{ gap: 10 }} data-testid="charts">
            <div className="card" style={{ padding: 12 }}><div className="chart-h">Documents per day · 14 days</div><DayBars days={days} /><div className="legend"><span><i style={{ background: '#46d3c4' }} />sent</span><span><i style={{ background: '#2f4a52' }} />draft / reviewed</span></div></div>
            <div className="card" style={{ padding: 12 }}><div className="chart-h">By compliance regime · {PERIOD_DAYS} days</div><div style={{ marginTop: 8 }}><RegimeBars rows={regimes} /></div></div>
            <div className="card" style={{ padding: 12 }}><div className="chart-h">Minutes per week · HelmDocs vs manual*</div><WeekBars weeks={weeks} /><div className="legend"><span><i style={{ background: '#46d3c4' }} />with HelmDocs</span><span><i style={{ background: '#2f4a52' }} />manual baseline</span></div></div>
            <div className="card" style={{ padding: 12 }}><div className="chart-h">Status · {filterLabel}</div><div style={{ marginTop: 6 }}><StatusDonut rows={statuses} /></div></div>
          </div>

          <div>
            <div className="row-between" style={{ marginBottom: 8 }}>
              <div className="card-h">Templates <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, marginLeft: 6 }}>by compliance regime · click to filter everything above and below</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={'chip' + (!filter.templateId ? ' on' : '')} onClick={() => setFilter({ ...filter, templateId: null })} data-testid="filter-all">All templates</button>
                {(['draft', 'reviewed', 'sent'] as DocStatus[]).map((s) => <button key={s} className={'chip' + (filter.status === s ? ' on' : '')} onClick={() => setFilter({ ...filter, status: filter.status === s ? null : s })} data-testid={'filter-' + s}>{STATUS_LABEL[s]}</button>)}
              </div>
            </div>
            <div className="grid3" style={{ gap: 12 }} data-testid="template-cards">
              {cards.map((c) => { const I = regimeIcon(c.template.regimeShort); const on = filter.templateId === c.template.id; const color = regimeColor(c.template.regimeShort); const max = Math.max(1, ...c.series); return (
                <button key={c.template.id} className={'tcard big' + (on ? ' on' : filter.templateId ? ' dim' : '')} onClick={() => setFilter({ ...filter, templateId: on ? null : c.template.id })} data-testid="template-card" data-count={c.count} style={{ borderTopColor: color }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    <div className="ico" style={{ background: color, width: 46, height: 46, borderRadius: 12, color: '#0c1517' }}><I size={22} /></div>
                    <div style={{ minWidth: 0, flexGrow: 1 }}>
                      <b style={{ fontSize: 14 }}>{c.template.name}</b>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                        <span className="code" style={{ color, borderColor: color }} data-testid="card-code">{c.formCode}</span>
                        <small style={{ margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={c.template.regime}>{c.template.regime}</small>
                      </div>
                    </div>
                  </div>
                  <div className="bignums">
                    <div><b data-testid="card-count">{c.count}</b><small>documents</small></div>
                    <div><b style={{ color: 'var(--blue-d)' }}>{c.avgMinutes}</b><small title={"average minutes per document, versus " + c.template.manualMinutes + " min by hand"}>min vs {c.template.manualMinutes}</small></div>
                    <div><b style={{ color: 'var(--green-t)' }}>{c.hoursSaved}h</b><small>saved</small></div>
                    <div><b style={{ color: c.pending ? 'var(--amber-t)' : 'var(--ink)' }}>{c.pending}</b><small>open</small></div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12 }}>
                    <div style={{ flexGrow: 1, minWidth: 0 }}>
                      <div className="statusbar" title={c.draft + ' draft · ' + c.reviewed + ' reviewed · ' + c.sent + ' sent'} data-testid="card-statusbar">
                        {c.count === 0 && <i style={{ flexGrow: 1, background: 'var(--line2)' }} />}
                        {c.draft > 0 && <i style={{ flexGrow: c.draft, background: '#f2c14e' }} />}
                        {c.reviewed > 0 && <i style={{ flexGrow: c.reviewed, background: '#46d3c4' }} />}
                        {c.sent > 0 && <i style={{ flexGrow: c.sent, background: '#4fd18b' }} />}
                      </div>
                      <div style={{ display: 'flex', gap: 10, fontSize: 10.5, color: 'var(--ink2)', marginTop: 4 }}><span><i className="dotl" style={{ background: '#f2c14e' }} />{c.draft} draft</span><span><i className="dotl" style={{ background: '#46d3c4' }} />{c.reviewed} reviewed</span><span><i className="dotl" style={{ background: '#4fd18b' }} />{c.sent} sent</span></div>
                    </div>
                    <svg width="78" height="30" viewBox="0 0 78 30" aria-label="Documents per week, last 6 weeks" data-testid="card-spark">
                      {c.series.map((v, i) => <rect key={i} x={i * 13} y={30 - Math.max(3, (26 * v) / max)} width="10" height={Math.max(3, (26 * v) / max)} rx="2" fill={v ? color : '#2f4a52'} opacity={v ? 0.35 + 0.65 * (i / 5) : 1} />)}
                    </svg>
                  </div>
                </button>
              ); })}
              {cards.length === 0 && <div className="card empty" style={{ gridColumn: '1 / -1', padding: 20 }}>No templates — save one on the Templates screen.</div>}
            </div>
          </div>

          <div className="card" style={{ padding: '14px 14px 10px', display: 'flex', flexDirection: 'column', minHeight: 260 }}>
            <div className="row-between">
              <div className="card-h">Generated documents <span style={{ fontSize: 12, color: 'var(--ink2)', fontWeight: 500, marginLeft: 6 }} data-testid="row-count">{rows.length} shown · {filterLabel}</span></div>
              <div style={{ position: 'relative' }}>
                <button className="btn sm" onClick={() => setMenu((v) => !v)} data-testid="export-data"><Ic.table size={14} />Export CSV / XLSX <Ic.dots size={12} /></button>
                {menu && (
                  <div className="menu" style={{ top: 36 }} onMouseLeave={() => setMenu(false)} data-testid="export-data-menu">
                    <button onClick={() => exportData('csv')} data-testid="export-csv"><Ic.table size={13} />CSV</button>
                    <button onClick={() => exportData('xlsx')} data-testid="export-xlsx"><Ic.table size={13} />XLSX (Excel)</button>
                    <button onClick={() => exportData('tsv')} data-testid="export-tsv"><Ic.table size={13} />TSV</button>
                    <button onClick={() => exportData('xml')} data-testid="export-xml"><Ic.file size={13} />XML</button>
                  </div>
                )}
              </div>
            </div>
            <div className="tablescroll" style={{ overflow: 'auto', marginTop: 8, maxHeight: 440, minHeight: 0 }} data-testid="doc-table-scroll">
              <div style={{ minWidth: 780 }}>
                <div className="drow head" style={{ position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
                  <button onClick={() => toggleSort('name')}>Document{arrow('name')}</button>
                  <button onClick={() => toggleSort('template')}>Template{arrow('template')}</button>
                  <button onClick={() => toggleSort('vessel')}>Vessel / site{arrow('vessel')}</button>
                  <button onClick={() => toggleSort('status')}>Status{arrow('status')}</button>
                  <button onClick={() => toggleSort('date')} data-testid="sort-date">Generated{arrow('date')}</button>
                  <button onClick={() => toggleSort('minutes')}>Min{arrow('minutes')}</button>
                  <span>By</span>
                  <span />
                </div>
                <div className="stack" style={{ gap: 2 }} data-testid="doc-list">
                  {rows.map((d) => { const I = regimeIcon(d.regimeShort); const orphan = !templates.some((t) => t.id === d.templateId); return (
                    <div key={d.id} className="drow" data-testid="doc-row" data-status={d.status} data-id={d.id}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <span style={{ width: 24, height: 24, borderRadius: 6, background: regimeColor(d.regimeShort), color: '#0c1517', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I size={13} /></span>
                        <button className="mono" style={{ border: 0, background: 'transparent', padding: 0, cursor: 'pointer', color: 'var(--blue-d)', minWidth: 0 }} onClick={() => nav('/assemble/' + d.id)} title={d.name} data-testid="open-doc">{d.name}</button>
                      </div>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={d.templateName}>{d.templateName}{orphan && <span className="fr" style={{ marginLeft: 6, background: 'var(--amber-l)', color: 'var(--amber-t)' }}>template deleted</span>}</span>
                      <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.vessel}</span>
                      <select className={'pill ' + d.status} style={{ border: 0, cursor: 'pointer', height: 26 }} value={d.status} onChange={(e) => changeStatus(d, e.target.value as DocStatus)} aria-label="Status" data-testid="row-status">
                        <option value="draft">Draft</option><option value="reviewed">Reviewed</option><option value="sent">Sent</option>
                      </select>
                      <span style={{ fontSize: 12 }}>{new Date(d.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      <span style={{ fontSize: 12 }}>{d.minutes}<span style={{ color: 'var(--muted)' }}>/{d.manualMinutes}</span></span>
                      <span style={{ fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.by}</span>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
                        <button className="ib" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => nav('/assemble/' + d.id)} aria-label="Open" title="Open"><Ic.open size={13} /></button>
                        <button className="ib" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => { if (window.confirm('Delete "' + d.name + '" from the library?')) { deleteDoc(d.id); toast('Deleted ' + d.name, 'ok'); } }} aria-label="Delete document" data-testid="delete-doc"><Ic.trash size={12} /></button>
                      </div>
                    </div>
                  ); })}
                  {rows.length === 0 && <div className="empty" style={{ padding: 30 }} data-testid="docs-empty"><div style={{ fontWeight: 700, color: 'var(--ink)' }}>No documents match this filter</div><div style={{ fontSize: 12.5 }}>Clear the template or status filter, or assemble a new document.</div></div>}
                </div>
              </div>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8 }}>* Manual baseline = minutes to draft the same form by hand, set per template (demo assumption, editable per template in a full build). Minutes = time from opening a document to its last edit.</div>
          </div>
        </section>

        <aside className="aicard" style={{ width: 380, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }} data-testid="assistant">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div className="mark"><Ic.spark size={16} /></div>
            <div style={{ minWidth: 0 }}><div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--font-h)', whiteSpace: 'nowrap' }}>HelmDocs Assistant</div><div style={{ fontSize: 11, color: 'var(--purple-t)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Documents · compliance calendar</div></div>
            <DueBadge />
          </div>
          <div className="search" style={{ width: '100%', marginTop: 12 }}>
            <Ic.search />
            <input placeholder="Ask by vessel, work order, regime or status…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Ask the assistant" data-testid="assistant-input" />
            {query && <button className="ib" style={{ width: 24, height: 24, borderRadius: 7 }} onClick={() => setQuery('')} aria-label="Clear"><Ic.x size={10} /></button>}
          </div>
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {sugg.map((s) => <button key={s} className="sug" onClick={() => setQuery(s)} data-testid="suggestion">{s}</button>)}
          </div>
          {result.tokens.length > 0 && (
            <>
              <div style={{ marginTop: 12, padding: '9px 11px', borderRadius: 10, background: 'rgba(143,125,255,.08)', border: '1px solid rgba(143,125,255,.2)', fontSize: 12, color: '#d3dedb', lineHeight: 1.45 }} data-testid="assistant-answer">
                {result.hits.length ? 'Found ' + result.hits.length + ' document' + (result.hits.length === 1 ? '' : 's') + ' for “' + query + '”, best match first.'
                  : 'Nothing in the library matches “' + query + '”. Try a vessel name (MV Ocean Pioneer, Sea Falcon 7), a work-order number, a regime (IHM, SHMS, bizSAFE, PTW) or a status (pending, sent).'}
              </div>
              <div className="stack" style={{ marginTop: 8, overflow: 'auto', maxHeight: 300, flexShrink: 0 }} data-testid="assistant-results">
                {result.hits.map((h) => { const I = regimeIcon(h.doc.regimeShort); return (
                  <button key={h.doc.id} className="res" onClick={() => nav('/assemble/' + h.doc.id)} data-testid="assistant-hit">
                    <span style={{ width: 28, height: 28, borderRadius: 7, background: regimeColor(h.doc.regimeShort), color: '#0c1517', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><I size={14} /></span>
                    <div style={{ minWidth: 0, flexGrow: 1 }}>
                      <div style={{ fontFamily: 'var(--font-m)', fontSize: 11, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.doc.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2 }}>{h.doc.templateName} · {h.doc.vessel}</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                        <span className={'pill ' + h.doc.status} style={{ padding: '2px 8px' }}>{STATUS_LABEL[h.doc.status]}</span>
                        <span style={{ fontSize: 10.5, color: 'var(--purple-t)' }} data-testid="hit-why">matched {explain(h.why)}</span>
                      </div>
                    </div>
                  </button>
                ); })}
                {result.hits.length === 0 && <div className="empty" style={{ padding: 14 }} data-testid="assistant-empty"><Ic.search /><div style={{ fontSize: 12 }}>No matches</div></div>}
              </div>
            </>
          )}
          {!result.tokens.length && <div style={{ marginTop: 10, fontSize: 11, color: 'var(--muted)', lineHeight: 1.4 }} data-testid="assistant-answer">Ask by vessel, work order, regime or status — keyword search over this company's library only; nothing is drafted or submitted.</div>}
          <RemindersPanel />
          <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 8, lineHeight: 1.4 }}>Searches this company's library only. Never drafts or submits a filing on its own.</div>
        </aside>
      </div>
    </>
  );
}


function DueBadge() {
  const docs = useStore((s) => s.docs);
  const templates = useStore((s) => s.templates);
  const rules = useStore((s) => s.settings.deadlines);
  const n = computeReminders(docs, templates, rules).filter((r) => r.urgency !== 'later').length;
  return <span className={'pill ' + (n ? 'draft' : 'ok')} style={{ marginLeft: 'auto', fontSize: 10.5, padding: '3px 8px', flexShrink: 0 }} data-testid="due-badge"><span className="dot" />{n ? n + ' due this week' : 'all on track'}</span>;
}
