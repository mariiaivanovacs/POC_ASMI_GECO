import { useMemo, useState } from 'react';
import type { Exercise, Lang } from '../data/types';
import { applyListOp, buildSave, cloneData, FIELDS, fillAnsIdx, mirrorStructure, sameCounts, validate, type Data, type FieldSpec, type ListOp } from '../engine/edit';
import { LLMError, translateExercise } from '../engine/llm';
import { useStore } from '../store/useStore';
import { Ic, TYPE_LABEL } from './ui/Icons';

const LANG_LABEL: Record<Lang, string> = { en: 'English', bm: 'Bahasa Melayu', zh: '中文' };
const LEVELS: { k: Exercise['level']; label: string }[] = [{ k: 'all', label: 'All learners' }, { k: 'new', label: 'New hires only' }, { k: 'exp', label: 'Experienced only' }];

export function TaskEditor({ exercise, onClose }: { exercise: Exercise; onClose: () => void }) {
  const updateExercise = useStore((s) => s.updateExercise);
  const toast = useStore((s) => s.toast);
  const provider = useStore((s) => s.settings.provider);
  const type = exercise.type;
  const original = useMemo(() => ({ en: cloneData(exercise.i18n.en), bm: cloneData(exercise.i18n.bm), zh: cloneData(exercise.i18n.zh) }), [exercise]);
  const [title, setTitle] = useState(exercise.title);
  const [level, setLevel] = useState(exercise.level);
  const [data, setData] = useState<Partial<Record<Lang, Data>>>(() => {
    const d: Partial<Record<Lang, Data>> = {};
    for (const l of ['en', 'bm', 'zh'] as Lang[]) { const x = cloneData(exercise.i18n[l]); if (x) d[l] = x; }
    return d;
  });
  const [lang, setLang] = useState<Lang>('en');
  const [translating, setTranslating] = useState(false);
  const [translatedFrom, setTranslatedFrom] = useState<string | null>(null);
  const [showErrors, setShowErrors] = useState(false);

  const en = data.en!;
  const enChanged = JSON.stringify(en) !== JSON.stringify(original.en);
  const stale = (l: Lang) => l !== 'en' && !!data[l] && !sameCounts(type, en, data[l]!);
  // English text edited after the translations were made (and not re-translated since).
  const textOutdated = enChanged && translatedFrom !== JSON.stringify(en) && (!!data.bm || !!data.zh);
  const result = buildSave(type, { title, level, data });
  const enCheck = validate(type, en, 'en');

  const setField = (l: Lang, key: string, v: unknown) => setData((d) => {
    const next: Data = { ...d[l], [key]: v };
    // Renaming a word choice that is a fill answer renames the answer too (answers are stored as the word itself).
    if (type === 'fill' && l === 'en' && key === 'tokens') {
      const [a, b] = fillAnsIdx(d.en!);
      const ts = v as string[];
      next.ans = [a >= 0 ? ts[a] : (d.en!.ans as string[])[0], b >= 0 ? ts[b] : (d.en!.ans as string[])[1]];
    }
    return { ...d, [l]: next };
  });
  const listOp = (key: string, op: ListOp) => setData((d) => applyListOp(type, d, key, op));

  const retranslate = async () => {
    if (!enCheck.ok) { setShowErrors(true); toast('Fix the English first — it is what gets translated.', 'err'); return; }
    setTranslating(true);
    try {
      const r = await translateExercise({ ...exercise, i18n: { en: enCheck.payload! } });
      setData((d) => ({ ...d, ...(r.bm ? { bm: cloneData(r.bm) } : {}), ...(r.zh ? { zh: cloneData(r.zh) } : {}) }));
      setTranslatedFrom(JSON.stringify(en));
      toast('Translated to ' + [r.bm && 'Bahasa Melayu', r.zh && '中文'].filter(Boolean).join(' and ') + ' — check them, then save', 'ok');
    } catch (e) {
      toast(e instanceof LLMError ? e.message : 'Translation failed.', 'err');
    } finally { setTranslating(false); }
  };

  const save = () => {
    setShowErrors(true);
    if (!result.ok || !result.i18n) return;
    if (result.dropped.length) {
      const msg = result.dropped.map((x) => LANG_LABEL[x.lang] + ': ' + x.reason).join('\n');
      if (!window.confirm('These translations will be removed and learners will see English instead:\n\n' + msg + '\n\nRe-translate first, or save anyway?')) return;
    }
    const changed = updateExercise(exercise.id, { title, level, i18n: result.i18n });
    if (!changed) { toast('No changes to save', 'info'); onClose(); return; }
    toast(exercise.reviewStatus === 'draft' ? 'Task saved — still a draft' : 'Task saved — back to Draft for review (learners don’t get it until approved again)', 'ok');
    onClose();
  };

  const d = data[lang];
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal editor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Edit task" data-testid="task-editor">
        <div className="row-between">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 16 }}>Edit task</h2><span className="tchip">{TYPE_LABEL[type]}</span>
          </div>
          <button className="ib" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close"><Ic.x /></button>
        </div>
        {exercise.reviewStatus !== 'draft' && <div className="fb no" style={{ marginTop: 10 }} data-testid="editor-review-note">This task is {exercise.reviewStatus}. Saving changes sends it back to <b>Draft</b> — learners won’t get it until it is approved again.</div>}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <label style={{ flexGrow: 1 }}><span className="ed-label">Title in the task list</span><input className="input" value={title} onChange={(e) => setTitle(e.target.value)} data-testid="editor-title" /></label>
          <label style={{ width: 200 }}><span className="ed-label">Who gets this task</span>
            <select className="input" value={level} onChange={(e) => setLevel(e.target.value as Exercise['level'])} data-testid="editor-level">{LEVELS.map((x) => <option key={x.k} value={x.k}>{x.label}</option>)}</select>
          </label>
        </div>

        <div className="row-between" style={{ marginTop: 14, gap: 8, flexWrap: 'wrap' }}>
          <div className="seg" data-testid="editor-lang">
            {(['en', 'bm', 'zh'] as Lang[]).map((l) => (
              <button key={l} className={lang === l ? 'on' : ''} onClick={() => setLang(l)}>
                {LANG_LABEL[l]}{l !== 'en' && (!data[l] ? ' · missing' : stale(l) ? ' · out of date' : result.dropped.some((x) => x.lang === l) ? ' · needs translating' : '')}
              </button>
            ))}
          </div>
          <button className="btn ai sm" onClick={retranslate} disabled={translating || provider !== 'deepseek'} title={provider !== 'deepseek' ? 'Switch Settings to Qwen AI to translate' : ''} data-testid="retranslate">
            {translating ? <span className="spinner" style={{ borderColor: 'rgba(47,111,224,.3)', borderTopColor: '#2f6fe0' }} /> : <Ic.globe size={12} />}{translating ? 'Qwen is translating…' : 'Re-translate BM & 中文 from English'}
          </button>
        </div>
        {textOutdated && <div className="fb no" style={{ marginTop: 8 }} data-testid="editor-outdated">You changed the English. The Bahasa Melayu and 中文 versions still say the old thing — re-translate them before saving.</div>}

        <div className="ed-body" data-testid="editor-fields">
          {lang !== 'en' && !d && <div className="empty">No {LANG_LABEL[lang]} version yet — learners see English. Use “Re-translate from English”.</div>}
          {lang !== 'en' && d && stale(lang) && <div className="fb no">The English options/items changed, so this translation no longer lines up. Re-translate from English; if you save as is, learners see English for this task.</div>}
          {d && !stale(lang) && FIELDS[type].map((f) => <Field key={f.key} f={f} lang={lang} d={lang === 'en' ? d : mirrorStructure(type, en, d)} en={en} onSet={(k, v) => setField(lang, k, v)} onListOp={(op) => listOp(f.key, op)} />)}
          {d && !stale(lang) && type === 'fill' && <FillAnswers lang={lang} d={lang === 'en' ? d : mirrorStructure(type, en, d)} onSet={(v) => setField('en', 'ans', v)} />}
        </div>

        {showErrors && !result.ok && <div className="fb no" style={{ marginTop: 10 }} data-testid="editor-errors">{result.errors.map((e) => <div key={e}>{e}</div>)}</div>}
        {result.ok && result.dropped.length > 0 && <div style={{ fontSize: 12, color: 'var(--amber-t)', marginTop: 10 }} data-testid="editor-dropped">On save, learners will see English instead of: {result.dropped.map((x) => LANG_LABEL[x.lang] + ' (' + x.reason + ')').join('; ')}.</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 14, justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={save} disabled={translating} data-testid="editor-save">Save changes</button>
        </div>
      </div>
    </div>
  );
}

