import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { alerts, certificate, failureByType, healthSummary, mostMissed, predictions, RETENTION_FLOOR, type Ctx, type Prediction } from '../store/stats';
import { Avatar } from './ui/Avatar';
import { Ic, TYPE_LABEL } from './ui/Icons';

const DAY = 86_400_000;
const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const LINE_COLORS = ['#2c4a7c', '#3b82f6', '#2fb673', '#f2a93b', '#e0554f', '#6b3fd6'];

function ModuleCurve({ p, color }: { p: Prediction; color: string }) {
  const W = 300, H = 150, L = 30, R = 10, T = 14, B = 26;
  const pw = W - L - R, ph = H - T - B;
  const x = (d: number) => L + (d / 30) * pw;
  const y = (v: number) => T + ph * (1 - v / 100);
  const curve = p.retention.curve;
  const d = curve.map((v, k) => (k ? 'L' : 'M') + x(k).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
  const due = p.dueInDays;
  const floorY = y(RETENTION_FLOOR * 100);
  const gid = 'grad-' + p.materialId;
  const state = p.retention.pct !== null && p.retention.pct < RETENTION_FLOOR * 100 ? 'due' : (due ?? 99) <= 7 ? 'soon' : 'ok';
  return (
    <div style={{ borderRadius: 14, border: '1px solid var(--line2)', background: '#f7f9fd', padding: '10px 12px 8px' }} data-testid="module-curve" data-state={state}>
      <div className="row-between" style={{ marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: color, flexShrink: 0 }} /><b style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.short}</b></div>
        <span className={'pill ' + (state === 'due' ? 'err' : state === 'soon' ? 'risk' : 'ok')} style={{ padding: '3px 8px', fontSize: 10.5 }}>{state === 'due' ? 'overdue' : due !== null && due <= 30 ? 'due in ' + due + ' d' : 'stable 30 d'}</span>
      </div>
      <svg width="100%" height={H} viewBox={'0 0 ' + W + ' ' + H} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }} role="img" aria-label={p.short + ' retention over 30 days'}>
        <defs><linearGradient id={gid} x1="0" x2="0" y1="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".35" /><stop offset="1" stopColor={color} stopOpacity=".02" /></linearGradient></defs>
        {[0, 50, 100].map((v) => <g key={v}><line x1={L} x2={L + pw} y1={y(v)} y2={y(v)} stroke="#e4eaf3" /><text x={L - 6} y={y(v) + 3.5} textAnchor="end" style={{ fontSize: 9.5, fill: '#8a97ad' }}>{v}%</text></g>)}
        <line x1={L} x2={L + pw} y1={floorY} y2={floorY} stroke="#f2a93b" strokeDasharray="4 3" strokeWidth="1.5" />
        <text x={L + 4} y={floorY - 4} style={{ fontSize: 9.5, fill: '#9a6410', fontWeight: 700 }}>floor {RETENTION_FLOOR * 100}%</text>
        <path d={d + ' L ' + x(30).toFixed(1) + ' ' + y(0) + ' L ' + x(0) + ' ' + y(0) + ' Z'} fill={'url(#' + gid + ')'} />
        <path d={d} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" />
        {[0, 7, 14, 30].map((k) => (
          <g key={k}>
            <circle cx={x(k)} cy={y(curve[k])} r={k === 0 ? 4.5 : 3.5} fill={k === 0 ? color : '#fff'} stroke={color} strokeWidth="2" />
            <text x={x(k)} y={y(curve[k]) - 8} textAnchor={k === 30 ? 'end' : k === 0 ? 'start' : 'middle'} style={{ fontSize: 10, fontWeight: 700, fill: '#1e2b45' }}>{curve[k]}%</text>
            <text x={x(k)} y={H - 8} textAnchor={k === 30 ? 'end' : k === 0 ? 'start' : 'middle'} style={{ fontSize: 9.5, fill: '#5c6b85' }}>{k === 0 ? 'today' : '+' + k + ' d'}</text>
          </g>
        ))}
        {due !== null && due > 0 && due <= 30 && (
          <g>
            <line x1={x(due)} x2={x(due)} y1={floorY} y2={T + ph} stroke="#f2a93b" strokeWidth="1" strokeDasharray="2 2" />
            <circle cx={x(due)} cy={floorY} r="5" fill="#fff" stroke="#f2a93b" strokeWidth="2.5" />
          </g>
        )}
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--ink2)', marginTop: 2 }}>
        <span>{p.retention.passes} pass{p.retention.passes === 1 ? '' : 'es'} · half-life {p.retention.halfLife} d</span>
        <span>repeat every <b>{p.repeatEvery} d</b></span>
      </div>
    </div>
  );
}

