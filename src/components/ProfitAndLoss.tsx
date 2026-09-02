import React, { useEffect, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { formatAccountAmount, getAccountBalances } from '../lib/accountingBalances';

export function ProfitAndLoss() {
  const { currentClient, currentClientId, saveClient } = useAccounting();
  const year = new Date().getFullYear();

  if (!currentClient || !currentClientId) return null;

  // Build the report directly from the live General Ledger.  The previous
  // implementation depended on the optional Supabase get_account_balances
  // RPC, which can return no rows when that database function is not deployed
  // or is out of sync with the current normalized schema.  The current client
  // is already passed through syncGeneralLedger by AccountingContext, so this
  // calculation includes the same posted transactions without a second data
  // source.
  const localBalances = getAccountBalances(currentClient, year);
  const balances = localBalances.map(x => ({
    account_id: String(x.account.id),
    account_name: x.account.name,
    account_type: String(x.account.type || ''),
    period_debit: Number(x.currentYearDebit || 0),
    period_credit: Number(x.currentYearCredit || 0),
  }));

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
