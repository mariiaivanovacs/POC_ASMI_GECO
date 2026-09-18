import type { ExType, Exercise, Fact, Level, ReviewStatus, Structure, Widgets } from '../data/types';
import { mulberry32, seededShuffle } from './rng';

export const ALL_TYPES: ExType[] = ['mcq', 'seq', 'scen', 'audio', 'photo', 'match', 'sign', 'cards', 'fill'];

const DRAFT: { reviewStatus: ReviewStatus; reviewedBy: null; reviewedAt: null; reviewNote: null } = { reviewStatus: 'draft', reviewedBy: null, reviewedAt: null, reviewNote: null };

const WRONG_BANK = [
  'Continue the job and mention it at the end of the shift',
  'Ask a colleague to keep an eye on it while you carry on',
  'Take a photo for the record and carry on working',
  'Wait five minutes and see if it clears by itself',
  'Finish the current task first, then deal with it',
];

function fmt(v: number, unit: string): string {
  const n = Number.isInteger(v) ? String(v) : String(Math.round(v * 10) / 10);
  return unit === '%' ? n + '%' : n + ' ' + unit;
}

function distractors(f: Fact, rand: () => number): string[] {
  const v = f.value;
  const cands = [v * 0.5, v * 2, v * 1.5, v + Math.max(1, Math.round(v * 0.25)), Math.max(0, v - Math.max(1, Math.round(v * 0.4)))]
    .map((x) => Math.round(x * 10) / 10)
    .filter((x) => x !== v && x >= 0);
  const uniq = Array.from(new Set(cands));
  return seededShuffle(uniq, rand).slice(0, 3).map((x) => fmt(x, f.unit));
}

function blank(sentence: string, raw: string): string {
  return sentence.replace(raw, '_____');
}

function short(s: string, max = 60): string {
  const t = s.replace(/\.$/, '');
  return t.length > max ? t.slice(0, max - 1).trim() + '…' : t;
}

function firstWords(s: string, n = 7): string {
  return s.split(/\s+/).slice(0, n).join(' ');
}

export interface GenerateResult { exercises: Exercise[]; widgets: Widgets; missing: ExType[] }

