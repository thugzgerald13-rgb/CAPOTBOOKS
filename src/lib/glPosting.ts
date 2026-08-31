import { Client, CoaAccount, GeneralLedgerAccount, GeneralLedgerEntry, JournalColumn, JournalEntry } from '../types';
import { DEFAULT_ACCOUNTS, DEFAULT_ACCOUNTS_ALPHA } from '../components/ChartOfAccounts';
import { DEFAULT_CRJ_COLUMNS } from '../components/CashReceiptsJournal';
import { DEFAULT_CDJ_COLUMNS, CDJ_CASH_ON_HAND_BANK_ID, CDJ_SUNDRY_ACCOUNT_TITLE_ID, CDJ_SUNDRY_AMOUNT_ID } from '../components/CashDisbursementsJournal';
import { DEFAULT_PJ_COLUMNS } from '../components/PurchasesJournal';
import { DEFAULT_SJ_COLUMNS } from '../components/SalesJournal';
import { DEFAULT_GJ_COLUMNS } from '../components/GeneralJournal';

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
const CRJ_LABEL_OVERRIDES: Record<string, string> = { cash: 'Cash' };
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
    accountTitleCol?: string; // text column containing the account for a special numeric column
    accountTitleColMatchesId?: string; // numeric column whose account comes from accountTitleCol
  }
): Posting[] {
  const postings: Posting[] = [];

  entries.forEach(entry => {
    const values = entry.values || {};
    const date = String(values[opts.dateCol] || '');
    const particulars = String(values[opts.particularsCol] || '');
    const ref = opts.refCol ? String(values[opts.refCol] || '') : '';

    columns
      .filter(c => c.type === 'number' && c.category !== 'None')
      .forEach(col => {
        const raw = String(values[col.id] ?? '').replace(/,/g, '');
        const amount = parseFloat(raw);
        if (!raw || !Number.isFinite(amount) || amount === 0) return;

        const label = opts.accountTitleCol && col.id === opts.accountTitleColMatchesId
          ? String(values[opts.accountTitleCol] || '')
          : (opts.overrides?.[col.id] || col.name);

        const account = findAccountByLabel(label, accounts);
        if (!account) return;

        const side: 'debit' | 'credit' = col.category === 'Dr' ? 'debit' : 'credit';
        postings.push({
          accountId: account.id,
          entry: makeLeg(
            `${opts.prefix}:${entry.id}:${col.id}`,
            side,
            amount,
            date,
            particulars,
            ref,
            opts.sourceLabel
          ),
        });
      });

    // CDJ's "Amount Dr/Cr" is intentionally category=None because the side is
    // determined by the account named in the adjacent Account Title field.
    // Post it explicitly instead of silently ignoring it.
    if (opts.accountTitleCol && opts.accountTitleColMatchesId) {
      const amountCol = columns.find(c => c.id === opts.accountTitleColMatchesId);
      if (amountCol) {
        const raw = String(values[amountCol.id] ?? '').replace(/,/g, '');
        const amount = parseFloat(raw);
        const title = String(values[opts.accountTitleCol] || '').trim();
        if (title && Number.isFinite(amount) && amount !== 0) {
          const account = findAccountByLabel(title, accounts);
          if (account) {
            // In the CDJ this companion amount is a debit/sundry amount.
            postings.push({
              accountId: account.id,
              entry: makeLeg(
                `${opts.prefix}:${entry.id}:${amountCol.id}`,
                'debit',
                Math.abs(amount),
                date,
                particulars,
                ref,
                opts.sourceLabel
              ),
            });
          }
        }
      }
    }

    // CRJ's Sundry amount is also category=None because its account is named
    // in the "Account Credited / Description" field. Resolve that account
    // from the row description rather than hard-coding it to Output Tax.
    if (opts.prefix === 'crj') {
      const sundryCol = columns.find(c => c.id === 'sundry');
      if (sundryCol) {
        const raw = String(values[sundryCol.id] ?? '').replace(/,/g, '');
        const amount = parseFloat(raw);
        if (Number.isFinite(amount) && amount !== 0 && particulars) {
          const account = findAccountByLabel(particulars, accounts);
          if (account && !postings.some(p => p.entry.id === `${opts.prefix}:${entry.id}:sundry`)) {
            postings.push({
              accountId: account.id,
              entry: makeLeg(
                `${opts.prefix}:${entry.id}:sundry`,
                'credit',
                Math.abs(amount),
                date,
                particulars,
                ref,
                opts.sourceLabel
              ),
            });
          }
        }
      }
    }
  });

  return postings;
}

