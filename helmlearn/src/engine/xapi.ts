import type { Attempt, Exercise, Learner, Material } from '../data/types';
import type { Ctx } from '../store/stats';

// Structurally valid xAPI (Tin Can) statements — importable into any LRS. Deliberately scoped smaller
// than a full SCORM package: no LMS session/runtime wrapper, just the statement stream an LRS consumes.
// mbox uses a placeholder local domain since this POC never collects a real work email.
const VERB = {
  passed: { id: 'http://adlnet.gov/expapi/verbs/passed', display: { en: 'passed' } },
  failed: { id: 'http://adlnet.gov/expapi/verbs/failed', display: { en: 'failed' } },
};

function actorOf(l: Learner) {
  return { objectType: 'Agent' as const, name: l.name, mbox: 'mailto:' + l.id + '@helmlearn.local' };
}

function objectOf(m: Material, e: Exercise) {
  return {
    id: 'https://helmlearn.example/materials/' + m.id + '/exercises/' + e.id,
    objectType: 'Activity' as const,
    definition: {
      name: { en: e.title },
      description: { en: 'Type: ' + e.type + ' · Source: ' + e.sourceRef },
      type: 'http://adlnet.gov/expapi/activities/question',
    },
  };
}

export interface XapiStatement {
  actor: ReturnType<typeof actorOf>;
  verb: typeof VERB.passed | typeof VERB.failed;
  object: ReturnType<typeof objectOf>;
  result: { score: { scaled: number; raw: number; min: number; max: number }; success: boolean; duration: string };
  timestamp: string;
  context: { extensions: Record<string, string> };
}

function isoDuration(seconds: number): string {
  return 'PT' + Math.max(1, Math.round(seconds)) + 'S';
}

export function attemptToStatement(a: Attempt, learner: Learner, material: Material, exercise: Exercise): XapiStatement {
  return {
    actor: actorOf(learner),
    verb: a.passed ? VERB.passed : VERB.failed,
    object: objectOf(material, exercise),
    result: { score: { scaled: Math.round((a.score / 100) * 100) / 100, raw: a.score, min: 0, max: 100 }, success: a.passed, duration: isoDuration(a.seconds) },
    timestamp: new Date(a.at).toISOString(),
    context: { extensions: { 'https://helmlearn.example/xapi/exercise-type': exercise.type, 'https://helmlearn.example/xapi/material': material.short } },
  };
}

export function toXapiStatements(ctx: Ctx, learnerIds: string[]): XapiStatement[] {
  const out: XapiStatement[] = [];
  for (const a of ctx.attempts) {
    if (!learnerIds.includes(a.learnerId)) continue;
    const learner = ctx.learners.find((l) => l.id === a.learnerId);
    const material = ctx.materials.find((m) => m.id === a.materialId);
    const exercise = ctx.exercises.find((e) => e.id === a.exerciseId);
    if (!learner || !material || !exercise) continue;
    out.push(attemptToStatement(a, learner, material, exercise));
  }
  return out.sort((x, y) => x.timestamp.localeCompare(y.timestamp));
}
