import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Doc } from '../data/types';
import { computeReminders, countdownText, diffValues, groupByMonth, laterThan, statusWord, type Reminder } from '../engine/reminders';
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
        <div className="seg" style={{ padding: 2 }} data-testid="reminders-range">
          <button className={range === '3m' ? 'on' : ''} style={{ height: 26, padding: '0 9px', fontSize: 11 }} onClick={() => setRange('3m')}>Next 3 months</button>
          <button className={range === 'all' ? 'on' : ''} style={{ height: 26, padding: '0 9px', fontSize: 11 }} onClick={() => setRange('all')}>All</button>
        </div>
      </div>

      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto', minHeight: 0, flexGrow: 1 }} data-testid="reminder-months">
        {shown.map((g) => (
          <div key={g.key} data-testid="reminder-month" data-month={g.key}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 2px', position: 'sticky', top: 0, background: 'var(--card)', zIndex: 1 }}>
              <div style={{ fontFamily: 'var(--font-h)', fontSize: 12.5, fontWeight: 600 }}>{g.label}</div>
              <div style={{ fontSize: 10.5, color: 'var(--muted)' }} data-testid="month-summary"><b style={{ color: 'var(--ink)' }}>{g.items.length}</b> due · ≈ <b style={{ color: 'var(--blue-d)' }}>{g.hours} h</b> to complete</div>
            </div>
            {g.items.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '4px 2px 6px' }} data-testid="month-empty">Nothing due — every {g.label.split(' ')[0]} document is sent.</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.items.map((r) => <ReminderCard key={r.doc.id} r={r} onOpen={() => nav('/assemble/' + r.doc.id)} onVersions={() => setVersionsFor(r.doc)} />)}
            </div>
          </div>
        ))}
        {range === '3m' && later.length > 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)', padding: '2px 2px 6px' }} data-testid="reminder-later">+{later.length} more after {groups[groups.length - 1].label} — switch to <b>All</b>.</div>}
        {reminders.length === 0 && <div className="empty" style={{ padding: 20 }} data-testid="reminders-empty"><Ic.check size={18} stroke="var(--green-t)" /><div style={{ fontSize: 12.5 }}>Nothing outstanding — every document is sent.</div></div>}
      </div>
      {versionsFor && <VersionsModal docId={versionsFor.id} onClose={() => setVersionsFor(null)} />}
    </div>
  );
}

function ReminderCard({ r, onOpen, onVersions }: { r: Reminder; onOpen: () => void; onVersions: () => void }) {
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