function Field({ f, lang, d, en, onSet, onListOp }: { f: FieldSpec; lang: Lang; d: Data; en: Data; onSet: (key: string, v: unknown) => void; onListOp: (op: ListOp) => void }) {
  const isEn = lang === 'en';
  const v = d[f.key];
  if (f.kind === 'text' || f.kind === 'long') {
    return (
      <label className="ed-field"><span className="ed-label">{f.label}</span>
        {f.kind === 'long'
          ? <textarea className="input" rows={2} value={String(v ?? '')} onChange={(e) => onSet(f.key, e.target.value)} data-testid={'field-' + f.key} />
          : <input className="input" value={String(v ?? '')} onChange={(e) => onSet(f.key, e.target.value)} data-testid={'field-' + f.key} />}
      </label>
    );
  }
  const xs = (Array.isArray(v) ? v : []) as unknown[];
  const enXs = (Array.isArray(en[f.key]) ? en[f.key] : []) as unknown[];
  return (
    <div className="ed-field" data-testid={'field-' + f.key}>
      <span className="ed-label">{f.label}{!isEn && ' — wording only; English sets the order' + (f.correct ? ' and the right answer' : '')}</span>
      {xs.map((x, i) => (
        <div key={i} className="ed-row">
          {f.correct && <input type="radio" name={'correct-' + lang} checked={d.correct === i} disabled={!isEn} onChange={() => onSet('correct', i)} aria-label={'Option ' + (i + 1) + ' is correct'} data-testid="correct-radio" />}
          {f.ordered && <span className="ed-n">{i + 1}</span>}
          {f.kind === 'pairs'
            ? <>
                <input className="input" value={String((x as string[])[0] ?? '')} placeholder={!isEn ? String((enXs[i] as string[])?.[0] ?? '') : 'Term'} onChange={(e) => onSet(f.key, xs.map((p, j) => (j === i ? [e.target.value, (p as string[])[1]] : p)))} />
                <span style={{ color: 'var(--muted)' }}>→</span>
                <input className="input" value={String((x as string[])[1] ?? '')} placeholder={!isEn ? String((enXs[i] as string[])?.[1] ?? '') : 'Meaning'} onChange={(e) => onSet(f.key, xs.map((p, j) => (j === i ? [(p as string[])[0], e.target.value] : p)))} />
              </>
            : <input className="input" value={String(x ?? '')} placeholder={!isEn ? String(enXs[i] ?? '') : ''} onChange={(e) => onSet(f.key, xs.map((p, j) => (j === i ? e.target.value : p)))} data-testid="list-item" />}
          {isEn && <span className="ed-tools">
            <button className="ib" onClick={() => onListOp({ kind: 'move', i, d: -1 })} disabled={i === 0} aria-label="Move up">↑</button>
            <button className="ib" onClick={() => onListOp({ kind: 'move', i, d: 1 })} disabled={i === xs.length - 1} aria-label="Move down">↓</button>
            <button className="ib" onClick={() => onListOp({ kind: 'remove', i })} disabled={xs.length <= (f.min || 1)} aria-label="Remove" data-testid="remove-item"><Ic.trash size={12} /></button>
          </span>}
        </div>
      ))}
      {isEn && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => onListOp({ kind: 'add' })} data-testid={'add-' + f.key}>+ Add</button>}
    </div>
  );
}

