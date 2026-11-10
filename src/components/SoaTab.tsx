// SOA statement creator. Uses existing CAPOTBOOKS billing invoices and recorded full-payment dates.
// Statements are informational and do not create or post accounting transactions.
import { useMemo, useState } from 'react';
import { useAccounting } from '../context/AccountingContext';
import { Field, Select, Button, EmptyState } from './ui';
import {
  FileDown, FileSpreadsheet, Mail, Pencil, Printer, ArrowLeft, ArrowRight,
  CheckCircle2, FileText, Users, CalendarDays,
} from 'lucide-react';
import type { SoaRecord, SoaLine, InvoiceTemplate, BillingInvoice } from '../types';
import { listTemplatesFor, getTemplate } from '../lib/invoiceTemplates';
import { downloadSoaPdf } from '../lib/invoicePdf';
import { generateCSV } from '../lib/utils';
import { toast } from './ui/Toast';
import { TemplateEditor } from './TemplateEditor';
import { YearDropdownDateInput } from './ui/YearDropdownDateInput';

type StatementType = 'invoice' | 'activity';
type CustomerOption = { value: string; name: string; tin: string; address: string };

const money = (n: number) => `₱${Math.abs(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const customerKey = (inv: BillingInvoice) => `${(inv.customerTin || '').trim()}::${(inv.customerName || '').trim().toLowerCase()}`;
const paidDate = (inv: BillingInvoice) => inv.status === 'Paid' ? (inv.datePaid || inv.date) : '';
const isPaidAsOf = (inv: BillingInvoice, asOf: string) => !!paidDate(inv) && paidDate(inv) <= asOf;
const esc = (value: unknown) => String(value ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch] || ch));

export function SoaTab() {
  const { currentClient, currentClientId, businessProfile, showToast } = useAccounting();
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<InvoiceTemplate | null>(null);
  const [templateId, setTemplateId] = useState<string>('builtin-soa-amber');
  const today = localDate();
  const firstOfMonth = `${today.slice(0, 8)}01`;
  const [step, setStep] = useState(1);
  const [statementType, setStatementType] = useState<StatementType>('invoice');
  const [customerId, setCustomerId] = useState('all');
  const [statementDate, setStatementDate] = useState(today);
  const [periodFrom, setPeriodFrom] = useState(firstOfMonth);
  const [periodTo, setPeriodTo] = useState(today);
  const [includeZeroBalance, setIncludeZeroBalance] = useState(false);
  const [applyFinanceCharge, setApplyFinanceCharge] = useState(false);
  const [financeChargeRate, setFinanceChargeRate] = useState('');
  const [emailAddress, setEmailAddress] = useState('');
  const [generated, setGenerated] = useState<SoaRecord | null>(null);

  const invoices: BillingInvoice[] = currentClient?.billingInvoices || [];
  const templates = useMemo(() => currentClientId ? listTemplatesFor(currentClientId, 'soa') : [], [currentClientId]);
  const template = useMemo(() => currentClientId ? getTemplate(currentClientId, templateId) : getTemplate('', templateId), [currentClientId, templateId]);

  const customers = useMemo<CustomerOption[]>(() => {
    const map = new Map<string, CustomerOption>();
    invoices.forEach(inv => {
      const key = customerKey(inv);
      const existing = map.get(key);
      if (!existing) map.set(key, { value: key, name: inv.customerName || 'Unnamed customer', tin: inv.customerTin || '', address: inv.customerAddress || '' });
      else if (!existing.address && inv.customerAddress) existing.address = inv.customerAddress;
    });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [invoices]);

  const selectedCustomer = customers.find(c => c.value === customerId);
  const selectedInvoices = useMemo(() => invoices
    .filter(inv => customerId === 'all' || customerKey(inv) === customerId), [invoices, customerId]);

  const financeRate = Math.max(0, Number(financeChargeRate) || 0);
  const selectedCustomerLabel = selectedCustomer?.name || 'All Customers';

  const buildStatement = () => {
    if (!currentClient || !currentClientId) return;
    if (statementType === 'activity' && (!periodFrom || !periodTo || periodFrom > periodTo)) {
      toast.error('Enter a valid activity period. The From date must not be later than the To date.');
      return;
    }
    if (statementType === 'invoice' && !statementDate) {
      toast.error('Select a statement date.');
      return;
    }
    if (applyFinanceCharge && (!financeRate || financeRate <= 0)) {
      toast.error('Enter a finance charge percentage greater than zero, or turn off finance charges.');
      return;
    }

    const cutoff = statementType === 'invoice' ? statementDate : periodTo;
    const eligible = selectedInvoices.filter(inv => !!inv.date && inv.date <= cutoff);
    const lines: SoaLine[] = [];
    let openingBalance = 0;
    let closingBalance = 0;
    let financeCharges = 0;
    const zeroBalanceCustomers: string[] = [];

    if (statementType === 'invoice') {
      const outstanding = eligible.filter(inv => !isPaidAsOf(inv, statementDate));
      outstanding.sort((a, b) => a.date.localeCompare(b.date) || a.invoiceNo.localeCompare(b.invoiceNo));
      for (const inv of outstanding) {
        const amount = Number(inv.amount) || 0;
        lines.push({
          date: inv.date, reference: inv.invoiceNo,
          description: customerId === 'all' ? `${inv.customerName} — Outstanding invoice` : 'Outstanding invoice',
          debit: amount, credit: 0, balance: 0,
        });
        closingBalance += amount;
        if (applyFinanceCharge && financeRate > 0 && inv.dueDate && inv.dueDate < statementDate) {
          const charge = amount * financeRate / 100;
          if (charge > 0) {
            lines.push({ date: statementDate, reference: `FC-${inv.invoiceNo}`, description: customerId === 'all' ? `${inv.customerName} — One-time finance charge (${financeRate}%)` : `One-time finance charge (${financeRate}%)`, debit: charge, credit: 0, balance: 0 });
            financeCharges += charge;
            closingBalance += charge;
          }
        }
      }
      if (includeZeroBalance) {
        const asOfCustomers = customerId === 'all' ? customers : customers.filter(c => c.value === customerId);
        asOfCustomers.forEach(customer => {
          const customerOutstanding = eligible.some(inv => customerKey(inv) === customer.value && !isPaidAsOf(inv, statementDate));
          if (!customerOutstanding) zeroBalanceCustomers.push(customer.name);
        });
      }
      let running = 0;
      lines.forEach(line => { running += line.debit - line.credit; line.balance = running; });
      closingBalance = running;
    } else {
      // A recorded paid invoice creates a full payment event on its paid date.
      // Partial payment history is not stored in BillingInvoice and is not fabricated here.
      type Event = { date: string; reference: string; description: string; debit: number; credit: number; customerName: string; order: number };
      const events: Event[] = [];
      eligible.forEach(inv => {
        const amount = Number(inv.amount) || 0;
        events.push({ date: inv.date, reference: inv.invoiceNo, description: 'Invoice issued', debit: amount, credit: 0, customerName: inv.customerName || '', order: 0 });
        const paymentDate = paidDate(inv);
        if (paymentDate && paymentDate <= cutoff) {
          events.push({ date: paymentDate, reference: `OR-${inv.invoiceNo}`, description: `Payment received (${inv.paymentType || 'Recorded payment'})`, debit: 0, credit: amount, customerName: inv.customerName || '', order: 1 });
        }
      });
      events.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.reference.localeCompare(b.reference));
      const beforePeriod = events.filter(e => e.date < periodFrom);
      openingBalance = beforePeriod.reduce((sum, e) => sum + e.debit - e.credit, 0);
      closingBalance = openingBalance;
      events.filter(e => e.date >= periodFrom && e.date <= periodTo).forEach(e => {
        closingBalance += e.debit - e.credit;
        lines.push({
          date: e.date, reference: e.reference,
          description: customerId === 'all' ? `${e.customerName} — ${e.description}` : e.description,
          debit: e.debit, credit: e.credit, balance: closingBalance,
        });
      });
      if (applyFinanceCharge && financeRate > 0) {
        const overdue = eligible.filter(inv => !isPaidAsOf(inv, periodTo) && inv.dueDate && inv.dueDate < periodTo);
        overdue.forEach(inv => {
          const charge = (Number(inv.amount) || 0) * financeRate / 100;
          if (charge > 0) {
            financeCharges += charge;
            closingBalance += charge;
            lines.push({ date: periodTo, reference: `FC-${inv.invoiceNo}`, description: customerId === 'all' ? `${inv.customerName} — One-time finance charge (${financeRate}%)` : `One-time finance charge (${financeRate}%)`, debit: charge, credit: 0, balance: closingBalance });
          }
        });
      }
      if (includeZeroBalance) {
        const asOfCustomers = customerId === 'all' ? customers : customers.filter(c => c.value === customerId);
        asOfCustomers.forEach(customer => {
          const balance = eligible.filter(inv => customerKey(inv) === customer.value)
            .reduce((sum, inv) => sum + (Number(inv.amount) || 0) - (isPaidAsOf(inv, periodTo) ? (Number(inv.amount) || 0) : 0), 0);
          if (Math.abs(balance) < 0.005) zeroBalanceCustomers.push(customer.name);
        });
      }
    }

    const customerDetail = selectedCustomer;
    const rec: SoaRecord = {
      id: crypto.randomUUID(),
      clientId: currentClientId,
      clientName: customerDetail?.name || 'All Customers',
      clientTin: customerDetail?.tin || undefined,
      clientAddress: customerDetail?.address || undefined,
      periodFrom: statementType === 'invoice' ? statementDate : periodFrom,
      periodTo: statementType === 'invoice' ? statementDate : periodTo,
      openingBalance,
      lines,
      closingBalance,
      templateId,
      generatedAt: new Date().toISOString(),
      statementType,
      statementDate: statementType === 'invoice' ? statementDate : undefined,
      financeChargeRate: applyFinanceCharge ? financeRate : 0,
      financeCharges,
      zeroBalanceCustomers,
    };
    setGenerated(rec);
    setStep(3);
    showToast('Statement generated from recorded billing transactions');
  };

  const handleDownloadPdf = () => {
    if (!generated) return;
    try { downloadSoaPdf(generated, businessProfile, template); showToast('SOA PDF downloaded'); }
    catch (error) { console.error(error); toast.error('Failed to generate PDF'); }
  };

  const handleExportCsv = () => {
    if (!generated) return;
    const rows: any[][] = [
      ['Statement Type', generated.statementType === 'activity' ? 'Account Activity Statement' : 'Invoice Statement'],
      ['Customer', generated.clientName],
      ['TIN', generated.clientTin || ''],
      ['Period From', generated.periodFrom],
      ['Period To', generated.periodTo],
      [],
      ['Date', 'Reference', 'Description', 'Debit', 'Credit', 'Running Balance'],
      ['—', '—', 'Opening Balance', '', '', generated.openingBalance.toFixed(2)],
      ...generated.lines.map(line => [line.date, line.reference, line.description, line.debit.toFixed(2), line.credit.toFixed(2), line.balance.toFixed(2)]),
      ['', '', 'Closing Balance', '', '', generated.closingBalance.toFixed(2)],
      ['', '', 'Finance Charges', '', '', (generated.financeCharges || 0).toFixed(2)],
    ];
    generateCSV(`soa-${generated.clientName.replace(/[^a-z0-9]+/gi, '-')}-${generated.periodTo}.csv`, rows);
    showToast('SOA data exported to CSV');
  };

  const handlePrint = () => {
    if (!generated) return;
    const win = window.open('', '_blank', 'width=1000,height=800');
    if (!win) { toast.error('The print window was blocked. Allow pop-ups and try again.'); return; }
    const seller = businessProfile?.tradeName || businessProfile?.registeredName || businessProfile?.name || 'Business';
    const sellerAddress = businessProfile?.address || [businessProfile?.street, businessProfile?.barangay, businessProfile?.city].filter(Boolean).join(', ');
    const title = generated.statementType === 'activity' ? 'ACCOUNT ACTIVITY STATEMENT' : 'INVOICE STATEMENT';
    const period = generated.statementType === 'activity' ? `Period: ${generated.periodFrom} to ${generated.periodTo}` : `Statement Date: ${generated.statementDate || generated.periodTo}`;
    const bodyRows = generated.lines.map(line => `<tr><td>${esc(line.date)}</td><td>${esc(line.reference)}</td><td>${esc(line.description)}</td><td class="num">${line.debit ? money(line.debit) : '—'}</td><td class="num">${line.credit ? money(line.credit) : '—'}</td><td class="num">${money(line.balance)}</td></tr>`).join('');
    const zeroBlock = generated.zeroBalanceCustomers?.length ? `<section><strong>Zero-balance customers:</strong> ${generated.zeroBalanceCustomers.map(esc).join(', ')}</section>` : '';
    win.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body{font-family:Arial,sans-serif;color:#1f2937;margin:34px;font-size:12px}header{display:flex;justify-content:space-between;border-bottom:2px solid #334155;padding-bottom:14px;margin-bottom:18px}h1{font-size:20px;margin:0 0 6px}h2{font-size:18px;margin:0 0 6px;text-align:right}p{margin:4px 0;color:#475569}.meta{display:flex;justify-content:space-between;margin:18px 0}table{width:100%;border-collapse:collapse;margin-top:18px}th,td{border-bottom:1px solid #d1d5db;padding:8px;text-align:left;vertical-align:top}th{background:#f1f5f9}.num{text-align:right;white-space:nowrap}.total{font-weight:bold;border-top:2px solid #334155}section{margin-top:18px;color:#475569}@media print{body{margin:12mm}}
      </style></head><body><header><div><h1>${esc(seller)}</h1><p>${esc(sellerAddress)}</p><p>${esc(businessProfile?.tin ? `TIN: ${businessProfile.tin}` : '')}</p></div><div><h2>${esc(title)}</h2><p>${esc(period)}</p><p>Generated: ${esc(generated.generatedAt.slice(0, 10))}</p></div></header><div class="meta"><div><strong>Customer:</strong> ${esc(generated.clientName)}<br><strong>TIN:</strong> ${esc(generated.clientTin || '—')}<br>${esc(generated.clientAddress || '')}</div>${generated.statementType === 'activity' ? `<div><strong>Opening Balance:</strong> ${money(generated.openingBalance)}</div>` : ''}</div><table><thead><tr><th>Date</th><th>Reference</th><th>Description</th><th class="num">Debit</th><th class="num">Credit</th><th class="num">Balance</th></tr></thead><tbody>${bodyRows || '<tr><td colspan="6">No transactions for the selected filters.</td></tr>'}<tr class="total"><td colspan="5" class="num">CLOSING BALANCE</td><td class="num">${money(generated.closingBalance)}</td></tr></tbody></table><p>Finance charges: ${money(generated.financeCharges || 0)}${generated.financeChargeRate ? ` (${generated.financeChargeRate}% one-time charge)` : ''}</p>${zeroBlock}<p style="text-align:center;margin-top:28px">This statement was generated from recorded CAPOTBOOKS billing transactions. It does not create a new invoice or accounting entry.</p><script>window.onload=function(){window.focus();window.print();};</script></body></html>`);
    win.document.close();
  };

  const handleEmail = () => {
    if (!generated) return;
    if (customerId === 'all') { toast.error('Select one customer before preparing an email statement.'); return; }
    if (!emailAddress.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress.trim())) { toast.error('Enter a valid customer email address.'); return; }
    handleDownloadPdf();
    const subject = encodeURIComponent(`${generated.statementType === 'activity' ? 'Account Activity' : 'Invoice'} Statement — ${generated.periodTo}`);
    const body = encodeURIComponent(`Dear ${generated.clientName},\n\nPlease find your statement summary below.\nClosing balance: ${money(generated.closingBalance)}\nPeriod / Statement date: ${generated.periodFrom} to ${generated.periodTo}\n\nPlease attach the downloaded SOA PDF to this email before sending.\n\nThank you,\n${businessProfile?.tradeName || businessProfile?.registeredName || businessProfile?.name || ''}`);
    window.location.href = `mailto:${encodeURIComponent(emailAddress.trim())}?subject=${subject}&body=${body}`;
    toast.info('SOA PDF downloaded. Attach it to the email draft before sending.');
  };

  const nextStep = () => {
    if (step === 1) setStep(2);
    else if (step === 2) buildStatement();
    else if (step === 3) setStep(4);
  };

  const previewTitle = generated?.statementType === 'activity' ? 'ACCOUNT ACTIVITY STATEMENT' : 'INVOICE STATEMENT';
  const dueLabel = generated?.statementType === 'activity' ? 'Period' : 'Statement date';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="text-sm font-black text-slate-800 dark:text-slate-100 flex items-center gap-2"><FileText className="w-4 h-4 text-indigo-500" /> Statement Creator</div>
          <p className="text-xs text-slate-500 mt-1">Generate customer statements from invoices and recorded payments in CAPOTBOOKS.</p>
        </div>
        <div className="flex gap-2 items-center">
          <Field label="Template" className="mb-0">
            <Select value={templateId} onChange={e => setTemplateId(e.target.value)} className="min-w-44">
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.builtin ? ' (built-in)' : ''}</option>)}
            </Select>
          </Field>
          <div className="pt-5"><Button variant="outline" size="sm" onClick={() => { setEditingTpl(null); setEditorOpen(true); }}><Pencil className="w-4 h-4" /> Customize</Button></div>
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-xl bg-slate-100 dark:bg-slate-800 p-1">
        {[
          { n: 1, label: 'Statement Type' }, { n: 2, label: 'Filters' }, { n: 3, label: 'Preview' }, { n: 4, label: 'Generate & Send' },
        ].map(item => <button key={item.n} onClick={() => item.n <= step || (item.n === 3 && generated) ? setStep(item.n) : undefined}
          className={`whitespace-nowrap flex-1 px-3 py-2 rounded-lg text-xs font-bold transition ${step === item.n ? 'bg-white dark:bg-slate-900 text-indigo-600 shadow-sm' : step > item.n ? 'text-emerald-600' : 'text-slate-500'}`}>
          <span className="mr-1.5">{step > item.n ? '✓' : item.n}</span>{item.label}
        </button>)}
      </div>

      {step === 1 && <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
        <div><h3 className="font-bold text-slate-800 dark:text-white">Select Statement Type</h3><p className="text-xs text-slate-500 mt-1">Choose whether to show open invoices or all account activity within a date range.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <button type="button" onClick={() => { setStatementType('invoice'); setGenerated(null); }} className={`text-left p-4 rounded-xl border-2 transition ${statementType === 'invoice' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
            <div className="font-bold text-sm flex items-center gap-2">📑 Invoice Statement {statementType === 'invoice' && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}</div>
            <p className="text-xs text-slate-500 mt-2">Shows invoices outstanding as of the statement date. Fully paid invoices are excluded.</p>
          </button>
          <button type="button" onClick={() => { setStatementType('activity'); setGenerated(null); }} className={`text-left p-4 rounded-xl border-2 transition ${statementType === 'activity' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30' : 'border-slate-200 dark:border-slate-700'}`}>
            <div className="font-bold text-sm flex items-center gap-2">📊 Activity Statement {statementType === 'activity' && <CheckCircle2 className="w-4 h-4 text-indigo-600" />}</div>
            <p className="text-xs text-slate-500 mt-2">Shows opening balance, invoices, recorded full payments, and a running balance.</p>
          </button>
        </div>
        <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:bg-blue-950/20 dark:border-blue-900 p-3 text-xs text-blue-800 dark:text-blue-200">
          <CalendarDays className="w-4 h-4 shrink-0 mt-0.5" />
          <span>Statements use transactions already recorded in CAPOTBOOKS. They do not create invoices or accounting entries. The current billing record stores full-payment status and date, not partial-payment history.</span>
        </div>
      </div>}

      {step === 2 && <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
        <div><h3 className="font-bold text-slate-800 dark:text-white">Select Filters & Dates</h3><p className="text-xs text-slate-500 mt-1">Choose the customer and statement cutoff or activity period.</p></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Customer">
            <Select value={customerId} onChange={e => { setCustomerId(e.target.value); setGenerated(null); setEmailAddress(''); }}>
              <option value="all">All Customers</option>
              {customers.map(c => <option key={c.value} value={c.value}>{c.tin ? `${c.tin} — ` : ''}{c.name}</option>)}
            </Select>
          </Field>
          {statementType === 'invoice' ? (
            <Field label="Statement Date"><YearDropdownDateInput value={statementDate} onChange={setStatementDate} className="input-base" /></Field>
          ) : <>
            <Field label="From (Start Date)"><YearDropdownDateInput value={periodFrom} onChange={setPeriodFrom} className="input-base" /></Field>
            <Field label="To (End Date)"><YearDropdownDateInput value={periodTo} onChange={setPeriodTo} className="input-base" /></Field>
          </>}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={includeZeroBalance} onChange={e => setIncludeZeroBalance(e.target.checked)} />
            <span><strong className="block text-slate-700 dark:text-slate-200">Include customers with zero balance</strong><span className="text-slate-500">List zero-balance customer accounts separately in the statement.</span></span>
          </label>
          <label className="flex items-start gap-2 p-3 rounded-lg border border-slate-200 dark:border-slate-700 text-xs cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={applyFinanceCharge} onChange={e => setApplyFinanceCharge(e.target.checked)} />
            <span><strong className="block text-slate-700 dark:text-slate-200">Apply one-time overdue finance charge</strong><span className="text-slate-500">Optional statement-only calculation on overdue open invoices.</span></span>
          </label>
        </div>
        {applyFinanceCharge && <Field label="Finance charge rate (%) — one-time">
          <input type="number" min="0.01" max="100" step="0.01" value={financeChargeRate} onChange={e => setFinanceChargeRate(e.target.value)} className="input-base max-w-xs" placeholder="Enter agreed rate, e.g. 1.5" />
          <p className="text-[11px] text-slate-500 mt-1">Uses the agreed percentage once against overdue invoices. This charge is shown on the statement only and is not posted to the General Ledger.</p>
        </Field>}
      </div>}

      {step === 3 && generated && <div className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2"><div><h3 className="font-bold text-slate-800 dark:text-white">Preview Statement</h3><p className="text-xs text-slate-500">Review the customer details, transactions, and balance before delivery.</p></div><Button variant="outline" size="sm" onClick={() => setStep(2)}><Pencil className="w-4 h-4" /> Edit Filters</Button></div>
        <div className="border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-900">
          <div className="bg-indigo-50 dark:bg-indigo-950/30 p-4 flex justify-between items-start gap-3 flex-wrap">
            <div><div className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{businessProfile?.tradeName || businessProfile?.registeredName || businessProfile?.name || 'Business'}</div><div className="text-[11px] text-slate-500">{businessProfile?.address || ''}</div></div>
            <div className="text-right"><div className="font-black text-lg text-slate-900 dark:text-white">{previewTitle}</div><div className="text-xs text-slate-500">{dueLabel}: {generated.statementType === 'activity' ? `${generated.periodFrom} to ${generated.periodTo}` : generated.statementDate}</div></div>
          </div>
          <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs mb-4">
              <div><div className="text-slate-500">Customer</div><div className="font-semibold text-slate-800 dark:text-white">{generated.clientName}</div></div>
              <div><div className="text-slate-500">Customer TIN</div><div className="font-semibold text-slate-800 dark:text-white">{generated.clientTin || '—'}</div></div>
              {generated.statementType === 'activity' && <div><div className="text-slate-500">Opening Balance</div><div className="font-semibold text-slate-800 dark:text-white">{money(generated.openingBalance)}</div></div>}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[680px]">
                <thead className="bg-slate-50 dark:bg-slate-800 text-[10px] text-slate-500 uppercase"><tr><th className="text-left p-2">Date</th><th className="text-left p-2">Reference</th><th className="text-left p-2">Description</th><th className="text-right p-2">Debit</th><th className="text-right p-2">Credit</th><th className="text-right p-2">Balance</th></tr></thead>
                <tbody>
                  {generated.statementType === 'activity' && <tr className="border-t border-slate-100 dark:border-slate-800"><td className="p-2 text-xs" colSpan={5}><em>Opening balance</em></td><td className="text-right p-2 text-xs font-semibold">{money(generated.openingBalance)}</td></tr>}
                  {generated.lines.length === 0 && <tr><td colSpan={6} className="p-4 text-center text-slate-400 text-xs">No transactions match the selected filters.</td></tr>}
                  {generated.lines.map((line, index) => <tr key={`${line.reference}-${index}`} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2 text-xs whitespace-nowrap">{line.date}</td><td className="p-2 text-xs font-mono">{line.reference}</td><td className="p-2 text-xs">{line.description}</td><td className="p-2 text-right text-xs">{line.debit ? money(line.debit) : '—'}</td><td className="p-2 text-right text-xs">{line.credit ? money(line.credit) : '—'}</td><td className="p-2 text-right text-xs font-semibold">{money(line.balance)}</td></tr>)}
                  <tr className="border-t-2 border-slate-300 dark:border-slate-600 bg-indigo-50 dark:bg-indigo-950/30 font-bold"><td colSpan={5} className="p-2 text-right text-xs">CLOSING BALANCE</td><td className="p-2 text-right text-xs">{money(generated.closingBalance)}</td></tr>
                </tbody>
              </table>
            </div>
            <div className="flex justify-between flex-wrap gap-2 mt-3 text-xs text-slate-500"><span>Finance charges: {money(generated.financeCharges || 0)}</span><span>Generated {generated.generatedAt.slice(0, 10)}</span></div>
            {!!generated.zeroBalanceCustomers?.length && <div className="mt-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs"><strong>Zero-balance customers:</strong> {generated.zeroBalanceCustomers.join(', ')}</div>}
            <p className="mt-4 text-[11px] text-slate-500 text-center">This statement is generated from recorded billing transactions. It is informational and does not create a new bill.</p>
          </div>
        </div>
      </div>}

      {step === 3 && !generated && <EmptyState title="No statement generated" description="Return to filters and generate a statement." />}

      {step === 4 && generated && <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
        <div><h3 className="font-bold text-slate-800 dark:text-white">Generate & Deliver Statement</h3><p className="text-xs text-slate-500 mt-1">Choose how to print, save, email, or export this statement.</p></div>
        {customerId !== 'all' && <Field label="Customer email address (enter for this delivery)"><input type="email" value={emailAddress} onChange={e => setEmailAddress(e.target.value)} placeholder="customer@example.com" className="input-base" /></Field>}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4" /> Print</Button>
          <Button variant="outline" onClick={handleEmail} disabled={customerId === 'all'}><Mail className="w-4 h-4" /> Email</Button>
          <Button variant="outline" onClick={handleDownloadPdf}><FileDown className="w-4 h-4" /> Save as PDF</Button>
          <Button variant="outline" onClick={handleExportCsv}><FileSpreadsheet className="w-4 h-4" /> Export Data (CSV)</Button>
        </div>
        {customerId === 'all' && <p className="text-[11px] text-slate-500">Email delivery is disabled for All Customers. Select one customer in Filters to prepare an individual email draft.</p>}
        <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900 p-3 text-xs text-blue-800 dark:text-blue-200"><strong>Note:</strong> Email opens your default mail application and downloads the PDF separately. Attach the downloaded PDF before sending. CAPOTBOOKS does not send emails or attach files automatically.</div>
        <div className="rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-xs text-slate-600 dark:text-slate-300"><strong>Invoice</strong> = request for payment issued at time of sale.<br /><strong>Statement</strong> = account summary of recorded activity; it is not a new bill.</div>
      </div>}

      <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
        <Button variant="outline" onClick={() => step === 1 ? undefined : setStep(step - 1)} disabled={step === 1}><ArrowLeft className="w-4 h-4" /> Back</Button>
        <div className="flex gap-2">
          {step === 4 && <Button variant="outline" onClick={() => { setStep(1); setGenerated(null); setEmailAddress(''); }}><Users className="w-4 h-4" /> Create Another</Button>}
          {step < 4 && <Button variant="primary" onClick={nextStep}>{step === 1 ? 'Next: Set Filters' : step === 2 ? 'Generate & Preview' : 'Next: Generate & Send'} <ArrowRight className="w-4 h-4" /></Button>}
        </div>
      </div>

      <TemplateEditor open={editorOpen} onClose={() => setEditorOpen(false)} clientId={currentClientId!} docType="soa"
        editing={editingTpl}
        onSave={(tpl) => { import('../lib/invoiceTemplates').then(m => { m.saveTemplate(currentClientId!, tpl); setTemplateId(tpl.id); showToast('Template saved'); }); }}
        onDelete={(id) => { import('../lib/invoiceTemplates').then(m => { m.deleteTemplate(currentClientId!, id); setTemplateId('builtin-soa-amber'); }); }} />
    </div>
  );
}
