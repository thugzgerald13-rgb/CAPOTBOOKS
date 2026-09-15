import React, { useEffect, useState } from 'react';
import { Wallet, Plus, Trash2, Settings, X, Check, Calendar } from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { JournalColumn, JournalEntry, CoaAccount } from '../types';
import { cn, parseDateToISO, periodPreset } from '../lib/utils';

export const CDJ_CASH_ON_HAND_BANK_ID = 'cash_on_hand_bank';
export const CDJ_SUNDRY_ACCOUNT_TITLE_ID = 'sundry_account_title';
export const CDJ_SUNDRY_AMOUNT_ID = 'sundry_amount';

export const DEFAULT_CDJ_COLUMNS: JournalColumn[] = [
  { id: 'date', name: 'Date', type: 'text', category: 'None', isSystem: true },
  { id: 'payee', name: 'Payees', type: 'text', category: 'None', isSystem: true },
  { id: 'folio_f', name: 'Folio/F', type: 'text', category: 'None', isSystem: true },
  { id: CDJ_CASH_ON_HAND_BANK_ID, name: 'Cash on Hand/Bank', type: 'number', category: 'Cr', isSystem: true },
  { id: CDJ_SUNDRY_ACCOUNT_TITLE_ID, name: 'Account Title', type: 'text', category: 'None', isSystem: true },
  { id: CDJ_SUNDRY_AMOUNT_ID, name: 'Amount Dr/Cr', type: 'number', category: 'None', isSystem: true },
];

const MAX_CDJ_ACCOUNT_COLUMNS = 9;
const CDJ_ACCOUNT_PREFIX = 'cdj_coa_';

function accountColumnId(accountId: string) {
  return `${CDJ_ACCOUNT_PREFIX}${accountId}`;
}

function accountIdFromColumn(column: JournalColumn): string | undefined {
  return column.id.startsWith(CDJ_ACCOUNT_PREFIX) ? column.id.slice(CDJ_ACCOUNT_PREFIX.length) : undefined;
}

function getClientAccounts(client: any): CoaAccount[] {
  return (client.accounts || []).filter((a: CoaAccount) => !a.hidden);
}

function getInputTaxAccount(accounts: CoaAccount[]): CoaAccount | undefined {
  // The CDJ default column is linked to the actual Chart of Accounts account.
  // Prefer an exact "Input Tax" title; also recognize the app's VAT input
  // receivable naming when that is the account used in the client's COA.
  const normalized = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return accounts.find(a => normalized(a.name) === 'input tax')
    || accounts.find(a => normalized(a.name) === 'vat input receivable')
    || accounts.find(a => normalized(a.name) === 'input vat')
    || accounts.find(a => normalized(a.name) === 'vat input');
}

function getWithholdingTaxAccount(accounts: CoaAccount[]): CoaAccount | undefined {
  // CDJ credit column for expanded withholding tax withheld on cash purchases.
  // Prefer the "Expanded" payable title used by the GL posting logic, then
  // fall back to the plain payable account in the client's COA.
  const normalized = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return accounts.find(a => normalized(a.name) === 'withholding tax payable expanded')
    || accounts.find(a => normalized(a.name) === 'expanded withholding tax payable')
    || accounts.find(a => normalized(a.name) === 'withholding tax payable');
}

