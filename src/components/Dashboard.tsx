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

type ServerBalance = {
  account_id: string;
  account_name: string;
  account_type: string;
  balance: number;
  period_debit: number;
  period_credit: number;
};

const money = (amount: number) =>
  new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

const getMonthRange = () => {
  const now = new Date();
  return {
    start: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    end: isoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
  };
};

const normal = (v: unknown) => String(v || '').trim().toLowerCase();

function calculateMetrics(balances: ServerBalance[]): DashboardMetrics {
  let revenue = 0;
  let expenses = 0;
  let cash = 0;
  let ar = 0;
  let ap = 0;

  for (const account of balances) {
    const type = normal(account.account_type);
    const name = normal(account.account_name);
    const balance = Number(account.balance || 0);
    const periodDebit = Number(account.period_debit || 0);
    const periodCredit = Number(account.period_credit || 0);

    if (type === 'revenue') {
      revenue += Math.max(0, periodCredit - periodDebit);
    }

    if (type === 'expense' || type === 'expenses' || type === 'cost' || type === 'costs') {
      expenses += Math.max(0, periodDebit - periodCredit);
    }

    // Cash is intentionally identified by account name rather than account
    // type because many COAs classify cash/bank as generic "Asset".
    if (
      name.includes('cash on hand') ||
      name === 'cash' ||
      name.includes('cash in bank') ||
      name.includes('bank account') ||
      name.includes('checking account') ||
      name.includes('savings account')
    ) {
      cash += balance;
    }

    if (
      name.includes('accounts receivable') ||
      name === 'trade receivable' ||
      name === 'trade receivables'
    ) {
      ar += Math.max(0, balance);
    }

    if (
      name.includes('accounts payable') ||
      name === 'trade payable' ||
      name === 'trade payables'
    ) {
      ap += Math.max(0, -balance);
    }
  }

  return {
    revenue,
    expenses,
    netIncome: revenue - expenses,
    cash,
    ar,
    ap,
  };
}

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
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { start, end } = getMonthRange();

      // Dashboard metrics are server-side. The dashboard never downloads the
      // client's transaction history into React just to calculate summary cards.
      const [monthlyResult, endingResult, purchasesResult, salesResult] = await Promise.all([
        supabase.rpc('get_account_balances', {
          p_client_id: currentClientId,
          p_start_date: start,
          p_end_date: end,
        }),
        supabase.rpc('get_account_balances', {
          p_client_id: currentClientId,
          p_start_date: '1900-01-01',
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

      if (monthlyResult.error) throw monthlyResult.error;
      if (endingResult.error) throw endingResult.error;
      if (purchasesResult.error) throw purchasesResult.error;
      if (salesResult.error) throw salesResult.error;

      const monthlyMetrics = calculateMetrics((monthlyResult.data || []) as ServerBalance[]);
      const endingMetrics = calculateMetrics((endingResult.data || []) as ServerBalance[]);

      setMetrics({
        ...monthlyMetrics,
        cash: endingMetrics.cash,
        ar: endingMetrics.ar,
        ap: endingMetrics.ap,
      });

      const purchases: RecentTransaction[] = (purchasesResult.data || []).map((row: any) => ({
        id: `purchase-${row.id}`,
        date: row.date || '',
        description: row.supplier_name || row.invoice_no || 'Purchase',
        type: 'Purchase',
        amount: Number(row.amount || 0),
      }));

      const sales: RecentTransaction[] = (salesResult.data || []).map((row: any) => ({
        id: `sale-${row.id}`,
        date: row.date || '',
        description: row.buyer_name || row.ref || 'Sale',
        type: 'Sale',
        amount: Number(row.amount || 0),
      }));

      setRecent(
        [...purchases, ...sales]
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .slice(0, 5)
      );
    } catch (e) {
      console.error('Dashboard load failed:', e);
      setError(e instanceof Error ? e.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDashboard();
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
            Server-side summaries for the selected client.
          </p>
        </div>
        <button
          type="button"
          onClick={loadDashboard}
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
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Only the latest 5 records are requested.</p>
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
