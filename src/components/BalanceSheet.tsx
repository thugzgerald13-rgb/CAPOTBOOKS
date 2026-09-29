import React, { useEffect, useState } from 'react';
import { Landmark, FileDown, Upload } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatAccountAmount, getCurrentYear } from '../lib/accountingBalances';
import { exportAfBundle, toComparativeRows } from '../lib/afsExport';
import ImportDataModal from './ImportDataModal';
import type { ImportedAccountRow } from '../types';

export function BalanceSheet() {
  const { currentClient, currentClientId, saveFinancialReportSnapshot } = useAccounting();
  const [balances, setBalances] = useState<any[]>([]);
  const [reportError, setReportError] = useState<string | null>(null);
  const year = getCurrentYear(currentClient || ({ glAccounts: [] } as any));

  // ---- Import prior-year data (format of uploaded file is preserved) ----
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importedYears, setImportedYears] = useState<number[]>([]);
  const [selectedImportYear, setSelectedImportYear] = useState<number | null>(null);
  const [importedRows, setImportedRows] = useState<ImportedAccountRow[]>([]);
  const [importedHeaders, setImportedHeaders] = useState<string[]>([]);
  const importStorageKey = `bs_import_${currentClientId}`;

  const loadImportedYears = () => {
    const raw = localStorage.getItem(importStorageKey);
    if (raw) {
      setImportedYears(Object.keys(JSON.parse(raw)).map(Number).sort((a, b) => b - a));
    } else {
      setImportedYears([]);
    }
  };
  useEffect(() => { loadImportedYears(); setSelectedImportYear(null); setImportedRows([]); }, [currentClientId]);

  const selectImportYear = (y: number) => {
    const raw = localStorage.getItem(importStorageKey);
    const parsed = raw ? JSON.parse(raw) : {};
    const entry = parsed[String(y)];
    if (entry) {
      setImportedRows(entry.rows || []);
      setImportedHeaders(entry.originalHeaders || []);
      setSelectedImportYear(y);
    }
  };
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (!currentClientId) {
      setBalances([]);
      setReportError(null);
      return;
    }
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;
    const fallback = (currentClient.glAccounts || []).map((account: any) => {
      const entries = Array.isArray(account.entries) ? account.entries : [];
      const periodEntries = entries.filter((entry: any) => {
        const d = String(entry.date || entry.dateDr || entry.dateCr || '').slice(0, 10);
        return d >= start && d < end;
      });
      const period_debit = periodEntries.reduce((n: number, entry: any) => n + Number(String(entry.debit ?? '').replace(/,/g, '') || 0), 0);
      const period_credit = periodEntries.reduce((n: number, entry: any) => n + Number(String(entry.credit ?? '').replace(/,/g, '') || 0), 0);
      const allEntries = entries.filter((entry: any) => String(entry.date || entry.dateDr || entry.dateCr || '').slice(0, 10) < end);
      const totalDebit = allEntries.reduce((n: number, entry: any) => n + Number(String(entry.debit ?? '').replace(/,/g, '') || 0), 0);
      const totalCredit = allEntries.reduce((n: number, entry: any) => n + Number(String(entry.credit ?? '').replace(/,/g, '') || 0), 0);
      return {
        account_id: String(account.accountId || account.id),
        account_name: String(account.accountTitle || ''),
        account_type: String(account.accountType || ''),
        balance: totalDebit - totalCredit,
        period_debit,
        period_credit,
        period_balance: period_debit - period_credit,
      };
    });
    setBalances(fallback);
    setReportError(fallback.length ? null : 'No accounts found.');
  }, [currentClientId, currentClient, year]);

  if (!currentClient || !currentClientId) return null;
  const assets = balances.filter(x => ['asset', 'assets'].includes((x.account_type || '').toLowerCase()));
  const liabilities = balances.filter(x => ['liability', 'liabilities'].includes((x.account_type || '').toLowerCase()));
  const equity = balances.filter(x => ['equity', 'equities', 'capital'].includes((x.account_type || '').toLowerCase()));
  const drawings = balances.filter(x => {
    const type = (x.account_type || '').toLowerCase();
    const name = (x.account_name || '').toLowerCase();
    return ['equity', 'equities', 'capital'].includes(type) && name.includes('drawing');
  });
  const assetTotal = assets.reduce((n, x) => n + Math.max(0, x.balance), 0);
  const liabilityTotal = liabilities.reduce((n, x) => n + Math.max(0, -x.balance), 0);
  const equityAccountsTotal = equity.reduce((n, x) => n + Math.max(0, -x.balance), 0);
  const drawingsTotal = drawings.reduce((n, x) => n + Math.max(0, x.balance), 0);
  const revenue = balances.filter(x => (x.account_type || '').toLowerCase() === 'revenue')
    .reduce((n, x) => n + Math.max(0, x.period_credit - x.period_debit), 0);
  const costs = balances.filter(x => ['cost','costs'].includes((x.account_type || '').toLowerCase()))
    .reduce((n, x) => n + Math.max(0, x.period_debit - x.period_credit), 0);
  const expenses = balances.filter(x => ['expense','expenses'].includes((x.account_type || '').toLowerCase()))
    .reduce((n, x) => n + Math.max(0, x.period_debit - x.period_credit), 0);
  const netIncome = revenue - costs - expenses;
  const totalEquity = equityAccountsTotal - drawingsTotal + netIncome;
  const totalLiabEquity = liabilityTotal + totalEquity;
  const data = currentClient.bsData || {
    companyName: currentClient.tradeName || currentClient.name || '',
    address: [currentClient.street, currentClient.barangay, currentClient.city, currentClient.zipCode].filter(Boolean).join(', ') || '',
    reportName: 'BALANCE SHEET',
    asOfDate: `As of December 31, ${year}`,
    currentYearLabel: String(year),
    priorYearLabel: String(year - 1),
    currentAssets: [], ppe: [], currentLiabilities: [], capital: [], certifiedBy: ''
  };
  const update = (field: 'companyName' | 'address' | 'reportName', value: string) =>
    saveFinancialReportSnapshot('Balance Sheet', { ...data, [field]: value });
  // ---- T014: notes stub + AFS bundle export ----
  const [notes, setNotes] = useState<string>(data.notes || '');
  const saveNotes = () => saveFinancialReportSnapshot('Balance Sheet', { ...data, notes });
  const handleExportBundle = () => {
    exportAfBundle({
      company: data.companyName,
      period: `As of December 31, ${year}`,
      balanceSheet: [
        ...toComparativeRows(assets, 1),
        { account: 'TOTAL ASSETS', current: assetTotal, prior: 0 },
        ...toComparativeRows(liabilities, -1),
        { account: 'TOTAL LIABILITIES', current: liabilityTotal, prior: 0 },
        { account: 'Current Year Net Income', current: netIncome, prior: 0 },
        { account: 'TOTAL EQUITY', current: totalEquity, prior: 0 },
      ],
      incomeStatement: [],
      cashFlow: [],
      notes: notes || '(Notes to financial statements — to be completed by the accountant.)',
      filename: `AFS-bundle-${year}.xlsx`,
    });
  };
  const renderAccounts = (items: typeof balances, sign: 'debit' | 'credit') => items.map(x => {
    const amount = sign === 'debit' ? Math.max(0, x.balance) : Math.max(0, -x.balance);
    return (
      <tr key={x.account_id}>
        <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
        <td className="w-40 py-1.5 text-right font-mono pr-2">{formatAccountAmount(amount)}</td>
      </tr>
    );
  });
  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Balance Sheet" icon={<Landmark className="text-blue-500" />} centered />

      {/* Import prior-year data toolbar */}
      <div className="no-print px-4 md:px-6 flex flex-wrap items-center gap-3 mb-2">
        {importedYears.length > 0 && (
          <select
            value={selectedImportYear ?? ''}
            onChange={(e) => e.target.value ? selectImportYear(Number(e.target.value)) : setSelectedImportYear(null)}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 focus:border-cyan-500 focus:outline-none"
            aria-label="View imported year"
          >
            <option value="">View imported year…</option>
            {importedYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
        <button
          type="button"
          onClick={() => setImportModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
        >
          <Upload className="w-3.5 h-3.5" /> Import Prior-Year Data
        </button>
      </div>

      <div className="p-4 md:p-6 flex-1">
        <div className="p-8 text-sm">
          <div className="text-center mb-8">
            <input value={data.companyName} onChange={e => update('companyName', e.target.value)}
              className="text-xl font-bold text-center uppercase tracking-wide bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none block w-full max-w-md mx-auto" />
            <input value={data.address} onChange={e => update('address', e.target.value)}
              className="text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none block w-full max-w-md mx-auto mt-1" />
            <div className="mt-6">
              <input value={data.reportName} onChange={e => update('reportName', e.target.value)}
                className="text-lg font-medium text-center uppercase bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none block w-full max-w-md mx-auto" />
              <div className="text-center font-medium mt-1">As of December 31, {year}</div>
            </div>
          </div>
          {reportError && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{reportError}</div>}
          {!reportError && balances.length === 0 && <div className="mb-4 text-center text-sm text-slate-400">No accounts found for this client.</div>}
          <div className="max-w-3xl mx-auto space-y-6">
            <section>
              <div className="uppercase mb-2 font-bold">ASSETS</div>
              <table className="w-full"><tbody>{renderAccounts(assets, 'debit')}
                <tr className="font-bold border-t"><td className="pl-6 py-2">TOTAL ASSETS</td><td className="text-right font-mono pr-2">{formatAccountAmount(assetTotal)}</td></tr>
              </tbody></table>
            </section>
            <section>
              <div className="uppercase mb-2 font-bold">LIABILITIES</div>
              <table className="w-full"><tbody>{renderAccounts(liabilities, 'credit')}
                <tr className="font-bold border-t"><td className="pl-6 py-2">TOTAL LIABILITIES</td><td className="text-right font-mono pr-2">{formatAccountAmount(liabilityTotal)}</td></tr>
              </tbody></table>
            </section>
            <section>
              <div className="uppercase mb-2 font-bold">EQUITY</div>
              <table className="w-full"><tbody>{renderAccounts(equity.filter(x => !((x.account_name || '').toLowerCase().includes('drawing'))), 'credit')}
                {drawings.map(x => (
                  <tr key={x.account_id}>
                    <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
                    <td className="w-40 py-1.5 text-right font-mono pr-2">({formatAccountAmount(Math.max(0, x.balance))})</td>
                  </tr>
                ))}
                <tr><td className="pl-6 py-1.5">Current Year Net Income (Loss)</td><td className="text-right font-mono pr-2">{formatAccountAmount(netIncome)}</td></tr>
                <tr className="font-bold border-t"><td className="pl-6 py-2">TOTAL EQUITY</td><td className="text-right font-mono pr-2">{formatAccountAmount(totalEquity)}</td></tr>
                <tr className="font-bold border-t-2 border-slate-800"><td className="pl-6 py-2">TOTAL LIABILITIES &amp; EQUITY</td><td className="text-right font-mono pr-2">{formatAccountAmount(totalLiabEquity)}</td></tr>
              </tbody></table>
            </section>
            <div className={`p-3 rounded-lg text-center font-bold ${Math.abs(assetTotal - totalLiabEquity) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {Math.abs(assetTotal - totalLiabEquity) < 0.01
                ? 'BALANCED — Assets equal Liabilities & Equity'
                : `UNBALANCED — Difference: ${formatAccountAmount(assetTotal - totalLiabEquity)}`}
            </div>
            <div className="flex justify-end">
              <button type="button" onClick={handleExportBundle} className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-xl bg-blue-600 hover:bg-blue-700 text-white shadow-sm">
                <FileDown className="w-4 h-4" /> Export AFS Bundle (.xlsx)
              </button>
            </div>
            <div className="mt-4">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Notes to Financial Statements (stub)</div>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                onBlur={saveNotes}
                placeholder="Enter notes to the financial statements here — saved automatically on blur."
                rows={5}
                className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-xl p-3 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Imported prior-year data — original file columns preserved */}
            {selectedImportYear !== null && importedRows.length > 0 && (
              <section className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="uppercase font-bold">Imported Data — {selectedImportYear}</div>
                  <button type="button" onClick={() => setSelectedImportYear(null)} className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">Hide</button>
                </div>
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-800">
                      <tr>
                        {importedHeaders.map((h) => (
                          <th key={h} className="px-3 py-2 text-left font-semibold text-slate-600 dark:text-slate-300 whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {importedRows.map((r, i) => (
                        <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                          {importedHeaders.map((h) => (
                            <td key={h} className="px-3 py-1.5 font-mono text-slate-700 dark:text-slate-300 whitespace-nowrap">{r.original?.[h] ?? ''}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <ImportDataModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        pageLabel="Balance Sheet"
        storageKey={importStorageKey}
        onImported={(y) => { loadImportedYears(); selectImportYear(y); }}
      />
    </div>
  );
}
