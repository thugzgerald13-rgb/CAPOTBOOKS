import { useState, useEffect, useMemo } from 'react';
import { PageHeader } from './ui/PageHeader';
import { Combobox } from './ui/Combobox';
import { useAccounting } from '../context/AccountingContext';
import { formatTIN, generateCSV, MONTHS, getMonthName } from '../lib/utils';
import { ShoppingCart, Plus, Trash2, X } from 'lucide-react';
import { DEFAULT_ACCOUNTS, getNormalSide, resequenceAccounts } from './ChartOfAccounts';
import { ATC_SCHEDULE } from '../lib/atcSchedule';

export function Purchases() {
  const { currentClient, currentClientId, currentDat, saveClient, showToast, setCurrentDat } = useAccounting();
  
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
  const [withholdingOption, setWithholdingOption] = useState<'w/o' | 'with'>('w/o');
  const [atcCode, setAtcCode] = useState('');
  const [whtAmount, setWhtAmount] = useState(0);
  const [expenseType, setExpenseType] = useState('Capital Goods');
  const [accountTitle, setAccountTitle] = useState('');
  const [transactionDetails, setTransactionDetails] = useState('');
  const [inputTax, setInputTax] = useState(0);
  const [attachment, setAttachment] = useState<{ name: string; type: string; size: number; content: string } | null>(null);

  // Derive available accounts from Chart of Accounts
  const coaAccounts = useMemo(() => {
    let accs = (currentClient?.accounts || []).filter(a => !a.hidden);
    if (accs.length === 0) accs = DEFAULT_ACCOUNTS;
    if (currentDat) {
      return accs.filter(a => expenseType === 'Capital Goods' ? (a.type.toLowerCase() === 'asset' || a.type.toLowerCase() === 'assets') : (a.type.toLowerCase() === 'expense' || a.type.toLowerCase() === 'expenses'));
    } else {
      // Payment for: always limited to Assets, Costs, and Expenses accounts
      return accs.filter(a => {
        const at = a.type.toLowerCase();
        return at === 'asset' || at === 'assets' || at === 'costs' || at === 'cost' || at === 'expense' || at === 'expenses';
      });
    }
  }, [currentClient?.accounts, currentDat, expenseType]);

  // Clear the "Payment for" / "Account Title" selection whenever it no
  // longer matches an account in the current category (e.g. switching
  // Expense Class). This intentionally never auto-picks the first account -
  // the field starts empty and shows the "Type or choose an account..."
  // placeholder until the user actively types or selects one.
  useEffect(() => {
    setAccountTitle(prev => (coaAccounts.find(a => a.name === prev) ? prev : ''));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenseType, currentDat, coaAccounts]);

  // Let users customize the "Payment for" account list right from this tab —
  // adding a new Chart of Accounts entry or removing the currently selected
  // one — without having to navigate to the Chart of Accounts page.
  const [showAddPaymentAccount, setShowAddPaymentAccount] = useState(false);
  const [newPaymentAccountName, setNewPaymentAccountName] = useState('');
  const [newPaymentAccountType, setNewPaymentAccountType] = useState<'Asset' | 'Costs' | 'Expense'>('Expense');

  const generatePaymentAccountId = (type: string, format: 'numeric' | 'alphanumeric'): string => {
    const baseByType: Record<string, number> = { Asset: 1000, Costs: 5000, Expense: 5100 };
    const base = baseByType[type] ?? 9000;
    const existingIds = new Set((currentClient?.accounts && currentClient.accounts.length > 0 ? currentClient.accounts : DEFAULT_ACCOUNTS).map(a => a.id));
    let n = base;
    while (existingIds.has(String(n))) n += 10;
    if (format === 'alphanumeric') {
      const letters = newPaymentAccountName.replace(/[^a-zA-Z]/g, '').toUpperCase().padEnd(3, 'X').slice(0, 3) || 'GEN';
      let candidate = `${letters}-${n}`;
      while (existingIds.has(candidate)) {
        n += 10;
        candidate = `${letters}-${n}`;
      }
      return candidate;
    }
    return String(n);
  };

  const handleAddPaymentAccount = () => {
    if (!currentClient || !currentClientId) return;
    const name = newPaymentAccountName.trim();
    if (!name) {
      alert('Please enter an account name.');
      return;
    }
    const baseAccounts = currentClient.accounts && currentClient.accounts.length > 0 ? currentClient.accounts : DEFAULT_ACCOUNTS;
    if (baseAccounts.some(a => a.name.toLowerCase() === name.toLowerCase())) {
      alert('An account with this name already exists.');
      return;
    }
    const format = currentClient.coaFormat || 'numeric';
    const id = generatePaymentAccountId(newPaymentAccountType, format);
    const newAccount = {
      id,
      name,
      type: newPaymentAccountType,
      normalSide: getNormalSide(newPaymentAccountType),
    };
    const updatedAccounts = resequenceAccounts([...baseAccounts, newAccount], format);
    saveClient(currentClientId, { ...currentClient, accounts: updatedAccounts, coaFormat: format });
    setAccountTitle(name);
    setShowAddPaymentAccount(false);
    setNewPaymentAccountName('');
    setNewPaymentAccountType('Expense');
    showToast(`Account "${name}" added.`);
  };

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
      setWithholdingOption(p.withholdingOption || 'w/o');
      setAtcCode(p.atcCode || '');
      setExpenseType(p.expenseType);
      setAccountTitle(p.accountTitle);
      
      const acct = currentClient?.accounts?.find(a => a.name === p.accountTitle);
      if (acct?.type) {
        setSelectedAccountType(acct.type);
      }

      setTransactionDetails(p.transactionDetails || '');
      setAttachment(p.attachment || null);
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
    setAttachment(null);
    setAccountTitle('');
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

  // Default to the first ATC in the schedule whenever "With Withholdings" is
  // selected and no ATC has been chosen yet.
  useEffect(() => {
    if (withholdingOption === 'with' && !atcCode && ATC_SCHEDULE.length > 0) {
      setAtcCode(ATC_SCHEDULE[0].code);
    }
    if (withholdingOption === 'w/o' && atcCode) {
      setAtcCode('');
    }
  }, [withholdingOption, atcCode]);

  // Re-compute withholding tax amount (per the BIR Schedule of Alphanumeric
  // Tax Codes) whenever the net amount, withholding option, or selected ATC
  // changes.
  useEffect(() => {
    if (withholdingOption === 'with' && atcCode) {
      const entry = ATC_SCHEDULE.find(e => e.code === atcCode);
      setWhtAmount(entry ? netAmount * entry.rate : 0);
    } else {
      setWhtAmount(0);
    }
  }, [withholdingOption, atcCode, netAmount]);

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

  const handleAttachmentChange = (file: File | undefined) => {
    if (!file) {
      setAttachment(null);
      return;
    }
    if (!(file.type.startsWith('image/') || file.type === 'application/pdf')) {
      alert('Please upload an image or PDF file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setAttachment({
          name: file.name,
          type: file.type,
          size: file.size,
          content: reader.result
        });
      }
    };
    reader.readAsDataURL(file);
  };

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
      withholdingOption,
      atcCode: withholdingOption === 'with' ? atcCode : null,
      whtRate: withholdingOption === 'with' ? (ATC_SCHEDULE.find(e => e.code === atcCode)?.rate ?? null) : null,
      whtAmount: withholdingOption === 'with' ? whtAmount : 0,
      expenseType,
      accountTitle,
      transactionDetails,
      inputTax,
      attachment
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
    setAttachment(null);
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
    <div className="w-full flex flex-col">
      <PageHeader title={currentDat ? "Expense Data Entry Screen (DAT)" : "Expense Data Entry Screen"} icon={<ShoppingCart className="w-5 h-5 text-amber-500" />} />
      <div className="p-4 md:p-6 flex-1">

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
           <label className="form-label text-red-500">Withholding Tax *</label>
           <select value={withholdingOption} onChange={e => setWithholdingOption(e.target.value as 'w/o' | 'with')} className="form-input bg-slate-100 dark:bg-slate-900 border-slate-300">
             <option value="w/o">W/O Withholdings</option>
             <option value="with">With Withholdings</option>
           </select>
        </div>

        {withholdingOption === 'with' && (
          <div className="lg:col-span-2">
            <label className="form-label text-red-500">ATC / Nature of Income Payment *</label>
            <select value={atcCode} onChange={e => setAtcCode(e.target.value)} className="form-input bg-slate-100 dark:bg-slate-900 border-slate-300">
              {ATC_SCHEDULE.map(entry => (
                <option key={entry.code} value={entry.code}>
                  {entry.code} — {entry.nature}{entry.qualifier ? ` (${entry.qualifier})` : ''} — {entry.rateLabel} [{entry.party}]
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Rates per the BIR Schedule of Alphanumeric Tax Codes (ATC).</p>
          </div>
        )}

        {withholdingOption === 'with' && (
          <div>
            <label className="form-label text-slate-500">Withholding Tax (₱)</label>
            <input type="text" readOnly value={whtAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="form-input bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold cursor-not-allowed" />
          </div>
        )}

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

        <div>
          <label className="form-label text-slate-500">Input VAT (₱)</label>
          <input type="text" readOnly value={inputTax.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} className="form-input bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 font-bold cursor-not-allowed" />
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

        <div className={currentDat ? "lg:col-span-2" : "lg:col-span-2 md:col-span-1"}>
          <div className="flex items-center justify-between">
            <label className="form-label">{currentDat ? "Account Title" : "Payment for"}</label>
            {!currentDat && (
              <div className="flex items-center gap-1 mb-1.5">
                <button
                  type="button"
                  onClick={() => setShowAddPaymentAccount(v => !v)}
                  className="p-1 rounded hover:bg-emerald-100 dark:hover:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 transition-colors"
                  title="Add a new account"
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
          <Combobox
            value={accountTitle}
            onChange={setAccountTitle}
            options={coaAccounts.map(a => ({ id: a.id, label: a.name }))}
            placeholder="Type or choose an account..."
            inputClassName="form-input bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50 font-bold text-blue-800 dark:text-blue-300"
          />

          {showAddPaymentAccount && (
            <div className="mt-2 p-3 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-900/50 rounded-xl flex flex-col sm:flex-row gap-2 items-stretch sm:items-end">
              <div className="flex-1">
                <label className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">New Account Name</label>
                <input
                  type="text"
                  value={newPaymentAccountName}
                  onChange={e => setNewPaymentAccountName(e.target.value)}
                  placeholder="e.g. Office Supplies Expense"
                  className="form-input"
                />
              </div>
              <div className="sm:w-40">
                <label className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wide">Type</label>
                <select value={newPaymentAccountType} onChange={e => setNewPaymentAccountType(e.target.value as 'Asset' | 'Costs' | 'Expense')} className="form-input">
                  <option value="Asset">Asset</option>
                  <option value="Costs">Costs</option>
                  <option value="Expense">Expense</option>
                </select>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={handleAddPaymentAccount}
                  className="bg-emerald-500 hover:bg-emerald-600 text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm"
                >
                  Add
                </button>
                <button
                  type="button"
                  onClick={() => { setShowAddPaymentAccount(false); setNewPaymentAccountName(''); }}
                  className="bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 font-bold px-3 py-2.5 rounded-xl transition-colors"
                  title="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="lg:col-span-1">
          <label className="form-label">Attachment</label>
          <div className="flex items-center gap-2">
            <label className="form-input cursor-pointer flex items-center justify-between gap-2 text-sm font-medium">
              <span className="truncate">{attachment ? attachment.name : "Upload image or PDF"}</span>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={e => handleAttachmentChange(e.target.files?.[0])}
                className="hidden"
              />
            </label>
            {attachment && (
              <button
                type="button"
                onClick={() => setAttachment(null)}
                className="p-2 rounded-lg text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700"
                title="Remove attachment"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
          {attachment && (
            <p className="text-[11px] text-slate-400 mt-1">
              {(attachment.size / 1024 / 1024).toFixed(2)} MB
            </p>
          )}
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

        <div className="lg:col-span-3 flex justify-end items-center mt-2 border-t border-slate-200 dark:border-slate-700 pt-4">
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
           </div>
        </div>
      </div>

      </div>
    </div>
  );
}
