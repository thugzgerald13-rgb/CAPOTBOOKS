import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { Search, Trash2, Receipt, ShoppingCart, FolderClock, History as HistoryIcon, FileDown, FileSpreadsheet, Download, Pencil, Columns3, ChevronDown } from 'lucide-react';
import { cn, MONTHS, generateCSV, formatTIN, downloadAttachment } from '../lib/utils';
import * as XLSX from 'xlsx';

type HistoryTab = 'expenses' | 'income' | 'slp' | 'sls';

export function History() {
  const { currentClient, currentClientId, currentDat, saveClient, showToast, navigateToPage, setCurrentDat, historyTab, setHistoryTab, activeDevice } = useAccounting();
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDat?.month || new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(currentDat?.year || new Date().getFullYear());
  const expenseColumnDefinitions = useMemo(() => [
    { key: 'date', label: 'Transaction Date' },
    { key: 'paymentMethod', label: 'Payment Method' },
    { key: 'bankName', label: 'Bank Name' },
    { key: 'checkNumber', label: 'Check Number' },
    { key: 'invoiceNo', label: 'Invoice #' },
    { key: 'supplierTin', label: 'Supplier TIN' },
    { key: 'supplierName', label: 'Supplier Name' },
    { key: 'supplierAddress', label: 'Supplier Address' },
    { key: 'vatType', label: 'VAT Type' },
    { key: 'exemptAmount', label: 'Exempt' },
    { key: 'zeroRatedAmount', label: '0-Rated' },
    { key: 'amount', label: 'Gross / Recorded Amount' },
    { key: 'netAmount', label: 'Net of VAT' },
    { key: 'inputTax', label: 'Input Tax' },
    { key: 'withholdingOption', label: 'Withholding Tax' },
    { key: 'atcCode', label: 'ATC Code' },
    { key: 'whtRate', label: 'WHT Rate' },
    { key: 'whtAmount', label: 'WHT Amount' },
    { key: 'expenseType', label: 'Expense Class' },
    { key: 'accountTitle', label: 'Account Title' },
    { key: 'transactionDetails', label: 'Transaction Details' },
    { key: 'attachment', label: 'Attachment' },
  ], []);

  const defaultExpenseColumns = ['date', 'invoiceNo', 'supplierName', 'supplierTin', 'paymentMethod', 'vatType', 'amount', 'netAmount', 'inputTax'];
  const [showExpenseColumns, setShowExpenseColumns] = useState(false);
  const [visibleExpenseColumns, setVisibleExpenseColumns] = useState<string[]>(defaultExpenseColumns);

  useEffect(() => {
    if (!currentClientId) return;
    try {
      const saved = localStorage.getItem(`capot-expense-history-columns-${currentClientId}`);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length) setVisibleExpenseColumns(parsed);
      }
    } catch {}
  }, [currentClientId]);

  useEffect(() => {
    if (!currentClientId) return;
    try {
      localStorage.setItem(`capot-expense-history-columns-${currentClientId}`, JSON.stringify(visibleExpenseColumns));
    } catch {}
  }, [currentClientId, visibleExpenseColumns]);

  const toggleExpenseColumn = (key: string) => {
    setVisibleExpenseColumns(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  };

  const formatExpenseColumnValue = (p: any, key: string) => {
    const money = (value: any) => `₱${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;
    switch (key) {
      case 'date': return p.date || '—';
      case 'paymentMethod': return p.paymentMethod || '—';
      case 'bankName': return p.bankName || '—';
      case 'checkNumber': return p.checkNumber || '—';
      case 'invoiceNo': return p.invoiceNo || p.referenceNo || '—';
      case 'supplierTin': return p.supplierTin || '—';
      case 'supplierName': return p.supplierName || '—';
      case 'supplierAddress': return p.supplierAddress || '—';
      case 'vatType': return p.vatType || '—';
      // Expense History must use the values entered in the Purchases VAT fields.
      // Fall back to the recorded amount only for legacy records that did not
      // have the dedicated exempt/0-rated fields saved.
      case 'exemptAmount': {
        const exempt = Number(p.exemptAmount);
        if (Number.isFinite(exempt) && exempt !== 0) return money(exempt);
        return money(
          (p.vatType === 'non-vat' || p.vatType === 'vat-nonvat')
            ? p.amount
            : 0
        );
      }
      case 'zeroRatedAmount': {
        const zeroRated = Number(p.zeroRatedAmount);
        if (Number.isFinite(zeroRated) && zeroRated !== 0) return money(zeroRated);
        return money(p.vatType === 'zero-rated' ? p.amount : 0);
      }
      case 'amount': return money(Number(p.amount || 0) + Number(p.inputTax || 0) + Number(p.exemptAmount || 0) + Number(p.zeroRatedAmount || 0));
      case 'netAmount': return money(p.netAmount ?? p.amount);
      case 'inputTax': return money(p.inputTax);
      case 'withholdingOption': return p.withholdingOption || '—';
      case 'atcCode': return p.atcCode || '—';
      case 'whtRate': return p.whtRate == null ? '—' : `${(Number(p.whtRate) * 100).toFixed(2)}%`;
      case 'whtAmount': return money(p.whtAmount);
      case 'expenseType': return p.expenseType || '—';
      case 'accountTitle': return p.accountTitle || '—';
      case 'transactionDetails': return p.transactionDetails || '—';
      case 'attachment': return p.attachment ? 'Attached' : '—';
      default: return p[key] == null || p[key] === '' ? '—' : String(p[key]);
    }
  };


  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 2022 }, (_, i) => 2023 + i);

  // Expense History is also allowed to contribute suppliers to the registry.
  // Merge by normalized TIN and preserve every unique supplier.
  useEffect(() => {
    if (!currentClient || !currentClientId) return;

    const purchases = currentClient.purchases || [];
    const existingSuppliers = currentClient.tinLibrary?.suppliers || [];
    const merged = [...existingSuppliers];
    const indexByTin = new Map<string, number>();

    merged.forEach((supplier: any, index: number) => {
      const tin = String(supplier.tin || '').replace(/\D/g, '');
      if (tin) indexByTin.set(tin, index);
    });

    let changed = false;
    for (const purchase of purchases as any[]) {
      if (!purchase.supplierTin || !purchase.supplierName) continue;
      const tin = String(purchase.supplierTin).replace(/\D/g, '');
      if (!tin) continue;

      const existingIndex = indexByTin.get(tin);
      if (existingIndex !== undefined) {
        const existing = merged[existingIndex];
        if (!existing.name && purchase.supplierName) {
          merged[existingIndex] = { ...existing, name: purchase.supplierName };
          changed = true;
        }
        if (!existing.address && purchase.supplierAddress) {
          merged[existingIndex] = { ...merged[existingIndex], address: purchase.supplierAddress };
          changed = true;
        }
      } else {
        let hash = 0;
        for (let i = 0; i < tin.length; i++) {
          hash = ((hash << 5) - hash + tin.charCodeAt(i)) | 0;
        }
        const id = `supplier-${Math.abs(hash) || Date.now()}`;
        indexByTin.set(tin, merged.length);
        merged.push({
          id,
          tin: purchase.supplierTin,
          name: purchase.supplierName,
          address: purchase.supplierAddress || ''
        });
        changed = true;
      }
    }

    if (!changed) return;

    saveClient(currentClientId, {
      ...currentClient,
      tinLibrary: {
        ...(currentClient.tinLibrary || { customers: [], suppliers: [] }),
        suppliers: merged
      }
    });
  }, [currentClient, currentClientId, saveClient]);

  useEffect(() => {
    if (currentDat) {
      setSelectedMonth(currentDat.month);
      setSelectedYear(currentDat.year);
    }
  }, [currentDat]);

  const handleLoadPeriod = () => {
    const formatted = `${MONTHS[selectedMonth - 1]} ${selectedYear}`;
    setCurrentDat({
      month: selectedMonth,
      year: selectedYear,
      formatted
    });
    showToast(`Loaded data for ${formatted}`);
  };

  const activeTab = historyTab as HistoryTab;
  const setActiveTab = (tab: HistoryTab) => setHistoryTab(tab);

  if (!currentClient) return null;

  const TabConfig = {
    expenses: { label: 'Expense History', icon: ShoppingCart, color: 'text-amber-600', bg: 'bg-amber-50' },
    income: { label: 'Income History', icon: Receipt, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    slp: { label: 'Summary List of Purchases (SLP)', icon: FolderClock, color: 'text-cyan-600', bg: 'bg-cyan-50' },
    sls: { label: 'Summary List of Sales (SLS)', icon: FolderClock, color: 'text-indigo-600', bg: 'bg-indigo-50' }
  };

  const activeConfig = TabConfig[activeTab] || TabConfig.expenses;

  const handleDeleteExpense = (id: number) => {
    if (!currentClientId) return;
    const updatedClient = {
      ...currentClient,
      purchases: currentClient.purchases.filter(p => p.id !== id)
    };
    saveClient(currentClientId, updatedClient);
    showToast('Expense deleted');
  };

  const handleEditExpense = (purchase: typeof purchases[number]) => {
    const path = purchase.invoiceNo && purchase.supplierTin ? '/purchases/invoiced' : '/purchases/other-payments';
    navigate(path, { state: { editPurchaseId: purchase.id } });
  };

  const handleDeleteIncome = (id: number) => {
    if (!currentClientId) return;
    const updatedClient = {
      ...currentClient,
      sales: currentClient.sales.filter(s => s.id !== id)
    };
    saveClient(currentClientId, updatedClient);
    showToast('Income deleted');
  };

  const targetFormatted = currentDat ? currentDat.formatted : `${MONTHS[selectedMonth - 1]} ${selectedYear}`;
  const purchases = (currentClient.purchases || []).filter(p => p.datMonthYear === targetFormatted);
  const sales = (currentClient.sales || []).filter(s => s.datMonthYear === targetFormatted);

  const filteredPurchases = purchases.filter(p => 
    p.supplierName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (p.invoiceNo && p.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const filteredSales = sales.filter(s => 
    s.buyerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (s.ref && s.ref.toLowerCase().includes(searchTerm.toLowerCase())) ||
    (s.invoiceNo && s.invoiceNo.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // Legacy sales entries (saved before Net of VAT / Output Tax were tracked per-entry) stored
  // `amount` as the NET figure with a flat 12% always added on top. Newer entries store
  // `amount` as the GROSS figure with netOfVat/outputTax computed from vatType.
  const getSaleVatBreakdown = (s: typeof sales[number]) => {
    const hasVatBreakdown = s.outputTax !== undefined && s.netOfVat !== undefined;
    const outputTax = hasVatBreakdown ? s.outputTax : s.amount * 0.12;
    const netOfVat = hasVatBreakdown ? s.netOfVat : s.amount;
    return { outputTax, netOfVat };
  };

  // Derive unique DAT periods from transactions
  const allPeriods = Array.from(new Set([
    ...(currentClient.sales || []).map(s => s.datMonthYear),
    ...(currentClient.purchases || []).map(p => p.datMonthYear)
  ])).filter(Boolean);

  const handleSwitchPeriod = (period: string) => {
    const [monthName, yearStr] = period.split(' ');
    const year = parseInt(yearStr);
    const monthIndex = MONTHS.indexOf(monthName);
    if (monthIndex !== -1) {
      setCurrentDat({
        month: monthIndex + 1,
        year,
        formatted: period
      });
      showToast(`Switched to ${period}`);
    }
  };

  const handleExportSLP = () => {
    if (!purchases.length || !currentDat || !currentClient) return;

    const workbook = XLSX.utils.book_new();
    
    // Header Info as shown in image
    const headerRows = [
      ['PURCHASE TRANSACTION'],
      ['RECONCILIATION OF LISTING FOR ENFORCEMENT'],
      [''],
      [`TIN : ${currentClient.tin || ''}`],
      [`OWNER'S NAME : ${currentClient.proprietor || currentClient.name}`],
      [`OWNER'S TRADE NAME : ${currentClient.name}`],
      [`OWNER'S ADDRESS : ${currentClient.address || ''}`],
      [''],
      [
        '(1) TAXABLE MONTH', 
        '(2) TAXPAYER IDENTIFICATION NUMBER', 
        '(3) REGISTERED NAME', 
        '(4) NAME OF SUPPLIER (Last Name, First Name, Middle Name)', 
        '(5) SUPPLIER\'S ADDRESS', 
        '(6) AMOUNT OF GROSS PURCHASE', 
        '(7) AMOUNT OF EXEMPT PURCHASE', 
        '(8) AMOUNT OF ZERO-RATED PURCHASE', 
        '(9) AMOUNT OF TAXABLE PURCHASE', 
        '(10) AMOUNT OF PURCHASE OF SERVICES', 
        '(11) AMOUNT OF PURCHASE OF CAPITAL GOODS', 
        '(12) AMOUNT OF PURCHASE OF GOODS OTHER THAN CAPITAL GOODS', 
        '(13) AMOUNT OF INPUT TAX', 
        '(14) AMOUNT OF GROSS TAXABLE PURCHASE'
      ]
    ];
    
    const dataRows = purchases.map(p => {
      const isVat = p.vatType === 'vat';
      const isNonVat = p.vatType === 'non-vat';
      const isZeroRated = p.vatType === 'zero-rated';
      const isServices = p.expenseType === 'Services';
      const isCapital = p.expenseType === 'Capital Goods';
      const isOthers = p.expenseType === 'Others';
      const grossTotal = p.amount + (p.inputTax || 0);
      
      const monthStr = p.date.split('/')[0] + '/' + p.date.split('/')[1] + '/' + p.date.split('/')[2];
      
      return [
        monthStr,
        p.supplierTin,
        '',
        p.supplierName,
        p.supplierAddress,
        grossTotal,
        isNonVat ? p.amount : 0,
        isZeroRated ? p.amount : 0,
        isVat ? p.amount : 0,
        (isVat && isServices) ? p.amount : 0,
        (isVat && isCapital) ? p.amount : 0,
        (isVat && isOthers) ? p.amount : 0,
        p.inputTax || 0,
        isVat ? grossTotal : 0
      ];
    });

    const totalRow = [
      'Grand Total :', '', '', '', '',
      purchases.reduce((s, p) => s + p.amount + (p.inputTax || 0), 0),
      purchases.filter(p => p.vatType === 'non-vat').reduce((s, p) => s + p.amount, 0),
      purchases.filter(p => p.vatType === 'zero-rated').reduce((s, p) => s + p.amount, 0),
      purchases.filter(p => p.vatType === 'vat').reduce((s, p) => s + p.amount, 0),
      purchases.filter(p => p.vatType === 'vat' && p.expenseType === 'Services').reduce((s, p) => s + p.amount, 0),
      purchases.filter(p => p.vatType === 'vat' && p.expenseType === 'Capital Goods').reduce((s, p) => s + p.amount, 0),
      purchases.filter(p => p.vatType === 'vat' && p.expenseType === 'Others').reduce((s, p) => s + p.amount, 0),
      purchases.reduce((s, p) => s + (p.inputTax || 0), 0),
      purchases.filter(p => p.vatType === 'vat').reduce((s, p) => s + p.amount + (p.inputTax || 0), 0)
    ];

    const finalData = [...headerRows, ...dataRows, totalRow, [''], ['END OF REPORT']];
    const worksheet = XLSX.utils.aoa_to_sheet(finalData);
    
    // Set column widths for better readability
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 20 }, { wch: 30 }, { wch: 40 }, { wch: 40 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'SLP');
    XLSX.writeFile(workbook, `SLP_${currentDat.formatted.replace(' ', '_')}.xlsx`);
  };

  const handleExportSLS = () => {
    if (!sales.length || !currentDat || !currentClient) return;

    const workbook = XLSX.utils.book_new();
    
    const headerRows = [
      ['SALES TRANSACTION'],
      ['RECONCILIATION OF LISTING FOR ENFORCEMENT'],
      [''],
      [`TIN : ${currentClient.tin || ''}`],
      [`OWNER'S NAME : ${currentClient.proprietor || currentClient.name}`],
      [`OWNER'S TRADE NAME : ${currentClient.name}`],
      [`OWNER'S ADDRESS : ${currentClient.address || ''}`],
      [''],
      [
        '(1) TAXABLE MONTH',
        '(2) TAXPAYER IDENTIFICATION NUMBER',
        '(3) REGISTERED NAME',
        '(4) NAME OF CUSTOMER',
        '(5) CUSTOMER ADDRESS',
        '(6) AMOUNT OF GROSS SALES',
        '(7) AMOUNT OF EXEMPT SALES',
        '(8) AMOUNT OF ZERO-RATED SALES',
        '(9) AMOUNT OF TAXABLE SALES',
        '(10) AMOUNT OF OUTPUT TAX',
        '(11) AMOUNT OF GROSS TAXABLE SALES'
      ]
    ];
    
    const dataRows = sales.map(s => {
      // Legacy entries (saved before Net of VAT / Output Tax were tracked per-entry) stored
      // `amount` as the NET figure with a flat 12% always added on top. New entries store
      // `amount` as the GROSS figure with netOfVat/outputTax computed from vatType.
      const hasVatBreakdown = s.outputTax !== undefined && s.netOfVat !== undefined;
      const outputTax = hasVatBreakdown ? s.outputTax : s.amount * 0.12;
      const netOfVat = hasVatBreakdown ? s.netOfVat : s.amount;
      const grossTotal = hasVatBreakdown ? s.amount : s.amount + outputTax;
      const isExempt = s.vatType === 'VAT Exempt';
      const isZeroRated = s.vatType === 'Zero-Rated';
      const taxableAmount = (isExempt || isZeroRated) ? 0 : netOfVat;
      
      return [
        s.date,
        s.buyerTin || '',
        '',
        s.buyerName || s.customerName,
        s.buyerAddress || s.customerAddress || '',
        grossTotal,
        isExempt ? grossTotal : 0,
        isZeroRated ? grossTotal : 0,
        taxableAmount,
        outputTax,
        grossTotal
      ];
    });

    const computeRow = (s: typeof sales[number]) => {
      const hasVatBreakdown = s.outputTax !== undefined && s.netOfVat !== undefined;
      const outputTax = hasVatBreakdown ? s.outputTax : s.amount * 0.12;
      const netOfVat = hasVatBreakdown ? s.netOfVat : s.amount;
      const grossTotal = hasVatBreakdown ? s.amount : s.amount + outputTax;
      return { outputTax, netOfVat, grossTotal };
    };

    const totalRow = [
      'Grand Total :', '', '', '', '',
      sales.reduce((sum, s) => sum + computeRow(s).grossTotal, 0),
      sales.reduce((sum, s) => sum + (s.vatType === 'VAT Exempt' ? computeRow(s).grossTotal : 0), 0),
      sales.reduce((sum, s) => sum + (s.vatType === 'Zero-Rated' ? computeRow(s).grossTotal : 0), 0),
      sales.reduce((sum, s) => sum + ((s.vatType === 'VAT Exempt' || s.vatType === 'Zero-Rated') ? 0 : computeRow(s).netOfVat), 0),
      sales.reduce((sum, s) => sum + computeRow(s).outputTax, 0),
      sales.reduce((sum, s) => sum + computeRow(s).grossTotal, 0)
    ];

    const finalData = [...headerRows, ...dataRows, totalRow, [''], ['END OF REPORT']];
    const worksheet = XLSX.utils.aoa_to_sheet(finalData);
    
    worksheet['!cols'] = [
      { wch: 15 }, { wch: 20 }, { wch: 30 }, { wch: 40 }, { wch: 40 },
      { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 15 }
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'SLS');
    XLSX.writeFile(workbook, `SLS_${currentDat.formatted.replace(' ', '_')}.xlsx`);
  };

  return (
    <div className="w-full flex flex-col">
      <PageHeader title={activeConfig.label} icon={<activeConfig.icon className="w-5 h-5 text-indigo-500" />} />
      <div className="flex-1 w-full">
      <div className="flex flex-col">
        {/* Content Area - intentionally borderless; this is the page workspace, not a card/modal. */}
        <div className="overflow-hidden">
          {!['slp', 'sls'].includes(activeTab) ? (
            <>
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col xl:flex-row justify-between items-stretch xl:items-center gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 whitespace-nowrap">
                    {activeTab === 'expenses' ? 'Expense Records' : activeTab === 'income' ? 'Income Records' : 'DAT File Summary'}
                    <span className="text-[10px] font-bold text-slate-500 bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded-full">
                      {targetFormatted}
                    </span>
                  </h3>
                  
                  <div className="flex items-center gap-1.5">
                    <select 
                      value={selectedMonth} 
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 min-w-[90px] text-slate-700 dark:text-slate-200"
                    >
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={idx + 1}>{m}</option>
                      ))}
                    </select>
                    <select 
                      value={selectedYear} 
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 text-slate-700 dark:text-slate-200"
                    >
                      {years.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <button 
                      onClick={handleLoadPeriod}
                      className="px-2.5 py-1.5 text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 rounded-lg transition-colors border border-indigo-100 dark:border-slate-700"
                    >
                      Load
                    </button>
                  </div>
                </div>
                {activeTab === 'expenses' && (
                  <div className="relative flex items-center gap-2">
                    <button type="button" onClick={() => setShowExpenseColumns(v => !v)} className="inline-flex items-center gap-2 px-3 py-2 text-xs font-bold bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
                      <Columns3 className="w-4 h-4" /> Columns <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                    {showExpenseColumns && (
                      <div className="absolute right-0 top-11 z-50 w-72 max-h-96 overflow-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs font-bold text-slate-700 dark:text-slate-200">Expense History Columns</span>
                          <button type="button" onClick={() => setVisibleExpenseColumns(defaultExpenseColumns)} className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">Reset</button>
                        </div>
                        <div className="grid grid-cols-1 gap-1">
                          {expenseColumnDefinitions.map(col => (
                            <label key={col.key} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer text-xs text-slate-700 dark:text-slate-300">
                              <input type="checkbox" checked={visibleExpenseColumns.includes(col.key)} onChange={() => toggleExpenseColumn(col.key)} className="rounded" />
                              {col.label}
                            </label>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                  <input 
                    type="text" 
                    placeholder={`Search ${activeTab}...`}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all"
                  />
                </div>
              </div>

              {activeDevice === 'mobile' ? (
                <div className="p-4 flex flex-col gap-4">
                  {activeTab === 'expenses' ? (
                    filteredPurchases.map((p) => (
                      <div key={p.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-3 relative shadow-sm">
                        <div className="flex justify-between items-start border-b border-slate-200/60 dark:border-slate-700 pb-2">
                          <div>
                            <span className="text-[10px] font-mono text-slate-500 block">Date</span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{p.date}</span>
                          </div>
                          <div>
                            <span className="text-[10px] font-mono text-slate-500 block text-right">Invoice No.</span>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-200 text-right block">{p.invoiceNo || p.referenceNo || '—'}</span>
                          </div>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block mb-1">Supplier Info</span>
                          <div className="bg-white dark:bg-slate-900 rounded-xl p-2.5 border border-slate-200/50 dark:border-slate-800 flex flex-col gap-1 text-[11px]">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{p.supplierName}</div>
                            <div className="text-slate-500 font-mono">TIN: {p.supplierTin || '—'}</div>
                            <div className="text-slate-400 truncate" title={p.supplierAddress}>{p.supplierAddress || '—'}</div>
                            {p.transactionDetails && (
                              <div className="text-indigo-500/80 italic mt-1 font-sans">Note: {p.transactionDetails}</div>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Payment Method</span>
                            <span className="font-semibold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 block w-max mt-0.5">
                              {p.paymentMethod || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Classification</span>
                            <span className="font-semibold bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded text-blue-700 dark:text-blue-300 block w-max mt-0.5 max-w-full truncate" title={p.accountTitle}>
                              {p.accountTitle || 'General Expense'}
                            </span>
                          </div>
                        </div>

                        <div className="bg-amber-500/5 dark:bg-amber-500/10 p-3 rounded-xl border border-amber-500/20 flex flex-col gap-1.5 mt-1">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Net Amount:</span>
                            <span className="font-bold text-slate-800 dark:text-slate-100">₱{p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Input Tax (12%):</span>
                            <span className="font-mono text-blue-600 dark:text-blue-400">₱{(p.inputTax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs pt-1.5 border-t border-dashed border-amber-500/30">
                            <span className="font-bold text-slate-700 dark:text-slate-300">Gross Total:</span>
                            <span className="font-extrabold text-amber-600 dark:text-amber-400">₱{(p.amount + (p.inputTax || 0)).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>

                        <div className="flex justify-end gap-2 pt-1">
                          {p.attachment && (
                            <button 
                              onClick={() => downloadAttachment(p.attachment)}
                              className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-500 hover:text-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                              title="Download attachment"
                            >
                              <Download className="w-3.5 h-3.5" /> Download
                            </button>
                          )}
                          <button 
                            onClick={() => handleEditExpense(p)}
                            className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                            title="Edit Entry"
                          >
                            <Pencil className="w-3.5 h-3.5" /> Edit
                          </button>
                          <button 
                            onClick={() => handleDeleteExpense(p.id)}
                            className="px-3 py-1.5 bg-red-50 dark:bg-red-950/20 text-red-500 hover:text-red-700 hover:bg-red-100 dark:hover:bg-red-900/40 rounded-lg text-xs font-bold transition-all flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    filteredSales.map((s) => (
                      <div key={s.id} className="bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-col gap-2 relative shadow-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">{s.date}</span>
                          <span className="text-xs font-mono text-slate-500">Inv #: {s.ref || s.invoiceNo || '—'}</span>
                        </div>

                        <div>
                          <span className="text-[10px] font-bold text-indigo-500 uppercase tracking-wider block mb-1">Customer Info</span>
                          <div className="bg-white dark:bg-slate-900 rounded-xl p-2.5 border border-slate-200/50 dark:border-slate-800 flex flex-col gap-1 text-[11px]">
                            <div className="font-bold text-slate-800 dark:text-slate-200">{s.buyerName || s.customerName}</div>
                            <div className="text-slate-500 font-mono">TIN: {s.buyerTin || '—'}</div>
                            <div className="text-slate-400 truncate" title={s.buyerAddress}>{s.buyerAddress || '—'}</div>
                            {s.desc && <div className="text-slate-500 italic mt-1">"{s.desc}"</div>}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div>
                            <span className="text-[10px] text-slate-400 block">Payment Type</span>
                            <span className="font-semibold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded text-slate-700 dark:text-slate-300 block w-max mt-0.5">
                              {s.paymentType || '—'}
                            </span>
                          </div>
                          <div>
                            <span className="text-[10px] text-slate-400 block">Classification</span>
                            <div className="flex flex-wrap gap-1 mt-0.5">
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 font-semibold uppercase">{s.vatType || '—'}</span>
                              <span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 font-semibold uppercase">{s.incomeType || '—'}</span>
                            </div>
                          </div>
                        </div>

                        <div className="bg-emerald-50/50 dark:bg-emerald-900/10 p-2.5 rounded-lg mt-1 flex flex-col gap-1 border border-emerald-100 dark:border-emerald-900/30">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Net of VAT:</span>
                            <span className="font-mono text-slate-700 dark:text-slate-300">₱{getSaleVatBreakdown(s).netOfVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Output Tax:</span>
                            <span className="font-mono text-blue-600 dark:text-blue-400">₱{getSaleVatBreakdown(s).outputTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs pt-1.5 border-t border-dashed border-emerald-500/30">
                            <span className="font-bold text-slate-700 dark:text-slate-300">Gross Amount:</span>
                            <span className="font-extrabold text-emerald-600 dark:text-emerald-400">₱{s.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                          </div>
                        </div>

                        <div className="flex justify-end pt-2 border-t border-slate-200/60 dark:border-slate-800 mt-1">
                          <button 
                            onClick={() => handleDeleteIncome(s.id)}
                            className="p-1 px-3 bg-red-50 dark:bg-red-950/20 text-red-500 hover:text-red-700 rounded-lg text-xs font-semibold transition-all flex items-center gap-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    ))
                  )}

                  {((activeTab === 'expenses' && filteredPurchases.length === 0) || (activeTab === 'income' && filteredSales.length === 0)) && (
                    <div className="text-center py-12 text-slate-500 dark:text-slate-400">
                      <HistoryIcon className="w-8 h-8 mx-auto mb-3 opacity-20" />
                      <p className="font-medium">No {activeTab} found for this period.</p>
                      <p className="text-xs">Adjust your search or change the DAT File Selection.</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse min-w-max">
                    <thead className="sticky top-0 z-20">
                      <tr className="bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs uppercase font-bold tracking-wider shadow-sm">
                        {activeTab === 'expenses' ? (
                          <>
                            {visibleExpenseColumns.map(key => {
                              const def = expenseColumnDefinitions.find(c => c.key === key);
                              return def ? (
                                <th key={key} className={`px-3 py-3 border-b border-slate-200 dark:border-slate-700 whitespace-nowrap ${['amount','netAmount','inputTax','exemptAmount','zeroRatedAmount','whtAmount'].includes(key) ? 'text-right' : 'text-left'}`}>
                                  {def.label}
                                </th>
                              ) : null;
                            })}
                            <th className="px-3 py-3 border-b border-slate-200 dark:border-slate-700 w-24 sticky right-0 bg-slate-50 dark:bg-slate-800 z-30">Actions</th>
                          </>
                        ) : (
                          <>
                            <th className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">Date</th>
                            <th className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">Invoice No.</th>
                            <th className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 text-left">Customer Info</th>
                            <th className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 text-left">Payment</th>
                            <th className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 text-left">Classification</th>
                            <th className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 text-right whitespace-nowrap">Gross Amount</th>
                            <th className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 text-right whitespace-nowrap">Net of VAT</th>
                            <th className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 text-right whitespace-nowrap">Output Tax</th>
                            <th className="px-3 py-3 border-b border-slate-100 dark:border-slate-800 w-12 sticky right-0 bg-white dark:bg-slate-900 z-30"></th>
                          </>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {activeTab === 'expenses' ? (
                        filteredPurchases.map((p) => (
                          <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                            {visibleExpenseColumns.map(key => (
                              <td key={key} className={`px-3 py-3 text-xs align-top whitespace-nowrap ${['amount','netAmount','inputTax','exemptAmount','zeroRatedAmount','whtAmount'].includes(key) ? 'text-right font-semibold' : ''}`}>
                                {key === 'attachment' && p.attachment ? (
                                  <button onClick={() => downloadAttachment(p.attachment)} className="p-1.5 text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg" title="Download attachment"><Download className="w-4 h-4" /></button>
                                ) : (
                                  <span className={key === 'accountTitle' ? 'font-bold text-blue-700 dark:text-blue-300' : 'text-slate-700 dark:text-slate-300'}>{formatExpenseColumnValue(p, key)}</span>
                                )}
                              </td>
                            ))}
                            <td className="px-3 py-3 text-center align-top sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50 z-10 border-l border-slate-100 dark:border-slate-800">
                              <div className="flex items-center justify-center gap-1">
                                {p.attachment && !visibleExpenseColumns.includes('attachment') && (
                                  <button onClick={() => downloadAttachment(p.attachment)} className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg" title="Download attachment"><Download className="w-4 h-4" /></button>
                                )}
                                <button onClick={() => handleEditExpense(p)} className="p-1.5 text-slate-300 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-lg" title="Edit Entry"><Pencil className="w-4 h-4" /></button>
                                <button onClick={() => handleDeleteExpense(p.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg" title="Delete Entry"><Trash2 className="w-4 h-4" /></button>
                              </div>
                            </td>
                          </tr>
                        ))
                      ) : (
                        filteredSales.map((s) => (
                          <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                            <td className="px-3 py-3 text-sm text-slate-600 dark:text-slate-400 align-top whitespace-nowrap">{s.date}</td>
                            <td className="px-3 py-3 text-sm font-medium text-slate-800 dark:text-slate-200 align-top whitespace-nowrap">{s.ref || s.invoiceNo || '—'}</td>
                            <td className="px-3 py-3 text-xs align-top"><div className="flex flex-col gap-0.5"><span className="font-bold text-slate-800 dark:text-slate-200">{s.buyerName || s.customerName}</span><span className="text-slate-500 font-mono text-[10px]">TIN: {s.buyerTin || '—'}</span><span className="text-slate-400 text-[10px] truncate max-w-[180px]" title={s.buyerAddress}>{s.buyerAddress || '—'}</span></div></td>
                            <td className="px-3 py-3 text-xs align-top"><span className="inline-block px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">{s.paymentType || '—'}</span></td>
                            <td className="px-3 py-3 text-xs align-top"><div className="flex flex-wrap items-center gap-1"><span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400 font-semibold uppercase">{s.vatType || '—'}</span><span className="px-1.5 py-0.5 rounded text-[9px] bg-cyan-50 text-cyan-600 dark:bg-cyan-900/30 dark:text-cyan-400 font-semibold uppercase">{s.incomeType || '—'}</span></div>{s.desc && <div className="text-[10px] text-slate-400 italic mt-1 truncate max-w-[160px]" title={s.desc}>"{s.desc}"</div>}</td>
                            <td className="px-3 py-3 text-sm font-bold text-emerald-700 dark:text-emerald-400 text-right align-top whitespace-nowrap bg-emerald-50/30 dark:bg-emerald-900/10">₱{s.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-3 text-sm text-slate-900 dark:text-white text-right align-top whitespace-nowrap">₱{getSaleVatBreakdown(s).netOfVat.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-3 text-sm text-blue-600 dark:text-blue-400 text-right align-top whitespace-nowrap">₱{getSaleVatBreakdown(s).outputTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                            <td className="px-3 py-3 text-center align-top sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/50 z-10 border-l border-slate-100 dark:border-slate-800"><button onClick={() => handleDeleteIncome(s.id)} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all" title="Delete Entry"><Trash2 className="w-4 h-4" /></button></td>
                          </tr>
                        ))
                      )}
                      {((activeTab === 'expenses' && filteredPurchases.length === 0) || (activeTab === 'income' && filteredSales.length === 0)) && (
                        <tr><td colSpan={(activeTab === 'expenses' ? visibleExpenseColumns.length + 1 : 9)} className="px-4 py-12 text-center text-slate-500 dark:text-slate-400"><HistoryIcon className="w-8 h-8 mx-auto mb-3 opacity-20" /><p className="font-medium">No {activeTab} found for this period.</p><p className="text-xs">Adjust your search or change the DAT File Selection.</p></td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          ) : activeTab === 'slp' ? (
            <div className="flex flex-col">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm">
                    <FolderClock className="w-4 h-4 text-cyan-500" />
                    Summary List of Purchases (SLP)
                  </h3>
                  <div className="flex items-center gap-2">
                    <select 
                      value={selectedMonth} 
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500/50 min-w-[100px]"
                    >
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={idx + 1}>{m}</option>
                      ))}
                    </select>
                    <select 
                      value={selectedYear} 
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                    >
                      {years.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <button 
                      onClick={handleLoadPeriod}
                      className="px-3 py-1.5 text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      Load
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {purchases.length > 0 && (
                    <button 
                      onClick={handleExportSLP}
                      className="px-3 py-1.5 text-xs font-bold bg-cyan-600 text-white rounded-lg hover:bg-cyan-700 transition-colors flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-3 h-3" /> Export Excel
                    </button>
                  )}
                </div>
              </div>

              {!currentDat ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                  <FolderClock className="w-12 h-12 mx-auto mb-4 opacity-10" />
                  <p className="font-bold">No Period Selected</p>
                  <p className="text-sm mb-6">Please select a period to view the summary list.</p>
                  <button 
                    onClick={() => navigateToPage('purchases')}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20"
                  >
                    Select Period Now
                  </button>
                </div>
              ) : purchases.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                  <HistoryIcon className="w-12 h-12 mx-auto mb-4 opacity-10" />
                  <p className="font-bold">No Records in {currentDat.formatted}</p>
                  <p className="text-sm">Add some expense entries to see the summary here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-[10px] text-left border-collapse min-w-[1500px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-500 font-bold uppercase tracking-tighter border-b border-slate-200 dark:border-slate-700">
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-center sticky left-0 bg-slate-100 dark:bg-slate-800 z-10 leading-tight">TAXABLE<br/>MONTH</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-center leading-tight">TAXPAYER<br/>IDENTIFICATION<br/>NUMBER</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 leading-tight">REGISTERED NAME</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 leading-tight">NAME OF SUPPLIER<br/>(Last Name, First Name, Middle Name)</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 leading-tight">SUPPLIER'S ADDRESS</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right leading-tight">AMOUNT OF<br/>GROSS PURCHASE</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right leading-tight">AMOUNT OF<br/>EXEMPT PURCHASE</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right leading-tight">AMOUNT OF<br/>ZERO-RATED PURCHASE</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right leading-tight">AMOUNT OF<br/>TAXABLE PURCHASE</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right leading-tight">AMOUNT OF<br/>PURCHASE OF SERVICES</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right leading-tight">AMOUNT OF<br/>PURCHASE OF CAPITAL GOODS</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right leading-tight">AMOUNT OF PURCHASE OF GOODS<br/>OTHER THAN CAPITAL GOODS</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right leading-tight">AMOUNT OF<br/>INPUT TAX</th>
                        <th className="px-2 py-3 text-right leading-tight">AMOUNT OF<br/>GROSS TAXABLE PURCHASE</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {purchases.map((p) => {
                        const isVat = p.vatType === 'vat';
                        const isNonVat = p.vatType === 'non-vat';
                        const isZeroRated = p.vatType === 'zero-rated';
                        const isServices = p.expenseType === 'Services';
                        const isCapital = p.expenseType === 'Capital Goods';
                        const isOthers = p.expenseType === 'Others';

                        const monthNum = currentDat?.month?.toString().padStart(2, '0') || '—';
                        const grossTotal = p.amount + (p.inputTax || 0);

                        return (
                          <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-center font-bold sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40">{monthNum}</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-center font-mono">{p.supplierTin}</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-slate-400 italic">—</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 font-medium">{p.supplierName}</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-[9px] max-w-[200px] truncate">{p.supplierAddress}</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right font-bold">
                              {grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-slate-500">
                              {isNonVat ? p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-slate-500">
                              {isZeroRated ? p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-slate-500">
                              {isVat ? p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-blue-600">
                              {(isVat && isServices) ? p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-blue-600">
                              {(isVat && isCapital) ? p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-blue-600">
                              {(isVat && isOthers) ? p.amount.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-indigo-600 font-bold">
                              {(p.inputTax || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-2 text-right bg-slate-50 dark:bg-slate-800/20 font-black">
                              {isVat ? grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 }) : '0.00'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-black text-slate-700 dark:text-slate-200 border-t-2 border-slate-200 dark:border-slate-700">
                      <tr>
                        <td colSpan={5} className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right">TOTAL PERIOD SUMMARY:</td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right">
                          ₱{purchases.reduce((s, p) => s + p.amount + (p.inputTax || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right font-normal">
                          {purchases.filter(p => p.vatType === 'non-vat').reduce((s, p) => s + p.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right font-normal">
                          {purchases.filter(p => p.vatType === 'zero-rated').reduce((s, p) => s + p.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right font-normal">
                          {purchases.filter(p => p.vatType === 'vat').reduce((s, p) => s + p.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right font-normal">
                          {purchases.filter(p => p.vatType === 'vat' && p.expenseType === 'Services').reduce((s, p) => s + p.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right font-normal">
                          {purchases.filter(p => p.vatType === 'vat' && p.expenseType === 'Capital Goods').reduce((s, p) => s + p.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right font-normal">
                          {purchases.filter(p => p.vatType === 'vat' && p.expenseType === 'Others').reduce((s, p) => s + p.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right text-indigo-600">
                          {purchases.reduce((s, p) => s + (p.inputTax || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 text-right text-indigo-700">
                          {purchases.filter(p => p.vatType === 'vat').reduce((s, p) => s + p.amount + (p.inputTax || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4 bg-slate-50/50 dark:bg-slate-800/30">
                <div className="flex items-center gap-3">
                  <h3 className="font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2 text-sm">
                    <FolderClock className="w-4 h-4 text-indigo-500" />
                    Summary List of Sales (SLS)
                  </h3>
                  <div className="flex items-center gap-2">
                    <select 
                      value={selectedMonth} 
                      onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
                      className="text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 min-w-[100px]"
                    >
                      {MONTHS.map((m, idx) => (
                        <option key={m} value={idx + 1}>{m}</option>
                      ))}
                    </select>
                    <select 
                      value={selectedYear} 
                      onChange={(e) => setSelectedYear(parseInt(e.target.value))}
                      className="text-[11px] font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    >
                      {years.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                    <button 
                      onClick={handleLoadPeriod}
                      className="px-3 py-1.5 text-[11px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                    >
                      Load
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {sales.length > 0 && (
                    <button 
                      onClick={handleExportSLS}
                      className="px-3 py-1.5 text-xs font-bold bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors flex items-center gap-2"
                    >
                      <FileSpreadsheet className="w-3 h-3" /> Export Excel
                    </button>
                  )}
                </div>
              </div>

              {!currentDat ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                  <FolderClock className="w-12 h-12 mx-auto mb-4 opacity-10" />
                  <p className="font-bold">No Period Selected</p>
                  <p className="text-sm mb-6">Please select a period to view the summary list.</p>
                  <button 
                    onClick={() => navigateToPage('sales')}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20"
                  >
                    Select Period Now
                  </button>
                </div>
              ) : sales.length === 0 ? (
                <div className="p-12 text-center text-slate-500 dark:text-slate-400">
                  <HistoryIcon className="w-12 h-12 mx-auto mb-4 opacity-10" />
                  <p className="font-bold">No Records in {currentDat.formatted}</p>
                  <p className="text-sm">Add some income entries to see the summary here.</p>
                </div>
              ) : (
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-[10px] text-left border-collapse min-w-[1200px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-500 font-bold uppercase tracking-tighter border-b border-slate-200 dark:border-slate-700">
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-center sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">Month</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-center">Taxpayer TIN</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700">Registered Name</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700">Name of Customer</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700">Customer Address</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right">Gross Sales</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right">Exempt Sales</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right">Zero-Rated Sales</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right">Taxable Sales</th>
                        <th className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right">Output Tax</th>
                        <th className="px-2 py-3 text-right">Gross Taxable</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sales.map((s) => {
                        const { outputTax, netOfVat } = getSaleVatBreakdown(s);
                        const grossTotal = s.outputTax !== undefined ? s.amount : s.amount + outputTax;
                        const isExempt = s.vatType === 'VAT Exempt';
                        const isZeroRated = s.vatType === 'Zero-Rated';
                        const taxableAmount = (isExempt || isZeroRated) ? 0 : netOfVat;
                        const monthNum = currentDat?.month?.toString().padStart(2, '0') || '—';

                        return (
                          <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-center font-bold sticky left-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-slate-800/40">{monthNum}</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-center font-mono">{s.buyerTin || '—'}</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-slate-400 italic">—</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 font-medium">{s.buyerName || s.customerName}</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-[9px] max-w-[200px] truncate">{s.buyerAddress || s.customerAddress || '—'}</td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right font-bold">
                              {grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-slate-500">
                              {(isExempt ? grossTotal : 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-slate-500">
                              {(isZeroRated ? grossTotal : 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-slate-500">
                              {taxableAmount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-2 border-r border-slate-100 dark:border-slate-800 text-right text-indigo-600 font-bold">
                              {outputTax.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                            <td className="px-2 py-2 text-right bg-slate-50 dark:bg-slate-800/20 font-black">
                              {grossTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-black text-slate-700 dark:text-slate-200 border-t-2 border-slate-200 dark:border-slate-700">
                      <tr>
                        <td colSpan={5} className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right">TOTAL PERIOD SUMMARY:</td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right">
                          ₱{sales.reduce((sum, s) => sum + (s.outputTax !== undefined ? s.amount : s.amount + getSaleVatBreakdown(s).outputTax), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right font-normal">
                          {sales.reduce((sum, s) => sum + (s.vatType === 'VAT Exempt' ? (s.outputTax !== undefined ? s.amount : s.amount + getSaleVatBreakdown(s).outputTax) : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right font-normal">
                          {sales.reduce((sum, s) => sum + (s.vatType === 'Zero-Rated' ? (s.outputTax !== undefined ? s.amount : s.amount + getSaleVatBreakdown(s).outputTax) : 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right font-normal">
                          {sales.reduce((sum, s) => sum + ((s.vatType === 'VAT Exempt' || s.vatType === 'Zero-Rated') ? 0 : getSaleVatBreakdown(s).netOfVat), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 border-r border-slate-200 dark:border-slate-700 text-right text-indigo-600">
                          {sales.reduce((sum, s) => sum + getSaleVatBreakdown(s).outputTax, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-2 py-3 text-right text-indigo-700">
                          {sales.reduce((sum, s) => sum + (s.outputTax !== undefined ? s.amount : s.amount + getSaleVatBreakdown(s).outputTax), 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Summary */}
        {!['slp', 'sls'].includes(activeTab) && (
          <div className={cn("grid gap-4", activeTab === 'expenses' || activeTab === 'income' ? "grid-cols-1" : "grid-cols-2")}>
            {activeTab !== 'income' && (
              <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl border border-amber-100 dark:border-amber-800/50">
                <span className="block text-xs uppercase font-bold text-amber-600 dark:text-amber-400 mb-1">Period Total Expenses</span>
                <span className="text-xl font-black text-amber-700 dark:text-amber-300">
                  ₱{purchases.reduce((sum, p) => sum + p.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            {activeTab !== 'expenses' && (
              <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-xl border border-emerald-100 dark:border-emerald-800/50">
                <span className="block text-xs uppercase font-bold text-emerald-600 dark:text-emerald-400 mb-1">Period Total Income</span>
                <span className="text-xl font-black text-emerald-700 dark:text-emerald-300">
                  ₱{sales.reduce((sum, s) => sum + s.amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        )}
      </div>
      </div>
    </div>
  );
}
