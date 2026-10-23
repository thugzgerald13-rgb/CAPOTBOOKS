// Unified PH tax & multi-workflow engine:
// - VAT (CREATE / EOPT Law): VAT Registered (12%), Non-VAT (Percentage Tax), VAT Exempt, Zero-Rated
// - Taxpayer Classifications: Individual (Sole Prop, Professional, Mixed Income) & Non-Individual (MSME Corp, Regular Corp, OPC, Partnership, GPP, Cooperative)
// - EOPT Act (RA 11976) Taxpayer Size Tiers: Micro, Small, Medium, Large + tiered surcharge/interest penalties
// - Income Tax Regimes:
//     * Individual: 8% Flat Income Tax, Graduated + Itemized, Graduated + 40% OSD (on Gross Sales/Receipts)
//     * Corporate: 20% CREATE MSME (Itemized / 40% OSD on Gross Income), 25% Regular RCIT (Itemized / 40% OSD), MCIT (2%), 0% GPP/Exempt, 5% Special GIE
// - Business Types / Industries: Retail, General Services, Manufacturing, Construction + Private vs Government Withholding

import type {
  Client,
  BusinessProfile,
  ClientIndustry,
  VatRegistrationType,
  TaxpayerClassificationType,
  TaxpayerSubClassification,
  TaxpayerSizeTier,
  IncomeTaxRegime,
  DeductionMethod,
  TaxFormCode,
  TaxDeadline,
} from '../types';

export type VatType = 'VAT Registered' | 'VAT Exempt' | 'Zero-Rated' | 'Non-VAT';

export const VAT_RATE = 0.12; // 12% Value-Added Tax (Sec. 106/108 NIRC)
export const PERCENTAGE_TAX_RATE = 0.03; // Default 3% Non-VAT Percentage Tax (Sec. 116 NIRC)
export const PERCENTAGE_TAX_CONCESSIONAL_RATE = 0.01; // 1% CREATE Law concessional rate
export const GOVERNMENT_FINAL_VAT_RATE = 0.05; // 5% Final VAT Withholding on Government Sales (Form 1600-VT / WV010)
export const INDIVIDUAL_8_PERCENT_RATE = 0.08; // 8% Flat Income Tax rate in lieu of Graduated ITR + 2551Q
export const INDIVIDUAL_EXEMPT_THRESHOLD = 250_000; // First ₱250,000 exempt under TRAIN Law
export const VAT_THRESHOLD = 3_000_000; // ₱3,000,000 VAT threshold under TRAIN / EOPT Law
export const OSD_RATE = 0.40; // 40% Optional Standard Deduction (Sec. 34(L) NIRC)
export const CORP_MSME_RATE = 0.20; // 20% CREATE Law MSME Corporate Income Tax rate
export const CORP_REGULAR_RATE = 0.25; // 25% Regular Corporate Income Tax (RCIT) rate
export const CORP_MSME_NET_INCOME_LIMIT = 5_000_000; // ≤ ₱5M net taxable income for 20% MSME rate
export const CORP_MSME_ASSETS_LIMIT = 100_000_000; // ≤ ₱100M total assets (excluding land) for 20% MSME rate
export const MCIT_REGULAR_RATE = 0.02; // 2% Minimum Corporate Income Tax (Sec. 27(E) NIRC)
export const MCIT_RELIEF_RATE = 0.01; // 1% CREATE temporary MCIT rate

export interface WhtAtcEntry {
  atc: string;
  description: string;
  rate: number;
  category?: 'individual' | 'corporate' | 'both' | 'government';
}

/** BIR Expanded & Final Withholding Tax ATC Schedule. */
export const WHT_ATC_SCHEDULE: WhtAtcEntry[] = [
  { atc: 'WC010', description: 'Rent — real property', rate: 0.05, category: 'both' },
  { atc: 'WC020', description: 'Rent — personal property', rate: 0.05, category: 'both' },
  { atc: 'WC030', description: 'Services (general)', rate: 0.02, category: 'both' },
  { atc: 'WC040', description: 'Contractor / subcontractor', rate: 0.01, category: 'both' },
  { atc: 'WC050', description: 'Professional fees (individual)', rate: 0.10, category: 'individual' },
  { atc: 'WC060', description: 'Professional fees (corporate)', rate: 0.15, category: 'corporate' },
  { atc: 'WC070', description: 'Salaries / compensation (substituted)', rate: 0, category: 'individual' },
  { atc: 'WC080', description: 'Suppliers (goods)', rate: 0.01, category: 'both' },
  { atc: 'WC090', description: 'Income payments to top 20K / TWA', rate: 0.01, category: 'both' },
  { atc: 'WC100', description: 'Credit card payments', rate: 0.005, category: 'both' },
  { atc: 'WI010', description: 'Interest — bank deposits', rate: 0.20, category: 'both' },
  { atc: 'WI011', description: 'Professional fees (individual ≤ ₱3M, 5%)', rate: 0.05, category: 'individual' },
  { atc: 'WC011', description: 'Professional fees (corporate ≤ ₱720K, 10%)', rate: 0.10, category: 'corporate' },
  { atc: 'WI158', description: 'Purchase of goods — Top Withholding Agent (individual)', rate: 0.01, category: 'individual' },
  { atc: 'WC158', description: 'Purchase of goods — Top Withholding Agent (corporate)', rate: 0.01, category: 'corporate' },
  { atc: 'WI160', description: 'Purchase of services — Top Withholding Agent (individual)', rate: 0.02, category: 'individual' },
  { atc: 'WC160', description: 'Purchase of services — Top Withholding Agent (corporate)', rate: 0.02, category: 'corporate' },
  { atc: 'WI640', description: 'Government money payments — purchase of goods (individual)', rate: 0.01, category: 'government' },
  { atc: 'WC640', description: 'Government money payments — purchase of goods (corporate)', rate: 0.01, category: 'government' },
  { atc: 'WI157', description: 'Government money payments — purchase of services (individual)', rate: 0.02, category: 'government' },
  { atc: 'WC157', description: 'Government money payments — purchase of services (corporate)', rate: 0.02, category: 'government' },
  { atc: 'WV010', description: 'Government 5% Final VAT Withholding on Goods', rate: 0.05, category: 'government' },
  { atc: 'WV020', description: 'Government 5% Final VAT Withholding on Services', rate: 0.05, category: 'government' },
];

export function getWhtRate(atcCode: string): number {
  if (!atcCode) return 0;
  return WHT_ATC_SCHEDULE.find(a => a.atc.toLowerCase() === atcCode.trim().toLowerCase())?.rate ?? 0;
}

