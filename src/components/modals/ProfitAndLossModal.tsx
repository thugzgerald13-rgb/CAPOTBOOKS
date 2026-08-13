import React from 'react';
import { TrendingUp, Plus, Trash2, Settings, Download } from 'lucide-react';
import { PageHeader } from '../ui/PageHeader';
import { useAccounting } from '../../context/AccountingContext';
import { ProfitAndLossData, ProfitAndLossLine } from '../../types';
import { cn } from '../../lib/utils';

export function ProfitAndLossModal() {
  const { currentClient, currentClientId, saveClient, activeDevice } = useAccounting();
  
  if (!currentClient || !currentClientId) return null;

  const defaultData: ProfitAndLossData = {
    companyName: currentClient.tradeName || currentClient.name || '',
    address: [currentClient.street, currentClient.barangay, currentClient.city, currentClient.zipCode].filter(Boolean).join(', ') || '',
    reportName: 'INCOME STATEMENT',
    period: 'For the Quarter ended March 31, 2026',
    revenue: [{ id: crypto.randomUUID(), particulars: 'Service income', amount: '0.00' }],
    costOfRevenue: [
      { id: crypto.randomUUID(), particulars: 'Purchases', amount: '0.00' },
      { id: crypto.randomUUID(), particulars: 'Direct labor', amount: '0.00' }
    ],
    operatingExpenses: [
      { id: crypto.randomUUID(), particulars: 'Rent expense', amount: '0.00' },
      { id: crypto.randomUUID(), particulars: 'Taxes and licenses', amount: '0.00' }
    ],
    provisionForIncomeTax: '0.00'
  };

  const plData = currentClient.plData || defaultData;

  const updateData = (updates: Partial<ProfitAndLossData>) => {
    saveClient(currentClientId, { ...currentClient, plData: { ...plData, ...updates } });
  };

  const parseNum = (val: string) => {
    const raw = val.replace(/,/g, '').replace(/[()P]/g, '').trim();
    if (val.includes('(')) return -Math.abs(parseFloat(raw));
    return parseFloat(raw) || 0;
  };

  const formatNum = (num: number, currency = false) => {
    if (isNaN(num)) return '';
    const isNegative = num < 0;
    const absRaw = Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const formatted = isNegative ? `(${absRaw})` : absRaw;
    return currency ? `P ${formatted}` : formatted;
  };

  // Calculations
  const totalRevenue = plData.revenue.reduce((acc, curr) => acc + parseNum(curr.amount), 0);
  const totalCost = plData.costOfRevenue.reduce((acc, curr) => acc + parseNum(curr.amount), 0);
  const grossIncome = totalRevenue - totalCost;
  
  const totalOpex = plData.operatingExpenses.reduce((acc, curr) => acc + parseNum(curr.amount), 0);
  const netIncomeBeforeTax = grossIncome - totalOpex;
  
  const provisionTax = parseNum(plData.provisionForIncomeTax);
  const netIncomeFinal = netIncomeBeforeTax - provisionTax;

  const handleUpdateLine = (section: 'revenue' | 'costOfRevenue' | 'operatingExpenses', id: string, field: keyof ProfitAndLossLine, value: string) => {
    updateData({
      [section]: plData[section].map(line => line.id === id ? { ...line, [field]: value } : line)
    });
  };

  const handleAddLine = (section: 'revenue' | 'costOfRevenue' | 'operatingExpenses') => {
    updateData({
      [section]: [...plData[section], { id: crypto.randomUUID(), particulars: '', amount: '0.00' }]
    });
  };

  const handleDeleteLine = (section: 'revenue' | 'costOfRevenue' | 'operatingExpenses', id: string) => {
    updateData({
      [section]: plData[section].filter(line => line.id !== id)
    });
  };

  const handleAmountBlur = (section: 'revenue' | 'costOfRevenue' | 'operatingExpenses', id: string, e: React.FocusEvent<HTMLInputElement>) => {
    const val = parseNum(e.target.value);
    handleUpdateLine(section, id, 'amount', formatNum(val));
  };

  return (
    <div className="w-full bg-white dark:bg-slate-800 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm mt-8 flex flex-col overflow-hidden">
      <PageHeader title="Profit & Loss" icon={<TrendingUp className="text-emerald-500" />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-8 text-sm">
        
        {/* HEADER SECTION */}
        <div className="text-center mb-8">
          <input 
            type="text" 
            value={plData.companyName}
            onChange={(e) => updateData({ companyName: e.target.value })}
            className="text-xl font-bold text-center uppercase tracking-wide bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto"
            placeholder="COMPANY NAME"
          />
          <input 
            type="text" 
            value={plData.address}
            onChange={(e) => updateData({ address: e.target.value })}
            className="text-center bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto mt-1"
            placeholder="Company Address"
          />
          
          <div className="mt-6">
            <input 
              type="text" 
              value={plData.reportName}
              onChange={(e) => updateData({ reportName: e.target.value })}
              className="text-lg font-medium text-center uppercase bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto"
              placeholder="INCOME STATEMENT"
            />
            <input 
              type="text" 
              value={plData.period}
              onChange={(e) => updateData({ period: e.target.value })}
              className="text-center font-medium bg-transparent border-b border-transparent hover:border-slate-300 focus:border-cyan-500 focus:outline-none w-full max-w-md mx-auto mt-1"
              placeholder="For the period ended..."
            />
          </div>
        </div>

        {/* STATEMENT BODY */}
        <div className="max-w-3xl mx-auto space-y-6 form-w-full">
          
          {/* REVENUE */}
          <div>
            <div className="uppercase mb-2">REVENUE:</div>
            <table className="w-full">
              <tbody>
                {plData.revenue.map(line => (
                  <tr key={line.id} className="group">
                    <td className="pl-6 py-1">
                      <input 
                        type="text" 
                        value={line.particulars}
                        onChange={e => handleUpdateLine('revenue', line.id, 'particulars', e.target.value)}
                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none"
                        placeholder="Revenue description"
                      />
                    </td>
                    <td className="w-32 py-1 relative">
                      <input 
                        type="text" 
                        value={line.amount}
                        onChange={e => handleUpdateLine('revenue', line.id, 'amount', e.target.value)}
                        onBlur={e => handleAmountBlur('revenue', line.id, e)}
                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none text-right font-mono"
                      />
                      {plData.revenue.length > 1 && (
                         <button 
                           onClick={() => handleDeleteLine('revenue', line.id)}
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
            <button onClick={() => handleAddLine('revenue')} className="text-xs text-cyan-600 font-bold ml-6 mt-1 opacity-50 hover:opacity-100">+ Add Row</button>
          </div>

          {/* COST OF REVENUE */}
          <div>
            <div className="uppercase mb-2">COST OF REVENUE</div>
            <table className="w-full">
              <tbody>
                {plData.costOfRevenue.map((line, idx) => (
                  <tr key={line.id} className="group">
                    <td className="pl-6 py-1">
                      <input 
                        type="text" 
                        value={line.particulars}
                        onChange={e => handleUpdateLine('costOfRevenue', line.id, 'particulars', e.target.value)}
                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none"
                        placeholder="Cost description"
                      />
                    </td>
                    <td className="w-32 py-1 relative">
                      <input 
                        type="text" 
                        value={line.amount}
                        onChange={e => handleUpdateLine('costOfRevenue', line.id, 'amount', e.target.value)}
                        onBlur={e => handleAmountBlur('costOfRevenue', line.id, e)}
                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none text-right font-mono"
                      />
                      {plData.costOfRevenue.length > 1 && (
                         <button 
                           onClick={() => handleDeleteLine('costOfRevenue', line.id)}
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
                  <td className="w-32 py-2 border-t border-slate-800 text-right font-mono px-2">
                    {formatNum(totalCost)}
                  </td>
                </tr>
              </tbody>
            </table>
            <button onClick={() => handleAddLine('costOfRevenue')} className="text-xs text-cyan-600 font-bold ml-6 mt-1 opacity-50 hover:opacity-100">+ Add Row</button>
          </div>

          {/* GROSS INCOME */}
          <div className="flex justify-between items-center py-2">
            <div className="uppercase">GROSS INCOME</div>
            <div className="w-32 text-right font-mono px-2">{formatNum(grossIncome)}</div>
          </div>

          <div className="h-4"></div>

          {/* OPERATING EXPENSES */}
          <div>
            <div className="uppercase mb-2">OPERATING EXPENSES:</div>
            <table className="w-full">
              <tbody>
                {plData.operatingExpenses.map(line => (
                  <tr key={line.id} className="group">
                    <td className="pl-6 py-1">
                      <input 
                        type="text" 
                        value={line.particulars}
                        onChange={e => handleUpdateLine('operatingExpenses', line.id, 'particulars', e.target.value)}
                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none"
                        placeholder="Expense description"
                      />
                    </td>
                    <td className="w-32 py-1 relative">
                      <input 
                        type="text" 
                        value={line.amount}
                        onChange={e => handleUpdateLine('operatingExpenses', line.id, 'amount', e.target.value)}
                        onBlur={e => handleAmountBlur('operatingExpenses', line.id, e)}
                        className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none text-right font-mono"
                      />
                      {plData.operatingExpenses.length > 1 && (
                         <button 
                           onClick={() => handleDeleteLine('operatingExpenses', line.id)}
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
                  <td className="w-32 py-2 border-t border-slate-800 text-right font-mono px-2">
                    {formatNum(totalOpex)}
                  </td>
                </tr>
              </tbody>
            </table>
            <button onClick={() => handleAddLine('operatingExpenses')} className="text-xs text-cyan-600 font-bold ml-6 mt-1 opacity-50 hover:opacity-100">+ Add Row</button>
          </div>

          <div className="h-4"></div>

          {/* NET INCOME/(LOSS) */}
          <div className="flex justify-between items-center py-2">
            <div className="uppercase">NET INCOME/(LOSS)</div>
            <div className="w-32 text-right font-mono px-2">{formatNum(netIncomeBeforeTax, true)}</div>
          </div>

          {/* PROVISION FOR INCOME TAX */}
          <div className="flex justify-between items-center py-2">
            <div className="uppercase">PROVISION FOR INCOME TAX</div>
            <div className="w-32 relative">
              <input 
                type="text" 
                value={plData.provisionForIncomeTax}
                onChange={e => updateData({ provisionForIncomeTax: e.target.value })}
                onBlur={e => {
                  const val = parseNum(e.target.value);
                  updateData({ provisionForIncomeTax: formatNum(val) });
                }}
                className="w-full bg-transparent border border-transparent hover:border-slate-200 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 px-2 py-1 outline-none text-right font-mono border-b border-b-slate-800"
              />
            </div>
          </div>

          {/* NET INCOME FOR THE PERIOD */}
          <div className="flex justify-between items-center py-2 mt-2">
            <div className="uppercase">NET INCOME FOR THE PERIOD</div>
            <div className="w-32 text-right font-mono px-2 border-b-4 border-double border-slate-800 font-bold">{formatNum(netIncomeFinal, true)}</div>
          </div>

        </div>
      </div>
          </div>
    </div>
  );
}
