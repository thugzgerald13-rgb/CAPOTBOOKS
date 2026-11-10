import type { GeneralLedgerAccount, GeneralLedgerEntry } from '../types';

export type AgingPartyType = 'customer' | 'supplier';

export interface AgingBucket {
  id: 'current' | 'days31to60' | 'days61to90' | 'over90';
  label: string;
  range: string;
  amount: number;
  count: number;
}

export interface AgingOpenItem {
  id: string;
  partyName: string;
  accountTitle: string;
  invoiceDate: string;
  reference: string;
  particulars: string;
  originalAmount: number;
  appliedAmount: number;
  outstanding: number;
  ageDays: number;
  bucketId: AgingBucket['id'];
  bucketLabel: string;
}

export interface AgingPartySummary {
  partyName: string;
  current: number;
  days31to60: number;
  days61to90: number;
  over90: number;
  total: number;
  openItems: number;
  unappliedCredits: number;
}

export interface AgingReportResult {
  buckets: AgingBucket[];
  items: AgingOpenItem[];
  parties: AgingPartySummary[];
  totalOutstanding: number;
  totalUnappliedCredits: number;
  openItemCount: number;
  partyCount: number;
}

interface WorkingItem extends AgingOpenItem {
  remaining: number;
  normalizedReference: string;
}

const BUCKET_DEFS = [
  { id: 'current', label: 'Current', range: '0–30 days' },
  { id: 'days31to60', label: '31–60 days', range: '31–60 days' },
  { id: 'days61to90', label: '61–90 days', range: '61–90 days' },
  { id: 'over90', label: '90+ days', range: '90+ days' },
] as const;

const amountOf = (value: unknown): number => {
  const cleaned = String(value ?? '').replace(/[₱,\s]/g, '');
  const amount = Number.parseFloat(cleaned);
  return Number.isFinite(amount) ? Math.abs(amount) : 0;
};

const entryDate = (entry: GeneralLedgerEntry): string =>
  String(entry.dateDr || entry.dateCr || '').slice(0, 10);

const entryReference = (entry: GeneralLedgerEntry): string =>
  String(entry.refDr || entry.refCr || '').trim();

const entryParticulars = (entry: GeneralLedgerEntry): string =>
  String(entry.particularsDr || entry.particularsCr || '').trim();

const normalizeRef = (value: string): string => value.trim().toLocaleLowerCase();

function parseLocalDate(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function daysBetween(fromISO: string, toISO: string): number {
  const from = parseLocalDate(fromISO);
  const to = parseLocalDate(toISO);
  if (!from || !to) return 0;
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 86400000));
}

function isControlAccount(account: GeneralLedgerAccount, partyType: AgingPartyType): boolean {
  const title = String(account.accountTitle || '').toLowerCase();
  const nameMatches = partyType === 'customer'
    ? /accounts?\s*receivable|trade\s*receivable|trade\s*debtors?|debtors?/.test(title)
    : /accounts?\s*payable|trade\s*payable|trade\s*creditors?|creditors?/.test(title);
  const hasTaggedEntries = (account.entries || []).some(entry =>
    entry.partyType === partyType && !!String(entry.partyName || '').trim()
  );
  return nameMatches || hasTaggedEntries;
}

function bucketForAge(days: number): AgingBucket['id'] {
  if (days <= 30) return 'current';
  if (days <= 60) return 'days31to60';
  if (days <= 90) return 'days61to90';
  return 'over90';
}

/**
 * Builds a party-level aging from the tagged A/R or A/P General Ledger control
 * account entries. Invoice-side postings create open items; opposite-side
 * postings are applied to the matching invoice reference first, then FIFO.
 * This avoids counting the original invoice amount after receipts/payments.
 */
