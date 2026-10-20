// Shared journal / Chart-of-Accounts defaults.
// Industry presets are Philippines-oriented SME starter charts, not a mandatory
// statutory chart of accounts. Each client can select an industry, and the
// selected preset is used only when that client's own COA is empty or when the
// user explicitly chooses Reset / Choose Format.
//
// COA hierarchy (BIR AFS-aligned, per latest COA format):
//   Level 1 — Statement section : ASSETS / LIABILITIES / EQUITY / REVENUE /
//              COST OF REVENUE-SALES / EXPENSES / OTHER INCOME (EXPENSES)
//   Level 2 — Classification     : CURRENT / NONCURRENT assets & liabilities,
//              OVERHEAD under cost of revenue
//   Level 3 — Account group      : CASH AND CASH EQUIVALENTS, TRADE AND OTHER
//              RECEIVABLES, SALARIES AND WAGES, etc.
//   Level 4 — Postable accounts  : Cash on Hand, Accounts Receivable, etc.
// Parent/child links are carried via parentId so the Chart of Accounts screen
// renders an indented tree identical to the prescribed COA layout.
import type { JournalColumn, CoaAccount, ClientIndustry } from '../types';
export type { ClientIndustry } from '../types';
export const INDUSTRY_OPTIONS: Array<{ value: ClientIndustry; label: string }> = [
  { value: 'retail', label: 'Retail / Trading' },
  { value: 'general-services', label: 'General Services' },
  { value: 'manufacturing', label: 'Manufacturing' },
  { value: 'construction', label: 'Construction / Contracting' },
];
export const DEFAULT_INDUSTRY: ClientIndustry = 'general-services';
type AccountSeed = {
  numericId: string;
  alphaId: string;
  name: string;
  type: CoaAccount['type'];
  normalSide: 'debit' | 'credit';
  parentNumericId?: string;
  parentAlphaId?: string;
};
// ---------------------------------------------------------------------------
// COMMON ACCOUNT SEEDS — hierarchical, BIR AFS / latest COA format aligned.
// Header accounts (Levels 1–3) carry the same type as their section so they
// sort and code correctly; detail accounts (Level 4) are the postable ones.
// ---------------------------------------------------------------------------
const COMMON_ACCOUNT_SEEDS: AccountSeed[] = [
  // ===== 100000 ASSETS (Level 1 header) =====
  { numericId: '100000', alphaId: 'ASSET1', name: 'ASSETS', type: 'Asset', normalSide: 'debit' },
  // --- 110000 CURRENT ASSETS (Level 2) ---
  { numericId: '110000', alphaId: 'ASCUR1', name: 'CURRENT ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '100000', parentAlphaId: 'ASSET1' },
  // 111000 CASH AND CASH EQUIVALENTS (Level 3 group)
  { numericId: '111000', alphaId: 'ASCASH', name: 'CASH AND CASH EQUIVALENTS', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  { numericId: '111100', alphaId: 'CASH01', name: 'Cash on Hand', type: 'Asset', normalSide: 'debit', parentNumericId: '111000', parentAlphaId: 'ASCASH' },
  { numericId: '111200', alphaId: 'BANK01', name: 'Cash in Bank', type: 'Asset', normalSide: 'debit', parentNumericId: '111000', parentAlphaId: 'ASCASH' },
  { numericId: '111300', alphaId: 'PETC01', name: 'Petty Cash Fund', type: 'Asset', normalSide: 'debit', parentNumericId: '111000', parentAlphaId: 'ASCASH' },
  // 112000 TRADE AND OTHER RECEIVABLES (Level 3 group)
  { numericId: '112000', alphaId: 'ASRECV', name: 'TRADE AND OTHER RECEIVABLES', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  { numericId: '112100', alphaId: 'ARTR01', name: 'Accounts Receivable', type: 'Asset', normalSide: 'debit', parentNumericId: '112000', parentAlphaId: 'ASRECV' },
  { numericId: '112200', alphaId: 'NRCP01', name: 'Nontrade Receivables', type: 'Asset', normalSide: 'debit', parentNumericId: '112000', parentAlphaId: 'ASRECV' },
  { numericId: '112300', alphaId: 'ADDA01', name: 'Allowance for Doubtful Accounts', type: 'Asset', normalSide: 'credit', parentNumericId: '112000', parentAlphaId: 'ASRECV' },
  { numericId: '112400', alphaId: 'IVAT01', name: 'Input VAT', type: 'Asset', normalSide: 'debit', parentNumericId: '112000', parentAlphaId: 'ASRECV' },
  { numericId: '112500', alphaId: 'CWT001', name: 'Creditable Withholding Tax', type: 'Asset', normalSide: 'debit', parentNumericId: '112000', parentAlphaId: 'ASRECV' },
  // 113000 INVENTORIES (Level 3 group — industry detail accounts appended below)
  { numericId: '113000', alphaId: 'ASINVT', name: 'INVENTORIES', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  // 114000 OTHER CURRENT ASSETS (Level 3 group)
  { numericId: '114000', alphaId: 'ASOTHC', name: 'OTHER CURRENT ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  { numericId: '114100', alphaId: 'PREP01', name: 'Prepaid Expenses', type: 'Asset', normalSide: 'debit', parentNumericId: '114000', parentAlphaId: 'ASOTHC' },
  { numericId: '114200', alphaId: 'SECD01', name: 'Security Deposits', type: 'Asset', normalSide: 'debit', parentNumericId: '114000', parentAlphaId: 'ASOTHC' },
  { numericId: '114300', alphaId: 'ADVS01', name: 'Advances to Suppliers', type: 'Asset', normalSide: 'debit', parentNumericId: '114000', parentAlphaId: 'ASOTHC' },
  // --- 120000 NONCURRENT ASSETS (Level 2) ---
  { numericId: '120000', alphaId: 'ASNCU1', name: 'NONCURRENT ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '100000', parentAlphaId: 'ASSET1' },
  // 121000 PROPERTY, PLANT AND EQUIPMENT (Level 3 group)
  { numericId: '121000', alphaId: 'ASPPE1', name: 'PROPERTY, PLANT AND EQUIPMENT', type: 'Asset', normalSide: 'debit', parentNumericId: '120000', parentAlphaId: 'ASNCU1' },
  { numericId: '121100', alphaId: 'LAND01', name: 'Land', type: 'Asset', normalSide: 'debit', parentNumericId: '121000', parentAlphaId: 'ASPPE1' },
  { numericId: '121200', alphaId: 'BLDG01', name: 'Buildings', type: 'Asset', normalSide: 'debit', parentNumericId: '121000', parentAlphaId: 'ASPPE1' },
  { numericId: '121300', alphaId: 'MACH01', name: 'Machinery and Equipment', type: 'Asset', normalSide: 'debit', parentNumericId: '121000', parentAlphaId: 'ASPPE1' },
  { numericId: '121400', alphaId: 'OEQP01', name: 'Office Equipment', type: 'Asset', normalSide: 'debit', parentNumericId: '121000', parentAlphaId: 'ASPPE1' },
  { numericId: '121500', alphaId: 'FFIX01', name: 'Furniture and Fixtures', type: 'Asset', normalSide: 'debit', parentNumericId: '121000', parentAlphaId: 'ASPPE1' },
  { numericId: '121600', alphaId: 'TRAN01', name: 'Transportation Equipment', type: 'Asset', normalSide: 'debit', parentNumericId: '121000', parentAlphaId: 'ASPPE1' },
  { numericId: '121700', alphaId: 'ADP001', name: 'Accumulated Depreciation - PPE', type: 'Asset', normalSide: 'credit', parentNumericId: '121000', parentAlphaId: 'ASPPE1' },
  // 122000 OTHER NONCURRENT ASSETS (Level 3 group)
  { numericId: '122000', alphaId: 'ASONC1', name: 'OTHER NONCURRENT ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '120000', parentAlphaId: 'ASNCU1' },
  { numericId: '122100', alphaId: 'SWIN01', name: 'Computer Software and Intangibles', type: 'Asset', normalSide: 'debit', parentNumericId: '122000', parentAlphaId: 'ASONC1' },

  // ===== 200000 LIABILITIES (Level 1 header) =====
  { numericId: '200000', alphaId: 'LIAB11', name: 'LIABILITIES', type: 'Liabilities', normalSide: 'credit' },
  // --- 210000 CURRENT LIABILITIES (Level 2) ---
  { numericId: '210000', alphaId: 'LICUR1', name: 'CURRENT LIABILITIES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '200000', parentAlphaId: 'LIAB11' },
  // 211000 TRADE AND OTHER PAYABLES (Level 3 group)
  { numericId: '211000', alphaId: 'LIPAY1', name: 'TRADE AND OTHER PAYABLES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '210000', parentAlphaId: 'LICUR1' },
  { numericId: '211100', alphaId: 'APTR01', name: 'Accounts Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '211000', parentAlphaId: 'LIPAY1' },
  { numericId: '211200', alphaId: 'ACRU01', name: 'Accrued Expenses and Other Payables', type: 'Liabilities', normalSide: 'credit', parentNumericId: '211000', parentAlphaId: 'LIPAY1' },
  { numericId: '211300', alphaId: 'SALP01', name: 'Salaries and Wages Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '211000', parentAlphaId: 'LIPAY1' },
  { numericId: '211400', alphaId: 'STAT01', name: 'SSS, PhilHealth and Pag-IBIG Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '211000', parentAlphaId: 'LIPAY1' },
  { numericId: '211500', alphaId: 'OVAT01', name: 'Output VAT Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '211000', parentAlphaId: 'LIPAY1' },
  { numericId: '211600', alphaId: 'EWTP01', name: 'Expanded Withholding Tax Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '211000', parentAlphaId: 'LIPAY1' },
  { numericId: '211700', alphaId: 'CWTP01', name: 'Compensation Withholding Tax Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '211000', parentAlphaId: 'LIPAY1' },
  { numericId: '211800', alphaId: 'PPTX01', name: 'Percentage Tax Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '211000', parentAlphaId: 'LIPAY1' },
  { numericId: '211900', alphaId: 'ITXP01', name: 'Income Tax Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '211000', parentAlphaId: 'LIPAY1' },
  // 212000 OTHER CURRENT LIABILITIES (Level 3 group)
  { numericId: '212000', alphaId: 'LIOTHC', name: 'OTHER CURRENT LIABILITIES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '210000', parentAlphaId: 'LICUR1' },
  { numericId: '212100', alphaId: 'STLN01', name: 'Short-term Loans Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '212000', parentAlphaId: 'LIOTHC' },
  { numericId: '212200', alphaId: 'LLCU01', name: 'Lease Liabilities - Current', type: 'Liabilities', normalSide: 'credit', parentNumericId: '212000', parentAlphaId: 'LIOTHC' },
  // --- 220000 NONCURRENT LIABILITIES (Level 2) ---
  { numericId: '220000', alphaId: 'LINCU1', name: 'NONCURRENT LIABILITIES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '200000', parentAlphaId: 'LIAB11' },
  { numericId: '221000', alphaId: 'LTLN01', name: 'Long-term Loans Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '220000', parentAlphaId: 'LINCU1' },
  { numericId: '222000', alphaId: 'LLNC01', name: 'Lease Liabilities - Non-current', type: 'Liabilities', normalSide: 'credit', parentNumericId: '220000', parentAlphaId: 'LINCU1' },

  // ===== 300000 EQUITY / CAPITAL (Level 1 header — type swapped per taxpayer) =====
  { numericId: '300000', alphaId: 'EQUIT1', name: 'EQUITY', type: 'Equity', normalSide: 'credit' },
  // 310000 SHARE CAPITAL (Level 3 group — for corporations; sole props see Owner's Capital)
  { numericId: '310000', alphaId: 'EQSHC1', name: 'SHARE CAPITAL', type: 'Equity', normalSide: 'credit', parentNumericId: '300000', parentAlphaId: 'EQUIT1' },
  { numericId: '311000', alphaId: 'OWNC01', name: "Owner's Capital", type: 'Capital', normalSide: 'credit', parentNumericId: '310000', parentAlphaId: 'EQSHC1' },
  { numericId: '312000', alphaId: 'SHCP01', name: 'Share Capital', type: 'Equity', normalSide: 'credit', parentNumericId: '310000', parentAlphaId: 'EQSHC1' },
  { numericId: '313000', alphaId: 'APIC01', name: 'Additional Paid-in Capital', type: 'Equity', normalSide: 'credit', parentNumericId: '310000', parentAlphaId: 'EQSHC1' },
  // 320000 RETAINED EARNINGS (Level 3 group)
  { numericId: '320000', alphaId: 'EQRET1', name: 'RETAINED EARNINGS', type: 'Equity', normalSide: 'credit', parentNumericId: '300000', parentAlphaId: 'EQUIT1' },
  { numericId: '321000', alphaId: 'RETE01', name: 'Retained Earnings', type: 'Equity', normalSide: 'credit', parentNumericId: '320000', parentAlphaId: 'EQRET1' },
  { numericId: '322000', alphaId: 'CYEP01', name: 'Current Year Earnings', type: 'Equity', normalSide: 'credit', parentNumericId: '320000', parentAlphaId: 'EQRET1' },
  { numericId: '323000', alphaId: 'DRAW01', name: "Owner's Drawings", type: 'Capital', normalSide: 'debit', parentNumericId: '320000', parentAlphaId: 'EQRET1' },

  // ===== 400000 REVENUE (Level 1 header) =====
  { numericId: '400000', alphaId: 'REVNU1', name: 'REVENUE', type: 'Revenue', normalSide: 'credit' },
  // 410000 SALES (Level 3 group — industry detail accounts appended below)
  { numericId: '410000', alphaId: 'RESAL1', name: 'SALES', type: 'Revenue', normalSide: 'credit', parentNumericId: '400000', parentAlphaId: 'REVNU1' },
  // 420000 SERVICE INCOME (Level 3 group)
  { numericId: '420000', alphaId: 'RESVC1', name: 'SERVICE INCOME', type: 'Revenue', normalSide: 'credit', parentNumericId: '400000', parentAlphaId: 'REVNU1' },
  // Contra-revenue (returns/discounts) sit under SALES as debit-normal children.
  { numericId: '411000', alphaId: 'SRET01', name: 'Sales Returns and Allowances', type: 'Revenue', normalSide: 'debit', parentNumericId: '410000', parentAlphaId: 'RESAL1' },
  { numericId: '412000', alphaId: 'SDIS01', name: 'Sales Discounts', type: 'Revenue', normalSide: 'debit', parentNumericId: '410000', parentAlphaId: 'RESAL1' },

  // ===== 500000 COST OF REVENUE-SERVICES / COST OF SALES-RETAIL / COST OF GOODS
  //       MANUFACTURED AND SOLD-MANUFACTURING (Level 1 header) =====
  { numericId: '500000', alphaId: 'COSTR1', name: 'COST OF REVENUE / COST OF SALES', type: 'Costs', normalSide: 'debit' },
  // 510000 PURCHASES / DIRECT MATERIALS (Level 3 group)
  { numericId: '510000', alphaId: 'COPUR1', name: 'PURCHASES / DIRECT MATERIALS', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COSTR1' },
  // 520000 DIRECT LABOR (Level 3 group)
  { numericId: '520000', alphaId: 'CODLB1', name: 'DIRECT LABOR', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COSTR1' },
  // 530000 OVERHEAD (Level 2 group under cost of revenue)
  { numericId: '530000', alphaId: 'COOVH1', name: 'OVERHEAD', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COSTR1' },
  // 531000 LIGHT AND WATER (Level 3 under OVERHEAD)
  { numericId: '531000', alphaId: 'COLW11', name: 'LIGHT AND WATER', type: 'Costs', normalSide: 'debit', parentNumericId: '530000', parentAlphaId: 'COOVH1' },
  { numericId: '531100', alphaId: 'POWX01', name: 'Factory Power and Utilities', type: 'Costs', normalSide: 'debit', parentNumericId: '531000', parentAlphaId: 'COLW11' },
  // 532000 DEPRECIATION (Level 3 under OVERHEAD)
  { numericId: '532000', alphaId: 'CODEP1', name: 'DEPRECIATION', type: 'Costs', normalSide: 'debit', parentNumericId: '530000', parentAlphaId: 'COOVH1' },
  { numericId: '532100', alphaId: 'FDEP01', name: 'Factory Depreciation Expense', type: 'Costs', normalSide: 'debit', parentNumericId: '532000', parentAlphaId: 'CODEP1' },
  // Additional cost detail (industry-specific appended below; common here)
  { numericId: '511000', alphaId: 'FREI02', name: 'Freight-In / Purchases Related Costs', type: 'Costs', normalSide: 'debit', parentNumericId: '510000', parentAlphaId: 'COPUR1' },
  { numericId: '533000', alphaId: 'FREP01', name: 'Factory Repairs and Maintenance', type: 'Costs', normalSide: 'debit', parentNumericId: '530000', parentAlphaId: 'COOVH1' },
  { numericId: '534000', alphaId: 'FOHD01', name: 'Factory Overhead - Others', type: 'Costs', normalSide: 'debit', parentNumericId: '530000', parentAlphaId: 'COOVH1' },

  // ===== 600000 EXPENSES (Level 1 header) =====
  { numericId: '600000', alphaId: 'EXPN11', name: 'OPERATING EXPENSES', type: 'Expense', normalSide: 'debit' },
  // 610000 SALARIES AND WAGES (Level 3 group)
  { numericId: '610000', alphaId: 'EXSAL1', name: 'SALARIES AND WAGES', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '611000', alphaId: 'SALA01', name: 'Salaries and Wages Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '610000', parentAlphaId: 'EXSAL1' },
  { numericId: '612000', alphaId: 'EBEX01', name: 'Employee Benefits Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '610000', parentAlphaId: 'EXSAL1' },
  { numericId: '613000', alphaId: 'GOVC01', name: 'Employer SSS, PhilHealth and Pag-IBIG Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '610000', parentAlphaId: 'EXSAL1' },
  // 620000 REPAIRS AND MAINTENANCE (Level 3 group)
  { numericId: '620000', alphaId: 'EXRM11', name: 'REPAIRS AND MAINTENANCE', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '621000', alphaId: 'RMNT01', name: 'Repairs and Maintenance Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '620000', parentAlphaId: 'EXRM11' },
  // 630000 OFFICE SUPPLIES (Level 3 group)
  { numericId: '630000', alphaId: 'EXOS11', name: 'OFFICE SUPPLIES', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '631000', alphaId: 'OSUP01', name: 'Office Supplies Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '630000', parentAlphaId: 'EXOS11' },
  // 640000 ENTERTAINMENT AND REPRESENTATION (Level 3 group)
  { numericId: '640000', alphaId: 'EXENT1', name: 'ENTERTAINMENT AND REPRESENTATION', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '641000', alphaId: 'CLNT01', name: 'Client Representation Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '640000', parentAlphaId: 'EXENT1' },
  { numericId: '642000', alphaId: 'ADMK01', name: 'Advertising and Marketing Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '640000', parentAlphaId: 'EXENT1' },
  // 650000 TAXES AND LICENSES (Level 3 group)
  { numericId: '650000', alphaId: 'EXTL11', name: 'TAXES AND LICENSES', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '651000', alphaId: 'TLAX01', name: 'Taxes and Licenses Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '650000', parentAlphaId: 'EXTL11' },
  { numericId: '652000', alphaId: 'LICN01', name: 'Professional Licenses and Memberships Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '650000', parentAlphaId: 'EXTL11' },
  // 660000 TRANSPORTATION (Level 3 group)
  { numericId: '660000', alphaId: 'EXTRN1', name: 'TRANSPORTATION', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '661000', alphaId: 'TRAV01', name: 'Transportation and Travel Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '660000', parentAlphaId: 'EXTRN1' },
  { numericId: '662000', alphaId: 'DELW01', name: 'Delivery and Freight-Out Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '660000', parentAlphaId: 'EXTRN1' },
  // Additional common operating expense groups (beyond the six mandated lines)
  { numericId: '670000', alphaId: 'EXREN1', name: 'RENT EXPENSE', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '671000', alphaId: 'RENT01', name: 'Rent Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '670000', parentAlphaId: 'EXREN1' },
  { numericId: '680000', alphaId: 'EXUTL1', name: 'UTILITIES (LIGHT, WATER, COMMUNICATION)', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '681000', alphaId: 'ELEC01', name: 'Electricity Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '680000', parentAlphaId: 'EXUTL1' },
  { numericId: '682000', alphaId: 'WATE01', name: 'Water Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '680000', parentAlphaId: 'EXUTL1' },
  { numericId: '683000', alphaId: 'COMM01', name: 'Communication and Internet Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '680000', parentAlphaId: 'EXUTL1' },
  { numericId: '690000', alphaId: 'EXDEP1', name: 'DEPRECIATION AND AMORTIZATION', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '691000', alphaId: 'DEPR01', name: 'Depreciation Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '690000', parentAlphaId: 'EXDEP1' },
  { numericId: '700000', alphaId: 'EXPRO1', name: 'PROFESSIONAL FEES', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '701000', alphaId: 'PROF01', name: 'Professional Fees Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '700000', parentAlphaId: 'EXPRO1' },
  { numericId: '710000', alphaId: 'EXINS1', name: 'INSURANCE', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '711000', alphaId: 'INSU01', name: 'Insurance Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '710000', parentAlphaId: 'EXINS1' },
  { numericId: '720000', alphaId: 'EXBNK1', name: 'BANK CHARGES AND OTHER FEES', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '721000', alphaId: 'BNKF01', name: 'Bank Charges and Payment Gateway Fees Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '720000', parentAlphaId: 'EXBNK1' },
  { numericId: '730000', alphaId: 'EXOTH1', name: 'OTHER OPERATING EXPENSES', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  { numericId: '731000', alphaId: 'MISC01', name: 'Miscellaneous Operating Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '730000', parentAlphaId: 'EXOTH1' },
  { numericId: '732000', alphaId: 'SOFT01', name: 'Software and Cloud Subscriptions Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '730000', parentAlphaId: 'EXOTH1' },
  { numericId: '733000', alphaId: 'TRN001', name: 'Training and Certification Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '730000', parentAlphaId: 'EXOTH1' },

  // ===== 800000 OTHER INCOME (EXPENSES) — single Level 1 section header =====
  // Per the latest COA format, Other Income and Other Expense share ONE
  // section header; they are distinguished within it by normal side (credit
  // vs debit) and the Other Income / Other Expense sub-type, never as two
  // separate top-level sections.
  { numericId: '800000', alphaId: 'OTHIE1', name: 'OTHER INCOME (EXPENSES)', type: 'Other Income', normalSide: 'credit' },
  { numericId: '810000', alphaId: 'OIINT1', name: 'INTEREST INCOME', type: 'Other Income', normalSide: 'credit', parentNumericId: '800000', parentAlphaId: 'OTHIE1' },
  { numericId: '811000', alphaId: 'INTIN1', name: 'Interest Income', type: 'Other Income', normalSide: 'credit', parentNumericId: '810000', parentAlphaId: 'OIINT1' },
  { numericId: '820000', alphaId: 'OEINT1', name: 'INTEREST EXPENSE', type: 'Other Expense', normalSide: 'debit', parentNumericId: '800000', parentAlphaId: 'OTHIE1' },
  { numericId: '821000', alphaId: 'FINX01', name: 'Interest and Finance Expense', type: 'Other Expense', normalSide: 'debit', parentNumericId: '820000', parentAlphaId: 'OEINT1' },
];
// ---------------------------------------------------------------------------
// INDUSTRY-SPECIFIC SEEDS — appended under the matching COA group via parentId.
// Parent references use the numeric group codes defined above so both numeric
// and alphanumeric formats resolve correctly.
// ---------------------------------------------------------------------------
const INDUSTRY_ACCOUNT_SEEDS: Record<ClientIndustry, AccountSeed[]> = {
  retail: [
    // Inventories (under 113000 INVENTORIES)
    { numericId: '113100', alphaId: 'MINV01', name: 'Merchandise Inventory', type: 'Asset', normalSide: 'debit', parentNumericId: '113000', parentAlphaId: 'ASINVT' },
    { numericId: '114400', alphaId: 'FREI01', name: 'Freight-In / Transportation In', type: 'Asset', normalSide: 'debit', parentNumericId: '114000', parentAlphaId: 'ASOTHC' },
    // Sales (under 410000 SALES)
    { numericId: '413000', alphaId: 'RETL01', name: 'Retail Sales Revenue', type: 'Revenue', normalSide: 'credit', parentNumericId: '410000', parentAlphaId: 'RESAL1' },
    { numericId: '414000', alphaId: 'ONLS01', name: 'Online Sales Revenue', type: 'Revenue', normalSide: 'credit', parentNumericId: '410000', parentAlphaId: 'RESAL1' },
    // Cost of Sales (under 510000 PURCHASES)
    { numericId: '512000', alphaId: 'COGS01', name: 'Cost of Goods Sold - Merchandise', type: 'Costs', normalSide: 'debit', parentNumericId: '510000', parentAlphaId: 'COPUR1' },
    // Operating expenses (retail-specific groups)
    { numericId: '614000', alphaId: 'STAF01', name: 'Store Staff and Selling Salaries Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '610000', parentAlphaId: 'EXSAL1' },
    { numericId: '672000', alphaId: 'SHOP01', name: 'Store Rent and Common Area Charges Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '670000', parentAlphaId: 'EXREN1' },
    { numericId: '632000', alphaId: 'PACK01', name: 'Packaging and Shopping Supplies Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '630000', parentAlphaId: 'EXOS11' },
    { numericId: '722000', alphaId: 'ECOM01', name: 'E-commerce Platform Fees Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '720000', parentAlphaId: 'EXBNK1' },
  ],
  'general-services': [
    // Service Income (under 420000 SERVICE INCOME)
    { numericId: '421000', alphaId: 'SRVC01', name: 'Professional and Service Revenue', type: 'Revenue', normalSide: 'credit', parentNumericId: '420000', parentAlphaId: 'RESVC1' },
    { numericId: '422000', alphaId: 'CONS01', name: 'Consulting Revenue', type: 'Revenue', normalSide: 'credit', parentNumericId: '420000', parentAlphaId: 'RESVC1' },
    { numericId: '423000', alphaId: 'PROJ01', name: 'Project-Based Service Revenue', type: 'Revenue', normalSide: 'credit', parentNumericId: '420000', parentAlphaId: 'RESVC1' },
    // Direct service costs (under 510000 PURCHASES / DIRECT COSTS)
    { numericId: '513000', alphaId: 'DCST01', name: 'Direct Service Costs', type: 'Costs', normalSide: 'debit', parentNumericId: '510000', parentAlphaId: 'COPUR1' },
    { numericId: '514000', alphaId: 'SUBC01', name: 'Subcontractor and Outsourced Service Costs', type: 'Costs', normalSide: 'debit', parentNumericId: '510000', parentAlphaId: 'COPUR1' },
    { numericId: '521000', alphaId: 'TRNX01', name: 'Direct Transportation and Field Service Costs', type: 'Costs', normalSide: 'debit', parentNumericId: '520000', parentAlphaId: 'CODLB1' },
    // Operating expenses
    { numericId: '615000', alphaId: 'PROJ02', name: 'Project Staff Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '610000', parentAlphaId: 'EXSAL1' },
  ],
  manufacturing: [
    // Inventories (under 113000 INVENTORIES)
    { numericId: '113100', alphaId: 'RMIN01', name: 'Raw Materials Inventory', type: 'Asset', normalSide: 'debit', parentNumericId: '113000', parentAlphaId: 'ASINVT' },
    { numericId: '113200', alphaId: 'WIP001', name: 'Work in Process Inventory', type: 'Asset', normalSide: 'debit', parentNumericId: '113000', parentAlphaId: 'ASINVT' },
    { numericId: '113300', alphaId: 'FGIN01', name: 'Finished Goods Inventory', type: 'Asset', normalSide: 'debit', parentNumericId: '113000', parentAlphaId: 'ASINVT' },
    { numericId: '113400', alphaId: 'SUPL01', name: 'Factory Supplies and Consumables Inventory', type: 'Asset', normalSide: 'debit', parentNumericId: '113000', parentAlphaId: 'ASINVT' },
    // Sales (under 410000 SALES)
    { numericId: '413000', alphaId: 'MFGS01', name: 'Manufacturing Sales Revenue', type: 'Revenue', normalSide: 'credit', parentNumericId: '410000', parentAlphaId: 'RESAL1' },
    { numericId: '415000', alphaId: 'SCRP01', name: 'Scrap and By-product Sales', type: 'Revenue', normalSide: 'credit', parentNumericId: '410000', parentAlphaId: 'RESAL1' },
    // Cost of Goods Manufactured and Sold
    { numericId: '515000', alphaId: 'DMAT01', name: 'Direct Materials Used', type: 'Costs', normalSide: 'debit', parentNumericId: '510000', parentAlphaId: 'COPUR1' },
    { numericId: '522000', alphaId: 'DLAB01', name: 'Direct Labor - Production', type: 'Costs', normalSide: 'debit', parentNumericId: '520000', parentAlphaId: 'CODLB1' },
    { numericId: '535000', alphaId: 'QCST01', name: 'Quality Control and Testing Costs', type: 'Costs', normalSide: 'debit', parentNumericId: '530000', parentAlphaId: 'COOVH1' },
    // Operating expenses
    { numericId: '734000', alphaId: 'WIPADJ', name: 'Production Variance and Manufacturing Adjustments', type: 'Expense', normalSide: 'debit', parentNumericId: '730000', parentAlphaId: 'EXOTH1' },
    { numericId: '735000', alphaId: 'WHSE01', name: 'Warehouse and Production Handling Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '730000', parentAlphaId: 'EXOTH1' },
  ],
  construction: [
    // Other current assets (contract assets, retentions, advances)
    { numericId: '113100', alphaId: 'CMAT01', name: 'Construction Materials Inventory', type: 'Asset', normalSide: 'debit', parentNumericId: '113000', parentAlphaId: 'ASINVT' },
    { numericId: '114500', alphaId: 'CASS01', name: 'Contract Assets / Unbilled Receivables', type: 'Asset', normalSide: 'debit', parentNumericId: '114000', parentAlphaId: 'ASOTHC' },
    { numericId: '114600', alphaId: 'RECV01', name: 'Retention Receivable', type: 'Asset', normalSide: 'debit', parentNumericId: '114000', parentAlphaId: 'ASOTHC' },
    { numericId: '114700', alphaId: 'ADVJ01', name: 'Advances to Suppliers and Subcontractors', type: 'Asset', normalSide: 'debit', parentNumericId: '114000', parentAlphaId: 'ASOTHC' },
    // Other current liabilities (contract liabilities, retention payable)
    { numericId: '212300', alphaId: 'CINT01', name: 'Contract Liabilities / Customer Advances', type: 'Liabilities', normalSide: 'credit', parentNumericId: '212000', parentAlphaId: 'LIOTHC' },
    { numericId: '212400', alphaId: 'RETNP1', name: 'Retention Payable', type: 'Liabilities', normalSide: 'credit', parentNumericId: '212000', parentAlphaId: 'LIOTHC' },
    // Revenue — construction contract revenue sits under SERVICE INCOME
    { numericId: '424000', alphaId: 'CNRV01', name: 'Construction Contract Revenue', type: 'Revenue', normalSide: 'credit', parentNumericId: '420000', parentAlphaId: 'RESVC1' },
    { numericId: '425000', alphaId: 'VARO01', name: 'Variation Order Revenue', type: 'Revenue', normalSide: 'credit', parentNumericId: '420000', parentAlphaId: 'RESVC1' },
    { numericId: '426000', alphaId: 'CLAM01', name: 'Claims and Recoveries Revenue', type: 'Revenue', normalSide: 'credit', parentNumericId: '420000', parentAlphaId: 'RESVC1' },
    // Construction costs
    { numericId: '516000', alphaId: 'CMUS01', name: 'Construction Materials Used', type: 'Costs', normalSide: 'debit', parentNumericId: '510000', parentAlphaId: 'COPUR1' },
    { numericId: '523000', alphaId: 'CLOB01', name: 'Direct Construction Labor', type: 'Costs', normalSide: 'debit', parentNumericId: '520000', parentAlphaId: 'CODLB1' },
    { numericId: '517000', alphaId: 'SUBK01', name: 'Subcontractors - Project Costs', type: 'Costs', normalSide: 'debit', parentNumericId: '510000', parentAlphaId: 'COPUR1' },
    { numericId: '536000', alphaId: 'EQUX01', name: 'Equipment Rental and Project Equipment Costs', type: 'Costs', normalSide: 'debit', parentNumericId: '530000', parentAlphaId: 'COOVH1' },
    { numericId: '537000', alphaId: 'SITE01', name: 'Site Overhead and Project Mobilization Costs', type: 'Costs', normalSide: 'debit', parentNumericId: '530000', parentAlphaId: 'COOVH1' },
    { numericId: '538000', alphaId: 'PRJT01', name: 'Project Permits, Testing and Inspection Costs', type: 'Costs', normalSide: 'debit', parentNumericId: '530000', parentAlphaId: 'COOVH1' },
    // Operating expenses
    { numericId: '736000', alphaId: 'HEDO01', name: 'Head Office Construction Support Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '730000', parentAlphaId: 'EXOTH1' },
    { numericId: '712000', alphaId: 'BOND01', name: 'Bond and Project Insurance Expense', type: 'Expense', normalSide: 'debit', parentNumericId: '710000', parentAlphaId: 'EXINS1' },
  ],
};
const ACCOUNT_TYPE_ORDER: Record<string, number> = {
  Asset: 1,
  Liabilities: 2,
  Capital: 3,
  Equity: 3,
  Revenue: 4,
  Costs: 5,
  Expense: 6,
  'Other Income': 7,
  'Other Expense': 8,
};
const DEFAULT_CODE_ORDER = new Map<string, number>(
  [...COMMON_ACCOUNT_SEEDS, ...Object.values(INDUSTRY_ACCOUNT_SEEDS).flat()]
    .map((seed) => [seed.alphaId, Number(seed.numericId)] as const)
);
/**
 * Keeps starter accounts in accounting-code order instead of declaration order.
 * This is especially important because PostgreSQL does not guarantee row order
 * after an INSERT/UPSERT; without an explicit sort a freshly-created client's
 * default COA can appear scrambled after the save/refresh cycle.
 */
export function sortAccountsChronologically(accounts: CoaAccount[]): CoaAccount[] {
  return [...accounts].sort((a, b) => {
    const aId = String(a.id || '').trim();
    const bId = String(b.id || '').trim();
    const aDefaultOrder = DEFAULT_CODE_ORDER.get(aId);
    const bDefaultOrder = DEFAULT_CODE_ORDER.get(bId);
    if (aDefaultOrder != null || bDefaultOrder != null) {
      if (aDefaultOrder == null) return 1;
      if (bDefaultOrder == null) return -1;
      if (aDefaultOrder !== bDefaultOrder) return aDefaultOrder - bDefaultOrder;
    }
    const aNumeric = /^\d{6}$/.test(aId) ? Number(aId) : Number.POSITIVE_INFINITY;
    const bNumeric = /^\d{6}$/.test(bId) ? Number(bId) : Number.POSITIVE_INFINITY;
    if (aNumeric !== bNumeric) return aNumeric - bNumeric;
    const aType = ACCOUNT_TYPE_ORDER[a.type] ?? 99;
    const bType = ACCOUNT_TYPE_ORDER[b.type] ?? 99;
    if (aType !== bType) return aType - bType;
    const aSuffix = aId.match(/(\d+)$/)?.[1];
    const bSuffix = bId.match(/(\d+)$/)?.[1];
    if (aSuffix && bSuffix) {
      const suffixDiff = Number(aSuffix) - Number(bSuffix);
      if (suffixDiff !== 0) return suffixDiff;
    }
    return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
  });
}
function toAccounts(seeds: AccountSeed[], format: 'numeric' | 'alphanumeric'): CoaAccount[] {
  // Build a code map so parentId references resolve in the selected format.
  const idMap = new Map<string, string>();
  seeds.forEach(s => {
    if (format === 'alphanumeric') idMap.set(s.numericId, s.alphaId);
    else idMap.set(s.alphaId, s.numericId);
  });
  const accounts = seeds.map(({ numericId, alphaId, name, type, normalSide, parentNumericId, parentAlphaId }) => {
    const id = format === 'alphanumeric' ? alphaId : numericId;
    const parentRef = format === 'alphanumeric' ? parentAlphaId : parentNumericId;
    const parentId = parentRef ? (idMap.get(parentRef) || parentRef) : undefined;
    return { id, name, type, normalSide, ...(parentId ? { parentId } : {}) };
  });
  return sortAccountsChronologically(accounts);
}
export function getDefaultAccountsForIndustry(
  industry: ClientIndustry | undefined,
  format: 'numeric' | 'alphanumeric'
): CoaAccount[] {
  const selectedIndustry = industry && INDUSTRY_ACCOUNT_SEEDS[industry] ? industry : DEFAULT_INDUSTRY;
  return toAccounts([...COMMON_ACCOUNT_SEEDS, ...INDUSTRY_ACCOUNT_SEEDS[selectedIndustry]], format);
}
// Backward-compatible exports. These intentionally point to the General
// Services preset, while new/existing clients with an industry use the
// industry-aware function above.
export const DEFAULT_ACCOUNTS: CoaAccount[] = getDefaultAccountsForIndustry(DEFAULT_INDUSTRY, 'numeric');
export const DEFAULT_ACCOUNTS_ALPHA: CoaAccount[] = getDefaultAccountsForIndustry(DEFAULT_INDUSTRY, 'alphanumeric');
/** Income, Costs and Expense accounts are nominal (profit & loss) accounts: they reset each year. Other Income / Other Expense are also nominal. */
export function isNominalAccountType(type?: string): boolean {
  const t = String(type || '').toLowerCase().trim();
  return ['revenue','revenues','income','sales','cost','costs','cost of sales','expense','expenses','other income','other expense','other expenses'].includes(t);
}
/** Opening balance that may flow into the GL. Nominal accounts never have one (their figure is Previous Year Balance). */
export function glOpeningBalance(account?: { type?: string; openingBalance?: number } | null): number {
  if (!account || isNominalAccountType(account.type)) return 0;
  return Number(account.openingBalance) || 0;
}
export function getNormalSide(type: string): 'debit' | 'credit' {
  const t = type.toLowerCase();
  if (t === 'asset' || t === 'assets' || t === 'expense' || t === 'expenses' || t === 'costs' || t === 'cost' || t === 'other expense') {
    return 'debit';
  }
  return 'credit';
}
// ---- Cash Receipts Journal (CashReceiptsJournal.tsx) ----
export const DEFAULT_CRJ_COLUMNS: JournalColumn[] = [
  { id: 'date', name: 'Date', type: 'text', category: 'None', isSystem: true },
  { id: 'reference', name: 'OR / Invoice No.', type: 'text', category: 'None', isSystem: true },
  { id: 'payor', name: "Customer / Payor", type: 'text', category: 'None', isSystem: true },
  { id: 'description', name: 'Account Credited / Description', type: 'text', category: 'None', isSystem: true },
  { id: 'post_ref', name: 'PR', type: 'text', category: 'None', isSystem: true },
  { id: 'cash', name: 'Cash on Hand / Bank', type: 'number', category: 'Dr', isSystem: true },
  { id: 'sales_disc', name: 'Sales Discount', type: 'number', category: 'Dr', isSystem: true },
  { id: 'ar', name: 'Accounts Receivable', type: 'number', category: 'Cr', isSystem: true },
  { id: 'sales', name: 'Sales', type: 'number', category: 'Cr', isSystem: true },
  { id: 'sundry', name: 'Other Accounts / Sundry', type: 'number', category: 'Cr', isSystem: true },
];
// ---- Cash Disbursements Journal (CashDisbursementsJournal.tsx) ----
export const CDJ_CASH_ON_HAND_BANK_ID = 'cash_on_hand_bank';
export const CDJ_SUNDRY_ACCOUNT_TITLE_ID = 'sundry_account_title';
export const CDJ_SUNDRY_AMOUNT_ID = 'sundry_amount';
export const DEFAULT_CDJ_COLUMNS: JournalColumn[] = [
  { id: 'date', name: 'Date', type: 'text', category: 'None', isSystem: true },
  { id: 'payee', name: 'Payees', type: 'text', category: 'None', isSystem: true },
  { id: 'folio_f', name: 'Folio/F', type: 'text', category: 'None', isSystem: true },
  { id: CDJ_CASH_ON_HAND_BANK_ID, name: 'Cash on Hand/Bank', type: 'number', category: 'Cr', isSystem: true },
  { id: CDJ_SUNDRY_ACCOUNT_TITLE_ID, name: 'Account Title', type: 'text', category: 'None', isSystem: true },
  { id: CDJ_SUNDRY_AMOUNT_ID, name: 'Amount Dr/Cr', type: 'number', category: 'None', isSystem: true },
];
// ---- Purchases Journal (PurchasesJournal.tsx) ----
export const DEFAULT_PJ_COLUMNS: JournalColumn[] = [
  { id: 'date', name: 'Date', type: 'text', category: 'None', isSystem: true },
  { id: 'supplier_name', name: "Supplier's Name", type: 'text', category: 'None', isSystem: true },
  { id: 'supplier_tin', name: 'TIN', type: 'text', category: 'None', isSystem: true },
  { id: 'invoice_no', name: 'Invoice', type: 'text', category: 'None', isSystem: true },
  { id: 'description', name: 'Nature of Purchase', type: 'text', category: 'None', isSystem: true },
  { id: 'net_purchase', name: 'Net of VAT', type: 'number', category: 'Dr', isSystem: true },
  { id: 'exempt_zero_rated', name: 'Exempt / 0-Rated', type: 'number', category: 'Dr', isSystem: true },
  { id: 'input_tax', name: 'Input Tax', type: 'number', category: 'Dr', isSystem: true },
  { id: 'debit_account', name: 'Account Title', type: 'text', category: 'None', isSystem: true },
  { id: 'accounts_payable', name: 'Accounts Payable', type: 'number', category: 'Cr', isSystem: true },
  { id: 'withholding_tax', name: 'Withholding Tax', type: 'number', category: 'Cr', isSystem: true },
];
// ---- Sales Journal (SalesJournal.tsx) ----
export const DEFAULT_SJ_COLUMNS: JournalColumn[] = [
  { id: 'date', name: 'Date', type: 'text', category: 'None', isSystem: true },
  { id: 'invoice_no', name: 'Invoice #', type: 'text', category: 'None', isSystem: true },
  { id: 'customer_tin', name: 'Customer TIN', type: 'text', category: 'None', isSystem: true },
  { id: 'customer_name', name: 'Customer Name', type: 'text', category: 'None', isSystem: true },
  { id: 'customer_address', name: 'Customer Address', type: 'text', category: 'None', isSystem: true },
  { id: 'net_of_vat', name: 'Net of VAT', type: 'number', category: 'Cr', isSystem: true },
  { id: 'output_vat', name: 'Output VAT', type: 'number', category: 'Cr', isSystem: true },
  { id: 'exempt_zero_rated', name: 'Exempt / 0-Rated', type: 'number', category: 'Cr', isSystem: true },
  { id: 'account_title', name: 'Account Title', type: 'text', category: 'None', isSystem: true },
  { id: 'accounts_receivable', name: 'Accounts Receivable', type: 'number', category: 'Dr', isSystem: true },
  { id: 'credit_card', name: 'Credit Card', type: 'number', category: 'Dr', isSystem: true },
];
