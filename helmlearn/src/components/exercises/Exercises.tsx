import { useEffect, useRef, useState } from 'react';
import type { AudioPayload, CardsPayload, Exercise, FillPayload, Lang, McqPayload, MatchPayload, Payload, PhotoPayload, ScenPayload, SeqPayload, SignPayload } from '../../data/types';
import { t as T } from '../../data/i18n';
import { estimateSeconds, speak, stopSpeaking, ttsAvailable } from '../../engine/tts';
import { mulberry32, seededShuffle } from '../../engine/rng';
import { Waveform } from '../charts/Charts';
import { Ic } from '../ui/Icons';

export interface Outcome { score: number; passed: boolean }
interface Common { lang: Lang; showHints: boolean; onDone: (o: Outcome) => void }

export function payloadFor(e: Exercise, lang: Lang): { p: Payload; enOnly: boolean } {
  const p = e.i18n[lang];
  return p ? { p, enOnly: false } : { p: e.i18n.en, enOnly: lang !== 'en' };
}

const LETTERS = ['A', 'B', 'C', 'D', 'E'];

export function Player({ exercise, lang, showHints, onDone, pin }: Common & { exercise: Exercise; pin: string }) {
  const { p, enOnly } = payloadFor(exercise, lang);
  const s = T(lang);
  const done = useRef(false);
  useEffect(() => { done.current = false; }, [exercise.id]);
  const finish = (o: Outcome) => { if (done.current) return; done.current = true; onDone(o); };
  const common = { lang, showHints, onDone: finish };
  return (
    <>
      {enOnly && <div className="pill info" style={{ alignSelf: 'flex-start' }}><Ic.spark size={10} />{s.enOnly}</div>}
      {p.type === 'mcq' && <Mcq key={exercise.id} d={p.data} {...common} />}
      {p.type === 'scen' && <Scenario key={exercise.id} d={p.data} {...common} />}
      {p.type === 'seq' && <Sequence key={exercise.id} d={p.data} seed={exercise.id} {...common} />}
      {p.type === 'audio' && <Audio key={exercise.id} d={p.data} {...common} />}
      {p.type === 'photo' && <PhotoCheck key={exercise.id} d={p.data} {...common} />}
      {p.type === 'match' && <MatchTerms key={exercise.id} d={p.data} seed={exercise.id} {...common} />}
      {p.type === 'sign' && <SignOff key={exercise.id} d={p.data} pin={pin} {...common} />}
      {p.type === 'cards' && <Cards key={exercise.id} d={p.data} {...common} />}
      {p.type === 'fill' && <Fill key={exercise.id} d={p.data} {...common} />}
    </>
  );
}

export function Cards({ d, showHints, onDone }: Common & { d: CardsPayload }) {
  const [i, setI] = useState(0);
  const [back, setBack] = useState(false);
  const [known, setKnown] = useState<('yes' | 'no')[]>([]);
  const total = d.cards.length;
  const finished = known.length === total;
  const got = known.filter((k) => k === 'yes').length;
  const mark = (v: 'yes' | 'no') => {
    const next = [...known, v];
    setKnown(next);
    if (next.length === total) {
      const score = Math.round((next.filter((k) => k === 'yes').length / total) * 100);
      onDone({ score, passed: score >= 60 });
    } else { setBack(false); setI(i + 1); }
  };
  const card = d.cards[Math.min(i, total - 1)];
  return (
    <>
      <div className="q">{d.title}</div>
      {showHints && !finished && <div className="hint">{d.hint}</div>}
      <div style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }} data-testid="cards-progress">Card {Math.min(i + 1, total)} of {total} · {got} known</div>
      {!finished && (
        <div className={'fcard' + (back ? ' back' : '')} style={{ minHeight: 170 }} data-testid="flashcard" data-face={back ? 'back' : 'front'}>
          <div className="fcard-inner">
            <button className="fcard-face front" onClick={() => setBack(true)} data-testid="flashcard-front">
              <span className="fcard-tag">Term</span>
              <b className="fcard-term">{card[0]}</b>
              <span className="fcard-hint"><Ic.refresh size={12} />Tap to reveal</span>
            </button>
            <div className="fcard-face rear">
              <span className="fcard-tag">Meaning</span>
              <b className="fcard-meaning">{card[1]}</b>
              <span className="fcard-actions">
                <button className="btn sm" onClick={() => mark('no')} data-testid="flashcard-missed">Missed it</button>
                <button className="btn primary sm" onClick={() => mark('yes')} data-testid="flashcard-known"><Ic.check size={12} stroke="#fff" />Got it</button>
              </span>
            </div>
          </div>
        </div>
      )}
      {finished && (
        <>
          <div className={'fb ' + (got === total ? 'ok' : got >= Math.ceil(total * 0.6) ? 'ok' : 'no')} data-testid="feedback">{got === total ? d.done : got + ' of ' + total + ' recalled — review the ' + (total - got) + ' you missed.'}</div>
          <div className="stack">
            {d.cards.map((c, k) => <div key={k} className={'chk' + (known[k] === 'yes' ? ' on' : '')} style={{ cursor: 'default' }}><span className={'box' + (known[k] === 'yes' ? ' on' : '')}>{known[k] === 'yes' && <Ic.check stroke="#fff" />}</span><span><b>{c[0]}</b> — {c[1]}</span></div>)}
          </div>
        </>
      )}
    </>
  );
}

