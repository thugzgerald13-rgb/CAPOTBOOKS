import { useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ShoppingBag, DollarSign, Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw } from 'lucide-react';
import { useAccounting } from '../context/AccountingContext';
import { supabase } from '../lib/supabase';

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

const accountName = (value: unknown) =>
  String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');

const toNumber = (value: unknown) => {
  const n = Number(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

export function Dashboard() {
  const { currentClientId } = useAccounting();
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
    if (!currentClientId) {
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

      // Use the same authoritative PostgreSQL account-balance function already
      // used by Trial Balance / General Ledger. The old dashboard depended on a
      // separate get_server_dashboard_metrics RPC which is not present in the
      // deployed schema.
      const [balancesResult, purchasesResult, salesResult] = await Promise.all([
        supabase.rpc('get_server_account_balances', {
          p_client_id: currentClientId,
          p_start_date: start,
          p_end_date: end,
        }),
        supabase
          .from('purchases')
          .select('id,date,supplier_name,invoice_no,amount')
          .eq('client_id', currentClientId)
          .order('date', { ascending: false })
          .limit(5),
        supabase
          .from('sales')
          .select('id,date,buyer_name,ref,amount')
          .eq('client_id', currentClientId)
          .order('date', { ascending: false })
          .limit(5),
      ]);

      if (balancesResult.error) throw balancesResult.error;
      if (purchasesResult.error) throw purchasesResult.error;
      if (salesResult.error) throw salesResult.error;

      let revenue = 0;
      let expenses = 0;
      let cash = 0;
      let ar = 0;
      let ap = 0;

      for (const row of balancesResult.data || []) {
        const type = String(row.account_type || '').trim().toLowerCase();
        const name = accountName(row.account_name);
        const balance = toNumber(row.balance);
        const periodDebit = toNumber(row.period_debit);
        const periodCredit = toNumber(row.period_credit);

        if (type === 'revenue') {
          revenue += Math.max(0, periodCredit - periodDebit);
        }

        if (type === 'cost' || type === 'costs' || type === 'expense' || type === 'expenses') {
          expenses += Math.max(0, periodDebit - periodCredit);
        }

        if (['asset', 'assets'].includes(type)) {
          if (
            name === 'cash' ||
            name.includes('cash on hand') ||
            name.includes('cash in bank') ||
            name.includes('bank account') ||
            name.includes('bank')
          ) {
            cash += Math.max(0, balance);
          }

          if (name === 'accounts receivable' || name === 'account receivable' || name.includes('accounts receivable')) {
            ar += Math.max(0, balance);
          }
        }

        if (['liability', 'liabilities'].includes(type)) {
          if (name === 'accounts payable' || name === 'account payable' || name.includes('accounts payable')) {
            ap += Math.max(0, -balance);
          }
        }
      }

      setMetrics({
        revenue,
        expenses,
        netIncome: revenue - expenses,
        cash,
        ar,
        ap,
      });

      const purchases: RecentTransaction[] = (purchasesResult.data || []).map((row: any) => ({
        id: `purchase-${row.id}`,
        date: row.date || '',
        description: row.supplier_name || row.invoice_no || 'Purchase',
        type: 'Purchase',
        amount: toNumber(row.amount),
      }));

      const sales: RecentTransaction[] = (salesResult.data || []).map((row: any) => ({
        id: `sale-${row.id}`,
        date: row.date || '',
        description: row.buyer_name || row.ref || 'Sale',
        type: 'Sale',
        amount: toNumber(row.amount),
      }));

      setRecent(
        [...purchases, ...sales]
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .slice(0, 5)
      );
    } catch (e: any) {
      console.error('Dashboard load failed:', e);
      const message = e?.message || e?.details || e?.hint || 'Unable to load dashboard.';
      setError(String(message));
      setRecent([]);
      setMetrics({ revenue: 0, expenses: 0, netIncome: 0, cash: 0, ar: 0, ap: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadDashboard();
  }, [currentClientId]);

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
