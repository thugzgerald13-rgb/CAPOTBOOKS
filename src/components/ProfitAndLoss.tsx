import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import type { ProfitAndLossLine } from '../types';
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

  const { revenue, expenses, revenueTotal, costTotal, expenseTotal } = totals;

  const data = currentClient.plData || {
    companyName: currentClient.tradeName || currentClient.name || '',
    address: [currentClient.street, currentClient.barangay, currentClient.city, currentClient.zipCode].filter(Boolean).join(', ') || '',
    reportName: 'INCOME STATEMENT',
    period: `For the year ended December 31, ${year}`,
    revenue: [], costOfRevenue: [], operatingExpenses: [], provisionForIncomeTax: '0.00'
  };

  const update = (field: 'companyName' | 'address' | 'reportName', value: string) =>
    saveFinancialReportSnapshot('P&L', { ...data, [field]: value });

  // Cost of Goods Sold schedule (replaces the flat "Cost of Revenue" list).
  // Lines are editable and persisted in plData.costOfRevenue. Subtotal lines
  // (those containing "total" or the computed "Raw materials used") are
  // excluded from the grand-total sum; lines prefixed "Less:" are subtracted.
  const DEFAULT_COGS_LINES: ProfitAndLossLine[] = [
    { id: 'cogs-rm-head', particulars: 'RAW MATERIALS USED:', amount: '' },
    { id: 'cogs-rm-beg', particulars: 'Raw materials inventory, beg', amount: '' },
    { id: 'cogs-rm-purch', particulars: 'Purchases', amount: '' },
    { id: 'cogs-rm-avail', particulars: 'Total goods available for use', amount: '' },
    { id: 'cogs-rm-end', particulars: 'Less: Raw materials inventory, end', amount: '' },
    { id: 'cogs-rm-used', particulars: 'Raw materials used', amount: '' },
    { id: 'cogs-dl', particulars: 'DIRECT LABOR', amount: '' },
    { id: 'cogs-fo-head', particulars: 'FACTORY OVERHEAD:', amount: '' },
    { id: 'cogs-fo-light', particulars: 'Light and water', amount: '' },
    { id: 'cogs-fo-lpg', particulars: 'LPG gas', amount: '' },
    { id: 'cogs-fo-personnel', particulars: 'Personnel Welfare', amount: '' },
    { id: 'cogs-fo-packaging', particulars: 'Packaging Supplies', amount: '' },
    { id: 'cogs-fo-dep', particulars: 'Depreciation', amount: '' },
    { id: 'cogs-fo-total', particulars: 'Total factory overhead', amount: '' },
  ];
  const cogsLines: ProfitAndLossLine[] = (data.costOfRevenue && data.costOfRevenue.length > 0) ? data.costOfRevenue : DEFAULT_COGS_LINES;
  const hasManualCogs = cogsLines.some(l => String(l.amount || '').trim() !== '');
  const cogsTotal = cogsLines.reduce((sum, line) => {
    const n = parseFloat(String(line.amount || '').replace(/,/g, ''));
    if (!Number.isFinite(n) || n === 0) return sum;
    const p = line.particulars.trim().toLowerCase();
    if (p.includes('total') || p === 'raw materials used') return sum; // subtotals — excluded
    if (p.startsWith('less')) return sum - n;
    return sum + n;
  }, 0);
  const effectiveCostTotal = hasManualCogs ? cogsTotal : costTotal;
  const updateCogsLine = (id: string, field: 'particulars' | 'amount', value: string) => {
    const lines = cogsLines.map(l => l.id === id ? { ...l, [field]: value } : l);
    saveFinancialReportSnapshot('P&L', { ...data, costOfRevenue: lines });
  };
  const addCogsLine = () => {
    const lines = [...cogsLines, { id: `cogs-${Date.now()}`, particulars: '', amount: '' }];
    saveFinancialReportSnapshot('P&L', { ...data, costOfRevenue: lines });
  };
  const removeCogsLine = (id: string) => {
    const lines = cogsLines.filter(l => l.id !== id);
    saveFinancialReportSnapshot('P&L', { ...data, costOfRevenue: lines });
  };

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
                <tr className="font-bold border-t"><td className="pl-6 py-2">TOTAL REVENUE</td><td className="text-right font-mono pr-2">{formatAccountAmount(revenueTotal)}</td></tr>
              </tbody></table>
            </section>

            <section>
              <div className="uppercase mb-2 font-bold">COST OF GOODS SOLD</div>
              <table className="w-full"><tbody>
                {cogsLines.map(line => {
                  const isHeading = line.particulars.trim().endsWith(':');
                  const isSubtotal = line.particulars.toLowerCase().includes('total') || line.particulars.trim() === 'Raw materials used' || line.particulars.trim() === 'DIRECT LABOR';
                  const rowClass = (isHeading || isSubtotal) ? 'font-semibold' : '';
                  return (
                    <tr key={line.id} className={rowClass}>
                      <td className="py-1 pr-2">
                        <input
                          value={line.particulars}
                          onChange={e => updateCogsLine(line.id, 'particulars', e.target.value)}
                          placeholder="Particulars"
                          className="w-full bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none"
                          style={{ paddingLeft: isHeading ? 0 : 24 }}
                        />
                      </td>
                      <td className="w-40 py-1 text-right pr-2">
                        {isHeading ? '' : (
                          <input
                            value={line.amount}
                            onChange={e => updateCogsLine(line.id, 'amount', e.target.value)}
                            placeholder="0.00"
                            className="w-full text-right font-mono bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none"
                          />
                        )}
                      </td>
                      <td className="w-6 text-center">
                        <button onClick={() => removeCogsLine(line.id)} title="Remove line" className="text-slate-300 hover:text-red-500 text-sm">×</button>
                      </td>
                    </tr>
                  );
                })}
                <tr>
                  <td colSpan={3} className="py-1">
                    <button onClick={addCogsLine} className="text-xs text-cyan-600 hover:underline">+ Add line</button>
                  </td>
                </tr>
                <tr className="font-bold border-t">
                  <td className="pl-6 py-2">TOTAL COST OF GOODS SOLD</td>
                  <td className="text-right font-mono pr-2">{formatAccountAmount(effectiveCostTotal)}</td>
                  <td></td>
                </tr>
              </tbody></table>
            </section>

            <div className="flex justify-between items-center py-2 font-bold">
              <div className="uppercase">GROSS INCOME</div><div className="w-40 text-right font-mono pr-2">{formatAccountAmount(revenueTotal - effectiveCostTotal)}</div>
            </div>

            <section>
              <div className="uppercase mb-2 font-bold">OPERATING EXPENSES</div>
              <table className="w-full"><tbody>{renderAccounts(expenses, 'debit')}
                <tr className="font-bold border-t"><td className="pl-6 py-2">TOTAL OPERATING EXPENSES</td><td className="text-right font-mono pr-2">{formatAccountAmount(expenseTotal)}</td></tr>
              </tbody></table>
            </section>

            <div className="flex justify-between items-center py-3 border-t-2 border-slate-800 font-bold text-base">
              <div className="uppercase">NET INCOME (LOSS)</div><div className="w-40 text-right font-mono pr-2">{formatAccountAmount(revenueTotal - effectiveCostTotal - expenseTotal)}</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
