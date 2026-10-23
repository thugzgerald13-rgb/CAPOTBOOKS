import { Client, CoaAccount, GeneralLedgerAccount, GeneralLedgerEntry } from '../types';
import { getNormalSide, getDefaultAccountsForIndustry, glOpeningBalance, isNominalAccountType } from './journalDefaults';

export interface AccountBalance {
  account: CoaAccount;
  debit: number;
  credit: number;
  balance: number;
  currentYearDebit: number;
  currentYearCredit: number;
  currentYearBalance: number;
}

const num = (v: any) => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const n = parseFloat(String(v ?? '').replace(/,/g, '').replace(/[₱P()]/g, '').trim());
  if (!Number.isFinite(n)) return 0;
  return String(v).includes('(') ? -Math.abs(n) : n;
};

function entryYear(date: string): number | null {
  if (!date) return null;
  const m = String(date).match(/(?:^|[-/])(\d{4})(?:[-/]|$)/);
  if (m) return Number(m[1]);
  const d = new Date(date);
  return Number.isNaN(d.getTime()) ? null : d.getFullYear();
}

export function getCurrentYear(client: Client): number {
  const years = (client.glAccounts || []).flatMap(g =>
    (g.entries || []).flatMap(e => [entryYear(e.dateDr), entryYear(e.dateCr)])
  ).filter((y): y is number => y !== null);
  return years.length ? Math.max(...years) : new Date().getFullYear();
}

