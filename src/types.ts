export interface TinEntry {
  id: number;
  tin: string;
  name: string;
  address?: string;
}

export interface Purchase {
  id: number;
  datMonthYear: string;
  date: string;
  paymentMethod: string;
  checkNumber: string | null;
  bankName?: string | null;
  invoiceNo: string;
  supplierName: string;
  supplierAddress: string;
  supplierTin: string;
  amount: number;
  vatType: string;
  expenseType: string;
  accountTitle: string;
  transactionDetails?: string;
  inputTax: number;
}

export interface Sale {
  id: number;
  datMonthYear?: string;
  date: string;
  ref: string;
  paymentType: string;
  buyerTin: string;
  buyerName: string;
  buyerAddress: string;
  vatType: string;
  amount: number;
  netOfVat: number;
  outputTax: number;
  incomeType: string;
  desc?: string;
}

export interface Expense {
  id: number;
  date: string;
  amount: number;
  category: string;
  description: string;
}

export interface CoaColumn {
  id: string;
  name: string;
  isSystem: boolean;
}

export interface CoaAccount {
  id: string;
  name: string;
  type: string;
  subType?: string;
  normalSide?: 'debit' | 'credit';
  parentId?: string;
  [key: string]: any;
}

export interface BillingInvoice {
  id: string;
  date: string;
  dueDate: string;
  invoiceNo: string;
  customerTin: string;
  customerName: string;
  customerAddress: string;
  vatType: string;
  amount: number;
  netOfVat: number;
  outputTax: number;
  description?: string;
  status: 'Outstanding' | 'Paid';
  paymentType?: string;
  datePaid?: string;
  isRecurring: boolean;
  recurrenceFrequency?: 'Monthly' | 'Quarterly' | 'Annually';
  nextBillingDate?: string;
  parentInvoiceId?: string;
}

export interface JournalVoucherLine {
  id: string;
  accountId: string;
  accountName: string;
  debit: number;
  credit: number;
}

export interface JournalVoucher {
  id: string;
  date: string;
  reference: string;
  memo: string;
  lines: JournalVoucherLine[];
}

export interface Client {
  id: string;
  name: string; // Display name
  tin?: string;
  taxpayerClassification?: string;
  registeredName?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  tradeName?: string;
  substreet?: string;
  street?: string;
  barangay?: string;
  district?: string;
  city?: string;
  zipCode?: string;
  rdoCode?: string;
  phone?: string;
  email?: string;
  category?: 'private' | 'government';
  hasMultipleBusinessLines?: boolean;
  accountingType?: 'Calendar' | 'Fiscal';
  fiscalMonthEnd?: number;
  coaFormat?: 'numeric' | 'alphanumeric';
  tinLibrary: {
    customers: TinEntry[];
    suppliers: TinEntry[];
  };
  sales: Sale[];
  purchases: Purchase[];
  expenses: Expense[];
  accounts?: CoaAccount[];
  coaColumns?: CoaColumn[];
  crjColumns?: JournalColumn[];
  crjEntries?: JournalEntry[];
  cdjColumns?: JournalColumn[];
  cdjEntries?: JournalEntry[];
  pjColumns?: JournalColumn[];
  pjEntries?: JournalEntry[];
  gjColumns?: JournalColumn[];
  gjEntries?: JournalEntry[];
  glAccounts?: GeneralLedgerAccount[];
  plData?: ProfitAndLossData;
  bsData?: BalanceSheetData;
  cfData?: CashFlowData;
  folders?: AppFolder[];
  files?: AppFile[];
  payableInvoices?: PayableInvoice[];
  purchaseOrders?: PurchaseOrder[];
  receivingReports?: ReceivingReport[];
  bankAccounts?: BankAccount[];
  supplierAdvances?: SupplierAdvance[];
  withholdingTaxEntries?: WithholdingTaxEntry[];
  debitCreditMemos?: DebitCreditMemo[];
  checkVouchers?: CheckVoucher[];
  miscellaneousPayments?: MiscellaneousPayment[];
  inventoryItems?: InventoryItem[];
  inventoryMovements?: InventoryMovement[];
  inventoryColumns?: InventoryColumn[];
  assetLapsingSchedule?: AssetLapsingEntry[];
  taxDeadlines?: TaxDeadline[];
  billingInvoices?: BillingInvoice[];
  journalVouchers?: JournalVoucher[];
}

