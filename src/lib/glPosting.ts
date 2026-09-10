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

function sourceBookAcronym(sourceLabel: string): string {
  switch (sourceLabel.trim().toLowerCase()) {
    case 'cash receipts journal':
      return 'CRJ';
    case 'cash disbursements journal':
      return 'CDJ';
    case 'purchases journal':
      return 'PJ';
    case 'sales journal':
      return 'SJ';
    case 'general journal':
      return 'GJ';
    default:
      return '';
  }
}

function makeLeg(
  key: string,
  side: 'debit' | 'credit',
  amount: number,
  date: string,
  particulars: string,
  _ref: string,
  sourceLabel: string
): GeneralLedgerEntry {
  // The General Ledger PR is a Posting Reference to the Book of Original
  // Entry, not the source transaction/invoice/reference number. Every
  // automatically posted line therefore receives the same BOE acronym.
  const pr = sourceBookAcronym(sourceLabel);

  return {
    id: key,
    dateDr: side === 'debit' ? date : '',
    particularsDr: side === 'debit' ? particulars : '',
    refDr: side === 'debit' ? pr : '',
    debit: side === 'debit' ? fmt(amount) : '',
    dateCr: side === 'credit' ? date : '',
    particularsCr: side === 'credit' ? particulars : '',
    refCr: side === 'credit' ? pr : '',
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
// NEW: Sales Journal synchronization from `client.sales`.
// ---------------------------------------------------------------------------

/**
 * Returns the client with its Sales Journal (`sjEntries`) synchronized with
 * credit‑card and on‑account sales from the Income module.
 *
 * The `sales` array is the authoritative source for credit sales. For each
 * sale where `paymentType` is 'Credit Card' or 'On Account', we generate a
 * Sales Journal entry that carries the same values the manual SJ form would
 * store (date, invoice_no, customer info, net_of_vat, output_vat, etc.).
 *
 * We merge these generated auto entries with any existing `sjEntries`,
 * refreshing rows with the same ID (derived from the sale's id) and appending
 * genuinely new entries, but never deleting manual entries.
 */
export function syncSalesJournal(client: Client): Client {
  const accounts = getCoaAccounts(client);
  const columns = client.sjColumns || DEFAULT_SJ_COLUMNS;

  const generatedEntries: JournalEntry[] = (client.sales || [])
    .filter((s: any) => s.paymentType === 'Credit Card' || s.paymentType === 'On Account')
    .map((sale: any) => {
      const gross = Number(sale.amount) || 0;
      const net = Number(sale.netOfVat ?? gross) || 0;
      const vat = Number(sale.outputTax ?? 0) || 0;
      const exemptZero = sale.vatType === 'VAT Exempt' || sale.vatType === 'Zero-Rated' ? gross : 0;

      const values: Record<string, any> = {};
      // Only include columns that exist in the current SJ column set.
      columns.forEach(col => {
        if (col.type !== 'number') return;
        switch (col.id) {
          case 'date': values.date = sale.date || ''; break;
          case 'invoice_no': values.invoice_no = sale.ref || ''; break;
          case 'customer_tin': values.customer_tin = sale.buyerTin || ''; break;
          case 'customer_name': values.customer_name = sale.buyerName || ''; break;
          case 'customer_address': values.customer_address = sale.buyerAddress || ''; break;
          case 'net_of_vat': values.net_of_vat = net ? net.toFixed(2) : ''; break;
          case 'output_vat': values.output_vat = vat ? vat.toFixed(2) : ''; break;
          case 'exempt_zero_rated': values.exempt_zero_rated = exemptZero ? exemptZero.toFixed(2) : ''; break;
          case 'account_title': values.account_title = sale.incomeType || 'Sales'; break;
          case 'accounts_receivable': values.accounts_receivable = sale.paymentType === 'On Account' ? gross.toFixed(2) : ''; break;
          case 'credit_card': values.credit_card = sale.paymentType === 'Credit Card' ? gross.toFixed(2) : ''; break;
          default: break;
        }
      });

      return {
        id: `sale_${sale.id}`,
        values,
        auto: true,
        autoSource: 'Sales',
      };
    });

  const persistedEntries = client.sjEntries || [];
  if (generatedEntries.length === 0) return client;

  // Merge by ID: refresh generated rows, preserve manual rows, append new.
  const generatedById = new Map(generatedEntries.map(entry => [String(entry.id), entry]));
  const persistedIds = new Set(persistedEntries.map(entry => String(entry.id)));

  const mergedEntries = persistedEntries.map(entry =>
    generatedById.get(String(entry.id)) || entry
  );

  // Append only generated rows that are not already persisted.
  generatedEntries.forEach(entry => {
    if (!persistedIds.has(String(entry.id))) mergedEntries.push(entry);
  });

  return { ...client, sjEntries: mergedEntries };
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

/**
 * Purchase cash/check transactions are source transactions for the CDJ.
 *
 * IMPORTANT: Purchase.amount is the VATable net amount only. Non-VAT/Exempt
 * and 0-Rated purchases are stored separately in exemptAmount and
 * zeroRatedAmount, respectively. Therefore a purchase with amount === 0 can
 * still be a real cash disbursement.
 *
 * CDJ calculation:
 *   VATable net + Exempt/Non-VAT + 0-Rated + Input Tax - Withholding
 *   = Cash/Bank credit
 *
 * The purchase row keeps the expense classification in the account title;
 * the CDJ amount column carries the total expense base
 * (VATable + Exempt/Non-VAT + 0-Rated), while Input Tax remains separate.
 */
function purchaseCashDisbursementsToCdjEntries(client: Client, accounts: CoaAccount[]): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const cashAccount = findAccountByLabel('Cash', accounts)
    || findAccountByLabel('Cash on Hand', accounts)
    || accounts.find(a => normalize(a.name).includes('cash'));

  if (!cashAccount) return entries;

  (client.purchases || []).forEach(p => {
    const paymentMethod = String(p.paymentMethod || '').trim().toLowerCase();
    if (paymentMethod !== 'cash' && paymentMethod !== 'check' && paymentMethod !== 'e-payments' && paymentMethod !== 'e-payment') return;

    // `amount` is the VATable net amount. Non-VAT/Exempt and 0-Rated values
    // live in their dedicated fields and must also participate in CDJ.
    const netAmount = Number(p.amount) || 0;
    const exemptAmount = Number(p.exemptAmount) || 0;
    const zeroRatedAmount = Number(p.zeroRatedAmount) || 0;
    const inputTax = Number(p.inputTax) || 0;
    const withholding = p.withholdingOption === 'with' ? (Number(p.whtAmount) || 0) : 0;

    const expenseBase = netAmount + exemptAmount + zeroRatedAmount;
    const cashDue = expenseBase + inputTax - withholding;

    // Keep genuinely empty source rows out of the CDJ, but do NOT treat
    // amount === 0 as empty when Exempt/0-Rated/Input Tax contains value.
    if (cashDue <= 0) return;

    const accountTitle = String(p.accountTitle || '').trim();
    const values: Record<string, any> = {
      date: p.date || '',
      payee: p.supplierName || '',
      folio_f: p.invoiceNo || p.checkNumber || '',
      [CDJ_CASH_ON_HAND_BANK_ID]: two(cashDue),
      cash: two(cashDue),
      account_title: accountTitle,
      amount: two(expenseBase),
      input_tax: two(inputTax),
      inputTax: two(inputTax),
    };

    // Preserve the bank/check reference without changing the visible CDJ
    // column model. The page will continue to show Folio/F as the source ref.
    if (p.checkNumber) values.check_number = p.checkNumber;
    if (p.bankName) values.bank_name = p.bankName;

    entries.push({
      id: `cdj-auto:purchase:${p.id}`,
      auto: true,
      autoSource: 'Purchases',
      values,
    });
  });

  return entries;
}

function journalVoucherCashDisbursementsToCdjEntries(client: Client, accounts: CoaAccount[]): JournalEntry[] {
  const cashAccount = findAccountByLabel('Cash', accounts)
    || findAccountByLabel('Cash on Hand', accounts)
    || accounts.find(a => normalize(a.name).includes('cash'));
  if (!cashAccount) return [];

  const entries: JournalEntry[] = [];
  (client.journalVouchers || []).forEach(voucher => {
    const lines = Array.isArray(voucher.lines) ? voucher.lines : [];
    const cashCredits = lines.filter((line: any) => {
      const credit = Number(line.credit) || 0;
      const isCash = String(line.accountId || '') === String(cashAccount.id)
        || normalize(String(line.accountName || '')) === normalize(String(cashAccount.name));
      return isCash && credit > 0;
    });
    if (!cashCredits.length) return;

    const cashCredit = cashCredits.reduce((sum: number, line: any) => sum + (Number(line.credit) || 0), 0);
    const debitLines = lines.filter((line: any) => {
      const debit = Number(line.debit) || 0;
      const isCash = String(line.accountId || '') === String(cashAccount.id)
        || normalize(String(line.accountName || '')) === normalize(String(cashAccount.name));
      return !isCash && debit > 0;
    });

    debitLines.forEach((line: any, index: number) => {
      const debit = Number(line.debit) || 0;
      if (debit <= 0) return;
      const allocatedCash = Math.min(debit, cashCredit);
      if (allocatedCash <= 0) return;

      entries.push({
        id: `cdj-auto:jv:${voucher.id}:${line.id || index}`,
        auto: true,
        autoSource: 'Journal Voucher',
        values: {
          date: voucher.date || '',
          payee: line.accountName || voucher.memo || 'Journal Voucher',
          folio_f: voucher.reference || '',
          [CDJ_CASH_ON_HAND_BANK_ID]: two(allocatedCash),
          cash: two(allocatedCash),
          account_title: line.accountName || '',
          amount: two(debit),
        },
      });
    });
  });

  return entries;
}

function generalJournalCashDisbursementsToCdjEntries(client: Client, accounts: CoaAccount[]): JournalEntry[] {
  const columns = client.gjColumns || DEFAULT_GJ_COLUMNS;
  const cashAccount = findAccountByLabel('Cash', accounts)
    || findAccountByLabel('Cash on Hand', accounts)
    || accounts.find(a => normalize(a.name).includes('cash'));

  if (!cashAccount) return [];

  const dateCol = columns.find(c => c.id === 'date')?.id || 'date';
  const particularsCol = columns.find(c => c.id === 'particulars')?.id || 'particulars';
  const refCol = columns.find(c => c.id === 'ref_no')?.id || 'ref_no';
  const debitCol = columns.find(c => c.id === 'debit')?.id || 'debit';
  const creditCol = columns.find(c => c.id === 'credit')?.id || 'credit';

  const entries: JournalEntry[] = [];

  (client.gjEntries || []).forEach(entry => {
    const v = entry.values || {};
    const date = String(v[dateCol] || '');
    const particulars = String(v[particularsCol] || '').trim();
    const ref = String(v[refCol] || '');
    const debit = parseFloat(String(v[debitCol] ?? '').replace(/,/g, ''));
    const credit = parseFloat(String(v[creditCol] ?? '').replace(/,/g, ''));

    if (!Number.isFinite(credit) || credit <= 0) return;

    const creditedAccount = findAccountByLabel(particulars, accounts);
    if (!creditedAccount || creditedAccount.id !== cashAccount.id) return;

    const matchingDebitRows = (client.gjEntries || []).filter(other => {
      if (other.id === entry.id) return false;
      const ov = other.values || {};
      const otherDate = String(ov[dateCol] || '');
      const otherRef = String(ov[refCol] || '');
      const otherDebit = parseFloat(String(ov[debitCol] ?? '').replace(/,/g, ''));
      return otherDate === date
        && otherRef === ref
        && Number.isFinite(otherDebit)
        && otherDebit > 0;
    });

    if (matchingDebitRows.length > 0) {
      matchingDebitRows.forEach(other => {
        const ov = other.values || {};
        const otherDebit = parseFloat(String(ov[debitCol] ?? '').replace(/,/g, ''));
        const title = String(ov[particularsCol] || '').trim();
        if (!title || !Number.isFinite(otherDebit) || otherDebit <= 0) return;

        entries.push({
          id: `cdj-auto:gj:${entry.id}:${other.id}`,
          auto: true,
          autoSource: 'General Journal',
          values: {
            date,
            payee: title,
            folio_f: ref,
            [CDJ_CASH_ON_HAND_BANK_ID]: two(Math.min(otherDebit, credit)),
            cash: two(Math.min(otherDebit, credit)),
            account_title: title,
            amount: two(otherDebit),
          },
        });
      });
      return;
    }

    if (Number.isFinite(debit) && debit > 0 && particulars) {
      entries.push({
        id: `cdj-auto:gj:${entry.id}`,
        auto: true,
        autoSource: 'General Journal',
        values: {
          date,
          payee: particulars,
          folio_f: ref,
          [CDJ_CASH_ON_HAND_BANK_ID]: two(Math.min(debit, credit)),
          cash: two(Math.min(debit, credit)),
          account_title: particulars,
          amount: two(debit),
        },
      });
    }
  });

  return entries;
}

/**
 * Returns the client with its Cash Disbursements Journal (`cdjEntries`)
 * synchronized with source transactions WITHOUT replacing rows that were
 * already loaded from Supabase.
 *
 * The previous implementation rebuilt the CDJ as:
 *   generated auto rows + manual rows
 *
 * That discarded persisted `auto` CDJ rows which did not happen to be
 * regenerated by the current source rules. As a result, a client could have
 * 140 CDJ rows in `journal_entries` while the UI displayed only the 73 rows
 * currently generated from Purchases/JVs/GJ.
 *
 * Supabase-persisted CDJ rows are authoritative. Generated source rows are
 * used only to refresh an existing row with the same ID or append a genuinely
 * new source row that is not yet stored.
 */
// ---------------------------------------------------------------------------
// Additional cash-payment sources: Expenses, Check Vouchers, and Miscellaneous
// Payments. Every cash outlay — no matter where it was recorded — must appear
// in the Cash Disbursements Journal, so these are auto-posted alongside
// cash Purchases and cash-out Journal Vouchers.
// ---------------------------------------------------------------------------

function expenseCashDisbursementsToCdjEntries(client: Client, _accounts: CoaAccount[]): JournalEntry[] {
  const entries: JournalEntry[] = [];
  (client.expenses || []).forEach(exp => {
    const amount = Number(exp.amount) || 0;
    if (amount <= 0) return;
    const payee = String(exp.description || '').trim() || String(exp.category || 'Expense');
    entries.push({
      id: `cdj-auto:expense:${exp.id}`,
      auto: true,
      autoSource: 'Expenses',
      values: {
        date: exp.date || '',
        payee,
        folio_f: '',
        [CDJ_CASH_ON_HAND_BANK_ID]: two(amount),
        cash: two(amount),
        account_title: String(exp.category || ''),
        amount: two(amount),
      },
    });
  });
  return entries;
}

function checkVoucherCashDisbursementsToCdjEntries(client: Client, _accounts: CoaAccount[]): JournalEntry[] {
  const entries: JournalEntry[] = [];
  (client.checkVouchers || []).forEach(cv => {
    if (cv.status === 'Reversed') return;
    const amount = Number(cv.amount) || 0;
    if (amount <= 0) return;
    const accountTitle = cv.paymentType === 'Miscellaneous'
      ? (cv.miscDetails || 'Miscellaneous')
      : cv.invoiceNumber ? `Invoice ${cv.invoiceNumber}` : cv.paymentType;
    const values: Record<string, any> = {
      date: cv.date || '',
      payee: cv.payeeName || '',
      folio_f: cv.checkNumber || cv.invoiceNumber || '',
      [CDJ_CASH_ON_HAND_BANK_ID]: two(amount),
      cash: two(amount),
      account_title: accountTitle,
      amount: two(amount),
    };
    if (cv.checkNumber) values.check_number = cv.checkNumber;
    if (cv.bankName) values.bank_name = cv.bankName;
    entries.push({
      id: `cdj-auto:check-voucher:${cv.id}`,
      auto: true,
      autoSource: 'Check Voucher',
      values,
    });
  });
  return entries;
}

function miscellaneousPaymentCashDisbursementsToCdjEntries(client: Client, _accounts: CoaAccount[]): JournalEntry[] {
  const entries: JournalEntry[] = [];
  (client.miscellaneousPayments || []).forEach(mp => {
    const amount = Number(mp.amount) || 0;
    if (amount <= 0) return;
    const values: Record<string, any> = {
      date: mp.date || '',
      payee: mp.payeeName || '',
      folio_f: mp.checkNumber || '',
      [CDJ_CASH_ON_HAND_BANK_ID]: two(amount),
      cash: two(amount),
      account_title: mp.expenseCategory || mp.description || 'Miscellaneous',
      amount: two(amount),
    };
    if (mp.checkNumber) values.check_number = mp.checkNumber;
    if (mp.bankName) values.bank_name = mp.bankName;
    entries.push({
      id: `cdj-auto:misc-payment:${mp.id}`,
      auto: true,
      autoSource: 'Miscellaneous Payment',
      values,
    });
  });
  return entries;
}

export function syncCashDisbursementsJournal(client: Client): Client {
  const accounts = getCoaAccounts(client);
  // Cash Disbursements Journal data comes ONLY from:
  //   1. Expense History (client.expenses)
  //   2. Journal Vouchers that credit Cash
  // Purchases, General Journal, Check Vouchers, and Miscellaneous Payments
  // are intentionally excluded — they are recorded in their own respective
  // books of original entry instead.
  const generatedEntries = [
    ...expenseCashDisbursementsToCdjEntries(client, accounts),
    ...journalVoucherCashDisbursementsToCdjEntries(client, accounts),
  ];

  const persistedEntries = client.cdjEntries || [];
  if (generatedEntries.length === 0) return client;

  // Refresh generated rows by ID, but never delete persisted rows merely
  // because the current source-to-CDJ generator does not recreate them.
  const generatedById = new Map(generatedEntries.map(entry => [String(entry.id), entry]));
  const persistedIds = new Set(persistedEntries.map(entry => String(entry.id)));

  const mergedEntries = persistedEntries.map(entry =>
    generatedById.get(String(entry.id)) || entry
  );

  // Append only generated rows that are not already persisted.
  generatedEntries.forEach(entry => {
    if (!persistedIds.has(String(entry.id))) mergedEntries.push(entry);
  });

  return { ...client, cdjEntries: mergedEntries };
}

// ---------------------------------------------------------------------------
// Source: Purchases (payment method = "On Account") → Purchases Journal
//
// Cash and Check purchases are recorded in the Cash Disbursements Journal
// (credit Cash). "On Account" purchases, however, create a liability instead
// of paying out immediately — so they belong in the Purchases Journal, where
// they debit the expense/asset account + Input Tax and credit **Accounts
// Payable** (less any withholding tax, which is credited separately).
// ---------------------------------------------------------------------------
function purchaseOnAccountToPjEntries(client: Client, accounts: CoaAccount[]): JournalEntry[] {
  const entries: JournalEntry[] = [];

  (client.purchases || []).forEach(p => {
    const paymentMethod = String(p.paymentMethod || '').trim().toLowerCase();
    if (paymentMethod !== 'on account' && paymentMethod !== 'on-account' && paymentMethod !== 'on_account') return;

    const netAmount = Number(p.amount) || 0;
    const exemptAmount = Number(p.exemptAmount) || 0;
    const zeroRatedAmount = Number(p.zeroRatedAmount) || 0;
    const inputTax = Number(p.inputTax) || 0;
    const withholding = p.withholdingOption === 'with' ? (Number(p.whtAmount) || 0) : 0;

    const expenseBase = netAmount + exemptAmount + zeroRatedAmount;
    const accountsPayable = expenseBase + inputTax - withholding;

    if (accountsPayable <= 0) return;

    const accountTitle = String(p.accountTitle || '').trim();
    const values: Record<string, any> = {
      date: p.date || '',
      supplier_name: p.supplierName || '',
      supplier_tin: p.supplierTin || '',
      invoice_no: p.invoiceNo || '',
      description: p.transactionDetails || accountTitle || '',
      net_purchase: two(netAmount),
      exempt_zero_rated: two(exemptAmount + zeroRatedAmount),
      input_tax: two(inputTax),
      debit_account: accountTitle,
      accounts_payable: two(accountsPayable),
      withholding_tax: two(withholding),
    };

    entries.push({
      id: `pj-auto:purchase:${p.id}`,
      auto: true,
      autoSource: 'Purchases',
      values,
    });
  });

  return entries;
}

/**
 * Synchronizes the Purchases Journal (`pjEntries`) with "On Account"
 * purchases recorded in the Purchases module. Generated rows are keyed by
 * purchase id so they refresh cleanly on every edit. Manual PJ entries
 * typed directly by the user are always preserved.
 */
export function syncPurchasesJournal(client: Client): Client {
  const accounts = getCoaAccounts(client);
  const generatedEntries = purchaseOnAccountToPjEntries(client, accounts);

  const persistedEntries = client.pjEntries || [];
  if (generatedEntries.length === 0) return client;

  const generatedById = new Map(generatedEntries.map(entry => [String(entry.id), entry]));
  const persistedIds = new Set(persistedEntries.map(entry => String(entry.id)));

  const mergedEntries = persistedEntries.map(entry =>
    generatedById.get(String(entry.id)) || entry
  );

  generatedEntries.forEach(entry => {
    if (!persistedIds.has(String(entry.id))) mergedEntries.push(entry);
  });

  return { ...client, pjEntries: mergedEntries };
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

  // Cash Disbursements Journal: post every CDJ row. Auto rows originate from
  // the books of original entry (General Journal) and are already normalized
  // into CDJ before this posting pass.
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

    // Input Tax is a fixed debit column in the CDJ. Resolve it from the
    // actual CDJ column first, then fall back to the known COA labels and
    // legacy field names. This is intentionally independent of the column
    // array's ordering so Input Tax cannot be skipped when CDJ columns were
    // migrated/customized.
    const inputTaxLabels = new Set(['input tax', 'input vat', 'vat input', 'vat input receivable']);
    const normalizeInputTaxLabel = (value: unknown) =>
      String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

    const inputTaxColumn = cdjColumns.find(c => {
      if (c.type !== 'number') return false;
      const accountId = c.id.startsWith('cdj_coa_') ? c.id.slice('cdj_coa_'.length) : '';
      const linkedAccount = accountId ? accounts.find(a => a.id === accountId) : undefined;
      return inputTaxLabels.has(normalizeInputTaxLabel(c.name))
        || !!linkedAccount && inputTaxLabels.has(normalizeInputTaxLabel(linkedAccount.name));
    });

    const inputTaxAccount = (inputTaxColumn?.id.startsWith('cdj_coa_')
      ? accounts.find(a => a.id === inputTaxColumn.id.slice('cdj_coa_'.length))
      : undefined)
      || findAccountByLabel('Input Tax', accounts)
      || findAccountByLabel('VAT Input Receivable', accounts)
      || findAccountByLabel('Input VAT', accounts)
      || findAccountByLabel('VAT Input', accounts);

    if (inputTaxAccount) {
      // Prefer the value stored under the actual linked CDJ column. Then
      // support all legacy representations used by older CDJ rows.
      const legacyKey = Object.keys(v).find(key =>
        inputTaxLabels.has(normalizeInputTaxLabel(key))
      );
      const tax = num(
        (inputTaxColumn ? v[inputTaxColumn.id] : undefined)
        ?? v.input_tax
        ?? v.inputTax
        ?? v['Input Tax']
        ?? (legacyKey ? v[legacyKey] : undefined)
      );

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
 * Returns the client with its General Ledger (`glAccounts`) fully synced
 * exclusively from the books of original entry (CRJ, CDJ, PJ, SJ and GJ).
 * Manual entries typed directly into the GL are intentionally dropped — the
 * General Ledger is a posting ledger, so all data must originate from a
 * book of original entry.
 * Safe to call repeatedly — it's idempotent and cheap enough to run on
 * every save/read.
 *
 * Modified: now always returns a `glAccounts` array (even empty) instead of
 * returning the client unchanged when no postings/GL entries exist. This
 * ensures consumers like the Dashboard always have a defined array.
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

  const touchedAccountIds = new Set<string>([
    ...accounts.map(a => a.id),        // all COA accounts
    ...nextByAccount.keys(),           // any existing GL accounts (safety)
    ...autoByAccount.keys()            // auto-posted accounts
  ]);

  const nextGlAccounts: GeneralLedgerAccount[] = [];
  touchedAccountIds.forEach(accountId => {
    const acct = accounts.find(a => a.id === accountId);
    const existingRecord = nextByAccount.get(accountId);
    // General Ledger data comes ONLY from the books of original entry.
    // Manual entries typed directly into the GL are intentionally dropped.
    const autoEntries = (autoByAccount.get(accountId) || []).sort((a, b) => dateSortKey(a) - dateSortKey(b));
    nextGlAccounts.push({
      id: accountId,
      accountTitle: acct?.name || existingRecord?.accountTitle || '',
      accountId,
      accountType: acct?.type || existingRecord?.accountType,
      entries: autoEntries,
    });
  });

  // Always return a defined glAccounts array. Previously, if both postings
  // and existing GL were empty, we returned the client unchanged, which left
  // `glAccounts` undefined and broke consumers that expected an array.
  return { ...client, glAccounts: nextGlAccounts };
}