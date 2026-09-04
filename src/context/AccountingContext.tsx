import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Client, BusinessProfile, DatSelection } from '../types';
import { supabase } from '../lib/supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './AuthContext';
import { handleSupabaseError, OperationType } from '../lib/supabaseUtils';
import { syncGeneralLedger, syncCashDisbursementsJournal } from '../lib/glPosting';

interface AccountingContextType {
  clients: Record<string, Client>;
  currentClientId: string | null;
  currentClient: Client | null;
  businessProfile: BusinessProfile | null;
  // The id of the "own business" pseudo-client, scoped to the current user.
  // Use this instead of the old hardcoded 'client_owner' literal.
  ownerClientId: string | null;
  isDarkMode: boolean;
  isSidebarCollapsed: boolean;
  activePage: string | null;
  currentDat: DatSelection | null;
  historyTab: string;
  birFormTab: string;
  toastMsg: string | null;
  isSyncing: boolean;
  syncError: string | null;
  syncData: () => Promise<void>;

  setDarkMode: (value: boolean) => void;
  setSidebarCollapsed: (value: boolean) => void;
  navigateToPage: (page: string | null) => void;
  setHistoryTab: (tab: string) => void;
  setBirFormTab: (tab: string) => void;
  setCurrentClientId: (id: string) => void;
  setCurrentDat: (dat: DatSelection | null) => void;

  saveClient: (id: string, clientData: Client) => Promise<void>;
  saveClientProfile: (id: string, profile: Partial<Client>) => Promise<void>;
  saveTaxDeadlines: (deadlines: any[]) => Promise<void>;
  saveAssetLapsingSchedule: (entries: any[]) => Promise<void>;
  saveFinancialReportSnapshot: (reportType: 'P&L' | 'Balance Sheet' | 'Cash Flow', data: any) => Promise<void>;
  savePurchase: (id: string, purchase: any) => Promise<void>;
  deletePurchase: (id: string) => Promise<void>;
  saveSale: (id: string, sale: any) => Promise<void>;
  saveCoaColumns: (columns: any[]) => Promise<void>;
  saveCoaAccounts: (accounts: any[], format?: 'numeric' | 'alphanumeric') => Promise<void>;
  saveJournalColumn: (...args: any[]) => Promise<void>;
  saveJournalColumns: (...args: any[]) => Promise<void>;
  saveJournalEntry: (...args: any[]) => Promise<void>;
  saveJournalEntries: (...args: any[]) => Promise<void>;
  deleteJournalColumn: (...args: any[]) => Promise<void>;
  deleteJournalEntry: (...args: any[]) => Promise<void>;
  saveJournalVoucher: (clientId: string, voucher: any, gjEntries?: any[]) => Promise<void>;
  deleteJournalVoucher: (clientId: string, voucherId: string) => Promise<void>;
  saveInventoryColumn: (column: any) => Promise<void>;
  deleteInventoryColumn: (columnId: string) => Promise<void>;
  saveInventoryItem: (item: any) => Promise<void>;
  deleteInventoryItem: (itemId: string) => Promise<void>;
  saveInventoryMovement: (movement: any) => Promise<void>;
  saveTinEntry: (entry: any, partyType: 'customer' | 'supplier') => Promise<void>;
  deleteTinEntry: (id: string, partyType: 'customer' | 'supplier') => Promise<void>;
  saveBillingInvoice: (id: string, invoice: any) => Promise<void>;
  deleteBillingInvoice: (id: string) => Promise<void>;
  addClient: (name: string) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  saveBusinessProfile: (profile: BusinessProfile) => Promise<void>;
  saveFolder: (folder: any) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  saveFile: (file: any) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  showToast: (msg: string) => void;

  // Device adaptations support
  activeDevice: 'mobile' | 'tablet' | 'desktop';
}

const AccountingContext = createContext<AccountingContextType | undefined>(undefined);

// clients.id is a single global primary key (not scoped by user_id), so a
// shared literal like 'client_owner' would only ever be usable by one user
// in the whole database - RLS blocks everyone else from claiming it. Scope
// the "owner" client's id to the user themselves instead.
const ownerClientId = (userId: string) => `client_owner_${userId}`;

const defaultBusinessProfile = (name: string): BusinessProfile => ({
  id: name, // placeholder, immediately overwritten with user.id by the caller
  name,
  tin: '000-000-000-000',
  taxpayerClassification: 'Individual',
  registeredName: name,
  lastName: '',
  firstName: '',
  middleName: '',
  tradeName: 'General Trade/Services',
  substreet: '',
  street: 'Main Street',
  barangay: 'Barangay 1',
  district: 'District 1',
  city: 'Metro Manila',
  zipCode: '1000',
  rdoCode: '043B',
  accountingType: 'Calendar',
  fiscalMonthEnd: 12,
});

const buildMatchingClient = (profileData: BusinessProfile, existing: Client | undefined, ownerId: string): Client =>
  ({
    id: ownerId,
    name: profileData.name,
    tin: profileData.tin || '',
    taxpayerClassification: profileData.taxpayerClassification || '',
    registeredName: profileData.registeredName || profileData.name,
    lastName: profileData.lastName || '',
    firstName: profileData.firstName || '',
    middleName: profileData.middleName || '',
    tradeName: profileData.tradeName || '',
    substreet: profileData.substreet || '',
    street: profileData.street || '',
    barangay: profileData.barangay || '',
    district: profileData.district || '',
    city: profileData.city || '',
    zipCode: profileData.zipCode || '',
    rdoCode: profileData.rdoCode || '',
    phone: profileData.phone || existing?.phone || '',
    email: profileData.email || existing?.email || '',
    category: profileData.category || existing?.category || 'private',
    hasMultipleBusinessLines: profileData.hasMultipleBusinessLines ?? existing?.hasMultipleBusinessLines ?? false,
    accountingType: profileData.accountingType || 'Calendar',
    fiscalMonthEnd: profileData.fiscalMonthEnd || 12,
    tinLibrary: existing?.tinLibrary || { customers: [], suppliers: [] },
    sales: existing?.sales || [],
    purchases: existing?.purchases || [],
    expenses: existing?.expenses || [],
    folders: existing?.folders || [
      { id: 'folder_revenue', name: 'Revenue', isDefault: true, type: 'revenue' },
      { id: 'folder_expense', name: 'Expense', isDefault: true, type: 'expense' },
    ],
    files: existing?.files || [],
    payableInvoices: existing?.payableInvoices || [],
    taxDeadlines: existing?.taxDeadlines || [],
  }) as unknown as Client;


/**
 * Normalized persistence bridge.
 *
 * The UI still works with the existing Client aggregate so components do not
 * all need to be rewritten at once. Supabase stores transactional entities in
 * their own tables, while this bridge hydrates the existing Client aggregate
 * expected by the UI. No runtime persistence depends on `clients.data`.
 */
const normalizedClientKeys = new Set([
  'sales', 'purchases', 'accounts', 'coaColumns',
  'crjColumns', 'crjEntries', 'cdjColumns', 'cdjEntries', 'pjColumns', 'pjEntries',
  'sjColumns', 'sjEntries', 'gjColumns', 'gjEntries', 'journalVouchers', 'purchaseOrders', 'receivingReports',
  'payableInvoices', 'inventoryItems', 'inventoryMovements', 'inventoryColumns',
  'folders', 'files', 'taxDeadlines', 'bankAccounts',
  'assetLapsingSchedule', 'billingInvoices', 'tinLibrary', 'plData', 'bsData', 'cfData'
]);


const rowDate = (value: any) => value ? String(value).slice(0, 10) : '';
const strId = (value: any) => String(value);

// Supabase/PostgREST errors are not guaranteed to pass `instanceof Error` in
// every browser/bundler combination.  String(error) therefore sometimes
// becomes the useless "[object Object]" message shown by the sync screen.
// Keep the actual API details so connection/schema/RLS problems are visible.
const formatSupabaseError = (error: unknown): string => {
  if (error instanceof Error && error.message) return error.message;

  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    const parts = [
      typeof e.message === 'string' ? e.message : '',
      typeof e.code === 'string' ? `code ${e.code}` : '',
      typeof e.details === 'string' ? e.details : '',
      typeof e.hint === 'string' ? `Hint: ${e.hint}` : '',
    ].filter(Boolean);
    if (parts.length) return parts.join(' — ');

    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown Supabase error';
    }
  }

  return String(error);
};

const base64ToUint8Array = (value: string) => { const binary = atob(value); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i); return bytes; };
const chunk = <T,>(items: T[], size = 200): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const purchasesToExpenses = (purchases: any[] = []) => purchases.map((p:any) => ({
  id: Number(p.id) || p.id,
  date: rowDate(p.date),
  amount: Number(p.amount || 0),
  category: p.accountTitle || p.expenseType || '',
  description: p.transactionDetails || p.invoiceNo || p.supplierName || ''
}));

const OPTIONAL_NORMALIZED_TABLES = new Set([
  'payable_invoice_items',
]);

const isMissingTableError = (error: any) =>
  error?.code === 'PGRST205' || error?.code === '42P01' ||
  /could not find the table .* in the schema cache/i.test(String(error?.message || ''));

// These child tables are part of the normalized schema but may be absent in
// older Supabase projects. A missing optional table must not prevent the
// application from loading the rest of the client's normalized data.
const loadNormalizedTable = async (table: string, clientId: string) => {
  const response = await supabase.from(table).select('*').eq('client_id', clientId);
  if (response.error && OPTIONAL_NORMALIZED_TABLES.has(table) && isMissingTableError(response.error)) {
    // Optional normalized child table is absent in this Supabase project.
    // Treat it as an empty collection without flooding the console on every
    // sync/load cycle.
    return { data: [], error: null };
  }
  return response;
};

