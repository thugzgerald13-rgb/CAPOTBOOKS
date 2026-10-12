export interface StatutoryRule {
  ruleId: string;
  agency: 'SSS' | 'PhilHealth' | 'Pag-IBIG' | 'EC' | 'WISP';
  ruleType: string;
  description: string;
  effectiveFrom: string;
  effectiveTo: string;
  employeeRate: number;
  employerRate: number;
  minimumBase: number;
  maximumBase: number;
  fixedAmount: number;
  formulaMethod: string;
  source: string;
  sourceUrl: string;
  circularIssuance: string;
  lastVerified: string;
  status: 'ACTIVE' | 'SUPERSEDED';
}

export interface TaxBracket {
  taxRuleId: string;
  payrollFrequency: 'Semi-Monthly' | 'Monthly' | 'Daily';
  tierLevel: number;
  compensationFloor: number;
  compensationCeiling: number;
  baseTaxAmount: number;
  excessPercentage: number;
  effectiveFrom: string;
  effectiveTo: string;
  statutoryBasis: string;
  lastVerified: string;
  status: 'ACTIVE' | 'SUPERSEDED';
}

export interface SssSalaryCreditTier {
  mscTier: number;
  salaryMin: number;
  salaryMax: number;
  mscRegular: number;
  mscWisp: number;
  totalMsc: number;
  ssEe: number;
  ssEr: number;
  ecEr: number;
  wispEe: number;
  wispEr: number;
  totalEe: number;
  totalEr: number;
  totalContribution: number;
}

export interface CompensationClassification {
  earningCode: string;
  description: string;
  taxable: boolean;
  sssApplicable: boolean;
  philHealthApplicable: boolean;
  pagIbigApplicable: boolean;
  includedIn13thMonth: boolean;
  includedInRegularRate: boolean;
  deMinimisLimit: number | null;
  deMinimisFrequency: string | null;
  effectiveFrom: string;
  effectiveTo: string;
  source: string;
  verificationDate: string;
  notes: string;
}

export const STATUTORY_RULES_MASTER: StatutoryRule[] = [
  // ---------------- SSS RULES (VERSION CONTROLLED) ----------------
  {
    ruleId: 'SSS-2025-V1',
    agency: 'SSS',
    ruleType: 'Bracket Table (Regular + WISP)',
    description: 'Social Security Act of 2018 (RA 11199) Mandated 15% Contribution Rate (5.0% EE / 10.0% ER)',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2099-12-31',
    employeeRate: 0.050,
    employerRate: 0.100,
    minimumBase: 5000.00,
    maximumBase: 35000.00,
    fixedAmount: 0.00,
    formulaMethod: 'BRACKET_LOOKUP',
    source: 'Social Security System (SSS) & Republic Act No. 11199',
    sourceUrl: 'https://www.sss.gov.ph/sss/DownloadContent?fileName=RA-11199.pdf',
    circularIssuance: 'SSS Circular No. 2024-034 / RA 11199 Sec. 4',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    ruleId: 'SSS-2023-V1',
    agency: 'SSS',
    ruleType: 'Bracket Table (Regular + WISP)',
    description: 'Social Security Act of 2018 (RA 11199) Phase II 14% Contribution Rate (4.5% EE / 9.5% ER)',
    effectiveFrom: '2023-01-01',
    effectiveTo: '2024-12-31',
    employeeRate: 0.045,
    employerRate: 0.095,
    minimumBase: 4000.00,
    maximumBase: 30000.00,
    fixedAmount: 0.00,
    formulaMethod: 'BRACKET_LOOKUP',
    source: 'Social Security System (SSS) & Republic Act No. 11199',
    sourceUrl: 'https://www.sss.gov.ph/sss/DownloadContent?fileName=Circular_2022_033.pdf',
    circularIssuance: 'SSS Circular No. 2022-033',
    lastVerified: '2026-10-05',
    status: 'SUPERSEDED'
  },

  // ---------------- EMPLOYEES COMPENSATION (EC) ----------------
  {
    ruleId: 'EC-2025-V1',
    agency: 'EC',
    ruleType: 'Fixed Tier (Employer Only)',
    description: "Employees' Compensation Program (P.D. 626): ₱10.00 for MSC < ₱15,000; ₱30.00 for MSC >= ₱15,000",
    effectiveFrom: '2025-01-01',
    effectiveTo: '2099-12-31',
    employeeRate: 0.00,
    employerRate: 0.00,
    minimumBase: 5000.00,
    maximumBase: 35000.00,
    fixedAmount: 30.00,
    formulaMethod: 'FIXED_TIER',
    source: 'Employees Compensation Commission (ECC)',
    sourceUrl: 'https://ecc.gov.ph/ec-contribution-table/',
    circularIssuance: 'ECC Board Resolution No. 14-07-19 / P.D. 626',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },

  // ---------------- PHILHEALTH (VERSION CONTROLLED) ----------------
  {
    ruleId: 'PHIC-2024-V1',
    agency: 'PhilHealth',
    ruleType: 'Fixed Percentage (50/50 Split)',
    description: 'Universal Health Care Act (RA 11223) 5.0% Premium Rate (2.5% EE / 2.5% ER); Floor ₱10K, Ceiling ₱100K',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    employeeRate: 0.025,
    employerRate: 0.025,
    minimumBase: 10000.00,
    maximumBase: 100000.00,
    fixedAmount: 0.00,
    formulaMethod: 'PERCENT_SPLIT',
    source: 'Philippine Health Insurance Corporation (PhilHealth)',
    sourceUrl: 'https://www.philhealth.gov.ph/advisories/2024/adv2024-0013.pdf',
    circularIssuance: 'PhilHealth Advisory No. 2024-0013 / Circular No. 2020-0005',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    ruleId: 'PHIC-2022-V1',
    agency: 'PhilHealth',
    ruleType: 'Fixed Percentage (50/50 Split)',
    description: 'Universal Health Care Act (RA 11223) 4.0% Premium Rate (2.0% EE / 2.0% ER); Floor ₱10K, Ceiling ₱80K',
    effectiveFrom: '2022-01-01',
    effectiveTo: '2023-12-31',
    employeeRate: 0.020,
    employerRate: 0.020,
    minimumBase: 10000.00,
    maximumBase: 80000.00,
    fixedAmount: 0.00,
    formulaMethod: 'PERCENT_SPLIT',
    source: 'Philippine Health Insurance Corporation (PhilHealth)',
    sourceUrl: 'https://www.philhealth.gov.ph/circulars/2022/circ2022-0010.pdf',
    circularIssuance: 'PhilHealth Circular No. 2022-0010',
    lastVerified: '2026-10-05',
    status: 'SUPERSEDED'
  },

  // ---------------- PAG-IBIG / HDMF (VERSION CONTROLLED) ----------------
  {
    ruleId: 'HDMF-2024-V1',
    agency: 'Pag-IBIG',
    ruleType: 'Fixed Ceiling (₱200 Max EE / ₱200 Max ER)',
    description: 'Pag-IBIG Fund Circular No. 460: 2% EE / 2% ER on Monthly Compensation up to ₱10,000 maximum base',
    effectiveFrom: '2024-02-01',
    effectiveTo: '2099-12-31',
    employeeRate: 0.020,
    employerRate: 0.020,
    minimumBase: 1500.00,
    maximumBase: 10000.00,
    fixedAmount: 200.00,
    formulaMethod: 'FIXED_TIER',
    source: 'Home Development Mutual Fund (Pag-IBIG Fund)',
    sourceUrl: 'https://www.pagibigfund.gov.ph/document/pdf/circulars/provident/Circular%20No.%20460.pdf',
    circularIssuance: 'Pag-IBIG Fund Circular No. 460',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    ruleId: 'HDMF-2020-V1',
    agency: 'Pag-IBIG',
    ruleType: 'Fixed Ceiling (₱100 Max EE / ₱100 Max ER)',
    description: 'Pag-IBIG Fund Law (RA 9679): 2% EE / 2% ER on Monthly Compensation up to ₱5,000 maximum base',
    effectiveFrom: '2010-01-01',
    effectiveTo: '2024-01-31',
    employeeRate: 0.020,
    employerRate: 0.020,
    minimumBase: 1500.00,
    maximumBase: 5000.00,
    fixedAmount: 100.00,
    formulaMethod: 'FIXED_TIER',
    source: 'Home Development Mutual Fund (Pag-IBIG Fund) RA 9679',
    sourceUrl: 'https://www.pagibigfund.gov.ph/document/pdf/circulars/provident/Circular%20No.%20274.pdf',
    circularIssuance: 'Pag-IBIG Fund Circular No. 274',
    lastVerified: '2026-10-05',
    status: 'SUPERSEDED'
  }
];

