// src/utils/fileParser.ts
// Header-less import for ANY spreadsheet format (xlsx, xlsm, xlsb, xls, ods, csv, tsv, txt, ...).
//
// How it works (no header row required):
//   1. The whole sheet is read as a raw grid of cells, layout untouched.
//   2. Each row is scanned left-to-right for a cell whose text matches an account title (or code)
//      from the client's chart of accounts.
//   3. If the file has year labels (e.g. "2024" / "Dec 31, 2024" above the data), the column for the
//      requested year is used; otherwise the first number to the right of the title is used.
//   4. The amount is read from the SAME ROW as the matched title.
// The full grid is kept so it can be exported back in the same format, same layout, with your edits.

import * as XLSX from 'xlsx';

export type Cell = string | number;

export interface SheetData { name: string; grid: Cell[][]; }
export interface AccountRef { id: string; title: string; }

export interface ImportMatch {
  row: number;                 // 0-based row in the sheet
  titleCol: number;            // column holding the account title/code
  valueCol: number | null;     // column holding the amount for the chosen year (null = none found)
  accountId: string;           // matched GL account id ('' when unmapped)
  accountTitle: string;        // matched GL account title
  fileTitle: string;           // text exactly as written in the file
  matchType: 'exact' | 'fuzzy' | 'code' | 'unmapped';
}

export interface ImportedAccountRow {
  accountCode: string;
  accountName: string;
  amount: number;
  year: number;
  fileTitle: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  year?: number;
  warnings?: string[];
  originalFileName?: string;
  sheets?: SheetData[];
  activeSheet?: number;
  matches?: ImportMatch[];
  yearCols?: number[];
}

export const SUPPORTED_EXTENSIONS = [
  '.xlsx', '.xlsm', '.xlsb', '.xls', '.xlt', '.xltx', '.xltm', '.xlw',
  '.ods', '.fods', '.csv', '.tsv', '.txt', '.prn', '.dif', '.slk', '.sylk', '.xml', '.htm', '.html',
];
export const ACCEPT_ATTR = SUPPORTED_EXTENSIONS.join(',');

export const getExtension = (name: string): string => {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
};

const TEXT_EXTS = new Set(['.csv', '.tsv', '.txt']);

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------

const stripCurrency = (s: string) => s.trim().replace(/^(php|₱|\$|€|£)\s*/i, '');
const NUM_RE = /^\(?-?[\d,]*\.?\d+\)?-?$/;
const DASH_RE = /^[-–—]+$/;

export const isNumLike = (v: Cell | undefined, allowDash = false): boolean => {
  if (v === undefined || v === null || v === '') return false;
  if (typeof v === 'number') return isFinite(v);
  const s = stripCurrency(String(v));
  if (allowDash && DASH_RE.test(s)) return true;
  return NUM_RE.test(s) && /\d/.test(s);
};

export const parseNumber = (v: Cell | undefined): number => {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return isFinite(v) ? v : 0;
  const s = stripCurrency(String(v));
  if (DASH_RE.test(s)) return 0;
  const negative = /^\(.*\)$/.test(s) || /^-/.test(s) || /-$/.test(s);
  const n = parseFloat(s.replace(/[^\d.]/g, ''));
  if (isNaN(n)) return 0;
  return negative ? -Math.abs(n) : n;
};

const norm = (s: string): string =>
  s.toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** "0101 - Cash", "101. Cash", "Less: Allowance" -> the bare title. */
const stripDecorations = (s: string): string =>
  s.replace(/^\s*[\dA-Za-z]{0,3}[\d.\-]{2,}\s*[-–:.)]?\s+/, '')
   .replace(/^\s*(less|add|net)\s*[:\-–]\s*/i, '')
   .trim();

const tokens = (n: string) => n.split(' ').filter(Boolean);
const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  let inter = 0; A.forEach((t) => { if (B.has(t)) inter++; });
  const uni = A.size + B.size - inter;
  return uni ? inter / uni : 0;
};

