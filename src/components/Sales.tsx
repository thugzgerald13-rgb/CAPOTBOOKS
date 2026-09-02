import { useState, useEffect } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatTIN, MONTHS, getMonthName } from '../lib/utils';
import { Receipt, Plus } from 'lucide-react';
import { DEFAULT_CRJ_COLUMNS } from './CashReceiptsJournal';
import { JournalEntry } from '../types';
import { supabase } from '../lib/supabase';

const CASH_RECEIPT_PAYMENT_TYPES = ['Cash', 'Check', 'E-Payment', 'Bank Transfer'];
const SALES_JOURNAL_PAYMENT_TYPES = ['Credit Card', 'On Account'];

export function Sales() {
  const { currentClient, currentClientId, saveClient, showToast } = useAccounting();
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

  // Builds a Cash Receipts Journal row from this sale, matching whatever columns currently exist
  const buildCashReceiptEntry = (): JournalEntry => {
    const columns = currentClient?.crjColumns || DEFAULT_CRJ_COLUMNS;
    const colIds = new Set(columns.map(c => c.id));
    const values: Record<string, string> = {};
    if (colIds.has('date')) values['date'] = date;
    if (colIds.has('reference')) values['reference'] = ref;
    if (colIds.has('description')) values['description'] = `${incomeType} - ${buyerName}${desc ? ` (${desc})` : ''}`;
    if (colIds.has('post_ref')) values['post_ref'] = buyerTin;
    if (colIds.has('cash')) values['cash'] = grossAmount.toFixed(2);
    if (colIds.has('sales')) values['sales'] = netOfVat.toFixed(2);
    if (colIds.has('sundry') && outputTax > 0) values['sundry'] = outputTax.toFixed(2);
    return { id: crypto.randomUUID(), values };
  };

  const handleAddSale = () => {
    if (!currentClient || !currentClientId) return;
    if (!date || !amount) {
      alert('Enter date and amount');
      return;
    }
    if (!ref.trim() || !buyerTin.trim() || !buyerName.trim() || !buyerAddress.trim()) {
      alert('Invoice #, Customer TIN, Customer Name, and Customer Address are all required.');
      return;
    }

    const newSale = {
      id: Date.now(),
      datMonthYear: `${getMonthName(parseInt(m))} ${y}`,
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

    const updatedClient = {
      ...currentClient,
      sales: [...salesRows, newSale],
      // Sales Journal (Credit Card / On Account) is derived by filtering `sales` on paymentType,
      // so nothing else needs to change there. Cash Receipts Journal is a separate free-form
      // ledger, so we append a matching row to it here when payment was cash-like.
      ...(CASH_RECEIPT_PAYMENT_TYPES.includes(paymentType)
        ? { crjEntries: [...(currentClient.crjEntries || []), buildCashReceiptEntry()] }
        : {})
    };

    saveClient(currentClientId, updatedClient);
    setSalesRefresh(v => v + 1);

    if (CASH_RECEIPT_PAYMENT_TYPES.includes(paymentType)) {
      showToast('Income entry added and posted to Cash Receipts Journal');
    } else if (SALES_JOURNAL_PAYMENT_TYPES.includes(paymentType)) {
      showToast('Income entry added and posted to Sales Journal');
    } else {
      showToast('Income entry added');
    }
    
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
          <label className="form-label">Customer TIN <span className="text-rose-500">*</span></label>
          <input 
            type="text" 
            value={buyerTin} 
            onChange={e => setBuyerTin(formatTIN(e.target.value))} 
            placeholder="000-000-000" 
            required
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
          <label className="form-label">Customer Address <span className="text-rose-500">*</span></label>
          <input type="text" value={buyerAddress} onChange={e => setBuyerAddress(e.target.value)} placeholder="Business / Residential Address" required className="form-input" />
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

      <div className="mt-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div><h3 className="font-bold text-slate-800 dark:text-slate-100">Income entries for all periods</h3><p className="text-xs text-slate-500 dark:text-slate-400">Server-side pagination · 50 records per request · {salesTotal.toLocaleString()} total</p></div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={salesLoading || salesPage === 0} onClick={() => setSalesPage(p => Math.max(0,p-1))} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold disabled:opacity-40">Previous</button>
            <span className="text-xs font-bold text-slate-500 min-w-[90px] text-center">Page {salesPage+1} of {Math.max(1,Math.ceil(salesTotal/PAGE_SIZE))}</span>
            <button type="button" disabled={salesLoading || (salesPage+1)*PAGE_SIZE >= salesTotal} onClick={() => setSalesPage(p => p+1)} className="px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-bold disabled:opacity-40">Next</button>
          </div>
        </div>
        {salesLoading ? <div className="py-6 text-center text-sm text-slate-500">Loading income entries…</div> : salesError ? <div className="py-6 text-center text-sm text-red-500">{salesError}</div> : salesRows.length === 0 ? <div className="py-6 text-center text-sm text-slate-500">No income entries found.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-slate-200 dark:border-slate-700 text-left text-xs uppercase text-slate-500"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Invoice / Ref</th><th className="py-2 pr-3">Customer</th><th className="py-2 text-right">Amount</th></tr></thead><tbody>{salesRows.map((r:any)=><tr key={String(r.id)} className="border-b border-slate-100 dark:border-slate-800"><td className="py-2 pr-3 whitespace-nowrap">{r.date}</td><td className="py-2 pr-3">{r.ref || '—'}</td><td className="py-2 pr-3">{r.buyerName}</td><td className="py-2 text-right font-semibold">₱{r.amount.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>)}</tbody></table></div>}
      </div>
      </div>
    </div>
  );
}
