import { useState, type ReactNode } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useStore } from './store/useStore';
import { Ic } from './components/ui/Icons';
import { AdminAvatar } from './components/ui/Avatar';
import { Toasts } from './components/ui/Toasts';
import { SignatureLibrary } from './components/Signatures';
import { Templates } from './pages/Templates';
import { Assemble } from './pages/Assemble';
import { Library } from './pages/Library';

function Sidebar() {
  const templates = useStore((s) => s.templates.length);
  const docs = useStore((s) => s.docs.length);
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Ic.file stroke="#fff" /></span><span className="brand-name">HelmDocs</span></div>
      <NavLink to="/templates" className={({ isActive }) => 'nav' + (isActive ? ' active' : '')} data-testid="nav-templates"><Ic.grid /><span>Templates</span></NavLink>
      <NavLink to="/assemble" className={({ isActive }) => 'nav' + (isActive ? ' active' : '')} data-testid="nav-assemble"><Ic.pen /><span>Assemble</span></NavLink>
      <NavLink to="/library" className={({ isActive }) => 'nav' + (isActive ? ' active' : '')} data-testid="nav-library"><Ic.folder /><span>Library</span></NavLink>
      <div style={{ flexGrow: 1 }} />
      <div className="tenant" data-testid="tenant"><b>Harbourline Marine Services Pte Ltd</b><span>ASMI member · MRO · {templates} templates · {docs} documents</span><span style={{ color: '#f5d27a' }}>Demo data — fictional</span></div>
    </aside>
  );
}

