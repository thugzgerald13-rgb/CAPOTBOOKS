import React, { useState } from 'react';
import { BookText, Plus, Trash2, Settings, X, Check, Calendar, Printer, Search, FileDown } from 'lucide-react';
import { EmptyState } from './ui/EmptyState';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { JournalColumn, JournalEntry } from '../types';
import { cn, parseDateToISO, periodPreset, generateCSV } from '../lib/utils';
import { YearDropdownDateInput } from './ui/YearDropdownDateInput';

export const DEFAULT_GJ_COLUMNS: JournalColumn[] = [
  { id: 'date', name: 'DATE', type: 'text', category: 'None', isSystem: true },
  { id: 'particulars', name: 'ACCOUNT TITLES & DESCRIPTION', type: 'text', category: 'None', isSystem: true },
  { id: 'ref_no', name: 'PR', type: 'text', category: 'None', isSystem: true },
  { id: 'debit', name: 'DEBIT', type: 'number', category: 'Dr', isSystem: true },
  { id: 'credit', name: 'CREDIT', type: 'number', category: 'Cr', isSystem: true },
];

/**
 * Checks whether a journal voucher represents a cash payment.
 * A cash payment voucher is one where any line credits a Cash account
 * (account name contains "Cash", e.g. "Cash on Hand", "Cash in Bank").
 * Cash payments belong in the Cash Disbursements Journal, not the General Journal.
 */
function isCashPaymentVoucher(voucher: any): boolean {
  const lines = voucher.lines || [];
  return lines.some((line: any) => {
    const accountName = (line.accountName || '').toLowerCase();
    const isCashAccount = accountName.includes('cash');
    const isCredit = Number(line.credit || 0) > 0;
    return isCashAccount && isCredit;
  });
}

