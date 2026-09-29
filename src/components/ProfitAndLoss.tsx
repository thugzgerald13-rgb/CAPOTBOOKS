import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Save, Upload } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatAccountAmount, getCurrentYear, getProfitAndLossTotals } from '../lib/accountingBalances';
import { loadReportLayout, saveReportLayout, CASH_BASIS_NOTE, type ReportBasis } from '../lib/reportCustomizer';
import ImportDataModal from './ImportDataModal';
import { useImportedData, ImportedDataToolbar, ImportedDataTable } from './ImportedData';

type BalanceItem = { account_id: string; account_name: string; period_debit?: number; period_credit?: number; balance?: number };

export function ProfitAndLoss() {
  const { currentClient, currentClientId, saveFinancialReportSnapshot, showToast } = useAccounting();
  const year = getCurrentYear(currentClient || ({ glAccounts: [] } as any));
  const [reportError, setReportError] = useState<string | null>(null);

  // ---- Import prior-year data (format of uploaded file is preserved) ----
  const [importModalOpen, setImportModalOpen] = useState(false);
  const importStorageKey = `pl_import_${currentClientId}`;
  const imported = useImportedData(importStorageKey);
  const importAccounts = useMemo(
    () => ((currentClient?.glAccounts || []) as any[]).map((a) => ({ id: String(a.accountId || a.id || ''), title: String(a.accountTitle || '') })),
    [currentClient],
  );
  // -----------------------------------------------------------------------

  // ---- T017: report customization state (loaded from saved layout) ----
  const [basis, setBasis] = useState<ReportBasis>('accrual');
  const [showSections, setShowSections] = useState<Record<string, boolean>>({ revenue: true, costs: true, expenses: true });
  useEffect(() => {
    if (!currentClientId) return;
    const saved = loadReportLayout(currentClientId, 'pl', { basis: 'accrual', showSections: { revenue: true, costs: true, expenses: true }, columns: [], updatedAt: '' });
    setBasis(saved.basis);
    setShowSections({ revenue: true, costs: true, expenses: true, ...saved.showSections });
  }, [currentClientId]);
  const totals = useMemo(
    () => getProfitAndLossTotals(currentClient || ({ glAccounts: [] } as any), year),
    [currentClient, year]
  );
  const balances = totals.balances;
  useEffect(() => {
    if (!currentClientId) { setReportError(null); return; }
    setReportError(balances.length ? null : 'No accounts found.');
  }, [currentClientId, balances]);
  if (!currentClient || !currentClientId) return null;
  const { revenue, costs, expenses, revenueTotal, costTotal, expenseTotal, grossIncome, netIncome } = totals;
  // Prior-year (comparative) amount: cumulative balance minus current-period movement.
  const cur = (x: BalanceItem, sign: 'revenue' | 'debit') =>
    sign === 'revenue'
      ? Math.max(0, Number(x.period_credit || 0) - Number(x.period_debit || 0))
      : Math.max(0, Number(x.period_debit || 0) - Number(x.period_credit || 0));
  const prior = (x: BalanceItem, sign: 'revenue' | 'debit') =>
    Math.max(0, Number(x.balance || 0) - cur(x, sign));
  const priorRevenueTotal = revenue.reduce((n, x) => n + prior(x, 'revenue'), 0);
  const priorCostTotal = costs.reduce((n, x) => n + prior(x, 'debit'), 0);
  const priorExpenseTotal = expenses.reduce((n, x) => n + prior(x, 'debit'), 0);
  const priorGrossIncome = priorRevenueTotal - priorCostTotal;
  const priorNetIncome = priorGrossIncome - priorExpenseTotal;
  const data = currentClient.plData || {
    companyName: currentClient.tradeName || currentClient.name || '',
    address: [currentClient.street, currentClient.barangay, currentClient.city, currentClient.zipCode].filter(Boolean).join(', ') || '',
    reportName: 'INCOME STATEMENT',
    period: `For the year ended December 31, ${year}`,
    revenue: [], costOfRevenue: [], operatingExpenses: [], provisionForIncomeTax: '0.00'
  };
  const update = (field: 'companyName' | 'address' | 'reportName', value: string) =>
    saveFinancialReportSnapshot('P&L', { ...data, [field]: value });
  const handleSaveLayout = () => {
    saveReportLayout(currentClientId, 'pl', { basis, showSections, columns: [], updatedAt: new Date().toISOString() });
    showToast('Report layout saved');
  };
  const toggleSection = (k: string) => setShowSections(prev => ({ ...prev, [k]: !prev[k] }));
  const renderAccounts = (items: BalanceItem[], sign: 'revenue' | 'debit') => items.length ? items.map(x => (
    <tr key={x.account_id}>
      <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
      <td className="w-32 py-1.5 text-right font-mono pr-2">{formatAccountAmount(cur(x, sign))}</td>
      <td className="w-32 py-1.5 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(prior(x, sign))}</td>
    </tr>
  )) : <tr><td colSpan={3} className="pl-6 py-2 text-slate-400">No accounts in this category.</td></tr>;
  type CostLine = (typeof costs)[number];
  const costAmt = (x: CostLine) => cur(x, 'debit');
  const costPrior = (x: CostLine) => prior(x, 'debit');
  const sumCost = (g: CostLine[]) => g.reduce((n, x) => n + costAmt(x), 0);
  const sumCostPrior = (g: CostLine[]) => g.reduce((n, x) => n + costPrior(x), 0);
  const rawMaterials = costs.filter(x => /purchase|raw.?material|materials? used/i.test(x.account_name));
  const directLabor = costs.filter(x => /direct.?labor|wages|salaries|payroll|labor/i.test(x.account_name));
  const factoryOverhead = costs.filter(x => !rawMaterials.includes(x) && !directLabor.includes(x));
  const costItemRow = (x: CostLine) => (
    <tr key={x.account_id}>
      <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
      <td className="w-32 py-1.5 text-right font-mono pr-2">{formatAccountAmount(costAmt(x))}</td>
      <td className="w-32 py-1.5 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(costPrior(x))}</td>
    </tr>
  );
  const colHeaders = (
    <tr className="text-[10px] uppercase text-slate-400 font-bold">
      <td className="pl-6 py-1"></td>
      <td className="w-32 text-right pr-2">{year}</td>
      <td className="w-32 text-right pr-2">{year - 1}</td>
    </tr>
  );
  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Profit & Loss" icon={<TrendingUp className="text-emerald-500" />} centered />
      {/* T017: report customization toolbar + import prior-year data */}
      <div className="no-print px-4 md:px-6 flex flex-wrap items-center gap-3 mb-2">
        <div className="inline-flex rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden text-xs font-bold">
          <button type="button" onClick={() => setBasis('accrual')} className={`px-3 py-1.5 ${basis === 'accrual' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}>Accrual</button>
          <button type="button" onClick={() => setBasis('cash')} className={`px-3 py-1.5 ${basis === 'cash' ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300'}`}>Cash</button>
        </div>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5"><input type="checkbox" checked={!!showSections.revenue} onChange={() => toggleSection('revenue')} className="rounded" /> Revenue</label>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5"><input type="checkbox" checked={!!showSections.costs} onChange={() => toggleSection('costs')} className="rounded" /> Cost of Revenue</label>
        <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5"><input type="checkbox" checked={!!showSections.expenses} onChange={() => toggleSection('expenses')} className="rounded" /> Operating Expenses</label>

        <ImportedDataToolbar api={imported} pageType="profit-loss" onImportClick={() => setImportModalOpen(true)} />

        <button type="button" onClick={handleSaveLayout} className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 hover:opacity-90">
          <Save className="w-3.5 h-3.5" /> Save Layout
        </button>
      </div>
      {basis === 'cash' && (
        <div className="no-print mx-4 md:mx-6 mb-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-[11px] text-amber-700 dark:text-amber-300">{CASH_BASIS_NOTE}</div>
      )}
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
              <div className="text-center font-medium mt-1">For the year ended December 31, {year} ({basis} basis)</div>
            </div>
          </div>
          {reportError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 mb-6">{reportError}</div>}
          <div className="max-w-3xl mx-auto space-y-6">
            {showSections.revenue && (
              <section>
                <div className="uppercase mb-2 font-bold">REVENUE</div>
                <table className="w-full"><tbody>{colHeaders}{renderAccounts(revenue, 'revenue')}
                  <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="text-right font-mono pr-2">{formatAccountAmount(revenueTotal)}</td><td className="text-right font-mono pr-2 text-slate-400">{formatAccountAmount(priorRevenueTotal)}</td></tr>
                </tbody></table>
              </section>
            )}
            {showSections.costs && (
              <section>
                <div className="uppercase mb-2 font-bold">COST OF REVENUE</div>
                <table className="w-full"><tbody>{colHeaders}
                  {rawMaterials.length > 0 && (
                    <>
                      <tr><td colSpan={3} className="py-1.5 font-bold uppercase">Raw Materials Used:</td></tr>
                      {rawMaterials.map(x => costItemRow(x))}
                      {rawMaterials.length > 1 && (
                        <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="w-32 text-right font-mono pr-2">{formatAccountAmount(sumCost(rawMaterials))}</td><td className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(sumCostPrior(rawMaterials))}</td></tr>
                      )}
                    </>
                  )}
                  {directLabor.length > 0 && directLabor.length === 1 && (
                    <tr className="font-bold"><td className="py-2 uppercase">Direct Labor</td><td className="w-32 text-right font-mono pr-2">{formatAccountAmount(sumCost(directLabor))}</td><td className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(sumCostPrior(directLabor))}</td></tr>
                  )}
                  {directLabor.length > 1 && (
                    <>
                      <tr><td colSpan={3} className="py-1.5 font-bold uppercase">Direct Labor:</td></tr>
                      {directLabor.map(x => costItemRow(x))}
                      <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="w-32 text-right font-mono pr-2">{formatAccountAmount(sumCost(directLabor))}</td><td className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(sumCostPrior(directLabor))}</td></tr>
                    </>
                  )}
                  {factoryOverhead.length > 0 && (
                    <>
                      <tr><td colSpan={3} className="py-1.5 font-bold uppercase">Factory Overhead:</td></tr>
                      {factoryOverhead.map(x => costItemRow(x))}
                      {factoryOverhead.length > 1 && (
                        <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="w-32 text-right font-mono pr-2">{formatAccountAmount(sumCost(factoryOverhead))}</td><td className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(sumCostPrior(factoryOverhead))}</td></tr>
                      )}
                    </>
                  )}
                  {costs.length === 0 && <tr><td colSpan={3} className="pl-6 py-2 text-slate-400">No accounts in this category.</td></tr>}
                  {costs.length > 0 && (
                    <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="w-32 text-right font-mono pr-2">{formatAccountAmount(costTotal)}</td><td className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(priorCostTotal)}</td></tr>
                  )}
                </tbody></table>
              </section>
            )}
            <div className="flex justify-between items-center py-2 font-bold">
              <div className="uppercase">GROSS INCOME</div>
              <div className="flex gap-6"><span className="w-32 text-right font-mono pr-2">{formatAccountAmount(grossIncome)}</span><span className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(priorGrossIncome)}</span></div>
            </div>
            {showSections.expenses && (
              <section>
                <div className="uppercase mb-2 font-bold">OPERATING EXPENSES</div>
                <table className="w-full"><tbody>{colHeaders}{renderAccounts(expenses, 'debit')}
                  <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="text-right font-mono pr-2">{formatAccountAmount(expenseTotal)}</td><td className="text-right font-mono pr-2 text-slate-400">{formatAccountAmount(priorExpenseTotal)}</td></tr>
                </tbody></table>
              </section>
            )}
            <div className="flex justify-between items-center py-3 border-t-2 border-slate-800 font-bold text-base">
              <div className="uppercase">NET INCOME (LOSS)</div>
              <div className="flex gap-6"><span className="w-32 text-right font-mono pr-2">{formatAccountAmount(netIncome)}</span><span className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(priorNetIncome)}</span></div>
            </div>

            <ImportedDataTable api={imported} pageType="profit-loss" />
          </div>
        </div>
      </div>

      <ImportDataModal
        open={importModalOpen}
        onClose={() => setImportModalOpen(false)}
        pageLabel="Profit & Loss"
        storageKey={importStorageKey}
        accounts={importAccounts}
        onImported={(y) => { imported.reload(); imported.setSelectedYear(y); }}
      />
    </div>
  );
}
