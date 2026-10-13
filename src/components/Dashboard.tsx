import { useEffect, useId, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { TrendingUp, ShoppingBag, DollarSign, Wallet, ArrowDownLeft, ArrowUpRight, RefreshCw, ArrowUp, ArrowDown, FileText, FolderUp, FileSignature, LineChart as LineChartIcon, ChevronRight } from 'lucide-react';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, AreaChart, Area, ReferenceLine,
} from 'recharts';
import { useAccounting } from '../context/AccountingContext';
import type { GeneralLedgerAccount } from '../types';
import { glAccountCurrentBalance, glAccountBalanceBefore, getProfitAndLossForPeriod, getMonthlyPnL } from '../lib/accountingBalances';
import { forecastCashFlow, compactMoney } from '../lib/cashFlowForecast';
import { cn } from '../lib/utils';

type PeriodKey = 'this-month' | 'last-month' | 'this-quarter' | 'this-year' | 'last-year';

const PERIOD_OPTIONS: { key: PeriodKey; label: string }[] = [
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'this-quarter', label: 'Quarter' },
  { key: 'this-year', label: 'YTD' },
  { key: 'last-year', label: 'Last year' },
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

type Accent = 'success' | 'danger' | 'brand' | 'info' | 'warning';
const ACCENT: Record<Accent, { tile: string; stroke: string }> = {
  success: { tile: 'bg-success-500/10 text-success-600 dark:text-emerald-400', stroke: '#10b981' },
  danger:  { tile: 'bg-danger-500/10 text-danger-600 dark:text-rose-400',     stroke: '#ef4444' },
  brand:   { tile: 'bg-brand-500/10 text-brand-600 dark:text-brand-300',      stroke: '#3b82f6' },
  info:    { tile: 'bg-info-500/10 text-info-600 dark:text-cyan-400',         stroke: '#06b6d4' },
  warning: { tile: 'bg-warning-500/10 text-warning-600 dark:text-amber-400',  stroke: '#f59e0b' },
};

