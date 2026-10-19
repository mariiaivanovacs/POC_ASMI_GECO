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
    // l1 has passed every approved hw task already; their next approved unfinished task is in another module
    const mods = c.enrollments.filter((e) => e.learnerId === 'l1').map((e) => e.materialId);
    const unfinished = c.exercises.find((e) => mods.includes(e.materialId) && e.reviewStatus === 'approved' && !c.attempts.some((a) => a.learnerId === 'l1' && a.exerciseId === e.id && a.passed))!;
    const after: Ctx = { ...c, attempts: [...c.attempts, { id: 'x', learnerId: 'l1', materialId: unfinished.materialId, exerciseId: unfinished.id, type: unfinished.type, score: 100, passed: true, seconds: 90, at: Date.now() }] };
    expect(overallProgress(after, 'l1')).toBeGreaterThan(before);
    const row = (cx: Ctx) => moduleRows(cx, 'l1').find((r) => r.material.id === unfinished.materialId)!.progress;
    expect(row(after)).toBeGreaterThan(row(c));
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
    const ex = { id: 'x', materialId: 'm', type: 'mcq' as const, level: 'all' as const, title: 't', sourceRef: '', stepIndex: null, generated: true, reviewStatus: 'approved' as const, reviewedBy: null, reviewedAt: null, reviewNote: null, i18n: { en: { type: 'mcq' as const, data: { q: '', opts: ['a', 'b'], correct: 0, hint: '', ok: '', no: '' } } } };
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
    const exs = Array.from({ length: 10 }, (_, i) => ({ id: 'e' + i, materialId: 'm', type: 'mcq' as const, level: 'all' as const, title: 't', sourceRef: '', stepIndex: null, generated: true, reviewStatus: 'approved' as const, reviewedBy: null, reviewedAt: null, reviewNote: null, i18n: { en: { type: 'mcq' as const, data: { q: '', opts: ['a', 'b'], correct: 0, hint: '', ok: '', no: '' } } } }));
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

describe('modules contain approved tasks only', () => {
  const c = ctx();
  const pass = (cx: Ctx, learnerId: string, exerciseId: string): Ctx => {
    const e = cx.exercises.find((x) => x.id === exerciseId)!;
    return { ...cx, attempts: [...cx.attempts, { id: 'p_' + exerciseId, learnerId, materialId: e.materialId, exerciseId, type: e.type, score: 100, passed: true, seconds: 60, at: Date.now() }] };
  };
  const setStatus = (cx: Ctx, exerciseId: string, reviewStatus: 'approved' | 'draft' | 'rejected'): Ctx => ({ ...cx, exercises: cx.exercises.map((e) => (e.id === exerciseId ? { ...e, reviewStatus } : e)) });
  const draft = c.exercises.find((e) => e.materialId === 'hw' && e.reviewStatus === 'draft' && !c.attempts.some((a) => a.learnerId === 'l1' && a.exerciseId === e.id && a.passed))!;

  it('task counts and progress ignore drafts', async () => {
    const { moduleTasks } = await import('../../src/store/stats');
    const approved = c.exercises.filter((e) => e.materialId === 'hw' && e.reviewStatus === 'approved');
    expect(approved.length).toBeLessThan(c.exercises.filter((e) => e.materialId === 'hw').length);
    expect(moduleTasks(c, 'hw')).toHaveLength(approved.length);
    // l1 is a new hire: approved 'all' + 'new' tasks only
    const newPath = approved.filter((e) => e.level !== 'exp').length;
    expect(moduleRows(c, 'l1').find((r) => r.material.id === 'hw')!.tasks).toBe(newPath);
  });

  it('passing a draft changes nothing for the learner until the draft is approved', () => {
    const after = pass(c, 'l1', draft.id);
    expect(overallProgress(after, 'l1')).toBe(overallProgress(c, 'l1'));
    expect(quizAvg(after, 'l1')).toBe(quizAvg(c, 'l1'));
    const approvedLater = setStatus(after, draft.id, 'approved');
    expect(moduleRows(approvedLater, 'l1').find((r) => r.material.id === 'hw')!.tasks).toBe(moduleRows(c, 'l1').find((r) => r.material.id === 'hw')!.tasks + 1);
  });

  it('rejecting a task removes it from the module', () => {
    const live = c.exercises.find((e) => e.materialId === 'hw' && e.reviewStatus === 'approved')!;
    const rejected = setStatus(c, live.id, 'rejected');
    expect(moduleRows(rejected, 'l1').find((r) => r.material.id === 'hw')!.tasks).toBe(moduleRows(c, 'l1').find((r) => r.material.id === 'hw')!.tasks - 1);
  });

  it('"next up" never points a learner at a draft', async () => {
    const { nextUp } = await import('../../src/store/stats');
    for (const l of c.learners) {
      const n = nextUp(c, l.id);
      if (!n) continue;
      const m = c.materials.find((x) => n.why.endsWith(x.short))!;
      const approvedTitles = c.exercises.filter((e) => e.materialId === m.id && e.reviewStatus === 'approved').map((e) => e.title);
      expect(approvedTitles).toContain(n.title.split(' · ').slice(1).join(' · '));
    }
  });
});

describe('learning paths', () => {
  const c = ctx();
  const learner = (level: 'new' | 'exp') => c.learners.find((l) => l.level === level && c.enrollments.some((e) => e.learnerId === l.id && e.materialId === 'hw'))!;

  it('new hires get All + New hire tasks, experienced staff get All + Experienced tasks', async () => {
    const { moduleTasks } = await import('../../src/store/stats');
    const nh = moduleTasks(c, 'hw', learner('new').id), ex = moduleTasks(c, 'hw', learner('exp').id);
    expect(nh.every((e) => e.level === 'all' || e.level === 'new')).toBe(true);
    expect(ex.every((e) => e.level === 'all' || e.level === 'exp')).toBe(true);
    expect(nh.some((e) => e.level === 'new')).toBe(true);
    expect(ex.some((e) => e.level === 'exp')).toBe(true);
  });

  it('passing a task outside your path does not move your progress', () => {
    const l = learner('new');
    const expOnly = c.exercises.find((e) => e.materialId === 'hw' && e.reviewStatus === 'approved' && e.level === 'exp')!;
    const after: Ctx = { ...c, attempts: [...c.attempts, { id: 'x_exp', learnerId: l.id, materialId: 'hw', exerciseId: expOnly.id, type: expOnly.type, score: 100, passed: true, seconds: 60, at: Date.now() }] };
    expect(moduleRows(after, l.id).find((r) => r.material.id === 'hw')!.progress).toBe(moduleRows(c, l.id).find((r) => r.material.id === 'hw')!.progress);
  });

  it('changing a task to "All" puts it in both paths', async () => {
    const { moduleTasks } = await import('../../src/store/stats');
    const expOnly = c.exercises.find((e) => e.materialId === 'hw' && e.reviewStatus === 'approved' && e.level === 'exp')!;
    const widened: Ctx = { ...c, exercises: c.exercises.map((e) => (e.id === expOnly.id ? { ...e, level: 'all' as const } : e)) };
    expect(moduleTasks(widened, 'hw', learner('new').id).length).toBe(moduleTasks(c, 'hw', learner('new').id).length + 1);
  });
});
