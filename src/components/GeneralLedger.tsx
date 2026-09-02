import React, { useEffect, useMemo, useState } from 'react';
import { LineChart, Trash2, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { CoaAccount, GeneralLedgerAccount, GeneralLedgerEntry, Client, JournalEntry } from '../types';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA, getNormalSide } from './ChartOfAccounts';
import { DEFAULT_CRJ_COLUMNS } from './CashReceiptsJournal';
import { DEFAULT_CDJ_COLUMNS } from './CashDisbursementsJournal';
import { DEFAULT_PJ_COLUMNS } from './PurchasesJournal';
import { DEFAULT_GJ_COLUMNS } from './GeneralJournal';
import { supabase } from '../lib/supabase';
import { computeAutoPostings } from '../lib/glPosting';
import { cn } from '../lib/utils';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const dateRange = (month: number, year: number) => {
  const start = `${year}-${String(month).padStart(2,'0')}-01`;
  const endDate = new Date(Date.UTC(year, month, 1));
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth()+1).padStart(2,'0')}-01`;
  return { start, end };
};

const rowDate = (v: any) => v ? String(v).slice(0,10) : '';
const mapJournalEntry = (r:any): JournalEntry => ({ id: String(r.id), values: r.values || {}, auto: !!r.auto, autoSource: r.auto_source });

// GL is a period view. Keep the last successfully loaded period in memory so
// remounting/navigating back to the same period does not immediately re-read
// the same journal payload from Supabase. The cache is intentionally small and
// is replaced whenever a different client/period is loaded.
let glPeriodCache: { key: string; value: Record<string, GeneralLedgerEntry[]> } | null = null;

export function GeneralLedger() {
  const { currentClient, currentClientId, saveClient } = useAccounting();
  const [typeFilter, setTypeFilter] = useState('All');
  const [accountFilter, setAccountFilter] = useState('All');
  const [month, setMonth] = useState(new Date().getMonth()+1);
  const [year, setYear] = useState(new Date().getFullYear());
  const [autoEntries, setAutoEntries] = useState<Record<string, GeneralLedgerEntry[]>>({});
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    const loadLedgerPeriod = async () => {
      if (!currentClientId || !currentClient) return;
      const cacheKey = `${currentClientId}:${year}-${String(month).padStart(2,'0')}`;
      if (glPeriodCache?.key === cacheKey) {
        setLoadError(null);
        setAutoEntries(glPeriodCache.value);
        setLoading(false);
        return;
      }

      setLoading(true); setLoadError(null);
      const { start, end } = dateRange(month, year);
      try {
        const journalTypes = ['CRJ','CDJ','PJ','GJ'];
        // Request only fields consumed by the posting engine. In particular,
        // journal_entries does not need any duplicate metadata columns here;
        // the date predicate is applied in Postgres before the JSON payload is
        // sent to the browser.
        const [columnsRes, entriesRes, vouchersRes] = await Promise.all([
          supabase.from('journal_columns')
            .select('id,journal_type,name,type,category')
            .eq('client_id', currentClientId)
            .in('journal_type', journalTypes),
          supabase.from('journal_entries')
            .select('id,journal_type,values')
            .eq('client_id', currentClientId)
            .in('journal_type', journalTypes)
            .gte('values->>date', start)
            .lt('values->>date', end),
          supabase.from('journal_vouchers')
            .select('id,date,reference,memo')
            .eq('client_id', currentClientId)
            .gte('date', start)
            .lt('date', end)
            .order('date', { ascending: true })
        ]);
        if (columnsRes.error) throw columnsRes.error;
        if (entriesRes.error) throw entriesRes.error;
        if (vouchersRes.error) throw vouchersRes.error;
        if (cancelled) return;

        const voucherIds = (vouchersRes.data || []).map((v:any) => String(v.id));
        let voucherLines:any[] = [];
        if (voucherIds.length) {
          const linesRes = await supabase.from('journal_voucher_lines')
            .select('id,journal_voucher_id,account_id,account_name,debit,credit')
            .eq('client_id', currentClientId)
            .in('journal_voucher_id', voucherIds);
          if (linesRes.error) throw linesRes.error;
          voucherLines = linesRes.data || [];
        }
        if (cancelled) return;

        const rows = entriesRes.data || [];
        const byType = (type:string) => rows.filter((r:any) => r.journal_type === type).map(mapJournalEntry);
        const cols = columnsRes.data || [];
        const linesByVoucher = new Map<string, any[]>();
        voucherLines.forEach((l:any) => {
          const key = String(l.journal_voucher_id);
          const list = linesByVoucher.get(key) || [];
          list.push({ id:String(l.id), accountId:l.account_id || '', accountName:l.account_name || '', debit:Number(l.debit||0), credit:Number(l.credit||0) });
          linesByVoucher.set(key, list);
        });
        const vouchers = (vouchersRes.data || []).map((v:any) => ({
          id:String(v.id), date:rowDate(v.date), reference:v.reference || '', memo:v.memo || '',
          lines:linesByVoucher.get(String(v.id)) || []
        }));

        const filteredClient: Client = {
          ...currentClient,
          crjColumns: cols.filter((c:any)=>c.journal_type==='CRJ').map((c:any)=>({id:String(c.id),name:c.name,type:c.type,category:c.category,isSystem:false})),
          cdjColumns: cols.filter((c:any)=>c.journal_type==='CDJ').map((c:any)=>({id:String(c.id),name:c.name,type:c.type,category:c.category,isSystem:false})),
          pjColumns: cols.filter((c:any)=>c.journal_type==='PJ').map((c:any)=>({id:String(c.id),name:c.name,type:c.type,category:c.category,isSystem:false})),
          gjColumns: cols.filter((c:any)=>c.journal_type==='GJ').map((c:any)=>({id:String(c.id),name:c.name,type:c.type,category:c.category,isSystem:false})),
          crjEntries: byType('CRJ'), cdjEntries: byType('CDJ'), pjEntries: byType('PJ'), gjEntries: byType('GJ'),
          journalVouchers: vouchers,
        };
        const postings = computeAutoPostings(filteredClient);
        const next:Record<string,GeneralLedgerEntry[]> = {};
        postings.forEach(p => { (next[p.accountId] ||= []).push(p.entry); });
        Object.values(next).forEach(arr => arr.sort((a,b) => String(a.dateDr || a.dateCr).localeCompare(String(b.dateDr || b.dateCr))));
        glPeriodCache = { key: cacheKey, value: next };
        if (!cancelled) setAutoEntries(next);
      } catch (e:any) {
        console.error('General Ledger period load failed', e);
        if (!cancelled) { setAutoEntries({}); setLoadError(e?.message || 'Unable to load General Ledger data.'); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadLedgerPeriod();
    return () => { cancelled = true; };
  }, [currentClientId, month, year]);

  if (!currentClient || !currentClientId) return null;

  const storedAccounts = currentClient.glAccounts || [];
  const accounts: GeneralLedgerAccount[] = coaAccounts.map(coaAcct => {
    const existing = storedAccounts.find(g => g.accountId === coaAcct.id);
    const manualEntries = (existing?.entries || []).filter(e => !e.auto);
    return {
      id: coaAcct.id, accountTitle: coaAcct.name, accountId: coaAcct.id, accountType: coaAcct.type,
      entries: [...(autoEntries[coaAcct.id] || []), ...manualEntries],
      openingBalance: coaAcct.openingBalance, normalSide: coaAcct.normalSide || getNormalSide(coaAcct.type || '')
    };
  });

  const availableTypes = Array.from(new Set(coaAccounts.map(a=>a.type).filter(Boolean))).sort((a,b)=>String(a).localeCompare(String(b)));
  const filteredAccounts = accounts.filter(a =>
    (typeFilter === 'All' || (a.accountType||'').toLowerCase() === typeFilter.toLowerCase()) &&
    (accountFilter === 'All' || a.accountId === accountFilter)
  );

  const mutateEntries = (accountId:string, mutate:(entries:GeneralLedgerEntry[])=>GeneralLedgerEntry[]) => {
    const existing = storedAccounts.find(g=>g.accountId===accountId);
    const currentEntries = (existing?.entries || []).filter(e=>!e.auto);
    const updated = mutate(currentEntries);
    const acct = coaAccounts.find(a=>a.id===accountId);
    const updatedStored = existing
      ? storedAccounts.map(g=>g.accountId===accountId ? {...g, entries:[...(g.entries||[]).filter(e=>e.auto), ...updated]} : g)
      : [...storedAccounts, { id:accountId, accountTitle:acct?.name||'', accountId, accountType:acct?.type, entries:updated }];
    saveClient(currentClientId, {...currentClient, glAccounts:updatedStored});
  };

  const toggleAccount=(id:string)=>setExpandedAccounts(p=>({...p,[id]:!p[id]}));
  const clearEntries=(accountId:string,title:string)=>{
    if(confirm(`Clear all manually-entered entries for "${title}"? Entries auto-posted from the source journals are not affected.`)) mutateEntries(accountId,()=>[]);
  };

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
                <option value="All">All Accounts</option>{coaAccounts.map(a=><option key={a.id} value={a.id}>{a.id} — {a.name}</option>)}
              </select>
            </div>
            {availableTypes.length>1 && <div><label className="block text-xs font-semibold text-slate-500 mb-1">Type</label><select value={typeFilter} onChange={e=>setTypeFilter(e.target.value)} className="form-input text-sm py-2"><option value="All">All Types</option>{availableTypes.map(t=><option key={t} value={t}>{t}</option>)}</select></div>}
            {loading && <div className="flex items-center gap-2 text-sm text-slate-500 mt-5"><Loader2 className="w-4 h-4 animate-spin"/>Loading period…</div>}
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">Only General Ledger source entries for <b>{MONTHS[month-1]} {year}</b> are retrieved. Select an account to focus the ledger on one account.</p>
          {loadError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-3">{loadError}</div>}
        </div>

        <div className="space-y-6">
          {filteredAccounts.map(account=>{
            const isExpanded=expandedAccounts[account.id]??true;
            const opening=Number(account.openingBalance)||0; const openingDebit=account.normalSide!=='credit';
            let totalDr=openingDebit?opening:0,totalCr=openingDebit?0:opening;
            account.entries.forEach(e=>{const d=parseFloat(String(e.debit||'').replace(/,/g,''));const c=parseFloat(String(e.credit||'').replace(/,/g,''));if(Number.isFinite(d))totalDr+=d;if(Number.isFinite(c))totalCr+=c;});
            const balance=totalDr-totalCr;
            return <div key={account.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
              <div className="bg-slate-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center cursor-pointer border-b border-slate-200 dark:border-slate-700" onClick={()=>toggleAccount(account.id)}>
                <div className="flex items-center gap-2"><h3 className="font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase text-sm">{account.accountTitle}</h3>{account.accountType&&<span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 rounded uppercase tracking-wide">{account.accountType}</span>}</div>
                <div className="flex items-center gap-4"><span className="text-xs font-bold px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">Bal: ₱ {Math.abs(balance).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}{balance<0?' Cr':' Dr'}</span>{account.entries.some(e=>!e.auto)&&<button onClick={e=>{e.stopPropagation();clearEntries(account.accountId!,account.accountTitle)}} className="text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>}{isExpanded?<ChevronUp className="w-5 h-5 text-slate-400"/>:<ChevronDown className="w-5 h-5 text-slate-400"/>}</div>
              </div>
              {isExpanded&&<div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs uppercase text-slate-500 bg-slate-50 dark:bg-slate-950"><th className="px-4 py-2">Date</th><th className="px-4 py-2">Particulars</th><th className="px-4 py-2">PR</th><th className="px-4 py-2 text-right">Debit</th><th className="px-4 py-2 text-right">Credit</th><th className="px-4 py-2">Source</th></tr></thead><tbody>
                {account.entries.map(e=><tr key={e.id} className="border-t border-slate-100 dark:border-slate-800"><td className="px-4 py-2">{e.dateDr||e.dateCr}</td><td className="px-4 py-2">{e.particularsDr||e.particularsCr}</td><td className="px-4 py-2">{e.refDr||e.refCr}</td><td className="px-4 py-2 text-right">{e.debit||''}</td><td className="px-4 py-2 text-right">{e.credit||''}</td><td className="px-4 py-2">{e.auto?<span className="text-cyan-600 font-semibold">Auto</span>:'Manual'}</td></tr>)}
                {!account.entries.length&&<tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No ledger entries for this period.</td></tr>}
              </tbody></table></div>}
            </div>;
          })}
          {!filteredAccounts.length&&<div className="text-center text-slate-400 py-12">No accounts match the selected filters.</div>}
        </div>
      </div>
    </div>
  );
}
