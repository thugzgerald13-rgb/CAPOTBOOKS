import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, FileSpreadsheet } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatAccountAmount, getCurrentYear, getProfitAndLossTotals } from '../lib/accountingBalances';

type PLBalance = ReturnType<typeof getProfitAndLossTotals>['balances'][number];

/** Same sign convention used on screen: revenue accounts net credit-over-debit,
 * cost/expense accounts net debit-over-credit, floored at zero either way. */
function getAccountAmount(x: PLBalance, sign: 'revenue' | 'debit') {
  return sign === 'revenue'
    ? Math.max(0, Number(x.period_credit || 0) - Number(x.period_debit || 0))
    : Math.max(0, Number(x.period_debit || 0) - Number(x.period_credit || 0));
}

const TOTAL_COLS = 6; // A..F, like a real worksheet — only A-C carry content, D-F are blank sheet area
const COL_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
const EXTRA_BLANK_ROWS = 8; // trailing empty rows so it reads like a real sheet, not just a table

interface CellDef {
  content?: React.ReactNode;
  colStart: number; // 0-based column index (0 = A)
  span?: number;
  align?: 'left' | 'right' | 'center';
  bold?: boolean;
  shaded?: boolean;
  italic?: boolean;
  borderTop?: 'single' | 'double';
  borderBottom?: 'single' | 'double';
  padLeft?: number;
}

type RowDef = CellDef[];