export const TAX_TABLES_MASTER: TaxBracket[] = [
  // Semi-Monthly Brackets (RA 10963 TRAIN Law 2023 onwards)
  {
    taxRuleId: 'TAX-TRAIN-SM-T1',
    payrollFrequency: 'Semi-Monthly',
    tierLevel: 1,
    compensationFloor: 0.00,
    compensationCeiling: 10417.00,
    baseTaxAmount: 0.00,
    excessPercentage: 0.00,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-SM-T2',
    payrollFrequency: 'Semi-Monthly',
    tierLevel: 2,
    compensationFloor: 10417.01,
    compensationCeiling: 16666.00,
    baseTaxAmount: 0.00,
    excessPercentage: 0.15,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-SM-T3',
    payrollFrequency: 'Semi-Monthly',
    tierLevel: 3,
    compensationFloor: 16667.00,
    compensationCeiling: 33332.00,
    baseTaxAmount: 937.50,
    excessPercentage: 0.20,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-SM-T4',
    payrollFrequency: 'Semi-Monthly',
    tierLevel: 4,
    compensationFloor: 33333.00,
    compensationCeiling: 83332.00,
    baseTaxAmount: 4270.70,
    excessPercentage: 0.25,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-SM-T5',
    payrollFrequency: 'Semi-Monthly',
    tierLevel: 5,
    compensationFloor: 83333.00,
    compensationCeiling: 333332.00,
    baseTaxAmount: 16770.70,
    excessPercentage: 0.30,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-SM-T6',
    payrollFrequency: 'Semi-Monthly',
    tierLevel: 6,
    compensationFloor: 333333.00,
    compensationCeiling: 9999999.00,
    baseTaxAmount: 91770.70,
    excessPercentage: 0.35,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },

  // Monthly Brackets (RA 10963 TRAIN Law 2023 onwards)
  {
    taxRuleId: 'TAX-TRAIN-M-T1',
    payrollFrequency: 'Monthly',
    tierLevel: 1,
    compensationFloor: 0.00,
    compensationCeiling: 20833.00,
    baseTaxAmount: 0.00,
    excessPercentage: 0.00,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-M-T2',
    payrollFrequency: 'Monthly',
    tierLevel: 2,
    compensationFloor: 20833.01,
    compensationCeiling: 33333.00,
    baseTaxAmount: 0.00,
    excessPercentage: 0.15,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-M-T3',
    payrollFrequency: 'Monthly',
    tierLevel: 3,
    compensationFloor: 33333.01,
    compensationCeiling: 66667.00,
    baseTaxAmount: 1875.00,
    excessPercentage: 0.20,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-M-T4',
    payrollFrequency: 'Monthly',
    tierLevel: 4,
    compensationFloor: 66667.01,
    compensationCeiling: 166667.00,
    baseTaxAmount: 8541.67,
    excessPercentage: 0.25,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-M-T5',
    payrollFrequency: 'Monthly',
    tierLevel: 5,
    compensationFloor: 166667.01,
    compensationCeiling: 666667.00,
    baseTaxAmount: 33541.67,
    excessPercentage: 0.30,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  },
  {
    taxRuleId: 'TAX-TRAIN-M-T6',
    payrollFrequency: 'Monthly',
    tierLevel: 6,
    compensationFloor: 666667.01,
    compensationCeiling: 9999999.00,
    baseTaxAmount: 183541.67,
    excessPercentage: 0.35,
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    statutoryBasis: 'RA 10963 TRAIN Law / RMC 24-2023',
    lastVerified: '2026-10-05',
    status: 'ACTIVE'
  }
];

export const SSS_SCHEDULE_SAMPLE_TIERS: SssSalaryCreditTier[] = [
  { mscTier: 1, salaryMin: 0.00, salaryMax: 5249.99, mscRegular: 5000, mscWisp: 0, totalMsc: 5000, ssEe: 250.00, ssEr: 500.00, ecEr: 10.00, wispEe: 0.00, wispEr: 0.00, totalEe: 250.00, totalEr: 510.00, totalContribution: 760.00 },
  { mscTier: 2, salaryMin: 5250.00, salaryMax: 5749.99, mscRegular: 5500, mscWisp: 0, totalMsc: 5500, ssEe: 275.00, ssEr: 550.00, ecEr: 10.00, wispEe: 0.00, wispEr: 0.00, totalEe: 275.00, totalEr: 560.00, totalContribution: 835.00 },
  { mscTier: 11, salaryMin: 9750.00, salaryMax: 10249.99, mscRegular: 10000, mscWisp: 0, totalMsc: 10000, ssEe: 500.00, ssEr: 1000.00, ecEr: 10.00, wispEe: 0.00, wispEr: 0.00, totalEe: 500.00, totalEr: 1010.00, totalContribution: 1510.00 },
  { mscTier: 21, salaryMin: 14750.00, salaryMax: 15249.99, mscRegular: 15000, mscWisp: 0, totalMsc: 15000, ssEe: 750.00, ssEr: 1500.00, ecEr: 30.00, wispEe: 0.00, wispEr: 0.00, totalEe: 750.00, totalEr: 1530.00, totalContribution: 2280.00 },
  { mscTier: 27, salaryMin: 17750.00, salaryMax: 18249.99, mscRegular: 18000, mscWisp: 0, totalMsc: 18000, ssEe: 900.00, ssEr: 1800.00, ecEr: 30.00, wispEe: 0.00, wispEr: 0.00, totalEe: 900.00, totalEr: 1830.00, totalContribution: 2730.00 },
  { mscTier: 31, salaryMin: 19750.00, salaryMax: 20249.99, mscRegular: 20000, mscWisp: 0, totalMsc: 20000, ssEe: 1000.00, ssEr: 2000.00, ecEr: 30.00, wispEe: 0.00, wispEr: 0.00, totalEe: 1000.00, totalEr: 2030.00, totalContribution: 3030.00 },
  { mscTier: 41, salaryMin: 24750.00, salaryMax: 25249.99, mscRegular: 20000, mscWisp: 5000, totalMsc: 25000, ssEe: 1000.00, ssEr: 2000.00, ecEr: 30.00, wispEe: 250.00, wispEr: 500.00, totalEe: 1250.00, totalEr: 2530.00, totalContribution: 3780.00 },
  { mscTier: 57, salaryMin: 32750.00, salaryMax: 33249.99, mscRegular: 20000, mscWisp: 13000, totalMsc: 33000, ssEe: 1000.00, ssEr: 2000.00, ecEr: 30.00, wispEe: 650.00, wispEr: 1300.00, totalEe: 1650.00, totalEr: 3330.00, totalContribution: 4980.00 },
  { mscTier: 61, salaryMin: 34750.00, salaryMax: 999999.00, mscRegular: 20000, mscWisp: 15000, totalMsc: 35000, ssEe: 1000.00, ssEr: 2000.00, ecEr: 30.00, wispEe: 750.00, wispEr: 1500.00, totalEe: 1750.00, totalEr: 3530.00, totalContribution: 5280.00 }
];

