// Shared journal / Chart-of-Accounts defaults.
// Extracted from the journal component files so that lib/ modules (glPosting,
// accountingBalances) no longer import from components/ — which previously
// dragged ~4,700 lines of component code (and xlsx) into the main bundle.
import type { JournalColumn, CoaAccount } from '../types';

// ---- Chart of Accounts (ChartOfAccounts.tsx) ----
//
// These defaults are a Philippines-oriented SME starter chart rather than a
// mandatory statutory chart of accounts. The titles use account labels that
// commonly appear in Philippine financial statements across merchandising,
// food service, professional/service, construction, real-estate, and
// technology/telecommunications businesses.
//
// Code rules for defaults:
//   • numeric mode: exactly 6 digits
//   • alphanumeric mode: exactly 6 letters/numbers, with no punctuation
//
// Keeping the seed in one place ensures the numeric and alphanumeric charts
// always contain the same account titles and account classifications.
const DEFAULT_ACCOUNT_SEEDS: Array<{
  numericId: string;
  alphaId: string;
  name: string;
  type: CoaAccount['type'];
  normalSide: 'debit' | 'credit';
}> = [
  // Assets — common PH SME accounts
  { numericId: '100000', alphaId: 'CASH01', name: 'Cash on Hand', type: 'Asset', normalSide: 'debit' },
  { numericId: '100100', alphaId: 'BANK01', name: 'Cash in Bank', type: 'Asset', normalSide: 'debit' },
  { numericId: '100200', alphaId: 'PETC01', name: 'Petty Cash Fund', type: 'Asset', normalSide: 'debit' },
  { numericId: '101000', alphaId: 'ARTR01', name: 'Accounts Receivable', type: 'Asset', normalSide: 'debit' },
  { numericId: '101100', alphaId: 'ARNT01', name: 'Nontrade Receivables', type: 'Asset', normalSide: 'debit' },
  { numericId: '101200', alphaId: 'ADDA01', name: 'Allowance for Doubtful Accounts', type: 'Asset', normalSide: 'credit' },
  { numericId: '102000', alphaId: 'CASS01', name: 'Contract Assets', type: 'Asset', normalSide: 'debit' },
  { numericId: '102100', alphaId: 'RECV01', name: 'Retention Receivable', type: 'Asset', normalSide: 'debit' },
  { numericId: '102200', alphaId: 'ADVS01', name: 'Advances to Suppliers and Contractors', type: 'Asset', normalSide: 'debit' },
  { numericId: '103000', alphaId: 'IVAT01', name: 'Input VAT', type: 'Asset', normalSide: 'debit' },
  { numericId: '103100', alphaId: 'CWT001', name: 'Creditable Withholding Tax', type: 'Asset', normalSide: 'debit' },
  { numericId: '103200', alphaId: 'TAXC01', name: 'Other Tax Credits', type: 'Asset', normalSide: 'debit' },
  { numericId: '104000', alphaId: 'PREP01', name: 'Prepaid Expenses', type: 'Asset', normalSide: 'debit' },
  { numericId: '104100', alphaId: 'SECD01', name: 'Security Deposits', type: 'Asset', normalSide: 'debit' },
  { numericId: '105000', alphaId: 'MINV01', name: 'Merchandise Inventory', type: 'Asset', normalSide: 'debit' },
  { numericId: '105100', alphaId: 'RMAT01', name: 'Raw Materials Inventory', type: 'Asset', normalSide: 'debit' },
  { numericId: '105200', alphaId: 'WIP001', name: 'Work in Process Inventory', type: 'Asset', normalSide: 'debit' },
  { numericId: '105300', alphaId: 'FGIN01', name: 'Finished Goods Inventory', type: 'Asset', normalSide: 'debit' },
  { numericId: '105400', alphaId: 'CMAT01', name: 'Construction Materials Inventory', type: 'Asset', normalSide: 'debit' },
  { numericId: '105500', alphaId: 'FBSP01', name: 'Food and Beverage Supplies', type: 'Asset', normalSide: 'debit' },
  { numericId: '105600', alphaId: 'PKGS01', name: 'Packaging Materials and Supplies', type: 'Asset', normalSide: 'debit' },
  { numericId: '105700', alphaId: 'SPAR01', name: 'Spare Parts and Consumables', type: 'Asset', normalSide: 'debit' },
  { numericId: '106000', alphaId: 'REIN01', name: 'Real Estate Inventory', type: 'Asset', normalSide: 'debit' },
  { numericId: '110000', alphaId: 'LAND01', name: 'Land', type: 'Asset', normalSide: 'debit' },
  { numericId: '110100', alphaId: 'BLDG01', name: 'Buildings', type: 'Asset', normalSide: 'debit' },
  { numericId: '110200', alphaId: 'LHIM01', name: 'Leasehold Improvements', type: 'Asset', normalSide: 'debit' },
  { numericId: '110300', alphaId: 'MACH01', name: 'Machinery and Equipment', type: 'Asset', normalSide: 'debit' },
  { numericId: '110400', alphaId: 'OEQP01', name: 'Office Equipment', type: 'Asset', normalSide: 'debit' },
  { numericId: '110500', alphaId: 'FFIX01', name: 'Furniture and Fixtures', type: 'Asset', normalSide: 'debit' },
  { numericId: '110600', alphaId: 'TRAN01', name: 'Transportation Equipment', type: 'Asset', normalSide: 'debit' },
  { numericId: '110700', alphaId: 'ADP001', name: 'Accumulated Depreciation - PPE', type: 'Asset', normalSide: 'credit' },
  { numericId: '111000', alphaId: 'ROUA01', name: 'Right-of-Use Assets', type: 'Asset', normalSide: 'debit' },
  { numericId: '112000', alphaId: 'SWIN01', name: 'Computer Software and Intangibles', type: 'Asset', normalSide: 'debit' },
  { numericId: '112100', alphaId: 'AAMI01', name: 'Accumulated Amortization - Intangibles', type: 'Asset', normalSide: 'credit' },

  // Liabilities — common PH tax, payroll, trade and financing accounts
  { numericId: '200000', alphaId: 'APTR01', name: 'Accounts Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '200100', alphaId: 'APNT01', name: 'Nontrade Payables', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '201000', alphaId: 'ACRU01', name: 'Accrued Expenses and Other Payables', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '201100', alphaId: 'SALP01', name: 'Salaries and Wages Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '201200', alphaId: 'STAT01', name: 'SSS, PhilHealth and Pag-IBIG Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '201300', alphaId: 'OVAT01', name: 'Output VAT Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '201400', alphaId: 'EWTP01', name: 'Expanded Withholding Tax Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '201500', alphaId: 'CWTP01', name: 'Compensation Withholding Tax Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '201600', alphaId: 'PPTX01', name: 'Percentage Tax Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '202000', alphaId: 'CLIA01', name: 'Contract Liabilities', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '202100', alphaId: 'CUST01', name: 'Customer Deposits and Advances', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '203000', alphaId: 'NOTE01', name: 'Notes Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '203100', alphaId: 'STLN01', name: 'Short-term Loans Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '204000', alphaId: 'LTLN01', name: 'Long-term Loans Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '204100', alphaId: 'CPLTD1', name: 'Current Portion of Long-term Debt', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '205000', alphaId: 'LLCU01', name: 'Lease Liabilities - Current', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '205100', alphaId: 'LLNC01', name: 'Lease Liabilities - Non-current', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '206000', alphaId: 'ITXP01', name: 'Income Tax Payable', type: 'Liabilities', normalSide: 'credit' },
  { numericId: '207000', alphaId: 'EBEN01', name: 'Provision for Employee Benefits', type: 'Liabilities', normalSide: 'credit' },

  // Equity — supports both sole proprietors and corporations
  { numericId: '300000', alphaId: 'OWNC01', name: "Owner's Capital", type: 'Equity', normalSide: 'credit' },
  { numericId: '300100', alphaId: 'DRAW01', name: "Owner's Drawings", type: 'Equity', normalSide: 'debit' },
  { numericId: '301000', alphaId: 'SHCP01', name: 'Share Capital', type: 'Equity', normalSide: 'credit' },
  { numericId: '301100', alphaId: 'APIC01', name: 'Additional Paid-in Capital', type: 'Equity', normalSide: 'credit' },
  { numericId: '302000', alphaId: 'RETE01', name: 'Retained Earnings', type: 'Equity', normalSide: 'credit' },
  { numericId: '302100', alphaId: 'CYEP01', name: 'Current Year Earnings', type: 'Equity', normalSide: 'credit' },
  { numericId: '303000', alphaId: 'REVS01', name: 'Revaluation Surplus', type: 'Equity', normalSide: 'credit' },
  { numericId: '304000', alphaId: 'ORES01', name: 'Other Equity Reserves', type: 'Equity', normalSide: 'credit' },

  // Revenue — merchandising, service, construction, real estate, food, hotel and ICT
  { numericId: '400000', alphaId: 'SALE01', name: 'Sales Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '400100', alphaId: 'SERV01', name: 'Service Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '400200', alphaId: 'CNTR01', name: 'Contract Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '400300', alphaId: 'CNST01', name: 'Construction Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '400400', alphaId: 'REST01', name: 'Real Estate Sales Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '400500', alphaId: 'RENT01', name: 'Rental Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '400600', alphaId: 'FBREV1', name: 'Food and Beverage Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '400700', alphaId: 'ROOM01', name: 'Room and Accommodation Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '400800', alphaId: 'ICTR01', name: 'Subscription and ICT Service Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '400900', alphaId: 'ROYF01', name: 'Royalty and Franchise Fee Revenue', type: 'Revenue', normalSide: 'credit' },
  { numericId: '401000', alphaId: 'SRTA01', name: 'Sales Returns and Allowances', type: 'Revenue', normalSide: 'debit' },
  { numericId: '401100', alphaId: 'SLDS01', name: 'Sales Discounts', type: 'Revenue', normalSide: 'debit' },
  { numericId: '402000', alphaId: 'OOIN01', name: 'Other Operating Income', type: 'Revenue', normalSide: 'credit' },
  { numericId: '403000', alphaId: 'INTI01', name: 'Interest Income', type: 'Revenue', normalSide: 'credit' },
  { numericId: '403100', alphaId: 'FXG001', name: 'Foreign Exchange Gain', type: 'Revenue', normalSide: 'credit' },

  // Costs — merchandising, service, construction, real estate, hospitality, ICT and manufacturing
  { numericId: '500000', alphaId: 'COSM01', name: 'Cost of Merchandise Sold', type: 'Costs', normalSide: 'debit' },
  { numericId: '500100', alphaId: 'PURC01', name: 'Purchases', type: 'Costs', normalSide: 'debit' },
  { numericId: '500200', alphaId: 'PRRA01', name: 'Purchase Returns and Allowances', type: 'Costs', normalSide: 'credit' },
  { numericId: '500300', alphaId: 'PRDS01', name: 'Purchase Discounts', type: 'Costs', normalSide: 'credit' },
  { numericId: '500400', alphaId: 'FREI01', name: 'Freight-In and Importation Costs', type: 'Costs', normalSide: 'debit' },
  { numericId: '500500', alphaId: 'COSV01', name: 'Cost of Services', type: 'Costs', normalSide: 'debit' },
  { numericId: '500600', alphaId: 'COSC01', name: 'Cost of Construction', type: 'Costs', normalSide: 'debit' },
  { numericId: '500700', alphaId: 'CMUS01', name: 'Construction Materials Used', type: 'Costs', normalSide: 'debit' },
  { numericId: '500800', alphaId: 'DLAB01', name: 'Direct Labor - Construction', type: 'Costs', normalSide: 'debit' },
  { numericId: '500900', alphaId: 'COSR01', name: 'Cost of Real Estate Sales', type: 'Costs', normalSide: 'debit' },
  { numericId: '501000', alphaId: 'FBCO01', name: 'Food and Beverage Cost', type: 'Costs', normalSide: 'debit' },
  { numericId: '501100', alphaId: 'ROOMC1', name: 'Cost of Room Operations', type: 'Costs', normalSide: 'debit' },
  { numericId: '501200', alphaId: 'BAND01', name: 'Bandwidth and Leased Line Costs', type: 'Costs', normalSide: 'debit' },
  { numericId: '501300', alphaId: 'NETM01', name: 'Network Materials and Supplies Used', type: 'Costs', normalSide: 'debit' },
  { numericId: '501400', alphaId: 'DMAN01', name: 'Direct Materials - Manufacturing', type: 'Costs', normalSide: 'debit' },
  { numericId: '501500', alphaId: 'DLMF01', name: 'Direct Labor - Manufacturing', type: 'Costs', normalSide: 'debit' },
  { numericId: '501600', alphaId: 'FOHO01', name: 'Factory Overhead', type: 'Costs', normalSide: 'debit' },

  // Operating expenses — common PH SME / corporate expense classifications
  { numericId: '600000', alphaId: 'SALA01', name: 'Salaries and Wages Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600100', alphaId: 'EBEX01', name: 'Employee Benefits Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600200', alphaId: 'GOVC01', name: 'Employer SSS, PhilHealth and Pag-IBIG Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600300', alphaId: 'RENTX1', name: 'Rent Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600400', alphaId: 'UTIL01', name: 'Utilities Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600500', alphaId: 'ELEC01', name: 'Electricity Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600600', alphaId: 'WATE01', name: 'Water Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600700', alphaId: 'COMM01', name: 'Communication and Internet Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600800', alphaId: 'RMNT01', name: 'Repairs and Maintenance Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '600900', alphaId: 'DEPR01', name: 'Depreciation Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601000', alphaId: 'AMOR01', name: 'Amortization Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601100', alphaId: 'TLAX01', name: 'Taxes and Licenses Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601200', alphaId: 'PROF01', name: 'Professional Fees Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601300', alphaId: 'LACC01', name: 'Legal and Accounting Fees Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601400', alphaId: 'TRAV01', name: 'Transportation and Travel Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601500', alphaId: 'FUOL01', name: 'Fuel and Oil Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601600', alphaId: 'OSUP01', name: 'Office Supplies Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601700', alphaId: 'ADMK01', name: 'Advertising and Marketing Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601800', alphaId: 'DFRG01', name: 'Delivery and Freight-Out Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '601900', alphaId: 'INSU01', name: 'Insurance Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '602000', alphaId: 'SECJ01', name: 'Security and Janitorial Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '602100', alphaId: 'TRNG01', name: 'Training and Seminar Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '602200', alphaId: 'DUES01', name: 'Dues and Memberships Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '602300', alphaId: 'BCGF01', name: 'Bank Charges and Payment Gateway Fees Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '602400', alphaId: 'BADB01', name: 'Bad Debt Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '602500', alphaId: 'CCFE01', name: 'Credit Card Processing Fees Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '602600', alphaId: 'CMIS01', name: 'Commission Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '602700', alphaId: 'MEAL01', name: 'Meals and Entertainment Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '602800', alphaId: 'MANP01', name: 'Manpower and Contract Labor Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '603000', alphaId: 'FINX01', name: 'Interest and Finance Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '603100', alphaId: 'FXL001', name: 'Foreign Exchange Loss', type: 'Expense', normalSide: 'debit' },
  { numericId: '603200', alphaId: 'PENL01', name: 'Penalties and Fines Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '603300', alphaId: 'DONT01', name: 'Donations and Contributions Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '603400', alphaId: 'MISC01', name: 'Miscellaneous Operating Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '603500', alphaId: 'BPER01', name: 'Business Permit and Registration Fees Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '603600', alphaId: 'REPR01', name: 'Representation Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '603700', alphaId: 'CLDS01', name: 'Cloud and Software Subscription Expense', type: 'Expense', normalSide: 'debit' },
  { numericId: '603800', alphaId: 'VEHX01', name: 'Vehicle Operating Expense', type: 'Expense', normalSide: 'debit' },
];

export const DEFAULT_ACCOUNTS: CoaAccount[] = DEFAULT_ACCOUNT_SEEDS.map(({ numericId, name, type, normalSide }) => ({
  id: numericId,
  name,
  type,
  normalSide,
}));

export const DEFAULT_ACCOUNTS_ALPHA: CoaAccount[] = DEFAULT_ACCOUNT_SEEDS.map(({ alphaId, name, type, normalSide }) => ({
  id: alphaId,
  name,
  type,
  normalSide,
}));

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
