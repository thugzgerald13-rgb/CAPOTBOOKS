export interface TinEntry {
  id: number;
  tin: string;
  name: string;
  address?: string;
}

export interface Purchase {
  id: number;
  sequenceNumber?: number;
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
  vatType: 'vat' | 'vat-nonvat' | 'non-vat' | string;
  entrySource?: 'invoiced' | 'other-payments' | 'ap';
  exemptAmount?: number;
  zeroRatedAmount?: number;
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
  // BIR E-Invoicing (EIS) status — denormalized for fast UI badges.
  eisUniqueId?: string;
  eisDocType?: 'SI' | 'OR' | 'DR' | 'CR';
  eisStatus?: 'queued' | 'submitted' | 'accepted' | 'rejected' | 'cancelled';
  eisAckCode?: string;
  eisSubmittedAt?: string;
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
  // Income / Costs / Expense accounts carry a Previous Year Balance instead of an
  // opening balance. It is reference-only and is never posted to the General Ledger.
  previousYearBalance?: number;
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
  // Invoice template used for PDF rendering (custom or built-in).
  templateId?: string;
  // BIR E-Invoicing (EIS) status — denormalized for fast UI badges.
  eisUniqueId?: string;
  eisDocType?: 'SI' | 'OR' | 'DR' | 'CR';
  eisStatus?: 'queued' | 'submitted' | 'accepted' | 'rejected' | 'cancelled';
  eisAckCode?: string;
  eisSubmittedAt?: string;
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

export type ClientIndustry = 'retail' | 'general-services' | 'manufacturing' | 'construction';
// BIR VAT registration status of a taxpayer. RELIEF (SLSP) filing is required
// only for VAT-registered and zero-rated taxpayers; Non-VAT and Exempt entities
// do not file RELIEF, so the RELIEF menu is hidden & locked for those types.
export type VatRegistrationType = 'vat' | 'non-vat' | 'exempt' | 'zero-rated';

export type TaxpayerClassificationType = 'Individual' | 'Non-Individual' | string;

export type TaxpayerSubClassification =
  | 'sole_proprietor'
  | 'professional'
  | 'mixed_income'
  | 'corporation_regular'
  | 'corporation_msme'
  | 'domestic_corp'
  | 'msme_corp'
  | 'opc'
  | 'partnership'
  | 'gpp'
  | 'cooperative';

/** EOPT Act (RA 11976) Taxpayer Size Classification based on Gross Sales. */
export type TaxpayerSizeTier = 'micro' | 'small' | 'medium' | 'large';

/** Chosen or applicable Income Tax Regime & Tax Rate workflow per business. */
export type IncomeTaxRegime =
  | '8_percent_flat'      // Individual: 8% Flat Income Tax (>₱250k for sole prop/prof; full business gross for mixed income) — exempt from 2551Q
  | 'graduated_itemized'  // Individual: 0%–35% TRAIN Graduated Tax Table with Itemized Deductions
  | 'graduated_osd'       // Individual: 0%–35% TRAIN Graduated Tax Table with 40% Optional Standard Deduction (OSD) on Gross Sales/Receipts
  | 'corp_20_msme'        // Non-Individual: 20% CREATE MSME Corporate Income Tax (Net Income ≤ ₱5M & Assets ≤ ₱100M) with Itemized Deductions
  | 'corp_20_osd'         // Non-Individual: 20% CREATE MSME Corporate Income Tax with 40% OSD on Gross Income
  | 'corp_25_regular'     // Non-Individual: 25% Regular Corporate Income Tax (RCIT) with Itemized Deductions
  | 'corp_25_osd'         // Non-Individual: 25% Regular Corporate Income Tax (RCIT) with 40% OSD on Gross Income
  | 'corp_gpp_exempt'     // Non-Individual: 0% Tax-Exempt General Professional Partnership (GPP) / Exempt Cooperative
  | 'corp_special_5';     // Non-Individual: 5% Special Gross Income Earned (GIE / PEZA / Ecozone)

export type DeductionMethod = 'itemized' | 'osd' | 'osd_40' | 'none' | 'none_8_percent';

export interface Client {
  id: string;
  name: string; // Display name
  proprietor?: string;
  tin?: string;
  taxpayerClassification?: string;
  taxpayerSubClassification?: TaxpayerSubClassification;
  taxpayerTier?: TaxpayerSizeTier;
  incomeTaxRegime?: IncomeTaxRegime;
  deductionMethod?: DeductionMethod;
  percentageTaxRate?: number; // e.g., 0.03 (3%), 0.01 (1%), 0.02 (2%), 0.05 (5%), 0 (Exempt under 8% Flat)
  hasEmployees?: boolean;
  isTopWithholdingAgent?: boolean;
  totalAssetsExcludingLand?: number;
  yearsOfOperation?: number;
  registeredName?: string;
  lastName?: string;
  firstName?: string;
  middleName?: string;
  tradeName?: string;
  address?: string;
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
  industry?: ClientIndustry;
  // BIR VAT registration type — drives whether the RELIEF (SLSP) module is available.
  vatRegistrationType?: VatRegistrationType;
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

export type TaxFormCode =
  | '2550Q'
  | '2550M'
  | '1701Q'
  | '1701'
  | '1701A'
  | '1702Q'
  | '1702-RT'
  | '1702-EX'
  | '1702-MX'
  | '2551Q'
  | '1601-C'
  | '0619-E'
  | '1601-EQ'
  | '1600-VT'
  | '0605';

export interface TaxDeadline {
  id: string;
  formType: TaxFormCode;
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
  /** Optional aliases used by inventoryValuation helpers */
  quantityOnHand?: number;
  unitCost?: number;
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
  type: 'Inbound' | 'Outbound' | 'Adjustment' | string;
  qty: number;
  unitCost: number;
  totalValue: number;
  reference: string;
  notes?: string;
  /** Optional alias used by inventoryValuation helpers */
  quantity?: number;
}

export interface AppFolder {
  id: string;
  name: string;
  isDefault: boolean;
  /**
   * 'revenue' | 'expense' | 'other' = system default folder of the Income /
   * Expense / Other Files page. 'custom:income' | 'custom:expense' |
   * 'custom:other' = user-added folder scoped to that page. Legacy 'custom'
   * folders are shown under Other Files.
   */
  type?: 'revenue' | 'expense' | 'other' | 'custom' | 'custom:income' | 'custom:expense' | 'custom:other';
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
  address?: string;
  tin?: string;
  taxpayerClassification?: TaxpayerClassificationType;
  taxpayerSubClassification?: TaxpayerSubClassification;
  taxpayerTier?: TaxpayerSizeTier;
  incomeTaxRegime?: IncomeTaxRegime;
  deductionMethod?: DeductionMethod;
  percentageTaxRate?: number;
  hasEmployees?: boolean;
  isTopWithholdingAgent?: boolean;
  totalAssetsExcludingLand?: number;
  yearsOfOperation?: number;
  industry?: ClientIndustry;
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
  // BIR VAT registration type — drives whether the RELIEF (SLSP) module is available.
  vatRegistrationType?: VatRegistrationType;
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
  notes?: string;
}

export interface CashFlowLine {
  id: string;
  particulars: string;
  amount: string;
  priorAmount: string;
}

export interface CashFlowData {
  companyName: string;
  address?: string;
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

export interface TeamMember {
  id: string;
  userId: string;
  email: string;
  displayName?: string | null;
  memberRole: MemberRole;
  status: MemberStatus;
  lastLogin?: string | null;
  createdAt?: string | null;
  memberKind?: 'managed' | 'independent';
  /** Invitation model used. 'owner_to_accountant' = Business Owner invited a
   *  professional who keeps their own CAPOT account (client relationship).
   *  Null for legacy managed subusers. */
  inviteMode?: 'team_member' | 'owner_to_accountant' | null;
}

export interface ClientPermissionAssignment {
  clientId: string;
  clientName?: string | null;
  permissions: Record<string, boolean>;
}

export interface AccountMembership {
  isSubuser: boolean;
  ownerId?: string | null;
  ownerEmail?: string | null;
  memberRole?: MemberRole | null;
  status?: MemberStatus | null;
}

export interface InviteResult {
  userId: string | null;
  email: string;
  temporaryPassword: string | null;
  existingUser: boolean;
  invitationPending?: boolean;
}


// ---------------------------------------------------------------------------
// Invoice templates — billing / e-invoice / SOA branding & layout
// ---------------------------------------------------------------------------
export type TemplateDocType = 'billing' | 'e-invoice' | 'soa';

export interface InvoiceTemplate {
  id: string;
  name: string;                 // user-visible, e.g. "Standard Blue", "My Brand"
  docType: TemplateDocType;     // which document type this template applies to
  builtin?: boolean;            // built-in templates cannot be deleted
  // Branding
  primaryColor: string;         // header band / accent, hex
  secondaryColor: string;       // totals band, hex
  fontFamily?: 'helvetica' | 'times' | 'courier';
  logoDataUrl?: string;         // optional uploaded logo (data URL)
  showLogo?: boolean;
  // Document labels & content
  documentTitle: string;        // e.g. "INVOICE", "STATEMENT OF ACCOUNT", "E-INVOICE"
  companyNameOverride?: string; // defaults to business profile tradeName
  tagline?: string;
  termsAndConditions: string;   // multi-line, printed at bottom
  paymentInstructions?: string; // overrides business profile GCash/Maya/bank
  footerNote?: string;          // e.g. "This is a system-generated e-invoice."
  // Field toggles
  showSellerTin?: boolean;
  showSellerAddress?: boolean;
  showBuyerTin?: boolean;
  showBuyerAddress?: boolean;
  showVatBreakdown?: boolean;
  showWithholding?: boolean;
  showPaymentInstructions?: boolean;
  showQrPlaceholder?: boolean;  // reserved for BIR e-invoice QR (delivery method)
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// E-Invoice — structured, line-item invoice that feeds BIR EIS.
// Distinct from BillingInvoice (which is a demand-for-payment doc, NOT EIS).
// ---------------------------------------------------------------------------
export interface EInvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
  vatType: 'VATable' | 'VAT Exempt' | 'Zero-Rated';
  discount?: number;            // absolute amount
}

export interface EInvoice {
  id: string;
  clientId: string;
  invoiceNo: string;            // ATP permit series number
  date: string;                 // YYYY-MM-DD
  dueDate?: string;
  // Seller (from business profile, snapshot at creation)
  sellerName: string;
  sellerTin: string;
  sellerBranchCode?: string;
  sellerAddress?: string;
  sellerEmail?: string;
  // Buyer
  buyerName: string;
  buyerTin: string;
  buyerAddress?: string;
  buyerEmail?: string;
  // Lines & totals
  lineItems: EInvoiceLineItem[];
  subtotal: number;
  discountTotal: number;
  vatableSales: number;
  zeroRatedSales: number;
  exemptSales: number;
  outputVat: number;            // 12% of vatable net
  withholdingTax?: number;      // total withheld (if any)
  amountDue: number;            // grand total
  netPayable?: number;          // amountDue − withholding
  currency: string;             // PHP
  paymentTerms?: string;
  remarks?: string;
  templateId?: string;
  status: 'Draft' | 'Issued' | 'Paid' | 'Cancelled';
  deliveryMethod?: 'email' | 'online_viewing' | 'qr_code' | 'mobile_app' | 'web_platform';
  deliveredAt?: string;
  // EIS linkage — only e-invoices feed EIS
  eisUniqueId?: string;
  eisStatus?: 'queued' | 'submitted' | 'accepted' | 'rejected' | 'cancelled';
  eisAckCode?: string;
  eisSubmittedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// Statement of Account (SOA) — generated from billing invoices; NOT for EIS.
// ---------------------------------------------------------------------------
export interface SoaLine {
  date: string;
  reference: string;             // invoice no / OR no
  description: string;
  debit: number;                 // amount billed (increases balance)
  credit: number;                // payment applied (decreases balance)
  balance: number;               // running balance after this line
}

export interface SoaRecord {
  id: string;
  clientId: string;
  clientName: string;
  clientTin?: string;
  clientAddress?: string;
  periodFrom: string;            // YYYY-MM-DD
  periodTo: string;
  openingBalance: number;
  lines: SoaLine[];
  closingBalance: number;
  templateId?: string;
  generatedAt: string;
}