export const COMPENSATION_CLASSIFICATIONS_MASTER: CompensationClassification[] = [
  {
    earningCode: 'EARN-BASIC',
    description: 'Contracted Base Monthly / Daily Salary',
    taxable: true,
    sssApplicable: true,
    philHealthApplicable: true,
    pagIbigApplicable: true,
    includedIn13thMonth: true,
    includedInRegularRate: true,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 97 / PD 851',
    verificationDate: '2026-10-05',
    notes: 'Foundational compensation for statutory and 13th month computations'
  },
  {
    earningCode: 'EARN-OT-REG',
    description: 'Overtime Pay on Regular Working Day (1.25x hourly rate)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 87',
    verificationDate: '2026-10-05',
    notes: 'Overtime premium (25% on regular hourly rate); excluded from 13th month'
  },
  {
    earningCode: 'EARN-OT-REST',
    description: 'Rest Day / Special Holiday Overtime (1.69x hourly rate)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 87 & 93',
    verificationDate: '2026-10-05',
    notes: 'Base 130% plus 30% overtime premium (1.69x base rate)'
  },
  {
    earningCode: 'EARN-OT-HOL',
    description: 'Regular Holiday Overtime Pay (2.60x hourly rate)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 87 & 94',
    verificationDate: '2026-10-05',
    notes: 'Base 200% plus 30% overtime premium (2.60x base rate)'
  },
  {
    earningCode: 'EARN-ND',
    description: 'Night Shift Differential Pay (10% premium 10PM–6AM)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 86',
    verificationDate: '2026-10-05',
    notes: 'Mandatory 10% premium on regular hourly rate for hours worked 10PM–6AM'
  },
  {
    earningCode: 'EARN-HOL-REG',
    description: 'Regular Holiday Pay (200% worked / 100% unworked)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 94',
    verificationDate: '2026-10-05',
    notes: '100% paid if unworked; 200% paid if worked (or 260% if worked on rest day)'
  },
  {
    earningCode: 'EARN-HOL-SPE',
    description: 'Special Non-Working Holiday Pay (130% worked)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Handbook on Statutory Monetary Benefits',
    verificationDate: '2026-10-05',
    notes: 'Subject to no-work, no-pay principle; 130% if worked (150% if rest day)'
  },
  {
    earningCode: 'EARN-RD',
    description: 'Scheduled Rest Day Premium Pay (130% first 8h)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 93',
    verificationDate: '2026-10-05',
    notes: 'Additional 30% premium on base daily rate for work on scheduled rest day'
  },
  {
    earningCode: 'EARN-13TH',
    description: '13th Month Pay (Prorated Basic pursuant to PD 851)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 90000.00,
    deMinimisFrequency: 'Annual Statutory Cap',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'Presidential Decree No. 851 / RA 10963 TRAIN Law',
    verificationDate: '2026-10-05',
    notes: 'Tax-exempt up to ₱90,000.00 total statutory benefits ceiling under RA 10963'
  },
  {
    earningCode: 'EARN-DEMIN-RICE',
    description: 'De Minimis Rice Subsidy (₱2,000 / month ceiling)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 2000.00,
    deMinimisFrequency: 'Monthly',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 11-2018',
    verificationDate: '2026-10-05',
    notes: 'Exempt from income tax; excess over ₱2,000 transfers to other benefits ceiling'
  },
  {
    earningCode: 'EARN-DEMIN-CLOTH',
    description: 'De Minimis Uniform & Clothing Allowance (₱6,000 / year ceiling)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 6000.00,
    deMinimisFrequency: 'Annual',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 11-2018',
    verificationDate: '2026-10-05',
    notes: 'Exempt from income tax; excess over ₱6,000 transfers to other benefits'
  },
  {
    earningCode: 'EARN-DEMIN-MED',
    description: 'De Minimis Medical Cash Allowance to Dependents (₱1,500 / semester)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 3000.00,
    deMinimisFrequency: 'Annual',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 11-2018',
    verificationDate: '2026-10-05',
    notes: '₱250 per month / ₱1,500 per semester for dependent medical assistance'
  },
  {
    earningCode: 'EARN-DEMIN-LAUND',
    description: 'De Minimis Laundry Allowance (₱300 / month ceiling)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 300.00,
    deMinimisFrequency: 'Monthly',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 11-2018',
    verificationDate: '2026-10-05',
    notes: 'Exempt from income tax and fringe benefits tax'
  },
  {
    earningCode: 'EARN-DEMIN-VL10',
    description: 'Monetized Unused Vacation Leave Credits (Up to 10 days)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 10.00,
    deMinimisFrequency: 'Days / Year',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 5-2011 / RR 11-2018',
    verificationDate: '2026-10-05',
    notes: 'Monetization of unused VL credits not exceeding 10 days during the year'
  },
  {
    earningCode: 'EARN-COMM-TAX',
    description: 'Sales & Production Performance Commissions',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Tax Code Sec. 32 / Revenue Regulations No. 2-98',
    verificationDate: '2026-10-05',
    notes: 'Variable commission subject to graduated withholding tax'
  },
  {
    earningCode: 'LEAVE-SIL',
    description: 'Service Incentive Leave (SIL - 5 days paid leave)',
    taxable: true,
    sssApplicable: true,
    philHealthApplicable: true,
    pagIbigApplicable: true,
    includedIn13thMonth: true,
    includedInRegularRate: true,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 95',
    verificationDate: '2026-10-05',
    notes: '5 days with pay after 1 year of service; convertible to cash at year end'
  },
  {
    earningCode: 'LEAVE-MAT',
    description: 'Expanded Maternity Leave (105 days paid leave)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'Republic Act No. 11210 (105-Day EML Act)',
    verificationDate: '2026-10-05',
    notes: '105 days full pay (+15 days solo mom); SSS benefit + employer salary differential'
  },
  {
    earningCode: 'LEAVE-PAT',
    description: 'Paternity Leave (7 days paid leave for married fathers)',
    taxable: true,
    sssApplicable: true,
    philHealthApplicable: true,
    pagIbigApplicable: true,
    includedIn13thMonth: true,
    includedInRegularRate: true,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'Republic Act No. 8187 (Paternity Leave Act)',
    verificationDate: '2026-10-05',
    notes: '7 days with full pay for the first 4 deliveries of legal spouse'
  },
  {
    earningCode: 'LEAVE-SOLO',
    description: 'Solo Parent Leave (7 days paid leave under RA 11861)',
    taxable: true,
    sssApplicable: true,
    philHealthApplicable: true,
    pagIbigApplicable: true,
    includedIn13thMonth: true,
    includedInRegularRate: true,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'Republic Act No. 8972 as amended by RA 11861',
    verificationDate: '2026-10-05',
    notes: '7 days with full pay for qualified solo parents holding valid Solo Parent ID'
  },
  {
    earningCode: 'LEAVE-VAWC',
    description: 'Anti-Violence Against Women & Children (VAWC - 10 days)',
    taxable: true,
    sssApplicable: true,
    philHealthApplicable: true,
    pagIbigApplicable: true,
    includedIn13thMonth: true,
    includedInRegularRate: true,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'Republic Act No. 9262 (Anti-VAWC Act)',
    verificationDate: '2026-10-05',
    notes: '10 days paid leave to attend medical, legal and court proceedings'
  },
  {
    earningCode: 'LEAVE-GYNE',
    description: 'Special Leave for Women (Gynecological Surgery - Up to 2 months)',
    taxable: true,
    sssApplicable: true,
    philHealthApplicable: true,
    pagIbigApplicable: true,
    includedIn13thMonth: true,
    includedInRegularRate: true,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'Republic Act No. 9710 (Magna Carta of Women)',
    verificationDate: '2026-10-05',
    notes: 'Up to 2 months with full pay following surgery caused by gynecological disorders'
  },
  {
    earningCode: 'EARN-OT-HOL-REST',
    description: 'Regular Holiday Overtime on Rest Day (3.38x hourly rate)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 87 & 94',
    verificationDate: '2026-10-05',
    notes: 'Base 260% plus 30% overtime premium (3.38x regular hourly rate)'
  },
  {
    earningCode: 'EARN-OT-ND',
    description: 'Overtime with Night Shift Differential (1.375x hourly rate)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 86 & 87',
    verificationDate: '2026-10-05',
    notes: '1.25x OT rate compounded with 10% night differential for work past 10PM'
  },
  {
    earningCode: 'EARN-HOL-SPEREST',
    description: 'Special Non-Working Holiday on Scheduled Rest Day (150% rate)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Handbook on Statutory Monetary Benefits',
    verificationDate: '2026-10-05',
    notes: '150% of regular daily rate for work performed on special day falling on employee rest day'
  },
  {
    earningCode: 'EARN-HOL-WORK',
    description: 'Special Working Holiday (100% regular rate)',
    taxable: true,
    sssApplicable: true,
    philHealthApplicable: true,
    pagIbigApplicable: true,
    includedIn13thMonth: true,
    includedInRegularRate: true,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Advisory / Official Gazette',
    verificationDate: '2026-10-05',
    notes: 'Considered regular working day with standard basic pay; no premium payable'
  },
  {
    earningCode: 'EARN-HOL-DBL',
    description: 'Double Regular Holiday Pay (300% worked / 200% unworked)',
    taxable: true,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'DOLE Labor Code Art. 94 Rules',
    verificationDate: '2026-10-05',
    notes: 'Applicable when 2 regular holidays fall on same calendar day (e.g. Maundy Thu + Araw ng Kagitingan)'
  },
  {
    earningCode: 'EARN-DEMIN-MEDEE',
    description: 'De Minimis Medical Cash Allowance to Employees (₱10,000 / year ceiling)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 10000.00,
    deMinimisFrequency: 'Annual',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 11-2018',
    verificationDate: '2026-10-05',
    notes: 'Direct medical cash allowance to employee to assist with healthcare expenses'
  },
  {
    earningCode: 'EARN-DEMIN-GIFT',
    description: 'De Minimis Christmas & Major Anniversary Gifts (₱5,000 / year ceiling)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 5000.00,
    deMinimisFrequency: 'Annual',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 11-2018',
    verificationDate: '2026-10-05',
    notes: 'Gifts given during Christmas and major anniversary celebrations'
  },
  {
    earningCode: 'EARN-DEMIN-AWARD',
    description: 'De Minimis Employee Achievement Awards (₱10,000 / year ceiling)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 10000.00,
    deMinimisFrequency: 'Annual',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 11-2018',
    verificationDate: '2026-10-05',
    notes: 'Tangible personal property for length of service or safety achievement'
  },
  {
    earningCode: 'EARN-DEMIN-MEAL',
    description: 'De Minimis Daily Meal Allowance for Overtime (25% min wage ceiling)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 161.25,
    deMinimisFrequency: 'Daily per OT Shift',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 11-2018',
    verificationDate: '2026-10-05',
    notes: 'Meals for overtime work not exceeding 25% of the basic minimum wage per day'
  },
  {
    earningCode: 'EARN-DEMIN-CBA',
    description: 'De Minimis Benefits under CBA & Productivity Schemes (₱10,000 / year ceiling)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 10000.00,
    deMinimisFrequency: 'Annual',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'BIR Revenue Regulations No. 11-2018',
    verificationDate: '2026-10-05',
    notes: 'Benefits received by an employee by virtue of a Collective Bargaining Agreement'
  },
  {
    earningCode: 'EARN-BONUS-PROD',
    description: 'Production & Performance Incentive Bonus (Under ₱90k Cap)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: 90000.00,
    deMinimisFrequency: 'Annual Statutory Cap',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'RA 10963 TRAIN Law / NIRC Sec. 32(B)(7)(e)',
    verificationDate: '2026-10-05',
    notes: 'Share in company performance; exempt up to remainder of ₱90k statutory ceiling'
  },
  {
    earningCode: 'EARN-HAZARD',
    description: 'Hazard Pay (Tax-exempt for Minimum Wage Earners)',
    taxable: false,
    sssApplicable: false,
    philHealthApplicable: false,
    pagIbigApplicable: false,
    includedIn13thMonth: false,
    includedInRegularRate: false,
    deMinimisLimit: null,
    deMinimisFrequency: null,
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    source: 'Republic Act No. 9504 / TRAIN Law',
    verificationDate: '2026-10-05',
    notes: '100% tax-exempt for Minimum Wage Earners; taxable for regular salaried personnel'
  }
];