const loadNormalizedClient = async (clientId: string): Promise<Partial<Client>> => {
  const [purchases, sales, coaColumns, coaAccounts, journalColumns, journalEntries,
    journalVouchers, journalVoucherLines, purchaseOrders, receivingReports,
    payableInvoices, payableInvoiceItems, inventoryColumns, inventoryItems,
    inventoryMovements, folders, files, tinEntries, taxDeadlines, bankAccounts,
    assetLapsingSchedule, billingInvoices, snapshots] = await Promise.all([
      supabase.from('purchases').select('*').eq('client_id', clientId),
      supabase.from('sales').select('*').eq('client_id', clientId),
      supabase.from('coa_columns').select('*').eq('client_id', clientId),
      supabase.from('coa_accounts').select('*').eq('client_id', clientId),
      supabase.from('journal_columns').select('*').eq('client_id', clientId),
      supabase.from('journal_entries').select('*').eq('client_id', clientId),
      supabase.from('journal_vouchers').select('*').eq('client_id', clientId),
      supabase.from('journal_voucher_lines').select('*').eq('client_id', clientId),
      supabase.from('purchase_orders').select('*').eq('client_id', clientId),
      supabase.from('receiving_reports').select('*').eq('client_id', clientId),
      supabase.from('payable_invoices').select('*').eq('client_id', clientId),
      loadNormalizedTable('payable_invoice_items', clientId),
      supabase.from('inventory_columns').select('*').eq('client_id', clientId),
      supabase.from('inventory_items').select('*').eq('client_id', clientId),
      supabase.from('inventory_movements').select('*').eq('client_id', clientId),
      supabase.from('app_folders').select('*').eq('client_id', clientId),
      supabase.from('app_files').select('*').eq('client_id', clientId),
      supabase.from('tin_entries').select('*').eq('client_id', clientId),
      supabase.from('tax_deadlines').select('*').eq('client_id', clientId),
      supabase.from('bank_accounts').select('*').eq('client_id', clientId),
      supabase.from('asset_lapsing_schedule').select('*').eq('client_id', clientId),
      supabase.from('billing_invoices').select('*').eq('client_id', clientId),
      supabase.from('financial_report_snapshots').select('*').eq('client_id', clientId),
    ]);

  const responses = [purchases, sales, coaColumns, coaAccounts, journalColumns, journalEntries,
    journalVouchers, journalVoucherLines, purchaseOrders, receivingReports,
    payableInvoices, payableInvoiceItems, inventoryColumns, inventoryItems,
    inventoryMovements, folders, files, tinEntries, taxDeadlines, bankAccounts,
    assetLapsingSchedule, billingInvoices, snapshots];
  const responseNames = [
    'purchases', 'sales', 'coa_columns', 'coa_accounts', 'journal_columns',
    'journal_entries', 'journal_vouchers', 'journal_voucher_lines', 'purchase_orders',
    'receiving_reports', 'payable_invoices',
    'payable_invoice_items', 'inventory_columns', 'inventory_items', 'inventory_movements',
    'app_folders', 'app_files', 'tin_entries', 'tax_deadlines', 'bank_accounts',
    'asset_lapsing_schedule', 'billing_invoices', 'financial_report_snapshots',
  ];
  const failedResponseIndex = responses.findIndex((r: any) => r.error);
  if (failedResponseIndex >= 0) {
    const failed = responses[failedResponseIndex] as any;
    const table = responseNames[failedResponseIndex] || 'normalized data';
    const error = failed.error;
    const formatted = formatSupabaseError(error);
    const wrapped = new Error(`Failed to load ${table}: ${formatted}`);
    Object.assign(wrapped, { cause: error, table });
    throw wrapped;
  }
  const rows = responses.map((r: any) => r.data || []);
  const [pRows,sRows,ccRows,caRows,jcRows,jeRows,jvRows,jvlRows,poRows,rrRows,piRows,piiRows,icRows,iiRows,imRows,fRows,fileRows,tinRows,tdRows,baRows,alsRows,biRows,snapshotRows] = rows;
  const piItemsBy = new Map<string, any[]>();
  piiRows.forEach((r:any) => { const a=piItemsBy.get(r.payable_invoice_id)||[]; a.push({ itemCode:r.item_code||'', description:r.description||'', qty:Number(r.qty||0), unitPrice:Number(r.unit_price||0) }); piItemsBy.set(r.payable_invoice_id,a); });
  const linesByVoucher = new Map<string, any[]>();
  jvlRows.forEach((r:any) => { const a=linesByVoucher.get(r.journal_voucher_id)||[]; a.push({ id:strId(r.id), accountId:r.account_id||'', accountName:r.account_name||'', debit:Number(r.debit||0), credit:Number(r.credit||0) }); linesByVoucher.set(r.journal_voucher_id,a); });

  const result: Partial<Client> = {
    purchases: pRows.map((r:any) => ({ id:Number(r.id) || r.id, datMonthYear:r.dat_month_year||'', date:rowDate(r.date), paymentMethod:r.payment_method||'', checkNumber:r.check_number, bankName:r.bank_name, invoiceNo:r.invoice_no||'', supplierName:r.supplier_name||'', supplierAddress:r.supplier_address||'', supplierTin:r.supplier_tin||'', amount:Number(r.amount||0), vatType:r.vat_type||'', expenseType:r.expense_type||'', accountTitle:r.account_title||'', transactionDetails:r.transaction_details, inputTax:Number(r.input_tax||0), attachment:r.attachment_name ? { name:r.attachment_name, type:r.attachment_type||'', originalType:r.attachment_original_type||r.attachment_type||'', size:Number(r.attachment_size||0), originalSize:Number(r.attachment_original_size||r.attachment_size||0), compression:r.attachment_compression as any, content:'', storagePath:r.attachment_storage_path } : undefined, withholdingOption:r.withholding_option as any, atcCode:r.atc_code, whtRate:r.wht_rate == null ? null : Number(r.wht_rate), whtAmount:r.wht_amount == null ? undefined : Number(r.wht_amount) })),
    sales: sRows.map((r:any) => ({ id:Number(r.id)||r.id, datMonthYear:r.dat_month_year||'', date:rowDate(r.date), ref:r.ref||'', paymentType:r.payment_type||'', buyerTin:r.buyer_tin||'', buyerName:r.buyer_name||'', buyerAddress:r.buyer_address||'', vatType:r.vat_type||'', amount:Number(r.amount||0), netOfVat:Number(r.net_of_vat||0), outputTax:Number(r.output_tax||0), incomeType:r.income_type||'', desc:r.description||'' })),
     expenses: purchasesToExpenses(pRows),
    coaColumns: ccRows.map((r:any) => ({ id:strId(r.id), name:r.name, isSystem:!!r.is_system })),
    accounts: caRows.map((r:any) => ({ id:strId(r.id), name:r.name, type:r.type, normalSide:r.normal_side, parentId:r.parent_id, hidden:!!r.hidden, openingBalance:Number(r.opening_balance||0), ...(r.custom_values||{}) })),
    crjColumns: jcRows.filter((r:any)=>r.journal_type==='CRJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    cdjColumns: jcRows.filter((r:any)=>r.journal_type==='CDJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    pjColumns: jcRows.filter((r:any)=>r.journal_type==='PJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    sjColumns: jcRows.filter((r:any)=>r.journal_type==='SJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    gjColumns: jcRows.filter((r:any)=>r.journal_type==='GJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    crjEntries: jeRows.filter((r:any)=>r.journal_type==='CRJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    cdjEntries: jeRows.filter((r:any)=>r.journal_type==='CDJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    pjEntries: jeRows.filter((r:any)=>r.journal_type==='PJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    sjEntries: jeRows.filter((r:any)=>r.journal_type==='SJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    gjEntries: jeRows.filter((r:any)=>r.journal_type==='GJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    journalVouchers: jvRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),reference:r.reference||'',memo:r.memo||'',lines:linesByVoucher.get(r.id)||[]})),
    purchaseOrders: poRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),supplierId:r.supplier_id||'',supplierName:r.supplier_name||'',items:[],totalAmount:Number(r.total_amount||0),status:r.status})),
    receivingReports: rrRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),poId:r.po_id||'',supplierName:r.supplier_name||'',items:[],totalAmount:Number(r.total_amount||0),receivedBy:r.received_by||''})),
    payableInvoices: piRows.map((r:any)=>({id:strId(r.id),invoiceNumber:r.invoice_number||'',date:rowDate(r.date),dueDate:rowDate(r.due_date),poId:r.po_id||undefined,rrId:r.rr_id||undefined,supplierId:r.supplier_id||'',supplierName:r.supplier_name||'',items:piItemsBy.get(r.id)||[],subtotal:Number(r.subtotal||0),vatAmount:Number(r.vat_amount||0),isVatable:!!r.is_vatable,withholdingTaxId:r.withholding_tax_id||undefined,whtAmount:r.wht_amount==null?undefined:Number(r.wht_amount),totalAmount:Number(r.total_amount||0),status:r.status,discrepancyDetails:r.discrepancy_details||undefined,appliedPrepayments:r.applied_prepayments==null?undefined:Number(r.applied_prepayments)})),
    inventoryColumns: icRows.map((r:any)=>({id:strId(r.id),label:r.label})),
    inventoryItems: iiRows.map((r:any)=>({id:strId(r.id),code:r.code,name:r.name,sku:r.sku||'',description:r.description,category:r.category,unitOfMeasure:r.unit_of_measure,costPrice:Number(r.cost_price||0),sellingPrice:Number(r.selling_price||0),stockLevel:Number(r.stock_level||0),reorderPoint:Number(r.reorder_point||0),location:r.location,customFields:r.custom_fields||{}})),
    inventoryMovements: imRows.map((r:any)=>({id:strId(r.id),itemId:r.item_id||'',itemName:r.item_name||'',itemCode:r.item_code||'',date:rowDate(r.date),type:r.type,qty:Number(r.qty||0),unitCost:Number(r.unit_cost||0),totalValue:Number(r.total_value||0),reference:r.reference||'',notes:r.notes})),
    folders: fRows.map((r:any)=>({id:strId(r.id),name:r.name,isDefault:!!r.is_default,type:r.type||undefined})),
    files: fileRows.map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,size:Number(r.size||0),uploadedAt:r.uploaded_at,folderId:r.folder_id||'',storagePath:r.storage_path,description:r.description||undefined})),
    tinLibrary: { customers:tinRows.filter((r:any)=>r.party_type==='customer').map((r:any)=>({id:Number(r.id)||r.id,tin:r.tin,name:r.name,address:r.address})), suppliers:tinRows.filter((r:any)=>r.party_type==='supplier').map((r:any)=>({id:Number(r.id)||r.id,tin:r.tin,name:r.name,address:r.address})) },
    taxDeadlines: tdRows.map((r:any)=>({id:strId(r.id),formType:r.form_type,title:r.title,period:r.period,dueDate:rowDate(r.due_date),status:r.status,taxStatus:r.tax_status||undefined,amountDue:r.amount_due==null?undefined:Number(r.amount_due),dateFiled:rowDate(r.date_filed)||undefined,datePaid:rowDate(r.date_paid)||undefined,referenceNo:r.reference_no||undefined,confirmationNo:r.confirmation_no||undefined,notes:r.notes||undefined})),
    bankAccounts: baRows.map((r:any)=>({id:strId(r.id),bankName:r.bank_name,accountNumber:r.account_number,balance:Number(r.balance||0)})),
    assetLapsingSchedule: alsRows.map((r:any)=>({id:strId(r.id),datePurchased:rowDate(r.date_purchased),invoiceNo:r.invoice_no||'',description:r.description,cost:Number(r.cost||0),usefulLifeYears:Number(r.useful_life_years||0),salvageValue:Number(r.salvage_value||0)})),
    billingInvoices: biRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),dueDate:rowDate(r.due_date),invoiceNo:r.invoice_no,customerTin:r.customer_tin||'',customerName:r.customer_name||'',customerAddress:r.customer_address||'',vatType:r.vat_type||'',amount:Number(r.amount||0),netOfVat:Number(r.net_of_vat||0),outputTax:Number(r.output_tax||0),description:r.description||undefined,status:r.status,paymentType:r.payment_type||undefined,datePaid:rowDate(r.date_paid)||undefined,isRecurring:!!r.is_recurring,recurrenceFrequency:r.recurrence_frequency||undefined,nextBillingDate:rowDate(r.next_billing_date)||undefined,parentInvoiceId:r.parent_invoice_id||undefined})),
  };

  snapshotRows.forEach((r:any)=>{
    if (r.report_type==='P&L') (result as any).plData = r.data;
    if (r.report_type==='Balance Sheet') (result as any).bsData = r.data;
    if (r.report_type==='Cash Flow') (result as any).cfData = r.data;
  });
  return result;
};

