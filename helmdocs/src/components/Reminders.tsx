import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Doc } from '../data/types';
import { calendarEntries, computeReminders, countdownText, diffValues, groupByMonth, laterThan, monthGrid, startOfDay, statusWord, type CalEntry, type CalState, type Reminder } from '../engine/reminders';
import { useStore } from '../store/useStore';
import { Ic, regimeColor } from './ui/Icons';

const URG: Record<string, { color: string; cls: string; word: string }> = {
  overdue: { color: '#ff9b9a', cls: 'overdue', word: 'overdue' },
  today: { color: '#f5d27a', cls: 'today', word: 'due today' },
  soon: { color: '#f5d27a', cls: 'soon', word: 'due this week' },
  later: { color: '#7ee8dc', cls: 'ok', word: 'on track' },
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Compliance reminders under the assistant's search: three months of deadlines, what is missing, hours left. */
export function RemindersPanel() {
  const nav = useNavigate();
  const docs = useStore((s) => s.docs);
  const templates = useStore((s) => s.templates);
  const rules = useStore((s) => s.settings.deadlines);
  const [range, setRange] = useState<'3m' | 'all'>('3m');
  const [view, setView] = useState<'list' | 'calendar'>('calendar');
  const [submitFor, setSubmitFor] = useState<Doc | null>(null);
  const [versionsFor, setVersionsFor] = useState<Doc | null>(null);
  const now = Date.now();
  const reminders = useMemo(() => computeReminders(docs, templates, rules, now), [docs, templates, rules, now]);
  const groups = useMemo(() => groupByMonth(reminders, now, range === '3m' ? 3 : 12), [reminders, now, range]);
  const later = laterThan(reminders, groups);
  const dueSoon = reminders.filter((r) => r.urgency !== 'later').length;
  const shown = groups.filter((g) => g.items.length || range === '3m');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, flexGrow: 1 }} data-testid="reminders" data-due-soon={dueSoon}>
      <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div><div style={{ fontSize: 13, fontWeight: 700 }}>Compliance reminders</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Due date · document · urgency · what is missing · hours left</div></div>
        <div className="seg" style={{ padding: 2 }} data-testid="reminders-view">
          <button className={view === 'calendar' ? 'on' : ''} style={{ height: 26, padding: '0 9px', fontSize: 11 }} onClick={() => setView('calendar')} data-testid="view-calendar">Calendar</button>
          <button className={view === 'list' ? 'on' : ''} style={{ height: 26, padding: '0 9px', fontSize: 11 }} onClick={() => setView('list')} data-testid="view-list">List</button>
        </div>
      </div>
      {view === 'list' && (
        <div className="seg" style={{ padding: 2, marginTop: 8, alignSelf: 'flex-start' }} data-testid="reminders-range">
          <button className={range === '3m' ? 'on' : ''} style={{ height: 24, padding: '0 9px', fontSize: 11 }} onClick={() => setRange('3m')}>Next 3 months</button>
          <button className={range === 'all' ? 'on' : ''} style={{ height: 24, padding: '0 9px', fontSize: 11 }} onClick={() => setRange('all')}>All</button>
        </div>
      )}
      {view === 'calendar' && <ComplianceCalendar onOpen={(id) => nav('/assemble/' + id)} onSubmit={setSubmitFor} />}

      {view === 'list' && <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', minHeight: 0, flexGrow: 1 }} data-testid="reminder-months">
        {shown.map((g) => (
          <div key={g.key} data-testid="reminder-month" data-month={g.key}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 2px', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <div style={{ fontFamily: 'var(--font-h)', fontSize: 12.5, fontWeight: 600 }}>{g.label}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)' }} data-testid="month-summary"><b style={{ color: 'var(--ink)' }}>{g.items.length}</b> due · ≈ <b style={{ color: 'var(--blue-d)' }}>{g.hours} h</b> to complete</div>
            </div>
            {g.items.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '4px 2px 6px' }} data-testid="month-empty">Nothing due — every {g.label.split(' ')[0]} document is sent.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.items.map((r) => <ReminderCard key={r.doc.id} r={r} onOpen={() => nav('/assemble/' + r.doc.id)} onVersions={() => setVersionsFor(r.doc)} onSubmit={() => setSubmitFor(r.doc)} />)}
            </div>
          </div>
        ))}
        {range === '3m' && later.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '2px 2px 6px' }} data-testid="reminder-later">+{later.length} more after {groups[groups.length - 1].label} — switch to <b>All</b>.</div>}
        {reminders.length === 0 && <div className="empty" style={{ padding: 20 }} data-testid="reminders-empty"><Ic.check size={18} stroke="var(--green-t)" /><div style={{ fontSize: 12.5 }}>Nothing outstanding — every document is sent.</div></div>}
      </div>}
      {submitFor && <SubmitModal docId={submitFor.id} onClose={() => setSubmitFor(null)} />}
      {versionsFor && <VersionsModal docId={versionsFor.id} onClose={() => setVersionsFor(null)} />}
    </div>
  );
}