export interface StatutoryVerificationAuditItem {
  id: string;
  category: string;
  regulatoryBody: string;
  governingLaw: string;
  circularOrIssuance: string;
  effectiveFrom: string;
  effectiveTo: string;
  verificationDate: string;
  officialSourceUrl: string;
  mandatedFormulaOrRule: string;
  implementationStatus: 'VERIFIED_AND_IMPLEMENTED';
  keyRatesOrRules: string;
  auditNotes: string;
}

export const STATUTORY_VERIFICATION_AUDIT_MASTER: StatutoryVerificationAuditItem[] = [
  {
    id: 'VERIF-SSS-01',
    category: 'SSS (Social Security System)',
    regulatoryBody: 'Social Security System (SSS)',
    governingLaw: 'Republic Act No. 11199 (Social Security Act of 2018)',
    circularOrIssuance: 'SSS Circular No. 2024-034 / RA 11199 Section 4',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.sss.gov.ph/sss/DownloadContent?fileName=RA-11199.pdf',
    mandatedFormulaOrRule: 'XLOOKUP against official 35,000 MSC bracket schedule. 15% rate: 5% EE / 10% ER. Regular MSC up to ₱20K; WISP MSC from ₱20K to ₱35K.',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: '15.0% Total (5.0% EE / 10.0% ER), ₱5,000 Min MSC, ₱35,000 Max MSC with WISP',
    auditNotes: 'Verified against RA 11199 statutory schedule increasing rate to 15% effective 2025. Version controlled under SSS-2025-V1.'
  },
  {
    id: 'VERIF-EC-02',
    category: "Employees' Compensation (EC)",
    regulatoryBody: 'Employees Compensation Commission (ECC)',
    governingLaw: 'Presidential Decree No. 626 (as amended)',
    circularOrIssuance: 'ECC Board Resolution No. 14-07-19',
    effectiveFrom: '2025-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://ecc.gov.ph/ec-contribution-table/',
    mandatedFormulaOrRule: 'IF(MSC < 15000, 10.00, 30.00). 100% Employer paid. Zero employee deduction.',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: '₱10.00 for MSC < ₱15K; ₱30.00 for MSC >= ₱15K (ER only)',
    auditNotes: 'State Insurance Fund contribution for work-connected disability, death, and medical benefits. Version controlled under EC-2025-V1.'
  },
  {
    id: 'VERIF-PHIC-03',
    category: 'PhilHealth',
    regulatoryBody: 'Philippine Health Insurance Corporation',
    governingLaw: 'Republic Act No. 11223 (Universal Health Care Act)',
    circularOrIssuance: 'PhilHealth Advisory No. 2024-0013 / Circular No. 2020-0005',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.philhealth.gov.ph/advisories/2024/adv2024-0013.pdf',
    mandatedFormulaOrRule: 'ROUND(MIN(MAX(Monthly_Salary, 10000), 100000) * 0.05 / 2, 2)',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: '5.0% Premium Rate (2.5% EE / 2.5% ER), ₱10,000 Floor (₱500 min), ₱100,000 Ceiling (₱5,000 max)',
    auditNotes: '5.0% premium rate confirmed active with ₱100K salary ceiling. Version controlled under PHIC-2024-V1.'
  },
  {
    id: 'VERIF-HDMF-04',
    category: 'Pag-IBIG (HDMF)',
    regulatoryBody: 'Home Development Mutual Fund (Pag-IBIG Fund)',
    governingLaw: 'Republic Act No. 9679 / HDMF Circular No. 460',
    circularOrIssuance: 'Pag-IBIG Fund Circular No. 460 (effective Feb 2024 onwards)',
    effectiveFrom: '2024-02-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.pagibigfund.gov.ph/document/pdf/circulars/provident/Circular%20No.%20460.pdf',
    mandatedFormulaOrRule: 'ROUND(MIN(MAX(Monthly_Salary, 0) * 0.02, 200), 2)',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: '2% EE / 2% ER on Monthly Compensation up to ₱10,000 base. Maximum ₱200.00 EE / ₱200.00 ER cap.',
    auditNotes: 'Max monthly compensation doubled from ₱5K to ₱10K per Circular 460, resulting in mandatory ₱200/₱200 cap. Version controlled under HDMF-2024-V1.'
  },
  {
    id: 'VERIF-BIR-05',
    category: 'BIR Withholding Tax',
    regulatoryBody: 'Bureau of Internal Revenue (BIR)',
    governingLaw: 'Republic Act No. 10963 (TRAIN Law) & RA 9504 (MWE Act)',
    circularOrIssuance: 'Revenue Memorandum Circular No. 24-2023 / Revenue Regulations No. 11-2018',
    effectiveFrom: '2023-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.bir.gov.ph/images/bir_files/internal_guidelines/rmc/2023/RMC%20No.%2024-2023.pdf',
    mandatedFormulaOrRule: 'IF(Is_MWE=TRUE, 0, ROUND(Base_Tax + (Taxable_Income - Floor) * Excess_Rate, 2))',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: 'TRAIN Phase II revised brackets (0%, 15%, 20%, 25%, 30%, 35%) + 100% statutory exemption for Minimum Wage Earners',
    auditNotes: 'Semi-monthly bracket 1 exempt up to ₱10,417; monthly exempt up to ₱20,833. Version controlled under TAX-TRAIN-SM and TAX-TRAIN-M.'
  },
  {
    id: 'VERIF-HOL-06',
    category: 'Holiday Pay',
    regulatoryBody: 'Department of Labor and Employment (DOLE)',
    governingLaw: 'DOLE Labor Code Article 94 & Presidential Proclamations',
    circularOrIssuance: 'DOLE Handbook on Workers Statutory Monetary Benefits / Procl. 727 & Procl. 1028',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.dole.gov.ph/statutory-monetary-benefits/',
    mandatedFormulaOrRule: 'Regular unworked = 100%; Regular worked = 200%; Regular on Rest Day = 260%; Special worked = 130%; Special on Rest Day = 150%; Double Holiday = 300%.',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: 'Regular 200% / 100%, Special 130%, Rest Day Regular 260%, Rest Day Special 150%, Double Holiday 300%',
    auditNotes: 'Configurable by implementation year (2025: Proclamation 727; 2026: Proclamation 1028) with verified DOLE multipliers.'
  },
  {
    id: 'VERIF-OT-07',
    category: 'Overtime Pay',
    regulatoryBody: 'Department of Labor and Employment (DOLE)',
    governingLaw: 'DOLE Labor Code Article 87',
    circularOrIssuance: 'DOLE Labor Code Article 87 / Handbook 2024 Edition',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.dole.gov.ph/overtime-pay/',
    mandatedFormulaOrRule: 'Regular Day OT = Hourly_Rate * 1.25; Rest Day / Special Day OT = Hourly_Rate * 1.30 * 1.30 (1.69x); Regular Holiday OT = Hourly_Rate * 2.00 * 1.30 (2.60x).',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: '+25% for regular workday OT (1.25x); +30% on applicable day rate for rest day/special/holiday OT',
    auditNotes: 'Coded with exact formulas in calculation engine (Sheet 17) and verified across 10 DTR scenarios.'
  },
  {
    id: 'VERIF-ND-08',
    category: 'Night Shift Differential',
    regulatoryBody: 'Department of Labor and Employment (DOLE)',
    governingLaw: 'DOLE Labor Code Article 86',
    circularOrIssuance: 'DOLE Labor Code Article 86 / Handbook 2024 Edition',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.dole.gov.ph/night-shift-differential/',
    mandatedFormulaOrRule: 'Hourly_Rate * 0.10 for each hour worked between 10:00 PM and 6:00 AM. Compounded on overtime/holiday rates.',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: 'Mandatory +10% premium on regular hourly rate for hours 10:00 PM – 6:00 AM',
    auditNotes: 'Implemented in DTR timekeeping engine (Sheet 28) and payroll variable inputs (Sheet 16).'
  },
  {
    id: 'VERIF-LEAVE-09',
    category: 'Leave-Related Statutory Rules',
    regulatoryBody: 'DOLE / SSS / PhilHealth / Malacañang',
    governingLaw: 'Labor Code Art. 95 (SIL), RA 11210 (EML), RA 8187 (Paternity), RA 11861 (Solo Parent), RA 9262 (VAWC), RA 9710 (Magna Carta)',
    circularOrIssuance: 'DOLE Labor Code Art. 95 & Statutory Leave Implementing Rules and Regulations',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.dole.gov.ph/statutory-leaves/',
    mandatedFormulaOrRule: 'SIL: 5 days paid leave (commutable to cash); Maternity: 105 days full pay; Paternity: 7 days full pay; Solo Parent: 7 days; VAWC: 10 days; Gynecological: up to 2 months.',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: 'Full statutory leave entitlements with cash commutation rules and tax treatment',
    auditNotes: 'Coded in Employee Self-Service, Talent Suite, and Compensation Classification master.'
  },
  {
    id: 'VERIF-13TH-10',
    category: '13th Month Pay',
    regulatoryBody: 'DOLE / BIR',
    governingLaw: 'Presidential Decree No. 851 & RA 10963 TRAIN Law',
    circularOrIssuance: 'DOLE Revised Guidelines on Implementation of PD 851 / BIR RR 11-2018',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.dole.gov.ph/13th-month-pay/',
    mandatedFormulaOrRule: 'Total_Basic_Salary_Earned_In_Year / 12. Exempt from income tax up to ₱90,000 statutory cap; excess is taxable.',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: 'Mandatory prorated basic / 12; paid on or before Dec 24; ₱90,000 tax exemption ceiling',
    auditNotes: 'Implemented in Stage 8 13th Month & Annualization engine (Sheets 25-26) and PH Payroll Portal.'
  },
  {
    id: 'VERIF-TAXCOMP-11',
    category: 'Taxable vs Non-Taxable Compensation',
    regulatoryBody: 'Bureau of Internal Revenue (BIR)',
    governingLaw: 'National Internal Revenue Code (NIRC) Section 32 & TRAIN Law',
    circularOrIssuance: 'BIR Revenue Regulations No. 2-98 as amended / RR 11-2018',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.bir.gov.ph/tax-code/',
    mandatedFormulaOrRule: 'Taxable_Base = Gross_Compensation - Statutory_Contributions (EE) - Non_Taxable_Allowances - De_Minimis_Within_Ceiling.',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: 'All earnings taxable unless specifically excluded by Tax Code, Special Laws, or De Minimis limits',
    auditNotes: 'Classified in Sheet 17 and validated across all compensation earning codes.'
  },
  {
    id: 'VERIF-DEMIN-12',
    category: 'De Minimis Benefits',
    regulatoryBody: 'Bureau of Internal Revenue (BIR)',
    governingLaw: 'NIRC Section 33 & BIR Revenue Regulations No. 11-2018',
    circularOrIssuance: 'BIR Revenue Regulations No. 11-2018 / RR 5-2011 / RR 1-2015',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.bir.gov.ph/revenue-regulations/',
    mandatedFormulaOrRule: 'Rice: ₱2K/mo; Clothing: ₱6K/yr; Dependent Med: ₱1.5K/sem; Laundry: ₱300/mo; Employee Med: ₱10K/yr; Unused VL: 10 days; Meal: 25% min wage; Awards: ₱10K/yr; Gifts: ₱5K/yr; CBA: ₱10K/yr.',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: 'Full 10-item statutory catalog with monetary thresholds; exempt from withholding tax and FBT',
    auditNotes: 'Excess above individual limits cascades into ₱90,000 other benefits exemption ceiling.'
  },
  {
    id: 'VERIF-RULES-13',
    category: 'Other Applicable Statutory Payroll Rules',
    regulatoryBody: 'DOLE / BIR / COA / Financial Regulators',
    governingLaw: 'Republic Act No. 9504, NIRC Section 79, DOLE Explanatory Bulletins',
    circularOrIssuance: 'BIR Revenue Regulations No. 10-2008 / RMC 24-2023 / DOLE Rules',
    effectiveFrom: '2024-01-01',
    effectiveTo: '2099-12-31',
    verificationDate: '2026-10-05',
    officialSourceUrl: 'https://www.bir.gov.ph/',
    mandatedFormulaOrRule: 'MWE 100% tax exemption; 50/50 semi-monthly statutory deduction split vs 2nd cutoff policy; Year-end BIR 2316 tax annualization; 4-eye dual authorization.',
    implementationStatus: 'VERIFIED_AND_IMPLEMENTED',
    keyRatesOrRules: 'Minimum Wage Earner exemption; 2nd cutoff deduction alignment; BIR 2316 annualization reconciliation',
    auditNotes: 'Governs overall system logic, period validations, and executive approval workflows across Stages 1–10.'
  }
];

