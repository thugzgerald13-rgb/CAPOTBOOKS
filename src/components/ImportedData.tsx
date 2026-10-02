import { usePermission } from '../lib/teamPermissions';
// src/components/ImportedData.tsx
// Shared by Balance Sheet and Profit & Loss.
//  - useImportedData(): per-client store of imported years (localStorage) with edit + change tracking
//  - ImportedDataToolbar: year picker, import button, "Export Changed Files" button
//  - ImportedDataTable: matched accounts (amount editable) + the full original sheet (editable),
//    exported in the ORIGINAL uploaded format and layout.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, Download, RotateCcw, Trash2 } from 'lucide-react';
import type { Cell, ImportMatch, SheetData, UnmatchedRow } from '../utils/fileParser';
import {
  changedCells, exportImportedYear, extractRows, getExtension, hasChanges, parseNumber,
} from '../utils/fileParser';
import { formatAccountAmount } from '../lib/accountingBalances';

export interface YearStore {
  importedAt: string;
  sourceFile?: string;
  sheets: SheetData[];
  activeSheet: number;
  baseline: Cell[][];            // untouched copy of the active sheet, used to detect edits
  matches: ImportMatch[];
  yearCols: number[];
  unmatched?: UnmatchedRow[];   // titles in the file with an amount that matched NO chart-of-accounts account
}
export type PageType = 'balance-sheet' | 'profit-loss';

const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

const readStore = (key: string): Record<string, YearStore> => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || '{}') as Record<string, any>;
    const out: Record<string, YearStore> = {};
    // entries saved by the older header-based import have no `sheets` — ignore them
    Object.keys(raw).forEach((k) => { if (raw[k] && Array.isArray(raw[k].sheets)) out[k] = raw[k]; });
    return out;
  } catch { return {}; }
};

export function useImportedData(storageKey: string) {
  const [store, setStore] = useState<Record<string, YearStore>>({});
  const [selectedYear, setSelectedYear] = useState<number | null>(null);

  const reload = useCallback(() => setStore(readStore(storageKey)), [storageKey]);
  useEffect(() => { reload(); setSelectedYear(null); }, [storageKey, reload]);

  const persist = (next: Record<string, YearStore>) => {
    try { localStorage.setItem(storageKey, JSON.stringify(next)); } catch { /* quota */ }
    setStore(next);
  };

  const years = useMemo(() => Object.keys(store).map(Number).sort((a, b) => b - a), [store]);
  const changedYears = useMemo(
    () => years.filter((y) => {
      const e = store[String(y)];
      return e && hasChanges(e.sheets[e.activeSheet].grid, e.baseline);
    }),
    [years, store],
  );

  const updateCell = (year: number, r: number, c: number, raw: string) => {
    const entry = store[String(year)];
    if (!entry) return;
    const sheets = entry.sheets.map((s, si) => {
      if (si !== entry.activeSheet) return s;
      const grid = s.grid.map((row, ri) => {
        if (ri !== r) return row;
        const next = row.slice();
        const prev = next[c];
        const t = raw.trim();
        // keep numeric cells numeric so the exported spreadsheet still calculates
        next[c] = typeof prev === 'number' && t !== '' && !isNaN(Number(t.replace(/,/g, ''))) ? Number(t.replace(/,/g, '')) : raw;
        return next;
      });
      return { ...s, grid };
    });
    persist({ ...store, [String(year)]: { ...entry, sheets } });
  };

  const resetYear = (year: number) => {
    const entry = store[String(year)];
    if (!entry) return;
    const sheets = entry.sheets.map((s, si) => (si === entry.activeSheet ? { ...s, grid: clone(entry.baseline) } : s));
    persist({ ...store, [String(year)]: { ...entry, sheets } });
  };

  const removeYear = (year: number) => {
    const next = { ...store };
    delete next[String(year)];
    persist(next);
    if (selectedYear === year) setSelectedYear(null);
  };

  /**
   * Live amounts (account id -> amount) for an imported year, read from the current — possibly edited — sheet.
   * Returns null when nothing was imported for that year, so callers fall back to the ledger.
   */
  const amountsFor = useCallback((year: number): Map<string, number> | null => {
    const e = store[String(year)];
    if (!e) return null;
    const map = new Map<string, number>();
    extractRows(e.sheets[e.activeSheet].grid, e.matches, year).forEach((r) => {
      if (r.accountCode) map.set(r.accountCode, (map.get(r.accountCode) ?? 0) + r.amount);
    });
    return map;
  }, [store]);

  /** Grid cell (row, col) holding a matched account's amount for an imported year — null if not imported. */
  const cellFor = useCallback((year: number, accountId: string): { row: number; col: number } | null => {
    const e = store[String(year)];
    if (!e) return null;
    const m = e.matches.find((x) => x.accountId === accountId && x.valueCol !== null);
    return m ? { row: m.row, col: m.valueCol as number } : null;
  }, [store]);

  /** Unmatched titles (not in chart of accounts) with their live amounts for an imported year. */
  const unmatchedFor = useCallback((year: number): { title: string; amount: number; row: number; col: number | null }[] => {
    const e = store[String(year)];
    if (!e || !e.unmatched?.length) return [];
    const grid = e.sheets[e.activeSheet].grid;
    return e.unmatched.map((u) => ({
      title: u.title,
      amount: u.valueCol === null ? 0 : parseNumber(grid[u.row]?.[u.valueCol]),
      row: u.row,
      col: u.valueCol,
    }));
  }, [store]);

  return { store, years, changedYears, selectedYear, setSelectedYear, reload, updateCell, resetYear, removeYear, amountsFor, cellFor, unmatchedFor };
}