export interface TaxDeadline {
  id: string;
  formType: '2550Q' | '1701Q' | '2551Q' | '1601-C' | '0619-E' | '1601-EQ';
  title: string;
  period: string;
  dueDate: string;
  status: 'Pending' | 'Processing' | 'Filed' | 'Paid' | 'Overdue';
  taxStatus?: 'With Payable' | 'W/O Payable';
  amountDue?: number;
  dateFiled?: string;
  datePaid?: string;
  referenceNo?: string;
  confirmationNo?: string;
  notes?: string;
}

export interface InventoryItem {
  id: string;
  code: string;
  name: string;
  sku: string;
  description?: string;
  category: 'Raw Materials' | 'Work in Progress' | 'Finished Goods' | 'Merchandise' | 'Services' | string;
  unitOfMeasure: string;
  costPrice: number;
  sellingPrice: number;
  stockLevel: number;
  reorderPoint: number;
  location?: string;
  customFields?: Record<string, string>;
}

export interface InventoryColumn {
  id: string;
  label: string;
}

export interface AssetLapsingEntry {
  id: string;
  datePurchased: string;
  invoiceNo: string;
  description: string;
  cost: number;
  usefulLifeYears: number;
  salvageValue: number;
}

export interface InventoryMovement {
  id: string;
  itemId: string;
  itemName: string;
  itemCode: string;
  date: string;
  type: 'Inbound' | 'Outbound' | 'Adjustment';
  qty: number;
  unitCost: number;
  totalValue: number;
  reference: string;
  notes?: string;
}

export interface AppFolder {
  id: string;
  name: string;
  isDefault: boolean;
  type?: 'revenue' | 'expense' | 'custom';
}

export interface AppFile {
  id: string;
  name: string;
  type: string;
  size: number;
  uploadedAt: string;
  folderId: string;
  content?: string; // base64 representation of file
  description?: string;
}

export interface BusinessProfile {
  id: string;
  name: string;
  tin?: string;
  taxpayerClassification?: string;
  registeredName?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  tradeName?: string;
  substreet?: string;
  street?: string;
  barangay?: string;
  district?: string;
  city?: string;
  zipCode?: string;
  rdoCode?: string;
  phone?: string;
  email?: string;
  category?: 'private' | 'government';
  hasMultipleBusinessLines?: boolean;
  accountingType?: 'Calendar' | 'Fiscal';
  fiscalMonthEnd?: number;
}

export interface ProfitAndLossLine {
  id: string;
  particulars: string;
  amount: string;
}

export interface ProfitAndLossData {
  companyName: string;
  address: string;
  reportName: string;
  period: string;
  revenue: ProfitAndLossLine[];
  costOfRevenue: ProfitAndLossLine[];
  operatingExpenses: ProfitAndLossLine[];
  provisionForIncomeTax: string;
}

export interface BalanceSheetLine {
  id: string;
  particulars: string;
  amount: string;
  priorAmount: string;
}

export interface BalanceSheetData {
  companyName: string;
  address: string;
  reportName: string;
  asOfDate: string;
  currentYearLabel: string;
  priorYearLabel: string;
  currentAssets: BalanceSheetLine[];
  ppe: BalanceSheetLine[];
  currentLiabilities: BalanceSheetLine[];
  capital: BalanceSheetLine[];
}

export interface CashFlowLine {
  id: string;
  particulars: string;
  amount: string;
  priorAmount: string;
}

export interface CashFlowData {
  companyName: string;
  reportName: string;
  period: string;
  comparativeNote: string;
  operatingActivities: CashFlowLine[];
  investingActivities: CashFlowLine[];
  financingActivities: CashFlowLine[];
  cashBeginning: string;
  cashBeginningPrior: string;
}

export interface GeneralLedgerEntry {
  id: string;
  dateDr: string;
  particularsDr: string;
  refDr: string;
  debit: string;
  dateCr: string;
  particularsCr: string;
  refCr: string;
  credit: string;
}

