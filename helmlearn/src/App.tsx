import { useState, type ReactNode } from 'react';
import { HashRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { useStore } from './store/useStore';
import { Ic } from './components/ui/Icons';
import { AdminAvatar } from './components/ui/Avatar';
import { Toasts } from './components/ui/Toasts';
import { testDeepSeek } from './engine/llm';
import { Materials } from './pages/Materials';
import { TaskBuilder } from './pages/TaskBuilder';
import { Learners } from './pages/Learners';
import { Compliance } from './pages/Compliance';
import { Quality } from './pages/Quality';

function Sidebar() {
  const materials = useStore((s) => s.materials.length);
  const learners = useStore((s) => s.learners.length);
  return (
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark"><Ic.cap stroke="#fff" /></span><span className="brand-name">HelmLearn</span></div>
      <NavLink to="/materials" className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}><Ic.file /><span>Materials</span></NavLink>
      <NavLink to="/builder" className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}><Ic.tasks /><span>Task builder</span></NavLink>
      <NavLink to="/learners" className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}><Ic.users /><span>Learners</span></NavLink>
      <NavLink to="/compliance" className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}><Ic.badge /><span>Compliance &amp; training</span></NavLink>
      <NavLink to="/quality" className={({ isActive }) => 'nav' + (isActive ? ' active' : '')}><Ic.active size={18} /><span>Content quality</span></NavLink>
      <div style={{ flexGrow: 1 }} />
      <div className="tenant"><b>Harbourline Marine Services</b><span>{learners} learners · {materials} materials · ASMI member</span></div>
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
        <div className="admin"><AdminAvatar /><div><b>Melissa Tan</b><span>Training admin</span></div></div>
      </div>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </header>
  );
}

