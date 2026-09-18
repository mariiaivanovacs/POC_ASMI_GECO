import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useStore } from '../store/useStore';
import { REGIMES, regimeById } from '../data/compliance';
import type { Certificate, ComplianceRegime, Learner, Material, Reminder } from '../data/types';
import { canIssueCertificate, cohortComplianceCoverage, complianceCoverage, moduleProgress, modulesOf, pace, reviewCoverage, toCsv, TARGET_DAYS, type Ctx, type Pace, type RegimeCoverage } from '../store/stats';
import { toXapiStatements } from '../engine/xapi';
import { Topbar } from '../App';
import { Avatar } from '../components/ui/Avatar';
import { Ic } from '../components/ui/Icons';

const DAY = 86_400_000;
const fmtDate = (t: number) => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const daysUntil = (t: number, now: number) => Math.ceil((t - now) / DAY);

function download(text: string, filename: string, mime: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: mime }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export function Compliance() {
  const learners = useStore((s) => s.learners);
  const materials = useStore((s) => s.materials);
  const exercises = useStore((s) => s.exercises);
  const attempts = useStore((s) => s.attempts);
  const enrollments = useStore((s) => s.enrollments);
  const certificates = useStore((s) => s.certificates);
  const refreshers = useStore((s) => s.refreshers);
  const audit = useStore((s) => s.audit);
  const toast = useStore((s) => s.toast);
  const issueCertificate = useStore((s) => s.issueCertificate);
  const scheduleRefresher = useStore((s) => s.scheduleRefresher);
  const enrolLearner = useStore((s) => s.enrolLearner);
  const remindLearner = useStore((s) => s.remindLearner);
  const reminders = useStore((s) => s.reminders);
  const ctx: Ctx = useMemo(() => ({ learners, materials, exercises, attempts, enrollments, certificates, now: Date.now() }), [learners, materials, exercises, attempts, enrollments, certificates]);

  const [tab, setTab] = useState<'people' | 'renewals' | 'audit'>('people');
  const [regimeId, setRegimeId] = useState<'all' | string>('all');
  const ids = learners.map((l) => l.id);
  const regimes = REGIMES.filter((r) => cohortComplianceCoverage(ctx, ids, r.id).applicable > 0);
  const selectable = REGIMES.filter((r) => materials.some((m) => m.complianceIds.includes(r.id)));
  const selected = selectable.find((r) => r.id === regimeId) || null;

  const totals = useMemo(() => {
    let compliant = 0, expiring = 0, expired = 0, notCovered = 0;
    for (const r of selected ? [selected] : regimes) { const c = cohortComplianceCoverage(ctx, ids, r.id); compliant += c.compliant; expiring += c.expiring; expired += c.expired; notCovered += c.notCovered; }
    return { compliant, expiring, expired, notCovered, cells: compliant + expiring + expired + notCovered };
  }, [ctx, ids, regimes, selected]);

  const exportXapi = () => {
    const statements = toXapiStatements(ctx, ids);
    download(JSON.stringify(statements, null, 2), 'helmlearn-xapi-statements-' + new Date().toISOString().slice(0, 10) + '.json', 'application/json');
    toast('Exported ' + statements.length + ' xAPI statements for ' + ids.length + ' learners', 'ok');
  };
  const exportRecords = () => {
    const rows: Record<string, string | number>[] = [];
    for (const l of learners) {
      for (const regime of REGIMES) {
        const mods = modulesOf(ctx, l.id).filter((m) => m.complianceIds.includes(regime.id));
        for (const m of mods) {
          const c = certificates.find((x) => x.learnerId === l.id && x.materialId === m.id);
          rows.push({ learner_name: l.name, learner_code: l.code, department: l.dept, regime: regime.name, authority: regime.authority, module: m.short, module_progress_pct: moduleProgress(ctx, l.id, m.id), certificate_code: c?.code || '', certificate_issued: c ? new Date(c.issuedAt).toISOString().slice(0, 10) : '', certificate_expires: c ? new Date(c.expiresAt).toISOString().slice(0, 10) : '', status: !c ? 'not_certified' : c.expiresAt <= ctx.now ? 'expired' : c.expiresAt - ctx.now <= 30 * DAY ? 'expiring' : 'valid' });
        }
      }
    }
    download(toCsv(rows), 'helmlearn-compliance-records-' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
    toast('Exported ' + rows.length + ' compliance records', 'ok');
  };
  const exportAuditCsv = () => {
    const csv = toCsv(audit.slice().reverse().map((a) => ({ when: new Date(a.at).toISOString(), actor: a.actor, role: a.role, action: a.action, target_type: a.targetType, target_id: a.targetId, detail: a.detail })));
    download(csv, 'helmlearn-audit-log-' + new Date().toISOString().slice(0, 10) + '.csv', 'text/csv');
    toast('Exported ' + audit.length + ' audit entries', 'ok');
  };

  return (
    <>
      <Topbar title="Compliance & training" crumb={<>Training studio &nbsp;›&nbsp; <b>Compliance &amp; training</b></>}
        right={<div className="seg" data-testid="compliance-tabs">
          <button className={tab === 'people' ? 'on' : ''} onClick={() => setTab('people')}>People</button>
          <button className={tab === 'renewals' ? 'on' : ''} onClick={() => setTab('renewals')}>Renewals</button>
          <button className={tab === 'audit' ? 'on' : ''} onClick={() => setTab('audit')}>Audit log</button>
        </div>} />
      <div className="content col">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr)) minmax(230px, 1.3fr)', gap: 12, alignItems: 'stretch' }} data-testid="compliance-kpis">
          <Kpi label="Compliant" value={totals.compliant} of={totals.cells} kind="ok" hint="Learner × regime pairs with a valid certificate" />
          <Kpi label="Expiring ≤ 30 d" value={totals.expiring} of={totals.cells} kind="risk" hint="Valid today, but a renewal is due inside a month" />
          <Kpi label="Expired" value={totals.expired} of={totals.cells} kind="err" hint="Certificate lapsed — the learner should not be on that work until renewed" />
          <Kpi label="Not certified" value={totals.notCovered} of={totals.cells} kind="none" hint="Enrolled in a module that counts toward the regime, but no certificate yet" />
          <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6, justifyContent: 'center' }}>
            <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>Export for HRIS / LRS</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button className="btn sm" onClick={exportRecords} data-testid="export-compliance"><Ic.download />Records (.csv)</button>
              <button className="btn sm" onClick={exportXapi} data-testid="export-xapi"><Ic.download />xAPI (.json)</button>
            </div>
            <div style={{ fontSize: 10.5, color: 'var(--muted)', lineHeight: 1.4 }}>Real files — one row per learner × regime × module; one xAPI statement per attempt. SCORM packaging and SSO need a backend and are not in this POC.</div>
          </div>
        </div>

        {tab === 'people' && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }} data-testid="regime-picker">
            <span style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--muted)', marginRight: 4 }}>Regime</span>
            <button className={'chip' + (regimeId === 'all' ? ' on' : '')} onClick={() => setRegimeId('all')} data-testid="regime-chip" data-regime="all">All regimes <span style={{ opacity: .6 }}>{regimes.length}</span></button>
            {selectable.map((r) => { const c = cohortComplianceCoverage(ctx, ids, r.id); return <button key={r.id} className={'chip' + (regimeId === r.id ? ' on' : '')} onClick={() => setRegimeId(r.id)} title={r.summary} data-testid="regime-chip" data-regime={r.id}>{r.name.replace(/ — .*$/, '')} <span style={{ opacity: .6 }}>{c.compliant}/{learners.length}</span></button>; })}
          </div>
        )}
        {tab === 'people' && !selected && <MatrixTab ctx={ctx} regimes={regimes} learners={learners} onIssue={(l, m) => { const c = issueCertificate(l, m); if (c) toast('Certificate ' + c.code + ' issued and downloaded', 'ok'); }} />}
        {tab === 'people' && selected && (
          <StaffTab ctx={ctx} regime={selected} learners={learners} materials={materials} reminders={reminders}
            onEnrol={(l, m) => { if (enrolLearner(l.id, m.id)) toast(l.name + ' enrolled in ' + m.short + ' — ' + TARGET_DAYS + ' days to complete', 'ok'); }}
            onRemind={(l, m) => { const r = remindLearner(l.id, m.id); toast('Reminder for ' + l.name + ' logged and routed via supervisor ' + r.via + ' (demo: no message is actually sent)', 'ok'); }}
            onIssue={(l, m, renew) => { const c = issueCertificate(l.id, m.id); if (c) toast((renew ? 'Renewed — ' : '') + 'certificate ' + c.code + ' downloaded', 'ok'); }} />
        )}
        {tab === 'renewals' && <RenewalsTab ctx={ctx} certificates={certificates} refreshers={refreshers} onRefresher={(l, m) => { scheduleRefresher(l, m, 7); toast('Refresher scheduled for next week', 'ok'); }} onReissue={(l, m) => { const c = issueCertificate(l, m); if (c) toast('Renewed — certificate ' + c.code + ' downloaded', 'ok'); }} />}
        {tab === 'audit' && <AuditTab audit={audit} onExport={exportAuditCsv} />}

        <div style={{ fontSize: 11, color: 'var(--muted)', lineHeight: 1.5, padding: '0 4px' }}>
          Regime mapping is reference only — a starting point for a demo, not legal advice. Authorities, evidence requirements and renewal intervals should be verified against the current regulation and your own SOP before relying on this for an actual audit.
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, of, kind, hint }: { label: string; value: number; of: number; kind: 'ok' | 'risk' | 'err' | 'none'; hint: string }) {
  const color = kind === 'ok' ? 'var(--green-t)' : kind === 'risk' ? 'var(--amber-t)' : kind === 'err' ? 'var(--red-t)' : 'var(--ink2)';
  return (
    <div className="card" style={{ padding: '12px 16px', minWidth: 0 }} title={hint} data-testid={'kpi-' + kind}>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <span style={{ fontFamily: 'var(--font-h)', fontSize: 28, fontWeight: 800, color }} data-testid="kpi-value">{value}</span>
        <span style={{ fontSize: 12, color: 'var(--muted)' }}>of {of}</span>
      </div>
      <div style={{ fontSize: 11, color: 'var(--ink2)', marginTop: 2 }}>{hint}</div>
    </div>
  );
}

