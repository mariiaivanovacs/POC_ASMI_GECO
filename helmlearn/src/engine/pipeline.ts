import type { ExType, Exercise, Lang, Material, Stage, Structure, Widgets } from '../data/types';
import { analyze } from './analyze';
import { extractText, extractUrl, ExtractError } from './extract';
import { ALL_TYPES, generate } from './generate';
import { ttsAvailable } from './tts';
import { generateWithDeepSeek, LLMError } from './llm';

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
  audio: 'Preparing audio',
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

  report({ stage: 'extracting', pct: 40 });
  await tick();
  const structure = analyze(text!, material.name.replace(/\.[a-z0-9]+$/i, ''));
  report({ stage: 'extracting', pct: 55, note: structure.steps.length + ' steps · ' + structure.hazards.length + ' hazards · ' + structure.facts.length + ' facts' });
  await tick();

  report({ stage: 'drafting', pct: 60 });
  let exercises: Exercise[] = [];
  let missing: ExType[] = [];
  let widgets: Widgets;
  let source: 'local' | 'deepseek' = 'local';
  let langs: Lang[] = ['en'];
  let note: string | null = null;
  const local = generate(material.id, structure, material.seed);
  if (opts.provider === 'deepseek' && opts.apiKey) {
    report({ stage: 'drafting', pct: 62, note: 'Asking DeepSeek to draft exercises' + (opts.translate ? ' in EN, BM and 中文' : '') });
    try {
      const r = await generateWithDeepSeek(opts.apiKey, text!, structure, material.id, opts.translate, local.widgets);
      exercises = r.exercises; widgets = r.widgets; missing = r.missing; langs = r.langs; source = 'deepseek';
      report({ stage: 'drafting', pct: 88, note: exercises.length + ' drafted by DeepSeek' });
    } catch (e) {
      const msg = e instanceof LLMError ? e.message : 'DeepSeek failed.';
      note = msg + ' Used the offline engine instead.';
      report({ stage: 'drafting', pct: 70, note: note });
      exercises = local.exercises; widgets = local.widgets; missing = local.missing;
    }
  } else {
    for (let i = 0; i < ALL_TYPES.length; i++) {
      const t = ALL_TYPES[i];
      const r = generate(material.id, structure, material.seed, t);
      exercises.push(...r.exercises);
      if (r.missing.length) missing.push(t);
      report({ stage: 'drafting', pct: 60 + Math.round(((i + 1) / ALL_TYPES.length) * 28), note: exercises.length + ' drafted' });
      await tick();
    }
    widgets = local.widgets;
    if (opts.provider === 'deepseek' && !opts.apiKey) note = 'DeepSeek selected but no API key set — used the offline engine.';
  }
  await tick();

  report({ stage: 'audio', pct: 90, note: ttsAvailable() ? 'Speech synthesis available' : 'No speech synthesis on this device — transcripts only' });
  await tick();
  report({ stage: 'ready', pct: 100 });
  return { text: text!, pages, ext, kind, structure, exercises, widgets, missing, source, langs, note };
}