export function generate(materialId: string, st: Structure, seed: number, onlyType?: ExType): GenerateResult {
  const rand = mulberry32(seed);
  const out: Exercise[] = [];
  const title = st.title;
  const ref = (i: number) => title + ' · sentence ' + (i + 1);
  const half = Math.max(1, Math.floor(st.sentences.length / 2));
  const levelFor = (sentence: string, base: Level): Level => {
    const idx = st.sentences.indexOf(sentence);
    return idx >= 0 && idx < half ? 'new' : base;
  };
  const stepIndexFor = (sentence: string): number | null => {
    const i = st.steps.findIndex((s) => sentence.includes(s.slice(0, 25)));
    return i >= 0 ? i : null;
  };
  let n = 0;
  const id = (t: ExType) => materialId + '_' + t + '_' + (n++);
  const want = (t: ExType) => !onlyType || onlyType === t;

  if (want('mcq')) {
    for (const f of st.facts.slice(0, 4)) {
      const opts = seededShuffle([fmt(f.value, f.unit), ...distractors(f, rand)], rand);
      if (opts.length < 3) continue;
      const q = blank(f.sentence, f.raw);
      out.push({
        id: id('mcq'), materialId, type: 'mcq', level: levelFor(f.sentence, 'all'),
        title: 'Fill the number: ' + short(firstWords(f.sentence, 6)),
        sourceRef: ref(st.sentences.indexOf(f.sentence)), stepIndex: stepIndexFor(f.sentence), generated: true, ...DRAFT,
        i18n: { en: { type: 'mcq', data: {
          q: q.endsWith('?') ? q : 'Complete the statement: "' + q + '"',
          opts, correct: opts.indexOf(fmt(f.value, f.unit)),
          hint: 'The answer is in ' + title + ' — look for the sentence about ' + firstWords(f.sentence, 4).toLowerCase() + '.',
          ok: 'Correct — ' + fmt(f.value, f.unit) + '. Source: ' + short(f.sentence, 90),
          no: 'Not quite. The document says ' + fmt(f.value, f.unit) + '.',
        } } },
      });
    }
  }

  if (want('seq') && st.steps.length >= 4) {
    const starts = [0, Math.max(0, st.steps.length - 4)].filter((v, i, a) => a.indexOf(v) === i);
    starts.forEach((s0) => {
      const items = st.steps.slice(s0, s0 + 4).map((x) => short(x, 70));
      out.push({
        id: id('seq'), materialId, type: 'seq', level: s0 === 0 ? 'new' : 'all',
        title: 'Order steps ' + (s0 + 1) + '–' + (s0 + 4), sourceRef: title + ' · steps ' + (s0 + 1) + '–' + (s0 + 4), stepIndex: s0, generated: true, ...DRAFT,
        i18n: { en: { type: 'seq', data: {
          title: 'Put these steps from ' + title + ' in the right order',
          items, hint: 'Tap the cards in the order you would do them.',
          ok: 'Right order.', no: 'Not in order — step ' + (s0 + 1) + ' comes first.',
        } } },
      });
    });
  }

  if (want('scen') && st.hazards.length) {
    const imps = st.steps.length ? st.steps : st.sentences.slice(0, 6);
    st.hazards.slice(0, 3).forEach((h) => {
      const idx = st.sentences.indexOf(h.sentence);
      const near = imps.find((s) => h.sentence.includes(s.slice(0, 20))) || imps[Math.min(imps.length - 1, Math.max(0, Math.floor(idx / Math.max(1, st.sentences.length)) * imps.length))] || imps[0];
      const correct = short(near, 80);
      const wrong = seededShuffle(WRONG_BANK, rand).slice(0, 2);
      const opts = seededShuffle([correct, ...wrong], rand);
      out.push({
        id: id('scen'), materialId, type: 'scen', level: 'all', title: 'Scenario: ' + h.name, sourceRef: ref(idx), stepIndex: stepIndexFor(near), generated: true, ...DRAFT,
        i18n: { en: { type: 'scen', data: {
          title: 'On site you notice a ' + h.name.toLowerCase() + ' risk: "' + short(h.sentence, 110) + '" What do you do?',
          opts, correct: opts.indexOf(correct),
          ok: 'Right. ' + short(near, 90) + '.', no: 'The procedure says: ' + short(near, 90) + '.',
        } } },
      });
    });
  }

  if (want('audio') && st.steps.length >= 2) {
    const pick = st.steps[Math.min(st.steps.length - 1, 1)];
    const correct = short(pick, 70);
    const others = st.steps.filter((s) => s !== pick).slice(0, 2).map((s) => short(s, 70));
    if (others.length === 2) {
      const opts = seededShuffle([correct, ...others], rand);
      out.push({
        id: id('audio'), materialId, type: 'audio', level: 'all', title: 'Listen: supervisor briefing', sourceRef: title + ' · step 2', stepIndex: 1, generated: true, ...DRAFT,
        i18n: { en: { type: 'audio', data: {
          title: 'Listen and answer', body: 'Play the supervisor\'s radio briefing, then choose the instruction it gives.',
          hint: 'Listen for the action the supervisor asks for.', opts, correct: opts.indexOf(correct),
          ok: 'Right — that is the instruction in the briefing.', no: 'Listen again — the briefing says: ' + correct + '.',
          transcript: 'All crew, this is the supervisor. Before you continue: ' + pick.toLowerCase() + '. Confirm on channel 2 when done.',
        } } },
      });
    }
  }

  if (want('photo') && st.ppe.length) {
    st.ppe.slice(0, 2).forEach((item) => {
      out.push({
        id: id('photo'), materialId, type: 'photo', level: 'all', title: 'Photo: ' + item, sourceRef: title + ' · PPE', stepIndex: null, generated: true, ...DRAFT,
        i18n: { en: { type: 'photo', data: {
          title: 'Photo checkpoint', body: 'Take a photo of the ' + item.toLowerCase() + ' you will use for this job, with any inspection tag or label visible.',
          btn: 'Take photo', done: 'Photo captured — check passed: an image was received and looks like equipment, not a blank frame.', item,
        } } },
      });
    });
  }

  if (want('match') && st.terms.length >= 3) {
    const pairs = st.terms.slice(0, 3).map((t) => [t.term, short(t.def, 60)] as [string, string]);
    out.push({
      id: id('match'), materialId, type: 'match', level: 'new', title: 'Match the terms', sourceRef: title + ' · definitions', stepIndex: null, generated: true, ...DRAFT,
      i18n: { en: { type: 'match', data: { title: 'Match each term to its meaning', pairs, hint: 'Tap a term, then tap its meaning.', done: 'All matched.' } } },
    });
  }

  if (want('sign') && st.steps.length >= 3) {
    const items = st.steps.slice(0, 3).map((s) => short(s, 70));
    out.push({
      id: id('sign'), materialId, type: 'sign', level: 'exp', title: 'Supervisor sign-off', sourceRef: title + ' · steps 1–3', stepIndex: 0, generated: true, ...DRAFT,
      i18n: { en: { type: 'sign', data: { title: 'Supervisor sign-off', body: 'Your supervisor confirms each item on site.', items, pin: 'Supervisor PIN', ready: 'Ready for sign-off — enter the supervisor PIN.' } } },
    });
  }

  const widgets = buildWidgets(st, rand);

  if (want('cards') && widgets.cards.length >= 3) {
    const fromTerms = st.terms.length >= 3;
    out.push({
      id: id('cards'), materialId, type: 'cards', level: 'new', title: fromTerms ? 'Flashcards: key terms' : 'Flashcards: key numbers', sourceRef: title + (fromTerms ? ' · definitions' : ' · key figures'), stepIndex: null, generated: true, ...DRAFT,
      i18n: { en: { type: 'cards', data: { title: fromTerms ? 'Recall the meaning of each term' : 'Recall the figure behind each rule', cards: widgets.cards, hint: 'Say the answer out loud before you flip the card.', done: 'All cards recalled.' } } },
    });
  }

  if (want('fill') && widgets.fill.ans[0] !== 'not available') {
    const f0 = st.facts[0];
    out.push({
      id: id('fill'), materialId, type: 'fill', level: 'all', title: 'Fill the blanks: ' + short(firstWords(f0.sentence, 5)), sourceRef: ref(st.sentences.indexOf(f0.sentence)), stepIndex: stepIndexFor(f0.sentence), generated: true, ...DRAFT,
      i18n: { en: { type: 'fill', data: {
        title: 'Complete the rule with the right figures', pre: widgets.fill.pre, mid: widgets.fill.mid, post: widgets.fill.post, ans: widgets.fill.ans, tokens: widgets.fill.tokens,
        hint: 'Both figures are in ' + title + '.', ok: 'Both figures correct.', no: 'Not quite — the document says ' + widgets.fill.ans[0] + ' and ' + widgets.fill.ans[1] + '.',
      } } },
    });
  }

  const missing = ALL_TYPES.filter((t) => want(t) && !out.some((e) => e.type === t));
  return { exercises: out, widgets, missing };
}

