import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatTIN } from '../lib/utils';
import { CreditCard, Plus, Trash2, RefreshCw, CheckCircle2, FileDown, Link2, Bell, FileSignature } from 'lucide-react';
import { getTransmissionByInvoice } from '../lib/eisStore';
import { EmptyState } from './ui/EmptyState';
import { DEFAULT_CRJ_COLUMNS } from './CashReceiptsJournal';
import { BillingInvoice, JournalEntry } from '../types';
import { downloadInvoicePdf, copyPaymentMessage, openPaymentReminderEmail, downloadTemplatedInvoicePdf } from '../lib/invoicePdf';
import { toast } from './ui/Toast';
import { EInvoiceTab } from './EInvoiceTab';
import { SoaTab } from './SoaTab';
import { TemplateEditor } from './TemplateEditor';
import { listTemplatesFor, getTemplate } from '../lib/invoiceTemplates';
import { useMemo } from 'react';
import type { InvoiceTemplate } from '../types';
import { Pencil } from 'lucide-react';
import { useGranularPermissions } from '../lib/useGranularPermissions';
import { YearDropdownDateInput } from './ui/YearDropdownDateInput';

const CASH_RECEIPT_PAYMENT_TYPES = ['Cash', 'Check', 'E-Payment', 'Bank Transfer'];