export function Fill({ d, lang, showHints, onDone }: Common & { d: FillPayload }) {
  const s = T(lang);
  const [fill, setFill] = useState<[string | null, string | null]>([null, null]);
  const complete = fill[0] !== null && fill[1] !== null;
  const ok = complete && fill[0] === d.ans[0] && fill[1] === d.ans[1];
  const cls = (i: 0 | 1) => 'blank' + (fill[i] ? (complete ? (fill[i] === d.ans[i] ? ' filled' : ' wrong') : ' filled') : '');
  const place = (tok: string) => {
    if (complete || fill.includes(tok)) return;
    const next: [string | null, string | null] = fill[0] === null ? [tok, fill[1]] : [fill[0], tok];
    setFill(next);
    if (next[0] !== null && next[1] !== null) onDone({ score: next[0] === d.ans[0] && next[1] === d.ans[1] ? 100 : (next[0] === d.ans[0] || next[1] === d.ans[1]) ? 50 : 0, passed: next[0] === d.ans[0] && next[1] === d.ans[1] });
  };
  return (
    <>
      <div className="q">{d.title}</div>
      {showHints && <div className="hint">{d.hint}</div>}
      <div style={{ fontSize: 13.5, lineHeight: 2.1 }} data-testid="fill-sentence">{d.pre} <span className={cls(0)}>{fill[0] || '……'}</span> {d.mid} <span className={cls(1)}>{fill[1] || '……'}</span> {d.post}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {d.tokens.map((tok) => <button key={tok} className={'tok' + (fill.includes(tok) ? ' used' : '')} onClick={() => place(tok)} data-testid="token">{tok}</button>)}
      </div>
      {complete && <div className={'fb ' + (ok ? 'ok' : 'no')} data-testid="feedback">{ok ? d.ok : d.no}</div>}
      {complete && !ok && <button className="btn" onClick={() => setFill([null, null])}>{s.retry}</button>}
    </>
  );
}

function Options({ opts, picked, correct, onPick }: { opts: string[]; picked: number | null; correct: number; onPick: (i: number) => void }) {
  return (
    <>
      {opts.map((o, i) => {
        let cls = 'opt';
        if (picked !== null) { if (i === correct) cls += ' right'; else if (i === picked) cls += ' wrong'; }
        return <button key={i} className={cls} onClick={() => picked === null && onPick(i)} data-testid="option"><span className="letter">{LETTERS[i]}</span><span>{o}</span></button>;
      })}
    </>
  );
}

export function Mcq({ d, showHints, onDone }: Common & { d: McqPayload }) {
  const [picked, setPicked] = useState<number | null>(null);
  const pick = (i: number) => { setPicked(i); onDone({ score: i === d.correct ? 100 : 0, passed: i === d.correct }); };
  return (
    <>
      <div className="q">{d.q}</div>
      {showHints && <div className="hint">{d.hint}</div>}
      <Options opts={d.opts} picked={picked} correct={d.correct} onPick={pick} />
      {picked !== null && <div className={'fb ' + (picked === d.correct ? 'ok' : 'no')} data-testid="feedback">{picked === d.correct ? d.ok : d.no}</div>}
    </>
  );
}

export function Scenario({ d, onDone }: Common & { d: ScenPayload }) {
  const [picked, setPicked] = useState<number | null>(null);
  const pick = (i: number) => { setPicked(i); onDone({ score: i === d.correct ? 100 : 0, passed: i === d.correct }); };
  return (
    <>
      <div style={{ padding: 12, borderRadius: 14, background: 'var(--amber-l)', border: '1px solid #f6dfae', fontSize: 13.5, lineHeight: 1.45, color: '#5a3d06' }}>{d.title}</div>
      <Options opts={d.opts} picked={picked} correct={d.correct} onPick={pick} />
      {picked !== null && <div className={'fb ' + (picked === d.correct ? 'ok' : 'no')} data-testid="feedback">{picked === d.correct ? d.ok : d.no}</div>}
    </>
  );
}

