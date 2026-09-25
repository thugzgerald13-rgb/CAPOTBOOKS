// Customer CRM + VAT summary helpers for the Sales/Income page (Run 008 / T008).
// Derives a deduped customer list from recorded sales + the TIN library, with
// spend stats; click-to-fill the income form. VAT summary aggregates the
// loaded (paginated) sales rows by BIR VAT classification.

export interface CustomerSummary {
  key: string;
  tin: string;
  name: string;
  address: string;
  totalSpend: number;
  transactionCount: number;
  lastPurchase: string;
}

const normKey = (tin: string, name: string) => (tin || name || '').trim().toLowerCase();

/** Aggregate sales rows into per-customer summaries (most recent first). */
export function buildCustomerList(
  salesRows: Array<{ buyerTin?: string; buyerName?: string; buyerAddress?: string; amount?: number; date?: string }>,
  tinLibraryCustomers: Array<{ tin?: string; name?: string; address?: string }> = [],
): CustomerSummary[] {
  const map = new Map<string, CustomerSummary>();
  for (const row of salesRows) {
    const key = normKey(row.buyerTin || '', row.buyerName || '');
    if (!key) continue;
    const existing = map.get(key);
    const amount = Number(row.amount) || 0;
    if (existing) {
      existing.totalSpend += amount;
      existing.transactionCount += 1;
      if ((row.date || '') > existing.lastPurchase) existing.lastPurchase = row.date || '';
      if (!existing.address && row.buyerAddress) existing.address = row.buyerAddress;
    } else {
      map.set(key, {
        key,
        tin: row.buyerTin || '',
        name: row.buyerName || '',
        address: row.buyerAddress || '',
        totalSpend: amount,
        transactionCount: 1,
        lastPurchase: row.date || '',
      });
    }
  }
  // Merge in TIN-library customers with no sales yet
  for (const c of tinLibraryCustomers) {
    const key = normKey(c.tin || '', c.name || '');
    if (key && !map.has(key)) {
      map.set(key, { key, tin: c.tin || '', name: c.name || '', address: c.address || '', totalSpend: 0, transactionCount: 0, lastPurchase: '' });
    }
  }
  return [...map.values()].sort((a, b) => b.totalSpend - a.totalSpend);
}

export interface VatSummary {
  vatable: number;
  exempt: number;
  zeroRated: number;
  outputTax: number;
  total: number;
}

/** Aggregate loaded sales rows by VAT classification. */
export function vatSummary(salesRows: Array<{ vatType?: string; amount?: number; outputTax?: number }>): VatSummary {
  const out: VatSummary = { vatable: 0, exempt: 0, zeroRated: 0, outputTax: 0, total: 0 };
  for (const r of salesRows) {
    const amt = Number(r.amount) || 0;
    out.total += amt;
    out.outputTax += Number(r.outputTax) || 0;
    const t = (r.vatType || '').toLowerCase();
    if (t.includes('exempt')) out.exempt += amt;
    else if (t.includes('zero') || t.includes('0')) out.zeroRated += amt;
    else out.vatable += amt;
  }
  return out;
}

const money = (n: number) => `₱${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const formatMoney = money;
