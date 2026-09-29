// src/components/ImportedData.tsx
// Shared by Balance Sheet and Profit & Loss:
//  - useImportedData(): per-client store of imported years (localStorage) with edit + change tracking
//  - ImportedDataToolbar: year picker, import button, "Export changed files" button
//  - ImportedDataTable: editable table of the selected year, exports in the ORIGINAL uploaded format

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Upload, Download, RotateCcw, Trash2 } from 'lucide-react';
import type { ImportedAccountRow } from '../utils/fileParser';
import {
  changedCells, deriveFields, exportImportedYear, getExtension, hasChanges,
} from '../utils/fileParser';

export interface YearStore {
  rows: ImportedAccountRow[];
  baseline?: ImportedAccountRow[];   // snapshot at import time, used to detect changes
  importedAt: string;
  sourceFile?: string;
  sheetName?: string;
  originalHeaders?: string[];
}
export type PageType = 'balance-sheet' | 'profit-loss';

const readStore = (key: string): Record<string, YearStore> => {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
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
      return e && hasChanges(e.rows, e.baseline, e.originalHeaders || []);
    }),
    [years, store],
  );

  const updateCell = (year: number, rowIdx: number, header: string, raw: string) => {
    const next = { ...store };
    const entry = next[String(year)];
    if (!entry) return;
    const rows = entry.rows.map((r, i) => {
      if (i !== rowIdx) return r;
      const prev = r.original?.[header];
      const trimmed = raw.trim();
      // keep numeric cells numeric so Excel formats still work on export
      const value: string | number =
        typeof prev === 'number' && trimmed !== '' && !isNaN(Number(trimmed.replace(/,/g, '')))
          ? Number(trimmed.replace(/,/g, ''))
          : raw;
      const original = { ...(r.original || {}), [header]: value };
      return { ...r, original, ...deriveFields(original) };
    });
    next[String(year)] = { ...entry, rows };
    persist(next);
  };

  const resetYear = (year: number) => {
    const entry = store[String(year)];
    if (!entry?.baseline) return;
    persist({ ...store, [String(year)]: { ...entry, rows: entry.baseline.map((r) => ({ ...r, original: { ...(r.original || {}) } })) } });
  };

  const removeYear = (year: number) => {
    const next = { ...store };
    delete next[String(year)];
    persist(next);
    if (selectedYear === year) setSelectedYear(null);
  };

  return { store, years, changedYears, selectedYear, setSelectedYear, reload, updateCell, resetYear, removeYear };
}

type ImportedApi = ReturnType<typeof useImportedData>;

/** Export every changed year as its own file, each in the format it was uploaded in. Unchanged years are skipped. */
const exportChanged = (api: ImportedApi, pageType: PageType): string[] => {
  const names: string[] = [];
  api.changedYears.forEach((y, i) => {
    const e = api.store[String(y)];
    setTimeout(() => {
      exportImportedYear({
        rows: e.rows, headers: e.originalHeaders || [], year: y, pageType,
        sourceFileName: e.sourceFile, sheetName: e.sheetName,
      });
    }, i * 500); // stagger so the browser doesn't block multiple downloads
    names.push(`${y}`);
  });
  return names;
};

export function ImportedDataToolbar({
  api, pageType, onImportClick,
}: { api: ImportedApi; pageType: PageType; onImportClick: () => void }) {
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
          {api.years.map((y) => (
            <option key={y} value={y}>{y}{api.changedYears.includes(y) ? ' •edited' : ''}</option>
          ))}
        </select>
      )}
      <button
        type="button"
        onClick={onImportClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
      >
        <Upload className="w-3.5 h-3.5" /> Import Prior-Year Data
      </button>
      {api.changedYears.length > 0 && (
        <button
          type="button"
          onClick={() => exportChanged(api, pageType)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
          title="Downloads one file per edited year, in the same format it was uploaded in. Unchanged years are not exported."
        >
          <Download className="w-3.5 h-3.5" /> Export Changed Files ({api.changedYears.length})
        </button>
      )}
    </>
  );
}

export function ImportedDataTable({ api, pageType }: { api: ImportedApi; pageType: PageType }) {
  const year = api.selectedYear;
  const entry = year !== null ? api.store[String(year)] : undefined;
  if (year === null || !entry || !entry.rows.length) return null;

  const headers = entry.originalHeaders || [];
  const changed = changedCells(entry.rows, entry.baseline, headers);
  const isChanged = changed.size > 0;
  const ext = entry.sourceFile ? getExtension(entry.sourceFile) : '.xlsx';

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
          <button
            type="button"
            disabled={!isChanged}
            onClick={() => exportImportedYear({
              rows: entry.rows, headers, year, pageType,
              sourceFileName: entry.sourceFile, sheetName: entry.sheetName,
            })}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-40 disabled:cursor-not-allowed"
            title={isChanged ? 'Download this year in its original format' : 'Nothing to export — no changes were made'}
          >
            <Download className="w-3.5 h-3.5" /> Export {ext}
          </button>
          <button
            type="button"
            disabled={!isChanged}
            onClick={() => api.resetYear(year)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 disabled:opacity-40"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Reset
          </button>
          <button
            type="button"
            onClick={() => { if (window.confirm(`Remove imported ${year} data?`)) api.removeYear(year); }}
            className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg"
            aria-label="Remove imported year"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
          <button type="button" onClick={() => api.setSelectedYear(null)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Hide</button>
        </div>
      </div>
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
        <table className="w-full text-xs">
          <thead className="bg-slate-50 dark:bg-slate-800">
            <tr>
              {headers.map((h) => (
                <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entry.rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                {headers.map((h) => {
                  const edited = changed.has(`${i}|${h}`);
                  return (
                    <td key={h} className={`p-0 ${edited ? 'bg-amber-50 dark:bg-amber-950/30' : ''}`}>
                      <input
                        value={String(r.original?.[h] ?? '')}
                        onChange={(e) => api.updateCell(year, i, h, e.target.value)}
                        className="w-full min-w-[6rem] bg-transparent px-3 py-1.5 font-mono text-slate-700 dark:text-slate-300 focus:bg-cyan-50 dark:focus:bg-cyan-950/30 focus:outline-none"
                        aria-label={`${h}, row ${i + 1}`}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