export function ProfitAndLoss() {
  const { currentClient, currentClientId, saveFinancialReportSnapshot } = useAccounting();
  const year = getCurrentYear(currentClient || ({ glAccounts: [] } as any));
  const [reportError, setReportError] = useState<string | null>(null);
  const [active, setActive] = useState<{ row: number; col: number } | null>(null);

  const totals = useMemo(
    () => getProfitAndLossTotals(currentClient || ({ glAccounts: [] } as any), year),
    [currentClient, year]
  );
  const balances = totals.balances;

  useEffect(() => {
    if (!currentClientId) {
      setReportError(null);
      return;
    }
    setReportError(balances.length ? null : 'No accounts found.');
  }, [currentClientId, balances]);

  if (!currentClient || !currentClientId) return null;

  const { revenue, costs, expenses, revenueTotal, costTotal, expenseTotal, grossIncome, netIncome } = totals;

  const data = currentClient.plData || {
    companyName: currentClient.tradeName || currentClient.name || '',
    address: [currentClient.street, currentClient.barangay, currentClient.city, currentClient.zipCode].filter(Boolean).join(', ') || '',
    reportName: 'INCOME STATEMENT',
    period: `For the year ended December 31, ${year}`,
    revenue: [], costOfRevenue: [], operatingExpenses: [], provisionForIncomeTax: '0.00'
  };

  const update = (field: 'companyName' | 'address' | 'reportName', value: string) =>
    saveFinancialReportSnapshot('P&L', { ...data, [field]: value });

  const handleExportExcel = () => {
    const rows: (string | number)[][] = [
      [data.companyName],
      [data.address],
      [data.reportName],
      [`For the year ended December 31, ${year}`],
      [],
    ];

    const addSection = (title: string, items: typeof balances, sign: 'revenue' | 'debit', totalLabel: string, total: number) => {
      rows.push([title]);
      if (items.length) {
        items.forEach(x => rows.push([`${x.account_id} — ${x.account_name}`, getAccountAmount(x, sign)]));
      } else {
        rows.push(['No accounts in this category.']);
      }
      rows.push([totalLabel, '', total]);
      rows.push([]);
    };

    addSection('REVENUE', revenue, 'revenue', 'TOTAL REVENUE', revenueTotal);
    addSection('COST OF REVENUE', costs, 'debit', 'TOTAL COST OF REVENUE', costTotal);
    rows.push(['GROSS INCOME', '', grossIncome], []);
    addSection('OPERATING EXPENSES', expenses, 'debit', 'TOTAL OPERATING EXPENSES', expenseTotal);
    rows.push(['NET INCOME (LOSS)', '', netIncome]);

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet(rows);
    worksheet['!cols'] = [{ wch: 45 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(workbook, worksheet, 'P&L');
    XLSX.writeFile(workbook, `Profit_and_Loss_${year}.xlsx`);
  };

  // ---- Build the worksheet rows -------------------------------------------------
  const rows: RowDef[] = [];

  rows.push([{
    content: (
      <input
        value={data.companyName}
        onChange={e => update('companyName', e.target.value)}
        className="w-full bg-transparent text-center font-bold uppercase tracking-wide outline-none"
      />
    ),
    colStart: 0, span: 3, align: 'center', bold: true,
  }]);
  rows.push([{
    content: (
      <input
        value={data.address}
        onChange={e => update('address', e.target.value)}
        className="w-full bg-transparent text-center outline-none"
      />
    ),
    colStart: 0, span: 3, align: 'center',
  }]);
  rows.push([]); // blank row
  rows.push([{
    content: (
      <input
        value={data.reportName}
        onChange={e => update('reportName', e.target.value)}
        className="w-full bg-transparent text-center font-bold uppercase outline-none"
      />
    ),
    colStart: 0, span: 3, align: 'center', bold: true,
  }]);
  rows.push([{ content: `For the year ended December 31, ${year}`, colStart: 0, span: 3, align: 'center' }]);
  rows.push([]); // blank row

  const addSectionRows = (title: string, items: typeof balances, sign: 'revenue' | 'debit', totalLabel: string, total: number) => {
    rows.push([{ content: title, colStart: 0, span: 3, bold: true, shaded: true, align: 'left', padLeft: 6 }]);
    if (items.length) {
      items.forEach(x => {
        rows.push([
          { content: `${x.account_id} — ${x.account_name}`, colStart: 0, align: 'left', padLeft: 24 },
          { content: formatAccountAmount(getAccountAmount(x, sign)), colStart: 1, align: 'right' },
        ]);
      });
    } else {
      rows.push([{ content: 'No accounts in this category.', colStart: 0, span: 3, align: 'left', italic: true, padLeft: 24 }]);
    }
    rows.push([
      { content: totalLabel, colStart: 0, align: 'left', bold: true, padLeft: 6 },
      { content: formatAccountAmount(total), colStart: 2, align: 'right', bold: true, borderTop: 'single' },
    ]);
    rows.push([]); // blank row
  };

  addSectionRows('REVENUE', revenue, 'revenue', 'TOTAL REVENUE', revenueTotal);
  addSectionRows('COST OF REVENUE', costs, 'debit', 'TOTAL COST OF REVENUE', costTotal);

  rows.push([
    { content: 'GROSS INCOME', colStart: 0, align: 'left', bold: true, padLeft: 6 },
    { content: formatAccountAmount(grossIncome), colStart: 2, align: 'right', bold: true, borderTop: 'single' },
  ]);
  rows.push([]); // blank row

  addSectionRows('OPERATING EXPENSES', expenses, 'debit', 'TOTAL OPERATING EXPENSES', expenseTotal);

  rows.push([
    { content: 'NET INCOME (LOSS)', colStart: 0, align: 'left', bold: true, padLeft: 6 },
    { content: formatAccountAmount(netIncome), colStart: 2, align: 'right', bold: true, borderTop: 'single', borderBottom: 'double' },
  ]);

  for (let i = 0; i < EXTRA_BLANK_ROWS; i++) rows.push([]);

  // ---- Rendering helpers ---------------------------------------------------------
  const colWidthClass = (col: number) => (col === 0 ? 'w-[300px] min-w-[300px]' : 'w-[130px] min-w-[130px]');

  const cellBase = 'border border-slate-200 px-2 h-[26px] align-middle text-[13px] text-slate-800 cursor-cell select-none';

  const isActive = (rowIdx: number, col: number) => active?.row === rowIdx && active?.col === col;

  const renderRow = (rowCells: RowDef, rowIdx: number) => {
    const cells: React.ReactElement[] = [];
    let cursor = 0;
    const sorted = [...rowCells].sort((a, b) => a.colStart - b.colStart);

    const pushBlank = (col: number) => {
      cells.push(
        <td
          key={col}
          onClick={() => setActive({ row: rowIdx, col })}
          className={`${cellBase} ${colWidthClass(col)} bg-white ${isActive(rowIdx, col) ? 'ring-2 ring-inset ring-emerald-600' : ''}`}
        />
      );
    };

    sorted.forEach(cell => {
      while (cursor < cell.colStart) { pushBlank(cursor); cursor++; }
      const span = cell.span || 1;
      const alignClass = cell.align === 'right' ? 'text-right' : cell.align === 'center' ? 'text-center' : 'text-left';
      const borderTopClass = cell.borderTop === 'single' ? 'border-t-2 border-t-slate-700' : cell.borderTop === 'double' ? 'border-t-4 border-t-double border-t-slate-800' : '';
      const borderBottomClass = cell.borderBottom === 'double' ? 'border-b-4 border-b-double border-b-slate-800' : cell.borderBottom === 'single' ? 'border-b-2 border-b-slate-700' : '';
      cells.push(
        <td
          key={cell.colStart}
          colSpan={span}
          onClick={() => setActive({ row: rowIdx, col: cell.colStart })}
          style={cell.padLeft ? { paddingLeft: cell.padLeft } : undefined}
          className={[
            cellBase, alignClass, borderTopClass, borderBottomClass,
            cell.bold ? 'font-bold' : '',
            cell.italic ? 'italic text-slate-400' : '',
            cell.shaded ? 'bg-slate-100' : 'bg-white',
            isActive(rowIdx, cell.colStart) ? 'ring-2 ring-inset ring-emerald-600' : '',
            'font-mono',
          ].join(' ')}
        >
          {cell.content}
        </td>
      );
      cursor += span;
    });

    while (cursor < TOTAL_COLS) { pushBlank(cursor); cursor++; }

    return (
      <tr key={rowIdx}>
        <td className={`${cellBase} w-[44px] min-w-[44px] bg-slate-100 text-center font-semibold text-slate-500 sticky left-0 ${active?.row === rowIdx ? 'bg-emerald-100 text-emerald-700' : ''}`}>
          {rowIdx + 1}
        </td>
        {cells}
      </tr>
    );
  };

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Profit & Loss" icon={<TrendingUp className="text-emerald-500" />} centered />
      <div className="p-4 md:p-6 flex-1">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">Click a cell to select it, just like a spreadsheet.</p>
          <button
            onClick={handleExportExcel}
            disabled={!balances.length}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" /> Download as .xlsx
          </button>
        </div>

        {reportError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 mb-3">{reportError}</div>}

        <div className="rounded-lg border border-slate-300 overflow-auto shadow-sm">
          <table className="border-collapse bg-white" style={{ tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: 44 }} />
              {COL_LETTERS.map(l => <col key={l} style={{ width: l === 'A' ? 300 : 130 }} />)}
            </colgroup>
            <thead>
              <tr>
                <th className="border border-slate-300 bg-slate-200 h-[24px] sticky left-0 top-0 z-20" />
                {COL_LETTERS.map((l, i) => (
                  <th
                    key={l}
                    className={`border border-slate-300 h-[24px] text-xs font-semibold text-slate-600 sticky top-0 z-10 ${active?.col === i ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200'}`}
                  >
                    {l}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => renderRow(row, idx))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
