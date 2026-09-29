// Shared journal / Chart-of-Accounts defaults.
// Industry presets are Philippines-oriented SME starter charts, not a mandatory
// statutory chart of accounts. Each client can select an industry, and the
// selected preset is used only when that client's own COA is empty or when the
// user explicitly chooses Reset / Choose Format.
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
};

const COMMON_ACCOUNT_SEEDS: AccountSeed[] = [
  { numericId: '100000', alphaId: 'CASH01', name: 'Cash on Hand', type: 'Asset', normalSide: 'debit' },
  { numericId: '100100', alphaId: 'BANK01', name: 'Cash in Bank', type: 'Asset', normalSide: 'debit' },
  { numericId: '100200', alphaId: 'PETC01', name: 'Petty Cash Fund', type: 'Asset', normalSide: 'debit' },
  { numericId: '101000', alphaId: 'ARTR01', name: 'Accounts Receivable', type: 'Asset', normalSide: 'debit' },
  { numericId: '101100', alphaId: 'NRCP01', name: 'Nontrade Receivables', type: 'Asset', normalSide: 'debit' },
  { numericId: '101200', alphaId: 'ADDA01', name: 'Allowance for Doubtful Accounts', type: 'Asset', normalSide: 'credit' },
  { numericId: '102000', alphaId: 'IVAT01', name: 'Input VAT', type: 'Asset', normalSide: 'debit' },
  { numericId: '102100', alphaId: 'CWT001', name: 'Creditable Withholding Tax', type: 'Asset', normalSide: 'debit' },
  { numericId: '102200', alphaId: 'PREP01', name: 'Prepaid Expenses', type: 'Asset', normalSide: 'debit' },
  { numericId: '102300', alphaId: 'SECD01', name: 'Security Deposits', type: 'Asset', normalSide: 'debit' },
  { numericId: '110000', alphaId: 'LAND01', name: 'Land', type: 'Asset', normalSide: 'debit' },
  { numericId: '110100', alphaId: 'BLDG01', name: 'Buildings', type: 'Asset', normalSide: 'debit' },
  { numericId: '110200', alphaId: 'MACH01', name: 'Machinery and Equipment', type: 'Asset', normalSide: 'debit' },
  { numericId: '110300', alphaId: 'OEQP01', name: 'Office Equipment', type: 'Asset', normalSide: 'debit' },
  { numericId: '110400', alphaId: 'FFIX01', name: 'Furniture and Fixtures', type: 'Asset', normalSide: 'debit' },
  { numericId: '110500', alphaId: 'TRAN01', name: 'Transportation Equipment', type: 'Asset', normalSide: 'debit' },
  { numericId: '110600', alphaId: 'ADP001', name: 'Accumulated Depreciation - PPE', type: 'Asset', normalSide: 'credit' },
  { numericId: '111000', alphaId: 'SWIN01', name: 'Computer Software and Intangibles', type: 'Asset', normalSide: 'debit' },

  { numericId: '200000', alphaId: 'APTR01', name: 'Accounts Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '200100', alphaId: 'ACRU01', name: 'Accrued Expenses and Other Payables', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '200200', alphaId: 'SALP01', name: 'Salaries and Wages Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '200300', alphaId: 'STAT01', name: 'SSS, PhilHealth and Pag-IBIG Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '200400', alphaId: 'OVAT01', name: 'Output VAT Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '200500', alphaId: 'EWTP01', name: 'Expanded Withholding Tax Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '200600', alphaId: 'CWTP01', name: 'Compensation Withholding Tax Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '200700', alphaId: 'PPTX01', name: 'Percentage Tax Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '201000', alphaId: 'STLN01', name: 'Short-term Loans Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '202000', alphaId: 'LTLN01', name: 'Long-term Loans Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '203000', alphaId: 'LLCU01', name: 'Lease Liabilities - Current', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '203100', alphaId: 'LLNC01', name: 'Lease Liabilities - Non-current', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '204000', alphaId: 'ITXP01', name: 'Income Tax Payable', type: 'Liabilities', normalSide: 'credit' },

  { numericId: '300000', alphaId: 'OWNC01', name: "Owner's Capital", type: 'Capital', normalSide: 'credit' },
  { numericId: '300100', alphaId: 'DRAW01', name: "Owner's Drawings", type: 'Capital', normalSide: 'debit' },
  { numericId: '301000', alphaId: 'SHCP01', name: 'Share Capital', type: 'Equity', normalSide: 'credit' },
  { numericId: '301100', alphaId: 'APIC01', name: 'Additional Paid-in Capital', type: 'Equity', normalSide: 'credit' },
  { numericId: '302000', alphaId: 'RETE01', name: 'Retained Earnings', type: 'Equity', normalSide: 'credit' },
  { numericId: '302100', alphaId: 'CYEP01', name: 'Current Year Earnings', type: 'Equity', normalSide: 'credit' },

  { numericId: '600000', alphaId: 'SALA01', name: 'Salaries and Wages Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600100', alphaId: 'EBEX01', name: 'Employee Benefits Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600200', alphaId: 'GOVC01', name: 'Employer SSS, PhilHealth and Pag-IBIG Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600300', alphaId: 'RENT01', name: 'Rent Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600400', alphaId: 'ELEC01', name: 'Electricity Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600500', alphaId: 'WATE01', name: 'Water Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600600', alphaId: 'COMM01', name: 'Communication and Internet Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600700', alphaId: 'RMNT01', name: 'Repairs and Maintenance Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600800', alphaId: 'DEPR01', name: 'Depreciation Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600900', alphaId: 'TLAX01', name: 'Taxes and Licenses Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601000', alphaId: 'PROF01', name: 'Professional Fees Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601100', alphaId: 'TRAV01', name: 'Transportation and Travel Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601200', alphaId: 'OSUP01', name: 'Office Supplies Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601300', alphaId: 'ADMK01', name: 'Advertising and Marketing Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601400', alphaId: 'INSU01', name: 'Insurance Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601500', alphaId: 'BNKF01', name: 'Bank Charges and Payment Gateway Fees Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601600', alphaId: 'FINX01', name: 'Interest and Finance Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601700', alphaId: 'MISC01', name: 'Miscellaneous Operating Expense', type: 'Expense', normalSide: 'debit' },
];

const INDUSTRY_ACCOUNT_SEEDS: Record<ClientIndustry, AccountSeed[]> = {
  retail: [
    { numericId: '103000', alphaId: 'MINV01', name: 'Merchandise Inventory', type: 'Asset', normalSide: 'debit' },
    { numericId: '103100', alphaId: 'FREI01', name: 'Freight-In / Transportation In', type: 'Asset', normalSide: 'debit' },
    { numericId: '103200', alphaId: 'ADVX01', name: 'Advances to Suppliers', type: 'Asset', normalSide: 'debit' },
    { numericId: '401000', alphaId: 'RETL01', name: 'Retail Sales Revenue', type: 'Revenue', normalSide: 'credit' },
    { numericId: '401100', alphaId: 'ONLS01', name: 'Online Sales Revenue', type: 'Revenue', normalSide: 'credit' },
    { numericId: '402000', alphaId: 'SRET01', name: 'Sales Returns and Allowances', type: 'Revenue', normalSide: 'debit' },
    { numericId: '402100', alphaId: 'SDIS01', name: 'Sales Discounts', type: 'Revenue', normalSide: 'debit' },
    { numericId: '501000', alphaId: 'COGS01', name: 'Cost of Goods Sold - Merchandise', type: 'Costs', normalSide: 'debit' },
    { numericId: '501100', alphaId: 'FREI02', name: 'Freight-In / Purchases Related Costs', type: 'Costs', normalSide: 'debit' },
    { numericId: '602000', alphaId: 'STAF01', name: 'Store Staff and Selling Salaries Expense', type: 'Expense', normalSide: 'debit' },
    { numericId: '602100', alphaId: 'SHOP01', name: 'Store Rent and Common Area Charges Expense', type: 'Expense', normalSide: 'debit' },
    { numericId: '602200', alphaId: 'DELW01', name: 'Delivery and Freight-Out Expense', type: 'Expense', normalSide: 'debit' },
    { numericId: '602300', alphaId: 'PACK01', name: 'Packaging and Shopping Supplies Expense', type: 'Expense', normalSide: 'debit' },
    { numericId: '602400', alphaId: 'ECOM01', name: 'E-commerce Platform Fees Expense', type: 'Expense', normalSide: 'debit' },
  ],
  'general-services': [
    { numericId: '401000', alphaId: 'SRVC01', name: 'Professional and Service Revenue', type: 'Revenue', normalSide: 'credit' },
    { numericId: '401100', alphaId: 'CONS01', name: 'Consulting Revenue', type: 'Revenue', normalSide: 'credit' },
    { numericId: '401200', alphaId: 'PROJ01', name: 'Project-Based Service Revenue', type: 'Revenue', normalSide: 'credit' },
    { numericId: '501000', alphaId: 'DCST01', name: 'Direct Service Costs', type: 'Costs', normalSide: 'debit' },
    { numericId: '501100', alphaId: 'SUBC01', name: 'Subcontractor and Outsourced Service Costs', type: 'Costs', normalSide: 'debit' },
    { numericId: '501200', alphaId: 'TRNX01', name: 'Direct Transportation and Field Service Costs', type: 'Costs', normalSide: 'debit' },
    { numericId: '602000', alphaId: 'PROJ02', name: 'Project Staff Expense', type: 'Expense', normalSide: 'debit' },
    { numericId: '602100', alphaId: 'TRN001', name: 'Training and Certification Expense', type: 'Expense', normalSide: 'debit' },
    { numericId: '602200', alphaId: 'CLNT01', name: 'Client Representation Expense', type: 'Expense', normalSide: 'debit' },
    { numericId: '602300', alphaId: 'SOFT01', name: 'Software and Cloud Subscriptions Expense', type: 'Expense', normalSide: 'debit' },
    { numericId: '602400', alphaId: 'LICN01', name: 'Professional Licenses and Memberships Expense', type: 'Expense', normalSide: 'debit' },
  ],
  manufacturing: [
    { numericId: '103000', alphaId: 'RMIN01', name: 'Raw Materials Inventory', type: 'Asset', normalSide: 'debit' },
    { numericId: '103100', alphaId: 'WIP001', name: 'Work in Process Inventory', type: 'Asset', normalSide: 'debit' },
    { numericId: '103200', alphaId: 'FGIN01', name: 'Finished Goods Inventory', type: 'Asset', normalSide: 'debit' },
    { numericId: '103300', alphaId: 'SUPL01', name: 'Factory Supplies and Consumables Inventory', type: 'Asset', normalSide: 'debit' },
    { numericId: '401000', alphaId: 'MFGS01', name: 'Manufacturing Sales Revenue', type: 'Revenue', normalSide: 'credit' },
    { numericId: '401100', alphaId: 'SCRP01', name: 'Scrap and By-product Sales', type: 'Revenue', normalSide: 'credit' },
    { numericId: '402000', alphaId: 'MRET01', name: 'Sales Returns and Allowances', type: 'Revenue', normalSide: 'debit' },
    { numericId: '501000', alphaId: 'DMAT01', name: 'Direct Materials Used', type: 'Costs', normalSide: 'debit' },
    { numericId: '501100', alphaId: 'DLAB01', name: 'Direct Labor - Production', type: 'Costs', normalSide: 'debit' },
    { numericId: '501200', alphaId: 'FOHD01', name: 'Factory Overhead', type: 'Costs', normalSide: 'debit' },
    { numericId: '501300', alphaId: 'POWX01', name: 'Factory Power and Utilities', type: 'Costs', normalSide: 'debit' },
    { numericId: '501400', alphaId: 'MREP01', name: 'Factory Repairs and Maintenance', type: 'Costs', normalSide: 'debit' },
    { numericId: '501500', alphaId: 'QCST01', name: 'Quality Control and Testing Costs', type: 'Costs', normalSide: 'debit' },
    { numericId: '602000', alphaId: 'WIPADJ', name: 'Production Variance and Manufacturing Adjustments', type: 'Expense', normalSide: 'debit' },
    { numericId: '602100', alphaId: 'WHSE01', name: 'Warehouse and Production Handling Expense', type: 'Expense', normalSide: 'debit' },
  ],
  construction: [
    { numericId: '103000', alphaId: 'CMAT01', name: 'Construction Materials Inventory', type: 'Asset', normalSide: 'debit' },
    { numericId: '103100', alphaId: 'CASS01', name: 'Contract Assets / Unbilled Receivables', type: 'Asset', normalSide: 'debit' },
    { numericId: '103200', alphaId: 'RECV01', name: 'Retention Receivable', type: 'Asset', normalSide: 'debit' },
    { numericId: '103300', alphaId: 'ADVJ01', name: 'Advances to Suppliers and Subcontractors', type: 'Asset', normalSide: 'debit' },
    { numericId: '201200', alphaId: 'CINT01', name: 'Contract Liabilities / Customer Advances', type: 'Liabilities', normalSide: 'credit' },
    { numericId: '201300', alphaId: 'RETNP1', name: 'Retention Payable', type: 'Liabilities', normalSide: 'credit' },
    { numericId: '401000', alphaId: 'CNRV01', name: 'Construction Contract Revenue', type: 'Revenue', normalSide: 'credit' },
    { numericId: '401100', alphaId: 'VARO01', name: 'Variation Order Revenue', type: 'Revenue', normalSide: 'credit' },
    { numericId: '401200', alphaId: 'CLAM01', name: 'Claims and Recoveries Revenue', type: 'Revenue', normalSide: 'credit' },
    { numericId: '501000', alphaId: 'CMUS01', name: 'Construction Materials Used', type: 'Costs', normalSide: 'debit' },
    { numericId: '501100', alphaId: 'CLOB01', name: 'Direct Construction Labor', type: 'Costs', normalSide: 'debit' },
    { numericId: '501200', alphaId: 'SUBK01', name: 'Subcontractors - Project Costs', type: 'Costs', normalSide: 'debit' },
    { numericId: '501300', alphaId: 'EQUX01', name: 'Equipment Rental and Project Equipment Costs', type: 'Costs', normalSide: 'debit' },
    { numericId: '501400', alphaId: 'SITE01', name: 'Site Overhead and Project Mobilization Costs', type: 'Costs', normalSide: 'debit' },
    { numericId: '501500', alphaId: 'PRJT01', name: 'Project Permits, Testing and Inspection Costs', type: 'Costs', normalSide: 'debit' },
    { numericId: '602000', alphaId: 'HEDO01', name: 'Head Office Construction Support Expense', type: 'Expense', normalSide: 'debit' },
    { numericId: '602100', alphaId: 'BOND01', name: 'Bond and Project Insurance Expense', type: 'Expense', normalSide: 'debit' },
  ],
};

function toAccounts(seeds: AccountSeed[], format: 'numeric' | 'alphanumeric'): CoaAccount[] {
  return seeds.map(({ numericId, alphaId, name, type, normalSide }) => ({
    id: format === 'alphanumeric' ? alphaId : numericId,
    name,
    type,
    normalSide,
  }));
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

export function getNormalSide(type: string): 'debit' | 'credit' {
  const t = type.toLowerCase();
  if (t === 'asset' || t === 'assets' || t === 'expense' || t === 'expenses' || t === 'costs' || t === 'cost') {
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
