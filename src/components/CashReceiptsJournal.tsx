import React, { useEffect, useState } from 'react';
import { printReportPage } from '../lib/reportPrint';
import { Wallet, Plus, Trash2, Settings, X, Edit, Loader, Check, Calendar, Printer } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { JournalColumn, CashReceipt } from '../types';
import { cn, parseDateToISO, periodPreset } from '../lib/utils';
import { supabase } from '../lib/supabase';

import { DEFAULT_CRJ_COLUMNS } from '../lib/journalDefaults';
export { DEFAULT_CRJ_COLUMNS };

export function CashReceiptsJournal() {
  const canDelete = usePermission('delete_transactions');

  const { currentClient, currentClientId, saveJournalColumns, saveJournalEntry, deleteJournalEntry, activeDevice } = useAccounting();
  
  const [isEditingHeaders, setIsEditingHeaders] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColCategory, setNewColCategory] = useState<'Dr' | 'Cr'>('Dr');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [incomeRows, setIncomeRows] = useState<any[]>([]);

  // CRJ is sourced from Income History (normalized sales table).
  // All payment types except Credit Card and On Account belong here.
  useEffect(() => {
    let cancelled = false;
    const loadIncomeForCRJ = async () => {
      if (!currentClientId) {
        setIncomeRows([]);
        return;
      }

      const { data, error } = await supabase
        .from('sales')
        .select('id,date,ref,payment_type,buyer_tin,buyer_name,buyer_address,vat_type,amount,net_of_vat,output_tax,income_type,description')
        .eq('client_id', currentClientId)
        .not('payment_type', 'in', '(Credit Card,On Account)')
        .order('date', { ascending: true });

      if (cancelled) return;
      if (error) {
        console.error('Failed to load Income History for Cash Receipts Journal:', error);
        setIncomeRows([]);
        return;
      }
      setIncomeRows(data || []);
    };

    void loadIncomeForCRJ();
    return () => { cancelled = true; };
  }, [currentClientId]);

  if (!currentClient || !currentClientId) return null;

  const savedColumns = currentClient.crjColumns || [];
  const requiredIds = new Set(DEFAULT_CRJ_COLUMNS.map(c => c.id));
  const legacyCustomColumns = savedColumns.filter(c => !requiredIds.has(c.id) && ![
    'reference', 'description', 'post_ref', 'sales_disc', 'cash', 'ar', 'sales', 'sundry'
  ].includes(c.id));
  const hasCurrentRequiredColumns = DEFAULT_CRJ_COLUMNS.every(required =>
    savedColumns.some(saved => saved.id === required.id && saved.name === required.name)
  );
  const columns = hasCurrentRequiredColumns && savedColumns.length
    ? savedColumns
    : [...DEFAULT_CRJ_COLUMNS, ...legacyCustomColumns];
  // Keep manually-entered CRJ rows, but derive all Income History rows automatically.
  // Old auto-generated rows are intentionally ignored to prevent duplicates.
  const manualEntries = (currentClient.crjEntries || []).filter((entry: any) => !entry.auto);
  const autoEntries: CashReceipt[] = incomeRows.map((sale: any) => {
    const gross = Number(sale.amount) || 0;
    const net = Number(sale.net_of_vat ?? gross) || 0;
    const vat = Number(sale.output_tax ?? 0) || 0;
    const isExemptOrZero = sale.vat_type === 'VAT Exempt' || sale.vat_type === 'Zero-Rated';
    const values: Record<string, string> = {
      date: sale.date || '',
      reference: sale.ref || '',
      payor: sale.buyer_name || '',
      description: sale.income_type || sale.description || 'Sales',
      post_ref: sale.buyer_tin || '',
      cash: gross ? gross.toFixed(2) : '',
      sales_disc: '',
      ar: '',
      sales: isExemptOrZero ? gross.toFixed(2) : (net ? net.toFixed(2) : ''),
      sundry: !isExemptOrZero && vat > 0 ? vat.toFixed(2) : '',
    };
    return { id: `income_${sale.id}`, values, auto: true } as CashReceipt;
  });

  const entries: CashReceipt[] = [...autoEntries, ...manualEntries];

  const filteredEntries = (periodFrom || periodTo)
    ? entries.filter(e => {
        const d = parseDateToISO(e.values?.date);
        if (!d) return true;
        if (periodFrom && d < periodFrom) return false;
        if (periodTo && d > periodTo) return false;
        return true;
      })
    : entries;

  const handleSaveColumns = (newCols: JournalColumn[]) => {
    void saveJournalColumns(currentClientId, 'CRJ', newCols);
  };

  const handleSaveEntries = (newEntries: CashReceipt[]) => {
    const previous = new Map(entries.map(e => [String(e.id), e]));
    const next = new Map(newEntries.map(e => [String(e.id), e]));
    for (const e of newEntries) {
      const old = previous.get(String(e.id));
      if (!old || JSON.stringify(old) !== JSON.stringify(e)) void saveJournalEntry(currentClientId, 'CRJ', e);
    }
    for (const e of entries) {
      if (!next.has(String(e.id))) void deleteJournalEntry(currentClientId, 'CRJ', String(e.id));
    }
  };

  const addColumn = () => {
    if (!newColName) return;
    const newCol: JournalColumn = {
      id: `col_${crypto.randomUUID()}`,
      name: newColName,
      type: 'number',
      category: newColCategory,
      isSystem: false,
    };
    handleSaveColumns([...columns, newCol]);
    setNewColName('');
  };

  const removeColumn = (id: string) => {
    if (confirm("Are you sure you want to remove this column? Data in this column for existing entries may be lost.")) {
      handleSaveColumns(columns.filter(c => c.id !== id));
    }
  };

  const addEntry = () => {
    const newEntry: CashReceipt = {
      id: crypto.randomUUID(),
      values: {}
    };
    handleSaveEntries([...entries, newEntry]);
  };

  const updateEntry = (id: string, colId: string, val: string) => {
    const updated = entries.map(e => {
      if (e.id === id) {
        return { ...e, values: { ...e.values, [colId]: val } };
      }
      return e;
    });
    handleSaveEntries(updated);
  };

  const deleteEntry = (id: string) => {
    handleSaveEntries(entries.filter(e => e.id !== id));
  };

  // Calculate totals for number columns
  const getTotals = () => {
    const totals: Record<string, number> = {};
    columns.forEach(c => {
      if (c.type === 'number') {
        totals[c.id] = filteredEntries.reduce((sum, e) => {
          const val = parseFloat((e.values[c.id] || '').replace(/,/g, ''));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      }
    });
    return totals;
  };

  const totals = getTotals();
  const totalDr = columns.filter(c => c.category === 'Dr').reduce((s, c) => s + (totals[c.id] || 0), 0);
  const totalCr = columns.filter(c => c.category === 'Cr').reduce((s, c) => s + (totals[c.id] || 0), 0);
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01;

  return (
    <div className="w-full flex flex-col print-area">
      <PageHeader title="Cash Receipts Journal" icon={<Wallet />} actions={
        <button type="button" onClick={() => printReportPage('Cash Receipts Journal')} className="no-print inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity" title="Print Cash Receipts Journal">
          <Printer className="w-4 h-4" /> Print
        </button>
      } />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-6">
        <div className="no-print flex flex-wrap items-center gap-3 mb-6 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider">Period</span>
          </div>
          <input
            type="date"
            value={periodFrom}
            onChange={e => setPeriodFrom(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
          />
          <span className="text-slate-400 text-xs font-semibold">to</span>
          <input
            type="date"
            value={periodTo}
            onChange={e => setPeriodTo(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
          />
          <div className="flex flex-wrap gap-1.5">
            {(['this-month', 'last-month', 'this-quarter', 'this-year'] as const).map(p => (
              <button
                key={p}
                onClick={() => { const [f, t] = periodPreset(p); setPeriodFrom(f); setPeriodTo(t); }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-cyan-900/20 dark:hover:text-cyan-400 transition-colors capitalize"
              >
                {p.replace('-', ' ')}
              </button>
            ))}
            {(periodFrom || periodTo) && (
              <button
                onClick={() => { setPeriodFrom(''); setPeriodTo(''); }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setIsEditingHeaders(!isEditingHeaders)}
              className={cn("p-2 rounded-lg transition-colors", isEditingHeaders ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700")}
              title="Customize Columns"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>

        {isEditingHeaders && (
          <div className="no-print mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Manage Custom Columns</h4>
            <div className="flex flex-wrap gap-2 mb-4">
              {columns.map(col => (
                <div key={col.id} className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border",
                  col.isSystem 
                    ? "bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700" 
                    : "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800"
                )}>
                  <span>{col.name} {col.category !== 'None' ? `(${col.category})` : ''}</span>
                  {!col.isSystem && (
                    <button onClick={() => removeColumn(col.id)} className="text-red-400 hover:text-red-600">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
            
            <div className="flex items-end gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">New Column Name</label>
                <input 
                  type="text" 
                  value={newColName} 
                  onChange={e => setNewColName(e.target.value)} 
                  className="form-input text-sm py-1.5"
                  placeholder="e.g. Sales Auth"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Dr/Cr</label>
                <select 
                  value={newColCategory} 
                  onChange={e => setNewColCategory(e.target.value as 'Dr'|'Cr')} 
                  className="form-input text-sm py-1.5"
                >
                  <option value="Dr">Debit (Dr)</option>
                  <option value="Cr">Credit (Cr)</option>
                </select>
              </div>
              <button 
                onClick={addColumn}
                disabled={!newColName}
                className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Column
              </button>
            </div>
          </div>
        )}

        {activeDevice === 'mobile' ? (
          <div className="flex flex-col gap-4">
            {filteredEntries.map((entry, idx) => (
              <div key={entry.id} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col gap-3 relative shadow-sm">
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700/60">
                  <span className="font-mono text-xs text-slate-500 font-extrabold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">Entry #{idx + 1}</span>
                  <button 
                    onClick={() => deleteEntry(entry.id)}
                    disabled={!canDelete}
                    title={canDelete ? 'Delete entry' : 'Delete Transactions permission not granted'}
                    className="p-1.5 bg-red-50 dark:bg-red-950/20 text-red-500 hover:text-red-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete
                  </button>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {columns.filter(c => c.isSystem).map(col => (
                    <div key={col.id} className="col-span-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{col.name}</label>
                      <input 
                        type="text"
                        value={entry.values[col.id] || ''}
                        onChange={e => updateEntry(entry.id, col.id, e.target.value)}
                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-xl px-2.5 py-1.5 text-xs outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
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
                          readOnly={Boolean((entry as any).auto)}
                          value={entry.values[col.id] || ''}
                          onChange={e => {
                            if ((entry as any).auto) return;
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
                          className="w-32 text-right bg-transparent border-b border-dashed border-slate-200 hover:border-slate-400 dark:border-slate-700/60 dark:hover:border-slate-500 focus:border-cyan-500 font-mono text-xs px-1 py-0.5 outline-none font-bold text-slate-800 dark:text-slate-200"
                          placeholder="0.00"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
            {filteredEntries.length === 0 && (
              <div className="py-8"><EmptyState compact icon={<Wallet className="w-7 h-7" />} title="No cash receipts yet" description="Record cash receipt transactions to populate this journal." /></div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-xs text-left whitespace-nowrap min-w-[800px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-3 w-10 text-center">#</th>
                  {columns.map(col => (
                    <th key={col.id} className={cn("px-3 py-3", col.type === 'number' ? 'text-right' : 'text-left')}>
                      {col.name} {col.category !== 'None' ? `(${col.category})` : ''}
                    </th>
                  ))}
                  <th className="px-3 py-3 w-10 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {filteredEntries.map((entry, idx) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group">
                    <td className="px-3 py-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                    {columns.map(col => (
                      <td key={col.id} className="px-2 py-1">
                        <input 
                          type={col.type === 'number' ? 'text' : 'text'}
                          readOnly={Boolean((entry as any).auto)}
                          value={entry.values[col.id] || ''}
                          onChange={e => {
                            if ((entry as any).auto) return;
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
                          className={cn(
                            "w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1.5 transition-all outline-none",
                            col.type === 'number' ? "text-right font-mono" : ""
                          )}
                          placeholder={col.type === 'number' ? '0.00' : ''}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      {!(entry as any).auto && (
                      <button 
                        onClick={() => deleteEntry(entry.id)}
                        disabled={!canDelete}
                        title={canDelete ? 'Delete entry' : 'Delete Transactions permission not granted'}
                        className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      )}
                    </td>
                  </tr>
                ))}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-6 py-8 text-center text-slate-500">
                      No entries yet.
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredEntries.length > 0 && (
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

        {filteredEntries.length > 0 && (
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
