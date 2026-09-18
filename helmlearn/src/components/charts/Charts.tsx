import type { DayActivity, TrendPoint } from '../../store/stats';

export function Gauge({ score, ticks = 36 }: { score: number; ticks?: number }) {
  const cx = 120, cy = 108, r1 = 70, r2 = 96;
  const items = Array.from({ length: ticks }, (_, i) => {
    const a = ((135 + (i * 270) / (ticks - 1)) * Math.PI) / 180;
    return { x1: cx + r1 * Math.cos(a), y1: cy + r1 * Math.sin(a), x2: cx + r2 * Math.cos(a), y2: cy + r2 * Math.sin(a), on: i / (ticks - 1) <= score / 100 };
  });
  return (
    <svg width="240" height="170" viewBox="0 0 240 170" role="img" aria-label={'Performance ' + score + ' out of 100'}>
      {items.map((t, i) => <line key={i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} stroke={t.on ? '#2c4a7c' : '#e4eaf3'} strokeWidth="5" strokeLinecap="round" />)}
      <text x="120" y="118" textAnchor="middle" style={{ fontFamily: 'var(--font-h)', fontSize: 34, fontWeight: 800, fill: '#1e2b45' }} data-testid="gauge-score">{score}</text>
      <text x="120" y="136" textAnchor="middle" style={{ fontSize: 11, fill: '#8a97ad' }}>/100</text>
    </svg>
  );
}

export function DotBar({ value, dots = 12 }: { value: number | null; dots?: number }) {
  const n = value === null ? 0 : Math.round((value / 100) * dots);
  return (
    <svg width={dots * 11} height="10" viewBox={'0 0 ' + dots * 11 + ' 10'} aria-hidden="true">
      {Array.from({ length: dots }, (_, i) => <rect key={i} x={i * 11} y="0" width="8" height="10" rx="3" fill={i < n ? '#2c4a7c' : '#e4eaf3'} />)}
    </svg>
  );
}

export function ProgressBar({ value, color = '#3b82f6', height = 8, animate = true }: { value: number; color?: string; height?: number; animate?: boolean }) {
  return (
    <div className="bar" style={{ height }}>
      <svg width="100%" height={height} viewBox="0 0 100 8" preserveAspectRatio="none" style={{ display: 'block' }}>
        <rect className={animate ? 'grow' : undefined} x="0" y="0" width={Math.max(0, Math.min(100, value))} height="8" rx="4" fill={color} />
      </svg>
    </div>
  );
}

export function StackedBars({ days, colors }: { days: DayActivity[]; colors: string[] }) {
  const T = 14, H = 156;
  const maxH = Math.max(1, Math.ceil(Math.max(...days.map((d) => d.total), 0.5)));
  const grid = Array.from({ length: 5 }, (_, i) => (maxH * i) / 4);
  return (
    <svg width="100%" height="190" viewBox="0 0 400 190" preserveAspectRatio="none" style={{ display: 'block' }} role="img" aria-label="Hours per day">
      {grid.map((v, i) => { const y = T + H * (1 - v / maxH); return <g key={i}><line x1="30" x2="400" y1={y} y2={y} stroke="#eef2f8" /><text x="24" y={y + 3.5} textAnchor="end" style={{ fontSize: 10, fill: '#8a97ad' }}>{Math.round(v * 10) / 10}h</text></g>; })}
      {days.map((d, di) => {
        const x = 38 + di * 52;
        let cum = 0;
        return (
          <g key={di}>
            {d.hours.map((h, k) => {
              const hh = (H * h) / maxH;
              const y = T + H - ((cum + h) / maxH) * H;
              cum += h;
              return hh > 0 ? <rect key={k} className="rise" x={x} y={y} width="30" height={Math.max(0, hh - 2)} rx="4" fill={colors[k]} /> : null;
            })}
            <text x={x + 15} y="184" textAnchor="middle" style={{ fontSize: 10.5, fill: '#5c6b85' }}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function TrendDots({ points, colors }: { points: TrendPoint[]; colors: string[] }) {
  const T = 14, H = 182;
  const y = (v: number) => T + H * (1 - v / 100);
  return (
    <svg width="100%" height="220" viewBox="0 0 400 220" preserveAspectRatio="none" style={{ display: 'block' }} role="img" aria-label="Quiz score trend">
      {[0, 25, 50, 75, 100].map((v) => <g key={v}><line x1="30" x2="400" y1={y(v)} y2={y(v)} stroke="#eef2f8" /><text x="24" y={y(v) + 3.5} textAnchor="end" style={{ fontSize: 10, fill: '#8a97ad' }}>{v}</text></g>)}
      {points.map((p, i) => {
        const x = 44 + i * 56;
        const first = p.values.find((v) => v !== null);
        return (
          <g key={i}>
            <line x1={x} x2={x} y1="14" y2="196" stroke="#eef2f8" strokeWidth="10" strokeLinecap="round" />
            {first !== null && first !== undefined && <line x1={x} x2={x} y1={y(first)} y2="196" stroke="#dbe8ff" strokeWidth="10" strokeLinecap="round" />}
            {p.values.map((v, k) => v === null ? null : <circle key={k} className="pop" cx={x} cy={y(v)} r="6" fill={colors[k]} stroke="#fff" strokeWidth="2" />)}
            <text x={x} y="214" textAnchor="middle" style={{ fontSize: 10.5, fill: '#5c6b85' }}>{p.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

const WAVE = [10, 18, 26, 34, 22, 14, 30, 38, 24, 12, 20, 32, 40, 28, 16, 10, 22, 34, 26, 18, 30, 36, 20, 12, 24, 32, 18, 14, 26, 20, 10, 16, 28, 22, 14, 30, 24, 18, 12, 20, 34, 26, 16, 10, 22, 30, 18];
export function Waveform({ playing, progress = 0, width = 380, bars = 47 }: { playing: boolean; progress?: number; width?: number; bars?: number }) {
  const step = width / bars;
  return (
    <svg width={width} height="44" viewBox={'0 0 ' + width + ' 44'} style={{ flexGrow: 1 }} aria-hidden="true">
      {WAVE.slice(0, bars).map((h, i) => (
        <rect key={i} className={'wv ' + (playing ? '' : 'still ') + 'd' + ((i % 5) + 1)} x={i * step} y={22 - h / 2} width={Math.max(3, step - 2)} height={h} rx="3"
          fill={playing && i / bars < progress ? '#8fc0ff' : playing ? '#4f7ab3' : '#5a7bad'} />
      ))}
    </svg>
  );
}
