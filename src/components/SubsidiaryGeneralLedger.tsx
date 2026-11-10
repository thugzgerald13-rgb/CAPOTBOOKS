import React, { useEffect, useMemo, useState } from 'react';
import { FileDown, Printer, Users, UserRound } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import { printReportPage } from '../lib/reportPrint';
import { generateCSV } from '../lib/utils';
import { GeneralLedgerAccount, GeneralLedgerEntry } from '../types';
import { getDefaultAccountsForIndustry, getPostableCoaAccounts } from '../lib/journalDefaults';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

type PartyType = 'customer' | 'supplier';

const amountOf = (value: unknown): number => {
  const parsed = Number.parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
};

const entryDate = (entry: GeneralLedgerEntry): string => String(entry.dateDr || entry.dateCr || '').slice(0, 10);
const signedAmount = (entry: GeneralLedgerEntry): number => amountOf(entry.debit) - amountOf(entry.credit);
const formatAmount = (value: number): string => Math.abs(value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatBalance = (value: number): string => `${value < 0 ? '-' : ''}${formatAmount(value)}`;

function accountMatchesPartyType(account: GeneralLedgerAccount, partyType: PartyType): boolean {
  const name = String(account.accountTitle || '').toLowerCase();
  const tagged = (account.entries || []).some(entry => entry.partyType === partyType && !!entry.partyName?.trim());
  if (tagged) return true;
  return partyType === 'customer'
    ? /accounts? receivable|trade receivable|trade debtors?/.test(name)
    : /accounts? payable|trade payable|trade creditors?/.test(name);
}

export function SubsidiaryGeneralLedger() {
  const { currentClient, currentClientId } = useAccounting();
  const canExport = usePermission('export_data');
  const [partyType, setPartyType] = useState<PartyType>('customer');
  const [accountId, setAccountId] = useState('');
  const [partyName, setPartyName] = useState('');
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  const ledgers = useMemo(() => {
    if (!currentClient) return [] as GeneralLedgerAccount[];
    const synced = (currentClient.glAccounts || []) as GeneralLedgerAccount[];
    const accounts = currentClient.accounts?.length
      ? currentClient.accounts
      : getDefaultAccountsForIndustry(currentClient.industry, currentClient.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric');
    return getPostableCoaAccounts(accounts).map(account => {
      const existing = synced.find(ledger => String(ledger.accountId || ledger.id) === String(account.id));
      return existing || {
        id: account.id,
        accountId: account.id,
        accountTitle: account.name,
        accountType: account.type,
        entries: [],
      } as GeneralLedgerAccount;
    });
  }, [currentClient]);
  const accountOptions = useMemo(
    () => ledgers.filter(account => accountMatchesPartyType(account, partyType)),
    [ledgers, partyType]
  );

  useEffect(() => {
    if (!accountOptions.length) {
      if (accountId) setAccountId('');
      return;
    }
    if (!accountOptions.some(account => String(account.accountId || account.id) === accountId)) {
      const preferred = accountOptions.find(account => partyType === 'customer'
        ? /accounts? receivable/i.test(account.accountTitle)
        : /accounts? payable/i.test(account.accountTitle));
      setAccountId(String(preferred?.accountId || preferred?.id || accountOptions[0].accountId || accountOptions[0].id));
    }
  }, [accountOptions, accountId, partyType]);

  const selectedAccount = accountOptions.find(account => String(account.accountId || account.id) === accountId) || null;

  const partyOptions = useMemo(() => {
    const directory = partyType === 'customer'
      ? (currentClient?.tinLibrary?.customers || [])
      : (currentClient?.tinLibrary?.suppliers || []);
    const names = [
      ...directory.map(item => String(item.name || '').trim()),
      ...(selectedAccount?.entries || [])
        .filter(entry => entry.partyType === partyType)
        .map(entry => String(entry.partyName || '').trim()),
    ].filter(Boolean);
    const unique = new Map<string, string>();
    names.forEach(name => {
      const key = name.toLocaleLowerCase();
      if (!unique.has(key)) unique.set(key, name);
    });
    return Array.from(unique.values()).sort((a, b) => a.localeCompare(b));
  }, [currentClient, selectedAccount, partyType]);

  useEffect(() => {
    if (!partyOptions.length) {
      if (partyName) setPartyName('');
      return;
    }
    if (!partyOptions.some(name => name.toLocaleLowerCase() === partyName.toLocaleLowerCase())) {
      setPartyName(partyOptions[0]);
    }
  }, [partyOptions, partyName]);

  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    return Array.from({ length: 11 }, (_, index) => currentYear + 2 - index);
  }, []);

  const { start, end } = useMemo(() => {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = new Date(Date.UTC(year, month, 1));
    const end = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}-01`;
    return { start, end };
  }, [month, year]);

  const allPartyEntries = useMemo(() => {
    if (!selectedAccount || !partyName) return [];
    return (selectedAccount.entries || [])
      .filter(entry => entry.partyType === partyType && String(entry.partyName || '').trim().toLocaleLowerCase() === partyName.toLocaleLowerCase())
      .slice()
      .sort((a, b) => entryDate(a).localeCompare(entryDate(b)) || String(a.id).localeCompare(String(b.id)));
  }, [selectedAccount, partyName, partyType]);

  const beginningBalance = allPartyEntries
    .filter(entry => entryDate(entry) && entryDate(entry) < start)
    .reduce((balance, entry) => balance + signedAmount(entry), 0);

  const periodEntries = allPartyEntries.filter(entry => {
    const date = entryDate(entry);
    return date >= start && date < end;
  });
  const totalDebit = periodEntries.reduce((sum, entry) => sum + amountOf(entry.debit), 0);
  const totalCredit = periodEntries.reduce((sum, entry) => sum + amountOf(entry.credit), 0);
  const endingBalance = beginningBalance + totalDebit - totalCredit;

  const exportRows: any[][] = [
    ['Subsidiary General Ledger'],
    ['Business', currentClient?.name || ''],
    ['Account', selectedAccount?.accountTitle || ''],
    [partyType === 'customer' ? 'Customer' : 'Supplier', partyName],
    ['Period', `${MONTHS[month - 1]} ${year}`],
    ['Date', 'Particulars', 'Reference', 'Debit', 'Credit', 'Balance'],
    ['', 'Beginning Balance', '', beginningBalance > 0 ? beginningBalance : '', beginningBalance < 0 ? Math.abs(beginningBalance) : '', beginningBalance],
  ];
  let exportRunningBalance = beginningBalance;
  periodEntries.forEach(entry => {
    exportRunningBalance += signedAmount(entry);
    exportRows.push([
      entryDate(entry), entry.particularsDr || entry.particularsCr || '', entry.refDr || entry.refCr || '',
      amountOf(entry.debit) || '', amountOf(entry.credit) || '', exportRunningBalance,
    ]);
  });
  exportRows.push(['', 'Ending Balance', '', totalDebit, totalCredit, endingBalance]);

  if (!currentClient || !currentClientId) return null;

  const PartyIcon = partyType === 'customer' ? UserRound : Users;

  return (
    <div className="w-full flex flex-col print-area">
      <PageHeader
        title="Subsidiary General Ledger"
        icon={<Users />}
        actions={(
          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={() => generateCSV('subsidiary-general-ledger.csv', exportRows)}
              disabled={!canExport || !selectedAccount || !partyName}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              title={canExport ? 'Export to CSV' : 'Export Data permission not granted'}
            >
              <FileDown className="w-4 h-4" /> Export
            </button>
            <button
              type="button"
              onClick={() => printReportPage('Subsidiary General Ledger')}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90 transition-opacity"
            >
              <Printer className="w-4 h-4" /> Print
            </button>
          </div>
        )}
      />

      <div className="p-4 md:p-6 flex-1 space-y-5">
        <div className="no-print flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Subsidiary Type</label>
            <select value={partyType} onChange={event => { setPartyType(event.target.value as PartyType); setAccountId(''); setPartyName(''); }} className="form-input text-sm py-2 min-w-[150px]">
              <option value="customer">Customer Ledger (A/R)</option>
              <option value="supplier">Supplier Ledger (A/P)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Control Account</label>
            <select value={accountId} onChange={event => { setAccountId(event.target.value); setPartyName(''); }} className="form-input text-sm py-2 min-w-[220px]">
              <option value="">Select Account</option>
              {accountOptions.map(account => <option key={account.id} value={account.accountId || account.id}>{account.accountTitle}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">{partyType === 'customer' ? 'Customer' : 'Supplier'}</label>
            <select value={partyName} onChange={event => setPartyName(event.target.value)} className="form-input text-sm py-2 min-w-[220px]" disabled={!partyOptions.length}>
              <option value="">Select {partyType}</option>
              {partyOptions.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1">Period</label>
            <div className="flex gap-2">
              <select value={month} onChange={event => setMonth(Number(event.target.value))} className="form-input text-sm py-2">{MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select>
              <select value={year} onChange={event => setYear(Number(event.target.value))} className="form-input text-sm py-2">{years.map(value => <option key={value} value={value}>{value}</option>)}</select>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-xs uppercase tracking-wider font-bold text-slate-500">{currentClient.name}</div>
            <h2 className="text-lg font-black text-slate-800 dark:text-slate-100">{selectedAccount?.accountTitle || 'No control account selected'}</h2>
            <div className="text-sm text-slate-500 dark:text-slate-400 flex items-center gap-2 mt-1">
              <PartyIcon className="w-4 h-4" />
              {partyName || `Select a ${partyType}`} · {MONTHS[month - 1]} {year}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Ending Balance</div>
            <div className="text-xl font-black tabular-nums text-slate-800 dark:text-slate-100">{partyName ? formatBalance(endingBalance) : '—'}</div>
          </div>
        </div>

        {!accountOptions.length ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
            No {partyType === 'customer' ? 'Accounts Receivable' : 'Accounts Payable'} control account or party-tagged ledger entries were found in this client’s books.
          </div>
        ) : !partyName ? (
          <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center text-sm text-slate-500">
            Select a control account and {partyType} to view its subsidiary ledger.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-950 text-left text-[11px] uppercase tracking-wider text-slate-500">
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3">Particulars</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3 text-right">Debit</th>
                  <th className="px-4 py-3 text-right">Credit</th>
                  <th className="px-4 py-3 text-right">Balance</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-t border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/40 italic">
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 font-medium">Beginning Balance</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right">{beginningBalance > 0 ? formatAmount(beginningBalance) : ''}</td>
                  <td className="px-4 py-3 text-right">{beginningBalance < 0 ? formatAmount(beginningBalance) : ''}</td>
                  <td className="px-4 py-3 text-right font-semibold">{formatBalance(beginningBalance)}</td>
                </tr>
                {(() => {
                  let runningBalance = beginningBalance;
                  return periodEntries.map(entry => {
                    runningBalance += signedAmount(entry);
                    return (
                      <tr key={entry.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-4 py-3 whitespace-nowrap">{entryDate(entry)}</td>
                        <td className="px-4 py-3">{entry.particularsDr || entry.particularsCr || ''}</td>
                        <td className="px-4 py-3">{entry.refDr || entry.refCr || ''}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{entry.debit || ''}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{entry.credit || ''}</td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums whitespace-nowrap">{formatBalance(runningBalance)}</td>
                      </tr>
                    );
                  });
                })()}
                {!periodEntries.length && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-400">No tagged transactions for this {partyType} in this period.</td></tr>
                )}
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/60 font-bold">
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3">Period Total / Ending Balance</td>
                  <td className="px-4 py-3"></td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatAmount(totalDebit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatAmount(totalCredit)}</td>
                  <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">{formatBalance(endingBalance)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        <p className="text-xs text-slate-500 dark:text-slate-400">
          This subsidiary ledger is derived from the synchronized General Ledger. Customer and supplier details are carried from identified source transactions; entries without an identified party are not assigned to an individual subsidiary account.
        </p>
      </div>
    </div>
  );
}
