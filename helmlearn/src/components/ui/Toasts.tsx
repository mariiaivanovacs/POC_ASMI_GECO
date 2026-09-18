import { useStore } from '../../store/useStore';
import { Ic } from './Icons';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  const dismiss = useStore((s) => s.dismissToast);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.kind} data-testid="toast">
          <span style={{ color: t.kind === 'err' ? 'var(--red)' : 'var(--green)' }}>{t.kind === 'err' ? <Ic.x size={14} /> : <Ic.check size={16} />}</span>
          <span style={{ flexGrow: 1 }}>{t.text}</span>
          <button className="ib" style={{ width: 28, height: 28, borderRadius: 8 }} onClick={() => dismiss(t.id)} aria-label="Dismiss"><Ic.x size={10} /></button>
        </div>
      ))}
    </div>
  );
}
