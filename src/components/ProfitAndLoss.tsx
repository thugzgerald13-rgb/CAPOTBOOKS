import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { TrendingUp, Download, Printer, RotateCcw, Lock, Unlock, Bold, Underline, CircleDollarSign, Columns3, Rows3 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatAccountAmount, getCurrentYear, getProfitAndLossTotals } from '../lib/accountingBalances';
import { SpreadsheetGrid, CellMap, CellData, cellKey, colToLetter, evalCell, formatCellValue } from './SpreadsheetGrid';

// Excel row number helper (0-indexed internal -> 1-indexed formula refs)
const XL = (r0: number) => r0 + 1;

interface LayoutRows {
  sales: number;
  cogs: number;
  gross: number;
  opexHeader: number;
  opexStart: number;
  totalOpex: number;
  netBeforeTax: number;
  provision: number;
  netIncome: number;
}

function buildDefaultGrid(
  companyName: string,
  address: string,
  year: number,
  totals: ReturnType<typeof getProfitAndLossTotals>,
  provisionTax: string,
  extraYearCols = 2,
): { cells: CellMap; colCount: number; rowCount: number; colWidths: number[]; yearHeaders: string[]; layout: LayoutRows } {
  const cells: CellMap = {};
  const set = (c: number, r: number, patch: Partial<CellData>) => { cells[cellKey(c, r)] = { ...(cells[cellKey(c, r)] || {}), ...patch }; };

  const yearHeaders: string[] = [];
  for (let i = 0; i <= extraYearCols; i++) yearHeaders.push(String(year - i)); // B=current, C=prior, D=year-2…
  const colCount = 1 + yearHeaders.length; // A + year columns
  const colWidths = [340, ...yearHeaders.map(() => 140)];
  const yearColStart = 1; // column index of first year column (B)

  let r = 0;
  // Header block (merged across all columns)
  set(0, r, { v: companyName.toUpperCase(), bold: true, align: 'center', merge: colCount, fmt: 'text' }); r++;
  set(0, r, { v: address, align: 'center', merge: colCount, fmt: 'text' }); r++;
  r++; // blank
  set(0, r, { v: 'INCOME STATEMENT', bold: true, align: 'center', merge: colCount, fmt: 'text' }); r++;
  set(0, r, { v: `For the year ended December 31, ${year}`, align: 'center', merge: colCount, fmt: 'text' }); r++;
  set(0, r, { v: `(With Comparative Figures for ${year - 1})`, italic: true, align: 'center', merge: colCount, fmt: 'text' }); r++;
  r++; // blank
  // Year column headers (row 8 in Excel)
  yearHeaders.forEach((h, i) => set(yearColStart + i, r, { v: h, bold: true, align: 'center', fmt: 'text' }));
  r++;
  r++; // blank

  const salesRow = r;
  set(0, r, { v: 'SALES', bold: true, fmt: 'text' });
  set(yearColStart, r, { v: String(totals.revenueTotal || 0), fmt: 'currency' });
  r++;

  const cogsRow = r;
  set(0, r, { v: 'COST OF GOODS SOLD', bold: true, fmt: 'text' });
  set(yearColStart, r, { v: String(totals.costTotal || 0), fmt: 'currency' });
  r++;
  r++; // blank

  const grossRow = r;
  set(0, r, { v: 'GROSS INCOME', bold: true, fmt: 'text' });
  yearHeaders.forEach((_, i) => {
    const col = yearColStart + i;
    const L = colToLetter(col);
    set(col, r, { v: `=${L}${XL(salesRow)}-${L}${XL(cogsRow)}`, fmt: 'currency', bold: true, locked: true });
  });
  r++;

  const opexHeaderRow = r;
  set(0, r, { v: 'OPERATING EXPENSES:', bold: true, fmt: 'text' });
  r++;

  const opexStart = r;
  totals.expenses.forEach((x) => {
    const amount = Math.max(0, Number(x.period_debit || 0) - Number(x.period_credit || 0));
    set(0, r, { v: `${x.account_id} — ${x.account_name}`, indent: 1, fmt: 'text' });
    set(yearColStart, r, { v: String(amount), fmt: 'currency' });
    r++;
  });
  if (totals.expenses.length === 0) {
    set(0, r, { v: '(no expense accounts yet)', indent: 1, fmt: 'text', color: 'text-slate-400 dark:text-slate-500' });
    r++;
  }

  const totalOpexRow = r;
  set(0, r, { v: 'TOTAL OPERATING EXPENSES', bold: true, fmt: 'text' });
  yearHeaders.forEach((_, i) => {
    const col = yearColStart + i;
    const L = colToLetter(col);
    set(col, r, { v: `=SUM(${L}${XL(opexStart)}:${L}${XL(totalOpexRow - 1)})`, fmt: 'currency', bold: true, locked: true });
  });
  r++;
  r++; // blank

  const netBeforeTaxRow = r;
  set(0, r, { v: 'NET INCOME BEFORE INCOME TAX', bold: true, fmt: 'text' });
  yearHeaders.forEach((_, i) => {
    const col = yearColStart + i;
    const L = colToLetter(col);
    set(col, r, { v: `=${L}${XL(grossRow)}-${L}${XL(totalOpexRow)}`, fmt: 'currency', bold: true, locked: true });
  });
  r++;

  const provisionRow = r;
  set(0, r, { v: 'PROVISION FOR INCOME TAX', fmt: 'text' });
  set(yearColStart, r, { v: provisionTax || '0', fmt: 'currency' });
  r++;

  const netIncomeRow = r;
  set(0, r, { v: 'NET INCOME FOR THE PERIOD', bold: true, doubleUnderline: true, fmt: 'text' });
  yearHeaders.forEach((_, i) => {
    const col = yearColStart + i;
    const L = colToLetter(col);
    set(col, r, { v: `=${L}${XL(netBeforeTaxRow)}-${L}${XL(provisionRow)}`, fmt: 'currency', bold: true, locked: true, doubleUnderline: true });
  });
  r++;

  const layout: LayoutRows = { sales: salesRow, cogs: cogsRow, gross: grossRow, opexHeader: opexHeaderRow, opexStart, totalOpex: totalOpexRow, netBeforeTax: netBeforeTaxRow, provision: provisionRow, netIncome: netIncomeRow };

  return { cells, colCount, rowCount: r, colWidths, yearHeaders, layout };
}