/** Normalize VatRegistrationType ('vat' | 'non-vat' | 'exempt' | 'zero-rated') and VatType display labels. */
export function normalizeVatRegistrationType(
  raw?: VatRegistrationType | VatType | string | null,
): VatRegistrationType {
  const v = (raw ?? '').toString().trim().toLowerCase();
  if (v === 'vat' || v === 'vat registered' || v === 'vatable') return 'vat';
  if (v === 'exempt' || v === 'vat exempt' || v === 'vat-exempt') return 'exempt';
  if (v === 'zero-rated' || v === 'zero rated' || v === 'zerorated') return 'zero-rated';
  if (v === 'non-vat' || v === 'non vat' || v === 'nonvat' || v === 'percentage') return 'non-vat';
  return 'vat';
}

export function vatRegistrationToLabel(reg?: VatRegistrationType | VatType | string | null): VatType {
  const norm = normalizeVatRegistrationType(reg);
  switch (norm) {
    case 'vat':
      return 'VAT Registered';
    case 'exempt':
      return 'VAT Exempt';
    case 'zero-rated':
      return 'Zero-Rated';
    case 'non-vat':
      return 'Non-VAT';
  }
}

export interface TaxBreakdown {
  gross: number;
  vatable: number;
  outputVat: number;
  vatExempt: number;
  zeroRated: number;
  wht: number;
  govFinalVat?: number;
  netReceivable: number;
}

/**
 * Compute full tax breakdown for a sale given VAT type + optional ATC code + optional client category.
 * Handles VAT Registered (12%), Non-VAT, VAT Exempt, and Zero-Rated, plus Government 5% Final VAT when applicable.
 */
export function computeTaxBreakdown(
  gross: number,
  vatType: VatType | VatRegistrationType,
  atcCode?: string,
  options?: { isGovernmentCounterparty?: boolean },
): TaxBreakdown {
  const g = Math.max(0, Number(gross) || 0);
  const label = vatRegistrationToLabel(vatType);
  let vatable = 0;
  let outputVat = 0;
  let vatExempt = 0;
  let zeroRated = 0;

  if (label === 'VAT Registered') {
    vatable = g / (1 + VAT_RATE);
    outputVat = g - vatable;
  } else if (label === 'VAT Exempt') {
    vatExempt = g;
  } else if (label === 'Zero-Rated') {
    zeroRated = g;
    vatable = g;
  } else {
    // Non-VAT: no output VAT
    vatable = g;
  }

  // Withholding tax is computed on the tax base (vatable net of VAT when VAT-registered, otherwise gross)
  const whtBase = label === 'VAT Registered' ? vatable : g;
  const wht = atcCode ? whtBase * getWhtRate(atcCode) : 0;
  const govFinalVat =
    options?.isGovernmentCounterparty && label === 'VAT Registered'
      ? vatable * GOVERNMENT_FINAL_VAT_RATE
      : 0;
  const netReceivable = g - wht - govFinalVat;

  return {
    gross: g,
    vatable,
    outputVat,
    vatExempt,
    zeroRated,
    wht,
    ...(govFinalVat > 0 ? { govFinalVat } : {}),
    netReceivable,
  };
}

/**
 * Input VAT from a purchase (VAT-registered supplier).
 * Note: Only VAT-registered and Zero-Rated taxpayers can claim creditable Input VAT against Output VAT / refund.
 */
export function computeInputVat(
  gross: number,
  buyerVatType: VatRegistrationType | VatType = 'VAT Registered',
  supplierVatType: VatRegistrationType | VatType = 'VAT Registered',
): number {
  const g = Math.max(0, Number(gross) || 0);
  const buyerNorm = normalizeVatRegistrationType(buyerVatType);
  const supplierNorm = normalizeVatRegistrationType(supplierVatType);
  // Buyer cannot claim input VAT if buyer is Non-VAT or VAT Exempt, or if supplier is not VAT-registered
  if ((buyerNorm !== 'vat' && buyerNorm !== 'zero-rated') || supplierNorm !== 'vat') {
    return 0;
  }
  return g - g / (1 + VAT_RATE);
}

/**
 * Resolve EOPT Act (RA 11976) Taxpayer Size Tier based on annual gross sales or explicit override.
 * - Micro: < ₱3,000,000
 * - Small: ₱3,000,000 to < ₱20,000,000
 * - Medium: ₱20,000,000 to < ₱1,000,000,000
 * - Large: ≥ ₱1,000,000,000
 */
export function resolveTaxpayerSizeTier(
  annualGrossSales: number = 0,
  explicitTier?: TaxpayerSizeTier,
): TaxpayerSizeTier {
  if (explicitTier && ['micro', 'small', 'medium', 'large'].includes(explicitTier)) {
    return explicitTier;
  }
  const gross = Math.max(0, Number(annualGrossSales) || 0);
  if (gross < 3_000_000) return 'micro';
  if (gross < 20_000_000) return 'small';
  if (gross < 1_000_000_000) return 'medium';
  return 'large';
}

export interface EoptPenaltyBreakdown {
  taxDue: number;
  tier: TaxpayerSizeTier;
  surchargeRate: number;
  annualInterestRate: number;
  surcharge: number;
  interest: number;
  compromise: number;
  totalPenalty: number;
  totalAmountPayable: number;
}

/**
 * Compute late filing / payment penalties under EOPT Act (RA 11976):
 * - Micro & Small taxpayers: 10% reduced surcharge, 6% reduced annual interest (half of 12%), max ₱500 compromise penalty.
 * - Medium & Large taxpayers: 25% regular surcharge (50% if willful neglect/fraud), 12% annual interest.
 */
export function computeEoptPenalty(
  taxDue: number,
  daysLate: number,
  tier: TaxpayerSizeTier = 'micro',
  isWillfulOrFraud: boolean = false,
): EoptPenaltyBreakdown {
  const baseTax = Math.max(0, Number(taxDue) || 0);
  const days = Math.max(0, Math.floor(Number(daysLate) || 0));
  const isMicroOrSmall = tier === 'micro' || tier === 'small';
  const surchargeRate = isWillfulOrFraud ? 0.50 : isMicroOrSmall ? 0.10 : 0.25;
  const annualInterestRate = isMicroOrSmall ? 0.06 : 0.12;

  if (days <= 0 || baseTax <= 0) {
    return {
      taxDue: baseTax,
      tier,
      surchargeRate,
      annualInterestRate,
      surcharge: 0,
      interest: 0,
      compromise: 0,
      totalPenalty: 0,
      totalAmountPayable: baseTax,
    };
  }

  const surcharge = baseTax * surchargeRate;
  const interest = baseTax * annualInterestRate * (days / 365);
  const compromise = isMicroOrSmall ? 500 : baseTax <= 50_000 ? 1_000 : 3_000;
  const totalPenalty = surcharge + interest + compromise;

  return {
    taxDue: baseTax,
    tier,
    surchargeRate,
    annualInterestRate,
    surcharge,
    interest,
    compromise,
    totalPenalty,
    totalAmountPayable: baseTax + totalPenalty,
  };
}

