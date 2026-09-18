import { useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { AggFn, Attachment, Binding, Doc, Field, Section, Template } from '../data/types';
import { COMPANY } from '../data/seed';
import { assemble, evaluateRule, missingMandatory, precheck, ruleText, signatoryOk } from '../engine/assemble';
import { buildDocx, buildHtml, buildPdf, mailtoUrl, saveBlob } from '../engine/export';
import { imoValid, lineKeys } from '../engine/fields';
import { AGG_FNS, AGG_LABEL, aggregate, numericColumns } from '../engine/data';
import { shortHash, verifySeal } from '../engine/signature';
import { SAMPLES } from '../data/samples';
import { SignatureLibrary } from '../components/Signatures';
import { fieldByKey, sectionLabel } from '../engine/template';
import { useStore } from '../store/useStore';
import { Topbar } from '../App';
import { Ic } from '../components/ui/Icons';
import { Paper, type PaperSeal } from '../components/Paper';

export function Assemble() {
  const { docId } = useParams();
  const nav = useNavigate();
  const templates = useStore((s) => s.templates);
  const docs = useStore((s) => s.docs);
  const settings = useStore((s) => s.settings);
  const createDoc = useStore((s) => s.createDoc);
  const setDocValue = useStore((s) => s.setDocValue);
  const setDocStatus = useStore((s) => s.setDocStatus);
  const recordExport = useStore((s) => s.recordExport);
  const addAttachment = useStore((s) => s.addAttachment);
  const removeAttachment = useStore((s) => s.removeAttachment);
  const bindField = useStore((s) => s.bindField);
  const signDoc = useStore((s) => s.signDoc);
  const unsignDoc = useStore((s) => s.unsignDoc);
  const toast = useStore((s) => s.toast);
  const [signOpen, setSignOpen] = useState(false);

  const doc = docs.find((d) => d.id === docId) || null;
  const template = doc ? templates.find((t) => t.id === doc.templateId) || null : null;
  const [busy, setBusy] = useState<string | null>(null);
  const [emailOpen, setEmailOpen] = useState(false);
  const [emailTo, setEmailTo] = useState('');
  const [sentTo, setSentTo] = useState<{ to: string; at: number; url: string } | null>(null);
  const [menu, setMenu] = useState(false);

  const start = (templateId: string) => { const d = createDoc(templateId); if (d) nav('/assemble/' + d.id); };

  const values = doc?.values || {};
  const assembled = useMemo(() => (template ? assemble(template, values) : null), [template, values]);
  const sectionNote = assembled ? assembled.included + ' of ' + assembled.sections.length + ' sections included' : '';
  const checks = useMemo(() => (template && doc ? precheck(template, values, settings.signatories) : []), [template, doc, values, settings.signatories]);
  const missing = template ? missingMandatory(template, values) : [];
  const locked = doc?.status === 'sent';
  const latestWo = useMemo(() => docs.filter((d) => d.id !== doc?.id).sort((a, b) => b.createdAt - a.createdAt)[0], [docs, doc]);
  const sealState = doc ? verifySeal(template, doc) : 'none';
  const seal: PaperSeal | null = doc?.signature && sealState !== 'none' ? { png: doc.signature.png, signer: doc.signature.signer, signedAt: doc.signature.signedAt, hash: doc.signature.hash, state: sealState } : null;
  const hasSignatureBlock = !!template && template.sections.some((x) => x.signature);
  const sigFieldValue = template && doc ? (template.fields.find((f) => f.role === 'signatory' && template.sections.some((x) => x.signature && x.lines.some((l) => l.kind === 'pair' && l.key === f.key)))?.key || '') : '';
  const signerName = sigFieldValue ? (doc?.values[sigFieldValue] || '') : '';
  // the seal joins the pre-submission checks once a document is signed
  const allChecks = useMemo(() => (!doc?.signature ? checks : [...checks, { id: 'seal', label: 'Signature seal matches the content', ok: sealState === 'valid', detail: sealState === 'valid' ? doc.signature.signer + ' signed this exact content on ' + new Date(doc.signature.signedAt).toLocaleString() + ' · SHA-256 ' + shortHash(doc.signature.hash) : 'The document changed after ' + doc.signature.signer + ' signed it — the seal ' + shortHash(doc.signature.hash) + ' no longer matches. Sign again, or remove the signature.' }]), [checks, doc, sealState]);
  const passedAll = allChecks.filter((c) => c.ok).length;

  const exportAs = async (kind: 'pdf' | 'docx' | 'html') => {
    if (!doc || !template) return;
    if (missing.length) { toast('Cannot export — fill the mandatory field' + (missing.length > 1 ? 's' : '') + ': ' + missing.map((f) => f.label).join(', '), 'err'); return; }
    setBusy(kind);
    try {
      const inp = { template, doc, company: COMPANY };
      const name = doc.name.replace(/\.pdf$/, '.' + kind);
      if (kind === 'pdf') saveBlob(await buildPdf(inp), name);
      else if (kind === 'docx') saveBlob(await buildDocx(inp), name);
      else saveBlob(new Blob([buildHtml(inp)], { type: 'text/html' }), name);
      recordExport(doc.id, kind);
      toast('Exported ' + name, 'ok');
    } catch (e) { toast('Export failed: ' + (e instanceof Error ? e.message : String(e)), 'err'); }
    finally { setBusy(null); }
  };

  const print = () => {
    if (!doc || !template) return;
    if (missing.length) { toast('Cannot print — fill the mandatory fields first', 'err'); return; }
    const w = window.open('', '_blank');
    if (!w) { toast('Pop-up blocked — allow pop-ups to print', 'err'); return; }
    w.document.write(buildHtml({ template, doc, company: COMPANY }));
    w.document.close();
    w.focus();
    w.print();
    recordExport(doc.id, 'html');
  };

  const sendEmail = () => {
    if (!doc || !template) return;
    const url = mailtoUrl({ template, doc, company: COMPANY }, emailTo.trim());
    const a = document.createElement('a');
    a.href = url; a.rel = 'noopener'; a.style.display = 'none';
    document.body.appendChild(a); a.click(); a.remove();
    const ok = setDocStatus(doc.id, 'sent');
    if (ok) { recordExport(doc.id, 'email'); setSentTo({ to: emailTo.trim() || 'your mail client', at: Date.now(), url }); setEmailOpen(false); toast('Marked as Sent — ' + doc.name + ' handed to your mail client', 'ok'); }
    else toast('Only a reviewed document can be sent', 'err');
  };

  const review = () => {
    if (!doc) return;
    if (missing.length) { toast('Cannot mark reviewed — ' + missing.length + ' mandatory field' + (missing.length > 1 ? 's are' : ' is') + ' missing', 'err'); return; }
    if (setDocStatus(doc.id, 'reviewed')) toast('Reviewed by ' + settings.reviewer + ' — exports and email are now enabled', 'ok');
  };

  const step = !doc ? 0 : doc.status === 'draft' ? 1 : doc.status === 'reviewed' ? 2 : 3;
  const Step = ({ n, label }: { n: number; label: string }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><div className={'stepdot' + (step === n ? ' cur' : step < n ? ' todo' : '')}>{step > n ? <Ic.check size={11} /> : n}</div><span style={{ fontWeight: 600, fontSize: 12, color: step >= n ? 'var(--ink)' : 'var(--muted)' }}>{label}</span></div>
  );

  return (
    <>
      <Topbar title="Assemble a document" crumb={<>Document studio &nbsp;›&nbsp; <b>Assemble</b> &nbsp;<span className="fr" title="FR-03 automatic document generation · FR-05 conditional logic · FR-06 export and delivery">FR-03 · FR-05 · FR-06</span></>}
        right={<div style={{ display: 'flex', alignItems: 'center', gap: 10 }} data-testid="steps"><Step n={1} label="Details" /><div style={{ width: 22, height: 1, background: 'var(--line)' }} /><Step n={2} label="Reviewed" /><div style={{ width: 22, height: 1, background: 'var(--line)' }} /><Step n={3} label="Sent" /></div>} />
      <div className="content">
        <section style={{ width: 430, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0, overflow: 'auto', paddingRight: 2 }}>
          <div className="card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <label className="lbl" htmlFor="tpl">Template</label>
              <select id="tpl" className="input" value={doc?.templateId || ''} onChange={(e) => e.target.value && start(e.target.value)} data-testid="template-select" disabled={locked}>
                <option value="">{templates.length ? 'Choose a template…' : 'No templates — save one on the Templates screen'}</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.name} — {t.regimeShort}</option>)}
              </select>
              {doc && !template && <div className="hintl bad" data-testid="template-missing"><Ic.alert size={11} />The template for this document was deleted — the document is kept as a snapshot but cannot be edited.</div>}
              {doc && template && <div className="hintl"><Ic.spark size={11} />{template.regime}</div>}
            </div>
            {doc && template && (
              <FormFields template={template} doc={doc} values={values} latestWo={latestWo} signatories={settings.signatories} locked={locked} onChange={(k, v) => setDocValue(doc.id, k, v)} onBind={(k, b) => { bindField(doc.id, k, b); if (b) { const att = doc.attachments.find((a) => a.id === b.attachmentId); toast((att ? att.name : 'data') + ' → ' + AGG_LABEL[b.fn] + ' of ' + b.column + ' inserted', 'ok'); } }} />
            )}
            {!doc && (
              <div className="empty" style={{ padding: '14px 8px' }} data-testid="assemble-empty">
                <div style={{ fontWeight: 700, color: 'var(--ink)' }}>Pick a template to start a document</div>
                <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>The form on this side is generated from the template's fields; the document on the right rebuilds itself as you type.</div>
              </div>
            )}
          </div>

          {doc && template && (
            <AttachmentsCard doc={doc} template={template} locked={locked} onAdd={async (files) => { for (const f of files) { const r = await addAttachment(doc.id, f); toast(r.message, r.ok ? 'ok' : 'err'); } }} onRemove={(id) => { removeAttachment(doc.id, id); toast('Attachment removed — calculated fields keep their last value', 'ok'); }} />
          )}

          {doc && template && (
            <div className="aicard" data-testid="precheck" data-passed={passedAll} data-total={allChecks.length}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="mark" style={{ width: 28, height: 28 }}><Ic.spark size={14} /></div>
                <div style={{ fontSize: 13.5, fontWeight: 700, fontFamily: 'var(--font-h)' }}>AI pre-submission check</div>
                <div style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 700, color: passedAll === allChecks.length ? 'var(--green-t)' : 'var(--amber-t)' }} data-testid="precheck-count">{passedAll} / {allChecks.length} passed</div>
              </div>
              <div className="log" style={{ marginTop: 10 }}>
                {allChecks.map((c) => (
                  <div key={c.id} data-testid="check" data-id={c.id} data-ok={c.ok}>
                    <span className={c.ok ? 'ok' : 'no'}>{c.ok ? <Ic.check size={13} /> : <Ic.x size={12} />}</span>
                    <span><b style={{ color: 'var(--ink)', fontWeight: 600 }}>{c.label}</b><br /><span style={{ fontSize: 11.5 }}>{c.detail}</span></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
          <div className="row-between" style={{ flexShrink: 0, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: doc ? 'var(--green)' : 'var(--muted)', boxShadow: doc ? '0 0 8px var(--green)' : undefined }} />
              <div style={{ fontSize: 12.5, color: 'var(--ink2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Live preview · <span className="kbd" data-testid="doc-file">{doc ? doc.name : '—'}</span></div>
              {doc && <span className={'pill ' + doc.status} data-testid="doc-status"><span className="dot" />{doc.status === 'draft' ? 'Draft' : doc.status === 'reviewed' ? 'Reviewed' : 'Sent'}</span>}
              {doc && <span style={{ fontSize: 11.5, color: 'var(--muted)' }} data-testid="doc-minutes">{Math.round(doc.minutes)} min so far · {doc.by}{sectionNote ? ' · ' + sectionNote : ''}</span>}
            </div>
            {doc && template && (
              <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                {hasSignatureBlock && !locked && <button className={'btn' + (sealState === 'valid' ? ' ai' : '')} onClick={() => setSignOpen((v) => !v)} data-testid="sign-button" title={signerName ? 'Sign as ' + signerName : 'Fill the signatory field, then sign'}><Ic.pen size={13} />{sealState === 'valid' ? 'Signed' : sealState === 'broken' ? 'Re-sign' : 'Sign'}</button>}
                {doc.status === 'draft' && <button className="btn ai" onClick={review} data-testid="mark-reviewed" title={missing.length ? 'Fill the mandatory fields first' : ''}><Ic.check size={13} />Mark reviewed</button>}
                <button className="btn" onClick={() => exportAs('docx')} disabled={!!busy || missing.length > 0} data-testid="export-docx" title={missing.length ? 'Missing: ' + missing.map((f) => f.label).join(', ') : ''}><Ic.word />Word</button>
                <button className="btn" onClick={() => setEmailOpen((v) => !v)} disabled={doc.status === 'draft' || missing.length > 0} data-testid="export-email" title={doc.status === 'draft' ? 'Mark reviewed before sending' : ''}><Ic.mail />Email</button>
                <button className="btn primary" onClick={() => exportAs('pdf')} disabled={!!busy || missing.length > 0} data-testid="export-pdf" title={missing.length ? 'Missing: ' + missing.map((f) => f.label).join(', ') : ''}>{busy === 'pdf' ? <span className="spinner" /> : <Ic.download />}Export PDF</button>
                <button className="ib" aria-label="More export options" onClick={() => setMenu((v) => !v)} data-testid="export-more"><Ic.dots /></button>
                {menu && (
                  <div className="menu" onMouseLeave={() => setMenu(false)} data-testid="export-menu">
                    <button onClick={() => { setMenu(false); exportAs('html'); }} data-testid="export-html"><Ic.file size={14} />Export HTML</button>
                    <button onClick={() => { setMenu(false); print(); }} data-testid="export-print"><Ic.print size={14} />Print…</button>
                  </div>
                )}
                {signOpen && (
                  <div className="menu" style={{ width: 380, padding: 14, left: 0, right: 'auto' }} data-testid="sign-popover">
                    <div className="row-between"><div className="card-h">Sign this document</div><button className="ib" style={{ width: 26, height: 26, borderRadius: 7 }} onClick={() => setSignOpen(false)} aria-label="Close"><Ic.x size={10} /></button></div>
                    <div style={{ fontSize: 11.5, color: 'var(--ink2)', margin: '4px 0 10px', lineHeight: 1.45 }}>Signatory on the form: <b style={{ color: 'var(--ink)' }}>{signerName || '(not filled yet)'}</b>. Signing places the image on the signature line and seals the exact content with SHA-256 — any later edit breaks the seal.</div>
                    <SignatureLibrary compact onUse={(sig) => { const r = signDoc(doc.id, sig.id); toast(r.message, r.ok ? 'ok' : 'err'); if (r.ok) setSignOpen(false); }} />
                    {doc.signature && <button className="btn sm danger" style={{ marginTop: 10 }} onClick={() => { unsignDoc(doc.id); setSignOpen(false); toast('Signature removed', 'ok'); }} data-testid="unsign">Remove signature</button>}
                  </div>
                )}
                {emailOpen && (
                  <div className="menu" style={{ width: 320, padding: 12 }} data-testid="email-popover">
                    <label className="lbl" htmlFor="mailto">Send to (opens your mail client with the summary)</label>
                    <input id="mailto" className="input" placeholder="surveyor@class-society.example" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} data-testid="email-to" />
                    <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                      <button className="btn sm" onClick={() => setEmailOpen(false)}>Cancel</button>
                      <button className="btn sm primary" onClick={sendEmail} data-testid="email-send"><Ic.mail size={13} />Send &amp; mark Sent</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {seal && doc && (
            <div className={'rulecard ' + (seal.state === 'valid' ? 'in' : 'out')} style={{ flexShrink: 0 }} data-testid="seal-card" data-state={seal.state}>
              <Ic.shield size={15} />
              <span>{seal.state === 'valid'
                ? <><b>Signed by {seal.signer}</b> on {new Date(seal.signedAt).toLocaleString()} · seal <span className="kbd" title={seal.hash}>sha256 {shortHash(seal.hash)}</span> matches this exact content. The image is an integrity seal, not a certificate signature — see README.</>
                : <><b>Seal broken</b> — the content changed after {seal.signer} signed it, so the signature image is withheld from the preview and every export until the document is signed again.</>}</span>
            </div>
          )}
          {missing.length > 0 && doc && template && (
            <div className="rulecard out" style={{ flexShrink: 0 }} data-testid="export-blocked"><Ic.alert size={14} /><span>Export is blocked until the mandatory field{missing.length > 1 ? 's are' : ' is'} filled: <b>{missing.map((f) => f.label).join(', ')}</b>.</span></div>
          )}
          {sentTo && doc?.status === 'sent' && (
            <div className="rulecard in" style={{ flexShrink: 0 }} data-testid="sent-confirmation"><Ic.check size={14} /><span><b>Sent</b> to {sentTo.to} at {new Date(sentTo.at).toLocaleTimeString()} · the document is now locked. <a href={sentTo.url} data-testid="sent-mailto">Open the email again</a> · <Link to="/library">See it in the library</Link></span></div>
          )}
          {locked && !sentTo && <div className="rulecard in" style={{ flexShrink: 0 }}><Ic.check size={14} /><span>This document was sent{doc?.sentAt ? ' on ' + new Date(doc.sentAt).toLocaleDateString() : ''} and is locked. Start a new document to make changes.</span></div>}

          <div className="paper-wrap">
            {doc && template ? <Paper fields={template.fields} sections={template.sections} mode="live" values={values} seal={seal} /> : doc && !template ? (
              <div className="paper" data-testid="snapshot-paper"><h2 style={{ fontFamily: 'var(--font-h)', fontSize: 16 }}>{doc.templateName}</h2><p style={{ color: '#555', fontSize: 12 }}>Template deleted — values recorded at the time:</p>{Object.entries(doc.values).map(([k, v]) => <p key={k}><span className="plbl">{k}: </span><b>{v || '—'}</b></p>)}</div>
            ) : (
              <div className="paper empty" style={{ minHeight: 320 }} data-testid="preview-empty">
                <div style={{ fontFamily: 'var(--font-h)', fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>No document yet</div>
                <div style={{ fontSize: 12.5, color: '#555' }}>Choose a template on the left — the document will assemble here as the form is filled.</div>
              </div>
            )}
          </div>
        </section>
      </div>
    </>
  );
}

function FormFields({ template, doc, values, latestWo, signatories, locked, onChange, onBind }: { template: Template; doc: Doc; values: Record<string, string>; latestWo: Doc | undefined; signatories: string[]; locked: boolean; onChange: (k: string, v: string) => void; onBind: (k: string, b: { attachmentId: string; column: string; fn: AggFn } | null) => void }) {
  const sections = template.sections.filter((s) => !s.title || s.lines.some((l) => l.kind === 'pair'));
  const controllers = new Map<string, Section[]>();
  for (const s of template.sections) if (s.rule) controllers.set(s.rule.field, [...(controllers.get(s.rule.field) || []), s]);
  return (
    <>
      {sections.map((s) => {
        const rule = evaluateRule(s.rule, values, s, template.fields);
        // inputs for label/value pairs and for merge fields sitting inside prose (fields added from a selection)
        const keys = Array.from(new Set(lineKeys(s.lines)));
        if (!keys.length) return null;
        if (s.rule && !rule.included) {
          return <div key={s.id} className="rulecard out" data-testid="section-form-omitted" data-section={s.id}><Ic.rule /><span>{rule.reason} Its fields are not asked for.</span></div>;
        }
        return (
          <div key={s.id} style={{ borderTop: '1px solid var(--line2)', paddingTop: 10 }} data-testid="section-form" data-section={s.id}>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: 'var(--ink2)', marginBottom: 8, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span>{s.heading.toUpperCase()}</span>{s.rule && <span className="fr" style={{ background: 'var(--green-l)', color: 'var(--green-t)' }}>conditional · included</span>}
            </div>
            <div className="grid2" style={{ gap: 10 }}>
              {keys.map((k) => {
                const f = fieldByKey(template.fields, k);
                if (!f) return null;
                const wide = f.type === 'text' && (f.sample.length > 28 || /desc|activity|control|hazard|measures/.test(k));
                return (
                  <div key={k} style={{ gridColumn: wide || f.type === 'yesno' ? '1 / -1' : undefined }}>
                    <FieldInput f={f} value={values[k] || ''} locked={locked} onChange={(v) => onChange(k, v)} hint={hintFor(f, values[k] || '', doc, latestWo, signatories)} attachments={f.type === 'number' ? doc.attachments : []} binding={doc.bindings.find((b) => b.key === k) || null} onBind={(b) => onBind(k, b)} />
                    {controllers.has(k) && controllers.get(k)!.map((cs) => { const r = evaluateRule(cs.rule, values, cs, template.fields); return (
                      <div key={cs.id} className={'rulecard ' + (r.included ? 'in' : 'out')} style={{ marginTop: 8 }} data-testid="rule-card" data-section={cs.id} data-included={r.included}>
                        <Ic.rule /><span>Rule: <b>{sectionLabel(cs)}</b> is <b>{r.included ? 'INCLUDED' : 'OMITTED'}</b> because {ruleText({ ...cs.rule!, value: values[k] || '(empty)' })}. Included when {ruleText(cs.rule!)}.</span>
                      </div>
                    ); })}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </>
  );
}

function hintFor(f: Field, value: string, doc: Doc, latest: Doc | undefined, signatories: string[]): { text: string; kind: 'ai' | 'ok' | 'bad' } | null {
  if (f.role === 'imo' && value) return imoValid(value) ? { text: 'Checksum valid', kind: 'ok' } : { text: 'Checksum invalid — 7 digits, weighted sum must match the last digit', kind: 'bad' };
  if (f.role === 'signatory' && value) return signatoryOk(value, signatories) ? { text: 'On the authorised-signatory list', kind: 'ok' } : { text: 'Not on the authorised-signatory list (Settings)', kind: 'bad' };
  if ((f.role === 'vessel' || f.role === 'workorder' || f.role === 'imo') && value && latest && !doc.seeded && (latest.vessel === value || Object.values(latest.values).includes(value))) {
    const wo = Object.entries(latest.values).find(([k]) => k === 'work_order_no')?.[1];
    return { text: 'Pre-filled from ' + (wo || latest.name), kind: 'ai' };
  }
  if (f.type === 'date' && value && !doc.seeded && doc.createdAt > Date.now() - 3_600_000) return { text: 'Pre-filled with today\'s date', kind: 'ai' };
  return null;
}

function FieldInput({ f, value, locked, onChange, hint, attachments = [], binding = null, onBind }: { f: Field; value: string; locked: boolean; onChange: (v: string) => void; hint: { text: string; kind: 'ai' | 'ok' | 'bad' } | null; attachments?: Attachment[]; binding?: Binding | null; onBind?: (b: { attachmentId: string; column: string; fn: AggFn } | null) => void }) {
  const id = 'f_' + f.key;
  const [calc, setCalc] = useState(false);
  const [attId, setAttId] = useState(attachments[0]?.id || '');
  const att = attachments.find((a) => a.id === attId) || attachments[0] || null;
  const [col, setCol] = useState('');
  const [fn, setFn] = useState<AggFn>('sum');
  const cols = att ? numericColumns(att) : [];
  const column = col && att?.cols.includes(col) ? col : cols[0] || '';
  const preview = att && column ? aggregate(att, column, fn) : null;
  const boundAtt = binding ? attachments.find((a) => a.id === binding.attachmentId) : null;
  const common = { id, disabled: locked, 'data-testid': 'input-' + f.key, 'aria-label': f.label } as const;
  const opts = f.options || [];
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
        <label className="lbl" htmlFor={id} style={{ marginBottom: 5 }}>{f.label}{f.required && <span style={{ color: 'var(--red)' }}> *</span>}</label>
        {f.type === 'number' && onBind && !locked && (
          <button className={'sigma' + (binding ? ' on' : '')} onClick={() => setCalc((v) => !v)} title={attachments.length ? 'Calculate from attached data' : 'Attach a CSV / TSV below to calculate this field'} aria-label={'Calculate ' + f.label + ' from data'} data-testid={'calc-' + f.key}>Σ</button>
        )}
      </div>
      {calc && f.type === 'number' && (
        <div className="calcbox" data-testid={'calc-box-' + f.key}>
          {!attachments.length ? <div style={{ fontSize: 11.5, color: 'var(--ink2)' }}>No data attached yet — drop a CSV / TSV in <b>Attached data</b> below, then come back here.</div> : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <select className="input" style={{ height: 30, fontSize: 12 }} value={att?.id || ''} onChange={(e) => { setAttId(e.target.value); setCol(''); }} aria-label="Data file" data-testid={'calc-att-' + f.key}>{attachments.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
                <select className="input" style={{ height: 30, fontSize: 12 }} value={fn} onChange={(e) => setFn(e.target.value as AggFn)} aria-label="Function" data-testid={'calc-fn-' + f.key}>{AGG_FNS.map((x) => <option key={x} value={x}>{AGG_LABEL[x]}</option>)}</select>
                <select className="input" style={{ height: 30, fontSize: 12, gridColumn: '1 / -1' }} value={column} onChange={(e) => setCol(e.target.value)} aria-label="Column" data-testid={'calc-col-' + f.key}>{cols.length ? cols.map((c) => <option key={c} value={c}>{c}</option>) : <option value="">No numeric column in this file</option>}</select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginTop: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--ink2)' }} data-testid={'calc-preview-' + f.key}>{preview ? <>= <b style={{ color: 'var(--ink)' }}>{preview.text}</b> · {preview.n} row{preview.n === 1 ? '' : 's'}{preview.skipped ? ' · ' + preview.skipped + ' skipped' : ''}</> : '—'}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {binding && <button className="btn sm" onClick={() => { onBind?.(null); setCalc(false); }} data-testid={'calc-unbind-' + f.key}>Unlink</button>}
                  <button className="btn sm primary" disabled={!att || !column} onClick={() => { if (att && column) { onBind?.({ attachmentId: att.id, column, fn }); setCalc(false); } }} data-testid={'calc-apply-' + f.key}>Insert</button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      {f.type === 'yesno' ? (
        <div className="seg" data-testid={'input-' + f.key} role="radiogroup" aria-label={f.label}>
          {['Yes', 'No'].map((o) => <button key={o} className={value === o ? 'on' : ''} disabled={locked} onClick={() => onChange(o)} role="radio" aria-checked={value === o} data-testid={'input-' + f.key + '-' + o.toLowerCase()}>{o}</button>)}
        </div>
      ) : f.type === 'list' && opts.length > 1 ? (
        <select className="input" value={opts.includes(value) ? value : value ? '__other' : ''} onChange={(e) => onChange(e.target.value === '__other' ? value : e.target.value)} {...common}>
          <option value="">Select…</option>
          {opts.map((o) => <option key={o} value={o}>{o}</option>)}
          {value && !opts.includes(value) && <option value="__other">{value}</option>}
        </select>
      ) : f.type === 'date' ? (
        <input className="input" type="date" value={toIso(value)} onChange={(e) => onChange(fromIso(e.target.value))} {...common} />
      ) : (
        <input className="input" type="text" inputMode={f.type === 'number' ? 'decimal' : undefined} value={value} onChange={(e) => onChange(e.target.value)} placeholder={f.type === 'number' ? 'e.g. ' + (f.sample || '12.5 kg') : f.type === 'id' ? 'e.g. ' + (f.sample || 'WO-0000') : f.sample || ''} {...common} />
      )}
      {binding && <div className="hintl" style={{ color: 'var(--purple-t)' }} data-testid={'bound-' + f.key}><span style={{ fontWeight: 800 }}>Σ</span><span>{AGG_LABEL[binding.fn]} of <b>{binding.column}</b> from {boundAtt ? boundAtt.name + ' · ' + boundAtt.rows.length + ' rows' : 'a removed file'} — typing here unlinks it</span></div>}
      {hint && !binding && <div className={'hintl ' + (hint.kind === 'ai' ? '' : hint.kind)} data-testid={'hint-' + f.key}>{hint.kind === 'ai' ? <Ic.spark size={11} /> : hint.kind === 'ok' ? <Ic.check size={11} /> : <Ic.alert size={11} />}<span>{hint.text}</span></div>}
    </div>
  );
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function toIso(v: string): string {
  const m = v.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})$/);
  if (m) { const mi = MON.findIndex((x) => x.toLowerCase() === m[2].toLowerCase().slice(0, 3)); if (mi >= 0) return m[3] + '-' + String(mi + 1).padStart(2, '0') + '-' + m[1].padStart(2, '0'); }
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return '';
}
function fromIso(v: string): string {
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? parseInt(m[3]) + ' ' + MON[parseInt(m[2]) - 1] + ' ' + m[1] : '';
}



function AttachmentsCard({ doc, template, locked, onAdd, onRemove }: { doc: Doc; template: Template; locked: boolean; onAdd: (files: File[]) => void; onRemove: (id: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const numberFields = template.fields.filter((f) => f.type === 'number').length;
  return (
    <div className="card" style={{ padding: 14 }} data-testid="attachments">
      <div className="row-between">
        <div><div className="card-h">Attached data <span className="fr">calculated fields</span></div><div className="card-sub">Drop a CSV / TSV (invoices, drum log, meter readings) — sums, averages and counts of its columns can be inserted into any number field with the <b>Σ</b> button.</div></div>
      </div>
      {!locked && (
        <div className={'dropzone' + (over ? ' over' : '')} style={{ padding: '10px 12px', marginTop: 10, borderRadius: 12 }}
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); onAdd(Array.from(e.dataTransfer.files)); }}
          onClick={() => input.current?.click()} role="button" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && input.current?.click()} data-testid="attach-dropzone">
          <Ic.table size={16} /><span style={{ fontSize: 12.5, flexGrow: 1 }}>Drop a .csv / .tsv here or click to choose</span>
          <input ref={input} type="file" multiple accept=".csv,.tsv,.txt" style={{ display: 'none' }} onChange={(e) => { onAdd(Array.from(e.target.files || [])); e.target.value = ''; }} data-testid="attach-input" />
        </div>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginTop: 8 }} data-testid="samples">
        <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sample files to try:</span>
        {SAMPLES.map((x) => <button key={x.name} className="sug" style={{ height: 26, fontSize: 11 }} title={x.about + ' — ' + x.suggest} onClick={() => saveBlob(new Blob([x.text], { type: x.name.endsWith('.tsv') ? 'text/tab-separated-values' : 'text/csv' }), x.name)} data-testid="sample-download"><Ic.download size={11} />{x.name}</button>)}
      </div>
      <div className="stack" style={{ marginTop: 10, gap: 6 }} data-testid="attachment-list">
        {doc.attachments.map((a) => {
          const used = doc.bindings.filter((b) => b.attachmentId === a.id);
          return (
            <div key={a.id} className="sigrow" style={{ alignItems: 'flex-start' }} data-testid="attachment">
              <span style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--purple-l)', color: 'var(--purple-t)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Ic.table size={13} /></span>
              <div style={{ minWidth: 0, flexGrow: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.name}</div>
                <div style={{ fontSize: 11, color: 'var(--ink2)' }}>{a.rows.length} rows × {a.cols.length} columns · numeric: {numericColumns(a).join(', ') || 'none'}</div>
                {used.length > 0 && <div style={{ fontSize: 11, color: 'var(--purple-t)', marginTop: 2 }}>Σ feeds {used.map((b) => template.fields.find((f) => f.key === b.key)?.label || b.key).join(', ')}</div>}
              </div>
              {!locked && <button className="ib" style={{ width: 26, height: 26, borderRadius: 7 }} onClick={() => onRemove(a.id)} aria-label={'Remove ' + a.name} data-testid="attachment-remove"><Ic.x size={10} /></button>}
            </div>
          );
        })}
        {doc.attachments.length === 0 && <div style={{ fontSize: 11.5, color: 'var(--muted)' }} data-testid="attachments-empty">Nothing attached. {numberFields ? 'This template has ' + numberFields + ' number field' + (numberFields === 1 ? '' : 's') + ' that could be calculated.' : 'This template has no number fields to calculate.'}</div>}
      </div>
    </div>
  );
}