// ---------------------------------------------------------------------------
// Account matching
// ---------------------------------------------------------------------------

interface Indexed { ref: AccountRef; n: string; t: string[]; }

const buildIndex = (accounts: AccountRef[]) => {
  const list: Indexed[] = accounts
    .filter((a) => a.title && a.title.trim())
    .map((a) => { const n = norm(a.title); return { ref: a, n, t: tokens(n) }; });
  const byTitle = new Map<string, AccountRef>();
  list.forEach((x) => { if (!byTitle.has(x.n)) byTitle.set(x.n, x.ref); });
  const byCode = new Map<string, AccountRef>();
  accounts.forEach((a) => { if (a.id) byCode.set(String(a.id).trim().toLowerCase(), a); });
  return { list, byTitle, byCode };
};

const matchTitle = (text: string, idx: ReturnType<typeof buildIndex>): { ref: AccountRef; type: 'exact' | 'fuzzy' } | null => {
  const variants = Array.from(new Set([norm(text), norm(stripDecorations(text))])).filter(Boolean);
  for (const v of variants) {
    const hit = idx.byTitle.get(v);
    if (hit) return { ref: hit, type: 'exact' };
  }
  // Fuzzy matching is skipped for subtotal-style lines so "Total Cash" never maps to "Cash".
  if (/^(total|net|subtotal|gross)\b/.test(variants[0] || '')) return null;
  let best: { ref: AccountRef; score: number } | null = null;
  let tie = false;
  for (const v of variants) {
    const vt = tokens(v);
    if (!vt.length) continue;
    for (const x of idx.list) {
      let score = jaccard(vt, x.t);
      const [short, long] = vt.length <= x.t.length ? [vt, x.t] : [x.t, vt];
      const contained = short.length >= 2 && short.every((t) => long.includes(t));
      if (contained) score = Math.max(score, 0.8 * (short.length / long.length) + 0.2);
      if (score < 0.75 && !(contained && short.length / long.length >= 0.6)) continue;
      if (!best || score > best.score + 1e-9) { best = { ref: x.ref, score }; tie = false; }
      else if (Math.abs(score - best.score) <= 1e-9 && best.ref !== x.ref) tie = true;
    }
  }
  return best && !tie ? { ref: best.ref, type: 'fuzzy' } : null;
};

const YEAR_RE = /(?:^|[^\d])((?:19|20)\d{2})(?!\d)/;
const yearIn = (v: Cell | undefined): number | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return v >= 1990 && v <= 2100 && Number.isInteger(v) ? v : null;
  const s = String(v).trim();
  if (s.length > 40) return null;
  const m = YEAR_RE.exec(s);
  return m ? Number(m[1]) : null;
};

// ---------------------------------------------------------------------------
// Sheet analysis
// ---------------------------------------------------------------------------

interface SheetAnalysis {
  matches: ImportMatch[];
  yearCols: number[];
  yearsFound: number[];
  unmatched: string[];
  noValue: number;
  fallbackMode: boolean;
}

const isTextCell = (v: Cell | undefined) => typeof v === 'string' && v.trim() !== '' && !isNumLike(v) && v.trim().length >= 2;

