import React from 'react';
import { ArrowLeftRight, Trash2 } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { CashFlowData, CashFlowLine } from '../types';
import { cn } from '../lib/utils';

type Section = 'operatingActivities' | 'investingActivities' | 'financingActivities';

export function CashFlow() {
  const { currentClient, currentClientId, saveClient, activeDevice } = useAccounting();

  if (!currentClient || !currentClientId) return null;

  const line = (particulars: string): CashFlowLine => ({ id: crypto.randomUUID(), particulars, amount: '0.00', priorAmount: '0.00' });

  const defaultData: CashFlowData = {
    companyName: currentClient.tradeName || currentClient.name || '',
    reportName: 'STATEMENTS OF CASH FLOWS',
    period: 'For the year ended December 31, 2026',
    comparativeNote: '(With comparative figures for 2025)',
    operatingActivities: [
      line('Net income for the period'),
      line('Depreciation'),
      line('Adjustments'),
      line('Decrease (increase) in trade and other receivables'),
      line('Decrease (increase) in inventories'),
      line('Decrease (increase) in other current assets'),
      line('Increase (decrease) in trade and other payables'),
      line('Increase (decrease) in other current liabilities'),
    ],
    investingActivities: [
      line('Addition to property and equipment'),
    ],
    financingActivities: [
      line('Additional capital'),
      line('Drawings'),
    ],
    cashBeginning: '0.00',
    cashBeginningPrior: '0.00',
  };

  const cfData = currentClient.cfData || defaultData;

  const updateData = (updates: Partial<CashFlowData>) => {
    saveClient(currentClientId, { ...currentClient, cfData: { ...cfData, ...updates } });
  };

  const parseNum = (val: string) => {
    const raw = val.replace(/,/g, '').replace(/[()P]/g, '').trim();
    if (val.includes('(')) return -Math.abs(parseFloat(raw) || 0);
    return parseFloat(raw) || 0;
  };

  const formatNum = (num: number, currency = false) => {
    if (isNaN(num)) return '';
    const isNegative = num < 0;
    const absRaw = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatted = isNegative ? `(${absRaw})` : absRaw;
    return currency ? `P ${formatted}` : formatted;
  };

  const sectionTotal = (section: Section, prior = false) =>
    cfData[section].reduce((acc, l) => acc + parseNum(prior ? l.priorAmount : l.amount), 0);

  const netOperating = sectionTotal('operatingActivities');
  const netOperatingPrior = sectionTotal('operatingActivities', true);
  const netInvesting = sectionTotal('investingActivities');
  const netInvestingPrior = sectionTotal('investingActivities', true);
  const netFinancing = sectionTotal('financingActivities');
  const netFinancingPrior = sectionTotal('financingActivities', true);

  const netIncreaseDecrease = netOperating + netInvesting + netFinancing;
  const netIncreaseDecreasePrior = netOperatingPrior + netInvestingPrior + netFinancingPrior;

  const cashBeginning = parseNum(cfData.cashBeginning);
  const cashBeginningPrior = parseNum(cfData.cashBeginningPrior);
  const cashEnding = cashBeginning + netIncreaseDecrease;
  const cashEndingPrior = cashBeginningPrior + netIncreaseDecreasePrior;

  const handleUpdateLine = (section: Section, id: string, field: keyof CashFlowLine, value: string) => {
    updateData({ [section]: cfData[section].map(l => l.id === id ? { ...l, [field]: value } : l) } as Partial<CashFlowData>);
  };

  const handleAddLine = (section: Section) => {
    updateData({ [section]: [...cfData[section], line('')] } as Partial<CashFlowData>);
  };

  const handleDeleteLine = (section: Section, id: string) => {
    updateData({ [section]: cfData[section].filter(l => l.id !== id) } as Partial<CashFlowData>);
  };

  const handleAmountBlur = (section: Section, id: string, field: 'amount' | 'priorAmount', e: React.FocusEvent<HTMLInputElement>) => {
    handleUpdateLine(section, id, field, formatNum(parseNum(e.target.value)));
  };

  const renderSection = (section: Section, label: string) => (
    <div>
      <div className="uppercase mb-2 font-bold text-xs text-slate-500">{label}</div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <tbody>
            {cfData[section].map(l => (
              <tr key={l.id} className="group">
                <td className="pl-6 py-1">
                  <input
                    type="text"
                    value={l.particulars}
                    onChange={e => handleUpdateLine(section, l.id, 'particulars', e.target.value)}
                    className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none text-sm"
                    placeholder="Line item"
                  />
                </td>
                <td className="w-28 py-1">
                  <input
                    type="text"
                    value={l.amount}
                    onChange={e => handleUpdateLine(section, l.id, 'amount', e.target.value)}
                    onBlur={e => handleAmountBlur(section, l.id, 'amount', e)}
                    className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none text-right font-mono text-sm"
                  />
                </td>
                <td className="w-28 py-1 relative">
                  <input
                    type="text"
                    value={l.priorAmount}
                    onChange={e => handleUpdateLine(section, l.id, 'priorAmount', e.target.value)}
                    onBlur={e => handleAmountBlur(section, l.id, 'priorAmount', e)}
                    className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none text-right font-mono text-sm text-slate-500"
                  />
                  {cfData[section].length > 1 && (
                    <button
                      onClick={() => handleDeleteLine(section, l.id)}
                      className={cn(
                        "absolute top-1/2 -translate-y-1/2 text-slate-400 hover:text-red-500 transition-all",
                        activeDevice === 'mobile'
                          ? "opacity-100 right-1 bg-white/90 dark:bg-slate-900/90 p-1 rounded-full border border-slate-200 dark:border-slate-800 shadow"
                          : "opacity-0 -right-8 group-hover:opacity-100"
                      )}
                    ><Trash2 className="w-3.5 h-3.5" /></button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => handleAddLine(section)} className="text-xs text-cyan-600 font-bold ml-6 mt-1 opacity-50 hover:opacity-100">+ Add Row</button>
    </div>
  );

  const netRow = (label: string, net: number, netPrior: number) => (
    <div className="flex justify-between items-center py-2 border-t border-slate-800">
      <div className="uppercase pl-6 text-sm">{label}</div>
      <div className="flex">
        <div className="w-28 text-right font-mono px-2 text-sm font-bold">{formatNum(net, true)}</div>
        <div className="w-28 text-right font-mono px-2 text-sm text-slate-500">{formatNum(netPrior, true)}</div>
      </div>
    </div>
  );

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Cash Flow" icon={<ArrowLeftRight className="text-blue-500" />} centered />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-8 text-sm">

        {/* HEADER SECTION */}
        <div className="text-center mb-6">
          <input
            type="text"
            value={cfData.companyName}
            onChange={(e) => updateData({ companyName: e.target.value })}
            className="text-xl font-bold text-center uppercase tracking-wide bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto"
            placeholder="COMPANY NAME"
          />
          <div className="mt-6">
            <input
              type="text"
              value={cfData.reportName}
              onChange={(e) => updateData({ reportName: e.target.value })}
              className="text-lg font-medium text-center uppercase bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto"
            />
            <input
              type="text"
              value={cfData.period}
              onChange={(e) => updateData({ period: e.target.value })}
              className="text-center font-medium bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto mt-1"
            />
            <input
              type="text"
              value={cfData.comparativeNote}
              onChange={(e) => updateData({ comparativeNote: e.target.value })}
              className="text-center text-xs text-slate-500 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto mt-1"
            />
          </div>
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex justify-end gap-0 text-[10px] font-bold text-slate-400 uppercase pr-2">
            <span className="w-28 text-right px-2">Current Year</span>
            <span className="w-28 text-right px-2">Prior Year</span>
          </div>

          <div className="uppercase font-bold text-sm">Cash Flows From Operating Activities:</div>
          {renderSection('operatingActivities', 'Net income and adjustments')}
          {netRow('Net cash provided (used) from operating activities', netOperating, netOperatingPrior)}

          <div className="h-2"></div>
          <div className="uppercase font-bold text-sm">Cash Flows From Investing Activities:</div>
          {renderSection('investingActivities', 'Investing activities')}
          {netRow('Net cash provided (used) from investing activities', netInvesting, netInvestingPrior)}

          <div className="h-2"></div>
          <div className="uppercase font-bold text-sm">Cash Flows From Financing Activities:</div>
          {renderSection('financingActivities', 'Financing activities')}
          {netRow('Net cash provided (used) from financing activities', netFinancing, netFinancingPrior)}

          <div className="flex justify-between items-center py-2 border-t-4 border-double border-slate-800 mt-4">
            <div className="uppercase font-bold">Net Increase (Decrease) in Cash</div>
            <div className="flex">
              <div className="w-28 text-right font-mono px-2 font-bold">{formatNum(netIncreaseDecrease, true)}</div>
              <div className="w-28 text-right font-mono px-2 text-slate-500">{formatNum(netIncreaseDecreasePrior, true)}</div>
            </div>
          </div>

          <div className="flex justify-between items-center py-1">
            <div className="uppercase">Cash, Beginning of Period</div>
            <div className="flex">
              <div className="w-28 py-1">
                <input
                  type="text"
                  value={cfData.cashBeginning}
                  onChange={e => updateData({ cashBeginning: e.target.value })}
                  onBlur={e => updateData({ cashBeginning: formatNum(parseNum(e.target.value)) })}
                  className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none text-right font-mono text-sm"
                />
              </div>
              <div className="w-28 py-1">
                <input
                  type="text"
                  value={cfData.cashBeginningPrior}
                  onChange={e => updateData({ cashBeginningPrior: e.target.value })}
                  onBlur={e => updateData({ cashBeginningPrior: formatNum(parseNum(e.target.value)) })}
                  className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none text-right font-mono text-sm text-slate-500"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-between items-center py-2 border-t-4 border-double border-slate-800">
            <div className="uppercase font-bold">Cash, End of Period</div>
            <div className="flex">
              <div className="w-28 text-right font-mono px-2 font-bold">{formatNum(cashEnding, true)}</div>
              <div className="w-28 text-right font-mono px-2 text-slate-500">{formatNum(cashEndingPrior, true)}</div>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
