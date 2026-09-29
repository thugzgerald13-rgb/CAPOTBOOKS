// src/utils/fileParser.ts
// Parses imported CSV/TSV/TXT files. Every original column is preserved on each
// row (row.original["Your Header"]) so the uploaded file's format prevails.

import type { ImportedAccountRow, ImportResult } from '../types';

const CODE_H = ['account code', 'code', 'accountcode', 'acct code', 'account no', 'account number'];
const NAME_H = ['account name', 'name', 'accountname', 'description', 'account title', 'particulars', 'account'];
const AMOUNT_H = ['amount', 'balance', 'total', 'value', 'amount (php)', 'amount php', 'amount(php)', 'ending balance', 'amount php (p)'];

const norm = (s: string) => s.trim().toLowerCase();
const findH = (headers: string[], cands: string[]) => headers.find((h) => cands.includes(norm(h)));

const parseAmount = (raw: string): number => {
  const cleaned = String(raw ?? '').replace(/[,₱$%\s]/g, '').replace(/\(([^)]+)\)/, '-$1');
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
};

export const parseImportedFile = (file: File, targetYear: number): Promise<ImportResult> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    const warnings: string[] = [];

    reader.onload = (e) => {
      try {
        const text = String(e.target?.result ?? '');
        if (!text.trim()) { resolve({ success: false, message: 'File is empty or unreadable.' }); return; }

        const fle = text.search(/\r?\n/);
        const firstLine = fle >= 0 ? text.slice(0, fle) : text.slice(0, 1000);
        const delim = firstLine.includes('\t') ? '\t' : firstLine.includes(';') ? ';' : ',';

        const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
        if (lines.length < 2) { resolve({ success: false, message: 'File must have a header row and at least one data row.' }); return; }

        const headers = lines[0].split(delim).map((h) => h.trim());
        const codeH = findH(headers, CODE_H);
        const nameH = findH(headers, NAME_H);
        const amtH = findH(headers, AMOUNT_H);

        if (!nameH && !codeH) {
          resolve({ success: false, message: 'No account name/code column found. Expected one of: "Account Name", "Name", "Description", "Account Code", "Code".' });
          return;
        }
        if (!amtH) warnings.push('No amount column ("Amount"/"Balance"/"Total") detected — amounts will default to 0.');

        const rows: ImportedAccountRow[] = [];
        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(delim).map((c) => c.trim());
          if (cells.every((c) => !c)) continue;
          const original: Record<string, string> = {};
          headers.forEach((h, idx) => { original[h] = cells[idx] ?? ''; });

          const accountCode = codeH ? original[codeH] : '';
          const accountName = nameH ? original[nameH] : '';
          const amount = amtH ? parseAmount(original[amtH]) : 0;
          if (!accountName && !accountCode) { warnings.push(`Row ${i + 1}: no account name/code — skipped.`); continue; }

          rows.push({ accountCode, accountName, amount, year: targetYear, original });
        }

        if (!rows.length) { resolve({ success: false, message: 'No valid data rows found.' }); return; }

        resolve({
          success: true,
          message: `Imported ${rows.length} row(s) for year ${targetYear}.`,
          year: targetYear,
          data: rows,
          warnings: warnings.length ? warnings : undefined,
          originalFileName: file.name,
          originalHeaders: headers,
        });
      } catch (err) {
        resolve({ success: false, message: `Parse error: ${err instanceof Error ? err.message : String(err)}` });
      }
    };
    reader.onerror = () => resolve({ success: false, message: 'Could not read the selected file.' });
    reader.readAsText(file);
  });

// Re-export preserving the original column order — format prevails on export too.
export const toCSV = (rows: ImportedAccountRow[], originalHeaders?: string[]): string => {
  const headers = originalHeaders?.length ? originalHeaders : ['Account Code', 'Account Name', 'Amount'];
  const body = rows.map((r) =>
    headers.map((h) => {
      const v = r.original?.[h] ?? (norm(h).includes('code') ? r.accountCode : norm(h).includes('name') ? r.accountName : norm(h).includes('amount') ? String(r.amount) : '');
      return `"${String(v).replace(/"/g, '""')}"`;
    }).join(','),
  );
  return [headers.map((h) => `"${h}"`).join(','), ...body].join('\n');
};
