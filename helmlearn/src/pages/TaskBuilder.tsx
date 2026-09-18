import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Exercise, ExType, ReviewerRole } from '../data/types';
import { exerciseQuality, reviewCoverage, type ExerciseQuality } from '../store/stats';
import { LANGS, t as T } from '../data/i18n';
import { ALL_TYPES } from '../engine/generate';
import { catLabel, useStore } from '../store/useStore';
import { Topbar } from '../App';
import { Ic, TYPE_ICON, TYPE_LABEL } from '../components/ui/Icons';
import { Avatar } from '../components/ui/Avatar';
import { Player, type Outcome } from '../components/exercises/Exercises';
import { celebrate } from '../fx/celebrate';
import { QualityPill } from '../components/QualityPill';

const LEVEL_LABEL: Record<string, string> = { all: 'All', new: 'New hire', exp: 'Experienced' };
const REVIEWER_ROLES: ReviewerRole[] = ['Trainer', 'HSE Manager', 'Supervisor', 'Auditor'];

export function TaskBuilder() {
  const { materialId } = useParams();
  const nav = useNavigate();
  const materials = useStore((s) => s.materials);
  const exercises = useStore((s) => s.exercises);
  const learners = useStore((s) => s.learners);
  const settings = useStore((s) => s.settings);
  const setLang = useStore((s) => s.setLang);
  const setPlayAs = useStore((s) => s.setPlayAs);
  const updateTitle = useStore((s) => s.updateExerciseTitle);
  const deleteExercise = useStore((s) => s.deleteExercise);
  const approveExercise = useStore((s) => s.approveExercise);
  const rejectExercise = useStore((s) => s.rejectExercise);
  const setReviewer = useStore((s) => s.setReviewer);
  const regenerateType = useStore((s) => s.regenerateType);
  const recordAttempt = useStore((s) => s.recordAttempt);
  const publishModule = useStore((s) => s.publishModule);
  const enrollments = useStore((s) => s.enrollments);
  const attempts = useStore((s) => s.attempts);
  const toast = useStore((s) => s.toast);

  const processed = materials.filter((m) => m.status === 'processed');
  const material = materials.find((m) => m.id === materialId) || processed[0] || null;
  useEffect(() => { if (materialId && !materials.some((m) => m.id === materialId)) { toast('That material no longer exists', 'err'); nav('/materials'); } }, [materialId, materials, nav, toast]);

  const list = useMemo(() => exercises.filter((e) => e.materialId === material?.id), [exercises, material?.id]);
  const [typeFilter, setTypeFilter] = useState<ExType | 'all' | 'needs-review'>('all');
  const [selId, setSelId] = useState<string | null>(null);
  const [level, setLevel] = useState<'new' | 'exp'>('new');
  const [startedAt, setStartedAt] = useState(Date.now());
  const [publishOpen, setPublishOpen] = useState(false);
  const [round, setRound] = useState(0);
  const [pendingAction, setPendingAction] = useState<{ id: string; kind: 'approve' | 'reject' } | null>(null);

  const shown = list.filter((e) => typeFilter === 'all' || (typeFilter === 'needs-review' ? e.reviewStatus === 'draft' : e.type === typeFilter));
  const current = list.find((e) => e.id === selId) || shown[0] || list[0] || null;
  useEffect(() => { setStartedAt(Date.now()); setRound((r) => r + 1); }, [current?.id]);

  const learner = learners.find((l) => l.id === settings.playAs) || learners[0];
  const s = T(settings.lang);
  const counts = ALL_TYPES.reduce((acc, t) => ({ ...acc, [t]: list.filter((e) => e.type === t).length }), {} as Record<string, number>);

  const onDone = (o: Outcome) => {
    if (!current || !material || !learner) return;
    const seconds = Math.max(5, Math.round((Date.now() - startedAt) / 1000));
    recordAttempt({ learnerId: learner.id, materialId: material.id, exerciseId: current.id, type: current.type, score: o.score, passed: o.passed, seconds });
    if (o.passed) celebrate(document.querySelector('[data-testid="phone-body"]') as HTMLElement, { count: 70, power: 950 });
    toast((o.passed ? 'Passed' : 'Attempted') + ' · recorded for ' + learner.name + ' (' + seconds + ' s)', o.passed ? 'ok' : 'info');
  };
  const next = () => { const i = shown.findIndex((e) => e.id === current?.id); const n = shown[(i + 1) % shown.length]; if (n) setSelId(n.id); };
  const prev = () => { const i = shown.findIndex((e) => e.id === current?.id); const n = shown[(i - 1 + shown.length) % shown.length]; if (n) setSelId(n.id); };

  const doApprove = (id: string) => approveExercise(id);
  const doReject = (id: string) => { const note = window.prompt('One-line reason this task was rejected (shown in the audit log):', ''); if (note !== null) rejectExercise(id, note); };
  const onApprove = (id: string) => { if (!settings.reviewerName.trim()) { setPendingAction({ id, kind: 'approve' }); return; } doApprove(id); };
  const onReject = (id: string) => { if (!settings.reviewerName.trim()) { setPendingAction({ id, kind: 'reject' }); return; } doReject(id); };
  const confirmReviewer = (name: string, role: ReviewerRole) => {
    setReviewer(name, role);
    if (pendingAction) { if (pendingAction.kind === 'approve') doApprove(pendingAction.id); else doReject(pendingAction.id); }
    setPendingAction(null);
  };

  if (!material) {
    return (
      <>
        <Topbar title="Task builder" crumb={<>Materials &nbsp;›&nbsp; <b>Task builder</b></>} back="/materials" />
        <div className="content"><div className="card empty" style={{ flexGrow: 1 }}>No processed material yet. <Link to="/materials">Go to Materials</Link> and process one.</div></div>
      </>
    );
  }

  const enrolled = enrollments.filter((e) => e.materialId === material.id).length;
  const stepIdx = current?.stepIndex ?? null;
  const ctx = { materials, exercises, learners, attempts, enrollments, now: Date.now() };
  const coverage = reviewCoverage(ctx, material.id);

  return (
    <>
      <Topbar title={material.short} back="/materials"
        crumb={<>Materials &nbsp;›&nbsp; <b>Task builder</b> &nbsp;·&nbsp; <span className={'cat ' + material.category}>{catLabel[material.category]}</span></>}
        right={<>
          <select className="input" style={{ width: 240, height: 40 }} value={material.id} onChange={(e) => nav('/builder/' + e.target.value)} aria-label="Material" data-testid="material-select">
            {processed.map((m) => <option key={m.id} value={m.id}>{m.short}</option>)}
          </select>
          <button className="btn primary" onClick={() => setPublishOpen(true)} data-testid="publish">Publish module <Ic.arrow /></button>
        </>} />

      <div className="content">
        <section className="card" style={{ width: 272, flexShrink: 0, padding: 16, display: 'flex', flexDirection: 'column', gap: 8, overflow: 'auto' }}>
          <div className="card-h">Source steps</div>
          {material.structure?.steps.length ? material.structure.steps.map((st, i) => (
            <div key={i} className={'step' + (stepIdx === i ? ' on' : '')}><span className="stepn">{i + 1}</span><span>{st}</span></div>
          )) : <div style={{ fontSize: 12, color: 'var(--ink2)' }}>No numbered steps were found in this material.</div>}
          {!!material.structure?.hazards.length && <>
            <div className="card-h" style={{ marginTop: 6 }}>Hazards found</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{material.structure.hazards.map((h) => <span key={h.name} className="cat safety">{h.name}</span>)}</div>
          </>}
          {!!material.structure?.ppe.length && <>
            <div className="card-h" style={{ marginTop: 6 }}>PPE</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>{material.structure.ppe.map((p) => <span key={p} className="tag">{p}</span>)}</div>
          </>}
          <div className="card-h" style={{ marginTop: 6 }}>Review status</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }} data-testid="coverage-summary">
            <div className="row-between" style={{ fontSize: 12 }}><span style={{ color: 'var(--green-t)', fontWeight: 700 }}>Approved</span><b>{coverage.approved}</b></div>
            <div className="row-between" style={{ fontSize: 12 }}><span style={{ color: 'var(--amber-t)', fontWeight: 700 }}>Draft (needs review)</span><b>{coverage.draft}</b></div>
            <div className="row-between" style={{ fontSize: 12 }}><span style={{ color: 'var(--red-t)', fontWeight: 700 }}>Rejected</span><b>{coverage.rejected}</b></div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>Reviewing as: {settings.reviewerName ? settings.reviewerName + ' (' + settings.reviewerRole + ')' : 'not set — you’ll be asked on your first approval'}</div>
        </section>

        <section style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <button className={'tt' + (typeFilter === 'all' ? ' on' : '')} onClick={() => setTypeFilter('all')}>All <span style={{ opacity: .6 }}>{list.length}</span></button>
            <button className={'tt' + (typeFilter === 'needs-review' ? ' on' : '')} onClick={() => setTypeFilter('needs-review')} data-testid="filter-needs-review"><Ic.spark size={12} />Needs review <span style={{ opacity: .6 }}>{coverage.draft}</span></button>
            {ALL_TYPES.map((tp) => { const I = TYPE_ICON[tp]; return <button key={tp} className={'tt' + (typeFilter === tp ? ' on' : '')} onClick={() => setTypeFilter(tp)} data-testid={'type-' + tp}><I />{TYPE_LABEL[tp]} <span style={{ opacity: .6 }}>{counts[tp]}</span></button>; })}
          </div>

          <div className="card" style={{ flexGrow: 1, minHeight: 0, display: 'flex', flexDirection: 'column', padding: '14px 12px' }}>
            <div className="row-between" style={{ padding: '0 4px' }}>
              <div className="card-h">Generated tasks <span style={{ color: 'var(--muted)', fontWeight: 500, marginLeft: 4 }}>{shown.length} of {list.length}</span></div>
              <div style={{ display: 'flex', gap: 6 }}>
                {typeFilter !== 'all' && typeFilter !== 'needs-review' && <button className="btn ai sm" onClick={() => { const n = regenerateType(material.id, typeFilter); toast(n ? n + ' ' + TYPE_LABEL[typeFilter].toLowerCase() + ' task' + (n > 1 ? 's' : '') + ' regenerated' : 'The text has no source for ' + TYPE_LABEL[typeFilter].toLowerCase() + ' tasks', n ? 'ok' : 'err'); }} data-testid="regenerate"><Ic.refresh />Regenerate {TYPE_LABEL[typeFilter].toLowerCase()}</button>}
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: 'var(--blue-d)', fontWeight: 600 }}><Ic.spark size={11} />Edit any title inline</span>
              </div>
            </div>
            <div className="stack" style={{ marginTop: 8, gap: 2, overflow: 'auto', minHeight: 0 }} data-testid="task-list">
              {shown.length === 0 && <div className="empty">{typeFilter === 'needs-review' ? 'Nothing pending — every task in this module has been reviewed.' : 'No tasks of this type — the text gave the engine nothing to build one from.'}</div>}
              {shown.map((e) => <TaskRow key={e.id} e={e} q={exerciseQuality(ctx, e.id)} selected={current?.id === e.id} onSelect={() => setSelId(e.id)} onTitle={(v) => updateTitle(e.id, v)} onDelete={() => deleteExercise(e.id)} onApprove={() => onApprove(e.id)} onReject={() => onReject(e.id)} />)}
            </div>
          </div>
        </section>

        <section style={{ width: 392, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: 8, width: '100%', justifyContent: 'space-between' }}>
            <div className="seg" data-testid="lang-toggle">{LANGS.map((l) => <button key={l.k} className={settings.lang === l.k ? 'on' : ''} onClick={() => setLang(l.k)}>{l.label}</button>)}</div>
            <div className="seg" data-testid="level-toggle"><button className={level === 'new' ? 'on' : ''} onClick={() => setLevel('new')}>New hire</button><button className={level === 'exp' ? 'on' : ''} onClick={() => setLevel('exp')}>Experienced</button></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', fontSize: 12 }}>
            <span style={{ color: 'var(--ink2)', fontWeight: 600, whiteSpace: 'nowrap' }}>Play as</span>
            {learner && <Avatar av={learner.avatar} size={26} radius={8} />}
            <select className="input" style={{ height: 34, flexGrow: 1 }} value={learner?.id} onChange={(e) => setPlayAs(e.target.value)} aria-label="Play as learner" data-testid="play-as">
              {learners.map((l) => <option key={l.id} value={l.id}>{l.name} · {l.role}</option>)}
            </select>
          </div>

          <div className="phone" data-testid="phone">
            <div className="phone-head">
              <div className="row-between">
                <span style={{ fontSize: 11, color: '#c9d6ea', fontWeight: 600 }}>{s.module}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 700, padding: '3px 8px', borderRadius: 999, background: 'rgba(255,255,255,.14)' }}><Ic.spark size={10} />{level === 'new' ? s.newHire : s.fastTrack}</span>
              </div>
              <div style={{ fontFamily: 'var(--font-h)', fontSize: 16, fontWeight: 700, marginTop: 4 }}>{current ? s.cat[material.category] : '—'}</div>
              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="bar" style={{ width: 240, background: 'rgba(255,255,255,.18)' }}><i style={{ width: (current ? ((shown.findIndex((e) => e.id === current.id) + 1) / Math.max(1, shown.length)) * 100 : 0) + '%', background: '#60a5fa' }} /></div>
                <span style={{ fontSize: 11, color: '#c9d6ea' }}>{s.taskOf} {current ? shown.findIndex((e) => e.id === current.id) + 1 : 0} / {shown.length}</span>
              </div>
            </div>
            <div className="phone-body" data-testid="phone-body">
              {current ? <Player key={current.id + ':' + round + ':' + settings.lang} exercise={current} lang={settings.lang} showHints={level === 'new'} onDone={onDone} pin={settings.pin} /> : <div className="empty">No task selected.</div>}
            </div>
            <div className="phone-foot">
              <button className="btn" style={{ flexGrow: 1, height: 44 }} onClick={prev}>{s.back}</button>
              <button className="btn primary" style={{ flexGrow: 2, height: 44 }} onClick={next} data-testid="next">{s.next}</button>
            </div>
          </div>
        </section>
      </div>

      {publishOpen && <PublishModal coverage={coverage} enrolled={enrolled} onClose={() => setPublishOpen(false)} onPublish={(depts) => { const n = publishModule(material.id, depts); toast(n ? n + ' learner' + (n > 1 ? 's' : '') + ' enrolled in ' + material.short : 'Everyone in those departments is already enrolled', n ? 'ok' : 'info'); setPublishOpen(false); }} />}
      {pendingAction && <ReviewerModal onCancel={() => setPendingAction(null)} onConfirm={confirmReviewer} />}
    </>
  );
}

