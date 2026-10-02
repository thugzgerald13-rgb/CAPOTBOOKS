import { useState } from 'react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { Wrench, Plus, Trash2, Calculator, X, Check } from 'lucide-react';
import { AssetLapsingEntry } from '../types';
import { accumulatedDepreciation, netBookValue, disposalGainLoss, buildDepreciationJE, DEPRECIATION_METHODS, type DepreciableAsset } from '../lib/depreciation';

export function AssetLapsing() {
  const canDelete = usePermission('delete_transactions');

  const { currentClient, currentClientId, saveAssetLapsingSchedule, showToast } = useAccounting();
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().split('T')[0]);
  const [showJE, setShowJE] = useState(false);
  if (!currentClient || !currentClientId) return null;
  const schedule: AssetLapsingEntry[] = currentClient.assetLapsingSchedule || [];
  const saveSchedule = (updated: AssetLapsingEntry[]) => { saveAssetLapsingSchedule(updated); };

  const handleAddRow = () => {
    const newEntry: AssetLapsingEntry = {
      id: crypto.randomUUID(), datePurchased: asOfDate, invoiceNo: '', description: '',
      cost: 0, usefulLifeYears: 5, salvageValue: 0, method: 'straight-line',
    } as any;
    saveSchedule([...schedule, newEntry]);
  };
  const handleUpdateRow = (id: string, field: keyof AssetLapsingEntry, value: string | number) => {
    saveSchedule(schedule.map(row => row.id === id ? { ...row, [field]: value } : row));
  };
  const handleDeleteRow = (id: string) => { saveSchedule(schedule.filter(row => row.id !== id)); };

  // T018: disposal flow — prompt for proceeds, mark disposed, compute gain/loss.
  const handleDispose = (row: AssetLapsingEntry) => {
    const nbv = netBookValue(row as DepreciableAsset, asOfDate);
    const proceedsStr = prompt(`Dispose of "${row.description || 'asset'}"?\nNet book value: ₱${nbv.toFixed(2)}\nEnter disposal proceeds (₱):`, String(nbv));
    if (proceedsStr === null) return;
    const proceeds = parseFloat(proceedsStr) || 0;
    const gain = disposalGainLoss(row as DepreciableAsset, asOfDate, proceeds);
    saveSchedule(schedule.map(r => r.id === row.id ? { ...r, disposed: true, disposalDate: asOfDate, disposalProceeds: proceeds } as any : r));
    showToast(`Asset disposed — ${gain >= 0 ? 'gain' : 'loss'} of ₱${Math.abs(gain).toFixed(2)}`);
  };

  const computeDepreciation = (row: AssetLapsingEntry) => {
    if ((row as any).disposed) {
      const nbv = netBookValue(row as DepreciableAsset, (row as any).disposalDate || asOfDate);
      return { currentYearDepreciation: 0, netCarryingValue: nbv, disposed: true };
    }
    const acc = accumulatedDepreciation(row as DepreciableAsset, asOfDate);
    const startOfYear = new Date(asOfDate + 'T00:00:00'); startOfYear.setMonth(0, 1); startOfYear.setDate(1);
    const accPrior = accumulatedDepreciation(row as DepreciableAsset, startOfYear.toISOString().split('T')[0]);
    return { currentYearDepreciation: Math.max(0, acc - accPrior), netCarryingValue: (row.cost || 0) - acc, disposed: false };
  };

  const formatCurrency = (val: number) => val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const activeAssets = schedule.filter(r => !(r as any).disposed);
  const totals = activeAssets.reduce((acc, row) => {
    const { currentYearDepreciation, netCarryingValue } = computeDepreciation(row);
    return { cost: acc.cost + (row.cost || 0), currentYearDepreciation: acc.currentYearDepreciation + currentYearDepreciation, netCarryingValue: acc.netCarryingValue + netCarryingValue };
  }, { cost: 0, currentYearDepreciation: 0, netCarryingValue: 0 });

  const jeLines = buildDepreciationJE(schedule as DepreciableAsset[], asOfDate);
  const jeBalanced = jeLines.length === 2 && Math.abs(jeLines[0].debit - jeLines[1].credit) < 0.01;

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Asset Lapsing Schedule" icon={<Wrench className="text-orange-500" />} centered />
      <div className="p-4 md:p-6 flex-1">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
          <p className="text-slate-500 dark:text-slate-400 text-sm">
            Fixed-asset register with 3 depreciation methods, disposal flow, and auto-JE generation.
          </p>
          <div className="flex items-center gap-2 shrink-0">
            <button type="button" onClick={() => setShowJE(v => !v)} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800">
              <Calculator className="w-3.5 h-3.5" /> Auto-JE
            </button>
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">As of</label>
            <input type="date" value={asOfDate} onChange={e => setAsOfDate(e.target.value)} className="text-xs font-bold border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg outline-none" />
          </div>
        </div>

        {showJE && (
          <div className="mb-4 rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Auto-generated Depreciation JE (as of {asOfDate})</div>
              <button type="button" onClick={() => setShowJE(false)} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
            </div>
            {jeLines.length === 0 ? (
              <div className="text-xs text-slate-500">No depreciation to record for the current year.</div>
            ) : (
              <table className="w-full text-xs">
                <thead><tr className="text-slate-400 uppercase text-[10px]"><th className="text-left py-1">Account</th><th className="text-right py-1">Debit</th><th className="text-right py-1">Credit</th></tr></thead>
                <tbody>
                  {jeLines.map((l, i) => (
                    <tr key={i} className="border-t border-blue-100 dark:border-blue-900/40">
                      <td className={`py-1.5 ${l.debit > 0 ? 'pl-4' : 'pl-8 italic'}`}>{l.accountName}</td>
                      <td className="py-1.5 text-right font-mono">{l.debit > 0 ? formatCurrency(l.debit) : '—'}</td>
                      <td className="py-1.5 text-right font-mono">{l.credit > 0 ? formatCurrency(l.credit) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {jeBalanced && <div className="mt-2 text-[10px] font-bold text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1"><Check className="w-3 h-3" /> Balanced — Dr Depreciation Expense / Cr Accumulated Depreciation</div>}
          </div>
        )}

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-800">
          <table className="w-full text-xs whitespace-nowrap min-w-[1200px]">
            <thead>
              <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold">
                <th className="px-3 py-3 text-left">Date of Purchase</th>
                <th className="px-3 py-3 text-left">Invoice #</th>
                <th className="px-3 py-3 text-left">Description</th>
                <th className="px-3 py-3 text-left">Method</th>
                <th className="px-3 py-3 text-right">Cost</th>
                <th className="px-3 py-3 text-right">Life (yr)</th>
                <th className="px-3 py-3 text-right">Salvage</th>
                <th className="px-3 py-3 text-right">CY Depreciation</th>
                <th className="px-3 py-3 text-right">Net Carrying Value</th>
                <th className="px-3 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {schedule.length === 0 && (<tr><td colSpan={10} className="text-center py-16 text-slate-400">No assets yet. Click "Add Asset" to start the schedule.</td></tr>)}
              {schedule.map(row => {
                const { currentYearDepreciation, netCarryingValue, disposed } = computeDepreciation(row);
                const gain = disposed ? disposalGainLoss(row as DepreciableAsset, (row as any).disposalDate || asOfDate, (row as any).disposalProceeds || 0) : 0;
                return (
                  <tr key={row.id} className={`hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group ${disposed ? 'opacity-50' : ''}`}>
                    <td className="px-1 py-1"><input type="date" value={row.datePurchased} onChange={e => handleUpdateRow(row.id, 'datePurchased', e.target.value)} className="w-full bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none" /></td>
                    <td className="px-1 py-1"><input type="text" value={row.invoiceNo} onChange={e => handleUpdateRow(row.id, 'invoiceNo', e.target.value)} placeholder="INV-001" className="w-24 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none" /></td>
                    <td className="px-1 py-1"><input type="text" value={row.description} onChange={e => handleUpdateRow(row.id, 'description', e.target.value)} placeholder="Asset description" className="w-48 bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none" /></td>
                    <td className="px-1 py-1">
                      <select value={(row as any).method || 'straight-line'} onChange={e => handleUpdateRow(row.id, 'method' as any, e.target.value)} disabled={disposed} className="bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none text-xs">
                        {DEPRECIATION_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                      </select>
                    </td>
                    <td className="px-1 py-1"><input type="number" value={row.cost || ''} onChange={e => handleUpdateRow(row.id, 'cost', parseFloat(e.target.value) || 0)} placeholder="0.00" className="w-28 text-right font-mono bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none" /></td>
                    <td className="px-1 py-1"><input type="number" value={row.usefulLifeYears || ''} onChange={e => handleUpdateRow(row.id, 'usefulLifeYears', parseFloat(e.target.value) || 0)} placeholder="5" className="w-16 text-right font-mono bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none" /></td>
                    <td className="px-1 py-1"><input type="number" value={row.salvageValue || ''} onChange={e => handleUpdateRow(row.id, 'salvageValue', parseFloat(e.target.value) || 0)} placeholder="0.00" className="w-24 text-right font-mono bg-transparent border border-transparent hover:border-slate-200 dark:hover:border-slate-700 focus:border-blue-500 rounded-lg px-2 py-1.5 outline-none" /></td>
                    <td className="px-3 py-1.5 text-right font-mono text-blue-600 dark:text-blue-400">{disposed ? '—' : formatCurrency(currentYearDepreciation)}</td>
                    <td className="px-3 py-1.5 text-right font-mono font-bold text-slate-800 dark:text-slate-200">
                      {formatCurrency(netCarryingValue)}
                      {disposed && <div className={`text-[10px] font-semibold ${gain >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>Disposed · {gain >= 0 ? 'Gain' : 'Loss'} {formatCurrency(Math.abs(gain))}</div>}
                    </td>
                    <td className="px-2 py-1.5 text-center whitespace-nowrap">
                      {!disposed && (
                        <button onClick={() => handleDispose(row)} className="p-1.5 text-slate-300 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 rounded-lg transition-all" title="Dispose asset">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleDeleteRow(row.id)} disabled={!canDelete} title={canDelete ? 'Delete asset' : 'Delete Transactions permission not granted'} className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed">
                        <X className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            {schedule.length > 0 && (
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 font-black text-slate-700 dark:text-slate-200 border-t-2 border-slate-200 dark:border-slate-700">
                <tr>
                  <td colSpan={4} className="px-3 py-3 text-right">Total (active):</td>
                  <td className="px-3 py-3 text-right font-mono">{formatCurrency(totals.cost)}</td>
                  <td></td><td></td>
                  <td className="px-3 py-3 text-right font-mono text-blue-600 dark:text-blue-400">{formatCurrency(totals.currentYearDepreciation)}</td>
                  <td className="px-3 py-3 text-right font-mono">{formatCurrency(totals.netCarryingValue)}</td>
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        <button onClick={handleAddRow} className="mt-4 flex items-center gap-1.5 px-4 py-2.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition shadow-sm shadow-orange-500/20">
          <Plus className="w-4 h-4" /> Add Asset
        </button>
      </div>
    </div>
  );
}
