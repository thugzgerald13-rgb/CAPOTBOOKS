import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatAccountAmount } from '../lib/accountingBalances';

export function ProfitAndLoss() {
  const { currentClient, currentClientId, saveClient, fetchServerAccountBalances } = useAccounting();
  const [balances, setBalances] = useState<any[]>([]);
  const [reportError, setReportError] = useState<string | null>(null);
  const year = new Date().getFullYear();

  useEffect(() => {
    let cancelled = false;
    if (!currentClientId) { setBalances([]); return; }
    setReportError(null);
    fetchServerAccountBalances(`${year}-01-01`, `${year}-12-31`)
      .then(rows => { if (!cancelled) setBalances(rows); })
      .catch(err => { if (!cancelled) setReportError(err?.message || 'Unable to load report balances.'); });
    return () => { cancelled = true; };
  }, [currentClientId, year, fetchServerAccountBalances]);

  if (!currentClient || !currentClientId) return null;
  const revenue = balances.filter(x => (x.account_type || '').toLowerCase() === 'revenue');
  const costs = balances.filter(x => ['cost', 'costs'].includes((x.account_type || '').toLowerCase()));
  const expenses = balances.filter(x => ['expense', 'expenses'].includes((x.account_type || '').toLowerCase()));

  const revenueTotal = revenue.reduce((n, x) => n + Math.max(0, x.period_credit - x.period_debit), 0);
  const costTotal = costs.reduce((n, x) => n + Math.max(0, x.period_debit - x.period_credit), 0);
  const expenseTotal = expenses.reduce((n, x) => n + Math.max(0, x.period_debit - x.period_credit), 0);
  const grossIncome = revenueTotal - costTotal;
  const netIncome = grossIncome - expenseTotal;

  const data = currentClient.plData || {
    companyName: currentClient.tradeName || currentClient.name || '',
    address: [currentClient.street, currentClient.barangay, currentClient.city, currentClient.zipCode].filter(Boolean).join(', ') || '',
    reportName: 'INCOME STATEMENT',
    period: `For the year ended December 31, ${year}`,
    revenue: [], costOfRevenue: [], operatingExpenses: [], provisionForIncomeTax: '0.00'
  };

  const update = (field: 'companyName' | 'address' | 'reportName' | 'period', value: string) =>
    saveClient(currentClientId, { ...currentClient, plData: { ...data, [field]: value } });

  const renderAccounts = (items: typeof balances) => items.length ? items.map(x => (
    <tr key={x.account_id}>
      <td className="pl-6 py-1.5">{x.account_id} — {x.account_name}</td>
      <td className="w-40 py-1.5 text-right font-mono pr-2">{formatAccountAmount(Math.abs(x.period_credit - x.period_debit))}</td>
    </tr>
  )) : <tr><td colSpan={2} className="pl-6 py-2 text-slate-400">No accounts in this category.</td></tr>;

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

          {reportError && <div className="mb-4 p-3 rounded-lg bg-red-50 text-red-700 text-sm">{reportError}</div>}
          {!reportError && balances.length === 0 && <div className="mb-4 text-center text-sm text-slate-400">Loading server-calculated balances…</div>}
          <div className="max-w-3xl mx-auto space-y-6">
            <section>
              <div className="uppercase mb-2 font-bold">REVENUE</div>
              <table className="w-full"><tbody>{renderAccounts(revenue)}
                <tr className="font-bold border-t"><td className="pl-6 py-2">TOTAL REVENUE</td><td className="text-right font-mono pr-2">{formatAccountAmount(revenueTotal)}</td></tr>
              </tbody></table>
            </section>

            <section>
              <div className="uppercase mb-2 font-bold">COST OF REVENUE</div>
              <table className="w-full"><tbody>{renderAccounts(costs)}
                <tr className="font-bold border-t"><td className="pl-6 py-2">TOTAL COST OF REVENUE</td><td className="text-right font-mono pr-2">{formatAccountAmount(costTotal)}</td></tr>
              </tbody></table>
            </section>

            <div className="flex justify-between items-center py-2 font-bold">
              <div className="uppercase">GROSS INCOME</div><div className="w-40 text-right font-mono pr-2">{formatAccountAmount(grossIncome)}</div>
            </div>

            <section>
              <div className="uppercase mb-2 font-bold">OPERATING EXPENSES</div>
              <table className="w-full"><tbody>{renderAccounts(expenses)}
                <tr className="font-bold border-t"><td className="pl-6 py-2">TOTAL OPERATING EXPENSES</td><td className="text-right font-mono pr-2">{formatAccountAmount(expenseTotal)}</td></tr>
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
