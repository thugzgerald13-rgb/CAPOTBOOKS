// EInvoiceTab.tsx — structured e-invoice (line items, VAT breakdown, withholding).
// ONLY this tab feeds BIR EIS. Billing invoices and SOA do not.
import { useMemo, useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Field, Input, Select, Textarea, Button, EmptyState } from './ui';
import { Plus, Trash2, FileDown, Send, FileSignature, Pencil } from 'lucide-react';
import type { EInvoice, EInvoiceLineItem, InvoiceTemplate } from '../types';
import { listTemplatesFor, getTemplate } from '../lib/invoiceTemplates';
import { downloadEInvoicePdf } from '../lib/invoicePdf';
import { toast } from './ui/Toast';
import { TemplateEditor } from './TemplateEditor';
import { buildEisInvoice, validateEisInvoice } from '../lib/eisBuilder';
import { createTransmissionRecord, loadEisSettings } from '../lib/eisStore';
import { useNavigate } from 'react-router-dom';
import { YearDropdownDateInput } from './ui/YearDropdownDateInput';

const VAT_RATE = 0.12;
const STORAGE_KEY = (clientId: string) => `capot.einvoices.${clientId}`;

function loadEInvoices(clientId: string): EInvoice[] {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY(clientId)) || '[]'); } catch { return []; }
}
function saveEInvoices(clientId: string, list: EInvoice[]) {
  localStorage.setItem(STORAGE_KEY(clientId), JSON.stringify(list));
}

