// src/components/ImportDataModal.tsx
// Shared import modal for Balance Sheet and Profit & Loss prior-year data.
// Persists imported rows per-client in localStorage. Original file format preserved.

import { useState } from 'react';
import { X, Upload, FileUp, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { parseImportedFile } from '../utils/fileParser';
import type { ImportResult, ImportedAccountRow } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  pageLabel: string;          // "Balance Sheet" | "Profit & Loss"
  storageKey: string;         // e.g. `bs_import_${clientId}`
  onImported: (year: number) => void;
}

interface YearStore {
  rows: ImportedAccountRow[];
  importedAt: string;
  sourceFile?: string;
  originalHeaders?: string[];
}

export default function ImportDataModal({ open, onClose, pageLabel, storageKey, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [year, setYear] = useState<number>(new Date().getFullYear() - 1);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);

  if (!open) return null;

  const handleImport = async () => {
    if (!file) return;
    setBusy(true);
    setResult(null);
    const res = await parseImportedFile(file, year);
    setResult(res);
    if (res.success && res.data) {
      const existing: Record<string, YearStore> = JSON.parse(localStorage.getItem(storageKey) || '{}');
      existing[String(year)] = {
        rows: res.data,
        importedAt: new Date().toISOString(),
        sourceFile: res.originalFileName,
        originalHeaders: res.originalHeaders,
      };
      localStorage.setItem(storageKey, JSON.stringify(existing));
      setTimeout(() => {
        onImported(year);
        setFile(null);
        setResult(null);
        onClose();
      }, 900);
    }
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-2xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100">Import {pageLabel} Data</h3>
          <button onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
            <X size={20} />
          </button>
        </div>

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Year of data being imported</label>
        <input
          type="number"
          value={year}
          min={1990}
          max={2100}
          onChange={(e) => setYear(parseInt(e.target.value) || new Date().getFullYear())}
          className="mb-4 w-full rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:border-cyan-500 focus:outline-none"
        />

        <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Upload file (CSV / TSV / TXT)</label>
        <p className="mb-2 text-xs text-slate-500">Your original column names and order are preserved exactly.</p>
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 px-4 py-6 text-center hover:border-cyan-400 hover:bg-cyan-50/40 dark:hover:bg-cyan-950/20">
          <FileUp className="text-slate-400" size={28} />
          <span className="text-sm text-slate-600 dark:text-slate-300">{file ? file.name : 'Click to choose a file'}</span>
          <input
            type="file"
            accept=".csv,.tsv,.txt"
            className="hidden"
            onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }}
          />
        </label>

        {result && (
          <div className={`mt-4 rounded-lg p-3 text-sm ${result.success ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300'}`}>
            <div className="flex items-start gap-2">
              {result.success ? <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
              <div>
                <p className="font-medium">{result.message}</p>
                {result.warnings?.map((w, i) => <p key={i} className="mt-1 text-xs text-amber-600 dark:text-amber-400">• {w}</p>)}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">Cancel</button>
          <button
            onClick={handleImport}
            disabled={!file || busy}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Upload size={16} />
            {busy ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
