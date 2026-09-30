import { Client, CoaAccount, GeneralLedgerAccount, GeneralLedgerEntry, JournalColumn, JournalEntry } from '../types';
import { getDefaultAccountsForIndustry, getNormalSide, DEFAULT_CRJ_COLUMNS, DEFAULT_CDJ_COLUMNS, CDJ_SUNDRY_ACCOUNT_TITLE_ID, CDJ_SUNDRY_AMOUNT_ID, DEFAULT_PJ_COLUMNS, DEFAULT_SJ_COLUMNS } from './journalDefaults';

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

// An empty saved-columns array is truthy in JavaScript, so writing
// `useColumns(client.crjColumns, DEFAULT_CRJ_COLUMNS)` silently selects [] when a
// client has never persisted that journal's columns — and posting against
// zero number columns produces zero ledger entries. Always fall back to the
// default column set when nothing has been persisted for that journal.
const useColumns = (saved: JournalColumn[] | undefined, fallback: JournalColumn[]): JournalColumn[] =>
  saved && saved.length > 0 ? saved : fallback;

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
    : getDefaultAccountsForIndustry(client.industry, client.coaFormat === 'alphanumeric' ? 'alphanumeric' : 'numeric');
  return list.filter(a => !a.hidden);
}

// Per-journal, per-column overrides for labels that don't literally match an
// account title (e.g. the CDJ's generic "Amount Dr(Cr)" column, whose actual
// account is typed into the companion "Account Title" field).
const CRJ_LABEL_OVERRIDES: Record<string, string> = { sundry: 'Output Tax' };
const CDJ_LABEL_OVERRIDES: Record<string, string> = { cash: 'Cash', input_tax: 'Input Tax' };
// PJ columns whose fixed account is known. "Net of VAT" and "Exempt / 0-Rated"
// both debit the Purchases account.
const PJ_LABEL_OVERRIDES: Record<string, string> = {
  net_purchase: 'Purchases',
  exempt_zero_rated: 'Purchases',
  input_tax: 'Input Tax',
  accounts_payable: 'Accounts Payable',
  withholding_tax: 'Withholding Tax Payable',
};

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

      const label = opts.overrides?.[col.id] || col.name;

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
// Source: Cash Disbursements Journal "Sundry" column pair — a free-text
// Account Title plus a single Amount Dr/Cr column, used for accounts that
// don't have their own dedicated CDJ column. Unlike every other CDJ column,
// this pair's Dr/Cr side isn't fixed by a column category (its category is
// 'None' precisely because either side is possible) — it's determined by the
// sign of the amount instead, the same way the CDJ's own Dr/Cr column totals
// are split. `postColumnarJournal` only posts columns with a fixed Dr/Cr
// category, so this pair needs its own pass or it is silently dropped.
// ---------------------------------------------------------------------------

function postCdjSundry(entries: JournalEntry[], accounts: CoaAccount[]): Posting[] {
  const postings: Posting[] = [];

  entries.forEach(entry => {
    const values = entry.values || {};
    const date = String(values.date || '');
    const particulars = String(values.payee || '');
    const title = String(values[CDJ_SUNDRY_ACCOUNT_TITLE_ID] ?? '').trim();
    const raw = String(values[CDJ_SUNDRY_AMOUNT_ID] ?? '').replace(/,/g, '');
    const amount = parseFloat(raw);
    if (!title || !raw || isNaN(amount) || amount === 0) return;

    const account = findAccountByLabel(title, accounts);
    if (!account) return;

    const side: 'debit' | 'credit' = amount > 0 ? 'debit' : 'credit';
    postings.push({
      accountId: account.id,
      entry: makeLeg(`cdj:${entry.id}:sundry`, side, Math.abs(amount), date, particulars, '', 'Cash Disbursements Journal'),
    });
  });

  return postings;
}

function postCdjAutoInputTax(entries: JournalEntry[], accounts: CoaAccount[]): Posting[] {
  const postings: Posting[] = [];
  const inputTaxAccount = findAccountByLabel('Input Tax', accounts)
    || findAccountByLabel('VAT Input Receivable', accounts)
    || findAccountByLabel('Input VAT', accounts)
    || findAccountByLabel('VAT Input', accounts);

  if (!inputTaxAccount) return postings;

  entries.filter(e => e.auto).forEach(entry => {
    const raw = String(entry.values?.input_tax ?? entry.values?.inputTax ?? '').replace(/,/g, '');
    const amount = parseFloat(raw);
    if (!Number.isFinite(amount) || amount === 0) return;

    const date = String(entry.values?.date || '');
    const particulars = String(entry.values?.payee || '');
    postings.push({
      accountId: inputTaxAccount.id,
      entry: makeLeg(
        `cdj:${entry.id}:input-tax`,
        'debit',
        Math.abs(amount),
        date,
        particulars,
        '',
        'Cash Disbursements Journal'
      ),
    });
  });

  return postings;
}


