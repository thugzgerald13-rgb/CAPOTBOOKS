import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatTIN } from '../lib/utils';
import { CreditCard, Plus, Trash2, RefreshCw, CheckCircle2, FileDown, Link2, Bell, FileSignature, Printer, Mail, ArrowLeft, ArrowRight, Save, Eye } from 'lucide-react';
import { getTransmissionByInvoice } from '../lib/eisStore';
import { EmptyState } from './ui/EmptyState';
import { DEFAULT_CRJ_COLUMNS } from './CashReceiptsJournal';
import { BillingInvoice, BillingInvoiceLineItem, JournalEntry } from '../types';
import { copyPaymentMessage, openPaymentReminderEmail, downloadTemplatedInvoicePdf, printTemplatedInvoice } from '../lib/invoicePdf';
import { toast } from './ui/Toast';
import { SoaTab } from './SoaTab';
import { TemplateEditor } from './TemplateEditor';
import { listTemplatesFor, getTemplate } from '../lib/invoiceTemplates';
import { useMemo } from 'react';
import type { InvoiceTemplate } from '../types';
import { Pencil } from 'lucide-react';
import { useGranularPermissions } from '../lib/useGranularPermissions';
import { YearDropdownDateInput } from './ui/YearDropdownDateInput';
import { Modal } from './ui/Modal';
import { UserPlus } from 'lucide-react';

const CASH_RECEIPT_PAYMENT_TYPES = ['Cash', 'Check', 'E-Payment', 'Bank Transfer'];

function addInterval(dateStr: string, frequency: 'Monthly' | 'Quarterly' | 'Annually', intervals = 1): string {
  // Clamp month-end dates (e.g. Jan 31 → Feb 28/29) instead of overflowing
  // into the following month. UTC avoids browser timezone shifts for date-only values.
  const [year, month, day] = dateStr.split('-').map(Number);
  const monthOffset = (frequency === 'Monthly' ? 1 : frequency === 'Quarterly' ? 3 : 12) * Math.max(1, intervals);
  const targetMonth = new Date(Date.UTC(year, month - 1 + monthOffset, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0)).getUTCDate();
  targetMonth.setUTCDate(Math.min(day, lastDay));
  return targetMonth.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  return Math.max(0, Math.round((end - start) / 86_400_000));
}

