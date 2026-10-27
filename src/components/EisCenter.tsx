// EisCenter.tsx — BIR Electronic Invoicing System (EIS) control center.
//
// Three tabs:
//   Settings   — EIS certification / PTT config, signing keys, environment.
//   Transmit   — transmission queue with 3-day deadline tracking, bulk
//                submit (1–100 invoices/batch), resend, and BIR ack inquiry.
//   Builder    — pick a billing invoice, preview/validate the v2.01 JSON,
//                copy it, or queue it for transmission.
//
// Reference: https://bir-eis.ph/ — EIS API docs, JSON format v2.01.

import { useMemo, useState } from 'react';
import { PageHeader, Button, Badge, Card, CardContent, Input, Select, Field, Modal, toast } from './ui';
import { useAccounting } from '../context/AccountingContext';
import { FileJson, Send, CheckCircle2, XCircle, Clock, AlertTriangle, Settings as SettingsIcon, UploadCloud, KeyRound, ShieldCheck, Copy, Eye, RefreshCw } from 'lucide-react';
import {
  buildEisInvoice, validateEisInvoice, buildEisUniqueId, decodeEisUniqueId,
} from '../lib/eisBuilder';
import { generateSigningKeyPair, encryptPrivateKeyForStorage } from '../lib/eisCrypto';
import { submitInvoices, inquireResult } from '../lib/eisApi';
import {
  loadEisSettings, saveEisSettings, listTransmissions, createTransmissionRecord,
  markSubmitted, markAck, markError, nextEisSequence, transmissionDeadline,
  deadlineStatus, syncTransmissionsFromServer,
} from '../lib/eisStore';
import {
  EIS_MAX_INVOICES_PER_BATCH, EIS_TRANSMIT_WINDOW_DAYS,
  type EisInvoiceJson, type EisSettings, type EisTransmission,
} from '../lib/eisTypes';
import type { BillingInvoice } from '../types';
import { YearDropdownDateInput } from './ui/YearDropdownDateInput';

