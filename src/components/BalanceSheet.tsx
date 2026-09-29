import React, { useEffect, useMemo, useState } from 'react';
import { Landmark, FileDown } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatAccountAmount, getCurrentYear } from '../lib/accountingBalances';
import { exportAfBundle, type AfsSheetRow } from '../lib/afsExport';
import { NET_INCOME_ID } from '../utils/fileParser';
import ImportDataModal from './ImportDataModal';
import { useImportedData, ImportedDataToolbar, ReportYearSelect, ReportAmount } from './ImportedData';

type Line = {
  account_id: string; account_name: string; account_type: string;
  balance: number; period_debit: number; period_credit: number; period_balance: number;
  prior_period_debit: number; prior_period_credit: number;
};
type Col = 'cur' | 'prior';

const isDrawing = (x: Line) => ['equity', 'equities', 'capital'].includes((x.account_type || '').toLowerCase()) && (x.account_name || '').toLowerCase().includes('drawing');
const numOf = (v: any) => Number(String(v ?? '').replace(/,/g, '') || 0);
const dateOf = (e: any) => String(e.date || e.dateDr || e.dateCr || '').slice(0, 10);

export function BalanceSheet() {
  const { currentClient, currentClientId, saveFinancialReportSnapshot } = useAccounting();
  const [balances, setBalances] = useState<Line[]>([]);
  const [reportError, setReportError] = useState<string | null>(null);

  // Report year: defaults to the ledger's latest year; picking / importing another year switches the report to it.
  const glYear = getCurrentYear(currentClient || ({ glAccounts: [] } as any));
  const [reportYear, setReportYear] = useState<number | null>(null);
  const year = reportYear ?? glYear;
  useEffect(() => { setReportYear(null); }, [currentClientId]);

  // ---- Balance Sheet import (separate from Profit & Loss; only reads BS accounts) ----
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importStorageKey = `bs_import_${currentClientId}`;
  const imported = useImportedData(importStorageKey);
  const importAccounts = useMemo(
    () => ((currentClient?.glAccounts || []) as any[]).map((a) => ({
      id: String(a.accountId || a.id || ''), title: String(a.accountTitle || ''), type: String(a.accountType || ''),
    })),
    [currentClient],
  );
  // Imported data is shown in its OWN column — it never replaces the ledger's current / prior year.
  const impYear = imported.selectedYear ?? imported.years[0] ?? null;
  const impMap = impYear !== null ? imported.amountsFor(impYear) : null;
  const hasImport = impMap !== null;
  // -------------------------------------------------------------------------------------

  useEffect(() => {
    if (!currentClientId) { setBalances([]); setReportError(null); return; }
    const start = `${year}-01-01`;
    const end = `${year + 1}-01-01`;
    const pStart = `${year - 1}-01-01`;
    const fallback: Line[] = (currentClient.glAccounts || []).map((account: any) => {
      const entries = Array.isArray(account.entries) ? account.entries : [];
      const inRange = (a: string, b: string) => entries.filter((e: any) => { const d = dateOf(e); return d >= a && d < b; });
      const cur = inRange(start, end);
      const prv = inRange(pStart, start);
      const sum = (list: any[], k: 'debit' | 'credit') => list.reduce((n: number, e: any) => n + numOf(e[k]), 0);
      const all = entries.filter((e: any) => dateOf(e) < end);
      return {
        account_id: String(account.accountId || account.id),
        account_name: String(account.accountTitle || ''),
        account_type: String(account.accountType || ''),
        balance: sum(all, 'debit') - sum(all, 'credit'),
        period_debit: sum(cur, 'debit'),
        period_credit: sum(cur, 'credit'),
        period_balance: sum(cur, 'debit') - sum(cur, 'credit'),
        prior_period_debit: sum(prv, 'debit'),
        prior_period_credit: sum(prv, 'credit'),
      };
    });
    setBalances(fallback);
    setReportError(fallback.length ? null : 'No accounts found.');
  }, [currentClientId, currentClient, year]);

  if (!currentClient || !currentClientId) return null;

  const typeIs = (x: Line, list: string[]) => list.includes((x.account_type || '').toLowerCase());
  const assets = balances.filter(x => typeIs(x, ['asset', 'assets']));
  const liabilities = balances.filter(x => typeIs(x, ['liability', 'liabilities']));
  const equityAll = balances.filter(x => typeIs(x, ['equity', 'equities', 'capital']));
  const drawings = equityAll.filter(isDrawing);
  const equity = equityAll.filter(x => !isDrawing(x));

  // Current column is always the ledger. Prior column is imported when a year was imported
  // (accounts missing from the import fall back to the ledger so nothing disappears).
  const amt = (x: Line, sign: 'debit' | 'credit', col: Col) => {
    if (col === 'prior' && hasImport && impMap!.has(x.account_id)) return impMap!.get(x.account_id)!;
    const bal = col === 'cur' ? x.balance : x.balance - x.period_balance;
    return sign === 'debit' ? Math.max(0, bal) : Math.max(0, -bal);
  };
  const drawAmt = (x: Line, col: Col) => {
    if (col === 'prior' && hasImport && impMap!.has(x.account_id)) return Math.abs(impMap!.get(x.account_id)!);
    const bal = col === 'cur' ? x.balance : x.balance - x.period_balance;
    return Math.max(0, bal);
  };
  const glNetIncome = (col: Col) => {
    const d = (x: Line) => (col === 'cur' ? x.period_debit : x.prior_period_debit);
    const c = (x: Line) => (col === 'cur' ? x.period_credit : x.prior_period_credit);
    const rev = balances.filter(x => typeIs(x, ['revenue'])).reduce((n, x) => n + Math.max(0, c(x) - d(x)), 0);
    const exp = balances.filter(x => typeIs(x, ['cost', 'costs', 'expense', 'expenses'])).reduce((n, x) => n + Math.max(0, d(x) - c(x)), 0);
    return rev - exp;
  };
  const netIncomeFor = (col: Col) =>
    col === 'prior' && hasImport && impMap!.has(NET_INCOME_ID) ? (impMap!.get(NET_INCOME_ID)!) : glNetIncome(col);

  const totalsFor = (col: Col) => {
    const assetTotal = assets.reduce((n, x) => n + amt(x, 'debit', col), 0);
    const liabilityTotal = liabilities.reduce((n, x) => n + amt(x, 'credit', col), 0);
    const equityAccountsTotal = equity.reduce((n, x) => n + amt(x, 'credit', col), 0);
    const drawingsTotal = drawings.reduce((n, x) => n + drawAmt(x, col), 0);
    const netIncome = netIncomeFor(col);
    const totalEquity = equityAccountsTotal - drawingsTotal + netIncome;
    return { assetTotal, liabilityTotal, netIncome, totalEquity, totalLiabEquity: liabilityTotal + totalEquity };
  };
  const T = totalsFor('cur');
  const P = totalsFor('prior');
  const diffCur = T.assetTotal - T.totalLiabEquity;
  const diffPrior = P.assetTotal - P.totalLiabEquity;

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

  // ---- notes stub + AFS bundle export (uses the SAME numbers the report shows) ----
  const [notes, setNotes] = useState<string>(data.notes || '');
  const saveNotes = () => saveFinancialReportSnapshot('Balance Sheet', { ...data, notes });
  const rowsFor = (items: Line[], sign: 'debit' | 'credit'): AfsSheetRow[] =>
    items.map(x => ({ account: `${x.account_id} — ${x.account_name}`, current: amt(x, sign, 'cur'), prior: amt(x, sign, 'prior') }));
  const handleExportBundle = () => {
    exportAfBundle({
      company: data.companyName,
      period: `As of December 31, ${year}`,
      balanceSheet: [
        ...rowsFor(assets, 'debit'),
        { account: 'TOTAL ASSETS', current: T.assetTotal, prior: P.assetTotal },
        ...rowsFor(liabilities, 'credit'),
        { account: 'TOTAL LIABILITIES', current: T.liabilityTotal, prior: P.liabilityTotal },
        ...rowsFor(equity, 'credit'),
        { account: 'Current Year Net Income', current: T.netIncome, prior: P.netIncome },
        { account: 'TOTAL EQUITY', current: T.totalEquity, prior: P.totalEquity },
      ],
      incomeStatement: [],
      cashFlow: [],
      notes: notes || '(Notes to financial statements — to be completed by the accountant.)',
      filename: `AFS-bundle-${year}.xlsx`,
    });
  };

  const money = 'w-32 py-1.5 text-right font-mono pr-2';
  // Prior-column amount cell: editable input when this account is in the import, else plain ledger text.
  const priorCell = (accountId: string, value: number) => {
    if (hasImport && impMap!.has(accountId)) {
      return <ReportAmount api={imported} year={impYear as number} accountId={accountId} value={value} className={`${money} text-slate-400`} />;
    }
    return <td className={`${money} text-slate-400`}>{formatAccountAmount(value)}</td>;
  };
  const colHeaders = (
    <tr className="text-[10px] uppercase text-slate-400 font-bold">
      <td className="pl-6 py-1"></td>
      <td className="w-32 text-right pr-2">{year}</td>
      <td className="w-32 text-right pr-2">{hasImport ? `${impYear} ·imported` : year - 1}</td>
    </tr>
  );
  const totalRow = (label: string, cur: number, prior: number, cls = 'font-bold border-t') => (
    <tr className={cls}>
      <td className="pl-6 py-2">{label}</td>
      <td className="w-32 text-right font-mono pr-2">{formatAccountAmount(cur)}</td>
      <td className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(prior)}</td>
    </tr>
  );
  const renderAccounts = (items: Line[], sign: 'debit' | 'credit') => items.map(x => (
    <tr key={x.account_id}>
      <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
      <td className={money}>{formatAccountAmount(amt(x, sign, 'cur'))}</td>
      {priorCell(x.account_id, amt(x, sign, 'prior'))}
    </tr>
  ));

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Balance Sheet" icon={<Landmark className="text-blue-500" />} centered />

      <div className="no-print px-4 md:px-6 flex flex-wrap items-center gap-3 mb-2">
        <ReportYearSelect year={year} glYear={glYear} importedYears={imported.years} onChange={setReportYear} />
        <ImportedDataToolbar api={imported} pageType="balance-sheet" onImportClick={() => setImportModalOpen(true)} />
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
              <table className="w-full"><tbody>{colHeaders}{renderAccounts(assets, 'debit')}
                {totalRow('TOTAL ASSETS', T.assetTotal, P.assetTotal)}
              </tbody></table>
            </section>
            <section>
              <div className="uppercase mb-2 font-bold">LIABILITIES</div>
              <table className="w-full"><tbody>{colHeaders}{renderAccounts(liabilities, 'credit')}
                {totalRow('TOTAL LIABILITIES', T.liabilityTotal, P.liabilityTotal)}
              </tbody></table>
            </section>
            <section>
              <div className="uppercase mb-2 font-bold">EQUITY</div>
              <table className="w-full"><tbody>{colHeaders}{renderAccounts(equity, 'credit')}
                {drawings.map(x => (
                  <tr key={x.account_id}>
                    <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
                    <td className={money}>({formatAccountAmount(drawAmt(x, 'cur'))})</td>
                    {priorCell(x.account_id, drawAmt(x, 'prior'))}
                  </tr>
                ))}
                <tr>
                  <td className="pl-6 py-1.5">Current Year Net Income (Loss)</td>
                  <td className={money}>{formatAccountAmount(T.netIncome)}</td>
                  {priorCell(NET_INCOME_ID, P.netIncome)}
                </tr>
                {totalRow('TOTAL EQUITY', T.totalEquity, P.totalEquity)}
                {totalRow('TOTAL LIABILITIES & EQUITY', T.totalLiabEquity, P.totalLiabEquity, 'font-bold border-t-2 border-slate-800')}
              </tbody></table>
            </section>
            <div className={`p-3 rounded-lg text-center font-bold ${Math.abs(diffCur) < 0.01 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
              {Math.abs(diffCur) < 0.01
                ? `BALANCED (${year}) — Assets equal Liabilities & Equity`
                : `UNBALANCED (${year}) — Difference: ${formatAccountAmount(diffCur)}`}
              {Math.abs(diffPrior) >= 0.01 && (
                <div className="text-xs font-medium mt-1">{year - 1} column differs by {formatAccountAmount(diffPrior)}</div>
              )}
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

          </div>
        </div>
      </div>

      <ImportDataModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        pageLabel="Balance Sheet"
        kind="balance-sheet"
        storageKey={importStorageKey}
        accounts={importAccounts}
        onImported={(y) => { imported.reload(); imported.setSelectedYear(y); }}
      />
    </div>
  );
}