function normalizeCdjColumns(columns: JournalColumn[] | undefined, accounts: CoaAccount[]): JournalColumn[] {
  const base = DEFAULT_CDJ_COLUMNS.slice(0, 4); // Date, Payees, Folio/F, Cash on Hand/Bank
  const sundries = DEFAULT_CDJ_COLUMNS.slice(4); // Account Title, Amount Dr/Cr

  const inputTaxAccount = getInputTaxAccount(accounts);
  const inputTaxColumn: JournalColumn | undefined = inputTaxAccount ? {
    id: accountColumnId(inputTaxAccount.id),
    name: inputTaxAccount.name,
    type: 'number',
    category: 'Dr',
    isSystem: true,
  } : undefined;
  if (!columns || columns.length === 0) {
    return inputTaxColumn
      ? [...base, inputTaxColumn, ...sundries]
      : [...base, ...sundries];
  }

  const accountCols: JournalColumn[] = [];
  const used = new Set<string>();
  // Withholding Tax Payable is intentionally NOT a dedicated CDJ column — it
  // is carried in the Sundry columns. Skip it if a prior build persisted one.
  const whtAccountId = getWithholdingTaxAccount(accounts)?.id;

  // Input Tax is a fixed default account column immediately after Cash on Hand/Bank.
  if (inputTaxAccount) {
    used.add(inputTaxAccount.id);
    accountCols.push(inputTaxColumn!);
  }

  // Preserve existing CDJ account columns, but never allow more than 9.
  columns.forEach(c => {
    const accountId = accountIdFromColumn(c);
    if (!accountId || accountId === whtAccountId || accountCols.length >= MAX_CDJ_ACCOUNT_COLUMNS || used.has(accountId)) return;
    const account = accounts.find(a => a.id === accountId);
    if (!account) return;
    used.add(account.id);
    accountCols.push({
      id: accountColumnId(account.id),
      name: account.name,
      type: 'number',
      category: account.normalSide === 'credit' ? 'Cr' : 'Dr',
      isSystem: false,
    });
  });

  // Migrate older user-created numeric columns that were named after a COA account.
  columns.filter(c => c.type === 'number' && !c.isSystem).forEach(c => {
    if (accountCols.length >= MAX_CDJ_ACCOUNT_COLUMNS) return;
    const match = accounts.find(a =>
      a.id === c.id || a.name.trim().toLowerCase() === c.name.trim().toLowerCase()
    );
    if (!match || match.id === whtAccountId || used.has(match.id)) return;
    used.add(match.id);
    accountCols.push({
      id: accountColumnId(match.id),
      name: match.name,
      type: 'number',
      category: match.normalSide === 'credit' ? 'Cr' : 'Dr',
      isSystem: false,
    });
  });

  return [...base, ...accountCols, ...sundries];
}

function getDebitAllocation(entry: JournalEntry, columns: JournalColumn[], accounts: CoaAccount[]) {
  const values = entry.values || {};
  const title = String(values.account_title ?? values.accountTitle ?? '').trim();
  const amountRaw = values.amount ?? values.debitAmount ?? values.debit_amount ?? '';
  const amount = Number(String(amountRaw).replace(/,/g, ''));
  if (!title || !Number.isFinite(amount) || amount === 0) {
    return { title: '', amount: '' as string, matchedColumnId: undefined as string | undefined };
  }

  const normalizeAccountLabel = (s: string) =>
    String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

  const exact = accounts.find(a =>
    a.id === title || normalizeAccountLabel(a.name) === normalizeAccountLabel(title)
  );
  const account = exact || accounts.find(a => {
    const t = new Set(normalizeAccountLabel(title).split(' ').filter(Boolean));
    const n = new Set(normalizeAccountLabel(a.name).split(' ').filter(Boolean));
    if (!t.size || !n.size) return false;
    let overlap = 0;
    t.forEach(token => { if (n.has(token)) overlap++; });
    return overlap > 0 && overlap === Math.min(t.size, n.size);
  });
  if (!account) {
    return { title, amount: amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), matchedColumnId: undefined };
  }

  const matched = columns.find(c => accountIdFromColumn(c) === account.id);
  if (matched) {
    return { title: account.name, amount: amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), matchedColumnId: matched.id };
  }

  return { title: account.name, amount: amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), matchedColumnId: undefined };
}

function getInputTaxValue(entry: JournalEntry): string {
  const values = entry.values || {};
  const candidates = [
    values.input_tax,
    values.inputTax,
    values['Input Tax'],
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
      const n = Number(String(candidate).replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) {
        return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
  }
  return '';
}

function getWithholdingTaxValue(entry: JournalEntry): string {
  const values = entry.values || {};
  const candidates = [
    values.wht,
    values.withholding_tax,
    values.whtAmount,
    values['Withholding Tax'],
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
      const n = Number(String(candidate).replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) {
        return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      }
    }
  }
  return '';
}