// ---------------------------------------------------------------------------
// Source: Sales Journal — the subsidiary book of original entry for credit
// sales and credit-card sales.
//
// The Sales Journal's debit columns are Accounts Receivable / Credit Card.
// Its revenue is the Account Title credited for Net of VAT + Exempt/0-Rated,
// while Output VAT is credited separately.
// ---------------------------------------------------------------------------

function postSalesJournal(client: Client, accounts: CoaAccount[]): Posting[] {
  const postings: Posting[] = [];
  const columns = client.sjColumns || DEFAULT_SJ_COLUMNS;

  (client.sjEntries || []).forEach(entry => {
    const v = entry.values || {};
    const date = String(v.date || '');
    const ref = String(v.invoice_no || '');
    const particulars = String(v.customer_name || v.account_title || 'Sales');
    const revenueAccount = findAccountByLabel(String(v.account_title || 'Sales'), accounts);

    const numValue = (id: string) => {
      const raw = String(v[id] ?? '').replace(/,/g, '');
      const n = parseFloat(raw);
      return Number.isFinite(n) ? n : 0;
    };

    // Debit Accounts Receivable for On Account sales.
    const ar = numValue('accounts_receivable');
    if (ar > 0) {
      const acct = findAccountByLabel('Accounts Receivable', accounts);
      if (acct) {
        postings.push({
          accountId: acct.id,
          entry: makeLeg(`sj:${entry.id}:ar`, 'debit', ar, date, particulars, ref, 'Sales Journal'),
        });
      }
    }

    // Debit Credit Card for credit-card sales.
    const cc = numValue('credit_card');
    if (cc > 0) {
      const acct = findAccountByLabel('Credit Card', accounts)
        || findAccountByLabel('Credit Card Receivable', accounts);
      if (acct) {
        postings.push({
          accountId: acct.id,
          entry: makeLeg(`sj:${entry.id}:cc`, 'debit', cc, date, particulars, ref, 'Sales Journal'),
        });
      }
    }

    // Credit the selected revenue account for both taxable net sales and
    // exempt/zero-rated sales.
    const revenueAmount = numValue('net_of_vat') + numValue('exempt_zero_rated');
    if (revenueAccount && revenueAmount > 0) {
      postings.push({
        accountId: revenueAccount.id,
        entry: makeLeg(`sj:${entry.id}:revenue`, 'credit', revenueAmount, date, particulars, ref, 'Sales Journal'),
      });
    }

    // Credit Output Tax for VAT.
    const outputVat = numValue('output_vat');
    if (outputVat > 0) {
      const acct = findAccountByLabel('Output Tax', accounts)
        || findAccountByLabel('Output VAT', accounts);
      if (acct) {
        postings.push({
          accountId: acct.id,
          entry: makeLeg(`sj:${entry.id}:outputvat`, 'credit', outputVat, date, particulars, ref, 'Sales Journal'),
        });
      }
    }

    // Custom Dr/Cr columns added by the user are also posted, provided they
    // resolve unambiguously to a Chart of Accounts account. System columns are
    // excluded here because they were already handled above.
    const systemIds = new Set(DEFAULT_SJ_COLUMNS.map(c => c.id));
    columns
      .filter(c => !systemIds.has(c.id) && c.type === 'number' && c.category !== 'None')
      .forEach(col => {
        const raw = String(v[col.id] ?? '').replace(/,/g, '');
        const amount = parseFloat(raw);
        if (!Number.isFinite(amount) || amount === 0) return;

        const acct = findAccountByLabel(col.name, accounts);
        if (!acct) return;

        postings.push({
          accountId: acct.id,
          entry: makeLeg(
            `sj:${entry.id}:${col.id}`,
            col.category === 'Dr' ? 'debit' : 'credit',
            amount,
            date,
            particulars,
            ref,
            'Sales Journal'
          ),
        });
      });
  });

  return postings;
}