export interface GeneralLedgerAccount {
  id: string;
  accountTitle: string;
  entries: GeneralLedgerEntry[];
}

export interface JournalColumn {
  id: string;
  name: string;
  type: 'text' | 'number';
  category: 'Dr' | 'Cr' | 'None';
  isSystem: boolean; // if true, not deletable
}

export interface JournalEntry {
  id: string;
  values: Record<string, any>;
}

export type CashReceipt = JournalEntry;
export type CashDisbursement = JournalEntry;

export interface DatSelection {
  month: number;
  year: number;
  formatted: string;
}

// ============================================================================
// ACCOUNTS PAYABLE & CASH DISBURSEMENTS MODULES
// ============================================================================

export interface POItem {
  itemCode: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export interface PurchaseOrder {
  id: string; // e.g., PO-2026-0001
  date: string;
  supplierId: string;
  supplierName: string;
  items: POItem[];
  totalAmount: number;
  status: 'Draft' | 'Approved' | 'Received' | 'Cancelled';
}

export interface RRItem {
  itemCode: string;
  description: string;
  qtyOrdered: number;
  qtyReceived: number;
  unitPrice: number;
}

export interface ReceivingReport {
  id: string; // e.g., RR-2026-0001
  date: string;
  poId: string; // associated PO
  supplierName: string;
  items: RRItem[];
  totalAmount: number;
  receivedBy: string;
}

export interface PayableInvoiceItem {
  itemCode: string;
  description: string;
  qty: number;
  unitPrice: number;
}

export interface PayableInvoice {
  id: string; // e.g., SI-2026-0489
  invoiceNumber: string;
  date: string;
  dueDate: string;
  poId?: string; // for 3-way matching
  rrId?: string; // for 3-way matching
  supplierId: string;
  supplierName: string;
  items: PayableInvoiceItem[];
  subtotal: number;
  vatAmount: number;
  isVatable: boolean;
  withholdingTaxId?: string; // reference to ATC withholding
  whtAmount?: number;
  totalAmount: number; // Final payable amount after adjustments
  status: 'Unmatched' | 'Matched' | 'Discrepancy' | 'Approved' | 'Hold' | 'Paid' | 'Cancelled';
  discrepancyDetails?: string;
  appliedPrepayments?: number; // Prepayments deducted
}

export interface BankAccount {
  id: string;
  bankName: string;
  accountNumber: string;
  balance: number;
}

export interface SupplierAdvance {
  id: string;
  supplierId: string;
  supplierName: string;
  date: string;
  amount: number;
  isLiquidated: boolean;
  notes?: string;
}

export interface WithholdingTaxEntry {
  id: string;
  atcCode: string; // e.g., WI 100, WC 158
  description: string;
  taxRate: number; // e.g., 0.01 for 1%, 0.02, 0.05
  category: 'Expanded' | 'Tax on Compensation' | 'Final';
}

export interface DebitCreditMemo {
  id: string;
  type: 'Debit' | 'Credit'; // Debit reduces payables, Credit increases payables
  invoiceId: string; // target invoice being modified
  invoiceNumber: string;
  supplierName: string;
  date: string;
  amount: number;
  reason: string;
}

export interface CheckVoucher {
  id: string; // Voucher number, e.g., CV-2026-0001
  date: string;
  payeeName: string;
  invoiceId?: string; // if clearing an invoice
  invoiceNumber?: string;
  paymentType: 'Invoice Clearance' | 'Advance' | 'Miscellaneous';
  miscDetails?: string;
  amount: number;
  checkedBy: string;
  approvedBy: string;
  bankAccountId: string;
  bankName: string;
  checkNumber: string;
  status: 'Withdrawn' | 'Cleared' | 'Reversed';
  reversedReason?: string;
  reversedAt?: string;
}

export interface MiscellaneousPayment {
  id: string;
  date: string;
  payeeName: string;
  amount: number;
  bankAccountId: string;
  bankName: string;
  checkNumber: string;
  expenseCategory: string; // e.g., Utilities, Rent, Office Supplies
  description: string;
}

