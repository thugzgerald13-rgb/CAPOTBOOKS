import { useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { Wrench, Plus, Trash2 } from 'lucide-react';
import { AssetLapsingEntry } from '../types';

export function AssetLapsing() {
  const { currentClient, currentClientId, saveAssetLapsingSchedule } = useAccounting();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);

  if (!currentClient || !currentClientId) return null;

  const schedule: AssetLapsingEntry[] = currentClient.assetLapsingSchedule || [];

  const saveSchedule = (updated: AssetLapsingEntry[]) => {
    saveAssetLapsingSchedule(updated);
  };

  const handleAddRow = () => {
    const newEntry: AssetLapsingEntry = {
      id: crypto.randomUUID(),
      datePurchased: asOfDate,
      invoiceNo: '',
      description: '',
      cost: 0,
      usefulLifeYears: 5,
      salvageValue: 0,
    };
    saveSchedule([...schedule, newEntry]);
  };

  const handleUpdateRow = (id: string, field: keyof AssetLapsingEntry, value: string | number) => {
    saveSchedule(schedule.map(row => row.id === id ? { ...row, [field]: value } : row));
  };

  const handleDeleteRow = (id: string) => {
    saveSchedule(schedule.filter(row => row.id !== id));
  };

  // Straight-line depreciation, prorated by month, capped once fully depreciated.
  const computeDepreciation = (row: AssetLapsingEntry) => {
    const cost = row.cost || 0;
    const salvage = row.salvageValue || 0;
    const life = row.usefulLifeYears || 0;
    const depreciableBase = Math.max(0, cost - salvage);

    if (!row.datePurchased || life <= 0) {
      return { currentYearDepreciation: 0, netCarryingValue: cost };
    }

    const purchaseDate = new Date(row.datePurchased);
    const asOf = new Date(asOfDate);
    if (isNaN(purchaseDate.getTime()) || asOf < purchaseDate) {
      return { currentYearDepreciation: 0, netCarryingValue: cost };
    }

    const annualDepreciation = depreciableBase / life;
    const totalUsefulMonths = life * 12;
    const monthsBetween = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

    // Accumulated depreciation as of the selected "as of" date (inclusive of purchase month)
    const monthsElapsedToAsOf = Math.min(monthsBetween(purchaseDate, asOf) + 1, totalUsefulMonths);
    const accumulatedToAsOf = annualDepreciation * (monthsElapsedToAsOf / 12);

    // Accumulated depreciation as of the end of the prior year (before the "as of" year began)
    const startOfAsOfYear = new Date(asOf.getFullYear(), 0, 1);
    const monthsElapsedToPriorYearEnd = purchaseDate < startOfAsOfYear
      ? Math.min(monthsBetween(purchaseDate, startOfAsOfYear), totalUsefulMonths)
      : 0;
    const accumulatedToPriorYearEnd = annualDepreciation * (monthsElapsedToPriorYearEnd / 12);

    const currentYearDepreciation = Math.max(0, accumulatedToAsOf - accumulatedToPriorYearEnd);
    const netCarryingValue = cost - accumulatedToAsOf;

    return { currentYearDepreciation, netCarryingValue };
  };

  const formatCurrency = (val: number) =>
    val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const totals = schedule.reduce((acc, row) => {
    const { currentYearDepreciation, netCarryingValue } = computeDepreciation(row);
    return {
      cost: acc.cost + (row.cost || 0),
      currentYearDepreciation: acc.currentYearDepreciation + currentYearDepreciation,
      netCarryingValue: acc.netCarryingValue + netCarryingValue,
    };
  }, { cost: 0, currentYearDepreciation: 0, netCarryingValue: 0 });

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Asset Lapsing Schedule" icon={<Wrench className="text-orange-500" />} centered />
      <div className="p-4 md:p-6 flex-1">

        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Straight-line depreciation schedule for fixed assets, computed as of the selected date.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">As of</label>
            <input
              type="date"
              value={asOfDate}
              onChange={e => setAsOfDate(e.target.value)}
              className="text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs whitespace-nowrap min-w-[1100px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold">
                <th className="px-3 py-3 text-left">Date of Purchase</th>
                <th className="px-3 py-3 text-left">Invoice #</th>
                <th className="px-3 py-3 text-left">Description</th>
                <th className="px-3 py-3 text-right">Cost</th>
                <th className="px-3 py-3 text-right">Useful Life (yr)</th>
                <th className="px-3 py-3 text-right">Salvage Value</th>
                <th className="px-3 py-3 text-right">Current Year Depreciation</th>
                <th className="px-3 py-3 text-right">Net Carrying Value</th>
                <th className="px-3 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {schedule.length === 0 && (
                <tr>
                  <td colSpan={9} className="text-center py-16 text-slate-400">
                    No assets yet. Click "Add Asset" to start the schedule.
                  </td>
                </tr>
              )}
              {schedule.map(row => {
                const { currentYearDepreciation, netCarryingValue } = computeDepreciation(row);
                return (
                  <tr key={row.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-1 py-1">
                      <input
                        type="date"
                        value={row.datePurchased}
                        onChange={e => handleUpdateRow(row.id, 'datePurchased', e.target.value)}
                        className="w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="text"
                        value={row.invoiceNo}
                        onChange={e => handleUpdateRow(row.id, 'invoiceNo', e.target.value)}
                        placeholder="INV-001"
                        className="w-24 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="text"
                        value={row.description}
                        onChange={e => handleUpdateRow(row.id, 'description', e.target.value)}
                        placeholder="Asset description"
                        className="w-48 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={row.cost || ''}
                        onChange={e => handleUpdateRow(row.id, 'cost', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-28 text-right font-mono bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={row.usefulLifeYears || ''}
                        onChange={e => handleUpdateRow(row.id, 'usefulLifeYears', parseFloat(e.target.value) || 0)}
                        placeholder="5"
                        className="w-20 text-right font-mono bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <input
                        type="number"
                        value={row.salvageValue || ''}
                        onChange={e => handleUpdateRow(row.id, 'salvageValue', parseFloat(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-28 text-right font-mono bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none"
                      />
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-blue-600 dark:text-blue-400">
                      {formatCurrency(currentYearDepreciation)}
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                      {formatCurrency(netCarryingValue)}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        onClick={() => handleDeleteRow(row.id)}
                        className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all"
                        title="Delete asset"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {schedule.length > 0 && (
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-black text-slate-700 dark:text-slate-200 border-t-2 border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={3} className="px-3 py-3 text-right">Total:</td>
                  <td className="px-3 py-3 text-right font-mono">{formatCurrency(totals.cost)}</td>
                  <td></td>
                  <td></td>
                  <td className="px-3 py-3 text-right font-mono text-blue-600 dark:text-blue-400">{formatCurrency(totals.currentYearDepreciation)}</td>
                  <td className="px-3 py-3 text-right font-mono">{formatCurrency(totals.netCarryingValue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <button
          onClick={handleAddRow}
          className="mt-4 flex items-center gap-1.5 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition shadow-sm shadow-orange-500/20"
        >
          <Plus className="w-4 h-4" /> Add Asset
        </button>
      </div>
    </div>
  );
}
