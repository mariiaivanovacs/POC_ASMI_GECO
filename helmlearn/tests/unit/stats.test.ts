import { describe, expect, it } from 'vitest';
import { seedActivity, seedLearners, seedMaterials } from '../../src/data/seed';
import { aiScore, cohortKpis, flag, moduleRows, overallProgress, quizAvg, toCsv, trend, weeklyActivity, topModules, type Ctx } from '../../src/store/stats';

function ctx(): Ctx {
  const { materials, exercises } = seedMaterials();
  const { attempts, enrollments } = seedActivity(exercises);
  return { materials, exercises, learners: seedLearners(), attempts, enrollments, now: Date.now() };
}

describe('stats', () => {
  const c = ctx();

  it('seeded materials have exercises of every type for the flagship SOP', () => {
    const hw = c.exercises.filter((e) => e.materialId === 'hw');
    expect(new Set(hw.map((e) => e.type)).size).toBe(9);
    expect(c.materials.find((m) => m.id === 'hw')!.status).toBe('processed');
  });

  it('never produces NaN and stays within 0..100', () => {
    for (const l of c.learners) {
      const p = overallProgress(c, l.id);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(100);
      const s = aiScore(c, l.id);
      expect(Number.isFinite(s)).toBe(true);
      const act = weeklyActivity(c, l.id, topModules(c, l.id));
      expect(act.days).toHaveLength(7);
      for (const d of act.days) for (const h of d.hours) expect(Number.isFinite(h)).toBe(true);
      expect(trend(c, l.id, topModules(c, l.id))).toHaveLength(7);
    }
  });

  it('flags match the seeded profiles', () => {
    expect(flag(c, 'l7').kind).toBe('risk');
    expect(flag(c, 'l7').text).toBe('Not started');
    expect(flag(c, 'l3').text).toBe('Low quiz score');
    expect(flag(c, 'l5').text).toBe('Certified');
    expect(overallProgress(c, 'l5')).toBe(100);
  });

  it('a learner with no attempts yields empty-state values, not errors', () => {
    const empty: Ctx = { ...c, attempts: [] };
    expect(quizAvg(empty, 'l1')).toBeNull();
    expect(overallProgress(empty, 'l1')).toBe(0);
    expect(flag(empty, 'l1').text).toBe('Not started');
    expect(weeklyActivity(empty, 'l1', []).total).toBe(0);
  });

  it('numbers move when a new passing attempt is recorded', () => {
    const before = overallProgress(c, 'l1');
    const unfinished = c.exercises.find((e) => e.materialId === 'hw' && !c.attempts.some((a) => a.learnerId === 'l1' && a.exerciseId === e.id && a.passed))!;
    const after: Ctx = { ...c, attempts: [...c.attempts, { id: 'x', learnerId: 'l1', materialId: 'hw', exerciseId: unfinished.id, type: unfinished.type, score: 100, passed: true, seconds: 90, at: Date.now() }] };
    expect(overallProgress(after, 'l1')).toBeGreaterThan(before);
    expect(moduleRows(after, 'l1')[0].progress).toBeGreaterThan(moduleRows(c, 'l1')[0].progress);
  });

  it('cohort KPIs aggregate the filtered set', () => {
    const all = cohortKpis(c, c.learners.map((l) => l.id));
    expect(all.learners).toBe(10);
    expect(all.risk).toBeGreaterThanOrEqual(2);
    const none = cohortKpis(c, []);
    expect(none.completion).toBe(0);
  });

  it('escapes CSV cells', () => {
    expect(toCsv([{ a: 'x,y', b: 'He said "hi"', c: 3 }])).toBe('a,b,c\n"x,y","He said ""hi""",3');
  });
});

describe('retention & alerts', () => {
  const c = ctx();
  it('retention decays with time and grows half-life with passes', async () => {
    const { retention, alerts, healthSummary, failureByType, mostMissed } = await import('../../src/store/stats');
    const fresh = retention(c, 'l2', 'hw');
    expect(fresh.pct).toBeGreaterThan(80);
    const stale = retention(c, 'l3', 'rig');
    expect(stale.pct).not.toBeNull();
    expect(stale.pct!).toBeLessThan(60);
    expect(retention({ ...c, attempts: [] }, 'l2', 'hw').pct).toBeNull();
    const al = alerts(c, c.learners.map((l) => l.id));
    expect(al.some((a) => a.kind === 'due' && a.learnerId === 'l3')).toBe(true);
    expect(al.some((a) => a.kind === 'notstarted' && a.learnerId === 'l7')).toBe(true);
    const sum = healthSummary(c, c.learners.map((l) => l.id));
    expect(sum.due).toBeGreaterThanOrEqual(1);
    expect(sum.avgRetention).toBeGreaterThan(0);
    const ft = failureByType(c, c.learners.map((l) => l.id));
    expect(ft.length).toBeGreaterThan(0);
    for (const t of ft) { expect(t.rate).toBeGreaterThanOrEqual(0); expect(t.rate).toBeLessThanOrEqual(100); }
    expect(mostMissed(c, c.learners.map((l) => l.id)).length).toBeGreaterThan(0);
  });
});

