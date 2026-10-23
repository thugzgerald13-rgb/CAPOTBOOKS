// Fixed-asset depreciation helpers (Run 018 / T018): three depreciation methods,
// disposal gain/loss, and auto-JE builder for depreciation expense.

export type DepreciationMethod = 'straight-line' | 'declining-balance' | 'sum-of-years';

export interface DepreciableAsset {
  id: string;
  cost: number;
  salvageValue?: number;
  usefulLifeYears: number;
  datePurchased: string;
  method?: DepreciationMethod;
  disposed?: boolean;
  disposalDate?: string;
  disposalProceeds?: number;
}

const monthsBetween = (a: Date, b: Date) => (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());

/** Annual depreciation for a given year index (0 = purchase year), by method. Declining balance uses 2× straight-line rate (DDB). */
export function annualDepreciation(asset: DepreciableAsset, yearIndex: number): number {
  const cost = asset.cost || 0;
  const salvage = asset.salvageValue || 0;
  const life = asset.usefulLifeYears || 0;
  if (life <= 0 || yearIndex < 0 || yearIndex >= life) return 0;
  const base = Math.max(0, cost - salvage);
  const method = asset.method || 'straight-line';
  if (method === 'straight-line') return base / life;
  if (method === 'declining-balance') {
    const rate = 2 / life;
    let nbv = cost;
    for (let y = 0; y < yearIndex; y++) nbv = Math.max(salvage, nbv - nbv * rate);
    return Math.max(0, Math.min(nbv - salvage, nbv * rate));
  }
  // sum-of-years digits
  const soy = (life * (life + 1)) / 2;
  return base * ((life - yearIndex) / soy);
}

/** Accumulated depreciation as of a date (prorated by month, capped at depreciable base). */
export function accumulatedDepreciation(asset: DepreciableAsset, asOfISO: string): number {
  const cost = asset.cost || 0;
  const salvage = asset.salvageValue || 0;
  const life = asset.usefulLifeYears || 0;
  if (life <= 0 || !asset.datePurchased) return 0;
  const purchase = new Date(asset.datePurchased + 'T00:00:00');
  const asOf = new Date(asOfISO + 'T00:00:00');
  if (isNaN(purchase.getTime()) || asOf < purchase) return 0;
  const totalMonths = Math.min(monthsBetween(purchase, asOf) + 1, life * 12);
  let acc = 0;
  for (let m = 0; m < totalMonths; m++) {
    const yearIndex = Math.floor(m / 12);
    acc += annualDepreciation(asset, yearIndex) / 12;
  }
  return Math.min(acc, cost - salvage);
}

/** Net book value as of a date. */
export function netBookValue(asset: DepreciableAsset, asOfISO: string): number {
  return (asset.cost || 0) - accumulatedDepreciation(asset, asOfISO);
}

/** Gain (positive) or loss (negative) on disposal: proceeds − net book value at disposal date. */
export function disposalGainLoss(asset: DepreciableAsset, disposalDateISO: string, proceeds: number): number {
  return proceeds - netBookValue(asset, disposalDateISO);
}

export interface JournalLine { accountName: string; debit: number; credit: number; }

/** Build the auto-JE for period depreciation: Dr Depreciation Expense / Cr Accumulated Depreciation. Returns lines (one per asset class aggregated). */
export function buildDepreciationJE(assets: DepreciableAsset[], asOfISO: string): JournalLine[] {
  let total = 0;
  const yearMatch = String(asOfISO || '').match(/^(\d{4})/);
  const priorYearEndISO = yearMatch
    ? `${Number(yearMatch[1]) - 1}-12-31`
    : `${new Date(asOfISO + 'T00:00:00').getFullYear() - 1}-12-31`;
  for (const a of assets) {
    if (a.disposed) continue;
    const accNow = accumulatedDepreciation(a, asOfISO);
    const accPrior = accumulatedDepreciation(a, priorYearEndISO);
    total += Math.max(0, accNow - accPrior);
  }
  if (total <= 0) return [];
  return [
    { accountName: 'Depreciation Expense', debit: total, credit: 0 },
    { accountName: 'Accumulated Depreciation', debit: 0, credit: total },
  ];
}

export const DEPRECIATION_METHODS: { value: DepreciationMethod; label: string }[] = [
  { value: 'straight-line', label: 'Straight-Line' },
  { value: 'declining-balance', label: 'Declining Balance (2×)' },
  { value: 'sum-of-years', label: 'Sum-of-Years Digits' },
];
