import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { aiNote, aiScore, band, canIssueCertificate, cohortKpis, complianceCoverage, flag, lastActive, moduleRows, nextUp, overallProgress, participation, practical, progressHistory, quizAvg, toCsv, topModules, trend, weeklyActivity, type Ctx } from '../store/stats';
import { regimeById } from '../data/compliance';
import type { Learner } from '../data/types';
import { Topbar } from '../App';
import { Avatar } from '../components/ui/Avatar';
import { CAT_COLOR, CAT_ICON, Ic } from '../components/ui/Icons';
import { DotBar, Gauge, ProgressBar, StackedBars, TrendDots } from '../components/charts/Charts';
import { catLabel } from '../store/useStore';
import { HealthPanel, RetentionCard } from '../components/Health';

type SortKey = 'name' | 'dept' | 'progress' | 'quiz' | 'last';

export function Learners() {
  const { learnerId } = useParams();
  const nav = useNavigate();
  const learners = useStore((s) => s.learners);
  const materials = useStore((s) => s.materials);
  const exercises = useStore((s) => s.exercises);
  const attempts = useStore((s) => s.attempts);
  const enrollments = useStore((s) => s.enrollments);
  const certificates = useStore((s) => s.certificates);
  const toast = useStore((s) => s.toast);
  const ctx: Ctx = useMemo(() => ({ learners, materials, exercises, attempts, enrollments, certificates, now: Date.now() }), [learners, materials, exercises, attempts, enrollments, certificates]);

  const [dept, setDept] = useState('All');
  const [sort, setSort] = useState<SortKey>('name');
  const [dir, setDir] = useState<1 | -1>(1);
  const [view, setView] = useState<'table' | 'bars' | 'lines'>('table');
  const depts = ['All', ...Array.from(new Set(learners.map((l) => l.dept)))];

  const rows = useMemo(() => {
    const list = learners.filter((l) => dept === 'All' || l.dept === dept).map((l) => ({
      l, progress: overallProgress(ctx, l.id), quiz: quizAvg(ctx, l.id), last: lastActive(ctx, l.id), flag: flag(ctx, l.id),
    }));
    const key = (r: typeof list[number]) => sort === 'name' ? r.l.name : sort === 'dept' ? r.l.dept : sort === 'progress' ? r.progress : sort === 'quiz' ? (r.quiz ?? -1) : (r.last.days ?? 999);
    return list.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0) * dir);
  }, [learners, dept, sort, dir, ctx]);

  const selected = learners.find((l) => l.id === learnerId) || rows[0]?.l || learners[0];
  const kpi = cohortKpis(ctx, rows.map((r) => r.l.id));
  const toggleSort = (k: SortKey) => { if (sort === k) setDir(dir === 1 ? -1 : 1); else { setSort(k); setDir(1); } };

  const exportCsv = () => {
    const csv = toCsv(rows.map((r) => ({ name: r.l.name, code: r.l.code, role: r.l.role, department: r.l.dept, path: r.l.level === 'exp' ? 'Experienced' : 'New hire', language: r.l.lang, progress_pct: r.progress, quiz_avg: r.quiz, ai_score: aiScore(ctx, r.l.id), last_active: r.last.label, flag: r.flag.text })));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    a.download = 'helmlearn-learners-' + new Date().toISOString().slice(0, 10) + '.csv';
    a.click();
    toast('Exported ' + rows.length + ' learners to CSV', 'ok');
  };

  return (
    <>
      <Topbar title={selected ? selected.name : 'Learners'} crumb={<>Learners &nbsp;›&nbsp; <b>Learner details</b></>} back="/builder"
        right={<button className="btn" onClick={exportCsv} data-testid="export-csv"><Ic.download />Export CSV</button>} />
      <div className="content col">
        {selected && <LearnerDetail ctx={ctx} learnerId={selected.id} />}

        <HealthPanel ctx={ctx} ids={rows.map((r) => r.l.id)} />

        <section className="card" style={{ padding: '16px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row-between" style={{ flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
              <div className="card-h">Cohort</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: 'var(--ink2)' }} data-testid="kpis">
                <span><b style={{ color: 'var(--ink)', fontSize: 14 }} data-testid="kpi-learners">{kpi.learners}</b> learners</span>
                <span><b style={{ color: 'var(--blue-d)', fontSize: 14 }} data-testid="kpi-completion">{kpi.completion}%</b> avg completion</span>
                <span><b style={{ color: 'var(--green-t)', fontSize: 14 }} data-testid="kpi-quiz">{kpi.quiz}%</b> avg quiz</span>
                <span><b style={{ color: 'var(--amber-t)', fontSize: 14 }} data-testid="kpi-risk">{kpi.risk}</b> flagged at risk</span>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <div className="seg" data-testid="view-toggle">
                <button className={view === 'table' ? 'on' : ''} onClick={() => setView('table')}>Table</button>
                <button className={view === 'bars' ? 'on' : ''} onClick={() => setView('bars')}>Bar chart</button>
                <button className={view === 'lines' ? 'on' : ''} onClick={() => setView('lines')}>Progress lines</button>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>{depts.map((d) => <button key={d} className={'chip' + (dept === d ? ' on' : '')} onClick={() => setDept(d)} data-testid="dept-filter">{d}</button>)}</div>
            </div>
          </div>
          {view === 'bars' && <CohortBars rows={rows.map((r) => ({ l: r.l, progress: r.progress, quiz: r.quiz }))} selectedId={selected?.id} onPick={(id) => nav('/learners/' + id)} />}
          {view === 'lines' && <CohortLines ctx={ctx} learners={rows.map((r) => r.l)} selectedId={selected?.id} onPick={(id) => nav('/learners/' + id)} />}
          {view === 'table' && <>
          <div className="row head">
            <button onClick={() => toggleSort('name')}>Learner {sort === 'name' ? (dir === 1 ? '↑' : '↓') : ''}</button>
            <button onClick={() => toggleSort('dept')}>Department {sort === 'dept' ? (dir === 1 ? '↑' : '↓') : ''}</button>
            <span>Personalised path</span>
            <button onClick={() => toggleSort('progress')}>Progress {sort === 'progress' ? (dir === 1 ? '↑' : '↓') : ''}</button>
            <button onClick={() => toggleSort('quiz')}>Quiz {sort === 'quiz' ? (dir === 1 ? '↑' : '↓') : ''}</button>
            <button onClick={() => toggleSort('last')}>Last active {sort === 'last' ? (dir === 1 ? '↑' : '↓') : ''}</button>
            <span>AI flag</span>
          </div>
          <div className="stack" style={{ gap: 2 }} data-testid="cohort">
            {rows.length === 0 && <div className="empty">No learners in this department.</div>}
            {rows.map((r) => (
              <button key={r.l.id} className={'row' + (selected?.id === r.l.id ? ' on' : '')} onClick={() => nav('/learners/' + r.l.id)} data-testid="learner-row">
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                  <Avatar av={r.l.avatar} />
                  <span style={{ minWidth: 0 }}><span style={{ display: 'block', fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.l.name}</span><span style={{ display: 'block', fontSize: 11, color: 'var(--muted)' }}>{r.l.role}</span></span>
                </span>
                <span style={{ fontSize: 12, color: 'var(--ink2)' }}>{r.l.dept}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{r.l.level === 'exp' ? 'Experienced' : 'New hire'} · {r.l.lang}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 110 }}><ProgressBar value={r.progress} animate={false} /></span><span style={{ fontSize: 12, fontWeight: 700, width: 34 }} data-testid="row-progress">{r.progress}%</span></span>
                <span style={{ fontSize: 12, fontWeight: 700, color: r.quiz === null ? 'var(--muted)' : r.quiz < 70 ? 'var(--amber-t)' : 'var(--green-t)' }}>{r.quiz === null ? '—' : r.quiz + '%'}</span>
                <span style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{r.last.label}</span>
                <span><span className={'pill ' + r.flag.kind}>{r.flag.text}</span></span>
              </button>
            ))}
          </div>
          </>}
        </section>
      </div>
    </>
  );
}