/**
 * TRAIN Law Graduated Income Tax Table (Effective Jan 1, 2023 onwards for Individuals):
 * - 0 to ₱250,000: 0%
 * - Over ₱250,000 to ₱400,000: 15% of excess over ₱250,000
 * - Over ₱400,000 to ₱800,000: ₱22,500 + 20% of excess over ₱400,000
 * - Over ₱800,000 to ₱2,000,000: ₱102,500 + 25% of excess over ₱800,000
 * - Over ₱2,000,000 to ₱8,000,000: ₱402,500 + 30% of excess over ₱2,000,000
 * - Over ₱8,000,000: ₱2,202,500 + 35% of excess over ₱8,000,000
 */
export function computeTrainGraduatedTax(netTaxableIncome: number): number {
  const income = Math.max(0, Number(netTaxableIncome) || 0);
  if (income <= 250_000) return 0;
  if (income <= 400_000) return (income - 250_000) * 0.15;
  if (income <= 800_000) return 22_500 + (income - 400_000) * 0.20;
  if (income <= 2_000_000) return 102_500 + (income - 800_000) * 0.25;
  if (income <= 8_000_000) return 402_500 + (income - 2_000_000) * 0.30;
  return 2_202_500 + (income - 8_000_000) * 0.35;
}

export interface IncomeTaxComputationInput {
  grossSalesOrReceipts: number;
  costOfSalesOrServices?: number;
  itemizedOperatingExpenses?: number;
  nonOperatingIncome?: number;
  compensationIncome?: number; // For Mixed Income earners
  priorQuartersTaxPaid?: number;
  creditableWithholdingTax2307?: number;
  taxpayerClassification?: TaxpayerClassificationType;
  taxpayerSubClassification?: TaxpayerSubClassification;
  vatRegistrationType?: VatRegistrationType | VatType;
  incomeTaxRegime?: IncomeTaxRegime;
  deductionMethod?: DeductionMethod;
  totalAssetsExcludingLand?: number;
  yearsOfOperation?: number; // MCIT applies starting on the 4th taxable year of operations
  mcitRateOverride?: number;
}

export interface IncomeTaxComputationResult {
  classification: 'Individual' | 'Non-Individual';
  subClassification: TaxpayerSubClassification;
  regime: IncomeTaxRegime;
  deductionMethod: DeductionMethod;
  grossSalesOrReceipts: number;
  costOfSalesOrServices: number;
  grossIncomeFromOperations: number;
  nonOperatingIncome: number;
  totalGrossIncome: number;
  allowableDeduction: number;
  exemptThresholdApplied: number;
  netTaxableIncome: number;
  effectiveTaxRate: number;
  regularIncomeTaxDue: number;
  mcitDue: number;
  mcitApplied: boolean;
  compensationTaxDue: number;
  totalIncomeTaxDue: number;
  taxCreditsApplied: number;
  netIncomeTaxPayable: number;
  isExemptFromPercentageTax: boolean;
  applicableQuarterlyForm: '1701Q' | '1702Q';
  applicableAnnualForm: '1701' | '1701A' | '1702-RT' | '1702-EX' | '1702-MX';
}

/**
 * Compute Income Tax across all Individual and Non-Individual regimes, classifications, and deduction methods.
 */
