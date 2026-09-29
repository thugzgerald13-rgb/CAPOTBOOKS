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
  entrySource?: 'invoiced' | 'other-payments' | 'ap';
  exemptAmount?: number;
  zeroRatedAmount?: number;
  expenseType: string;
  accountTitle: string;
  transactionDetails?: string;
  inputTax: number;
  attachment?: {
    name: string;
    type: string;
    originalType: string;
    size: number;
    originalSize: number;
    compression?: 'none' | 'gzip';
    content?: string;
    storagePath?: string;
  };
  withholdingOption?: 'w/o' | 'with';
  atcCode?: string | null;
  whtRate?: number | null;
  whtAmount?: number;
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
  normalSide?: 'debit' | 'credit';
  parentId?: string;
  hidden?: boolean;
  openingBalance?: number;
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
  sjColumns?: JournalColumn[];
  sjEntries?: JournalEntry[];
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
  content?: string; // legacy base64 compatibility only; new files use storagePath
  storagePath?: string;
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
  certifiedBy: string;
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
  // When true, this entry was generated automatically from a source journal
  // (Cash Receipts/Disbursements Journal, Purchases Journal, Journal Voucher,
  // or the Purchases module) rather than typed directly into the General
  // Ledger. Auto-posted entries are regenerated every time their source
  // changes, so they're read-only here — edit them at the source instead.
  auto?: boolean;
  // Human-readable label for where an auto-posted entry came from, e.g.
  // "Cash Receipts Journal". Undefined for manually-entered entries.
  autoSource?: string;
}

export interface GeneralLedgerAccount {
  id: string;
  accountTitle: string;
  // Links this ledger account back to its Chart of Accounts entry so the General
  // Ledger can show/filter by Account Type. Optional for backward compatibility
  // with ledger accounts created before this link existed.
  accountId?: string;
  accountType?: string;
  entries: GeneralLedgerEntry[];
  // Beginning balance for this ledger account, sourced live from the matching
  // Chart of Accounts entry's opening balance. Not persisted on this record —
  // recomputed from the CoA each render so edits to the opening balance in the
  // CoA are reflected here immediately.
  openingBalance?: number;
  // Which side (debit or credit) the opening balance normally sits on, also
  // sourced from the Chart of Accounts entry, used to place the beginning
  // balance in the correct column of the ledger.
  normalSide?: 'debit' | 'credit';
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
  // When true, this entry was generated automatically — e.g. a cash purchase
  // or a Journal Voucher that credits Cash, auto-recorded into the Cash
  // Disbursements Journal — rather than typed directly into the journal.
  // Auto-posted entries are regenerated every time their source changes, so
  // they're read-only here — edit them at the source instead.
  auto?: boolean;
  // Human-readable label for where an auto-posted entry came from, e.g.
  // "Purchases" or "Journal Voucher". Undefined for manually-entered entries.
  autoSource?: string;
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


// ============================================================================
// TEAM / SUBUSERS (account members)
// ============================================================================
export type MemberRole = 'accountant' | 'bookkeeper' | 'staff' | 'viewer';
export type MemberStatus = 'invited' | 'active' | 'disabled';
// 'managed'     -> owner created the login (staff who don't sign up themselves)
// 'independent' -> invitee owns their own CAPOT account; they accepted an invite
export type MemberKind = 'managed' | 'independent';

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  displayName?: string | null;
  memberRole: MemberRole;
  memberKind: MemberKind;
  status: MemberStatus;
  lastLogin?: string | null;
  createdAt?: string | null;
}

export interface AccountMembership {
  isSubuser: boolean;
  ownerId?: string | null;
  ownerEmail?: string | null;
  memberRole?: MemberRole | null;
  status?: MemberStatus | null;
  memberKind?: MemberKind | null;
}

export interface InviteResult {
  userId: string;
  email: string;
  temporaryPassword: string | null;
  existingUser: boolean;
  memberKind?: MemberKind;
}

// Result of sending an independent invite (no account created; invitee accepts later)
export interface IndependentInviteResult {
  email: string;
  inviteToken: string;
  hasExistingAccount: boolean;
}

// Pending independent invite as seen by the OWNER
export interface PendingInvitation {
  id: string;
  inviteeEmail: string;
  displayName?: string | null;
  memberRole: MemberRole;
  status: 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired';
  createdAt?: string | null;
  expiresAt?: string | null;
}

// Pending invite addressed to the CURRENT signed-in user (invitee view)
export interface PendingInviteForMe {
  id: string;
  inviteToken: string;
  ownerEmail?: string | null;
  ownerDisplayName?: string | null;
  memberRole: MemberRole;
  createdAt?: string | null;
  expiresAt?: string | null;
}
/** A single imported account row. `original` preserves every column from the uploaded file, so the uploaded format prevails. */
export interface ImportedAccountRow {
  accountCode: string;
  accountName: string;
  amount: number;
  year: number;
  original?: Record<string, string | number>;
}

/** Result returned by the file parser (src/utils/fileParser.ts). */
export interface ImportResult {
  success: boolean;
  message: string;
  year?: number;
  data?: ImportedAccountRow[];
  warnings?: string[];
  originalFileName?: string;
  originalHeaders?: string[];
  sheetName?: string;
}
