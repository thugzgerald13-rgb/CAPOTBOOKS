// Shared journal / Chart-of-Accounts defaults.
// Extracted from the journal component files so that lib/ modules (glPosting,
// accountingBalances) no longer import from components/ — which previously
// dragged ~4,700 lines of component code (and xlsx) into the main bundle.
import type { JournalColumn, CoaAccount } from '../types';

// ---- Chart of Accounts (ChartOfAccounts.tsx) ----
export const DEFAULT_ACCOUNTS: CoaAccount[] = [
  { id: '1000', name: 'Cash on Hand', type: 'Asset', normalSide: 'debit' },
  { id: '1100', name: 'Accounts Receivable', type: 'Asset', normalSide: 'debit' },
  { id: '1200', name: 'Creditable Withholding Tax', type: 'Asset', normalSide: 'debit' },
  { id: '1300', name: 'Inventory', type: 'Asset', normalSide: 'debit' },
  { id: '2000', name: 'Accounts Payable', type: 'Liabilities', normalSide: 'credit' },
  { id: '2100', name: 'VAT Output Payable', type: 'Liabilities', normalSide: 'credit' },
  { id: '2200', name: 'VAT Input Receivable', type: 'Asset', normalSide: 'debit' },
  { id: '2300', name: 'Withholding Tax Payable', type: 'Liabilities', normalSide: 'credit' },
  { id: '3000', name: 'Capital Stock', type: 'Equity', normalSide: 'credit' },
  { id: '3100', name: 'Retained Earnings', type: 'Equity', normalSide: 'credit' },
  { id: '4000', name: 'Sales Revenue', type: 'Revenue', normalSide: 'credit' },
  { id: '5000', name: 'Cost of Goods Sold', type: 'Costs', normalSide: 'debit' },
  { id: '5100', name: 'Operating Expenses', type: 'Expense', normalSide: 'debit' },
];

export const DEFAULT_ACCOUNTS_ALPHA: CoaAccount[] = [
  { id: 'COH-1000', name: 'Cash on Hand', type: 'Asset', normalSide: 'debit' },
  { id: 'ACR-1100', name: 'Accounts Receivable', type: 'Asset', normalSide: 'debit' },
  { id: 'CWT-1200', name: 'Creditable Withholding Tax', type: 'Asset', normalSide: 'debit' },
  { id: 'INV-1300', name: 'Inventory', type: 'Asset', normalSide: 'debit' },
  { id: 'ACP-2000', name: 'Accounts Payable', type: 'Liabilities', normalSide: 'credit' },
  { id: 'VOP-2100', name: 'VAT Output Payable', type: 'Liabilities', normalSide: 'credit' },
  { id: 'VIR-2200', name: 'VAT Input Receivable', type: 'Asset', normalSide: 'debit' },
  { id: 'WTP-2300', name: 'Withholding Tax Payable', type: 'Liabilities', normalSide: 'credit' },
  { id: 'CAP-3000', name: 'Capital Stock', type: 'Equity', normalSide: 'credit' },
  { id: 'RET-3100', name: 'Retained Earnings', type: 'Equity', normalSide: 'credit' },
  { id: 'REV-4000', name: 'Sales Revenue', type: 'Revenue', normalSide: 'credit' },
  { id: 'CGS-5000', name: 'Cost of Goods Sold', type: 'Costs', normalSide: 'debit' },
  { id: 'OPE-5100', name: 'Operating Expenses', type: 'Expense', normalSide: 'debit' },
];

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
