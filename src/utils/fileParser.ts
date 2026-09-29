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
}

const parseNumber = (val: string | number | null | undefined): number => {
  if (val == null || val === '') return 0;
  if (typeof val === 'number') return val;
  const cleaned = String(val)
    .replace(/\(([^)]+)\)/g, '-$1')
    .replace(/[^\d.\-]/g, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
};

export const parseImportedFile = (
  file: File,
  targetYear: number
): Promise<ImportResult> => {
  return new Promise((resolve) => {
    const warnings: string[] = [];
    const fileName = file.name.toLowerCase();

    if (fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const buffer = e.target?.result as ArrayBuffer;
          const wb = XLSX.read(buffer, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as string[][];

          if (rows.length < 2) {
            resolve({ success: false, message: 'File must contain headers + at least one data row' });
            return;
          }

          const headers = rows[0].map(h => String(h || '').trim());
          const data: ImportedAccountRow[] = [];

          for (let i = 1; i < rows.length; i++) {
            const cells = rows[i].map(c => String(c || '').trim());
            if (cells.every(c => !c)) continue;

            const original: Record<string, string | number> = {};
            headers.forEach((h, idx) => { original[h] = cells[idx] ?? ''; });

            const accountCode = String(
              original['Account Code'] || original['Code'] || original['accountCode'] || ''
            ).trim();
            const accountName = String(
              original['Account Name'] || original['Name'] || original['Description'] || ''
            ).trim();
            const amount = parseNumber(
              original['Amount'] || original['Balance'] || original['Total'] || 0
            );

            if (!accountName && !accountCode) {
              warnings.push(`Row ${i + 1}: No account name/code — skipped`);
              continue;
            }

            data.push({ accountCode, accountName, amount, year: targetYear, original });
          }

          if (!data.length) {
            resolve({ success: false, message: 'No valid account rows found' });
            return;
          }

          resolve({
            success: true,
            message: `Imported ${data.length} accounts from "${wb.SheetNames[0]}"`,
            year: targetYear,
            data,
            warnings: warnings.length ? warnings : undefined,
            originalFileName: file.name,
            originalHeaders: headers,
          });
        } catch (err) {
          resolve({
            success: false,
            message: `Excel parse error: ${err instanceof Error ? err.message : 'Unknown error'}`,
          });
        }
      };
      reader.readAsArrayBuffer(file);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const text = e.target?.result as string;
        if (!text) {
          resolve({ success: false, message: 'Empty or unreadable file' });
          return;
        }

        const firstLineEnd = text.indexOf('\n');
        const firstLine = text.slice(0, firstLineEnd > 0 ? firstLineEnd : 1000);
        const delimiter = firstLine.includes('\t') ? '\t'
          : firstLine.includes(';') ? ';'
          : ',';
        const lines = text.split(/\r?\n/).filter(line => line.trim());

        if (lines.length < 2) {
          resolve({ success: false, message: 'File must contain headers + at least one data row' });
          return;
        }

        const headers = lines[0].split(delimiter).map(h => h.trim());
        const data: ImportedAccountRow[] = [];

        for (let i = 1; i < lines.length; i++) {
          const cells = lines[i].split(delimiter).map(c => c.trim());
          if (cells.every(c => !c)) continue;

          const original: Record<string, string | number> = {};
          headers.forEach((h, idx) => { original[h] = cells[idx] ?? ''; });

          const accountCode = String(
            original['Account Code'] || original['Code'] || ''
          ).trim();
          const accountName = String(
            original['Account Name'] || original['Name'] || original['Description'] || ''
          ).trim();
          const amount = parseNumber(
            original['Amount'] || original['Balance'] || original['Total'] || 0
          );

          if (!accountName && !accountCode) {
            warnings.push(`Row ${i + 1}: No account name/code — skipped`);
            continue;
          }

          data.push({ accountCode, accountName, amount, year: targetYear, original });
        }

        if (!data.length) {
          resolve({ success: false, message: 'No valid account rows found. Check column headers.' });
          return;
        }

        resolve({
          success: true,
          message: `Imported ${data.length} accounts`,
          year: targetYear,
          data,
          warnings: warnings.length ? warnings : undefined,
          originalFileName: file.name,
          originalHeaders: headers,
        });
      } catch (err) {
        resolve({
          success: false,
          message: `Parse error: ${err instanceof Error ? err.message : 'Unknown error'}`,
        });
      }
    };
    reader.readAsText(file);
  });
};

export const exportToExcelOriginal = (
  data: ImportedAccountRow[],
  originalHeaders: string[],
  year: number,
  pageType: 'balance-sheet' | 'profit-loss'
): void => {
  const rows = data.map(row => {
    const outputRow: Record<string, string | number> = {};
    originalHeaders.forEach(header => {
      outputRow[header] = row.original[header] ?? '';
    });
    return outputRow;
  });

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows, { header: originalHeaders });
  XLSX.utils.book_append_sheet(wb, ws, `${year}`);

  const prefix = pageType === 'balance-sheet' ? 'BalanceSheet' : 'ProfitLoss';
  XLSX.writeFile(wb, `${prefix}_${year}_Export.xlsx`);
};
