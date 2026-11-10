import React, { useMemo, useState } from 'react';
import { Clock3, FileDown, Printer, Users } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { printReportPage } from '../lib/reportPrint';
import { generateCSV } from '../lib/utils';
import { buildAgingReport, type AgingPartyType } from '../lib/agingReports';

const todayLocal = (): string => {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
};

const money = (value: number): string => `₱${(value || 0).toLocaleString('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

export function AgingReports() {
  const { currentClient, currentClientId } = useAccounting();
  const canExport = usePermission('export_data');
  const [partyType, setPartyType] = useState<AgingPartyType>('customer');
  const [asOfDate, setAsOfDate] = useState(todayLocal);
  const [partyFilter, setPartyFilter] = useState('');

  const report = useMemo(() => buildAgingReport(
    currentClient?.glAccounts || [],
    partyType,
    asOfDate || todayLocal()
  ), [currentClient?.glAccounts, partyType, asOfDate]);

  const filteredItems = useMemo(() => {
    const query = partyFilter.trim().toLocaleLowerCase();
    if (!query) return report.items;
    return report.items.filter(item =>
      item.partyName.toLocaleLowerCase().includes(query)
      || item.reference.toLocaleLowerCase().includes(query)
      || item.particulars.toLocaleLowerCase().includes(query)
    );
  }, [report.items, partyFilter]);

  const filteredParties = useMemo(() => {
    const query = partyFilter.trim().toLocaleLowerCase();
    if (!query) return report.parties;
    return report.parties.filter(party => party.partyName.toLocaleLowerCase().includes(query));
  }, [report.parties, partyFilter]);

  const filteredTotals = useMemo(() => {
    const total = { current: 0, days31to60: 0, days61to90: 0, over90: 0, overall: 0 };
    filteredItems.forEach(item => {
      total[item.bucketId] += item.outstanding;
      total.overall += item.outstanding;
    });
    return total;
  }, [filteredItems]);

  const reportTitle = partyType === 'customer' ? 'Accounts Receivable Aging' : 'Accounts Payable Aging';
  const partyLabel = partyType === 'customer' ? 'Customer' : 'Supplier';
  const exportRows: any[][] = [
    [reportTitle],
    ['Business', currentClient?.name || ''],
    ['As of', asOfDate],
    ['Aging basis', 'Posting / invoice date; Current = 0–30 days'],
    [],
    ['Aging Summary', 'Amount'],
    ['Current (0–30 days)', filteredTotals.current],
    ['31–60 days', filteredTotals.days31to60],
    ['61–90 days', filteredTotals.days61to90],
    ['90+ days', filteredTotals.over90],
    ['Total Outstanding', filteredTotals.overall],
    [],
    [partyLabel, 'Control Account', 'Invoice Date', 'Reference', 'Particulars', 'Age (days)', 'Aging Bucket', 'Original Amount', 'Applied', 'Outstanding'],
    ...filteredItems.map(item => [
      item.partyName, item.accountTitle, item.invoiceDate, item.reference, item.particulars,
      item.ageDays, item.bucketLabel, item.originalAmount, item.appliedAmount, item.outstanding,
    ]),
  ];

  if (!currentClient || !currentClientId) return null;

  return (
    <div className="w-full flex flex-col print-area">
      <PageHeader
        title="A/R & A/P Aging Reports"
        icon={<Clock3 className="text-cyan-600" />}
        actions={(
          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => generateCSV(`${partyType === 'customer' ? 'accounts-receivable' : 'accounts-payable'}-aging.csv`, exportRows)}
              disabled={!canExport || filteredItems.length === 0}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={canExport ? 'Export to CSV' : 'Export Data permission not granted'}
            >
              <FileDown className="w-4 h-4" /> Export
            </button>
            <button
              type="button"
              onClick={() => printReportPage(reportTitle)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        )}
      />

      <div className="p-4 md:p-6 flex-1 space-y-5">
        <div className="no-print flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div className="flex rounded-lg border border-slate-200 dark:border-slate-700 p-1 gap-1">
            <button
              type="button"
              onClick={() => setPartyType('customer')}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-colors ${partyType === 'customer' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >Accounts Receivable</button>
            <button
              type="button"
              onClick={() => setPartyType('supplier')}
              className={`px-4 py-2 rounded-md text-xs font-bold transition-colors ${partyType === 'supplier' ? 'bg-cyan-600 text-white' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'}`}
            >Accounts Payable</button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">As of Date</label>
            <input type="date" value={asOfDate} onChange={event => setAsOfDate(event.target.value)} className="form-input text-sm py-2" />
          </div>
          <div className="min-w-[220px] flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Filter {partyLabel} / Reference</label>
            <input value={partyFilter} onChange={event => setPartyFilter(event.target.value)} placeholder={`Search ${partyLabel.toLowerCase()}, invoice or particulars`} className="form-input text-sm py-2 w-full" />
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-slate-500">{currentClient.name}</div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">{reportTitle}</h2>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">As of {asOfDate} · {filteredParties.length} {partyLabel.toLowerCase()}{filteredParties.length === 1 ? '' : 's'} · {filteredItems.length} open item{filteredItems.length === 1 ? '' : 's'}</div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Total Outstanding</div>
            <div className="text-xl font-black tabular-nums text-slate-800 dark:text-slate-100">{money(filteredTotals.overall)}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {report.buckets.map(bucket => {
            const value = filteredTotals[bucket.id];
            return (
              <div key={bucket.id} className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{bucket.label}</div>
                <div className="text-lg font-extrabold mt-1 tabular-nums text-slate-800 dark:text-slate-100">{money(value)}</div>
                <div className="text-[10px] text-slate-400 mt-1">{bucket.range}</div>
              </div>
            );
          })}
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <table className="w-full text-sm min-w-[1050px]">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-950 text-left text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-3 py-3">{partyLabel}</th>
                <th className="px-3 py-3">Control Account</th>
                <th className="px-3 py-3">Invoice Date</th>
                <th className="px-3 py-3">Reference</th>
                <th className="px-3 py-3">Particulars</th>
                <th className="px-3 py-3 text-right">Age</th>
                <th className="px-3 py-3">Bucket</th>
                <th className="px-3 py-3 text-right">Original</th>
                <th className="px-3 py-3 text-right">Applied</th>
                <th className="px-3 py-3 text-right">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map(item => (
                <tr key={item.id} className="border-t border-slate-100 dark:border-slate-800">
                  <td className="px-3 py-3 font-semibold text-slate-800 dark:text-slate-100">{item.partyName}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{item.accountTitle}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.invoiceDate}</td>
                  <td className="px-3 py-3">{item.reference || '—'}</td>
                  <td className="px-3 py-3 max-w-[220px] truncate" title={item.particulars}>{item.particulars || '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{item.ageDays}</td>
                  <td className="px-3 py-3 whitespace-nowrap">{item.bucketLabel}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(item.originalAmount)}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(item.appliedAmount)}</td>
                  <td className="px-3 py-3 text-right font-bold tabular-nums">{money(item.outstanding)}</td>
                </tr>
              ))}
              {!filteredItems.length && (
                <tr><td colSpan={10} className="px-4 py-12 text-center text-slate-400">
                  <Users className="w-7 h-7 mx-auto mb-2 opacity-40" />
                  No outstanding {partyType === 'customer' ? 'receivables' : 'payables'} were found for this as-of date and filter.
                </td></tr>
              )}
            </tbody>
            {filteredItems.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 font-bold">
                  <td className="px-3 py-3" colSpan={7}>Total Outstanding</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(filteredItems.reduce((sum, item) => sum + item.originalAmount, 0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(filteredItems.reduce((sum, item) => sum + item.appliedAmount, 0))}</td>
                  <td className="px-3 py-3 text-right tabular-nums">{money(filteredTotals.overall)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {report.totalUnappliedCredits > 0 && (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/20 p-4">
            <div className="text-xs font-bold uppercase tracking-wider text-amber-800 dark:text-amber-300">Unapplied credits / advances</div>
            <div className="text-sm text-amber-900 dark:text-amber-200 mt-1">{money(report.totalUnappliedCredits)} in tagged {partyType === 'customer' ? 'customer credits' : 'supplier advances'} remains after matching payments against open items. These are shown separately and are not netted against the aging buckets.</div>
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          Aging is calculated from the invoice-side General Ledger posting date because individual due dates are not currently stored on the ledger entries. The Current bucket covers 0–30 days; payments are applied to matching invoice references first, then to the oldest open items (FIFO). Only transactions tagged to a customer or supplier in the A/R or A/P control account are included.
        </p>
      </div>
    </div>
  );
}