const analyzeSheet = (grid: Cell[][], year: number, accounts: AccountRef[]): SheetAnalysis => {
  const idx = buildIndex(accounts);
  const fallbackMode = idx.list.length === 0;

  // Pass 1 — find title matches (value column decided afterwards, once year columns are known)
  const found: Omit<ImportMatch, 'valueCol'>[] = [];
  grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (isTextCell(cell)) {
        const text = String(cell).trim();
        const m = fallbackMode ? null : matchTitle(text, idx);
        if (m) {
          found.push({ row: r, titleCol: c, accountId: m.ref.id, accountTitle: m.ref.title, fileTitle: text, matchType: m.type });
          return;
        }
      } else if (!fallbackMode && cell !== '' && cell !== undefined) {
        // match by account code if no title matched on this row
        const code = String(cell).trim().toLowerCase();
        const ref = idx.byCode.get(code);
        if (ref && !row.slice(c + 1).some((x, k) => isTextCell(x) && matchTitle(String(x), idx))) {
          // only accept a code match if the row has no title match further right (title match wins)
          found.push({ row: r, titleCol: c, accountId: ref.id, accountTitle: ref.title, fileTitle: String(cell).trim(), matchType: 'code' });
          return;
        }
      }
    }
  });

  const titleCols = new Set(found.map((f) => f.titleCol));
  const firstDataRow = found.length ? found[0].row : Math.min(grid.length, 20);

  // Year columns: look for year labels ABOVE the first matched row, never in a title column.
  const yearsFoundSet = new Set<number>();
  const yearColSet = new Set<number>();
  for (let r = 0; r < Math.min(firstDataRow, 25); r++) {
    grid[r].forEach((cell, c) => {
      if (titleCols.has(c)) return;
      const y = yearIn(cell);
      if (y !== null) { yearsFoundSet.add(y); if (y === year) yearColSet.add(c); }
    });
  }
  const yearCols = Array.from(yearColSet).sort((a, b) => a - b);
  const yearsFound = Array.from(yearsFoundSet).sort((a, b) => b - a);

  const valueColFor = (row: Cell[], titleCol: number): number | null => {
    if (yearCols.length) {
      for (const c of yearCols) if (c !== titleCol && isNumLike(row[c], true)) return c;
      return null;
    }
    for (let c = titleCol + 1; c < row.length; c++) if (isNumLike(row[c])) return c;
    return null;
  };

  const matches: ImportMatch[] = found.map((f) => ({ ...f, valueCol: valueColFor(grid[f.row], f.titleCol) }));

  // Fallback (no chart of accounts): any text row that has a number is treated as an account.
  if (fallbackMode) {
    grid.forEach((row, r) => {
      const tc = row.findIndex((x) => isTextCell(x));
      if (tc < 0) return;
      const vc = valueColFor(row, tc);
      if (vc === null) return;
      const text = String(row[tc]).trim();
      matches.push({ row: r, titleCol: tc, valueCol: vc, accountId: '', accountTitle: text, fileTitle: text, matchType: 'unmapped' });
    });
  }

  // Rows that look like accounts (text + amount) but did not match anything
  const matchedRows = new Set(matches.map((m) => m.row));
  const unmatched: string[] = [];
  if (!fallbackMode) {
    grid.forEach((row, r) => {
      if (matchedRows.has(r) || r < firstDataRow) return;
      const tc = row.findIndex((x) => isTextCell(x));
      if (tc < 0) return;
      const text = String(row[tc]).trim();
      if (/^(total|net|subtotal|gross)\b/i.test(text)) return;
      if (valueColFor(row, tc) !== null) unmatched.push(text);
    });
  }

  return {
    matches, yearCols, yearsFound, unmatched, fallbackMode,
    noValue: matches.filter((m) => m.valueCol === null).length,
  };
};

// ---------------------------------------------------------------------------
// Reading files
// ---------------------------------------------------------------------------

const cellToValue = (c: unknown): Cell => {
  if (c == null) return '';
  if (c instanceof Date) return isNaN(c.getTime()) ? '' : c.toISOString().slice(0, 10);
  if (typeof c === 'number') return c;
  if (typeof c === 'boolean') return c ? 'TRUE' : 'FALSE';
  return String(c).trim();
};

const sheetToGrid = (ws: XLSX.WorkSheet): Cell[][] => {
  if (!ws['!ref']) return [];
  const range = XLSX.utils.decode_range(ws['!ref']);
  // start from A1 so exports keep the original position of the data
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, {
    header: 1, raw: true, defval: '', blankrows: true,
    range: { s: { r: 0, c: 0 }, e: range.e },
  });
  const grid = rows.map((r) => r.map(cellToValue));
  const width = grid.reduce((m, r) => Math.max(m, r.length), 0);
  grid.forEach((r) => { while (r.length < width) r.push(''); });
  return grid;
};