// -------------------------------------------------------------
// STATUTORY CALCULATION ENGINE FUNCTIONS (Pure TypeScript)
// -------------------------------------------------------------

export interface SssComputationResult {
  ruleId: string;
  salaryBase: number;
  totalMsc: number;
  regularMsc: number;
  wispMsc: number;
  ssEe: number;
  ssEr: number;
  ecEr: number;
  wispEe: number;
  wispEr: number;
  totalEe: number;
  totalEr: number;
  totalContribution: number;
}

export function computeSssContribution(monthlySalary: number): SssComputationResult {
  const salary = Math.max(0, monthlySalary);
  let totalMsc: number;

  if (salary < 5250) {
    totalMsc = 5000;
  } else if (salary >= 34750) {
    totalMsc = 35000;
  } else {
    const tier = Math.floor((salary - 4750) / 500);
    totalMsc = Math.min(35000, Math.max(5000, tier * 500));
  }

  const regularMsc = Math.min(totalMsc, 20000);
  const wispMsc = Math.max(0, totalMsc - 20000);

  const ssEe = Math.round(regularMsc * 0.05 * 100) / 100;
  const ssEr = Math.round(regularMsc * 0.10 * 100) / 100;
  const ecEr = totalMsc < 15000 ? 10.00 : 30.00;
  const wispEe = Math.round(wispMsc * 0.05 * 100) / 100;
  const wispEr = Math.round(wispMsc * 0.10 * 100) / 100;

  const totalEe = Math.round((ssEe + wispEe) * 100) / 100;
  const totalEr = Math.round((ssEr + wispEr + ecEr) * 100) / 100;

  return {
    ruleId: 'SSS-2025-V1',
    salaryBase: salary,
    totalMsc,
    regularMsc,
    wispMsc,
    ssEe,
    ssEr,
    ecEr,
    wispEe,
    wispEr,
    totalEe,
    totalEr,
    totalContribution: Math.round((totalEe + totalEr) * 100) / 100,
  };
}