export function EInvoiceTab() {
  const { currentClient, currentClientId, businessProfile, showToast } = useAccounting();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'new' | 'list'>('new');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<InvoiceTemplate | null>(null);
  const [templateId, setTemplateId] = useState<string>('builtin-einvoice-green');

  const nowIso = () => new Date().toISOString().split('T')[0];
  const [invoiceNo, setInvoiceNo] = useState('');
  const [date, setDate] = useState(nowIso());
  const [dueDate, setDueDate] = useState(nowIso());
  const [buyerName, setBuyerName] = useState('');
  const [buyerTin, setBuyerTin] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [buyerEmail, setBuyerEmail] = useState('');
  const [withholdingPct, setWithholdingPct] = useState('0');
  const [remarks, setRemarks] = useState('');
  const [deliveryMethod, setDeliveryMethod] = useState('email');
  const [lineItems, setLineItems] = useState<EInvoiceLineItem[]>([
    { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0, vatType: 'VATable' },
  ]);

  const templates = useMemo(() => currentClientId ? listTemplatesFor(currentClientId, 'e-invoice') : [], [currentClientId, tab]);
  const template = useMemo(() => currentClientId ? getTemplate(currentClientId, templateId) : getTemplate('', templateId), [currentClientId, templateId]);

  const computed = useMemo(() => {
    let vatable = 0, zero = 0, exempt = 0, discountTotal = 0, subtotal = 0;
    for (const li of lineItems) {
      const lineTotal = (li.quantity || 0) * (li.unitPrice || 0);
      const disc = li.discount || 0;
      const net = lineTotal - disc;
      subtotal += lineTotal; discountTotal += disc;
      if (li.vatType === 'VATable') vatable += net;
      else if (li.vatType === 'Zero-Rated') zero += net;
      else exempt += net;
    }
    const outputVat = vatable * VAT_RATE;
    const amountDue = vatable + zero + exempt + outputVat;
    const wht = amountDue * (parseFloat(withholdingPct) || 0) / 100;
    return { subtotal, discountTotal, vatableSales: vatable, zeroRatedSales: zero, exemptSales: exempt, outputVat, withholdingTax: wht, amountDue, netPayable: amountDue - wht };
  }, [lineItems, withholdingPct]);

  const updateLine = (id: string, patch: Partial<EInvoiceLineItem>) =>
    setLineItems(ls => ls.map(l => l.id === id ? { ...l, ...patch } : l));
  const addLine = () => setLineItems(ls => [...ls, { id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0, vatType: 'VATable' }]);
  const removeLine = (id: string) => setLineItems(ls => ls.length > 1 ? ls.filter(l => l.id !== id) : ls);

  const resetForm = () => {
    setInvoiceNo(''); setBuyerName(''); setBuyerTin(''); setBuyerAddress(''); setBuyerEmail('');
    setWithholdingPct('0'); setRemarks('');
    setLineItems([{ id: crypto.randomUUID(), description: '', quantity: 1, unitPrice: 0, vatType: 'VATable' }]);
  };

  const buildRecord = (status: EInvoice['status']): EInvoice => ({
    id: crypto.randomUUID(), clientId: currentClientId || '', invoiceNo, date, dueDate,
    sellerName: businessProfile?.tradeName || businessProfile?.registeredName || '',
    sellerTin: businessProfile?.tin || '', sellerAddress: businessProfile?.address || '',
    sellerEmail: businessProfile?.email || '',
    buyerName, buyerTin, buyerAddress, buyerEmail,
    lineItems, ...computed, currency: 'PHP', remarks, templateId, status,
    deliveryMethod: deliveryMethod as any,
    createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  });

  const handleSave = (status: EInvoice['status']) => {
    if (!invoiceNo.trim() || !buyerName.trim() || !buyerTin.trim()) {
      toast.error('Invoice #, buyer name, and buyer TIN are required for an e-invoice.'); return;
    }
    if (lineItems.every(l => !l.description.trim() || l.unitPrice <= 0)) {
      toast.error('Add at least one line item with a description and amount.'); return;
    }
    const rec = buildRecord(status);
    const list = loadEInvoices(currentClientId!);
    list.unshift(rec); saveEInvoices(currentClientId!, list);
    showToast(status === 'Issued' ? 'E-invoice issued — deliver to buyer electronically' : 'E-invoice saved as draft');
    if (status === 'Issued') resetForm();
    setTab('list');
  };

  // Send to EIS: build the BIR JSON, validate, queue a transmission record, jump to EIS center.
  const handleSendToEis = (inv: EInvoice) => {
    const settings = loadEisSettings(currentClientId!);
    if (!settings?.enabled || !settings?.applicationKey) {
      toast.error('EIS not configured. Open BIR → E-Invoicing (EIS) → Settings first.');
      navigate('/eis-center'); return;
    }
    const eisJson = buildEisInvoice({
      invoice: {
        invoiceNo: inv.invoiceNo, date: inv.date, customerTin: inv.buyerTin,
        customerName: inv.buyerName, customerAddress: inv.buyerAddress,
        vatType: 'VATable', amount: inv.amountDue, netOfVat: inv.vatableSales,
        outputTax: inv.outputVat, description: inv.remarks, paymentType: inv.deliveryMethod,
      } as any,
      profile: businessProfile as any, clientId: currentClientId!,
      docType: 'SI', deliveryMethod: inv.deliveryMethod,
    } as any);
    const issues = validateEisInvoice(eisJson);
    if (issues.length) {
      toast.error(`E-invoice failed EIS validation: ${issues[0].message}`); return;
    }
    createTransmissionRecord({ clientId: currentClientId!, invoiceId: inv.id, invoiceNumber: inv.invoiceNo, eisUniqueId: eisJson.EisUniqueId, docType: 'SI', issueDate: inv.date, amountDue: inv.amountDue, invoiceJson: eisJson });
    // mark e-invoice as queued
    const list = loadEInvoices(currentClientId!).map(e => e.id === inv.id ? { ...e, eisUniqueId: eisJson.EisUniqueId, eisStatus: 'queued' as const, updatedAt: new Date().toISOString() } : e);
    saveEInvoices(currentClientId!, list);
    showToast('E-invoice queued for EIS transmission');
    navigate('/eis-center');
  };

  const handleDownloadPdf = (inv: EInvoice) => {
    try { downloadEInvoicePdf(inv, businessProfile, template); showToast('E-invoice PDF downloaded'); }
    catch { toast.error('Failed to generate PDF'); }
  };

  const eInvoices = currentClientId ? loadEInvoices(currentClientId) : [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {(['new', 'list'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-1.5 rounded-lg text-xs font-bold transition ${tab === t ? 'bg-emerald-600 text-white shadow' : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600'}`}>
              {t === 'new' ? 'New E-Invoice' : `E-Invoices (${eInvoices.length})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <Field label="Template" className="mb-0">
            <div className="flex gap-2">
              <Select value={templateId} onChange={e => setTemplateId(e.target.value)} className="w-48">
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.builtin ? ' (built-in)' : ''}</option>)}
              </Select>
              <Button variant="outline" size="sm" onClick={() => { setEditingTpl(null); setEditorOpen(true); }}><Pencil className="w-4 h-4" /> Customize</Button>
            </div>
          </Field>
        </div>
      </div>

      <div className="rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/30 dark:border-emerald-800 p-3 text-xs text-emerald-900 dark:text-emerald-200 flex items-start gap-2">
        <FileSignature className="w-4 h-4 mt-0.5 shrink-0" />
        <div><strong>E-Invoices feed BIR EIS.</strong> These are structured, system-generated documents with line items and VAT breakdown — valid under RMC 98-2026 when delivered electronically (email/online/QR/app). Billing invoices and SOAs are separate and are <strong>not</strong> transmitted to BIR.</div>
      </div>

      {tab === 'new' ? (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Field label="E-Invoice # *"><Input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="EINV-0001" /></Field>
            <Field label="Date"><YearDropdownDateInput value={date} onChange={value => setDate(value)} className="input-base" /></Field>
            <Field label="Due date"><YearDropdownDateInput value={dueDate} onChange={value => setDueDate(value)} className="input-base" /></Field>
            <Field label="Delivery method (RMC 98-2026)">
              <Select value={deliveryMethod} onChange={e => setDeliveryMethod(e.target.value)}>
                <option value="email">Email</option><option value="online_viewing">Online viewing</option>
                <option value="qr_code">QR code</option><option value="mobile_app">Mobile app</option><option value="web_platform">Web platform</option>
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Buyer name *"><Input value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Company / Full name" /></Field>
            <Field label="Buyer TIN * (000-000-000 for walk-in above ₱1k not allowed)"><Input value={buyerTin} onChange={e => setBuyerTin(e.target.value)} placeholder="000-000-000-000" /></Field>
            <Field label="Buyer address"><Input value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} /></Field>
            <Field label="Buyer email (for electronic delivery)"><Input type="email" value={buyerEmail} onChange={e => setBuyerEmail(e.target.value)} /></Field>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Line items</span>
              <Button variant="outline" size="sm" onClick={addLine}><Plus className="w-4 h-4" /> Add line</Button>
            </div>
            <div className="space-y-2">
              {lineItems.map((li, i) => (
                <div key={li.id} className="grid grid-cols-12 gap-2 items-end">
                  <div className="col-span-5"><Field label={i === 0 ? 'Description' : ' '}><Input value={li.description} onChange={e => updateLine(li.id, { description: e.target.value })} placeholder="Item / service" /></Field></div>
                  <div className="col-span-2"><Field label={i === 0 ? 'Qty' : ' '}><Input type="number" value={li.quantity || ''} onChange={e => updateLine(li.id, { quantity: parseFloat(e.target.value) || 0 })} /></Field></div>
                  <div className="col-span-2"><Field label={i === 0 ? 'Unit price' : ' '}><Input type="number" value={li.unitPrice || ''} onChange={e => updateLine(li.id, { unitPrice: parseFloat(e.target.value) || 0 })} /></Field></div>
                  <div className="col-span-2"><Field label={i === 0 ? 'VAT type' : ' '}><Select value={li.vatType} onChange={e => updateLine(li.id, { vatType: e.target.value as any })}><option>VATable</option><option>Zero-Rated</option><option>VAT Exempt</option></Select></Field></div>
                  <div className="col-span-1 flex justify-center"><button onClick={() => removeLine(li.id)} className="text-slate-300 hover:text-rose-500 p-2"><Trash2 className="w-4 h-4" /></button></div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl">
            <Field label="Withholding tax %"><Input type="number" value={withholdingPct} onChange={e => setWithholdingPct(e.target.value)} /></Field>
            <Field label="Subtotal"><Input readOnly value={`₱${computed.subtotal.toFixed(2)}`} className="bg-slate-100" /></Field>
            <Field label="Output VAT (12%)"><Input readOnly value={`₱${computed.outputVat.toFixed(2)}`} className="bg-slate-100" /></Field>
            <Field label="Amount due"><Input readOnly value={`₱${computed.amountDue.toFixed(2)}`} className="bg-emerald-50 font-bold" /></Field>
          </div>
          <Field label="Remarks"><Textarea rows={2} value={remarks} onChange={e => setRemarks(e.target.value)} /></Field>

          <div className="flex flex-wrap gap-2 justify-end">
            <Button variant="ghost" onClick={resetForm}>Clear</Button>
            <Button variant="outline" onClick={() => handleSave('Draft')}>Save draft</Button>
            <Button variant="primary" onClick={() => handleSave('Issued')}><Send className="w-4 h-4" /> Issue e-invoice</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {eInvoices.length === 0 && <EmptyState title="No e-invoices yet" description="Create your first structured e-invoice — only these feed BIR EIS." />}
          {eInvoices.map(inv => (
            <div key={inv.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{inv.invoiceNo}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${inv.status === 'Issued' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>{inv.status}</span>
                  {inv.eisStatus && <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase border ${inv.eisStatus === 'accepted' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : inv.eisStatus === 'rejected' ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>EIS {inv.eisStatus}</span>}
                </div>
                <div className="text-xs text-slate-500 mt-1">{inv.buyerName} · {inv.date} · ₱{inv.amountDue.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => handleDownloadPdf(inv)}><FileDown className="w-4 h-4" /> PDF</Button>
                <Button variant="primary" size="sm" onClick={() => handleSendToEis(inv)}><FileSignature className="w-4 h-4" /> Send to EIS</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <TemplateEditor open={editorOpen} onClose={() => setEditorOpen(false)} clientId={currentClientId!} docType="e-invoice"
        editing={editingTpl}
        onSave={(tpl) => { import('../lib/invoiceTemplates').then(m => { m.saveTemplate(currentClientId!, tpl); setTemplateId(tpl.id); showToast('Template saved'); }); }}
        onDelete={(id) => { import('../lib/invoiceTemplates').then(m => { m.deleteTemplate(currentClientId!, id); setTemplateId('builtin-einvoice-green'); }); }} />
    </div>
  );
}