function ReminderCard({ r, onOpen, onVersions, onSubmit }: { r: Reminder; onOpen: () => void; onVersions: () => void; onSubmit: () => void }) {
  const u = URG[r.urgency];
  const d = new Date(r.due);
  return (
    <div className={'rem ' + (r.urgency === 'overdue' ? 'overdue' : r.urgency === 'today' ? 'today' : '')} data-testid="reminder" data-urgency={r.urgency} data-doc={r.doc.id}>
      <div style={{ width: 44, flexShrink: 0, textAlign: 'center', paddingTop: 2 }}>
        <div style={{ fontFamily: 'var(--font-h)', fontSize: 24, fontWeight: 700, lineHeight: 1, color: u.color }} data-testid="reminder-due">{d.getDate()}</div>
        <div style={{ fontSize: 11, fontWeight: 700, color: u.color, textTransform: 'uppercase', letterSpacing: '.08em', marginTop: 3, opacity: .85 }}>{MON[d.getMonth()]}</div>
      </div>
      <div style={{ minWidth: 0, flexGrow: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: u.color, display: 'inline-flex', flexShrink: 0 }} title={u.word} data-testid="reminder-icon"><Ic.alert size={14} /></span>
          <span className={'cd ' + u.cls} data-testid="reminder-countdown">{countdownText(r)}</span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>{statusWord(r.doc.status)}</span>
        </div>
        <div style={{ fontFamily: 'var(--font-h)', fontSize: 15, fontWeight: 600, lineHeight: 1.25, marginTop: 5, wordBreak: 'break-all' }} title={r.doc.name} data-testid="reminder-name">{r.doc.name.replace(/\.(pdf|docx)$/, '')}</div>
        <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={r.rule.text}><span style={{ color: regimeColor(r.doc.regimeShort) }}>{r.doc.templateName}</span> · {r.doc.vessel} · <span style={{ color: 'var(--muted)' }}>{r.rule.text}</span></div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8, marginTop: 6 }}>
          <div style={{ minWidth: 0 }} data-testid="reminder-missing">
            {r.ready ? <span className="miss ok">Ready — reviewed, not sent</span> : <>
              {r.doc.status === 'draft' && r.missing.length === 0 && <span className="miss">Needs review</span>}
              {r.missing.slice(0, 3).map((m) => <span key={m} className="miss">{m}</span>)}
              {r.missing.length > 3 && <span className="miss">+{r.missing.length - 3} more</span>}
              {!r.template && <span className="miss">Template deleted</span>}
            </>}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 10.5, color: 'var(--blue-d)', whiteSpace: 'nowrap' }} title="Estimated time to finish, review and send" data-testid="reminder-hours">≈ {r.hoursLeft} h</span>
            {r.doc.status === 'reviewed' && <button className="btn sm" style={{ height: 24, padding: '0 9px', fontSize: 11 }} onClick={onSubmit} data-testid="reminder-submit">Mark submitted</button>}
            <button className="btn sm primary" style={{ height: 24, padding: '0 9px', fontSize: 11 }} onClick={onOpen} data-testid="reminder-open">Open</button>
            <button className="btn sm" style={{ height: 24, padding: '0 8px', fontSize: 11 }} onClick={onVersions} title="View previous versions" data-testid="reminder-versions">v{r.doc.versions.length} ▾</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Every checkpoint of a document, what changed between them, and a restore. */
