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
  savePurchase: (clientId: string, purchase: any) => Promise<void>;
  deletePurchase: (clientId: string, purchaseId: string | number) => Promise<void>;
  addClient: (name: string) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;
  saveBusinessProfile: (profile: BusinessProfile) => Promise<void>;
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
    withholdingTaxEntries: existing?.withholdingTaxEntries || [],
    taxDeadlines: existing?.taxDeadlines || [],
  }) as unknown as Client;


/**
 * Normalized persistence bridge.
 *
 * The UI still works with the existing Client aggregate so components do not
 * all need to be rewritten at once. Supabase, however, stores transactional
 * entities in their own tables. `clients.data` is retained only as a small
 * legacy compatibility payload for fields that do not yet have a normalized
 * table (for example the derived/manual GL view).
 */
const normalizedClientKeys = new Set([
  'sales', 'purchases', 'expenses', 'accounts', 'coaColumns',
  'crjColumns', 'crjEntries', 'cdjColumns', 'cdjEntries', 'pjColumns', 'pjEntries',
  'gjColumns', 'gjEntries', 'journalVouchers', 'purchaseOrders', 'receivingReports',
  'payableInvoices', 'inventoryItems', 'inventoryMovements', 'inventoryColumns',
  'folders', 'files', 'taxDeadlines', 'bankAccounts', 'supplierAdvances',
  'withholdingTaxEntries', 'debitCreditMemos', 'checkVouchers', 'miscellaneousPayments',
  'assetLapsingSchedule', 'billingInvoices', 'tinLibrary', 'plData', 'bsData', 'cfData'
]);

const withoutNormalizedKeys = (client: Client) => {
  const legacy: Record<string, any> = {};
  Object.entries(client as any).forEach(([key, value]) => {
    if (!normalizedClientKeys.has(key) && key !== 'id' && key !== 'name' && key !== 'userId') {
      legacy[key] = value;
    }
  });
  return legacy;
};

const rowDate = (value: any) => value ? String(value).slice(0, 10) : '';
const strId = (value: any) => String(value);
const chunk = <T,>(items: T[], size = 200): T[][] => {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
};

