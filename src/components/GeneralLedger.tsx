
import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, ChevronDown, ChevronUp, Loader2, Printer, FileDown } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { GeneralLedgerAccount, GeneralLedgerEntry } from '../types';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA, getNormalSide } from './ChartOfAccounts';
import { getDefaultAccountsForIndustry } from '../lib/journalDefaults';
import { supabase } from '../lib/supabase';
import { generateCSV } from '../lib/utils';
import { glAccountBalanceBefore } from '../lib/accountingBalances';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const dateRange = (month: number, year: number) => {
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth()+1).padStart(2,'0')}-01`;
  return { start, end };
};

const formatAmount = (n: number) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Debit balances are shown as positive, credit balances as negative — no "Dr"/"Cr" suffix.
const formatBalance = (n: number) => {
  const formatted = Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `-${formatted}` : formatted;
};

const entryDate = (entry: GeneralLedgerEntry) => String(entry.dateDr || entry.dateCr || '').slice(0, 10);

export function GeneralLedger() {
  const { currentClient, currentClientId } = useAccounting();
  const [typeFilter, setTypeFilter] = useState('All');
  const [accountFilter, setAccountFilter] = useState('');
  const [month, setMonth] = useState(new Date().getMonth()+1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [ledgerEntries, setLedgerEntries] = useState<GeneralLedgerEntry[]>([]);
  const [beginningBalance, setBeginningBalance] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  // The PostgreSQL ledger RPCs are an optional optimization. When they are
  // not deployed (or unreachable), the GL falls back to the in-app computed
  // glAccounts — that is a normal, fully-functional state, not an error, so
  // it is surfaced as a quiet amber notice instead of a red error banner.
  const [usingFallback, setUsingFallback] = useState(false);
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});

  const coaAccounts = useMemo(() => {
    if (!currentClient) return [];
    const list = currentClient.accounts && currentClient.accounts.length > 0
      ? currentClient.accounts
      : getDefaultAccountsForIndustry(currentClient.industry, currentClient.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric');
    return list.filter(a => !a.hidden);
  }, [currentClient]);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({length: 11}, (_,i) => now + 2 - i);
  }, []);

  // The GL deliberately defaults to one account. This is the important lazy
  // loading boundary: PostgreSQL aggregates only the selected account/period;
  // the browser never downloads the other accounts' transaction rows.
  useEffect(() => {
    if (!accountFilter && coaAccounts.length) setAccountFilter(coaAccounts[0].id);
    if (accountFilter && !coaAccounts.some(a => a.id === accountFilter)) {
      setAccountFilter(coaAccounts[0]?.id || '');
    }
  }, [coaAccounts, accountFilter]);

  useEffect(() => {
    // The General Ledger must agree exactly with the books of original entry
    // shown in the UI. In particular, cash disbursements must come from the
    // synchronized CDJ rows — not from a broader/legacy server-side join that
    // can include transactions which are no longer present in the CDJ.
    // `currentClient.glAccounts` is already rebuilt by syncGeneralLedger from
    // CRJ/CDJ/PJ/SJ/GJ, with CDJ source rows synchronized first.
    if (!currentClientId || !accountFilter) {
      setLedgerEntries([]);
      setBeginningBalance(0);
      setLoadError(null);
      setUsingFallback(false);
      return;
    }

    const { start, end } = dateRange(month, year);
    const selected = (currentClient.glAccounts || []).find((account: GeneralLedgerAccount) =>
      String(account.accountId) === String(accountFilter)
    );

    if (!selected) {
      setLedgerEntries([]);
      setBeginningBalance(0);
      setLoadError(null);
      setUsingFallback(false);
      return;
    }

    const allEntries = selected.entries || [];
    const periodRows = allEntries.filter((entry: GeneralLedgerEntry) => {
      const d = entryDate(entry);
      return d >= start && d < end;
    });

    // Shared with the Profit & Loss report / Dashboard so every page agrees
    // on the exact same account balance formula.
    setBeginningBalance(glAccountBalanceBefore(selected, start));
    setLedgerEntries(periodRows);
    setLoadError(null);
    setUsingFallback(false);
    setLoading(false);
  }, [currentClientId, currentClient, accountFilter, month, year]);

  if (!currentClient || !currentClientId) return null;

  const selectedCoa = coaAccounts.find(a => a.id === accountFilter);
  const selectedAccount: GeneralLedgerAccount | null = selectedCoa ? {
    id: selectedCoa.id,
    accountTitle: selectedCoa.name,
    accountId: selectedCoa.id,
    accountType: selectedCoa.type,
    entries: ledgerEntries,
    openingBalance: selectedCoa.openingBalance,
    normalSide: selectedCoa.normalSide || getNormalSide(selectedCoa.type || '')
  } : null;

  const availableTypes = Array.from(new Set(coaAccounts.map(a=>a.type).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b)));

  const filteredAccounts = selectedAccount &&
    (typeFilter === 'All' || (selectedAccount.accountType||'').toLowerCase() === typeFilter.toLowerCase())
    ? [selectedAccount]
    : [];

  const toggleAccount=(id:string)=>setExpandedAccounts(p=>({...p,[id]:!p[id]}));

  return (
    <div className="w-full flex flex-col print-area">
      <PageHeader title="General Ledger" icon={<LineChart />} actions={
        <div className="flex items-center gap-2 no-print">
          <button type="button" onClick={() => generateCSV('general-ledger.csv', ledgerEntries.length ? [Object.keys(ledgerEntries[0] as any), ...ledgerEntries.map(e => Object.values(e as any))] : [['No entries']])} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors" title="Export to CSV">
            <FileDown className="w-4 h-4" /> Export
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity" title="Print General Ledger">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      } />
      <div className="p-4 md:p-6 flex-1">
        <div className="no-print flex flex-col gap-4 mb-6">
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Period</label>
              <div className="flex gap-2">
                <select value={month} onChange={e=>setMonth(Number(e.target.value))} className="form-input text-sm py-2">{MONTHS.map((m,i)=><option key={m} value={i+1}>{m}</option>)}</select>
                <select value={year} onChange={e=>setYear(Number(e.target.value))} className="form-input text-sm py-2">{years.map(y=><option key={y} value={y}>{y}</option>)}</select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1">Account</label>
              <select value={accountFilter} onChange={e=>setAccountFilter(e.target.value)} className="form-input text-sm py-2 min-w-[220px]">
                <option value="">Select Account</option>{coaAccounts.map(a=><option key={a.id} value={a.id}>{a.id} — {a.name}</option>)}
              </select>
            </div>
            {availableTypes.length>1 && <div><label className="block text-xs font-semibold text-slate-500 mb-1">Type</label><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="form-input text-sm py-2"><option value="All">All Types</option>{availableTypes.map(t=><option key={t} value={t}>{t}</option>)}</select></div>}
            {loading && <div className="flex items-center gap-2 text-sm text-slate-500 mt-5"><Loader2 className="w-4 h-4 animate-spin"/>Loading selected account…</div>}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Only the selected account's General Ledger entries for <b>{MONTHS[month-1]} {year}</b> are shown from the synchronized books of original entry.</p>
          {loadError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">{loadError}</div>}
        </div>

        <div className="space-y-6">
          {filteredAccounts.map(account=>{
            const isExpanded=expandedAccounts[account.id]??true;
            const opening = accountFilter === account.accountId ? beginningBalance : 0;
            const endingBalance = opening + account.entries.reduce((n,e)=>
              n + (parseFloat(String(e.debit||'').replace(/,/g,'')) || 0) - (parseFloat(String(e.credit||'').replace(/,/g,'')) || 0)
            ,0);
            return <div key={account.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center cursor-pointer border-b border-slate-200 dark:border-slate-700" onClick={()=>toggleAccount(account.id)}>
                <div className="flex items-center gap-2"><h3 className="font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase text-sm">{account.accountTitle}</h3>{account.accountType&&<span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 rounded uppercase tracking-wide">{account.accountType}</span>}</div>
                <div className="flex items-center gap-4">{isExpanded?<ChevronUp className="w-5 h-5 text-slate-400"/>:<ChevronDown className="w-5 h-5 text-slate-400"/>}</div>
              </div>
              {isExpanded&&<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500 bg-slate-50 dark:bg-slate-950"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Particulars</th><th className="px-4 py-2">PR</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-4 py-2 text-right whitespace-nowrap">Balance</th></tr></thead><tbody>
                <tr className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 italic">
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 font-medium">Beginning Balance</td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-right"></td>
                  <td className="px-4 py-2 text-right"></td>
                  <td className="px-4 py-2 text-right font-semibold whitespace-nowrap">{formatBalance(opening)}</td>
                </tr>
                {(() => {
                  let runningBalance = opening;
                  return account.entries.map(e => {
                    const debit = parseFloat(String(e.debit || '').replace(/,/g, '')) || 0;
                    const credit = parseFloat(String(e.credit || '').replace(/,/g, '')) || 0;
                    runningBalance += debit - credit;
                    return <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-4 py-2">{e.dateDr||e.dateCr}</td><td className="px-4 py-2">{e.particularsDr||e.particularsCr}</td><td className="px-4 py-2">{e.refDr||e.refCr}</td><td className="px-4 py-2 text-right">{e.debit||''}</td><td className="px-4 py-2 text-right">{e.credit||''}</td><td className="px-4 py-2 text-right font-semibold whitespace-nowrap">{formatBalance(runningBalance)}</td></tr>;
                  });
                })()}
                {!account.entries.length&&<tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">No ledger entries for this period.</td></tr>}
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 font-semibold">
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2">Ending Balance</td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2 text-right"></td>
                  <td className="px-4 py-2 text-right"></td>
                  <td className="px-4 py-2 text-right whitespace-nowrap">{formatBalance(endingBalance)}</td>
                </tr>
              </tbody></table></div>}
            </div>;
          })}
          {!filteredAccounts.length&&<div className="text-center text-slate-400 py-12">No accounts match the selected filters.</div>}
        </div>
      </div>
    </div>
  );
}

