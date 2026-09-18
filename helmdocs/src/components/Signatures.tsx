import { useEffect, useRef, useState } from 'react';
import type { Signature } from '../data/types';
import { loadSignatureImage, trimCanvas, typedSignature } from '../engine/signature';
import { useStore } from '../store/useStore';
import { Ic } from './ui/Icons';

/** "My signatures" — the stored handwritten signatures, one default. */
export function SignatureLibrary({ onUse, compact = false }: { onUse?: (s: Signature) => void; compact?: boolean }) {
  const signatures = useStore((s) => s.settings.signatures);
  const deleteSignature = useStore((s) => s.deleteSignature);
  const setDefault = useStore((s) => s.setDefaultSignature);
  const [adding, setAdding] = useState(signatures.length === 0);
  return (
    <div data-testid="signature-library">
      {signatures.length === 0 && !adding && <div className="empty" style={{ padding: 14, fontSize: 12.5 }}>No signatures yet.</div>}
      <div className={compact ? 'stack' : 'grid2'} style={{ gap: 8 }}>
        {signatures.map((s) => (
          <div key={s.id} className="sigcard" data-testid="signature-card" data-default={s.isDefault}>
            <div className="sigpreview"><img src={s.png} alt={'Signature of ' + s.owner} /></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6, minWidth: 0 }}>
              <b style={{ fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flexGrow: 1 }}>{s.owner}</b>
              {s.isDefault && <span className="fr" style={{ background: 'var(--green-l)', color: 'var(--green-t)' }}>default</span>}
              <span className="fr">{s.kind === 'draw' ? 'drawn' : s.kind === 'upload' ? 'uploaded' : 'typed'}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
              {onUse && <button className="btn sm primary" onClick={() => onUse(s)} data-testid="signature-use"><Ic.pen size={12} />Use</button>}
              {!s.isDefault && <button className="btn sm" onClick={() => setDefault(s.id)} data-testid="signature-default">Set default</button>}
              <button className="btn sm danger" onClick={() => deleteSignature(s.id)} aria-label={'Delete signature of ' + s.owner} data-testid="signature-delete"><Ic.trash size={12} /></button>
            </div>
          </div>
        ))}
      </div>
      {adding ? <AddSignature onDone={() => setAdding(false)} onCancel={signatures.length ? () => setAdding(false) : undefined} /> : (
        <button className="btn" style={{ marginTop: 10 }} onClick={() => setAdding(true)} data-testid="signature-add">+ Add signature</button>
      )}
    </div>
  );
}

