import React, { useMemo, useState } from 'react';
import { LineChart, Plus, Trash2, ChevronDown, ChevronUp, Layers } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { GeneralLedgerAccount, GeneralLedgerEntry } from '../types';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA } from './ChartOfAccounts';
import { cn } from '../lib/utils';

export function GeneralLedger() {
  const { currentClient, currentClientId, saveClient, showToast } = useAccounting();
  
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [typeFilter, setTypeFilter] = useState('All');
  const [expandedAccounts, setExpandedAccounts] = useState<Record<string, boolean>>({});

  if (!currentClient || !currentClientId) return null;

  const accounts = currentClient.glAccounts || [];

  // Source of truth for accounts is the Chart of Accounts, so every Account Type
  // set up there (Asset, Liabilities, Equity, Revenue, Costs, Expense, or any
  // custom type) is available to pick from here — not just a fixed/hardcoded list.
  const coaAccounts = useMemo(() => {
    const list = currentClient.accounts && currentClient.accounts.length > 0
      ? currentClient.accounts
      : (currentClient.coaFormat === 'alphanumeric' ? DEFAULT_ACCOUNTS_ALPHA : DEFAULT_ACCOUNTS);
    return list.filter(a => !a.hidden);
  }, [currentClient.accounts, currentClient.coaFormat]);

  // Distinct Account Types present in the Chart of Accounts, used to build the
  // Type filter below so every type in the CoA is browsable here too.
  const availableTypes = useMemo(() => {
    const types = coaAccounts.map(a => a.type).filter((t): t is string => !!t && t.trim() !== '');
    return Array.from(new Set(types)).sort((a, b) => a.localeCompare(b));
  }, [coaAccounts]);

  const addableAccounts = coaAccounts.filter(a => !accounts.some(g => g.accountId === a.id));

  const filteredAccounts = typeFilter === 'All'
    ? accounts
    : accounts.filter(a => (a.accountType || '').toLowerCase() === typeFilter.toLowerCase());

  const handleSaveAccounts = (newAccounts: GeneralLedgerAccount[]) => {
    saveClient(currentClientId, { ...currentClient, glAccounts: newAccounts });
  };

  const addAccount = () => {
    if (!selectedAccountId) return;
    const coaAccount = coaAccounts.find(a => a.id === selectedAccountId);
    if (!coaAccount) return;
    if (accounts.some(g => g.accountId === coaAccount.id)) {
      showToast(`${coaAccount.name} is already in the General Ledger.`);
      return;
    }
    const newAccount: GeneralLedgerAccount = {
      id: crypto.randomUUID(),
      accountTitle: coaAccount.name,
      accountId: coaAccount.id,
      accountType: coaAccount.type,
      entries: []
    };
    handleSaveAccounts([...accounts, newAccount]);
    setSelectedAccountId('');
    setExpandedAccounts({ ...expandedAccounts, [newAccount.id]: true });
  };

  // Populates the ledger with every Chart of Accounts entry that isn't already
  // here, guaranteeing every Account Type from the CoA is represented.
  const addAllAccounts = () => {
    if (addableAccounts.length === 0) {
      showToast("All Chart of Accounts entries are already in the General Ledger.");
      return;
    }
    const newEntries: GeneralLedgerAccount[] = addableAccounts.map(a => ({
      id: crypto.randomUUID(),
      accountTitle: a.name,
      accountId: a.id,
      accountType: a.type,
      entries: []
    }));
    handleSaveAccounts([...accounts, ...newEntries]);
    showToast(`Added ${newEntries.length} account${newEntries.length === 1 ? '' : 's'} from the Chart of Accounts.`);
  };

  const deleteAccount = (id: string) => {
    if (confirm("Are you sure you want to delete this account and all its entries?")) {
      handleSaveAccounts(accounts.filter(a => a.id !== id));
    }
  };

  const addEntry = (accountId: string) => {
    const updated = accounts.map(a => {
      if (a.id === accountId) {
        return {
          ...a,
          entries: [
            ...a.entries,
            {
              id: crypto.randomUUID(),
              dateDr: '', particularsDr: '', refDr: '', debit: '',
              dateCr: '', particularsCr: '', refCr: '', credit: ''
            }
          ]
        };
      }
      return a;
    });
    handleSaveAccounts(updated);
  };

  const updateEntry = (accountId: string, entryId: string, field: keyof GeneralLedgerEntry, value: string) => {
    const updated = accounts.map(a => {
      if (a.id === accountId) {
        return {
          ...a,
          entries: a.entries.map(e => e.id === entryId ? { ...e, [field]: value } : e)
        };
      }
      return a;
    });
    handleSaveAccounts(updated);
  };

  const deleteEntry = (accountId: string, entryId: string) => {
    const updated = accounts.map(a => {
      if (a.id === accountId) {
        return {
          ...a,
          entries: a.entries.filter(e => e.id !== entryId)
        };
      }
      return a;
    });
    handleSaveAccounts(updated);
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
          <p className="text-slate-500 dark:text-slate-400">Ledger accounts are pulled from your Chart of Accounts, so every Account Type set up there is available here.</p>
          <div className="flex flex-wrap items-center gap-3">
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
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="form-input text-sm py-2 min-w-[250px]"
            >
              <option value="">Select an account from the Chart of Accounts…</option>
              {availableTypes.map(type => (
                <optgroup key={type} label={type}>
                  {addableAccounts.filter(a => a.type === type).map(a => (
                    <option key={a.id} value={a.id}>{a.id} — {a.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <button 
              onClick={addAccount}
              disabled={!selectedAccountId}
              className="bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
            >
              <Plus className="w-4 h-4" /> Add Account
            </button>
            <button
              onClick={addAllAccounts}
              disabled={addableAccounts.length === 0}
              className="bg-slate-600 hover:bg-slate-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
              title="Add every Chart of Accounts entry not yet in the ledger"
            >
              <Layers className="w-4 h-4" /> Add All from CoA
            </button>
          </div>
        </div>

        <div className="space-y-6">
          {filteredAccounts.map(account => {
            const isExpanded = expandedAccounts[account.id] ?? true;
            
            // Calculate ending balance
            let totalDr = 0;
            let totalCr = 0;
            account.entries.forEach(e => {
              const d = parseFloat(e.debit.replace(/,/g, ''));
              if (!isNaN(d)) totalDr += d;
              const c = parseFloat(e.credit.replace(/,/g, ''));
              if (!isNaN(c)) totalCr += c;
            });
            
            const balance = totalDr - totalCr;
            
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
                    <button 
                      onClick={(e) => { e.stopPropagation(); deleteAccount(account.id); }}
                      className="text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-slate-500" /> : <ChevronDown className="w-5 h-5 text-slate-500" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left whitespace-nowrap min-w-[800px]">
                      <thead>
                        <tr className="bg-slate-50 dark:bg-slate-800/50 text-slate-600 dark:text-slate-400 font-bold">
                          <th className="px-3 py-2 w-10 border-b border-r border-slate-200 dark:border-slate-700 text-center">#</th>
                          <th className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 w-24">DATE</th>
                          <th className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 min-w-[150px]">PARTICULARS</th>
                          <th className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 w-20">REF NO.</th>
                          <th className="px-3 py-2 border-b border-r border-slate-200 dark:border-slate-700 text-right w-24">DEBIT</th>
                          <th className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 w-24">DATE</th>
                          <th className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 min-w-[150px]">PARTICULARS</th>
                          <th className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 w-20">REF NO.</th>
                          <th className="px-3 py-2 border-b border-slate-200 dark:border-slate-700 text-right w-24">CREDIT</th>
                          <th className="px-2 py-2 border-b border-slate-200 dark:border-slate-700 w-10 text-center"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                        {account.entries.map((entry, idx) => (
                          <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group">
                            <td className="px-3 py-1.5 text-center text-slate-400 font-mono border-r border-slate-200 dark:border-slate-700">{idx + 1}</td>
                            
                            {/* DEBIT SIDE */}
                            <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-800">
                              <input 
                                type="text"
                                value={entry.dateDr}
                                onChange={e => updateEntry(account.id, entry.id, 'dateDr', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1 transition-all outline-none"
                              />
                            </td>
                            <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-800">
                              <input 
                                type="text"
                                value={entry.particularsDr}
                                onChange={e => updateEntry(account.id, entry.id, 'particularsDr', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1 transition-all outline-none"
                              />
                            </td>
                            <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-800">
                              <input 
                                type="text"
                                value={entry.refDr}
                                onChange={e => updateEntry(account.id, entry.id, 'refDr', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1 transition-all outline-none"
                              />
                            </td>
                            <td className="px-2 py-1 border-r border-slate-300 dark:border-slate-600">
                              <input 
                                type="text"
                                value={entry.debit}
                                onChange={e => {
                                  if (/^[0-9.,-]*$/.test(e.target.value)) {
                                    updateEntry(account.id, entry.id, 'debit', e.target.value);
                                  }
                                }}
                                onBlur={e => {
                                  const raw = e.target.value.replace(/,/g, '');
                                  if (raw && !isNaN(parseFloat(raw))) {
                                    updateEntry(account.id, entry.id, 'debit', parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                  }
                                }}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1 outline-none text-right font-mono"
                                placeholder="0.00"
                              />
                            </td>

                            {/* CREDIT SIDE */}
                            <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-800">
                              <input 
                                type="text"
                                value={entry.dateCr}
                                onChange={e => updateEntry(account.id, entry.id, 'dateCr', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1 transition-all outline-none"
                              />
                            </td>
                            <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-800">
                              <input 
                                type="text"
                                value={entry.particularsCr}
                                onChange={e => updateEntry(account.id, entry.id, 'particularsCr', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1 transition-all outline-none"
                              />
                            </td>
                            <td className="px-2 py-1 border-r border-slate-100 dark:border-slate-800">
                              <input 
                                type="text"
                                value={entry.refCr}
                                onChange={e => updateEntry(account.id, entry.id, 'refCr', e.target.value)}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1 transition-all outline-none"
                              />
                            </td>
                            <td className="px-2 py-1">
                              <input 
                                type="text"
                                value={entry.credit}
                                onChange={e => {
                                  if (/^[0-9.,-]*$/.test(e.target.value)) {
                                    updateEntry(account.id, entry.id, 'credit', e.target.value);
                                  }
                                }}
                                onBlur={e => {
                                  const raw = e.target.value.replace(/,/g, '');
                                  if (raw && !isNaN(parseFloat(raw))) {
                                    updateEntry(account.id, entry.id, 'credit', parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                                  }
                                }}
                                className="w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1 outline-none text-right font-mono"
                                placeholder="0.00"
                              />
                            </td>
                            <td className="px-2 py-1 text-center">
                              <button 
                                onClick={() => deleteEntry(account.id, entry.id)}
                                className="p-1 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors opacity-0 group-hover:opacity-100"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={10} className="px-3 py-2 bg-slate-50 dark:bg-slate-800/30">
                            <button 
                              onClick={() => addEntry(account.id)}
                              className="text-xs font-bold text-cyan-600 hover:text-cyan-700 dark:text-cyan-400 dark:hover:text-cyan-300 flex items-center gap-1"
                            >
                              <Plus className="w-3.5 h-3.5" /> Add Row
                            </button>
                          </td>
                        </tr>
                        {account.entries.length > 0 && (
                          <tr className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-700 dark:text-slate-300 border-t-2 border-slate-200 dark:border-slate-700">
                            <td colSpan={3} className="px-3 py-2">ENDING BALANCE</td>
                            <td className="px-3 py-2 text-right border-r border-slate-200 dark:border-slate-700 font-mono">
                              {balance > 0 ? (
                                balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              ) : ''}
                            </td>
                            <td colSpan={4} className="px-3 py-2"></td>
                            <td className="px-3 py-2 text-right font-mono">
                              {balance < 0 ? (
                                (balance * -1).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                              ) : ''}
                            </td>
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
              <p className="text-slate-500 dark:text-slate-400">No ledger accounts yet.</p>
              <p className="text-sm mt-2 text-slate-400">Pick an account from the Chart of Accounts above, or click "Add All from CoA" to bring in every account type at once.</p>
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
