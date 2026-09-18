import { useEffect, useRef, useState } from 'react';
import type { Widgets } from '../../data/types';
import { estimateSeconds, speak, stopSpeaking, ttsAvailable } from '../../engine/tts';
import { Waveform } from '../charts/Charts';
import { Ic } from '../ui/Icons';
import { celebrate } from '../../fx/celebrate';

const LETTERS = ['A', 'B', 'C'];

export function QaMatch({ w }: { w: Widgets }) {
  const order = [2, 0, 1].filter((i) => i < w.qa.length);
  const [pick, setPick] = useState<number | null>(null);
  const [done, setDone] = useState<number[]>([]);
  const [wrong, setWrong] = useState<number | null>(null);
  useEffect(() => { setPick(null); setDone([]); setWrong(null); }, [w]);
  return (
    <div className="card" style={{ padding: '16px 18px' }} data-testid="widget-qa">
      <div className="row-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="type"><Ic.match size={12} />Q&amp;A match</span><span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{w.qaCaption}</span></div>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-t)' }} data-testid="qa-count">{done.length} / {w.qa.length}</span>
      </div>
      <div className="grid2" style={{ marginTop: 12 }}>
        <div className="stack">{w.qa.map((p, i) => <button key={i} className={'qa' + (done.includes(i) ? ' done' : pick === i ? ' on' : '')} onClick={() => !done.includes(i) && setPick(i)} data-testid="qa-q">{p[0]}</button>)}</div>
        <div className="stack">{order.map((i) => <button key={i} className={'qa' + (done.includes(i) ? ' done' : wrong === i ? ' wrong' : '')} onClick={(e) => { if (done.includes(i) || pick === null) return; if (pick === i) { const next = [...done, i]; setDone(next); setPick(null); setWrong(null); celebrate(e.currentTarget, { count: next.length === w.qa.length ? 80 : 28, power: next.length === w.qa.length ? 1000 : 600 }); } else { setWrong(i); setTimeout(() => setWrong(null), 600); } }} data-testid="qa-a">{w.qa[i][1]}</button>)}</div>
      </div>
    </div>
  );
}

export function AudioWidget({ w }: { w: Widgets }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const timer = useRef<number | null>(null);
  const total = estimateSeconds(w.audioTranscript);
  const stop = () => { stopSpeaking(); setPlaying(false); if (timer.current) window.clearInterval(timer.current); timer.current = null; };
  useEffect(() => { setPicked(null); setProgress(0); stop(); }, [w]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => stop(), []); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = () => {
    if (playing) { stop(); return; }
    setPlaying(true); setProgress(0);
    const started = Date.now();
    timer.current = window.setInterval(() => setProgress(Math.min(1, (Date.now() - started) / (total * 1000))), 200);
    speak(w.audioTranscript, 'en', () => { stop(); setProgress(1); });
  };
  const mmss = (sec: number) => Math.floor(sec / 60) + ':' + String(Math.round(sec % 60)).padStart(2, '0');
  return (
    <div className="card" style={{ padding: '16px 18px' }} data-testid="widget-audio">
      <div className="row-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="type"><Ic.audio size={12} />Audio · listen &amp; answer</span><span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>{w.audioCaption}</span></div>
        <span style={{ fontSize: 11.5, color: 'var(--muted)', fontWeight: 600 }}>{mmss(progress * total)} / {mmss(total)}</span>
      </div>
      <div className="audiobox" style={{ marginTop: 12 }}>
        <button className="play" onClick={toggle} aria-label={playing ? 'Pause' : 'Play'} data-testid="widget-play">{playing ? <Ic.pause /> : <Ic.play />}</button>
        <Waveform playing={playing} progress={progress} />
      </div>
      {!ttsAvailable() && <div className="fb no" style={{ marginTop: 10 }}>Audio playback is not available on this device — transcript: “{w.audioTranscript}”</div>}
      <div className="grid3" style={{ marginTop: 12 }}>
        {w.audio.map((o, i) => {
          let cls = 'opt';
          if (picked !== null) { if (i === w.audioCorrect) cls += ' right'; else if (i === picked) cls += ' wrong'; }
          return <button key={i} className={cls} style={{ fontSize: 12.5, padding: '8px 12px', minHeight: 40 }} onClick={(e) => { if (picked !== null) return; setPicked(i); if (i === w.audioCorrect) celebrate(e.currentTarget, { count: 40, power: 750 }); }} data-testid="widget-audio-opt"><span className="letter" style={{ width: 22, height: 22 }}>{LETTERS[i]}</span><span>{o}</span></button>;
        })}
      </div>
      {picked !== null && <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 10, lineHeight: 1.45 }}><b>Transcript:</b> “{w.audioTranscript}”</div>}
    </div>
  );
}

const SAMPLE_CARDS: [string, string][] = [['Permit to work', 'Written authorisation for hazardous work'], ['Muster station', 'Where you report when the alarm sounds'], ['SWL', 'Safe working load marked on lifting gear']];