export function Topbar({ title, crumb, back, right }: { title: string; crumb: ReactNode; back?: string; right?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <header className="topbar">
      <div className="topbar-left">
        {back ? <NavLink to={back} className="ib" aria-label="Back"><Ic.back /></NavLink> : <span className="ib" aria-hidden="true" style={{ cursor: 'default' }}><Ic.back /></span>}
        <div><h1>{title}</h1><div className="crumb">{crumb}</div></div>
      </div>
      <div className="topbar-right">
        {right}
        <button className="ib" aria-label="Settings" onClick={() => setOpen(true)} data-testid="open-settings"><Ic.gear /></button>
        <div className="admin"><AdminAvatar /><div><b>Melissa Tan</b><span>admin</span></div></div>
      </div>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </header>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const setSignatories = useStore((s) => s.setSignatories);
  const setReviewer = useStore((s) => s.setReviewer);
  const resetDemo = useStore((s) => s.resetDemo);
  const setDeadlines = useStore((s) => s.setDeadlines);
  const toast = useStore((s) => s.toast);
  const storageOk = useStore((s) => s.storageOk);
  const [name, setName] = useState('');
  const [reviewer, setRev] = useState(settings.reviewer);
  const add = () => {
    const v = name.trim();
    if (!v) return;
    if (settings.signatories.some((s) => s.toLowerCase() === v.toLowerCase())) { toast(v + ' is already on the list', 'err'); return; }
    setSignatories([...settings.signatories, v]);
    setName('');
    toast(v + ' added to the authorised-signatory list', 'ok');
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 720, maxHeight: '92vh', overflow: 'auto' }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="row-between"><h2 style={{ fontSize: 16 }}>Settings</h2><button className="ib" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close"><Ic.x /></button></div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Authorised signatories <span className="fr">used by the pre-submission check</span></div>
          <div className="stack" style={{ marginTop: 8, maxHeight: 220, overflow: 'auto' }} data-testid="signatory-list">
            {settings.signatories.map((s) => (
              <div key={s} className="sigrow" data-testid="signatory">
                <Ic.check size={12} stroke="var(--green-t)" /><span style={{ flexGrow: 1 }}>{s}</span>
                <button className="ib" style={{ width: 26, height: 26, borderRadius: 7 }} aria-label={'Remove ' + s} onClick={() => setSignatories(settings.signatories.filter((x) => x !== s))} data-testid="remove-signatory"><Ic.x size={10} /></button>
              </div>
            ))}
            {settings.signatories.length === 0 && <div className="empty" style={{ padding: 16 }}>No authorised signatories — every signatory check will fail until one is added.</div>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <input className="input" placeholder="Name, role — e.g. Rachel Tan, QA Manager" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} data-testid="signatory-input" />
            <button className="btn" onClick={add} data-testid="add-signatory">Add</button>
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8 }}>My signatures <span className="fr">drawn · uploaded · typed — stored as transparent PNG in this browser</span></div>
          <SignatureLibrary />
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)', marginBottom: 8 }}>Deadline rules <span className="fr">drive the compliance reminders</span></div>
          <div className="stack" style={{ gap: 6 }} data-testid="deadline-rules">
            {settings.deadlines.map((r, i) => (
              <div key={r.regimeShort} className="sigrow" style={{ alignItems: 'center', gap: 8 }} data-testid="deadline-rule" data-regime={r.regimeShort}>
                <b style={{ width: 96, flexShrink: 0, fontSize: 12 }}>{r.regimeShort}</b>
                <input className="input" style={{ height: 30, fontSize: 12, flexGrow: 1 }} value={r.text} onChange={(e) => setDeadlines(settings.deadlines.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} aria-label={'Rule text for ' + r.regimeShort} />
                {r.basis === 'field' ? <label style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}>+<input className="input" style={{ height: 30, width: 54, fontSize: 12 }} type="number" min={0} value={r.days} onChange={(e) => setDeadlines(settings.deadlines.map((x, j) => (j === i ? { ...x, days: Math.max(0, parseInt(e.target.value) || 0) } : x)))} aria-label={'Days after ' + r.field} data-testid="deadline-days" /> d after {r.field}</label> : <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>{r.basis === 'quarter-end' ? 'quarter end' : 'month end'}</span>}
                <label style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 4 }}><input className="input" style={{ height: 30, width: 54, fontSize: 12 }} type="number" min={0} step={0.5} value={r.estHours} onChange={(e) => setDeadlines(settings.deadlines.map((x, j) => (j === i ? { ...x, estHours: Math.max(0, parseFloat(e.target.value) || 0) } : x)))} aria-label={'Estimated hours for ' + r.regimeShort} /> h</label>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <label htmlFor="reviewer" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Reviewer name (recorded on Mark reviewed)</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input id="reviewer" className="input" value={reviewer} onChange={(e) => setRev(e.target.value)} />
            <button className="btn primary" onClick={() => { setReviewer(reviewer); toast('Reviewer updated', 'ok'); }}>Save</button>
          </div>
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5 }}>Data is stored in this browser only{storageOk ? '' : ' (storage unavailable — kept in memory for this tab)'}. Reset puts back the seven demo templates and the demo documents for MV Ocean Pioneer, Sea Falcon 7 and the Tuas yard.</div>
          <button className="btn danger" style={{ marginTop: 10 }} onClick={() => { if (window.confirm('Reset all data to the demo set? Uploaded templates and generated documents will be removed.')) { resetDemo(); toast('Demo data restored', 'ok'); onClose(); } }} data-testid="reset-demo">Reset demo data</button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const storageOk = useStore((s) => s.storageOk);
  return (
    <HashRouter>
      <div className="app">
        <Sidebar />
        <div className="main">
          {!storageOk && <div className="banner" data-testid="storage-banner">Browser storage is unavailable — templates and documents will be lost when this tab closes.</div>}
          <Routes>
            <Route path="/" element={<Navigate to="/templates" replace />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/templates/:id" element={<Templates />} />
            <Route path="/assemble" element={<Assemble />} />
            <Route path="/assemble/:docId" element={<Assemble />} />
            <Route path="/library" element={<Library />} />
            <Route path="*" element={<Navigate to="/templates" replace />} />
          </Routes>
        </div>
        <Toasts />
      </div>
    </HashRouter>
  );
}