// ---------------------------------------------------------------------------
// Source: Income History (`client.sales`) -> CRJ / Sales Journal.
//
// Income History is the authoritative source for the Income workflow. The UI
// derives CRJ/SJ rows from the same records, but those derived rows are not
// necessarily persisted in `journal_entries`. The GL therefore derives the
// same journal rows here instead of depending on the journal screen having
// been opened or saved first.
// ---------------------------------------------------------------------------

function incomeSalesToCrjEntries(client: Client): JournalEntry[] {
  return (client.sales || [])
    .filter((sale: any) => {
      const payment = String(sale.paymentType ?? sale.payment_type ?? '').trim().toLowerCase();
      return payment !== 'credit card' && payment !== 'on account';
    })
    .map((sale: any) => {
      const gross = Number(sale.amount) || 0;
      const net = Number(sale.netOfVat ?? sale.net_of_vat ?? gross) || 0;
      const vat = Number(sale.outputTax ?? sale.output_tax ?? 0) || 0;
      const vatType = String(sale.vatType ?? sale.vat_type ?? '');
      const exemptOrZero = vatType === 'VAT Exempt' || vatType === 'Zero-Rated';

      return {
        id: `income_${sale.id}`,
        auto: true,
        autoSource: 'Income History',
        values: {
          date: sale.date || '',
          reference: sale.ref || '',
          payor: sale.buyerName || sale.buyer_name || '',
          description: sale.incomeType || sale.income_type || sale.desc || sale.description || 'Sales',
          post_ref: sale.buyerTin || sale.buyer_tin || '',
          cash: gross ? two(gross) : '',
          sales_disc: '',
          ar: '',
          sales: exemptOrZero ? two(gross) : (net ? two(net) : ''),
          sundry: !exemptOrZero && vat > 0 ? two(vat) : '',
        },
      } as JournalEntry;
    });
}

function incomeSalesToSjEntries(client: Client): JournalEntry[] {
  const columns = useColumns(client.sjColumns, DEFAULT_SJ_COLUMNS);

  return (client.sales || [])
    .filter((sale: any) => {
      const payment = String(sale.paymentType ?? sale.payment_type ?? '').trim().toLowerCase();
      return payment === 'credit card' || payment === 'on account';
    })
    .map((sale: any) => {
      const gross = Number(sale.amount) || 0;
      const net = Number(sale.netOfVat ?? sale.net_of_vat ?? gross) || 0;
      const vat = Number(sale.outputTax ?? sale.output_tax ?? 0) || 0;
      const vatType = String(sale.vatType ?? sale.vat_type ?? '');
      const exemptZero = vatType === 'VAT Exempt' || vatType === 'Zero-Rated' ? gross : 0;
      const payment = String(sale.paymentType ?? sale.payment_type ?? '').trim().toLowerCase();

      const values: Record<string, any> = {};
      columns.forEach(col => {
        switch (col.id) {
          case 'date': values.date = sale.date || ''; break;
          case 'invoice_no': values.invoice_no = sale.ref || ''; break;
          case 'customer_tin': values.customer_tin = sale.buyerTin || sale.buyer_tin || ''; break;
          case 'customer_name': values.customer_name = sale.buyerName || sale.buyer_name || ''; break;
          case 'customer_address': values.customer_address = sale.buyerAddress || sale.buyer_address || ''; break;
          case 'net_of_vat': values.net_of_vat = net ? two(net) : ''; break;
          case 'output_vat': values.output_vat = vat ? two(vat) : ''; break;
          case 'exempt_zero_rated': values.exempt_zero_rated = exemptZero ? two(exemptZero) : ''; break;
          case 'account_title': values.account_title = sale.incomeType || sale.income_type || 'Sales'; break;
          case 'accounts_receivable': values.accounts_receivable = payment === 'on account' && gross ? two(gross) : ''; break;
          case 'credit_card': values.credit_card = payment === 'credit card' && gross ? two(gross) : ''; break;
          default: break;
        }
      });

      return {
        id: `sale_${sale.id}`,
        auto: true,
        autoSource: 'Income History',
        values,
      } as JournalEntry;
    });
}