export function VersionsModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const doc = useStore((s) => s.docs.find((d) => d.id === docId));
  const template = useStore((s) => s.templates.find((t) => t.id === doc?.templateId));
  const restore = useStore((s) => s.restoreVersion);
  const toast = useStore((s) => s.toast);
  const nav = useNavigate();
  if (!doc) return null;
  const label = (k: string) => template?.fields.find((f) => f.key === k)?.label || k;
  const versions = doc.versions.slice().reverse();
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 620, maxHeight: '88vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Previous versions" data-testid="versions-modal">
        <div className="row-between"><div><h2 style={{ fontSize: 15 }}>Previous versions</h2><div className="card-sub" style={{ fontFamily: 'var(--font-m)', fontSize: 11 }}>{doc.name}</div></div><button className="ib" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close"><Ic.x /></button></div>
        <div className="stack" style={{ marginTop: 12, gap: 8 }}>
          {versions.map((v, i) => {
            const prev = versions[i + 1];
            const changes = prev ? diffValues(prev.values, v.values) : [];
            const current = i === 0;
            return (
              <div key={v.n} className="res" style={{ flexDirection: 'column', gap: 6, cursor: 'default' }} data-testid="version" data-n={v.n}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="fr" style={{ fontFamily: 'var(--font-m)' }}>v{v.n}</span>
                  <b style={{ fontSize: 12.5 }}>{v.note}</b>
                  <span className={'pill ' + v.status} style={{ padding: '2px 8px' }}>{statusWord(v.status)}</span>
                  <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--muted)' }}>{new Date(v.at).toLocaleString()} · {v.by}</span>
                </div>
                {prev && (changes.length ? (
                  <div style={{ fontSize: 11.5, color: 'var(--ink2)' }} data-testid="version-diff">
                    {changes.slice(0, 6).map((c) => <div key={c.key}><span style={{ color: 'var(--muted)' }}>{label(c.key)}:</span> <s style={{ color: 'var(--red-t)' }}>{c.from || '(empty)'}</s> → <b style={{ color: 'var(--green-t)' }}>{c.to || '(empty)'}</b></div>)}
                    {changes.length > 6 && <div style={{ color: 'var(--muted)' }}>+{changes.length - 6} more fields</div>}
                  </div>
                ) : <div style={{ fontSize: 11.5, color: 'var(--muted)' }}>No field changes — status only.</div>)}
                <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  {current ? <span style={{ fontSize: 11, color: 'var(--green-t)', fontWeight: 600 }}>current</span> : doc.status !== 'sent' && (
                    <button className="btn sm" onClick={() => { if (window.confirm('Restore version ' + v.n + '? The current values are kept as a new version and the document returns to Draft.')) { restore(doc.id, v.n); toast('Restored version ' + v.n + ' as a new draft', 'ok'); } }} data-testid="version-restore">Restore</button>
                  )}
                </div>
              </div>
            );
          })}
          {versions.length === 0 && <div className="empty" style={{ padding: 16 }}>No history recorded yet.</div>}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 12 }}>
          <button className="btn sm primary" onClick={() => { onClose(); nav('/assemble/' + doc.id); }} data-testid="versions-open">Open document</button>
        </div>
      </div>
    </div>
  );
}

const CAL_COLOR: Record<CalState, string> = { overdue: '#ff7a78', today: '#f5d27a', soon: '#f5d27a', later: '#7ab8ff', ontime: '#5fd99a', late: '#f0a35e' };
const CAL_WORD: Record<CalState, string> = { overdue: 'Overdue', today: 'Due today', soon: 'Due this week', later: 'Upcoming', ontime: 'Submitted on time', late: 'Submitted late' };
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