function ForecastChart({ preds }: { preds: Prediction[] }) {
  const cols = Math.min(3, Math.max(1, preds.length));
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(' + cols + ', minmax(0, 1fr))', gap: 10 }} data-testid="forecast-charts">
      {preds.map((p, i) => <ModuleCurve key={p.materialId} p={p} color={LINE_COLORS[i % LINE_COLORS.length]} />)}
    </div>
  );
}

export function RetentionCard({ ctx, learnerId }: { ctx: Ctx; learnerId: string }) {
  const preds = predictions(ctx, learnerId);
  const refreshers = useStore((s) => s.refreshers);
  const schedule = useStore((s) => s.scheduleRefresher);
  const toast = useStore((s) => s.toast);
  const withData = preds.filter((p) => p.retention.pct !== null);
  const soonest = withData.slice().sort((a, b) => (a.dueInDays ?? 999) - (b.dueInDays ?? 999))[0];
  const mostFrequent = withData.slice().sort((a, b) => a.repeatEvery - b.repeatEvery)[0];
  const worst = withData.slice().sort((a, b) => (b.mistakes30Per10 ?? 0) - (a.mistakes30Per10 ?? 0))[0];
  const totalNow = withData.reduce((s, p) => s + (p.mistakesNowPer10 ?? 0), 0);
  const total30 = withData.reduce((s, p) => s + (p.mistakes30Per10 ?? 0), 0);
  return (
    <div className="card" style={{ padding: '16px 18px', flexGrow: 1 }} data-testid="retention-card">
      <div className="row-between">
        <div><div className="card-h">Retention &amp; mistake forecast</div><div className="card-sub">Forgetting curve per module, predicted errors, and how often each module needs repeating</div></div>
        <span className="tag g">R(t) = 2^(−t/half-life) · floor {RETENTION_FLOOR * 100}%</span>
      </div>

      {withData.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10, marginTop: 12 }} data-testid="forecast-summary">
          <div style={{ padding: '10px 12px', borderRadius: 12, background: '#fdf1dc', border: '1px solid #f6dfae' }}>
            <div style={{ fontSize: 10.5, color: '#9a6410', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Forgets soonest</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{soonest.short}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>{(soonest.dueInDays ?? 0) <= 0 ? 'already below the floor' : 'below ' + RETENTION_FLOOR * 100 + '% in ' + soonest.dueInDays + ' d'}</div>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--blue-l)', border: '1px solid #b9cdf0' }}>
            <div style={{ fontSize: 10.5, color: 'var(--blue-d)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Repeat most often</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }}>{mostFrequent.short}</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>every {mostFrequent.repeatEvery} day{mostFrequent.repeatEvery === 1 ? '' : 's'} until more passes lengthen the half-life</div>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 12, background: 'var(--red-l)', border: '1px solid #f3bcb9' }}>
            <div style={{ fontSize: 10.5, color: 'var(--red-t)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em' }}>Predicted mistakes</div>
            <div style={{ fontSize: 13, fontWeight: 700, marginTop: 3 }} data-testid="mistakes-total">{Math.round(totalNow * 10) / 10} → {Math.round(total30 * 10) / 10} per 10 tasks</div>
            <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>today → in 30 days · worst: {worst.short}</div>
          </div>
        </div>
      )}

      {withData.length > 0 && <div style={{ marginTop: 12 }}><ForecastChart preds={withData} /></div>}
      <div style={{ marginTop: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }} data-testid="forecast-table">
          <thead>
            <tr style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Module</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Retention now · +7 · +14 · +30 d</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Mistakes per 10 tasks</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Likely to slip on</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Repeat every</th>
              <th style={{ padding: '6px 8px', fontWeight: 600 }}>Refresher</th>
            </tr>
          </thead>
          <tbody>
            {preds.length === 0 && <tr><td colSpan={6} className="empty" style={{ padding: 16 }}>No modules enrolled.</td></tr>}
            {preds.map((p, i) => {
              const r = p.retention;
              const sched = refreshers.find((x) => x.learnerId === learnerId && x.materialId === p.materialId);
              const cert = certificate(ctx, learnerId, p.materialId);
              const state = r.pct === null ? 'none' : r.pct < RETENTION_FLOOR * 100 ? 'due' : (r.dueInDays ?? 99) <= 7 ? 'soon' : 'ok';
              const color = state === 'due' ? '#e0554f' : state === 'soon' ? '#f2a93b' : '#2fb673';
              const pc = (v: number | null) => (v === null ? '—' : v + '%');
              return (
                <tr key={p.materialId} style={{ borderTop: '1px solid var(--line2)' }} data-testid="retention-row" data-state={state}>
                  <td style={{ padding: '9px 8px', minWidth: 150 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><i style={{ width: 8, height: 8, borderRadius: 999, background: LINE_COLORS[withData.indexOf(p) % LINE_COLORS.length], opacity: r.pct === null ? .3 : 1 }} /><b>{p.short}</b></div>
                    <div style={{ fontSize: 10.5, color: 'var(--muted)', marginTop: 2 }}>{r.pct === null ? 'nothing passed yet' : r.passes + ' pass' + (r.passes === 1 ? '' : 'es') + ' · last ' + Math.floor(r.days || 0) + ' d ago · half-life ' + r.halfLife + ' d'}{cert ? ' · cert to ' + fmtDate(cert.expires) : ''}</div>
                  </td>
                  <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                    <b style={{ color, fontSize: 14 }} data-testid="retention-pct">{pc(r.pct)}</b>
                    <span style={{ color: 'var(--ink2)' }}> / {pc(p.r7)} / {pc(p.r14)} / {pc(p.r30)}</span>
                  </td>
                  <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                    {p.mistakesNowPer10 === null ? '—' : <><b>{p.mistakesNowPer10}</b> today → <b style={{ color: (p.mistakes30Per10 ?? 0) >= 4 ? 'var(--red-t)' : 'inherit' }}>{p.mistakes30Per10}</b> in 30 d</>}
                    <div style={{ fontSize: 10.5, color: 'var(--muted)' }}>base fail rate {Math.round(p.failRate * 100)}% ({p.failSource === 'learner' ? 'own history' : p.failSource === 'cohort' ? 'cohort' : 'default'})</div>
                  </td>
                  <td style={{ padding: '9px 8px' }}>
                    {p.weakest.length ? p.weakest.map((w) => <span key={w.type} className="tag" style={{ marginRight: 4, background: w.rate >= 30 ? 'var(--red-l)' : 'var(--amber-l)', color: w.rate >= 30 ? 'var(--red-t)' : 'var(--amber-t)' }}>{w.label} {w.rate}%</span>) : <span style={{ color: 'var(--muted)' }}>no failures yet</span>}
                  </td>
                  <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}><b>{p.repeatEvery} d</b>{i === withData.indexOf(mostFrequent) && withData.length > 1 ? <span className="tag" style={{ marginLeft: 6 }}>most often</span> : null}</td>
                  <td style={{ padding: '9px 8px', whiteSpace: 'nowrap' }}>
                    {r.pct === null ? <span style={{ color: 'var(--muted)' }}>after first pass</span>
                      : sched ? <span className="pill ok" data-testid="refresher-pill"><Ic.check size={11} />{fmtDate(sched.due)}</span>
                      : <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-start' }}><span style={{ color: state === 'due' ? 'var(--red-t)' : 'var(--ink2)', fontWeight: state === 'due' ? 700 : 500, fontSize: 11.5 }}>{state === 'due' ? 'overdue' : 'due ' + fmtDate(ctx.now + (r.dueInDays || 0) * DAY)}</span><button className="btn sm" onClick={() => { schedule(learnerId, p.materialId, state === 'due' ? 1 : 3); toast('Refresher scheduled for ' + p.short, 'ok'); }} data-testid="schedule-refresher">Schedule</button></div>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function HealthPanel({ ctx, ids }: { ctx: Ctx; ids: string[] }) {
  const sum = healthSummary(ctx, ids);
  const acked = useStore((s) => s.acked);
  const ack = useStore((s) => s.ackAlert);
  const schedule = useStore((s) => s.scheduleRefresher);
  const refreshers = useStore((s) => s.refreshers);
  const toast = useStore((s) => s.toast);
  const list = alerts(ctx, ids).filter((a) => !acked.includes(a.id) && !(a.materialId && refreshers.some((r) => r.learnerId === a.learnerId && r.materialId === a.materialId)));
  const byType = failureByType(ctx, ids);
  const missed = mostMissed(ctx, ids);
  const maxRate = Math.max(1, ...byType.map((t) => t.rate));
  const learner = (id: string) => ctx.learners.find((l) => l.id === id)!;
  return (
    <section className="card" style={{ padding: '16px 18px' }} data-testid="health-panel">
      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <div>
          <div className="card-h">Learning health &amp; alerts</div>
          <div className="card-sub">Where knowledge is fading and where mistakes happen — across the {ids.length} learner{ids.length === 1 ? '' : 's'} in view</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }} data-testid="health-summary">
          <span className="pill ok"><span className="dot" />{sum.avgRetention}% avg retention</span>
          <span className={'pill ' + (sum.due ? 'err' : 'none')} data-testid="sum-due">{sum.due} overdue refresher{sum.due === 1 ? '' : 's'}</span>
          <span className={'pill ' + (sum.soon ? 'risk' : 'none')} data-testid="sum-soon">{sum.soon} due this week</span>
          <span className={'pill ' + (sum.inactive ? 'risk' : 'none')}>{sum.inactive} inactive / not started</span>
          <span className={'pill ' + (sum.lowquiz ? 'risk' : 'none')}>{sum.lowquiz} low quiz</span>
          <span className={'pill ' + (sum.cert ? 'risk' : 'none')}>{sum.cert} certificate{sum.cert === 1 ? '' : 's'} expiring</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12, marginTop: 14 }}>
        <div style={{ borderRadius: 14, border: '1px solid var(--line2)', background: '#f7f9fd', padding: 12 }}>
          <div className="row-between"><div style={{ fontSize: 12.5, fontWeight: 700 }}>Alerts <span style={{ color: 'var(--muted)', fontWeight: 500 }}>{list.length} open</span></div><span style={{ fontSize: 11, color: 'var(--muted)' }}>ordered by severity</span></div>
          <div className="stack" style={{ gap: 6, marginTop: 8, maxHeight: 300, overflow: 'auto' }} data-testid="alert-list">
            {list.length === 0 && <div className="empty" style={{ padding: 16 }}>Nothing open — everyone is on track.</div>}
            {list.map((a) => (
              <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 10, background: '#fff', border: '1px solid ' + (a.severity === 'high' ? '#f3bcb9' : 'var(--line)') }} data-testid="alert" data-kind={a.kind}>
                <Avatar av={learner(a.learnerId).avatar} size={28} radius={8} />
                <Link to={'/learners/' + a.learnerId} style={{ flexGrow: 1, fontSize: 12, color: 'var(--ink)', lineHeight: 1.35 }}>{a.text}</Link>
                {a.action === 'refresher' && a.materialId
                  ? <button className="btn sm" onClick={() => { schedule(a.learnerId, a.materialId!, a.kind === 'due' ? 1 : 3); toast('Refresher scheduled', 'ok'); }} data-testid="alert-refresher">Schedule refresher</button>
                  : <button className="btn sm" onClick={() => { ack(a.id); toast('Noted — ' + learner(a.learnerId).sup + ' will be nudged', 'ok'); }} data-testid="alert-ack">{a.action === 'recert' ? 'Book re-cert' : 'Nudge supervisor'}</button>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderRadius: 14, border: '1px solid var(--line2)', background: '#f7f9fd', padding: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Where mistakes happen <span style={{ color: 'var(--muted)', fontWeight: 500 }}>fail rate by task type</span></div>
          <div className="stack" style={{ gap: 7, marginTop: 10 }} data-testid="failure-chart">
            {byType.length === 0 && <div className="empty" style={{ padding: 16 }}>No attempts yet.</div>}
            {byType.map((t) => (
              <div key={t.type} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ width: 96, fontSize: 11.5, color: 'var(--ink2)' }}>{t.label}</span>
                <div style={{ flexGrow: 1, height: 10, borderRadius: 999, background: '#e4eaf3', overflow: 'hidden' }}>
                  <svg width="100%" height="10" viewBox="0 0 100 10" preserveAspectRatio="none" style={{ display: 'block' }}><rect className="grow" x="0" y="0" width={(t.rate / maxRate) * 100} height="10" rx="5" fill={t.rate >= 30 ? '#e0554f' : t.rate >= 15 ? '#f2a93b' : '#2fb673'} /></svg>
                </div>
                <span style={{ width: 62, fontSize: 11.5, fontWeight: 700, textAlign: 'right' }}>{t.rate}% <span style={{ color: 'var(--muted)', fontWeight: 500 }}>({t.failed}/{t.attempts})</span></span>
              </div>
            ))}
          </div>
        </div>

        <div style={{ borderRadius: 14, border: '1px solid var(--line2)', background: '#f7f9fd', padding: 12 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700 }}>Most-missed tasks <span style={{ color: 'var(--muted)', fontWeight: 500 }}>fix the content or re-teach</span></div>
          <div className="stack" style={{ gap: 6, marginTop: 10 }} data-testid="missed-list">
            {missed.length === 0 && <div className="empty" style={{ padding: 16 }}>No failed attempts.</div>}
            {missed.map((m) => (
              <Link key={m.exercise.id} to={'/builder/' + m.material.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 10, background: '#fff', border: '1px solid var(--line)', color: 'var(--ink)' }}>
                <span className="tchip">{TYPE_LABEL[m.exercise.type]}</span>
                <span style={{ flexGrow: 1, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={m.exercise.title}>{m.exercise.title}</span>
                <span style={{ fontSize: 11, color: '#b3302b', fontWeight: 700, whiteSpace: 'nowrap' }}>{m.learners} learner{m.learners === 1 ? '' : 's'} · {m.failed} fail{m.failed === 1 ? '' : 's'}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