function buildWidgets(st: Structure, rand: () => number): Widgets {
  const qaSrc = st.facts.slice(0, 3);
  const qa: [string, string][] = qaSrc.length >= 3
    ? qaSrc.map((f) => [short(firstWords(f.sentence, 8)) + '?', fmt(f.value, f.unit)])
    : st.terms.slice(0, 3).map((t) => ['What is ' + t.term + '?', short(t.def, 50)]);
  const brief = st.steps[0] || st.sentences[0] || 'Follow the procedure';
  const audioOpts = seededShuffle([short(brief, 60), ...seededShuffle(WRONG_BANK, rand).slice(0, 2)], rand);
  let cards: [string, string][] = st.terms.slice(0, 3).map((t) => [t.term, short(t.def, 50)]);
  if (cards.length < 3) {
    for (const f of st.facts) {
      if (cards.length >= 3) break;
      const front = short(firstWords(f.sentence, 6), 40);
      if (!cards.some((c) => c[0] === front)) cards.push([front, fmt(f.value, f.unit)]);
    }
  }
  const f0 = st.facts[0];
  const f1 = st.facts.find((f) => f !== f0 && f.sentence !== f0.sentence) || st.facts.find((f) => f !== f0);
  let fill: Widgets['fill'];
  if (f0 && f1 && f1.sentence !== f0.sentence) {
    const [a0, b0] = f0.sentence.split(f0.raw);
    const [a1, b1] = f1.sentence.split(f1.raw);
    fill = { pre: short(a0, 70), mid: short((b0 || '').trim(), 50) + ' ' + short(a1, 50), post: short((b1 || '').trim(), 40), ans: [fmt(f0.value, f0.unit), fmt(f1.value, f1.unit)], tokens: seededShuffle([fmt(f0.value, f0.unit), fmt(f1.value, f1.unit), ...distractors(f0, rand).slice(0, 1), ...distractors(f1, rand).slice(0, 1)], rand) };
  } else if (f0 && f1) {
    const i0 = f0.sentence.indexOf(f0.raw), i1 = f0.sentence.indexOf(f1.raw);
    const [first, second] = i0 <= i1 ? [f0, f1] : [f1, f0];
    const pre = f0.sentence.slice(0, f0.sentence.indexOf(first.raw));
    const mid = f0.sentence.slice(f0.sentence.indexOf(first.raw) + first.raw.length, f0.sentence.indexOf(second.raw));
    const post = f0.sentence.slice(f0.sentence.indexOf(second.raw) + second.raw.length);
    fill = { pre: short(pre, 70), mid: short(mid.trim(), 50), post: short(post.trim(), 40), ans: [fmt(first.value, first.unit), fmt(second.value, second.unit)], tokens: seededShuffle([fmt(first.value, first.unit), fmt(second.value, second.unit), ...distractors(first, rand).slice(0, 1), ...distractors(second, rand).slice(0, 1)], rand) };
  } else {
    fill = { pre: 'This material has fewer than two numeric facts —', mid: 'so fill-the-blank is', post: 'for it.', ans: ['not available', 'skipped'], tokens: ['not available', 'skipped'] };
  }
  return {
    qaCaption: qaSrc.length >= 3 ? 'Key numbers from the document' : 'Key terms from the document',
    qa, audioCaption: 'Supervisor briefing (synthesised from step 1)', audioLen: '0:' + String(Math.min(59, 6 + Math.round(brief.length / 14))).padStart(2, '0'),
    audioTranscript: 'All crew, this is the supervisor. Before you continue: ' + brief.toLowerCase() + '.',
    audio: audioOpts, audioCorrect: Math.max(0, audioOpts.indexOf(short(brief, 60))), cards, fill,
  };
}