const loadNormalizedClient = async (clientId: string): Promise<Partial<Client>> => {
  const [purchases, sales, expenses, coaColumns, coaAccounts, journalColumns, journalEntries,
    journalVouchers, journalVoucherLines, purchaseOrders, purchaseOrderItems, receivingReports,
    receivingReportItems, payableInvoices, payableInvoiceItems, inventoryColumns, inventoryItems,
    inventoryMovements, folders, files, tinEntries, taxDeadlines, bankAccounts, supplierAdvances,
    withholdingTaxEntries, debitCreditMemos, checkVouchers, miscellaneousPayments,
    assetLapsingSchedule, billingInvoices, snapshots] = await Promise.all([
      supabase.from('purchases').select('*').eq('client_id', clientId),
      supabase.from('sales').select('*').eq('client_id', clientId),
      supabase.from('expenses').select('*').eq('client_id', clientId),
      supabase.from('coa_columns').select('*').eq('client_id', clientId),
      supabase.from('coa_accounts').select('*').eq('client_id', clientId),
      supabase.from('journal_columns').select('*').eq('client_id', clientId),
      supabase.from('journal_entries').select('*').eq('client_id', clientId),
      supabase.from('journal_vouchers').select('*').eq('client_id', clientId),
      supabase.from('journal_voucher_lines').select('*').eq('client_id', clientId),
      supabase.from('purchase_orders').select('*').eq('client_id', clientId),
      supabase.from('purchase_order_items').select('*').eq('client_id', clientId),
      supabase.from('receiving_reports').select('*').eq('client_id', clientId),
      supabase.from('receiving_report_items').select('*').eq('client_id', clientId),
      supabase.from('payable_invoices').select('*').eq('client_id', clientId),
      supabase.from('payable_invoice_items').select('*').eq('client_id', clientId),
      supabase.from('inventory_columns').select('*').eq('client_id', clientId),
      supabase.from('inventory_items').select('*').eq('client_id', clientId),
      supabase.from('inventory_movements').select('*').eq('client_id', clientId),
      supabase.from('app_folders').select('*').eq('client_id', clientId),
      supabase.from('app_files').select('*').eq('client_id', clientId),
      supabase.from('tin_entries').select('*').eq('client_id', clientId),
      supabase.from('tax_deadlines').select('*').eq('client_id', clientId),
      supabase.from('bank_accounts').select('*').eq('client_id', clientId),
      supabase.from('supplier_advances').select('*').eq('client_id', clientId),
      supabase.from('withholding_tax_entries').select('*').eq('client_id', clientId),
      supabase.from('debit_credit_memos').select('*').eq('client_id', clientId),
      supabase.from('check_vouchers').select('*').eq('client_id', clientId),
      supabase.from('miscellaneous_payments').select('*').eq('client_id', clientId),
      supabase.from('asset_lapsing_schedule').select('*').eq('client_id', clientId),
      supabase.from('billing_invoices').select('*').eq('client_id', clientId),
      supabase.from('financial_report_snapshots').select('*').eq('client_id', clientId),
    ]);

  const responses = [purchases, sales, expenses, coaColumns, coaAccounts, journalColumns, journalEntries,
    journalVouchers, journalVoucherLines, purchaseOrders, purchaseOrderItems, receivingReports,
    receivingReportItems, payableInvoices, payableInvoiceItems, inventoryColumns, inventoryItems,
    inventoryMovements, folders, files, tinEntries, taxDeadlines, bankAccounts, supplierAdvances,
    withholdingTaxEntries, debitCreditMemos, checkVouchers, miscellaneousPayments,
    assetLapsingSchedule, billingInvoices, snapshots];
  const firstError = responses.find((r: any) => r.error)?.error;
  if (firstError) throw firstError;
  const rows = responses.map((r: any) => r.data || []);
  const [pRows,sRows,eRows,ccRows,caRows,jcRows,jeRows,jvRows,jvlRows,poRows,poiRows,rrRows,rriRows,piRows,piiRows,icRows,iiRows,imRows,fRows,fileRows,tinRows,tdRows,baRows,saRows,whtRows,dcmRows,cvRows,mpRows,alsRows,biRows,snapshotRows] = rows;

  const poItemsBy = new Map<string, any[]>();
  poiRows.forEach((r:any) => { const a=poItemsBy.get(r.purchase_order_id)||[]; a.push({ itemCode:r.item_code||'', description:r.description||'', qty:Number(r.qty||0), unitPrice:Number(r.unit_price||0) }); poItemsBy.set(r.purchase_order_id,a); });
  const rrItemsBy = new Map<string, any[]>();
  rriRows.forEach((r:any) => { const a=rrItemsBy.get(r.receiving_report_id)||[]; a.push({ itemCode:r.item_code||'', description:r.description||'', qtyOrdered:Number(r.qty_ordered||0), qtyReceived:Number(r.qty_received||0), unitPrice:Number(r.unit_price||0) }); rrItemsBy.set(r.receiving_report_id,a); });
  const piItemsBy = new Map<string, any[]>();
  piiRows.forEach((r:any) => { const a=piItemsBy.get(r.payable_invoice_id)||[]; a.push({ itemCode:r.item_code||'', description:r.description||'', qty:Number(r.qty||0), unitPrice:Number(r.unit_price||0) }); piItemsBy.set(r.payable_invoice_id,a); });
  const linesByVoucher = new Map<string, any[]>();
  jvlRows.forEach((r:any) => { const a=linesByVoucher.get(r.journal_voucher_id)||[]; a.push({ id:strId(r.id), accountId:r.account_id||'', accountName:r.account_name||'', debit:Number(r.debit||0), credit:Number(r.credit||0) }); linesByVoucher.set(r.journal_voucher_id,a); });

  const result: Partial<Client> = {
    purchases: pRows.map((r:any) => ({ id:Number(r.id) || r.id, datMonthYear:r.dat_month_year||'', date:rowDate(r.date), paymentMethod:r.payment_method||'', checkNumber:r.check_number, bankName:r.bank_name, invoiceNo:r.invoice_no||'', supplierName:r.supplier_name||'', supplierAddress:r.supplier_address||'', supplierTin:r.supplier_tin||'', amount:Number(r.amount||0), vatType:r.vat_type||'', expenseType:r.expense_type||'', accountTitle:r.account_title||'', transactionDetails:r.transaction_details, inputTax:Number(r.input_tax||0), attachment:r.attachment_name ? { name:r.attachment_name, type:r.attachment_type||'', originalType:r.attachment_original_type||r.attachment_type||'', size:Number(r.attachment_size||0), originalSize:Number(r.attachment_original_size||r.attachment_size||0), compression:r.attachment_compression as any, content:'', storagePath:r.attachment_storage_path } : undefined, withholdingOption:r.withholding_option as any, atcCode:r.atc_code, whtRate:r.wht_rate == null ? null : Number(r.wht_rate), whtAmount:r.wht_amount == null ? undefined : Number(r.wht_amount) })),
    sales: sRows.map((r:any) => ({ id:Number(r.id)||r.id, datMonthYear:r.dat_month_year||'', date:rowDate(r.date), ref:r.ref||'', paymentType:r.payment_type||'', buyerTin:r.buyer_tin||'', buyerName:r.buyer_name||'', buyerAddress:r.buyer_address||'', vatType:r.vat_type||'', amount:Number(r.amount||0), netOfVat:Number(r.net_of_vat||0), outputTax:Number(r.output_tax||0), incomeType:r.income_type||'', desc:r.description||'' })),
    expenses: eRows.map((r:any) => ({ id:Number(r.id)||r.id, date:rowDate(r.date), amount:Number(r.amount||0), category:r.category||'', description:r.description||'' })),
    coaColumns: ccRows.map((r:any) => ({ id:strId(r.id), name:r.name, isSystem:!!r.is_system })),
    accounts: caRows.map((r:any) => ({ id:strId(r.id), name:r.name, type:r.type, normalSide:r.normal_side, parentId:r.parent_id, hidden:!!r.hidden, openingBalance:Number(r.opening_balance||0), ...(r.custom_values||{}) })),
    crjColumns: jcRows.filter((r:any)=>r.journal_type==='CRJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    cdjColumns: jcRows.filter((r:any)=>r.journal_type==='CDJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    pjColumns: jcRows.filter((r:any)=>r.journal_type==='PJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    gjColumns: jcRows.filter((r:any)=>r.journal_type==='GJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    crjEntries: jeRows.filter((r:any)=>r.journal_type==='CRJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    cdjEntries: jeRows.filter((r:any)=>r.journal_type==='CDJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    pjEntries: jeRows.filter((r:any)=>r.journal_type==='PJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    gjEntries: jeRows.filter((r:any)=>r.journal_type==='GJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    journalVouchers: jvRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),reference:r.reference||'',memo:r.memo||'',lines:linesByVoucher.get(r.id)||[]})),
    purchaseOrders: poRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),supplierId:r.supplier_id||'',supplierName:r.supplier_name||'',items:poItemsBy.get(r.id)||[],totalAmount:Number(r.total_amount||0),status:r.status})),
    receivingReports: rrRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),poId:r.po_id||'',supplierName:r.supplier_name||'',items:rrItemsBy.get(r.id)||[],totalAmount:Number(r.total_amount||0),receivedBy:r.received_by||''})),
    payableInvoices: piRows.map((r:any)=>({id:strId(r.id),invoiceNumber:r.invoice_number||'',date:rowDate(r.date),dueDate:rowDate(r.due_date),poId:r.po_id||undefined,rrId:r.rr_id||undefined,supplierId:r.supplier_id||'',supplierName:r.supplier_name||'',items:piItemsBy.get(r.id)||[],subtotal:Number(r.subtotal||0),vatAmount:Number(r.vat_amount||0),isVatable:!!r.is_vatable,withholdingTaxId:r.withholding_tax_id||undefined,whtAmount:r.wht_amount==null?undefined:Number(r.wht_amount),totalAmount:Number(r.total_amount||0),status:r.status,discrepancyDetails:r.discrepancy_details||undefined,appliedPrepayments:r.applied_prepayments==null?undefined:Number(r.applied_prepayments)})),
    inventoryColumns: icRows.map((r:any)=>({id:strId(r.id),label:r.label})),
    inventoryItems: iiRows.map((r:any)=>({id:strId(r.id),code:r.code,name:r.name,sku:r.sku||'',description:r.description,category:r.category,unitOfMeasure:r.unit_of_measure,costPrice:Number(r.cost_price||0),sellingPrice:Number(r.selling_price||0),stockLevel:Number(r.stock_level||0),reorderPoint:Number(r.reorder_point||0),location:r.location,customFields:r.custom_fields||{}})),
    inventoryMovements: imRows.map((r:any)=>({id:strId(r.id),itemId:r.item_id||'',itemName:r.item_name||'',itemCode:r.item_code||'',date:rowDate(r.date),type:r.type,qty:Number(r.qty||0),unitCost:Number(r.unit_cost||0),totalValue:Number(r.total_value||0),reference:r.reference||'',notes:r.notes})),
    folders: fRows.map((r:any)=>({id:strId(r.id),name:r.name,isDefault:!!r.is_default,type:r.type||undefined})),
    files: fileRows.map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,size:Number(r.size||0),uploadedAt:r.uploaded_at,folderId:r.folder_id||'',storagePath:r.storage_path,description:r.description||undefined})),
    tinLibrary: { customers:tinRows.filter((r:any)=>r.party_type==='customer').map((r:any)=>({id:Number(r.id)||r.id,tin:r.tin,name:r.name,address:r.address})), suppliers:tinRows.filter((r:any)=>r.party_type==='supplier').map((r:any)=>({id:Number(r.id)||r.id,tin:r.tin,name:r.name,address:r.address})) },
    taxDeadlines: tdRows.map((r:any)=>({id:strId(r.id),formType:r.form_type,title:r.title,period:r.period,dueDate:rowDate(r.due_date),status:r.status,taxStatus:r.tax_status||undefined,amountDue:r.amount_due==null?undefined:Number(r.amount_due),dateFiled:rowDate(r.date_filed)||undefined,datePaid:rowDate(r.date_paid)||undefined,referenceNo:r.reference_no||undefined,confirmationNo:r.confirmation_no||undefined,notes:r.notes||undefined})),
    bankAccounts: baRows.map((r:any)=>({id:strId(r.id),bankName:r.bank_name,accountNumber:r.account_number,balance:Number(r.balance||0)})),
    supplierAdvances: saRows.map((r:any)=>({id:strId(r.id),supplierId:r.supplier_id||'',supplierName:r.supplier_name||'',date:rowDate(r.date),amount:Number(r.amount||0),isLiquidated:!!r.is_liquidated,notes:r.notes||undefined})),
    withholdingTaxEntries: whtRows.map((r:any)=>({id:strId(r.id),atcCode:r.atc_code,description:r.description,taxRate:Number(r.tax_rate||0),category:r.category})),
    debitCreditMemos: dcmRows.map((r:any)=>({id:strId(r.id),type:r.type,invoiceId:r.invoice_id||'',invoiceNumber:r.invoice_number||'',supplierName:r.supplier_name||'',date:rowDate(r.date),amount:Number(r.amount||0),reason:r.reason})),
    checkVouchers: cvRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),payeeName:r.payee_name,invoiceId:r.invoice_id||undefined,invoiceNumber:r.invoice_number||undefined,paymentType:r.payment_type,miscDetails:r.misc_details||undefined,amount:Number(r.amount||0),checkedBy:r.checked_by||'',approvedBy:r.approved_by||'',bankAccountId:r.bank_account_id||'',bankName:r.bank_name||'',checkNumber:r.check_number||'',status:r.status,reversedReason:r.reversed_reason||undefined,reversedAt:r.reversed_at||undefined})),
    miscellaneousPayments: mpRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),payeeName:r.payee_name,amount:Number(r.amount||0),bankAccountId:r.bank_account_id||'',bankName:r.bank_name||'',checkNumber:r.check_number||'',expenseCategory:r.expense_category||'',description:r.description||''})),
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