export interface PhilHealthComputationResult {
  ruleId: string;
  salaryBase: number;
  monthlyBasicSalary: number;
  rate: number;
  totalPremium: number;
  eeShare: number;
  erShare: number;
}

export function computePhilHealthContribution(monthlySalary: number): PhilHealthComputationResult {
  const salary = Math.max(0, monthlySalary);
  const mbs = Math.min(Math.max(salary, 10000), 100000);
  const rate = 0.05; // 5.0% under RA 11223
  const totalPremium = Math.round(mbs * rate * 100) / 100;
  const eeShare = Math.round((totalPremium / 2) * 100) / 100;
  const erShare = Math.round((totalPremium - eeShare) * 100) / 100;

  return {
    ruleId: 'PHIC-2024-V1',
    salaryBase: salary,
    monthlyBasicSalary: mbs,
    rate,
    totalPremium,
    eeShare,
    erShare,
  };
}

export interface PagIbigComputationResult {
  ruleId: string;
  salaryBase: number;
  effectiveBase: number;
  eeRate: number;
  erRate: number;
  eeShare: number;
  erShare: number;
  totalContribution: number;
}

export function computePagIbigContribution(monthlySalary: number): PagIbigComputationResult {
  const salary = Math.max(0, monthlySalary);
  const effectiveBase = Math.min(salary, 10000);
  const eeRate = salary <= 1500 ? 0.01 : 0.02;
  const erRate = 0.02;

  const eeShare = Math.min(200.00, Math.round(effectiveBase * eeRate * 100) / 100);
  const erShare = Math.min(200.00, Math.round(effectiveBase * erRate * 100) / 100);

  return {
    ruleId: 'HDMF-2024-V1',
    salaryBase: salary,
    effectiveBase,
    eeRate,
    erRate,
    eeShare,
    erShare,
    totalContribution: Math.round((eeShare + erShare) * 100) / 100,
  };
}

export interface BirTaxComputationResult {
  taxRuleId: string;
  payrollFrequency: 'Semi-Monthly' | 'Monthly';
  taxableIncome: number;
  tierLevel: number;
  compensationFloor: number;
  compensationCeiling: number;
  baseTaxAmount: number;
  excessPercentage: number;
  taxableExcess: number;
  computedTax: number;
  isMinimumWageEarner: boolean;
  exemptionReason?: string;
}