/** Draw / Upload / Type a signature and store it as a transparent PNG. */
export function AddSignature({ onDone, onCancel }: { onDone: (s: Signature) => void; onCancel?: () => void }) {
  const signatories = useStore((s) => s.settings.signatories);
  const addSignature = useStore((s) => s.addSignature);
  const toast = useStore((s) => s.toast);
  const [tab, setTab] = useState<'draw' | 'upload' | 'type'>('draw');
  const [owner, setOwner] = useState(signatories[0] || '');
  const [typed, setTyped] = useState('');
  const [removeWhite, setRemoveWhite] = useState(true);
  const [asDefault, setAsDefault] = useState(true);
  const [upload, setUpload] = useState<string | null>(null);
  const [strokes, setStrokes] = useState(0);
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { if (!typed && owner) setTyped(owner.split(',')[0]); }, [owner, typed]);

  const pos = (e: React.PointerEvent<HTMLCanvasElement>) => { const r = canvas.current!.getBoundingClientRect(); return { x: (e.clientX - r.left) * (canvas.current!.width / r.width), y: (e.clientY - r.top) * (canvas.current!.height / r.height) }; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { drawing.current = true; const ctx = canvas.current!.getContext('2d')!; const p = pos(e); ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1e2b45'; ctx.beginPath(); ctx.moveTo(p.x, p.y); canvas.current!.setPointerCapture(e.pointerId); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const ctx = canvas.current!.getContext('2d')!; const p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const up = () => { if (drawing.current) { drawing.current = false; setStrokes((n) => n + 1); } };
  const clear = () => { const c = canvas.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); setStrokes(0); };

  const save = () => {
    const who = owner.trim();
    if (!who) { toast('Whose signature is this? Pick a signatory.', 'err'); return; }
    try {
      let png: string;
      if (tab === 'draw') { if (!strokes) { toast('Draw your signature first.', 'err'); return; } png = trimCanvas(canvas.current!).toDataURL('image/png'); }
      else if (tab === 'upload') { if (!upload) { toast('Choose an image first.', 'err'); return; } png = upload; }
      else { if (!typed.trim()) { toast('Type the name to sign with.', 'err'); return; } png = typedSignature(typed.trim()); }
      const s = addSignature({ owner: who, kind: tab, png, isDefault: asDefault });
      toast('Signature saved for ' + who + (s.isDefault ? ' (default)' : ''), 'ok');
      onDone(s);
    } catch (e) { toast(e instanceof Error ? e.message : 'Could not save the signature', 'err'); }
  };

  return (
    <div className="card" style={{ padding: 14, marginTop: 10, boxShadow: 'none' }} data-testid="add-signature">
      <div className="row-between">
        <div className="card-h">Add signature</div>
        <div className="seg" data-testid="signature-tabs">
          {(['draw', 'upload', 'type'] as const).map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)} data-testid={'signature-tab-' + t}>{t === 'draw' ? 'Draw' : t === 'upload' ? 'Upload' : 'Type'}</button>)}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <label className="lbl" htmlFor="sig-owner">Signatory</label>
        <select id="sig-owner" className="input" value={owner} onChange={(e) => setOwner(e.target.value)} data-testid="signature-owner">
          {signatories.map((s) => <option key={s} value={s}>{s}</option>)}
          {!signatories.length && <option value="">No authorised signatories — add one above</option>}
        </select>
      </div>
      {tab === 'draw' && (
        <div style={{ marginTop: 10 }}>
          <canvas ref={canvas} width={560} height={180} className="sigpad" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} aria-label="Draw your signature" data-testid="signature-pad" />
          <div className="row-between" style={{ marginTop: 6 }}><span style={{ fontSize: 11.5, color: 'var(--muted)' }}>{strokes ? strokes + ' stroke' + (strokes === 1 ? '' : 's') : 'Draw with the mouse, trackpad or pen'}</span><button className="btn sm" onClick={clear} data-testid="signature-clear">Clear</button></div>
        </div>
      )}
      {tab === 'upload' && (
        <div style={{ marginTop: 10 }}>
          <div className="dropzone" style={{ padding: '10px 12px', borderRadius: 12 }} onClick={() => fileInput.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && fileInput.current?.click()}
            onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) loadSignatureImage(f, removeWhite).then(setUpload).catch((err) => toast(err.message, 'err')); }}>
            <Ic.upload size={16} /><span style={{ fontSize: 12.5, flexGrow: 1 }}>{upload ? 'Image ready — choose another to replace it' : 'Drop a PNG / JPEG of your signature or click to choose'}</span>
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) loadSignatureImage(f, removeWhite).then(setUpload).catch((err) => toast(err.message, 'err')); e.target.value = ''; }} data-testid="signature-file" />
          </div>
          {upload && <div className="sigpreview" style={{ marginTop: 8 }}><img src={upload} alt="Uploaded signature" data-testid="signature-upload-preview" /></div>}
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5 }}><input type="checkbox" checked={removeWhite} onChange={(e) => setRemoveWhite(e.target.checked)} data-testid="signature-remove-white" />Remove white background (scanned on paper)</label>
        </div>
      )}
      {tab === 'type' && (
        <div style={{ marginTop: 10 }}>
          <input className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Name to sign with" aria-label="Name to sign with" data-testid="signature-typed" />
          <div className="sigpreview" style={{ marginTop: 8, fontFamily: '"Snell Roundhand", "Segoe Script", "Brush Script MT", "Apple Chancery", cursive', fontStyle: 'italic', fontWeight: 600, fontSize: 30, color: '#1e2b45' }} data-testid="signature-typed-preview">{typed || ' '}</div>
        </div>
      )}
      <div className="row-between" style={{ marginTop: 10 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5 }}><input type="checkbox" checked={asDefault} onChange={(e) => setAsDefault(e.target.checked)} data-testid="signature-as-default" />Set as default</label>
        <div style={{ display: 'flex', gap: 6 }}>
          {onCancel && <button className="btn sm" onClick={onCancel}>Cancel</button>}
          <button className="btn sm primary" onClick={save} data-testid="signature-save"><Ic.check size={12} />Save signature</button>
        </div>
      </div>
    </div>
  );
}
