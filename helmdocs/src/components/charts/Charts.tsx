import type { DayPoint, RegimePoint, StatusPoint, WeekPoint } from '../../store/stats';
import { regimeColor } from '../ui/Icons';

const grid = '#1f333a', axis = '#6f8683', ink = '#a9bcb9';

/** Documents generated per day — stacked: sent vs not yet sent. */
export function DayBars({ days }: { days: DayPoint[] }) {
  const T = 12, H = 120, W = 400, L = 26;
  const max = Math.max(1, ...days.map((d) => d.count));
  const bw = (W - L - 8) / days.length;
  return (
    <svg width="100%" height="160" viewBox={'0 0 ' + W + ' 160'} style={{ display: 'block' }} role="img" aria-label="Documents generated per day" data-testid="chart-days">
      {[0, 0.5, 1].map((f) => { const y = T + H * (1 - f); return <g key={f}><line x1={L} x2={W} y1={y} y2={y} stroke={grid} /><text x={L - 4} y={y + 3.5} textAnchor="end" style={{ fontSize: 9, fill: axis }}>{Math.round(max * f)}</text></g>; })}
      {days.map((d, i) => {
        const x = L + i * bw + 3;
        const h = (H * d.count) / max, hs = (H * d.sent) / max;
        return (
          <g key={i}>
            {d.count > 0 && <rect className="rise" x={x} y={T + H - h} width={Math.max(4, bw - 6)} height={h} rx="3" fill="#2f4a52" />}
            {d.sent > 0 && <rect className="rise" x={x} y={T + H - hs} width={Math.max(4, bw - 6)} height={hs} rx="3" fill="#46d3c4" />}
            {(i % 2 === 1 || days.length <= 7) && <text x={x + (bw - 6) / 2} y={152} textAnchor="middle" style={{ fontSize: 8.5, fill: ink }}>{d.label.split(' ')[0]}</text>}
          </g>
        );
      })}
    </svg>
  );
}

/** Documents by compliance regime — horizontal bars. */
export function RegimeBars({ rows }: { rows: RegimePoint[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  const rh = 22, W = 400, L = 92;
  const H = Math.max(60, rows.length * rh + 8);
  return (
    <svg width="100%" height={Math.min(160, H)} viewBox={'0 0 ' + W + ' ' + H} style={{ display: 'block' }} role="img" aria-label="Documents by regime" data-testid="chart-regime">
      {rows.length === 0 && <text x={W / 2} y={H / 2} textAnchor="middle" style={{ fontSize: 11, fill: axis }}>No documents</text>}
      {rows.map((r, i) => {
        const y = 6 + i * rh;
        const w = ((W - L - 36) * r.count) / max;
        return (
          <g key={r.regime}>
            <text x={L - 8} y={y + 13} textAnchor="end" style={{ fontSize: 10, fill: ink }}>{r.regime}</text>
            <rect x={L} y={y + 3} width={W - L - 36} height={14} rx="5" fill={grid} />
            <rect className="grow" x={L} y={y + 3} width={Math.max(3, w)} height={14} rx="5" fill={regimeColor(r.regime)} />
            <text x={L + w + 6} y={y + 14} style={{ fontSize: 10, fontWeight: 700, fill: '#eef4f2' }}>{r.count}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Minutes per week — HelmDocs vs the manual baseline, grouped bars. */
export function WeekBars({ weeks }: { weeks: WeekPoint[] }) {
  const T = 12, H = 116, W = 400, L = 34;
  const max = Math.max(1, ...weeks.map((w) => Math.max(w.helm, w.manual)));
  const gw = (W - L - 8) / weeks.length;
  return (
    <svg width="100%" height="160" viewBox={'0 0 ' + W + ' 160'} style={{ display: 'block' }} role="img" aria-label="Minutes per week, HelmDocs versus manual" data-testid="chart-weeks">
      {[0, 0.5, 1].map((f) => { const y = T + H * (1 - f); return <g key={f}><line x1={L} x2={W} y1={y} y2={y} stroke={grid} /><text x={L - 4} y={y + 3.5} textAnchor="end" style={{ fontSize: 9, fill: axis }}>{Math.round(max * f)}m</text></g>; })}
      {weeks.map((w, i) => {
        const x = L + i * gw + 10;
        const bw = (gw - 26) / 2;
        const hm = (H * w.manual) / max, hh = (H * w.helm) / max;
        return (
          <g key={i}>
            <rect className="rise" x={x} y={T + H - hm} width={bw} height={hm} rx="3" fill="#2f4a52" />
            <rect className="rise" x={x + bw + 4} y={T + H - hh} width={bw} height={hh} rx="3" fill="#46d3c4" />
            {w.saved > 0 && <text x={x + bw + 2} y={T + H - Math.max(hm, hh) - 4} textAnchor="middle" style={{ fontSize: 9, fontWeight: 700, fill: '#7fe3ad' }}>−{Math.round(w.saved / 60 * 10) / 10}h</text>}
            <text x={x + bw + 2} y={148} textAnchor="middle" style={{ fontSize: 9, fill: ink }}>{w.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Status breakdown — donut with the count in the middle. */
export function StatusDonut({ rows }: { rows: StatusPoint[] }) {
  const total = rows.reduce((a, r) => a + r.count, 0);
  const colors: Record<string, string> = { draft: '#f2c14e', reviewed: '#46d3c4', sent: '#4fd18b' };
  const cx = 70, cy = 70, r = 52, sw = 16;
  let acc = 0;
  const arcs = rows.filter((x) => x.count > 0).map((x) => {
    const a0 = (acc / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
    acc += x.count;
    const a1 = (acc / Math.max(1, total)) * Math.PI * 2 - Math.PI / 2;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const p = (a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1 - 0.0001);
    return { ...x, d: 'M' + x0 + ' ' + y0 + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 };
  });
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
      <svg width="140" height="140" viewBox="0 0 140 140" style={{ flexShrink: 0 }} role="img" aria-label="Documents by status" data-testid="chart-status">
        <circle cx={cx} cy={cy} r={r} fill="none" stroke={grid} strokeWidth={sw} />
        {arcs.map((a) => <path key={a.status} d={a.d} fill="none" stroke={colors[a.status]} strokeWidth={sw} strokeLinecap="butt" />)}
        <text x={cx} y={cy + 6} textAnchor="middle" style={{ fontFamily: 'var(--font-h)', fontSize: 22, fontWeight: 700, fill: '#eef4f2' }}>{total}</text>
        <text x={cx} y={cy + 20} textAnchor="middle" style={{ fontSize: 9, fill: axis }}>documents</text>
      </svg>
      <div className="stack" style={{ gap: 6, fontSize: 12 }}>
        {rows.map((x) => <div key={x.status} style={{ display: 'flex', alignItems: 'center', gap: 8 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: colors[x.status], display: 'inline-block' }} /><span style={{ color: ink, width: 64 }}>{x.status === 'draft' ? 'Draft' : x.status === 'reviewed' ? 'Reviewed' : 'Sent'}</span><b>{x.count}</b><span style={{ color: axis }}>{total ? Math.round((100 * x.count) / total) + '%' : ''}</span></div>)}
      </div>
    </div>
  );
}
