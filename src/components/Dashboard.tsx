import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ShoppingBag, DollarSign, Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw, ArrowUp, ArrowDown, FileText, FolderUp, FileSignature, LineChart as LineChartIcon } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area,
} from 'recharts';
import { useAccounting } from '../context/AccountingContext';
import type { GeneralLedgerAccount } from '../types';
import { glAccountCurrentBalance, glAccountBalanceBefore, getProfitAndLossForPeriod, getMonthlyPnL } from '../lib/accountingBalances';
import { forecastCashFlow, compactMoney } from '../lib/cashFlowForecast';
import { cn } from '../lib/utils';

type PeriodKey = 'this-month' | 'last-month' | 'this-quarter' | 'this-year' | 'last-year';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'this-month', label: 'This Month' },
  { key: 'last-month', label: 'Last Month' },
  { key: 'this-quarter', label: 'This Quarter' },
  { key: 'this-year', label: 'This Year (YTD)' },
  { key: 'last-year', label: 'Last Year' },
];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function periodRange(key: PeriodKey): { start: string; end: string; priorStart: string; priorEnd: string; label: string } {
  const now = new Date();
  const y = now.getFullYear(), m = now.getMonth();
  const startOf = (yy: number, mm: number) => new Date(yy, mm, 1);
  switch (key) {
    case 'this-month': {
      const s = startOf(y, m), e = startOf(y, m + 1);
      const ps = startOf(y, m - 1), pe = startOf(y, m);
      return { start: iso(s), end: iso(e), priorStart: iso(ps), priorEnd: iso(pe), label: 'This month' };
    }
    case 'last-month': {
      const s = startOf(y, m - 1), e = startOf(y, m);
      const ps = startOf(y, m - 2), pe = startOf(y, m - 1);
      return { start: iso(s), end: iso(e), priorStart: iso(ps), priorEnd: iso(pe), label: 'Last month' };
    }
    case 'this-quarter': {
      const q = Math.floor(m / 3);
      const s = startOf(y, q * 3), e = startOf(y, q * 3 + 3);
      const ps = startOf(y, q * 3 - 3), pe = startOf(y, q * 3);
      return { start: iso(s), end: iso(e), priorStart: iso(ps), priorEnd: iso(pe), label: 'This quarter' };
    }
    case 'last-year': {
      const s = startOf(y - 1, 0), e = startOf(y, 0);
      const ps = startOf(y - 2, 0), pe = startOf(y - 1, 0);
      return { start: iso(s), end: iso(e), priorStart: iso(ps), priorEnd: iso(pe), label: 'Last year' };
    }
    case 'this-year':
    default: {
      const s = startOf(y, 0), e = iso(new Date(y, m, now.getDate() + 1));
      const ps = startOf(y - 1, 0), pe = iso(new Date(y - 1, m, now.getDate() + 1));
      return { start: iso(s), end: e, priorStart: iso(ps), priorEnd: pe, label: 'This year (YTD)' };
    }
  }
}