const persistClientShell = async (client: Client, userId: string) => {
  const row = {
    id: client.id, user_id: userId, name: client.name || '', tin: client.tin || null,
    taxpayer_classification: client.taxpayerClassification || null,
    registered_name: client.registeredName || null, last_name: client.lastName || null,
    first_name: client.firstName || null, middle_name: client.middleName || null,
    trade_name: client.tradeName || null, substreet: client.substreet || null,
    street: client.street || null, barangay: client.barangay || null, district: client.district || null,
    city: client.city || null, zip_code: client.zipCode || null, rdo_code: client.rdoCode || null,
    phone: client.phone || null, email: client.email || null, category: client.category || 'private',
    has_multiple_business_lines: !!client.hasMultipleBusinessLines,
    accounting_type: client.accountingType || 'Calendar', fiscal_month_end: client.fiscalMonthEnd || 12,
    coa_format: client.coaFormat || 'numeric', updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('clients').upsert(row, { onConflict: 'id' });
  if (error) throw error;
};

// Legacy aggregate synchronization remains defined below only as a compatibility
// reference during migration. Runtime paths must use targeted normalized writes.
type AccountingProviderProps = {
    children: React.ReactNode;
};

export function AccountingProvider({
    children,
}: AccountingProviderProps) {
  const { user, userRole } = useAuth();
  const [clients, setClients] = useState<Record<string, Client>>({});
  const [currentClientId, setCurrentClientId] = useState<string | null>(null);
  const [businessProfile, setBusinessProfile] = useState<BusinessProfile | null>(null);
  const [isDarkMode, setDarkMode] = useState(false);
  // Guards against writing the default isDarkMode/isSidebarCollapsed state
  // back to Supabase before the saved values have actually been loaded
  // from the 'profiles' table (see effects below).
  const [cloudPrefsLoaded, setCloudPrefsLoaded] = useState(false);
  // The active client id loaded from the 'profiles' table for this user,
  // used once (as a one-time restore) once both it and the client list
  // have finished loading - see the restore effect below.
  const [savedActiveClientId, setSavedActiveClientId] = useState<string | null>(null);
  const [isSidebarCollapsed, setSidebarCollapsed] = useState(false);
  // activePage is derived from the URL route, so every page has its own
  // real URL: browser back/forward and refresh-to-stay-there both work.
  // '/' (or no path) means no page is active (Dashboard shows).
  const location = useLocation();
  const navigate = useNavigate();
  const activePage = (() => {
    const path = location.pathname.replace(/^\/+/, '');
    return path === '' ? null : decodeURIComponent(path);
  })();
  const [currentDat, setCurrentDat] = useState<DatSelection | null>(null);
  const [historyTab, setHistoryTab] = useState('expenses');
  const [birFormTab, setBirFormTab] = useState('tracker');
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  // Device Adaptations state
  const [activeDevice, setActiveDevice] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');

  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < 768) {
        setActiveDevice('mobile');
      } else if (width < 1024) {
        setActiveDevice('tablet');
      } else {
        setActiveDevice('desktop');
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  const [isReady, setIsReady] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);

  const syncData = async () => {
    if (!user || !isReady) return;
    setIsSyncing(true);

    try {
      const { data, error } = await supabase.from('clients').select('*').eq('user_id', user.id);
      if (error) throw error;
      const cloudClients: Record<string, Client> = {};
      for (const row of data || []) {
        const normalized = await loadNormalizedClient(row.id);
        cloudClients[row.id] = {
          id: row.id, name: row.name || 'Client',
          tin: row.tin, taxpayerClassification: row.taxpayer_classification, registeredName: row.registered_name,
          lastName: row.last_name, firstName: row.first_name, middleName: row.middle_name, tradeName: row.trade_name,
          substreet: row.substreet, street: row.street, barangay: row.barangay, district: row.district, city: row.city,
          zipCode: row.zip_code, rdoCode: row.rdo_code, phone: row.phone, email: row.email, category: row.category,
          hasMultipleBusinessLines: row.has_multiple_business_lines, accountingType: row.accounting_type,
          fiscalMonthEnd: row.fiscal_month_end, coaFormat: row.coa_format,
          tinLibrary: normalized.tinLibrary ?? {customers:[], suppliers:[]},
          sales: normalized.sales ?? [], purchases: normalized.purchases ?? [], expenses: purchasesToExpenses(normalized.purchases ?? []),
          ...(normalized as any)
        } as Client;
      }
      setClients(cloudClients);
      showToast('Cloud sync complete');
    } catch (e) {
      console.error('Manual sync failed', e);
      showToast('Sync failed. Check console for details.');
    } finally {
      setIsSyncing(false);
    }
  };

  // Reset the "loaded" guard whenever the logged-in user changes (login,
  // logout, or switching accounts), so we re-load that user's prefs before
  // allowing any writes back to Supabase.
  useEffect(() => {
    setCloudPrefsLoaded(false);
  }, [user?.id]);

  // Load dark mode + sidebar-collapsed prefs from cloud.
  // This must finish (and set cloudPrefsLoaded) BEFORE the sync effects
  // below are allowed to write anything, otherwise the default state
  // (isDarkMode=false) gets written to Supabase first and clobbers the
  // saved value — which is what was causing dark mode to revert on refresh.
  useEffect(() => {
    let cancelled = false;

    const loadCloudPrefs = async () => {
      if (user && isReady) {
        try {
          const { data, error } = await supabase
            .from('profiles')
            .select('is_dark_mode, sidebar_collapsed, active_client_id')
            .eq('id', user.id)
            .maybeSingle();
          if (error) throw error;
          if (!cancelled) {
            if (data && typeof data.is_dark_mode === 'boolean') {
              setDarkMode(data.is_dark_mode);
            }
            if (data && typeof data.sidebar_collapsed === 'boolean') {
              setSidebarCollapsed(data.sidebar_collapsed);
            }
            if (data && typeof data.active_client_id === 'string') {
              setSavedActiveClientId(data.active_client_id);
            }
          }
        } catch (e) {
          console.error('Failed to load theme/sidebar prefs', e);
        } finally {
          if (!cancelled) setCloudPrefsLoaded(true);
        }
      }
    };
    loadCloudPrefs();

    return () => {
      cancelled = true;
    };
  }, [user, isReady]);

  // Restore the last-active client/profile once we know both what was saved
  // (from the 'profiles' table, once cloudPrefsLoaded) and what clients
  // actually exist. Gating on both - rather than picking as soon as clients
  // arrive - avoids the previous bug where an arbitrary client got picked
  // (because the saved preference hadn't loaded yet), which looked like the
  // active client and the owner's own business profile randomly swapping
  // places on every refresh.
  useEffect(() => {
    if (!currentClientId && cloudPrefsLoaded && Object.keys(clients).length > 0) {
      const ownerId = user ? ownerClientId(user.id) : null;
      const availableClientIds = Object.keys(clients);
      const nonOwnerClientId = availableClientIds.find((id) => id !== ownerId);
      const restoredId =
        savedActiveClientId && clients[savedActiveClientId]
          ? savedActiveClientId
          : (nonOwnerClientId || availableClientIds[0]);
      setCurrentClientId(restoredId);
    }
  }, [clients, cloudPrefsLoaded, savedActiveClientId, currentClientId]);

  // Sync the active client/profile selection to the cloud so it follows the
  // user across devices, same as the dark mode / sidebar prefs below.
  useEffect(() => {
    if (user && isReady && cloudPrefsLoaded && currentClientId) {
      const syncPref = async () => {
        try {
          const { error } = await supabase
            .from('profiles')
            .upsert(
              { id: user.id, active_client_id: currentClientId, updated_at: new Date().toISOString() },
              { onConflict: 'id' }
            );
          if (error) throw error;
        } catch (e) {
          console.error('Failed to sync active client pref', e);
        }
      };
      syncPref();
    }
  }, [currentClientId, user, isReady, cloudPrefsLoaded]);

  // Sync dark mode class and cloud pref
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.classList.remove('dark');
    }

    // Only write to Supabase once we've loaded the saved value for this
    // user - otherwise we'd overwrite it with the default before it's read.
    if (user && isReady && cloudPrefsLoaded) {
      const syncPref = async () => {
        try {
          const { error } = await supabase
            .from('profiles')
            .upsert({ id: user.id, is_dark_mode: isDarkMode, updated_at: new Date().toISOString() }, { onConflict: 'id' });
          if (error) throw error;
        } catch (e) {
          console.error('Failed to sync theme pref', e);
        }
      };
      syncPref();
    }
  }, [isDarkMode, user, isReady, cloudPrefsLoaded]);

  // Sync sidebar-collapsed pref to cloud
  useEffect(() => {
    if (user && isReady && cloudPrefsLoaded) {
      const syncPref = async () => {
        try {
          const { error } = await supabase
            .from('profiles')
            .upsert(
              { id: user.id, sidebar_collapsed: isSidebarCollapsed, updated_at: new Date().toISOString() },
              { onConflict: 'id' }
            );
          if (error) throw error;
        } catch (e) {
          console.error('Failed to sync sidebar pref', e);
        }
      };
      syncPref();
    }
  }, [isSidebarCollapsed, user, isReady, cloudPrefsLoaded]);

  // Real-time Supabase Sync (Supabase is the single source of truth — no local database)
  useEffect(() => {
    if (!user) {
      setIsReady(true);
      return;
    }

    setIsSyncing(true);
    setSyncError(null);

    let isTimedOut = false;
    let clientsChannel: RealtimeChannel | null = null;
    let bizChannel: RealtimeChannel | null = null;

    const timeout = setTimeout(() => {
      if (!isReady) {
        isTimedOut = true;
        setSyncError(
          'Connection timeout. Supabase is taking too long to respond. This usually happens if your project is paused or your internet is slow.'
        );
        setIsSyncing(false);
      }
    }, 12000);

    const mergeCloudClients = (cloudClients: Record<string, Client>) => {
      setClients(cloudClients);
      // Which client becomes active is decided by the dedicated restore
      // effect above, once the saved preference has also loaded - see there
      // for why that's not decided here.
    };

    const initClients = async () => {
      try {
        const { data, error } = await supabase.from('clients').select('*').eq('user_id', user.id);
        if (isTimedOut) return;
        if (error) throw error;

        clearTimeout(timeout);
        const cloudClients: Record<string, Client> = {};
        for (const row of data || []) {
          const normalized = await loadNormalizedClient(row.id);
          cloudClients[row.id] = { id: row.id, name: row.name || 'Client',
            tin: row.tin, taxpayerClassification: row.taxpayer_classification, registeredName: row.registered_name,
            lastName: row.last_name, firstName: row.first_name, middleName: row.middle_name, tradeName: row.trade_name,
            substreet: row.substreet, street: row.street, barangay: row.barangay, district: row.district, city: row.city,
            zipCode: row.zip_code, rdoCode: row.rdo_code, phone: row.phone, email: row.email, category: row.category,
            hasMultipleBusinessLines: row.has_multiple_business_lines, accountingType: row.accounting_type,
            fiscalMonthEnd: row.fiscal_month_end, coaFormat: row.coa_format,
            tinLibrary: normalized.tinLibrary ?? {customers:[], suppliers:[]}, sales: normalized.sales ?? [], purchases: normalized.purchases ?? [], expenses: purchasesToExpenses(normalized.purchases ?? []), ...(normalized as any) } as Client;
        }
        mergeCloudClients(cloudClients);
        setIsSyncing(false);
        setIsReady(true);
        setSyncError(null);

        // Subscribe to the tenancy root and every normalized child table. A child
        // transaction changing does not update `clients`, so listening only to the
        // root would leave another device stale.
        const normalizedRealtimeTables = [
          'purchases','sales','coa_columns','coa_accounts','journal_columns',
          'journal_entries','journal_vouchers','journal_voucher_lines','purchase_orders',
          'receiving_reports','payable_invoices',
          'inventory_columns','inventory_items','inventory_movements',
          'app_folders','app_files','tin_entries','tax_deadlines','bank_accounts',
          'asset_lapsing_schedule','billing_invoices','financial_report_snapshots'
        ];
        let reloadTimer: ReturnType<typeof setTimeout> | null = null;
        const scheduleClientReload = (clientId: string) => {
          if (reloadTimer) clearTimeout(reloadTimer);
          reloadTimer = setTimeout(async () => {
            try {
              const { data: row, error: rowError } = await supabase.from('clients').select('*').eq('id', clientId).eq('user_id', user.id).maybeSingle();
              if (rowError) throw rowError;
              if (!row) return;
              const normalized = await loadNormalizedClient(clientId);
              const hydrated = { id: row.id, name: row.name || 'Client',
                tin: row.tin, taxpayerClassification: row.taxpayer_classification, registeredName: row.registered_name,
                lastName: row.last_name, firstName: row.first_name, middleName: row.middle_name, tradeName: row.trade_name,
                substreet: row.substreet, street: row.street, barangay: row.barangay, district: row.district, city: row.city,
                zipCode: row.zip_code, rdoCode: row.rdo_code, phone: row.phone, email: row.email, category: row.category,
                hasMultipleBusinessLines: row.has_multiple_business_lines, accountingType: row.accounting_type,
                fiscalMonthEnd: row.fiscal_month_end, coaFormat: row.coa_format,
                tinLibrary: normalized.tinLibrary ?? {customers:[], suppliers:[]}, sales: normalized.sales ?? [], purchases: normalized.purchases ?? [], expenses: purchasesToExpenses(normalized.purchases ?? []),
                ...(normalized as any) } as Client;
              setClients(prev => ({ ...prev, [clientId]: hydrated }));
            } catch (e) { console.warn('Realtime normalized reload failed', e); }
          }, 150);
        };

        clientsChannel = supabase.channel(`normalized-${user.id}`)
          .on('postgres_changes', { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${user.id}` }, (payload) => {
            const clientId = String((payload.eventType === 'DELETE' ? payload.old : payload.new)?.id || '');
            if (!clientId) return;
            if (payload.eventType === 'DELETE') {
              setClients(prev => { const next = { ...prev }; delete next[clientId]; return next; });
            } else scheduleClientReload(clientId);
          });
        for (const table of normalizedRealtimeTables) {
          clientsChannel = clientsChannel.on('postgres_changes', { event: '*', schema: 'public', table,  }, (payload) => {
            const clientId = String((payload.eventType === 'DELETE' ? payload.old : payload.new)?.client_id || '');
            if (clientId) scheduleClientReload(clientId);
          });
        }
        clientsChannel.subscribe();
      } catch (error) {
        clearTimeout(timeout);
        if (isTimedOut) return;

        console.error('Sync error:', error);
        let msg = formatSupabaseError(error);

        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('rls') || msg.includes('42501')) {
          msg = 'Permission denied. Please ensure your Supabase Row Level Security policies are deployed and you are authorized.';
        } else if (msg.toLowerCase().includes('fetch')) {
          msg = 'Service unavailable. Check your internet connection.';
        }

        setSyncError(msg);
        setIsSyncing(false);
        setIsReady(true); // Allow skipping to local mode
      }
    };

    const initBizProfile = async () => {
      const { data, error } = await supabase
        .from('business_profiles')
        .select('data')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!error && data) {
        setBusinessProfile(data.data as BusinessProfile);
      } else {
        const defaultBiz = defaultBusinessProfile(
          (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'My Business Organization'
        );
        defaultBiz.id = user.id;
        setBusinessProfile(defaultBiz);
        await supabase
          .from('business_profiles')
          .upsert({ user_id: user.id, data: defaultBiz, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
          .then(({ error: upsertErr }) => {
            if (upsertErr) console.error('Auto-syncing default business_profile doc failed:', upsertErr);
          });
      }

      bizChannel = supabase
        .channel(`biz-profile-${user.id}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'business_profiles', filter: `user_id=eq.${user.id}` },
          (payload) => {
            if (payload.eventType !== 'DELETE') {
              setBusinessProfile((payload.new as any).data as BusinessProfile);
            }
          }
        )
        .subscribe();
    };

    initClients();
    initBizProfile();

    return () => {
      clearTimeout(timeout);
      if (clientsChannel) supabase.removeChannel(clientsChannel);
      if (bizChannel) supabase.removeChannel(bizChannel);
    };
  }, [user?.id]);

  // Sync Business Profile to the current user's owner client
  useEffect(() => {
    if (businessProfile && user) {
      const ownerId = ownerClientId(user.id);
      const existing = clients[ownerId];
      const needsSync =
        !existing ||
        existing.name !== businessProfile.name ||
        existing.tin !== businessProfile.tin ||
        existing.registeredName !== (businessProfile.registeredName || businessProfile.name);

      if (needsSync) {
        const matchingClient = buildMatchingClient(businessProfile, existing, ownerId);

        setClients((prev) => ({
          ...prev,
          [ownerId]: matchingClient,
        }));

        // NOTE: deliberately not defaulting currentClientId to ownerId here.
        // Picking the initial active client/profile is solely the job of the
        // dedicated restore effect above (which waits for the saved cloud
        // preference to load first). This effect also runs whenever
        // `clients` changes - including right after the app loads - so if it
        // *also* defaulted to ownerId whenever currentClientId was still
        // null, it would race the restore effect (both see the same stale
        // null value in the same commit) and unpredictably win, which is
        // what was causing the active client to keep getting reset back to
        // the business profile on every refresh.

        if (isReady) {
          persistClientShell(matchingClient, user.id).catch((error) => console.error('Auto-syncing owner client shell failed:', error));
        }
      }

      // Do not automatically delete a client merely because its name matches
      // the user's business profile. A real client can legitimately have the
      // same registered/trade name as the accountant's own business profile.
      // The owner profile is represented separately by ownerClientId(user.id);
      // deleting same-name client rows here previously caused legitimate
      // normalized client data (including purchases, COA, and journals) to be
      // removed from the tenancy root.
    }
  }, [businessProfile, clients, currentClientId, user, isReady]);

  const updateClientState = (clientId: string, patch: Partial<Client>) => {
    setClients(prev => ({
      ...prev,
      [clientId]: { ...prev[clientId], ...patch } as Client,
    }));
  };

  const resolveJournalArgs = (args: any[]) => {
    if (typeof args[0] === 'string' && ['CRJ', 'CDJ', 'PJ', 'SJ', 'GJ'].includes(args[0])) {
      return { clientId: currentClientId, journalType: args[0], payload: args[1] };
    }
    return { clientId: args[0] as string, journalType: args[1] as string, payload: args[2] };
  };

  const journalEntryRow = (clientId: string, journalType: string, entry: any) => {
    const values = entry?.values || {};
    const numberValues = Object.values(values).map(v => Number(String(v ?? '').replace(/,/g, ''))).filter(v => Number.isFinite(v));
    const debit = Number.isFinite(Number(values.debit)) ? Number(values.debit) : undefined;
    const credit = Number.isFinite(Number(values.credit)) ? Number(values.credit) : undefined;
    const totalDebit = debit ?? numberValues.reduce((sum, value) => sum + value, 0);
    const dateValue = values.date || values.entry_date || values.transaction_date || null;
    const description = values.particulars || values.description || values.memo || '';
    return {
      id: String(entry.id),
      client_id: clientId,
      journal_type: journalType,
      values,
      auto: !!entry.auto,
      auto_source: entry.autoSource || null,
      entry_date: dateValue || null,
      description: String(description || ''),
      total_debit: debit ?? null,
      total_credit: credit ?? null,
    };
  };

  const saveSale = async (id: string, sale: any) => {
    if (!user || !currentClientId) return;
    const row = {
      id: String(id), client_id: currentClientId, dat_month_year: sale.datMonthYear || null,
      date: sale.date || null, ref: sale.ref || null, payment_type: sale.paymentType || null,
      buyer_tin: sale.buyerTin || null, buyer_name: sale.buyerName || null,
      buyer_address: sale.buyerAddress || null, vat_type: sale.vatType || null,
      amount: Number(sale.amount || 0), net_of_vat: Number(sale.netOfVat || 0),
      output_tax: Number(sale.outputTax || 0), income_type: sale.incomeType || null,
      description: sale.desc || null,
    };
    const { error } = await supabase.from('sales').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const next = [...(clients[currentClientId]?.sales || []).filter((x: any) => String(x.id) !== String(id)), sale];
    updateClientState(currentClientId, { sales: next });
  };

  const saveCoaColumns = async (columns: any[]) => {
    if (!user || !currentClientId) return;
    const rows = columns.map(c => ({ id: String(c.id), client_id: currentClientId, name: c.name || '', is_system: !!c.isSystem }));
    const { data: existing, error: readError } = await supabase.from('coa_columns').select('id').eq('client_id', currentClientId);
    if (readError) throw readError;
    const keep = new Set(rows.map(r => r.id));
    const stale = (existing || []).map((r: any) => String(r.id)).filter(id => !keep.has(id));
    if (rows.length) { const { error } = await supabase.from('coa_columns').upsert(rows, { onConflict: 'id' }); if (error) throw error; }
    if (stale.length) { const { error } = await supabase.from('coa_columns').delete().eq('client_id', currentClientId).in('id', stale); if (error) throw error; }
    updateClientState(currentClientId, { coaColumns: columns });
  };

  const saveCoaAccounts = async (accounts: any[], format?: 'numeric' | 'alphanumeric') => {
    if (!user || !currentClientId) return;
    const rows = accounts.map(a => {
      const { id, name, type, normalSide, parentId, hidden, openingBalance, ...custom } = a;
      return { id: String(id), client_id: currentClientId, name: name || '', type: type || '', normal_side: normalSide || null, parent_id: parentId || null, hidden: !!hidden, opening_balance: Number(openingBalance || 0), custom_values: custom };
    });
    const { data: existing, error: readError } = await supabase.from('coa_accounts').select('id').eq('client_id', currentClientId);
    if (readError) throw readError;
    const keep = new Set(rows.map(r => r.id));
    const stale = (existing || []).map((r: any) => String(r.id)).filter(id => !keep.has(id));
    if (rows.length) { const { error } = await supabase.from('coa_accounts').upsert(rows, { onConflict: 'id' }); if (error) throw error; }
    if (stale.length) { const { error } = await supabase.from('coa_accounts').delete().eq('client_id', currentClientId).in('id', stale); if (error) throw error; }
    updateClientState(currentClientId, { accounts, ...(format ? { coaFormat: format } : {}) });
    if (format) {
      const { error } = await supabase.from('clients').update({ coa_format: format }).eq('id', currentClientId).eq('user_id', user.id);
      if (error) throw error;
    }
  };

  const saveJournalColumn = async (...args: any[]) => {
    if (!user) return;
    const { clientId, journalType, payload } = resolveJournalArgs(args);
    if (!clientId || !journalType || !payload) return;
    const row = { id: String(payload.id), client_id: clientId, journal_type: journalType, name: payload.name || '', type: payload.type || 'text', category: payload.category || 'None', is_system: !!payload.isSystem };
    const { error } = await supabase.from('journal_columns').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const key = `${String(journalType).toLowerCase()}Columns`;
    const existing = ((clients[clientId] as any)?.[key] || []).filter((c: any) => String(c.id) !== String(payload.id));
    updateClientState(clientId, { [key]: [...existing, payload] } as any);
  };

  const saveJournalColumns = async (...args: any[]) => {
    if (!user) return;
    let clientId: string | null;
    let journalType: string;
    let columns: any[];
    if (typeof args[0] === 'string' && ['CRJ', 'CDJ', 'PJ', 'GJ', 'SJ'].includes(args[0])) {
      clientId = currentClientId;
      journalType = args[0];
      columns = args[1] || [];
    } else {
      clientId = args[0];
      journalType = args[1];
      columns = args[2] || [];
    }
    if (!clientId) return;
    const rows = columns.map(c => ({ id: String(c.id), client_id: clientId, journal_type: journalType, name: c.name || '', type: c.type || 'text', category: c.category || 'None', is_system: !!c.isSystem }));
    const { data: existing, error: readError } = await supabase.from('journal_columns').select('id').eq('client_id', clientId).eq('journal_type', journalType);
    if (readError) throw readError;
    const keep = new Set(rows.map(r => r.id));
    const stale = (existing || []).map((r: any) => String(r.id)).filter(id => !keep.has(id));
    if (rows.length) { const { error } = await supabase.from('journal_columns').upsert(rows, { onConflict: 'id' }); if (error) throw error; }
    if (stale.length) { const { error } = await supabase.from('journal_columns').delete().eq('client_id', clientId).eq('journal_type', journalType).in('id', stale); if (error) throw error; }
    updateClientState(clientId, { [`${String(journalType).toLowerCase()}Columns`]: columns } as any);
  };

  const saveJournalEntry = async (...args: any[]) => {
    if (!user) return;
    const { clientId, journalType, payload } = resolveJournalArgs(args);
    if (!clientId || !journalType || !payload) return;
    const row = journalEntryRow(clientId, journalType, payload);
    const { error } = await supabase.from('journal_entries').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const key = `${String(journalType).toLowerCase()}Entries`;
    const existing = ((clients[clientId] as any)?.[key] || []).filter((e: any) => String(e.id) !== String(payload.id));
    updateClientState(clientId, { [key]: [...existing, payload] } as any);
  };

  const saveJournalEntries = async (...args: any[]) => {
    if (!user) return;
    let clientId: string | null;
    let journalType: string;
    let entries: any[];
    if (typeof args[0] === 'string' && ['CRJ', 'CDJ', 'PJ', 'GJ', 'SJ'].includes(args[0])) {
      clientId = currentClientId;
      journalType = args[0];
      entries = args[1] || [];
    } else {
      clientId = args[0];
      journalType = args[1];
      entries = args[2] || [];
    }
    if (!clientId) return;
    const rows = entries.map(e => journalEntryRow(clientId!, journalType, e));
    if (rows.length) { const { error } = await supabase.from('journal_entries').upsert(rows, { onConflict: 'id' }); if (error) throw error; }
    const existingEntries = ((clients[clientId] as any)?.[`${String(journalType).toLowerCase()}Entries`] || []);
    const keep = new Set(entries.map(e => String(e.id)));
    const stale = existingEntries.filter((e: any) => !keep.has(String(e.id)) && !e.auto).map((e: any) => String(e.id));
    if (stale.length) { const { error } = await supabase.from('journal_entries').delete().eq('client_id', clientId).eq('journal_type', journalType).in('id', stale); if (error) throw error; }
    updateClientState(clientId, { [`${String(journalType).toLowerCase()}Entries`]: entries } as any);
  };

  const deleteJournalColumn = async (...args: any[]) => {
    if (!user) return;
    const clientId = ['CRJ', 'CDJ', 'PJ', 'GJ', 'SJ'].includes(args[0]) ? currentClientId : args[0];
    const journalType = ['CRJ', 'CDJ', 'PJ', 'GJ', 'SJ'].includes(args[0]) ? args[0] : args[1];
    const id = ['CRJ', 'CDJ', 'PJ', 'GJ', 'SJ'].includes(args[0]) ? args[1] : args[2];
    if (!clientId || !journalType || !id) return;
    const { error } = await supabase.from('journal_columns').delete().eq('client_id', clientId).eq('journal_type', journalType).eq('id', String(id));
    if (error) throw error;
    const key = `${String(journalType).toLowerCase()}Columns`;
    updateClientState(clientId, { [key]: (((clients[clientId] as any)?.[key] || []).filter((c: any) => String(c.id) !== String(id))) } as any);
  };

  const deleteJournalEntry = async (...args: any[]) => {
    if (!user) return;
    const clientId = ['CRJ', 'CDJ', 'PJ', 'GJ', 'SJ'].includes(args[0]) ? currentClientId : args[0];
    const journalType = ['CRJ', 'CDJ', 'PJ', 'GJ', 'SJ'].includes(args[0]) ? args[0] : args[1];
    const id = ['CRJ', 'CDJ', 'PJ', 'GJ', 'SJ'].includes(args[0]) ? args[1] : args[2];
    if (!clientId || !journalType || !id) return;
    const { error } = await supabase.from('journal_entries').delete().eq('client_id', clientId).eq('journal_type', journalType).eq('id', String(id));
    if (error) throw error;
    const key = `${String(journalType).toLowerCase()}Entries`;
    updateClientState(clientId, { [key]: (((clients[clientId] as any)?.[key] || []).filter((e: any) => String(e.id) !== String(id))) } as any);
  };

  const saveJournalVoucher = async (clientId: string, voucher: any, gjEntries: any[] = []) => {
    if (!user || !clientId) return;
    const voucherRow = { id: String(voucher.id), client_id: clientId, date: voucher.date || null, reference: voucher.reference || null, memo: voucher.memo || null };
    const { error: voucherError } = await supabase.from('journal_vouchers').upsert(voucherRow, { onConflict: 'id' });
    if (voucherError) throw voucherError;
    const lineRows = (voucher.lines || []).map((l: any) => ({ id: String(l.id), client_id: clientId, journal_voucher_id: String(voucher.id), account_id: l.accountId || null, account_name: l.accountName || null, debit: Number(l.debit || 0), credit: Number(l.credit || 0) }));
    const { data: oldLines, error: oldLinesError } = await supabase.from('journal_voucher_lines').select('id').eq('client_id', clientId).eq('journal_voucher_id', String(voucher.id));
    if (oldLinesError) throw oldLinesError;
    if (lineRows.length) { const { error } = await supabase.from('journal_voucher_lines').upsert(lineRows, { onConflict: 'id' }); if (error) throw error; }
    const keep = new Set(lineRows.map((l: any) => l.id));
    const stale = (oldLines || []).map((l: any) => String(l.id)).filter((id: string) => !keep.has(id));
    if (stale.length) { const { error } = await supabase.from('journal_voucher_lines').delete().eq('client_id', clientId).in('id', stale); if (error) throw error; }
    if (gjEntries.length) {
      const gjRows = gjEntries.map(e => ({ ...journalEntryRow(clientId, 'GJ', e), auto: true, auto_source: `journal_voucher:${voucher.id}` }));
      const { error } = await supabase.from('journal_entries').upsert(gjRows, { onConflict: 'id' });
      if (error) throw error;
    }
    const vouchers = [...((clients[clientId]?.journalVouchers || []) as any[]).filter(v => String(v.id) !== String(voucher.id)), voucher];
    const gjExisting = (clients[clientId]?.gjEntries || []) as any[];
    const nextGj = [...gjExisting.filter(e => !gjEntries.some(g => String(g.id) === String(e.id))), ...gjEntries.map(e => ({ ...e, auto: true, autoSource: `journal_voucher:${voucher.id}` }))];
    updateClientState(clientId, { journalVouchers: vouchers, gjEntries: nextGj });
  };

  const deleteJournalVoucher = async (clientId: string, voucherId: string) => {
    if (!user || !clientId) return;
    const { error } = await supabase.from('journal_vouchers').delete().eq('client_id', clientId).eq('id', String(voucherId));
    if (error) throw error;
    const { error: gjError } = await supabase.from('journal_entries').delete().eq('client_id', clientId).eq('journal_type', 'GJ').eq('auto_source', `journal_voucher:${voucherId}`);
    if (gjError) throw gjError;
    updateClientState(clientId, {
      journalVouchers: ((clients[clientId]?.journalVouchers || []) as any[]).filter(v => String(v.id) !== String(voucherId)),
      gjEntries: ((clients[clientId]?.gjEntries || []) as any[]).filter(e => e.autoSource !== `journal_voucher:${voucherId}`),
    });
  };

  const saveInventoryColumn = async (column: any) => {
    if (!user || !currentClientId) return;
    const row = { id: String(column.id), client_id: currentClientId, label: column.label || '' };
    const { error } = await supabase.from('inventory_columns').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const next = [...((clients[currentClientId]?.inventoryColumns || []) as any[]).filter(c => String(c.id) !== String(column.id)), column];
    updateClientState(currentClientId, { inventoryColumns: next });
  };

  const deleteInventoryColumn = async (columnId: string) => {
    if (!user || !currentClientId) return;
    const { error } = await supabase.from('inventory_columns').delete().eq('client_id', currentClientId).eq('id', String(columnId));
    if (error) throw error;
    updateClientState(currentClientId, { inventoryColumns: ((clients[currentClientId]?.inventoryColumns || []) as any[]).filter(c => String(c.id) !== String(columnId)) });
  };

  const saveInventoryItem = async (item: any) => {
    if (!user || !currentClientId) return;
    const row = { id: String(item.id), client_id: currentClientId, code: item.code || '', name: item.name || '', sku: item.sku || null, description: item.description || null, category: item.category || '', unit_of_measure: item.unitOfMeasure || '', cost_price: Number(item.costPrice || 0), selling_price: Number(item.sellingPrice || 0), stock_level: Number(item.stockLevel || 0), reorder_point: Number(item.reorderPoint || 0), location: item.location || null, custom_fields: item.customFields || {} };
    const { error } = await supabase.from('inventory_items').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const next = [...((clients[currentClientId]?.inventoryItems || []) as any[]).filter(i => String(i.id) !== String(item.id)), item];
    updateClientState(currentClientId, { inventoryItems: next });
  };

  const deleteInventoryItem = async (itemId: string) => {
    if (!user || !currentClientId) return;
    const { error } = await supabase.from('inventory_items').delete().eq('client_id', currentClientId).eq('id', String(itemId));
    if (error) throw error;
    updateClientState(currentClientId, { inventoryItems: ((clients[currentClientId]?.inventoryItems || []) as any[]).filter(i => String(i.id) !== String(itemId)), inventoryMovements: ((clients[currentClientId]?.inventoryMovements || []) as any[]).filter(m => String(m.itemId) !== String(itemId)) });
  };

  const saveInventoryMovement = async (movement: any) => {
    if (!user || !currentClientId) return;
    const row = { id: String(movement.id), client_id: currentClientId, item_id: movement.itemId || null, item_name: movement.itemName || null, item_code: movement.itemCode || null, date: movement.date || null, type: movement.type || null, qty: Number(movement.qty || 0), unit_cost: Number(movement.unitCost || 0), total_value: Number(movement.totalValue || 0), reference: movement.reference || null, notes: movement.notes || null };
    const { error } = await supabase.from('inventory_movements').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const next = [...((clients[currentClientId]?.inventoryMovements || []) as any[]).filter(m => String(m.id) !== String(movement.id)), movement];
    updateClientState(currentClientId, { inventoryMovements: next });
  };

  const saveTinEntry = async (entry: any, partyType: 'customer' | 'supplier') => {
    if (!user || !currentClientId) return;
    const row = { id: String(entry.id), client_id: currentClientId, tin: String(entry.tin || ''), name: String(entry.name || '').trim(), address: entry.address || null, party_type: partyType };
    const { error } = await supabase.from('tin_entries').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const key = partyType === 'customer' ? 'customers' : 'suppliers';
    const lib = clients[currentClientId]?.tinLibrary || { customers: [], suppliers: [] };
    const next = { ...lib, [key]: [...((lib as any)[key] || []).filter((x: any) => String(x.id) !== String(entry.id)), entry] };
    updateClientState(currentClientId, { tinLibrary: next as any });
  };

  const deleteTinEntry = async (id: string, partyType: 'customer' | 'supplier') => {
    if (!user || !currentClientId) return;
    const { error } = await supabase.from('tin_entries').delete().eq('client_id', currentClientId).eq('id', String(id)).eq('party_type', partyType);
    if (error) throw error;
    const key = partyType === 'customer' ? 'customers' : 'suppliers';
    const lib = clients[currentClientId]?.tinLibrary || { customers: [], suppliers: [] };
    updateClientState(currentClientId, { tinLibrary: { ...lib, [key]: ((lib as any)[key] || []).filter((x: any) => String(x.id) !== String(id)) } as any });
  };

  const saveBillingInvoice = async (id: string, invoice: any) => {
    if (!user || !currentClientId) return;
    const row = { id: String(id), client_id: currentClientId, date: invoice.date || null, due_date: invoice.dueDate || null, invoice_no: invoice.invoiceNo || '', customer_tin: invoice.customerTin || null, customer_name: invoice.customerName || null, customer_address: invoice.customerAddress || null, vat_type: invoice.vatType || null, amount: Number(invoice.amount || 0), net_of_vat: Number(invoice.netOfVat || 0), output_tax: Number(invoice.outputTax || 0), description: invoice.description || null, status: invoice.status || 'Outstanding', payment_type: invoice.paymentType || null, date_paid: invoice.datePaid || null, is_recurring: !!invoice.isRecurring, recurrence_frequency: invoice.recurrenceFrequency || null, next_billing_date: invoice.nextBillingDate || null, parent_invoice_id: invoice.parentInvoiceId || null };
    const { error } = await supabase.from('billing_invoices').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const next = [...((clients[currentClientId]?.billingInvoices || []) as any[]).filter(i => String(i.id) !== String(id)), invoice];
    updateClientState(currentClientId, { billingInvoices: next });
  };

  const deleteBillingInvoice = async (id: string) => {
    if (!user || !currentClientId) return;
    const { error } = await supabase.from('billing_invoices').delete().eq('client_id', currentClientId).eq('id', String(id));
    if (error) throw error;
    updateClientState(currentClientId, { billingInvoices: ((clients[currentClientId]?.billingInvoices || []) as any[]).filter(i => String(i.id) !== String(id)) });
  };

  const saveClientProfile = async (id: string, profile: Partial<Client>) => {
    if (!user) return;
    const existing = clients[id] || ({ id } as Client);
    const merged = { ...existing, ...profile, id } as Client;
    const row = {
      id, user_id: user.id, name: merged.name || '', tin: merged.tin || null,
      taxpayer_classification: merged.taxpayerClassification || null,
      registered_name: merged.registeredName || null, last_name: merged.lastName || null,
      first_name: merged.firstName || null, middle_name: merged.middleName || null,
      trade_name: merged.tradeName || null, substreet: merged.substreet || null,
      street: merged.street || null, barangay: merged.barangay || null, district: merged.district || null,
      city: merged.city || null, zip_code: merged.zipCode || null, rdo_code: merged.rdoCode || null,
      phone: merged.phone || null, email: merged.email || null, category: merged.category || 'private',
      has_multiple_business_lines: !!merged.hasMultipleBusinessLines, accounting_type: merged.accountingType || 'Calendar',
      fiscal_month_end: merged.fiscalMonthEnd || 12, coa_format: merged.coaFormat || 'numeric',
      updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from('clients').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    updateClientState(id, profile as any);
  };

  const saveTaxDeadlines = async (deadlines: any[]) => {
    if (!user || !currentClientId) return;
    const rows = deadlines.map((d:any) => ({
      id: String(d.id), client_id: currentClientId, form_type: d.formType || null, title: d.title || null,
      period: d.period || null, due_date: d.dueDate || null, status: d.status || null,
      tax_status: d.taxStatus || null, amount_due: d.amountDue ?? null, date_filed: d.dateFiled || null,
      date_paid: d.datePaid || null, reference_no: d.referenceNo || null, confirmation_no: d.confirmationNo || null,
      notes: d.notes || null,
    }));
    const { data: existing, error: readError } = await supabase.from('tax_deadlines').select('id').eq('client_id', currentClientId);
    if (readError) throw readError;
    const keep = new Set(rows.map(r => r.id));
    const stale = (existing || []).map((r:any) => String(r.id)).filter(id => !keep.has(id));
    if (rows.length) { const { error } = await supabase.from('tax_deadlines').upsert(rows, { onConflict: 'id' }); if (error) throw error; }
    if (stale.length) { const { error } = await supabase.from('tax_deadlines').delete().eq('client_id', currentClientId).in('id', stale); if (error) throw error; }
    updateClientState(currentClientId, { taxDeadlines: deadlines });
  };

  const saveAssetLapsingSchedule = async (entries: any[]) => {
    if (!user || !currentClientId) return;
    const rows = entries.map((a:any) => ({
      id: String(a.id), client_id: currentClientId, date_purchased: a.datePurchased || null,
      invoice_no: a.invoiceNo || null, description: a.description || null, cost: Number(a.cost || 0),
      useful_life_years: Number(a.usefulLifeYears || 0), salvage_value: Number(a.salvageValue || 0),
    }));
    const { data: existing, error: readError } = await supabase.from('asset_lapsing_schedule').select('id').eq('client_id', currentClientId);
    if (readError) throw readError;
    const keep = new Set(rows.map(r => r.id));
    const stale = (existing || []).map((r:any) => String(r.id)).filter(id => !keep.has(id));
    if (rows.length) { const { error } = await supabase.from('asset_lapsing_schedule').upsert(rows, { onConflict: 'id' }); if (error) throw error; }
    if (stale.length) { const { error } = await supabase.from('asset_lapsing_schedule').delete().eq('client_id', currentClientId).in('id', stale); if (error) throw error; }
    updateClientState(currentClientId, { assetLapsingSchedule: entries });
  };

  const saveFinancialReportSnapshot = async (reportType: 'P&L' | 'Balance Sheet' | 'Cash Flow', data: any) => {
    if (!user || !currentClientId) return;
    const idSuffix = reportType === 'P&L' ? 'pl' : reportType === 'Balance Sheet' ? 'bs' : 'cf';
    const periodKey = reportType === 'P&L' ? (data?.period || 'current') : reportType === 'Balance Sheet' ? (data?.asOfDate || 'current') : (data?.period || 'current');
    const { error } = await supabase.from('financial_report_snapshots').upsert({
      id: `${currentClientId}:${idSuffix}`, client_id: currentClientId, report_type: reportType,
      period_key: periodKey, data: data || {}, updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
    if (error) throw error;
    const key = reportType === 'P&L' ? 'plData' : reportType === 'Balance Sheet' ? 'bsData' : 'cfData';
    updateClientState(currentClientId, { [key]: data } as any);
  };

  // Compatibility entry point for older callers.  Client-level saves now update
  // only the tenancy/profile row; transactional entities must use their targeted
  // normalized save functions (savePurchase, saveSale, saveJournalEntry, etc.).
  // This prevents a single profile save from rewriting/deleting an entire client's
  // normalized transaction set.
  const saveClient = async (id: string, clientData: Client) => {
    if (!user) return;
    const existing = clients[id] || ({ id } as Client);
    const merged = { ...existing, ...clientData, id } as Client;
    const row = {
      id, user_id: user.id, name: merged.name || '', tin: merged.tin || null,
      taxpayer_classification: merged.taxpayerClassification || null,
      registered_name: merged.registeredName || null, last_name: merged.lastName || null,
      first_name: merged.firstName || null, middle_name: merged.middleName || null,
      trade_name: merged.tradeName || null, substreet: merged.substreet || null,
      street: merged.street || null, barangay: merged.barangay || null, district: merged.district || null,
      city: merged.city || null, zip_code: merged.zipCode || null, rdo_code: merged.rdoCode || null,
      phone: merged.phone || null, email: merged.email || null, category: merged.category || 'private',
      has_multiple_business_lines: !!merged.hasMultipleBusinessLines, accounting_type: merged.accountingType || 'Calendar',
      fiscal_month_end: merged.fiscalMonthEnd || 12, coa_format: merged.coaFormat || 'numeric',
      updated_at: new Date().toISOString(),
    };
    try {
      const { error } = await supabase.from('clients').upsert(row, { onConflict: 'id' });
      if (error) throw error;
      setClients((prev) => ({ ...prev, [id]: merged }));
      showToast('Client profile saved');
    } catch (error) {
      console.error('Client profile save failed:', error);
      await handleSupabaseError(error, OperationType.UPDATE, `client-profile/${id}`);
    }
  };

  const uploadPurchaseAttachment = async (clientId: string, purchaseId: string, attachment: any) => {
    if (!attachment?.data) return attachment?.storagePath || null;
    const safeName = String(attachment.name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `${clientId}/purchases/${purchaseId}/${safeName}`;
    let blob: Blob;
    const data = String(attachment.data);
    if (attachment.encoding === 'gzip') {
      blob = new Blob([base64ToUint8Array(data)], { type: 'application/gzip' });
    } else {
      const comma = data.indexOf(',');
      const encoded = comma >= 0 ? data.slice(comma + 1) : data;
      blob = new Blob([base64ToUint8Array(encoded)], { type: attachment.type || 'application/octet-stream' });
    }
    const { error } = await supabase.storage.from('client-files').upload(storagePath, blob, {
      contentType: attachment.encoding === 'gzip' ? 'application/gzip' : (attachment.type || 'application/octet-stream'),
      upsert: true,
    });
    if (error) throw error;
    return storagePath;
  };

  const savePurchase = async (id: string, purchase: any) => {
    if (!user || !currentClientId) return;
    const existingPurchase = (clients[currentClientId]?.purchases || []).find((p:any) => String(p.id) === String(id));
    const previousStoragePath = existingPurchase?.attachment?.storagePath || null;
    let storagePath = purchase?.attachment?.storagePath || null;
    if (purchase?.attachment?.data) {
      storagePath = await uploadPurchaseAttachment(currentClientId, id, purchase.attachment);
    }
    if (previousStoragePath && previousStoragePath !== storagePath) {
      const { error: cleanupError } = await supabase.storage.from('client-files').remove([previousStoragePath]);
      if (cleanupError) console.warn('Previous purchase attachment cleanup failed', cleanupError);
    }
    const row = {
      id: String(id), client_id: currentClientId, dat_month_year: purchase.datMonthYear || null,
      date: (() => { const raw = String(purchase.date || ''); const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : (raw || null); })(),
      payment_method: purchase.paymentMethod || '', check_number: purchase.checkNumber || null,
      bank_name: purchase.bankName || null, invoice_no: purchase.invoiceNo || null,
      supplier_name: purchase.supplierName || '', supplier_address: purchase.supplierAddress || null,
      supplier_tin: purchase.supplierTin || null, amount: Number(purchase.amount || 0),
      vat_type: purchase.vatType || null, expense_type: purchase.expenseType || null,
      account_title: purchase.accountTitle || null, transaction_details: purchase.transactionDetails || null,
      input_tax: Number(purchase.inputTax || 0), attachment_name: purchase.attachment?.name || null,
      attachment_type: purchase.attachment?.type || null, attachment_original_type: purchase.attachment?.originalType || purchase.attachment?.type || null,
      attachment_size: purchase.attachment?.size || null, attachment_original_size: purchase.attachment?.originalSize || purchase.attachment?.size || null,
      attachment_compression: purchase.attachment?.encoding === 'gzip' ? 'gzip' : (purchase.attachment?.compression || null),
      attachment_storage_path: storagePath, withholding_option: purchase.withholdingOption || null,
      atc_code: purchase.atcCode || null, wht_rate: purchase.whtRate ?? null, wht_amount: purchase.whtAmount ?? null,
    };
    const { error } = await supabase.from('purchases').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    const hydrated = { ...purchase, attachment: purchase.attachment ? { ...purchase.attachment, storagePath, data: undefined } : undefined };
    setClients(prev => ({ ...prev, [currentClientId]: { ...prev[currentClientId], purchases: [...(prev[currentClientId]?.purchases || []).filter((p:any)=>String(p.id)!==String(id)), hydrated] } as Client }));
  };

  const deletePurchase = async (id: string) => {
    if (!user || !currentClientId) return;
    const existing = (clients[currentClientId]?.purchases || []).find((p:any) => String(p.id) === String(id));
    const path = existing?.attachment?.storagePath;
    const { error } = await supabase.from('purchases').delete().eq('client_id', currentClientId).eq('id', String(id));
    if (error) throw error;
    if (path) {
      const { error: storageError } = await supabase.storage.from('client-files').remove([path]);
      if (storageError) console.warn('Purchase attachment cleanup failed', storageError);
    }
    setClients(prev => ({ ...prev, [currentClientId]: { ...prev[currentClientId], purchases: (prev[currentClientId]?.purchases || []).filter((p:any)=>String(p.id)!==String(id)) } as Client }));
  };

  const saveFolder = async (folder: any) => {
    if (!user || !currentClientId) return;
    const row = {
      id: String(folder.id), client_id: currentClientId, name: folder.name || '',
      is_default: !!folder.isDefault, type: folder.type || 'custom'
    };
    const { error } = await supabase.from('app_folders').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    setClients(prev => ({ ...prev, [currentClientId]: { ...prev[currentClientId], folders: [...(prev[currentClientId]?.folders || []).filter((f:any)=>String(f.id)!==String(folder.id)), folder] } as Client }));
  };

  const deleteFolder = async (folderId: string) => {
    if (!user || !currentClientId) return;
    const { error } = await supabase.from('app_folders').delete().eq('client_id', currentClientId).eq('id', String(folderId));
    if (error) throw error;
    setClients(prev => ({ ...prev, [currentClientId]: { ...prev[currentClientId], folders: (prev[currentClientId]?.folders || []).filter((f:any)=>String(f.id)!==String(folderId)), files: (prev[currentClientId]?.files || []).filter((f:any)=>String(f.folderId)!==String(folderId)) } as Client }));
  };

  const saveFile = async (file: any) => {
    if (!user || !currentClientId) return;
    const row = {
      id: String(file.id), client_id: currentClientId, name: file.name || '',
      type: file.type || 'application/octet-stream', size: Number(file.size || 0),
      uploaded_at: file.uploadedAt || new Date().toISOString(), folder_id: file.folderId || null,
      storage_path: file.storagePath || null, description: file.description || null
    };
    const { error } = await supabase.from('app_files').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    setClients(prev => ({ ...prev, [currentClientId]: { ...prev[currentClientId], files: [...(prev[currentClientId]?.files || []).filter((f:any)=>String(f.id)!==String(file.id)), file] } as Client }));
  };

  const deleteFile = async (fileId: string) => {
    if (!user || !currentClientId) return;
    const { error } = await supabase.from('app_files').delete().eq('client_id', currentClientId).eq('id', String(fileId));
    if (error) throw error;
    setClients(prev => ({ ...prev, [currentClientId]: { ...prev[currentClientId], files: (prev[currentClientId]?.files || []).filter((f:any)=>String(f.id)!==String(fileId)) } as Client }));
  };

  const addClient = async (name: string) => {
    if (!name.trim()) return;
    const newId = 'client_' + Date.now();
    const newClient: Client = {
      id: newId,
      name: name.trim(),
      tinLibrary: { customers: [], suppliers: [] },
      sales: [],
      purchases: [],
      expenses: [],
      folders: [
        { id: 'folder_revenue', name: 'Revenue', isDefault: true, type: 'revenue' },
        { id: 'folder_expense', name: 'Expense', isDefault: true, type: 'expense' },
      ],
      files: [],
    } as Client;

    setClients((prev) => ({
      ...prev,
      [newId]: {
        ...newClient,
        userId: user ? user.id : undefined,
      },
    }));
    setCurrentClientId(newId);

    if (user) {
      try {
        await persistClientShell(newClient, user.id);
        showToast('Client added');
      } catch (error) {
        await handleSupabaseError(error, OperationType.CREATE, `clients/${newId}`);
      }
    }
  };

  const deleteClient = async (id: string) => {
    setClients((prev) => {
      const updated = { ...prev };
      delete updated[id];
      return updated;
    });

    if (currentClientId === id) {
      setClients((currentMerged) => {
        const remainingIds = Object.keys(currentMerged).filter((cid) => cid !== id);
        setCurrentClientId(remainingIds.length > 0 ? remainingIds[0] : null);
        return currentMerged;
      });
    }

    if (user) {
      try {
        const { error } = await supabase.from('clients').delete().eq('id', id);
        if (error) throw error;
        showToast('Client profile deleted');
      } catch (error) {
        await handleSupabaseError(error, OperationType.DELETE, `clients/${id}`);
      }
    } else {
      showToast('Client profile deleted');
    }
  };

  const saveBusinessProfile = async (profileData: BusinessProfile) => {
    setBusinessProfile(profileData);
    if (user) {
      try {
        const { error } = await supabase
          .from('business_profiles')
          .upsert(
            { user_id: user.id, data: { ...profileData, id: user.id }, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        if (error) throw error;

        // Also update the matching owner client immediately to unlock hasClients and currentClient
        const ownerId = ownerClientId(user.id);
        const existing = clients[ownerId];
        const matchingClient = buildMatchingClient(profileData, existing, ownerId);

        await persistClientShell(matchingClient, user.id);

        setClients((prev) => ({
          ...prev,
          [ownerId]: matchingClient,
        }));

        if (!currentClientId) {
          setCurrentClientId(ownerId);
        }

        showToast('Business Profile updated');
      } catch (error) {
        await handleSupabaseError(error, OperationType.UPDATE, `business_profiles/${user.id}`);
      }
    }
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  const navigateToPage = (page: string | null) => {
    navigate(page ? `/${page}` : '/');
  };

  // Every account title's General Ledger entries are derived here so that
  // ANY change anywhere in the books (a sale, a purchase, a CRJ/CDJ/PJ row,
  // a journal voucher) is immediately reflected per-account in the General
  // Ledger — and everything built on it (Chart of Accounts balances, P&L,
  // Balance Sheet). See src/lib/glPosting.ts.
  //
  // The Cash Disbursements Journal is synced first so that every cash
  // payment recorded elsewhere (a cash-basis Purchase, a Journal Voucher
  // that credits Cash) is auto-recorded there too — then the General Ledger
  // sync runs on top of that so the ledger reflects those rows as well.
  //
  // NOTE: this useMemo (and every other hook in this component) must run on
  // every render, so it's declared BEFORE the `syncError` / `!isReady` early
  // returns below. Putting a hook after a conditional `return` means the
  // hook simply isn't called on renders that hit the early return — as soon
  // as `syncError` or `isReady` flips (or any other early-return condition
  // changes), React sees a different number of hooks between renders and
  // throws "Rendered more/fewer hooks than during the previous render"
  // (React error #310), which crashes the entire app since this provider
  // wraps everything.
  const rawCurrentClient = currentClientId ? clients[currentClientId] : null;
  const currentClient = useMemo(
    () => (rawCurrentClient ? syncGeneralLedger(syncCashDisbursementsJournal(rawCurrentClient)) : null),
    [rawCurrentClient]
  );

  if (syncError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-6">
        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-xl border border-slate-200 dark:border-slate-700 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100 mb-2">Sync Connection Failed</h2>
          <p className="text-slate-500 dark:text-slate-400 mb-8 leading-relaxed text-sm">{syncError}</p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-bold shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2"
            >
              <span>Retry Connection</span>
            </button>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                window.location.reload();
              }}
              className="w-full py-4 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-600 dark:text-slate-300 rounded-2xl font-bold transition-all"
            >
              Reset and Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }

  // `isReady` only means "clients have loaded from Supabase". Which client
  // is actually active still depends on a *second* round-trip
  // (cloudPrefsLoaded -> the restore effect above picking currentClientId).
  // Rendering as soon as `isReady` flips true - before that second step
  // finishes - is what let AppLayout/Header mount with currentClient still
  // null, briefly showing the "CAPO Accounting Setup" fallback title before
  // swapping to the real client name. So the gate below also waits for
  // cloudPrefsLoaded, and - if there are clients to restore - for
  // currentClientId to actually be picked.
  const dataFullyReady =
    isReady && (!user || cloudPrefsLoaded) && (Object.keys(clients).length === 0 || !!currentClientId);

  if (!dataFullyReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-900 px-6">
        <div className="flex flex-col items-center gap-6 max-w-sm w-full text-center">
          <div className="relative">
            <div className="animate-spin rounded-full h-16 w-16 border-4 border-slate-200 dark:border-slate-800 border-t-blue-600"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-1.5 h-1.5 bg-blue-600 rounded-full animate-ping"></div>
            </div>
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100">Syncing your data...</h2>
            <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">
              We're connecting to the cloud to ensure your records are up to date.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <AccountingContext.Provider
      value={{
        clients,
        currentClientId,
        currentClient,
        businessProfile,
        ownerClientId: user ? ownerClientId(user.id) : null,
        isDarkMode,
        isSidebarCollapsed,
        activePage,
        currentDat,
        historyTab,
        birFormTab,
        toastMsg,
        isSyncing,
        syncError,
        syncData,
        setDarkMode,
        setSidebarCollapsed,
        navigateToPage,
        setHistoryTab,
        setBirFormTab,
        setCurrentClientId,
        setCurrentDat,
        saveClient,
        saveClientProfile,
        saveTaxDeadlines,
        saveAssetLapsingSchedule,
        saveFinancialReportSnapshot,
        savePurchase,
        deletePurchase,
        saveSale,
        saveCoaColumns,
        saveCoaAccounts,
        saveJournalColumn,
        saveJournalColumns,
        saveJournalEntry,
        saveJournalEntries,
        deleteJournalColumn,
        deleteJournalEntry,
        saveJournalVoucher,
        deleteJournalVoucher,
        saveInventoryColumn,
        deleteInventoryColumn,
        saveInventoryItem,
        deleteInventoryItem,
        saveInventoryMovement,
        saveTinEntry,
        deleteTinEntry,
        saveBillingInvoice,
        deleteBillingInvoice,
        addClient,
        deleteClient,
        saveBusinessProfile,
      saveFolder,
      deleteFolder,
      saveFile,
      deleteFile,
        showToast,
        activeDevice,
      }}
    >
      {children}
    </AccountingContext.Provider>
  );
};

export const useAccounting = () => {
  const ctx = useContext(AccountingContext);
  if (!ctx) throw new Error('useAccounting must be used within AccountingProvider');
  return ctx;
};
