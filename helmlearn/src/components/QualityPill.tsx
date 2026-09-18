import type { ExerciseQuality } from '../store/stats';

export function QualityPill({ q, compact }: { q: ExerciseQuality; compact?: boolean }) {
  const kind = q.flag === 'too-hard' ? 'err' : q.flag === 'too-easy' || q.flag === 'slow' ? 'risk' : q.flag === 'healthy' ? 'ok' : 'none';
  const label = q.flag === 'unproven'
    ? (q.attempts ? q.attempts + ' attempt' + (q.attempts === 1 ? '' : 's') : 'No attempts yet')
    : q.flag === 'slow' ? Math.round((q.avgSeconds || 0) / 60) + ' min avg' : q.passRate + '% pass' + (compact ? '' : ' · ' + q.attempts + ' tries');
  const prefix = q.flag === 'too-hard' ? 'Too hard · ' : q.flag === 'too-easy' ? 'Too easy · ' : q.flag === 'slow' ? 'Slow · ' : '';
  return <span className={'pill ' + kind} title={q.reason} data-testid="quality-pill" data-flag={q.flag}>{prefix}{label}</span>;
}