function LearnerDetail({ ctx, learnerId }: { ctx: Ctx; learnerId: string }) {
  const l = ctx.learners.find((x) => x.id === learnerId)!;
  const issueCertificate = useStore((s) => s.issueCertificate);
  const score = aiScore(ctx, l.id);
  const b = band(score);
  const q = quizAvg(ctx, l.id);
  const p = practical(ctx, l.id);
  const part = participation(ctx, l.id);
  const la = lastActive(ctx, l.id);
  const mods = moduleRows(ctx, l.id);
  const top = topModules(ctx, l.id);
  const act = weeklyActivity(ctx, l.id, top);
  const tr = trend(ctx, l.id, top);
  const nx = nextUp(ctx, l.id);
  const delta = act.prevTotal > 0 ? Math.round(((act.total - act.prevTotal) / act.prevTotal) * 100) : null;
  const colors = ['#2c4a7c', '#3b82f6', '#c9d6ea'];
  const name = (id: string) => ctx.materials.find((m) => m.id === id)?.short || id;
  const regimeIds = Array.from(new Set(mods.flatMap((m) => m.material.complianceIds)));
  const coverage = complianceCoverage(ctx, l.id, regimeIds);

  return (
    <div style={{ display: 'flex', gap: 16 }} data-testid="learner-detail">
      <section style={{ width: 330, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card" style={{ padding: 16, background: 'linear-gradient(180deg, rgba(255,255,255,.10), rgba(255,255,255,0) 45%), var(--navy)', borderColor: 'var(--navy)', color: '#fff' }}>
          <div className="row-between" style={{ alignItems: 'flex-start' }}>
            <span className={'pill ' + (la.days !== null && la.days >= 5 ? 'risk' : la.days === null ? 'none' : 'ok')}><Ic.active />{la.days === null ? 'Not started' : la.days >= 5 ? 'Inactive' : 'Active'}</span>
            <span className="ib" style={{ width: 32, height: 32, background: 'rgba(255,255,255,.1)', borderColor: 'rgba(255,255,255,.15)', color: '#fff' }}><Ic.dots /></span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4 }}>
            <span style={{ boxShadow: '0 10px 24px rgba(0,0,0,.25)', borderRadius: 26 }}><Avatar av={l.avatar} size={96} radius={26} /></span>
            <div style={{ fontFamily: 'var(--font-h)', fontSize: 18, fontWeight: 700, marginTop: 12 }} data-testid="detail-name">{l.name}</div>
            <div style={{ fontSize: 11.5, color: '#c9d6ea', marginTop: 3 }}>{l.code} · joined {l.joined}</div>
          </div>
        </div>

        <div className="card" style={{ padding: '6px 16px' }}>
          <div className="info-row"><span className="info-ic"><Ic.building /></span><div><small>Role · Department</small><b>{l.role} · {l.dept}</b></div></div>
          <div className="info-row"><span className="info-ic"><Ic.person /></span><div><small>Supervisor</small><b>{l.sup}</b></div></div>
          <div className="info-row"><span className="info-ic"><Ic.globe /></span><div><small>Path · Language</small><b>{l.level === 'exp' ? 'Experienced' : 'New hire'} · {l.lang}</b></div></div>
        </div>

        {!!coverage.length && (
          <div className="card" style={{ padding: 14 }} data-testid="compliance-badges">
            <div className="row-between"><div className="card-h">Compliance</div><Link to="/compliance" style={{ fontSize: 11.5, fontWeight: 700 }}>Open dashboard</Link></div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {coverage.map((c) => { const r = regimeById(c.regimeId)!; return (
                <span key={c.regimeId} className={'pill ' + (c.status === 'compliant' ? 'ok' : c.status === 'expiring' ? 'risk' : c.status === 'expired' ? 'err' : 'none')} title={r.summary} data-testid="compliance-badge">
                  {r.name} · {c.status === 'compliant' ? 'compliant' : c.status === 'expiring' ? 'expiring soon' : c.status === 'expired' ? 'expired' : 'not certified'}
                </span>
              ); })}
            </div>
          </div>
        )}

        <div className="card" style={{ padding: 16 }}>
          <div className="row-between"><div className="card-h">Performance</div><span style={{ fontSize: 11, color: 'var(--muted)' }}>AI score</span></div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 6 }}>
            <Gauge score={score} />
            <span className={'pill ' + b.kind} style={{ marginTop: -6 }} data-testid="band">{b.text}</span>
          </div>
          <div className="stack" style={{ marginTop: 14 }}>
            {[['Participation', part], ['Quiz', q], ['Practical', p]].map(([n, v]) => (
              <div key={n as string} className="metric"><span style={{ width: 96, fontSize: 12.5, fontWeight: 600 }}>{n}</span><DotBar value={v as number | null} /><span style={{ fontSize: 12.5, fontWeight: 700, marginLeft: 'auto' }}>{v === null ? '—' : v + '%'}</span></div>
            ))}
          </div>
          <div style={{ marginTop: 12, padding: 12, borderRadius: 12, background: 'var(--blue-l)', fontSize: 12, lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <span style={{ color: 'var(--blue-d)', marginTop: 2 }}><Ic.spark size={14} /></span><span data-testid="ai-note">{aiNote(ctx, l)}</span>
          </div>
        </div>
      </section>

      <section style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="card" style={{ padding: '16px 18px' }}>
          <div className="row-between"><div className="card-h">Enrolled modules</div><span style={{ fontSize: 12, color: 'var(--muted)' }}>{mods.filter((m) => m.status === 'Completed').length} of {mods.length} completed</span></div>
          <div className="stack" style={{ gap: 6, marginTop: 10 }} data-testid="modules">
            {mods.length === 0 && <div className="empty" style={{ padding: 20 }}>Not enrolled in any module yet — publish one from the task builder.</div>}
            {mods.map((m) => { const I = CAT_ICON[m.material.category]; return (
              <div key={m.material.id} className="mod" data-testid="module-row">
                <span style={{ width: 44, height: 44, borderRadius: 12, background: CAT_COLOR[m.material.category], display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0 }}><I /></span>
                <div style={{ width: 300, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.material.name}</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 5 }}><span className="tag">{catLabel[m.material.category]}</span><span className="tag g">{m.tasks} tasks</span><span className="tag g">{m.minutes} min</span></div>
                </div>
                <div style={{ flexGrow: 1, display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ flexGrow: 1 }}><ProgressBar value={m.progress} /></span><span style={{ fontSize: 12, fontWeight: 700, width: 36 }} data-testid="module-progress">{m.progress}%</span></div>
                <div style={{ width: 60, textAlign: 'right' }}><span style={{ fontFamily: 'var(--font-h)', fontSize: 15, fontWeight: 800 }}>{m.score === null ? '—' : m.score}</span><span style={{ fontSize: 10.5, color: 'var(--muted)' }}>/100</span></div>
                <span className={'st ' + (m.status === 'Completed' ? 'done' : m.status === 'Ongoing' ? 'on' : 'lock')}><span className="dot" style={{ width: 6, height: 6, borderRadius: 999, background: 'currentColor' }} />{m.status}</span>
                {(() => {
                  const eligible = canIssueCertificate(ctx, l.id, m.material.id);
                  const already = ctx.certificates?.some((c) => c.learnerId === l.id && c.materialId === m.material.id);
                  return (
                    <button className={'btn sm' + (eligible ? ' primary' : '')} disabled={!eligible} title={eligible ? undefined : 'Needs 100% complete and every task approved'} onClick={() => issueCertificate(l.id, m.material.id)} data-testid="issue-certificate">
                      <Ic.badge size={12} />{already ? 'Re-download' : 'Certificate'}
                    </button>
                  );
                })()}
              </div>
            ); })}
          </div>
          {nx && <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: '#f7f9fd', border: '1px solid var(--line)', fontSize: 12.5, display: 'flex', gap: 10, alignItems: 'center' }}><span className="tag">Next up</span><span style={{ fontWeight: 600 }}>{nx.title}</span><span style={{ color: 'var(--muted)' }}>· {nx.why}</span><Link to="/builder" style={{ marginLeft: 'auto', fontWeight: 700 }}>Open</Link></div>}
        </div>

        <div className="grid2">
          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="row-between"><div className="card-h">Activity</div><span className="chip" style={{ height: 28, fontSize: 11.5 }}>Last 7 days</span></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
              <span style={{ fontSize: 11, color: 'var(--muted)' }}>Total hours</span>
              <span style={{ fontFamily: 'var(--font-h)', fontSize: 22, fontWeight: 800 }} data-testid="hours">{act.total >= 0.1 ? act.total.toFixed(1) + 'h' : act.total > 0 ? Math.max(1, Math.round(act.total * 60)) + ' min' : '0h'}</span>
              {delta !== null && <span className={'pill ' + (delta >= 0 ? 'ok' : 'risk')} style={{ padding: '2px 7px' }}>{delta >= 0 ? '+' : ''}{delta}% vs previous week</span>}
            </div>
            {act.total === 0 ? <div className="empty" style={{ height: 190 }}>No activity in the last 7 days.</div> : <StackedBars days={act.days} colors={colors} />}
            <div style={{ display: 'flex', gap: 12, marginTop: 6, fontSize: 10.5, color: 'var(--ink2)', flexWrap: 'wrap' }}>
              {top[0] && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: colors[0] }} />{name(top[0])}</span>}
              {top[1] && <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: colors[1] }} />{name(top[1])}</span>}
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 8, height: 8, borderRadius: 2, background: colors[2] }} />Other modules</span>
            </div>
          </div>
          <div className="card" style={{ padding: '16px 18px' }}>
            <div className="row-between"><div className="card-h">Quiz score trend</div><span className="chip" style={{ height: 28, fontSize: 11.5 }}>Last 7 days</span></div>
            {tr.every((pt) => pt.values.every((v) => v === null)) ? <div className="empty" style={{ height: 220 }}>No quiz attempts in the last 7 days.</div> : <div style={{ marginTop: 12 }}><TrendDots points={tr} colors={colors} /></div>}
            <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: 10.5, color: 'var(--ink2)' }}>
              {top.map((id, i) => <span key={id} style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 8, height: 8, borderRadius: 999, background: colors[i] }} />{name(id)}</span>)}
            </div>
          </div>
        </div>
        <RetentionCard ctx={ctx} learnerId={l.id} />
      </section>
    </div>
  );
}


