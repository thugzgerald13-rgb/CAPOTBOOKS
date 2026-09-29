// src/utils/fileParser.ts
// Reads ANY spreadsheet-style file (xlsx, xlsm, xlsb, xls, xlt*, ods, fods, csv, tsv, txt, prn, dif, slk, xml, html)
// through SheetJS, and writes edited data back out in the SAME format it was uploaded in.

import * as XLSX from 'xlsx';

export interface ImportedAccountRow {
  accountCode: string;
  accountName: string;
  amount: number;
  year: number;
  original: Record<string, string | number>;
}

export interface ImportResult {
  success: boolean;
  message: string;
  year?: number;
  data?: ImportedAccountRow[];
  warnings?: string[];
  originalFileName?: string;
  originalHeaders?: string[];
  sheetName?: string;
}

/** Every extension the import dialog accepts. */
export const SUPPORTED_EXTENSIONS = [
  '.xlsx', '.xlsm', '.xlsb', '.xls', '.xlt', '.xltx', '.xltm', '.xlw',
  '.ods', '.fods', '.csv', '.tsv', '.txt', '.prn', '.dif', '.slk', '.sylk', '.xml', '.htm', '.html',
];
export const ACCEPT_ATTR = SUPPORTED_EXTENSIONS.join(',');

export const getExtension = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

/**
 * Extension -> SheetJS bookType used when writing the file back out.
 * Template formats (.xltx etc.) cannot be written by SheetJS, so they fall back
 * to the matching regular workbook type (see resolveExportTarget).
 */
const WRITE_TYPE: Record<string, XLSX.BookType> = {
  '.xlsx': 'xlsx',
  '.xlsm': 'xlsm',
  '.xlsb': 'xlsb',
  '.xls': 'biff8',
  '.xlw': 'biff8',
  '.xlt': 'biff8',
  '.xltx': 'xlsx',
  '.xltm': 'xlsm',
  '.ods': 'ods',
  '.fods': 'fods',
  '.csv': 'csv',
  '.tsv': 'txt',
  '.txt': 'txt',
  '.prn': 'prn',
  '.dif': 'dif',
  '.slk': 'sylk',
  '.sylk': 'sylk',
  '.xml': 'xlml',
  '.htm': 'html',
  '.html': 'html',
};
const EXT_FALLBACK: Record<string, string> = { '.xltx': '.xlsx', '.xltm': '.xlsm', '.xlt': '.xls', '.xlw': '.xls' };
const TEXT_EXTS = new Set(['.csv', '.tsv', '.txt']);

const parseNumber = (val: unknown): number => {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return isFinite(val) ? val : 0;
  const s = String(val).trim();
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  const num = parseFloat(s.replace(/[^\d.]/g, ''));
  if (isNaN(num)) return 0;
  return negative ? -Math.abs(num) : num;
};

const norm = (s: string) => s.toLowerCase().replace(/[\s_.\-]/g, '');

const pick = (o: Record<string, string | number>, keys: string[]): string | number => {
  const lookup: Record<string, string> = {};
  Object.keys(o).forEach((k) => { lookup[norm(k)] = k; });
  for (const k of keys) {
    const real = lookup[norm(k)];
    if (real !== undefined && o[real] !== '' && o[real] != null) return o[real];
  }
  return '';
};

/** Re-derive the summary fields (code / name / amount) from the original columns. Used after a cell edit. */
export const deriveFields = (original: Record<string, string | number>) => ({
  accountCode: String(pick(original, ['Account Code', 'Code', 'accountCode', 'Account No', 'Account Number', 'Acct Code'])).trim(),
  accountName: String(pick(original, ['Account Name', 'Name', 'Description', 'Account Title', 'Account', 'Particulars'])).trim(),
  amount: parseNumber(pick(original, ['Amount', 'Balance', 'Total', 'Ending Balance', 'Net Amount'])),
});

const cellToValue = (c: unknown): string | number => {
  if (c == null) return '';
  if (c instanceof Date) return isNaN(c.getTime()) ? '' : c.toISOString().slice(0, 10);
  if (typeof c === 'number') return c;
  if (typeof c === 'boolean') return c ? 'TRUE' : 'FALSE';
  return String(c).trim();
};