describe('content quality signal', () => {
  it('flags a task nobody has attempted as unproven, not as failing', async () => {
    const { seedActivity, seedLearners, seedMaterials } = await import('../../src/data/seed');
    const { exerciseQuality, qualitySummary, moduleQuality } = await import('../../src/store/stats');
    const { materials, exercises } = seedMaterials();
    const { attempts, enrollments } = seedActivity(exercises);
    const untouched = exercises[0];
    const ctx = { learners: seedLearners(), materials, exercises, attempts: attempts.filter((a) => a.exerciseId !== untouched.id), enrollments, now: Date.now() };
    const q = exerciseQuality(ctx, untouched.id);
    expect(q.flag).toBe('unproven');
    expect(q.attempts).toBe(0);
    expect(q.passRate).toBeNull();
    const s = qualitySummary(ctx);
    expect(s.total).toBe(exercises.length);
    expect(s.attempted + s.unproven).toBeGreaterThanOrEqual(s.total - s.unproven);
    expect(moduleQuality(ctx, 'hw').length).toBe(exercises.filter((e) => e.materialId === 'hw').length);
  });

  it('classifies too-hard / healthy / too-easy from pass rate once there is enough evidence', async () => {
    const { exerciseQuality, MIN_EVIDENCE } = await import('../../src/store/stats');
    const ex = { id: 'x', materialId: 'm', type: 'mcq' as const, level: 'all' as const, title: 't', sourceRef: '', stepIndex: null, generated: true, reviewStatus: 'draft' as const, reviewedBy: null, reviewedAt: null, reviewNote: null, i18n: { en: { type: 'mcq' as const, data: { q: '', opts: ['a', 'b'], correct: 0, hint: '', ok: '', no: '' } } } };
    const mk = (n: number, pass: number, seconds = 60) => Array.from({ length: n }, (_, i) => ({ id: 'a' + i, learnerId: 'l' + i, materialId: 'm', exerciseId: 'x', type: 'mcq' as const, score: i < pass ? 100 : 0, passed: i < pass, seconds, at: 0 }));
    const base = { learners: [], materials: [], exercises: [ex], enrollments: [], now: 0 };
    expect(exerciseQuality({ ...base, attempts: mk(MIN_EVIDENCE - 1, 0) }, 'x').flag).toBe('unproven');
    expect(exerciseQuality({ ...base, attempts: mk(10, 2) }, 'x').flag).toBe('too-hard');
    expect(exerciseQuality({ ...base, attempts: mk(10, 8) }, 'x').flag).toBe('healthy');
    expect(exerciseQuality({ ...base, attempts: mk(10, 10) }, 'x').flag).toBe('too-easy');
    expect(exerciseQuality({ ...base, attempts: mk(10, 8, 400) }, 'x').flag).toBe('slow');
  });
});

describe('learning pace', () => {
  it('classifies enrolment progress against the target window', async () => {
    const { pace, TARGET_DAYS } = await import('../../src/store/stats');
    const DAY = 86_400_000; const now = Date.now();
    const exs = Array.from({ length: 10 }, (_, i) => ({ id: 'e' + i, materialId: 'm', type: 'mcq' as const, level: 'all' as const, title: 't', sourceRef: '', stepIndex: null, generated: true, reviewStatus: 'draft' as const, reviewedBy: null, reviewedAt: null, reviewNote: null, i18n: { en: { type: 'mcq' as const, data: { q: '', opts: ['a', 'b'], correct: 0, hint: '', ok: '', no: '' } } } }));
    const mk = (daysEnrolled: number, passedCount: number, lastActiveDaysAgo: number) => ({
      learners: [], materials: [], exercises: exs, now,
      enrollments: [{ learnerId: 'l', materialId: 'm', at: now - daysEnrolled * DAY }],
      attempts: exs.slice(0, passedCount).map((e, i) => ({ id: 'a' + i, learnerId: 'l', materialId: 'm', exerciseId: e.id, type: 'mcq' as const, score: 100, passed: true, seconds: 60, at: now - lastActiveDaysAgo * DAY })),
    });
    expect(pace({ ...mk(5, 5, 1), enrollments: [] }, 'l', 'm').status).toBe('not-enrolled');
    expect(pace(mk(5, 0, 0), 'l', 'm').status).toBe('not-started');
    expect(pace(mk(5, 5, 1), 'l', 'm').status).toBe('on-track');
    expect(pace(mk(10, 2, 1), 'l', 'm').status).toBe('slow');
    expect(pace(mk(10, 5, 6), 'l', 'm').status).toBe('inactive');
    expect(pace(mk(TARGET_DAYS + 3, 5, 1), 'l', 'm').status).toBe('overdue');
    expect(pace(mk(30, 10, 1), 'l', 'm').status).toBe('done');
  });
});
