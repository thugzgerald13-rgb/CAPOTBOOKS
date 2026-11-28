import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Landmark, Upload, CheckCircle2, AlertTriangle, RefreshCw, Sparkles,
  FileDown, Printer, Plus, Trash2, Search, CheckSquare, Square, Wand2,
} from 'lucide-react';
import { PageHeader } from './ui/PageHeader';
import { useAccounting } from '../context/AccountingContext';
import { usePermission } from '../lib/teamPermissions';
import {
  parseBankStatementDetailed,
  SAMPLE_PH_BANK_CSV,
  type BankTxn,
} from '../lib/bankImport';
import {
  loadReconcileRules,
  saveReconcileRules,
  matchTransaction,
  DEFAULT_RECONCILE_RULES,
  type ReconcileRule,
} from '../lib/reconcileRules';
import {
  entryDateKey,
  glAccountBalanceBefore,
} from '../lib/accountingBalances';
import { getDefaultAccountsForIndustry, getPostableCoaAccounts } from '../lib/journalDefaults';
import { printReportPage } from '../lib/reportPrint';
import { generateCSV } from '../lib/utils';
import type { CoaAccount, GeneralLedgerAccount, GeneralLedgerEntry, JournalVoucher } from '../types';

interface SavedReconciliation {
  id: string;
  accountId: string;
  accountName: string;
  statementEndDate: string;
  statementEndingBalance: number;
  clearedBookBalance: number;
  clearedCount: number;
  unclearedCount: number;
  difference: number;
  reconciledAt: string;
}

const peso = (n: number) =>
  `₱${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const signedPeso = (n: number) => (n < -0.004 ? `-${peso(n)}` : peso(n));

const parseAmt = (v: unknown): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const daysDiff = (isoA: string, isoB: string): number => {
  const a = Date.parse(`${isoA}T00:00:00Z`);
  const b = Date.parse(`${isoB}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 999;
  return Math.abs(Math.round((a - b) / 86400000));
};

const clearedStorageKey = (clientId: string, accountId: string) =>
  `capot.bankRecon.cleared.${clientId}.${accountId}`;
const historyStorageKey = (clientId: string) =>
  `capot.bankRecon.history.${clientId}`;

function isCashOrBankAccount(a: CoaAccount): boolean {
  const name = String(a.name || '').toLowerCase();
  const type = String(a.type || '').toLowerCase();
  return (
    (type.includes('asset') || !type) &&
    (name.includes('cash') || name.includes('bank') || name.includes('gcash') || name.includes('maya') || name.includes('e-wallet'))
  );
}

