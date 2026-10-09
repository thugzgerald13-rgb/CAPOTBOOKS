// eisBuilder.ts — Build & validate BIR EIS v2.01 invoice JSON from CAPOT
// BillingInvoice / Sale records. Pure functions, no I/O.
//
// EisUniqueId format (24 chars): TIN(9) + BranchCode(5) + YYYYMMDD(8) + Seq(2).
// Validation mirrors the BIR JSON validator on bir-eis.ph: TIN/branch format,
// EisUniqueId length, per-line math, VAT totals, and summary reconciliation.

import {
  EIS_VAT_RATE,
  EIS_BUYER_DETAIL_THRESHOLD_PHP,
  EIS_ISSUANCE_THRESHOLD_PHP,
  type BillingInvoiceLike,
  type BusinessProfileLike,
  type EisBuyer,
  type EisCorrectionCd,
  type EisDocType,
  type EisInvoiceJson,
  type EisLineItem,
  type EisSeller,
  type EisSummary,
  type EisTaxType,
  type EisTransClass,
} from './eisTypes';

// Re-export the structural types so callers import from one module.
export type {
  EisInvoiceJson, EisLineItem, EisSummary, EisSeller, EisBuyer,
  EisDocType, EisTransClass, EisCorrectionCd, EisTaxType,
  BillingInvoiceLike, BusinessProfileLike,
} from './eisTypes';

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

/** Strip dashes/spaces; keep 9 digits. Returns '' if invalid. */
export function normalizeTin(tin: string | undefined): string {
  const digits = String(tin || '').replace(/\D/g, '');
  return digits.length === 9 ? digits : '';
}

/** 5-digit branch code, zero-padded. '00000' = head office. */
export function normalizeBranchCode(branch: string | undefined): string {
  const digits = String(branch || '00000').replace(/\D/g, '').slice(0, 5);
  return digits.padStart(5, '0');
}

/** Walk-in / cash-sale buyer TIN per BIR convention. */
export const WALK_IN_TIN = '000000000';
export const WALK_IN_NAME = 'WALK-IN CUSTOMER';

/**
 * Build a 24-char EisUniqueId.
 *   TIN(9) + Branch(5) + YYYYMMDD(8) + sequence(2, 01–99)
 */
export function buildEisUniqueId(
  tin: string,
  branchCode: string,
  issueDate: string, // YYYY-MM-DD
  sequence: number,   // 1–99 within the day
): string {
  const t = normalizeTin(tin) || '000000000';
  const b = normalizeBranchCode(branchCode);
  const d = String(issueDate || '').replace(/\D/g, '').slice(0, 8).padEnd(8, '0');
  const seq = String(Math.max(1, Math.min(99, Math.floor(sequence)))).padStart(2, '0');
  return `${t}${b}${d}${seq}`;
}

export function decodeEisUniqueId(id: string) {
  if (id.length !== 24) return null;
  return {
    tin: `${id.slice(0, 3)}-${id.slice(3, 6)}-${id.slice(6, 9)}-${id.slice(9, 14)}`,
    branchCode: id.slice(9, 14),
    date: `${id.slice(14, 18)}-${id.slice(18, 20)}-${id.slice(20, 22)}`,
    sequence: id.slice(22, 24),
  };
}

// ---------------------------------------------------------------------------
// VAT split — from a single gross amount + vatType into vatable/zero/exempt
// ---------------------------------------------------------------------------

export function splitVat(
  grossAmount: number,
  vatType: string,
): { vatable: number; zeroRated: number; exempt: number; outputTax: number; netOfVat: number } {
  const amt = Number(grossAmount) || 0;
  const vt = String(vatType || '').toLowerCase();
  if (vt.includes('zero')) {
    return { vatable: 0, zeroRated: amt, exempt: 0, outputTax: 0, netOfVat: amt };
  }
  if (vt.includes('exempt') || vt.includes('non-vat') || vt.includes('nonvat')) {
    return { vatable: 0, zeroRated: 0, exempt: amt, outputTax: 0, netOfVat: amt };
  }
  // Vatable (default): gross amount is VAT-inclusive.
  const netOfVat = amt / (1 + EIS_VAT_RATE);
  const outputTax = amt - netOfVat;
  return { vatable: netOfVat, zeroRated: 0, exempt: 0, outputTax, netOfVat };
}