const PALETTE = ['#2c4a7c', '#3b82f6', '#2fb673', '#f2a93b', '#e0554f', '#6b3fd6', '#0ea5a4', '#b45309', '#db2777', '#64748b'];

function CohortBars({ rows, selectedId, onPick }: { rows: { l: Learner; progress: number; quiz: number | null }[]; selectedId?: string; onPick: (id: string) => void }) {
  const sorted = rows.slice().sort((a, b) => b.progress - a.progress);
  const n = Math.max(1, sorted.length);
  const W = 1100, H = 320, L = 44, R = 16, T = 18, B = 74;
  const pw = W - L - R, ph = H - T - B;
  const slot = pw / n;
  const bw = Math.min(30, slot * 0.28);
  const y = (v: number) => T + ph * (1 - v / 100);
  return (
    <div data-testid="cohort-bars">
      <div style={{ display: 'flex', gap: 14, fontSize: 11, color: 'var(--ink2)', marginBottom: 4, alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(180deg,#60a5fa,#2f6fe0)' }} />Progress</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><i style={{ width: 12, height: 12, borderRadius: 3, background: 'linear-gradient(180deg,#5fd39a,#1f8f57)' }} />Quiz average</span>
        <span style={{ marginLeft: 'auto' }}>sorted by progress · click a learner to open</span>
      </div>
      {sorted.length === 0 ? <div className="empty">No learners in this department.</div> : (
        <svg width="100%" height={H} viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label="Progress and quiz per learner">
          <defs>
            <linearGradient id="gProg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#60a5fa" /><stop offset="1" stopColor="#2f6fe0" /></linearGradient>
            <linearGradient id="gQuiz" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#5fd39a" /><stop offset="1" stopColor="#1f8f57" /></linearGradient>
            <linearGradient id="gNone" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor="#e4eaf3" /><stop offset="1" stopColor="#c9d6ea" /></linearGradient>
          </defs>
          {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} stroke={v === 0 ? '#c9d6ea' : '#eef2f8'} /><text x={L - 8} y={y(v) + 3.5} textAnchor="end" style={{ fontSize: 10, fill: '#8a97ad' }}>{v}%</text></g>)}
          {sorted.map((r, i) => {
            const cx = L + slot * i + slot / 2;
            const on = selectedId === r.l.id;
            const q = r.quiz;
            return (
              <g key={r.l.id} style={{ cursor: 'pointer' }} onClick={() => onPick(r.l.id)} data-testid="bar-row">
                <rect x={cx - slot / 2 + 2} y={T - 8} width={slot - 4} height={ph + B} rx="12" fill={on ? '#e3edff' : 'transparent'} />
                <rect className="rise" x={cx - bw - 3} y={y(r.progress)} width={bw} height={Math.max(2, ph - (y(r.progress) - T))} rx="6" fill="url(#gProg)" />
                <rect className="rise" x={cx + 3} y={y(q ?? 0)} width={bw} height={q === null ? 2 : Math.max(2, ph - (y(q) - T))} rx="6" fill={q === null ? 'url(#gNone)' : 'url(#gQuiz)'} />
                <text x={cx - bw / 2 - 3} y={y(r.progress) - 6} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: '#2f6fe0' }}>{r.progress}%</text>
                <text x={cx + bw / 2 + 3} y={y(q ?? 0) - 6} textAnchor="middle" style={{ fontSize: 11, fontWeight: 700, fill: q === null ? '#8a97ad' : '#1f8f57' }}>{q === null ? '—' : q + '%'}</text>
                <foreignObject x={cx - 18} y={T + ph + 8} width="36" height="36"><div style={{ width: 36, height: 36 }}><Avatar av={r.l.avatar} size={36} radius={12} /></div></foreignObject>
                <text x={cx} y={T + ph + 58} textAnchor="middle" style={{ fontSize: 11, fontWeight: on ? 800 : 600, fill: on ? '#2f6fe0' : '#1e2b45' }}>{r.l.name.split(' ')[0]}</text>
                <text x={cx} y={T + ph + 70} textAnchor="middle" style={{ fontSize: 9.5, fill: '#8a97ad' }}>{r.l.dept}</text>
                <title>{r.l.name} · progress {r.progress}% · quiz {q === null ? 'no attempts' : q + '%'}</title>
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function CohortLines({ ctx, learners, selectedId, onPick }: { ctx: Ctx; learners: Learner[]; selectedId?: string; onPick: (id: string) => void }) {
  const W = 1100, H = 300, L = 40, R = 150, T = 14, B = 30;
  const pw = W - L - R, ph = H - T - B;
  const series = learners.map((l, i) => ({ l, color: PALETTE[i % PALETTE.length], pts: progressHistory(ctx, l.id, 14) }));
  const n = 15;
  const x = (i: number) => L + (i / (n - 1)) * pw;
  const y = (v: number) => T + ph * (1 - v / 100);
  const labels = series[0]?.pts.map((p) => p.label) || [];
  const labelY = new Map<string, number>();
  series.map((s) => ({ id: s.l.id, y: y(s.pts[s.pts.length - 1].pct) })).sort((a, b) => a.y - b.y).forEach((it, i, arr) => {
    const prev = i ? labelY.get(arr[i - 1].id)! : -Infinity;
    labelY.set(it.id, Math.max(it.y, prev + 13));
  });
  return (
    <div data-testid="cohort-lines">
      <div style={{ fontSize: 11, color: 'var(--ink2)', marginBottom: 6 }}>Completion of enrolled modules over the last 14 days — one line per learner · click a name or line to open</div>
      {series.length === 0 ? <div className="empty">No learners in this department.</div> : (
        <svg width="100%" height={H} viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ display: 'block' }} role="img" aria-label="Progress over 14 days">
          {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} stroke="#eef2f8" /><text x={L - 6} y={y(v) + 3.5} textAnchor="end" style={{ fontSize: 10, fill: '#8a97ad' }}>{v}%</text></g>)}
          {labels.map((lab, i) => (i % 2 === 0 ? <text key={i} x={x(i)} y={H - 10} textAnchor="middle" style={{ fontSize: 10, fill: '#5c6b85' }}>{lab}</text> : null))}
          {series.map((s) => {
            const on = selectedId === s.l.id;
            const d = s.pts.map((p, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(p.pct).toFixed(1)).join(' ');
            const last = s.pts[s.pts.length - 1];
            return (
              <g key={s.l.id} style={{ cursor: 'pointer' }} onClick={() => onPick(s.l.id)} opacity={selectedId && !on ? .55 : 1}>
                <path d={d} fill="none" stroke={s.color} strokeWidth={on ? 3.5 : 2} strokeLinecap="round" strokeLinejoin="round" />
                <circle cx={x(n - 1)} cy={y(last.pct)} r={on ? 5 : 3.5} fill={s.color} stroke="#fff" strokeWidth="1.5" />
                <line x1={x(n - 1) + 4} x2={x(n - 1) + 12} y1={y(last.pct)} y2={labelY.get(s.l.id)} stroke={s.color} strokeWidth="1" opacity=".6" />
                <text x={x(n - 1) + 14} y={(labelY.get(s.l.id) || 0) + 3.5} style={{ fontSize: 10.5, fill: s.color, fontWeight: on ? 800 : 600 }}>{s.l.name.split(' ')[0]} {last.pct}%</text>
              </g>
            );
          })}
        </svg>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginTop: 6 }}>
        {series.map((s) => <button key={s.l.id} onClick={() => onPick(s.l.id)} className="chip" style={{ height: 28, padding: '0 10px', fontSize: 11.5, borderColor: selectedId === s.l.id ? s.color : undefined, display: 'inline-flex', alignItems: 'center', gap: 6 }}><i style={{ width: 10, height: 3, borderRadius: 2, background: s.color }} />{s.l.name}</button>)}
      </div>
    </div>
  );
}