export function Sequence({ d, seed, lang, showHints, onDone }: Common & { d: SeqPayload; seed: string }) {
  const s = T(lang);
  const order = seededShuffle(d.items.map((_, i) => i), mulberry32(seed.length * 7919 + seed.charCodeAt(0)));
  const [seq, setSeq] = useState<number[]>([]);
  const doneAll = seq.length === d.items.length;
  const ok = doneAll && seq.every((v, i) => v === i);
  useEffect(() => { if (doneAll) onDone({ score: ok ? 100 : 0, passed: ok }); }, [doneAll]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="q">{d.title}</div>
      {showHints && <div className="hint">{d.hint || s.seqHint}</div>}
      {order.map((idx) => {
        const pos = seq.indexOf(idx);
        return (
          <button key={idx} className={'opt' + (pos >= 0 ? ' on' : '')} onClick={() => { if (pos < 0 && !doneAll) setSeq([...seq, idx]); }} data-testid="seq-card">
            <span className="numb">{pos >= 0 ? pos + 1 : '·'}</span><span>{d.items[idx]}</span>
          </button>
        );
      })}
      {doneAll && <div className={'fb ' + (ok ? 'ok' : 'no')} data-testid="feedback">{ok ? d.ok : d.no}</div>}
      {doneAll && !ok && <button className="btn" onClick={() => setSeq([])}>{s.retry}</button>}
    </>
  );
}

export function Audio({ d, lang, showHints, onDone }: Common & { d: AudioPayload }) {
  const s = T(lang);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const total = estimateSeconds(d.transcript);
  const stop = () => { stopSpeaking(); setPlaying(false); if (timer.current) window.clearInterval(timer.current); timer.current = null; };
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => {
    if (playing) { stop(); return; }
    setPlaying(true); setProgress(0);
    const started = Date.now();
    timer.current = window.setInterval(() => setProgress(Math.min(1, (Date.now() - started) / (total * 1000))), 200);
    speak(d.transcript, lang, () => { stop(); setProgress(1); });
  };
  const pick = (i: number) => { setPicked(i); onDone({ score: i === d.correct ? 100 : 0, passed: i === d.correct }); };
  const mmss = (sec: number) => Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0');
  return (
    <>
      <div className="q">{d.title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{d.body}</div>
      <div className="audiobox">
        <button className="play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} data-testid="play">{playing ? <Ic.pause size={16} /> : <Ic.play size={16} />}</button>
        <Waveform playing={playing} progress={progress} width={230} bars={28} />
        <span style={{ fontSize: 11, color: '#c9d6ea', fontWeight: 600, whiteSpace: 'nowrap' }}>{mmss(progress * total)} / {mmss(total)}</span>
      </div>
      {!ttsAvailable() && <div className="fb no">{s.noTts}</div>}
      {showHints && <div className="hint">{d.hint}</div>}
      <Options opts={d.opts} picked={picked} correct={d.correct} onPick={pick} />
      {picked !== null && (
        <>
          <div className={'fb ' + (picked === d.correct ? 'ok' : 'no')} data-testid="feedback">{picked === d.correct ? d.ok : d.no}</div>
          <div style={{ fontSize: 11.5, color: 'var(--ink2)', lineHeight: 1.45, padding: '8px 10px', borderRadius: 10, background: '#f7f9fd', border: '1px solid var(--line)' }}><b>{s.transcript}</b> “{d.transcript}”</div>
        </>
      )}
    </>
  );
}

export async function checkPhoto(file: File): Promise<{ ok: boolean; reason: string; url: string }> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error('not-image')); img.src = url; }).catch(() => null);
  if (!img.width) return { ok: false, reason: 'That file is not an image the browser can read.', url };
  if (img.width < 160 || img.height < 160) return { ok: false, reason: 'Image is too small (' + img.width + '×' + img.height + ') — take a full photo.', url };
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const ctx = c.getContext('2d');
  if (!ctx) return { ok: true, reason: 'Image received.', url };
  ctx.drawImage(img, 0, 0, 32, 32);
  const px = ctx.getImageData(0, 0, 32, 32).data;
  let sum = 0, sq = 0;
  for (let i = 0; i < px.length; i += 4) { const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]; sum += l; sq += l * l; }
  const n = px.length / 4;
  const sd = Math.sqrt(sq / n - (sum / n) ** 2);
  if (sd < 6) return { ok: false, reason: 'The photo looks blank or covered (no detail found). Try again with the equipment in frame.', url };
  return { ok: true, reason: 'Check passed: ' + img.width + '×' + img.height + ' image with visible detail.', url };
}

