/**
 * src/lib/pos/tax.ts — Pharmacy POS discount & VAT calculation helpers.
 *
 * Philippine retail-pharmacy rules (as configured for the pilot):
 *  - Senior Citizens and Persons With Disability (PWD) get a 20% discount on
 *    qualified medicines; the discounted sale is treated as VAT-exempt.
 *  - Discounts are recorded at transaction level with the customer's ID type
 *    and ID/reference number for the BIR discount record.
 *  - Regular sales default to VAT Exempt for pharmacy goods; a VATable option
 *    applies 12% output tax on a VAT-inclusive gross amount.
 *
 * NOTE: Final senior/PWD discount rates, VAT treatment and exempt/zero-rated
 * mapping must be reconciled with the pharmacy's approved accounting and
 * compliance requirements before production. Adjust POS_CONFIG below (or wire
 * it to System Config) rather than scattering constants through the UI.
 */
import type { PosCustomerType, PosLine, PosTransaction, PosVatType } from './types';

export const POS_CONFIG = {
  seniorDiscountRate: 0.2,   // 20% Senior Citizen discount (final rate per BIR onboarding)
  pwdDiscountRate: 0.2,      // 20% PWD discount (final rate per BIR onboarding)
  vatRate: 0.12,             // Philippine standard VAT
  defaultVatType: 'VAT Exempt' as PosVatType,
};

export interface SaleTotals {
  gross: number;
  discountRate: number;
  discountAmount: number;
  discountSenior: number;
  discountPwd: number;
  vatAmount: number;
  exemptAmount: number;
  /** Amount the customer owes after discount and VAT treatment. */
  net: number;
  vatType: PosVatType;
  lines: PosLine[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function discountRateFor(type: PosCustomerType): number {
  if (type === 'senior') return POS_CONFIG.seniorDiscountRate;
  if (type === 'pwd') return POS_CONFIG.pwdDiscountRate;
  return 0;
}

/**
 * Compute cart totals. Discount applies to gross; SC/PWD lines are VAT-exempt.
 * VATable regular sales are de-VATted: netOfVat = gross / (1 + vatRate).
 */
export function computeSaleTotals(
  lines: PosLine[],
  customerType: PosCustomerType,
  vatType: PosVatType,
): SaleTotals {
  const rate = discountRateFor(customerType);
  const discounted = customerType !== 'regular';
  const effectiveVat: PosVatType = discounted ? 'VAT Exempt' : vatType;

  let gross = 0;
  let discountAmount = 0;
  const enriched = lines.map((line) => {
    const grossLine = round2(line.qty * line.unitPrice);
    const discountLine = discounted ? round2(grossLine * rate) : 0;
    const netLine = round2(grossLine - discountLine);
    gross += grossLine;
    discountAmount += discountLine;
    return { ...line, grossLine, discountLine, netLine, vatType: effectiveVat };
  });

  gross = round2(gross);
  discountAmount = round2(discountAmount);

  let vatAmount = 0;
  let exemptAmount = 0;
  let net = gross;

  if (effectiveVat === 'VATable') {
    const divisor = 1 + POS_CONFIG.vatRate;
    const netOfVat = round2(gross / divisor);
    vatAmount = round2(gross - netOfVat);
    net = gross; // customer pays VAT-inclusive gross; journal records net + output tax
  } else if (effectiveVat === 'VAT Exempt') {
    exemptAmount = round2(gross - discountAmount);
    net = round2(gross - discountAmount);
  } else {
    net = round2(gross - discountAmount);
  }

  return {
    gross,
    discountRate: rate,
    discountAmount,
    discountSenior: customerType === 'senior' ? discountAmount : 0,
    discountPwd: customerType === 'pwd' ? discountAmount : 0,
    vatAmount,
    exemptAmount,
    net,
    vatType: effectiveVat,
    lines: enriched,
  };
}

/** Philippine peso formatting (₱1,234.56). */
export function peso(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `₱${v.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/**
 * Build the summary description written to the linked `sales` journal row.
 * Keeps the invoice/income register readable without embedding the whole cart.
 */
export function saleDescription(tx: PosTransaction): string {
  const itemCount = tx.lines.reduce((s, l) => s + l.qty, 0);
  const customerLabel =
    tx.customer.type === 'senior' ? 'Senior Citizen' : tx.customer.type === 'pwd' ? 'PWD' : 'Cash sale';
  return `POS ${tx.receiptNo} — ${tx.lines.length} line(s), ${itemCount} unit(s) — ${customerLabel}`;
}