type PersonTone = 'green' | 'blue' | 'amber' | 'red' | 'grey';
interface PersonState { learner: Learner; material: Material | null; enrolled: boolean; coverage: RegimeCoverage; p: Pace; tone: PersonTone; headline: string; detail: string; blocked: number; eligible: boolean; reminder: Reminder | null }

function personState(ctx: Ctx, regime: ComplianceRegime, l: Learner, materials: Material[], reminders: Reminder[]): PersonState {
  const covering = materials.filter((m) => m.complianceIds.includes(regime.id));
  const enrolledMods = covering.filter((m) => ctx.enrollments.some((e) => e.learnerId === l.id && e.materialId === m.id));
  const coverage = complianceCoverage(ctx, l.id, [regime.id])[0];
  const material = (coverage.materialId && materials.find((m) => m.id === coverage.materialId))
    || enrolledMods.slice().sort((a, b) => moduleProgress(ctx, l.id, b.id) - moduleProgress(ctx, l.id, a.id))[0]
    || covering.find((m) => m.status === 'processed') || covering[0] || null;
  const enrolled = !!material && enrolledMods.some((m) => m.id === material.id);
  const p = material ? pace(ctx, l.id, material.id) : pace(ctx, l.id, '');
  const rc = material ? reviewCoverage(ctx, material.id) : { approved: 0, total: 0, draft: 0, rejected: 0 };
  const blocked = rc.total - rc.approved;
  const eligible = !!material && canIssueCertificate(ctx, l.id, material.id);
  const reminder = material ? reminders.find((r) => r.learnerId === l.id && r.materialId === material.id) || null : null;
  const cert = coverage.certificate;
  const daysTo = cert ? daysUntil(cert.expiresAt, ctx.now) : 0;

  let tone: PersonTone = 'grey', headline = 'Not enrolled', detail = material ? 'Needs ' + material.short + ' to count toward ' + regime.name : 'No module is tagged to this regime yet';
  if (!enrolled) { /* keep */ }
  else if (coverage.status === 'compliant') { tone = 'green'; headline = 'Certified'; detail = 'Valid until ' + fmtDate(cert!.expiresAt) + ' · ' + daysTo + ' days left'; }
  else if (coverage.status === 'expiring') { tone = 'amber'; headline = 'Certificate expiring'; detail = 'Expires ' + fmtDate(cert!.expiresAt) + ' (' + daysTo + ' d) — ' + (eligible ? 'module is current, renew now' : 'redo the module to renew (' + p.progress + '% so far)'); }
  else if (coverage.status === 'expired') { tone = 'red'; headline = 'Certificate expired'; detail = 'Lapsed ' + -daysTo + ' d ago — should not be on ' + regime.name.toLowerCase() + ' work until renewed · ' + p.progress + '% of the refresher done'; }
  else if (p.status === 'done' && eligible) { tone = 'blue'; headline = 'Completed — ready to certify'; detail = 'Finished ' + material!.short + ' in ' + p.daysEnrolled + ' days, every task approved'; }
  else if (p.status === 'done') { tone = 'blue'; headline = 'Completed — awaiting content review'; detail = blocked + ' task' + (blocked === 1 ? '' : 's') + ' in ' + material!.short + ' still unreviewed; certificate is blocked until the safety team signs them off'; }
  else if (p.status === 'overdue') { tone = 'red'; headline = 'Overdue'; detail = p.label + ' of ' + material!.short + (p.lastActiveDays !== null ? ' · last active ' + p.lastActiveDays + ' d ago' : ''); }
  else if (p.status === 'inactive') { tone = 'red'; headline = 'Gone quiet'; detail = p.label + ' · ' + p.daysLeft + ' d left on ' + material!.short; }
  else if (p.status === 'not-started') { tone = 'amber'; headline = 'Not started'; detail = p.label + ' · ' + p.daysLeft + ' d left on ' + material!.short; }
  else if (p.status === 'slow') { tone = 'amber'; headline = 'Falling behind'; detail = p.label; }
  else { tone = 'blue'; headline = 'On track'; detail = p.label + (p.projectedDays ? ' · projected finish in ' + Math.max(0, p.projectedDays - p.daysEnrolled) + ' d' : ''); }
  return { learner: l, material, enrolled, coverage, p, tone, headline, detail, blocked, eligible, reminder };
}