// ---------------------------------------------------------------------------
// Seller from BusinessProfile
// ---------------------------------------------------------------------------

export function buildSeller(profile: BusinessProfileLike): EisSeller {
  const addressLines = [profile.substreet, profile.street, profile.barangay, profile.district]
    .filter(Boolean) as string[];
  const vatRegistered = String((profile as any).taxpayerClassification || '').toLowerCase().includes('vat');
  return {
    TIN: normalizeTin(profile.tin) || '000000000',
    BranchCode: normalizeBranchCode((profile as any).branchCode),
    RegisteredName: profile.registeredName || profile.tradeName || profile.name || '',
    TradeName: profile.tradeName,
    VatRegistered: vatRegistered || (profile as any).vatRegistered !== false,
    Email: profile.email,
    Phone: profile.phone,
    PermitNumber: (profile as any).atpPermitNumber,
    SeriesStart: (profile as any).atpSeriesStart,
    SeriesEnd: (profile as any).atpSeriesEnd,
    Address: {
      UnitFloorBuilding: addressLines.slice(0, 1).join(' '),
      Street: addressLines.slice(1, 2).join(' '),
      Barangay: profile.barangay,
      District: profile.district,
      City: profile.city || addressLines[addressLines.length - 1] || '',
      ZipCode: profile.zipCode,
    },
  };
}

// ---------------------------------------------------------------------------
// Buyer from invoice customer fields
// ---------------------------------------------------------------------------

export function buildBuyer(inv: BillingInvoiceLike): EisBuyer {
  const tin = normalizeTin(inv.customerTin);
  const isWalkIn = !tin || tin === '000000000' || !String(inv.customerName || '').trim();
  return {
    TIN: isWalkIn ? WALK_IN_TIN : tin,
    BranchCode: normalizeBranchCode((inv as any).customerBranchCode),
    Name: isWalkIn ? WALK_IN_NAME : String(inv.customerName || '').toUpperCase(),
    Address: inv.customerAddress,
  };
}

// ---------------------------------------------------------------------------
// Line items — CAPOT invoices are single-line today; preserve the gross amount
// as one line and tag it with the correct TaxType. Multi-line is supported
// when `inv.lineItems` is present (future Billing enhancement).
// ---------------------------------------------------------------------------

function taxTypeFor(vatType: string): EisTaxType {
  const vt = String(vatType || '').toLowerCase();
  if (vt.includes('zero')) return 'Z';
  if (vt.includes('exempt') || vt.includes('non-vat') || vt.includes('nonvat')) return 'E';
  return 'V';
}

export function buildLineItems(inv: BillingInvoiceLike): EisLineItem[] {
  if (Array.isArray((inv as any).lineItems) && (inv as any).lineItems.length > 0) {
    return (inv as any).lineItems.map((l: any, i: number) => ({
      NBSeq: i + 1,
      ItemCode: l.itemCode,
      ItemDesc: l.description || l.itemDesc || '',
      Qty: Number(l.qty) || 1,
      UnitOfMeasure: l.unitOfMeasure,
      UnitCost: Number(l.unitPrice) || Number(l.unitCost) || 0,
      Amount: Number(l.amount) || (Number(l.qty) || 1) * (Number(l.unitPrice) || 0),
      TaxType: taxTypeFor(l.vatType || inv.vatType),
      TaxRate: taxTypeFor(l.vatType || inv.vatType) === 'V' ? EIS_VAT_RATE : 0,
    }));
  }
  const taxType = taxTypeFor(inv.vatType);
  const gross = Number(inv.amount) || 0;
  return [{
    NBSeq: 1,
    ItemDesc: inv.description || `Sale of ${taxType === 'E' ? 'exempt ' : ''}goods/services`,
    Qty: 1,
    UnitCost: gross,
    Amount: gross,
    TaxType: taxType,
    TaxRate: taxType === 'V' ? EIS_VAT_RATE : 0,
  }];
}

// ---------------------------------------------------------------------------
// Summary — reconciles line items into the four EIS buckets + VAT + amount due
// ---------------------------------------------------------------------------