const readWorkbook = (file: File): Promise<XLSX.WorkBook> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the file'));
    if (TEXT_EXTS.has(getExtension(file.name))) {
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

export const parseImportedFile = async (
  file: File,
  targetYear: number,
  accounts: AccountRef[] = [],
): Promise<ImportResult> => {
  const ext = getExtension(file.name);
  if (ext && !SUPPORTED_EXTENSIONS.includes(ext)) {
    return { success: false, message: `Unsupported file type "${ext}". Upload an Excel/spreadsheet file (.xlsx, .xls, .xlsm, .xlsb, .ods …) or CSV/TSV/TXT.` };
  }
  try {
    const wb = await readWorkbook(file);
    const sheets: SheetData[] = wb.SheetNames.map((name) => ({ name, grid: sheetToGrid(wb.Sheets[name]) }))
      .filter((s) => s.grid.length > 0);
    if (!sheets.length) return { success: false, message: 'The file has no data' };

    // Analyze every sheet, keep the one with the most matched accounts.
    const analyses = sheets.map((s) => analyzeSheet(s.grid, targetYear, accounts));
    let active = 0;
    analyses.forEach((a, i) => { if (a.matches.length > analyses[active].matches.length) active = i; });
    const a = analyses[active];
    const warnings: string[] = [];

    if (!a.matches.length) {
      return {
        success: false,
        message: a.fallbackMode
          ? 'No account rows with amounts were found in the file.'
          : 'No account titles in the file matched this client\'s chart of accounts.',
      };
    }

    // The file labels years, but not the one requested -> do not silently import the wrong year.
    if (!a.yearCols.length && a.yearsFound.length) {
      return {
        success: false,
        message: `The file has data for ${a.yearsFound.join(', ')} but no column for ${targetYear}. Change the year or check the file.`,
      };
    }

    if (a.yearCols.length) {
      // (nothing to warn — year column located)
    } else {
      warnings.push(`No year label found in the file — used the first amount to the right of each account title.`);
    }
    if (a.fallbackMode) warnings.push('This client has no chart of accounts yet — every row with an amount was imported as-is.');
    if (a.noValue) warnings.push(`${a.noValue} matched account${a.noValue > 1 ? 's' : ''} had no amount for ${targetYear}.`);
    if (a.unmatched.length) {
      const shown = a.unmatched.slice(0, 5).join(', ');
      warnings.push(`${a.unmatched.length} row${a.unmatched.length > 1 ? 's' : ''} not matched to any account: ${shown}${a.unmatched.length > 5 ? '…' : ''}`);
    }
    if (sheets.length > 1) warnings.push(`Workbook has ${sheets.length} sheets — used "${sheets[active].name}" (best match).`);

    return {
      success: true,
      message: `Matched ${a.matches.length} account${a.matches.length > 1 ? 's' : ''} for ${targetYear}`,
      year: targetYear,
      warnings: warnings.length ? warnings : undefined,
      originalFileName: file.name,
      sheets,
      activeSheet: active,
      matches: a.matches,
      yearCols: a.yearCols,
    };
  } catch (err) {
    return { success: false, message: `Could not read file: ${err instanceof Error ? err.message : 'Unknown error'}` };
  }
};

/** Amount for each matched account, read live from the (possibly edited) grid. */
export const extractRows = (grid: Cell[][], matches: ImportMatch[], year: number): ImportedAccountRow[] =>
  matches.map((m) => ({
    accountCode: m.accountId,
    accountName: m.accountTitle,
    amount: m.valueCol === null ? 0 : parseNumber(grid[m.row]?.[m.valueCol]),
    year,
    fileTitle: m.fileTitle,
  }));

// ---------------------------------------------------------------------------
// Change tracking
// ---------------------------------------------------------------------------

const cs = (g: Cell[][] | undefined, r: number, c: number) => String(g?.[r]?.[c] ?? '');

export const changedCells = (grid: Cell[][], baseline: Cell[][] | undefined): Set<string> => {
  const out = new Set<string>();
  if (!baseline) return out;
  const rows = Math.max(grid.length, baseline.length);
  for (let r = 0; r < rows; r++) {
    const cols = Math.max(grid[r]?.length ?? 0, baseline[r]?.length ?? 0);
    for (let c = 0; c < cols; c++) if (cs(grid, r, c) !== cs(baseline, r, c)) out.add(`${r}|${c}`);
  }
  return out;
};

export const hasChanges = (grid: Cell[][], baseline: Cell[][] | undefined): boolean => {
  if (!baseline) return false;
  return changedCells(grid, baseline).size > 0;
};

// ---------------------------------------------------------------------------
// Export — same format AND same layout as the uploaded file
// ---------------------------------------------------------------------------

const WRITE_TYPE: Record<string, XLSX.BookType> = {
  '.xlsx': 'xlsx', '.xlsm': 'xlsm', '.xlsb': 'xlsb', '.xls': 'biff8', '.xlw': 'biff8', '.xlt': 'biff8',
  '.xltx': 'xlsx', '.xltm': 'xlsm', '.ods': 'ods', '.fods': 'fods',
  '.csv': 'csv', '.tsv': 'txt', '.txt': 'txt', '.prn': 'prn', '.dif': 'dif',
  '.slk': 'sylk', '.sylk': 'sylk', '.xml': 'xlml', '.htm': 'html', '.html': 'html',
};
const EXT_FALLBACK: Record<string, string> = { '.xltx': '.xlsx', '.xltm': '.xlsm', '.xlt': '.xls', '.xlw': '.xls' };

export interface ExportTarget { fileName: string; bookType: XLSX.BookType; note?: string; }

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
  if (EXT_FALLBACK[ext]) { note = `${ext} templates can't be written directly; saved as ${EXT_FALLBACK[ext]}.`; ext = EXT_FALLBACK[ext]; }
  if (!WRITE_TYPE[ext]) return { fileName: `${base}_edited.xlsx`, bookType: 'xlsx', note: `Unknown format "${srcExt}"; saved as .xlsx.` };
  return { fileName: `${base}_edited${ext}`, bookType: WRITE_TYPE[ext], note };
};