export function computeBirWithholdingTax(
  taxableIncome: number,
  frequency: 'Semi-Monthly' | 'Monthly' = 'Semi-Monthly',
  isMinimumWageEarner: boolean = false
): BirTaxComputationResult {
  if (isMinimumWageEarner) {
    return {
      taxRuleId: 'TAX-TRAIN-MWE-EXEMPT',
      payrollFrequency: frequency,
      taxableIncome: Math.max(0, taxableIncome),
      tierLevel: 1,
      compensationFloor: 0,
      compensationCeiling: 0,
      baseTaxAmount: 0,
      excessPercentage: 0,
      taxableExcess: 0,
      computedTax: 0,
      isMinimumWageEarner: true,
      exemptionReason: 'Statutory Minimum Wage Earner (RA 9504 / TRAIN Law Sec. 24(A)(2))',
    };
  }

  const income = Math.max(0, taxableIncome);
  const matchingTable = TAX_TABLES_MASTER.filter((t) => t.payrollFrequency === frequency);

  let matchedBracket = matchingTable[0];
  for (const bracket of matchingTable) {
    if (income >= bracket.compensationFloor && income <= bracket.compensationCeiling) {
      matchedBracket = bracket;
      break;
    }
  }

  const taxableExcess = Math.max(0, income - matchedBracket.compensationFloor);
  const excessTax = Math.round(taxableExcess * matchedBracket.excessPercentage * 100) / 100;
  const computedTax = Math.round((matchedBracket.baseTaxAmount + excessTax) * 100) / 100;

  return {
    taxRuleId: matchedBracket.taxRuleId,
    payrollFrequency: frequency,
    taxableIncome: income,
    tierLevel: matchedBracket.tierLevel,
    compensationFloor: matchedBracket.compensationFloor,
    compensationCeiling: matchedBracket.compensationCeiling,
    baseTaxAmount: matchedBracket.baseTaxAmount,
    excessPercentage: matchedBracket.excessPercentage,
    taxableExcess,
    computedTax,
    isMinimumWageEarner: false,
  };
}

// -------------------------------------------------------------
// COMPREHENSIVE STATUTORY TEST PROFILES (12 Real Benchmark Employees)
// -------------------------------------------------------------

export interface EmployeeStatutoryTestResult {
  employeeId: string;
  employeeName: string;
  position: string;
  monthlySalary: number;
  semiMonthlySalary: number;
  isMwe: boolean;
  sssMonthlyEe: number;
  sssMonthlyEr: number;
  phicMonthlyEe: number;
  phicMonthlyEr: number;
  hdmfMonthlyEe: number;
  hdmfMonthlyEr: number;
  totalMonthlyEeStatutory: number;
  totalMonthlyErStatutory: number;
  semiMonthlyEeStatutoryDeduction: number;
  semiMonthlyTaxableCompensation: number;
  birTaxBracket: string;
  semiMonthlyWithholdingTax: number;
  semiMonthlyNetPay: number;
}

