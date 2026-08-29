import React, { useMemo, useState } from 'react';
import { Plus, Receipt, Settings, Trash2, X } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { JournalColumn, JournalEntry } from '../types';
import { cn } from '../lib/utils';

export const DEFAULT_SJ_COLUMNS: JournalColumn[] = [
  { id: 'date', name: 'Date', type: 'text', category: 'None', isSystem: true },
  { id: 'invoice_no', name: 'Invoice #', type: 'text', category: 'None', isSystem: true },
  { id: 'customer', name: 'Customer', type: 'text', category: 'None', isSystem: true },
  { id: 'customer_tin', name: 'Customer TIN', type: 'text', category: 'None', isSystem: true },
  { id: 'description', name: 'Description', type: 'text', category: 'None', isSystem: true },
  { id: 'net_sales', name: 'Sales / Net of VAT', type: 'number', category: 'Cr', isSystem: true },
  { id: 'output_vat', name: 'Output VAT', type: 'number', category: 'Cr', isSystem: true },
  { id: 'accounts_receivable', name: 'Accounts Receivable', type: 'number', category: 'Dr', isSystem: true },
  { id: 'payment_type', name: 'Payment Type', type: 'text', category: 'None', isSystem: true },
];

export function SalesJournal() {
  const { currentClient, currentClientId, saveClient } = useAccounting();
  const [isEditingHeaders, setIsEditingHeaders] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColCategory, setNewColCategory] = useState<'Dr' | 'Cr'>('Dr');

  const savedColumns = currentClient?.sjColumns || [];
  const entries = currentClient?.sjEntries || [];
  const columns = useMemo(() => {
    const required = new Set(DEFAULT_SJ_COLUMNS.map(c => c.id));
    return [
      ...DEFAULT_SJ_COLUMNS.map(c => {
        const existing = savedColumns.find(x => x.id === c.id);
        return existing ? { ...c, name: existing.name } : c;
      }),
      ...savedColumns.filter(c => !required.has(c.id))
    ];
  }, [savedColumns]);

  if (!currentClient || !currentClientId) return null;

  const saveColumns = (next: JournalColumn[]) => saveClient(currentClientId, { ...currentClient, sjColumns: next });
  const saveEntries = (next: JournalEntry[]) => saveClient(currentClientId, { ...currentClient, sjEntries: next });

  const addColumn = () => {
    const name = newColName.trim();
    if (!name) return;
    saveColumns([...columns, {
      id: `sj_${crypto.randomUUID()}`,
      name,
      type: 'number',
      category: newColCategory,
      isSystem: false,
    }]);
    setNewColName('');
  };

  const removeColumn = (id: string) => {
    if (confirm('Remove this custom column? Existing values in this column will also be removed from the journal view.')) {
      saveColumns(columns.filter(c => c.id !== id));
    }
  };

  const addEntry = () => saveEntries([...entries, { id: crypto.randomUUID(), values: {} }]);
  const deleteEntry = (id: string) => saveEntries(entries.filter(e => e.id !== id));
  const updateEntry = (id: string, colId: string, value: string) => {
    saveEntries(entries.map(e => e.id === id ? { ...e, values: { ...e.values, [colId]: value } } : e));
  };

  const getValue = (entry: JournalEntry, col: JournalColumn) => entry.values[col.id] ?? '';
  const totals = columns.reduce<Record<string, number>>((acc, col) => {
    if (col.type === 'number') {
      acc[col.id] = entries.reduce((sum, e) => {
        const n = parseFloat(String(getValue(e, col)).replace(/,/g, ''));
        return sum + (Number.isFinite(n) ? n : 0);
      }, 0);
    }
    return acc;
  }, {});
  const totalDr = columns.filter(c => c.category === 'Dr').reduce((s, c) => s + (totals[c.id] || 0), 0);
  const totalCr = columns.filter(c => c.category === 'Cr').reduce((s, c) => s + (totals[c.id] || 0), 0);

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Subsidiary Sales Journal" icon={<Receipt className="text-emerald-500" />} />
      <div className="p-4 md:p-6 flex-1">
        <div className="flex flex-wrap justify-between items-center gap-3 mb-5">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Credit Card and On Account sales posted from Income appear here automatically. Manual rows can also be added.
          </p>
          <div className="flex gap-2">
            <button onClick={() => setIsEditingHeaders(v => !v)} className={cn('px-3 py-2 rounded-lg text-xs font-bold flex items-center gap-2', isEditingHeaders ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300')}>
              <Settings className="w-4 h-4" /> Customize Columns
            </button>
            <button onClick={addEntry} className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-4 py-2 rounded-lg text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Add Row
            </button>
          </div>
        </div>

        {isEditingHeaders && (
          <div className="mb-5 p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
            <div className="flex flex-wrap gap-2 mb-4">
              {columns.map(col => (
                <div key={col.id} className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700">
                  <span>{col.name}{col.category !== 'None' ? ` (${col.category})` : ''}</span>
                  {!col.isSystem && <button onClick={() => removeColumn(col.id)} className="text-red-500"><X className="w-3.5 h-3.5" /></button>}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">New Column</label>
                <input value={newColName} onChange={e => setNewColName(e.target.value)} className="form-input text-sm" placeholder="e.g. Sales Discount" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Debit / Credit</label>
                <select value={newColCategory} onChange={e => setNewColCategory(e.target.value as 'Dr' | 'Cr')} className="form-input text-sm">
                  <option value="Dr">Debit (Dr)</option>
                  <option value="Cr">Credit (Cr)</option>
                </select>
              </div>
              <button onClick={addColumn} disabled={!newColName.trim()} className="bg-emerald-500 disabled:opacity-50 text-white font-bold px-3 py-2 rounded-lg flex items-center gap-1">
                <Plus className="w-4 h-4" /> Add Column
              </button>
            </div>
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <table className="w-full min-w-[1100px] text-xs text-left">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
                <th className="px-3 py-3 w-10 text-center">#</th>
                {columns.map(col => <th key={col.id} className={cn('px-3 py-3 whitespace-nowrap', col.type === 'number' && 'text-right')}>{col.name}{col.category !== 'None' ? ` (${col.category})` : ''}</th>)}
                <th className="px-3 py-3 w-12 text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {entries.map((entry, idx) => (
                <tr key={entry.id} className="group hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="px-3 py-2 text-center text-slate-400">{idx + 1}</td>
                  {columns.map(col => {
                    const readOnly = !!entry.auto && DEFAULT_SJ_COLUMNS.some(c => c.id === col.id);
                    return <td key={col.id} className="px-2 py-1">
                      <input
                        value={getValue(entry, col)}
                        readOnly={readOnly}
                        onChange={e => updateEntry(entry.id, col.id, e.target.value)}
                        className={cn('w-full bg-transparent rounded px-2 py-1.5 outline-none border border-transparent focus:border-cyan-500', col.type === 'number' && 'text-right font-mono', readOnly && 'text-slate-600 dark:text-slate-300')}
                      />
                    </td>;
                  })}
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => deleteEntry(entry.id)} className="p-1.5 text-slate-400 hover:text-red-500 rounded opacity-0 group-hover:opacity-100"><Trash2 className="w-4 h-4" /></button>
                  </td>
                </tr>
              ))}
              {!entries.length && <tr><td colSpan={columns.length + 2} className="px-6 py-12 text-center text-slate-500">No Sales Journal entries yet.</td></tr>}
            </tbody>
            {!!entries.length && <tfoot>
              <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t-2 border-slate-300 dark:border-slate-600">
                <td colSpan={5} className="px-3 py-3 text-right">TOTAL</td>
                {columns.slice(5).map(col => <td key={col.id} className="px-3 py-3 text-right font-mono">{col.type === 'number' ? (totals[col.id] || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''}</td>)}
                <td />
              </tr>
            </tfoot>}
          </table>
        </div>
        {entries.length > 0 && <div className={cn('mt-4 p-3 rounded-lg text-center font-bold', Math.abs(totalDr - totalCr) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
          {Math.abs(totalDr - totalCr) < 0.01 ? 'BALANCED' : `OUT OF BALANCE — Difference: ${Math.abs(totalDr - totalCr).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </div>}
      </div>
    </div>
  );
}