function FillAnswers({ lang, d, onSet }: { lang: Lang; d: Data; onSet: (v: string[]) => void }) {
  const tokens = (Array.isArray(d.tokens) ? d.tokens : []) as string[];
  const ans = (Array.isArray(d.ans) ? d.ans : ['', '']) as string[];
  const [a, b] = fillAnsIdx(d);
  if (lang !== 'en') return <div className="ed-field"><span className="ed-label">Answers (set in English)</span><div style={{ fontSize: 13 }}>Blank 1: <b>{tokens[a] ?? '—'}</b> · Blank 2: <b>{tokens[b] ?? '—'}</b></div></div>;
  return (
    <div className="ed-field" data-testid="field-ans"><span className="ed-label">Correct answers (from the word choices)</span>
      <div style={{ display: 'flex', gap: 8 }}>
        {[0, 1].map((k) => (
          <select key={k} className="input" value={ans[k] ?? ''} onChange={(e) => onSet(k === 0 ? [e.target.value, ans[1]] : [ans[0], e.target.value])} aria-label={'Blank ' + (k + 1)} data-testid={'fill-ans-' + k}>
            <option value="">Blank {k + 1}…</option>
            {tokens.filter((t) => String(t).trim()).map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        ))}
      </div>
    </div>
  );
}