function postIncomeHistory(client: Client, accounts: CoaAccount[]): Posting[] {
  const crjEntries = [
    ...incomeSalesToCrjEntries(client),
    ...(client.crjEntries || []).filter((entry: any) => !entry.auto),
  ];
  const crj = postColumnarJournal(
    crjEntries,
    useColumns(client.crjColumns, DEFAULT_CRJ_COLUMNS),
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

  // Use the same account-title and payment split displayed by the Sales Journal.
  const sjEntries = [
    ...incomeSalesToSjEntries(client),
    ...(client.sjEntries || []).filter((entry: any) => !entry.auto),
  ];

  const sjPostings: Posting[] = [];
  const sjColumns = useColumns(client.sjColumns, DEFAULT_SJ_COLUMNS);
  sjEntries.forEach(entry => {
    const v = entry.values || {};
    const date = String(v.date || '');
    const ref = String(v.invoice_no || '');
    const particulars = String(v.customer_name || v.account_title || 'Sales');
    const revenueAccount = findAccountByLabel(String(v.account_title || 'Sales'), accounts);
    const num = (id: string) => {
      const n = parseFloat(String(v[id] ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? Math.abs(n) : 0;
    };

    const ar = num('accounts_receivable');
    if (ar > 0) {
      const acct = findAccountByLabel('Accounts Receivable', accounts);
      if (acct) sjPostings.push({ accountId: acct.id, entry: makeLeg(`sj:${entry.id}:ar`, 'debit', ar, date, particulars, ref, 'Sales Journal') });
    }

    const cc = num('credit_card');
    if (cc > 0) {
      const acct = findAccountByLabel('Credit Card', accounts) || findAccountByLabel('Credit Card Receivable', accounts);
      if (acct) sjPostings.push({ accountId: acct.id, entry: makeLeg(`sj:${entry.id}:cc`, 'debit', cc, date, particulars, ref, 'Sales Journal') });
    }

    const revenueAmount = num('net_of_vat') + num('exempt_zero_rated');
    if (revenueAccount && revenueAmount > 0) {
      sjPostings.push({ accountId: revenueAccount.id, entry: makeLeg(`sj:${entry.id}:revenue`, 'credit', revenueAmount, date, particulars, ref, 'Sales Journal') });
    }

    const outputVat = num('output_vat');
    if (outputVat > 0) {
      const acct = findAccountByLabel('Output Tax', accounts) || findAccountByLabel('Output VAT', accounts);
      if (acct) sjPostings.push({ accountId: acct.id, entry: makeLeg(`sj:${entry.id}:outputvat`, 'credit', outputVat, date, particulars, ref, 'Sales Journal') });
    }

    const systemIds = new Set(DEFAULT_SJ_COLUMNS.map(c => c.id));
    sjColumns.filter(c => !systemIds.has(c.id) && c.type === 'number' && c.category !== 'None').forEach(col => {
      const amount = num(col.id);
      if (amount === 0) return;
      const acct = findAccountByLabel(col.name, accounts);
      if (!acct) return;
      sjPostings.push({
        accountId: acct.id,
        entry: makeLeg(`sj:${entry.id}:${col.id}`, col.category === 'Dr' ? 'debit' : 'credit', amount, date, particulars, ref, 'Sales Journal'),
      });
    });
  });

  return [...crj, ...sjPostings];
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
      // On-account (credit) purchases credit Accounts Payable; cash/check
      // purchases credit Cash.
      const isOnAccount = p.paymentMethod !== 'Cash' && p.paymentMethod !== 'Check';
      const creditLabel = isOnAccount ? 'Accounts Payable' : 'Cash';
      const creditAcct = findAccountByLabel(creditLabel, accounts);
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
    // Mirror the Cash Receipts Journal rule: every purchase paid by any
    // cash-like method (Cash, Check, E-payments, …) is a cash disbursement.
    // Only "On Account" (accounts payable — not yet paid) and the empty
    // payment method used by the AP tab are excluded; those post to the CDJ
    // later, when they are settled via a check voucher or journal voucher.
    .filter(p => !!p.paymentMethod && p.paymentMethod !== 'On Account')
    .map(p => {
      // "Other Payments" stores its actual payment amount in exemptAmount
      // (amount is intentionally 0 there). Use that field so those cash
      // payments are not silently omitted from the CDJ.
      const isOtherPayment = p.vatType === 'non-vat' && (Number(p.amount) || 0) === 0
        && (Number(p.exemptAmount) || 0) > 0;
      const net = isOtherPayment ? (Number(p.exemptAmount) || 0) : (Number(p.amount) || 0);
      const tax = Number(p.inputTax) || 0;
      const total = net + tax;
      const wht = p.withholdingOption === 'with' ? (Number(p.whtAmount) || 0) : 0;
      const cashDue = total - wht;
      if (cashDue <= 0) return null;

      const entry: JournalEntry = {
        id: `cdj-auto:purchase:${p.id}`,
        auto: true,
        autoSource: 'Purchases',
        values: {
          date: p.date,
          payee: p.supplierName,
          account_title: p.accountTitle || p.expenseType || 'Expense',
          amount: net > 0 ? two(net) : '',
          cash: two(cashDue),
          input_tax: tax > 0 ? two(tax) : '',
          wht: wht > 0 ? two(wht) : '',
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

// Mirrors syncCashDisbursementsJournal: regenerate auto-posted Sales Journal
// entries from credit/on-account sales, then merge with the user's manual
// entries (auto entries never overwrite manual ones).
export function syncSalesJournal(client: Client): Client {
  const autoEntries = incomeSalesToSjEntries(client);
  const manualEntries = (client.sjEntries || []).filter((e: any) => !e.auto);

  if (autoEntries.length === 0 && manualEntries.length === (client.sjEntries || []).length) {
    return client; // nothing auto-generated, nothing to strip — avoid needless churn
  }

  return { ...client, sjEntries: [...autoEntries, ...manualEntries] };
}

// Mirrors syncSalesJournal for the Cash Receipts Journal: regenerate
// auto-posted CRJ entries from cash-basis Income History sales (every sale
// that is neither Credit Card nor On Account), then merge with the user's
// manual CRJ entries (auto entries never overwrite manual ones). Without
// this sync, cash receipts exist only on the CRJ screen — they never reach
// client.crjEntries and therefore never post to the General Ledger.
export function syncCashReceiptsJournal(client: Client): Client {
  const autoEntries = incomeSalesToCrjEntries(client);
  const manualEntries = (client.crjEntries || []).filter((e: any) => !e.auto);

  if (autoEntries.length === 0 && manualEntries.length === (client.crjEntries || []).length) {
    return client; // nothing auto-generated, nothing to strip — avoid needless churn
  }

  return { ...client, crjEntries: [...autoEntries, ...manualEntries] };
}

// ---------------------------------------------------------------------------
// Source: Purchases Journal auto-entries — every purchase made on account
// (payment method other than Cash/Check, i.e. On Account or Accounts Payable)
// is a credit purchase and belongs in the Purchases Journal. Cash/Check
// purchases are posted to the CDJ via cashPurchasesToCdjEntries instead.
// Auto PJ rows display in the journal but are excluded from GL posting below
// (postPurchases already carries every purchase to the ledger), mirroring how
// CDJ auto rows are handled.
// ---------------------------------------------------------------------------

function purchasesToPjEntries(client: Client): JournalEntry[] {
  return (client.purchases || [])
    .filter(p => p.paymentMethod !== 'Cash' && p.paymentMethod !== 'Check')
    .map(p => {
      const net = Number(p.amount) || 0;
      const exemptZero = (Number(p.exemptAmount) || 0) + (Number(p.zeroRatedAmount) || 0);
      const tax = Number(p.inputTax) || 0;
      const wht = p.withholdingOption === 'with' ? (Number(p.whtAmount) || 0) : 0;
      const totalOwed = net + exemptZero + tax;
      if (totalOwed <= 0) return null;
      const accountsPayable = totalOwed - wht;

      const entry: JournalEntry = {
        id: `pj-auto:purchase:${p.id}`,
        auto: true,
        autoSource: 'Purchases',
        values: {
          date: p.date,
          supplier_name: p.supplierName || '',
          supplier_tin: p.supplierTin || '',
          invoice_no: p.invoiceNo || '',
          description: p.transactionDetails || p.expenseType || p.accountTitle || '',
          net_purchase: net > 0 ? two(net) : '',
          exempt_zero_rated: exemptZero > 0 ? two(exemptZero) : '',
          input_tax: tax > 0 ? two(tax) : '',
          debit_account: p.accountTitle || p.expenseType || 'Purchases',
          accounts_payable: accountsPayable > 0 ? two(accountsPayable) : '',
          withholding_tax: wht > 0 ? two(wht) : '',
        },
      };
      return entry;
    })
    .filter((e): e is JournalEntry => e !== null);
}

// Purchases on account belong in the Purchases Journal. Regenerate auto-posted
// rows from on-account purchases, then merge with the user's manual entries
// (auto entries never overwrite manual ones).
export function syncPurchasesJournal(client: Client): Client {
  const autoEntries = purchasesToPjEntries(client);
  const manualEntries = (client.pjEntries || []).filter((e: any) => !e.auto);

  if (autoEntries.length === 0 && manualEntries.length === (client.pjEntries || []).length) {
    return client; // nothing auto-generated, nothing to strip — avoid needless churn
  }

  return { ...client, pjEntries: [...autoEntries, ...manualEntries] };
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

  // The General Ledger must depend on the journals themselves. Income History
  // is used to populate the CRJ/SJ screens, but it is NOT a direct GL source.
  // Once a transaction is in the Cash Receipts Journal or Sales Journal, the
  // GL posts that journal entry — exactly as it appears in the journal.
  const crj = postColumnarJournal(
    client.crjEntries || [],
    useColumns(client.crjColumns, DEFAULT_CRJ_COLUMNS),
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

  // Sales Journal has a system Account Title column, plus AR/Credit Card
  // debit columns and Output VAT/Revenue credit columns. Post the actual
  // journal rows rather than rebuilding them from Income History.
  const sjPostings: Posting[] = [];
  const sjColumns = useColumns(client.sjColumns, DEFAULT_SJ_COLUMNS);

  (client.sjEntries || []).forEach(entry => {
    const v = entry.values || {};
    const date = String(v.date || '');
    const ref = String(v.invoice_no || v.reference || '');
    const particulars = String(v.customer_name || v.account_title || 'Sales');

    const num = (id: string) => {
      const n = parseFloat(String(v[id] ?? '').replace(/,/g, ''));
      return Number.isFinite(n) ? Math.abs(n) : 0;
    };

    // Accounts Receivable / Credit Card are debit columns in the SJ.
    const ar = num('accounts_receivable');
    if (ar > 0) {
      const acct = findAccountByLabel('Accounts Receivable', accounts);
      if (acct) {
        sjPostings.push({
          accountId: acct.id,
          entry: makeLeg(`sj:${entry.id}:ar`, 'debit', ar, date, particulars, ref, 'Sales Journal'),
        });
      }
    }

    const cc = num('credit_card');
    if (cc > 0) {
      const acct = findAccountByLabel('Credit Card', accounts)
        || findAccountByLabel('Credit Card Receivable', accounts);
      if (acct) {
        sjPostings.push({
          accountId: acct.id,
          entry: makeLeg(`sj:${entry.id}:cc`, 'debit', cc, date, particulars, ref, 'Sales Journal'),
        });
      }
    }

    // Revenue is determined by the Account Title actually recorded in the SJ.
    const revenueAmount = num('net_of_vat') + num('exempt_zero_rated');
    const revenueAccount = findAccountByLabel(String(v.account_title || 'Sales'), accounts);
    if (revenueAccount && revenueAmount > 0) {
      sjPostings.push({
        accountId: revenueAccount.id,
        entry: makeLeg(`sj:${entry.id}:revenue`, 'credit', revenueAmount, date, particulars, ref, 'Sales Journal'),
      });
    }

    const outputVat = num('output_vat');
    if (outputVat > 0) {
      const acct = findAccountByLabel('Output Tax', accounts)
        || findAccountByLabel('Output VAT', accounts);
      if (acct) {
        sjPostings.push({
          accountId: acct.id,
          entry: makeLeg(`sj:${entry.id}:outputvat`, 'credit', outputVat, date, particulars, ref, 'Sales Journal'),
        });
      }
    }

    // Any additional user-configured numeric SJ columns also post to their
    // corresponding Chart of Accounts account.
    const systemIds = new Set(DEFAULT_SJ_COLUMNS.map(c => c.id));
    sjColumns
      .filter(c => !systemIds.has(c.id) && c.type === 'number' && c.category !== 'None')
      .forEach(col => {
        const amount = num(col.id);
        if (amount === 0) return;
        const acct = findAccountByLabel(col.name, accounts);
        if (!acct) return;
        sjPostings.push({
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

  // Post every CDJ row, including source-derived auto rows. Auto CDJ rows
  // are the bridge for cash-basis Purchases, cash Journal Vouchers, Check
  // Vouchers, and Miscellaneous Payments. Filtering them out here meant the
  // CDJ screen could show the transaction while the General Ledger captured
  // none of it.
  const cdjEntries = client.cdjEntries || [];
  const cdj = postColumnarJournal(
    cdjEntries,
    useColumns(client.cdjColumns, DEFAULT_CDJ_COLUMNS),
    accounts,
    {
      prefix: 'cdj',
      sourceLabel: 'Cash Disbursements Journal',
      dateCol: 'date',
      particularsCol: 'payee',
      overrides: CDJ_LABEL_OVERRIDES,
    }
  );
  // The Sundry Account Title / Amount Dr(Cr) pair has no fixed Dr/Cr column
  // category (its side depends on the amount's sign), so it's posted
  // separately rather than through postColumnarJournal's per-column loop.
  // Manual CDJ sundries use the normal journal values. Auto CDJ rows also use
  // the legacy account_title/amount pair, so include those rows here as well.
  // Their values are read-only/source-derived and are not present in the
  // normalized account-column ids.
  const cdjSundry = postCdjSundry(cdjEntries, accounts);
  const cdjInputTax = postCdjAutoInputTax(cdjEntries, accounts);

  // Auto PJ rows are display-only (on-account purchases already reach the
  // ledger via postPurchases); only manually-typed PJ rows post here.
  const manualPj = (client.pjEntries || []).filter(e => !e.auto);
  const pj = postColumnarJournal(manualPj, useColumns(client.pjColumns, DEFAULT_PJ_COLUMNS), accounts, {
    prefix: 'pj',
    sourceLabel: 'Purchases Journal',
    dateCol: 'date',
    particularsCol: 'supplier_name',
    refCol: 'invoice_no',
    overrides: PJ_LABEL_OVERRIDES,
  });

  const jv = postJournalVouchers(client);
  const purchases = postPurchases(client, accounts);

  return [...crj, ...sjPostings, ...cdj, ...cdjSundry, ...cdjInputTax, ...pj, ...jv, ...purchases];
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
      // Sourced live from the matching Chart of Accounts entry so the
      // General Ledger's beginning balance always reflects the opening
      // balance set on the Chart of Accounts, not just $0.
      openingBalance: acct?.openingBalance ?? existingRecord?.openingBalance ?? 0,
      normalSide: acct?.normalSide || existingRecord?.normalSide || getNormalSide(acct?.type || ''),
    });
  });

  // Nothing changed and nothing to sync — avoid a needless object churn.
  if (nextGlAccounts.length === 0 && existing.length === 0) return client;

  return { ...client, glAccounts: nextGlAccounts };
}

// ---- Run 010 / T010: recurring JE + JV templates + attachments ----

export type RecurrenceFrequency = 'Monthly' | 'Quarterly' | 'Annually';

export function addIntervalISO(dateStr: string, frequency: RecurrenceFrequency): string {
  const d = new Date(dateStr + 'T00:00:00');
  if (frequency === 'Monthly') d.setMonth(d.getMonth() + 1);
  else if (frequency === 'Quarterly') d.setMonth(d.getMonth() + 3);
  else d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split('T')[0];
}

export interface JVTemplateLine { accountId: string; accountName: string; debit: number; credit: number; }
export interface JVTemplate { id: string; name: string; memo: string; lines: JVTemplateLine[]; createdAt: string; }

const jvTemplateKey = (clientId: string) => `capot.jvTemplates.${clientId}`;

export function loadJVTemplates(clientId: string): JVTemplate[] {
  try { return JSON.parse(localStorage.getItem(jvTemplateKey(clientId)) || '[]'); } catch { return []; }
}

export function persistJVTemplates(clientId: string, templates: JVTemplate[]) {
  try { localStorage.setItem(jvTemplateKey(clientId), JSON.stringify(templates)); } catch { /* ignore quota */ }
}

export interface JVAttachment { name: string; size: number; type: string; dataUrl?: string; }

/** Read an uploaded file into an attachment record. Files under 500KB are stored as data URLs on the voucher; larger files keep metadata only. */
export async function readJVAttachment(file: File): Promise<JVAttachment> {
  const base: JVAttachment = { name: file.name, size: file.size, type: file.type };
  if (file.size <= 500 * 1024) {
    base.dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }
  return base;
}