type Tab = 'transmit' | 'builder' | 'settings';

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  queued: { label: 'Queued', className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300' },
  submitted: { label: 'Submitted', className: 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300' },
  accepted: { label: 'Accepted by BIR', className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300' },
  rejected: { label: 'Rejected', className: 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300' },
  cancelled: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
  draft: { label: 'Draft', className: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
};

function DeadlineBadge({ issueDate, status }: { issueDate: string; status: EisTransmission['status'] }) {
  const st = deadlineStatus(issueDate, status);
  if (st === 'transmitted') return null;
  const deadline = transmissionDeadline(issueDate);
  const label = st === 'overdue' ? 'Overdue' : st === 'due-soon' ? 'Due soon' : 'Due';
  const cls = st === 'overdue'
    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
    : st === 'due-soon'
      ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300';
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full ${cls}`} title={`Transmit by ${deadline.toLocaleDateString()} (within ${EIS_TRANSMIT_WINDOW_DAYS} calendar days of invoice date)`}>
      <Clock className="w-3 h-3" /> {label} · {deadline.toLocaleDateString()}
    </span>
  );
}

export function EisCenter() {
  const { currentClient, businessProfile } = useAccounting();
  const clientId = currentClient?.id || 'default';
  const [tab, setTab] = useState<Tab>('transmit');
  const [, forceRefresh] = useState(0);
  const refresh = () => forceRefresh(n => n + 1);

  const settings: EisSettings = useMemo(() => loadEisSettings(clientId) || {
    clientId, enabled: false, environment: 'sandbox', applicationKey: '',
    taxpayerTin: businessProfile?.tin || '', branchCode: '00000',
    systemType: 'CAS', useEdgeProxy: true,
    coveredCategory: 'cas-cba-software', defaultDeliveryMethod: 'email',
  }, [clientId, businessProfile?.tin]);

  const transmissions = useMemo(() => listTransmissions(clientId), [clientId, tab]); // eslint-disable-line

  const billingInvoices: BillingInvoice[] = currentClient?.billingInvoices || [];

  const stats = useMemo(() => {
    const s = { queued: 0, submitted: 0, accepted: 0, rejected: 0, overdue: 0 };
    for (const t of transmissions) {
      if (t.status === 'queued') s.queued++;
      if (t.status === 'submitted') s.submitted++;
      if (t.status === 'accepted') s.accepted++;
      if (t.status === 'rejected') s.rejected++;
      if (deadlineStatus(t.issueDate, t.status) === 'overdue') s.overdue++;
    }
    return s;
  }, [transmissions]);

  return (
    <div className="space-y-4">
      <PageHeader
        title="BIR E-Invoicing (EIS)"
        icon={<FileJson className="w-5 h-5" />}
        badge={<Badge variant="info">{settings.environment === 'production' ? 'Production' : 'Sandbox'}</Badge>}
        actions={
          <Button size="sm" variant="outline" onClick={async () => { await syncTransmissionsFromServer(clientId); refresh(); toast.success('Transmission log synced'); }}>
            <RefreshCw className="w-4 h-4 mr-1" /> Sync
          </Button>
        }
      />

      {/* Compliance banner */}
      <div className="rounded-lg border border-cyan-200 bg-cyan-50 dark:bg-cyan-950/30 dark:border-cyan-800 p-3 text-sm text-cyan-900 dark:text-cyan-200 flex items-start gap-2">
        <ShieldCheck className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          <strong>RMC No. 98-2026 · Issuance deadline 31 December 2026.</strong> Covered taxpayers (e-commerce, LTS/large, CAS/CBA/invoicing-software users) must issue <strong>structured, system-generated e-invoices</strong> delivered to buyers electronically (email / online / QR / app). PDFs, scans, and invoices made in Word/Excel/Google Sheets are <strong>not</strong> e-invoices. Obtain a <strong>Permit to Issue (PTI)</strong> before your first e-invoice, then pass <strong>EIS Certification</strong> within 6 months at <span className="font-mono">eis-cert.bir.gov.ph</span>. Sales reporting to BIR (s.237-A, PTT) is separate and not yet operative. Micro taxpayers (&lt;₱3M/yr) are exempt.
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: 'Queued', value: stats.queued, icon: Clock, cls: 'text-amber-600' },
          { label: 'Submitted', value: stats.submitted, icon: Send, cls: 'text-blue-600' },
          { label: 'Accepted', value: stats.accepted, icon: CheckCircle2, cls: 'text-emerald-600' },
          { label: 'Rejected', value: stats.rejected, icon: XCircle, cls: 'text-rose-600' },
          { label: 'Overdue', value: stats.overdue, icon: AlertTriangle, cls: 'text-rose-600' },
        ].map(s => (
          <Card key={s.label}><CardContent className="p-3">
            <div className="flex items-center gap-2">
              <s.icon className={`w-4 h-4 ${s.cls}`} />
              <span className="text-xs text-slate-500">{s.label}</span>
            </div>
            <div className="text-2xl font-bold mt-1">{s.value}</div>
          </CardContent></Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-slate-200 dark:border-slate-700">
        {([['transmit', 'Transmit Queue', UploadCloud], ['builder', 'Invoice Builder', FileJson], ['settings', 'Settings & Keys', SettingsIcon]] as [Tab, string, any][]).map(([id, label, Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${tab === id ? 'border-cyan-600 text-cyan-700 dark:text-cyan-400' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
            <Icon className="w-4 h-4 inline mr-1.5 -mt-0.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'settings' && <SettingsTab settings={settings} onSaved={refresh} />}
      {tab === 'builder' && <BuilderTab settings={settings} businessProfile={businessProfile} billingInvoices={billingInvoices} clientId={clientId} onQueued={refresh} />}
      {tab === 'transmit' && <TransmitTab settings={settings} transmissions={transmissions} refresh={refresh} />}
    </div>
  );
}

// ===========================================================================
// Settings tab
// ===========================================================================

function SettingsTab({ settings, onSaved }: { settings: EisSettings; onSaved: () => void }) {
  const [form, setForm] = useState<EisSettings>(settings);
  const [passphrase, setPassphrase] = useState('');
  const [keyPairMsg, setKeyPairMsg] = useState('');
  const set = (patch: Partial<EisSettings>) => setForm(f => ({ ...f, ...patch }));

  const save = () => {
    saveEisSettings(form.clientId, form);
    toast.success('EIS settings saved');
    onSaved();
  };

  const generateKeys = async () => {
    if (!passphrase || passphrase.length < 8) { toast.success('Enter a passphrase (min 8 chars) to protect the private key'); return; }
    try {
      const kp = await generateSigningKeyPair();
      const encrypted = await encryptPrivateKeyForStorage(kp.privateJwk, passphrase);
      set({
        signingKeyId: kp.keyId,
        publicKeyJwk: kp.publicJwk,
        privateKeyJwkEncrypted: encrypted,
      });
      setKeyPairMsg(`Key pair generated. Key ID: ${kp.keyId}. Upload the PUBLIC key to the EIS Certification Portal > Settings. Store the passphrase securely — the private key cannot be recovered without it.`);
      toast.success('Signing key pair generated');
    } catch (e: any) {
      toast.error(`Key generation failed: ${e.message}`);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card><CardContent className="p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4" /> PTI & EIS Certification</h4>
        <Field label="Environment">
          <Select value={form.environment} onChange={e => set({ environment: e.target.value as any })}>
            <option value="sandbox">Sandbox (eis-cert.bir.gov.ph)</option>
            <option value="production">Production (eis.bir.gov.ph)</option>
          </Select>
        </Field>
        <Field label="Application Key (from EIS Certification Portal > Settings)">
          <Input type="password" value={form.applicationKey} onChange={e => set({ applicationKey: e.target.value })} placeholder="Paste Application Key" />
        </Field>
        <Field label="Covered-taxpayer category (decides whether mandate applies)">
          <Select value={form.coveredCategory} onChange={e => set({ coveredCategory: e.target.value as any })}>
            <option value="cas-cba-software">CAS / CBA / Invoicing-software user (mandatory)</option>
            <option value="ecommerce">E-commerce / internet-transaction taxpayer</option>
            <option value="lts">Large Taxpayers Service (LTS)</option>
            <option value="eopt-large">Large taxpayer under EOPT Act</option>
            <option value="exporter-cas">Exporter / incentive RBE using CAS/CBA</option>
            <option value="commissioner">Other — required by Commissioner</option>
            <option value="deferred">Deferred group — wait for separate RR</option>
            <option value="micro-exempt">Micro taxpayer (&lt;₱3M/yr) — exempt, voluntary</option>
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Permit to Issue (PTI) No. — REQUIRED before first e-invoice">
            <Input value={form.permitToIssueNumber || ''} onChange={e => set({ permitToIssueNumber: e.target.value })} placeholder="PTI number" />
          </Field>
          <Field label="PTI issue date (6-month certification clock)">
            <YearDropdownDateInput value={form.permitToIssueDate || ''} onChange={value => set({ permitToIssueDate: value })} className="input-base" />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="EIS Certificate Number">
            <Input value={form.eisCertificateNumber || ''} onChange={e => set({ eisCertificateNumber: e.target.value })} placeholder="Issued after sandbox tests pass" />
          </Field>
          <Field label="PTT No. — s.237-A reporting only (future)">
            <Input value={form.permitToTransmitNumber || ''} onChange={e => set({ permitToTransmitNumber: e.target.value })} placeholder="Not yet required" />
          </Field>
        </div>
        <Field label="Default e-invoice delivery method to buyer (RMC 98-2026 IV.4(b))">
          <Select value={form.defaultDeliveryMethod} onChange={e => set({ defaultDeliveryMethod: e.target.value as any })}>
            <option value="email">Email (PDF + structured JSON link)</option>
            <option value="online_viewing">Online viewing / web link</option>
            <option value="qr_code">QR code (buyer scans to view)</option>
            <option value="mobile_app">Mobile application</option>
            <option value="web_platform">Web platform / portal</option>
          </Select>
        </Field>
        <Field label="System type (decides v2.01 schema variant)">
          <Select value={form.systemType} onChange={e => set({ systemType: e.target.value as any })}>
            <option value="CAS">CAS / CBA / Invoicing software</option>
            <option value="CRM/POS">CRM / POS</option>
          </Select>
        </Field>
        <Field label="Whitelisted server IPs (comma-separated — must match EIS portal)">
          <Input value={(form.whitelistedIps || []).join(', ')} onChange={e => set({ whitelistedIps: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} placeholder="203.0.113.10, 203.0.113.11" />
        </Field>
      </CardContent></Card>

      <Card><CardContent className="p-4 space-y-3">
        <h4 className="font-semibold flex items-center gap-2"><KeyRound className="w-4 h-4" /> Signing Keys & Transmission</h4>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Taxpayer TIN (9 digits)">
            <Input value={form.taxpayerTin} onChange={e => set({ taxpayerTin: e.target.value.replace(/\D/g, '').slice(0, 9) })} placeholder="123456789" />
          </Field>
          <Field label="Branch Code (5 digits, 00000 = HO)">
            <Input value={form.branchCode} onChange={e => set({ branchCode: e.target.value.replace(/\D/g, '').slice(0, 5).padStart(5, '0') })} placeholder="00000" />
          </Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.useEdgeProxy} onChange={e => set({ useEdgeProxy: e.target.checked })} className="rounded" />
          Use server-side transmit proxy (recommended — keeps private key + fixed IP off the browser)
        </label>
        {!form.useEdgeProxy && (
          <div className="rounded border border-amber-300 bg-amber-50 dark:bg-amber-950/30 p-2 text-xs text-amber-800">
            Direct browser mode is for sandbox testing only. It requires the BIR public key and your signing private key in the browser, and BIR production whitelists fixed server IPs — the browser IP will be rejected.
          </div>
        )}
        {!form.signingKeyId && (
          <div className="space-y-2">
            <Field label="Passphrase to protect the private key (sandbox key generation)">
              <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} placeholder="Min 8 characters" />
            </Field>
            <Button variant="outline" size="sm" onClick={generateKeys}><KeyRound className="w-4 h-4 mr-1" /> Generate RS256 signing key pair</Button>
          </div>
        )}
        {form.signingKeyId && (
          <div className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <div>Signing Key ID: <span className="font-mono">{form.signingKeyId}</span></div>
            <div>Public key fingerprint registered with EIS: <span className="font-mono">{(form.publicKeyJwk?.kid || '').slice(0, 16) || '(upload to portal)'}</span></div>
          </div>
        )}
        {keyPairMsg && <div className="text-xs text-emerald-700 dark:text-emerald-400 rounded border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 p-2">{keyPairMsg}</div>}
        <Field label="Callback URL (optional — BIR posts async results here)">
          <Input value={form.callbackUrl || ''} onChange={e => set({ callbackUrl: e.target.value })} placeholder="https://yourapp.com/api/eis/callback" />
        </Field>
        <Button onClick={save}>Save EIS settings</Button>
      </CardContent></Card>
    </div>
  );
}

// ===========================================================================
// Builder tab — pick invoice → preview/validate v2.01 JSON → queue
// ===========================================================================

function BuilderTab({ settings, businessProfile, billingInvoices, clientId, onQueued }: {
  settings: EisSettings; businessProfile: any; billingInvoices: BillingInvoice[]; clientId: string; onQueued: () => void;
}) {
  const [selectedId, setSelectedId] = useState('');
  const [docType, setDocType] = useState<'SI' | 'OR'>('SI');
  const [built, setBuilt] = useState<EisInvoiceJson | null>(null);
  const [showJson, setShowJson] = useState(false);

  const selected = billingInvoices.find(b => b.id === selectedId);
  const issues = built ? validateEisInvoice(built) : [];

  const build = () => {
    if (!selected) return;
    const seq = nextEisSequence(clientId, selected.date);
    const inv = buildEisInvoice({
      invoice: selected,
      sellerProfile: { ...businessProfile, tin: settings.taxpayerTin || businessProfile?.tin, branchCode: settings.branchCode },
      sequence: seq,
      docType,
    });
    setBuilt(inv);
    setShowJson(true);
  };

  const queueForTransmit = () => {
    if (!built || !selected) return;
    createTransmissionRecord({
      clientId,
      invoiceId: selected.id,
      invoiceNumber: selected.invoiceNo,
      eisUniqueId: built.EisUniqueId,
      docType: built.DocType,
      issueDate: built.IssueDate,
      amountDue: built.Summary.AmountDue,
      invoiceJson: built,
    });
    toast.success(`Invoice ${selected.invoiceNo} queued for EIS transmission (EisUniqueId ${built.EisUniqueId})`);
    onQueued();
  };

  const copyJson = async () => {
    if (!built) return;
    await navigator.clipboard.writeText(JSON.stringify(built, null, 2));
    toast.success('EIS JSON copied to clipboard');
  };

  return (
    <div className="space-y-4">
      <Card><CardContent className="p-4 space-y-3">
        <div className="grid md:grid-cols-3 gap-3">
          <Field label="Billing invoice">
            <Select value={selectedId} onChange={e => setSelectedId(e.target.value)}>
              <option value="">— Select an invoice —</option>
              {billingInvoices.map(b => <option key={b.id} value={b.id}>{b.invoiceNo} · {b.customerName} · ₱{b.amount.toFixed(2)}</option>)}
            </Select>
          </Field>
          <Field label="Document type">
            <Select value={docType} onChange={e => setDocType(e.target.value as any)}>
              <option value="SI">SI — Sales Invoice</option>
              <option value="OR">OR — Official Receipt</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button onClick={build} disabled={!selectedId}><Eye className="w-4 h-4 mr-1" /> Build & validate</Button>
          </div>
        </div>
        {selected && (
          <div className="text-xs text-slate-500">
            Invoice date {selected.date} · VAT type {selected.vatType} · Amount ₱{selected.amount.toFixed(2)}
            {built && <> · EisUniqueId <span className="font-mono">{built.EisUniqueId}</span> ({decodeEisUniqueId(built.EisUniqueId) ? 'valid 24-char' : 'invalid'})</>}
          </div>
        )}
      </CardContent></Card>

      {built && (
        <>
          <Card><CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-semibold">Validation result</h4>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={copyJson}><Copy className="w-4 h-4 mr-1" /> Copy JSON</Button>
                <Button size="sm" variant="outline" onClick={() => setShowJson(s => !s)}>{showJson ? 'Hide' : 'Show'} JSON</Button>
                <Button size="sm" onClick={queueForTransmit} disabled={issues.length > 0}><UploadCloud className="w-4 h-4 mr-1" /> Queue for transmission</Button>
              </div>
            </div>
            {issues.length === 0 ? (
              <div className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Valid — schema, TIN/branch format, EisUniqueId, line math and VAT totals all pass. Ready to sign (JWS) and transmit.</div>
            ) : (
              <ul className="text-sm space-y-1">
                {issues.map((i, idx) => (
                  <li key={idx} className="text-rose-700 dark:text-rose-400 flex items-start gap-2">
                    <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                    <span><span className="font-mono text-xs">{i.code}</span> {i.field}: {i.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent></Card>

          {showJson && (
            <Card><CardContent className="p-0">
              <pre className="text-xs p-4 overflow-x-auto bg-slate-900 text-slate-100 rounded-b-lg max-h-96 overflow-y-auto">{JSON.stringify(built, null, 2)}</pre>
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  );
}

// ===========================================================================
// Transmit tab — queue, bulk submit, inquiry
// ===========================================================================

function TransmitTab({ settings, transmissions, refresh }: {
  settings: EisSettings; transmissions: EisTransmission[]; refresh: () => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const queued = transmissions.filter(t => t.status === 'queued' || t.status === 'rejected');
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else if (next.size < EIS_MAX_INVOICES_PER_BATCH) next.add(id);
    setSelected(next);
  };

  const doSubmit = async () => {
    setBusy(true);
    setConfirmOpen(false);
    try {
      const batch = transmissions.filter(t => selected.has(t.id));
      const invoices = batch.map(t => t.invoiceJson!).filter(Boolean);
      if (invoices.length === 0) throw new Error('Selected invoices have no stored JSON — rebuild them in the Builder tab');
      const result = await submitInvoices(invoices, settings);
      for (const t of batch) markSubmitted(t.clientId, t.id, result.batchId);
      toast.success(`Submitted ${invoices.length} invoice(s) — batch ${result.batchId}. Check results via Inquiry.`);
      setSelected(new Set());
      refresh();
    } catch (e: any) {
      for (const id of selected) markError(settings.clientId, id, e.message);
      toast.error(`Transmission failed: ${e.message}`);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const doInquiry = async () => {
    setBusy(true);
    try {
      const pending = transmissions.filter(t => t.status === 'submitted');
      if (pending.length === 0) { toast.success('No submitted invoices awaiting ack'); return; }
      const results = await inquireResult(pending.map(t => t.eisUniqueId), settings);
      for (const r of results) {
        const t = pending.find(p => p.eisUniqueId === r.eisUniqueId);
        if (t) markAck(t.clientId, t.id, r.code, r.message);
      }
      toast.success(`Inquiry updated for ${results.length} invoice(s)`);
      refresh();
    } catch (e: any) {
      toast.error(`Inquiry failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={selected.size === 0 || busy}>
          <Send className="w-4 h-4 mr-1" /> Submit selected ({selected.size}/{EIS_MAX_INVOICES_PER_BATCH})
        </Button>
        <Button size="sm" variant="outline" onClick={doInquiry} disabled={busy}>
          <RefreshCw className="w-4 h-4 mr-1" /> Inquiry BIR ack
        </Button>
        <span className="text-xs text-slate-500 ml-auto">Batches of 1–{EIS_MAX_INVOICES_PER_BATCH} invoices · signed JWS · AES-256 encrypted</span>
      </div>

      {transmissions.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-slate-500">
          No transmissions yet. Build invoices in the <strong>Invoice Builder</strong> tab and queue them here.
        </CardContent></Card>
      ) : (
        <div className="card-surface rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 uppercase">
              <tr>
                <th className="p-2 text-left w-8"></th>
                <th className="p-2 text-left">Invoice</th>
                <th className="p-2 text-left">EisUniqueId</th>
                <th className="p-2 text-right">Amount</th>
                <th className="p-2 text-left">Status</th>
                <th className="p-2 text-left">Deadline / Ack</th>
              </tr>
            </thead>
            <tbody>
              {transmissions.map(t => {
                const st = STATUS_STYLES[t.status] || STATUS_STYLES.draft;
                const selectable = t.status === 'queued' || t.status === 'rejected';
                return (
                  <tr key={t.id} className="border-t border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="p-2">
                      {selectable && <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />}
                    </td>
                    <td className="p-2">
                      <div className="font-medium">{t.invoiceNumber}</div>
                      <div className="text-xs text-slate-500">{t.docType} · {t.issueDate}</div>
                    </td>
                    <td className="p-2 font-mono text-xs">{t.eisUniqueId}</td>
                    <td className="p-2 text-right">₱{t.amountDue.toFixed(2)}</td>
                    <td className="p-2">
                      <span className={`inline-block text-[11px] px-2 py-0.5 rounded-full ${st.className}`}>{st.label}</span>
                      {t.birAckCode && <div className="text-[11px] font-mono text-slate-500 mt-1">{t.birAckCode}{t.birAckMessage ? ` · ${t.birAckMessage}` : ''}</div>}
                      {t.lastError && <div className="text-[11px] text-rose-600 mt-1 truncate max-w-[200px]" title={t.lastError}>{t.lastError}</div>}
                    </td>
                    <td className="p-2"><DeadlineBadge issueDate={t.issueDate} status={t.status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Modal open={confirmOpen} onClose={() => setConfirmOpen(false)} title="Confirm EIS transmission">
        <div className="space-y-3 text-sm">
          <p>You are about to transmit <strong>{selected.size}</strong> invoice(s) to the BIR EIS <strong>{settings.environment}</strong> environment.</p>
          <ul className="list-disc pl-5 text-xs text-slate-600 dark:text-slate-400 space-y-1">
            <li>Each invoice is signed with JWS (RS256) and encrypted with AES-256-GCM.</li>
            <li>The request carries an HMAC-SHA256 signature using your Application Key.</li>
            <li>After submission, use <em>Inquiry BIR ack</em> to fetch per-invoice acceptance codes.</li>
            <li>Rejected invoices can be corrected in the Builder tab and re-submitted.</li>
          </ul>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={doSubmit} disabled={busy}>{busy ? 'Transmitting…' : 'Transmit now'}</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