/** Month calendar of due dates: outstanding documents by urgency, submitted ones as on time / late. Click a day to act on it. */
function ComplianceCalendar({ onOpen, onSubmit }: { onOpen: (docId: string) => void; onSubmit: (d: Doc) => void }) {
  const docs = useStore((s) => s.docs);
  const rules = useStore((s) => s.settings.deadlines);
  const reopen = useStore((s) => s.reopenDoc);
  const toast = useStore((s) => s.toast);
  const today = startOfDay(Date.now());
  const [month, setMonth] = useState(today);
  const [day, setDay] = useState<number>(today);
  const entries = useMemo(() => calendarEntries(docs, rules), [docs, rules]);
  const byDay = useMemo(() => { const m = new Map<number, CalEntry[]>(); for (const e of entries) m.set(e.due, [...(m.get(e.due) || []), e]); return m; }, [entries]);
  const grid = monthGrid(month);
  const cur = new Date(month);
  const shift = (n: number) => { const d = new Date(cur.getFullYear(), cur.getMonth() + n, 1).getTime(); setMonth(d); };
  const inMonth = entries.filter((e) => new Date(e.due).getMonth() === cur.getMonth() && new Date(e.due).getFullYear() === cur.getFullYear());
  const overdueAll = entries.filter((e) => e.state === 'overdue').length;
  const selected = byDay.get(day) || [];
  return (
    <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, overflow: 'auto' }} data-testid="calendar">
      <div className="row-between">
        <button className="ib" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => shift(-1)} aria-label="Previous month" data-testid="cal-prev">‹</button>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: 'var(--font-h)', fontSize: 13.5, fontWeight: 700 }} data-testid="cal-month">{monthLabel(cur)}</div>
          <div style={{ fontSize: 10.5, color: 'var(--muted)' }} data-testid="cal-summary">{inMonth.length} due · {inMonth.filter((e) => e.submittedAt).length} submitted{overdueAll ? ' · ' : ''}{overdueAll ? <b style={{ color: CAL_COLOR.overdue }}>{overdueAll} overdue</b> : null}</div>
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn sm" style={{ height: 28, padding: '0 8px', fontSize: 11 }} onClick={() => { setMonth(today); setDay(today); }} data-testid="cal-today">Today</button>
          <button className="ib" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => shift(1)} aria-label="Next month" data-testid="cal-next">›</button>
        </div>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {WEEKDAYS.map((w) => <div key={w} style={{ fontSize: 10, color: 'var(--muted)', textAlign: 'center', fontWeight: 700 }}>{w}</div>)}
        {grid.map((t) => {
          const items = byDay.get(t) || [];
          const other = new Date(t).getMonth() !== cur.getMonth();
          const isToday = t === today, isSel = t === day;
          return (
            <button key={t} onClick={() => setDay(t)} data-testid="cal-day" data-day={isoDay(t)} data-count={items.length}
              style={{ minHeight: 40, padding: '3px 2px', borderRadius: 8, border: '1px solid ' + (isSel ? 'var(--blue)' : isToday ? 'var(--blue-t)' : 'var(--line)'), background: isSel ? 'rgba(59,130,246,.14)' : 'var(--card2)', opacity: other ? 0.4 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
              <span style={{ fontSize: 11, fontWeight: isToday ? 800 : 600, color: isToday ? 'var(--blue-d)' : 'var(--ink)' }}>{new Date(t).getDate()}</span>
              <span style={{ display: 'flex', gap: 2, flexWrap: 'wrap', justifyContent: 'center' }}>
                {items.slice(0, 4).map((e) => <i key={e.doc.id} title={e.doc.name + ' — ' + CAL_WORD[e.state]} style={{ width: 6, height: 6, borderRadius: 999, background: CAL_COLOR[e.state] }} />)}
                {items.length > 4 && <span style={{ fontSize: 8, color: 'var(--muted)' }}>+{items.length - 4}</span>}
              </span>
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, fontSize: 10, color: 'var(--ink2)' }}>
        {(['overdue', 'soon', 'later', 'ontime', 'late'] as CalState[]).map((k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><i style={{ width: 7, height: 7, borderRadius: 999, background: CAL_COLOR[k] }} />{CAL_WORD[k]}</span>)}
      </div>
      <div style={{ borderTop: '1px solid var(--line)', paddingTop: 8 }} data-testid="cal-day-list">
        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>{new Date(day).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}{day === today ? ' · today' : ''}</div>
        {selected.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)' }} data-testid="cal-day-empty">Nothing due on this day.</div>}
        <div className="stack" style={{ gap: 6 }}>
          {selected.map((e) => (
            <div key={e.doc.id} className="res" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 5, cursor: 'default' }} data-testid="cal-entry" data-state={e.state} data-doc={e.doc.id}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <i style={{ width: 8, height: 8, borderRadius: 999, background: CAL_COLOR[e.state], flexShrink: 0 }} />
                <span style={{ fontSize: 11, fontWeight: 700, color: CAL_COLOR[e.state] }} data-testid="cal-entry-state">{CAL_WORD[e.state]}{e.state === 'overdue' ? ' · ' + e.daysLate + ' day' + (e.daysLate === 1 ? '' : 's') : e.state === 'late' ? ' · ' + e.daysLate + ' day' + (e.daysLate === 1 ? '' : 's') + ' after due' : ''}</span>
                <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--muted)' }}>{statusWord(e.doc.status)}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-m)', fontSize: 11, wordBreak: 'break-all' }}>{e.doc.name}</div>
              <div style={{ fontSize: 10.5, color: 'var(--ink2)' }}><span style={{ color: regimeColor(e.doc.regimeShort) }}>{e.doc.templateName}</span> · {e.rule.text}</div>
              {e.submittedAt && <div style={{ fontSize: 10.5, color: 'var(--ink2)' }} data-testid="cal-entry-submitted">Submitted {new Date(e.submittedAt).toLocaleDateString()} {e.doc.submittedVia === 'manual' ? '(recorded manually' + (e.doc.submittedRef ? ', ref ' + e.doc.submittedRef : '') + ')' : '(by email)'}</div>}
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                {e.doc.status === 'draft' && <span style={{ fontSize: 10.5, color: 'var(--muted)', alignSelf: 'center' }}>review it before submitting</span>}
                {e.doc.status === 'reviewed' && <button className="btn sm" style={{ height: 24, padding: '0 9px', fontSize: 11 }} onClick={() => onSubmit(e.doc)} data-testid="cal-submit">Mark submitted</button>}
                {e.doc.status === 'sent' && e.doc.submittedVia === 'manual' && <button className="btn sm" style={{ height: 24, padding: '0 9px', fontSize: 11 }} onClick={() => { if (window.confirm('Undo the recorded submission of ' + e.doc.name + '? It goes back to Reviewed and counts as outstanding again.')) { reopen(e.doc.id); toast('Submission undone — back to Reviewed', 'ok'); } }} data-testid="cal-undo">Undo</button>}
                <button className="btn sm primary" style={{ height: 24, padding: '0 9px', fontSize: 11 }} onClick={() => onOpen(e.doc.id)} data-testid="cal-open">Open</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
function monthLabel(d: Date): string { return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }); }

const isoDay = (t: number) => { const d = new Date(t); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

/** Record a submission that happened outside the app (portal upload, courier, in person): date + optional receipt reference. */
export function SubmitModal({ docId, onClose }: { docId: string; onClose: () => void }) {
  const doc = useStore((s) => s.docs.find((d) => d.id === docId));
  const markSubmitted = useStore((s) => s.markSubmitted);
  const toast = useStore((s) => s.toast);
  const [date, setDate] = useState(isoDay(Date.now()));
  const [ref, setRef] = useState('');
  if (!doc) return null;
  const save = () => {
    const [y, m, d] = date.split('-').map(Number);
    const at = y ? new Date(y, m - 1, d, 12).getTime() : NaN;
    const r = markSubmitted(doc.id, Math.min(at, Date.now()), ref);
    toast(r.message, r.ok ? 'ok' : 'err');
    if (r.ok) onClose();
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Mark submitted" data-testid="submit-modal">
        <div className="row-between"><h2 style={{ fontSize: 15 }}>Mark as submitted</h2><button className="ib" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close"><Ic.x /></button></div>
        <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 4, wordBreak: 'break-all' }}>{doc.name}</div>
        <label className="lbl" htmlFor="sub-date" style={{ marginTop: 12 }}>Submitted on</label>
        <input id="sub-date" className="input" type="date" value={date} max={isoDay(Date.now())} onChange={(e) => setDate(e.target.value)} data-testid="submit-date" />
        <label className="lbl" htmlFor="sub-ref" style={{ marginTop: 10 }}>Receipt / portal reference (optional)</label>
        <input id="sub-ref" className="input" placeholder="e.g. MOM iReport 2026-118842" value={ref} onChange={(e) => setRef(e.target.value)} data-testid="submit-ref" />
        <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 8, lineHeight: 1.45 }}>Use this when the document went out by portal, courier or in person. It locks the document and the calendar shows it as submitted on time or late against its deadline.</div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
          <button className="btn sm" onClick={onClose}>Cancel</button>
          <button className="btn sm primary" onClick={save} disabled={!date} data-testid="submit-save">Mark submitted</button>
        </div>
      </div>
    </div>
  );
}