function TaskRow({ e, q, selected, onSelect, onTitle, onDelete, onApprove, onReject }: { e: Exercise; q: ExerciseQuality; selected: boolean; onSelect: () => void; onTitle: (v: string) => void; onDelete: () => void; onApprove: () => void; onReject: () => void }) {
  const [v, setV] = useState(e.title);
  useEffect(() => setV(e.title), [e.title]);
  const I = TYPE_ICON[e.type];
  return (
    <div className={'task' + (selected ? ' on' : '')} onClick={onSelect} data-testid="task-row" data-type={e.type} data-title={e.title} data-review={e.reviewStatus}>
      <div className="task-main">
        <span className="tchip"><I size={11} />{TYPE_LABEL[e.type]}</span>
        <input value={v} onChange={(ev) => setV(ev.target.value)} onBlur={() => v.trim() && v !== e.title && onTitle(v)} onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()} aria-label="Task title" data-testid="task-title" />
        <span className={'pill ' + (e.reviewStatus === 'approved' ? 'ok' : e.reviewStatus === 'rejected' ? 'err' : 'risk')} title={e.reviewedBy ? (e.reviewStatus === 'approved' ? 'Approved by ' : 'Rejected by ') + e.reviewedBy + (e.reviewNote ? ': ' + e.reviewNote : '') : 'Drafted, not yet reviewed'} data-testid="review-pill">{e.reviewStatus === 'approved' ? 'Approved' : e.reviewStatus === 'rejected' ? 'Rejected' : 'Draft'}</span>
      </div>
      <div className="task-meta">
        <span className="task-tags">
          {e.generated ? <span className="lvl" title="Drafted by the AI engine">AI draft</span> : <span className="lvl" title="Hand-written, translated">EN·BM·中文</span>}
          <span className="lvl">{LEVEL_LABEL[e.level]}</span>
          <QualityPill q={q} />
        </span>
        <span className="task-actions">
          {e.reviewStatus !== 'approved' && <button className="btn sm" onClick={(ev) => { ev.stopPropagation(); onApprove(); }} data-testid="approve-task"><Ic.check size={11} />Approve</button>}
          {e.reviewStatus !== 'rejected' && <button className="btn sm" style={{ color: 'var(--red-t)' }} onClick={(ev) => { ev.stopPropagation(); onReject(); }} data-testid="reject-task">Reject</button>}
          <button className="ib" style={{ width: 26, height: 26, borderRadius: 8 }} onClick={(ev) => { ev.stopPropagation(); onDelete(); }} aria-label="Delete task" data-testid="delete-task"><Ic.trash size={12} /></button>
        </span>
      </div>
    </div>
  );
}

