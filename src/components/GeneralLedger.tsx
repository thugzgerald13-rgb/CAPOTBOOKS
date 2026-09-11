
import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { GeneralLedgerAccount, GeneralLedgerEntry } from '../types';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA, getNormalSide } from './ChartOfAccounts';
import { supabase } from '../lib/supabase';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const dateRange = (month: number, year: number) => {
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth()+1).padStart(2,'0')}-01`;
  return { start, end };
};

const formatAmount = (n: number) => Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const entryDate = (entry: GeneralLedgerEntry) => String(entry.dateDr || entry.dateCr || '').slice(0, 10);

const numberValue = (value: unknown) => {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

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
      : (currentClient.coaFormat === 'alphanumeric' ? DEFAULT_ACCOUNTS_ALPHA : DEFAULT_ACCOUNTS);
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
    let cancelled = false;
    const loadLedger = async () => {
      if (!currentClientId || !accountFilter) {
        setLedgerEntries([]);
        setBeginningBalance(0);
        return;
      }

      setLoading(true);
      setLoadError(null);
      setUsingFallback(false);
      const { start, end } = dateRange(month, year);

      try {
        const [entriesRes, balancesRes] = await Promise.all([
          supabase.rpc('get_server_general_ledger_entries', {
            p_client_id: currentClientId,
            p_account_id: accountFilter,
            p_start_date: start,
            p_end_date: end,
          }),
          supabase.rpc('get_server_account_balances', {
            p_client_id: currentClientId,
            p_start_date: start,
            p_end_date: end,
          }),
        ]);

        if (entriesRes.error) throw entriesRes.error;
        if (balancesRes.error) throw balancesRes.error;
        if (cancelled) return;

        const balanceRow = (balancesRes.data || []).find((r:any) => String(r.account_id) === String(accountFilter));
        const rows = entriesRes.data || [];
        const prior = rows.length ? Number(rows[0].beginning_balance || 0) :
          balanceRow ? Number(balanceRow.balance || 0) - Number(balanceRow.period_balance || 0) : 0;

        const mapped: GeneralLedgerEntry[] = rows.map((r:any) => ({
          id: String(r.entry_id),
          dateDr: Number(r.debit || 0) > 0 ? String(r.entry_date || '') : '',
          particularsDr: Number(r.debit || 0) > 0 ? String(r.particulars || '') : '',
          refDr: Number(r.debit || 0) > 0 ? String(r.pr || '') : '',
          debit: Number(r.debit || 0) > 0 ? formatAmount(Number(r.debit || 0)) : '',
          dateCr: Number(r.credit || 0) > 0 ? String(r.entry_date || '') : '',
          particularsCr: Number(r.credit || 0) > 0 ? String(r.particulars || '') : '',
          refCr: Number(r.credit || 0) > 0 ? String(r.pr || '') : '',
          credit: Number(r.credit || 0) > 0 ? formatAmount(Number(r.credit || 0)) : '',
          auto: true,
          autoSource: String(r.source || ''),
        }));

        setBeginningBalance(prior);
        setLedgerEntries(mapped);
        setUsingFallback(false);
      } catch (e:any) {
        // The PostgreSQL ledger RPC is authoritative when available. If the
        // deployed database function has a parameter/typing mismatch, keep the
        // GL usable by falling back to the already-normalized client GL that
        // AccountingContext derives from the same tenant-scoped source rows.
        // This is intentionally read-only: no fallback data is written back to
        // Supabase and no legacy clients.data payload is consulted.
        console.error('General Ledger server load failed; using normalized local fallback', e);
        if (!cancelled) {
          const selected = (currentClient?.glAccounts || []).find((account: GeneralLedgerAccount) =>
            String(account.accountId) === String(accountFilter)
          );
          if (selected) {
            const periodRows = (selected.entries || []).filter((entry: GeneralLedgerEntry) => {
              const d = entryDate(entry);
              return d >= start && d < end;
            });

            const priorRows = (selected.entries || []).filter((entry: GeneralLedgerEntry) => {
              const d = entryDate(entry);
              return Boolean(d) && d < start;
            });

            const opening = numberValue(selected.openingBalance);
            const priorActivity = priorRows.reduce((total, entry) =>
              total + numberValue(entry.debit) - numberValue(entry.credit), 0
            );

            setBeginningBalance(opening + priorActivity);
            setLedgerEntries(periodRows);
            setLoadError(null);
            setUsingFallback(true);
          } else {
            setLedgerEntries([]);
            setBeginningBalance(0);
            setUsingFallback(false);
            setLoadError(e?.message || 'Unable to load General Ledger data.');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadLedger();
    return () => { cancelled = true; };
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
    <div className="w-full flex flex-col">
      <PageHeader title="General Ledger" icon={<LineChart />} />
      <div className="p-4 md:p-6 flex-1">
        <div className="flex flex-col gap-4 mb-6">
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
          <p className="text-sm text-slate-500 dark:text-slate-400">Only the selected account's General Ledger entries for <b>{MONTHS[month-1]} {year}</b> are retrieved from PostgreSQL.</p>
          {usingFallback && !loadError && <div className="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg px-3 py-2">Server ledger query unavailable — showing the in-app computed ledger (fully functional). Deploy the <code>get_server_general_ledger_entries</code>/<code>get_server_account_balances</code> PostgreSQL functions to enable server-side aggregation.</div>}
          {loadError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">{loadError}</div>}
        </div>

        <div className="space-y-6">
          {filteredAccounts.map(account=>{
            const isExpanded=expandedAccounts[account.id]??true;
            const opening = accountFilter === account.accountId ? beginningBalance : 0;
            const totalDr = (opening > 0 ? opening : 0) + account.entries.reduce((n,e)=>n + (parseFloat(String(e.debit||'').replace(/,/g,'')) || 0),0);
            const totalCr = (opening < 0 ? Math.abs(opening) : 0) + account.entries.reduce((n,e)=>n + (parseFloat(String(e.credit||'').replace(/,/g,'')) || 0),0);
            const balance=totalDr-totalCr;
            return <div key={account.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center cursor-pointer border-b border-slate-200 dark:border-slate-700" onClick={()=>toggleAccount(account.id)}>
                <div className="flex items-center gap-2"><h3 className="font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase text-sm">{account.accountTitle}</h3>{account.accountType&&<span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 rounded uppercase tracking-wide">{account.accountType}</span>}</div>
                <div className="flex items-center gap-4">{isExpanded?<ChevronUp className="w-5 h-5 text-slate-400"/>:<ChevronDown className="w-5 h-5 text-slate-400"/>}</div>
              </div>
              {isExpanded&&<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500 bg-slate-50 dark:bg-slate-950"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Particulars</th><th className="px-4 py-2">PR</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-4 py-2 text-right whitespace-nowrap">Balance</th></tr></thead><tbody>
                {(() => {
                  let runningBalance = opening;
                  return account.entries.map(e => {
                    const debit = parseFloat(String(e.debit || '').replace(/,/g, '')) || 0;
                    const credit = parseFloat(String(e.credit || '').replace(/,/g, '')) || 0;
                    runningBalance += debit - credit;
                    return <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-4 py-2">{e.dateDr||e.dateCr}</td><td className="px-4 py-2">{e.particularsDr||e.particularsCr}</td><td className="px-4 py-2">{e.refDr||e.refCr}</td><td className="px-4 py-2 text-right">{e.debit||''}</td><td className="px-4 py-2 text-right">{e.credit||''}</td><td className="px-4 py-2 text-right font-semibold whitespace-nowrap">{runningBalance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>;
                  });
                })()}
                {!account.entries.length&&<tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No ledger entries for this period.</td></tr>}
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950"><td colSpan={5} className="px-4 py-3 text-right font-bold">Ending Balance</td><td className="px-4 py-3 text-right font-bold whitespace-nowrap">{balance.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}</td></tr>
              </tbody></table></div>}
            </div>;
          })}
          {!filteredAccounts.length&&<div className="text-center text-slate-400 py-12">No accounts match the selected filters.</div>}
        </div>
      </div>
    </div>
  );
}

