// Accounts Payable aging (Run 009 / T009). Buckets unpaid supplier bills
// (paymentMethod === 'On Account') by age in days from invoice date.
// Parity: Xero / QuickBooks AP aging summary.

export interface ApAgingBucket { label: string; amount: number; count: number; days: string; }
export interface ApAgingResult { buckets: ApAgingBucket[]; total: number; count: number; }

export function computeApAging(purchases: Array<{ paymentMethod?: string; date?: string; amount?: number }>, todayISO: string): ApAgingResult {
  const today = new Date(todayISO);
  const buckets: ApAgingBucket[] = [
    { label: 'Current', days: '≤30d', amount: 0, count: 0 },
    { label: '31–60 days', days: '31–60', amount: 0, count: 0 },
    { label: '61–90 days', days: '61–90', amount: 0, count: 0 },
    { label: 'Over 90 days', days: '90+', amount: 0, count: 0 },
  ];
  let total = 0, count = 0;
  for (const p of purchases) {
    if (p.paymentMethod !== 'On Account') continue;
    const amt = Number(p.amount) || 0;
    if (!p.date) { buckets[0].amount += amt; buckets[0].count++; total += amt; count++; continue; }
    const days = Math.floor((today.getTime() - new Date(String(p.date).slice(0, 10)).getTime()) / 86400000);
    total += amt; count++;
    if (days <= 30) { buckets[0].amount += amt; buckets[0].count++; }
    else if (days <= 60) { buckets[1].amount += amt; buckets[1].count++; }
    else if (days <= 90) { buckets[2].amount += amt; buckets[2].count++; }
    else { buckets[3].amount += amt; buckets[3].count++; }
  }
  return { buckets, total, count };
}

export const formatMoney = (n: number) => `₱${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