function ReviewerModal({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (name: string, role: ReviewerRole) => void }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState<ReviewerRole>('Trainer');
  return (
    <div className="modal-bg" onClick={onCancel}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Who is reviewing?">
        <h2 style={{ fontSize: 16 }}>Who is reviewing this task?</h2>
        <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 6 }}>Every approval and rejection is stamped with this name and role in the audit log.</div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="reviewer-name" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Your name</label>
          <input id="reviewer-name" className="input" style={{ marginTop: 6 }} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Melissa Tan" data-testid="reviewer-name" autoFocus />
        </div>
        <div style={{ marginTop: 12 }}>
          <label htmlFor="reviewer-role" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Role</label>
          <select id="reviewer-role" className="input" style={{ marginTop: 6 }} value={role} onChange={(e) => setRole(e.target.value as ReviewerRole)} data-testid="reviewer-role">
            {REVIEWER_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn primary" disabled={!name.trim()} onClick={() => onConfirm(name.trim(), role)} data-testid="reviewer-confirm">Continue</button>
        </div>
      </div>
    </div>
  );
}

function PublishModal({ coverage, enrolled, onClose, onPublish }: { coverage: ReturnType<typeof reviewCoverage>; enrolled: number; onClose: () => void; onPublish: (depts: string[]) => void }) {
  const learners = useStore((s) => s.learners);
  const depts = Array.from(new Set(learners.map((l) => l.dept)));
  const [sel, setSel] = useState<string[]>(depts);
  const fullyReviewed = coverage.total > 0 && coverage.approved === coverage.total;
  const [ack, setAck] = useState(false);
  const canPublish = sel.length > 0 && (fullyReviewed || ack);
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Publish module">
        <div className="row-between"><h2 style={{ fontSize: 16 }}>Publish module</h2><button className="ib" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close"><Ic.x /></button></div>
        <div style={{ fontSize: 12.5, color: 'var(--ink2)', marginTop: 6 }}>{enrolled} learner{enrolled === 1 ? '' : 's'} already enrolled. Choose departments to enrol:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {depts.map((d) => <button key={d} className={'chip' + (sel.includes(d) ? ' on' : '')} onClick={() => setSel(sel.includes(d) ? sel.filter((x) => x !== d) : [...sel, d])} data-testid="dept-chip">{d} <span style={{ opacity: .7 }}>{learners.filter((l) => l.dept === d).length}</span></button>)}
        </div>
        <div className={'fb ' + (fullyReviewed ? 'ok' : 'no')} style={{ marginTop: 14 }} data-testid="publish-review-status">
          {fullyReviewed ? 'All ' + coverage.total + ' tasks in this module are approved.' : coverage.approved + ' of ' + coverage.total + ' tasks are approved — ' + coverage.draft + ' still in draft' + (coverage.rejected ? ', ' + coverage.rejected + ' rejected' : '') + '.'}
        </div>
        {!fullyReviewed && (
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 10, fontSize: 12.5 }}>
            <input type="checkbox" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="publish-ack" style={{ marginTop: 2 }} />
            <span>I understand this will train staff on unreviewed content and want to publish anyway.</span>
          </label>
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 18, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" disabled={!canPublish} onClick={() => onPublish(sel)} data-testid="publish-confirm">Enrol {learners.filter((l) => sel.includes(l.dept)).length} learners</button>
        </div>
      </div>
    </div>
  );
}
