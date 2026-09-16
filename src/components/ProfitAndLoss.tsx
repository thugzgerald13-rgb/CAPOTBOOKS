import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatAccountAmount, getCurrentYear, getProfitAndLossTotals } from '../lib/accountingBalances';

export function ProfitAndLoss() {
  const { currentClient, currentClientId, saveFinancialReportSnapshot } = useAccounting();
  const year = getCurrentYear(currentClient || ({ glAccounts: [] } as any));
  const [reportError, setReportError] = useState<string | null>(null);

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

  const renderAccounts = (items: typeof balances, sign: 'revenue' | 'debit') => items.length ? items.map(x => {
    const amount = sign === 'revenue'
      ? Math.max(0, Number(x.period_credit || 0) - Number(x.period_debit || 0))
      : Math.max(0, Number(x.period_debit || 0) - Number(x.period_credit || 0));
    return (
      <tr key={x.account_id}>
        <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
        <td className="w-40 py-1.5 text-right font-mono pr-2">{formatAccountAmount(amount)}</td>
      </tr>
    );
  }) : <tr><td colSpan={2} className="pl-6 py-2 text-slate-400">No accounts in this category.</td></tr>;

  // --- Cost of Revenue presented in manufacturing-style format:
  //     Raw Materials Used / Direct Labor / Factory Overhead, with underlined
  //     subtotals and a peso-prefixed grand total (double-underlined). ---
  type CostLine = (typeof costs)[number];
  const costAmt = (x: CostLine) => Math.max(0, Number(x.period_debit || 0) - Number(x.period_credit || 0));
  const sumCost = (g: CostLine[]) => g.reduce((n, x) => n + costAmt(x), 0);
  const peso = (n: number) => `₱ ${formatAccountAmount(n)}`;
  const rawMaterials = costs.filter(x => /purchase|raw.?material|materials? used/i.test(x.account_name));
  const directLabor = costs.filter(x => /direct.?labor|wages|salaries|payroll|labor/i.test(x.account_name));
  const factoryOverhead = costs.filter(x => !rawMaterials.includes(x) && !directLabor.includes(x));
  const firstCostGroup: 'raw' | 'labor' | 'oh' | null = rawMaterials.length ? 'raw' : directLabor.length ? 'labor' : factoryOverhead.length ? 'oh' : null;
  const costItemRow = (x: CostLine, showPeso: boolean) => (
    <tr key={x.account_id}>
      <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
      <td className="w-40 py-1.5 text-right font-mono pr-2">{showPeso ? peso(costAmt(x)) : formatAccountAmount(costAmt(x))}</td>
    </tr>
  );
  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Profit & Loss" icon={<TrendingUp className="text-emerald-500" />} centered />
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
              <div className="text-center font-medium mt-1">For the year ended December 31, {year}</div>
            </div>
          </div>

          {reportError && <div className="text-sm text-red-600 bg-red-50 dark:bg-red-950/30 rounded-lg p-3 mb-6">{reportError}</div>}

          <div className="max-w-3xl mx-auto space-y-6">
            <section>
              <div className="uppercase mb-2 font-bold">REVENUE</div>
              <table className="w-full"><tbody>{renderAccounts(revenue, 'revenue')}
                <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="text-right font-mono pr-2">{formatAccountAmount(revenueTotal)}</td></tr>
              </tbody></table>
            </section>

            <section>
              <div className="uppercase mb-2 font-bold">COST OF REVENUE</div>
              <table className="w-full"><tbody>
                {rawMaterials.length > 0 && (
                  <>
                    <tr><td colSpan={2} className="py-1.5 font-bold uppercase">Raw Materials Used:</td></tr>
                    {rawMaterials.map((x, i) => costItemRow(x, firstCostGroup === 'raw' && i === 0))}
                    {rawMaterials.length > 1 && (
                      <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="w-40 text-right font-mono pr-2">{formatAccountAmount(sumCost(rawMaterials))}</td></tr>
                    )}
                  </>
                )}
                {directLabor.length > 0 && directLabor.length === 1 && (
                  <tr className="font-bold"><td className="py-2 uppercase">Direct Labor</td><td className="w-40 text-right font-mono pr-2">{firstCostGroup === 'labor' ? peso(sumCost(directLabor)) : formatAccountAmount(sumCost(directLabor))}</td></tr>
                )}
                {directLabor.length > 1 && (
                  <>
                    <tr><td colSpan={2} className="py-1.5 font-bold uppercase">Direct Labor:</td></tr>
                    {directLabor.map((x, i) => costItemRow(x, firstCostGroup === 'labor' && i === 0))}
                    <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="w-40 text-right font-mono pr-2">{formatAccountAmount(sumCost(directLabor))}</td></tr>
                  </>
                )}
                {factoryOverhead.length > 0 && (
                  <>
                    <tr><td colSpan={2} className="py-1.5 font-bold uppercase">Factory Overhead:</td></tr>
                    {factoryOverhead.map((x, i) => costItemRow(x, firstCostGroup === 'oh' && i === 0))}
                    {factoryOverhead.length > 1 && (
                      <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="w-40 text-right font-mono pr-2">{formatAccountAmount(sumCost(factoryOverhead))}</td></tr>
                    )}
                  </>
                )}
                {costs.length === 0 && <tr><td colSpan={2} className="pl-6 py-2 text-slate-400">No accounts in this category.</td></tr>}
                {costs.length > 0 && (
                  <tr className="font-bold border-t-2" style={{ borderBottom: '3px double currentColor' }}><td className="pl-6 py-2"></td><td className="w-40 text-right font-mono pr-2">{peso(costTotal)}</td></tr>
                )}
              </tbody></table>
            </section>

            <div className="flex justify-between items-center py-2 font-bold">
              <div className="uppercase">GROSS INCOME</div><div className="w-40 text-right font-mono pr-2">{formatAccountAmount(grossIncome)}</div>
            </div>

            <section>
              <div className="uppercase mb-2 font-bold">OPERATING EXPENSES</div>
              <table className="w-full"><tbody>{renderAccounts(expenses, 'debit')}
                <tr className="font-bold border-t"><td className="pl-6 py-2"></td><td className="text-right font-mono pr-2">{formatAccountAmount(expenseTotal)}</td></tr>
              </tbody></table>
            </section>

            <div className="flex justify-between items-center py-3 border-t-2 border-slate-800 font-bold text-base">
              <div className="uppercase">NET INCOME (LOSS)</div><div className="w-40 text-right font-mono pr-2">{formatAccountAmount(netIncome)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
