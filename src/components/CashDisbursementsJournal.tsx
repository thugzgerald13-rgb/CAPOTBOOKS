import React, { useEffect, useState } from 'react';
import { Wallet, Plus, Trash2, Settings, X, Check } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { JournalColumn, JournalEntry, CoaAccount } from '../types';
import { cn } from '../lib/utils';

export const CDJ_SUNDRY_ACCOUNT_TITLE_ID = 'sundry_account_title';
export const CDJ_SUNDRY_AMOUNT_ID = 'sundry_amount';

export const DEFAULT_CDJ_COLUMNS: JournalColumn[] = [
  { id: 'date', name: 'Date', type: 'text', category: 'None', isSystem: true },
  { id: 'payee', name: 'Payees', type: 'text', category: 'None', isSystem: true },
  { id: 'folio_f', name: 'Folio/F', type: 'text', category: 'None', isSystem: true },
  { id: CDJ_SUNDRY_ACCOUNT_TITLE_ID, name: 'Account Title', type: 'text', category: 'None', isSystem: true },
  { id: CDJ_SUNDRY_AMOUNT_ID, name: 'Amount Dr/Cr', type: 'number', category: 'None', isSystem: true },
];

const MAX_CDJ_ACCOUNT_COLUMNS = 10;
const CDJ_ACCOUNT_PREFIX = 'cdj_coa_';

function accountColumnId(accountId: string) {
  return `${CDJ_ACCOUNT_PREFIX}${accountId}`;
}

function accountIdFromColumn(column: JournalColumn): string | undefined {
  return column.id.startsWith(CDJ_ACCOUNT_PREFIX) ? column.id.slice(CDJ_ACCOUNT_PREFIX.length) : undefined;
}

function getClientAccounts(client: any): CoaAccount[] {
  return (client.accounts || []).filter((a: CoaAccount) => !a.hidden);
}

function normalizeCdjColumns(columns: JournalColumn[] | undefined, accounts: CoaAccount[]): JournalColumn[] {
  if (!columns || columns.length === 0) return [...DEFAULT_CDJ_COLUMNS];

  const alreadyNew = columns.some(c => c.id === CDJ_SUNDRY_ACCOUNT_TITLE_ID || c.id === CDJ_SUNDRY_AMOUNT_ID || c.id.startsWith(CDJ_ACCOUNT_PREFIX));
  if (alreadyNew) {
    const accountCols = columns.filter(c => accountIdFromColumn(c)).slice(0, MAX_CDJ_ACCOUNT_COLUMNS);
    return [
      DEFAULT_CDJ_COLUMNS[0],
      DEFAULT_CDJ_COLUMNS[1],
      DEFAULT_CDJ_COLUMNS[2],
      ...accountCols,
      DEFAULT_CDJ_COLUMNS[3],
      DEFAULT_CDJ_COLUMNS[4],
    ];
  }

  // Migrate the previous CDJ layout to the new structure without changing
  // unrelated journals or database structures. Numeric columns that match a
  // Chart of Accounts account become the first 10 selectable account columns.
  const used = new Set<string>();
  const accountCols: JournalColumn[] = [];
  columns.filter(c => c.type === 'number' && !c.isSystem).forEach(c => {
    if (accountCols.length >= MAX_CDJ_ACCOUNT_COLUMNS) return;
    const match = accounts.find(a => a.id === c.id || a.name.toLowerCase() === c.name.toLowerCase());
    if (!match || used.has(match.id)) return;
    used.add(match.id);
    accountCols.push({
      id: accountColumnId(match.id),
      name: match.name,
      type: 'number',
      category: match.normalSide === 'credit' ? 'Cr' : 'Dr',
      isSystem: false,
    });
  });

  return [
    DEFAULT_CDJ_COLUMNS[0],
    DEFAULT_CDJ_COLUMNS[1],
    DEFAULT_CDJ_COLUMNS[2],
    ...accountCols,
    DEFAULT_CDJ_COLUMNS[3],
    DEFAULT_CDJ_COLUMNS[4],
  ];
}

