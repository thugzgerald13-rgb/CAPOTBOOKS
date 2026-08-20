import { Client, CoaAccount, GeneralLedgerAccount, GeneralLedgerEntry, JournalColumn, JournalEntry } from '../types';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA } from '../components/ChartOfAccounts';
import { DEFAULT_CRJ_COLUMNS } from '../components/CashReceiptsJournal';
import { DEFAULT_CDJ_COLUMNS } from '../components/CashDisbursementsJournal';
import { DEFAULT_PJ_COLUMNS } from '../components/PurchasesJournal';

/**
 * Automatic General Ledger posting.
 *
 * Every special journal in the app (Cash Receipts Journal, Cash Disbursements
 * Journal, Purchases Journal, Journal Vouchers) and the Purchases module
 * records transactions, but none of them used to flow through to the General
 * Ledger — the GL was a purely manual, disconnected worksheet. This module
 * derives GL entries for every account title straight from those sources, so
 * the General Ledger (and anything built on it, like the Chart of Accounts
 * running balances, Profit & Loss, and Balance Sheet) always reflects every
 * transaction/entry recorded anywhere in the books.
 *
 * Auto-posted entries are recomputed from scratch every time (idempotent —
 * keyed by a stable id derived from their source row/column) and merged with
 * whatever the user typed directly into the GL. Manual entries are always
 * preserved untouched.
 */

const two = (n: number) => n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d)\.)/g, ',');

const fmt = (n: number) => Number.isFinite(n) && Math.abs(n) > 0.004 ? two(Math.abs(n)) : '';

// ---------------------------------------------------------------------------
// Account name matching
// ---------------------------------------------------------------------------

const STOPWORDS = new Set(['of', 'the', 'and', 'for', 'on', 'account', 'title', 'amount', 'dr', 'cr', 'goods', 'a']);
const SYNONYMS: Record<string, string> = {
  'ar': 'receivable',
  'a/r': 'receivable',
  'ap': 'payable',
  'a/p': 'payable',
  'vat': 'tax',
  'revenue': 'sales',
  'income': 'sales',
};

