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

type RecentTransaction = {
  id: string;
  date: string;
  description: string;
  type: 'Sale' | 'Purchase';
  amount: number;
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

const entryDate = (entry: any) => String(entry?.dateDr || entry?.dateCr || '');

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
  const { currentClient } = useAccounting();
  const [refreshKey, setRefreshKey] = useState(0);

  const metrics = useMemo<DashboardMetrics>(() => {
    void refreshKey;

    if (!currentClient) {
      return { revenue: 0, expenses: 0, netIncome: 0, cash: 0, ar: 0, ap: 0 };
    }

    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth();
    let revenue = 0;
    let expenses = 0;
    let cash = 0;
    let ar = 0;
    let ap = 0;

    for (const account of currentClient.glAccounts || []) {
      const type = normalize(account.accountType);
      const periodEntries = (account.entries || []).filter(entry => {
        const date = entryDate(entry);
        if (!date) return false;
        const parsed = new Date(`${date}T00:00:00`);
        return !Number.isNaN(parsed.getTime()) && parsed.getFullYear() === year && parsed.getMonth() === month;
      });

      const periodDebit = periodEntries.reduce((sum, entry) => sum + toNumber(entry.debit), 0);
      const periodCredit = periodEntries.reduce((sum, entry) => sum + toNumber(entry.credit), 0);

      if (type === 'revenue' || type === 'income') {
        revenue += periodCredit - periodDebit;
      } else if (type === 'cost' || type === 'costs' || type === 'expense' || type === 'expenses') {
        expenses += periodDebit - periodCredit;
      }

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

  const recent = useMemo<RecentTransaction[]>(() => {
    void refreshKey;
    if (!currentClient) return [];

    const purchases: RecentTransaction[] = (currentClient.purchases || []).map((row: any) => ({
      id: `purchase-${row.id}`,
      date: row.date || row.purchaseDate || row.purchase_date || '',
      description: row.supplierName || row.supplier || row.invoiceNo || row.invoice_no || 'Purchase',
      type: 'Purchase',
      amount: toNumber(row.amount ?? row.total),
    }));

    const sales: RecentTransaction[] = (currentClient.sales || []).map((row: any) => ({
      id: `sale-${row.id}`,
      date: row.date || '',
      description: row.buyerName || row.customerName || row.ref || 'Sale',
      type: 'Sale',
      amount: toNumber(row.amount),
    }));

    return [...purchases, ...sales]
      .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      .slice(0, 5);
  }, [currentClient, refreshKey]);

  const cards = useMemo(() => [
    { label: 'Revenue this month', value: metrics.revenue, icon: TrendingUp },
    { label: 'Expenses this month', value: metrics.expenses, icon: ShoppingBag },
    { label: metrics.netIncome >= 0 ? 'Net income' : 'Net loss', value: Math.abs(metrics.netIncome), icon: DollarSign },
    { label: 'Cash balance', value: metrics.cash, icon: Wallet },
    { label: 'Accounts receivable', value: metrics.ar, icon: ArrowDownLeft },
    { label: 'Accounts payable', value: metrics.ap, icon: ArrowUpRight },
  ], [metrics]);

  const handleRefresh = () => setRefreshKey(value => value + 1);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Live summaries from the selected client's synchronized General Ledger.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200"
        >
          <RefreshCw className="w-4 h-4" />
          Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon }, index) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.04 }}
            className="bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700"
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

      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <h2 className="font-bold text-slate-900 dark:text-white">Recent transactions</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Only the latest 5 records are shown.</p>
        </div>

        {recent.length === 0 ? (
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400">No recent transactions.</div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-700">
            {recent.map((item) => (
              <div key={item.id} className="px-5 py-3 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{item.description}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">
                    {item.date || 'No date'} · {item.type}
                  </div>
                </div>
                <div className="font-mono text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">
                  {money(item.amount)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