const money = (value: number) => `₱${(Number(value) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function Billing() {
  const { currentClient, currentClientId, saveBillingInvoice, deleteBillingInvoice, saveSale, saveJournalEntry, saveTinEntry, showToast, businessProfile } = useAccounting();
  const navigate = useNavigate();
  const { canAction: canBillingAction, canDropdownOption: canBillingDropdown } = useGranularPermissions('billing');
  const { canAction: canEisAction } = useGranularPermissions('eis_center');
  const { canAction: canTinLibraryAction } = useGranularPermissions('tinlibrary');
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

  // Bill creation state. Entered unit prices are VAT-inclusive for VATable bills.
  const [invoiceStep, setInvoiceStep] = useState<1 | 2 | 3 | 4>(1);
  const [date, setDate] = useState(today);
  const [dueDate, setDueDate] = useState(addDays(today, 14));
  const [invoiceNo, setInvoiceNo] = useState('');
  const [customerTin, setCustomerTin] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [vatType, setVatType] = useState('VATable');
  const [lineItems, setLineItems] = useState<BillingInvoiceLineItem[]>([{ id: crypto.randomUUID(), description: '', qty: 1, unitPrice: 0 }]);
  const [discountPercent, setDiscountPercent] = useState('0');
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFrequency, setRecurrenceFrequency] = useState<'Monthly' | 'Quarterly' | 'Annually'>('Monthly');
  const [recordedInvoice, setRecordedInvoice] = useState<BillingInvoice | null>(null);
  const [isSavingInvoice, setIsSavingInvoice] = useState(false);
  const [generatingRecurringId, setGeneratingRecurringId] = useState<string | null>(null);
  const generatingRecurringRef = useRef(false);
  const [newCustomerOpen, setNewCustomerOpen] = useState(false);
  const [newCustomerTin, setNewCustomerTin] = useState('');
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerAddress, setNewCustomerAddress] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [isSavingNewCustomer, setIsSavingNewCustomer] = useState(false);

  const [statusFilter, setStatusFilter] = useState<'All' | 'Outstanding' | 'Overdue' | 'Paid' | 'Recurring'>('All');
  const [payingId, setPayingId] = useState<string | null>(null);
  const [payPaymentType, setPayPaymentType] = useState('Cash');
  // The E-Invoice tab is intentionally hidden; EIS actions remain available where permitted.
  const [activeTab, setActiveTab] = useState<'billing' | 'soa'>('billing');
  const [templateId, setTemplateId] = useState<string>('builtin-standard-blue');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTpl, setEditingTpl] = useState<InvoiceTemplate | null>(null);
  const templates = useMemo(() => currentClientId ? listTemplatesFor(currentClientId, 'billing') : [], [currentClientId, activeTab]);
  const selectedTemplate = useMemo(() => currentClientId ? getTemplate(currentClientId, templateId) : getTemplate('', templateId), [currentClientId, templateId]);

  if (!currentClient || !currentClientId) return null;

  const invoices = currentClient.billingInvoices || [];

  const cleanLineItems = lineItems.map(item => ({
    ...item,
    description: item.description.trim(),
    qty: Math.max(0, Number(item.qty) || 0),
    unitPrice: Math.max(0, Number(item.unitPrice) || 0),
  }));
  const subtotal = cleanLineItems.reduce((sum, item) => sum + Math.round(item.qty * item.unitPrice * 100) / 100, 0);
  const discountRate = Math.min(100, Math.max(0, Number(discountPercent) || 0));
  const discountAmount = subtotal * discountRate / 100;
  const grossAmount = Math.max(0, subtotal - discountAmount);
  const isVatable = vatType === 'VATable';
  const netOfVat = isVatable ? grossAmount / 1.12 : grossAmount;
  const outputTax = isVatable ? grossAmount - netOfVat : 0;
  const customerDirectory = currentClient?.tinLibrary?.customers || [];

  const getStatus = (inv: BillingInvoice): 'Outstanding' | 'Overdue' | 'Paid' => {
    if (inv.status === 'Paid') return 'Paid';
    return inv.dueDate < today ? 'Overdue' : 'Outstanding';
  };

  const filteredInvoices = invoices.filter(inv => {
    if (statusFilter === 'All') return true;
    if (statusFilter === 'Recurring') return Boolean(inv.isRecurring);
    return getStatus(inv) === statusFilter;
  }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const openNewCustomer = () => {
    if (!canTinLibraryAction('add')) {
      showToast('Your profile does not have permission to add customers to the TIN Library.');
      return;
    }
    setNewCustomerTin('');
    setNewCustomerName('');
    setNewCustomerAddress('');
    setNewCustomerEmail('');
    setNewCustomerOpen(true);
  };

  const handleCreateCustomer = async () => {
    if (isSavingNewCustomer) return;
    if (!canTinLibraryAction('add')) {
      showToast('Your profile does not have permission to add customers to the TIN Library.');
      return;
    }
    const formattedTin = formatTIN(newCustomerTin);
    const tinDigits = formattedTin.replace(/\D/g, '');
    const name = newCustomerName.trim();
    const address = newCustomerAddress.trim();
    const email = newCustomerEmail.trim();

    if (tinDigits.length !== 9) {
      showToast('Enter a valid 9-digit customer TIN.');
      return;
    }
    if (!name || !address) {
      showToast('Customer name and address are required.');
      return;
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      showToast('Enter a valid customer email address or leave it blank.');
      return;
    }

    const existingCustomer = customerDirectory.find(customer => String(customer.tin || '').replace(/\D/g, '') === tinDigits);
    if (existingCustomer) {
      setCustomerTin(formatTIN(existingCustomer.tin));
      setCustomerName(existingCustomer.name);
      setCustomerAddress(existingCustomer.address || '');
      setCustomerEmail(email);
      setNewCustomerOpen(false);
      showToast('This customer is already in the TIN Library and has been selected.');
      return;
    }

    const customerEntry = {
      // Stable TIN-based ID prevents duplicate customer master records on retry.
      id: `tin_customer_${tinDigits}`,
      tin: formattedTin,
      name,
      address,
    };

    setIsSavingNewCustomer(true);
    try {
      await saveTinEntry(customerEntry, 'customer');
      setCustomerTin(formattedTin);
      setCustomerName(name);
      setCustomerAddress(address);
      setCustomerEmail(email);
      setNewCustomerOpen(false);
      showToast('New customer saved to TIN Library and selected for this invoice.');
    } catch (error) {
      console.error('Could not save new billing customer to TIN Library:', error);
      showToast('Unable to save the new customer. Check your TIN Library permissions and connection.');
    } finally {
      setIsSavingNewCustomer(false);
    }
  };

  const handleAddInvoice = async () => {
    if (isSavingInvoice || recordedInvoice) return;
    if (!canBillingAction('add')) { showToast('Your profile does not have permission to create invoices.'); return; }
    if (!canInvoiceTab) { showToast('Invoice creation is not enabled for your profile.'); return; }
    if (!invoiceNo.trim() || !customerTin.trim() || !customerName.trim() || !customerAddress.trim()) {
      showToast('Bill No., customer TIN, name, and address are required.');
      setInvoiceStep(1);
      return;
    }
    if (!date || !dueDate || dueDate < date) {
      showToast('Enter valid invoice and due dates. The due date cannot be earlier than the invoice date.');
      setInvoiceStep(1);
      return;
    }
    if (invoices.some(inv => inv.invoiceNo.trim().toLowerCase() === invoiceNo.trim().toLowerCase())) {
      showToast('That Bill No. already exists. Enter a unique Bill No.');
      setInvoiceStep(1);
      return;
    }
    const validLines = cleanLineItems.filter(item => item.description && item.qty > 0 && item.unitPrice >= 0);
    if (!validLines.length || validLines.every(item => item.qty * item.unitPrice <= 0)) {
      showToast('Add at least one service line with a description, quantity, and unit price greater than zero.');
      setInvoiceStep(2);
      return;
    }
    if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      showToast('Enter a valid customer email address or leave it blank.');
      setInvoiceStep(1);
      return;
    }

    const normalizedLines = validLines.map(item => ({
      id: item.id || crypto.randomUUID(),
      description: item.description,
      qty: item.qty,
      unitPrice: item.unitPrice,
      amount: Math.round(item.qty * item.unitPrice * 100) / 100,
    }));
    const newInvoice: BillingInvoice = {
      id: crypto.randomUUID(),
      date,
      dueDate,
      invoiceNo: invoiceNo.trim(),
      customerTin: customerTin.trim(),
      customerName: customerName.trim(),
      customerAddress: customerAddress.trim(),
      customerEmail: customerEmail.trim() || undefined,
      vatType,
      lineItems: normalizedLines,
      discountPercent: discountRate,
      description: normalizedLines.map(item => item.description).join('; '),
      amount: Math.round(grossAmount * 100) / 100,
      netOfVat: Math.round(netOfVat * 100) / 100,
      outputTax: Math.round(outputTax * 100) / 100,
      status: 'Outstanding',
      isRecurring,
      ...(isRecurring ? { recurrenceFrequency, nextBillingDate: addInterval(date, recurrenceFrequency) } : {}),
      templateId,
    };

    setIsSavingInvoice(true);
    try {
      await saveBillingInvoice(newInvoice.id, newInvoice);
      setRecordedInvoice(newInvoice);
      showToast(isRecurring ? 'Recurring bill recorded' : 'Bill recorded');
    } catch (error) {
      console.error(error);
      showToast('Failed to record bill');
    } finally {
      setIsSavingInvoice(false);
    }
  };

  const advanceInvoiceStep = () => {
    if (invoiceStep === 1) {
      if (!invoiceNo.trim() || !customerTin.trim() || !customerName.trim() || !customerAddress.trim()) {
        showToast('Complete the Bill No., customer TIN, name, and address first.'); return;
      }
      if (!date || !dueDate || dueDate < date) { showToast('Check the invoice date and due date.'); return; }
      if (customerEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) { showToast('Enter a valid customer email address or leave it blank.'); return; }
      if (invoices.some(inv => inv.invoiceNo.trim().toLowerCase() === invoiceNo.trim().toLowerCase())) { showToast('That Bill No. already exists.'); return; }
      setInvoiceStep(2); return;
    }
    if (invoiceStep === 2) {
      const validLines = cleanLineItems.filter(item => item.description && item.qty > 0 && item.unitPrice >= 0 && item.qty * item.unitPrice > 0);
      if (!validLines.length) { showToast('Add at least one service line with a description, quantity, and unit price greater than zero.'); return; }
      setInvoiceStep(3); return;
    }
    if (invoiceStep === 3) setInvoiceStep(4);
  };

  const resetInvoiceForm = () => {
    const nextToday = new Date().toISOString().split('T')[0];
    setInvoiceStep(1);
    setDate(nextToday);
    setDueDate(addDays(nextToday, 14));
    setInvoiceNo('');
    setCustomerTin('');
    setCustomerName('');
    setCustomerAddress('');
    setCustomerEmail('');
    setVatType('VATable');
    setLineItems([{ id: crypto.randomUUID(), description: '', qty: 1, unitPrice: 0 }]);
    setDiscountPercent('0');
    setIsRecurring(false);
    setRecurrenceFrequency('Monthly');
    setRecordedInvoice(null);
  };

  const handlePrintNewInvoice = (inv: BillingInvoice) => {
    if (!canBillingAction('print')) { showToast('Your profile does not have permission to print invoices.'); return; }
    try { const tpl = inv.templateId && currentClientId ? getTemplate(currentClientId, inv.templateId) : selectedTemplate; printTemplatedInvoice(inv, businessProfile, tpl); }
    catch (error) { console.error(error); showToast(error instanceof Error ? error.message : 'Could not open the print window'); }
  };

  const handleEmailNewInvoice = (inv: BillingInvoice) => {
    if (!canBillingAction('print')) { showToast('Your profile does not have permission to generate invoice PDFs.'); return; }
    if (!canBillingAction('edit')) { showToast('Your profile does not have permission to email invoices.'); return; }
    if (!inv.customerEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inv.customerEmail)) {
      showToast('Enter and save a valid customer email address before preparing the email.');
      return;
    }
    try {
      const tpl = inv.templateId && currentClientId ? getTemplate(currentClientId, inv.templateId) : selectedTemplate;
      downloadTemplatedInvoicePdf(inv, businessProfile, tpl);
      const subject = encodeURIComponent(`Invoice ${inv.invoiceNo} from ${businessProfile?.tradeName || businessProfile?.registeredName || businessProfile?.name || 'CAPOTBOOKS'}`);
      const body = encodeURIComponent(`Dear ${inv.customerName},\n\nPlease find the invoice PDF downloaded from CAPOTBOOKS. Attach the downloaded file to this email before sending.\n\nInvoice: ${inv.invoiceNo}\nInvoice date: ${inv.date}\nDue date: ${inv.dueDate}\nAmount due: ${money(inv.amount)}\n\nThank you.`);
      window.location.href = `mailto:${encodeURIComponent(inv.customerEmail)}?subject=${subject}&body=${body}`;
      showToast('Invoice PDF downloaded and email draft prepared. Attach the PDF before sending.');
    } catch (error) { console.error(error); showToast('Failed to prepare invoice email'); }
  };

  const handleSaveInvoiceEmail = async () => {
    if (!recordedInvoice) return;
    if (!customerEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())) {
      showToast('Enter a valid customer email address.'); return;
    }
    const updated = { ...recordedInvoice, customerEmail: customerEmail.trim() };
    try {
      await saveBillingInvoice(updated.id, updated);
      setRecordedInvoice(updated);
      showToast('Customer email saved to the invoice');
    } catch (error) {
      console.error(error);
      showToast('Could not save the customer email');
    }
  };

  const handleGenerateNext = async (template: BillingInvoice) => {
    if (!canBillingAction('add')) { showToast('Your profile does not have permission to create bills.'); return; }
    if (!template.isRecurring || !template.nextBillingDate || !template.recurrenceFrequency) return;
    if (template.nextBillingDate > today) {
      showToast(`The next bill is scheduled for ${template.nextBillingDate}.`);
      return;
    }
    if (generatingRecurringRef.current) return;

    const scheduledDate = template.nextBillingDate;
    const alreadyGenerated = invoices.some(inv => inv.parentInvoiceId === template.id && inv.date === scheduledDate);
    generatingRecurringRef.current = true;
    setGeneratingRecurringId(template.id);
    try {
      if (alreadyGenerated) {
        // Recover safely if a previous save created the bill but failed to advance the schedule.
        const generatedCount = invoices.filter(inv => inv.parentInvoiceId === template.id).length;
        const advancedTemplate = { ...template, nextBillingDate: addInterval(template.date, template.recurrenceFrequency, generatedCount + 2) };
        await saveBillingInvoice(advancedTemplate.id, advancedTemplate);
        showToast(`The bill for ${scheduledDate} already exists. The schedule has been advanced.`);
        return;
      }

      const dueTermDays = daysBetween(template.date, template.dueDate);
      const priorBills = invoices.filter(inv => inv.parentInvoiceId === template.id).length;
      let sequence = priorBills + 2;
      let generatedBillNo = `${template.invoiceNo}-${String(sequence).padStart(2, '0')}`;
      while (invoices.some(inv => inv.invoiceNo.trim().toLowerCase() === generatedBillNo.toLowerCase())) {
        sequence += 1;
        generatedBillNo = `${template.invoiceNo}-${String(sequence).padStart(2, '0')}`;
      }

      const generated: BillingInvoice = {
        ...template,
        id: crypto.randomUUID(),
        date: scheduledDate,
        dueDate: addDays(scheduledDate, dueTermDays),
        invoiceNo: generatedBillNo,
        customerEmail: template.customerEmail,
        lineItems: template.lineItems?.map(item => ({ ...item })) || [],
        status: 'Outstanding',
        isRecurring: false,
        recurrenceFrequency: undefined,
        nextBillingDate: undefined,
        parentInvoiceId: template.id,
        datePaid: undefined,
        paymentType: undefined,
      };

      const updatedTemplate: BillingInvoice = {
        ...template,
        nextBillingDate: addInterval(template.date, template.recurrenceFrequency, priorBills + 2),
      };

      // Save the bill and advance the schedule together. A date-based duplicate guard
      // above protects against repeated clicks if the user retries after a network error.
      // Persist the new bill first. If advancing the schedule then fails, a retry
      // detects the existing child bill and advances the schedule without duplicating it.
      await saveBillingInvoice(generated.id, generated);
      await saveBillingInvoice(updatedTemplate.id, updatedTemplate);
      showToast(`Generated Bill No. ${generated.invoiceNo} for ${generated.date}.`);
    } catch (error) {
      console.error('Failed to generate recurring bill:', error);
      showToast('Failed to generate the recurring bill. The schedule was not confirmed as advanced.');
    } finally {
      generatingRecurringRef.current = false;
      setGeneratingRecurringId(null);
    }
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
    try { const tpl = inv.templateId && currentClientId ? getTemplate(currentClientId, inv.templateId) : selectedTemplate; downloadTemplatedInvoicePdf(inv, businessProfile, tpl); showToast('Invoice PDF downloaded'); }
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

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Billing" icon={<CreditCard className="w-5 h-5 text-indigo-500" />} />
      <div className="p-4 md:p-6 flex-1">
      {/* Billing and SOA tabs */}
      <div className="flex items-center justify-between gap-3 flex-wrap mb-5">
        <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
          {([
            ['billing', 'Billing Invoice', canInvoiceTab],
            ['soa', 'SOA', canSoaTab],
          ] as const).filter(([, , allowed]) => allowed).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} className={`px-4 py-2 rounded-lg text-xs font-bold transition ${activeTab === key ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 dark:text-slate-300 hover:text-indigo-600'}`}>
              {label}
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

      {activeTab === 'soa' && canSoaTab && <SoaTab />}
      {activeTab === 'billing' && canInvoiceTab && (<>
      {canBillingAction('add') && <section className="mb-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/30 overflow-hidden">
        <div className="p-4 md:p-5 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2"><Plus className="w-5 h-5 text-indigo-500" /> Create New Bill</h2>
              <p className="text-xs text-slate-500 mt-1">Create a customer bill, track payment, or set it to recur on a monthly, quarterly, or annual schedule.</p>
            </div>
            {recordedInvoice && <span className="text-[10px] font-black uppercase tracking-wider rounded-full px-3 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">Recorded · {recordedInvoice.invoiceNo}</span>}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 mt-4">
            {([
              [1, 'Customer & Dates'], [2, 'Services Billed'], [3, 'Preview'], [4, 'Record & Send'],
            ] as const).map(([step, label]) => (
              <button key={step} type="button" onClick={() => { if (step <= invoiceStep) setInvoiceStep(step as 1 | 2 | 3 | 4); }} disabled={step > invoiceStep}
                className={`rounded-xl px-3 py-2 text-left border transition ${invoiceStep === step ? 'bg-indigo-600 text-white border-indigo-600' : invoiceStep > step ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/20 dark:text-emerald-300 dark:border-emerald-900' : 'bg-slate-50 text-slate-400 border-slate-200 dark:bg-slate-800 dark:border-slate-700'} disabled:opacity-60`}>
                <span className="block text-[9px] font-black uppercase tracking-widest opacity-75">Step {step}</span>
                <span className="block text-[11px] font-extrabold mt-0.5">{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="p-4 md:p-5">
          {invoiceStep === 1 && <>
            <h3 className="text-sm font-black text-slate-800 dark:text-white mb-1">Customer & invoice details</h3>
            <p className="text-[11px] text-slate-500 mb-4">Choose a saved customer from the TIN Library or enter the buyer details manually.</p>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="form-label">Saved customer</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <select value={customerDirectory.some(c => c.tin === customerTin) ? customerTin : ''} onChange={e => {
                    const customer = customerDirectory.find(c => c.tin === e.target.value);
                    if (customer) {
                      setCustomerTin(formatTIN(customer.tin));
                      setCustomerName(customer.name);
                      setCustomerAddress(customer.address || '');
                      setCustomerEmail('');
                    }
                  }} className="form-input min-w-0 flex-1">
                    <option value="">Select from TIN Library (optional)</option>
                    {customerDirectory.map(customer => <option key={customer.id} value={customer.tin}>{customer.name} · {customer.tin}</option>)}
                  </select>
                  {canTinLibraryAction('add') && <button type="button" onClick={openNewCustomer} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/30 px-3 py-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-950/50 transition">
                    <UserPlus className="w-3.5 h-3.5" /> Add New Customer
                  </button>}
                </div>
                <p className="mt-1.5 text-[10px] text-slate-500">New customers are saved to TIN Library and selected automatically for this invoice.</p>
              </div>
              <div><label className="form-label">Bill No. <span className="text-rose-500">*</span></label><input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="INV-001" className="form-input" /></div>
              <div><label className="form-label">Invoice date <span className="text-rose-500">*</span></label><YearDropdownDateInput value={date} onChange={setDate} className="form-input" /></div>
              <div><label className="form-label">Due date <span className="text-rose-500">*</span></label><YearDropdownDateInput value={dueDate} onChange={setDueDate} className="form-input" /></div>
              <div><label className="form-label">Customer TIN <span className="text-rose-500">*</span></label><input type="text" value={customerTin} onChange={e => setCustomerTin(formatTIN(e.target.value))} placeholder="000-000-000" maxLength={11} className="form-input font-mono" /></div>
              <div><label className="form-label">Customer name <span className="text-rose-500">*</span></label><input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Company / Full Name" className="form-input" /></div>
              <div className="md:col-span-2"><label className="form-label">Customer address <span className="text-rose-500">*</span></label><input type="text" value={customerAddress} onChange={e => setCustomerAddress(e.target.value)} placeholder="Business / Residential Address" className="form-input" /></div>
              <div><label className="form-label">Customer email (optional)</label><input type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" className="form-input" /></div>
              <div><label className="form-label">VAT classification</label><select value={vatType} onChange={e => setVatType(e.target.value)} className="form-input"><option value="VATable">VATable (12% VAT-inclusive)</option><option value="VAT Exempt">VAT Exempt</option><option value="Zero-Rated">Zero-Rated</option></select></div>
            </div>
            <div className="mt-4 rounded-xl bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/50 p-3 text-[11px] text-indigo-800 dark:text-indigo-200">
              Unit prices entered in the next step are treated as VAT-inclusive for VATable invoices, matching CAPOTBOOKS' existing billing and sales VAT calculations. VAT Exempt and Zero-Rated invoices do not calculate output VAT.
            </div>
          </>}

          {invoiceStep === 2 && <>
            <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
              <div><h3 className="text-sm font-black text-slate-800 dark:text-white">Services & items billed</h3><p className="text-[11px] text-slate-500 mt-1">Enter a description, quantity, and unit price for each service line.</p></div>
              <button type="button" onClick={() => setLineItems(items => [...items, { id: crypto.randomUUID(), description: '', qty: 1, unitPrice: 0 }])} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900 px-3 py-2 text-xs font-bold text-emerald-700 dark:text-emerald-300"><Plus className="w-3.5 h-3.5" /> Add service line</button>
            </div>
            <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
              <table className="w-full min-w-[650px] text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800 text-slate-500 uppercase tracking-wider text-[9px]"><tr><th className="text-left p-3">Description</th><th className="text-right p-3 w-24">Qty</th><th className="text-right p-3 w-36">Unit price (₱)</th><th className="text-right p-3 w-36">Amount (₱)</th><th className="w-12 p-3"></th></tr></thead>
                <tbody>{lineItems.map((item, index) => <tr key={item.id || index} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="p-2"><input aria-label={`Service description ${index + 1}`} value={item.description} onChange={e => setLineItems(items => items.map((row, i) => i === index ? { ...row, description: e.target.value } : row))} placeholder="Service performed / item supplied" className="form-input" /></td>
                  <td className="p-2"><input aria-label={`Quantity ${index + 1}`} type="number" min="0.01" step="0.01" value={item.qty} onChange={e => setLineItems(items => items.map((row, i) => i === index ? { ...row, qty: Number(e.target.value) } : row))} className="form-input text-right" /></td>
                  <td className="p-2"><input aria-label={`Unit price ${index + 1}`} type="number" min="0" step="0.01" value={item.unitPrice} onChange={e => setLineItems(items => items.map((row, i) => i === index ? { ...row, unitPrice: Number(e.target.value) } : row))} className="form-input text-right" /></td>
                  <td className="p-3 text-right font-bold text-slate-800 dark:text-white">{money((Number(item.qty) || 0) * (Number(item.unitPrice) || 0))}</td>
                  <td className="p-2"><button type="button" disabled={lineItems.length === 1} onClick={() => setLineItems(items => items.filter((_, i) => i !== index))} className="p-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 disabled:opacity-30" title="Remove line"><Trash2 className="w-4 h-4" /></button></td>
                </tr>)}</tbody>
              </table>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
              <div className="space-y-3">
                <div><label className="form-label">Discount (%)</label><input type="number" min="0" max="100" step="0.01" value={discountPercent} onChange={e => setDiscountPercent(String(Math.min(100, Math.max(0, Number(e.target.value) || 0))))} className="form-input max-w-xs" /></div>
                <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-600 dark:text-slate-300"><input type="checkbox" className="w-4 h-4 rounded" checked={isRecurring} onChange={e => setIsRecurring(e.target.checked)} /> Set as recurring bill</label>
                {isRecurring && <div className="space-y-1"><label className="form-label">Bill frequency</label><select value={recurrenceFrequency} onChange={e => setRecurrenceFrequency(e.target.value as 'Monthly' | 'Quarterly' | 'Annually')} className="form-input max-w-xs"><option value="Monthly">Monthly</option><option value="Quarterly">Quarterly</option><option value="Annually">Annually</option></select><p className="text-[10px] text-slate-500">Next bill: {addInterval(date, recurrenceFrequency)}. On that date, use Generate Next Bill in the recurring schedule to create the next bill with a new Bill No.</p></div>}
              </div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 p-4 space-y-2 text-xs">
                <div className="flex justify-between"><span className="text-slate-500">Subtotal (VAT-inclusive)</span><strong>{money(subtotal)}</strong></div>
                <div className="flex justify-between"><span className="text-slate-500">Discount ({discountRate.toFixed(2)}%)</span><strong>- {money(discountAmount)}</strong></div>
                {isVatable ? <><div className="flex justify-between"><span className="text-slate-500">Net of VAT</span><strong>{money(netOfVat)}</strong></div><div className="flex justify-between"><span className="text-slate-500">Output VAT (12%)</span><strong>{money(outputTax)}</strong></div></> : <div className="text-slate-500">{vatType} · No output VAT</div>}
                <div className="border-t border-slate-200 dark:border-slate-700 pt-3 flex justify-between text-sm"><strong className="text-slate-800 dark:text-white">TOTAL DUE</strong><strong className="text-indigo-600 dark:text-indigo-300">{money(grossAmount)}</strong></div>
              </div>
            </div>
          </>}

          {invoiceStep === 3 && <>
            <h3 className="text-sm font-black text-slate-800 dark:text-white mb-1">Bill preview</h3>
            <p className="text-[11px] text-slate-500 mb-4">Review the actual customer and service details before recording the invoice.</p>
            <div className="max-w-4xl mx-auto rounded-xl border border-slate-200 bg-white text-slate-800 p-5 md:p-7 shadow-sm">
              <div className="flex justify-between gap-5 flex-wrap border-b-2 border-double border-slate-400 pb-4">
                <div><h4 className="font-black text-lg">{businessProfile?.tradeName || businessProfile?.registeredName || businessProfile?.name || 'CAPOTBOOKS Business'}</h4><p className="text-[10px] text-slate-500">{businessProfile?.address || [businessProfile?.street, businessProfile?.barangay, businessProfile?.city].filter(Boolean).join(', ')}</p><p className="text-[10px] text-slate-500">{businessProfile?.tin ? `TIN: ${businessProfile.tin}` : ''}</p></div>
                <div className="text-right"><h4 className="font-black text-xl tracking-widest">{selectedTemplate?.documentTitle || 'INVOICE'}</h4><p className="text-xs">{invoiceNo || 'Bill No. not entered'}</p><p className="text-[10px] text-slate-500">Date: {date} · Due: {dueDate}</p></div>
              </div>
              <div className="grid grid-cols-2 gap-4 my-5 text-xs"><div><p className="font-black text-[9px] uppercase tracking-widest text-slate-400 mb-1">Bill to</p><p className="font-bold">{customerName || 'Customer name not entered'}</p><p>{customerTin}</p><p>{customerAddress}</p><p>{customerEmail}</p></div><div><p className="font-black text-[9px] uppercase tracking-widest text-slate-400 mb-1">VAT classification</p><p>{vatType}{isVatable ? ' · 12% VAT-inclusive' : ''}</p></div></div>
              <div className="overflow-x-auto"><table className="w-full text-xs"><thead className="bg-slate-100"><tr><th className="text-left p-2">Description</th><th className="text-right p-2">Qty</th><th className="text-right p-2">Unit price</th><th className="text-right p-2">Amount</th></tr></thead><tbody>{cleanLineItems.filter(item => item.description || item.qty || item.unitPrice).map((item, index) => <tr key={item.id || index} className="border-b border-slate-200"><td className="p-2">{item.description || '—'}</td><td className="p-2 text-right">{item.qty}</td><td className="p-2 text-right">{money(item.unitPrice)}</td><td className="p-2 text-right">{money(item.qty * item.unitPrice)}</td></tr>)}</tbody></table></div>
              <div className="max-w-xs ml-auto mt-4 space-y-1.5 text-xs"><div className="flex justify-between"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className="flex justify-between"><span>Discount ({discountRate.toFixed(2)}%)</span><strong>- {money(discountAmount)}</strong></div>{isVatable && <><div className="flex justify-between"><span>Net of VAT</span><strong>{money(netOfVat)}</strong></div><div className="flex justify-between"><span>Output VAT (12%)</span><strong>{money(outputTax)}</strong></div></>}<div className="border-t-2 border-slate-800 pt-2 flex justify-between text-sm font-black"><span>TOTAL DUE</span><span>{money(grossAmount)}</span></div></div>
              <p className="text-center text-[9px] text-slate-400 mt-7 border-t border-slate-200 pt-3">Generated from CAPOTBOOKS billing records. This document is not proof of payment.</p>
            </div>
            <div className="mt-3 text-[10px] text-slate-500">Template: {selectedTemplate?.name || 'Standard'} · Terms and conditions follow the selected invoice template. No separate invoice note field is shown.</div>
          </>}

          {invoiceStep === 4 && <>
            <h3 className="text-sm font-black text-slate-800 dark:text-white mb-1">Record & deliver invoice</h3>
            <p className="text-[11px] text-slate-500 mb-4">Record the invoice first. Then download the PDF, open the browser print dialog, or prepare an email draft.</p>
            {!recordedInvoice ? <div className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/20 p-4">
              <div className="text-xs text-indigo-800 dark:text-indigo-200 mb-3"><strong>Ready to record:</strong> {invoiceNo || 'Bill No. pending'} · {customerName || 'Customer pending'} · {money(grossAmount)} total due.</div>
              <button type="button" onClick={handleAddInvoice} disabled={isSavingInvoice} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 text-xs font-black disabled:opacity-60"><Save className="w-4 h-4" /> {isSavingInvoice ? 'Recording…' : 'Record bill'}</button>
            </div> : <>
              <div className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 p-4 mb-4"><div className="font-black text-sm text-emerald-800 dark:text-emerald-200">Bill {recordedInvoice.invoiceNo} recorded</div><div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">{recordedInvoice.customerName} · {money(recordedInvoice.amount)} · Due {recordedInvoice.dueDate}</div></div>
              <div className="flex flex-col sm:flex-row sm:items-end gap-2 mb-4">
                <div className="flex-1"><label className="form-label">Customer email for delivery</label><input type="email" value={customerEmail || recordedInvoice.customerEmail || ''} onChange={e => setCustomerEmail(e.target.value)} placeholder="customer@example.com" className="form-input" /></div>
                <button type="button" onClick={handleSaveInvoiceEmail} className="rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">Save recipient</button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button type="button" onClick={() => handleDownloadPdf(recordedInvoice)} className="rounded-xl border border-indigo-200 dark:border-indigo-900 bg-indigo-50 dark:bg-indigo-950/20 p-4 text-left hover:border-indigo-400"><FileDown className="w-5 h-5 text-indigo-600 mb-2" /><span className="block text-xs font-black">Save as PDF</span><span className="block text-[10px] text-slate-500 mt-1">Download customer invoice</span></button>
                <button type="button" onClick={() => handlePrintNewInvoice(recordedInvoice)} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4 text-left hover:border-slate-400"><Printer className="w-5 h-5 text-slate-600 dark:text-slate-300 mb-2" /><span className="block text-xs font-black">Print</span><span className="block text-[10px] text-slate-500 mt-1">Open browser print dialog</span></button>
                <button type="button" onClick={() => handleEmailNewInvoice(recordedInvoice)} className="rounded-xl border border-emerald-200 dark:border-emerald-900 bg-emerald-50 dark:bg-emerald-950/20 p-4 text-left hover:border-emerald-400"><Mail className="w-5 h-5 text-emerald-600 mb-2" /><span className="block text-xs font-black">Email customer</span><span className="block text-[10px] text-slate-500 mt-1">Prepare email with PDF download</span></button>
              </div>
              <button type="button" onClick={resetInvoiceForm} className="mt-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-black">Create another bill</button>
            </>}
          </>}

          <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
            <button type="button" onClick={() => setInvoiceStep(step => Math.max(1, step - 1) as 1 | 2 | 3 | 4)} disabled={invoiceStep === 1 || !!recordedInvoice} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-30"><ArrowLeft className="w-3.5 h-3.5" /> Back</button>
            {invoiceStep < 4 && <button type="button" onClick={advanceInvoiceStep} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 text-xs font-black">{invoiceStep === 2 ? 'Preview bill' : invoiceStep === 3 ? 'Record & send' : 'Next'} <ArrowRight className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
      </section>}

      <div className="flex items-center gap-2 mb-4">
        <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Filter:</label>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value as any)} className="text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg outline-none">
          <option value="All">All</option>
          <option value="Outstanding">Outstanding</option>
          <option value="Overdue">Overdue</option>
          <option value="Paid">Paid</option>
          <option value="Recurring">Recurring Bills</option>
        </select>
      </div>

      <div className="space-y-3">
        {filteredInvoices.length === 0 && (
          <div className="py-8"><EmptyState compact icon={<CreditCard className="w-7 h-7" />} title={statusFilter === 'Recurring' ? 'No recurring bills yet' : 'No bills yet'} description="Create a bill to start tracking receivables and payments." /></div>
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
                          <RefreshCw className="w-2.5 h-2.5" /> Recurring · {inv.recurrenceFrequency}
                        </span>
                      )}
                      {eisBadgeFor(inv.id)}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-1">
                      Issued {inv.date} · Due {inv.dueDate} · TIN {inv.customerTin}{inv.isRecurring && inv.nextBillingDate ? ` · Next bill ${inv.nextBillingDate}` : ''}
                    </div>
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
                    <button onClick={() => handleGenerateNext(inv)} disabled={generatingRecurringId === inv.id} className="text-xs text-cyan-700 dark:text-cyan-400 font-bold border border-cyan-200 dark:border-cyan-800 rounded-lg px-3 py-1.5 hover:bg-cyan-50 dark:hover:bg-cyan-950/20 transition flex items-center gap-1.5 disabled:opacity-50">
                      <RefreshCw className="w-3.5 h-3.5" /> {generatingRecurringId === inv.id ? 'Generating…' : 'Generate Next Bill'}
                    </button>
                  )}
                  {canBillingAction('print') && <button onClick={() => handleDownloadPdf(inv)} className="text-xs text-slate-600 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center gap-1.5">
                    <FileDown className="w-3.5 h-3.5" /> PDF
                  </button>}
                  {inv.customerEmail && canBillingAction('edit') && canBillingAction('print') && <button onClick={() => handleEmailNewInvoice(inv)} className="text-xs text-emerald-700 dark:text-emerald-400 font-bold border border-emerald-200 dark:border-emerald-800 rounded-lg px-3 py-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-950/20 transition flex items-center gap-1.5"><Mail className="w-3.5 h-3.5" /> Email</button>}
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
      <Modal
        open={newCustomerOpen}
        onClose={() => { if (!isSavingNewCustomer) setNewCustomerOpen(false); }}
        title="Add new customer"
        description="Register the customer in the TIN Library and use the details on this invoice."
        size="lg"
        closeOnBackdrop={!isSavingNewCustomer}
        closeOnEscape={!isSavingNewCustomer}
        footer={(
          <>
            <button type="button" onClick={() => setNewCustomerOpen(false)} disabled={isSavingNewCustomer} className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50">Cancel</button>
            <button type="button" onClick={handleCreateCustomer} disabled={isSavingNewCustomer} className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50">
              {isSavingNewCustomer ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <UserPlus className="w-3.5 h-3.5" />}
              {isSavingNewCustomer ? 'Saving customer…' : 'Save & Select Customer'}
            </button>
          </>
        )}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="form-label">Customer TIN <span className="text-rose-500">*</span></label>
            <input type="text" value={newCustomerTin} onChange={e => setNewCustomerTin(formatTIN(e.target.value))} placeholder="000-000-000" maxLength={11} autoFocus className="form-input font-mono" />
          </div>
          <div>
            <label className="form-label">Customer name <span className="text-rose-500">*</span></label>
            <input type="text" value={newCustomerName} onChange={e => setNewCustomerName(e.target.value)} placeholder="Registered customer / business name" className="form-input" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">Customer address <span className="text-rose-500">*</span></label>
            <input type="text" value={newCustomerAddress} onChange={e => setNewCustomerAddress(e.target.value)} placeholder="Complete registered address" className="form-input" />
          </div>
          <div className="md:col-span-2">
            <label className="form-label">Customer email (optional)</label>
            <input type="email" value={newCustomerEmail} onChange={e => setNewCustomerEmail(e.target.value)} placeholder="customer@example.com" className="form-input" />
            <p className="mt-1 text-[10px] text-slate-500">Email will be saved on this invoice. TIN Library stores the customer's TIN, name, and address.</p>
          </div>
        </div>
      </Modal>
      <TemplateEditor open={editorOpen} onClose={() => setEditorOpen(false)} clientId={currentClientId!} docType="billing"
        editing={editingTpl}
        onSave={(tpl) => { if (!canBillingAction('edit')) { showToast('Your profile does not have permission to edit billing templates.'); return; } import('../lib/invoiceTemplates').then(m => { m.saveTemplate(currentClientId!, tpl); setTemplateId(tpl.id); showToast('Template saved'); }); }}
        onDelete={(id) => { if (!canBillingAction('delete')) { showToast('Your profile does not have permission to delete billing templates.'); return; } import('../lib/invoiceTemplates').then(m => { m.deleteTemplate(currentClientId!, id); setTemplateId('builtin-standard-blue'); }); }} />
          </div>
    </div>
  );
}