export function PhotoCheck({ d, lang, onDone }: Common & { d: PhotoPayload }) {
  const s = T(lang);
  const [result, setResult] = useState<{ ok: boolean; reason: string; url: string } | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const r = await checkPhoto(f);
    setResult(r);
    if (r.ok) onDone({ score: 100, passed: true });
  };
  return (
    <>
      <div className="q">{d.title}</div>
      <div style={{ fontSize: 13, color: 'var(--ink2)', lineHeight: 1.45 }}>{d.body}</div>
      <div className={'photo-frame' + (result?.ok ? ' ok' : '')}>{result ? <img src={result.url} alt="Captured" /> : <Ic.camera />}</div>
      {result && <div className={'fb ' + (result.ok ? 'ok' : 'no')} data-testid="feedback">{result.ok ? d.done + ' ' + result.reason : result.reason}</div>}
      <input ref={input} type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files?.[0])} data-testid="photo-input" />
      <button className="btn primary full" onClick={() => input.current?.click()}>{result ? s.retry : d.btn}</button>
    </>
  );
}

export function MatchTerms({ d, seed, lang, showHints, onDone }: Common & { d: MatchPayload; seed: string }) {
  const s = T(lang);
  const defOrder = seededShuffle(d.pairs.map((_, i) => i), mulberry32(seed.length * 31 + 7));
  const [pick, setPick] = useState<number | null>(null);
  const [matched, setMatched] = useState<number[]>([]);
  const [misses, setMisses] = useState(0);
  const all = matched.length === d.pairs.length;
  useEffect(() => { if (all) onDone({ score: Math.max(40, 100 - misses * 20), passed: true }); }, [all]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="q">{d.title}</div>
      {showHints && <div className="hint">{d.hint || s.matchHint}</div>}
      <div className="grid2">
        <div className="stack">
          {d.pairs.map((p, i) => <button key={i} className={'qa' + (matched.includes(i) ? ' done' : pick === i ? ' on' : '')} onClick={() => !matched.includes(i) && setPick(i)} data-testid="term">{p[0]}</button>)}
        </div>
        <div className="stack">
          {defOrder.map((i) => <button key={i} className={'qa' + (matched.includes(i) ? ' done' : '')} onClick={() => { if (matched.includes(i) || pick === null) return; if (pick === i) { setMatched([...matched, i]); setPick(null); } else { setMisses(misses + 1); setPick(null); } }} data-testid="def">{d.pairs[i][1]}</button>)}
        </div>
      </div>
      {all && <div className="fb ok" data-testid="feedback">{d.done || s.allMatched}{misses ? ' (' + misses + ' miss' + (misses > 1 ? 'es' : '') + ')' : ''}</div>}
    </>
  );
}

export function SignOff({ d, pin, lang, onDone }: Common & { d: SignPayload; pin: string }) {
  const s = T(lang);
  const [checks, setChecks] = useState<boolean[]>(d.items.map(() => false));
  const [entered, setEntered] = useState('');
  const [state, setState] = useState<'idle' | 'wrong' | 'signed'>('idle');
  const ready = checks.every(Boolean);
  const submit = () => {
    if (entered === pin) { setState('signed'); onDone({ score: 100, passed: true }); }
    else setState('wrong');
  };
  return (
    <>
      <div className="q">{d.title}</div>
      <div style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{d.body}</div>
      {d.items.map((it, i) => (
        <button key={i} className={'chk' + (checks[i] ? ' on' : '')} onClick={() => { const c = checks.slice(); c[i] = !c[i]; setChecks(c); }} data-testid="check">
          <span className={'box' + (checks[i] ? ' on' : '')}>{checks[i] && <Ic.check stroke="#fff" />}</span><span>{it}</span>
        </button>
      ))}
      <label htmlFor="pin-entry" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>{d.pin || s.pin}</label>
      <div style={{ display: 'flex', gap: 8 }}>
        <input id="pin-entry" className="input" style={{ letterSpacing: '.3em', fontSize: 16 }} placeholder="••••" inputMode="numeric" value={entered} onChange={(e) => { setEntered(e.target.value.replace(/\D/g, '').slice(0, 6)); setState('idle'); }} disabled={!ready || state === 'signed'} data-testid="pin-entry" />
        <button className="btn primary" disabled={!ready || entered.length < 4 || state === 'signed'} onClick={submit} data-testid="sign-submit">{s.signed.split(' ')[0]}</button>
      </div>
      {ready && state === 'idle' && <div className="fb ok">{d.ready || s.signReady}</div>}
      {state === 'wrong' && <div className="fb no" data-testid="feedback">{s.signWrong}</div>}
      {state === 'signed' && <div className="fb ok" data-testid="feedback">{s.signed}</div>}
    </>
  );
}