type ImportedApi = ReturnType<typeof useImportedData>;

/**
 * One amount cell inside the report. When the year was imported and this account matched, the cell
 * becomes an inline <input> writing straight back into the imported sheet — so edits are tracked and
 * exported. Otherwise it renders as plain formatted text (the ledger number).
 */
export function ReportAmount({ api, year, accountId, value, className }: {
  api: ImportedApi; year: number; accountId: string; value: number; className?: string;
}) {
  const canEdit = usePermission('edit_transactions');
  const cell = api.cellFor(year, accountId);
  if (!cell) {
    return <td className={className}>{formatAccountAmount(value)}</td>;
  }
  const entry = api.store[String(year)];
  const grid = entry?.sheets?.[entry.activeSheet]?.grid;
  const raw = String(grid?.[cell.row]?.[cell.col] ?? '');
  return (
    <td className={`p-0 ${className ?? ''}`}>
      <input
        value={raw}
        onChange={(e) => api.updateCell(year, cell.row, cell.col, e.target.value)}
        disabled={!canEdit}
        className="w-full min-w-[4.5rem] bg-transparent px-2 py-1.5 text-right font-mono text-slate-700 dark:text-slate-300 focus:bg-cyan-50 dark:focus:bg-cyan-950/30 focus:outline-none disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
        aria-label={`${accountId} amount for ${year}`}
        title={canEdit ? 'Imported — click to edit; changes export back to the original file' : 'Edit Transactions permission not granted'}
      />
    </td>
  );
}

/**
 * Rows from the imported file whose title matched NO account in the chart of accounts.
 * Inserted into the report as a clearly-labeled section (not included in the totals above).
 * Amounts are inline-editable like matched accounts.
 */
