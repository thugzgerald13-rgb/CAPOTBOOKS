import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ShoppingBag, DollarSign, Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';

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

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const money = (value: number) => `₱${(Number(value) || 0).toLocaleString(undefined, {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})}`;

const numberValue = (value: unknown) => {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const accountBalance = (account: any) => {
  const entries = Array.isArray(account?.entries) ? account.entries : [];
  const movement = entries.reduce(
    (total: number, entry: any) =>
      total + numberValue(entry?.debit) - numberValue(entry?.credit),
    0
  );

  const opening = numberValue(account?.openingBalance);
  const normalSide = String(account?.normalSide || '').toLowerCase();

  // Opening balances are stored as unsigned amounts plus their normal side.
  // Convert them to the same debit-minus-credit sign used by GL entries.
  const signedOpening =
    normalSide === 'credit' ? -Math.abs(opening) : Math.abs(opening);

  return signedOpening + movement;
};

const normalizedAccountName = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');

const amountForPeriod = (account: any, start: string, end: string) => {
  const entries = Array.isArray(account?.entries) ? account.entries : [];

  return entries
    .filter((entry: any) => {
      const date = String(entry?.date || entry?.dateDr || entry?.dateCr || '').slice(0, 10);
      return date >= start && date < end;
    })
    .reduce(
      (totals: { debit: number; credit: number }, entry: any) => ({
        debit: totals.debit + numberValue(entry?.debit),
        credit: totals.credit + numberValue(entry?.credit),
      }),
      { debit: 0, credit: 0 }
    );
};

export function Dashboard() {
  const { currentClient, currentClientId } = useAccounting();
  const [metrics, setMetrics] = useState<DashboardMetrics>({
    revenue: 0,
    expenses: 0,
    netIncome: 0,
    cash: 0,
    ar: 0,
    ap: 0,
  });
  const [recent, setRecent] = useState<RecentTransaction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDashboard = async () => {
    if (!currentClientId || !currentClient) {
      setRecent([]);
      setMetrics({ revenue: 0, expenses: 0, netIncome: 0, cash: 0, ar: 0, ap: 0 });
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const now = new Date();
      const start = isoDate(new Date(now.getFullYear(), now.getMonth(), 1));
      const end = isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 1));
      const accounts = Array.isArray(currentClient.glAccounts) ? currentClient.glAccounts : [];

      let revenue = 0;
      let costs = 0;
      let expenses = 0;
      let cash = 0;
      let ar = 0;
      let ap = 0;

      accounts.forEach((account: any) => {
        const name = normalizedAccountName(account.accountTitle);
        const type = String(account.accountType || '').trim().toLowerCase();
        const period = amountForPeriod(account, start, end);

        if (type === 'revenue') {
          revenue += Math.max(0, period.credit - period.debit);
        }

        if (type === 'cost' || type === 'costs') {
          costs += Math.max(0, period.debit - period.credit);
        }

        if (type === 'expense' || type === 'expenses') {
          expenses += Math.max(0, period.debit - period.credit);
        }

        const balance = accountBalance(account);

        if (
          ['asset', 'assets'].includes(type) &&
          (name === 'cash' ||
            name.includes('cash on hand') ||
            name.includes('cash in bank') ||
            name.includes('bank account') ||
            name.includes('bank'))
        ) {
          cash += Math.max(0, balance);
        }

        if (
          ['asset', 'assets'].includes(type) &&
          (name === 'accounts receivable' ||
            name === 'account receivable' ||
            name.includes('accounts receivable'))
        ) {
          ar += Math.max(0, balance);
        }

        if (
          ['liability', 'liabilities'].includes(type) &&
          (name === 'accounts payable' ||
            name === 'account payable' ||
            name.includes('accounts payable'))
        ) {
          ap += Math.max(0, -balance);
        }
      });

      setMetrics({
        revenue,
        expenses: costs + expenses,
        netIncome: revenue - costs - expenses,
        cash,
        ar,
        ap,
      });

      const purchases: RecentTransaction[] = (Array.isArray(currentClient.purchases) ? currentClient.purchases : [])
        .map((row: any) => ({
          id: `purchase-${row.id}`,
          date: row.date || '',
          description: row.supplierName || row.invoiceNo || 'Purchase',
          type: 'Purchase',
          amount: numberValue(row.amount),
        }));

      const sales: RecentTransaction[] = (Array.isArray(currentClient.sales) ? currentClient.sales : [])
        .map((row: any) => ({
          id: `sale-${row.id}`,
          date: row.date || '',
          description: row.buyerName || row.ref || 'Sale',
          type: 'Sale',
          amount: numberValue(row.amount),
        }));

      setRecent(
        [...purchases, ...sales]
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .slice(0, 5)
      );
    } catch (e) {
      console.error('Dashboard load failed:', e);
      setError(e instanceof Error ? e.message : 'Unable to load dashboard.');
      setRecent([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [currentClientId, currentClient]);

  const cards = useMemo(() => [
    { label: 'Revenue this month', value: metrics.revenue, icon: TrendingUp },
    { label: 'Expenses this month', value: metrics.expenses, icon: ShoppingBag },
    { label: metrics.netIncome >= 0 ? 'Net income' : 'Net loss', value: metrics.netIncome, icon: DollarSign },
    { label: 'Cash balance', value: metrics.cash, icon: Wallet },
    { label: 'Accounts receivable', value: metrics.ar, icon: ArrowDownLeft },
    { label: 'Accounts payable', value: metrics.ap, icon: ArrowUpRight },
  ], [metrics]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Live summaries from the selected client's normalized accounting data.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadDashboard()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 dark:bg-rose-950/20 dark:border-rose-900 p-4 text-sm text-rose-700 dark:text-rose-300">
          Dashboard data could not be loaded: {error}
        </div>
      )}

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
            <div className="mt-3 text-2xl font-extrabold text-slate-900 dark:text-white">
              {loading ? 'Loading…' : money(value)}
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
          <div className="p-6 text-sm text-slate-500 dark:text-slate-400">
            {loading ? 'Loading recent transactions…' : 'No recent transactions.'}
          </div>
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
                <div className="font-bold text-sm text-slate-900 dark:text-white whitespace-nowrap">
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