export function computeIncomeTaxByRegime(
  input: IncomeTaxComputationInput,
): IncomeTaxComputationResult {
  const grossSales = Math.max(0, Number(input.grossSalesOrReceipts) || 0);
  const costOfSales = Math.max(0, Number(input.costOfSalesOrServices) || 0);
  const itemizedExpenses = Math.max(0, Number(input.itemizedOperatingExpenses) || 0);
  const nonOpIncome = Math.max(0, Number(input.nonOperatingIncome) || 0);
  const compensationIncome = Math.max(0, Number(input.compensationIncome) || 0);
  const priorPaid = Math.max(0, Number(input.priorQuartersTaxPaid) || 0);
  const cwt2307 = Math.max(0, Number(input.creditableWithholdingTax2307) || 0);
  const taxCreditsApplied = priorPaid + cwt2307;

  const isNonIndividual =
    input.taxpayerClassification === 'Non-Individual' ||
    (input.taxpayerSubClassification &&
      ['corporation_regular', 'corporation_msme', 'opc', 'partnership', 'gpp', 'cooperative'].includes(
        input.taxpayerSubClassification,
      )) ||
    (input.incomeTaxRegime && input.incomeTaxRegime.startsWith('corp_'));

  const classification: 'Individual' | 'Non-Individual' = isNonIndividual
    ? 'Non-Individual'
    : 'Individual';

  const vatReg = normalizeVatRegistrationType(input.vatRegistrationType);

  if (classification === 'Individual') {
    const subClass: TaxpayerSubClassification =
      input.taxpayerSubClassification &&
      ['sole_proprietor', 'professional', 'mixed_income'].includes(input.taxpayerSubClassification)
        ? input.taxpayerSubClassification
        : compensationIncome > 0
          ? 'mixed_income'
          : 'sole_proprietor';

    // Determine effective regime for Individual
    // Note: 8% Flat Income Tax is only valid for Non-VAT taxpayers with gross <= 3M.
    // If VAT-registered or gross > 3M, taxpayer must use Graduated rates.
    let regime: IncomeTaxRegime =
      input.incomeTaxRegime &&
      ['8_percent_flat', 'graduated_itemized', 'graduated_osd'].includes(input.incomeTaxRegime)
        ? input.incomeTaxRegime
        : input.deductionMethod === 'osd_40'
          ? 'graduated_osd'
          : input.deductionMethod === 'none_8_percent'
            ? '8_percent_flat'
            : 'graduated_itemized';

    if (regime === '8_percent_flat' && (vatReg === 'vat' || grossSales + nonOpIncome > VAT_THRESHOLD)) {
      // Automatically graduate to Graduated rates when VAT-registered or exceeding ₱3M VAT threshold
      regime = input.deductionMethod === 'osd_40' ? 'graduated_osd' : 'graduated_itemized';
    }

    const grossIncomeFromOperations = Math.max(0, grossSales - costOfSales);
    const totalGrossIncome = grossIncomeFromOperations + nonOpIncome;
    const compensationTaxDue =
      subClass === 'mixed_income' && compensationIncome > 0
        ? computeTrainGraduatedTax(compensationIncome)
        : 0;

    if (regime === '8_percent_flat') {
      // Under Sec. 24(A)(2)(b) NIRC:
      // - Purely self-employed/professional gets ₱250,000 exemption on gross sales/receipts + non-operating income.
      // - Mixed income earner gets ₱0 exemption on business income (since ₱250,000 is already built into the compensation tax table).
      const exemptThresholdApplied = subClass === 'mixed_income' ? 0 : INDIVIDUAL_EXEMPT_THRESHOLD;
      const taxableBase = Math.max(0, grossSales + nonOpIncome - exemptThresholdApplied);
      const regularIncomeTaxDue = taxableBase * INDIVIDUAL_8_PERCENT_RATE;
      const totalIncomeTaxDue = regularIncomeTaxDue + compensationTaxDue;

      return {
        classification,
        subClassification: subClass,
        regime: '8_percent_flat',
        deductionMethod: 'none_8_percent',
        grossSalesOrReceipts: grossSales,
        costOfSalesOrServices: costOfSales,
        grossIncomeFromOperations,
        nonOperatingIncome: nonOpIncome,
        totalGrossIncome,
        allowableDeduction: 0,
        exemptThresholdApplied,
        netTaxableIncome: taxableBase,
        effectiveTaxRate: INDIVIDUAL_8_PERCENT_RATE,
        regularIncomeTaxDue,
        mcitDue: 0,
        mcitApplied: false,
        compensationTaxDue,
        totalIncomeTaxDue,
        taxCreditsApplied,
        netIncomeTaxPayable: Math.max(0, totalIncomeTaxDue - taxCreditsApplied),
        isExemptFromPercentageTax: true,
        applicableQuarterlyForm: '1701Q',
        applicableAnnualForm: subClass === 'mixed_income' ? '1701' : '1701A',
      };
    }

    if (regime === 'graduated_osd') {
      // For Individual taxpayers (Sec. 34(L) NIRC), 40% OSD is based on Gross Sales / Gross Receipts
      const osdDeduction = grossSales * OSD_RATE;
      const netBusinessIncome = Math.max(0, grossSales - osdDeduction + nonOpIncome);
      const regularIncomeTaxDue =
        subClass === 'mixed_income' && compensationIncome > 0
          ? Math.max(
              0,
              computeTrainGraduatedTax(compensationIncome + netBusinessIncome) - compensationTaxDue,
            )
          : computeTrainGraduatedTax(netBusinessIncome);
      const totalIncomeTaxDue = regularIncomeTaxDue + compensationTaxDue;

      return {
        classification,
        subClassification: subClass,
        regime: 'graduated_osd',
        deductionMethod: 'osd_40',
        grossSalesOrReceipts: grossSales,
        costOfSalesOrServices: 0,
        grossIncomeFromOperations: grossSales,
        nonOperatingIncome: nonOpIncome,
        totalGrossIncome: grossSales + nonOpIncome,
        allowableDeduction: osdDeduction,
        exemptThresholdApplied: subClass === 'mixed_income' ? 0 : INDIVIDUAL_EXEMPT_THRESHOLD,
        netTaxableIncome: netBusinessIncome,
        effectiveTaxRate: netBusinessIncome > 0 ? regularIncomeTaxDue / netBusinessIncome : 0,
        regularIncomeTaxDue,
        mcitDue: 0,
        mcitApplied: false,
        compensationTaxDue,
        totalIncomeTaxDue,
        taxCreditsApplied,
        netIncomeTaxPayable: Math.max(0, totalIncomeTaxDue - taxCreditsApplied),
        isExemptFromPercentageTax: false,
        applicableQuarterlyForm: '1701Q',
        applicableAnnualForm: subClass === 'mixed_income' ? '1701' : '1701A',
      };
    }

    // Default Individual: Graduated + Itemized Deductions
    const allowableDeduction = costOfSales + itemizedExpenses;
    const netBusinessIncome = Math.max(0, grossSales - allowableDeduction + nonOpIncome);
    const regularIncomeTaxDue =
      subClass === 'mixed_income' && compensationIncome > 0
        ? Math.max(
            0,
            computeTrainGraduatedTax(compensationIncome + netBusinessIncome) - compensationTaxDue,
          )
        : computeTrainGraduatedTax(netBusinessIncome);
    const totalIncomeTaxDue = regularIncomeTaxDue + compensationTaxDue;

    return {
      classification,
      subClassification: subClass,
      regime: 'graduated_itemized',
      deductionMethod: 'itemized',
      grossSalesOrReceipts: grossSales,
      costOfSalesOrServices: costOfSales,
      grossIncomeFromOperations,
      nonOperatingIncome: nonOpIncome,
      totalGrossIncome,
      allowableDeduction: itemizedExpenses,
      exemptThresholdApplied: subClass === 'mixed_income' ? 0 : INDIVIDUAL_EXEMPT_THRESHOLD,
      netTaxableIncome: netBusinessIncome,
      effectiveTaxRate: netBusinessIncome > 0 ? regularIncomeTaxDue / netBusinessIncome : 0,
      regularIncomeTaxDue,
      mcitDue: 0,
      mcitApplied: false,
      compensationTaxDue,
      totalIncomeTaxDue,
      taxCreditsApplied,
      netIncomeTaxPayable: Math.max(0, totalIncomeTaxDue - taxCreditsApplied),
      isExemptFromPercentageTax: false,
      applicableQuarterlyForm: '1701Q',
      applicableAnnualForm: '1701',
    };
  }

  // ============================================================================
  // NON-INDIVIDUAL (CORPORATE / PARTNERSHIP / OPC / GPP / COOPERATIVE) WORKFLOWS
  // ============================================================================
  const subClass: TaxpayerSubClassification =
    input.taxpayerSubClassification &&
    ['corporation_regular', 'corporation_msme', 'opc', 'partnership', 'gpp', 'cooperative'].includes(
      input.taxpayerSubClassification,
    )
      ? input.taxpayerSubClassification
      : input.incomeTaxRegime === 'corp_gpp_exempt'
        ? 'gpp'
        : input.incomeTaxRegime === 'corp_20_msme' || input.incomeTaxRegime === 'corp_20_osd'
          ? 'corporation_msme'
          : 'corporation_regular';

  const grossIncomeFromOperations = Math.max(0, grossSales - costOfSales);
  const totalGrossIncome = grossIncomeFromOperations + nonOpIncome;

  // 1. General Professional Partnership (GPP) or Tax-Exempt Cooperative (1702-EX)
  if (
    subClass === 'gpp' ||
    subClass === 'cooperative' ||
    input.incomeTaxRegime === 'corp_gpp_exempt'
  ) {
    const netTaxableIncome = Math.max(0, totalGrossIncome - itemizedExpenses);
    return {
      classification,
      subClassification: subClass,
      regime: 'corp_gpp_exempt',
      deductionMethod: 'itemized',
      grossSalesOrReceipts: grossSales,
      costOfSalesOrServices: costOfSales,
      grossIncomeFromOperations,
      nonOperatingIncome: nonOpIncome,
      totalGrossIncome,
      allowableDeduction: itemizedExpenses,
      exemptThresholdApplied: 0,
      netTaxableIncome,
      effectiveTaxRate: 0,
      regularIncomeTaxDue: 0,
      mcitDue: 0,
      mcitApplied: false,
      compensationTaxDue: 0,
      totalIncomeTaxDue: 0,
      taxCreditsApplied,
      netIncomeTaxPayable: 0,
      isExemptFromPercentageTax: subClass === 'cooperative',
      applicableQuarterlyForm: '1702Q',
      applicableAnnualForm: '1702-EX',
    };
  }

  // 2. Special 5% Gross Income Earned (PEZA / Special Rate Corporation — 1702-MX)
  if (input.incomeTaxRegime === 'corp_special_5') {
    const specialTaxDue = totalGrossIncome * 0.05;
    return {
      classification,
      subClassification: subClass,
      regime: 'corp_special_5',
      deductionMethod: 'itemized',
      grossSalesOrReceipts: grossSales,
      costOfSalesOrServices: costOfSales,
      grossIncomeFromOperations,
      nonOperatingIncome: nonOpIncome,
      totalGrossIncome,
      allowableDeduction: 0,
      exemptThresholdApplied: 0,
      netTaxableIncome: totalGrossIncome,
      effectiveTaxRate: 0.05,
      regularIncomeTaxDue: specialTaxDue,
      mcitDue: 0,
      mcitApplied: false,
      compensationTaxDue: 0,
      totalIncomeTaxDue: specialTaxDue,
      taxCreditsApplied,
      netIncomeTaxPayable: Math.max(0, specialTaxDue - taxCreditsApplied),
      isExemptFromPercentageTax: true,
      applicableQuarterlyForm: '1702Q',
      applicableAnnualForm: '1702-MX',
    };
  }

  // 3. Regular (25%) or MSME (20% CREATE) Corporation / OPC / Taxable Partnership
  const usesOsd =
    input.deductionMethod === 'osd_40' ||
    input.incomeTaxRegime === 'corp_20_osd' ||
    input.incomeTaxRegime === 'corp_25_osd';

  // For Corporations (Sec. 34(L) NIRC), 40% OSD is computed on Gross Income (Gross Sales less Cost of Sales + Non-Op Income)
  const allowableDeduction = usesOsd ? totalGrossIncome * OSD_RATE : itemizedExpenses;
  const netTaxableIncome = Math.max(0, totalGrossIncome - allowableDeduction);

  const requestsMsme =
    subClass === 'corporation_msme' ||
    input.incomeTaxRegime === 'corp_20_msme' ||
    input.incomeTaxRegime === 'corp_20_osd';
  const assets = Number(input.totalAssetsExcludingLand ?? 0);
  const qualifiesForMsme20 =
    requestsMsme &&
    netTaxableIncome <= CORP_MSME_NET_INCOME_LIMIT &&
    assets <= CORP_MSME_ASSETS_LIMIT;

  const effectiveTaxRate = qualifiesForMsme20 ? CORP_MSME_RATE : CORP_REGULAR_RATE;
  const regime: IncomeTaxRegime = qualifiesForMsme20
    ? usesOsd
      ? 'corp_20_osd'
      : 'corp_20_msme'
    : usesOsd
      ? 'corp_25_osd'
      : 'corp_25_regular';

  const regularIncomeTaxDue = netTaxableIncome * effectiveTaxRate;

  // Minimum Corporate Income Tax (MCIT) applies starting on the 4th taxable year of operation
  const yearsOfOperation = Number(input.yearsOfOperation ?? 1);
  const mcitRate = input.mcitRateOverride ?? MCIT_REGULAR_RATE;
  const mcitDue = yearsOfOperation >= 4 ? totalGrossIncome * mcitRate : 0;
  const mcitApplied = mcitDue > regularIncomeTaxDue;
  const totalIncomeTaxDue = Math.max(regularIncomeTaxDue, mcitDue);

  return {
    classification,
    subClassification: subClass,
    regime,
    deductionMethod: usesOsd ? 'osd_40' : 'itemized',
    grossSalesOrReceipts: grossSales,
    costOfSalesOrServices: costOfSales,
    grossIncomeFromOperations,
    nonOperatingIncome: nonOpIncome,
    totalGrossIncome,
    allowableDeduction,
    exemptThresholdApplied: 0,
    netTaxableIncome,
    effectiveTaxRate,
    regularIncomeTaxDue,
    mcitDue,
    mcitApplied,
    compensationTaxDue: 0,
    totalIncomeTaxDue,
    taxCreditsApplied,
    netIncomeTaxPayable: Math.max(0, totalIncomeTaxDue - taxCreditsApplied),
    isExemptFromPercentageTax: false,
    applicableQuarterlyForm: '1702Q',
    applicableAnnualForm: '1702-RT',
  };
}

