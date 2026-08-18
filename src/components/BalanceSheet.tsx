import React from 'react';
import { Landmark, Trash2 } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { BalanceSheetData, BalanceSheetLine } from '../types';
import { cn } from '../lib/utils';

type Section = 'currentAssets' | 'ppe' | 'currentLiabilities' | 'capital';

export function BalanceSheet() {
  const { currentClient, currentClientId, saveClient, activeDevice } = useAccounting();

  if (!currentClient || !currentClientId) return null;

  const line = (particulars: string): BalanceSheetLine => ({ id: crypto.randomUUID(), particulars, amount: '0.00', priorAmount: '0.00' });

  const defaultData: BalanceSheetData = {
    companyName: currentClient.tradeName || currentClient.name || '',
    address: [currentClient.street, currentClient.barangay, currentClient.city, currentClient.zipCode].filter(Boolean).join(', ') || '',
    reportName: 'BALANCE SHEET',
    asOfDate: 'As of December 31, 2026',
    currentYearLabel: '2026',
    priorYearLabel: '2025',
    currentAssets: [
      line('Cash on hand / in bank'),
      line('Inventory'),
      line('Accounts receivable'),
      line('Prepaid income tax'),
      line('Creditable withholding tax'),
    ],
    ppe: [
      line('Service vehicle'),
      line('Office equipment'),
    ],
    currentLiabilities: [
      line('Accounts payable'),
      line('Accrued expense'),
      line('SSS, PHIC & HDMF payable'),
      line('VAT payable'),
      line('Income tax payable'),
    ],
    capital: [
      line("Owner's capital"),
      line('Additional capital'),
      line('Net income (loss) for the period'),
      line('Adjustments'),
      line('Drawings'),
    ],
    certifiedBy: ''
  };

  const bsData = currentClient.bsData || defaultData;

  const updateData = (updates: Partial<BalanceSheetData>) => {
    saveClient(currentClientId, { ...currentClient, bsData: { ...bsData, ...updates } });
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
    bsData[section].reduce((acc, l) => acc + parseNum(prior ? l.priorAmount : l.amount), 0);

  const totalCurrentAssets = sectionTotal('currentAssets');
  const totalCurrentAssetsPrior = sectionTotal('currentAssets', true);
  const totalPpe = sectionTotal('ppe');
  const totalPpePrior = sectionTotal('ppe', true);
  const totalAssets = totalCurrentAssets + totalPpe;
  const totalAssetsPrior = totalCurrentAssetsPrior + totalPpePrior;

  const totalCurrentLiabilities = sectionTotal('currentLiabilities');
  const totalCurrentLiabilitiesPrior = sectionTotal('currentLiabilities', true);
  const totalCapital = sectionTotal('capital');
  const totalCapitalPrior = sectionTotal('capital', true);
  const totalLiabilitiesAndCapital = totalCurrentLiabilities + totalCapital;
  const totalLiabilitiesAndCapitalPrior = totalCurrentLiabilitiesPrior + totalCapitalPrior;

  const isBalanced = Math.abs(totalAssets - totalLiabilitiesAndCapital) < 0.01;

  const handleUpdateLine = (section: Section, id: string, field: keyof BalanceSheetLine, value: string) => {
    updateData({ [section]: bsData[section].map(l => l.id === id ? { ...l, [field]: value } : l) } as Partial<BalanceSheetData>);
  };

  const handleAddLine = (section: Section) => {
    updateData({ [section]: [...bsData[section], line('')] } as Partial<BalanceSheetData>);
  };

  const handleDeleteLine = (section: Section, id: string) => {
    updateData({ [section]: bsData[section].filter(l => l.id !== id) } as Partial<BalanceSheetData>);
  };

  const handleAmountBlur = (section: Section, id: string, field: 'amount' | 'priorAmount', e: React.FocusEvent<HTMLInputElement>) => {
    handleUpdateLine(section, id, field, formatNum(parseNum(e.target.value)));
  };

  const renderSection = (section: Section, label: string, showAddDelete = true) => (
    <div>
      <div className="uppercase mb-2 font-bold text-xs text-slate-500">{label}</div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <tbody>
            {bsData[section].map(l => (
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
                  {showAddDelete && bsData[section].length > 1 && (
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
            <tr>
              <td className="pl-6 py-2"></td>
              <td className="w-28 py-2 border-t border-slate-800 text-right font-mono px-2 text-sm">{formatNum(sectionTotal(section))}</td>
              <td className="w-28 py-2 border-t border-slate-800 text-right font-mono px-2 text-sm text-slate-500">{formatNum(sectionTotal(section, true))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {showAddDelete && (
        <button onClick={() => handleAddLine(section)} className="text-xs text-cyan-600 font-bold ml-6 mt-1 opacity-50 hover:opacity-100">+ Add Row</button>
      )}
    </div>
  );

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Balance Sheet" icon={<Landmark className="text-amber-500" />} centered />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-8 text-sm">

        {/* HEADER SECTION */}
        <div className="text-center mb-6">
          <input
            type="text"
            value={bsData.companyName}
            onChange={(e) => updateData({ companyName: e.target.value })}
            className="text-xl font-bold text-center uppercase tracking-wide bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto"
            placeholder="COMPANY NAME"
          />
          <input
            type="text"
            value={bsData.address}
            onChange={(e) => updateData({ address: e.target.value })}
            className="text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto mt-1"
            placeholder="Company Address"
          />
          <div className="mt-6">
            <input
              type="text"
              value={bsData.reportName}
              onChange={(e) => updateData({ reportName: e.target.value })}
              className="text-lg font-medium text-center uppercase bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto"
            />
            <input
              type="text"
              value={bsData.asOfDate}
              onChange={(e) => updateData({ asOfDate: e.target.value })}
              className="text-center font-medium bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto mt-1"
            />
          </div>
        </div>

        <div className={cn(
          "px-4 py-2 rounded-xl font-bold flex items-center justify-center gap-2 text-xs max-w-3xl mx-auto mb-6",
          isBalanced ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
        )}>
          {isBalanced ? '✓ Total Assets = Total Liabilities and Capital' : `⚠ Out of balance by ${formatNum(Math.abs(totalAssets - totalLiabilitiesAndCapital))}`}
        </div>

        <div className="max-w-3xl mx-auto space-y-6">
          <div className="flex justify-end gap-0 text-[10px] font-bold text-slate-400 uppercase pr-2">
            <span className="w-28 text-right px-2">{bsData.currentYearLabel}</span>
            <span className="w-28 text-right px-2">{bsData.priorYearLabel}</span>
          </div>

          <div className="uppercase font-bold text-sm">Assets</div>
          {renderSection('currentAssets', 'Current Assets')}
          {renderSection('ppe', 'Property and Equipment (Net)')}

          <div className="flex justify-between items-center py-2 border-t-4 border-double border-slate-800">
            <div className="uppercase font-bold">Total Assets</div>
            <div className="flex">
              <div className="w-28 text-right font-mono px-2 font-bold">{formatNum(totalAssets, true)}</div>
              <div className="w-28 text-right font-mono px-2 text-slate-500">{formatNum(totalAssetsPrior, true)}</div>
            </div>
          </div>

          <div className="h-2"></div>
          <div className="uppercase font-bold text-sm">Liabilities and Capital</div>
          {renderSection('currentLiabilities', 'Liabilities')}
          {renderSection('capital', 'Capital')}

          <div className="flex justify-between items-center py-2 border-t-4 border-double border-slate-800">
            <div className="uppercase font-bold">Total Liabilities and Capital</div>
            <div className="flex">
              <div className="w-28 text-right font-mono px-2 font-bold">{formatNum(totalLiabilitiesAndCapital, true)}</div>
              <div className="w-28 text-right font-mono px-2 text-slate-500">{formatNum(totalLiabilitiesAndCapitalPrior, true)}</div>
            </div>
          </div>

          <div className="pt-8">
            <div className="text-xs uppercase font-bold text-slate-500 mb-1">Certified Correct:</div>
            <input
              type="text"
              value={bsData.certifiedBy}
              onChange={e => updateData({ certifiedBy: e.target.value })}
              placeholder="Name of preparer"
              className="w-64 bg-transparent border-b border-slate-300 dark:border-slate-700 focus:border-cyan-500 focus:outline-none px-1 py-1 text-sm mt-4"
            />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