function getCreditedCashValue(entry: JournalEntry): string {
  const values = entry.values || {};
  const candidates = [
    values[CDJ_CASH_ON_HAND_BANK_ID],
    values.cash_on_hand_bank,
    values.cash,
    values.cashAmount,
    values.cash_amount,
  ];
  for (const candidate of candidates) {
    if (candidate !== undefined && candidate !== null && String(candidate).trim() !== '') {
      const n = Number(String(candidate).replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return String(candidate);
    }
  }
  return '';
}

function getCdjDisplayValue(entry: JournalEntry, column: JournalColumn, columns: JournalColumn[], accounts: CoaAccount[]): string {
  const values = entry.values || {};

  // Auto-posted rows are derived from their source transaction.  Calculate the
  // display values directly instead of waiting for an async persistence effect.
  // This guarantees Input Tax, selected COA columns, and Sundries appear
  // immediately even while the normalized Supabase row is being saved.
  if (entry.auto) {
    if (column.id === CDJ_CASH_ON_HAND_BANK_ID) return getCreditedCashValue(entry);

    const inputTaxAccount = getInputTaxAccount(accounts);
    if (inputTaxAccount && accountIdFromColumn(column) === inputTaxAccount.id) {
      return getInputTaxValue(entry);
    }

    const allocation = getDebitAllocation(entry, columns, accounts);
    const accountId = accountIdFromColumn(column);
    if (accountId && allocation.matchedColumnId === column.id) return allocation.amount;

    // Withholding Tax Payable is carried in the Sundry columns (no dedicated
    // column). When a purchase was made "With Withholdings", the credit side
    // splits between Cash on Hand/Bank and Withholding Tax Payable.
    const whtValue = getWithholdingTaxValue(entry);
    const whtTitle = getWithholdingTaxAccount(accounts)?.name || 'Withholding Tax Payable';

    if (column.id === CDJ_SUNDRY_ACCOUNT_TITLE_ID) {
      if (whtValue) return whtTitle;
      return allocation.matchedColumnId ? '' : allocation.title;
    }
    if (column.id === CDJ_SUNDRY_AMOUNT_ID) {
      if (whtValue) return whtValue;
      return allocation.matchedColumnId ? '' : allocation.amount;
    }
  }

  return values[column.id] === undefined || values[column.id] === null
    ? ''
    : String(values[column.id]);
}

export function CashDisbursementsJournal() {
  const { currentClient, currentClientId, saveJournalColumn, saveJournalColumns, saveJournalEntries, deleteJournalColumn, saveJournalEntry, deleteJournalEntry, activeDevice } = useAccounting();
  
  const [isEditingHeaders, setIsEditingHeaders] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [localColumns, setLocalColumns] = useState<JournalColumn[] | null>(null);
  const [localEntries, setLocalEntries] = useState<JournalEntry[] | null>(null);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

  const accounts = getClientAccounts(currentClient);
  const rawColumns = currentClient.cdjColumns;
  const columns = localColumns || normalizeCdjColumns(rawColumns, accounts);
  const entries = localEntries || currentClient.cdjEntries || [];

  const filteredEntries = (periodFrom || periodTo)
    ? entries.filter(e => {
        const d = parseDateToISO(e.values?.date);
        if (!d) return true;
        if (periodFrom && d < periodFrom) return false;
        if (periodTo && d > periodTo) return false;
        return true;
      })
    : entries;

  // IMPORTANT: CDJ is a derived journal. Do not continuously write back to
  // the client whenever currentClient/entries/accounts change. That created a
  // save -> context update -> effect -> save loop which could keep the page
  // busy and make navigation appear frozen. Display values are derived from
  // the source transactions, so persistence is only needed for the one-time
  // legacy column migration.
  const migrationClientRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (!currentClient || !currentClientId) return;
    if (migrationClientRef.current === currentClientId) return;

    const raw = currentClient.cdjColumns || [];
    const normalized = normalizeCdjColumns(raw, accounts);
    const rawSignature = JSON.stringify(raw);
    const normalizedSignature = JSON.stringify(normalized);

    // Mark this client as inspected before any async/state update. This
    // prevents navigation or a context refresh from starting the migration
    // repeatedly.
    migrationClientRef.current = currentClientId;

    if (rawSignature === normalizedSignature) return;

    // Preserve old Account Title/Amount values as Sundries during migration.
    const oldAccountTitle = raw.find(c => c.id === 'account_title');
    const oldAmount = raw.find(c => c.id === 'amount');
    const oldAccountColumns = raw.filter(c => c.type === 'number' && !c.isSystem);

    const migratedEntries = (currentClient.cdjEntries || []).map(entry => {
      const next = { ...entry.values };

      if (oldAccountTitle && next[oldAccountTitle.id] !== undefined) {
        next[CDJ_SUNDRY_ACCOUNT_TITLE_ID] = next[oldAccountTitle.id];
      }
      if (oldAmount && next[oldAmount.id] !== undefined) {
        next[CDJ_SUNDRY_AMOUNT_ID] = next[oldAmount.id];
      }

      normalized.filter(c => accountIdFromColumn(c)).forEach(c => {
        const account = accounts.find(a => a.id === accountIdFromColumn(c));
        const old = account && oldAccountColumns.find(
          x => x.name.trim().toLowerCase() === account.name.trim().toLowerCase()
        );
        if (old && next[old.id] !== undefined) next[c.id] = next[old.id];
      });

      // Existing auto rows are still displayed from their source values; only
      // migrate their old stored allocation when a legacy column is present.
      if (entry.auto) {
        const allocation = getDebitAllocation(entry, normalized, accounts);
        normalized.filter(c => accountIdFromColumn(c)).forEach(c => { delete next[c.id]; });
        delete next[CDJ_SUNDRY_ACCOUNT_TITLE_ID];
        delete next[CDJ_SUNDRY_AMOUNT_ID];

        if (allocation.matchedColumnId) {
          next[allocation.matchedColumnId] = allocation.amount;
        } else if (allocation.title) {
          next[CDJ_SUNDRY_ACCOUNT_TITLE_ID] = allocation.title;
          next[CDJ_SUNDRY_AMOUNT_ID] = allocation.amount;
        }

        const inputTaxAccount = getInputTaxAccount(accounts);
        const inputTaxColumn = inputTaxAccount
          ? normalized.find(c => accountIdFromColumn(c) === inputTaxAccount.id)
          : undefined;
        const inputTaxValue = getInputTaxValue(entry);
        if (inputTaxColumn && inputTaxValue) next[inputTaxColumn.id] = inputTaxValue;

        const whtValue = getWithholdingTaxValue(entry);
        if (whtValue) {
          next[CDJ_SUNDRY_ACCOUNT_TITLE_ID] = getWithholdingTaxAccount(accounts)?.name || 'Withholding Tax Payable';
          next[CDJ_SUNDRY_AMOUNT_ID] = whtValue;
        }
      }

      const cashValue = getCreditedCashValue(entry);
      if (cashValue) next[CDJ_CASH_ON_HAND_BANK_ID] = cashValue;

      return JSON.stringify(next) === JSON.stringify(entry.values)
        ? entry
        : { ...entry, values: next };
    });

    // One save only, for legacy/default column migration. No dependency on
    // Persist the normalized CDJ columns and entries directly; do not rewrite the client aggregate.
    void Promise.all([saveJournalColumns('CDJ', normalized), saveJournalEntries('CDJ', migratedEntries)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentClientId]);

  if (!currentClient || !currentClientId) return null;

  const handleSaveColumns = async (newCols: JournalColumn[]) => {
    const previous = columns;
    try {
      const previousIds = new Set(previous.map(c => c.id));
      const nextIds = new Set(newCols.map(c => c.id));
      await Promise.all(newCols.filter(c => !previousIds.has(c.id) || JSON.stringify(c) !== JSON.stringify(previous.find(p => p.id === c.id))).map(c => saveJournalColumn('CDJ', c)));
      await Promise.all(previous.filter(c => !nextIds.has(c.id)).map(c => deleteJournalColumn('CDJ', c.id)));
      setLocalColumns(newCols);
    } catch (error) {
      console.error('CDJ column save failed:', error);
      throw error;
    }
  };

  const handleSaveEntries = async (newEntries: JournalEntry[]) => {
    const previous = entries;
    try {
      const previousIds = new Set(previous.map(e => String(e.id)));
      const nextIds = new Set(newEntries.map(e => String(e.id)));
      await Promise.all(newEntries.filter(e => !previousIds.has(String(e.id)) || JSON.stringify(e) !== JSON.stringify(previous.find(p => String(p.id) === String(e.id)))).map(e => saveJournalEntry('CDJ', e)));
      await Promise.all(previous.filter(e => !nextIds.has(String(e.id)) && !e.auto).map(e => deleteJournalEntry('CDJ', String(e.id))));
      setLocalEntries(newEntries);
    } catch (error) {
      console.error('CDJ entry save failed:', error);
      throw error;
    }
  };

  const setClientsForJournal = (nextColumns: JournalColumn[], nextEntries: JournalEntry[]) => {
    // Keep the in-memory view current without persisting the entire client.
    // The normalized rows above are the source of truth.
    // This helper intentionally uses the existing context only for display.
  };

  const addColumn = () => {
    if (!selectedAccountId) return;
    if (columns.filter(c => accountIdFromColumn(c)).length >= MAX_CDJ_ACCOUNT_COLUMNS) return;
    if (columns.some(c => accountIdFromColumn(c) === selectedAccountId)) return;
    const account = accounts.find(a => a.id === selectedAccountId);
    if (!account) return;
    const newCol: JournalColumn = {
      id: accountColumnId(account.id),
      name: account.name,
      type: 'number',
      category: account.normalSide === 'credit' ? 'Cr' : 'Dr',
      isSystem: false,
    };
    const sundryIndex = columns.findIndex(c => c.id === CDJ_SUNDRY_ACCOUNT_TITLE_ID);
    const next = [...columns];
    next.splice(sundryIndex < 0 ? next.length : sundryIndex, 0, newCol);
    handleSaveColumns(next);
    setSelectedAccountId('');
  };

  const removeColumn = (id: string) => {
    if (confirm("Are you sure you want to remove this Chart of Accounts column? Data in this column for existing entries may be lost.")) {
      handleSaveColumns(columns.filter(c => c.id !== id));
    }
  };

  const addEntry = () => {
    const newEntry: JournalEntry = {
      id: crypto.randomUUID(),
      values: {}
    };
    handleSaveEntries([...entries, newEntry]);
  };

  const updateEntry = (id: string, colId: string, val: string) => {
    const updated = entries.map(e => {
      if (e.id === id) {
        if (e.auto) return e; // auto-posted rows are read-only — edit at the source instead
        return { ...e, values: { ...e.values, [colId]: val } };
      }
      return e;
    });
    handleSaveEntries(updated);
  };

  const deleteEntry = (id: string) => {
    handleSaveEntries(entries.filter(e => e.id !== id || e.auto));
  };

  // Calculate totals for number columns
  const getTotals = () => {
    const totals: Record<string, number> = {};
    columns.forEach(c => {
      if (c.type === 'number') {
        totals[c.id] = filteredEntries.reduce((sum, e) => {
          const display = getCdjDisplayValue(e, c, columns, accounts);
          const val = parseFloat(display.replace(/,/g, ''));
          return sum + (isNaN(val) ? 0 : val);
        }, 0);
      }
    });
    return totals;
  };

  const totals = getTotals();
  const totalDr = columns.filter(c => c.category === 'Dr').reduce((s, c) => s + (totals[c.id] || 0), 0)
    + Math.max(0, totals[CDJ_SUNDRY_AMOUNT_ID] || 0);
  const totalCr = columns.filter(c => c.category === 'Cr').reduce((s, c) => s + (totals[c.id] || 0), 0)
    + Math.max(0, -(totals[CDJ_SUNDRY_AMOUNT_ID] || 0));
  const isBalanced = Math.abs(totalDr - totalCr) < 0.01;

  return (
    <div className="w-full flex flex-col">
      <PageHeader title="Cash Disbursements Journal" icon={<Wallet />} />
      <div className="p-4 md:p-6 flex-1">
      <div className="p-6">
        <div className="flex flex-wrap items-center gap-3 mb-6 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
            <Calendar className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            <span className="text-xs font-bold uppercase tracking-wider">Period</span>
          </div>
          <input
            type="date"
            value={periodFrom}
            onChange={e => setPeriodFrom(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
          />
          <span className="text-slate-400 text-xs font-semibold">to</span>
          <input
            type="date"
            value={periodTo}
            onChange={e => setPeriodTo(e.target.value)}
            className="bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded-lg px-2 py-1.5 text-xs outline-none focus:border-cyan-500 text-slate-900 dark:text-white"
          />
          <div className="flex flex-wrap gap-1.5">
            {(['this-month', 'last-month', 'this-quarter', 'this-year'] as const).map(p => (
              <button
                key={p}
                onClick={() => { const [f, t] = periodPreset(p); setPeriodFrom(f); setPeriodTo(t); }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-cyan-50 hover:text-cyan-700 dark:hover:bg-cyan-900/20 dark:hover:text-cyan-400 transition-colors capitalize"
              >
                {p.replace('-', ' ')}
              </button>
            ))}
            {(periodFrom || periodTo) && (
              <button
                onClick={() => { setPeriodFrom(''); setPeriodTo(''); }}
                className="px-2.5 py-1 text-[11px] font-bold rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex items-center gap-1"
              >
                <X className="w-3 h-3" /> Clear
              </button>
            )}
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setIsEditingHeaders(!isEditingHeaders)}
              className={cn("p-2 rounded-lg transition-colors", isEditingHeaders ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700")}
              title="Customize Columns"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={addEntry}
              className="bg-cyan-600 hover:bg-cyan-700 text-white font-bold px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" /> Add Row
            </button>
          </div>
        </div>

        {isEditingHeaders && (
          <div className="mb-6 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700">
            <h4 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-2">Cash Disbursements Journal Columns</h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">Up to 9 account columns are selected directly from the Chart of Accounts. Sundries is fixed after those account columns.</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {columns.map((col, index) => {
                const accountId = accountIdFromColumn(col);
                return (
                  <div key={col.id} className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border",
                    accountId ? "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800" : "bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                  )}>
                    <span>{accountId ? `${columns.filter(c => accountIdFromColumn(c)).indexOf(col) + 1}. ${col.name}` : `${index >= 3 ? index + 1 : ''} ${col.name}`}</span>
                    {accountId && <button onClick={() => removeColumn(col.id)} className="text-red-400 hover:text-red-600"><X className="w-3.5 h-3.5" /></button>}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">Add Chart of Accounts Column ({columns.filter(c => accountIdFromColumn(c)).length}/{MAX_CDJ_ACCOUNT_COLUMNS})</label>
                <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} className="form-input text-sm py-1.5 min-w-[260px]" disabled={columns.filter(c => accountIdFromColumn(c)).length >= MAX_CDJ_ACCOUNT_COLUMNS}>
                  <option value="">Select an account...</option>
                  {accounts.filter(a => !columns.some(c => accountIdFromColumn(c) === a.id)).map(a => (
                    <option key={a.id} value={a.id}>{a.id} — {a.name}</option>
                  ))}
                </select>
              </div>
              <button onClick={addColumn} disabled={!selectedAccountId || columns.filter(c => accountIdFromColumn(c)).length >= MAX_CDJ_ACCOUNT_COLUMNS} className="bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white font-bold px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1">
                <Plus className="w-4 h-4" /> Add Account Column
              </button>
            </div>
            <div className="mt-4 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400">
              <strong>Sundries:</strong> Account Title and Amount Dr/Cr. Enter a positive amount for a debit and a negative amount for a credit.
            </div>
          </div>
        )}

        {activeDevice === 'mobile' ? (
          <div className="flex flex-col gap-4">
            {filteredEntries.map((entry, idx) => {
              const isAuto = !!entry.auto;
              return (
              <div key={entry.id} className={cn("border rounded-2xl p-4 flex flex-col gap-3 relative shadow-sm", isAuto ? "bg-cyan-50/40 dark:bg-cyan-950/10 border-cyan-200 dark:border-cyan-900/50" : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700")}>
                <div className="flex justify-between items-center pb-2 border-b border-slate-200 dark:border-slate-700/60">
                  <span className="font-mono text-xs text-slate-500 font-extrabold bg-slate-200 dark:bg-slate-700 px-2 py-0.5 rounded">Entry #{idx + 1}</span>
                  {isAuto ? (
                    <span
                      title={`Auto-posted from ${entry.autoSource} — edit at the source`}
                      className="text-[9px] font-bold uppercase tracking-wide px-2 py-1 rounded-lg bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300"
                    >
                      Auto · {entry.autoSource}
                    </span>
                  ) : (
                    <button 
                      onClick={() => deleteEntry(entry.id)}
                      className="p-1.5 bg-red-50 dark:bg-red-950/20 text-red-500 hover:text-red-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {columns.filter(c => c.isSystem).map(col => (
                    <div key={col.id} className="col-span-1">
                      <label className="block text-[10px] uppercase font-bold text-slate-400 mb-1">{col.name}</label>
                      <input 
                        type="text"
                        readOnly={isAuto || col.id === CDJ_CASH_ON_HAND_BANK_ID}
                        value={getCdjDisplayValue(entry, col, columns, accounts)}
                        onChange={e => {
                          if (col.id === CDJ_CASH_ON_HAND_BANK_ID) return;
                          updateEntry(entry.id, col.id, e.target.value);
                        }}
                        className={cn("w-full border rounded-xl px-2.5 py-1.5 text-xs outline-none", isAuto ? "bg-slate-100 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 cursor-default" : "bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 focus:border-cyan-500 text-slate-900 dark:text-white")}
                        placeholder={`Enter ${col.name.toLowerCase()}`}
                      />
                    </div>
                  ))}
                </div>

                <div className="bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200 dark:border-slate-700/50 flex flex-col gap-2 mt-1">
                  <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-widest block mb-1">Financial Figures (Dr/Cr)</span>
                  <div className="grid grid-cols-1 gap-2">
                    {columns.filter(c => !c.isSystem).map(col => (
                      <div key={col.id} className="flex items-center justify-between gap-4 border-b border-slate-100 dark:border-slate-800/80 pb-1.5 last:border-0 last:pb-0">
                        <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">{col.name} <span className="text-[10px] text-slate-400 uppercase font-mono">({col.category})</span></span>
                        <input 
                          type="text"
                          readOnly={isAuto}
                          value={getCdjDisplayValue(entry, col, columns, accounts)}
                          onChange={e => {
                            let val = e.target.value;
                            if (/^[0-9.,-]*$/.test(val)) {
                              updateEntry(entry.id, col.id, val);
                            }
                          }}
                          onBlur={e => {
                            const raw = e.target.value.replace(/,/g, '');
                            if (raw && !isNaN(parseFloat(raw))) {
                              updateEntry(entry.id, col.id, parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                            }
                          }}
                          className={cn("w-32 text-right bg-transparent border-b border-dashed font-mono text-xs px-1/2 py-0.5 outline-none font-bold", isAuto ? "border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 cursor-default" : "border-slate-200 hover:border-slate-400 dark:border-slate-700/60 dark:hover:border-slate-500 focus:border-cyan-500 text-slate-800 dark:text-slate-200")}
                          placeholder="0.00"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              );
            })}
            {filteredEntries.length === 0 && (
              <div className="text-center py-8 text-slate-400 dark:text-slate-500">No entries yet. Click "Add Row" to start.</div>
            )}
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto shadow-sm">
            <table className="w-full text-xs text-left whitespace-nowrap min-w-[800px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase tracking-wider font-bold border-b border-slate-200 dark:border-slate-700">
                  <th className="px-3 py-3 w-10 text-center">Existing #</th>
                  {columns.filter(c => c.id === 'date' || c.id === 'payee' || c.id === 'folio_f' || c.id === CDJ_CASH_ON_HAND_BANK_ID).map(col => (
                    <th key={col.id} className="px-3 py-3">{col.name}</th>
                  ))}
                  {columns.filter(c => !!accountIdFromColumn(c)).map(col => (
                    <th key={col.id} className="px-3 py-3 text-right">{col.name}</th>
                  ))}
                  <th colSpan={2} className="px-3 py-2 text-center border-l border-slate-200 dark:border-slate-700">
                    <div>Sundries</div>
                    <div className="grid grid-cols-2 mt-1 text-[10px] font-semibold normal-case tracking-normal">
                      <span>Account Title</span><span>Amount Dr/Cr</span>
                    </div>
                  </th>
                  <th className="px-3 py-3 w-10 text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                {filteredEntries.map((entry, idx) => {
                  const isAuto = !!entry.auto;
                  return (
                  <tr key={entry.id} className={cn("group", isAuto ? "bg-cyan-50/40 dark:bg-cyan-950/10" : "hover:bg-slate-50/50 dark:hover:bg-slate-800/20")}>
                    <td className="px-3 py-2 text-center text-slate-400 font-mono">{idx + 1}</td>
                    {columns.map(col => (
                      <td key={col.id} className="px-2 py-1">
                        <input 
                          type={col.type === 'number' ? 'text' : 'text'}
                          readOnly={isAuto || col.id === CDJ_CASH_ON_HAND_BANK_ID}
                          value={getCdjDisplayValue(entry, col, columns, accounts)}
                          onChange={e => {
                            if (col.id === CDJ_CASH_ON_HAND_BANK_ID) return;
                            let val = e.target.value;
                            if (col.type === 'number') {
                               if (/^[0-9.,-]*$/.test(val)) {
                                 updateEntry(entry.id, col.id, val);
                               }
                            } else {
                              updateEntry(entry.id, col.id, val);
                            }
                          }}
                          onBlur={e => {
                            if (col.type === 'number') {
                              const raw = e.target.value.replace(/,/g, '');
                              if (raw && !isNaN(parseFloat(raw))) {
                                updateEntry(entry.id, col.id, parseFloat(raw).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
                              }
                            }
                          }}
                          title={isAuto ? `Auto-posted from ${entry.autoSource} — edit at the source` : undefined}
                          className={cn(
                            "w-full bg-transparent border rounded px-2 py-1.5 transition-all outline-none",
                            isAuto
                              ? "border-transparent text-slate-500 dark:text-slate-400 cursor-default"
                              : "border-transparent hover:border-slate-300 dark:hover:border-slate-600 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500",
                            col.type === 'number' ? "text-right font-mono" : ""
                          )}
                          placeholder={col.type === 'number' ? '0.00' : ''}
                        />
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center">
                      {isAuto ? (
                        <span
                          title={`Auto-posted from ${entry.autoSource} — edit at the source`}
                          className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300"
                        >
                          Auto
                        </span>
                      ) : (
                        <button 
                          onClick={() => deleteEntry(entry.id)}
                          className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {filteredEntries.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} className="px-6 py-8 text-center text-slate-500">
                      No entries yet. Click "Add Row" to start.
                    </td>
                  </tr>
                )}
              </tbody>
              {filteredEntries.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-800/80 font-bold border-t-2 border-slate-200 dark:border-slate-700">
                  <tr>
                    <td className="px-3 py-3 text-right" colSpan={columns.filter(c => c.type !== 'number').length + 1}>Total</td>
                    {columns.map(col => {
                      if (col.type === 'number') {
                        return (
                          <td key={col.id} className="px-3 py-3 text-right text-slate-800 dark:text-slate-200 font-mono text-[11px]">
                            {totals[col.id]?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </td>
                        );
                      }
                      return null;
                    })}
                    <td></td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}

        {filteredEntries.length > 0 && (
          <div className="mt-4 flex justify-between items-center bg-slate-100 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200 dark:border-slate-700">
            <div className="flex gap-8">
              <div>
                <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Total Debits</p>
                <p className="text-lg font-black text-slate-800 dark:text-slate-200 font-mono">
                  ₱{totalDr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="w-px bg-slate-300 dark:bg-slate-600"></div>
              <div>
                <p className="text-xs text-slate-500 font-bold mb-1 uppercase tracking-wider">Total Credits</p>
                <p className="text-lg font-black text-slate-800 dark:text-slate-200 font-mono">
                  ₱{totalCr.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </p>
              </div>
            </div>
            <div className={cn(
              "px-4 py-2 rounded-xl font-bold flex items-center gap-2",
              isBalanced ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
            )}>
              {isBalanced ? (
                <>
                  <Check className="w-5 h-5" /> Balanced
                </>
              ) : (
                <>
                  <X className="w-5 h-5" /> Out of Balance: ₱{Math.abs(totalDr - totalCr).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </>
              )}
            </div>
          </div>
        )}
      </div>
          </div>
    </div>
  );
}