export interface BusinessTaxComputationResult {
  vatRegistrationType: VatRegistrationType;
  vatLabel: VatType;
  applicableForm: '2550Q' | '2551Q' | 'NONE';
  grossSales: number;
  vatableSales: number;
  vatExemptSales: number;
  zeroRatedSales: number;
  outputVat: number;
  inputVat: number;
  percentageTaxRate: number;
  percentageTaxDue: number;
  netVatPayable: number;
  excessInputVatCarryover: number;
  totalBusinessTaxPayable: number;
}

/**
 * Compute Business Tax (VAT Form 2550Q vs Percentage Tax Form 2551Q vs Exempt/Zero-Rated)
 * taking into account VAT registration type, 8% Flat Income Tax exemption, and custom Percentage Tax rate.
 */
export function computeBusinessTax(params: {
  grossSales: number;
  grossPurchases?: number;
  vatRegistrationType?: VatRegistrationType | VatType;
  incomeTaxRegime?: IncomeTaxRegime;
  percentageTaxRate?: number;
  priorExcessInputVat?: number;
  creditableVatWithheld?: number;
}): BusinessTaxComputationResult {
  const grossSales = Math.max(0, Number(params.grossSales) || 0);
  const grossPurchases = Math.max(0, Number(params.grossPurchases) || 0);
  const priorExcess = Math.max(0, Number(params.priorExcessInputVat) || 0);
  const vatWithheld = Math.max(0, Number(params.creditableVatWithheld) || 0);
  const vatReg = normalizeVatRegistrationType(params.vatRegistrationType);
  const vatLabel = vatRegistrationToLabel(vatReg);

  if (vatReg === 'vat') {
    const vatableSales = grossSales / (1 + VAT_RATE);
    const outputVat = grossSales - vatableSales;
    const inputVat = computeInputVat(grossPurchases, 'vat', 'vat');
    const netRaw = outputVat - inputVat - priorExcess - vatWithheld;
    return {
      vatRegistrationType: 'vat',
      vatLabel,
      applicableForm: '2550Q',
      grossSales,
      vatableSales,
      vatExemptSales: 0,
      zeroRatedSales: 0,
      outputVat,
      inputVat,
      percentageTaxRate: 0,
      percentageTaxDue: 0,
      netVatPayable: Math.max(0, netRaw),
      excessInputVatCarryover: netRaw < 0 ? Math.abs(netRaw) : 0,
      totalBusinessTaxPayable: Math.max(0, netRaw),
    };
  }

  if (vatReg === 'zero-rated') {
    const inputVat = computeInputVat(grossPurchases, 'zero-rated', 'vat');
    return {
      vatRegistrationType: 'zero-rated',
      vatLabel,
      applicableForm: '2550Q',
      grossSales,
      vatableSales: 0,
      vatExemptSales: 0,
      zeroRatedSales: grossSales,
      outputVat: 0,
      inputVat,
      percentageTaxRate: 0,
      percentageTaxDue: 0,
      netVatPayable: 0,
      excessInputVatCarryover: inputVat + priorExcess,
      totalBusinessTaxPayable: 0,
    };
  }

  if (vatReg === 'exempt') {
    return {
      vatRegistrationType: 'exempt',
      vatLabel,
      applicableForm: 'NONE',
      grossSales,
      vatableSales: 0,
      vatExemptSales: grossSales,
      zeroRatedSales: 0,
      outputVat: 0,
      inputVat: 0,
      percentageTaxRate: 0,
      percentageTaxDue: 0,
      netVatPayable: 0,
      excessInputVatCarryover: 0,
      totalBusinessTaxPayable: 0,
    };
  }

  // Non-VAT: Check if 8% Flat Income Tax is elected (exempts from 2551Q Percentage Tax)
  const is8Percent = params.incomeTaxRegime === '8_percent_flat';
  const pctRate = is8Percent
    ? 0
    : params.percentageTaxRate !== undefined
      ? Math.max(0, Number(params.percentageTaxRate))
      : PERCENTAGE_TAX_RATE;
  const percentageTaxDue = grossSales * pctRate;

  return {
    vatRegistrationType: 'non-vat',
    vatLabel,
    applicableForm: is8Percent || pctRate === 0 ? 'NONE' : '2551Q',
    grossSales,
    vatableSales: grossSales,
    vatExemptSales: 0,
    zeroRatedSales: 0,
    outputVat: 0,
    inputVat: 0,
    percentageTaxRate: pctRate,
    percentageTaxDue,
    netVatPayable: 0,
    excessInputVatCarryover: 0,
    totalBusinessTaxPayable: percentageTaxDue,
  };
}