const safeSheetName = (n: string, i: number) => (n || `Sheet${i + 1}`).replace(/[\\/?*[\]:]/g, '_').slice(0, 31);

const buildBlob = (sheets: SheetData[], activeSheet: number, grid: Cell[][], target: ExportTarget): Blob => {
  const ext = getExtension(target.fileName);
  const activeWs = XLSX.utils.aoa_to_sheet(grid);
  if (TEXT_EXTS.has(ext)) {
    const text = XLSX.utils.sheet_to_csv(activeWs, { FS: ext === '.csv' ? ',' : '\t' });
    return new Blob([ext === '.csv' ? '\uFEFF' + text : text], { type: 'text/plain;charset=utf-8' });
  }
  const wb = XLSX.utils.book_new();
  sheets.forEach((s, i) => {
    XLSX.utils.book_append_sheet(wb, i === activeSheet ? activeWs : XLSX.utils.aoa_to_sheet(s.grid), safeSheetName(s.name, i));
  });
  const out = XLSX.write(wb, { bookType: target.bookType, type: 'array' });
  return new Blob([out], { type: 'application/octet-stream' });
};

const download = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = fileName;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};

/** Export ONE imported year in the same format and layout it was uploaded in. */
export const exportImportedYear = (opts: {
  sheets: SheetData[];
  activeSheet: number;
  year: number;
  pageType: 'balance-sheet' | 'profit-loss';
  sourceFileName?: string;
}): ExportTarget => {
  const target = resolveExportTarget(opts.sourceFileName, opts.year, opts.pageType);
  const grid = opts.sheets[opts.activeSheet].grid;
  download(buildBlob(opts.sheets, opts.activeSheet, grid, target), target.fileName);
  return target;
};