export function ProfitAndLoss() {
  const { currentClient, currentClientId, saveClient, showToast } = useAccounting() as any;
  const year = getCurrentYear(currentClient || ({ glAccounts: [] } as any));
  const totals = useMemo(
    () => getProfitAndLossTotals(currentClient || ({ glAccounts: [] } as any), year),
    [currentClient, year]
  );

  const plData = currentClient?.plData;
  const baseCompany = plData?.companyName || currentClient?.tradeName || currentClient?.name || '';
  const baseAddress = plData?.address || [currentClient?.street, currentClient?.barangay, currentClient?.city, currentClient?.zipCode].filter(Boolean).join(', ') || '';
  const baseProvision = plData?.provisionForIncomeTax || '0';

  const [cells, setCells] = useState<CellMap>({});
  const [colCount, setColCount] = useState(4);
  const [rowCount, setRowCount] = useState(20);
  const [colWidths, setColWidths] = useState<number[]>([340, 140, 140, 140]);
  const [yearHeaders, setYearHeaders] = useState<string[]>([String(year), String(year - 1), String(year - 2)]);
  const [protectedMode, setProtectedMode] = useState(true);
  const [sel, setSel] = useState<{ c1: number; r1: number; c2: number; r2: number } | null>(null);
  const [active, setActive] = useState<{ c: number; r: number } | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const initializedRef = useRef<string | null>(null);
  const saveTimer = useRef<any>(null);

  // Initialize grid: restore saved snapshot, or build from GL
  useEffect(() => {
    if (!currentClientId) return;
    if (initializedRef.current === currentClientId) return;
    initializedRef.current = currentClientId;
    const saved = currentClient?.plData?.grid;
    if (saved && saved.cells && saved.colCount && saved.rowCount) {
      setCells(saved.cells);
      setColCount(saved.colCount);
      setRowCount(saved.rowCount);
      setColWidths(saved.colWidths || [340, ...Array(saved.colCount - 1).fill(140)]);
      setYearHeaders(saved.yearHeaders || []);
    } else {
      const built = buildDefaultGrid(baseCompany, baseAddress, year, totals, baseProvision);
      setCells(built.cells);
      setColCount(built.colCount);
      setRowCount(built.rowCount);
      setColWidths(built.colWidths);
      setYearHeaders(built.yearHeaders);
    }
    setReportError(totals.balances.length ? null : 'No General Ledger accounts found — showing an empty editable statement.');
  }, [currentClientId]); // eslint-disable-line

  // Debounced persist into client.plData.grid
  useEffect(() => {
    if (!currentClientId || !currentClient) return;
    if (initializedRef.current !== currentClientId) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      const grid = { version: 1, colCount, rowCount, colWidths, yearHeaders, cells };
      const nextPlData = {
        companyName: baseCompany, address: baseAddress, reportName: 'INCOME STATEMENT',
        period: `For the year ended December 31, ${year}`,
        revenue: [], costOfRevenue: [], operatingExpenses: [],
        provisionForIncomeTax: baseProvision,
        ...(currentClient.plData || {}),
        grid,
      };
      saveClient(currentClientId, { ...currentClient, plData: nextPlData }).catch(() => {});
    }, 700);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [cells, colCount, rowCount, colWidths, yearHeaders]); // eslint-disable-line

  const onCellsChange = useCallback((next: CellMap) => setCells(next), []);

  const applyToSelection = useCallback((patch: (cell: CellData) => Partial<CellData>) => {
    if (!sel) { showToast?.('Select one or more cells first.'); return; }
    const next = { ...cells };
    for (let r = sel.r1; r <= sel.r2; r++) for (let c = sel.c1; c <= sel.c2; c++) {
      const key = cellKey(c, r);
      const existing = next[key] || {};
      next[key] = { ...existing, ...patch(existing) };
    }
    setCells(next);
  }, [sel, cells, showToast]);

  const toggleBold = () => applyToSelection(c => ({ bold: !c.bold }));
  const toggleUnderline = () => applyToSelection(c => ({ underline: !c.underline }));
  const setCurrency = () => applyToSelection(() => ({ fmt: 'currency' }));
  const setText = () => applyToSelection(() => ({ fmt: 'text', align: 'left' }));

  const addYearColumn = () => {
    const newCol = colCount;
    const newHeader = String(year - yearHeaders.length);
    const next = { ...cells };
    // copy formulas from column B (index 1) into the new column, adjusting column letter
    const srcLetter = colToLetter(1);
    const dstLetter = colToLetter(newCol);
    for (let r = 0; r < rowCount; r++) {
      const src = cells[cellKey(1, r)];
      if (src && src.v?.startsWith('=')) {
        next[cellKey(newCol, r)] = { ...src, v: src.v.split(srcLetter).join(dstLetter) };
      }
    }
    // year header row: find the row that holds year headers (row with bold center text in col B that is numeric)
    // simpler: put header at same row as existing year headers — locate by scanning col 1 for a numeric bold text cell
    let headerRow = 7;
    for (let r = 0; r < rowCount; r++) {
      const c = cells[cellKey(1, r)];
      if (c && c.bold && c.align === 'center' && /^\d{4}$/.test(String(c.v || ''))) { headerRow = r; break; }
    }
    next[cellKey(newCol, headerRow)] = { v: newHeader, bold: true, align: 'center', fmt: 'text' };
    setCells(next);
    setColCount(colCount + 1);
    setColWidths([...colWidths, 140]);
    setYearHeaders([...yearHeaders, newHeader]);
    showToast?.(`Added column ${dstLetter} (${newHeader}).`);
  };

  const insertRow = () => {
    if (!active) { showToast?.('Select a row first.'); return; }
    const at = active.r + 1; // insert below active row
    const next: CellMap = {};
    Object.entries(cells).forEach(([key, cell]) => {
      const [c, r] = key.split(',').map(Number);
      next[cellKey(c, r >= at ? r + 1 : r)] = cell;
    });
    setCells(next);
    setRowCount(rowCount + 1);
    showToast?.('Row inserted — review any formulas below.');
  };

  const resetFromGL = () => {
    if (!window.confirm('Reset the income statement from the General Ledger? Your manual edits will be replaced.')) return;
    const built = buildDefaultGrid(baseCompany, baseAddress, year, totals, baseProvision);
    setCells(built.cells);
    setColCount(built.colCount);
    setRowCount(built.rowCount);
    setColWidths(built.colWidths);
    setYearHeaders(built.yearHeaders);
    showToast?.('Statement rebuilt from General Ledger.');
  };

  const exportToExcel = () => {
    const aoa: any[][] = [];
    const merges: { s: { r: number; c: number }; e: { r: number; c: number } }[] = [];
    for (let r = 0; r < rowCount; r++) {
      const row: any[] = [];
      for (let c = 0; c < colCount; c++) {
        const cell = cells[cellKey(c, r)];
        if (cell?.merge && cell.merge > 1) {
          merges.push({ s: { r, c }, e: { r, c: c + cell.merge - 1 } });
        }
        const ev = evalCell(c, r, cells);
        if (ev.error) row.push(ev.error);
        else if (ev.num !== null) row.push(Number(ev.num.toFixed(2)));
        else row.push(ev.str ?? '');
      }
      aoa.push(row);
    }
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws['!cols'] = colWidths.map(w => ({ wch: Math.round(w / 7) }));
    if (merges.length) ws['!merges'] = merges;
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Income Statement');
    XLSX.writeFile(wb, `Income_Statement_${year}.xlsx`);
    showToast?.('Excel file downloaded.');
  };

  const printStatement = () => window.print();

  if (!currentClient || !currentClientId) return null;

  const toolBtn = "inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors";

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Profit & Loss" icon={<TrendingUp className="text-emerald-500" />} centered />
      <div className="px-4 md:px-6 pt-4 flex-1 flex flex-col">
        {reportError && <div className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-lg p-3 mb-3">{reportError}</div>}

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-3 p-2.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-lg">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mr-1">Format:</span>
          <button className={toolBtn} onClick={toggleBold} title="Bold"><Bold size={13} /> Bold</button>
          <button className={toolBtn} onClick={toggleUnderline} title="Underline"><Underline size={13} /> Underline</button>
          <button className={toolBtn} onClick={setCurrency} title="Currency format"><CircleDollarSign size={13} /> #,##0.00</button>
          <button className={toolBtn} onClick={setText} title="Text format">Text</button>
          <div className="w-px h-5 bg-slate-300 dark:bg-slate-600 mx-1" />
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mr-1">Sheet:</span>
          <button className={toolBtn} onClick={addYearColumn} title="Add comparative year column"><Columns3 size={13} /> Add Year Column</button>
          <button className={toolBtn} onClick={insertRow} title="Insert row below selected cell"><Rows3 size={13} /> Insert Row</button>
          <button className={`${toolBtn} ${protectedMode ? '' : 'bg-amber-100 dark:bg-amber-900/40 border-amber-400 dark:border-amber-700'}`} onClick={() => setProtectedMode(p => !p)} title="Lock/unlock formula cells">
            {protectedMode ? <Lock size={13} /> : <Unlock size={13} />} {protectedMode ? 'Formulas Locked' : 'Formulas Unlocked'}
          </button>
          <div className="flex-1" />
          <button className={toolBtn} onClick={resetFromGL} title="Rebuild from General Ledger"><RotateCcw size={13} /> Reset from GL</button>
          <button className={toolBtn} onClick={printStatement} title="Print"><Printer size={13} /> Print</button>
          <button className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-emerald-600 hover:bg-emerald-700 text-white transition-colors" onClick={exportToExcel} title="Download as .xlsx">
            <Download size={13} /> Export to Excel
          </button>
        </div>

        {/* Excel-style spreadsheet */}
        <div className="border border-slate-300 dark:border-slate-600 rounded-lg overflow-hidden shadow-sm">
          <SpreadsheetGrid
            cells={cells}
            colCount={colCount}
            rowCount={rowCount}
            colWidths={colWidths}
            protected={protectedMode}
            onCellsChange={onCellsChange}
            onSelectionChange={(s, a) => { setSel(s); setActive(a); }}
          />
        </div>

        <div className="mt-3 text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap gap-x-4 gap-y-1">
          <span>Net income (current year): <span className="font-semibold font-mono text-emerald-600 dark:text-emerald-400">{formatAccountAmount(totals.netIncome)}</span></span>
          <span>Gross income: <span className="font-mono">{formatAccountAmount(totals.grossIncome)}</span></span>
          <span>Total revenue: <span className="font-mono">{formatAccountAmount(totals.revenueTotal)}</span></span>
          <span>Total operating expenses: <span className="font-mono">{formatAccountAmount(totals.expenseTotal)}</span></span>
          <span className="ml-auto italic">Changes auto-save. Unlock formulas to edit computed cells.</span>
        </div>
      </div>
    </div>
  );
}

export default ProfitAndLoss;