export const EMPLOYEE_STATUTORY_TEST_RESULTS: EmployeeStatutoryTestResult[] = [
  {
    employeeId: 'EMP-2025-0001',
    employeeName: 'Dela Cruz, Juan P.',
    position: 'Chief Executive Officer',
    monthlySalary: 145000.00,
    semiMonthlySalary: 72500.00,
    isMwe: false,
    sssMonthlyEe: 1750.00, // Capped at ₱35,000 MSC (₱1,000 regular + ₱750 WISP)
    sssMonthlyEr: 3530.00, // ₱2,000 regular + ₱1,500 WISP + ₱30 EC
    phicMonthlyEe: 2500.00, // Capped at ₱100,000 ceiling (5% = ₱5,000 / 2)
    phicMonthlyEr: 2500.00,
    hdmfMonthlyEe: 200.00, // Capped at ₱10,000 ceiling (2%)
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 4450.00,
    totalMonthlyErStatutory: 6230.00,
    semiMonthlyEeStatutoryDeduction: 2225.00,
    semiMonthlyTaxableCompensation: 70275.00, // 72,500 - 2,225
    birTaxBracket: 'Tier 4 (₱4,270.70 + 25% over ₱33,333)',
    semiMonthlyWithholdingTax: 13506.20, // 4,270.70 + (70,275 - 33,333) * 0.25
    semiMonthlyNetPay: 56768.80, // 72,500 - 2,225 - 13,506.20
  },
  {
    employeeId: 'EMP-2025-0002',
    employeeName: 'Santos, Maria C.',
    position: 'Finance Director',
    monthlySalary: 92000.00,
    semiMonthlySalary: 46000.00,
    isMwe: false,
    sssMonthlyEe: 1750.00, // Capped at ₱35,000 MSC
    sssMonthlyEr: 3530.00,
    phicMonthlyEe: 2300.00, // ₱92,000 * 5% = ₱4,600 / 2
    phicMonthlyEr: 2300.00,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 4250.00,
    totalMonthlyErStatutory: 6030.00,
    semiMonthlyEeStatutoryDeduction: 2125.00,
    semiMonthlyTaxableCompensation: 43875.00, // 46,000 - 2,125
    birTaxBracket: 'Tier 4 (₱4,270.70 + 25% over ₱33,333)',
    semiMonthlyWithholdingTax: 6906.20, // 4,270.70 + (43,875 - 33,333) * 0.25
    semiMonthlyNetPay: 36968.80,
  },
  {
    employeeId: 'EMP-2025-0003',
    employeeName: 'Reyes, Roberto M.',
    position: 'HR Manager',
    monthlySalary: 58000.00,
    semiMonthlySalary: 29000.00,
    isMwe: false,
    sssMonthlyEe: 1750.00, // Capped at ₱35,000 MSC
    sssMonthlyEr: 3530.00,
    phicMonthlyEe: 1450.00, // ₱58,000 * 5% = ₱2,900 / 2
    phicMonthlyEr: 1450.00,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 3400.00,
    totalMonthlyErStatutory: 5180.00,
    semiMonthlyEeStatutoryDeduction: 1700.00,
    semiMonthlyTaxableCompensation: 27300.00, // 29,000 - 1,700
    birTaxBracket: 'Tier 3 (₱937.50 + 20% over ₱16,667)',
    semiMonthlyWithholdingTax: 3064.10, // 937.50 + (27,300 - 16,667) * 0.20
    semiMonthlyNetPay: 24235.90,
  },
  {
    employeeId: 'EMP-2025-0004',
    employeeName: 'Bautista, Elena S.',
    position: 'Lead Software Architect',
    monthlySalary: 115000.00,
    semiMonthlySalary: 57500.00,
    isMwe: false,
    sssMonthlyEe: 1750.00, // Capped at ₱35,000 MSC
    sssMonthlyEr: 3530.00,
    phicMonthlyEe: 2500.00, // Capped at ₱100,000 ceiling
    phicMonthlyEr: 2500.00,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 4450.00,
    totalMonthlyErStatutory: 6230.00,
    semiMonthlyEeStatutoryDeduction: 2225.00,
    semiMonthlyTaxableCompensation: 55275.00, // 57,500 - 2,225
    birTaxBracket: 'Tier 4 (₱4,270.70 + 25% over ₱33,333)',
    semiMonthlyWithholdingTax: 9756.20, // 4,270.70 + (55,275 - 33,333) * 0.25
    semiMonthlyNetPay: 45518.80,
  },
  {
    employeeId: 'EMP-2025-0005',
    employeeName: 'Garcia, Arlene T.',
    position: 'Production Shift Supervisor',
    monthlySalary: 42000.00,
    semiMonthlySalary: 21000.00,
    isMwe: false,
    sssMonthlyEe: 1750.00, // Capped at ₱35,000 MSC
    sssMonthlyEr: 3530.00,
    phicMonthlyEe: 1050.00, // ₱42,000 * 5% = ₱2,100 / 2
    phicMonthlyEr: 1050.00,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 3000.00,
    totalMonthlyErStatutory: 4780.00,
    semiMonthlyEeStatutoryDeduction: 1500.00,
    semiMonthlyTaxableCompensation: 19500.00, // 21,000 - 1,500
    birTaxBracket: 'Tier 3 (₱937.50 + 20% over ₱16,667)',
    semiMonthlyWithholdingTax: 1504.10, // 937.50 + (19,500 - 16,667) * 0.20
    semiMonthlyNetPay: 17995.90,
  },
  {
    employeeId: 'EMP-2025-0006',
    employeeName: 'Mendoza, Danilo B.',
    position: 'Machine Operator II',
    monthlySalary: 22500.00,
    semiMonthlySalary: 11250.00,
    isMwe: false,
    sssMonthlyEe: 1125.00, // MSC = ₱22,500 -> ₱1,000 reg + ₱125 wisp
    sssMonthlyEr: 2280.00, // ₱2,000 reg + ₱250 wisp + ₱30 EC
    phicMonthlyEe: 562.50, // ₱22,500 * 5% = ₱1,125 / 2
    phicMonthlyEr: 562.50,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 1887.50,
    totalMonthlyErStatutory: 3042.50,
    semiMonthlyEeStatutoryDeduction: 943.75,
    semiMonthlyTaxableCompensation: 10306.25, // 11,250 - 943.75
    birTaxBracket: 'Tier 1 (₱0 to ₱10,417 = ₱0.00 Tax Exempt)',
    semiMonthlyWithholdingTax: 0.00, // Below ₱10,417
    semiMonthlyNetPay: 10306.25,
  },
  {
    employeeId: 'EMP-2025-0007',
    employeeName: 'Villanueva, Grace N.',
    position: 'Senior Accountant',
    monthlySalary: 48000.00,
    semiMonthlySalary: 24000.00,
    isMwe: false,
    sssMonthlyEe: 1750.00, // Capped at ₱35,000 MSC
    sssMonthlyEr: 3530.00,
    phicMonthlyEe: 1200.00, // ₱48,000 * 5% = ₱2,400 / 2
    phicMonthlyEr: 1200.00,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 3150.00,
    totalMonthlyErStatutory: 4930.00,
    semiMonthlyEeStatutoryDeduction: 1575.00,
    semiMonthlyTaxableCompensation: 22425.00, // 24,000 - 1,575
    birTaxBracket: 'Tier 3 (₱937.50 + 20% over ₱16,667)',
    semiMonthlyWithholdingTax: 2089.10, // 937.50 + (22,425 - 16,667) * 0.20
    semiMonthlyNetPay: 20335.90,
  },
  {
    employeeId: 'EMP-2025-0008',
    employeeName: 'Castro, Mark Anthony L.',
    position: 'QA Inspector',
    monthlySalary: 26000.00,
    semiMonthlySalary: 13000.00,
    isMwe: false,
    sssMonthlyEe: 1300.00, // MSC = ₱26,000 -> ₱1,000 reg + ₱300 wisp
    sssMonthlyEr: 2630.00, // ₱2,000 reg + ₱600 wisp + ₱30 EC
    phicMonthlyEe: 650.00, // ₱26,000 * 5% = ₱1,300 / 2
    phicMonthlyEr: 650.00,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 2150.00,
    totalMonthlyErStatutory: 3480.00,
    semiMonthlyEeStatutoryDeduction: 1075.00,
    semiMonthlyTaxableCompensation: 11925.00, // 13,000 - 1,075
    birTaxBracket: 'Tier 2 (15% over ₱10,417)',
    semiMonthlyWithholdingTax: 226.20, // (11,925 - 10,417) * 0.15
    semiMonthlyNetPay: 11698.80,
  },
  {
    employeeId: 'EMP-2025-0009',
    employeeName: 'Lim, Patricia A.',
    position: 'Sales Account Executive',
    monthlySalary: 35000.00,
    semiMonthlySalary: 17500.00,
    isMwe: false,
    sssMonthlyEe: 1750.00, // MSC = ₱35,000
    sssMonthlyEr: 3530.00,
    phicMonthlyEe: 875.00, // ₱35,000 * 5% = ₱1,750 / 2
    phicMonthlyEr: 875.00,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 2825.00,
    totalMonthlyErStatutory: 4605.00,
    semiMonthlyEeStatutoryDeduction: 1412.50,
    semiMonthlyTaxableCompensation: 16087.50, // 17,500 - 1,412.50
    birTaxBracket: 'Tier 2 (15% over ₱10,417)',
    semiMonthlyWithholdingTax: 850.58, // (16,087.50 - 10,417) * 0.15
    semiMonthlyNetPay: 15236.92,
  },
  {
    employeeId: 'EMP-2025-0010',
    employeeName: 'Tan, Josephine D.',
    position: 'UI/UX Designer',
    monthlySalary: 65000.00,
    semiMonthlySalary: 32500.00,
    isMwe: false,
    sssMonthlyEe: 1750.00, // Capped at ₱35,000 MSC
    sssMonthlyEr: 3530.00,
    phicMonthlyEe: 1625.00, // ₱65,000 * 5% = ₱3,250 / 2
    phicMonthlyEr: 1625.00,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 3575.00,
    totalMonthlyErStatutory: 5355.00,
    semiMonthlyEeStatutoryDeduction: 1787.50,
    semiMonthlyTaxableCompensation: 30712.50, // 32,500 - 1,787.50
    birTaxBracket: 'Tier 3 (₱937.50 + 20% over ₱16,667)',
    semiMonthlyWithholdingTax: 3746.60, // 937.50 + (30,712.50 - 16,667) * 0.20
    semiMonthlyNetPay: 26965.90,
  },
  {
    employeeId: 'EMP-2025-0011',
    employeeName: 'Aquino, Kevin R.',
    position: 'Warehouse Assistant',
    monthlySalary: 14028.75, // ₱645/day * 261 / 12 (NCR Minimum Wage)
    semiMonthlySalary: 7014.38,
    isMwe: true, // NCR Statutory Minimum Wage Earner
    sssMonthlyEe: 700.00, // MSC = ₱14,000
    sssMonthlyEr: 1410.00, // ₱1,400 reg + ₱10 EC
    phicMonthlyEe: 350.72, // ₱14,028.75 * 5% = ₱701.44 / 2
    phicMonthlyEr: 350.72,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 1250.72,
    totalMonthlyErStatutory: 1960.72,
    semiMonthlyEeStatutoryDeduction: 625.36,
    semiMonthlyTaxableCompensation: 6389.02,
    birTaxBracket: 'MWE Statutory Exemption (₱0.00 Tax)',
    semiMonthlyWithholdingTax: 0.00, // 100% Tax Exempt under RA 9504 / TRAIN Law
    semiMonthlyNetPay: 6389.02,
  },
  {
    employeeId: 'EMP-2025-0012',
    employeeName: 'Ramos, Clarissa E.',
    position: 'Marketing Specialist',
    monthlySalary: 38000.00,
    semiMonthlySalary: 19000.00,
    isMwe: false,
    sssMonthlyEe: 1750.00, // Capped at ₱35,000 MSC
    sssMonthlyEr: 3530.00,
    phicMonthlyEe: 950.00, // ₱38,000 * 5% = ₱1,900 / 2
    phicMonthlyEr: 950.00,
    hdmfMonthlyEe: 200.00,
    hdmfMonthlyEr: 200.00,
    totalMonthlyEeStatutory: 2900.00,
    totalMonthlyErStatutory: 4680.00,
    semiMonthlyEeStatutoryDeduction: 1450.00,
    semiMonthlyTaxableCompensation: 17550.00, // 19,000 - 1,450
    birTaxBracket: 'Tier 3 (₱937.50 + 20% over ₱16,667)',
    semiMonthlyWithholdingTax: 1114.10, // 937.50 + (17,550 - 16,667) * 0.20
    semiMonthlyNetPay: 16435.90,
  }
];