export function GeneralJournal() {
  const canExport = usePermission('export_data');

  const { currentClient, currentClientId, saveJournalColumns, saveJournalEntry, deleteJournalEntry, activeDevice } = useAccounting();
  
  const [isEditingHeaders, setIsEditingHeaders] = useState(false);
  const [newColName, setNewColName] = useState('');
  const [newColCategory, setNewColCategory] = useState<'Dr' | 'Cr'>('Dr');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  if (!currentClient || !currentClientId) return null;

  // Always enforce the required General Journal system columns for existing clients too.
  // Older saved configurations may still contain the previous header names/order.
  const savedColumns = currentClient.gjColumns || [];
  const systemIds = new Set(DEFAULT_GJ_COLUMNS.map(c => c.id));
  const savedById = new Map(savedColumns.map(c => [c.id, c]));
  const columns: JournalColumn[] = [
    ...DEFAULT_GJ_COLUMNS.map(required => ({
      ...required,
      // Preserve existing system-column metadata while enforcing the required label/type/category.
      ...(savedById.has(required.id) ? { isSystem: true } : {}),
    })),
    ...savedColumns.filter(c => !systemIds.has(c.id)),
  ];

  // General Journal entries are derived solely from saved Journal Vouchers.
  // Each voucher line becomes one GJ row. Add / edit / delete is done in the Journal Voucher page.
  // CASH PAYMENT vouchers are EXCLUDED — they belong in the Cash Disbursements Journal instead.
  const vouchers = currentClient.journalVouchers || [];
  const gjColIds = new Set(columns.map(c => c.id));
  const derivedEntries: JournalEntry[] = [];

  for (const v of vouchers) {
    // Skip cash payment vouchers — they should not appear in General Journal
    if (isCashPaymentVoucher(v)) continue;

    for (const line of v.lines || []) {
      const values: Record<string, string> = {};
      if (gjColIds.has('date')) values['date'] = v.date || '';
      if (gjColIds.has('particulars')) values['particulars'] = `${v.memo || ''}${line.accountName ? ` - ${line.accountName}` : ''}`;
      if (gjColIds.has('ref_no')) values['ref_no'] = v.reference || '';
      if (gjColIds.has('debit')) values['debit'] = line.debit > 0 ? Number(line.debit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      if (gjColIds.has('credit')) values['credit'] = line.credit > 0 ? Number(line.credit).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
      derivedEntries.push({ id: `${v.id}__${line.id}`, values });
    }
  }

  derivedEntries.sort((a, b) => String(a.values.date || '').localeCompare(String(b.values.date || '')));
  const entries = derivedEntries;

  // Group entries by reference number: one same ref. no = one transaction.
  // Build a display list that marks which entry is the first in its group
  // and whether a blank separator row should appear before it.
  const groupedDisplay: Array<{
    entry: JournalEntry;
    isFirstInGroup: boolean;
    needsBlankRowBefore: boolean;
  }> = [];

  const seenRefs = new Set<string>();
  let prevRef: string | null = null;

  entries.forEach((entry) => {
    const ref = String(entry.values.ref_no || '');
    const isFirstInGroup = !seenRefs.has(ref);
    const needsBlankRowBefore = isFirstInGroup && prevRef !== null && prevRef !== ref;

    if (isFirstInGroup) {
      seenRefs.add(ref);
    }

    groupedDisplay.push({ entry, isFirstInGroup, needsBlankRowBefore });
    prevRef = ref;
  });

  const filteredEntries = (periodFrom || periodTo || searchTerm)
    ? entries.filter(e => {
        const d = parseDateToISO(e.values?.date);
        if (periodFrom && d && d < periodFrom) return false;
        if (periodTo && d && d > periodTo) return false;
        if (searchTerm) {
          const haystack = Object.values(e.values || {}).join(' ').toLowerCase();
          if (!haystack.includes(searchTerm.toLowerCase())) return false;
        }
        return true;
      })
    : entries;

  // Build grouped display also for filtered entries
  const filteredGroupedDisplay: Array<{
    entry: JournalEntry;
    isFirstInGroup: boolean;
    needsBlankRowBefore: boolean;
  }> = [];

  const filteredSeenRefs = new Set<string>();
  let filteredPrevRef: string | null = null;

  filteredEntries.forEach((entry) => {
    const ref = String(entry.values.ref_no || '');
    const isFirstInGroup = !filteredSeenRefs.has(ref);
    const needsBlankRowBefore = isFirstInGroup && filteredPrevRef !== null && filteredPrevRef !== ref;

    if (isFirstInGroup) {
      filteredSeenRefs.add(ref);
    }

    filteredGroupedDisplay.push({ entry, isFirstInGroup, needsBlankRowBefore });
    filteredPrevRef = ref;
  });

  const handleSaveColumns = async (newCols: JournalColumn[]) => {
    await saveJournalColumns(currentClientId, 'GJ', newCols);
  };

  const handleSaveEntries = async (newEntries: JournalEntry[]) => {
    const previousIds = new Set<string>(entries.map(e => String(e.id)));
    const nextIds = new Set<string>(newEntries.map(e => String(e.id)));
    for (const entry of newEntries) await saveJournalEntry(currentClientId, 'GJ', entry);
    for (const id of previousIds) {
      if (!nextIds.has(id)) await deleteJournalEntry(currentClientId, 'GJ', id);
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
    const newEntry: JournalEntry = {
      id: crypto.randomUUID(),
      values: {}
    };
    handleSaveEntries([...entries, newEntry]);
  };

  const balanceEntry = () => {
    if (fullIsBalanced || entries.length === 0) return;

    const diff = Math.abs(fullTotalDr - fullTotalCr);
    if (diff < 0.01) return;

    const isDrNeeded = fullTotalDr < fullTotalCr;

    const colId = isDrNeeded
      ? (columns.find(c => c.category === 'Dr' && c.type === 'number')?.id || 'debit')
      : (columns.find(c => c.category === 'Cr' && c.type === 'number')?.id || 'credit');

    const formattedVal = diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const lastEntry = entries[entries.length - 1];
    const dateVal = lastEntry?.values?.date || '';
    const refNoVal = lastEntry?.values?.ref_no || '';

    const newValues: Record<string, string> = {};
    columns.forEach(col => {
      if (col.type !== 'number') {
        newValues[col.id] = lastEntry?.values?.[col.id] || '';
      } else {
        newValues[col.id] = '';
      }
    });

    newValues.date = dateVal;
    newValues.ref_no = refNoVal;
    newValues.particulars = 'Balancing Entry';
    newValues[colId] = formattedVal;

    const newEntry: JournalEntry = {
      id: crypto.randomUUID(),
      values: newValues
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
  const getTotals = (list: JournalEntry[] = entries) => {
    const totals: Record<string, number> = {};
    columns.forEach(c => {
      if (c.type === 'number') {
        totals[c.id] = list.reduce((sum, e) => {
          const val = parseFloat((e.values[c.id] || '').replace(/,/g, ''));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      }
    });
    return totals;
  };

  const totals = getTotals(filteredEntries);
  const fullTotals = getTotals(entries);
  const totalDr = columns.filter(c => c.category === 'Dr').reduce((s, c) => s + (totals[c.id] || 0), 0);
  const totalCr = columns.filter(c => c.category === 'Cr').reduce((s, c) => s + (totals[c.id] || 0), 0);
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01;
  const fullTotalDr = columns.filter(c => c.category === 'Dr').reduce((s, c) => s + (fullTotals[c.id] || 0), 0);
  const fullTotalCr = columns.filter(c => c.category === 'Cr').reduce((s, c) => s + (fullTotals[c.id] || 0), 0);
  const fullIsBalanced = Math.abs(fullTotalDr - fullTotalCr) < 0.01;

  // Build flat rows for desktop table rendering, including blank separator rows.
  // Each item is either { kind: 'entry', ... } or { kind: 'blank' }.
  type TableRow =
    | { kind: 'entry'; item: typeof filteredGroupedDisplay[number]; displayIdx: number }
    | { kind: 'blank'; key: string };

  const tableRows: TableRow[] = [];
  let entryCounter = 0;
  filteredGroupedDisplay.forEach((item) => {
    if (item.needsBlankRowBefore) {
      tableRows.push({ kind: 'blank', key: `blank__${item.entry.id}` });
    }
    entryCounter++;
    tableRows.push({ kind: 'entry', item, displayIdx: entryCounter });
  });

  return (
    <div className="w-full flex flex-col print-area">
      <PageHeader title="General Journal" icon={<BookText />} actions={
        <div className="flex items-center gap-2 no-print">
          <button type="button" onClick={() => generateCSV('general-journal.csv', [['Date','Ref','Particulars','Debit','Credit'], ...filteredEntries.map(e => [e.values?.date || '', e.values?.ref_no || '', e.values?.particulars || '', e.values?.debit || '', e.values?.credit || ''])])} disabled={!canExport} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed" title={canExport ? 'Export to CSV' : 'Export Data permission not granted'}>
            <FileDown className="w-4 h-4" /> Export
          </button>
          <button type="button" onClick={() => window.print()} className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity" title="Print General Journal">
            <Printer className="w-4 h-4" /> Print
          </button>
        </div>
      } />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-6">
        <div className="no-print flex flex-wrap items-center gap-3 mb-6 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider">Period</span>
          </div>
          <YearDropdownDateInput value={periodFrom} onChange={value => setPeriodFrom(value)} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-cyan-500 text-slate-900 dark:text-white" />
          <span className="text-slate-400 text-xs font-semibold">to</span>
          <YearDropdownDateInput value={periodTo} onChange={value => setPeriodTo(value)} className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-cyan-500 text-slate-900 dark:text-white" />
          <div className="relative flex-1 min-w-[160px]">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search entries…"
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
            />
          </div>
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
            <span className="text-[10px] uppercase font-bold text-slate-400 dark:text-slate-500 tracking-wider hidden md:block">From Journal Vouchers (non-cash only)</span>
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
                  placeholder="e.g. Sub-account"
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
                  <option value="None">None</option>
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
            {filteredGroupedDisplay.map(({ entry, isFirstInGroup, needsBlankRowBefore }, idx) => (
              <React.Fragment key={entry.id}>
                {needsBlankRowBefore && <div className="h-4" />}
                <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 flex flex-col gap-3 relative shadow-sm">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700/60">
                    <span className="font-mono text-xs text-slate-500 font-extrabold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">
                      {isFirstInGroup ? `Transaction: ${entry.values.ref_no || '—'}` : `  └ line`}
                    </span>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {columns.filter(c => c.isSystem).map(col => (
                      <div key={col.id} className="col-span-1">
                        <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{col.name}</label>
                        <input 
                          type="text"
                          readOnly
                          value={isFirstInGroup || (col.id !== 'date' && col.id !== 'ref_no') ? (entry.values[col.id] || '') : ''}
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
                            readOnly value={entry.values[col.id] || ''}
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
                            className="w-32 text-right bg-transparent border-b border-dashed border-slate-200 hover:border-slate-400 dark:border-slate-700/60 dark:hover:border-slate-500 focus:border-cyan-500 font-mono text-xs px-1/2 py-0.5 outline-none font-bold text-slate-800 dark:text-slate-200"
                            placeholder="0.00"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            ))}
            {filteredEntries.length === 0 && (
              <div className="py-8"><EmptyState compact icon={<BookText className="w-7 h-7" />} title="No entries yet" description="Save a non-cash Journal Voucher to populate the General Journal. Cash payment vouchers are recorded in the Cash Disbursements Journal instead." /></div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-xs text-left whitespace-nowrap min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-3 w-10 text-center">#</th>
                  {columns.map(col => (
                    <th key={col.id} className={cn("px-3 py-3", col.type === 'number' ? 'text-right' : 'text-left')}>
                      {col.name} {col.category !== 'None' ? `(${col.category})` : ''}
                    </th>
                  ))}
                  <th className="px-3 py-3 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => {
                  if (row.kind === 'blank') {
                    // One blank line before another transaction / journal entry
                    return (
                      <tr key={row.key} className="h-6 border-0">
                        <td colSpan={columns.length + 2} className="border-0"></td>
                      </tr>
                    );
                  }
                  const { entry, isFirstInGroup } = row.item;
                  return (
                    <tr key={entry.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 group border-b border-slate-100 dark:border-slate-800/50">
                      <td className="px-3 py-2 text-center text-slate-400 font-mono">
                        {isFirstInGroup ? row.displayIdx : ''}
                      </td>
                      {columns.map(col => {
                        // For DATE and REF_NO columns: only show the value on the
                        // first line of each transaction group (same ref. no = one transaction).
                        const shouldHideValue = !isFirstInGroup && (col.id === 'date' || col.id === 'ref_no');
                        const displayValue = shouldHideValue ? '' : (entry.values[col.id] || '');
                        return (
                          <td key={col.id} className="px-2 py-1">
                            <input 
                              type={col.type === 'number' ? 'text' : 'text'}
                              readOnly value={displayValue}
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
                              className={cn(
                                "w-full bg-transparent border border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 rounded px-2 py-1.5 transition-all outline-none",
                                col.type === 'number' ? "text-right font-mono" : ""
                              )}
                              placeholder={col.type === 'number' ? '0.00' : ''}
                            />
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-center"></td>
                    </tr>
                  );
                })}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-6 py-8 text-center text-slate-500">
                      No entries yet. Save a non-cash Journal Voucher to populate the General Journal. Cash payment vouchers are recorded in the Cash Disbursements Journal instead.
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
            <div className="flex items-center gap-3">
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
          </div>
        )}
      </div>
          </div>
    </div>
  );
}
