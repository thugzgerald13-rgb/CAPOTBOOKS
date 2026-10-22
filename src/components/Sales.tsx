import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatTIN, MONTHS, getMonthName } from '../lib/utils';
import { Receipt, Plus, RotateCcw } from 'lucide-react';
import { supabase } from '../lib/supabase';

import { useGranularPermissions } from '../lib/useGranularPermissions';

const CASH_RECEIPT_PAYMENT_TYPES = ['Cash', 'Check', 'E-Payment', 'Bank Transfer'];
const SALES_JOURNAL_PAYMENT_TYPES = ['Credit Card', 'On Account'];

export function Sales() {
  const { currentClient, currentClientId, saveSale, showToast } = useAccounting();
  const { canAction: canSalesAction, canDropdownOption: canSalesDropdown } = useGranularPermissions('sales');
  const paymentTypeOptions = [
    { value: 'Cash', label: 'Cash', permission: 'cash' },
    { value: 'Check', label: 'Check', permission: 'check' },
    { value: 'E-Payment', label: 'E-Payment', permission: 'bank' },
    { value: 'Bank Transfer', label: 'Bank Transfer', permission: 'bank' },
    { value: 'Credit Card', label: 'Credit Card', permission: 'credit' },
    { value: 'On Account', label: 'On Account', permission: 'credit' },
  ].filter((option) => canSalesDropdown('payment_type', option.permission));
  const vatTypeOptions = [
    { value: 'VATable', label: 'VATable', permission: 'vatable' },
    { value: 'VAT Exempt', label: 'VAT Exempt', permission: 'vat_exempt' },
    { value: 'Zero-Rated', label: 'Zero-Rated', permission: 'zero_rated' },
  ].filter((option) => canSalesDropdown('vat_type', option.permission));
  const incomeTypeOptions = [
    { value: 'Service Income', label: 'Service Income', permission: 'services' },
    { value: 'Sale of Goods', label: 'Sale of Goods', permission: 'goods' },
  ].filter((option) => canSalesDropdown('income_type', option.permission));
  const canChooseMultipleIncomeTypes = canSalesDropdown('income_type', 'goods') && canSalesDropdown('income_type', 'services');
  const PAGE_SIZE = 50;
  const [salesPage, setSalesPage] = useState(0);
  const [salesTotal, setSalesTotal] = useState(0);
  const [salesRows, setSalesRows] = useState<any[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);
  const [salesRefresh, setSalesRefresh] = useState(0);

  
  // Server-side paginated sales history. The entry form remains lightweight
  // while the list below retrieves only 50 rows at a time.
  useEffect(() => {
    if (!currentClientId) { setSalesRows([]); setSalesTotal(0); return; }
    let cancelled = false;
    const loadSales = async () => {
      setSalesLoading(true); setSalesError(null);
      const from = salesPage * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, count, error } = await supabase
        .from('sales')
        .select('id,dat_month_year,date,ref,payment_type,buyer_tin,buyer_name,buyer_address,vat_type,amount,net_of_vat,output_tax,income_type,description', { count: 'planned' })
        .eq('client_id', currentClientId)
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .range(from, to);
      if (cancelled) return;
      if (error) { setSalesError(error.message); setSalesRows([]); }
      else { setSalesRows((data || []).map((r:any) => ({ id:Number(r.id)||r.id, datMonthYear:r.dat_month_year||'', date:r.date ? String(r.date).slice(0,10) : '', ref:r.ref||'', paymentType:r.payment_type||'', buyerTin:r.buyer_tin||'', buyerName:r.buyer_name||'', buyerAddress:r.buyer_address||'', vatType:r.vat_type||'', amount:Number(r.amount||0), netOfVat:Number(r.net_of_vat||0), outputTax:Number(r.output_tax||0), incomeType:r.income_type||'', desc:r.description||'' }))); setSalesTotal(count || 0); }
      setSalesLoading(false);
    };
    loadSales();
    return () => { cancelled = true; };
  }, [currentClientId, salesPage, salesRefresh]);

  useEffect(() => { setSalesPage(0); }, [currentClientId]);

  // Form State
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentType, setPaymentType] = useState('Cash');
  const [ref, setRef] = useState('');
  const [buyerTin, setBuyerTin] = useState('');
  const [buyerName, setBuyerName] = useState('');
  const [buyerAddress, setBuyerAddress] = useState('');
  const [vatType, setVatType] = useState('VATable');
  const [amount, setAmount] = useState('');
  const [incomeType, setIncomeType] = useState('');
  const [desc, setDesc] = useState('');
  const [autoLoadMsg, setAutoLoadMsg] = useState('');
  const [creditNote, setCreditNote] = useState(false);



  // Auto-fill buyer name + address from TIN library (digits-normalized match).
  useEffect(() => {
    const digits = buyerTin.replace(/\D/g, '');
    const lib = currentClient?.tinLibrary?.customers || [];
    if (digits.length >= 9 && lib.length > 0) {
      const found = lib.find(c => (c.tin || '').replace(/\D/g, '').slice(0, 9) === digits.slice(0, 9));
      if (found) {
        setBuyerName(found.name);
        if (found.address) setBuyerAddress(found.address);
        setAutoLoadMsg(`Loaded: ${found.name}`);
        const t = setTimeout(() => setAutoLoadMsg(''), 2000);
        return () => clearTimeout(t);
      }
    }
  }, [buyerTin, currentClient]);

  // Computed VAT breakdown from the entered gross Amount and VAT classification
  const grossAmount = parseFloat(amount) || 0;
  const isVatable = vatType === 'VATable';
  const netOfVat = isVatable ? grossAmount / 1.12 : grossAmount;
  const outputTax = isVatable ? grossAmount - netOfVat : 0;

  const handleAddSale = () => {
    if (!canSalesAction('add')) { showToast('Your profile does not have permission to add income entries.'); return; }
    const paymentPermission = paymentTypeOptions.find((option) => option.value === paymentType)?.permission;
    const vatPermission = vatTypeOptions.find((option) => option.value === vatType)?.permission;
    if (!paymentPermission || !canSalesDropdown('payment_type', paymentPermission) || !vatPermission || !canSalesDropdown('vat_type', vatPermission)) {
      showToast('The selected payment or VAT option is not permitted for your profile.'); return;
    }
    if (incomeType && incomeType !== 'Multiple' && !canSalesDropdown('income_type', incomeType === 'Service Income' ? 'services' : 'goods')) {
      showToast('The selected income type is not permitted for your profile.'); return;
    }
    if (incomeType === 'Multiple' && !canChooseMultipleIncomeTypes) { showToast('Your profile cannot use the Multiple income type.'); return; }
    if (!currentClient || !currentClientId) return;
    if (!date || !amount) {
      alert('Enter date and amount');
      return;
    }
    if (!ref.trim() || !buyerName.trim()) {
      alert('Invoice # and Customer Name are required.');
      return;
    }

    const selectedDate = new Date(date);
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth() + 1;

    const newSale = {
      id: Date.now(),
      datMonthYear: `${getMonthName(m)} ${y}`,
      date,
      ref,
      paymentType,
      buyerTin,
      buyerName,
      buyerAddress,
      vatType,
      amount: creditNote ? -grossAmount : grossAmount,
      netOfVat: creditNote ? -netOfVat : netOfVat,
      outputTax: creditNote ? -outputTax : outputTax,
      incomeType,
      desc: creditNote ? `Credit Note: ${desc || ref}` : desc
    };

    const persistSale = async () => {
      try {
        // Duplicate guard: same Invoice # + Customer TIN already saved.
        const tinDigits = buyerTin.replace(/\D/g, '');
        const refKey = ref.trim();
        const dupInMemory = salesRows.some(r => (r.ref || '').trim() === refKey && (r.buyerTin || '').replace(/\D/g, '') === tinDigits);
        if (dupInMemory) {
          showToast('Duplicate entry: this Invoice # is already saved for this Customer TIN.');
          return;
        }
        const { data: dupRows } = await supabase
          .from('sales')
          .select('id,buyer_tin')
          .eq('client_id', currentClientId)
          .eq('ref', refKey)
          .limit(50);
        const dupRemote = (dupRows || []).some(r => (r.buyer_tin || '').replace(/\D/g, '') === tinDigits);
        if (dupRemote) {
          showToast('Duplicate entry: this Invoice # is already saved for this Customer TIN.');
          return;
        }

        await saveSale(String(newSale.id), newSale);

        // Income History is the single source of truth for both subsidiary journals.
        // CRJ/SJ read the saved sale by payment type, so no separate journal copy is created here.
        setSalesRefresh(v => v + 1);
        if (CASH_RECEIPT_PAYMENT_TYPES.includes(paymentType)) {
          showToast('Income entry added and will appear in Cash Receipts Journal');
        } else if (SALES_JOURNAL_PAYMENT_TYPES.includes(paymentType)) {
          showToast('Income entry added and will appear in Sales Journal');
        } else {
          showToast('Income entry added');
        }
        // Reset form only on successful save (blocked duplicates keep the entry for editing).
        setRef('');
        setBuyerName('');
        setBuyerTin('');
        setBuyerAddress('');
        setAmount('');
        setDesc('');
        setCreditNote(false);
      } catch (error) {
        console.error('Saving sale failed:', error);
        showToast('Unable to save income entry');
      }
    };
    void persistSale();
  };

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Income" icon={<Receipt className="w-5 h-5 text-emerald-500" />} />
      <div className="p-4 md:p-6 flex-1">

      {canSalesAction('add') && <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
        <div>
          <label className="form-label">Date</label>
          <input 
            type="date" 
            value={date} 
            onChange={e => setDate(e.target.value)} 
            className="form-input" 
          />
        </div>
        <div>
          <label className="form-label">Payment Type</label>
          <select value={paymentType} onChange={e => setPaymentType(e.target.value)} className="form-input" disabled={paymentTypeOptions.length === 0}>
            {paymentTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </div>
        <div>
          <label className="form-label">Invoice # <span className="text-rose-500">*</span></label>
          <input type="text" value={ref} onChange={e => setRef(e.target.value)} placeholder="INV-001" required className="form-input" />
        </div>
        <div className="relative">
          <label className="form-label">Customer TIN</label>
          <input 
            type="text" 
            value={buyerTin} 
            onChange={e => setBuyerTin(formatTIN(e.target.value))} 
            placeholder="000-000-000"
            className="form-input font-mono" 
            maxLength={11}
          />
          {autoLoadMsg && (
            <span className="absolute top-8 right-3 text-xs bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300 px-2 py-1 rounded">
              {autoLoadMsg}
            </span>
          )}
        </div>
        <div className="lg:col-span-2">
          <label className="form-label">Customer Name <span className="text-rose-500">*</span></label>
          <input type="text" value={buyerName} onChange={e => setBuyerName(e.target.value)} placeholder="Company / Full Name" required className="form-input" />
        </div>
        <div className="lg:col-span-2">
          <label className="form-label">Customer Address</label>
          <input type="text" value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="Business / Residential Address" className="form-input" />
        </div>
        <div>
          <label className="form-label">VAT / Exempt / 0-Rated</label>
          <select value={vatType} onChange={e => setVatType(e.target.value)} className="form-input" disabled={vatTypeOptions.length === 0}>
            {vatTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
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
        {currentClient?.hasMultipleBusinessLines && (
          <div className="lg:col-span-2">
            <label className="form-label">Service Income / Sales</label>
            <select value={incomeType} onChange={e => setIncomeType(e.target.value)} className="form-input" disabled={incomeTypeOptions.length === 0}>
              <option value="">Select type...</option>
              {incomeTypeOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              {canChooseMultipleIncomeTypes && <option value="Multiple">Multiple</option>}
            </select>
          </div>
        )}
        <div className="lg:col-span-4">
          <label className="form-label">Description</label>
          <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional notes about this transaction" className="form-input" />
        </div>
        <div className="lg:col-span-4 flex items-center gap-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="w-4 h-4 rounded accent-rose-500" checked={creditNote} onChange={e => setCreditNote(e.target.checked)} />
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 inline-flex items-center gap-1.5"><RotateCcw className="w-3.5 h-3.5" /> Credit note (records as negative income / reverses VAT)</span>
          </label>
        </div>
        <div className="lg:col-span-4 mt-2">
          <button onClick={handleAddSale} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-colors shadow-sm shadow-emerald-500/20 flex justify-center items-center gap-2">
            <Plus className="w-5 h-5" /> Add Income Entry
          </button>
        </div>
      </div>}

      </div>
    </div>
  );
}