export function CashDisbursementsJournal() {
  const { currentClient, currentClientId, saveClient, activeDevice } = useAccounting();
  
  const [isEditingHeaders, setIsEditingHeaders] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');

  const accounts = getClientAccounts(currentClient);
  const rawColumns = currentClient.cdjColumns;
  const columns = normalizeCdjColumns(rawColumns, accounts);
  const entries = currentClient.cdjEntries || [];

  useEffect(() => {
    if (!currentClient || !currentClientId) return;
    const changed = JSON.stringify(rawColumns || []) !== JSON.stringify(columns);
    if (!changed) return;

    // Preserve old Account Title/Amount values as Sundries during migration.
    const oldAccountTitle = rawColumns?.find(c => c.id === 'account_title');
    const oldAmount = rawColumns?.find(c => c.id === 'amount');
    const oldAccountColumns = rawColumns?.filter(c => c.type === 'number' && !c.isSystem) || [];
    const migratedEntries = entries.map(entry => {
      const next = { ...entry.values };
      if (oldAccountTitle && next[oldAccountTitle.id] !== undefined) next[CDJ_SUNDRY_ACCOUNT_TITLE_ID] = next[oldAccountTitle.id];
      if (oldAmount && next[oldAmount.id] !== undefined) next[CDJ_SUNDRY_AMOUNT_ID] = next[oldAmount.id];
      columns.filter(c => accountIdFromColumn(c)).forEach(c => {
        const account = accounts.find(a => a.id === accountIdFromColumn(c));
        const old = account && oldAccountColumns.find(x => x.name.toLowerCase() === account.name.toLowerCase());
        if (old && next[old.id] !== undefined) next[c.id] = next[old.id];
      });
      return { ...entry, values: next };
    });

    saveClient(currentClientId, { ...currentClient, cdjColumns: columns, cdjEntries: migratedEntries });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClientId, rawColumns, currentClient, columns, accounts, entries, saveClient]);

  if (!currentClient || !currentClientId) return null;

  const handleSaveColumns = (newCols: JournalColumn[]) => {
    saveClient(currentClientId, { ...currentClient, cdjColumns: newCols });
  };

  const handleSaveEntries = (newEntries: JournalEntry[]) => {
    saveClient(currentClientId, { ...currentClient, cdjEntries: newEntries });
  };

  const addColumn = () => {
    if (!selectedAccountId) return;
    if (columns.filter(c => accountIdFromColumn(c)).length >= MAX_CDJ_ACCOUNT_COLUMNS) return;
    if (columns.some(c => accountIdFromColumn(c) === selectedAccountId)) return;
    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account) return;
    const newCol: JournalColumn = {
      id: accountColumnId(account.id),
      name: account.name,
      type: 'number',
      category: account.normalSide === 'credit' ? 'Cr' : 'Dr',
      isSystem: false,
    };
    const sundryIndex = columns.findIndex(c => c.id === CDJ_SUNDRY_ACCOUNT_TITLE_ID);
    const next = [...columns];
    next.splice(sundryIndex < 0 ? next.length : sundryIndex, 0, newCol);
    handleSaveColumns(next);
    setSelectedAccountId('');
  };

  const removeColumn = (id: string) => {
    if (confirm("Are you sure you want to remove this Chart of Accounts column? Data in this column for existing entries may be lost.")) {
      handleSaveColumns(columns.filter(c => c.id !== id));
    }
  };

  const addEntry = () => {
    const newEntry: JournalEntry = {
      id: crypto.randomUUID(),
      values: {}
    };
    handleSaveEntries([...entries, newEntry]);
  };

  const updateEntry = (id: string, colId: string, val: string) => {
    const updated = entries.map(e => {
      if (e.id === id) {
        if (e.auto) return e; // auto-posted rows are read-only — edit at the source instead
        return { ...e, values: { ...e.values, [colId]: val } };
      }
      return e;
    });
    handleSaveEntries(updated);
  };

  const deleteEntry = (id: string) => {
    handleSaveEntries(entries.filter(e => e.id !== id || e.auto));
  };

  // Calculate totals for number columns
  const getTotals = () => {
    const totals: Record<string, number> = {};
    columns.forEach(c => {
      if (c.type === 'number') {
        totals[c.id] = entries.reduce((sum, e) => {
          const val = parseFloat((e.values[c.id] || '').replace(/,/g, ''));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      }
    });
    return totals;
  };

  const totals = getTotals();
  const totalDr = columns.filter(c => c.category === 'Dr').reduce((s, c) => s + (totals[c.id] || 0), 0)
    + Math.max(0, totals[CDJ_SUNDRY_AMOUNT_ID] || 0);
  const totalCr = columns.filter(c => c.category === 'Cr').reduce((s, c) => s + (totals[c.id] || 0), 0)
    + Math.max(0, -(totals[CDJ_SUNDRY_AMOUNT_ID] || 0));
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01;

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Cash Disbursements Journal" icon={<Wallet />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-4">
             <p className="text-slate-500 dark:text-slate-400">Record cash disbursements in detail. Cash purchases and cash-out Journal Vouchers are added here automatically.</p>
             <button 
               onClick={() => setIsEditingHeaders(!isEditingHeaders)}
               className={cn("px-3 py-1.5 text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5", 
                 isEditingHeaders ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 text-slate-700 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700")}
             >
               <Settings className="w-3.5 h-3.5" />
               Customize Columns
             </button>
          </div>
          <button 
            onClick={addEntry}
            className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-4 py-2 rounded-xl transition-colors flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Add Row
          </button>
        </div>

        {isEditingHeaders && (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Cash Disbursements Journal Columns</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">The first 10 account columns are selected directly from the Chart of Accounts. Sundries is fixed as columns 11 and 12.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {columns.map((col, index) => {
                const accountId = accountIdFromColumn(col);
                return (
                  <div key={col.id} className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border",
                    accountId ? "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800" : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                  )}>
                    <span>{accountId ? `${columns.filter(c => accountIdFromColumn(c)).indexOf(col) + 1}. ${col.name}` : `${index >= 3 ? index + 1 : ''} ${col.name}`}</span>
                    {accountId && <button onClick={() => removeColumn(col.id)} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Add Chart of Accounts Column ({columns.filter(c => accountIdFromColumn(c)).length}/{MAX_CDJ_ACCOUNT_COLUMNS})</label>
                <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} className="form-input text-sm py-1.5 min-w-[260px]" disabled={columns.filter(c => accountIdFromColumn(c)).length >= MAX_CDJ_ACCOUNT_COLUMNS}>
                  <option value="">Select an account...</option>
                  {accounts.filter(a => !columns.some(c => accountIdFromColumn(c) === a.id)).map(a => (
                    <option key={a.id} value={a.id}>{a.id} — {a.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={addColumn} disabled={!selectedAccountId || columns.filter(c => accountIdFromColumn(c)).length >= MAX_CDJ_ACCOUNT_COLUMNS} className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" /> Add Account Column
              </button>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              <strong>Sundries (columns 11–12):</strong> Account Title and Amount Dr/Cr. Enter a positive amount for a debit and a negative amount for a credit.
            </div>
          </div>
        )}

        {activeDevice === 'mobile' ? (
          <div className="flex flex-col gap-4">
            {entries.map((entry, idx) => {
              const isAuto = !!entry.auto;
              return (
              <div key={entry.id} className={cn("border rounded-2xl p-4 flex flex-col gap-3 relative shadow-sm", isAuto ? "bg-cyan-50/40 dark:bg-cyan-950/10 border-cyan-200 dark:border-cyan-900/50" : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700")}>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700/60">
                  <span className="font-mono text-xs text-slate-500 font-extrabold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">Entry #{idx + 1}</span>
                  {isAuto ? (
                    <span
                      title={`Auto-posted from ${entry.autoSource} — edit at the source`}
                      className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300"
                    >
                      Auto · {entry.autoSource}
                    </span>
                  ) : (
                    <button 
                      onClick={() => deleteEntry(entry.id)}
                      className="p-1.5 bg-red-50 dark:bg-red-950/20 text-red-500 hover:text-red-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {columns.filter(c => c.isSystem).map(col => (
                    <div key={col.id} className="col-span-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{col.name}</label>
                      <input 
                        type="text"
                        readOnly={isAuto}
                        value={entry.values[col.id] || ''}
                        onChange={e => updateEntry(entry.id, col.id, e.target.value)}
                        className={cn("w-full border rounded-xl px-2.5 py-1.5 text-xs outline-none", isAuto ? "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-default" : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:border-cyan-500 text-slate-900 dark:text-white")}
                        placeholder={`Enter ${col.name.toLowerCase()}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50 flex flex-col gap-2 mt-1">
                  <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-widest block mb-1">Financial Figures (Dr/Cr)</span>
                  <div className="grid grid-cols-1 gap-2">
                    {columns.filter(c => !c.isSystem).map(col => (
                      <div key={col.id} className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-1.5 last:border-0 last:pb-0">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{col.name} <span className="text-[10px] text-slate-400 uppercase font-mono">({col.category})</span></span>
                        <input 
                          type="text"
                          readOnly={isAuto}
                          value={entry.values[col.id] || ''}
                          onChange={e => {
                            let val = e.target.value;
                            if (/^[0-9.,-]*$/.test(val)) {
                              updateEntry(entry.id, col.id, val);
                            }
                          }}
                          onBlur={e => {
                            const raw = e.target.value.replace(/,/g, '');
                            if (raw && !isNaN(parseFloat(raw))) {
                              updateEntry(entry.id, col.id, parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            }
                          }}
                          className={cn("w-32 text-right bg-transparent border-b border-dashed font-mono text-xs px-1/2 py-0.5 outline-none font-bold", isAuto ? "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-default" : "border-slate-200 hover:border-slate-400 dark:border-slate-700/60 dark:hover:border-slate-500 focus:border-cyan-500 text-slate-800 dark:text-slate-200")}
                          placeholder="0.00"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              );
            })}
            {entries.length === 0 && (
              <div className="text-center py-8 text-slate-400 dark:text-slate-500">No entries yet. Click "Add Row" to start.</div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-xs text-left whitespace-nowrap min-w-[800px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-3 w-10 text-center">Existing #</th>
                  {columns.filter(c => c.id === 'date' || c.id === 'payee' || c.id === 'folio_f').map(col => (
                    <th key={col.id} className="px-3 py-3">{col.name}</th>
                  ))}
                  {columns.filter(c => !!accountIdFromColumn(c)).map(col => (
                    <th key={col.id} className="px-3 py-3 text-right">{col.name}</th>
                  ))}
                  <th colSpan={2} className="px-3 py-2 text-center border-l border-slate-200 dark:border-slate-700">
                    <div>Sundries</div>
                    <div className="grid grid-cols-2 mt-1 text-[10px] font-semibold normal-case tracking-normal">
                      <span>Account Title</span><span>Amount Dr/Cr</span>
                    </div>
                  </th>
                  <th className="px-3 py-3 w-10 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {entries.map((entry, idx) => {
                  const isAuto = !!entry.auto;
                  return (
                  <tr key={entry.id} className={cn("group", isAuto ? "bg-cyan-50/40 dark:bg-cyan-950/10" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20")}>
                    <td className="px-3 py-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                    {columns.map(col => (
                      <td key={col.id} className="px-2 py-1">
                        <input 
                          type={col.type === 'number' ? 'text' : 'text'}
                          readOnly={isAuto}
                          value={entry.values[col.id] || ''}
                          onChange={e => {
                            let val = e.target.value;
                            if (col.type === 'number') {
                               if (/^[0-9.,-]*$/.test(val)) {
                                 updateEntry(entry.id, col.id, val);
                               }
                            } else {
                              updateEntry(entry.id, col.id, val);
                            }
                          }}
                          onBlur={e => {
                            if (col.type === 'number') {
                              const raw = e.target.value.replace(/,/g, '');
                              if (raw && !isNaN(parseFloat(raw))) {
                                updateEntry(entry.id, col.id, parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                              }
                            }
                          }}
                          title={isAuto ? `Auto-posted from ${entry.autoSource} — edit at the source` : undefined}
                          className={cn(
                            "w-full bg-transparent border rounded px-2 py-1.5 transition-all outline-none",
                            isAuto
                              ? "border-transparent text-slate-500 dark:text-slate-400 cursor-default"
                              : "border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500",
                            col.type === 'number' ? "text-right font-mono" : ""
                          )}
                          placeholder={col.type === 'number' ? '0.00' : ''}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      {isAuto ? (
                        <span
                          title={`Auto-posted from ${entry.autoSource} — edit at the source`}
                          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300"
                        >
                          Auto
                        </span>
                      ) : (
                        <button 
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {entries.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-6 py-8 text-center text-slate-500">
                      No entries yet. Click "Add Row" to start.
                    </td>
                  </tr>
                )}
              </tbody>
              {entries.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <td className="px-3 py-3 text-right" colSpan={columns.filter(c => c.type !== 'number').length + 1}>Total</td>
                    {columns.map(col => {
                      if (col.type === 'number') {
                        return (
                          <td key={col.id} className="px-3 py-3 text-right text-slate-800 dark:text-slate-200 font-mono text-[11px]">
                            {totals[col.id]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        );
                      }
                      return null;
                    })}
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {entries.length > 0 && (
          <div className="mt-4 flex justify-between items-center bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Total Debits</p>
                <p className="text-lg font-black text-slate-800 dark:text-slate-200 font-mono">
                  ₱{totalDr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-px bg-slate-300 dark:bg-slate-600"></div>
              <div>
                <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Total Credits</p>
                <p className="text-lg font-black text-slate-800 dark:text-slate-200 font-mono">
                  ₱{totalCr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className={cn(
              "px-4 py-2 rounded-xl font-bold flex items-center gap-2",
              isBalanced ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}>
              {isBalanced ? (
                <>
                  <Check className="w-5 h-5" /> Balanced
                </>
              ) : (
                <>
                  <X className="w-5 h-5" /> Out of Balance: ₱{Math.abs(totalDr - totalCr).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
          </div>
    </div>
  );
}
