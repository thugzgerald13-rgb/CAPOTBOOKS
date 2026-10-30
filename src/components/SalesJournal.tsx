import React, { useEffect, useState } from 'react';
import { printReportPage } from '../lib/reportPrint';
import { Receipt, Plus, Trash2, Settings, X, Check, Calendar, Printer, FileDown, AlertTriangle } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { JournalColumn, JournalEntry } from '../types';
import { cn, parseDateToISO, periodPreset } from '../lib/utils';
import { supabase } from '../lib/supabase';
import { crossFootValidation, exportJournalToExcel } from '../lib/specialJournals';

import { DEFAULT_SJ_COLUMNS } from '../lib/journalDefaults';
export { DEFAULT_SJ_COLUMNS };

export function SalesJournal() {
  const canDelete = usePermission('delete_transactions');
  const canExport = usePermission('export_data');

  const { currentClient, currentClientId, saveJournalColumns, saveJournalEntries, deleteJournalEntry } = useAccounting();

  const [isEditingHeaders, setIsEditingHeaders] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColCategory, setNewColCategory] = useState<'Dr' | 'Cr'>('Dr');
  const [journalSales, setJournalSales] = useState<any[]>([]);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadJournalSales = async () => {
      if (!currentClientId) {
        setJournalSales([]);
        return;
      }

      let query: any = supabase
        .from('sales')
        .select('id,date,ref,buyer_tin,buyer_name,buyer_address,amount,vat_type,net_of_vat,output_tax,income_type,payment_type')
        .eq('client_id', currentClientId)
        .in('payment_type', ['Credit Card', 'On Account']);
      const { data, error } = await query.order('date', { ascending: true });

      if (cancelled) return;

      if (error) {
        console.error('Failed to load Sales Journal source sales:', error);
        setJournalSales([]);
        return;
      }

      setJournalSales(data || []);
    };

    loadJournalSales();

    return () => {
      cancelled = true;
    };
  }, [currentClientId]);

  if (!currentClient || !currentClientId) return null;

  const savedColumns = currentClient.sjColumns || [];
  const requiredIds = new Set(DEFAULT_SJ_COLUMNS.map(col => col.id));

  // Always display the required Sales Journal columns first.
  // Preserve user-defined columns after the system columns.
  const columns = [
    ...DEFAULT_SJ_COLUMNS.map(required => {
      const existing = savedColumns.find(col => col.id === required.id);
      return existing
        ? { ...required, name: required.name, type: required.type, category: required.category, isSystem: true }
        : required;
    }),
    ...savedColumns.filter(col => !requiredIds.has(col.id)),
  ];

  // Credit Card and On Account transactions belong in the Subsidiary Sales Journal.
  // These rows are queried directly from the normalized sales table so the page
  // does not hydrate the client's entire Sales history.
  const sourceSales = journalSales.map((sale: any) => ({
    id: sale.id,
    date: sale.date || '',
    ref: sale.ref || '',
    buyerTin: sale.buyer_tin || '',
    buyerName: sale.buyer_name || '',
    buyerAddress: sale.buyer_address || '',
    amount: sale.amount,
    vatType: sale.vat_type,
    netOfVat: sale.net_of_vat,
    outputTax: sale.output_tax,
    incomeType: sale.income_type,
    paymentType: sale.payment_type,
  }));

  // Existing manually-entered SJ rows are preserved. Automatically derive rows from sales
  // so the journal remains populated from the Income/Purchases workflow.
  const manualEntries = currentClient.sjEntries || [];
  const autoEntries: JournalEntry[] = sourceSales.map((sale: any) => {
    const gross = Number(sale.amount) || 0;
    const net = Number(sale.netOfVat ?? gross) || 0;
    const vat = Number(sale.outputTax ?? 0) || 0;
    const exemptZero = sale.vatType === 'VAT Exempt' || sale.vatType === 'Zero-Rated' ? gross : 0;

    const values: Record<string, any> = {
      date: sale.date || '',
      invoice_no: sale.ref || '',
      customer_tin: sale.buyerTin || '',
      customer_name: sale.buyerName || '',
      customer_address: sale.buyerAddress || '',
      net_of_vat: net ? net.toFixed(2) : '',
      output_vat: vat ? vat.toFixed(2) : '',
      exempt_zero_rated: exemptZero ? exemptZero.toFixed(2) : '',
      account_title: sale.incomeType || 'Sales',
      accounts_receivable: sale.paymentType === 'On Account' ? gross.toFixed(2) : '',
      credit_card: sale.paymentType === 'Credit Card' ? gross.toFixed(2) : '',
    };

    return {
      id: `sale_${sale.id}`,
      values,
      auto: true,
    };
  });

  const entries = [...autoEntries, ...manualEntries.filter((entry: any) => !entry.auto)];

  const filteredEntries = (periodFrom || periodTo)
    ? entries.filter(e => {
        const d = parseDateToISO(e.values?.date ?? (e as any).date);
        if (!d) return true;
        if (periodFrom && d < periodFrom) return false;
        if (periodTo && d > periodTo) return false;
        return true;
      })
    : entries;

  const handleSaveColumns = async (newCols: JournalColumn[]) => {
    try {
      await saveJournalColumns(currentClientId, 'SJ', newCols);
    } catch (error) {
      console.error('Failed to save Sales Journal columns:', error);
    }
  };

  const handleSaveEntries = async (newEntries: JournalEntry[]) => {
    try {
      await saveJournalEntries(currentClientId, 'SJ', newEntries);
    } catch (error) {
      console.error('Failed to save Sales Journal entries:', error);
    }
  };

  const addColumn = () => {
    if (!newColName.trim()) return;

    const newCol: JournalColumn = {
      id: `col_${crypto.randomUUID()}`,
      name: newColName.trim(),
      type: 'number',
      category: newColCategory,
      isSystem: false,
    };

    handleSaveColumns([...columns, newCol]);
    setNewColName('');
  };

  const removeColumn = (id: string) => {
    if (confirm('Are you sure you want to remove this column? Data in this column for existing entries may be lost.')) {
      handleSaveColumns(columns.filter(c => c.id !== id));
    }
  };

  const addEntry = () => {
    const newEntry: JournalEntry = {
      id: crypto.randomUUID(),
      values: {},
    };
    handleSaveEntries([...manualEntries.filter((entry: any) => !entry.auto), newEntry]);
  };

  const updateEntry = (id: string, colId: string, val: string) => {
    const updated = manualEntries
      .filter((entry: any) => !entry.auto)
      .map(entry => entry.id === id
        ? { ...entry, values: { ...entry.values, [colId]: val } }
        : entry
      );

    handleSaveEntries(updated);
  };

  const deleteEntry = async (id: string) => {
    try {
      await deleteJournalEntry(currentClientId, 'SJ', id);
    } catch (error) {
      console.error('Failed to delete Sales Journal entry:', error);
    }
  };

  const getEntryValue = (entry: JournalEntry, colId: string) => {
    if (colId === 'exempt_zero_rated') {
      const combined = entry.values[colId];
      if (combined !== undefined && combined !== '') return combined;

      const exempt = parseFloat((entry.values['exempt'] || '').toString().replace(/,/g, ''));
      const zeroRated = parseFloat((entry.values['zero_rated'] || '').toString().replace(/,/g, ''));
      if (!isNaN(exempt) || !isNaN(zeroRated)) {
        return ((isNaN(exempt) ? 0 : exempt) + (isNaN(zeroRated) ? 0 : zeroRated)).toFixed(2);
      }
    }

    return entry.values[colId] || '';
  };

  const totals: Record<string, number> = {};
  columns.forEach(col => {
    if (col.type === 'number') {
      totals[col.id] = filteredEntries.reduce((sum, entry) => {
        const raw = getEntryValue(entry, col.id);
        const value = parseFloat(String(raw || '').replace(/,/g, ''));
        return sum + (isNaN(value) ? 0 : value);
      }, 0);
    }
  });

  const totalDr = columns
    .filter(col => col.category === 'Dr')
    .reduce((sum, col) => sum + (totals[col.id] || 0), 0);

  const totalCr = columns
    .filter(col => col.category === 'Cr')
    .reduce((sum, col) => sum + (totals[col.id] || 0), 0);

  const isBalanced = Math.abs(totalDr - totalCr) < 0.01;

  return (
    <div className="w-full flex flex-col print-area">
      <PageHeader title="Subsidiary Sales Journal" icon={<Receipt />} actions={
        <div className="flex items-center gap-2 no-print">
          <button type="button" onClick={() => exportJournalToExcel(filteredEntries, columns, 'sales-journal.xlsx')} disabled={!canExport} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed" title={canExport ? 'Export to Excel' : 'Export Data permission not granted'}>
            <FileDown className="w-4 h-4" /> Excel
          </button>
          <button type="button" onClick={() => printReportPage('Sales Journal')} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity" title="Print Subsidiary Sales Journal">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      } />
      {(() => {
        const cf = crossFootValidation(filteredEntries, columns);
        if (cf.balanced || filteredEntries.length === 0) return null;
        return (
          <div className="mx-4 md:mx-6 mt-2 no-print rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-4 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span><strong>Cross-foot warning:</strong> Debits (₱{cf.debitTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}) ≠ Credits (₱{cf.creditTotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}). Difference: ₱{Math.abs(cf.difference).toLocaleString(undefined, { minimumFractionDigits: 2 })}.</span>
          </div>
        );
      })()}

      <div className="p-4 md:p-6 flex-1">
        <div className="p-2 md:p-4">
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
                className={cn(
                  'p-2 rounded-lg transition-colors',
                  isEditingHeaders
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                )}
                title="Customize Columns"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>

          {isEditingHeaders && (
            <div className="no-print mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
              <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">
                Manage Sales Journal Columns
              </h4>

              <div className="flex flex-wrap gap-2 mb-4">
                {columns.map(col => (
                  <div
                    key={col.id}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border',
                      col.isSystem
                        ? 'bg-white dark:bg-slate-800 text-slate-400 border-slate-200 dark:border-slate-700'
                        : 'bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800'
                    )}
                  >
                    <span>{col.name} {col.category !== 'None' ? `(${col.category})` : ''}</span>
                    {!col.isSystem && (
                      <button onClick={() => removeColumn(col.id)} className="text-red-400 hover:text-red-600">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">New Column Name</label>
                  <input
                    type="text"
                    value={newColName}
                    onChange={e => setNewColName(e.target.value)}
                    className="form-input text-sm py-1.5"
                    placeholder="e.g. Sales Discount"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">Dr/Cr</label>
                  <select
                    value={newColCategory}
                    onChange={e => setNewColCategory(e.target.value as 'Dr' | 'Cr')}
                    className="form-input text-sm py-1.5"
                  >
                    <option value="Dr">Debit (Dr)</option>
                    <option value="Cr">Credit (Cr)</option>
                  </select>
                </div>

                <button
                  onClick={addColumn}
                  disabled={!newColName.trim()}
                  className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1"
                >
                  <Plus className="w-4 h-4" />
                  Add Column
                </button>
              </div>
            </div>
          )}

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-xs text-left whitespace-nowrap min-w-[1300px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-3 w-10 text-center">#</th>
                  {columns.map(col => (
                    <th
                      key={col.id}
                      className={cn(
                        'px-3 py-3',
                        col.type === 'number' ? 'text-right' : 'text-left'
                      )}
                    >
                      {col.name} {col.category !== 'None' ? `(${col.category})` : ''}
                    </th>
                  ))}
                  <th className="px-3 py-3 w-10 text-center">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {filteredEntries.map((entry, idx) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group"
                  >
                    <td className="px-3 py-2 text-center text-slate-400 font-mono">{idx + 1}</td>

                    {columns.map(col => (
                      <td key={col.id} className="px-2 py-1">
                        <input
                          type="text"
                          readOnly={Boolean((entry as any).auto)}
                          value={getEntryValue(entry, col.id)}
                          onChange={e => {
                            if ((entry as any).auto) return;

                            const val = e.target.value;
                            if (col.type === 'number') {
                              if (/^[0-9.,-]*$/.test(val)) {
                                updateEntry(entry.id, col.id, val);
                              }
                            } else {
                              updateEntry(entry.id, col.id, val);
                            }
                          }}
                          onBlur={e => {
                            if ((entry as any).auto || col.type !== 'number') return;

                            const raw = e.target.value.replace(/,/g, '');
                            if (raw && !isNaN(parseFloat(raw))) {
                              updateEntry(
                                entry.id,
                                col.id,
                                parseFloat(raw).toLocaleString(undefined, {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })
                              );
                            }
                          }}
                          className={cn(
                            'w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1.5 transition-all outline-none',
                            col.type === 'number' ? 'text-right font-mono' : '',
                            (entry as any).auto ? 'cursor-not-allowed' : ''
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
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}

                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-6 py-10 text-center text-slate-500 dark:text-slate-400">
                      No Sales Journal entries yet. The required columns remain visible above.
                    </td>
                  </tr>
                )}
              </tbody>

              <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                <tr>
                  <td
                    className="px-3 py-3 text-right"
                    colSpan={columns.filter(c => c.type !== 'number').length + 1}
                  >
                    Total
                  </td>

                  {columns.map(col => {
                    if (col.type === 'number') {
                      return (
                        <td
                          key={col.id}
                          className="px-3 py-3 text-right text-slate-800 dark:text-slate-200 font-mono text-[11px]"
                        >
                          {(totals[col.id] || 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </td>
                      );
                    }
                    return null;
                  })}

                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap justify-between items-center gap-4 bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Total Debits</p>
                <p className="text-lg font-black text-slate-800 dark:text-slate-200 font-mono">
                  ₱{totalDr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>

              <div className="w-px bg-slate-300 dark:bg-slate-600" />

              <div>
                <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Total Credits</p>
                <p className="text-lg font-black text-slate-800 dark:text-slate-200 font-mono">
                  ₱{totalCr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>

            <div
              className={cn(
                'px-4 py-2 rounded-xl font-bold flex items-center gap-2',
                isBalanced
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              )}
            >
              {isBalanced ? (
                <>
                  <Check className="w-5 h-5" /> Balanced
                </>
              ) : (
                <>
                  <X className="w-5 h-5" />
                  Out of Balance: ₱{Math.abs(totalDr - totalCr).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