/** Tracks the app's `.dark` class so chart colours (SVG attrs) follow the theme. */
function useIsDark() {
  const [dark, setDark] = useState(() => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const el = document.documentElement;
    const obs = new MutationObserver(() => setDark(el.classList.contains('dark')));
    obs.observe(el, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

function Sparkline({ data, stroke }: { data: number[]; stroke: string }) {
  const id = useId();
  if (data.length < 2 || data.every(v => !v)) {
    return <div className="h-10 flex items-end"><div className="w-full border-t border-dashed border-border" /></div>;
  }
  const w = 120, h = 40, pad = 3;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const xy = data.map((v, i) => [pad + (i / (data.length - 1)) * (w - pad * 2), h - pad - ((v - min) / range) * (h - pad * 2)] as const);
  const line = xy.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${pad},${h} ${line} ${w - pad},${h}`;
  const [lx, ly] = xy[xy.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-10" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${id})`} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="2.5" fill={stroke} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function DeltaChip({ delta, invert = false }: { delta: number | null; invert?: boolean }) {
  if (delta === null) return <span className="text-xs text-text-muted">No prior data</span>;
  const good = invert ? delta <= 0 : delta >= 0;
  const Arrow = delta >= 0 ? ArrowUp : ArrowDown;
  return (
    <span className={cn('inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold tabular-nums',
      good ? 'bg-success-500/10 text-success-600 dark:text-emerald-400' : 'bg-danger-500/10 text-danger-600 dark:text-rose-400')}>
      <Arrow className="w-3 h-3" strokeWidth={3} />
      {Math.abs(delta).toFixed(1)}%
    </span>
  );
}

const tooltipFormatter = (value: number) => money(value);

export function Dashboard() {
  const { currentClient, navigateToPage, setHistoryTab, syncData } = useAccounting();
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState<PeriodKey>('this-year');
  const isDark = useIsDark();

  const chart = {
    grid: isDark ? '#334155' : '#e2e8f0',
    tick: isDark ? '#94a3b8' : '#64748b',
    income: '#10b981',
    expense: isDark ? '#f87171' : '#ef4444',
    net: isDark ? '#60a5fa' : '#2563eb',
    cash: isDark ? '#22d3ee' : '#0891b2',
  };
  const tooltipStyle = {
    contentStyle: {
      borderRadius: 12, fontSize: 12, padding: '8px 12px',
      background: isDark ? '#1e293b' : '#ffffff', color: isDark ? '#f1f5f9' : '#0f172a',
      border: `1px solid ${isDark ? '#334155' : '#e2e8f0'}`, boxShadow: '0 10px 24px -4px rgb(15 23 42 / 0.18)',
    },
    labelStyle: { fontWeight: 700, marginBottom: 4 },
    cursor: { fill: isDark ? 'rgb(148 163 184 / 0.08)' : 'rgb(100 116 139 / 0.06)' },
  };

  const range = useMemo(() => periodRange(period), [period]);
  const monthly = useMemo(() => (currentClient ? getMonthlyPnL(currentClient, 6) : []), [currentClient, refreshKey]);
  const trendData = useMemo(() => monthly.map(m => ({ month: m.label, Income: m.revenue, Expenses: m.expenses, Net: m.revenue - m.expenses })), [monthly]);
  const hasTrend = trendData.some(d => d.Income || d.Expenses);

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

  type KpiCard = {
    label: string; value: number; prev: number; icon: typeof TrendingUp; page: string; historyTab?: 'income' | 'expenses';
    delta: number | null; spark?: number[]; accent: Accent; invertDelta?: boolean; negative?: boolean; hint: string;
  };
  const performance = useMemo<KpiCard[]>(() => [
    { label: 'Revenue', value: metrics.revenue, prev: metrics.prevRevenue, icon: TrendingUp, page: 'history', historyTab: 'income', delta: pctDelta(metrics.revenue, metrics.prevRevenue), spark: monthly.map(m => m.revenue), accent: 'success', hint: 'Open income history' },
    { label: 'Expenses', value: metrics.expenses, prev: metrics.prevExpenses, icon: ShoppingBag, page: 'history', historyTab: 'expenses', delta: pctDelta(metrics.expenses, metrics.prevExpenses), spark: monthly.map(m => m.expenses), accent: 'danger', invertDelta: true, hint: 'Open expense history' },
    { label: metrics.netIncome >= 0 ? 'Net income' : 'Net loss', value: Math.abs(metrics.netIncome), prev: Math.abs(metrics.prevNet), icon: DollarSign, page: 'pl', delta: pctDelta(metrics.netIncome, metrics.prevNet), spark: monthly.map(m => m.revenue - m.expenses), accent: 'brand', negative: metrics.netIncome < 0, hint: 'Open Profit & Loss' },
  ], [metrics, monthly]);

  const position = useMemo<KpiCard[]>(() => [
    { label: 'Cash balance', value: metrics.cash, prev: metrics.prevCash, icon: Wallet, page: 'cashflow', delta: pctDelta(metrics.cash, metrics.prevCash), accent: 'info', hint: 'Open Cash Flow' },
    { label: 'Accounts receivable', value: metrics.ar, prev: metrics.prevAr, icon: ArrowDownLeft, page: 'balancesheet', delta: pctDelta(metrics.ar, metrics.prevAr), accent: 'warning', hint: 'Open Balance Sheet' },
    { label: 'Accounts payable', value: metrics.ap, prev: metrics.prevAp, icon: ArrowUpRight, page: 'balancesheet', delta: pctDelta(metrics.ap, metrics.prevAp), accent: 'warning', invertDelta: true, hint: 'Open Balance Sheet' },
  ], [metrics]);

  const quickActions = [
    { label: 'New invoice', icon: FileText, page: 'billing' },
    { label: 'New bill', icon: ShoppingBag, page: 'purchases' },
    { label: 'Upload receipt', icon: FolderUp, page: 'files' },
    { label: 'Journal entry', icon: FileSignature, page: 'journal-voucher' },
  ];

  const handleRefresh = () => { setRefreshKey(v => v + 1); try { void syncData?.(); } catch { /* ignore */ } };
  const open = (card: { page?: string; historyTab?: 'income' | 'expenses' }) => {
    if (!card.page) return;
    if (card.historyTab) setHistoryTab(card.historyTab);
    navigateToPage(card.page);
  };

  const renderCard = (card: KpiCard, index: number) => {
    const Icon = card.icon;
    const a = ACCENT[card.accent];
    return (
      <motion.button
        key={card.label} type="button" onClick={() => open(card)} title={card.hint}
        initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: index * 0.04 }}
        className="card-surface group flex flex-col text-left p-5 transition-all hover:-translate-y-0.5 hover:shadow-pop hover:border-brand-300 dark:hover:border-brand-700 focus-visible:outline-brand-500"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className={cn('w-8 h-8 rounded-lg flex items-center justify-center shrink-0', a.tile)}><Icon className="w-4 h-4" /></span>
            <span className="text-sm font-semibold text-text-secondary truncate">{card.label}</span>
          </div>
          <ChevronRight className="w-4 h-4 text-text-muted opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all shrink-0" />
        </div>
        <div className={cn('mt-4 text-[1.75rem] leading-none font-extrabold tracking-tight tabular-nums truncate', card.negative ? 'text-danger-600 dark:text-rose-400' : 'text-text-primary')}>
          {card.negative && '−'}{money(card.value)}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs text-text-muted">
          <DeltaChip delta={card.delta} invert={card.invertDelta} />
          <span className="truncate">vs prior · {money(card.prev)}</span>
        </div>
        {card.spark && <div className="mt-4 pt-1"><Sparkline data={card.spark} stroke={a.stroke} /></div>}
      </motion.button>
    );
  };

  const projected = forecastData[forecastData.length - 1]?.projected || 0;
  const projectedChange = projected - metrics.cash;

  return (
    <div className="space-y-6 pb-6">
      {/* Header */}
      <div className="sticky-page-title flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold tracking-tight text-text-primary">Dashboard</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            {range.label} compared with the prior period. Matches your Profit &amp; Loss and General Ledger.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="tablist" aria-label="Reporting period" className="flex items-center rounded-xl border border-border bg-surface p-1 gap-0.5 overflow-x-auto max-w-full">
            {PERIOD_OPTIONS.map(opt => (
              <button key={opt.key} type="button" role="tab" aria-selected={period === opt.key} onClick={() => setPeriod(opt.key)}
                className={cn('px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap',
                  period === opt.key ? 'bg-brand-600 text-white shadow-sm' : 'text-text-secondary hover:bg-surface-subtle')}>
                {opt.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={handleRefresh} aria-label="Refresh data" title="Refresh data"
            className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-surface text-sm font-semibold text-text-secondary hover:bg-surface-subtle transition-colors">
            <RefreshCw className="w-4 h-4" /> <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Quick actions */}
      <section aria-label="Quick actions" className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-text-muted mr-1">Quick actions</span>
        {quickActions.map(qa => (
          <button key={qa.page} type="button" onClick={() => navigateToPage(qa.page)}
            className="group inline-flex items-center gap-2 h-9 pl-2.5 pr-3.5 rounded-full border border-border bg-surface text-sm font-semibold text-text-secondary hover:border-brand-400 hover:text-brand-700 dark:hover:text-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10 transition-colors">
            <qa.icon className="w-4 h-4 text-brand-600 dark:text-brand-300" />
            {qa.label}
          </button>
        ))}
      </section>

      {/* Performance */}
      <section aria-labelledby="dash-performance" className="space-y-3">
        <h2 id="dash-performance" className="text-xs font-bold uppercase tracking-wider text-text-muted">Performance · {range.label}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {performance.map(renderCard)}
        </div>
      </section>

      {/* Position */}
      <section aria-labelledby="dash-position" className="space-y-3">
        <h2 id="dash-position" className="text-xs font-bold uppercase tracking-wider text-text-muted">Financial position · as of today</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {position.map((c, i) => renderCard(c, i + 3))}
        </div>
      </section>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <section className="lg:col-span-2 card-surface p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
                <LineChartIcon className="w-4 h-4 text-brand-600 dark:text-brand-300" /> Income vs Expenses
              </h3>
              <p className="text-xs text-text-muted mt-0.5">Last 6 months, with net income trend</p>
            </div>
          </div>
          {hasTrend ? (
            <div style={{ height: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={trendData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barGap={4}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 12, fill: chart.tick }} axisLine={false} tickLine={false} />
                  <YAxis tickFormatter={compactMoney} tick={{ fontSize: 11, fill: chart.tick }} axisLine={false} tickLine={false} width={56} />
                  <ReferenceLine y={0} stroke={chart.grid} />
                  <Tooltip formatter={tooltipFormatter} {...tooltipStyle} />
                  <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                  <Bar dataKey="Income" fill={chart.income} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Bar dataKey="Expenses" fill={chart.expense} radius={[4, 4, 0, 0]} maxBarSize={28} />
                  <Line type="monotone" dataKey="Net" stroke={chart.net} strokeWidth={2.5} dot={{ r: 3, strokeWidth: 2, fill: isDark ? '#0f172a' : '#fff' }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-[280px] flex flex-col items-center justify-center rounded-xl border border-dashed border-border text-center px-6">
              <LineChartIcon className="w-8 h-8 text-text-muted mb-2" />
              <p className="text-sm font-semibold text-text-secondary">No income or expenses yet</p>
              <p className="text-xs text-text-muted mt-1">Post an invoice, bill or journal entry and your trend will appear here.</p>
            </div>
          )}
        </section>

        <section className="card-surface p-5 flex flex-col">
          <div className="mb-4">
            <h3 className="text-base font-bold text-text-primary flex items-center gap-2">
              <Wallet className="w-4 h-4 text-info-600 dark:text-cyan-400" /> Cash flow forecast
            </h3>
            <p className="text-xs text-text-muted mt-0.5">3-month projection from average monthly net</p>
          </div>
          <div style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={forecastData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="cashGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={chart.cash} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={chart.cash} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: chart.tick }} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={compactMoney} tick={{ fontSize: 11, fill: chart.tick }} axisLine={false} tickLine={false} width={52} />
                <Tooltip formatter={tooltipFormatter} {...tooltipStyle} />
                <Area type="monotone" dataKey="projected" name="Projected cash" stroke={chart.cash} strokeWidth={2.5} fill="url(#cashGrad)" dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <dl className="mt-auto pt-4 space-y-2 text-sm">
            <div className="flex items-center justify-between border-t border-border pt-3">
              <dt className="text-text-muted">Starting cash</dt>
              <dd className="font-bold text-text-primary tabular-nums">{money(metrics.cash)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-muted">Projected in 3 months</dt>
              <dd className="font-bold text-info-600 dark:text-cyan-400 tabular-nums">{money(projected)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="text-text-muted">Expected change</dt>
              <dd className={cn('font-bold tabular-nums', projectedChange >= 0 ? 'text-success-600 dark:text-emerald-400' : 'text-danger-600 dark:text-rose-400')}>
                {projectedChange >= 0 ? '+' : '−'}{money(Math.abs(projectedChange))}
              </dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
