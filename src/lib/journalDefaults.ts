// Shared journal / Chart-of-Accounts defaults.
// Industry presets are Philippines-oriented SME starter charts, not a mandatory
// statutory chart of accounts. Each client can select an industry, and the
// selected preset is used only when that client's own COA is empty or when the
// user explicitly chooses Reset / Choose Format.
//
// COA hierarchy (default, per COA-CATEGORY.txt):
//   *NON-INDIVIDUAL* -> EQUITY ; *INDIVIDUAL* -> CAPITAL (swapped by mapper).
//   Level 1 — Statement section : ASSETS / LIABILTIES / EQUITY(or CAPITAL) /
//              REVENUE / <cost header per business type> / OPERATING EXPENSES /
//              OTHER INCOME/(EXPENSES)
//   Level 2 — Classification     : CURRENT / NONCURRENT assets & liabilities;
//              DIRECT MATERIALS / DIRECT LABOR / SUBCONTRACTED WORKS / OVERHEAD
//              under cost; SELLING / GENERAL & ADMINISTRATIVE under expenses
//   Level 3 — Last hierarchy     : CASH AND CASH EQUIVALENTS, TRADE AND OTHER
//              RECEIVABLES, FINANCIAL ASSETS, INVENTORIES, etc. — uploaded
//              POSTABLE accounts are always attached at this deepest level
//              (see fixedHierarchyParent in ChartOfAccounts.tsx).
//   Names below are taken verbatim from COA-CATEGORY.txt, including the
//   intentional spellings LIABILTIES, NONCURRENT LIABLITIES, PROPERTY, PLANT
//   AND EQUIPMENTS and CONSTRACTION.
//
// NO AMOUNT rule: only headers explicitly annotated "- NO AMOUNT" carry no
// balance — ASSETS, CURRENT/NONCURRENT ASSETS, LIABILTIES, CURRENT/NONCURRENT
// LIABLITIES, and EQUITY (non-individual). Every other category node shows a
// computed rollup total of its postable descendants.
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
  // true only for headers annotated "- NO AMOUNT" in the COA format. These
  // render an empty balance column. All other headers/groups show a computed
  // rollup total; postable (leaf) accounts show their stored balance.
  isHeader?: boolean;
};
// ---------------------------------------------------------------------------
// DEFAULT HIERARCHY SEEDS — categories only, verbatim from COA-CATEGORY.txt.
// isHeader=true ONLY on the "- NO AMOUNT" headers. No postable (leaf) accounts
// are seeded: those are supplied by the user via COA upload and attached to the
// last (deepest) hierarchy level by fixedHierarchyParent.
// ---------------------------------------------------------------------------
const COMMON_ACCOUNT_SEEDS: AccountSeed[] = [
  // ===== 100000 ASSETS (NO AMOUNT) =====
  { numericId: '100000', alphaId: 'ASSET1', name: 'ASSETS', type: 'Asset', normalSide: 'debit', isHeader: true },
  // --- 110000 CURRENT ASSETS (NO AMOUNT) ---
  { numericId: '110000', alphaId: 'ASCUR1', name: 'CURRENT ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '100000', parentAlphaId: 'ASSET1', isHeader: true },
  // Level 3 (last hierarchy) — postable accounts attach here on upload
  { numericId: '111000', alphaId: 'ASCASH', name: 'CASH AND CASH EQUIVALENTS', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  { numericId: '112000', alphaId: 'ASRECV', name: 'TRADE AND OTHER RECEIVABLES', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  { numericId: '113000', alphaId: 'ASFIN1', name: 'FINANCIAL ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  { numericId: '114000', alphaId: 'ASINVT', name: 'INVENTORIES', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  { numericId: '115000', alphaId: 'ASBIO1', name: 'BIOLOGICAL ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  { numericId: '116000', alphaId: 'ASOTHC', name: 'OTHER CURRENT ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '110000', parentAlphaId: 'ASCUR1' },
  // --- 120000 NONCURRENT ASSETS (NO AMOUNT) ---
  { numericId: '120000', alphaId: 'ASNCU1', name: 'NONCURRENT ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '100000', parentAlphaId: 'ASSET1', isHeader: true },
  { numericId: '121000', alphaId: 'ASFLT1', name: 'FINANCIAL ASSETS LONG-TERM', type: 'Asset', normalSide: 'debit', parentNumericId: '120000', parentAlphaId: 'ASNCU1' },
  { numericId: '122000', alphaId: 'ASINV1', name: 'INVESTMENT PROPERTY', type: 'Asset', normalSide: 'debit', parentNumericId: '120000', parentAlphaId: 'ASNCU1' },
  { numericId: '123000', alphaId: 'ASPPE1', name: 'PROPERTY, PLANT AND EQUIPMENTS', type: 'Asset', normalSide: 'debit', parentNumericId: '120000', parentAlphaId: 'ASNCU1' },
  { numericId: '124000', alphaId: 'ASBLT1', name: 'BIOLOGICAL ASSETS - LONG-TERM', type: 'Asset', normalSide: 'debit', parentNumericId: '120000', parentAlphaId: 'ASNCU1' },
  { numericId: '125000', alphaId: 'ASINT1', name: 'INTANGIBLE ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '120000', parentAlphaId: 'ASNCU1' },
  { numericId: '126000', alphaId: 'ASONC1', name: 'OTHER NONCURRENT ASSETS', type: 'Asset', normalSide: 'debit', parentNumericId: '120000', parentAlphaId: 'ASNCU1' },
  // ===== 200000 LIABILTIES (NO AMOUNT) — spelling per COA-CATEGORY.txt =====
  { numericId: '200000', alphaId: 'LIAB11', name: 'LIABILTIES', type: 'Liabilities', normalSide: 'credit', isHeader: true },
  // --- 210000 CURRENT LIABILITIES (NO AMOUNT) ---
  { numericId: '210000', alphaId: 'LICUR1', name: 'CURRENT LIABILITIES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '200000', parentAlphaId: 'LIAB11', isHeader: true },
  { numericId: '211000', alphaId: 'LIPAY1', name: 'TRADE AND OTHER PAYABLES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '210000', parentAlphaId: 'LICUR1' },
  { numericId: '212000', alphaId: 'LIACR1', name: 'ACCRUED EXPENSES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '210000', parentAlphaId: 'LICUR1' },
  { numericId: '213000', alphaId: 'LIOTHC', name: 'OTHER CURRENT LIABILITIES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '210000', parentAlphaId: 'LICUR1' },
  // --- 220000 NONCURRENT LIABLITIES (NO AMOUNT) — spelling per COA-CATEGORY.txt ---
  { numericId: '220000', alphaId: 'LINCU1', name: 'NONCURRENT LIABLITIES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '200000', parentAlphaId: 'LIAB11', isHeader: true },
  { numericId: '221000', alphaId: 'LILTB1', name: 'LONG-TERM BORROWINGS', type: 'Liabilities', normalSide: 'credit', parentNumericId: '220000', parentAlphaId: 'LINCU1' },
  { numericId: '222000', alphaId: 'LIONC1', name: 'OTHER NONCURRENT LIABILITIES', type: 'Liabilities', normalSide: 'credit', parentNumericId: '220000', parentAlphaId: 'LINCU1' },
  // ===== 300000 EQUITY / CAPITAL (NO AMOUNT for non-individual EQUITY only;
  //       individual CAPITAL shows a rollup — name & isHeader swapped in the
  //       defaultAccountsFor mapper in ChartOfAccounts.tsx) =====
  { numericId: '300000', alphaId: 'EQUIT1', name: 'EQUITY', type: 'Equity', normalSide: 'credit', isHeader: true },
  // ===== 400000 REVENUE (last hierarchy — postable accounts attach directly) =====
  { numericId: '400000', alphaId: 'REVNU1', name: 'REVENUE', type: 'Revenue', normalSide: 'credit' },
  // ===== 600000 OPERATING EXPENSES (shows rollup) =====
  { numericId: '600000', alphaId: 'EXPN11', name: 'OPERATING EXPENSES', type: 'Expense', normalSide: 'debit' },
  // 610000 SELLING EXPENSES (last hierarchy)
  { numericId: '610000', alphaId: 'EXSEL1', name: 'SELLING EXPENSES', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  // 620000 GENERAL & ADMINISTRATIVE EXPENSES (last hierarchy)
  { numericId: '620000', alphaId: 'EXGA11', name: 'GENERAL & ADMINISTRATIVE EXPENSES', type: 'Expense', normalSide: 'debit', parentNumericId: '600000', parentAlphaId: 'EXPN11' },
  // ===== 800000 OTHER INCOME/(EXPENSES) (last hierarchy) =====
  { numericId: '800000', alphaId: 'OIEX11', name: 'OTHER INCOME/(EXPENSES)', type: 'Other Income', normalSide: 'credit' },
];

// Cost-section header(s) are industry-specific (one per business type, matching
// COA-CATEGORY.txt). Manufacturing / Construction add Level-2 sub-groups which
// are themselves the last hierarchy for posting accounts.
const INDUSTRY_ACCOUNT_SEEDS: Record<ClientIndustry, AccountSeed[]> = {
  // Service — cost header is itself the last-hierarchy category (no sub-groups).
  'general-services': [
    { numericId: '500000', alphaId: 'COSVC1', name: 'COST OF REVENUE - SERVICE BUSINESS TYPE', type: 'Costs', normalSide: 'debit' },
  ],
  // Retail / Trading — cost header is itself the last-hierarchy category.
  retail: [
    { numericId: '500000', alphaId: 'CORET1', name: 'COST OF SALES - RETAIL BUSINESS TYPE', type: 'Costs', normalSide: 'debit' },
  ],
  // Manufacturing — cost header + three Level-2 groups (last hierarchy).
  manufacturing: [
    { numericId: '500000', alphaId: 'COMFG1', name: 'COST OF GOODS MANUFACTURED AND SOLD - MANUFACTURING BUSINESS TYPE', type: 'Costs', normalSide: 'debit' },
    { numericId: '510000', alphaId: 'MDMAT1', name: 'DIRECT MATERIALS', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COMFG1' },
    { numericId: '520000', alphaId: 'MDLAB1', name: 'DIRECT LABOR', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COMFG1' },
    { numericId: '530000', alphaId: 'MOVHD1', name: 'OVERHEAD', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COMFG1' },
  ],
  // Construction / Fabrication / Contracting — cost header + four Level-2 groups.
  construction: [
    { numericId: '500000', alphaId: 'COCON1', name: 'COST OF CONTRACTS - CONSTRACTION/FABRICATION/CONTRACTING BUSINESS TYPE', type: 'Costs', normalSide: 'debit' },
    { numericId: '510000', alphaId: 'CDMAT1', name: 'DIRECT MATERIALS', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COCON1' },
    { numericId: '520000', alphaId: 'CDLAB1', name: 'DIRECT LABOR', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COCON1' },
    { numericId: '530000', alphaId: 'CSUBC1', name: 'SUBCONTRACTED WORKS', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COCON1' },
    { numericId: '540000', alphaId: 'COVHD1', name: 'OVERHEAD', type: 'Costs', normalSide: 'debit', parentNumericId: '500000', parentAlphaId: 'COCON1' },
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
  const accounts = seeds.map(({ numericId, alphaId, name, type, normalSide, parentNumericId, parentAlphaId, isHeader }) => {
    const id = format === 'alphanumeric' ? alphaId : numericId;
    const parentRef = format === 'alphanumeric' ? parentAlphaId : parentNumericId;
    const parentId = parentRef ? (idMap.get(parentRef) || parentRef) : undefined;
    return {
      id, name, type, normalSide,
      ...(parentId ? { parentId } : {}),
      // isHeader=true only for headers annotated "- NO AMOUNT" in the COA
      // format; these render an empty balance column.
      ...(isHeader ? { isHeader: true } : {}),
    };
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
