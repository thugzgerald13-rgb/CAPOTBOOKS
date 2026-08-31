import { Client, CoaAccount, GeneralLedgerAccount } from '../types';
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
  // Financial reports use the General Ledger as their accounting source.
  // The Chart of Accounts supplies only the account master data (title/type,
  // normal side and opening balance); all posted activity is read from
  // glAccounts[].entries. syncGeneralLedger() in AccountingContext keeps that
  // ledger current with the books of original entry before reports render.
  const gl = client.glAccounts || [];
  const coa = client.accounts && client.accounts.length > 0
    ? client.accounts
    : (client.coaFormat === 'alphanumeric' ? DEFAULT_ACCOUNTS_ALPHA : DEFAULT_ACCOUNTS);
  const coaById = new Map(coa.map(a => [a.id, a]));

  return gl
    .filter(g => !!g.accountId || !!g.id)
    .map(g => {
      const accountId = g.accountId || g.id;
      const account = coaById.get(accountId);
      if (!account) return null;

      const opening = Number(account.openingBalance) || 0;
      const normal = account.normalSide || g.normalSide || getNormalSide(account.type || g.accountType || '');
      let debit = normal === 'debit' ? opening : 0;
      let credit = normal === 'credit' ? opening : 0;
      let currentYearDebit = 0;
      let currentYearCredit = 0;

      (g.entries || []).forEach(e => {
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
    })
    .filter((x): x is AccountBalance => x !== null);
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