export function getCoaAccounts(client: Client): CoaAccount[] {
  const list = client.accounts && client.accounts.length > 0
    ? client.accounts
    : getDefaultAccountsForIndustry(client.industry, client.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric');
  return list.filter(a => !a.hidden);
}

export function getAccountBalances(client: Client, year = getCurrentYear(client)): AccountBalance[] {
  const gl = client.glAccounts || [];
  return getCoaAccounts(client).map(account => {
    const g = gl.find(x => x.accountId === account.id || x.id === account.id);
    const opening = glOpeningBalance(account);
    const normal = account.normalSide || getNormalSide(account.type || '');
    let debit = normal === 'debit' ? opening : 0;
    let credit = normal === 'credit' ? opening : 0;
    let currentYearDebit = 0;
    let currentYearCredit = 0;

    (g?.entries || []).forEach(e => {
      const d = num(e.debit);
      const c = num(e.credit);
      debit += d;
      credit += c;
      if (entryYear(e.dateDr) === year) currentYearDebit += d;
      if (entryYear(e.dateCr) === year) currentYearCredit += c;
    });

    const balance = debit - credit;
    const currentYearBalance = (normal === 'debit' ? opening : -opening) + currentYearDebit - currentYearCredit;
    return { account, debit, credit, balance, currentYearDebit, currentYearCredit, currentYearBalance };
  });
}

/**
 * Returns the automatic, up-to-date ending balance for a single Chart of
 * Accounts entry, derived entirely from that account's opening balance plus
 * every General Ledger entry posted to it. Because it always recomputes from
 * the live General Ledger (rather than reading a stored value), the Chart of
 * Accounts' Running Balance column stays in sync automatically whenever
 * entries are added, edited, or removed in the General Ledger.
 */
export function balanceFor(client: Client, accountId: string): AccountBalance | undefined {
  const account = getCoaAccounts(client).find(a => a.id === accountId)
    || (client.accounts || []).find(a => a.id === accountId);
  if (!account) return undefined;

  const gl = client.glAccounts || [];
  const g = gl.find(x => x.accountId === account.id || x.id === account.id);
  const opening = glOpeningBalance(account);
  const normal = account.normalSide || getNormalSide(account.type || '');
  let debit = normal === 'debit' ? opening : 0;
  let credit = normal === 'credit' ? opening : 0;
  let currentYearDebit = 0;
  let currentYearCredit = 0;
  const year = getCurrentYear(client);

  (g?.entries || []).forEach(e => {
    const d = num(e.debit);
    const c = num(e.credit);
    debit += d;
    credit += c;
    if (entryYear(e.dateDr) === year) currentYearDebit += d;
    if (entryYear(e.dateCr) === year) currentYearCredit += c;
  });

  const balance = debit - credit;
  const currentYearBalance = (normal === 'debit' ? opening : -opening) + currentYearDebit - currentYearCredit;
  return { account, debit, credit, balance, currentYearDebit, currentYearCredit, currentYearBalance };
}

export function getRunningBalances(client: Client, account: CoaAccount): { entryId: string; debit: number; credit: number; balance: number }[] {
  const gl = client.glAccounts || [];
  const g = gl.find(x => x.accountId === account.id || x.id === account.id);
  const normal = account.normalSide || getNormalSide(account.type || '');
  let running = (normal === 'debit' ? 1 : -1) * glOpeningBalance(account);
  return (g?.entries || []).map(e => {
    const d = num(e.debit);
    const c = num(e.credit);
    running += d - c;
    return { entryId: e.id, debit: d, credit: c, balance: running };
  });
}

export function formatAccountAmount(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return n < 0 ? `(${abs})` : abs;
}

// ---------------------------------------------------------------------------
// Profit & Loss — single source of truth
// ---------------------------------------------------------------------------
// The Profit & Loss report and anywhere else that needs revenue/expense/net
// income (e.g. the Dashboard) must show the exact same figures. Both call
// this function instead of computing their own totals, so the two pages can
// never drift apart.

export interface ProfitAndLossAccountLine {
  account_id: string;
  account_name: string;
  account_type: string;
  period_debit: number;
  period_credit: number;
  period_balance: number;
  balance: number;
}

export interface ProfitAndLossTotals {
  year: number;
  balances: ProfitAndLossAccountLine[];
  revenue: ProfitAndLossAccountLine[];
  costs: ProfitAndLossAccountLine[];
  expenses: ProfitAndLossAccountLine[];
  revenueTotal: number;
  costTotal: number;
  expenseTotal: number;
  grossIncome: number;
  netIncome: number;
}

/**
 * Computes the Profit & Loss report's account lines and totals for a given
 * fiscal year (defaults to the client's current year), straight from the
 * synchronized General Ledger. This is the exact calculation shown on the
 * Profit & Loss page — reuse it anywhere revenue, expenses, or net income
 * need to be displayed so the figures always agree with that report.
 */
export function getProfitAndLossTotals(client: Client, year = getCurrentYear(client)): ProfitAndLossTotals {
  // Financial statements must use the SAME year-end balances shown by the
  // Trial Balance.  getAccountBalances() includes each account's opening
  // balance plus the current-year General Ledger movements, so an account
  // with an opening balance is included even when it has no journal entries.
  const accountBalances = getAccountBalances(client, year);
  const balances: ProfitAndLossAccountLine[] = accountBalances
    .filter(({ account }) =>
      ['revenue', 'other income', 'cost', 'costs', 'expense', 'expenses', 'other expense'].includes(
        String(account.type || '').toLowerCase()
      )
    )
    .map(({ account, currentYearDebit, currentYearCredit, currentYearBalance }) => ({
      account_id: String(account.id),
      account_name: String(account.name || ''),
      account_type: String(account.type || ''),
      period_debit: currentYearDebit,
      period_credit: currentYearCredit,
      period_balance: currentYearDebit - currentYearCredit,
      // This is the Trial Balance ending balance for the selected year.
      balance: currentYearBalance,
    }));

  const revenue = balances.filter(x =>
    ['revenue', 'other income'].includes((x.account_type || '').toLowerCase())
  );
  const costs = balances.filter(x => ['cost', 'costs'].includes((x.account_type || '').toLowerCase()));
  const expenses = balances.filter(x =>
    ['expense', 'expenses', 'other expense'].includes((x.account_type || '').toLowerCase())
  );

  // Credit-normal P&L accounts have positive ending amounts when their
  // signed TB balance is negative; debit-normal costs/expenses are positive.
  const revenueTotal = revenue.reduce((n, x) => n + Math.max(0, -x.balance), 0);
  const costTotal = costs.reduce((n, x) => n + Math.max(0, x.balance), 0);
  const expenseTotal = expenses.reduce((n, x) => n + Math.max(0, x.balance), 0);
  const grossIncome = revenueTotal - costTotal;
  const netIncome = grossIncome - expenseTotal;

  return { year, balances, revenue, costs, expenses, revenueTotal, costTotal, expenseTotal, grossIncome, netIncome };
}

// ---------------------------------------------------------------------------
// Period-filtered P&L (Run 004 / T004) — arbitrary date range + monthly series
// ---------------------------------------------------------------------------
// Same exact math as getProfitAndLossTotals but over any [start, endExclusive)
// ISO date window. Powers the Dashboard's period selector, period-over-period
// deltas, and monthly sparklines. Figures always agree with the P&L report.
export interface PeriodPnL {
  revenueTotal: number;
  costTotal: number;
  expenseTotal: number;
  netIncome: number;
}

export function getProfitAndLossForPeriod(client: Client, startISO: string, endExclusiveISO: string): PeriodPnL {
  const balances = (client.glAccounts || []).map((account: any) => {
    const entries = Array.isArray(account.entries) ? account.entries : [];
    const periodEntries = entries.filter((entry: any) => {
      const d = String(entry.date || entry.dateDr || entry.dateCr || '').slice(0, 10);
      return d >= startISO && d < endExclusiveISO;
    });
    const period_debit = periodEntries.reduce((n: number, e: any) => n + Number(String(e.debit ?? '').replace(/,/g, '') || 0), 0);
    const period_credit = periodEntries.reduce((n: number, e: any) => n + Number(String(e.credit ?? '').replace(/,/g, '') || 0), 0);
    return { account_type: String(account.accountType || ''), period_debit, period_credit };
  });
  const revenueTotal = balances.filter(x => ['revenue', 'other income'].includes(x.account_type.toLowerCase()))
    .reduce((n, x) => n + Math.max(0, x.period_credit - x.period_debit), 0);
  const costTotal = balances.filter(x => ['cost', 'costs'].includes(x.account_type.toLowerCase()))
    .reduce((n, x) => n + Math.max(0, x.period_debit - x.period_credit), 0);
  const expenseTotal = balances.filter(x => ['expense', 'expenses', 'other expense'].includes(x.account_type.toLowerCase()))
    .reduce((n, x) => n + Math.max(0, x.period_debit - x.period_credit), 0);
  return { revenueTotal, costTotal, expenseTotal, netIncome: revenueTotal - costTotal - expenseTotal };
}

/** Monthly revenue/expenses for the last `monthsBack` months (oldest first) —
 *  used for Dashboard sparklines. End month is the current (partial) month. */
export function getMonthlyPnL(client: Client, monthsBack = 6): { label: string; revenue: number; expenses: number }[] {
  const now = new Date();
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const out: { label: string; revenue: number; expenses: number }[] = [];
  for (let i = monthsBack - 1; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
    const p = getProfitAndLossForPeriod(client, iso(start), iso(end));
    out.push({ label: start.toLocaleString('en-US', { month: 'short' }), revenue: p.revenueTotal, expenses: p.costTotal + p.expenseTotal });
  }
  return out;
}

// ---------------------------------------------------------------------------
// General Ledger — single source of truth for account running balances
// ---------------------------------------------------------------------------
// The General Ledger page and anywhere else that needs a live account
// balance (e.g. the Dashboard's Accounts Receivable / Accounts Payable
// cards) must agree exactly, so they share this same balance formula.

const entryDateKey = (entry: Pick<GeneralLedgerEntry, 'dateDr' | 'dateCr'>) =>
  String(entry.dateDr || entry.dateCr || '').slice(0, 10);

const glAmount = (value: unknown) => {
  const n = parseFloat(String(value ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/**
 * Returns a General Ledger account's running balance from its opening
 * balance plus every entry dated strictly before `cutoffDateExclusive`
 * (format `YYYY-MM-DD`). This mirrors the General Ledger page's own
 * beginning/ending balance math exactly. The opening balance is placed on
 * its normal side (a credit-normal account's opening balance is entered as
 * a plain positive amount but represents a credit, so it is applied as
 * negative here) — matching the sign convention used by the General
 * Ledger's own balance formatting and the Chart of Accounts' Running
 * Balance column.
 */
export function glAccountBalanceBefore(account: GeneralLedgerAccount, cutoffDateExclusive: string): number {
  const openingRaw = isNominalAccountType(account.accountType) ? 0 : glAmount(account.openingBalance);
  const opening = account.normalSide === 'credit' ? -openingRaw : openingRaw;
  return (account.entries || []).reduce((total, entry) => {
    const d = entryDateKey(entry);
    if (!(d && d < cutoffDateExclusive)) return total;
    return total + glAmount(entry.debit) - glAmount(entry.credit);
  }, opening);
}

/**
 * Returns a General Ledger account's balance as of today — i.e. the ending
 * balance the General Ledger page would show for the current period, with
 * any entries dated after today excluded.
 */
export function glAccountCurrentBalance(account: GeneralLedgerAccount): number {
  const now = new Date();
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const cutoff = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
  return glAccountBalanceBefore(account, cutoff);
}
