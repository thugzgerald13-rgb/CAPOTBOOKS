import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ShoppingBag, DollarSign, Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import type { GeneralLedgerAccount } from '../types';
import { getProfitAndLossTotals, glAccountCurrentBalance } from '../lib/accountingBalances';

type DashboardMetrics = {
  revenue: number;
  expenses: number;
  netIncome: number;
  cash: number;
  ar: number;
  ap: number;
  year: number;
};

const money = (value: number) => `₱${(Number(value) || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const normalize = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');

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

export function Dashboard() {
  const { currentClient, navigateToPage, setHistoryTab, syncData } = useAccounting();
  const [refreshKey, setRefreshKey] = useState(0);

  const metrics = useMemo<DashboardMetrics>(() => {
    void refreshKey;
    const year = new Date().getFullYear();
    if (!currentClient) {
      return { revenue: 0, expenses: 0, netIncome: 0, cash: 0, ar: 0, ap: 0, year };
    }

    // Revenue / expenses / net income come from the exact same calculation
    // as the Profit & Loss report, so the dashboard always agrees with it.
    const pl = getProfitAndLossTotals(currentClient);
    const revenue = pl.revenueTotal;
    const expenses = pl.costTotal + pl.expenseTotal;
    const netIncome = pl.netIncome;

    // Cash / AR / AP balances come from the exact same running-balance
    // formula as the General Ledger page, so they always agree with it.
    let cash = 0;
    let ar = 0;
    let ap = 0;
    for (const account of currentClient.glAccounts || []) {
      if (accountIsType(account, 'Asset')) {
        const balance = glAccountCurrentBalance(account);
        if (isCashAccount(account)) cash += balance;
        if (isArAccount(account)) ar += balance;
      }
      if (accountIsType(account, 'Liability')) {
        const balance = glAccountCurrentBalance(account);
        if (isApAccount(account)) ap -= balance;
      }
    }

    return {
      revenue: Math.max(0, revenue),
      expenses: Math.max(0, expenses),
      netIncome,
      cash: Math.max(0, cash),
      ar: Math.max(0, ar),
      ap: Math.max(0, ap),
      year: pl.year,
    };
  }, [currentClient, refreshKey]);

  const cards = useMemo(() => [
    { label: `Revenue (YTD ${metrics.year})`, value: metrics.revenue, icon: TrendingUp, page: 'history', historyTab: 'income' as const },
    { label: `Expenses (YTD ${metrics.year})`, value: metrics.expenses, icon: ShoppingBag, page: 'history', historyTab: 'expenses' as const },
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
            Revenue, expenses, and net income come from the Profit &amp; Loss report; cash, accounts receivable, and accounts payable come from the General Ledger. Click any card to open its details.
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