function addInterval(dateStr: string, frequency: 'Monthly' | 'Quarterly' | 'Annually'): string {
  const d = new Date(dateStr);
  if (frequency === 'Monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'Quarterly') d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

export function Billing() {
  const { currentClient, currentClientId, saveBillingInvoice, deleteBillingInvoice, saveSale, saveJournalEntry, showToast, businessProfile } = useAccounting();
  const navigate = useNavigate();
  const { canAction: canBillingAction, canDropdownOption: canBillingDropdown } = useGranularPermissions('billing');
  const { canAction: canEisAction } = useGranularPermissions('eis_center');
  const billingPaymentOptions = [
    { value: 'Cash', label: 'Cash', permission: 'cash' },
    { value: 'Check', label: 'Check', permission: 'check' },
    { value: 'E-Payment', label: 'E-Payment', permission: 'e_payment' },
    { value: 'Bank Transfer', label: 'Bank Transfer', permission: 'bank_transfer' },
    { value: 'Credit Card', label: 'Credit Card', permission: 'credit_card' },
    { value: 'On Account', label: 'On Account', permission: 'on_account' },
  ].filter((option) => canBillingDropdown('payment_type', option.permission));
  const canInvoiceTab = canBillingDropdown('document_type', 'invoice');
  const canSoaTab = canBillingDropdown('document_type', 'statement_of_account');
  const canEInvoiceTab = canEisAction('view');
  const eisBadgeFor = (invoiceId: string) => {
    const t = currentClientId ? getTransmissionByInvoice(currentClientId, invoiceId) : undefined;
    if (!t) return null;
    const map: Record<string, { label: string; cls: string }> = {
      queued: { label: 'EIS Queued', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
      submitted: { label: 'EIS Submitted', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
      accepted: { label: 'EIS Accepted', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
      rejected: { label: 'EIS Rejected', cls: 'bg-rose-50 text-rose-700 border-rose-200' },
      cancelled: { label: 'EIS Cancelled', cls: 'bg-slate-100 text-slate-600 border-slate-200' },
    };
    const s = map[t.status];
    if (!s) return null;
    return <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${s.cls}`} title={`EisUniqueId: ${t.eisUniqueId}`}>{s.label}</span>;
  };

  const today = new Date().toISOString().split('T')[0];

  // Form state
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState(today);
  const [invoiceNo, setInvoiceNo] = useState('');
  const [customerTin, setCustomerTin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [vatType, setVatType] = useState('VATable');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'Monthly' | 'Quarterly' | 'Annually'>('Monthly');

  const [statusFilter, setStatusFilter] = useState<'All' | 'Outstanding' | 'Overdue' | 'Paid'>('All');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payPaymentType, setPayPaymentType] = useState('Cash');
  // Tabs: billing invoice (NOT for EIS) / e-invoice (feeds EIS) / SOA (NOT for EIS)
  const [activeTab, setActiveTab] = useState<'billing' | 'e-invoice' | 'soa'>('billing');
  const [templateId, setTemplateId] = useState<string>('builtin-standard-blue');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<InvoiceTemplate | null>(null);
  const templates = useMemo(() => currentClientId ? listTemplatesFor(currentClientId, 'billing') : [], [currentClientId, activeTab]);
  const selectedTemplate = useMemo(() => currentClientId ? getTemplate(currentClientId, templateId) : getTemplate('', templateId), [currentClientId, templateId]);

  if (!currentClient || !currentClientId) return null;

  const invoices = currentClient.billingInvoices || [];

  const grossAmount = parseFloat(amount) || 0;
  const isVatable = vatType === 'VATable';
  const netOfVat = isVatable ? grossAmount / 1.12 : grossAmount;
  const outputTax = isVatable ? grossAmount - netOfVat : 0;

  const getStatus = (inv: BillingInvoice): 'Outstanding' | 'Overdue' | 'Paid' => {
    if (inv.status === 'Paid') return 'Paid';
    return inv.dueDate < today ? 'Overdue' : 'Outstanding';
  };

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter === 'All') return true;
    return getStatus(inv) === statusFilter;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const handleAddInvoice = () => {
    if (!canBillingAction('add')) { showToast('Your profile does not have permission to create invoices.'); return; }
    if (!canInvoiceTab) { showToast('Invoice creation is not enabled for your profile.'); return; }
    if (!invoiceNo.trim() || !customerTin.trim() || !customerName.trim() || !customerAddress.trim()) {
      alert('Invoice #, Customer TIN, Customer Name, and Customer Address are all required.');
      return;
    }
    if (!date || !dueDate || !amount) {
      alert('Enter date, due date, and amount.');
      return;
    }

    const newInvoice: BillingInvoice = {
      id: crypto.randomUUID(),
      date,
      dueDate,
      invoiceNo,
      customerTin,
      customerName,
      customerAddress,
      vatType,
      amount: grossAmount,
      netOfVat,
      outputTax,
      description,
      status: 'Outstanding',
      isRecurring,
      ...(isRecurring ? { recurrenceFrequency, nextBillingDate: addInterval(date, recurrenceFrequency) } : {})
    };

    saveBillingInvoice(newInvoice.id, newInvoice).catch((e) => { console.error(e); showToast('Failed to create invoice'); });

    showToast(isRecurring ? 'Recurring invoice created' : 'Invoice created');

    setInvoiceNo('');
    setCustomerTin('');
    setCustomerName('');
    setCustomerAddress('');
    setAmount('');
    setDescription('');
    setIsRecurring(false);
  };

  const handleGenerateNext = (template: BillingInvoice) => {
    if (!canBillingAction('add')) { showToast('Your profile does not have permission to create invoices.'); return; }
    if (!template.nextBillingDate || !template.recurrenceFrequency) return;
    const newDueDate = addInterval(template.nextBillingDate, template.recurrenceFrequency);

    const generated: BillingInvoice = {
      ...template,
      id: crypto.randomUUID(),
      date: template.nextBillingDate,
      dueDate: newDueDate,
      status: 'Outstanding',
      isRecurring: false,
      nextBillingDate: undefined,
      recurrenceFrequency: undefined,
      parentInvoiceId: template.id,
      datePaid: undefined,
      paymentType: undefined
    };

    const updatedTemplate: BillingInvoice = {
      ...template,
      nextBillingDate: addInterval(template.nextBillingDate, template.recurrenceFrequency)
    };

    Promise.all([saveBillingInvoice(updatedTemplate.id, updatedTemplate), saveBillingInvoice(generated.id, generated)]).catch((e) => { console.error(e); showToast('Failed to generate invoice'); });
    showToast(`Generated invoice for ${generated.date}`);
  };

  const buildCashReceiptEntry = (inv: BillingInvoice, paymentType: string): JournalEntry => {
    const columns = currentClient.crjColumns || DEFAULT_CRJ_COLUMNS;
    const colIds = new Set(columns.map(c => c.id));
    const values: Record<string, string> = {};
    if (colIds.has('date')) values['date'] = today;
    if (colIds.has('reference')) values['reference'] = inv.invoiceNo;
    if (colIds.has('description')) values['description'] = `Billing - ${inv.customerName}`;
    if (colIds.has('post_ref')) values['post_ref'] = inv.customerTin;
    if (colIds.has('cash')) values['cash'] = inv.amount.toFixed(2);
    if (colIds.has('sales')) values['sales'] = inv.netOfVat.toFixed(2);
    if (colIds.has('sundry') && inv.outputTax > 0) values['sundry'] = inv.outputTax.toFixed(2);
    return { id: crypto.randomUUID(), values };
  };

  const handleConfirmPaid = (inv: BillingInvoice) => {
    if (!canBillingAction('post')) { showToast('Your profile does not have permission to post invoice payments.'); return; }
    const payment = billingPaymentOptions.find((option) => option.value === payPaymentType);
    if (!payment || !canBillingDropdown('payment_type', payment.permission)) { showToast('The selected payment method is not permitted for your profile.'); return; }
    const updatedInvoice: BillingInvoice = {
      ...inv,
      status: 'Paid',
      datePaid: today,
      paymentType: payPaymentType
    };

    // Recognize income now that payment has been collected, reusing the same
    // Sale shape / posting logic the Income form uses.
    const newSale = {
      id: Date.now(),
      datMonthYear: undefined,
      date: today,
      ref: inv.invoiceNo,
      paymentType: payPaymentType,
      buyerTin: inv.customerTin,
      buyerName: inv.customerName,
      buyerAddress: inv.customerAddress,
      vatType: inv.vatType,
      amount: inv.amount,
      netOfVat: inv.netOfVat,
      outputTax: inv.outputTax,
      incomeType: '',
      desc: inv.description ? `Billing: ${inv.description}` : `Billing invoice ${inv.invoiceNo}`
    };

    const crjEntry = CASH_RECEIPT_PAYMENT_TYPES.includes(payPaymentType)
      ? { ...buildCashReceiptEntry(inv, payPaymentType), auto: true, autoSource: 'billing' }
      : null;

    Promise.all([
      saveBillingInvoice(updatedInvoice.id, updatedInvoice),
      saveSale(String(newSale.id), newSale),
      ...(crjEntry ? [saveJournalEntry('CRJ', crjEntry)] : [])
    ]).then(() => {
      showToast('Invoice marked as paid and recorded as income');
      setPayingId(null);
    }).catch((e) => {
      console.error(e);
      showToast('Failed to record payment');
    });
    showToast('Invoice marked as paid and recorded as income');
    setPayingId(null);
  };

  const handleDelete = (id: string) => {
    if (!canBillingAction('delete')) { showToast('Your profile does not have permission to delete invoices.'); return; }
    deleteBillingInvoice(id).catch((e) => { console.error(e); showToast('Failed to delete invoice'); });
  };
  // Run 007 / T007 — PDF export, payment link copy, email reminder
  const handleDownloadPdf = (inv: BillingInvoice) => {
    if (!canBillingAction('print')) { showToast('Your profile does not have permission to print invoices.'); return; }
    try { downloadTemplatedInvoicePdf(inv, businessProfile, selectedTemplate); showToast('Invoice PDF downloaded'); }
    catch { showToast('Failed to generate PDF'); }
  };
  const handleCopyPaymentLink = async (inv: BillingInvoice) => {
    if (!canBillingAction('edit')) { showToast('Your profile does not have permission to manage invoice follow-ups.'); return; }
    const ok = await copyPaymentMessage(inv, businessProfile);
    showToast(ok ? 'Payment details copied — paste to your customer' : 'Could not copy payment details');
  };
  const handleSendReminder = (inv: BillingInvoice) => {
    if (!canBillingAction('edit')) { showToast('Your profile does not have permission to manage invoice follow-ups.'); return; }
    openPaymentReminderEmail(inv, businessProfile);
    toast.info(`Payment reminder drafted for ${inv.invoiceNo}`);
  };

  const statusBadge = (status: 'Outstanding' | 'Overdue' | 'Paid') => {
    if (status === 'Paid') return 'text-emerald-700 bg-emerald-50 border-emerald-200 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-900';
    if (status === 'Overdue') return 'text-rose-700 bg-rose-50 border-rose-200 dark:text-rose-300 dark:bg-rose-950/30 dark:border-rose-900';
    return 'text-amber-700 bg-amber-50 border-amber-200 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-900';
  };

  const outstandingTotal = invoices.filter(i => getStatus(i) !== 'Paid').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Billing" icon={<CreditCard className="w-5 h-5 text-indigo-500" />} />
      <div className="p-4 md:p-6 flex-1">
      {/* Tab navigation — only E-Invoice feeds BIR EIS */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {([
            ['billing', 'Billing Invoice', false, canInvoiceTab],
            ['e-invoice', 'E-Invoice (EIS)', true, canEInvoiceTab],
            ['soa', 'SOA', false, canSoaTab],
          ] as const).filter(([, , , allowed]) => allowed).map(([key, label, isEis]) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-2 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${activeTab === key ? (isEis ? 'bg-emerald-600 text-white shadow' : 'bg-indigo-600 text-white shadow') : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'}`}>
              {label}
              {isEis && <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black ${activeTab === key ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-700'}`}>EIS</span>}
            </button>
          ))}
        </div>
        {activeTab === 'billing' && canInvoiceTab && (
          <div className="flex items-center gap-2">
            <select value={templateId} onChange={e => setTemplateId(e.target.value)} className="text-xs font-bold border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 bg-white dark:bg-slate-800">
              {templates.map(t => <option key={t.id} value={t.id}>Template: {t.name}{t.builtin ? ' (built-in)' : ''}</option>)}
            </select>
            {canBillingAction('edit') && <button onClick={() => { setEditingTpl(null); setEditorOpen(true); }} className="text-xs font-bold border border-slate-300 dark:border-slate-600 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Customize
            </button>}
          </div>
        )}
      </div>

      {activeTab === 'e-invoice' && canEInvoiceTab && <EInvoiceTab />}
      {activeTab === 'soa' && canSoaTab && <SoaTab />}
      {activeTab === 'billing' && canInvoiceTab && (<>
      <div className="bg-indigo-50 dark:bg-indigo-900/20 p-4 rounded-2xl mb-6 border border-indigo-100 dark:border-indigo-800 flex justify-between items-center">
        <span className="font-bold text-indigo-700 dark:text-indigo-400">Total Outstanding (incl. Overdue)</span>
        <span className="text-xl font-extrabold text-indigo-600 dark:text-indigo-400">₱{outstandingTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      </div>
      <div className="rounded-lg border border-slate-200 bg-slate-50 dark:bg-slate-800/50 dark:border-slate-700 p-3 mb-4 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2">
        <span className="font-bold shrink-0">Note:</span>
        <span>Billing invoices are demand-for-payment documents and are <strong>not</strong> transmitted to BIR. For BIR E-Invoicing (EIS), use the <strong className="text-emerald-600">E-Invoice (EIS)</strong> tab — only structured e-invoices qualify under RMC 98-2026.</span>
      </div>

      {canBillingAction('add') && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
        <div>
          <label className="form-label">Date</label>
          <YearDropdownDateInput value={date} onChange={value => setDate(value)} className="form-input" />
        </div>
        <div>
          <label className="form-label">Due Date</label>
          <YearDropdownDateInput value={dueDate} onChange={value => setDueDate(value)} className="form-input" />
        </div>
        <div>
          <label className="form-label">Invoice # <span className="text-rose-500">*</span></label>
          <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="INV-001" required className="form-input" />
        </div>
        <div>
          <label className="form-label">Customer TIN <span className="text-rose-500">*</span></label>
          <input type="text" value={customerTin} onChange={e => setCustomerTin(formatTIN(e.target.value))} placeholder="000-000-000" required className="form-input font-mono" maxLength={11} />
        </div>
        <div className="lg:col-span-2">
          <label className="form-label">Customer Name <span className="text-rose-500">*</span></label>
          <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Company / Full Name" required className="form-input" />
        </div>
        <div className="lg:col-span-2">
          <label className="form-label">Customer Address <span className="text-rose-500">*</span></label>
          <input type="text" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Business / Residential Address" required className="form-input" />
        </div>
        <div>
          <label className="form-label">VAT / Exempt / 0-Rated</label>
          <select value={vatType} onChange={e => setVatType(e.target.value)} className="form-input">
            <option value="VATable">VATable</option>
            <option value="VAT Exempt">VAT Exempt</option>
            <option value="Zero-Rated">Zero-Rated</option>
          </select>
        </div>
        <div>
          <label className="form-label">Amount (₱)</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" className="form-input" />
        </div>
        <div>
          <label className="form-label">Net of VAT</label>
          <input type="text" readOnly value={netOfVat.toLocaleString(undefined, { minimumFractionDigits: 2 })} className="form-input bg-slate-100 dark:bg-slate-900/60 text-slate-500 cursor-not-allowed" />
        </div>
        <div>
          <label className="form-label">VAT</label>
          <input type="text" readOnly value={outputTax.toLocaleString(undefined, { minimumFractionDigits: 2 })} className="form-input bg-slate-100 dark:bg-slate-900/60 text-slate-500 cursor-not-allowed" />
        </div>
        <div className="lg:col-span-2 flex items-end gap-3">
          <label className="flex items-center gap-2 cursor-pointer mb-2.5">
            <input type="checkbox" className="w-4 h-4 rounded" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} />
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400">Recurring billing</span>
          </label>
          {isRecurring && (
            <select value={recurrenceFrequency} onChange={e => setRecurrenceFrequency(e.target.value as any)} className="form-input">
              <option value="Monthly">Monthly</option>
              <option value="Quarterly">Quarterly</option>
              <option value="Annually">Annually</option>
            </select>
          )}
        </div>
        <div className="lg:col-span-4">
          <label className="form-label">Description</label>
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional notes about this invoice" className="form-input" />
        </div>
        <div className="lg:col-span-4 mt-2">
          <button onClick={handleAddInvoice} className="w-full bg-indigo-500 hover:bg-indigo-600 text-white font-bold py-3 rounded-xl transition-colors shadow-sm shadow-indigo-500/20 flex justify-center items-center gap-2">
            <Plus className="w-5 h-5" /> Create Invoice
          </button>
        </div>
      </div>}

      <div className="flex items-center gap-2 mb-4">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter:</label>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg outline-none">
          <option value="All">All</option>
          <option value="Outstanding">Outstanding</option>
          <option value="Overdue">Overdue</option>
          <option value="Paid">Paid</option>
        </select>
      </div>

      <div className="space-y-3">
        {filteredInvoices.length === 0 && (
          <div className="py-8"><EmptyState compact icon={<CreditCard className="w-7 h-7" />} title="No invoices yet" description="Create your first invoice to start tracking receivables and payments." /></div>
        )}
        {filteredInvoices.map(inv => {
          const status = getStatus(inv);
          const canGenerateNext = inv.isRecurring && inv.nextBillingDate && inv.nextBillingDate <= today;
          return (
            <div key={inv.id} className="bg-white dark:bg-slate-900/20 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="p-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400 shrink-0">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-extrabold text-xs text-slate-900 dark:text-white">{inv.customerName}</span>
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md text-[10px] font-bold">{inv.invoiceNo}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusBadge(status)}`}>{status}</span>
                      {inv.isRecurring && (
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 flex items-center gap-1">
                          <RefreshCw className="w-2.5 h-2.5" /> {inv.recurrenceFrequency}
                        </span>
                      )}
                      {eisBadgeFor(inv.id)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Issued {inv.date} · Due {inv.dueDate} · TIN {inv.customerTin}
                    </div>
                    {inv.description && <div className="text-[10px] text-slate-400 italic mt-0.5">"{inv.description}"</div>}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-base font-black text-slate-800 dark:text-slate-200">₱{inv.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                  {inv.status === 'Paid' && <div className="text-[10px] text-emerald-600">Paid {inv.datePaid} via {inv.paymentType}</div>}
                </div>
              </div>

              {payingId === inv.id ? (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
                  <select value={payPaymentType} onChange={e => setPayPaymentType(e.target.value)} className="text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg outline-none">
                    {billingPaymentOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                  {canBillingAction('post') && billingPaymentOptions.length > 0 && <button onClick={() => handleConfirmPaid(inv)} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition">Confirm Payment</button>}
                  <button onClick={() => setPayingId(null)} className="text-xs text-slate-400 hover:text-slate-600 font-semibold px-2">Cancel</button>
                </div>
              ) : (
                <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2 justify-end">
                  {canGenerateNext && canBillingAction('add') && (
                    <button onClick={() => handleGenerateNext(inv)} className="text-xs text-cyan-700 dark:text-cyan-400 font-bold border border-cyan-200 dark:border-cyan-800 rounded-lg px-3 py-1.5 hover:bg-cyan-50 dark:hover:bg-cyan-950/20 transition flex items-center gap-1.5">
                      <RefreshCw className="w-3.5 h-3.5" /> Generate Next Invoice
                    </button>
                  )}
                  {canBillingAction('print') && <button onClick={() => handleDownloadPdf(inv)} className="text-xs text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1.5">
                    <FileDown className="w-3.5 h-3.5" /> PDF
                  </button>}
                  {canEInvoiceTab && <button onClick={() => navigate('/eis-center')} className="text-xs text-violet-700 dark:text-violet-400 font-bold border border-violet-200 dark:border-violet-800 rounded-lg px-3 py-1.5 hover:bg-violet-50 dark:hover:bg-violet-950/20 transition flex items-center gap-1.5" title="Build & transmit this invoice as a BIR e-invoice (EIS)">
                    <FileSignature className="w-3.5 h-3.5" /> EIS
                  </button>}
                  {inv.status !== 'Paid' && canBillingAction('edit') && (
                    <button onClick={() => handleCopyPaymentLink(inv)} className="text-xs text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-200 dark:border-indigo-800 rounded-lg px-3 py-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-950/20 transition flex items-center gap-1.5">
                      <Link2 className="w-3.5 h-3.5" /> Copy Payment Link
                    </button>
                  )}
                  {inv.status !== 'Paid' && canBillingAction('edit') && (
                    <button onClick={() => handleSendReminder(inv)} className="text-xs text-amber-600 dark:text-amber-400 font-bold border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-1.5 hover:bg-amber-50 dark:hover:bg-amber-950/20 transition flex items-center gap-1.5">
                      <Bell className="w-3.5 h-3.5" /> Remind
                    </button>
                  )}
                  {inv.status !== 'Paid' && canBillingAction('post') && billingPaymentOptions.length > 0 && (
                    <button onClick={() => { setPayingId(inv.id); setPayPaymentType(billingPaymentOptions[0].value); }} className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg transition flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Mark as Paid
                    </button>
                  )}
                  {canBillingAction('delete') && <button onClick={() => handleDelete(inv.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all">
                    <Trash2 className="w-4 h-4" />
                  </button>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      </>)}
      <TemplateEditor open={editorOpen} onClose={() => setEditorOpen(false)} clientId={currentClientId!} docType="billing"
        editing={editingTpl}
        onSave={(tpl) => { if (!canBillingAction('edit')) { showToast('Your profile does not have permission to edit billing templates.'); return; } import('../lib/invoiceTemplates').then(m => { m.saveTemplate(currentClientId!, tpl); setTemplateId(tpl.id); showToast('Template saved'); }); }}
        onDelete={(id) => { if (!canBillingAction('delete')) { showToast('Your profile does not have permission to delete billing templates.'); return; } import('../lib/invoiceTemplates').then(m => { m.deleteTemplate(currentClientId!, id); setTemplateId('builtin-standard-blue'); }); }} />
          </div>
    </div>
  );
}