export function buildSummary(lines: EisLineItem[], currency = 'PHP'): EisSummary {
  let vatable = 0, zero = 0, exempt = 0;
  for (const l of lines) {
    if (l.TaxType === 'V') vatable += Number(l.Amount) || 0;
    else if (l.TaxType === 'Z') zero += Number(l.Amount) || 0;
    else exempt += Number(l.Amount) || 0;
  }
  // Vatable line amounts are VAT-inclusive → split out the 12% output tax.
  const netVatable = vatable / (1 + EIS_VAT_RATE);
  const outputTax = vatable - netVatable;
  const round2 = (n: number) => Math.round(n * 100) / 100;
  const amountDue = round2(vatable + zero + exempt);
  const wht = Number((lines as any)._withholdingTotal || 0);
  return {
    TotalVatableSales: round2(netVatable),
    TotalZeroRatedSales: round2(zero),
    TotalExemptSales: round2(exempt),
    TotalVAT: round2(outputTax),
    TotalAmountNetOfVAT: round2(netVatable + zero + exempt),
    AmountDue: amountDue,
    ...(wht > 0 ? { WithholdingTax: round2(wht), NetPayable: round2(amountDue - wht) } : {}),
    Currency: currency,
  };
}

// ---------------------------------------------------------------------------
// Full invoice builder
// ---------------------------------------------------------------------------

export interface BuildEisInvoiceInput {
  invoice: BillingInvoiceLike;
  sellerProfile: BusinessProfileLike;
  sequence: number;                 // 1–99, per day per taxpayer
  docType?: EisDocType;             // default SI
  transClass?: EisTransClass;       // default '1' local
  correctionCd?: EisCorrectionCd;   // default '0' original
  originalEisUniqueId?: string;
  issueTime?: string;               // HH:mm:ss, default now
}