export interface BusinessWorkflowProfile {
  classification: 'Individual' | 'Non-Individual';
  subClassification: TaxpayerSubClassification;
  sizeTier: TaxpayerSizeTier;
  vatRegistrationType: VatRegistrationType;
  vatLabel: VatType;
  industry: ClientIndustry;
  category: 'private' | 'government';
  incomeTaxRegime: IncomeTaxRegime;
  deductionMethod: DeductionMethod;
  percentageTaxRate: number;
  hasEmployees: boolean;
  isTopWithholdingAgent: boolean;
  isReliefApplicable: boolean;
  isPercentageTaxExempt: boolean;
  costSectionLabel: string;
  defaultPurchaseWhtAtc: string;
  defaultServiceWhtAtc: string;
  quarterlyItrForm: '1701Q' | '1702Q';
  annualItrForm: '1701' | '1701A' | '1702-RT' | '1702-EX' | '1702-MX';
  businessTaxForm: '2550Q' | '2551Q' | null;
  requiredForms: TaxFormCode[];
}

/**
 * Resolve the complete, self-consistent Business Workflow Profile for any Client or BusinessProfile.
 * Guarantees separate, accurate workflows across:
 * - Taxpayer Classification (Individual vs Non-Individual + Sub-Classifications + EOPT Size Tier)
 * - VAT Types ('vat', 'non-vat', 'exempt', 'zero-rated')
 * - Business Types / Industries ('retail', 'general-services', 'manufacturing', 'construction', 'private' vs 'government')
 * - Tax Regimes & Rates (8% Flat, Graduated Itemized, Graduated 40% OSD, 20% MSME Corp, 25% Regular Corp, 0% GPP/Exempt, 5% Special GIE, 1%/2%/3%/5% Percentage Tax)
 */
