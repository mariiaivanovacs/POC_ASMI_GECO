import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { moduleQuality, qualitySummary, reviewCoverage, type Ctx, type QualityFlag } from '../store/stats';
import { Topbar } from '../App';
import { Ic, TYPE_ICON, TYPE_LABEL } from '../components/ui/Icons';
import { QualityPill } from '../components/QualityPill';

const FLAG_LABEL: Record<QualityFlag, string> = { 'too-hard': 'Too hard', 'too-easy': 'Too easy', slow: 'Slow', unproven: 'Unproven', healthy: 'Healthy' };
const FLAG_ADVICE: Record<QualityFlag, string> = {
  'too-hard': 'Under half the crew pass it. Either the wording is confusing or the answer key does not match the document — open it, play it as a new hire, and reject-with-note or regenerate the type.',
  'too-easy': 'Almost nobody gets it wrong. It is not measuring anything; replace it with a harder scenario or fold it into a sequence task.',
  slow: 'Learners take minutes on a task that should take seconds — usually a wall of text. Shorten the stem or split it.',
  unproven: 'Not enough attempts yet to judge. Publish the module or ask a supervisor to play it through.',
  healthy: 'Pass rate in the expected band. Keep it.',
};

export function Quality() {
  const learners = useStore((s) => s.learners);
  const materials = useStore((s) => s.materials);
  const exercises = useStore((s) => s.exercises);
  const attempts = useStore((s) => s.attempts);
  const enrollments = useStore((s) => s.enrollments);
  const ctx: Ctx = useMemo(() => ({ learners, materials, exercises, attempts, enrollments, now: Date.now() }), [learners, materials, exercises, attempts, enrollments]);

  const processed = materials.filter((m) => m.status === 'processed');
  const [scope, setScope] = useState<'all' | string>('all');
  const [flagFilter, setFlagFilter] = useState<QualityFlag | 'all'>('all');
  const inScope = scope === 'all' ? processed : processed.filter((m) => m.id === scope);
  const summary = qualitySummary(ctx, scope === 'all' ? undefined : scope);
  const rows = inScope.flatMap((m) => moduleQuality(ctx, m.id).map((r) => ({ ...r, material: m })))
    .filter((r) => flagFilter === 'all' || r.q.flag === flagFilter)
    .sort((a, b) => ({ 'too-hard': 0, slow: 1, 'too-easy': 2, unproven: 3, healthy: 4 }[a.q.flag] - { 'too-hard': 0, slow: 1, 'too-easy': 2, unproven: 3, healthy: 4 }[b.q.flag]) || (a.q.passRate ?? 101) - (b.q.passRate ?? 101));
  const flagged = rows.filter((r) => r.q.flag === 'too-hard' || r.q.flag === 'too-easy' || r.q.flag === 'slow');

  const gap = summary.generatedPassRate !== null && summary.handwrittenPassRate !== null ? summary.handwrittenPassRate - summary.generatedPassRate : null;
  const insight = summary.attempted === 0
    ? 'No attempts recorded yet — quality signals appear once learners start playing the module.'
    : gap !== null && gap >= 8
      ? 'AI drafts pass at ' + summary.generatedPassRate + '% against ' + summary.handwrittenPassRate + '% for the hand-written tasks. ' + (summary.tooHard ? summary.tooHard + ' draft' + (summary.tooHard === 1 ? ' is' : 's are') + ' flagged too hard — review those first; they are pulling the module down.' : 'The gap is spread thin rather than caused by one bad task.')
      : gap !== null && gap <= -8
        ? 'AI drafts are passing more easily (' + summary.generatedPassRate + '%) than the hand-written tasks (' + summary.handwrittenPassRate + '%) — check the too-easy list; the drafts may be under-testing.'
        : summary.flagged
          ? summary.flagged + ' task' + (summary.flagged === 1 ? '' : 's') + ' need attention out of ' + summary.attempted + ' attempted. Overall pass rate ' + summary.passRate + '%.'
          : 'Every attempted task is in the healthy band (' + summary.passRate + '% overall). ' + summary.unproven + ' still have too few attempts to judge.';

  return (
    <>
      <Topbar title="Content quality" crumb={<>Training studio &nbsp;›&nbsp; <b>Content quality</b></>}
        right={<select className="input" style={{ width: 240, height: 40 }} value={scope} onChange={(e) => setScope(e.target.value)} aria-label="Module" data-testid="quality-scope">
          <option value="all">All modules ({processed.length})</option>
          {processed.map((m) => <option key={m.id} value={m.id}>{m.short}</option>)}
        </select>} />
      <div className="content col">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 12 }} data-testid="quality-kpis">
          <Kpi label="Tasks" value={String(summary.total)} sub={summary.generated + ' AI drafts · ' + (summary.total - summary.generated) + ' hand-written'} />
          <Kpi label="Attempted" value={summary.attempted + ' / ' + summary.total} sub={summary.unproven + ' with too few attempts to judge'} />
          <Kpi label="Need attention" value={String(summary.flagged)} sub={summary.tooHard + ' too hard · ' + summary.tooEasy + ' too easy · ' + summary.slow + ' slow'} color={summary.flagged ? 'var(--red-t)' : 'var(--green-t)'} testid="kpi-flagged" />
          <Kpi label="Pass rate · AI drafts" value={summary.generatedPassRate === null ? '—' : summary.generatedPassRate + '%'} sub={'vs ' + (summary.handwrittenPassRate === null ? '—' : summary.handwrittenPassRate + '%') + ' hand-written'} color={gap !== null && gap >= 8 ? 'var(--amber-t)' : 'var(--ink)'} testid="kpi-ai-pass" />
        </div>

        <div style={{ padding: '10px 14px', borderRadius: 12, background: 'var(--blue-l)', fontSize: 12.5, color: 'var(--blue-d)', lineHeight: 1.5, display: 'flex', gap: 8, alignItems: 'flex-start' }} data-testid="quality-insight">
          <Ic.spark size={13} /><span>{insight}</span>
        </div>

        {scope === 'all' && (
          <section className="card" style={{ padding: '14px 16px' }} data-testid="module-quality">
            <div className="card-h">By module</div>
            <div className="card-sub">Review coverage is what the safety team signed off; pass rate is what learners actually do with it. Both need to be high before a module is worth certifying against.</div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, marginTop: 10 }}>
              <thead><tr style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'left' }}><th style={{ padding: '6px 8px' }}>Module</th><th style={{ padding: '6px 8px' }}>Tasks</th><th style={{ padding: '6px 8px', minWidth: 160 }}>Approved</th><th style={{ padding: '6px 8px', minWidth: 160 }}>Pass rate</th><th style={{ padding: '6px 8px' }}>Flagged</th><th style={{ padding: '6px 8px' }}></th></tr></thead>
              <tbody>
                {processed.map((m) => {
                  const s = qualitySummary(ctx, m.id);
                  const rc = reviewCoverage(ctx, m.id);
                  const approvedPct = rc.total ? Math.round((rc.approved / rc.total) * 100) : 0;
                  return (
                    <tr key={m.id} style={{ borderTop: '1px solid var(--line2)' }} data-testid="module-quality-row" data-material={m.id}>
                      <td style={{ padding: 8 }}><b>{m.short}</b><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{m.source === 'deepseek' ? 'DeepSeek' : 'Offline engine'} · {m.pages} pages</div></td>
                      <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{s.total} <span style={{ color: 'var(--muted)' }}>· {s.generated} AI</span></td>
                      <td style={{ padding: 8 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className={'bar' + (approvedPct === 100 ? ' green' : '')} style={{ flexGrow: 1 }}><i style={{ width: approvedPct + '%' }} /></div><span style={{ fontWeight: 700, minWidth: 34 }}>{approvedPct}%</span></div></td>
                      <td style={{ padding: 8 }}>{s.passRate === null ? <span style={{ color: 'var(--muted)' }}>no attempts</span> : <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className="bar" style={{ flexGrow: 1 }}><i style={{ width: s.passRate + '%', background: s.passRate < 60 ? 'var(--red)' : s.passRate < 75 ? 'var(--amber)' : 'var(--green)' }} /></div><span style={{ fontWeight: 700, minWidth: 34 }}>{s.passRate}%</span></div>}</td>
                      <td style={{ padding: 8 }}>{s.flagged ? <span className="pill err">{s.flagged}</span> : <span className="pill ok"><Ic.check size={10} />0</span>}</td>
                      <td style={{ padding: 8, textAlign: 'right' }}><button className="btn sm" onClick={() => setScope(m.id)}>Tasks <Ic.arrow size={12} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <section className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="task-quality">
          <div className="row-between" style={{ flexWrap: 'wrap' }}>
            <div><div className="card-h">{flagFilter === 'all' ? 'Every task, worst first' : FLAG_LABEL[flagFilter] + ' tasks'}</div><div className="card-sub">{flagged.length ? flagged.length + ' flagged' : 'Nothing flagged'} in {inScope.length === 1 ? inScope[0].short : inScope.length + ' modules'}. Pass rate is across every learner who attempted the task.</div></div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {(['all', 'too-hard', 'slow', 'too-easy', 'unproven', 'healthy'] as const).map((f) => <button key={f} className={'chip' + (flagFilter === f ? ' on' : '')} onClick={() => setFlagFilter(f)} data-testid={'flag-' + f}>{f === 'all' ? 'All' : FLAG_LABEL[f]} <span style={{ opacity: .6 }}>{f === 'all' ? rows.length : inScope.flatMap((m) => moduleQuality(ctx, m.id)).filter((r) => r.q.flag === f).length}</span></button>)}
            </div>
          </div>
          {flagFilter !== 'all' && <div style={{ fontSize: 12, color: 'var(--ink2)', padding: '8px 12px', borderRadius: 10, background: '#f7f9fd', border: '1px solid var(--line)' }}>{FLAG_ADVICE[flagFilter]}</div>}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }} data-testid="task-quality-table">
            <thead><tr style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'left' }}><th style={{ padding: '6px 8px' }}>Task</th><th style={{ padding: '6px 8px' }}>Source</th><th style={{ padding: '6px 8px' }}>Review</th><th style={{ padding: '6px 8px' }}>Signal</th><th style={{ padding: '6px 8px' }}>Learners</th><th style={{ padding: '6px 8px' }}>Avg time</th><th style={{ padding: '6px 8px' }}></th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={7} className="empty" style={{ padding: 16 }}>No tasks match.</td></tr>}
              {rows.map(({ exercise: e, q, material: m }) => {
                const I = TYPE_ICON[e.type];
                return (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--line2)' }} data-testid="task-quality-row" data-flag={q.flag}>
                    <td style={{ padding: 8 }}><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span className="tchip"><I size={11} />{TYPE_LABEL[e.type]}</span><span><b>{e.title}</b>{scope === 'all' && <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{m.short}</div>}</span></div></td>
                    <td style={{ padding: 8 }}><span className="lvl">{e.generated ? 'AI draft' : 'Hand-written'}</span></td>
                    <td style={{ padding: 8 }}><span className={'pill ' + (e.reviewStatus === 'approved' ? 'ok' : e.reviewStatus === 'rejected' ? 'err' : 'risk')}>{e.reviewStatus === 'approved' ? 'Approved' : e.reviewStatus === 'rejected' ? 'Rejected' : 'Draft'}</span></td>
                    <td style={{ padding: 8 }}><QualityPill q={q} /><div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 3, maxWidth: 320 }}>{q.reason}</div></td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{q.learners}</td>
                    <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{q.avgSeconds === null ? '—' : q.avgSeconds >= 60 ? Math.round(q.avgSeconds / 60) + ' min' : q.avgSeconds + ' s'}</td>
                    <td style={{ padding: 8, textAlign: 'right' }}><Link to={'/builder/' + m.id} className="btn sm" data-testid="open-task">Open <Ic.arrow size={12} /></Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}

function Kpi({ label, value, sub, color, testid }: { label: string; value: string; sub: string; color?: string; testid?: string }) {
  return (
    <div className="card" style={{ padding: '12px 16px', minWidth: 0 }} data-testid={testid}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ fontFamily: 'var(--font-h)', fontSize: 26, fontWeight: 800, marginTop: 4, color: color || 'var(--ink)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2 }}>{sub}</div>
    </div>
  );
}