// ---------------------------------------------------------------------------
// Source: General Journal — the general book of original entry.
//
// Each General Journal row already represents an account-title line. The
// account title is resolved from the "ACCOUNT TITLES & DESCRIPTION" field and
// the debit/credit amount is posted to that account.
// ---------------------------------------------------------------------------

function postGeneralJournal(client: Client, accounts: CoaAccount[]): Posting[] {
  const postings: Posting[] = [];
  const columns = client.gjColumns || DEFAULT_GJ_COLUMNS;

  const dateCol = columns.find(c => c.id === 'date')?.id || 'date';
  const particularsCol = columns.find(c => c.id === 'particulars')?.id || 'particulars';
  const refCol = columns.find(c => c.id === 'ref_no')?.id || 'ref_no';
  const debitCol = columns.find(c => c.id === 'debit')?.id || 'debit';
  const creditCol = columns.find(c => c.id === 'credit')?.id || 'credit';

  (client.gjEntries || []).forEach(entry => {
    const v = entry.values || {};
    const date = String(v[dateCol] || '');
    const particulars = String(v[particularsCol] || '');
    const ref = String(v[refCol] || '');

    const account = findAccountByLabel(particulars, accounts);
    if (!account) return;

    const debit = parseFloat(String(v[debitCol] ?? '').replace(/,/g, ''));
    if (Number.isFinite(debit) && debit > 0) {
      postings.push({
        accountId: account.id,
        entry: makeLeg(`gj:${entry.id}:dr`, 'debit', debit, date, particulars, ref, 'General Journal'),
      });
    }

    const credit = parseFloat(String(v[creditCol] ?? '').replace(/,/g, ''));
    if (Number.isFinite(credit) && credit > 0) {
      postings.push({
        accountId: account.id,
        entry: makeLeg(`gj:${entry.id}:cr`, 'credit', credit, date, particulars, ref, 'General Journal'),
      });
    }

    // Post user-defined numeric columns as well.
    const systemIds = new Set(DEFAULT_GJ_COLUMNS.map(c => c.id));
    columns
      .filter(c => !systemIds.has(c.id) && c.type === 'number' && c.category !== 'None')
      .forEach(col => {
        const amount = parseFloat(String(v[col.id] ?? '').replace(/,/g, ''));
        if (!Number.isFinite(amount) || amount === 0) return;

        const acct = findAccountByLabel(col.name, accounts);
        if (!acct) return;

        postings.push({
          accountId: acct.id,
          entry: makeLeg(
            `gj:${entry.id}:${col.id}`,
            col.category === 'Dr' ? 'debit' : 'credit',
            amount,
            date,
            particulars,
            ref,
            'General Journal'
          ),
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
    const wht = p.withholdingOption === 'with' ? (Number(p.whtAmount) || 0) : 0;
    const cashDue = total - wht;

    if (cashDue > 0) {
      const creditAcct = findAccountByLabel('Cash', accounts);
      if (creditAcct) {
        postings.push({
          accountId: creditAcct.id,
          entry: makeLeg(`purchase:${p.id}:credit`, 'credit', cashDue, p.date, particulars, ref, 'Purchases'),
        });
      }
    }

    if (wht > 0) {
      const whtAcct = findAccountByLabel('Withholding Tax Payable - Expanded', accounts);
      if (whtAcct) {
        postings.push({
          accountId: whtAcct.id,
          entry: makeLeg(`purchase:${p.id}:wht`, 'credit', wht, p.date, particulars, ref, 'Purchases'),
        });
      }
    }
  });
  return postings;
}

// ---------------------------------------------------------------------------
// Source: Cash Disbursements Journal auto-entries — every payment made in
// cash/check elsewhere in the app (Purchases, Journal Vouchers, AP Check
// Vouchers, and Miscellaneous Payments) is a cash disbursement, so it belongs
// in the Cash Disbursements Journal even if nobody typed it there directly. These rows
// are generated here and merged into `cdjEntries`; see
// `syncCashDisbursementsJournal` below. They're excluded from
// `postColumnarJournal`'s own CDJ pass (via the `cdjManualOnly` filter in
// `computeAutoPostings`) because their source (Purchases / Journal Vouchers)
// already posts straight to the General Ledger on its own — including them
// again here would double-post the same cash-out to the ledger.
// ---------------------------------------------------------------------------

function cashPurchasesToCdjEntries(client: Client): JournalEntry[] {
  return (client.purchases || [])
    .filter(p => p.paymentMethod === 'Cash' || p.paymentMethod === 'Check')
    .map(p => {
      // "Other Payments" stores its actual payment amount in exemptAmount
      // (amount is intentionally 0 there). Use that field so those cash
      // payments are not silently omitted from the CDJ.
      const isOtherPayment = p.vatType === 'non-vat' && (Number(p.amount) || 0) === 0
        && (Number(p.exemptAmount) || 0) > 0;
      // Keep the CDJ Cash on Hand/Bank amount exactly aligned with the
      // Expense History GROSS calculation. Expense History defines GROSS as:
      // amount + input tax + exempt amount + zero-rated amount.
      // This is intentionally the same source calculation used by History.tsx
      // so a purchase cannot show one gross amount in Expense History and a
      // different amount in the CDJ.
      const amount = Number(p.amount) || 0;
      const tax = Number(p.inputTax) || 0;
      const exempt = Number(p.exemptAmount) || 0;
      const zeroRated = Number(p.zeroRatedAmount) || 0;
      const gross = amount + tax + exempt + zeroRated;
      // CDJ added COA columns and Sundries represent the purchase cost
      // excluding Input Tax: Net of VAT + Exempt + 0-Rated.
      const purchaseDebit = amount + exempt + zeroRated;
      if (gross <= 0) return null;

      const entry: JournalEntry = {
        id: `cdj-auto:purchase:${p.id}`,
        auto: true,
        autoSource: 'Purchases',
        values: {
          date: p.date,
          payee: p.supplierName,
          account_title: p.accountTitle || p.expenseType || 'Expense',
          amount: purchaseDebit > 0 ? two(purchaseDebit) : '',
          // Must be identical to Expense History's GROSS function.
          cash: two(gross),
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
    // on it is the Cash account. Mixed-credit vouchers are left for manual
    // CDJ entry rather than guessing which portion was paid in cash.
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

function cashCheckVouchersToCdjEntries(client: Client): JournalEntry[] {
  return (client.checkVouchers || [])
    .filter(v => v.status !== 'Reversed' && Number(v.amount) > 0)
    .map(v => ({
      id: `cdj-auto:check-voucher:${v.id}`,
      auto: true,
      autoSource: 'Check Voucher',
      values: {
        date: v.date,
        payee: v.payeeName,
        account_title: v.paymentType === 'Miscellaneous'
          ? (v.miscDetails || 'Miscellaneous Expense')
          : v.paymentType === 'Advance'
            ? 'Supplier Advances'
            : 'Accounts Payable',
        amount: two(Number(v.amount) || 0),
        cash: two(Number(v.amount) || 0),
      },
    }));
}

function cashMiscellaneousPaymentsToCdjEntries(client: Client): JournalEntry[] {
  const vouchers = client.checkVouchers || [];
  return (client.miscellaneousPayments || [])
    .filter(m => Number(m.amount) > 0)
    .filter(m => !vouchers.some(v =>
      v.status !== 'Reversed'
      && v.date === m.date
      && v.checkNumber === m.checkNumber
      && Math.abs(Number(v.amount) - Number(m.amount)) < 0.01
    ))
    .map(m => ({
      id: `cdj-auto:misc-payment:${m.id}`,
      auto: true,
      autoSource: 'Miscellaneous Payment',
      values: {
        date: m.date,
        payee: m.payeeName,
        account_title: m.expenseCategory || 'Expense',
        amount: two(Number(m.amount) || 0),
        cash: two(Number(m.amount) || 0),
      },
    }));
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
    ...cashCheckVouchersToCdjEntries(client),
    ...cashMiscellaneousPaymentsToCdjEntries(client),
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

  // The General Ledger is a posting ledger, not a second transaction-entry
  // screen. Its source data comes only from the books of original entry:
  // Cash Receipts Journal, Cash Disbursements Journal, Purchases Journal,
  // Sales Journal, and General Journal.
  const crj = postColumnarJournal(
    client.crjEntries || [],
    client.crjColumns || DEFAULT_CRJ_COLUMNS,
    accounts,
    {
      prefix: 'crj',
      sourceLabel: 'Cash Receipts Journal',
      dateCol: 'date',
      particularsCol: 'description',
      refCol: 'reference',
      overrides: CRJ_LABEL_OVERRIDES,
    }
  );

  // Cash Disbursements Journal: post EVERY CDJ row, including auto-generated rows.
  // CDJ's current schema uses cash_on_hand_bank, sundry_account_title,
  // sundry_amount, and cdj_coa_<accountId>. Older rows may still contain
  // cash/account_title/amount, so both schemas are supported.
  const cdj: Posting[] = [];
  const cdjColumns = client.cdjColumns || DEFAULT_CDJ_COLUMNS;
  const cashAccount = accounts.find(a => a.name.trim().toLowerCase() === 'cash on hand')
    || accounts.find(a => a.name.trim().toLowerCase() === 'cash')
    || accounts.find(a => a.name.toLowerCase().includes('cash on hand'));

  (client.cdjEntries || []).forEach(entry => {
    const v = entry.values || {};
    const date = String(v.date || '');
    const particulars = String(v.payee || v.description || '');
    const ref = String(v.folio_f || v.reference || '');
    const num = (value: any) => {
      const n = parseFloat(String(value ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? Math.abs(n) : 0;
    };

    // Cash on Hand/Bank is always the credit side of a CDJ transaction.
    const cashRaw = v[CDJ_CASH_ON_HAND_BANK_ID] ?? v.cash_on_hand_bank ?? v.cash ?? v.cashAmount ?? v.cash_amount;
    const cash = num(cashRaw);
    if (cash > 0 && cashAccount) {
      cdj.push({
        accountId: cashAccount.id,
        entry: makeLeg(`cdj:${entry.id}:${CDJ_CASH_ON_HAND_BANK_ID}`, 'credit', cash, date, particulars, ref, 'Cash Disbursements Journal'),
      });
    }

    // Every configured CDJ COA column represents its linked COA account.
    // Input Tax is handled below so it can also read legacy input_tax values.
    const inputTaxAccountForColumn = findAccountByLabel('Input Tax', accounts)
      || findAccountByLabel('VAT Input Receivable', accounts)
      || findAccountByLabel('Input VAT', accounts);
    cdjColumns.filter(c => c.id.startsWith('cdj_coa_') && c.type === 'number').forEach(col => {
      const accountId = col.id.slice('cdj_coa_'.length);
      const acct = accounts.find(a => a.id === accountId);
      if (inputTaxAccountForColumn && accountId === inputTaxAccountForColumn.id) return;
      const amount = num(v[col.id]);
      if (!acct || amount === 0) return;
      cdj.push({
        accountId: acct.id,
        entry: makeLeg(
          `cdj:${entry.id}:${col.id}`,
          col.category === 'Cr' ? 'credit' : 'debit',
          amount, date, particulars, ref, 'Cash Disbursements Journal'
        ),
      });
    });

    // Current Sundries fields.
    let title = String(v[CDJ_SUNDRY_ACCOUNT_TITLE_ID] ?? v.account_title ?? v.accountTitle ?? '').trim();
    let amountRaw = v[CDJ_SUNDRY_AMOUNT_ID] ?? v.amount ?? v.debitAmount ?? v.debit_amount ?? '';
    let signedAmount = parseFloat(String(amountRaw).replace(/,/g, ''));

    // Resolve an older/auto row's account title and amount as well.
    if (title && Number.isFinite(signedAmount) && signedAmount !== 0) {
      const acct = findAccountByLabel(title, accounts);
      if (acct) {
        cdj.push({
          accountId: acct.id,
          entry: makeLeg(
            `cdj:${entry.id}:${CDJ_SUNDRY_AMOUNT_ID}`,
            signedAmount < 0 ? 'credit' : 'debit',
            Math.abs(signedAmount), date, particulars, ref, 'Cash Disbursements Journal'
          ),
        });
      }
    }

    // Input Tax is a fixed debit column in the CDJ. Support both the current
    // linked COA column and legacy input_tax field.
    const inputTaxAccount = findAccountByLabel('Input Tax', accounts)
      || findAccountByLabel('VAT Input Receivable', accounts)
      || findAccountByLabel('Input VAT', accounts);
    if (inputTaxAccount) {
      const linked = cdjColumns.find(c => c.id === `cdj_coa_${inputTaxAccount.id}`);
      const tax = num(v[linked?.id || 'input_tax'] ?? v.inputTax ?? v['Input Tax']);
      if (tax > 0) {
        cdj.push({
          accountId: inputTaxAccount.id,
          entry: makeLeg(`cdj:${entry.id}:input_tax`, 'debit', tax, date, particulars, ref, 'Cash Disbursements Journal'),
        });
      }
    }
  });

  // Purchases Journal: Net of VAT and Exempt/0-Rated are debits to the
  // account named in "Account Title"; Input Tax is a debit to Input Tax;
  // Accounts Payable and Withholding Tax are credits.  The account-title
  // column is text, so the generic column-name matcher cannot post the first
  // two cost columns correctly.
  const pj: Posting[] = [];
  const pjColumns = client.pjColumns || DEFAULT_PJ_COLUMNS;
  (client.pjEntries || []).forEach(entry => {
    const v = entry.values || {};
    const date = String(v.date || '');
    const particulars = String(v.supplier_name || '');
    const ref = String(v.invoice_no || '');
    const amount = (id: string) => {
      const n = parseFloat(String(v[id] ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? n : 0;
    };

    const debitAccount = findAccountByLabel(
      String(v.debit_account || v.account_title || ''),
      accounts
    );

    const cost = amount('net_purchase') + amount('exempt_zero_rated');
    if (debitAccount && cost > 0) {
      pj.push({
        accountId: debitAccount.id,
        entry: makeLeg(`pj:${entry.id}:debit_account`, 'debit', cost, date, particulars, ref, 'Purchases Journal'),
      });
    }

    const inputTax = amount('input_tax');
    if (inputTax > 0) {
      const acct = findAccountByLabel('Input Tax', accounts);
      if (acct) {
        pj.push({
          accountId: acct.id,
          entry: makeLeg(`pj:${entry.id}:input_tax`, 'debit', inputTax, date, particulars, ref, 'Purchases Journal'),
        });
      }
    }

    const ap = amount('accounts_payable');
    if (ap > 0) {
      const acct = findAccountByLabel('Accounts Payable', accounts);
      if (acct) {
        pj.push({
          accountId: acct.id,
          entry: makeLeg(`pj:${entry.id}:accounts_payable`, 'credit', ap, date, particulars, ref, 'Purchases Journal'),
        });
      }
    }

    const wht = amount('withholding_tax');
    if (wht > 0) {
      const acct = findAccountByLabel('Withholding Tax Payable - Expanded', accounts)
        || findAccountByLabel('Withholding Tax Payable', accounts)
        || findAccountByLabel('Withholding Tax', accounts);
      if (acct) {
        pj.push({
          accountId: acct.id,
          entry: makeLeg(`pj:${entry.id}:withholding_tax`, 'credit', wht, date, particulars, ref, 'Purchases Journal'),
        });
      }
    }

    // Preserve user-added numeric PJ columns.
    const systemIds = new Set(DEFAULT_PJ_COLUMNS.map(c => c.id));
    pjColumns
      .filter(c => !systemIds.has(c.id) && c.type === 'number' && c.category !== 'None')
      .forEach(col => {
        const n = amount(col.id);
        if (n === 0) return;
        const acct = findAccountByLabel(col.name, accounts);
        if (!acct) return;
        pj.push({
          accountId: acct.id,
          entry: makeLeg(
            `pj:${entry.id}:${col.id}`,
            col.category === 'Dr' ? 'debit' : 'credit',
            Math.abs(n),
            date,
            particulars,
            ref,
            'Purchases Journal'
          ),
        });
      });
  });

  const sj = postSalesJournal(client, accounts);
  const gj = postGeneralJournal(client, accounts);

  return [...crj, ...cdj, ...pj, ...sj, ...gj];
}

/**
 * Returns the client with its General Ledger (`glAccounts`) fully synced:
 * every account title is rebuilt from the books of original entry (CRJ, CDJ,
 * PJ, SJ and GJ), while any legacy manually-entered GL rows are retained only
 * for backward compatibility.
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