export function resolveBusinessWorkflow(
  entity?: Partial<Client & BusinessProfile> | null,
): BusinessWorkflowProfile {
  const rawClass = (entity?.taxpayerClassification ?? '').toString().trim();
  const isNonIndividual =
    rawClass === 'Non-Individual' ||
    rawClass.toLowerCase().includes('non-individual') ||
    rawClass.toLowerCase().includes('corp') ||
    rawClass.toLowerCase().includes('partnership') ||
    rawClass.toLowerCase().includes('opc') ||
    (entity?.taxpayerSubClassification !== undefined &&
      ['corporation_regular', 'corporation_msme', 'opc', 'partnership', 'gpp', 'cooperative'].includes(
        entity.taxpayerSubClassification,
      )) ||
    (entity?.incomeTaxRegime !== undefined && entity.incomeTaxRegime.startsWith('corp_'));

  const classification: 'Individual' | 'Non-Individual' = isNonIndividual
    ? 'Non-Individual'
    : 'Individual';

  const subClassification: TaxpayerSubClassification =
    entity?.taxpayerSubClassification ??
    (classification === 'Non-Individual' ? 'corporation_msme' : 'sole_proprietor');

  const vatRegistrationType = normalizeVatRegistrationType(entity?.vatRegistrationType);
  const vatLabel = vatRegistrationToLabel(vatRegistrationType);

  const industry: ClientIndustry =
    entity?.industry &&
    ['retail', 'general-services', 'manufacturing', 'construction'].includes(entity.industry)
      ? entity.industry
      : 'general-services';

  const category: 'private' | 'government' =
    entity?.category === 'government' ? 'government' : 'private';

  // Determine Income Tax Regime
  let incomeTaxRegime: IncomeTaxRegime;
  if (classification === 'Individual') {
    if (
      entity?.incomeTaxRegime &&
      ['8_percent_flat', 'graduated_itemized', 'graduated_osd'].includes(entity.incomeTaxRegime)
    ) {
      incomeTaxRegime = entity.incomeTaxRegime;
    } else if (entity?.deductionMethod === 'osd_40') {
      incomeTaxRegime = 'graduated_osd';
    } else if (entity?.deductionMethod === 'none_8_percent') {
      incomeTaxRegime = '8_percent_flat';
    } else {
      incomeTaxRegime = 'graduated_itemized';
    }
    // 8% flat option is only allowed for Non-VAT taxpayers
    if (incomeTaxRegime === '8_percent_flat' && vatRegistrationType === 'vat') {
      incomeTaxRegime =
        entity?.deductionMethod === 'osd_40' ? 'graduated_osd' : 'graduated_itemized';
    }
  } else {
    if (subClassification === 'gpp' || subClassification === 'cooperative') {
      incomeTaxRegime = 'corp_gpp_exempt';
    } else if (
      entity?.incomeTaxRegime &&
      [
        'corp_20_msme',
        'corp_20_osd',
        'corp_25_regular',
        'corp_25_osd',
        'corp_gpp_exempt',
        'corp_special_5',
      ].includes(entity.incomeTaxRegime)
    ) {
      incomeTaxRegime = entity.incomeTaxRegime;
    } else if (subClassification === 'corporation_regular') {
      incomeTaxRegime = entity?.deductionMethod === 'osd_40' ? 'corp_25_osd' : 'corp_25_regular';
    } else {
      incomeTaxRegime = entity?.deductionMethod === 'osd_40' ? 'corp_20_osd' : 'corp_20_msme';
    }
  }

  const deductionMethod: DeductionMethod =
    incomeTaxRegime === '8_percent_flat'
      ? 'none_8_percent'
      : incomeTaxRegime === 'graduated_osd' ||
          incomeTaxRegime === 'corp_20_osd' ||
          incomeTaxRegime === 'corp_25_osd'
        ? 'osd_40'
        : 'itemized';

  const isPercentageTaxExempt =
    vatRegistrationType !== 'non-vat' ||
    incomeTaxRegime === '8_percent_flat' ||
    subClassification === 'cooperative' ||
    incomeTaxRegime === 'corp_special_5';

  const percentageTaxRate = isPercentageTaxExempt
    ? 0
    : entity?.percentageTaxRate !== undefined
      ? Number(entity.percentageTaxRate)
      : PERCENTAGE_TAX_RATE;

  const grossSalesTotal = Array.isArray((entity as Client | undefined)?.sales)
    ? ((entity as Client).sales || []).reduce((sum, s) => sum + (Number(s.amount) || 0), 0)
    : 0;
  const sizeTier = resolveTaxpayerSizeTier(grossSalesTotal, entity?.taxpayerTier);

  const hasEmployees = entity?.hasEmployees ?? true;
  const isTopWithholdingAgent =
    entity?.isTopWithholdingAgent ?? (sizeTier === 'medium' || sizeTier === 'large');

  const isReliefApplicable = vatRegistrationType === 'vat' || vatRegistrationType === 'zero-rated';

  const costSectionLabel =
    industry === 'retail'
      ? 'Cost of Goods Sold'
      : industry === 'manufacturing'
        ? 'Cost of Goods Manufactured and Sold'
        : industry === 'construction'
          ? 'Direct Contract Costs'
          : 'Cost of Services';

  const defaultPurchaseWhtAtc =
    category === 'government'
      ? classification === 'Non-Individual'
        ? 'WC640'
        : 'WI640'
      : classification === 'Non-Individual'
        ? 'WC158'
        : 'WC080';

  const defaultServiceWhtAtc =
    category === 'government'
      ? classification === 'Non-Individual'
        ? 'WC157'
        : 'WI157'
      : industry === 'construction'
        ? 'WC040'
        : 'WC030';

  const quarterlyItrForm: '1701Q' | '1702Q' =
    classification === 'Non-Individual' ? '1702Q' : '1701Q';

  const annualItrForm: '1701' | '1701A' | '1702-RT' | '1702-EX' | '1702-MX' =
    classification === 'Non-Individual'
      ? incomeTaxRegime === 'corp_gpp_exempt'
        ? '1702-EX'
        : incomeTaxRegime === 'corp_special_5'
          ? '1702-MX'
          : '1702-RT'
      : (incomeTaxRegime === '8_percent_flat' || incomeTaxRegime === 'graduated_osd') &&
          subClassification !== 'mixed_income'
        ? '1701A'
        : '1701';

  const businessTaxForm: '2550Q' | '2551Q' | null =
    vatRegistrationType === 'vat' || vatRegistrationType === 'zero-rated'
      ? '2550Q'
      : vatRegistrationType === 'non-vat' && !isPercentageTaxExempt && percentageTaxRate > 0
        ? '2551Q'
        : null;

  const requiredForms: TaxFormCode[] = [];
  if (businessTaxForm) requiredForms.push(businessTaxForm);
  requiredForms.push(quarterlyItrForm, annualItrForm);
  if (hasEmployees) requiredForms.push('1601-C');
  requiredForms.push('0619-E', '1601-EQ');
  if (category === 'government') requiredForms.push('1600-VT');

  return {
    classification,
    subClassification,
    sizeTier,
    vatRegistrationType,
    vatLabel,
    industry,
    category,
    incomeTaxRegime,
    deductionMethod,
    percentageTaxRate,
    hasEmployees,
    isTopWithholdingAgent,
    isReliefApplicable,
    isPercentageTaxExempt,
    costSectionLabel,
    defaultPurchaseWhtAtc,
    defaultServiceWhtAtc,
    quarterlyItrForm,
    annualItrForm,
    businessTaxForm,
    requiredForms,
  };
}

/**
 * Generate a tailored, workflow-specific calendar of BIR Tax Deadlines for a given year and client/business profile.
 */
