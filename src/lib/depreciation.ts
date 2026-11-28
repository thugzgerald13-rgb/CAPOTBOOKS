// Fixed-asset depreciation helpers (Run 018 / T018): three depreciation methods,
// disposal gain/loss, and auto-JE builder for depreciation expense.
// Compliant with PAS 16 / PFRS for SMEs Sec. 17:
// - Day-accurate pro-rata monthly proration (no +1 full-month overstatement)
// - DDB with automatic switch to straight-line so assets depreciate cleanly to salvage value
// - Stops depreciation at disposalDate for disposed assets

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

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

/** Exact pro-rata months elapsed between two dates (fractional for partial months). */
function exactMonthsBetween(start: Date, end: Date): number {
  if (end <= start) return 0;
  let months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
  const startDim = daysInMonth(start.getFullYear(), start.getMonth());
  const endDim = daysInMonth(end.getFullYear(), end.getMonth());
  const startFrac = (start.getDate() - 1) / startDim;
  const endFrac = end.getDate() / endDim;
  months += endFrac - startFrac;
  return Math.max(0, months);
}

/**
 * Annual depreciation for a given year index (0 = first 12 months of service), by method.
 * Declining balance uses 2× straight-line rate (DDB) with automatic switch to straight-line
 * when straight-line over remaining useful life yields higher depreciation, ensuring the
 * asset reaches salvage value by the end of its useful life.
 */
export function annualDepreciation(asset: DepreciableAsset, yearIndex: number): number {
  const cost = Number(asset.cost) || 0;
  const salvage = Math.max(0, Number(asset.salvageValue) || 0);
  const life = Number(asset.usefulLifeYears) || 0;
  if (life <= 0 || yearIndex < 0 || yearIndex >= life) return 0;
  const base = Math.max(0, cost - salvage);
  if (base <= 0) return 0;

  const method = asset.method || 'straight-line';
  if (method === 'straight-line') return base / life;

  if (method === 'declining-balance') {
    const rate = 2 / life;
    let nbv = cost;
    for (let y = 0; y <= yearIndex; y++) {
      const remainingYears = life - y;
      const ddb = nbv * rate;
      const slRemaining = remainingYears > 0 ? (nbv - salvage) / remainingYears : 0;
      const charge = Math.max(0, Math.min(nbv - salvage, Math.max(ddb, slRemaining)));
      if (y === yearIndex) return charge;
      nbv = Math.max(salvage, nbv - charge);
    }
    return 0;
  }

  // sum-of-years digits
  const soy = (life * (life + 1)) / 2;
  return base * ((life - yearIndex) / soy);
}

/** Accumulated depreciation as of a date (pro-rata by exact days/months, capped at depreciable base and disposal date). */
export function accumulatedDepreciation(asset: DepreciableAsset, asOfISO: string): number {
  const cost = Number(asset.cost) || 0;
  const salvage = Math.max(0, Number(asset.salvageValue) || 0);
  const life = Number(asset.usefulLifeYears) || 0;
  if (life <= 0 || !asset.datePurchased) return 0;

  const purchase = new Date(asset.datePurchased + 'T00:00:00');
  let effectiveEnd = new Date(asOfISO + 'T00:00:00');
  if (isNaN(purchase.getTime()) || isNaN(effectiveEnd.getTime())) return 0;

  if (asset.disposed && asset.disposalDate) {
    const disp = new Date(asset.disposalDate + 'T00:00:00');
    if (!isNaN(disp.getTime()) && disp < effectiveEnd) {
      effectiveEnd = disp;
    }
  }
  if (effectiveEnd <= purchase) return 0;

  const totalMonths = Math.min(exactMonthsBetween(purchase, effectiveEnd), life * 12);
  const fullMonths = Math.floor(totalMonths);
  const fractionalMonth = totalMonths - fullMonths;

  let acc = 0;
  for (let m = 0; m < fullMonths; m++) {
    const yearIndex = Math.floor(m / 12);
    acc += annualDepreciation(asset, yearIndex) / 12;
  }
  if (fractionalMonth > 0 && fullMonths < life * 12) {
    const yearIndex = Math.floor(fullMonths / 12);
    acc += (annualDepreciation(asset, yearIndex) / 12) * fractionalMonth;
  }
  return Math.min(Math.round(acc * 100) / 100, Math.max(0, cost - salvage));
}

/** Net book value as of a date. */
export function netBookValue(asset: DepreciableAsset, asOfISO: string): number {
  return (Number(asset.cost) || 0) - accumulatedDepreciation(asset, asOfISO);
}

/** Gain (positive) or loss (negative) on disposal: proceeds − net book value at disposal date. */
export function disposalGainLoss(asset: DepreciableAsset, disposalDateISO: string, proceeds: number): number {
  return proceeds - netBookValue(asset, disposalDateISO);
}

export interface JournalLine { accountName: string; debit: number; credit: number; }

/** Build the auto-JE for period depreciation: Dr Depreciation Expense / Cr Accumulated Depreciation. */
export function buildDepreciationJE(assets: DepreciableAsset[], asOfISO: string): JournalLine[] {
  let total = 0;
  const yearMatch = String(asOfISO || '').match(/^(\d{4})/);
  const priorYearEndISO = yearMatch
    ? `${Number(yearMatch[1]) - 1}-12-31`
    : `${new Date(asOfISO + 'T00:00:00').getFullYear() - 1}-12-31`;
  for (const a of assets) {
    // Include assets disposed during the current year up to their disposalDate;
    // skip assets already disposed in a prior year.
    if (a.disposed && a.disposalDate && a.disposalDate <= priorYearEndISO) continue;
    const accNow = accumulatedDepreciation(a, asOfISO);
    const accPrior = accumulatedDepreciation(a, priorYearEndISO);
    total += Math.max(0, accNow - accPrior);
  }
  total = Math.round(total * 100) / 100;
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
