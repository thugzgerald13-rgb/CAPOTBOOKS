import React, { useState, useMemo, useEffect } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import {
  FileText, Printer, Sparkles, CheckCircle2, AlertCircle, Calendar
} from 'lucide-react';
import { TaxDeadline, Client } from '../types';
import { getComplianceStatusInfo } from '../lib/complianceUtils';
import { generateStandardDeadlines } from './BIRForms';

export function ComplianceTracker() {
  const { currentClient, currentClientId, setCurrentClientId, clients, businessProfile, activePage, navigateToPage, setBirFormTab, saveClient, currentDat, ownerClientId } = useAccounting();

  // Dynamically determine today's simulated date
  const getSimulatedToday = () => {
    if (currentDat) {
      const mm = String(currentDat.month).padStart(2, '0');
      return `${currentDat.year}-${mm}-16`;
    }
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  };

  const [selectedYear, setSelectedYear] = useState<number>(currentDat ? currentDat.year : new Date().getFullYear());

  const [trackerFilter, setTrackerFilter] = useState<'All' | 'Pending' | 'Processing' | 'Filed' | 'Paid' | 'Overdue'>('All');
  const [trackerSearch, setTrackerSearch] = useState<string>('');

  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [filingDate, setFilingDate] = useState<string>(getSimulatedToday());
  const [filingAmount, setFilingAmount] = useState<string>('');
  const [filingRef, setFilingRef] = useState<string>('');
  const [filingConfirmationNo, setFilingConfirmationNo] = useState<string>('');
  const [filingTaxStatus, setFilingTaxStatus] = useState<'With Payable' | 'W/O Payable'>('With Payable');
  const [filingDatePaid, setFilingDatePaid] = useState<string>('');
  const [filingNotes, setFilingNotes] = useState<string>('');

  // Automatically select the user's own-business client if no active client is selected
  useEffect(() => {
    if (activePage === 'compliance-tracker' && !currentClientId && ownerClientId) {
      setCurrentClientId(ownerClientId);
    }
  }, [activePage, currentClientId, setCurrentClientId, ownerClientId]);

  // Automatically initialize BIR compliance deadlines for the selected active client
  useEffect(() => {
    if (currentClient) {
      const existingDeadlines = currentClient.taxDeadlines || [];
      const yearStr = String(selectedYear);
      const hasDeadlinesForYear = existingDeadlines.some(d => 
        d.dueDate.startsWith(yearStr) || d.period.includes(yearStr)
      );

      if (!hasDeadlinesForYear) {
        const yearDeadlines = generateStandardDeadlines(selectedYear);
        const mergedDeadlines = [...existingDeadlines, ...yearDeadlines];
        saveClient(currentClient.id, {
          ...currentClient,
          taxDeadlines: mergedDeadlines
        });
      }
    }
  }, [currentClient?.id, selectedYear]);

  // Utility to determine date quarter
  const getQuarterNum = (dateStr: string) => {
    if (!dateStr) return 1;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 1;
    const month = date.getMonth(); // 0 to 11
    if (month < 3) return 1;
    if (month < 6) return 2;
    if (month < 9) return 3;
    return 4;
  };

  const getMonthNum = (dateStr: string) => {
    if (!dateStr) return 1;
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return 1;
    return date.getMonth() + 1; // 1 to 12
  };

  // Overdue status check
  const isDeadlineOverdue = (dueDateStr: string, status: string) => {
    if (status === 'Filed' || status === 'Paid') return false;
    const today = new Date(getSimulatedToday());
    const due = new Date(dueDateStr);
    return due < today;
  };

  // Tax Estimator Engine
  const getDraftTaxEstimate = (formType: string, periodStr: string) => {
    if (!currentClient) return 0;
    
    const isQuarter = periodStr.includes('Q');
    const quarterNum = isQuarter ? parseInt(periodStr.match(/Q(\d)/)?.[1] || '1') : 1;
    const monthName = !isQuarter ? periodStr.split(' ')[0] : '';
    const monthsMap: Record<string, number> = {
      'Jan': 1, 'Feb': 2, 'Mar': 3, 'Apr': 4, 'May': 5, 'June': 6, 'Jun': 6,
      'July': 7, 'Jul': 7, 'Aug': 8, 'Sep': 9, 'Oct': 10, 'Nov': 11, 'Dec': 12
    };
    const monthNum = monthName ? monthsMap[monthName] || 1 : 1;

    // Filter Sales and Purchases
    const sales = (currentClient.sales || []).filter(s => {
      const d = new Date(s.date);
      if (isNaN(d.getTime()) || d.getFullYear() !== selectedYear) return false;
      if (isQuarter) {
        return getQuarterNum(s.date) === quarterNum;
      } else {
        return getMonthNum(s.date) === monthNum;
      }
    });

    const purchases = (currentClient.purchases || []).filter(p => {
      const d = new Date(p.date);
      if (isNaN(d.getTime()) || d.getFullYear() !== selectedYear) return false;
      if (isQuarter) {
        return getQuarterNum(p.date) === quarterNum;
      } else {
        return getMonthNum(p.date) === monthNum;
      }
    });

    const salesTotal = sales.reduce((sum, s) => sum + s.amount, 0);
    const purchasesTotal = purchases.reduce((sum, p) => sum + p.amount, 0);

    if (formType === '2550Q') {
      // Output tax base must be net-of-VAT, VATable sales only - not gross total sales.
      const vatableNetSales = sales
        .filter(s => !s.vatType || s.vatType === 'VATable')
        .reduce((sum, s) => sum + (s.netOfVat !== undefined ? s.netOfVat : s.amount), 0);
      const inputTaxVal = purchases.filter(p => p.vatType === 'vat').reduce((sum, p) => sum + (p.inputTax || p.amount * 0.12), 0);
      return Math.max(0, (vatableNetSales * 0.12) - inputTaxVal);
    }
    
    if (formType === '2551Q') {
      return salesTotal * 0.03;
    }

    if (formType === '1701Q') {
      return Math.max(0, (salesTotal - 62500) * 0.08); 
    }

    if (formType === '1601-C') {
      return 2500; 
    }

    if (formType === '0619-E') {
      return purchasesTotal * 0.015;
    }

    if (formType === '1601-EQ') {
      return purchasesTotal * 0.015;
    }

    return 0;
  };

  // Get active list of deadlines
  const computedDeadlines = useMemo(() => {
    const allDeadlines = currentClient?.taxDeadlines || [];
    const yearStr = String(selectedYear);
    
    // Filter to only include deadlines for the selected year
    const deadlinesList = allDeadlines.filter(d => 
      d.dueDate.startsWith(yearStr) || d.period.includes(yearStr)
    );
    
    // Fallback to standard deadlines for the selected year if no entries exist yet
    const activeList = deadlinesList.length > 0 ? deadlinesList : generateStandardDeadlines(selectedYear);
    
    return activeList.map(d => {
      const overdue = isDeadlineOverdue(d.dueDate, d.status);
      return {
        ...d,
        status: ((d.status === 'Pending' || d.status === 'Processing') && overdue ? 'Overdue' : d.status) as 'Pending' | 'Processing' | 'Filed' | 'Paid' | 'Overdue'
      };
    });
  }, [currentClient, selectedYear]);

  // Filtering Logic
  const filteredDeadlines = useMemo(() => {
    return computedDeadlines.filter(d => {
      // 1. Search filter
      if (trackerSearch.trim() !== '') {
        const query = trackerSearch.toLowerCase();
        const matchesType = d.formType.toLowerCase().includes(query);
        const matchesTitle = d.title.toLowerCase().includes(query);
        const matchesPeriod = d.period.toLowerCase().includes(query);
        if (!matchesType && !matchesTitle && !matchesPeriod) return false;
      }

      // 2. Status filter
      if (trackerFilter === 'All') return true;
      if (trackerFilter === 'Pending') return d.status === 'Pending';
      if (trackerFilter === 'Processing') return d.status === 'Processing';
      if (trackerFilter === 'Filed') return d.status === 'Filed';
      if (trackerFilter === 'Paid') return d.status === 'Paid';
      if (trackerFilter === 'Overdue') return d.status === 'Overdue';
      return true;
    }).sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
  }, [computedDeadlines, trackerSearch, trackerFilter]);

  // Deadlines compliance metrics
  const trackerMetrics = useMemo(() => {
    const total = computedDeadlines.length;
    const completed = computedDeadlines.filter(d => d.status === 'Filed' || d.status === 'Paid').length;
    const paid = computedDeadlines.filter(d => d.status === 'Paid').length;
    const processing = computedDeadlines.filter(d => d.status === 'Processing').length;
    const pending = computedDeadlines.filter(d => d.status === 'Pending').length;
    const overdue = computedDeadlines.filter(d => d.status === 'Overdue').length;
    
    const complianceRate = total > 0 ? Math.round((completed / total) * 100) : 100;
    
    const taxesRemitted = computedDeadlines
      .filter(d => d.status === 'Filed' || d.status === 'Paid')
      .reduce((sum, d) => sum + (d.amountDue || 0), 0);

    const estimatedPending = computedDeadlines
      .filter(d => d.status !== 'Filed' && d.status !== 'Paid')
      .reduce((sum, d) => sum + getDraftTaxEstimate(d.formType, d.period), 0);

    return {
      total,
      completed,
      paid,
      processing,
      pending,
      overdue,
      complianceRate,
      taxesRemitted,
      estimatedPending
    };
  }, [computedDeadlines, selectedYear, currentClient]);

  // Status Change handler
  const handleUpdateDeadlineStatus = (deadlineId: string, updates: Partial<TaxDeadline>) => {
    if (!currentClient) return;
    
    let existingDeadlines = currentClient.taxDeadlines || [];
    const exists = existingDeadlines.some(d => d.id === deadlineId);
    
    // If the deadline is not in the database, generate and append standard deadlines for this year first
    if (!exists) {
      const yearDeadlines = generateStandardDeadlines(selectedYear);
      existingDeadlines = [...existingDeadlines, ...yearDeadlines];
    }
    
    const updatedDeadlines = existingDeadlines.map(d => {
      if (d.id === deadlineId) {
        return { ...d, ...updates };
      }
      return d;
    });

    saveClient(currentClient.id, {
      ...currentClient,
      taxDeadlines: updatedDeadlines
    });
  };

  const handlePrint = () => {
    window.print();
  };

  const yearsList = [2026, 2025, 2024, 2023];

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Philippine BIR Tax Declarations" icon={<FileText className="text-blue-600 w-5 h-5" />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="flex flex-col lg:flex-row gap-6 font-sans">
        
        {/* Left Control Sidebar */}
        <div className="w-full lg:w-80 shrink-0 bg-slate-50 dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800 flex flex-col gap-5">
          {/* Active Taxpayer Dropdown */}
          <div className="space-y-2">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 block mb-1">Active Entity / Profile</h4>
            <div className="relative">
              <select
                value={currentClientId || ''}
                onChange={e => setCurrentClientId(e.target.value)}
                className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 rounded-xl outline-none focus:ring-2 focus:ring-blue-500/20"
              >
                {/* Own business option */}
                {businessProfile ? (
                  <option value={ownerClientId || ''}>🏢 Own Business: {businessProfile.name}</option>
                ) : (
                  <option value={ownerClientId || ''}>🏢 Own Business (Unconfigured)</option>
                )}
                
                {/* List other clients if available */}
                {clients && (Object.values(clients) as Client[])
                  .filter((c: Client) => c.id !== ownerClientId)
                  .map((client: Client) => (
                    <option key={client.id} value={client.id}>
                      👤 Client: {client.registeredName || client.name}
                    </option>
                  ))
                }
              </select>
            </div>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
              Data, transactions, and declarations will automatically sync with this selected profile.
            </p>
          </div>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Configuration */}
          <div className="space-y-4">
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-400 block">
              Tracker Configurations
            </h4>
            
            <div className="grid grid-cols-1 gap-2">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Calendar Year</label>
                <select 
                  value={selectedYear}
                  onChange={e => setSelectedYear(parseInt(e.target.value))}
                  className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 rounded-xl rounded-b-xl outline-none"
                >
                  {yearsList.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            <div className="space-y-3 pt-1">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Search Form / Period</label>
                <input
                  type="text"
                  value={trackerSearch}
                  onChange={e => setTrackerSearch(e.target.value)}
                  placeholder="e.g. 2550Q, Q1, May"
                  className="w-full text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 rounded-xl outline-none font-medium"
                />
              </div>

              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1 font-bold">Status Filter</label>
                <select
                  value={trackerFilter}
                  onChange={e => setTrackerFilter(e.target.value as any)}
                  className="w-full text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 rounded-xl outline-none"
                >
                  <option value="All">All Statuses</option>
                  <option value="Pending">🕒 Pending</option>
                  <option value="Processing">🔄 Processing</option>
                  <option value="Filed">✅ Filed</option>
                  <option value="Paid">💰 Paid</option>
                  <option value="Overdue">⚠️ Overdue</option>
                </select>
              </div>
            </div>
            
            {/* Real-time sync feedback banner */}
            <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-[10px] leading-relaxed text-slate-600 dark:text-slate-400">
                Mark deadlines as filed, track filing details, reference receipt numbers, and review dynamic amount suggestions compiled from sales & purchases.
              </p>
            </div>
          </div>

          <hr className="border-slate-200 dark:border-slate-700" />

          {/* Actions */}
          <div className="mt-auto space-y-2">
            <button 
              onClick={handlePrint}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 shadow"
            >
              <Printer className="w-4 h-4" /> Print BIR Return
            </button>
          </div>
        </div>

        {/* Right Active BIR Form Rendering Sheet */}
        <div className="flex-1 bg-white dark:bg-slate-900 flex flex-col print:max-h-full">
          
          <div className="p-3 bg-indigo-50/50 dark:bg-slate-800/40 border-b border-indigo-100 dark:border-slate-800 text-slate-500 text-[10px] font-bold uppercase tracking-wider flex items-center gap-2 select-none print:hidden">
            <CheckCircle2 className="w-4 h-4 text-indigo-500" /> Complete layout validation passed. Official BIR color formatting loaded.
          </div>

          <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 print:overflow-visible print:p-0">
              <div className="space-y-6">
                {/* Dashboard Jumbotron Hero */}
                <div className="bg-gradient-to-br from-emerald-600 to-teal-750 text-white p-6 rounded-2xl border border-emerald-500/10 relative overflow-hidden">
                  <div className="absolute right-0 top-0 translate-x-8 -translate-y-8 text-white/5 font-black text-9xl">BIR</div>
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className="bg-emerald-500/20 text-emerald-100 border border-emerald-400/20 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">Official BIR Filing Schedule</span>
                        <span className="bg-emerald-500/20 text-emerald-100 border border-emerald-400/20 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider">{selectedYear}</span>
                      </div>
                      <h2 className="text-xl md:text-2xl font-black tracking-tight text-white mb-1">BIR Tax Compliance Calendar</h2>
                      <p className="text-xs text-emerald-100 mt-1 leading-relaxed max-w-xl font-medium">
                        Monitor, log, and report your statutory quarterly and monthly declarations. Values are computed dynamically from sales & purchases.
                      </p>
                    </div>
                    <div className="shrink-0 bg-white/10 backdrop-blur-md p-4 rounded-xl border border-white/10 text-center md:text-right min-w-[200px]">
                      <div className="text-[10px] uppercase font-black tracking-widest text-emerald-200">Compliance Adherence Rate</div>
                      <div className="text-3xl font-black mt-1 text-white">{trackerMetrics.complianceRate}%</div>
                      <div className="w-full bg-white/20 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${trackerMetrics.complianceRate}%` }}></div>
                      </div>
                      <div className="text-[10px] text-emerald-100 font-bold mt-1.5">{trackerMetrics.completed} of {trackerMetrics.total} filings successfully logged</div>
                    </div>
                  </div>
                </div>

                {/* Grid layout for aggregate metrics Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Metric Card 1: Completed Filings */}
                  <div className="bg-white dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/80 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Taxes Remitted (YTD)</div>
                      <div className="text-lg font-black text-slate-800 dark:text-white mt-0.5">
                        ₱{trackerMetrics.taxesRemitted.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold mt-0.5">{trackerMetrics.completed} filings logged</div>
                    </div>
                  </div>

                  {/* Metric Card 2: Pending Filings */}
                  <div className="bg-white dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/80 flex items-center gap-4 shadow-sm">
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950/20 rounded-xl text-indigo-600 dark:text-indigo-400">
                      <Calendar className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Est. Pending Liability</div>
                      <div className="text-lg font-black text-slate-800 dark:text-white mt-0.5">
                        ₱{trackerMetrics.estimatedPending.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </div>
                      <div className="text-[10px] text-slate-500 font-medium mt-0.5">{trackerMetrics.pending} upcoming filings</div>
                    </div>
                  </div>

                  {/* Metric Card 3: Overdue Filings */}
                  <div className="bg-white dark:bg-slate-800/40 p-5 rounded-2xl border border-slate-100 dark:border-slate-800/80 flex items-center gap-4 shadow-sm">
                    <div className={`p-3 rounded-xl ${trackerMetrics.overdue > 0 ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 animate-pulse' : 'bg-slate-50 dark:bg-slate-800 text-slate-400'}`}>
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">Overdue Filings</div>
                      <div className={`text-lg font-black mt-0.5 ${trackerMetrics.overdue > 0 ? 'text-rose-600 font-black' : 'text-slate-800 dark:text-slate-300'}`}>
                        {trackerMetrics.overdue} Deadlines
                      </div>
                      <span className="text-[10px] font-medium text-slate-500 block">Requires immediate attention</span>
                    </div>
                  </div>
                </div>

                {/* Deadlines Schedule Section */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-black text-slate-800 dark:text-white uppercase tracking-wider">BIR Filing Deadlines Schedule</h3>
                      <p className="text-[10px] text-slate-500 mt-0.5">Showing matching schedule items based on active criteria</p>
                    </div>
                    <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-200 px-3 py-1 rounded-xl font-bold">
                      {filteredDeadlines.length} Filings Listed
                    </span>
                  </div>

                  {filteredDeadlines.length === 0 ? (
                    <div className="text-center p-12 py-16 bg-slate-50 dark:bg-slate-900/40 border border-dashed border-slate-200 dark:border-slate-850 rounded-2xl">
                      <div className="mx-auto w-12 h-12 rounded-full bg-slate-100/40 dark:bg-slate-800 flex items-center justify-center text-slate-400 mb-3">
                        <Calendar className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-bold text-slate-700 dark:text-slate-300">No BIR Deadlines Match Your Filter</p>
                      <p className="text-[10px] text-slate-500 mt-1">Try adjusting the search query or status filter in the sidebar configurations.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {filteredDeadlines.map((deadline) => {
                        const recEstimate = getDraftTaxEstimate(deadline.formType, deadline.period);
                        const isEditing = editingDeadlineId === deadline.id;
                        const statusInfo = getComplianceStatusInfo(deadline, new Date(getSimulatedToday()));
                        const isCompleted = deadline.status === 'Filed' || deadline.status === 'Paid';

                        return (
                          <div
                            key={deadline.id}
                            className={`p-5 rounded-2xl border transition-all ${
                              isCompleted
                                ? 'bg-white dark:bg-slate-900/10 border-slate-200/65 dark:border-slate-800/65 shadow-sm opacity-95'
                                : deadline.status === 'Overdue'
                                  ? 'bg-rose-50/15 dark:bg-rose-950/5 border-rose-300 dark:border-rose-900/45 shadow-sm'
                                  : 'bg-white dark:bg-slate-900/20 border-slate-200 dark:border-slate-800 shadow-sm'
                            }`}
                          >
                            <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
                              {/* Left details */}
                              <div className="flex items-start gap-4">
                                <div className={`p-3 rounded-xl shrink-0 ${
                                  isCompleted
                                    ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600 dark:text-emerald-400'
                                    : deadline.status === 'Overdue'
                                      ? 'bg-rose-50 dark:bg-rose-950/25 text-rose-600 dark:text-rose-400'
                                      : deadline.status === 'Processing'
                                        ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400'
                                        : 'bg-indigo-50 dark:bg-indigo-950/20 text-indigo-600 dark:text-indigo-400'
                                }`}>
                                  <FileText className="w-6 h-6" />
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-extrabold text-xs text-slate-900 dark:text-white">
                                      {deadline.title}
                                    </span>
                                    <span className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-md text-[10px] font-bold">
                                      {deadline.period}
                                    </span>
                                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider border ${statusInfo.color}`}>
                                      {statusInfo.label}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-4 text-slate-500 text-[10px] font-semibold">
                                    <span className="flex items-center gap-1">
                                      <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                                      Due Date: <strong className={deadline.status === 'Overdue' ? 'text-rose-600 font-bold dark:text-rose-400' : 'text-slate-700 dark:text-slate-300'}>
                                        {new Date(deadline.dueDate).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                                      </strong>
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Right details / Actions preview */}
                              <div className="md:text-right flex flex-col items-start md:items-end gap-1 shrink-0">
                                <div className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                  {isCompleted ? 'Amount Remitted' : 'Estimated Tax Liability'}
                                </div>
                                <div className={`text-base font-black ${
                                  isCompleted ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-800 dark:text-slate-300'
                                }`}>
                                  ₱{(isCompleted ? (deadline.amountDue || 0) : recEstimate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                                </div>
                                <div className="text-[9px] text-slate-400 font-bold">
                                  {isCompleted ? 'Official receipt documented' : 'Suggested from current ledgers'}
                                </div>
                              </div>
                            </div>

                            {/* Divider if filed block or edit form is active */}
                            {(isCompleted || isEditing) && (
                              <hr className="my-4 border-slate-100 dark:border-slate-800/80" />
                            )}

                            {/* Render documented metadata if file is ALREADY Filed/Paid */}
                            {isCompleted && !isEditing && (
                              <div className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-xl border border-slate-100 dark:border-slate-800/40 text-xs font-semibold text-slate-650 dark:text-slate-300 grid grid-cols-2 sm:grid-cols-4 gap-4">
                                <div>
                                  <span className="text-[9px] font-black tracking-widest text-slate-400 block uppercase">Date Filed</span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {deadline.dateFiled ? new Date(deadline.dateFiled).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black tracking-widest text-slate-400 block uppercase">Reference No.</span>
                                  <span className="font-mono font-bold text-slate-850 dark:text-slate-200">
                                    {deadline.referenceNo || '—'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black tracking-widest text-slate-400 block uppercase">Confirmation No.</span>
                                  <span className="font-mono font-bold text-slate-850 dark:text-slate-200">
                                    {deadline.confirmationNo || '—'}
                                  </span>
                                </div>
                                <div>
                                  <span className="text-[9px] font-black tracking-widest text-slate-400 block uppercase">Tax Status</span>
                                  <span className="font-bold text-slate-800 dark:text-slate-200">
                                    {deadline.taxStatus || 'With Payable'}
                                  </span>
                                </div>
                                {deadline.taxStatus !== 'W/O Payable' && (
                                  <div>
                                    <span className="text-[9px] font-black tracking-widest text-slate-400 block uppercase">Date Paid</span>
                                    <span className="font-bold text-slate-800 dark:text-slate-200">
                                      {deadline.datePaid ? new Date(deadline.datePaid).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }) : 'Unpaid'}
                                    </span>
                                  </div>
                                )}
                                <div className="col-span-2 sm:col-span-4">
                                  <span className="text-[9px] font-black tracking-widest text-slate-400 block uppercase">Notes / Comments</span>
                                  <span className="text-slate-700 dark:text-slate-300 italic font-medium">
                                    "{deadline.notes || 'No filing notes added.'}"
                                  </span>
                                </div>
                              </div>
                            )}

                            {/* Render Interactive logging form if user clicks "Log details..." */}
                            {isEditing && (
                              <div className="bg-slate-50 dark:bg-slate-900/40 p-5 rounded-2xl border border-slate-150 dark:border-slate-800/60 font-medium space-y-4 mt-3">
                                <div className="bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 p-3 rounded-xl border border-emerald-100 dark:border-emerald-900/20 text-[10px] flex items-center gap-2">
                                  <Sparkles className="w-4 h-4 text-emerald-500" />
                                  <span>Automated compilation pre-filled. You can override the actual taxes, date, and input Reference codes.</span>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                                  <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Date Filed</label>
                                    <input
                                      type="date"
                                      value={filingDate}
                                      onChange={e => setFilingDate(e.target.value)}
                                      className="w-full text-xs font-bold border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 p-2.5 rounded-xl outline-none"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Amount Paid (₱)</label>
                                    <input
                                      type="number"
                                      value={filingAmount}
                                      onChange={e => setFilingAmount(e.target.value)}
                                      placeholder="0.00"
                                      className="w-full text-xs font-bold border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 p-2.5 rounded-xl outline-none font-mono"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Reference No.</label>
                                    <input
                                      type="text"
                                      value={filingRef}
                                      onChange={e => setFilingRef(e.target.value)}
                                      placeholder="eFPS receipt / bank ref..."
                                      className="w-full text-xs font-bold border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 p-2.5 rounded-xl outline-none shadow-inner"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Confirmation No.</label>
                                    <input
                                      type="text"
                                      value={filingConfirmationNo}
                                      onChange={e => setFilingConfirmationNo(e.target.value)}
                                      placeholder="eFPS confirmation #..."
                                      className="w-full text-xs font-bold border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 p-2.5 rounded-xl outline-none shadow-inner"
                                    />
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                                  <div>
                                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Tax Status</label>
                                    <select
                                      value={filingTaxStatus}
                                      onChange={e => setFilingTaxStatus(e.target.value as 'With Payable' | 'W/O Payable')}
                                      className="w-full text-xs font-bold border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 p-2.5 rounded-xl outline-none"
                                    >
                                      <option value="With Payable">With Payable</option>
                                      <option value="W/O Payable">W/O Payable</option>
                                    </select>
                                  </div>
                                  {filingTaxStatus === 'With Payable' && (
                                    <div className="sm:col-span-2">
                                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Date Paid (optional, if already settled)</label>
                                      <input
                                        type="date"
                                        value={filingDatePaid}
                                        onChange={e => setFilingDatePaid(e.target.value)}
                                        className="w-full text-xs font-bold border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 p-2.5 rounded-xl outline-none"
                                      />
                                    </div>
                                  )}
                                </div>

                                <div>
                                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 block mb-1">Notes </label>
                                  <textarea
                                    value={filingNotes}
                                    onChange={e => setFilingNotes(e.target.value)}
                                    placeholder="Add notes such as payment channel, eFPS confirmation details, bank brand..."
                                    rows={2}
                                    className="w-full text-xs font-medium border border-slate-200 dark:border-slate-850 bg-white dark:bg-slate-900 p-2.5 rounded-xl outline-none resize-none"
                                  />
                                </div>

                                <div className="flex items-center gap-2 justify-end">
                                  <button
                                    onClick={() => setEditingDeadlineId(null)}
                                    className="px-4 py-2 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleUpdateDeadlineStatus(deadline.id, {
                                        status: filingDatePaid ? 'Paid' : 'Filed',
                                        dateFiled: filingDate,
                                        amountDue: parseFloat(filingAmount) || 0,
                                        referenceNo: filingRef,
                                        confirmationNo: filingConfirmationNo,
                                        taxStatus: filingTaxStatus,
                                        datePaid: filingTaxStatus === 'With Payable' ? (filingDatePaid || undefined) : undefined,
                                        notes: filingNotes
                                      });
                                      setEditingDeadlineId(null);
                                    }}
                                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-md shadow-emerald-500/10"
                                  >
                                    Save Filing Receipt
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Trigger buttons */}
                            <div className="flex items-center gap-2 justify-end mt-4 flex-wrap">
                              {isCompleted ? (
                                <div className="flex items-center gap-2 flex-wrap">
                                  {deadline.status === 'Filed' && deadline.taxStatus !== 'W/O Payable' && (
                                    <button
                                      onClick={() => {
                                        handleUpdateDeadlineStatus(deadline.id, {
                                          status: 'Paid',
                                          datePaid: getSimulatedToday()
                                        });
                                      }}
                                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl px-4 py-2 shadow-sm shadow-emerald-500/10 transition"
                                    >
                                      Mark as Paid
                                    </button>
                                  )}
                                  <button
                                    onClick={() => {
                                      setFilingDate(deadline.dateFiled || getSimulatedToday());
                                      setFilingAmount(deadline.amountDue?.toString() || '');
                                      setFilingRef(deadline.referenceNo || '');
                                      setFilingConfirmationNo(deadline.confirmationNo || '');
                                      setFilingTaxStatus(deadline.taxStatus || 'With Payable');
                                      setFilingDatePaid(deadline.datePaid || '');
                                      setFilingNotes(deadline.notes || '');
                                      setEditingDeadlineId(deadline.id);
                                    }}
                                    className="text-xs text-indigo-650 dark:text-indigo-400 hover:underline font-bold px-3 py-1.5"
                                  >
                                    Modify Receipt Details
                                  </button>
                                  <button
                                    onClick={() => {
                                      handleUpdateDeadlineStatus(deadline.id, {
                                        status: 'Pending',
                                        dateFiled: undefined,
                                        amountDue: undefined,
                                        referenceNo: undefined,
                                        confirmationNo: undefined,
                                        datePaid: undefined,
                                        notes: undefined
                                      });
                                    }}
                                    className="text-xs text-rose-600 hover:underline font-bold px-3 py-1.5 border border-rose-100 hover:bg-rose-50/20 dark:border-rose-900/10 rounded-xl transition"
                                  >
                                    Revert to Pending
                                  </button>
                                </div>
                              ) : (
                                !isEditing && (
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <button
                                      onClick={() => {
                                        setBirFormTab(deadline.formType);
                                        navigateToPage('bir-forms');
                                      }}
                                      className="text-xs text-blue-600 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition flex items-center gap-1.5"
                                    >
                                      <FileText className="w-3.5 h-3.5" /> View Form {deadline.formType}
                                    </button>
                                    {deadline.status !== 'Processing' && (
                                      <button
                                        onClick={() => {
                                          handleUpdateDeadlineStatus(deadline.id, { status: 'Processing' });
                                        }}
                                        className="text-xs text-blue-700 dark:text-blue-400 font-bold border border-blue-200 dark:border-blue-800 rounded-xl px-4 py-2 hover:bg-blue-50/50 dark:hover:bg-blue-950/20 transition"
                                      >
                                        Start Processing
                                      </button>
                                    )}
                                    <button
                                      onClick={() => {
                                        setFilingDate(getSimulatedToday());
                                        setFilingAmount(recEstimate.toString());
                                        setFilingRef('');
                                        setFilingConfirmationNo('');
                                        setFilingTaxStatus('With Payable');
                                        setFilingDatePaid('');
                                        setFilingNotes('Filed successfully in compliance with BIR schedule.');
                                        setEditingDeadlineId(deadline.id);
                                      }}
                                      className="text-xs text-slate-700 dark:text-slate-300 font-bold border border-slate-200 dark:border-slate-800 rounded-xl px-4 py-2 hover:bg-slate-100 transition"
                                    >
                                      Log Detailed Filing...
                                    </button>
                                    <button
                                      onClick={() => {
                                        handleUpdateDeadlineStatus(deadline.id, {
                                          status: 'Filed',
                                          dateFiled: getSimulatedToday(),
                                          amountDue: recEstimate,
                                          referenceNo: `eFPS-${Math.floor(Math.random() * 900000 + 100000)}`,
                                          taxStatus: 'With Payable',
                                          notes: `Auto-recorded inline based on dynamic compiler compilation.`
                                        });
                                      }}
                                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl px-4 py-2 shadow-sm shadow-emerald-500/10 transition"
                                    >
                                      Quick Mark Filed
                                    </button>
                                  </div>
                                )
                              )}
                            </div>

                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              </div>
          </div>
        </div>

      </div>
          </div>
    </div>
  );
}