function normalize(s: string): string {
  return (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function tokenize(s: string): string[] {
  return normalize(s)
    .split(' ')
    .filter(Boolean)
    .map(t => SYNONYMS[t] || t)
    .filter(t => !STOPWORDS.has(t));
}

/**
 * Finds the Chart of Accounts entry that best matches a free-text label
 * (a journal column name, or an account title typed elsewhere). Tries an
 * exact match first, then falls back to shared-keyword matching so that
 * common bookkeeping labels (e.g. "Cash" / "Cash on Hand", "Input Tax" /
 * "VAT Input Receivable") still resolve. Returns undefined — rather than
 * guessing — whenever the best match is ambiguous or there's no overlap.
 */
export function findAccountByLabel(label: string, accounts: CoaAccount[]): CoaAccount | undefined {
  const target = normalize(label);
  if (!target) return undefined;

  const exact = accounts.find(a => normalize(a.name) === target);
  if (exact) return exact;

  const labelTokens = new Set(tokenize(label));
  if (labelTokens.size === 0) return undefined;

  let best: CoaAccount | undefined;
  let bestScore = 0;
  let tie = false;

  for (const acct of accounts) {
    const nameTokens = new Set(tokenize(acct.name));
    let score = 0;
    nameTokens.forEach(t => { if (labelTokens.has(t)) score++; });
    if (score > bestScore) {
      best = acct;
      bestScore = score;
      tie = false;
    } else if (score > 0 && score === bestScore) {
      tie = true;
    }
  }

  if (bestScore === 0 || tie) return undefined;
  return best;
}

function getCoaAccounts(client: Client): CoaAccount[] {
  const list = client.accounts && client.accounts.length > 0
    ? client.accounts
    : (client.coaFormat === 'alphanumeric' ? DEFAULT_ACCOUNTS_ALPHA : DEFAULT_ACCOUNTS);
  return list.filter(a => !a.hidden);
}

// Per-journal, per-column overrides for labels that don't literally match an
// account title (e.g. the CDJ's generic "Amount Dr(Cr)" column, whose actual
// account is typed into the companion "Account Title" field).
const CRJ_LABEL_OVERRIDES: Record<string, string> = { sundry: 'Output Tax' };
const CDJ_LABEL_OVERRIDES: Record<string, string> = { cash: 'Cash', input_tax: 'Input Tax' };

interface Posting {
  accountId: string;
  entry: GeneralLedgerEntry;
}

function makeLeg(
  key: string,
  side: 'debit' | 'credit',
  amount: number,
  date: string,
  particulars: string,
  ref: string,
  sourceLabel: string
): GeneralLedgerEntry {
  return {
    id: key,
    dateDr: side === 'debit' ? date : '',
    particularsDr: side === 'debit' ? particulars : '',
    refDr: side === 'debit' ? ref : '',
    debit: side === 'debit' ? fmt(amount) : '',
    dateCr: side === 'credit' ? date : '',
    particularsCr: side === 'credit' ? particulars : '',
    refCr: side === 'credit' ? ref : '',
    credit: side === 'credit' ? fmt(amount) : '',
    auto: true,
    autoSource: sourceLabel,
  };
}

// ---------------------------------------------------------------------------
// Source: columnar special journals (CRJ / CDJ / PJ) — each numeric column
// represents an account by name; its Dr/Cr category says which side to post.
// ---------------------------------------------------------------------------

function postColumnarJournal(
  entries: JournalEntry[],
  columns: JournalColumn[],
  accounts: CoaAccount[],
  opts: {
    prefix: string;
    sourceLabel: string;
    dateCol: string;
    particularsCol: string;
    refCol?: string;
    overrides?: Record<string, string>;
    accountTitleCol?: string; // when a numeric column's real account is named in another text column (CDJ)
    accountTitleColMatchesId?: string; // which numeric column id uses accountTitleCol
  }
): Posting[] {
  const postings: Posting[] = [];

  entries.forEach(entry => {
    const values = entry.values || {};
    const date = String(values[opts.dateCol] || '');
    const particulars = String(values[opts.particularsCol] || '');
    const ref = opts.refCol ? String(values[opts.refCol] || '') : '';

    columns.filter(c => c.type === 'number' && c.category !== 'None').forEach(col => {
      const raw = String(values[col.id] ?? '').replace(/,/g, '');
      const amount = parseFloat(raw);
      if (!raw || isNaN(amount) || amount === 0) return;

      const label = opts.accountTitleCol && col.id === opts.accountTitleColMatchesId
        ? String(values[opts.accountTitleCol] || '')
        : (opts.overrides?.[col.id] || col.name);

      const account = findAccountByLabel(label, accounts);
      if (!account) return;

      const side: 'debit' | 'credit' = col.category === 'Dr' ? 'debit' : 'credit';
      const key = `${opts.prefix}:${entry.id}:${col.id}`;
      postings.push({
        accountId: account.id,
        entry: makeLeg(key, side, amount, date, particulars, ref, opts.sourceLabel),
      });
    });
  });

  return postings;
}

// ---------------------------------------------------------------------------
// Source: Journal Vouchers — already structured with an accountId per line.
// ---------------------------------------------------------------------------

function postJournalVouchers(client: Client): Posting[] {
  const postings: Posting[] = [];
  (client.journalVouchers || []).forEach(v => {
    v.lines.forEach(line => {
      if (line.debit > 0) {
        postings.push({
          accountId: line.accountId,
          entry: makeLeg(`jv:${v.id}:${line.id}:dr`, 'debit', line.debit, v.date, v.memo || 'Journal Voucher', v.reference, 'Journal Voucher'),
        });
      }
      if (line.credit > 0) {
        postings.push({
          accountId: line.accountId,
          entry: makeLeg(`jv:${v.id}:${line.id}:cr`, 'credit', line.credit, v.date, v.memo || 'Journal Voucher', v.reference, 'Journal Voucher'),
        });
      }
    });
  });
  return postings;
}

// ---------------------------------------------------------------------------
// Source: Purchases module — has an explicit accountTitle per transaction.
// ---------------------------------------------------------------------------

function postPurchases(client: Client, accounts: CoaAccount[]): Posting[] {
  const postings: Posting[] = [];
  (client.purchases || []).forEach(p => {
    const particulars = p.supplierName + (p.transactionDetails ? ` - ${p.transactionDetails}` : '');
    const ref = p.invoiceNo || '';
    const netAmount = Number(p.amount) || 0;
    const inputTax = Number(p.inputTax) || 0;

    const debitAcct = findAccountByLabel(p.accountTitle, accounts);
    if (debitAcct && netAmount > 0) {
      postings.push({
        accountId: debitAcct.id,
        entry: makeLeg(`purchase:${p.id}:debit`, 'debit', netAmount, p.date, particulars, ref, 'Purchases'),
      });
    }

    if (inputTax > 0) {
      const taxAcct = findAccountByLabel('Input Tax', accounts);
      if (taxAcct) {
        postings.push({
          accountId: taxAcct.id,
          entry: makeLeg(`purchase:${p.id}:inputtax`, 'debit', inputTax, p.date, particulars, ref, 'Purchases'),
        });
      }
    }

    const total = netAmount + inputTax;
    if (total > 0) {
      const creditAcct = findAccountByLabel('Cash', accounts);
      if (creditAcct) {
        postings.push({
          accountId: creditAcct.id,
          entry: makeLeg(`purchase:${p.id}:credit`, 'credit', total, p.date, particulars, ref, 'Purchases'),
        });
      }
    }
  });
  return postings;
}

// ---------------------------------------------------------------------------
// Source: Cash Disbursements Journal auto-entries — every payment made in
// cash elsewhere in the app (a cash-basis Purchase, or a Journal Voucher
// that credits Cash) is a cash disbursement, so it belongs in the Cash
// Disbursements Journal even if nobody typed it there directly. These rows
// are generated here and merged into `cdjEntries`; see
// `syncCashDisbursementsJournal` below. They're excluded from
// `postColumnarJournal`'s own CDJ pass (via the `cdjManualOnly` filter in
// `computeAutoPostings`) because their source (Purchases / Journal Vouchers)
// already posts straight to the General Ledger on its own — including them
// again here would double-post the same cash-out to the ledger.
// ---------------------------------------------------------------------------

function cashPurchasesToCdjEntries(client: Client): JournalEntry[] {
  return (client.purchases || [])
    .filter(p => p.paymentMethod === 'Cash')
    .map(p => {
      const net = Number(p.amount) || 0;
      const tax = Number(p.inputTax) || 0;
      const total = net + tax;
      if (total <= 0) return null;
      const entry: JournalEntry = {
        id: `cdj-auto:purchase:${p.id}`,
        auto: true,
        autoSource: 'Purchases',
        values: {
          date: p.date,
          payee: p.supplierName,
          account_title: p.accountTitle,
          amount: net > 0 ? two(net) : '',
          cash: two(total),
          input_tax: tax > 0 ? two(tax) : '',
        },
      };
      return entry;
    })
    .filter((e): e is JournalEntry => e !== null);
}

function cashJournalVouchersToCdjEntries(client: Client, accounts: CoaAccount[]): JournalEntry[] {
  const cashAccount = findAccountByLabel('Cash', accounts);
  if (!cashAccount) return [];

  const entries: JournalEntry[] = [];
  (client.journalVouchers || []).forEach(v => {
    const creditLines = v.lines.filter(l => l.credit > 0);
    if (creditLines.length === 0) return;
    // Only treat this voucher as a cash disbursement when every credit line
    // on it is the Cash account — a mixed voucher (e.g. Cr Cash + Cr Notes
    // Payable) isn't a straightforward "paid in cash" transaction, so it's
    // left for manual entry instead of guessed at.
    const isCashOnlyCredit = creditLines.every(l => l.accountId === cashAccount.id);
    if (!isCashOnlyCredit) return;

    v.lines.filter(l => l.debit > 0).forEach(l => {
      entries.push({
        id: `cdj-auto:jv:${v.id}:${l.id}`,
        auto: true,
        autoSource: 'Journal Voucher',
        values: {
          date: v.date,
          payee: v.memo || v.reference,
          account_title: l.accountName,
          amount: two(l.debit),
          cash: two(l.debit),
        },
      });
    });
  });
  return entries;
}

/**
 * Returns the client with its Cash Disbursements Journal (`cdjEntries`)
 * synced: every manually-typed row is kept untouched, plus a freshly
 * regenerated set of auto-posted rows for cash payments recorded elsewhere
 * (cash-basis Purchases, and Journal Vouchers that credit Cash). Safe to
 * call repeatedly — it's idempotent and cheap enough to run on every
 * save/read, and should run before `syncGeneralLedger` so the ledger picks
 * up these auto-posted rows too.
 */
export function syncCashDisbursementsJournal(client: Client): Client {
  const accounts = getCoaAccounts(client);
  const autoEntries = [
    ...cashPurchasesToCdjEntries(client),
    ...cashJournalVouchersToCdjEntries(client, accounts),
  ];
  const manualEntries = (client.cdjEntries || []).filter(e => !e.auto);

  if (autoEntries.length === 0 && manualEntries.length === (client.cdjEntries || []).length) {
    return client; // nothing auto-generated, nothing to strip — avoid needless churn
  }

  return { ...client, cdjEntries: [...autoEntries, ...manualEntries] };
}

// ---------------------------------------------------------------------------
// Merge: compute every auto-posting, group by account, and combine with the
// user's manually-typed entries (auto entries never overwrite manual ones).
// ---------------------------------------------------------------------------

function dateSortKey(entry: GeneralLedgerEntry): number {
  const raw = entry.dateDr || entry.dateCr;
  if (!raw) return Number.MAX_SAFE_INTEGER;
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw);
  if (iso) return new Date(`${iso[1]}-${iso[2]}-${iso[3]}`).getTime();
  const mdy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(raw);
  if (mdy) return new Date(`${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`).getTime();
  const parsed = Date.parse(raw);
  return isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

export function computeAutoPostings(client: Client): Posting[] {
  const accounts = getCoaAccounts(client);

  const crj = postColumnarJournal(client.crjEntries || [], client.crjColumns || DEFAULT_CRJ_COLUMNS, accounts, {
    prefix: 'crj',
    sourceLabel: 'Cash Receipts Journal',
    dateCol: 'date',
    particularsCol: 'description',
    refCol: 'reference',
    overrides: CRJ_LABEL_OVERRIDES,
  });

  // Only the manually-typed CDJ rows are posted from here — rows that were
  // themselves auto-generated from Purchases/Journal Vouchers are posted to
  // the GL directly by postPurchases()/postJournalVouchers() below, so
  // including them again here would double-post the same cash-out.
  const cdjManualEntries = (client.cdjEntries || []).filter(e => !e.auto);
  const cdj = postColumnarJournal(cdjManualEntries, client.cdjColumns || DEFAULT_CDJ_COLUMNS, accounts, {
    prefix: 'cdj',
    sourceLabel: 'Cash Disbursements Journal',
    dateCol: 'date',
    particularsCol: 'payee',
    overrides: CDJ_LABEL_OVERRIDES,
    accountTitleCol: 'account_title',
    accountTitleColMatchesId: 'amount',
  });

  const pj = postColumnarJournal(client.pjEntries || [], client.pjColumns || DEFAULT_PJ_COLUMNS, accounts, {
    prefix: 'pj',
    sourceLabel: 'Purchases Journal',
    dateCol: 'date',
    particularsCol: 'supplier_name',
    refCol: 'invoice_no',
  });

  const jv = postJournalVouchers(client);
  const purchases = postPurchases(client, accounts);

  return [...crj, ...cdj, ...pj, ...jv, ...purchases];
}

/**
 * Returns the client with its General Ledger (`glAccounts`) fully synced:
 * every account title keeps its manually-typed entries untouched, plus a
 * freshly regenerated set of auto-posted entries from every source journal.
 * Safe to call repeatedly — it's idempotent and cheap enough to run on
 * every save/read.
 */
export function syncGeneralLedger(client: Client): Client {
  const accounts = getCoaAccounts(client);
  const accountIds = new Set(accounts.map(a => a.id));
  const postings = computeAutoPostings(client);

  const autoByAccount = new Map<string, GeneralLedgerEntry[]>();
  postings.forEach(p => {
    if (!accountIds.has(p.accountId)) return; // stale/deleted account — drop silently
    if (!autoByAccount.has(p.accountId)) autoByAccount.set(p.accountId, []);
    autoByAccount.get(p.accountId)!.push(p.entry);
  });

  const existing = client.glAccounts || [];
  const nextByAccount = new Map<string, GeneralLedgerAccount>();

  existing.forEach(g => {
    if (!g.accountId) return;
    nextByAccount.set(g.accountId, g);
  });

  const touchedAccountIds = new Set<string>([...nextByAccount.keys(), ...autoByAccount.keys()]);

  const nextGlAccounts: GeneralLedgerAccount[] = [];
  touchedAccountIds.forEach(accountId => {
    const acct = accounts.find(a => a.id === accountId);
    const existingRecord = nextByAccount.get(accountId);
    const manualEntries = (existingRecord?.entries || []).filter(e => !e.auto);
    const autoEntries = (autoByAccount.get(accountId) || []).sort((a, b) => dateSortKey(a) - dateSortKey(b));
    nextGlAccounts.push({
      id: accountId,
      accountTitle: acct?.name || existingRecord?.accountTitle || '',
      accountId,
      accountType: acct?.type || existingRecord?.accountType,
      entries: [...autoEntries, ...manualEntries],
    });
  });

  // Nothing changed and nothing to sync — avoid a needless object churn.
  if (nextGlAccounts.length === 0 && existing.length === 0) return client;

  return { ...client, glAccounts: nextGlAccounts };
}
