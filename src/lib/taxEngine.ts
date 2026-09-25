// Unified PH tax engine (Run 026 / T026): VAT (CREATE Law), withholding tax ATC schedule,
// percentage tax. Single source of truth for all tax computations.

export type VatType = 'VAT Registered' | 'VAT Exempt' | 'Zero-Rated' | 'Non-VAT';

export const VAT_RATE = 0.12; // CREATE Law: 12% (10% from 2027 per CREATE MORE)
export const PERCENTAGE_TAX_RATE = 0.03; // Non-VAT taxpayers (1% under CREATE MORE until 2027, then 3%)

export interface WhtAtcEntry { atc: string; description: string; rate: number; }

/** BIR withholding tax ATC schedule (common rates). */
export const WHT_ATC_SCHEDULE: WhtAtcEntry[] = [
  { atc: 'WC010', description: 'Rent — real property', rate: 0.05 },
  { atc: 'WC020', description: 'Rent — personal property', rate: 0.05 },
  { atc: 'WC030', description: 'Services (general)', rate: 0.02 },
  { atc: 'WC040', description: 'Contractor / subcontractor', rate: 0.01 },
  { atc: 'WC050', description: 'Professional fees (individual)', rate: 0.10 },
  { atc: 'WC060', description: 'Professional fees (corporate)', rate: 0.15 },
  { atc: 'WC070', description: 'Salaries / compensation (substituted)', rate: 0 },
  { atc: 'WC080', description: 'Suppliers (goods)', rate: 0.01 },
  { atc: 'WC090', description: 'Income payments to top 20K', rate: 0.01 },
  { atc: 'WC100', description: 'Credit card payments', rate: 0.005 },
  { atc: 'WI010', description: 'Interest — bank deposits', rate: 0.20 },
];

export function getWhtRate(atcCode: string): number {
  return WHT_ATC_SCHEDULE.find(a => a.atc.toLowerCase() === atcCode.toLowerCase())?.rate ?? 0;
}

export interface TaxBreakdown {
  gross: number;
  vatable: number;
  outputVat: number;
  vatExempt: number;
  zeroRated: number;
  wht: number;
  netReceivable: number;
}

/** Compute full tax breakdown for a sale given VAT type + ATC code. */
export function computeTaxBreakdown(gross: number, vatType: VatType, atcCode?: string): TaxBreakdown {
  const g = Number(gross) || 0;
  let vatable = 0, outputVat = 0, vatExempt = 0, zeroRated = 0;
  if (vatType === 'VAT Registered') { vatable = g / (1 + VAT_RATE); outputVat = g - vatable; }
  else if (vatType === 'VAT Exempt') { vatExempt = g; }
  else if (vatType === 'Zero-Rated') { zeroRated = g; vatable = g; }
  else { vatable = g; } // Non-VAT: no output VAT
  const wht = atcCode ? g * getWhtRate(atcCode) : 0;
  const netReceivable = g - wht;
  return { gross: g, vatable, outputVat, vatExempt, zeroRated, wht, netReceivable };
}

/** Input VAT from a purchase (VAT-registered supplier). */
export function computeInputVat(gross: number): number {
  const g = Number(gross) || 0;
  return g - g / (1 + VAT_RATE);
}

export const TAX_PERIODS = {
  monthlyVat: '2550M', quarterlyVat: '2550Q',
  quarterlyItr: '1701Q', annualItr: '1701',
  percentageTax: '2551Q', withholding: '1601-EQ',
};