export function BankReconciliation() {
  const { currentClient, currentClientId, saveJournalVoucher, showToast } = useAccounting();
  const canExport = usePermission('export_data');
  const canEdit = usePermission('edit_transactions');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const coaAccounts = useMemo(() => {
    if (!currentClient) return [] as CoaAccount[];
    const list = currentClient.accounts && currentClient.accounts.length > 0
      ? currentClient.accounts
      : getDefaultAccountsForIndustry(
          currentClient.industry,
          currentClient.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric'
        );
    return getPostableCoaAccounts(list);
  }, [currentClient]);

  const cashAccounts = useMemo(() => {
    const matched = coaAccounts.filter(isCashOrBankAccount);
    return matched.length > 0 ? matched : coaAccounts;
  }, [coaAccounts]);

  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [statementEndDate, setStatementEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statementBalanceInput, setStatementBalanceInput] = useState('');
  const [activeTab, setActiveTab] = useState<'register' | 'statement' | 'rules' | 'history'>('register');
  const [filterMode, setFilterMode] = useState<'all' | 'cleared' | 'uncleared'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Imported CSV/OFX state
  const [importedTxns, setImportedTxns] = useState<BankTxn[]>([]);
  const [detectedBank, setDetectedBank] = useState('');
  const [importedFileName, setImportedFileName] = useState('');

  // Cleared GL entry IDs (persisted per client + account)
  const [clearedIds, setClearedIds] = useState<Record<string, boolean>>({});
  // Auto-matched map: glEntryId -> bankTxnId
  const [matchedPairs, setMatchedPairs] = useState<Record<string, string>>({});
  // Reconciliation history
  const [history, setHistory] = useState<SavedReconciliation[]>([]);

  // Categorization rules
  const [rules, setRules] = useState<ReconcileRule[]>(DEFAULT_RECONCILE_RULES);
  const [newRuleKeyword, setNewRuleKeyword] = useState('');
  const [newRuleAccount, setNewRuleAccount] = useState('');
  const [newRuleType, setNewRuleType] = useState<'expense' | 'income'>('expense');
  const [recordingTxnId, setRecordingTxnId] = useState<string | null>(null);

  // Pick default Cash/Bank account
  useEffect(() => {
    if (!cashAccounts.length) return;
    if (!selectedAccountId || !cashAccounts.some(a => a.id === selectedAccountId)) {
      const preferred =
        cashAccounts.find(a => /cash in bank/i.test(a.name)) ||
        cashAccounts.find(a => /cash on hand/i.test(a.name)) ||
        cashAccounts[0];
      setSelectedAccountId(preferred?.id || '');
    }
  }, [cashAccounts, selectedAccountId]);

  // Load persisted cleared IDs, rules, and history
  useEffect(() => {
    if (!currentClientId || !selectedAccountId) return;
    try {
      const saved = JSON.parse(localStorage.getItem(clearedStorageKey(currentClientId, selectedAccountId)) || '{}');
      setClearedIds(saved && typeof saved === 'object' ? saved : {});
    } catch {
      setClearedIds({});
    }
  }, [currentClientId, selectedAccountId]);

  useEffect(() => {
    if (!currentClientId) return;
    const savedRules = loadReconcileRules(currentClientId);
    setRules(savedRules.length > 0 ? savedRules : DEFAULT_RECONCILE_RULES);
    try {
      const savedHist = JSON.parse(localStorage.getItem(historyStorageKey(currentClientId)) || '[]');
      setHistory(Array.isArray(savedHist) ? savedHist : []);
    } catch {
      setHistory([]);
    }
  }, [currentClientId]);

  const persistCleared = (next: Record<string, boolean>) => {
    setClearedIds(next);
    if (currentClientId && selectedAccountId) {
      try {
        localStorage.setItem(clearedStorageKey(currentClientId, selectedAccountId), JSON.stringify(next));
      } catch { /* ignore quota */ }
    }
  };

  const selectedCoa = cashAccounts.find(a => a.id === selectedAccountId) || null;
  const selectedGlAccount: GeneralLedgerAccount | null = useMemo(() => {
    if (!currentClient || !selectedAccountId) return null;
    return (currentClient.glAccounts || []).find(
      (g: GeneralLedgerAccount) => String(g.accountId || g.id) === String(selectedAccountId)
    ) || null;
  }, [currentClient, selectedAccountId]);

  const bookEntries: GeneralLedgerEntry[] = useMemo(() => {
    if (!selectedGlAccount) return [];
    return (selectedGlAccount.entries || [])
      .filter(e => {
        const d = entryDateKey(e);
        return !statementEndDate || !d || d <= statementEndDate;
      })
      .slice()
      .sort((a, b) => entryDateKey(a).localeCompare(entryDateKey(b)));
  }, [selectedGlAccount, statementEndDate]);

  const openingBalance = useMemo(() => {
    if (!selectedGlAccount) return 0;
    return glAccountBalanceBefore(selectedGlAccount, '0000-01-01');
  }, [selectedGlAccount]);

  // Metrics
  const stats = useMemo(() => {
    let clearedDr = 0;
    let clearedCr = 0;
    let clearedCount = 0;
    let unclearedDr = 0;
    let unclearedCr = 0;
    let unclearedCount = 0;

    bookEntries.forEach(e => {
      const dr = parseAmt(e.debit);
      const cr = parseAmt(e.credit);
      if (clearedIds[e.id]) {
        clearedDr += dr;
        clearedCr += cr;
        clearedCount++;
      } else {
        unclearedDr += dr;
        unclearedCr += cr;
        unclearedCount++;
      }
    });

    const clearedBookBalance = Math.round((openingBalance + clearedDr - clearedCr) * 100) / 100;
    const bookEndingBalance = Math.round((clearedBookBalance + unclearedDr - unclearedCr) * 100) / 100;
    const unclearedNet = Math.round((unclearedDr - unclearedCr) * 100) / 100;
    const hasStatementBal = statementBalanceInput.trim() !== '' && Number.isFinite(parseFloat(statementBalanceInput));
    const statementEndingBalance = hasStatementBal ? parseFloat(statementBalanceInput) : 0;
    const difference = hasStatementBal
      ? Math.round((statementEndingBalance - clearedBookBalance) * 100) / 100
      : 0;

    return {
      clearedDr, clearedCr, clearedCount,
      unclearedDr, unclearedCr, unclearedCount, unclearedNet,
      clearedBookBalance, bookEndingBalance,
      hasStatementBal, statementEndingBalance, difference,
    };
  }, [bookEntries, clearedIds, openingBalance, statementBalanceInput]);

  const matchedBankIds = useMemo(() => new Set(Object.values(matchedPairs)), [matchedPairs]);

  // Auto-match imported bank lines against book GL entries (exact amount ±0.01, date ±5 days)
  const runAutoMatch = (txns = importedTxns) => {
    if (!txns.length) {
      showToast('Upload a bank CSV or OFX statement first to run auto-matching.');
      return;
    }
    const nextMatched: Record<string, string> = {};
    const nextCleared: Record<string, boolean> = { ...clearedIds };
    const usedBankIds = new Set<string>();
    let matchedCount = 0;

    for (const entry of bookEntries) {
      const entryNet = Math.round((parseAmt(entry.debit) - parseAmt(entry.credit)) * 100) / 100;
      const entryDt = entryDateKey(entry);
      const hit = txns.find(bt =>
        !usedBankIds.has(bt.id) &&
        Math.abs(bt.amount - entryNet) < 0.015 &&
        daysDiff(bt.date, entryDt) <= 5
      );
      if (hit) {
        usedBankIds.add(hit.id);
        nextMatched[entry.id] = hit.id;
        nextCleared[entry.id] = true;
        matchedCount++;
      }
    }

    setMatchedPairs(nextMatched);
    persistCleared(nextCleared);
    showToast(`Auto-matched ${matchedCount} of ${txns.length} statement transaction${txns.length === 1 ? '' : 's'}.`);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseBankStatementDetailed(file.name, text);
      if (!parsed.transactions.length) {
        showToast('No transactions were detected in that file. Check that it has Date and Amount/Debit/Credit columns.');
        return;
      }
      setImportedTxns(parsed.transactions);
      setDetectedBank(parsed.detectedBank);
      setImportedFileName(file.name);
      if (parsed.statementEndDate) setStatementEndDate(parsed.statementEndDate);
      if (typeof parsed.endingBalance === 'number') {
        setStatementBalanceInput(parsed.endingBalance.toFixed(2));
      }
      runAutoMatch(parsed.transactions);
      setActiveTab('statement');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to parse bank statement file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleDownloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_PH_BANK_CSV], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'capotbooks-sample-bank-statement.csv';
    a.click();
    URL.revokeObjectURL(url);
    showToast('Sample PH bank statement CSV downloaded.');
  };

  const handleRecordBankItem = async (txn: BankTxn) => {
    if (!currentClientId || !selectedCoa) return;
    if (!canEdit) {
      showToast('You do not have permission to record transactions.');
      return;
    }
    const ruleMatch = matchTransaction(txn.description, rules);
    const defaultOffset = txn.amount < 0
      ? (coaAccounts.find(a => /bank\s*(charges|fees|service)/i.test(a.name)) ||
         coaAccounts.find(a => /miscellaneous|office/i.test(a.name)) ||
         coaAccounts.find(a => /expense/i.test(String(a.type || ''))))
      : (coaAccounts.find(a => /interest income|other income|sales/i.test(a.name)) ||
         coaAccounts.find(a => /revenue|income/i.test(String(a.type || ''))));

    const ruleCoa = ruleMatch
      ? coaAccounts.find(a => a.name.toLowerCase() === ruleMatch.accountTitle.toLowerCase())
      : undefined;
    const offsetCoa = ruleCoa || defaultOffset;
    if (!offsetCoa) {
      showToast('Could not find an offsetting Chart of Accounts entry.');
      return;
    }

    setRecordingTxnId(txn.id);
    try {
      const absAmt = Math.abs(txn.amount);
      const isInflow = txn.amount >= 0;
      const voucherId = crypto.randomUUID();
      const ref = txn.reference || `RECON-${txn.date.replace(/-/g, '')}`;
      const voucher: JournalVoucher = {
        id: voucherId,
        date: txn.date,
        reference: ref,
        memo: `Bank Reconciliation (${detectedBank || 'Statement'}): ${txn.description}`,
        lines: isInflow
          ? [
              { id: crypto.randomUUID(), accountId: selectedCoa.id, accountName: selectedCoa.name, debit: absAmt, credit: 0 },
              { id: crypto.randomUUID(), accountId: offsetCoa.id, accountName: offsetCoa.name, debit: 0, credit: absAmt },
            ]
          : [
              { id: crypto.randomUUID(), accountId: offsetCoa.id, accountName: offsetCoa.name, debit: absAmt, credit: 0 },
              { id: crypto.randomUUID(), accountId: selectedCoa.id, accountName: selectedCoa.name, debit: 0, credit: absAmt },
            ],
      };
      await saveJournalVoucher(currentClientId, voucher, []);
      showToast(`Recorded "${txn.description}" (${peso(absAmt)}) to ${offsetCoa.name}.`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to record bank item.');
    } finally {
      setRecordingTxnId(null);
    }
  };

  const handleFinishReconciliation = () => {
    if (!currentClientId || !selectedCoa) return;
    if (!stats.hasStatementBal) {
      showToast('Enter the Statement Ending Balance before finishing reconciliation.');
      return;
    }
    const snap: SavedReconciliation = {
      id: crypto.randomUUID(),
      accountId: selectedCoa.id,
      accountName: `${selectedCoa.id} — ${selectedCoa.name}`,
      statementEndDate,
      statementEndingBalance: stats.statementEndingBalance,
      clearedBookBalance: stats.clearedBookBalance,
      clearedCount: stats.clearedCount,
      unclearedCount: stats.unclearedCount,
      difference: stats.difference,
      reconciledAt: new Date().toISOString(),
    };
    const nextHist = [snap, ...history].slice(0, 50);
    setHistory(nextHist);
    try {
      localStorage.setItem(historyStorageKey(currentClientId), JSON.stringify(nextHist));
    } catch { /* ignore */ }
    showToast(
      Math.abs(stats.difference) < 0.01
        ? `Reconciliation saved — ${selectedCoa.name} is balanced (₱0.00 difference).`
        : `Reconciliation snapshot saved with ${signedPeso(stats.difference)} difference.`
    );
  };

  const handleAddRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentClientId || !newRuleKeyword.trim() || !newRuleAccount.trim()) return;
    const next: ReconcileRule[] = [
      ...rules,
      { id: `rule-${Date.now()}`, contains: newRuleKeyword.trim(), accountTitle: newRuleAccount.trim(), type: newRuleType },
    ];
    setRules(next);
    saveReconcileRules(currentClientId, next);
    setNewRuleKeyword('');
    showToast('Auto-categorization rule added.');
  };

  const handleDeleteRule = (id: string) => {
    if (!currentClientId) return;
    const next = rules.filter(r => r.id !== id);
    setRules(next);
    saveReconcileRules(currentClientId, next);
  };

  const handleExportCsv = () => {
    const rows: any[][] = [
      ['Bank Reconciliation Summary'],
      ['Account', selectedCoa ? `${selectedCoa.id} — ${selectedCoa.name}` : ''],
      ['Statement Ending Date', statementEndDate],
      ['Statement Ending Balance', stats.hasStatementBal ? stats.statementEndingBalance.toFixed(2) : ''],
      ['Cleared Book Balance', stats.clearedBookBalance.toFixed(2)],
      ['Difference', stats.difference.toFixed(2)],
      [],
      ['Status', 'Date', 'Particulars', 'Reference', 'Debit', 'Credit'],
      ...bookEntries.map(e => [
        clearedIds[e.id] ? 'Cleared' : 'Uncleared',
        entryDateKey(e),
        e.particularsDr || e.particularsCr || '',
        e.refDr || e.refCr || '',
        e.debit || '',
        e.credit || '',
      ]),
    ];
    generateCSV(`bank-reconciliation-${statementEndDate}.csv`, rows);
  };

  const visibleBookEntries = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return bookEntries.filter(e => {
      const isCleared = Boolean(clearedIds[e.id]);
      if (filterMode === 'cleared' && !isCleared) return false;
      if (filterMode === 'uncleared' && isCleared) return false;
      if (!q) return true;
      const hay = `${entryDateKey(e)} ${e.particularsDr || ''} ${e.particularsCr || ''} ${e.refDr || ''} ${e.refCr || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [bookEntries, clearedIds, filterMode, searchQuery]);

  if (!currentClient || !currentClientId) return null;

  const isReconciled = stats.hasStatementBal && Math.abs(stats.difference) < 0.01;

  return (
    <div className="w-full flex flex-col print-area">
      <PageHeader
        title="Bank Reconciliation"
        icon={<Landmark className="w-5 h-5 text-cyan-600" />}
        actions={
          <div className="flex items-center gap-2 no-print flex-wrap">
            <button
              type="button"
              onClick={handleDownloadSampleCsv}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <FileDown className="w-3.5 h-3.5" /> Sample CSV
            </button>
            <button
              type="button"
              onClick={handleExportCsv}
              disabled={!canExport}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
            >
              <FileDown className="w-3.5 h-3.5" /> Export
            </button>
            <button
              type="button"
              onClick={() => printReportPage('Bank Reconciliation')}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold hover:opacity-90"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
        }
      />

      <div className="p-4 md:p-6 space-y-5 flex-1">
        {/* Controls bar */}
        <div className="no-print grid grid-cols-1 md:grid-cols-12 gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
          <div className="md:col-span-4">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Bank / Cash Account</label>
            <select
              value={selectedAccountId}
              onChange={e => setSelectedAccountId(e.target.value)}
              className="form-input text-sm py-2 w-full"
            >
              {cashAccounts.map(a => (
                <option key={a.id} value={a.id}>{a.id} — {a.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Statement Date</label>
            <input
              type="date"
              value={statementEndDate}
              onChange={e => setStatementEndDate(e.target.value)}
              className="form-input text-sm py-2 w-full"
            />
          </div>
          <div className="md:col-span-3">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">Statement Ending Balance</label>
            <input
              type="number"
              step="0.01"
              value={statementBalanceInput}
              onChange={e => setStatementBalanceInput(e.target.value)}
              placeholder="0.00"
              className="form-input text-sm py-2 w-full font-mono text-right"
            />
          </div>
          <div className="md:col-span-3 flex items-end gap-2">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold shadow-sm transition-colors"
            >
              <Upload className="w-4 h-4" /> Import CSV / OFX
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.ofx,.qbo,.txt"
              className="hidden"
              onChange={handleFileUpload}
            />
          </div>
          {importedFileName && (
            <div className="md:col-span-12 flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                Loaded <strong>{importedFileName}</strong> ({detectedBank}) · <strong>{importedTxns.length}</strong> statement rows
              </span>
              <button
                type="button"
                onClick={() => runAutoMatch()}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs"
              >
                <Wand2 className="w-3.5 h-3.5" /> Re-run Auto-Match
              </button>
            </div>
          )}
        </div>

        {/* 4 Live Reconciliation KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Statement Ending Balance</div>
            <div className="mt-1 text-xl font-black tabular-nums text-slate-900 dark:text-white">
              {stats.hasStatementBal ? signedPeso(stats.statementEndingBalance) : '—'}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">As of {statementEndDate}</div>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Cleared Book Balance</div>
            <div className="mt-1 text-xl font-black tabular-nums text-cyan-600 dark:text-cyan-400">
              {signedPeso(stats.clearedBookBalance)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{stats.clearedCount} cleared item{stats.clearedCount === 1 ? '' : 's'}</div>
          </div>
          <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Uncleared / In-Transit</div>
            <div className="mt-1 text-xl font-black tabular-nums text-slate-700 dark:text-slate-200">
              {signedPeso(stats.unclearedNet)}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">{stats.unclearedCount} uncleared · Book total {signedPeso(stats.bookEndingBalance)}</div>
          </div>
          <div className={`p-4 rounded-2xl border ${isReconciled ? 'border-emerald-300 bg-emerald-50/70 dark:border-emerald-800 dark:bg-emerald-950/30' : stats.hasStatementBal ? 'border-amber-300 bg-amber-50/70 dark:border-amber-800 dark:bg-amber-950/30' : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'}`}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Difference</div>
            <div className={`mt-1 text-xl font-black tabular-nums flex items-center gap-2 ${isReconciled ? 'text-emerald-700 dark:text-emerald-300' : stats.hasStatementBal ? 'text-amber-700 dark:text-amber-300' : 'text-slate-500'}`}>
              {stats.hasStatementBal ? signedPeso(stats.difference) : 'Enter balance'}
              {isReconciled && <CheckCircle2 className="w-5 h-5" />}
              {stats.hasStatementBal && !isReconciled && <AlertTriangle className="w-5 h-5" />}
            </div>
            <div className="mt-2 no-print">
              <button
                type="button"
                onClick={handleFinishReconciliation}
                disabled={!stats.hasStatementBal}
                className="px-3 py-1 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-[11px] font-bold hover:opacity-90 disabled:opacity-40"
              >
                {isReconciled ? 'Finish Reconciliation' : 'Save Snapshot'}
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="no-print flex flex-wrap items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2">
          {([
            ['register', `Book Register (${bookEntries.length})`],
            ['statement', `Imported Statement (${importedTxns.length})`],
            ['rules', `Auto-Rules (${rules.length})`],
            ['history', `History (${history.length})`],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-colors ${
                activeTab === id
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Tab 1: Book Register */}
        {activeTab === 'register' && (
          <div className="space-y-3">
            <div className="no-print flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                {(['all', 'cleared', 'uncleared'] as const).map(mode => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setFilterMode(mode)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize border ${
                      filterMode === mode
                        ? 'bg-slate-900 text-white border-slate-900 dark:bg-white dark:text-slate-900'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    const all: Record<string, boolean> = {};
                    bookEntries.forEach(e => { all[e.id] = true; });
                    persistCleared(all);
                  }}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-cyan-700 dark:text-cyan-400 hover:bg-cyan-50 dark:hover:bg-cyan-950/30"
                >
                  Clear All
                </button>
                <button
                  type="button"
                  onClick={() => persistCleared({})}
                  className="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  Unclear All
                </button>
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Filter particulars or ref…"
                  className="form-input text-xs pl-8 py-1.5 w-full"
                />
              </div>
            </div>

            <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 text-left uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-3 w-12 text-center">Clr</th>
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Particulars</th>
                    <th className="px-3 py-3">Ref</th>
                    <th className="px-3 py-3 text-right">Deposit (Dr)</th>
                    <th className="px-3 py-3 text-right">Withdrawal (Cr)</th>
                    <th className="px-3 py-3 text-center">Match</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {visibleBookEntries.map(entry => {
                    const isCleared = Boolean(clearedIds[entry.id]);
                    const isMatched = Boolean(matchedPairs[entry.id]);
                    return (
                      <tr
                        key={entry.id}
                        onClick={() => persistCleared({ ...clearedIds, [entry.id]: !isCleared })}
                        className={`cursor-pointer transition-colors ${isCleared ? 'bg-emerald-50/40 dark:bg-emerald-950/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'}`}
                      >
                        <td className="px-3 py-2.5 text-center">
                          {isCleared
                            ? <CheckSquare className="w-4 h-4 text-emerald-600 inline" />
                            : <Square className="w-4 h-4 text-slate-300 dark:text-slate-600 inline" />}
                        </td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">{entryDateKey(entry)}</td>
                        <td className="px-3 py-2.5">{entry.particularsDr || entry.particularsCr || '—'}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-500">{entry.refDr || entry.refCr || '—'}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-emerald-700 dark:text-emerald-400">{entry.debit || ''}</td>
                        <td className="px-3 py-2.5 text-right font-mono text-rose-600 dark:text-rose-400">{entry.credit || ''}</td>
                        <td className="px-3 py-2.5 text-center">
                          {isMatched ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">Matched</span>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {visibleBookEntries.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                        No ledger entries found for {selectedCoa?.name || 'this account'} up to {statementEndDate}.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Tab 2: Imported Statement Lines */}
        {activeTab === 'statement' && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            {importedTxns.length === 0 ? (
              <div className="p-10 text-center space-y-3">
                <Upload className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-sm font-bold text-slate-700 dark:text-slate-200">No bank statement imported yet</div>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Upload a BDO, BPI, UnionBank, Metrobank, GCash, or Maya CSV (or an OFX/QBO file) to auto-match cleared book entries and record unrecorded bank charges or deposits in one click.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold"
                  >
                    <Upload className="w-3.5 h-3.5" /> Choose Statement File
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadSampleCsv}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                  >
                    <FileDown className="w-3.5 h-3.5" /> Download Sample CSV
                  </button>
                </div>
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 text-left uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-3">Date</th>
                    <th className="px-3 py-3">Description</th>
                    <th className="px-3 py-3">Ref</th>
                    <th className="px-3 py-3 text-right">Amount</th>
                    <th className="px-3 py-3">Suggested Account</th>
                    <th className="px-3 py-3 text-center">Status / Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {importedTxns.map(txn => {
                    const isMatched = matchedBankIds.has(txn.id);
                    const suggested = matchTransaction(txn.description, rules);
                    return (
                      <tr key={txn.id} className={isMatched ? 'bg-emerald-50/30 dark:bg-emerald-950/10' : ''}>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono">{txn.date}</td>
                        <td className="px-3 py-2.5">{txn.description}</td>
                        <td className="px-3 py-2.5 whitespace-nowrap font-mono text-slate-500">{txn.reference || '—'}</td>
                        <td className={`px-3 py-2.5 text-right font-mono font-bold ${txn.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                          {signedPeso(txn.amount)}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600 dark:text-slate-300">
                          {suggested ? (
                            <span className="inline-flex items-center gap-1 text-[11px] text-cyan-700 dark:text-cyan-300 font-semibold">
                              <Sparkles className="w-3 h-3" /> {suggested.accountTitle}
                            </span>
                          ) : (
                            <span className="text-slate-400">Auto-default</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-center">
                          {isMatched ? (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                              Matched & Cleared
                            </span>
                          ) : (
                            <button
                              type="button"
                              disabled={!canEdit || recordingTxnId === txn.id}
                              onClick={() => handleRecordBankItem(txn)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold disabled:opacity-50"
                            >
                              {recordingTxnId === txn.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                              Record in Books
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* Tab 3: Auto-Categorization Rules */}
        {activeTab === 'rules' && (
          <div className="space-y-4">
            <form onSubmit={handleAddRule} className="grid grid-cols-1 md:grid-cols-12 gap-3 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-slate-500 mb-1">Description Contains</label>
                <input
                  type="text"
                  value={newRuleKeyword}
                  onChange={e => setNewRuleKeyword(e.target.value)}
                  placeholder="e.g. MERALCO, PLDT, BANK CHARGE"
                  className="form-input text-xs py-2 w-full"
                  required
                />
              </div>
              <div className="md:col-span-4">
                <label className="block text-xs font-bold text-slate-500 mb-1">Map to COA Account</label>
                <select
                  value={newRuleAccount}
                  onChange={e => setNewRuleAccount(e.target.value)}
                  className="form-input text-xs py-2 w-full"
                  required
                >
                  <option value="">Select account…</option>
                  {coaAccounts.map(a => (
                    <option key={a.id} value={a.name}>{a.id} — {a.name}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 mb-1">Type</label>
                <select
                  value={newRuleType}
                  onChange={e => setNewRuleType(e.target.value as 'expense' | 'income')}
                  className="form-input text-xs py-2 w-full"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>
              <div className="md:col-span-2 flex items-end">
                <button type="submit" className="w-full py-2 px-3 rounded-xl bg-cyan-600 hover:bg-cyan-700 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Add Rule
                </button>
              </div>
            </form>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
              {rules.map(rule => (
                <div key={rule.id} className="px-4 py-3 flex items-center justify-between gap-3 text-xs">
                  <div>
                    <span className="font-mono font-bold text-cyan-700 dark:text-cyan-400">"{rule.contains}"</span>
                    <span className="mx-2 text-slate-400">→</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{rule.accountTitle}</span>
                    <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] uppercase bg-slate-100 dark:bg-slate-800 text-slate-500">{rule.type}</span>
                  </div>
                  <button type="button" onClick={() => handleDeleteRule(rule.id)} className="p-1.5 text-slate-400 hover:text-rose-600 rounded">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Tab 4: Saved Reconciliation History */}
        {activeTab === 'history' && (
          <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            {history.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No reconciliation snapshots saved yet.</div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-slate-950 text-left uppercase tracking-wider text-slate-500">
                    <th className="px-3 py-3">Account</th>
                    <th className="px-3 py-3">Statement Date</th>
                    <th className="px-3 py-3 text-right">Statement Bal</th>
                    <th className="px-3 py-3 text-right">Cleared Book</th>
                    <th className="px-3 py-3 text-right">Difference</th>
                    <th className="px-3 py-3">Saved At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {history.map(h => (
                    <tr key={h.id}>
                      <td className="px-3 py-2.5 font-semibold">{h.accountName}</td>
                      <td className="px-3 py-2.5 font-mono">{h.statementEndDate}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{signedPeso(h.statementEndingBalance)}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{signedPeso(h.clearedBookBalance)}</td>
                      <td className={`px-3 py-2.5 text-right font-mono font-bold ${Math.abs(h.difference) < 0.01 ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {signedPeso(h.difference)}
                      </td>
                      <td className="px-3 py-2.5 text-slate-400">{new Date(h.reconciledAt).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
