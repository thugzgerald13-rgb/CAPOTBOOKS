// Multi-currency helpers (Run 026 / T026): FX rates, conversion, realized FX gain/loss.
// Rates are per-1-unit-of-currency in PHP. Persisted override in localStorage.

export interface FxRate { code: string; symbol: string; name: string; rateToPhp: number; }

export const DEFAULT_FX_RATES: FxRate[] = [
  { code: 'PHP', symbol: '₱', name: 'Philippine Peso', rateToPhp: 1 },
  { code: 'USD', symbol: '$', name: 'US Dollar', rateToPhp: 56.5 },
  { code: 'EUR', symbol: '€', name: 'Euro', rateToPhp: 61.2 },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen', rateToPhp: 0.38 },
  { code: 'SGD', symbol: 'S$', name: 'Singapore Dollar', rateToPhp: 42.1 },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar', rateToPhp: 36.8 },
  { code: 'GBP', symbol: '£', name: 'British Pound', rateToPhp: 71.5 },
  { code: 'HKD', symbol: 'HK$', name: 'Hong Kong Dollar', rateToPhp: 7.2 },
];

const RATES_KEY = 'capot.fxRates';

export function getFxRates(): FxRate[] {
  try {
    const overrides = JSON.parse(localStorage.getItem(RATES_KEY) || '{}');
    return DEFAULT_FX_RATES.map(r => ({ ...r, rateToPhp: overrides[r.code] ?? r.rateToPhp }));
  } catch { return DEFAULT_FX_RATES; }
}
export function setFxRate(code: string, rateToPhp: number) {
  try {
    const cur = JSON.parse(localStorage.getItem(RATES_KEY) || '{}');
    cur[code] = rateToPhp;
    localStorage.setItem(RATES_KEY, JSON.stringify(cur));
  } catch { /* ignore */ }
}
export function getFxRate(code: string): number { return getFxRates().find(r => r.code === code)?.rateToPhp || 1; }

/** Convert an amount from one currency to PHP (or between currencies via PHP cross). */
export function convertAmount(amount: number, fromCode: string, toCode = 'PHP'): number {
  const inPhp = amount * getFxRate(fromCode);
  const toRate = getFxRate(toCode);
  return toRate > 0 ? inPhp / toRate : inPhp;
}

/** Realized FX gain (positive) or loss (negative) when settling a foreign-currency amount. */
export function computeFxGainLoss(foreignAmount: number, rateAtTransaction: number, rateAtSettlement: number, currencyCode = 'USD'): number {
  const phpAtTxn = foreignAmount * rateAtTransaction;
  const phpAtSettlement = foreignAmount * rateAtSettlement;
  return phpAtSettlement - phpAtTxn; // positive = gain
}

export const DEFAULT_BASE_CURRENCY = 'PHP';
export function getBaseCurrency(): string { return localStorage.getItem('capot.baseCurrency') || DEFAULT_BASE_CURRENCY; }
export function setBaseCurrency(code: string) { try { localStorage.setItem('capot.baseCurrency', code); } catch { /* ignore */ } }