const persistNormalizedClient = async (client: Client, userId: string) => {
  const clientId = client.id;
  const parent = {
    id: clientId, user_id: userId, name: client.name,
    tin:client.tin||null, taxpayer_classification:client.taxpayerClassification||null,
    registered_name:client.registeredName||null,last_name:client.lastName||null,first_name:client.firstName||null,
    middle_name:client.middleName||null,trade_name:client.tradeName||null,substreet:client.substreet||null,
    street:client.street||null,barangay:client.barangay||null,district:client.district||null,city:client.city||null,
    zip_code:client.zipCode||null,rdo_code:client.rdoCode||null,phone:client.phone||null,email:client.email||null,
    category:client.category||'private',has_multiple_business_lines:!!client.hasMultipleBusinessLines,
    accounting_type:client.accountingType||'Calendar',fiscal_month_end:client.fiscalMonthEnd||12,
    coa_format:client.coaFormat||'numeric',data:withoutNormalizedKeys(client),updated_at:new Date().toISOString()
  };
  const { error: parentError } = await supabase.from('clients').upsert(parent,{onConflict:'id'});
  if (parentError) throw parentError;

  // Normalized persistence is intentionally non-destructive.  The old implementation
  // deleted every row for the client and recreated the entire dataset on every save.
  // That caused unnecessary writes, changed child-row identities, and made concurrent
  // edits unsafe.  We now upsert the current rows and remove only rows that no longer
  // exist in the client aggregate.
  const syncMany = async (table:string, rows:any[]) => {
    const normalizedRows = rows.map(r => ({ ...r, client_id: clientId }));
    const { data: existingRows, error: existingError } = await supabase
      .from(table)
      .select('id')
      .eq('client_id', clientId);
    if (existingError) throw existingError;

    const currentIds = new Set(normalizedRows.map(r => String(r.id)));
    const staleIds = (existingRows || [])
      .map((r:any) => String(r.id))
      .filter((id:string) => !currentIds.has(id));

    for (const part of chunk(normalizedRows)) {
      if (!part.length) continue;
      const { error } = await supabase.from(table).upsert(part, { onConflict: 'id' });
      if (error) throw error;
    }

    // Delete only rows removed from the current aggregate.  Never perform a
    // blanket client-wide delete.
    for (const part of chunk(staleIds, 100)) {
      if (!part.length) continue;
      const { error } = await supabase
        .from(table)
        .delete()
        .eq('client_id', clientId)
        .in('id', part);
      if (error) throw error;
    }
  };
  await syncMany('purchases',(client.purchases||[]).map((p:any)=>({id:strId(p.id),dat_month_year:p.datMonthYear||null,date:p.date,payment_method:p.paymentMethod||'',check_number:p.checkNumber||null,bank_name:p.bankName||null,invoice_no:p.invoiceNo||null,supplier_name:p.supplierName||'',supplier_address:p.supplierAddress||null,supplier_tin:p.supplierTin||null,amount:Number(p.amount||0),vat_type:p.vatType||null,expense_type:p.expenseType||null,account_title:p.accountTitle||null,transaction_details:p.transactionDetails||null,input_tax:Number(p.inputTax||0),attachment_name:p.attachment?.name||null,attachment_type:p.attachment?.type||null,attachment_original_type:p.attachment?.originalType||null,attachment_size:p.attachment?.size||null,attachment_original_size:p.attachment?.originalSize||null,attachment_compression:p.attachment?.compression||null,attachment_storage_path:p.attachment?.storagePath||null,withholding_option:p.withholdingOption||null,atc_code:p.atcCode||null,wht_rate:p.whtRate??null,wht_amount:p.whtAmount??null})));
  await syncMany('sales',(client.sales||[]).map((s:any)=>({id:strId(s.id),dat_month_year:s.datMonthYear||null,date:s.date,ref:s.ref||null,payment_type:s.paymentType||null,buyer_tin:s.buyerTin||null,buyer_name:s.buyerName||null,buyer_address:s.buyerAddress||null,vat_type:s.vatType||null,amount:Number(s.amount||0),net_of_vat:Number(s.netOfVat||0),output_tax:Number(s.outputTax||0),income_type:s.incomeType||null,description:s.desc||null})));
  await syncMany('expenses',(client.expenses||[]).map((e:any)=>({id:strId(e.id),date:e.date,amount:Number(e.amount||0),category:e.category||'',description:e.description||''})));
  await syncMany('coa_columns',(client.coaColumns||[]).map((c:any)=>({id:strId(c.id),name:c.name,is_system:!!c.isSystem})));
  await syncMany('coa_accounts',(client.accounts||[]).map((a:any)=>{const {id,name,type,normalSide,parentId,hidden,openingBalance,...custom}=a;return {id:strId(id),name:name||'',type:type||'',normal_side:normalSide||null,parent_id:parentId||null,hidden:!!hidden,opening_balance:Number(openingBalance||0),custom_values:custom};}));
  const journalTypes:[string,string,string][]=[['CRJ','crjColumns','crjEntries'],['CDJ','cdjColumns','cdjEntries'],['PJ','pjColumns','pjEntries'],['GJ','gjColumns','gjEntries']];
  for(const [type,colKey,entryKey] of journalTypes){
    await syncMany('journal_columns',((client as any)[colKey]||[]).map((c:any)=>({id:strId(c.id),journal_type:type,name:c.name,type:c.type,category:c.category,is_system:!!c.isSystem})));
    await syncMany('journal_entries',((client as any)[entryKey]||[]).map((e:any)=>({id:strId(e.id),journal_type:type,values:e.values||{},auto:!!e.auto,auto_source:e.autoSource||null})));
  }
  await syncMany('journal_vouchers',(client.journalVouchers||[]).map((v:any)=>({id:strId(v.id),date:v.date,reference:v.reference||null,memo:v.memo||null})));
  const jvl:any[]=[];(client.journalVouchers||[]).forEach((v:any)=>(v.lines||[]).forEach((l:any)=>jvl.push({id:strId(l.id),journal_voucher_id:strId(v.id),account_id:l.accountId||null,account_name:l.accountName||null,debit:Number(l.debit||0),credit:Number(l.credit||0)}))); await syncMany('journal_voucher_lines',jvl);
  await syncMany('purchase_orders',(client.purchaseOrders||[]).map((o:any)=>({id:strId(o.id),date:o.date,supplier_id:o.supplierId||null,supplier_name:o.supplierName||null,total_amount:Number(o.totalAmount||0),status:o.status})));
  const poi:any[]=[];(client.purchaseOrders||[]).forEach((o:any)=>(o.items||[]).forEach((i:any,iIndex:number)=>poi.push({id:`${o.id}:item:${iIndex}`,purchase_order_id:strId(o.id),item_code:i.itemCode||null,description:i.description||null,qty:Number(i.qty||0),unit_price:Number(i.unitPrice||0)}))); await syncMany('purchase_order_items',poi);
  await syncMany('receiving_reports',(client.receivingReports||[]).map((r:any)=>({id:strId(r.id),date:r.date,po_id:r.poId||null,supplier_name:r.supplierName||null,total_amount:Number(r.totalAmount||0),received_by:r.receivedBy||null})));
  const rri:any[]=[];(client.receivingReports||[]).forEach((r:any)=>(r.items||[]).forEach((i:any,iIndex:number)=>rri.push({id:`${r.id}:item:${iIndex}`,receiving_report_id:strId(r.id),item_code:i.itemCode||null,description:i.description||null,qty_ordered:Number(i.qtyOrdered||0),qty_received:Number(i.qtyReceived||0),unit_price:Number(i.unitPrice||0)}))); await syncMany('receiving_report_items',rri);
  await syncMany('payable_invoices',(client.payableInvoices||[]).map((i:any)=>({id:strId(i.id),invoice_number:i.invoiceNumber||null,date:i.date,due_date:i.dueDate||null,po_id:i.poId||null,rr_id:i.rrId||null,supplier_id:i.supplierId||null,supplier_name:i.supplierName||null,subtotal:Number(i.subtotal||0),vat_amount:Number(i.vatAmount||0),is_vatable:!!i.isVatable,withholding_tax_id:i.withholdingTaxId||null,wht_amount:i.whtAmount??null,total_amount:Number(i.totalAmount||0),status:i.status,discrepancy_details:i.discrepancyDetails||null,applied_prepayments:i.appliedPrepayments??null})));
  const pii:any[]=[];(client.payableInvoices||[]).forEach((i:any)=>(i.items||[]).forEach((x:any,xIndex:number)=>pii.push({id:`${i.id}:item:${xIndex}`,payable_invoice_id:strId(i.id),item_code:x.itemCode||null,description:x.description||null,qty:Number(x.qty||0),unit_price:Number(x.unitPrice||0)}))); await syncMany('payable_invoice_items',pii);
  await syncMany('inventory_columns',(client.inventoryColumns||[]).map((c:any)=>({id:strId(c.id),label:c.label})));
  await syncMany('inventory_items',(client.inventoryItems||[]).map((i:any)=>({id:strId(i.id),code:i.code,name:i.name,sku:i.sku||null,description:i.description||null,category:i.category,unit_of_measure:i.unitOfMeasure,cost_price:Number(i.costPrice||0),selling_price:Number(i.sellingPrice||0),stock_level:Number(i.stockLevel||0),reorder_point:Number(i.reorderPoint||0),location:i.location||null,custom_fields:i.customFields||{}})));
  await syncMany('inventory_movements',(client.inventoryMovements||[]).map((m:any)=>({id:strId(m.id),item_id:m.itemId||null,item_name:m.itemName||null,item_code:m.itemCode||null,date:m.date,type:m.type,qty:Number(m.qty||0),unit_cost:Number(m.unitCost||0),total_value:Number(m.totalValue||0),reference:m.reference||null,notes:m.notes||null})));
  await syncMany('app_folders',(client.folders||[]).map((f:any)=>({id:strId(f.id),name:f.name,is_default:!!f.isDefault,type:f.type||'custom'})));
  await syncMany('app_files',(client.files||[]).filter((f:any)=>f.storagePath).map((f:any)=>({id:strId(f.id),name:f.name,type:f.type||'application/octet-stream',size:Number(f.size||0),uploaded_at:f.uploadedAt||new Date().toISOString(),folder_id:f.folderId||null,storage_path:f.storagePath,description:f.description||null})));
  // Persist TIN Library entries with a stable ID. Older UI-created entries may
  // not have an id, so never send "undefined" as a primary key. A deterministic
  // ID based on party type + TIN also prevents the same supplier/customer from
  // being inserted repeatedly during client synchronization.
  const tins=[
    ...(client.tinLibrary?.customers||[]).map((x:any)=>({...x,partyType:'customer'})),
    ...(client.tinLibrary?.suppliers||[]).map((x:any)=>({...x,partyType:'supplier'}))
  ];
  await syncMany('tin_entries', tins.map((x:any)=>{
    const normalizedTin=String(x.tin||'').replace(/\D/g,'');
    const stableId=`tin_${x.partyType}_${normalizedTin || String(x.name||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_')}`;
    return {
      // TIN + party type is the logical identity of a library entry. Prefer
      // the stable identity for UI-created entries so the 4th supplier can
      // never reuse/overwrite the 3rd supplier's primary key.
      id: strId(x.id || stableId),
      tin:String(x.tin||''),
      name:String(x.name||'').trim(),
      address:x.address||null,
      party_type:x.partyType
    };
  }));
  await syncMany('tax_deadlines',(client.taxDeadlines||[]).map((t:any)=>({id:strId(t.id),form_type:t.formType,title:t.title,period:t.period,due_date:t.dueDate,status:t.status,tax_status:t.taxStatus||null,amount_due:t.amountDue??null,date_filed:t.dateFiled||null,date_paid:t.datePaid||null,reference_no:t.referenceNo||null,confirmation_no:t.confirmationNo||null,notes:t.notes||null})));
  await syncMany('bank_accounts',(client.bankAccounts||[]).map((b:any)=>({id:strId(b.id),bank_name:b.bankName,account_number:b.accountNumber,balance:Number(b.balance||0)})));
  await syncMany('supplier_advances',(client.supplierAdvances||[]).map((a:any)=>({id:strId(a.id),supplier_id:a.supplierId||null,supplier_name:a.supplierName||null,date:a.date,amount:Number(a.amount||0),is_liquidated:!!a.isLiquidated,notes:a.notes||null})));
  await syncMany('withholding_tax_entries',(client.withholdingTaxEntries||[]).map((w:any)=>({id:strId(w.id),atc_code:w.atcCode,description:w.description,tax_rate:Number(w.taxRate||0),category:w.category})));
  await syncMany('debit_credit_memos',(client.debitCreditMemos||[]).map((m:any)=>({id:strId(m.id),type:m.type,invoice_id:m.invoiceId||null,invoice_number:m.invoiceNumber||null,supplier_name:m.supplierName||null,date:m.date,amount:Number(m.amount||0),reason:m.reason})));
  await syncMany('check_vouchers',(client.checkVouchers||[]).map((v:any)=>({id:strId(v.id),date:v.date,payee_name:v.payeeName,invoice_id:v.invoiceId||null,invoice_number:v.invoiceNumber||null,payment_type:v.paymentType,misc_details:v.miscDetails||null,amount:Number(v.amount||0),checked_by:v.checkedBy||null,approved_by:v.approvedBy||null,bank_account_id:v.bankAccountId||null,bank_name:v.bankName||null,check_number:v.checkNumber||null,status:v.status,reversed_reason:v.reversedReason||null,reversed_at:v.reversedAt||null})));
  await syncMany('miscellaneous_payments',(client.miscellaneousPayments||[]).map((m:any)=>({id:strId(m.id),date:m.date,payee_name:m.payeeName,amount:Number(m.amount||0),bank_account_id:m.bankAccountId||null,bank_name:m.bankName||null,check_number:m.checkNumber||null,expense_category:m.expenseCategory||null,description:m.description||null})));
  await syncMany('asset_lapsing_schedule',(client.assetLapsingSchedule||[]).map((a:any)=>({id:strId(a.id),date_purchased:a.datePurchased,invoice_no:a.invoiceNo||null,description:a.description,cost:Number(a.cost||0),useful_life_years:Number(a.usefulLifeYears||0),salvage_value:Number(a.salvageValue||0)})));
  await syncMany('billing_invoices',(client.billingInvoices||[]).map((b:any)=>({id:strId(b.id),date:b.date,due_date:b.dueDate,invoice_no:b.invoiceNo,customer_tin:b.customerTin||null,customer_name:b.customerName||null,customer_address:b.customerAddress||null,vat_type:b.vatType||null,amount:Number(b.amount||0),net_of_vat:Number(b.netOfVat||0),output_tax:Number(b.outputTax||0),description:b.description||null,status:b.status,payment_type:b.paymentType||null,date_paid:b.datePaid||null,is_recurring:!!b.isRecurring,recurrence_frequency:b.recurrenceFrequency||null,next_billing_date:b.nextBillingDate||null,parent_invoice_id:b.parentInvoiceId||null})));
  const snaps:any[]=[]; if(client.plData) snaps.push({id:`${clientId}:pl`,report_type:'P&L',period_key:client.plData.period||'current',data:client.plData}); if(client.bsData) snaps.push({id:`${clientId}:bs`,report_type:'Balance Sheet',period_key:client.bsData.asOfDate||'current',data:client.bsData}); if(client.cfData) snaps.push({id:`${clientId}:cf`,report_type:'Cash Flow',period_key:client.cfData.period||'current',data:client.cfData}); await syncMany('financial_report_snapshots',snaps);
};

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
        const legacy = (row.data || {}) as Partial<Client>;
        let normalized: Partial<Client> = {};
        try { normalized = await loadNormalizedClient(row.id); } catch (e) { console.warn('Normalized client load failed; using legacy payload:', e); }
        cloudClients[row.id] = {
          ...(legacy as Client), id: row.id, name: row.name || legacy.name || 'Client',
          tin: row.tin ?? legacy.tin, taxpayerClassification: row.taxpayer_classification ?? legacy.taxpayerClassification,
          registeredName: row.registered_name ?? legacy.registeredName, lastName: row.last_name ?? legacy.lastName, firstName: row.first_name ?? legacy.firstName,
          middleName: row.middle_name ?? legacy.middleName, tradeName: row.trade_name ?? legacy.tradeName, substreet: row.substreet ?? legacy.substreet,
          street: row.street ?? legacy.street, barangay: row.barangay ?? legacy.barangay, district: row.district ?? legacy.district, city: row.city ?? legacy.city,
          zipCode: row.zip_code ?? legacy.zipCode, rdoCode: row.rdo_code ?? legacy.rdoCode, phone: row.phone ?? legacy.phone, email: row.email ?? legacy.email,
          category: row.category ?? legacy.category, hasMultipleBusinessLines: row.has_multiple_business_lines ?? legacy.hasMultipleBusinessLines,
          accountingType: row.accounting_type ?? legacy.accountingType, fiscalMonthEnd: row.fiscal_month_end ?? legacy.fiscalMonthEnd, coaFormat: row.coa_format ?? legacy.coaFormat,
          tinLibrary: normalized.tinLibrary ?? legacy.tinLibrary ?? {customers:[], suppliers:[]},
          sales: normalized.sales ?? legacy.sales ?? [], purchases: normalized.purchases ?? legacy.purchases ?? [], expenses: normalized.expenses ?? legacy.expenses ?? [],
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
      const restoredId =
        savedActiveClientId && clients[savedActiveClientId] ? savedActiveClientId : Object.keys(clients)[0];
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
          const legacy = (row.data || {}) as Partial<Client>;
          let normalized: Partial<Client> = {};
          try { normalized = await loadNormalizedClient(row.id); } catch (e) { console.warn('Normalized client load failed; using legacy payload:', e); }
          cloudClients[row.id] = { ...(legacy as Client), id: row.id, name: row.name || legacy.name || 'Client',
            tin: row.tin ?? legacy.tin, taxpayerClassification: row.taxpayer_classification ?? legacy.taxpayerClassification, registeredName: row.registered_name ?? legacy.registeredName,
            lastName: row.last_name ?? legacy.lastName, firstName: row.first_name ?? legacy.firstName, middleName: row.middle_name ?? legacy.middleName, tradeName: row.trade_name ?? legacy.tradeName,
            substreet: row.substreet ?? legacy.substreet, street: row.street ?? legacy.street, barangay: row.barangay ?? legacy.barangay, district: row.district ?? legacy.district, city: row.city ?? legacy.city,
            zipCode: row.zip_code ?? legacy.zipCode, rdoCode: row.rdo_code ?? legacy.rdoCode, phone: row.phone ?? legacy.phone, email: row.email ?? legacy.email, category: row.category ?? legacy.category,
            hasMultipleBusinessLines: row.has_multiple_business_lines ?? legacy.hasMultipleBusinessLines, accountingType: row.accounting_type ?? legacy.accountingType, fiscalMonthEnd: row.fiscal_month_end ?? legacy.fiscalMonthEnd, coaFormat: row.coa_format ?? legacy.coaFormat,
            tinLibrary: normalized.tinLibrary ?? legacy.tinLibrary ?? {customers:[], suppliers:[]}, sales: normalized.sales ?? legacy.sales ?? [], purchases: normalized.purchases ?? legacy.purchases ?? [], expenses: normalized.expenses ?? legacy.expenses ?? [], ...(normalized as any) } as Client;
        }
        mergeCloudClients(cloudClients);
        setIsSyncing(false);
        setIsReady(true);
        setSyncError(null);

        // Subscribe to realtime changes so multiple devices stay in sync (replaces onSnapshot)
        clientsChannel = supabase
          .channel(`clients-${user.id}`)
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${user.id}` },
            (payload) => {
              if (payload.eventType === 'DELETE') {
                setClients((prev) => { const next={...prev}; delete next[(payload.old as any).id]; return next; });
              } else {
                const row = payload.new as any;
                loadNormalizedClient(row.id).then(normalized => setClients(prev => ({ ...prev, [row.id]: { ...(prev[row.id] || {} as Client), id:row.id, name:row.name, tin:row.tin, taxpayerClassification:row.taxpayer_classification, registeredName:row.registered_name, lastName:row.last_name, firstName:row.first_name, middleName:row.middle_name, tradeName:row.trade_name, substreet:row.substreet, street:row.street, barangay:row.barangay, district:row.district, city:row.city, zipCode:row.zip_code, rdoCode:row.rdo_code, phone:row.phone, email:row.email, category:row.category, hasMultipleBusinessLines:row.has_multiple_business_lines, accountingType:row.accounting_type, fiscalMonthEnd:row.fiscal_month_end, coaFormat:row.coa_format, ...(normalized as any) } as Client }))).catch(e=>console.warn('Realtime normalized reload failed',e));
              }
            }
          )
          .subscribe();
      } catch (error) {
        clearTimeout(timeout);
        if (isTimedOut) return;

        console.error('Sync error:', error);
        let msg = error instanceof Error ? error.message : String(error);

        if (msg.toLowerCase().includes('permission') || msg.toLowerCase().includes('rls')) {
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
          persistNormalizedClient(matchingClient, user.id).catch((error) => console.error('Auto-syncing owner client failed:', error));
        }
      }

      // Clean up stray client records that duplicate the accountant's own business profile
      // (e.g. leftover entries created before owner-profile syncing existed). These should
      // never be listed as a client, so remove any non-owner client that matches the
      // business profile by name.
      const normalizedBizName = businessProfile.name?.trim().toLowerCase();
      if (normalizedBizName) {
        const strayIds = Object.values(clients)
          .filter(
            (client: Client) =>
              client.id !== ownerId && client.name?.trim().toLowerCase() === normalizedBizName
          )
          .map((client: Client) => client.id);

        if (strayIds.length > 0) {
          setClients((prev) => {
            const updated = { ...prev };
            strayIds.forEach((id) => delete updated[id]);
            return updated;
          });

          if (currentClientId && strayIds.includes(currentClientId)) {
            setCurrentClientId(ownerId);
          }

          if (isReady) {
            strayIds.forEach((id) => {
              supabase
                .from('clients')
                .delete()
                .eq('id', id)
                .then(({ error }) => {
                  if (error) console.error('Cleaning up stray owner-duplicate client failed:', error);
                });
            });
          }
        }
      }
    }
  }, [businessProfile, clients, currentClientId, user, isReady]);

  const mapPurchaseRow = (p: any, clientId: string) => ({
    id: strId(p.id), client_id: clientId, dat_month_year: p.datMonthYear || null,
    date: p.date || null, payment_method: p.paymentMethod || '',
    check_number: p.checkNumber || null, bank_name: p.bankName || null,
    invoice_no: p.invoiceNo || null, supplier_name: p.supplierName || '',
    supplier_address: p.supplierAddress || null, supplier_tin: p.supplierTin || null,
    amount: Number(p.amount || 0), vat_type: p.vatType || null,
    expense_type: p.expenseType || null, account_title: p.accountTitle || null,
    transaction_details: p.transactionDetails || null, input_tax: Number(p.inputTax || 0),
    attachment_name: p.attachment?.name || null, attachment_type: p.attachment?.type || null,
    attachment_original_type: p.attachment?.originalType || null,
    attachment_size: p.attachment?.size || null,
    attachment_original_size: p.attachment?.originalSize || null,
    attachment_compression: p.attachment?.compression || null,
    attachment_storage_path: p.attachment?.storagePath || null,
    withholding_option: p.withholdingOption || null, atc_code: p.atcCode || null,
    wht_rate: p.whtRate ?? null, wht_amount: p.whtAmount ?? null,
  });

  const savePurchase = async (clientId: string, purchase: any) => {
    if (!user) return;
    const row = mapPurchaseRow(purchase, clientId);
    const { error } = await supabase.from('purchases').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    setClients(prev => {
      const c = prev[clientId];
      if (!c) return prev;
      const list = c.purchases || [];
      const exists = list.some((p:any) => String(p.id) === String(purchase.id));
      return { ...prev, [clientId]: { ...c, purchases: exists ? list.map((p:any) => String(p.id) === String(purchase.id) ? purchase : p) : [...list, purchase] } };
    });
  };

  const deletePurchase = async (clientId: string, purchaseId: string | number) => {
    if (!user) return;
    const { error } = await supabase.from('purchases').delete().eq('client_id', clientId).eq('id', String(purchaseId));
    if (error) throw error;
    setClients(prev => {
      const c = prev[clientId];
      if (!c) return prev;
      return { ...prev, [clientId]: { ...c, purchases: (c.purchases || []).filter((p:any) => String(p.id) !== String(purchaseId)) } };
    });
  };

  const saveClient = async (id: string, clientData: Client) => {
    const updatedClient = { ...clientData, id, userId: user ? user.id : undefined } as Client;
    setClients((prev) => ({ ...prev, [id]: updatedClient }));
    if (!user) return;
    try {
      await persistNormalizedClient(updatedClient, user.id);
      showToast('Saved to normalized Supabase tables');
    } catch (error) {
      console.error('Normalized client save failed:', error);
      await handleSupabaseError(error, OperationType.UPDATE, `normalized-client/${id}`);
    }
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
        await persistNormalizedClient(newClient, user.id);
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

        await persistNormalizedClient(matchingClient, user.id);

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
        savePurchase,
        deletePurchase,
        addClient,
        deleteClient,
        saveBusinessProfile,
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
