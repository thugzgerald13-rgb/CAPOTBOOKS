import { useState, useEffect } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatTIN, MONTHS, getMonthName } from '../lib/utils';
import { Receipt, Plus } from 'lucide-react';
import { supabase } from '../lib/supabase';

const CASH_RECEIPT_PAYMENT_TYPES = ['Cash', 'Check', 'E-Payment', 'Bank Transfer'];
const SALES_JOURNAL_PAYMENT_TYPES = ['Credit Card', 'On Account'];

export function Sales() {
  const { currentClient, currentClientId, saveSale, showToast } = useAccounting();
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



  // Auto-fill buyer name from TIN library
  useEffect(() => {
    if (buyerTin.length === 11 && currentClient) {
      const found = currentClient.tinLibrary.customers.find(c => c.tin === buyerTin);
      if (found) {
        setBuyerName(found.name);
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
      amount: grossAmount,
      netOfVat,
      outputTax,
      incomeType,
      desc
    };

    const persistSale = async () => {
      try {
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
      } catch (error) {
        console.error('Saving sale failed:', error);
        showToast('Unable to save income entry');
      }
    };
    void persistSale();

    // Reset Form
    setRef('');
    setBuyerName('');
    setBuyerTin('');
    setBuyerAddress('');
    setAmount('');
    setDesc('');
  };

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Income" icon={<Receipt className="w-5 h-5 text-emerald-500" />} />
      <div className="p-4 md:p-6 flex-1">

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700">
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
          <select value={paymentType} onChange={e => setPaymentType(e.target.value)} className="form-input">
            <option>Cash</option>
            <option>Check</option>
            <option>E-Payment</option>
            <option>Bank Transfer</option>
            <option>Credit Card</option>
            <option>On Account</option>
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
        {currentClient?.hasMultipleBusinessLines && (
          <div className="lg:col-span-2">
            <label className="form-label">Service Income / Sales</label>
            <select value={incomeType} onChange={e => setIncomeType(e.target.value)} className="form-input">
              <option value="">Select type...</option>
              <option value="Service Income">Service Income</option>
              <option value="Sale of Goods">Sale of Goods</option>
              <option value="Multiple">Multiple</option>
            </select>
          </div>
        )}
        <div className="lg:col-span-4">
          <label className="form-label">Description</label>
          <input type="text" value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional notes about this transaction" className="form-input" />
        </div>
        <div className="lg:col-span-4 mt-2">
          <button onClick={handleAddSale} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 rounded-xl transition-colors shadow-sm shadow-emerald-500/20 flex justify-center items-center gap-2">
            <Plus className="w-5 h-5" /> Add Income Entry
          </button>
        </div>
      </div>

      </div>
    </div>
  );
}

