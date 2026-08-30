import React, { useMemo, useState } from 'react';
import { LineChart, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { CoaAccount, GeneralLedgerAccount, GeneralLedgerEntry } from '../types';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA, getNormalSide } from './ChartOfAccounts';
import { cn } from '../lib/utils';
import { getRunningBalances, formatAccountAmount } from '../lib/accountingBalances';

export function GeneralLedger() {
  const { currentClient, currentClientId, saveClient } = useAccounting();

  const [typeFilter, setTypeFilter] = useState('All');
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});

  const storedAccounts = currentClient?.glAccounts || [];

  // Source of truth is the Chart of Accounts — every account title added there
  // (of any Account Type: Asset, Liabilities, Equity, Revenue, Costs, Expense,
  // or any custom type) automatically appears here, with no manual add step.
  //
  // NOTE: these useMemo hooks must run on every render (never after an early
  // `return`) or React throws "Rendered more/fewer hooks than during the
  // previous render" the moment currentClient toggles between null/defined.
  const coaAccounts = useMemo(() => {
    if (!currentClient) return [];
    const list = currentClient.accounts && currentClient.accounts.length > 0
      ? currentClient.accounts
      : (currentClient.coaFormat === 'alphanumeric' ? DEFAULT_ACCOUNTS_ALPHA : DEFAULT_ACCOUNTS);
    return list.filter(a => !a.hidden);
  }, [currentClient]);

  // Merge: one ledger row per Chart of Accounts entry, keyed by account code
  // (accountId). Title/Type always reflect the current CoA data (so renames in
  // the CoA show up here immediately); entries are pulled from whatever's been
  // saved for that account so far.
  const accounts: GeneralLedgerAccount[] = useMemo(() => {
    return coaAccounts.map(coaAcct => {
      const existing = storedAccounts.find(g => g.accountId === coaAcct.id);
      return {
        id: coaAcct.id,
        accountTitle: coaAcct.name,
        accountId: coaAcct.id,
        accountType: coaAcct.type,
        entries: existing?.entries || [],
        // Opening balance flows live from the Chart of Accounts — it becomes
        // this account's beginning balance in the ledger.
        openingBalance: coaAcct.openingBalance,
        normalSide: coaAcct.normalSide || getNormalSide(coaAcct.type || '')
      };
    });
  }, [coaAccounts, storedAccounts]);

  // Distinct Account Types present in the Chart of Accounts, used to build the
  // Type filter below so every type in the CoA is browsable here too.
  const availableTypes = useMemo(() => {
    const types = coaAccounts.map(a => a.type).filter((t): t is string => !!t && t.trim() !== '');
    return Array.from(new Set(types)).sort((a, b) => a.localeCompare(b));
  }, [coaAccounts]);

  if (!currentClient || !currentClientId) return null;

  const filteredAccounts = typeFilter === 'All'
    ? accounts
    : accounts.filter(a => (a.accountType || '').toLowerCase() === typeFilter.toLowerCase());

  // Applies a mutation to one account's entries and persists the full set,
  // creating a storage record for that Chart of Accounts entry on first write.
  const mutateEntries = (accountId: string, mutate: (entries: GeneralLedgerEntry[]) => GeneralLedgerEntry[]) => {
    const coaAcct = coaAccounts.find(a => a.id === accountId);
    const existing = storedAccounts.find(g => g.accountId === accountId);
    const currentEntries = existing?.entries || [];
    const updatedEntries = mutate(currentEntries);

    let updatedStored: GeneralLedgerAccount[];
    if (existing) {
      updatedStored = storedAccounts.map(g => g.accountId === accountId ? { ...g, entries: updatedEntries } : g);
    } else {
      updatedStored = [...storedAccounts, {
        id: accountId,
        accountTitle: coaAcct?.name || '',
        accountId,
        accountType: coaAcct?.type,
        entries: updatedEntries
      }];
    }
    saveClient(currentClientId, { ...currentClient, glAccounts: updatedStored });
  };

  const addEntry = (accountId: string) => {
    mutateEntries(accountId, entries => [
      ...entries,
      {
        id: crypto.randomUUID(),
        dateDr: '', particularsDr: '', refDr: '', debit: '',
        dateCr: '', particularsCr: '', refCr: '', credit: ''
      }
    ]);
  };

  const updateEntry = (accountId: string, entryId: string, field: keyof GeneralLedgerEntry, value: string) => {
    mutateEntries(accountId, entries => entries.map(e => e.id === entryId ? { ...e, [field]: value } : e));
  };

  const deleteEntry = (accountId: string, entryId: string) => {
    mutateEntries(accountId, entries => entries.filter(e => e.id !== entryId));
  };

  const clearEntries = (accountId: string, accountTitle: string) => {
    if (confirm(`Clear all manually-entered entries for "${accountTitle}"? Entries auto-posted from the CRJ/CDJ/PJ, Purchases, or Journal Vouchers aren't affected — edit those at the source instead.`)) {
      // Auto-posted rows aren't user data — they're regenerated from their
      // source journal every time — so only manual entries are removed here.
      mutateEntries(accountId, entries => entries.filter(e => e.auto));
    }
  };

  const toggleAccount = (id: string) => {
    setExpandedAccounts(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="General Ledger" icon={<LineChart />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-6">
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 mb-6">
          <p className="text-slate-500 dark:text-slate-400">Ledger accounts mirror your Chart of Accounts automatically — add an account there and it appears here. Entries tagged <span className="font-bold text-cyan-600 dark:text-cyan-400">Auto</span> are posted automatically from the Cash Receipts/Disbursements Journals, Purchases Journal, Purchases, and Journal Vouchers; add rows manually for anything else.</p>
          {availableTypes.length > 1 && (
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="form-input text-sm py-2"
              title="Filter by Account Type"
            >
              <option value="All">All Types</option>
              {availableTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>

        <div className="space-y-6">
          {filteredAccounts.map(account => {
            const isExpanded = expandedAccounts[account.id] ?? true;
            
            // Beginning balance comes straight from the Chart of Accounts' opening
            // balance, placed on the account's normal side (debit or credit).
            const openingBalance = account.openingBalance || 0;
            const openingIsDebit = account.normalSide !== 'credit';

            // Calculate ending balance, starting from the beginning balance
            let totalDr = openingIsDebit ? openingBalance : 0;
            let totalCr = openingIsDebit ? 0 : openingBalance;
            account.entries.forEach(e => {
              const d = parseFloat(e.debit.replace(/,/g, ''));
              if (!isNaN(d)) totalDr += d;
              const c = parseFloat(e.credit.replace(/,/g, ''));
              if (!isNaN(c)) totalCr += c;
            });
            
            const balance = totalDr - totalCr;

            // Running balance per row, including entries auto-posted from the
            // Cash Receipts/Disbursements Journals, Purchases Journal,
            // Purchases module, and Journal Vouchers (see src/lib/glPosting.ts).
            const runningBalances = getRunningBalances(currentClient, {
              id: account.accountId || account.id,
              name: account.accountTitle,
              type: account.accountType || '',
              normalSide: account.normalSide,
              openingBalance: account.openingBalance,
            } as CoaAccount);

            return (
              <div key={account.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
                <div 
                  className="bg-slate-100 dark:bg-slate-800 px-4 py-3 flex justify-between items-center cursor-pointer border-b border-slate-200 dark:border-slate-700"
                  onClick={() => toggleAccount(account.id)}
                >
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-slate-800 dark:text-slate-200 tracking-wider uppercase text-sm">
                      {account.accountTitle}
                    </h3>
                    {account.accountType && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 rounded uppercase tracking-wide">
                        {account.accountType}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="text-xs font-bold px-2 py-1 bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded">
                      Bal: ₱ {balance >= 0 ? balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : `(${(balance * -1).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`}
                    </span>
                    {account.entries.some(e => !e.auto) && (
                      <button 
                        onClick={(e) => { e.stopPropagation(); clearEntries(account.accountId!, account.accountTitle); }}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                        title="Clear manually-entered entries"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left whitespace-nowrap min-w-[850px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-bold">
                          <th rowSpan={2} className="px-3 py-2 w-10 border-b border-r border-slate-200 dark:border-slate-700 text-center">#</th>
                          <th rowSpan={2} className="px-3 py-2 border-b border-r border-slate-200 dark:border-slate-700 w-28">DATE</th>
                          <th rowSpan={2} className="px-3 py-2 border-b border-r border-slate-200 dark:border-slate-700 min-w-[260px]">PARTICULARS / EXPLANATION</th>
                          <th rowSpan={2} className="px-3 py-2 border-b border-r border-slate-200 dark:border-slate-700 w-28">POSTING REF. (PR)</th>
                          <th rowSpan={2} className="px-3 py-2 border-b border-r border-slate-200 dark:border-slate-700 text-right w-28">DEBIT</th>
                          <th rowSpan={2} className="px-3 py-2 border-b border-r border-slate-200 dark:border-slate-700 text-right w-28">CREDIT</th>
                          <th colSpan={2} className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-center">BALANCE</th>
                          <th rowSpan={2} className="px-2 py-2 border-b border-slate-200 dark:border-slate-700 w-10 text-center"></th>
                        </tr>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-bold">
                          <th className="px-3 py-1.5 border-b border-r border-slate-200 dark:border-slate-700 text-right w-28">DEBIT</th>
                          <th className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-700 text-right w-28">CREDIT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        {openingBalance !== 0 && (
                          <tr className="bg-slate-50 dark:bg-slate-800/30 font-semibold text-slate-600 dark:text-slate-300">
                            <td className="px-3 py-1.5 text-center text-slate-400 font-mono border-r border-slate-200 dark:border-slate-700">—</td>
                            <td className="px-2 py-1.5 border-r border-slate-100 dark:border-slate-800"></td>
                            <td className="px-2 py-1.5 border-r border-slate-100 dark:border-slate-800 italic">Beginning Balance</td>
                            <td className="px-2 py-1.5 border-r border-slate-100 dark:border-slate-800"></td>
                            <td className="px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 text-right font-mono">
                              {openingIsDebit ? openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                            </td>
                            <td className="px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 text-right font-mono">
                              {!openingIsDebit ? openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                            </td>
                            <td className="px-2 py-1.5 border-r border-slate-200 dark:border-slate-700 text-right font-mono">
                              {openingIsDebit ? openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                            </td>
                            <td className="px-2 py-1.5 text-right font-mono">
                              {!openingIsDebit ? openingBalance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}
                            </td>
                            <td></td>
                          </tr>
                        )}
                        {account.entries.map((entry, idx) => {
                          const running = runningBalances[idx]?.balance ?? 0;
                          const isAuto = !!entry.auto;
                          const date = entry.dateDr || entry.dateCr || '';
                          const particulars = entry.particularsDr || entry.particularsCr || '';
                          const postingRef = entry.refDr || entry.refCr || '';
                          const inputCls = cn(
                            "w-full bg-transparent border border-transparent rounded px-2 py-1 transition-all outline-none",
                            isAuto
                              ? "text-slate-500 dark:text-slate-400 cursor-default"
                              : "hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                          );
                          const debit = parseFloat((entry.debit || '').replace(/,/g, '')) || 0;
                          const credit = parseFloat((entry.credit || '').replace(/,/g, '')) || 0;
                          const balanceDebit = running >= 0 ? running : 0;
                          const balanceCredit = running < 0 ? Math.abs(running) : 0;
                          return (
                            <tr key={entry.id} className={cn("group", isAuto ? "bg-cyan-50/40 dark:bg-cyan-950/10" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20")}>
                              <td className="px-3 py-1.5 text-center text-slate-400 font-mono border-r border-slate-200 dark:border-slate-700">{idx + 1}</td>
                              <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-800">
                                <input type="text" readOnly={isAuto} value={date}
                                  onChange={e => updateEntry(account.accountId!, entry.id, entry.dateDr ? 'dateDr' : 'dateCr', e.target.value)}
                                  className={inputCls} />
                              </td>
                              <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-800">
                                <input type="text" readOnly={isAuto} value={particulars}
                                  onChange={e => updateEntry(account.accountId!, entry.id, entry.particularsDr ? 'particularsDr' : 'particularsCr', e.target.value)}
                                  title={isAuto ? `Auto-posted from ${entry.autoSource}` : undefined}
                                  className={inputCls} />
                              </td>
                              <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-800">
                                <input type="text" readOnly={isAuto} value={postingRef}
                                  onChange={e => updateEntry(account.accountId!, entry.id, entry.refDr ? 'refDr' : 'refCr', e.target.value)}
                                  className={inputCls} />
                              </td>
                              <td className="px-2 py-1 border-r border-slate-200 dark:border-slate-700 text-right">
                                <input type="text" readOnly={isAuto} value={entry.debit}
                                  onChange={e => { if (/^[0-9.,-]*$/.test(e.target.value)) updateEntry(account.accountId!, entry.id, 'debit', e.target.value); }}
                                  onBlur={e => { const raw = e.target.value.replace(/,/g, ''); if (raw && !isNaN(parseFloat(raw))) updateEntry(account.accountId!, entry.id, 'debit', parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }}
                                  className={cn(inputCls, "text-right font-mono")} placeholder="0.00" />
                              </td>
                              <td className="px-2 py-1 border-r border-slate-200 dark:border-slate-700 text-right">
                                <input type="text" readOnly={isAuto} value={entry.credit}
                                  onChange={e => { if (/^[0-9.,-]*$/.test(e.target.value)) updateEntry(account.accountId!, entry.id, 'credit', e.target.value); }}
                                  onBlur={e => { const raw = e.target.value.replace(/,/g, ''); if (raw && !isNaN(parseFloat(raw))) updateEntry(account.accountId!, entry.id, 'credit', parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })); }}
                                  className={cn(inputCls, "text-right font-mono")} placeholder="0.00" />
                              </td>
                              <td className="px-3 py-1.5 text-right font-mono font-semibold border-r border-slate-200 dark:border-slate-700">{balanceDebit ? balanceDebit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
                              <td className="px-3 py-1.5 text-right font-mono font-semibold">{balanceCredit ? balanceCredit.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
                              <td className="px-2 py-1 text-center">
                                {isAuto ? (
                                  <span title={`Auto-posted from ${entry.autoSource} — edit at the source`} className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300">Auto</span>
                                ) : (
                                  <button onClick={() => deleteEntry(account.accountId!, entry.id)} className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100">
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={9} className="px-3 py-2 bg-slate-50 dark:bg-slate-800/30">
                            <button onClick={() => addEntry(account.accountId!)} className="text-xs font-bold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 flex items-center gap-1">
                              <Plus className="w-3.5 h-3.5" /> Add Row
                            </button>
                          </td>
                        </tr>
                        {(account.entries.length > 0 || openingBalance !== 0) && (
                          <tr className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 border-t-2 border-slate-200 dark:border-slate-700">
                            <td colSpan={4} className="px-3 py-2">ENDING BALANCE</td>
                            <td className="px-3 py-2 text-right border-r border-slate-200 dark:border-slate-700 font-mono">{balance > 0 ? balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
                            <td className="px-3 py-2 text-right border-r border-slate-200 dark:border-slate-700 font-mono">{balance < 0 ? (balance * -1).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
                            <td className="px-3 py-2 text-right font-mono">{balance > 0 ? balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
                            <td className="px-3 py-2 text-right font-mono">{balance < 0 ? (balance * -1).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>
                            <td></td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {accounts.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl border-dashed">
              <p className="text-slate-500 dark:text-slate-400">No accounts in the Chart of Accounts yet.</p>
              <p className="text-sm mt-2 text-slate-400">Add an account title in the Chart of Accounts and it will appear here automatically.</p>
            </div>
          )}

          {accounts.length > 0 && filteredAccounts.length === 0 && (
            <div className="text-center py-12 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl border-dashed">
              <p className="text-slate-500 dark:text-slate-400">No ledger accounts match the "{typeFilter}" filter.</p>
            </div>
          )}
        </div>
      </div>
          </div>
    </div>
  );
}
