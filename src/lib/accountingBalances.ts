import { Client, CoaAccount, GeneralLedgerAccount, GeneralLedgerEntry } from '../types';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA, getNormalSide } from '../components/ChartOfAccounts';

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
    : (client.coaFormat === 'alphanumeric' ? DEFAULT_ACCOUNTS_ALPHA : DEFAULT_ACCOUNTS);
  return list.filter(a => !a.hidden);
}

export function getAccountBalances(client: Client, year = getCurrentYear(client)): AccountBalance[] {
  const gl = client.glAccounts || [];
  return getCoaAccounts(client).map(account => {
    const g = gl.find(x => x.accountId === account.id || x.id === account.id);
    const opening = Number(account.openingBalance) || 0;
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
  const opening = Number(account.openingBalance) || 0;
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
  let running = (normal === 'debit' ? 1 : -1) * (Number(account.openingBalance) || 0);
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
  const start = `${year}-01-01`;
  const end = `${year + 1}-01-01`;

  const balances: ProfitAndLossAccountLine[] = (client.glAccounts || []).map((account: any) => {
    const entries = Array.isArray(account.entries) ? account.entries : [];
    const periodEntries = entries.filter((entry: any) => {
      const d = String(entry.date || entry.dateDr || entry.dateCr || '').slice(0, 10);
      return d >= start && d < end;
    });
    const period_debit = periodEntries.reduce((n: number, entry: any) => n + Number(String(entry.debit ?? '').replace(/,/g, '') || 0), 0);
    const period_credit = periodEntries.reduce((n: number, entry: any) => n + Number(String(entry.credit ?? '').replace(/,/g, '') || 0), 0);
    const allEntries = entries.filter((entry: any) => String(entry.date || entry.dateDr || entry.dateCr || '').slice(0, 10) < end);
    const totalDebit = allEntries.reduce((n: number, entry: any) => n + Number(String(entry.debit ?? '').replace(/,/g, '') || 0), 0);
    const totalCredit = allEntries.reduce((n: number, entry: any) => n + Number(String(entry.credit ?? '').replace(/,/g, '') || 0), 0);
    return {
      account_id: String(account.accountId || account.id),
      account_name: String(account.accountTitle || ''),
      account_type: String(account.accountType || ''),
      period_debit,
      period_credit,
      period_balance: period_debit - period_credit,
      balance: totalDebit - totalCredit,
    };
  });

  const revenue = balances.filter(x => (x.account_type || '').toLowerCase() === 'revenue');
  const costs = balances.filter(x => ['cost', 'costs'].includes((x.account_type || '').toLowerCase()));
  const expenses = balances.filter(x => ['expense', 'expenses'].includes((x.account_type || '').toLowerCase()));

  const revenueTotal = revenue.reduce((n, x) => n + Math.max(0, x.period_credit - x.period_debit), 0);
  const costTotal = costs.reduce((n, x) => n + Math.max(0, x.period_debit - x.period_credit), 0);
  const expenseTotal = expenses.reduce((n, x) => n + Math.max(0, x.period_debit - x.period_credit), 0);
  const grossIncome = revenueTotal - costTotal;
  const netIncome = grossIncome - expenseTotal;

  return { year, balances, revenue, costs, expenses, revenueTotal, costTotal, expenseTotal, grossIncome, netIncome };
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
 * beginning/ending balance math exactly.
 */
export function glAccountBalanceBefore(account: GeneralLedgerAccount, cutoffDateExclusive: string): number {
  const opening = glAmount(account.openingBalance);
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
