import { useState, useEffect } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatTIN, generateCSV, MONTHS, getMonthName } from '../lib/utils';
import { ShoppingCart, Plus, ArrowLeft, FolderClock, ChevronsLeft, ChevronsRight, ChevronLeft, ChevronRight, PlusCircle, Trash2 } from 'lucide-react';
import { cn } from '../lib/utils';
import { DEFAULT_ACCOUNTS } from './ChartOfAccounts';

export function Purchases() {
  const { currentClient, currentClientId, currentDat, saveClient, showToast, setCurrentDat, navigateToPage } = useAccounting();
  
  // Single record state (similar to original but react-friendly)
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState('Cash');
  const [bankName, setBankName] = useState('');
  const [checkNumber, setCheckNumber] = useState('');
  const [invoiceNo, setInvoiceNo] = useState('');
  const [supplierTin, setSupplierTin] = useState('');
  const [supplierName, setSupplierName] = useState('');
  const [supplierAddress, setSupplierAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [netAmount, setNetAmount] = useState(0);
  const [vatType, setVatType] = useState('vat');
  const [expenseType, setExpenseType] = useState('Capital Goods');
  const [accountTitle, setAccountTitle] = useState('');
  const [transactionDetails, setTransactionDetails] = useState('');
  const [inputTax, setInputTax] = useState(0);

  const [selectedAccountType, setSelectedAccountType] = useState('Expenses');

  // Derive available accounts from Chart of Accounts
  const coaAccounts = (() => {
    let accs = currentClient?.accounts || [];
    if (accs.length === 0) accs = DEFAULT_ACCOUNTS;
    if (currentDat) {
      return accs.filter(a => expenseType === 'Capital Goods' ? (a.type.toLowerCase() === 'asset' || a.type.toLowerCase() === 'assets') : (a.type.toLowerCase() === 'expense' || a.type.toLowerCase() === 'expenses'));
    } else {
      const t = selectedAccountType.toLowerCase();
      return accs.filter(a => {
        const at = a.type.toLowerCase();
        if (t === 'assets') return at === 'asset' || at === 'assets';
        if (t === 'liabilities') return at === 'liability' || at === 'liabilities';
        if (t === 'equity') return at === 'equity';
        if (t === 'income') return at === 'income' || at === 'revenue';
        if (t === 'costs') return at === 'costs' || at === 'cost' || at === 'expense' || at === 'expenses';
        if (t === 'expenses') return at === 'expense' || at === 'expenses' || at === 'costs';
        return at === t;
      });
    }
  })();

  // Reset account title when expense type changes, if not already in list
  useEffect(() => {
    if (coaAccounts.length > 0) {
      if (!coaAccounts.find(a => a.name === accountTitle)) {
        setAccountTitle(coaAccounts[0].name);
      }
    } else {
      setAccountTitle('');
    }
  }, [expenseType, selectedAccountType, coaAccounts, accountTitle]);

  const [dateWarning, setDateWarning] = useState<string | null>(null);
  const [sequenceNumber, setSequenceNumber] = useState(1);

  const [viewIndex, setViewIndex] = useState<number | null>(null);

  // Auto-count sequence number
  useEffect(() => {
    if (currentClient && viewIndex === null) {
      const periodPurchases = currentClient.purchases || [];
      const count = currentDat ? periodPurchases.filter(p => p.datMonthYear === currentDat.formatted).length : 0;
      setSequenceNumber(count + 1);
    }
  }, [currentClient?.purchases.length, currentDat?.formatted, viewIndex]);

  const [autoLoadMsg, setAutoLoadMsg] = useState('');

  const periodPurchases = (() => {
    if (!currentClient) return [];
    const all = currentClient.purchases || [];
    if (currentDat) {
      return all.filter(p => p.datMonthYear === currentDat.formatted);
    } else {
      if (!date) return [];
      const [y, m] = date.split('-');
      const expected = `${MONTHS[parseInt(m) - 1]} ${y}`;
      return all.filter(p => p.datMonthYear === expected);
    }
  })();

  const loadPurchase = (index: number) => {
    if (index < 0 || index >= periodPurchases.length) return;
    const p = periodPurchases[index];
    if (p) {
      const [m, d, y] = p.date.split('/');
      setDate(`${y}-${m}-${d}`);
      setPaymentMethod(p.paymentMethod);
      setBankName(p.bankName || '');
      setCheckNumber(p.checkNumber || '');
      setInvoiceNo(p.invoiceNo);
      setSupplierTin(p.supplierTin);
      setSupplierName(p.supplierName);
      setSupplierAddress(p.supplierAddress || '');
      
      const gross = p.vatType === 'vat' ? (p.amount + (p.inputTax || 0)) : p.amount;
      setAmount(gross.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
      setVatType(p.vatType);
      setExpenseType(p.expenseType);
      setAccountTitle(p.accountTitle);
      
      const acct = currentClient?.accounts?.find(a => a.name === p.accountTitle);
      if (acct?.type) {
        setSelectedAccountType(acct.type);
      }

      setTransactionDetails(p.transactionDetails || '');
      setSequenceNumber(p.sequenceNumber || (index + 1));
      setViewIndex(index);
    }
  };

  const handleAddNew = () => {
    setViewIndex(null);
    setInvoiceNo('');
    setSupplierTin('');
    setSupplierName('');
    setSupplierAddress('');
    setAmount('');
    setBankName('');
    setCheckNumber('');
    setTransactionDetails('');
    const count = periodPurchases.length;
    setSequenceNumber(count + 1);
  };

  // Re-compute input tax and net amount on amount or vat type change
  useEffect(() => {
    const num = parseFloat(String(amount).replace(/,/g, '')) || 0;
    if (vatType === 'vat') {
      const net = num / 1.12;
      setNetAmount(net);
      setInputTax(net * 0.12);
    } else {
      setNetAmount(num);
      setInputTax(0);
    }
  }, [amount, vatType]);

  // Auto-fill from supplier library
  useEffect(() => {
    if (supplierTin.length === 11 && currentClient) {
      const found = currentClient.tinLibrary.suppliers.find(s => s.tin === supplierTin);
      if (found) {
        setSupplierName(found.name);
        if (found.address) setSupplierAddress(found.address);
        setAutoLoadMsg(`Loaded: ${found.name}`);
        const t = setTimeout(() => setAutoLoadMsg(''), 2000);
        return () => clearTimeout(t);
      }
    }
  }, [supplierTin, currentClient]);

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
      setDateWarning(`⚠️ Transaction year (${y}) is earlier than DAT year (${currentDat.year}). Please select a date within ${currentDat.formatted}.`);
    } else if (m > currentDat.month) {
      setDateWarning(`⚠️ Transaction month cannot be later than DAT month`);
    } else if (m < currentDat.month) {
      setDateWarning(`⚠️ Transaction month is earlier than DAT month. Please select a date within ${currentDat.formatted}.`);
    } else {
      setDateWarning(null);
    }
  }, [date, currentDat]);

  const handleAddPurchase = () => {
    if (!currentClient || !currentClientId) return;
    
    const parsedAmount = parseFloat(String(amount).replace(/,/g, ''));
    if (!date || !invoiceNo || !supplierTin || !supplierName || !amount || isNaN(parsedAmount)) {
      alert('Please fill out all required fields with valid values.');
      return;
    }
    if (dateWarning) {
      alert('Please fix date warning before saving.');
      return;
    }

    const [y, m, d] = date.split('-');
    const formattedDate = `${m}/${d}/${y}`;

    const purchaseData = {
      id: viewIndex !== null ? periodPurchases[viewIndex].id : Date.now(),
      sequenceNumber: viewIndex !== null ? (periodPurchases[viewIndex].sequenceNumber || sequenceNumber) : sequenceNumber,
      datMonthYear: currentDat ? currentDat.formatted : `${MONTHS[parseInt(m) - 1]} ${y}`,
      date: formattedDate,
      paymentMethod,
      bankName: paymentMethod === 'Check' ? bankName : null,
      checkNumber: paymentMethod === 'Check' ? checkNumber : null,
      invoiceNo,
      supplierTin,
      supplierName,
      supplierAddress,
      amount: netAmount,
      vatType,
      expenseType,
      accountTitle,
      transactionDetails,
      inputTax
    };

    // Auto-add to TIN Library if new
    let updatedTinLibrary = currentClient.tinLibrary;
    const exists = currentClient.tinLibrary.suppliers.some(s => s.tin === supplierTin);
    if (!exists) {
      updatedTinLibrary = {
        ...currentClient.tinLibrary,
        suppliers: [
          ...currentClient.tinLibrary.suppliers,
          {
            tin: supplierTin,
            name: supplierName,
            address: supplierAddress
          }
        ]
      };
    }

    let updatedPurchases;
    if (viewIndex !== null) {
      updatedPurchases = currentClient.purchases.map(p => p.id === purchaseData.id ? purchaseData : p);
    } else {
      updatedPurchases = [...currentClient.purchases, purchaseData];
    }

    const updatedClient = {
      ...currentClient,
      purchases: updatedPurchases,
      tinLibrary: updatedTinLibrary
    };
    saveClient(currentClientId, updatedClient);
    showToast(viewIndex !== null ? 'Entry updated' : (exists ? 'Expense entry added' : 'Expense added & Supplier saved to Library'));

    // Reset most form fields, keeping dates
    setInvoiceNo('');
    setSupplierTin('');
    setSupplierName('');
    setSupplierAddress('');
    setAmount('');
    setBankName('');
    setCheckNumber('');
    setTransactionDetails('');
  };

  const handleDelete = (id: number) => {
    if (!currentClient || !currentClientId) return;
    const updatedClient = {
      ...currentClient,
      purchases: currentClient.purchases.filter(p => p.id !== id)
    };
    saveClient(currentClientId, updatedClient);
    showToast('Expense deleted');
  };

  return (
    <div className="w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8 flex flex-col overflow-hidden">
      <PageHeader title={currentDat ? "Expense Data Entry Screen (DAT)" : "Expense Data Entry Screen"} icon={<ShoppingCart className="w-5 h-5 text-amber-500" />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl mb-6 gap-4 border border-slate-200 dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-2 font-bold text-slate-700 dark:text-slate-300">
          <FolderClock className="w-5 h-5 text-cyan-500" />
          <span>Period:</span>
          <select
            value={currentDat?.month || new Date().getMonth() + 1}
            onChange={e => {
              const month = parseInt(e.target.value);
              const year = currentDat?.year || new Date().getFullYear();
              setCurrentDat({ month, year, formatted: `${getMonthName(month)} ${year}` });
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>{m}</option>
            ))}
          </select>
          <select
            value={currentDat?.year || new Date().getFullYear()}
            onChange={e => {
              const year = parseInt(e.target.value);
              const month = currentDat?.month || new Date().getMonth() + 1;
              setCurrentDat({ month, year, formatted: `${getMonthName(month)} ${year}` });
            }}
            className="px-3 py-1.5 rounded-lg text-sm font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 outline-none"
          >
            {Array.from({ length: 11 }, (_, i) => new Date().getFullYear() - 10 + i).map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          {currentDat ? (
            <div className="flex items-center gap-2 ml-2 pl-4 border-l border-slate-300 dark:border-slate-600">
              <span className="text-sm font-bold text-slate-700 dark:text-slate-300 whitespace-nowrap">Seq #:</span>
              <input
                type="text"
                readOnly
                value={sequenceNumber}
                className="w-14 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg text-center font-bold text-amber-600 py-1.5 focus:outline-none shadow-inner"
              />
              <button
                onClick={() => setCurrentDat(null)}
                className="text-xs text-slate-400 hover:text-rose-500 font-semibold underline"
              >
                Clear
              </button>
            </div>
          ) : (
            <span className="text-[10px] text-slate-400 font-semibold">Optional — entries will use their own transaction date if left unset</span>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6 bg-slate-50 dark:bg-slate-800/50 p-5 rounded-2xl border border-slate-100 dark:border-slate-700 relative">
        <div className="lg:col-span-3 pb-2 mb-2 border-b border-slate-200 dark:border-slate-700 flex flex-col md:flex-row gap-4 justify-between">
            <div className="w-full md:w-1/3">
              <label className="form-label text-red-500">Transaction Date *</label>
              <input 
                type="date" 
                value={date} 
                onChange={e => setDate(e.target.value)} 
                min={currentDat ? `${currentDat.year}-${String(currentDat.month).padStart(2, '0')}-01` : undefined}
                max={currentDat ? `${currentDat.year}-${String(currentDat.month).padStart(2, '0')}-${String(new Date(currentDat.year, currentDat.month, 0).getDate()).padStart(2, '0')}` : undefined}
                className="form-input" 
              />
              {dateWarning && <p className="text-xs text-amber-600 bg-amber-100 p-2 mt-1 rounded-lg">{dateWarning}</p>}
            </div>
            
            <div className="w-full md:w-2/3 flex flex-col justify-end">
               <label className="form-label">Payment Method</label>
               <div className="flex items-center gap-6 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-xl px-4 py-2.5">
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                    <input type="radio" value="Cash" checked={paymentMethod === 'Cash'} onChange={() => setPaymentMethod('Cash')} className="w-4 h-4 text-amber-500" />
                    💵 Cash
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-sm">
                    <input type="radio" value="Check" checked={paymentMethod === 'Check'} onChange={() => setPaymentMethod('Check')} className="w-4 h-4 text-amber-500" />
                    📝 Check
                  </label>
               </div>
            </div>
        </div>

        {paymentMethod === 'Check' && (
          <>
            <div className="lg:col-span-1">
              <label className="form-label text-red-500">Bank Name *</label>
              <select value={bankName} onChange={e => setBankName(e.target.value)} className="form-input bg-amber-50 dark:bg-amber-900/10 border-amber-200">
                <option value="">Select Bank...</option>
                <option value="BDO">BDO</option>
                <option value="BPI">BPI</option>
                <option value="Metrobank">Metrobank</option>
                <option value="Security Bank">Security Bank</option>
                <option value="RCBC">RCBC</option>
                <option value="UnionBank">UnionBank</option>
                <option value="PNB">PNB</option>
                <option value="Chinabank">Chinabank</option>
                <option value="EastWest">EastWest</option>
                <option value="AUB">AUB</option>
                <option value="Others">Others</option>
              </select>
            </div>
            <div className="lg:col-span-2">
               <label className="form-label text-red-500">Check Number *</label>
               <input type="text" value={checkNumber} onChange={e => setCheckNumber(e.target.value)} placeholder="000123" className="form-input bg-amber-50 dark:bg-amber-900/10 border-amber-200" />
            </div>
          </>
        )}

        <div>
           <label className="form-label text-red-500">Invoice # *</label>
           <input type="text" value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="Supplier Invoice" className="form-input" />
        </div>
        
        <div className="relative">
          <label className="form-label text-red-500">Supplier TIN *</label>
          <input 
            type="text" 
            value={supplierTin} 
            onChange={e => setSupplierTin(formatTIN(e.target.value))} 
            placeholder="000-000-000" 
            className="form-input font-mono" 
            maxLength={11}
          />
           {autoLoadMsg && (
            <span className="absolute top-8 right-3 text-xs bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300 px-2 py-1 rounded">
              {autoLoadMsg}
            </span>
          )}
        </div>

        <div>
          <label className="form-label text-red-500">Supplier Name *</label>
          <input type="text" value={supplierName} onChange={e => setSupplierName(e.target.value)} placeholder="Supplier Full Name" className="form-input" />
        </div>

        <div className="lg:col-span-2">
          <label className="form-label">Supplier Address</label>
          <input type="text" value={supplierAddress} onChange={e => setSupplierAddress(e.target.value)} placeholder="Street, City, Province" className="form-input" />
        </div>

        <div>
           <label className="form-label text-red-500">VAT Type *</label>
           <select value={vatType} onChange={e => setVatType(e.target.value)} className="form-input bg-slate-100 dark:bg-slate-900 border-slate-300">
             <option value="vat">VAT 12% (+ Input Tax)</option>
             <option value="non-vat">Non-VAT (0 Tax)</option>
             <option value="zero-rated">0-Rated (0 Tax)</option>
           </select>
        </div>

        <div>
          <label className="form-label text-red-500">Gross Amount (₱) *</label>
          <input 
            type="text" 
            value={amount} 
            onChange={e => {
              const val = e.target.value;
              if (/^[0-9.,]*$/.test(val)) {
                setAmount(val);
              }
            }} 
            onBlur={e => {
              const raw = e.target.value.replace(/,/g, '');
              if (raw && !isNaN(parseFloat(raw))) {
                setAmount(parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
              }
            }}
            placeholder="0.00" 
            className="form-input font-bold text-amber-900 border-amber-300 dark:bg-amber-900/20 dark:text-amber-100" 
          />
        </div>

        <div>
          <label className="form-label text-slate-500">Net Amount (₱)</label>
          <input type="text" readOnly value={netAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="form-input bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold cursor-not-allowed" />
        </div>

        {currentDat && (
          <div className="lg:col-span-1">
            <label className="form-label">Expense Class</label>
            <select value={expenseType} onChange={e => setExpenseType(e.target.value)} className="form-input">
              <option value="Capital Goods">🏭 Capital Goods</option>
              <option value="Services">📋 Services</option>
              <option value="Others">📦 Others</option>
            </select>
          </div>
        )}

        {!currentDat && (
          <div className="lg:col-span-1">
            <label className="form-label text-blue-500">Account Type</label>
            <select 
              value={selectedAccountType} 
              onChange={e => setSelectedAccountType(e.target.value)} 
              className="form-input"
            >
              <option value="Assets">Assets</option>
              <option value="Liabilities">Liabilities</option>
              <option value="Equity">Equity</option>
              <option value="Income">Income</option>
              <option value="Costs">Costs</option>
              <option value="Expenses">Expenses</option>
            </select>
          </div>
        )}

        <div className={currentDat ? "lg:col-span-2" : "lg:col-span-3 md:col-span-2"}>
          <label className="form-label">{currentDat ? "Account Title" : "Header Account"}</label>
          <select value={accountTitle} onChange={e => setAccountTitle(e.target.value)} className="form-input bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50 font-bold text-blue-800 dark:text-blue-300">
            {coaAccounts.map(account => (
              <option key={account.id} value={account.name}>{account.name}</option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-3">
          <label className="form-label">Transaction Details</label>
          <input 
            type="text" 
            value={transactionDetails} 
            onChange={e => setTransactionDetails(e.target.value)} 
            placeholder="Enter additional details about this transaction..." 
            className="form-input" 
          />
        </div>

        <div className="lg:col-span-3 flex justify-between items-center mt-2 border-t border-slate-200 dark:border-slate-700 pt-4">
           <div className="flex gap-4 items-center">
             <span className="text-sm font-semibold text-slate-500">Computed Input Tax:</span>
             <span className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400">
                ₱ {inputTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
             </span>
           </div>
           
           <div className="flex gap-3">
             {viewIndex !== null && (
               <button 
                 onClick={() => {
                   if (confirm('Are you sure you want to delete this entry?')) {
                     handleDelete(periodPurchases[viewIndex].id);
                     handleAddNew();
                   }
                 }}
                 className="bg-red-100 hover:bg-red-200 text-red-700 font-bold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2 border border-red-200"
               >
                 <Trash2 className="w-5 h-5" /> Delete
               </button>
             )}
             <button onClick={handleAddPurchase} className="bg-amber-500 hover:bg-amber-600 text-slate-900 font-bold px-8 py-2.5 rounded-xl transition-colors shadow-sm shadow-amber-500/20 flex items-center gap-2">
               <Plus className="w-5 h-5" /> {viewIndex !== null ? 'Update Entry' : 'Add Entry'}
             </button>
             <button 
               onClick={() => navigateToPage(null)} 
               className="bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold px-6 py-2.5 rounded-xl transition-colors flex items-center gap-2"
             >
               <ArrowLeft className="w-5 h-5" /> Cancel
             </button>
           </div>
        </div>

        <div className="lg:col-span-3 flex flex-wrap justify-center gap-2 mt-4 pt-4 border-t border-slate-200 dark:border-slate-700">
          <button 
            onClick={() => loadPurchase(0)} 
            disabled={periodPurchases.length === 0}
            className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronsLeft className="w-4 h-4" /> Top
          </button>
          <button 
            onClick={() => loadPurchase((viewIndex === null ? periodPurchases.length : viewIndex) - 1)} 
            disabled={periodPurchases.length === 0 || viewIndex === 0}
            className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft className="w-4 h-4" /> Previous
          </button>
          <button 
            onClick={() => loadPurchase(viewIndex === null ? 0 : viewIndex + 1)} 
            disabled={periodPurchases.length === 0 || (viewIndex !== null && viewIndex >= periodPurchases.length - 1)}
            className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Next <ChevronRight className="w-4 h-4" />
          </button>
          <button 
            onClick={() => loadPurchase(periodPurchases.length - 1)} 
            disabled={periodPurchases.length === 0 || viewIndex === periodPurchases.length - 1}
            className="flex items-center gap-1 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            Last <ChevronsRight className="w-4 h-4" />
          </button>
          <button 
            onClick={handleAddNew} 
            className={cn(
              "flex items-center gap-1 px-4 py-2 rounded-lg text-sm font-bold transition-all ml-2",
              viewIndex === null 
                ? "bg-amber-100 text-amber-700 border border-amber-200" 
                : "bg-blue-100 text-blue-700 border border-blue-200 hover:bg-blue-200"
            )}
          >
            <PlusCircle className="w-4 h-4" /> New Entry
          </button>
        </div>
      </div>

      </div>
    </div>
  );
}
