import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ShoppingBag, DollarSign, Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import type { GeneralLedgerAccount } from '../types';

type DashboardMetrics = {
  revenue: number;
  expenses: number;
  netIncome: number;
  cash: number;
  ar: number;
  ap: number;
};

const money = (value: number) => `₱${(Number(value) || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const normalize = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');

const toNumber = (value: unknown) => {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const accountBalance = (account: GeneralLedgerAccount) => {
  const opening = toNumber(account.openingBalance);
  const openingSigned = account.normalSide === 'credit' ? -opening : opening;
  return openingSigned + (account.entries || []).reduce((sum, entry) => {
    return sum + toNumber(entry.debit) - toNumber(entry.credit);
  }, 0);
};

const accountIsType = (account: GeneralLedgerAccount, ...types: string[]) => {
  const type = normalize(account.accountType);
  return types.some(t => type === normalize(t));
};

const isCashAccount = (account: GeneralLedgerAccount) => {
  const name = normalize(account.accountTitle);
  return name === 'cash' || name.includes('cash on hand') || name.includes('cash in bank') ||
    name.includes('bank account') || name === 'bank' || name.endsWith(' bank');
};

const isArAccount = (account: GeneralLedgerAccount) => {
  const name = normalize(account.accountTitle);
  return name === 'accounts receivable' || name === 'account receivable' || name.includes('accounts receivable');
};

const isApAccount = (account: GeneralLedgerAccount) => {
  const name = normalize(account.accountTitle);
  return name === 'accounts payable' || name === 'account payable' || name.includes('accounts payable');
};

const inCurrentMonth = (dateStr: unknown, year: number, month: number) => {
  const s = String(dateStr ?? '').trim();
  if (!s) return false;
  const d = new Date(`${s}T00:00:00`);
  return !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
};

export function Dashboard() {
  const { currentClient, navigateToPage, setHistoryTab, syncData } = useAccounting();
  const [refreshKey, setRefreshKey] = useState(0);

  const metrics = useMemo<DashboardMetrics>(() => {
    void refreshKey;
    if (!currentClient) {
      return { revenue: 0, expenses: 0, netIncome: 0, cash: 0, ar: 0, ap: 0 };
    }
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();

    // Profit & Loss figures (revenue / expenses / net income) come from the
    // synchronized General Ledger — exactly like the Profit & Loss report —
    // not from raw sales/purchases records, so the dashboard always agrees
    // with the books. Each income/expense account's current-month activity
    // is summed on its normal side, matching the P&L report's calculation.
    let revenue = 0;
    let costTotal = 0;
    let expenseTotal = 0;
    for (const account of currentClient.glAccounts || []) {
      const type = normalize(account.accountType);
      const isRevenue = type === 'revenue';
      const isCost = type === 'cost' || type === 'costs';
      const isExpense = type === 'expense' || type === 'expenses';
      if (!isRevenue && !isCost && !isExpense) continue;
      let monthDebit = 0;
      let monthCredit = 0;
      for (const entry of account.entries || []) {
        const dateStr = entry.dateDr || entry.dateCr || '';
        if (!inCurrentMonth(dateStr, year, month)) continue;
        monthDebit += toNumber(entry.debit);
        monthCredit += toNumber(entry.credit);
      }
      if (isRevenue) revenue += Math.max(0, monthCredit - monthDebit);
      if (isCost) costTotal += Math.max(0, monthDebit - monthCredit);
      if (isExpense) expenseTotal += Math.max(0, monthDebit - monthCredit);
    }
    const expenses = costTotal + expenseTotal;

    // Cash / AR / AP are taken from the synchronized General Ledger when
    // available; otherwise they remain 0 rather than guessing.
    let cash = 0;
    let ar = 0;
    let ap = 0;
    for (const account of currentClient.glAccounts || []) {
      if (accountIsType(account, 'Asset')) {
        const balance = accountBalance(account);
        if (isCashAccount(account)) cash += balance;
        if (isArAccount(account)) ar += balance;
      }
      if (accountIsType(account, 'Liability')) {
        const balance = accountBalance(account);
        if (isApAccount(account)) ap -= balance;
      }
    }

    return {
      revenue: Math.max(0, revenue),
      expenses: Math.max(0, expenses),
      netIncome: revenue - expenses,
      cash: Math.max(0, cash),
      ar: Math.max(0, ar),
      ap: Math.max(0, ap),
    };
  }, [currentClient, refreshKey]);

  const cards = useMemo(() => [
    { label: 'Revenue this month', value: metrics.revenue, icon: TrendingUp, page: 'history', historyTab: 'income' as const },
    { label: 'Expenses this month', value: metrics.expenses, icon: ShoppingBag, page: 'history', historyTab: 'expenses' as const },
    { label: metrics.netIncome >= 0 ? 'Net income' : 'Net loss', value: Math.abs(metrics.netIncome), icon: DollarSign, page: 'pl' },
    { label: 'Cash balance', value: metrics.cash, icon: Wallet, page: 'cashflow' },
    { label: 'Accounts receivable', value: metrics.ar, icon: ArrowDownLeft, page: 'balancesheet' },
    { label: 'Accounts payable', value: metrics.ap, icon: ArrowUpRight, page: 'balancesheet' },
  ], [metrics]);

  const handleRefresh = () => {
    setRefreshKey(value => value + 1);
    try { void syncData?.(); } catch { /* ignore */ }
  };

  const handleCardClick = (card: { page?: string; historyTab?: 'income' | 'expenses' }) => {
    if (!card.page) return;
    if (card.historyTab) setHistoryTab(card.historyTab);
    navigateToPage(card.page);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Live summaries from the selected client's General Ledger. Click any card to open its details.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, page, historyTab }, index) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            onClick={() => handleCardClick({ page, historyTab })}
            className={`bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all ${page ? 'cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 hover:-translate-y-0.5' : ''}`}
            title={page ? 'Click to view details' : undefined}
          >
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-semibold text-xs tracking-wider uppercase">
              <Icon className="w-4 h-4" />
              {label}
            </div>
            <div className={`mt-3 text-2xl font-extrabold ${label === 'Net loss' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              {money(value)}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