const makeHeaders = (rawHeaders: unknown[]): string[] => {
  const seen = new Map<string, number>();
  return rawHeaders.map((h, i) => {
    let name = String(h ?? '').trim() || `Column ${i + 1}`;
    const n = seen.get(name) ?? 0;
    seen.set(name, n + 1);
    if (n > 0) name = `${name} (${n + 1})`;
    return name;
  });
};

const readWorkbook = (file: File): Promise<XLSX.WorkBook> =>
  new Promise((resolve, reject) => {
    const ext = getExtension(file.name);
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    if (TEXT_EXTS.has(ext)) {
      reader.onload = () => {
        try {
          const text = String(reader.result ?? '').replace(/^\uFEFF/, '');
          if (!text.trim()) return reject(new Error('Empty or unreadable file'));
          resolve(XLSX.read(text, { type: 'string', raw: true }));
        } catch (e) { reject(e); }
      };
      reader.readAsText(file);
    } else {
      reader.onload = () => {
        try { resolve(XLSX.read(reader.result as ArrayBuffer, { type: 'array', cellDates: true })); }
        catch (e) { reject(e); }
      };
      reader.readAsArrayBuffer(file);
    }
  });

export const parseImportedFile = async (file: File, targetYear: number): Promise<ImportResult> => {
  const ext = getExtension(file.name);
  if (ext && !SUPPORTED_EXTENSIONS.includes(ext)) {
    return {
      success: false,
      message: `Unsupported file type "${ext}". Upload an Excel/spreadsheet file (.xlsx, .xls, .xlsm, .xlsb, .ods …) or CSV/TSV/TXT.`,
    };
  }
  try {
    const wb = await readWorkbook(file);
    if (!wb.SheetNames.length) return { success: false, message: 'The file contains no sheets' };

    // Use the first sheet that actually has data.
    let sheetName = wb.SheetNames[0];
    let rows: unknown[][] = [];
    for (const name of wb.SheetNames) {
      const r = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: '', blankrows: false });
      if (r.length >= 2) { sheetName = name; rows = r; break; }
    }
    if (rows.length < 2) return { success: false, message: 'File must contain headers + at least one data row' };

    // First non-empty row = headers.
    const headerIdx = rows.findIndex((r) => r.some((c) => String(c ?? '').trim() !== ''));
    const headers = makeHeaders(rows[headerIdx]);
    const warnings: string[] = [];
    const data: ImportedAccountRow[] = [];

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const cells = rows[i].map(cellToValue);
      if (cells.every((c) => c === '')) continue;
      const original: Record<string, string | number> = {};
      headers.forEach((h, idx) => { original[h] = cells[idx] ?? ''; });
      const fields = deriveFields(original);
      if (!fields.accountName && !fields.accountCode) {
        warnings.push(`Row ${i + 1}: No account name/code — skipped`);
        continue;
      }
      data.push({ ...fields, year: targetYear, original });
    }

    if (!data.length) {
      return { success: false, message: 'No valid account rows found. Check column headers (e.g. "Account Code", "Account Name", "Amount").' };
    }
    if (wb.SheetNames.length > 1) warnings.push(`Workbook has ${wb.SheetNames.length} sheets — imported "${sheetName}".`);

    return {
      success: true,
      message: `Imported ${data.length} accounts from ${file.name}${wb.SheetNames.length > 1 ? ` (sheet "${sheetName}")` : ''}`,
      year: targetYear,
      data,
      warnings: warnings.length ? warnings : undefined,
      originalFileName: file.name,
      originalHeaders: headers,
      sheetName,
    };
  } catch (err) {
    return { success: false, message: `Could not read file: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
};

// ---------------------------------------------------------------------------
// Change tracking
// ---------------------------------------------------------------------------

const cellStr = (row: ImportedAccountRow | undefined, h: string) => String(row?.original?.[h] ?? '');

/** True if any cell of any row differs from the snapshot taken at import time. */
export const hasChanges = (
  current: ImportedAccountRow[],
  baseline: ImportedAccountRow[] | undefined,
  headers: string[],
): boolean => {
  if (!baseline) return false;
  if (current.length !== baseline.length) return true;
  return current.some((row, i) => headers.some((h) => cellStr(row, h) !== cellStr(baseline[i], h)));
};

/** Which cells changed: Set of "rowIndex|header". */
export const changedCells = (
  current: ImportedAccountRow[],
  baseline: ImportedAccountRow[] | undefined,
  headers: string[],
): Set<string> => {
  const out = new Set<string>();
  if (!baseline) return out;
  current.forEach((row, i) => {
    headers.forEach((h) => {
      if (cellStr(row, h) !== cellStr(baseline[i], h)) out.add(`${i}|${h}`);
    });
  });
  return out;
};

// ---------------------------------------------------------------------------
// Export — same format as the uploaded file
// ---------------------------------------------------------------------------

export interface ExportTarget {
  fileName: string;
  bookType: XLSX.BookType;
  note?: string;
}

export const resolveExportTarget = (
  sourceFileName: string | undefined,
  year: number,
  pageType: 'balance-sheet' | 'profit-loss',
): ExportTarget => {
  const prefix = pageType === 'balance-sheet' ? 'BalanceSheet' : 'ProfitLoss';
  if (!sourceFileName) return { fileName: `${prefix}_${year}_edited.xlsx`, bookType: 'xlsx' };

  const srcExt = getExtension(sourceFileName);
  const base = sourceFileName.slice(0, sourceFileName.length - srcExt.length) || `${prefix}_${year}`;
  let ext = srcExt;
  let note: string | undefined;
  if (EXT_FALLBACK[ext]) {
    note = `${ext} templates can't be written directly; saved as ${EXT_FALLBACK[ext]} instead.`;
    ext = EXT_FALLBACK[ext];
  }
  if (!WRITE_TYPE[ext]) {
    return { fileName: `${base}_edited.xlsx`, bookType: 'xlsx', note: `Unknown format "${srcExt}"; saved as .xlsx.` };
  }
  return { fileName: `${base}_edited${ext}`, bookType: WRITE_TYPE[ext], note };
};