const TONE_ORDER: Record<PersonTone, number> = { red: 0, amber: 1, grey: 2, blue: 3, green: 4 };

function StaffTab({ ctx, regime, learners, materials, reminders, onEnrol, onRemind, onIssue }: { ctx: Ctx; regime: ComplianceRegime; learners: Learner[]; materials: Material[]; reminders: Reminder[]; onEnrol: (l: Learner, m: Material) => void; onRemind: (l: Learner, m: Material) => void; onIssue: (l: Learner, m: Material, renew: boolean) => void }) {
  const [only, setOnly] = useState<'all' | 'action'>('all');
  const rows = learners.map((l) => personState(ctx, regime, l, materials, reminders)).sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone] || a.learner.name.localeCompare(b.learner.name));
  const shown = rows.filter((r) => only === 'all' || r.tone !== 'green');
  const counts = { green: rows.filter((r) => r.tone === 'green').length, red: rows.filter((r) => r.tone === 'red').length, amber: rows.filter((r) => r.tone === 'amber').length, grey: rows.filter((r) => r.tone === 'grey').length, blue: rows.filter((r) => r.tone === 'blue').length };
  const covering = materials.filter((m) => m.complianceIds.includes(regime.id));
  return (
    <section className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 12 }} data-testid="staff-tab" data-regime={regime.id}>
      <div className="row-between" style={{ alignItems: 'flex-start', flexWrap: 'wrap' }}>
        <div style={{ maxWidth: 720 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}><div className="card-h">{regime.name}</div><span className="tag g">{regime.authority}</span><span className="tag g">renew every {regime.renewalMonths} mo</span></div>
          <div className="card-sub" style={{ marginTop: 4 }}>{regime.summary}</div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 11.5, color: 'var(--ink2)' }}>
            Counts through:{covering.map((m) => <Link key={m.id} to={'/builder/' + m.id} className="tag" style={{ textDecoration: 'none' }}>{m.short}{m.status !== 'processed' ? ' · not processed yet' : ''}</Link>)}
            <span style={{ color: 'var(--muted)' }}>· target {TARGET_DAYS} days from enrolment</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="pill ok" data-testid="count-green"><Ic.check size={10} />{counts.green} certified</span>
          <span className="pill info">{counts.blue} on track / ready</span>
          <span className="pill risk">{counts.amber} slow / expiring</span>
          <span className="pill err">{counts.red} overdue / lapsed</span>
          <span className="pill none">{counts.grey} not enrolled</span>
          <div className="seg" style={{ marginLeft: 6 }}><button className={only === 'all' ? 'on' : ''} onClick={() => setOnly('all')}>Everyone</button><button className={only === 'action' ? 'on' : ''} onClick={() => setOnly('action')} data-testid="needs-action">Needs action</button></div>
        </div>
      </div>

      <div className="stack" style={{ gap: 8 }} data-testid="person-list">
        {shown.length === 0 && <div className="empty">Everyone is certified for {regime.name}.</div>}
        {shown.map((r) => <PersonRow key={r.learner.id} r={r} ctx={ctx} onEnrol={onEnrol} onRemind={onRemind} onIssue={onIssue} />)}
      </div>
    </section>
  );
}