function SettingsModal({ onClose }: { onClose: () => void }) {
  const settings = useStore((s) => s.settings);
  const setPin = useStore((s) => s.setPin);
  const setProvider = useStore((s) => s.setProvider);
  const setApiKey = useStore((s) => s.setApiKey);
  const setTranslate = useStore((s) => s.setTranslate);
  const setReviewer = useStore((s) => s.setReviewer);
  const resetDemo = useStore((s) => s.resetDemo);
  const toast = useStore((s) => s.toast);
  const storageOk = useStore((s) => s.storageOk);
  const [pin, setP] = useState(settings.pin);
  const [key, setKey] = useState(settings.apiKey);
  const [reviewerName, setReviewerName] = useState(settings.reviewerName);
  const [reviewerRole, setReviewerRole] = useState(settings.reviewerRole);
  const [testing, setTesting] = useState<string | null>(null);
  const saveKey = () => { setApiKey(key); toast(key.trim() ? 'API key saved in this browser' : 'API key cleared', 'ok'); };
  const test = async () => {
    setTesting('Testing…');
    try { setTesting(await testDeepSeek(key.trim())); setApiKey(key); }
    catch (e) { setTesting(e instanceof Error ? e.message : 'Failed'); }
  };
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal" style={{ width: 520 }} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Settings">
        <div className="row-between"><h2 style={{ fontSize: 16 }}>Settings</h2><button className="ib" style={{ width: 32, height: 32 }} onClick={onClose} aria-label="Close"><Ic.x /></button></div>

        <div style={{ marginTop: 14 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Exercise generation</div>
          <div className="seg" style={{ marginTop: 6 }} data-testid="provider-toggle">
            <button className={settings.provider === 'local' ? 'on' : ''} onClick={() => setProvider('local')}>Offline engine</button>
            <button className={settings.provider === 'deepseek' ? 'on' : ''} onClick={() => setProvider('deepseek')}>DeepSeek AI</button>
          </div>
          <div style={{ fontSize: 11.5, color: 'var(--ink2)', marginTop: 6, lineHeight: 1.45 }}>
            {settings.provider === 'local'
              ? 'Rule-based, runs in the browser, English only. No key, no network.'
              : 'DeepSeek drafts all seven task types plus the widgets from the document' + (settings.translate ? ', in English, Bahasa Melayu and 中文.' : '.') + ' Falls back to the offline engine if the call fails.'}
          </div>
          {settings.provider === 'deepseek' && (
            <div style={{ marginTop: 10 }}>
              <label htmlFor="apikey" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>DeepSeek API key</label>
              <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                <input id="apikey" className="input" type="password" placeholder="sk-…" value={key} onChange={(e) => setKey(e.target.value)} data-testid="api-key" autoComplete="off" />
                <button className="btn" onClick={saveKey} data-testid="save-key">Save</button>
                <button className="btn ai" onClick={test} disabled={!key.trim()} data-testid="test-key">Test</button>
              </div>
              {testing && <div className={'fb ' + (testing.startsWith('Connected') ? 'ok' : testing === 'Testing…' ? 'ok' : 'no')} style={{ marginTop: 8 }} data-testid="test-result">{testing}</div>}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 12.5 }}>
                <input type="checkbox" checked={settings.translate} onChange={(e) => setTranslate(e.target.checked)} data-testid="translate-toggle" />
                Also generate Bahasa Melayu and 中文 versions
              </label>
              <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 6, lineHeight: 1.45 }}>The key is stored only in this browser and sent through the local proxy (<span className="kbd">/api/deepseek</span> → api.deepseek.com).</div>
            </div>
          )}
        </div>

        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Reviewer identity (stamped on every content approval/rejection)</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input className="input" value={reviewerName} onChange={(e) => setReviewerName(e.target.value)} placeholder="Your name" data-testid="settings-reviewer-name" />
            <select className="input" style={{ width: 160 }} value={reviewerRole} onChange={(e) => setReviewerRole(e.target.value as typeof reviewerRole)} data-testid="settings-reviewer-role">
              <option>Trainer</option><option>HSE Manager</option><option>Supervisor</option><option>Auditor</option>
            </select>
            <button className="btn" onClick={() => { setReviewer(reviewerName.trim(), reviewerRole); toast('Reviewer identity saved', 'ok'); }}>Save</button>
          </div>
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <label htmlFor="pin" style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}>Supervisor PIN (used by sign-off tasks)</label>
          <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
            <input id="pin" className="input" value={pin} onChange={(e) => setP(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" />
            <button className="btn primary" onClick={() => { if (pin.length < 4) { toast('PIN must be at least 4 digits', 'err'); return; } setPin(pin); toast('PIN updated', 'ok'); }}>Save</button>
          </div>
        </div>
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
          <div style={{ fontSize: 12.5, color: 'var(--ink2)', lineHeight: 1.5 }}>Data is stored in this browser only{storageOk ? '' : ' (storage unavailable — kept in memory for this tab)'}. Reset puts back the demo materials, learners and activity; the API key is kept.</div>
          <button className="btn danger" style={{ marginTop: 10 }} onClick={() => { if (window.confirm('Reset all data to the demo set? Uploaded materials and recorded attempts will be removed.')) { resetDemo(); toast('Demo data restored', 'ok'); onClose(); } }} data-testid="reset-demo">Reset demo data</button>
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
          {!storageOk && <div className="banner">Browser storage is unavailable — your changes will be lost when this tab closes.</div>}
          <Routes>
            <Route path="/" element={<Navigate to="/materials" replace />} />
            <Route path="/materials" element={<Materials />} />
            <Route path="/builder" element={<TaskBuilder />} />
            <Route path="/builder/:materialId" element={<TaskBuilder />} />
            <Route path="/learners" element={<Learners />} />
            <Route path="/learners/:learnerId" element={<Learners />} />
            <Route path="/compliance" element={<Compliance />} />
            <Route path="/quality" element={<Quality />} />
            <Route path="/integrations" element={<Navigate to="/compliance" replace />} />
            <Route path="*" element={<Navigate to="/materials" replace />} />
          </Routes>
        </div>
        <Toasts />
      </div>
    </HashRouter>
  );
}
