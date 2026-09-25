// AFS / financial-statement bundle export (Run 014 / T014).
// Exports Balance Sheet, Income Statement, Cash Flow + Notes to a single
// multi-sheet XLSX workbook. xlsx (SheetJS) is already a dependency.
import * as XLSX from 'xlsx';

export interface AfsSheetRow { account: string; current: number; prior: number; }

const moneyFmt = '#,##0.00;(#,##0.00)';

function sheetFromRows(title: string, rows: AfsSheetRow[], meta: Record<string, string>): XLSX.WorkSheet {
  const aoa: any[][] = [];
  if (meta.company) aoa.push([meta.company]);
  if (meta.title) aoa.push([meta.title]);
  if (meta.period) aoa.push([meta.period]);
  aoa.push([]);
  aoa.push(['Account', meta.currentLabel || 'Current', meta.priorLabel || 'Prior']);
  for (const r of rows) aoa.push([r.account, r.current, r.prior]);
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [{ wch: 40 }, { wch: 18 }, { wch: 18 }];
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let r = 4; r <= range.e.r; r++) {
    const cellB = ws[XLSX.utils.encode_cell({ r, c: 1 })];
    const cellC = ws[XLSX.utils.encode_cell({ r, c: 2 })];
    if (cellB && cellB.t === 'n') cellB.z = moneyFmt;
    if (cellC && cellC.t === 'n') cellC.z = moneyFmt;
  }
  return ws;
}

/** Export the AFS bundle (BS + IS + CF + Notes) as a multi-sheet .xlsx file. */
export function exportAfBundle(opts: {
  company: string;
  period: string;
  balanceSheet: AfsSheetRow[];
  incomeStatement: AfsSheetRow[];
  cashFlow: AfsSheetRow[];
  notes: string;
  filename?: string;
}) {
  const wb = XLSX.utils.book_new();
  const meta = { company: opts.company, period: opts.period, currentLabel: 'Current', priorLabel: 'Prior' };
  XLSX.utils.book_append_sheet(wb, sheetFromRows('Balance Sheet', opts.balanceSheet, { ...meta, title: 'BALANCE SHEET' }), 'Balance Sheet');
  XLSX.utils.book_append_sheet(wb, sheetFromRows('Income Statement', opts.incomeStatement, { ...meta, title: 'STATEMENT OF COMPREHENSIVE INCOME' }), 'Income Statement');
  XLSX.utils.book_append_sheet(wb, sheetFromRows('Cash Flow', opts.cashFlow, { ...meta, title: 'STATEMENT OF CASH FLOWS' }), 'Cash Flow');
  const notesWs = XLSX.utils.aoa_to_sheet([[opts.company], ['NOTES TO FINANCIAL STATEMENTS'], [opts.period], [], opts.notes.split('\n').map(l => [l])].flat());
  XLSX.utils.book_append_sheet(wb, notesWs, 'Notes');
  XLSX.writeFile(wb, opts.filename || 'AFS-bundle.xlsx');
}

/** Convert a GL-accounts list (as used by BalanceSheet) into comparative AFS rows. Prior = cumulative balance − current-period movement. */
export function toComparativeRows(accounts: Array<{ account_id: string; account_name: string; balance: number; period_balance: number }>, sign: 1 | -1 = 1): AfsSheetRow[] {
  return accounts.map(a => ({
    account: `${a.account_id} — ${a.account_name}`,
    current: Math.max(0, sign * a.balance),
    prior: Math.max(0, sign * (a.balance - a.period_balance)),
  }));
}
