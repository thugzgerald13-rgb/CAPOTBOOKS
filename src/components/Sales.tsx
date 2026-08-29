import { useState, useEffect } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatTIN, MONTHS, getMonthName } from '../lib/utils';
import { Receipt, Plus } from 'lucide-react';
import { DEFAULT_CRJ_COLUMNS } from './CashReceiptsJournal';
import { JournalEntry } from '../types';
import { DEFAULT_SJ_COLUMNS } from './SalesJournal';

const CASH_RECEIPT_PAYMENT_TYPES = ['Cash', 'Check', 'E-Payment', 'Bank Transfer'];
const SALES_JOURNAL_PAYMENT_TYPES = ['Credit Card', 'On Account'];

export function Sales() {
  const { currentClient, currentClientId, currentDat, setCurrentDat, saveClient, showToast } = useAccounting();

  
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
  const [dateWarning, setDateWarning] = useState<string | null>(null);

  // Default to the current month/year if no period has been picked yet,
  // so Save works immediately without requiring the user to touch the picker.
  useEffect(() => {
    if (!currentDat) {
      const now = new Date();
      const month = now.getMonth() + 1;
      const year = now.getFullYear();
      setCurrentDat({ month, year, formatted: `${getMonthName(month)} ${year}` });
    }
  }, []);

  // Date validation against DAT
  useEffect(() => {
    if (!currentDat || !date) {
      setDateWarning(null);
      return;
    }
    const selectedDate = new Date(date);
    const y = selectedDate.getFullYear();
    const m = selectedDate.getMonth() + 1;

    if (y > currentDat.year) {
      setDateWarning(`⚠️ Transaction year (${y}) cannot be later than DAT year (${currentDat.year})`);
    } else if (y < currentDat.year) {
      setDateWarning(`⚠️ Transaction year (${y}) is earlier than DAT year (${currentDat.year}).`);
    } else if (m > currentDat.month) {
      setDateWarning(`⚠️ Transaction month cannot be later than DAT month`);
    } else if (m < currentDat.month) {
      setDateWarning(`⚠️ Transaction month is earlier than DAT month.`);
    } else {
      setDateWarning(null);
    }
  }, [date, currentDat]);

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
    if (!currentClient || !currentClientId || !currentDat) return;
    if (!date || !amount) {
      alert('Enter date and amount');
      return;
    }
    if (!ref.trim() || !buyerTin.trim() || !buyerName.trim() || !buyerAddress.trim()) {
      alert('Invoice #, Customer TIN, Customer Name, and Customer Address are all required.');
      return;
    }
    if (dateWarning) {
      alert('Please fix date warning before saving.');
      return;
    }

    const newSale = {
      id: Date.now(),
      datMonthYear: currentDat.formatted,
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
      sales: [...currentClient.sales, newSale],
      ...(CASH_RECEIPT_PAYMENT_TYPES.includes(paymentType)
        ? { crjEntries: [...(currentClient.crjEntries || []), buildCashReceiptEntry()] }
        : {}),
      ...(SALES_JOURNAL_PAYMENT_TYPES.includes(paymentType)
        ? {
            sjColumns: currentClient.sjColumns || DEFAULT_SJ_COLUMNS,
            sjEntries: [
              ...(currentClient.sjEntries || []),
              {
                id: String(newSale.id),
                values: {
                  date,
                  invoice_no: ref,
                  customer: buyerName,
                  customer_tin: buyerTin,
                  description: `${incomeType}${desc ? ` - ${desc}` : ''}`.trim(),
                  net_sales: netOfVat.toFixed(2),
                  output_vat: outputTax.toFixed(2),
                  accounts_receivable: grossAmount.toFixed(2),
                  payment_type: paymentType,
                },
                auto: true,
                autoSource: 'Sales',
              }
            ]
          }
        : {})
    };

    saveClient(currentClientId, updatedClient);

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
            min={currentDat ? `${currentDat.year}-${String(currentDat.month).padStart(2, '0')}-01` : undefined}
            max={currentDat ? `${currentDat.year}-${String(currentDat.month).padStart(2, '0')}-${String(new Date(currentDat.year, currentDat.month, 0).getDate()).padStart(2, '0')}` : undefined}
            className="form-input" 
          />
          {dateWarning && <p className="text-xs text-amber-600 mt-1">{dateWarning}</p>}
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
      </div>
    </div>
  );
}