const buildBlob = (
  rows: ImportedAccountRow[],
  headers: string[],
  sheetName: string,
  target: ExportTarget,
): Blob => {
  const aoa: (string | number)[][] = [headers, ...rows.map((r) => headers.map((h) => r.original?.[h] ?? ''))];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = headers.map((h) => ({
    wch: Math.min(60, Math.max(h.length, ...rows.map((r) => String(r.original?.[h] ?? '').length)) + 2),
  }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || 'Sheet1').replace(/[\\/?*[\]:]/g, '_').slice(0, 31));

  // Plain-text formats: write UTF-8 text with the same delimiter the user uploaded.
  const ext = getExtension(target.fileName);
  if (TEXT_EXTS.has(ext)) {
    const FS = ext === '.csv' ? ',' : '\t';
    const text = XLSX.utils.sheet_to_csv(ws, { FS });
    return new Blob([ext === '.csv' ? '\uFEFF' + text : text], { type: 'text/plain;charset=utf-8' });
  }
  const out = XLSX.write(wb, { bookType: target.bookType, type: 'array' });
  return new Blob([out], { type: 'application/octet-stream' });
};

const download = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Export ONE imported year, in the same format it was uploaded in. */
export const exportImportedYear = (opts: {
  rows: ImportedAccountRow[];
  headers: string[];
  year: number;
  pageType: 'balance-sheet' | 'profit-loss';
  sourceFileName?: string;
  sheetName?: string;
}): ExportTarget => {
  const target = resolveExportTarget(opts.sourceFileName, opts.year, opts.pageType);
  download(buildBlob(opts.rows, opts.headers, opts.sheetName || String(opts.year), target), target.fileName);
  return target;
};

/** Back-compat helper: now writes in the original format instead of always .xlsx. */
export const exportToExcelOriginal = (
  data: ImportedAccountRow[],
  originalHeaders: string[],
  year: number,
  pageType: 'balance-sheet' | 'profit-loss',
  sourceFileName?: string,
): void => {
  exportImportedYear({ rows: data, headers: originalHeaders, year, pageType, sourceFileName });
};
