import React from 'react';
import { Landmark } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { getAccountBalances, getCurrentYear, formatAccountAmount } from '../lib/accountingBalances';

export function BalanceSheet() {
  const { currentClient, currentClientId, saveClient } = useAccounting();
  if (!currentClient || !currentClientId) return null;

  const year = getCurrentYear(currentClient);
  const balances = getAccountBalances(currentClient, year);
  const assets = balances.filter(x => ['asset', 'assets'].includes((x.account.type || '').toLowerCase()));
  const liabilities = balances.filter(x => ['liability', 'liabilities'].includes((x.account.type || '').toLowerCase()));
  const equity = balances.filter(x => (x.account.type || '').toLowerCase() === 'equity');

  const assetTotal = assets.reduce((n, x) => n + Math.max(0, x.currentYearBalance), 0);
  const liabilityTotal = liabilities.reduce((n, x) => n + Math.max(0, -x.currentYearBalance), 0);
  const equityAccountsTotal = equity.reduce((n, x) => n + Math.max(0, -x.currentYearBalance), 0);

  const revenue = balances.filter(x => (x.account.type || '').toLowerCase() === 'revenue')
    .reduce((n, x) => n + Math.max(0, -x.currentYearBalance), 0);
  const costs = balances.filter(x => ['cost','costs'].includes((x.account.type || '').toLowerCase()))
    .reduce((n, x) => n + Math.max(0, x.currentYearBalance), 0);
  const expenses = balances.filter(x => ['expense','expenses'].includes((x.account.type || '').toLowerCase()))
    .reduce((n, x) => n + Math.max(0, x.currentYearBalance), 0);
  const netIncome = revenue - costs - expenses;
  const totalEquity = equityAccountsTotal + netIncome;
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
    saveClient(currentClientId, { ...currentClient, bsData: { ...data, [field]: value } });

  const renderAccounts = (items: typeof balances, sign: 'debit' | 'credit') => items.map(x => {
    const amount = sign === 'debit' ? Math.max(0, x.currentYearBalance) : Math.max(0, -x.currentYearBalance);
    return (
      <tr key={x.account.id}>
        <td className="pl-6 py-1.5">{x.account.id} — {x.account.name}</td>
        <td className="w-40 py-1.5 text-right font-mono pr-2">{formatAccountAmount(amount)}</td>
      </tr>
    );
  });

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Balance Sheet" icon={<Landmark className="text-blue-500" />} centered />
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
              <table className="w-full"><tbody>{renderAccounts(equity, 'credit')}
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
          </div>
        </div>
      </div>
    </div>
  );
}