export function generateWorkflowDeadlines(
  year: number,
  entity?: Partial<Client & BusinessProfile> | null,
): TaxDeadline[] {
  const wf = resolveBusinessWorkflow(entity);
  const deadlines: TaxDeadline[] = [];
  let seq = 1;
  const nextId = () => `wf-${year}-${seq++}`;

  // 1. Business Tax Deadlines (2550Q for VAT / Zero-Rated, 2551Q for Non-VAT unless 8% Flat / Exempt)
  if (wf.businessTaxForm === '2550Q') {
    const vatQuarters = [
      { period: `Q1 ${year}`, dueDate: `${year}-04-25`, label: '1st Quarter' },
      { period: `Q2 ${year}`, dueDate: `${year}-07-25`, label: '2nd Quarter' },
      { period: `Q3 ${year}`, dueDate: `${year}-10-25`, label: '3rd Quarter' },
      { period: `Q4 ${year}`, dueDate: `${year + 1}-01-25`, label: '4th Quarter' },
    ];
    for (const q of vatQuarters) {
      deadlines.push({
        id: nextId(),
        formType: '2550Q',
        title: `Quarterly Value-Added Tax Return (${q.label})`,
        period: q.period,
        dueDate: q.dueDate,
        status: 'Pending',
      });
    }
  } else if (wf.businessTaxForm === '2551Q') {
    const pctQuarters = [
      { period: `Q1 ${year}`, dueDate: `${year}-04-25`, label: '1st Quarter' },
      { period: `Q2 ${year}`, dueDate: `${year}-07-25`, label: '2nd Quarter' },
      { period: `Q3 ${year}`, dueDate: `${year}-10-25`, label: '3rd Quarter' },
      { period: `Q4 ${year}`, dueDate: `${year + 1}-01-25`, label: '4th Quarter' },
    ];
    for (const q of pctQuarters) {
      deadlines.push({
        id: nextId(),
        formType: '2551Q',
        title: `Quarterly Percentage Tax Return (${q.label} — ${(wf.percentageTaxRate * 100).toFixed(0)}%)`,
        period: q.period,
        dueDate: q.dueDate,
        status: 'Pending',
      });
    }
  }

  // 2. Quarterly & Annual Income Tax Deadlines (Individual 1701Q + 1701/1701A vs Corporate 1702Q + 1702-RT/EX/MX)
  if (wf.classification === 'Individual') {
    deadlines.push(
      {
        id: nextId(),
        formType: '1701Q',
        title: 'Quarterly Income Tax Return — Individual (1st Quarter)',
        period: `Q1 ${year}`,
        dueDate: `${year}-05-15`,
        status: 'Pending',
      },
      {
        id: nextId(),
        formType: '1701Q',
        title: 'Quarterly Income Tax Return — Individual (2nd Quarter)',
        period: `Q2 ${year}`,
        dueDate: `${year}-08-15`,
        status: 'Pending',
      },
      {
        id: nextId(),
        formType: '1701Q',
        title: 'Quarterly Income Tax Return — Individual (3rd Quarter)',
        period: `Q3 ${year}`,
        dueDate: `${year}-11-15`,
        status: 'Pending',
      },
      {
        id: nextId(),
        formType: wf.annualItrForm,
        title: `Annual Income Tax Return — Individual (${wf.annualItrForm})`,
        period: `Annual ${year}`,
        dueDate: `${year + 1}-04-15`,
        status: 'Pending',
      },
    );
  } else {
    deadlines.push(
      {
        id: nextId(),
        formType: '1702Q',
        title: 'Quarterly Income Tax Return — Corporate/Partnership (1st Quarter)',
        period: `Q1 ${year}`,
        dueDate: `${year}-05-30`,
        status: 'Pending',
      },
      {
        id: nextId(),
        formType: '1702Q',
        title: 'Quarterly Income Tax Return — Corporate/Partnership (2nd Quarter)',
        period: `Q2 ${year}`,
        dueDate: `${year}-08-29`,
        status: 'Pending',
      },
      {
        id: nextId(),
        formType: '1702Q',
        title: 'Quarterly Income Tax Return — Corporate/Partnership (3rd Quarter)',
        period: `Q3 ${year}`,
        dueDate: `${year}-11-29`,
        status: 'Pending',
      },
      {
        id: nextId(),
        formType: wf.annualItrForm,
        title: `Annual Income Tax Return — Non-Individual (${wf.annualItrForm})`,
        period: `Annual ${year}`,
        dueDate: `${year + 1}-04-15`,
        status: 'Pending',
      },
    );
  }

  // 3. Expanded Withholding Tax Remittances (0619-E for M1/M2 of each quarter, 1601-EQ for Quarter-End)
  const ewtSchedule: Array<{ formType: TaxFormCode; title: string; period: string; dueDate: string }> = [
    { formType: '0619-E', title: 'Monthly EWT Remittance (Jan)', period: `January ${year}`, dueDate: `${year}-02-10` },
    { formType: '0619-E', title: 'Monthly EWT Remittance (Feb)', period: `February ${year}`, dueDate: `${year}-03-10` },
    { formType: '1601-EQ', title: 'Quarterly EWT Return (1st Quarter)', period: `Q1 ${year}`, dueDate: `${year}-04-30` },
    { formType: '0619-E', title: 'Monthly EWT Remittance (Apr)', period: `April ${year}`, dueDate: `${year}-05-10` },
    { formType: '0619-E', title: 'Monthly EWT Remittance (May)', period: `May ${year}`, dueDate: `${year}-06-10` },
    { formType: '1601-EQ', title: 'Quarterly EWT Return (2nd Quarter)', period: `Q2 ${year}`, dueDate: `${year}-07-31` },
    { formType: '0619-E', title: 'Monthly EWT Remittance (Jul)', period: `July ${year}`, dueDate: `${year}-08-10` },
    { formType: '0619-E', title: 'Monthly EWT Remittance (Aug)', period: `August ${year}`, dueDate: `${year}-09-10` },
    { formType: '1601-EQ', title: 'Quarterly EWT Return (3rd Quarter)', period: `Q3 ${year}`, dueDate: `${year}-10-31` },
    { formType: '0619-E', title: 'Monthly EWT Remittance (Oct)', period: `October ${year}`, dueDate: `${year}-11-10` },
    { formType: '0619-E', title: 'Monthly EWT Remittance (Nov)', period: `November ${year}`, dueDate: `${year}-12-10` },
    { formType: '1601-EQ', title: 'Quarterly EWT Return (4th Quarter)', period: `Q4 ${year}`, dueDate: `${year + 1}-01-31` },
  ];
  for (const e of ewtSchedule) {
    deadlines.push({
      id: nextId(),
      formType: e.formType,
      title: e.title,
      period: e.period,
      dueDate: e.dueDate,
      status: 'Pending',
    });
  }

  // 4. Monthly Compensation Withholding (1601-C) if entity has employees
  if (wf.hasEmployees) {
    const months = [
      { name: 'January', due: `${year}-02-10` },
      { name: 'February', due: `${year}-03-10` },
      { name: 'March', due: `${year}-04-10` },
      { name: 'April', due: `${year}-05-10` },
      { name: 'May', due: `${year}-06-10` },
      { name: 'June', due: `${year}-07-10` },
      { name: 'July', due: `${year}-08-10` },
      { name: 'August', due: `${year}-09-10` },
      { name: 'September', due: `${year}-10-10` },
      { name: 'October', due: `${year}-11-10` },
      { name: 'November', due: `${year}-12-10` },
      { name: 'December', due: `${year + 1}-01-15` },
    ];
    for (const m of months) {
      deadlines.push({
        id: nextId(),
        formType: '1601-C',
        title: `Monthly Remittance of Income Taxes Withheld on Compensation (${m.name})`,
        period: `${m.name} ${year}`,
        dueDate: m.due,
        status: 'Pending',
      });
    }
  }

  return deadlines;
}

export const TAX_PERIODS = {
  monthlyVat: '2550M',
  quarterlyVat: '2550Q',
  quarterlyItr: '1701Q',
  annualItr: '1701',
  annualItrShort: '1701A',
  corporateQuarterlyItr: '1702Q',
  corporateAnnualItr: '1702-RT',
  corporateExemptItr: '1702-EX',
  corporateMixedItr: '1702-MX',
  percentageTax: '2551Q',
  withholding: '1601-EQ',
  monthlyEwt: '0619-E',
  compensationWht: '1601-C',
};