export function UnmatchedRowsSection({ api, year, priorYear }: { api: ImportedApi; year: number; priorYear: number }) {
  const canEdit = usePermission('edit_transactions');
  const rows = api.unmatchedFor(year);
  if (!rows.length) return null;
  const entry = api.store[String(year)];
  const grid = entry?.sheets?.[entry.activeSheet]?.grid;
  return (
    <section>
      <div className="uppercase mb-1 font-bold text-amber-700 dark:text-amber-400">
        Imported — not in chart of accounts ({rows.length})
      </div>
      <div className="text-[11px] text-slate-500 mb-2">
        These titles were found in the imported file but do not match any account. They are shown for reference only and are NOT included in the totals above. Click an amount to edit — edits export back to the file.
      </div>
      <div className="overflow-x-auto rounded-lg border border-amber-200 dark:border-amber-900/60">
        <table className="w-full text-xs">
          <thead className="bg-amber-50/60 dark:bg-amber-950/30">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-amber-700 dark:text-amber-400">Account title (as in file)</th>
              <th className="w-32 px-3 py-2 text-right font-semibold text-amber-700 dark:text-amber-400">{year}</th>
              <th className="w-32 px-3 py-2 text-right font-semibold text-amber-700/70 dark:text-amber-400/70">{priorYear}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-amber-100 dark:border-amber-950/40 bg-amber-50/30 dark:bg-amber-950/10">
                <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{r.title}</td>
                {r.col === null ? (
                  <td className="w-32 px-3 py-1.5 text-right font-mono text-slate-400">—</td>
                ) : (
                  <td className="w-32 p-0">
                    <input
                      value={String(grid?.[r.row]?.[r.col] ?? '')}
                      onChange={(e) => api.updateCell(year, r.row, r.col as number, e.target.value)}
                      disabled={!canEdit}
                      className="w-full min-w-[4.5rem] bg-transparent px-2 py-1.5 text-right font-mono text-slate-700 dark:text-slate-300 focus:bg-cyan-50 dark:focus:bg-cyan-950/30 focus:outline-none disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                      aria-label={`${r.title} amount for ${year}`}
                      title={canEdit ? 'Imported — click to edit; changes export back to the original file' : 'Edit Transactions permission not granted'}
                    />
                  </td>
                )}
                <td className="w-32 px-3 py-1.5 text-right font-mono text-slate-400">—</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** One file per edited year, each in the format it was uploaded in. Unchanged years are skipped. */
const exportChanged = (api: ImportedApi, pageType: PageType) => {
  api.changedYears.forEach((y, i) => {
    const e = api.store[String(y)];
    setTimeout(() => exportImportedYear({
      sheets: e.sheets, activeSheet: e.activeSheet, year: y, pageType, sourceFileName: e.sourceFile,
    }), i * 500); // stagger so the browser allows several downloads
  });
};

const colLetter = (i: number) => {
  let s = ''; let n = i;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
};
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function ImportedDataToolbar({
  api, pageType, onImportClick,
}: { api: ImportedApi; pageType: PageType; onImportClick: () => void }) {
  const canEdit = usePermission('edit_transactions');
  const canExport = usePermission('export_data');
  return (
    <>
      {api.years.length > 0 && (
        <select
          value={api.selectedYear ?? ''}
          onChange={(e) => api.setSelectedYear(e.target.value ? Number(e.target.value) : null)}
          className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:border-cyan-500 focus:outline-none"
          aria-label="View imported year"
        >
          <option value="">View imported year…</option>
          {api.years.map((y) => <option key={y} value={y}>{y}{api.changedYears.includes(y) ? ' •edited' : ''}</option>)}
        </select>
      )}
      <button type="button" onClick={onImportClick} disabled={!canEdit}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
        title={canEdit ? 'Import Prior-Year Data' : 'Edit Transactions permission not granted'}>
        <Upload className="w-3.5 h-3.5" /> Import Prior-Year Data
      </button>
      {api.changedYears.length > 0 && (
        <button type="button" onClick={() => exportChanged(api, pageType)} disabled={!canExport}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
          title={canExport ? "Downloads one file per edited year, in the format it was uploaded in. Unchanged years are not exported." : 'Export Data permission not granted'}>
          <Download className="w-3.5 h-3.5" /> Export Changed Files ({api.changedYears.length})
        </button>
      )}
    </>
  );
}

/** Report-year picker. Picking an imported year makes the report show that year (with the file's numbers). */
export function ReportYearSelect({
  year, glYear, importedYears, onChange,
}: { year: number; glYear: number; importedYears: number[]; onChange: (y: number) => void }) {
  const options = Array.from(new Set([glYear, glYear - 1, ...importedYears, ...importedYears.map((y) => y + 1)]))
    .sort((a, b) => b - a);
  return (
    <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
      Report year
      <select
        value={year}
        onChange={(e) => onChange(Number(e.target.value))}
        className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:border-cyan-500 focus:outline-none"
        aria-label="Report year"
      >
        {options.map((y) => <option key={y} value={y}>{y}{importedYears.includes(y) ? ' (imported)' : ''}</option>)}
      </select>
    </label>
  );
}

const MAX_GRID_ROWS = 500;

export function ImportedDataTable({ api, pageType }: { api: ImportedApi; pageType: PageType }) {
  const canEdit = usePermission('edit_transactions');
  const canExport = usePermission('export_data');

  const year = api.selectedYear;
  const entry = year !== null ? api.store[String(year)] : undefined;
  if (year === null || !entry) return null;

  const sheet = entry.sheets[entry.activeSheet];
  const grid = sheet.grid;
  const changed = changedCells(grid, entry.baseline);
  const isChanged = changed.size > 0;
  const ext = entry.sourceFile ? getExtension(entry.sourceFile) : '.xlsx';
  const rows = extractRows(grid, entry.matches, year);
  const titleCells = new Set(entry.matches.map((m) => `${m.row}|${m.titleCol}`));
  const valueCells = new Set(entry.matches.filter((m) => m.valueCol !== null).map((m) => `${m.row}|${m.valueCol}`));
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <div>
          <div className="uppercase font-bold">Imported Data — {year}</div>
          <div className="text-[11px] text-slate-500">
            {entry.sourceFile || 'uploaded file'} · exports as <span className="font-mono">{ext}</span>
            {isChanged ? ` · ${changed.size} cell${changed.size > 1 ? 's' : ''} edited` : ' · no changes'}
          </div>
        </div>
        <div className="flex items-center gap-2 no-print">
          <button type="button" disabled={!isChanged || !canExport}
            onClick={() => exportImportedYear({ sheets: entry.sheets, activeSheet: entry.activeSheet, year, pageType, sourceFileName: entry.sourceFile })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
            title={canExport ? (isChanged ? 'Download this year in its original format' : 'Nothing to export — no changes were made') : 'Export Data permission not granted'}>
            <Download className="w-3.5 h-3.5" /> Export {ext}
          </button>
          <button type="button" disabled={!isChanged || !canEdit} onClick={() => api.resetYear(year)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
            title={canEdit ? (isChanged ? 'Reset imported changes' : 'No changes to reset') : 'Edit Transactions permission not granted'}>
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button type="button" aria-label="Remove imported year" disabled={!canEdit}
            onClick={() => { if (window.confirm(`Remove imported ${year} data?`)) api.removeYear(year); }}
            className="inline-flex items-center px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed"
            title={canEdit ? 'Remove imported year' : 'Edit Transactions permission not granted'}>
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => api.setSelectedYear(null)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Hide</button>
        </div>
      </div>

      {/* Matched accounts — amount for the chosen year, read from the same row as the title */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Account (in file)</th>
              <th className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300">Matched account</th>
              <th className="px-3 py-2 text-right font-semibold text-slate-600 dark:text-slate-300">{year}</th>
            </tr>
          </thead>
          <tbody>
            {entry.matches.map((m, i) => {
              const edited = m.valueCol !== null && changed.has(`${m.row}|${m.valueCol}`);
              return (
                <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-1.5 text-slate-700 dark:text-slate-300">{m.fileTitle}</td>
                  <td className="px-3 py-1.5 text-slate-500">
                    {m.accountId && !m.accountId.startsWith('__') ? `${m.accountId} — ` : ''}{m.accountTitle}
                    {m.matchType === 'fuzzy' && <span className="ml-1 text-[10px] text-amber-600">(approx.)</span>}
                  </td>
                  <td className={`p-0 ${edited ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
                    {m.valueCol === null ? (
                      <div className="px-3 py-1.5 text-right text-slate-400">no amount</div>
                    ) : (
                      <input
                        value={String(grid[m.row]?.[m.valueCol] ?? '')}
                        onChange={(e) => api.updateCell(year, m.row, m.valueCol as number, e.target.value)}
                        disabled={!canEdit}
                        className="w-full min-w-[8rem] bg-transparent px-3 py-1.5 text-right font-mono text-slate-700 dark:text-slate-300 focus:bg-cyan-50 dark:focus:bg-cyan-950/30 focus:outline-none disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                        aria-label={`${m.fileTitle} amount for ${year}`}
                        title={canEdit ? 'Click to edit; changes export back to the original file' : 'Edit Transactions permission not granted'}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
            <tr className="border-t border-slate-300 dark:border-slate-600 font-bold">
              <td className="px-3 py-1.5" colSpan={2}>Sum of matched amounts</td>
              <td className="px-3 py-1.5 text-right font-mono">{fmt(rows.reduce((n, r) => n + r.amount, 0))}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Full original sheet */}
      <details className="mt-3 no-print">
        <summary className="cursor-pointer text-xs font-semibold text-slate-500">
          Show full sheet "{sheet.name}" ({grid.length} rows × {width} columns) — editable
        </summary>
        <div className="mt-2 max-h-[28rem] overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="px-2 py-1 text-slate-400">#</th>
                {Array.from({ length: width }, (_, c) => (
                  <th key={c} className="px-2 py-1 text-center font-semibold text-slate-400">{colLetter(c)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.slice(0, MAX_GRID_ROWS).map((row, r) => (
                <tr key={r} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-2 py-1 text-center text-slate-400">{r + 1}</td>
                  {Array.from({ length: width }, (_, c) => {
                    const key = `${r}|${c}`;
                    const cls = changed.has(key) ? 'bg-amber-100 dark:bg-amber-950/40'
                      : valueCells.has(key) ? 'bg-blue-50 dark:bg-blue-950/30'
                      : titleCells.has(key) ? 'bg-emerald-50 dark:bg-emerald-950/30' : '';
                    return (
                      <td key={c} className={`p-0 ${cls}`}>
                        <input
                          value={String(row[c] ?? '')}
                          onChange={(e) => api.updateCell(year, r, c, e.target.value)}
                          disabled={!canEdit}
                          className="w-full min-w-[6rem] bg-transparent px-2 py-1 font-mono text-slate-700 dark:text-slate-300 focus:bg-cyan-50 dark:focus:bg-cyan-950/30 focus:outline-none disabled:opacity-50 disabled:grayscale disabled:cursor-not-allowed"
                          aria-label={`${colLetter(c)}${r + 1}`}
                          title={canEdit ? undefined : 'Edit Transactions permission not granted'}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">
          <span className="inline-block w-2 h-2 bg-emerald-200 mr-1" />matched title
          <span className="inline-block w-2 h-2 bg-blue-200 mx-1 ml-3" />amount for {year}
          <span className="inline-block w-2 h-2 bg-amber-300 mx-1 ml-3" />edited
          {grid.length > MAX_GRID_ROWS && ` · showing first ${MAX_GRID_ROWS} rows (the export includes all rows)`}
        </p>
      </details>
    </section>
  );
}