export function buildAgingReport(
  accounts: GeneralLedgerAccount[],
  partyType: AgingPartyType,
  asOfDate: string
): AgingReportResult {
  const normalSide: 'debit' | 'credit' = partyType === 'customer' ? 'debit' : 'credit';
  const controlAccounts = (accounts || []).filter(account => isControlAccount(account, partyType));
  const byPartyAccount = new Map<string, { partyName: string; accountTitle: string; entries: GeneralLedgerEntry[] }>();

  controlAccounts.forEach(account => {
    (account.entries || []).forEach(entry => {
      const partyName = String(entry.partyName || '').trim();
      const date = entryDate(entry);
      if (entry.partyType !== partyType || !partyName || !date || date > asOfDate) return;
      const key = `${String(account.accountId || account.id)}::${partyName.toLocaleLowerCase()}`;
      const group = byPartyAccount.get(key) || { partyName, accountTitle: account.accountTitle, entries: [] };
      group.entries.push(entry);
      byPartyAccount.set(key, group);
    });
  });

  const allOpenItems: WorkingItem[] = [];
  const unappliedByParty = new Map<string, number>();

  byPartyAccount.forEach(group => {
    const transactions = group.entries.slice().sort((a, b) => {
      const dateOrder = entryDate(a).localeCompare(entryDate(b));
      if (dateOrder !== 0) return dateOrder;
      const aNormal = normalSide === 'debit' ? amountOf(a.debit) : amountOf(a.credit);
      const bNormal = normalSide === 'debit' ? amountOf(b.debit) : amountOf(b.credit);
      if (aNormal > 0 && bNormal === 0) return -1;
      if (bNormal > 0 && aNormal === 0) return 1;
      return String(a.id).localeCompare(String(b.id));
    });

    const openItems: WorkingItem[] = [];
    let unapplied = 0;

    transactions.forEach(entry => {
      const normalAmount = normalSide === 'debit' ? amountOf(entry.debit) : amountOf(entry.credit);
      const settlementAmount = normalSide === 'debit' ? amountOf(entry.credit) : amountOf(entry.debit);
      const date = entryDate(entry);
      const reference = entryReference(entry);

      if (normalAmount > 0) {
        const ageDays = daysBetween(date, asOfDate);
        const bucketId = bucketForAge(ageDays);
        openItems.push({
          id: `${String(entry.id)}:${group.accountTitle}`,
          partyName: group.partyName,
          accountTitle: group.accountTitle,
          invoiceDate: date,
          reference,
          particulars: entryParticulars(entry),
          originalAmount: normalAmount,
          appliedAmount: 0,
          outstanding: normalAmount,
          ageDays,
          bucketId,
          bucketLabel: BUCKET_DEFS.find(bucket => bucket.id === bucketId)!.label,
          remaining: normalAmount,
          normalizedReference: normalizeRef(reference),
        });
      }

      if (settlementAmount > 0) {
        let remainingPayment = settlementAmount;
        const paymentRef = normalizeRef(reference);
        const orderedTargets = openItems
          .filter(item => item.remaining > 0 && paymentRef && item.normalizedReference === paymentRef)
          .concat(openItems.filter(item => item.remaining > 0 && (!paymentRef || item.normalizedReference !== paymentRef)));

        for (const item of orderedTargets) {
          if (remainingPayment <= 0.000001) break;
          const applied = Math.min(item.remaining, remainingPayment);
          item.remaining -= applied;
          item.appliedAmount += applied;
          item.outstanding = item.remaining;
          remainingPayment -= applied;
        }
        if (remainingPayment > 0.000001) unapplied += remainingPayment;
      }
    });

    allOpenItems.push(...openItems.filter(item => item.remaining > 0.005));
    if (unapplied > 0.005) {
      const key = group.partyName.toLocaleLowerCase();
      unappliedByParty.set(key, (unappliedByParty.get(key) || 0) + unapplied);
    }
  });

  const bucketMap = new Map<string, AgingBucket>(BUCKET_DEFS.map(bucket => [bucket.id, {
    ...bucket,
    amount: 0,
    count: 0,
  }]));

  const partyMap = new Map<string, AgingPartySummary>();
  allOpenItems.forEach(item => {
    const bucket = bucketMap.get(item.bucketId)!;
    bucket.amount += item.outstanding;
    bucket.count += 1;
    const key = item.partyName.toLocaleLowerCase();
    const summary = partyMap.get(key) || {
      partyName: item.partyName,
      current: 0,
      days31to60: 0,
      days61to90: 0,
      over90: 0,
      total: 0,
      openItems: 0,
      unappliedCredits: 0,
    };
    summary[item.bucketId] += item.outstanding;
    summary.total += item.outstanding;
    summary.openItems += 1;
    partyMap.set(key, summary);
  });

  unappliedByParty.forEach((amount, key) => {
    const summary = partyMap.get(key);
    if (summary) summary.unappliedCredits = amount;
    else {
      // Retain advance/overpayment balances even when no open invoice remains.
      const name = Array.from(byPartyAccount.values()).find(group => group.partyName.toLocaleLowerCase() === key)?.partyName || 'Unidentified party';
      partyMap.set(key, {
        partyName: name,
        current: 0,
        days31to60: 0,
        days61to90: 0,
        over90: 0,
        total: 0,
        openItems: 0,
        unappliedCredits: amount,
      });
    }
  });

  const buckets = Array.from(bucketMap.values());
  const parties = Array.from(partyMap.values()).sort((a, b) => a.partyName.localeCompare(b.partyName));
  const totalOutstanding = allOpenItems.reduce((sum, item) => sum + item.outstanding, 0);
  const totalUnappliedCredits = parties.reduce((sum, party) => sum + party.unappliedCredits, 0);
  const items = allOpenItems
    .map(({ remaining: _remaining, normalizedReference: _normalizedReference, ...item }) => item)
    .sort((a, b) => b.ageDays - a.ageDays || a.partyName.localeCompare(b.partyName) || a.invoiceDate.localeCompare(b.invoiceDate));

  return {
    buckets,
    items,
    parties,
    totalOutstanding,
    totalUnappliedCredits,
    openItemCount: items.length,
    partyCount: parties.length,
  };
}
