import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { formatAccountAmount, getCurrentYear, getProfitAndLossTotals } from '../lib/accountingBalances';

type BalanceItem = { account_id: string; account_name: string; period_debit?: number; period_credit?: number; balance?: number };

export function ProfitAndLoss() {
  const canEdit = usePermission('edit_transactions');
  const { currentClient, currentClientId, saveFinancialReportSnapshot } = useAccounting();

  // Report year is always the ledger's latest year.
  const glYear = getCurrentYear(currentClient || ({ glAccounts: [] } as any));
  const year = glYear;
  const [reportError, setReportError] = useState<string | null>(null);

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

  const { revenue, costs, expenses } = totals;
  const money = 'w-32 py-1.5 text-right font-mono pr-2';

  // Prior-column amount cell: plain ledger text (imported prior-year column removed).
  const priorCell = (_accountId: string, value: number) => (
    <td className={`${money} text-slate-400`}>{formatAccountAmount(value)}</td>
  );

  // Ledger-derived amounts.  The current column follows the Trial Balance
  // ending balance (opening balance + current-year activity), rather than
  // only the current-year journal movement. This keeps P&L tied to the same
  // ending balances shown by the Trial Balance.
  const glCur = (x: BalanceItem, sign: 'revenue' | 'debit') =>
    sign === 'revenue'
      ? Math.max(0, -Number(x.balance || 0))
      : Math.max(0, Number(x.balance || 0));

  // Beginning/prior balance = Trial Balance ending balance less current-year
  // movement, which corresponds to the stored opening balance.
  const glPrior = (x: BalanceItem, sign: 'revenue' | 'debit') => {
    const priorSigned = Number(x.balance || 0) - (Number(x.period_debit || 0) - Number(x.period_credit || 0));
    return sign === 'revenue' ? Math.max(0, -priorSigned) : Math.max(0, priorSigned);
  };

  const cur = glCur;
  const prior = glPrior;

  const revenueTotal = revenue.reduce((n, x) => n + cur(x, 'revenue'), 0);
  const costTotal = costs.reduce((n, x) => n + cur(x, 'debit'), 0);
  const expenseTotal = expenses.reduce((n, x) => n + cur(x, 'debit'), 0);
  const grossIncome = revenueTotal - costTotal;
  const netIncome = grossIncome - expenseTotal;
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

  const renderAccounts = (items: BalanceItem[], sign: 'revenue' | 'debit') => items.length ? items.map(x => (
    <tr key={x.account_id}>
      <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
      <td className={money}>{formatAccountAmount(cur(x, sign))}</td>
      {priorCell(x.account_id, prior(x, sign))}
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
      <td className={money}>{formatAccountAmount(costAmt(x))}</td>
      {priorCell(x.account_id, costPrior(x))}
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
      <div className="p-4 md:p-6 flex-1">
        <div className="p-8 text-sm">
          <div className="text-center mb-8">
            <input disabled={!canEdit} title={canEdit ? undefined : 'Edit Transactions permission not granted'} value={data.companyName} onChange={e => update('companyName', e.target.value)}
              className="text-xl font-bold text-center uppercase tracking-wide bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none block w-full max-w-md mx-auto" />
            <input disabled={!canEdit} title={canEdit ? undefined : 'Edit Transactions permission not granted'} value={data.address} onChange={e => update('address', e.target.value)}
              className="text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none block w-full max-w-md mx-auto mt-1" />
            <div className="mt-6">
              <input disabled={!canEdit} title={canEdit ? undefined : 'Edit Transactions permission not granted'} value={data.reportName} onChange={e => update('reportName', e.target.value)}
                className="text-lg font-medium text-center uppercase bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none block w-full max-w-md mx-auto" />
              <div className="text-center font-medium mt-1">For the year ended December 31, {year} (accrual basis)</div>
            </div>
          </div>
          {reportError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 mb-6">{reportError}</div>}
          <div className="max-w-3xl mx-auto space-y-6">
            <section>
              <div className="uppercase mb-2 font-bold">REVENUE</div>
              <table className="w-full"><tbody>{colHeaders}{renderAccounts(revenue, 'revenue')}
                <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="text-right font-mono pr-2">{formatAccountAmount(revenueTotal)}</td><td className="text-right font-mono pr-2 text-slate-400">{formatAccountAmount(priorRevenueTotal)}</td></tr>
              </tbody></table>
            </section>
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
            <div className="flex justify-between items-center py-2 font-bold">
              <div className="uppercase">GROSS INCOME</div>
              <div className="flex gap-6"><span className="w-32 text-right font-mono pr-2">{formatAccountAmount(grossIncome)}</span><span className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(priorGrossIncome)}</span></div>
            </div>
            <section>
              <div className="uppercase mb-2 font-bold">OPERATING EXPENSES</div>
              <table className="w-full"><tbody>{colHeaders}{renderAccounts(expenses, 'debit')}
                <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="text-right font-mono pr-2">{formatAccountAmount(expenseTotal)}</td><td className="text-right font-mono pr-2 text-slate-400">{formatAccountAmount(priorExpenseTotal)}</td></tr>
              </tbody></table>
            </section>
            <div className="flex justify-between items-center py-3 border-t-2 border-slate-800 font-bold text-base">
              <div className="uppercase">NET INCOME (LOSS)</div>
              <div className="flex gap-6"><span className="w-32 text-right font-mono pr-2">{formatAccountAmount(netIncome)}</span><span className="w-32 text-right font-mono pr-2 text-slate-400">{formatAccountAmount(priorNetIncome)}</span></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