const money = (value: number) => `₱${(Number(value) || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pctDelta = (cur: number, prev: number) => (!prev ? null : ((cur - prev) / Math.abs(prev)) * 100);

const normalize = (value: unknown) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
const accountIsType = (account: GeneralLedgerAccount, ...types: string[]) => types.some(t => normalize(account.accountType) === normalize(t));
const isCashAccount = (a: GeneralLedgerAccount) => { const n = normalize(a.accountTitle); return n === 'cash' || n.includes('cash on hand') || n.includes('cash in bank') || n.includes('bank account') || n === 'bank' || n.endsWith(' bank'); };
const isArAccount = (a: GeneralLedgerAccount) => { const n = normalize(a.accountTitle); return n === 'accounts receivable' || n === 'account receivable' || n.includes('accounts receivable'); };
const isApAccount = (a: GeneralLedgerAccount) => { const n = normalize(a.accountTitle); return n === 'accounts payable' || n === 'account payable' || n.includes('accounts payable'); };

function Sparkline({ data, stroke = '#2563eb' }: { data: number[]; stroke?: string }) {
  if (!data.length || data.every(v => !v)) return <div className="h-8" />;
  const w = 120, h = 32, pad = 2;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = pad + (i / Math.max(data.length - 1, 1)) * (w - pad * 2);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="w-full h-8" preserveAspectRatio="none" aria-hidden="true">
      <polyline points={pts} fill="none" stroke={stroke} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) return <span className="text-xs text-text-muted">—</span>;
  const up = delta >= 0;
  return (
    <span className={cn('inline-flex items-center gap-0.5 text-xs font-bold', up ? 'text-success-600' : 'text-danger-600')}>
      {up ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />}
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

const tooltipFormatter = (value: number) => [money(value), ''];

export function Dashboard() {
  const { currentClient, navigateToPage, setHistoryTab, syncData } = useAccounting();
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState<PeriodKey>('this-year');

  const range = useMemo(() => periodRange(period), [period]);
  const monthly = useMemo(() => (currentClient ? getMonthlyPnL(currentClient, 6) : []), [currentClient, refreshKey]);
  const trendData = useMemo(() => monthly.map(m => ({ month: m.label, Income: m.revenue, Expenses: m.expenses, Net: m.revenue - m.expenses })), [monthly]);

  const metrics = useMemo(() => {
    void refreshKey;
    if (!currentClient) {
      return { revenue: 0, expenses: 0, netIncome: 0, cash: 0, ar: 0, ap: 0, prevRevenue: 0, prevExpenses: 0, prevNet: 0, prevCash: 0, prevAr: 0, prevAp: 0 };
    }
    const cur = getProfitAndLossForPeriod(currentClient, range.start, range.end);
    const prev = getProfitAndLossForPeriod(currentClient, range.priorStart, range.priorEnd);
    let cash = 0, ar = 0, ap = 0, prevCash = 0, prevAr = 0, prevAp = 0;
    for (const account of currentClient.glAccounts || []) {
      if (accountIsType(account, 'Asset')) {
        const bal = glAccountCurrentBalance(account);
        const prevBal = glAccountBalanceBefore(account, range.priorEnd);
        if (isCashAccount(account)) { cash += bal; prevCash += prevBal; }
        if (isArAccount(account)) { ar += bal; prevAr += prevBal; }
      }
      if (accountIsType(account, 'Liability')) {
        const bal = glAccountCurrentBalance(account);
        const prevBal = glAccountBalanceBefore(account, range.priorEnd);
        if (isApAccount(account)) { ap -= bal; prevAp -= prevBal; }
      }
    }
    return {
      revenue: Math.max(0, cur.revenueTotal), expenses: Math.max(0, cur.costTotal + cur.expenseTotal), netIncome: cur.netIncome,
      cash: Math.max(0, cash), ar: Math.max(0, ar), ap: Math.max(0, ap),
      prevRevenue: Math.max(0, prev.revenueTotal), prevExpenses: Math.max(0, prev.costTotal + prev.expenseTotal), prevNet: prev.netIncome,
      prevCash: Math.max(0, prevCash), prevAr: Math.max(0, prevAr), prevAp: Math.max(0, prevAp),
    };
  }, [currentClient, refreshKey, range]);

  const forecastData = useMemo(() => forecastCashFlow({
    startingCash: metrics.cash,
    monthlyNet: monthly.map(m => m.revenue - m.expenses),
    monthsAhead: 3,
  }), [metrics.cash, monthly]);

  const cards = useMemo(() => [
    { label: 'Revenue', value: metrics.revenue, icon: TrendingUp, page: 'history', historyTab: 'income' as const, delta: pctDelta(metrics.revenue, metrics.prevRevenue), spark: monthly.map(m => m.revenue), stroke: '#059669', accent: 'success' as const },
    { label: 'Expenses', value: metrics.expenses, icon: ShoppingBag, page: 'history', historyTab: 'expenses' as const, delta: pctDelta(metrics.expenses, metrics.prevExpenses), spark: monthly.map(m => m.expenses), stroke: '#dc2626', accent: 'danger' as const, invertDelta: true },
    { label: metrics.netIncome >= 0 ? 'Net income' : 'Net loss', value: Math.abs(metrics.netIncome), icon: DollarSign, page: 'pl', delta: pctDelta(metrics.netIncome, metrics.prevNet), spark: monthly.map(m => m.revenue - m.expenses), stroke: '#2563eb', accent: 'brand' as const },
    { label: 'Cash balance', value: metrics.cash, icon: Wallet, page: 'cashflow', delta: pctDelta(metrics.cash, metrics.prevCash), accent: 'info' as const },
    { label: 'Accounts receivable', value: metrics.ar, icon: ArrowDownLeft, page: 'balancesheet', delta: pctDelta(metrics.ar, metrics.prevAr), accent: 'warning' as const },
    { label: 'Accounts payable', value: metrics.ap, icon: ArrowUpRight, page: 'balancesheet', delta: pctDelta(metrics.ap, metrics.prevAp), accent: 'warning' as const },
  ], [metrics, monthly]);

  const quickActions = [
    { label: 'New Invoice', icon: FileText, page: 'billing' },
    { label: 'New Bill', icon: ShoppingBag, page: 'purchases' },
    { label: 'Upload Receipt', icon: FolderUp, page: 'files' },
    { label: 'Journal Entry', icon: FileSignature, page: 'journal-voucher' },
  ];

  const handleRefresh = () => { setRefreshKey(v => v + 1); try { void syncData?.(); } catch { /* ignore */ } };
  const handleCardClick = (card: { page?: string; historyTab?: 'income' | 'expenses' }) => {
    if (!card.page) return;
    if (card.historyTab) setHistoryTab(card.historyTab);
    navigateToPage(card.page);
  };

  return (
    <div className="space-y-6">
      <div className="sticky-page-title flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white">Dashboard</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {range.label} · vs prior comparable period · Figures agree with the Profit &amp; Loss and General Ledger reports. Click any card to open its details.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-1 gap-0.5">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.key} type="button" onClick={() => setPeriod(opt.key)}
                className={cn('px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap',
                  period === opt.key ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700')}>
                {opt.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={handleRefresh}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Quick actions (Run 005 / T005) */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {quickActions.map(qa => (
          <button key={qa.page} type="button" onClick={() => navigateToPage(qa.page)}
            className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-sm transition-all text-left group">
            <span className="w-9 h-9 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-300 flex items-center justify-center group-hover:bg-blue-600 group-hover:text-white transition-colors shrink-0">
              <qa.icon className="w-4 h-4" />
            </span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{qa.label}</span>
          </button>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
        {cards.map(({ label, value, icon: Icon, page, historyTab, delta, spark, stroke, accent, invertDelta }, index) => {
          const shownDelta = invertDelta && delta !== null ? -delta : delta;
          return (
            <motion.div key={label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
              onClick={() => handleCardClick({ page, historyTab })}
              className={cn('relative overflow-hidden bg-white dark:bg-slate-800 p-5 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 transition-all',
                page ? 'cursor-pointer hover:shadow-md hover:border-blue-300 dark:hover:border-blue-700 hover:-translate-y-0.5' : '')}
              title={page ? 'Click to view details' : undefined}>
              <div className={cn('absolute inset-x-0 top-0 h-1', accent === 'success' && 'bg-success-500', accent === 'danger' && 'bg-danger-500', accent === 'brand' && 'bg-brand-500', accent === 'info' && 'bg-info-500', accent === 'warning' && 'bg-warning-500')} />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 font-semibold text-xs tracking-wider uppercase">
                  <Icon className="w-4 h-4" /> {label}
                </div>
                <DeltaChip delta={shownDelta} />
              </div>
              <div className={cn('mt-3 text-2xl font-extrabold tabular-nums', label === 'Net loss' ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white')}>
                {money(value)}
              </div>
              {spark && <div className="mt-3 -mx-1"><Sparkline data={spark} stroke={stroke} /></div>}
              {delta !== null && <div className="mt-1.5 text-[11px] text-slate-400 dark:text-slate-500">vs prior period · {delta >= 0 ? 'up' : 'down'} {Math.abs(delta).toFixed(1)}%</div>}
            </motion.div>
          );
        })}
      </div>

      {/* Charts row (Run 005 / T005): income vs expense trend + cash-flow forecast */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <LineChartIcon className="w-4 h-4 text-blue-600" /> Income vs Expenses
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Last 6 months · net income line</p>
            </div>
          </div>
          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compactMoney} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={56} />
                <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Income" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="Expenses" fill="#ef4444" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Line type="monotone" dataKey="Net" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-700 p-5">
          <div className="mb-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wallet className="w-4 h-4 text-cyan-600" /> Cash Flow Forecast
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">3-month projection · avg monthly net trend</p>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compactMoney} tick={{ fontSize: 11, fill: '#64748b' }} axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={tooltipFormatter} contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12 }} />
                <Area type="monotone" dataKey="projected" name="Projected cash" stroke="#06b6d4" strokeWidth={2.5} fill="url(#cashGrad)" dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Starting cash</span>
            <span className="font-bold text-slate-900 dark:text-white tabular-nums">{money(metrics.cash)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs">
            <span className="text-slate-500 dark:text-slate-400">Projected in 3 months</span>
            <span className="font-bold text-cyan-600 dark:text-cyan-400 tabular-nums">{money(forecastData[forecastData.length - 1]?.projected || 0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
