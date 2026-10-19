import type { ExType, Exercise, Lang, Material, Stage, Structure, Widgets } from '../data/types';
import { analyze } from './analyze';
import { extractText, extractUrl, ExtractError } from './extract';
import { ALL_TYPES, generate } from './generate';
import { extractWithQwen, generateWithQwen, LLMError } from './llm';

export interface PipelineUpdate { stage: Stage; pct: number; note?: string }
export interface PipelineResult {
  text: string; pages: number; ext: string; kind: string;
  structure: Structure; exercises: Exercise[]; widgets: Widgets; missing: ExType[];
  source: 'local' | 'deepseek'; langs: Lang[]; note: string | null;
}
export interface PipelineOptions { provider: 'local' | 'deepseek'; apiKey: string; translate: boolean }

export const STAGE_LABEL: Record<Stage, string> = {
  reading: 'Reading the document',
  extracting: 'Extracting steps, hazards and PPE',
  drafting: 'Drafting exercises',
  ready: 'Ready',
};

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

export async function runPipeline(material: Material, file: File | null, report: (u: PipelineUpdate) => void, opts: PipelineOptions = { provider: 'local', apiKey: '', translate: false }): Promise<PipelineResult> {
  let text = material.text;
  let pages = material.pages;
  let ext = material.ext;
  let kind = material.kind;

  report({ stage: 'reading', pct: 0 });
  await tick();
  if (file) {
    const r = await extractText(file, (p) => report({ stage: 'reading', pct: Math.round(p * 0.35) }));
    text = r.text; pages = r.pages; ext = r.ext; kind = r.kind;
  } else if (material.sourceUrl && !text) {
    const r = await extractUrl(material.sourceUrl, (p) => report({ stage: 'reading', pct: Math.round(p * 0.35) }));
    text = r.text; pages = r.pages; ext = r.ext; kind = r.kind;
  } else if (!text) {
    throw new ExtractError('The file is no longer available (it was uploaded in a previous session). Upload it again to process.', 'empty');
  }
  report({ stage: 'reading', pct: 35, note: pages + ' page' + (pages === 1 ? '' : 's') });
  await tick();

  // Qwen calls take 10-60 s each; tick the bar and an elapsed-seconds note so the run never looks frozen.
  const waiting = async <T,>(work: Promise<T>, stage: Stage, from: number, to: number, label: string, expectSec: number): Promise<T> => {
    const started = Date.now();
    const timer = setInterval(() => {
      const sec = Math.round((Date.now() - started) / 1000);
      const pct = from + Math.round((to - from) * (1 - Math.exp(-sec / expectSec)));
      report({ stage, pct, note: label + ' · ' + sec + ' s' });
    }, 1000);
    try { return await work; } finally { clearInterval(timer); }
  };

  report({ stage: 'extracting', pct: 38 });
  await tick();
  let structure = analyze(text!, material.name.replace(/\.[a-z0-9]+$/i, ''));
  let note: string | null = null;
  if (opts.provider === 'deepseek') {
    try {
      structure = await waiting(extractWithQwen(text!, structure), 'extracting', 38, 52, 'Qwen is reading the procedure', 12);
    } catch (e) {
      note = (e instanceof LLMError ? e.message : 'Qwen extraction failed.') + ' Steps and hazards come from the offline analyzer.';
    }
  }
  report({ stage: 'extracting', pct: 55, note: structure.steps.length + ' steps · ' + structure.hazards.length + ' hazards · ' + structure.ppe.length + ' PPE items' });
  await tick();

  report({ stage: 'drafting', pct: 58 });
  let exercises: Exercise[] = [];
  let missing: ExType[] = [];
  let widgets: Widgets;
  let source: 'local' | 'deepseek' = 'local';
  let langs: Lang[] = ['en'];
  const local = generate(material.id, structure, material.seed);
  if (opts.provider === 'deepseek') {
    let phase = 'Qwen is drafting tasks in English';
    let from = 58, to = 80, expect = 25;
    const onDrafted = (n: number) => {
      if (!opts.translate) return;
      phase = n + ' tasks drafted · translating to Bahasa Melayu and 中文';
      from = 80; to = 97; expect = 30;
    };
    const started = Date.now();
    let phaseStart = started;
    let lastPhase = phase;
    const timer = setInterval(() => {
      if (phase !== lastPhase) { lastPhase = phase; phaseStart = Date.now(); }
      const sec = Math.round((Date.now() - started) / 1000);
      const inPhase = (Date.now() - phaseStart) / 1000;
      report({ stage: 'drafting', pct: from + Math.round((to - from) * (1 - Math.exp(-inPhase / expect))), note: phase + ' · ' + sec + ' s' });
    }, 1000);
    try {
      const r = await generateWithQwen(opts.apiKey, text!, structure, material.id, opts.translate, local.widgets, onDrafted);
      exercises = r.exercises; widgets = r.widgets; missing = r.missing; langs = r.langs; source = 'deepseek';
      if (opts.translate && langs.length < 3) note = (note ? note + ' ' : '') + 'Translation to ' + (['bm', 'zh'] as Lang[]).filter((l) => !langs.includes(l)).map((l) => (l === 'bm' ? 'Bahasa Melayu' : '中文')).join(' and ') + ' failed — those tasks show in English.';
      report({ stage: 'drafting', pct: 98, note: exercises.length + ' tasks drafted by Qwen' });
    } catch (e) {
      const msg = e instanceof LLMError ? e.message : 'Qwen failed.';
      note = (note ? note + ' ' : '') + msg + ' Used the offline engine instead.';
      report({ stage: 'drafting', pct: 90, note });
      exercises = local.exercises; widgets = local.widgets; missing = local.missing;
    } finally {
      clearInterval(timer);
    }
  } else {
    for (let i = 0; i < ALL_TYPES.length; i++) {
      const t = ALL_TYPES[i];
      const r = generate(material.id, structure, material.seed, t);
      exercises.push(...r.exercises);
      if (r.missing.length) missing.push(t);
      report({ stage: 'drafting', pct: 58 + Math.round(((i + 1) / ALL_TYPES.length) * 40), note: exercises.length + ' drafted' });
      await tick();
    }
    widgets = local.widgets;
  }
  await tick();

  report({ stage: 'ready', pct: 100 });
  return { text: text!, pages, ext, kind, structure, exercises, widgets, missing, source, langs, note };
}