export function Flashcards({ w }: { w: Widgets }) {
  const [flipped, setFlipped] = useState<number[]>([]);
  const [known, setKnown] = useState<Record<number, 'yes' | 'no'>>({});
  useEffect(() => { setFlipped([]); setKnown({}); }, [w]);
  const sample = w.cards.length === 0;
  const cards = sample ? SAMPLE_CARDS : w.cards;
  const knownCount = Object.values(known).filter((v) => v === 'yes').length;
  const done = Object.keys(known).length === cards.length && cards.length > 0;
  const mark = (i: number, v: 'yes' | 'no', el: HTMLElement) => {
    const next = { ...known, [i]: v };
    setKnown(next);
    if (v === 'yes') celebrate(el, { count: 36, power: 700 });
    if (Object.keys(next).length === cards.length && Object.values(next).every((x) => x === 'yes')) setTimeout(() => celebrate(el.closest('[data-testid="widget-cards"]') as HTMLElement, { count: 90, power: 1100 }), 250);
  };
  return (
    <div className="card" style={{ padding: '16px 18px' }} data-testid="widget-cards">
      <div className="row-between">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="type"><Ic.cards />Flashcards</span><span style={{ fontSize: 12.5, color: 'var(--ink2)' }}>Read the term, recall the meaning, then flip to check</span></div>
        <span style={{ fontSize: 12, fontWeight: 700, color: knownCount === cards.length ? 'var(--green-t)' : 'var(--ink2)' }} data-testid="cards-known">{knownCount} / {cards.length} known</span>
      </div>
      {sample && <div className="fb no" style={{ marginTop: 10, fontSize: 11.5 }} data-testid="cards-sample-note">No term definitions were found in this material — showing sample cards so you can see the format. Add a "Term: definition" list to the document, or use DeepSeek, to get real ones.</div>}
      <div className="grid3" style={{ marginTop: 12, gap: 12 }}>
        {cards.map((c, i) => {
          const back = flipped.includes(i);
          const k = known[i];
          return (
            <div key={i} className={'fcard' + (back ? ' back' : '') + (k === 'yes' ? ' known' : k === 'no' ? ' missed' : '')} data-testid="flashcard" data-face={back ? 'back' : 'front'}>
              <div className="fcard-inner">
                <button className="fcard-face front" onClick={() => setFlipped([...flipped, i])} data-testid="flashcard-front">
                  <span className="fcard-tag">Term {i + 1}</span>
                  <b className="fcard-term">{c[0]}</b>
                  <span className="fcard-hint"><Ic.refresh size={12} />Tap to reveal the meaning</span>
                </button>
                <div className="fcard-face rear">
                  <span className="fcard-tag">Meaning</span>
                  <b className="fcard-meaning">{c[1]}</b>
                  {k ? (
                    <span className={'pill ' + (k === 'yes' ? 'ok' : 'risk')} data-testid="flashcard-result">{k === 'yes' ? <><Ic.check size={11} />Got it</> : 'Review again'}</span>
                  ) : (
                    <span className="fcard-actions">
                      <button className="btn sm" onClick={(e) => mark(i, 'no', e.currentTarget)} data-testid="flashcard-missed">Missed it</button>
                      <button className="btn primary sm" onClick={(e) => mark(i, 'yes', e.currentTarget)} data-testid="flashcard-known"><Ic.check size={12} stroke="#fff" />Got it</button>
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {done && (
        <div className="row-between" style={{ marginTop: 12 }}>
          <div className={'fb ' + (knownCount === cards.length ? 'ok' : 'no')} style={{ flexGrow: 1 }} data-testid="cards-summary">{knownCount === cards.length ? 'All ' + cards.length + ' terms recalled — nice work.' : (cards.length - knownCount) + ' term' + (cards.length - knownCount === 1 ? '' : 's') + ' to review again before the next session.'}</div>
          <button className="btn sm" style={{ marginLeft: 10 }} onClick={() => { setFlipped([]); setKnown({}); }}>Go again</button>
        </div>
      )}
    </div>
  );
}

export function FillBlank({ w }: { w: Widgets }) {
  const [fill, setFill] = useState<[string | null, string | null]>([null, null]);
  useEffect(() => setFill([null, null]), [w]);
  const cls = (i: 0 | 1) => 'blank' + (fill[i] ? (fill[i] === w.fill.ans[i] ? ' filled' : ' wrong') : '');
  const done = (fill[0] === w.fill.ans[0] ? 1 : 0) + (fill[1] === w.fill.ans[1] ? 1 : 0);
  const place = (tok: string, el: HTMLElement) => {
    if (fill.includes(tok)) return;
    const next: [string | null, string | null] = fill[0] === null ? [tok, fill[1]] : fill[1] === null ? [fill[0], tok] : fill;
    setFill(next);
    if (next[0] === w.fill.ans[0] && next[1] === w.fill.ans[1]) celebrate(el.closest('[data-testid="widget-fill"]') as HTMLElement, { count: 70, power: 950 });
  };
  return (
    <div className="card" style={{ padding: '16px 18px' }} data-testid="widget-fill">
      <div className="row-between"><span className="type"><Ic.lines />Fill the blank</span><span style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-t)' }} data-testid="fill-count">{done} / 2</span></div>
      <div style={{ marginTop: 12, fontSize: 13, lineHeight: 2 }}>{w.fill.pre} <span className={cls(0)}>{fill[0] || '……'}</span> {w.fill.mid} <span className={cls(1)}>{fill[1] || '……'}</span> {w.fill.post}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
        {w.fill.tokens.map((tok) => <button key={tok} className={'tok' + (fill.includes(tok) ? ' used' : '')} onClick={(e) => place(tok, e.currentTarget)} data-testid="token">{tok}</button>)}
        {(fill[0] || fill[1]) && <button className="tok" onClick={() => setFill([null, null])}>Clear</button>}
      </div>
    </div>
  );
}