export function buildEisInvoice(input: BuildEisInvoiceInput): EisInvoiceJson {
  const { invoice, sellerProfile, sequence } = input;
  const seller = buildSeller(sellerProfile);
  const buyer = buildBuyer(invoice);
  const lines = buildLineItems(invoice);
  const summary = buildSummary(lines);
  const issueDate = String(invoice.date || new Date().toISOString().slice(0, 10));
  const eisUniqueId = buildEisUniqueId(seller.TIN, seller.BranchCode, issueDate, sequence);
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const issueTime = input.issueTime || `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const docType = input.docType || 'SI';
  const documentLabel = docType === 'OR' ? 'Official Receipt'
    : docType === 'CR' ? 'Credit Note'
    : docType === 'DR' ? 'Debit Note'
    : 'Sales Invoice';
  return {
    EisUniqueId: eisUniqueId,
    DocType: docType,
    TransClass: input.transClass || '1',
    CorrectionCd: input.correctionCd || '0',
    ...(input.originalEisUniqueId ? { OriginalEisUniqueId: input.originalEisUniqueId } : {}),
    IssueDate: issueDate,
    IssueTime: issueTime,
    InvoiceNumber: invoice.invoiceNo || invoice.ref || '',
    DocumentLabel: documentLabel,
    Seller: seller,
    Buyer: buyer,
    LineItems: lines,
    Summary: summary,
    PaymentTerms: invoice.paymentType,
    Remarks: invoice.description,
    DeliveryMethod: (input as any).deliveryMethod || 'email',
  };
}

// ---------------------------------------------------------------------------
// Validation — catches SYN004 (schema), ERR002 (TIN/branch), ERR004 (math)
// ---------------------------------------------------------------------------

export interface EisValidationIssue {
  field: string;
  code: 'SYN004' | 'ERR002' | 'ERR004' | 'ERR001';
  message: string;
}

export function validateEisInvoice(inv: EisInvoiceJson): EisValidationIssue[] {
  const issues: EisValidationIssue[] = [];
  if (inv.EisUniqueId.length !== 24) {
    issues.push({ field: 'EisUniqueId', code: 'SYN004', message: `EisUniqueId must be 24 chars (got ${inv.EisUniqueId.length})` });
  }
  if (!/^\d{9}$/.test(inv.Seller.TIN)) {
    issues.push({ field: 'Seller.TIN', code: 'ERR002', message: 'Seller TIN must be 9 digits' });
  }
  if (!/^\d{5}$/.test(inv.Seller.BranchCode)) {
    issues.push({ field: 'Seller.BranchCode', code: 'ERR002', message: 'Seller BranchCode must be 5 digits' });
  }
  if (!/^\d{9}$/.test(inv.Buyer.TIN)) {
    issues.push({ field: 'Buyer.TIN', code: 'ERR002', message: 'Buyer TIN must be 9 digits (use 000000000 for walk-in)' });
  }
  if (!inv.InvoiceNumber.trim()) {
    issues.push({ field: 'InvoiceNumber', code: 'SYN004', message: 'InvoiceNumber is required' });
  }
  if (!inv.Seller.RegisteredName.trim()) {
    issues.push({ field: 'Seller.RegisteredName', code: 'SYN004', message: 'Seller RegisteredName is required' });
  }
  if (inv.LineItems.length === 0) {
    issues.push({ field: 'LineItems', code: 'SYN004', message: 'At least one line item is required' });
  }
  // Per-line math: Amount ≈ Qty * UnitCost (within rounding)
  inv.LineItems.forEach((l, i) => {
    const expected = (Number(l.Qty) || 0) * (Number(l.UnitCost) || 0);
    if (Math.abs(expected - (Number(l.Amount) || 0)) > 0.02) {
      issues.push({ field: `LineItems[${i}].Amount`, code: 'ERR004', message: `Line ${l.NBSeq}: Amount ${l.Amount} != Qty × UnitCost ${expected.toFixed(2)}` });
    }
  });
  // Summary reconciliation
  const s = inv.Summary;
  const computed = buildSummary(inv.LineItems, s.Currency);
  if (Math.abs(computed.TotalVAT - s.TotalVAT) > 0.02) {
    issues.push({ field: 'Summary.TotalVAT', code: 'ERR004', message: `TotalVAT ${s.TotalVAT} != computed ${computed.TotalVAT.toFixed(2)}` });
  }
  if (Math.abs(computed.AmountDue - s.AmountDue) > 0.02) {
    issues.push({ field: 'Summary.AmountDue', code: 'ERR004', message: `AmountDue ${s.AmountDue} != computed ${computed.AmountDue.toFixed(2)}` });
  }
  if (inv.CorrectionCd !== '0' && !inv.OriginalEisUniqueId) {
    issues.push({ field: 'OriginalEisUniqueId', code: 'SYN004', message: 'Replacement/cancellation requires OriginalEisUniqueId' });
  }
  // RMC 98-2026 IV.4(b): a valid e-invoice must be delivered to the buyer
  // by an electronic means (email, online viewing, QR, app, web platform).
  if (!inv.DeliveryMethod || inv.DeliveryMethod === 'printed_copy') {
    issues.push({ field: 'DeliveryMethod', code: 'ERR001', message: 'E-invoice must be delivered electronically (email/online/QR/app/web); printed copy alone is not valid under RMC 98-2026 IV.4' });
  }
  // RR 7-2024: buyer TIN/name/address required above PHP 1,000.
  const amountDue = Number(inv.Summary.AmountDue) || 0;
  if (amountDue > EIS_BUYER_DETAIL_THRESHOLD_PHP && (inv.Buyer.TIN === '000000000' || inv.Buyer.Name === 'WALK-IN CUSTOMER' || !String(inv.Buyer.Address || '').trim())) {
    issues.push({ field: 'Buyer', code: 'ERR002', message: `Sale above ₱${EIS_BUYER_DETAIL_THRESHOLD_PHP.toLocaleString()} requires buyer TIN, name and address (walk-in coding not allowed)` });
  }
  // EOPT s.237: invoice required for sales ≥ PHP 500 (VAT-registered: every sale).
  if (amountDue >= EIS_ISSUANCE_THRESHOLD_PHP && !inv.InvoiceNumber.trim()) {
    issues.push({ field: 'InvoiceNumber', code: 'SYN004', message: `Sales ≥ ₱${EIS_ISSUANCE_THRESHOLD_PHP} require an invoice number; VAT-registered sellers invoice every sale` });
  }
  // Seller must carry the VAT-registration flag.
  if (inv.Seller.VatRegistered && inv.Summary.TotalVAT === 0 && inv.Summary.TotalVatableSales > 0) {
    issues.push({ field: 'Summary.TotalVAT', code: 'ERR004', message: 'VAT-registered seller with vatable sales must report 12% output VAT' });
  }
  return issues;
}