function PersonRow({ r, ctx, onEnrol, onRemind, onIssue }: { r: PersonState; ctx: Ctx; onEnrol: (l: Learner, m: Material) => void; onRemind: (l: Learner, m: Material) => void; onIssue: (l: Learner, m: Material, renew: boolean) => void }) {
  const { learner: l, material: m, p } = r;
  const remindedAgo = r.reminder ? Math.round((ctx.now - r.reminder.at) / 60_000) : null;
  const remindLabel = remindedAgo === null ? null : remindedAgo < 1 ? 'just now' : remindedAgo < 60 ? remindedAgo + ' min ago' : remindedAgo < 1440 ? Math.round(remindedAgo / 60) + ' h ago' : Math.round(remindedAgo / 1440) + ' d ago';

  let action: JSX.Element;
  if (!m) action = <button className="btn big" disabled title="Tag a module to this regime first">No module</button>;
  else if (!r.enrolled) action = <button className="btn primary big" disabled={m.status !== 'processed'} title={m.status !== 'processed' ? 'Process ' + m.short + ' in Materials first' : 'Enrol ' + l.name + ' in ' + m.short} onClick={() => onEnrol(l, m)} data-testid="action-enrol"><Ic.users size={15} />Enrol in {m.short}</button>;
  else if (r.coverage.status === 'compliant') action = <button className="btn big ok" onClick={() => onIssue(l, m, false)} data-testid="action-download"><Ic.download size={15} />Download certificate</button>;
  else if ((r.coverage.status === 'expiring' || r.coverage.status === 'expired') && r.eligible) action = <button className="btn primary big" onClick={() => onIssue(l, m, true)} data-testid="action-renew"><Ic.badge size={15} />Renew certificate</button>;
  else if (p.status === 'done' && r.eligible) action = <button className="btn primary big" onClick={() => onIssue(l, m, false)} data-testid="action-issue"><Ic.badge size={15} />Issue certificate</button>;
  else if (p.status === 'done') action = <Link to={'/builder/' + m.id} className="btn big" data-testid="action-review"><Ic.tasks size={15} />Review {r.blocked} draft{r.blocked === 1 ? '' : 's'}</Link>;
  else action = <button className={'btn big' + (r.tone === 'red' ? ' warn' : '')} onClick={() => onRemind(l, m)} data-testid="action-remind"><Ic.bell size={15} />{remindLabel ? 'Remind again' : 'Remind to continue'}</button>;

  return (
    <div className={'person tone-' + r.tone} data-testid="person-row" data-learner={l.id} data-tone={r.tone} data-pace={p.status} data-coverage={r.coverage.status}>
      <Link to={'/learners/' + l.id} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--ink)', textDecoration: 'none', minWidth: 210 }}>
        <Avatar av={l.avatar} size={38} radius={11} />
        <span style={{ minWidth: 0 }}><b style={{ fontSize: 13.5 }}>{l.name}</b><div style={{ fontSize: 11, color: 'var(--ink2)' }}>{l.role} · {l.dept}</div><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>Supervisor {l.sup} · {l.lang}</div></span>
      </Link>
      <div style={{ flexGrow: 1, minWidth: 220 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <b style={{ fontSize: 13 }} data-testid="person-headline">{r.headline}</b>
          {r.enrolled && m && <span className="tag g">{m.short}</span>}
          {remindLabel && <span className="pill info" data-testid="reminded"><Ic.bell size={10} />Reminded {remindLabel} via {r.reminder!.via}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink2)', marginTop: 3 }}>{r.detail}</div>
        {r.enrolled && r.coverage.status !== 'compliant' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
            <div className="bar" style={{ flexGrow: 1, height: 7 }}><i style={{ width: p.progress + '%', background: r.tone === 'red' ? 'var(--red)' : r.tone === 'amber' ? 'var(--amber)' : r.tone === 'green' ? 'var(--green)' : 'var(--blue)' }} /></div>
            <span style={{ fontSize: 11.5, fontWeight: 700, minWidth: 34 }}>{p.progress}%</span>
            {p.status !== 'done' && <span style={{ fontSize: 11, color: 'var(--muted)', whiteSpace: 'nowrap' }}>day {p.daysEnrolled} of {TARGET_DAYS}</span>}
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{action}</div>
    </div>
  );
}

function MatrixTab({ ctx, regimes, learners, onIssue }: { ctx: Ctx; regimes: ComplianceRegime[]; learners: Learner[]; onIssue: (learnerId: string, materialId: string) => void }) {
  const [gapsOnly, setGapsOnly] = useState(false);
  const rows = learners.map((l) => ({ l, cov: complianceCoverage(ctx, l.id, regimes.map((r) => r.id)) }))
    .filter((r) => !gapsOnly || r.cov.some((c) => c.materialId && c.status !== 'compliant'));
  if (!regimes.length) return <section className="card empty">No enrolled module is tagged to a compliance regime yet.</section>;
  return (
    <section className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="matrix-tab">
      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <div><div className="card-h">Who is certified for what</div><div className="card-sub">One cell per learner and regime. A learner counts toward a regime through the module they are enrolled in; the certificate is issued from that module.</div></div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--ink2)' }}><input type="checkbox" checked={gapsOnly} onChange={(e) => setGapsOnly(e.target.checked)} data-testid="gaps-only" />Only learners with gaps</label>
      </div>
      <div style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5 }} data-testid="matrix">
          <thead>
            <tr>
              <th style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--muted)', position: 'sticky', left: 0, background: 'var(--card)' }}>Learner</th>
              {regimes.map((r) => <th key={r.id} style={{ textAlign: 'left', padding: '6px 8px', fontSize: 11, color: 'var(--muted)', minWidth: 170 }} title={r.summary} data-testid="matrix-regime" data-regime={r.id}>{r.name}<div style={{ fontWeight: 500, fontSize: 10, color: 'var(--muted)' }}>{r.authority} · renew {r.renewalMonths} mo</div></th>)}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={regimes.length + 1} className="empty" style={{ padding: 20 }}>No gaps — everyone in scope holds a valid certificate.</td></tr>}
            {rows.map(({ l, cov }) => (
              <tr key={l.id} style={{ borderTop: '1px solid var(--line2)' }} data-testid="matrix-row" data-learner={l.id}>
                <td style={{ padding: '8px', position: 'sticky', left: 0, background: 'var(--card)', borderTop: '1px solid var(--line2)' }}>
                  <Link to={'/learners/' + l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)', textDecoration: 'none' }}>
                    <Avatar av={l.avatar} size={26} radius={8} />
                    <span><b>{l.name}</b><div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{l.role} · {l.dept}</div></span>
                  </Link>
                </td>
                {regimes.map((r) => <td key={r.id} style={{ padding: '8px', borderTop: '1px solid var(--line2)', verticalAlign: 'middle' }}><Cell ctx={ctx} learner={l} row={cov.find((c) => c.regimeId === r.id)!} onIssue={onIssue} /></td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--ink2)' }}>
        <span className="pill ok"><Ic.check size={10} />Valid</span><span className="pill risk">Expiring ≤ 30 d</span><span className="pill err">Expired</span><span className="pill none">Not certified — shows what is blocking it</span><span className="pill info">Issue — eligible now</span>
      </div>
    </section>
  );
}

function Cell({ ctx, learner, row, onIssue }: { ctx: Ctx; learner: Learner; row: RegimeCoverage; onIssue: (learnerId: string, materialId: string) => void }) {
  const mods = modulesOf(ctx, learner.id).filter((m) => m.complianceIds.includes(row.regimeId));
  if (!mods.length) return <span style={{ color: 'var(--muted)' }} data-testid="cell" data-status="n/a">— not enrolled</span>;
  if (row.status === 'compliant') return <span className="pill ok" data-testid="cell" data-status="compliant" title={'Certificate valid until ' + fmtDate(row.certificate!.expiresAt)}><Ic.check size={10} />until {fmtDate(row.certificate!.expiresAt)}</span>;
  if (row.status === 'expiring') return <span className="pill risk" data-testid="cell" data-status="expiring">expires in {daysUntil(row.certificate!.expiresAt, ctx.now)} d</span>;
  if (row.status === 'expired') return <span className="pill err" data-testid="cell" data-status="expired">expired {-daysUntil(row.certificate!.expiresAt, ctx.now)} d ago</span>;
  const eligible = mods.find((m) => canIssueCertificate(ctx, learner.id, m.id));
  if (eligible) return <button className="btn primary sm" style={{ height: 26 }} onClick={() => onIssue(learner.id, eligible.id)} data-testid="cell" data-status="eligible"><Ic.badge size={12} />Issue</button>;
  const m = mods[0];
  const progress = moduleProgress(ctx, learner.id, m.id);
  const rc = reviewCoverage(ctx, m.id);
  const pending = rc.total - rc.approved;
  const why = progress < 100 ? progress + '% of ' + m.short : pending + ' task' + (pending === 1 ? '' : 's') + ' awaiting review';
  return <Link to={progress < 100 ? '/learners/' + learner.id : '/builder/' + m.id} className="pill none" style={{ textDecoration: 'none' }} title={progress < 100 ? 'Module not finished yet' : 'Every task in the module must be approved before a certificate can be issued'} data-testid="cell" data-status="not-covered">{why}</Link>;
}

function RenewalsTab({ ctx, certificates, refreshers, onRefresher, onReissue }: { ctx: Ctx; certificates: Certificate[]; refreshers: { learnerId: string; materialId: string; due: number }[]; onRefresher: (l: string, m: string) => void; onReissue: (l: string, m: string) => void }) {
  const sorted = certificates.slice().sort((a, b) => a.expiresAt - b.expiresAt);
  const soon = sorted.filter((c) => c.expiresAt - ctx.now <= 90 * DAY);
  return (
    <section className="card" style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="renewals-tab">
      <div><div className="card-h">Renewals</div><div className="card-sub">{soon.length ? soon.length + ' certificate' + (soon.length === 1 ? '' : 's') + ' expired or due within 90 days.' : 'Nothing expires in the next 90 days.'} Schedule a refresher so the module is re-done before the date, then re-issue once it is 100% again.</div></div>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }} data-testid="renewals">
        <thead><tr style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'left' }}><th style={{ padding: '6px 8px' }}>Learner</th><th style={{ padding: '6px 8px' }}>Module · regime</th><th style={{ padding: '6px 8px' }}>Issued</th><th style={{ padding: '6px 8px' }}>Expires</th><th style={{ padding: '6px 8px' }}>Status</th><th style={{ padding: '6px 8px' }}>Action</th></tr></thead>
        <tbody>
          {sorted.length === 0 && <tr><td colSpan={6} className="empty" style={{ padding: 16 }}>No certificates issued yet.</td></tr>}
          {sorted.map((c) => {
            const l = ctx.learners.find((x) => x.id === c.learnerId);
            const m = ctx.materials.find((x) => x.id === c.materialId);
            if (!l || !m) return null;
            const d = daysUntil(c.expiresAt, ctx.now);
            const status = d <= 0 ? 'expired' : d <= 30 ? 'expiring' : 'valid';
            const eligible = canIssueCertificate(ctx, l.id, m.id);
            const refresher = refreshers.find((r) => r.learnerId === l.id && r.materialId === m.id);
            return (
              <tr key={c.id} style={{ borderTop: '1px solid var(--line2)' }} data-testid="renewal-row" data-status={status}>
                <td style={{ padding: 8 }}><Link to={'/learners/' + l.id} style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--ink)', textDecoration: 'none' }}><Avatar av={l.avatar} size={24} radius={7} /><b>{l.name}</b></Link></td>
                <td style={{ padding: 8 }}>{m.short}<div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{m.complianceIds.map((id) => regimeById(id)?.name).filter(Boolean).join(' · ')}</div></td>
                <td style={{ padding: 8, whiteSpace: 'nowrap', color: 'var(--ink2)' }}>{fmtDate(c.issuedAt)}<div style={{ fontSize: 10.5, color: 'var(--muted)' }}>{c.code}</div></td>
                <td style={{ padding: 8, whiteSpace: 'nowrap' }}>{fmtDate(c.expiresAt)}</td>
                <td style={{ padding: 8 }}>{status === 'expired' ? <span className="pill err">Expired {-d} d ago</span> : status === 'expiring' ? <span className="pill risk">{d} d left</span> : <span className="pill ok"><Ic.check size={10} />{d} d left</span>}</td>
                <td style={{ padding: 8 }}>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {status !== 'valid' && (refresher ? <span className="pill info"><Ic.calendar size={11} />Refresher {fmtDate(refresher.due)}</span> : <button className="btn sm" onClick={() => onRefresher(l.id, m.id)} data-testid="schedule-refresher"><Ic.calendar size={12} />Schedule refresher</button>)}
                    {status !== 'valid' && <button className="btn primary sm" disabled={!eligible} title={eligible ? 'Module is 100% and fully approved — re-issue now' : 'Re-issue once the module is 100% again and every task is approved'} onClick={() => onReissue(l.id, m.id)} data-testid="reissue"><Ic.badge size={12} />Re-issue</button>}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function AuditTab({ audit, onExport }: { audit: ReturnType<typeof useStore.getState>['audit']; onExport: () => void }) {
  const [filter, setFilter] = useState<'all' | string>('all');
  const actions = Array.from(new Set(audit.map((a) => a.action)));
  const rows = audit.slice().reverse().filter((a) => filter === 'all' || a.action === filter);
  return (
    <section className="card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 10 }} data-testid="audit-tab">
      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <div><div className="card-h">Audit log</div><div className="card-sub">Every material processed, task approved or rejected, module published and certificate issued — who, when, what.</div></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <select className="input" style={{ height: 34, width: 200 }} value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filter by action" data-testid="audit-filter">
            <option value="all">All actions ({audit.length})</option>
            {actions.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')} ({audit.filter((x) => x.action === a).length})</option>)}
          </select>
          <button className="btn" onClick={onExport} data-testid="export-audit"><Ic.download />Export CSV</button>
        </div>
      </div>
      <div style={{ overflow: 'auto', maxHeight: 520 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }} data-testid="audit-table">
          <thead><tr style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'left' }}><th style={{ padding: '6px 8px' }}>When</th><th style={{ padding: '6px 8px' }}>Actor</th><th style={{ padding: '6px 8px' }}>Action</th><th style={{ padding: '6px 8px' }}>Detail</th></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={4} className="empty" style={{ padding: 16 }}>No audit entries yet.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id} style={{ borderTop: '1px solid var(--line2)' }} data-testid="audit-row">
                <td style={{ padding: '8px', whiteSpace: 'nowrap', color: 'var(--ink2)' }}>{new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}><b>{a.actor}</b> <span style={{ color: 'var(--muted)' }}>({a.role})</span></td>
                <td style={{ padding: '8px', whiteSpace: 'nowrap' }}><span className="tag">{a.action.replace(/_/g, ' ')}</span></td>
                <td style={{ padding: '8px' }}>{a.detail}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
