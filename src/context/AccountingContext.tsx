import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Client, BusinessProfile, DatSelection } from '../types';
import { supabase } from '../lib/supabase';
import { toast } from '../components/ui/Toast';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { useAuth } from './AuthContext';
import { handleSupabaseError, OperationType } from '../lib/supabaseUtils';
import { syncGeneralLedger, syncCashDisbursementsJournal, syncSalesJournal, syncCashReceiptsJournal, syncPurchasesJournal } from '../lib/glPosting';
import {
  getCachedCursor, setCachedCursor, clearCachedCursor, putCachedRows, getCachedRows,
  applyCachedRowDelta, clearCachedRows, queueDirtyWrite, flushDirtyQueue,
  pendingDirtyCount, recordCacheHit, invalidateQueries, validateCacheSchema,
} from '../db/localDb';

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
  saveClientProfile: (id: string, clientData: Client) => Promise<void>;
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
  addClient: (name: string) => Promise<string | null>;
  deleteClient: (id: string) => Promise<void>;
  saveBusinessProfile: (profile: BusinessProfile) => Promise<void>;
  saveFolder: (folder: any) => Promise<void>;
  deleteFolder: (folderId: string) => Promise<void>;
  saveFile: (file: any) => Promise<void>;
  deleteFile: (fileId: string) => Promise<void>;
  // Editable report snapshots (P&L / Balance Sheet / Cash Flow), the Asset
  // Lapsing schedule, and Tax Compliance deadlines are each persisted to
  // their own normalized table. These save helpers were referenced by the
  // report/compliance pages but were never implemented on the context, so
  // calling them threw "saveX is not a function" and crashed the page.
  saveFinancialReportSnapshot: (reportType: string, data: any) => Promise<void>;
  saveAssetLapsingSchedule: (entries: any[]) => Promise<void>;
  saveTaxDeadlines: (deadlines: any[]) => Promise<void>;
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
  'sjColumns', 'sjEntries', 'gjColumns', 'gjEntries', 'journalVouchers',
  'inventoryItems', 'inventoryMovements', 'inventoryColumns',
  'folders', 'files', 'taxDeadlines', 'bankAccounts',     'assetLapsingSchedule', 'billingInvoices', 'tinLibrary', 'plData', 'bsData', 'cfData'
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

// Explicit column projections for every normalized table. Selecting '*' was
// pulling every column (including ones the mapping below never reads) across
// 19 tables on every single client load, which is pure wasted PostgREST
// egress. Each list below is exactly the set of columns actually consumed
// further down in this function.
const PURCHASES_COLUMNS = 'id,dat_month_year,date,payment_method,check_number,bank_name,invoice_no,supplier_name,supplier_address,supplier_tin,amount,vat_type,expense_type,account_title,transaction_details,input_tax,exempt_amount,zero_rated_amount,attachment_name,attachment_type,attachment_original_type,attachment_size,attachment_original_size,attachment_compression,attachment_storage_path,withholding_option,atc_code,wht_rate,wht_amount';
const SALES_COLUMNS = 'id,dat_month_year,date,ref,payment_type,buyer_tin,buyer_name,buyer_address,vat_type,amount,net_of_vat,output_tax,income_type,description';
const COA_COLUMNS_COLUMNS = 'id,name,is_system';
const COA_ACCOUNTS_COLUMNS = 'id,name,type,normal_side,parent_id,hidden,opening_balance,custom_values';
const JOURNAL_COLUMNS_COLUMNS = 'id,journal_type,name,type,category,is_system';
const JOURNAL_ENTRIES_COLUMNS = 'id,journal_type,values,auto,auto_source';
const JOURNAL_VOUCHERS_COLUMNS = 'id,date,reference,memo';
const JOURNAL_VOUCHER_LINES_COLUMNS = 'id,journal_voucher_id,account_id,account_name,debit,credit';
const INVENTORY_COLUMNS_COLUMNS = 'id,label';
const INVENTORY_ITEMS_COLUMNS = 'id,code,name,sku,description,category,unit_of_measure,cost_price,selling_price,stock_level,reorder_point,location,custom_fields';
const INVENTORY_MOVEMENTS_COLUMNS = 'id,item_id,item_name,item_code,date,type,qty,unit_cost,total_value,reference,notes';
const APP_FOLDERS_COLUMNS = 'id,name,is_default,type';
const APP_FILES_COLUMNS = 'id,name,type,size,uploaded_at,folder_id,storage_path,description';
const TIN_ENTRIES_COLUMNS = 'id,party_type,tin,name,address';
const TAX_DEADLINES_COLUMNS = 'id,form_type,title,period,due_date,status,tax_status,amount_due,date_filed,date_paid,reference_no,confirmation_no,notes';
const BANK_ACCOUNTS_COLUMNS = 'id,bank_name,account_number,balance';
const ASSET_LAPSING_COLUMNS = 'id,date_purchased,invoice_no,description,cost,useful_life_years,salvage_value';
const BILLING_INVOICES_COLUMNS = 'id,date,due_date,invoice_no,customer_tin,customer_name,customer_address,vat_type,amount,net_of_vat,output_tax,description,status,payment_type,date_paid,is_recurring,recurrence_frequency,next_billing_date,parent_invoice_id';
const SNAPSHOTS_COLUMNS = 'report_type,data';

// The `clients` table also carries a legacy `data` jsonb blob plus `address`,
// `tax_id`, `created_at`, and `updated_at` columns that nothing here reads.
// select('*') was shipping all of that on every client-list load and on
// every single realtime row refresh. Project only what's mapped below.
const CLIENTS_LIST_COLUMNS = 'id,name,tin,taxpayer_classification,registered_name,last_name,first_name,middle_name,trade_name,substreet,street,barangay,district,city,zip_code,rdo_code,phone,email,category,has_multiple_business_lines,accounting_type,fiscal_month_end,coa_format';

// ---------------------------------------------------------------------------
// Incremental ("delta") sync for the highest-volume, most-frequently-edited
// tables.
//
// loadNormalizedClient() used to re-download every row of every normalized
// table on every call (initial login AND every manual "sync"). For an
// established client with years of transactions, a re-sync could cost as
// much egress as the very first load. These 8 tables are exactly the ones
// already covered live by the Realtime subscription below, so they're the
// ones where we can safely track "have I already loaded this row" and only
// ask PostgREST for rows that changed since the last time we asked.
//
// How it works: each of these tables has a DB-maintained `updated_at`
// (bumped by a trigger on every insert/update - see schema.sql). We keep an
// in-memory cache of every row we've already fetched for a client, plus a
// cursor timestamp. On the next call we fetch only `updated_at >= cursor`
// and upsert those rows into the cache by id, then rebuild the mapped
// result from the merged cache instead of a fresh full table.
//
// Caveat (documented, not silently swept under the rug): a delta fetch
// cannot see rows that were deleted, since a deleted row simply isn't
// returned by any filter. That's why updateRealtimeClient() below also
// evicts a row from this cache the moment a DELETE event arrives - as long
// as the Realtime channel stays connected (it's opened right after the
// first load and kept open for the session), the cache stays correct. A
// delete that happens while the tab is closed/disconnected is caught the
// next time this client gets its one-time full load in a fresh session.
const DELTA_SYNC_TABLES = [
  { table: 'purchases', columns: PURCHASES_COLUMNS },
  { table: 'sales', columns: SALES_COLUMNS },
  { table: 'coa_columns', columns: COA_COLUMNS_COLUMNS },
  { table: 'coa_accounts', columns: COA_ACCOUNTS_COLUMNS },
  { table: 'journal_columns', columns: JOURNAL_COLUMNS_COLUMNS },
  { table: 'journal_entries', columns: JOURNAL_ENTRIES_COLUMNS },
  { table: 'journal_vouchers', columns: JOURNAL_VOUCHERS_COLUMNS },
  { table: 'journal_voucher_lines', columns: JOURNAL_VOUCHER_LINES_COLUMNS },
] as const;

interface DeltaCacheEntry {
  cursor: string;
  // table name -> (row id -> raw row)
  rows: Map<string, Map<string, any>>;
}

// Module-level so it survives across renders/effects for the lifetime of the
// tab, but resets on a hard page reload (which is fine - the very next load
// just falls back to a full fetch per table, same as before this change).
const deltaSyncCache = new Map<string, DeltaCacheEntry>();

const getDeltaRows = (entry: DeltaCacheEntry, table: string): any[] =>
  Array.from(entry.rows.get(table)?.values() ?? []);

const upsertDeltaRows = (entry: DeltaCacheEntry, table: string, freshRows: any[]) => {
  let rowMap = entry.rows.get(table);
  if (!rowMap) { rowMap = new Map(); entry.rows.set(table, rowMap); }
  for (const row of freshRows) rowMap.set(String(row.id), row);
};

// Exposed so a client that's deleted/removed doesn't keep its cache around
// forever, and so a hard "resync from scratch" can be forced if ever needed.
export const clearNormalizedClientCache = (clientId?: string) => {
  if (clientId) deltaSyncCache.delete(clientId);
  else deltaSyncCache.clear();
  clearCachedRows(clientId).catch(() => {}); // best-effort
};


// Offline write queue: mutations that fail while offline are persisted to
// IndexedDB and flushed (in order) when the browser fires `online`.
const withOfflineQueue = async (
  table: string,
  clientId: string,
  op: 'put' | 'delete',
  row: unknown,
  doWrite: () => Promise<void>
): Promise<void> => {
  try {
    await doWrite();
  } catch (e) {
    if (!navigator.onLine) {
      await queueDirtyWrite(table, clientId, op, row);
      console.info('[localDb] queued offline write to', table);
      return;
    }
    throw e;
  }
};

const loadNormalizedClient = async (clientId: string): Promise<Partial<Client>> => {
  // Timestamp captured *before* any query fires, so the next delta sync's
  // `>=` filter can't miss a row that changes mid-request.
  const requestStartedAt = new Date().toISOString();
  let cacheEntry = deltaSyncCache.get(clientId);

  // Cold start (fresh tab): rebuild the in-memory delta cache from IndexedDB
  // so we issue a tiny `updated_at >= cursor` delta query instead of a full
  // re-download of every normalized table. This is what cuts PostgREST egress.
  if (!cacheEntry) {
    const persistedCursor = await getCachedCursor(clientId);
    if (persistedCursor) {
      const hydrated: DeltaCacheEntry = { cursor: persistedCursor, rows: new Map() };
      let rowCount = 0;
      for (const { table } of DELTA_SYNC_TABLES) {
        const rows = await getCachedRows(table, clientId);
        if (rows.length) { upsertDeltaRows(hydrated, table, rows); rowCount += rows.length; }
      }
      deltaSyncCache.set(clientId, hydrated);
      cacheEntry = hydrated;
      recordCacheHit(rowCount * 256);
    }
  }

  const deltaQueryPromises = DELTA_SYNC_TABLES.map(({ table, columns }) => {
    let query = supabase.from(table).select(`${columns},updated_at`).eq('client_id', clientId);
    if (cacheEntry) query = query.gte('updated_at', cacheEntry.cursor);
    return query;
  });

  // These 11 tables are lower-volume/lower-churn (settings, folders,
  // deadlines, etc.) and aren't covered by the Realtime subscription, so
  // they're kept as plain full fetches - already column-trimmed above.
  const fullQueryPromises = [
    supabase.from('inventory_columns').select(INVENTORY_COLUMNS_COLUMNS).eq('client_id', clientId),
    supabase.from('inventory_items').select(INVENTORY_ITEMS_COLUMNS).eq('client_id', clientId),
    supabase.from('inventory_movements').select(INVENTORY_MOVEMENTS_COLUMNS).eq('client_id', clientId),
    supabase.from('app_folders').select(APP_FOLDERS_COLUMNS).eq('client_id', clientId),
    supabase.from('app_files').select(APP_FILES_COLUMNS).eq('client_id', clientId),
    supabase.from('tin_entries').select(TIN_ENTRIES_COLUMNS).eq('client_id', clientId),
    supabase.from('tax_deadlines').select(TAX_DEADLINES_COLUMNS).eq('client_id', clientId),
    supabase.from('bank_accounts').select(BANK_ACCOUNTS_COLUMNS).eq('client_id', clientId),
    supabase.from('asset_lapsing_schedule').select(ASSET_LAPSING_COLUMNS).eq('client_id', clientId),
    supabase.from('billing_invoices').select(BILLING_INVOICES_COLUMNS).eq('client_id', clientId),
    supabase.from('financial_report_snapshots').select(SNAPSHOTS_COLUMNS).eq('client_id', clientId),
  ];

  const [deltaResults, inventoryColumns, inventoryItems, inventoryMovements, folders, files,
    tinEntries, taxDeadlines, bankAccounts, assetLapsingSchedule, billingInvoices, snapshots] =
    await Promise.all([Promise.all(deltaQueryPromises), ...fullQueryPromises]);

  const responses = [...deltaResults, inventoryColumns, inventoryItems, inventoryMovements,
    folders, files, tinEntries, taxDeadlines, bankAccounts, assetLapsingSchedule, billingInvoices, snapshots];
  const responseNames = [
    ...DELTA_SYNC_TABLES.map(t => t.table),
    'inventory_columns', 'inventory_items', 'inventory_movements', 'app_folders', 'app_files',
    'tin_entries', 'tax_deadlines', 'bank_accounts', 'asset_lapsing_schedule', 'billing_invoices',
    'financial_report_snapshots',
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

  // Merge this batch's delta rows into the cache, then read the *merged*
  // (not just freshly-fetched) rows back out for mapping below.
  const activeEntry: DeltaCacheEntry = cacheEntry ?? { cursor: requestStartedAt, rows: new Map() };
  DELTA_SYNC_TABLES.forEach(({ table }, i) => {
    upsertDeltaRows(activeEntry, table, (deltaResults[i] as any).data || []);
  });
  activeEntry.cursor = requestStartedAt;
  deltaSyncCache.set(clientId, activeEntry);

  // Persist fetched rows + watermark to IndexedDB so the next cold start is
  // a delta pull. Fire-and-forget — never block the UI on IndexedDB writes.
  (async () => {
    try {
      for (const { table } of DELTA_SYNC_TABLES) {
        await putCachedRows(table, clientId, getDeltaRows(activeEntry, table));
      }
      await setCachedCursor(clientId, requestStartedAt);
    } catch (e) { console.warn('[localDb] persist failed (non-fatal)', e); }
  })();

  const pRows = getDeltaRows(activeEntry, 'purchases');
  const sRows = getDeltaRows(activeEntry, 'sales');
  const ccRows = getDeltaRows(activeEntry, 'coa_columns');
  const caRows = getDeltaRows(activeEntry, 'coa_accounts');
  const jcRows = getDeltaRows(activeEntry, 'journal_columns');
  const jeRows = getDeltaRows(activeEntry, 'journal_entries');
  const jvRows = getDeltaRows(activeEntry, 'journal_vouchers');
  const jvlRows = getDeltaRows(activeEntry, 'journal_voucher_lines');
  const icRows = (inventoryColumns as any).data || [];
  const iiRows = (inventoryItems as any).data || [];
  const imRows = (inventoryMovements as any).data || [];
  const fRows = (folders as any).data || [];
  const fileRows = (files as any).data || [];
  const tinRows = (tinEntries as any).data || [];
  const tdRows = (taxDeadlines as any).data || [];
  const baRows = (bankAccounts as any).data || [];
  const alsRows = (assetLapsingSchedule as any).data || [];
  const biRows = (billingInvoices as any).data || [];
  const snapshotRows = (snapshots as any).data || [];

  const linesByVoucher = new Map<string, any[]>();
  jvlRows.forEach((r:any) => { const a=linesByVoucher.get(r.journal_voucher_id)||[]; a.push({ id:strId(r.id), accountId:r.account_id||'', accountName:r.account_name||'', debit:Number(r.debit||0), credit:Number(r.credit||0) }); linesByVoucher.set(r.journal_voucher_id,a); });

  const result: Partial<Client> = {
    purchases: pRows.map((r:any) => ({ id:Number(r.id) || r.id, datMonthYear:r.dat_month_year||'', date:rowDate(r.date), paymentMethod:r.payment_method||'', checkNumber:r.check_number, bankName:r.bank_name, invoiceNo:r.invoice_no||'', supplierName:r.supplier_name||'', supplierAddress:r.supplier_address||'', supplierTin:r.supplier_tin||'', amount:Number(r.amount||0), vatType:r.vat_type||'', expenseType:r.expense_type||'', accountTitle:r.account_title||'', transactionDetails:r.transaction_details, inputTax:Number(r.input_tax||0), exemptAmount:Number(r.exempt_amount||0), zeroRatedAmount:Number(r.zero_rated_amount||0), attachment:r.attachment_name ? { name:r.attachment_name, type:r.attachment_type||'', originalType:r.attachment_original_type||r.attachment_type||'', size:Number(r.attachment_size||0), originalSize:Number(r.attachment_original_size||r.attachment_size||0), compression:r.attachment_compression as any, content:'', storagePath:r.attachment_storage_path } : undefined, withholdingOption:r.withholding_option as any, atcCode:r.atc_code, whtRate:r.wht_rate == null ? null : Number(r.wht_rate), whtAmount:r.wht_amount == null ? undefined : Number(r.wht_amount) })),
    sales: sRows.map((r:any) => ({ id:Number(r.id)||r.id, datMonthYear:r.dat_month_year||'', date:rowDate(r.date), ref:r.ref||'', paymentType:r.payment_type||'', buyerTin:r.buyer_tin||'', buyerName:r.buyer_name||'', buyerAddress:r.buyer_address||'', vatType:r.vat_type||'', amount:Number(r.amount||0), netOfVat:Number(r.net_of_vat||0), outputTax:Number(r.output_tax||0), incomeType:r.income_type||'', desc:r.description||'' })),
     expenses: purchasesToExpenses(pRows),
    coaColumns: ccRows.map((r:any) => ({ id:strId(r.id), name:r.name, isSystem:!!r.is_system })),
    accounts: caRows.map((r:any) => ({ id:strId(r.id), name:r.name, type:r.type, normalSide:r.normal_side, parentId:r.parent_id, hidden:!!r.hidden, openingBalance:Number(r.opening_balance||0), ...(r.custom_values||{}) })),
    crjColumns: jcRows.filter((r:any)=>r.journal_type==='CRJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    cdjColumns: jcRows.filter((r:any)=>r.journal_type==='CDJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    pjColumns: jcRows.filter((r:any)=>r.journal_type==='PJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    gjColumns: jcRows.filter((r:any)=>r.journal_type==='GJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    crjEntries: jeRows.filter((r:any)=>r.journal_type==='CRJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    cdjEntries: jeRows.filter((r:any)=>r.journal_type==='CDJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    pjEntries: jeRows.filter((r:any)=>r.journal_type==='PJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    sjColumns: jcRows.filter((r:any)=>r.journal_type==='SJ').map((r:any)=>({id:strId(r.id),name:r.name,type:r.type,category:r.category,isSystem:!!r.is_system})),
    sjEntries: jeRows.filter((r:any)=>r.journal_type==='SJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    gjEntries: jeRows.filter((r:any)=>r.journal_type==='GJ').map((r:any)=>({id:strId(r.id),values:r.values||{},auto:!!r.auto,autoSource:r.auto_source})),
    journalVouchers: jvRows.map((r:any)=>({id:strId(r.id),date:rowDate(r.date),reference:r.reference||'',memo:r.memo||'',lines:linesByVoucher.get(r.id)||[]})),
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
    coa_format:client.coaFormat||'numeric',updated_at:new Date().toISOString()
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
      const conflictTarget = table === 'coa_accounts' ? 'client_id,id' : 'id';
      const { error } = await supabase.from(table).upsert(part, { onConflict: conflictTarget });
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

    // Keep the delta-sync cache consistent with this write. A DELETE is
    // invisible to the `updated_at >= cursor` delta query (the row is simply
    // gone), so any stale id left in IndexedDB would resurrect on the next
    // refresh. Evict them here; best-effort, never fail the save on cache
    // trouble.
    if (staleIds.length) {
      for (const id of staleIds) {
        applyCachedRowDelta(table, clientId, 'delete', { id }).catch(() => {});
      }
    }
  };
  await syncMany('purchases',(client.purchases||[]).map((p:any)=>({id:strId(p.id),dat_month_year:p.datMonthYear||null,date:p.date,payment_method:p.paymentMethod||'',check_number:p.checkNumber||null,bank_name:p.bankName||null,invoice_no:p.invoiceNo||null,supplier_name:p.supplierName||'',supplier_address:p.supplierAddress||null,supplier_tin:p.supplierTin||null,amount:Number(p.amount||0),vat_type:p.vatType||null,expense_type:p.expenseType||null,account_title:p.accountTitle||null,transaction_details:p.transactionDetails||null,input_tax:Number(p.inputTax||0),attachment_name:p.attachment?.name||null,attachment_type:p.attachment?.type||null,attachment_original_type:p.attachment?.originalType||null,attachment_size:p.attachment?.size||null,attachment_original_size:p.attachment?.originalSize||null,attachment_compression:p.attachment?.compression||null,attachment_storage_path:p.attachment?.storagePath||null,withholding_option:p.withholdingOption||null,atc_code:p.atcCode||null,wht_rate:p.whtRate??null,wht_amount:p.whtAmount??null})));
  await syncMany('sales',(client.sales||[]).map((s:any)=>({id:strId(s.id),dat_month_year:s.datMonthYear||null,date:s.date,ref:s.ref||null,payment_type:s.paymentType||null,buyer_tin:s.buyerTin||null,buyer_name:s.buyerName||null,buyer_address:s.buyerAddress||null,vat_type:s.vatType||null,amount:Number(s.amount||0),net_of_vat:Number(s.netOfVat||0),output_tax:Number(s.outputTax||0),income_type:s.incomeType||null,description:s.desc||null})));
  await syncMany('coa_columns',(client.coaColumns||[]).map((c:any)=>({id:strId(c.id),name:c.name,is_system:!!c.isSystem})));
  await syncMany('coa_accounts',(client.accounts||[]).map((a:any)=>{const {id,name,type,normalSide,parentId,hidden,openingBalance,...custom}=a;return {id:strId(id),name:name||'',type:type||'',normal_side:normalSide||null,parent_id:parentId||null,hidden:!!hidden,opening_balance:Number(openingBalance||0),custom_values:custom};}));
  const journalTypes:[string,string,string][]=[['CRJ','crjColumns','crjEntries'],['CDJ','cdjColumns','cdjEntries'],['PJ','pjColumns','pjEntries'],['SJ','sjColumns','sjEntries'],['GJ','gjColumns','gjEntries']];
  for(const [type,colKey,entryKey] of journalTypes){
    await syncMany('journal_columns',((client as any)[colKey]||[]).map((c:any)=>({id:strId(c.id),journal_type:type,name:c.name,type:c.type,category:c.category,is_system:!!c.isSystem})));
    await syncMany('journal_entries',((client as any)[entryKey]||[]).map((e:any)=>({id:strId(e.id),journal_type:type,values:e.values||{},auto:!!e.auto,auto_source:e.autoSource||null})));
  }
  await syncMany('journal_vouchers',(client.journalVouchers||[]).map((v:any)=>({id:strId(v.id),date:v.date,reference:v.reference||null,memo:v.memo||null})));
  const jvl:any[]=[];(client.journalVouchers||[]).forEach((v:any)=>(v.lines||[]).forEach((l:any)=>jvl.push({id:strId(l.id),journal_voucher_id:strId(v.id),account_id:l.accountId||null,account_name:l.accountName||null,debit:Number(l.debit||0),credit:Number(l.credit||0)}))); await syncMany('journal_voucher_lines',jvl);
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
  const { user, userRole, membership } = useAuth();
  const dataOwnerId: string =
    membership?.isSubuser && membership?.ownerId ? membership.ownerId : user?.id ?? '';
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
      const { data, error } = await supabase.from('clients').select(CLIENTS_LIST_COLUMNS).eq('user_id', dataOwnerId);
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
      const ownerId = user ? ownerClientId(dataOwnerId) : null;
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
        const { data, error } = await supabase.from('clients').select(CLIENTS_LIST_COLUMNS).eq('user_id', dataOwnerId);
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

        // Keep Realtime lightweight. A child-row change used to trigger a full
        // reload of every normalized table for the client. That meant one saved
        // transaction could download the entire client again. Apply the changed
        // row directly to the in-memory client instead.
        // Sourced from DELTA_SYNC_TABLES so this list and the delta-sync cache
        // in loadNormalizedClient() can never drift apart - both need to agree
        // on exactly which tables are "live" for correctness (see the DELETE
        // eviction below).
        const normalizedRealtimeTables: string[] = DELTA_SYNC_TABLES.map(t => t.table);

        const updateRealtimeClient = (table: string, payload: any) => {
          const eventType = payload.eventType;
          const row = eventType === 'DELETE' ? (payload.old || {}) : (payload.new || {});
          const rowId = row.id == null ? '' : String(row.id);

          setClients(prev => {
            let clientId = row.client_id ? String(row.client_id) : '';

            // DELETE payloads may contain only the primary key unless the table
            // has REPLICA IDENTITY FULL. Find the owning client locally instead
            // of issuing another Supabase query just to process the event.
            if (!clientId && rowId) {
              for (const [candidateId, candidate] of Object.entries(prev)) {
                const c: any = candidate;
                const candidateLists: any[][] = [];
                if (table === 'journal_entries') {
                  const journalKeys = row.journal_type
                    ? [`${String(row.journal_type).toLowerCase()}Entries`]
                    : ['crjEntries', 'cdjEntries', 'pjEntries', 'sjEntries', 'gjEntries'];
                  journalKeys.forEach(key => candidateLists.push(c[key] || []));
                } else if (table === 'journal_columns') {
                  ['crjColumns', 'cdjColumns', 'pjColumns', 'sjColumns', 'gjColumns'].forEach(key => candidateLists.push(c[key] || []));
                } else {
                  const key = table === 'coa_accounts' ? 'accounts'
                    : table === 'coa_columns' ? 'coaColumns'
                    : table === 'purchases' ? 'purchases'
                    : table === 'sales' ? 'sales'
                    : table === 'journal_vouchers' ? 'journalVouchers' : '';
                  if (key) candidateLists.push(c[key] || []);
                }
                if (candidateLists.some(list => list.some((item: any) => String(item.id) === rowId))) {
                  clientId = candidateId;
                  break;
                }
                if (table === 'journal_voucher_lines') {
                  const vouchers = c.journalVouchers || [];
                  if (vouchers.some((v: any) => (v.lines || []).some((l: any) => String(l.id) === rowId))) {
                    clientId = candidateId;
                    break;
                  }
                }
              }
            }
            if (!clientId || !prev[clientId]) return prev;

            // Keep the delta-sync raw cache (used by loadNormalizedClient
            // above) honest: a DELETE can never be discovered by a
            // `updated_at >= cursor` query, since the row is simply gone.
            // Evict it here, while we still have the channel open and know
            // which client it belonged to, so the next resync doesn't
            // resurrect it from the cache.
            if (eventType === 'DELETE' && rowId) {
              const deltaEntry = deltaSyncCache.get(clientId);
              deltaEntry?.rows.get(table)?.delete(rowId);
            }

            // Keep the persisted IndexedDB cache consistent with the
            // in-memory delta cache so a later cold-start hydrate doesn't
            // re-download this row or resurrect a deleted one.
            if (normalizedRealtimeTables.includes(table) && clientId) {
              applyCachedRowDelta(
                table, clientId,
                eventType === 'DELETE' ? 'delete' : 'put',
                row
              ).catch(() => {});
            }

            const current: any = prev[clientId];
            const next: any = { ...current };

            const replaceRow = (key: string, mapped: any) => {
              const list = Array.isArray(current[key]) ? current[key] : [];
              if (eventType === 'DELETE') {
                next[key] = list.filter((item: any) => String(item.id) !== rowId);
              } else {
                const index = list.findIndex((item: any) => String(item.id) === rowId);
                next[key] = index >= 0
                  ? list.map((item: any, i: number) => i === index ? mapped : item)
                  : [...list, mapped];
              }
            };

            if (table === 'purchases') {
              if (eventType === 'DELETE') {
                replaceRow('purchases', null);
                next.expenses = purchasesToExpenses(next.purchases || []);
              } else {
                replaceRow('purchases', {
                  id: Number(row.id) || row.id, datMonthYear: row.dat_month_year || '', date: rowDate(row.date),
                  paymentMethod: row.payment_method || '', checkNumber: row.check_number, bankName: row.bank_name,
                  invoiceNo: row.invoice_no || '', supplierName: row.supplier_name || '', supplierAddress: row.supplier_address || '',
                  supplierTin: row.supplier_tin || '', amount: Number(row.amount || 0), vatType: row.vat_type || '',
                  expenseType: row.expense_type || '', accountTitle: row.account_title || '', transactionDetails: row.transaction_details,
                  inputTax: Number(row.input_tax || 0), attachment: row.attachment_name ? {
                    name: row.attachment_name, type: row.attachment_type || '', originalType: row.attachment_original_type || row.attachment_type || '',
                    size: Number(row.attachment_size || 0), originalSize: Number(row.attachment_original_size || row.attachment_size || 0),
                    compression: row.attachment_compression, content: '', storagePath: row.attachment_storage_path
                  } : undefined,
                  withholdingOption: row.withholding_option, atcCode: row.atc_code,
                  whtRate: row.wht_rate == null ? null : Number(row.wht_rate),
                  whtAmount: row.wht_amount == null ? undefined : Number(row.wht_amount)
                });
                next.expenses = purchasesToExpenses(next.purchases || []);
              }
            } else if (table === 'sales') {
              replaceRow('sales', eventType === 'DELETE' ? null : {
                id: Number(row.id) || row.id, datMonthYear: row.dat_month_year || '', date: rowDate(row.date), ref: row.ref || '',
                paymentType: row.payment_type || '', buyerTin: row.buyer_tin || '', buyerName: row.buyer_name || '', buyerAddress: row.buyer_address || '',
                vatType: row.vat_type || '', amount: Number(row.amount || 0), netOfVat: Number(row.net_of_vat || 0),
                outputTax: Number(row.output_tax || 0), incomeType: row.income_type || '', desc: row.description || ''
              });
            } else if (table === 'coa_accounts') {
              replaceRow('accounts', eventType === 'DELETE' ? null : {
                id: String(row.id), name: row.name, type: row.type, normalSide: row.normal_side, parentId: row.parent_id,
                hidden: !!row.hidden, openingBalance: Number(row.opening_balance || 0), ...(row.custom_values || {})
              });
            } else if (table === 'coa_columns') {
              replaceRow('coaColumns', eventType === 'DELETE' ? null : { id: String(row.id), name: row.name, isSystem: !!row.is_system });
            } else if (table === 'journal_columns') {
              const key = `${String(row.journal_type || '').toLowerCase()}Columns`;
              if (!row.journal_type) return prev;
              replaceRow(key, eventType === 'DELETE' ? null : {
                id: String(row.id), name: row.name, type: row.type, category: row.category, isSystem: !!row.is_system
              });
            } else if (table === 'journal_entries') {
              const key = `${String(row.journal_type || '').toLowerCase()}Entries`;
              if (!row.journal_type) return prev;
              replaceRow(key, eventType === 'DELETE' ? null : {
                id: String(row.id), values: row.values || {}, auto: !!row.auto, autoSource: row.auto_source
              });
            } else if (table === 'journal_vouchers') {
              if (eventType === 'DELETE') {
                replaceRow('journalVouchers', null);
              } else {
                const existingLines = (current.journalVouchers || []).find((v: any) => String(v.id) === rowId)?.lines || [];
                replaceRow('journalVouchers', {
                  id: String(row.id), date: rowDate(row.date), reference: row.reference || '', memo: row.memo || '', lines: existingLines
                });
              }
            } else if (table === 'journal_voucher_lines') {
              if (!row.journal_voucher_id) return prev;
              const voucherId = String(row.journal_voucher_id);
              const vouchers = Array.isArray(current.journalVouchers) ? current.journalVouchers : [];
              next.journalVouchers = vouchers.map((voucher: any) => {
                if (String(voucher.id) !== voucherId) return voucher;
                const lines = Array.isArray(voucher.lines) ? voucher.lines : [];
                if (eventType === 'DELETE') {
                  return { ...voucher, lines: lines.filter((line: any) => String(line.id) !== rowId) };
                }
                const mapped = {
                  id: String(row.id), accountId: row.account_id || '', accountName: row.account_name || '',
                  debit: Number(row.debit || 0), credit: Number(row.credit || 0)
                };
                const index = lines.findIndex((line: any) => String(line.id) === rowId);
                return { ...voucher, lines: index >= 0 ? lines.map((line: any, i: number) => i === index ? mapped : line) : [...lines, mapped] };
              });
            }

            return { ...prev, [clientId]: next };
          });
        };

        clientsChannel = supabase.channel(`normalized-${dataOwnerId}`)
          .on('postgres_changes', {
            event: '*', schema: 'public', table: 'clients', filter: `user_id=eq.${dataOwnerId}`
          }, (payload) => {
            const clientId = String((payload.eventType === 'DELETE' ? payload.old : payload.new)?.id || '');
            if (!clientId) return;
            if (payload.eventType === 'DELETE') {
              setClients(prev => { const next = { ...prev }; delete next[clientId]; return next; });
            } else {
              // Client profile changes are tiny; refresh only the root row.
              void supabase.from('clients').select(CLIENTS_LIST_COLUMNS).eq('id', clientId).eq('user_id', dataOwnerId).maybeSingle()
                .then(({ data: row, error }) => {
                  if (error || !row) return;
                  setClients(prev => {
                    const existing = prev[clientId];
                    if (!existing) return prev;
                    return { ...prev, [clientId]: {
                      ...existing, id: row.id, name: row.name || 'Client', tin: row.tin,
                      taxpayerClassification: row.taxpayer_classification, registeredName: row.registered_name,
                      lastName: row.last_name, firstName: row.first_name, middleName: row.middle_name, tradeName: row.trade_name,
                      substreet: row.substreet, street: row.street, barangay: row.barangay, district: row.district, city: row.city,
                      zipCode: row.zip_code, rdoCode: row.rdo_code, phone: row.phone, email: row.email, category: row.category,
                      hasMultipleBusinessLines: row.has_multiple_business_lines, accountingType: row.accounting_type,
                      fiscalMonthEnd: row.fiscal_month_end, coaFormat: row.coa_format
                    } as Client };
                  });
                });
            }
          });

        // Filter each child subscription to the clients this user currently has.
        // This prevents Realtime traffic from unrelated tenants while preserving
        // multi-client support. Previously this registered one subscription per
        // (client x table) pair, so a user with several clients was opening
        // dozens of filters on a single channel. Postgres Changes filters
        // support `in`, so register one subscription per table with all of the
        // user's client ids batched into a single filter instead.
        const ownedClientIds = Object.keys(cloudClients);
        if (ownedClientIds.length > 0) {
          const clientIdList = ownedClientIds.map(id => `"${id}"`).join(',');
          for (const table of normalizedRealtimeTables) {
            clientsChannel = clientsChannel.on('postgres_changes', {
              event: '*', schema: 'public', table, filter: `client_id=in.(${clientIdList})`
            }, (payload) => updateRealtimeClient(table, payload));
          }
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
        .eq('user_id', dataOwnerId)
        .maybeSingle();

      if (!error && data) {
        setBusinessProfile(data.data as BusinessProfile);
      } else {
        const defaultBiz = defaultBusinessProfile(
          (user.user_metadata?.full_name as string) || user.email?.split('@')[0] || 'My Business Organization'
        );
        defaultBiz.id = dataOwnerId;
        setBusinessProfile(defaultBiz);
        await supabase
          .from('business_profiles')
          .upsert({ user_id: dataOwnerId, data: defaultBiz, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
          .then(({ error: upsertErr }) => {
            if (upsertErr) console.error('Auto-syncing default business_profile doc failed:', upsertErr);
          });
      }

      bizChannel = supabase
        .channel(`biz-profile-${dataOwnerId}`)
        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'business_profiles', filter: `user_id=eq.${dataOwnerId}` },
          (payload) => {
            if (payload.eventType !== 'DELETE') {
              setBusinessProfile((payload.new as any).data as BusinessProfile);
            }
          }
        )
        .subscribe();
    };

    // One-time cache schema check. Deleted rows (e.g. a duplicate account
    // title) can never be discovered by the `updated_at >= cursor` delta
    // query, so a stale IndexedDB copy resurrects them on every refresh.
    // validateCacheSchema() wipes the local delta cache once on version bump,
    // forcing one clean full re-sync from the authoritative tables. It runs
    // in milliseconds, so awaiting it before initClients is safe.
    (async () => {
      await validateCacheSchema();
      initClients();
      initBizProfile();
    })();

    return () => {
      clearTimeout(timeout);
      if (clientsChannel) supabase.removeChannel(clientsChannel);
      if (bizChannel) supabase.removeChannel(bizChannel);
    };
  }, [user?.id]);

  // Sync Business Profile to the current user's owner client
  useEffect(() => {
    if (businessProfile && user) {
      const ownerId = ownerClientId(dataOwnerId);
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
          persistNormalizedClient(matchingClient, dataOwnerId).catch((error) => console.error('Auto-syncing owner client failed:', error));
        }
      }

      // Do not automatically delete a client merely because its name matches
      // the user's business profile. A real client can legitimately have the
      // same registered/trade name as the accountant's own business profile.
      // The owner profile is represented separately by ownerClientId(dataOwnerId);
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
    await withOfflineQueue('sales', currentClientId, 'put', row, async () => {
      const { error } = await supabase.from('sales').upsert(row, { onConflict: 'id' });
      if (error) throw error;
    });
    invalidateQueries('sales', currentClientId).catch(() => {});
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
    if (!user || !currentClientId) {
      throw new Error('Not signed in or no client selected — please sign in and try again.');
    }
    const rows = accounts.map(a => {
      const { id, name, type, normalSide, parentId, hidden, openingBalance, ...custom } = a;
      return { id: String(id), client_id: currentClientId, name: name || '', type: type || '', normal_side: normalSide || null, parent_id: parentId || null, hidden: !!hidden, opening_balance: Number(openingBalance || 0), custom_values: custom };
    });
    const { data: existing, error: readError } = await supabase.from('coa_accounts').select('id').eq('client_id', currentClientId);
    if (readError) throw readError;
    const keep = new Set(rows.map(r => r.id));
    const stale = (existing || []).map((r: any) => String(r.id)).filter(id => !keep.has(id));
    if (rows.length) { const { error } = await supabase.from('coa_accounts').upsert(rows, { onConflict: 'client_id,id' }); if (error) throw error; }
    if (stale.length) {
      const { error } = await supabase
        .from('coa_accounts')
        .delete()
        .eq('client_id', currentClientId)
        .in('id', stale);
      if (error) throw error;
    }

    // COA saves replace the client's complete account set. The normalized
    // loader uses a delta cache, and a DELETE is not discoverable by an
    // updated_at query. If Realtime is delayed/disabled, a deleted account
    // can therefore survive in the cache and come back after refresh.
    // Keep both cache layers in sync with the authoritative replacement.
    try {
      const cacheEntry = deltaSyncCache.get(currentClientId);
      if (cacheEntry) {
        cacheEntry.rows.set(
          'coa_accounts',
          new Map(rows.map((row: any) => [String(row.id), row]))
        );
      }

      // IndexedDB is hydrated on a cold refresh. Explicitly remove stale
      // account rows and write the replacement set so deleted COA entries
      // cannot be resurrected from the browser cache.
      await Promise.all([
        ...stale.map((id: string) =>
          applyCachedRowDelta('coa_accounts', currentClientId, 'delete', { id })
        ),
        ...rows.map((row: any) =>
          applyCachedRowDelta('coa_accounts', currentClientId, 'put', row)
        ),
      ]);

      // If any account was actually removed, drop this client's watermark so
      // the next refresh performs a full re-sync instead of trusting the delta
      // cache. A DELETE has no `updated_at`, so a `gte(cursor)` query can never
      // confirm the removal — resetting the cursor is the only bulletproof way
      // to keep a deleted title from resurrecting from IndexedDB.
      if (stale.length) {
        await clearCachedCursor(currentClientId);
      }
    } catch (cacheError) {
      // Cache maintenance is best-effort; the Supabase write above already
      // succeeded and the in-memory UI state can still be updated safely.
      console.warn('Failed to update cached Chart of Accounts', cacheError);
    }

    updateClientState(currentClientId, { accounts, ...(format ? { coaFormat: format } : {}) });
    if (format) {
      const { error } = await supabase.from('clients').update({ coa_format: format }).eq('id', currentClientId).eq('user_id', dataOwnerId);
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

  /**
   * Checks whether a journal voucher represents a cash payment.
   * A cash payment voucher is one where any line credits a Cash account
   * (account name contains "Cash", e.g. "Cash on Hand", "Cash in Bank").
   * Cash payments belong in the Cash Disbursements Journal, not the General Journal.
   */
  const isCashPaymentVoucher = (voucher: any): boolean => {
    const lines = voucher.lines || [];
    return lines.some((line: any) => {
      const accountName = (line.accountName || line.account_name || '').toLowerCase();
      const isCashAccount = accountName.includes('cash');
      const isCredit = Number(line.credit || 0) > 0;
      return isCashAccount && isCredit;
    });
  };

  const saveJournalVoucher = async (clientId: string, voucher: any, gjEntries: any[] = []) => {
    if (!user || !clientId) return;

    // CASH PAYMENT vouchers should NOT be recorded in the General Journal.
    // If this is a cash payment, clear any GJ entries and remove any previously
    // persisted GJ entries for this voucher (in case it was edited from non-cash).
    const isCashPayment = isCashPaymentVoucher(voucher);
    let effectiveGjEntries = gjEntries;
    if (isCashPayment) {
      effectiveGjEntries = [];
      // Delete any existing GJ entries for this voucher from the database
      const { error: clearGjError } = await supabase
        .from('journal_entries')
        .delete()
        .eq('client_id', clientId)
        .eq('journal_type', 'GJ')
        .eq('auto_source', `journal_voucher:${voucher.id}`);
      if (clearGjError) throw clearGjError;
    }

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
    if (effectiveGjEntries.length) {
      const gjRows = effectiveGjEntries.map(e => ({ ...journalEntryRow(clientId, 'GJ', e), auto: true, auto_source: `journal_voucher:${voucher.id}` }));
      const { error } = await supabase.from('journal_entries').upsert(gjRows, { onConflict: 'id' });
      if (error) throw error;
    }
    const vouchers = [...((clients[clientId]?.journalVouchers || []) as any[]).filter(v => String(v.id) !== String(voucher.id)), voucher];
    const gjExisting = (clients[clientId]?.gjEntries || []) as any[];
    // For cash payments: strip all GJ entries linked to this voucher from client state
    // For non-cash: merge as before
    const nextGj = isCashPayment
      ? gjExisting.filter(e => e.autoSource !== `journal_voucher:${voucher.id}`)
      : [...gjExisting.filter(e => !effectiveGjEntries.some(g => String(g.id) === String(e.id))), ...effectiveGjEntries.map(e => ({ ...e, auto: true, autoSource: `journal_voucher:${voucher.id}` }))];
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

  const saveClient = async (id: string, clientData: Client) => {
    if (!user) return;

    const updatedClient = { ...clientData, id, userId: dataOwnerId } as Client;
    const previousClient = clients[id];

    try {
      // Persist first. Do not advertise a successful save or leave a local-only
      // client visible when Supabase rejected the write (for example because
      // the account's RLS policy is not yet deployed).
      await persistNormalizedClient(updatedClient, dataOwnerId);
      setClients((prev) => ({ ...prev, [id]: updatedClient }));
      showToast('Client saved');
    } catch (error) {
      console.error('Normalized client save failed:', error);
      if (previousClient) {
        setClients((prev) => ({ ...prev, [id]: previousClient }));
      } else {
        setClients((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        // Keep the existing selection untouched; a failed new client is removed
        // from the client map and will no longer be shown as a valid client.
      }
      await handleSupabaseError(error, OperationType.UPDATE, `normalized-client/${id}`);
      throw error;
    }
  };

  // Client Profiles uses this explicit name. Keep saveClient as the public
  // compatibility API while exposing the profile-specific alias so the UI and
  // provider contract cannot drift apart.
  const saveClientProfile = async (id: string, clientData: Client) => {
    await saveClient(id, clientData);
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
      input_tax: Number(purchase.inputTax || 0), exempt_amount: Number(purchase.exemptAmount || 0), zero_rated_amount: Number(purchase.zeroRatedAmount || 0), attachment_name: purchase.attachment?.name || null,
      attachment_type: purchase.attachment?.type || null, attachment_original_type: purchase.attachment?.originalType || purchase.attachment?.type || null,
      attachment_size: purchase.attachment?.size || null, attachment_original_size: purchase.attachment?.originalSize || purchase.attachment?.size || null,
      attachment_compression: purchase.attachment?.encoding === 'gzip' ? 'gzip' : (purchase.attachment?.compression || null),
      attachment_storage_path: storagePath, withholding_option: purchase.withholdingOption || null,
      atc_code: purchase.atcCode || null, wht_rate: purchase.whtRate ?? null, wht_amount: purchase.whtAmount ?? null,
    };
    const { error } = await supabase.from('purchases').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    invalidateQueries('purchases', currentClientId).catch(() => {});

    // ======================================================================
    // AUTO-ADD SUPPLIER TO TIN LIBRARY
    // ======================================================================
    if (purchase.supplierTin && purchase.supplierName) {
        const tin = String(purchase.supplierTin).trim();
        const name = String(purchase.supplierName).trim();
        const suppliers = clients[currentClientId]?.tinLibrary?.suppliers || [];
        const existing = suppliers.find((s: any) => String(s.tin).trim() === tin);
        if (!existing) {
            const normalizedTin = tin.replace(/\D/g, '');
            const supplierId = `tin_supplier_${normalizedTin}`;
            const supplierEntry = { id: supplierId, tin, name, address: purchase.supplierAddress || '' };
            await saveTinEntry(supplierEntry, 'supplier');
        }
    }
    // ======================================================================

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

  const addClient = async (name: string): Promise<string | null> => {
    if (!user || !name.trim()) return null;

    const newId = 'client_' + Date.now();
    const newClient: Client = {
      id: newId,
      name: name.trim(),
      userId: dataOwnerId,
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

    try {
      // The authenticated accountant owns the newly-created client row. This
      // matches clients_insert_own RLS without granting cross-user access.
      await persistNormalizedClient(newClient, dataOwnerId);
      setClients((prev) => ({ ...prev, [newId]: newClient }));
      setCurrentClientId(newId);
      showToast('Client added');
      return newId;
    } catch (error) {
      console.error('Client creation failed:', error);
      await handleSupabaseError(error, OperationType.CREATE, `clients/${newId}`);
      return null;
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

    // Drop the delta-sync raw cache for this client so it doesn't sit around
    // in memory (and so a client id reused later, e.g. undo/recreate, starts
    // from a clean full load instead of stale cached rows).
    clearNormalizedClientCache(id);

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
            { user_id: dataOwnerId, data: { ...profileData, id: dataOwnerId }, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          );
        if (error) throw error;

        // Also update the matching owner client immediately to unlock hasClients and currentClient
        const ownerId = ownerClientId(dataOwnerId);
        const existing = clients[ownerId];
        const matchingClient = buildMatchingClient(profileData, existing, ownerId);

        await persistNormalizedClient(matchingClient, dataOwnerId);

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

  // -------------------------------------------------------------------------
  // Editable report snapshots (P&L / Balance Sheet / Cash Flow). Each report
  // type is one row in `financial_report_snapshots`, keyed by client + report
  // type, so editing a field on the report page upserts that single row
  // instead of re-persisting the whole client aggregate.
  // -------------------------------------------------------------------------
  const saveFinancialReportSnapshot = async (reportType: string, data: any) => {
    if (!user || !currentClientId) return;
    const slug = reportType === 'P&L' ? 'pl' : reportType === 'Balance Sheet' ? 'bs' : 'cf';
    const dataKey = reportType === 'P&L' ? 'plData' : reportType === 'Balance Sheet' ? 'bsData' : 'cfData';
    const row = {
      id: `${currentClientId}:${slug}`,
      client_id: currentClientId,
      report_type: reportType,
      period_key: data?.period || data?.asOfDate || 'current',
      data,
    };
    const { error } = await supabase.from('financial_report_snapshots').upsert(row, { onConflict: 'id' });
    if (error) throw error;
    updateClientState(currentClientId, { [dataKey]: data } as any);
    showToast('Report saved');
  };

  // -------------------------------------------------------------------------
  // Asset Lapsing / PPE schedule — full replace of the client's rows in
  // `asset_lapsing_schedule` (same delete-stale-then-upsert pattern as
  // saveCoaAccounts so removed rows actually disappear).
  // -------------------------------------------------------------------------
  const saveAssetLapsingSchedule = async (entries: any[] = []) => {
    if (!user || !currentClientId) return;
    const rows = entries.map((e: any) => ({
      id: strId(e.id),
      client_id: currentClientId,
      date_purchased: e.datePurchased || null,
      invoice_no: e.invoiceNo || null,
      description: e.description || '',
      cost: Number(e.cost || 0),
      useful_life_years: Number(e.usefulLifeYears || 0),
      salvage_value: Number(e.salvageValue || 0),
    }));
    const { data: existing, error: readError } = await supabase
      .from('asset_lapsing_schedule').select('id').eq('client_id', currentClientId);
    if (readError) throw readError;
    const keep = new Set(rows.map(r => r.id));
    const stale = (existing || []).map((r: any) => String(r.id)).filter(id => !keep.has(id));
    if (rows.length) {
      const { error } = await supabase.from('asset_lapsing_schedule').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
    if (stale.length) {
      const { error } = await supabase
        .from('asset_lapsing_schedule').delete().eq('client_id', currentClientId).in('id', stale);
      if (error) throw error;
    }
    updateClientState(currentClientId, { assetLapsingSchedule: entries });
    showToast('Asset lapsing schedule saved');
  };

  // -------------------------------------------------------------------------
  // Tax Compliance deadlines — full replace of the client's rows in
  // `tax_deadlines` (filed/paid status, amount due, etc. are edited on the
  // Compliance Tracker and must persist).
  // -------------------------------------------------------------------------
  const saveTaxDeadlines = async (deadlines: any[] = []) => {
    if (!user || !currentClientId) return;
    const rows = deadlines.map((t: any) => ({
      id: strId(t.id),
      client_id: currentClientId,
      form_type: t.formType || null,
      title: t.title || '',
      period: t.period || null,
      due_date: t.dueDate || null,
      status: t.status || null,
      tax_status: t.taxStatus ?? null,
      amount_due: t.amountDue ?? null,
      date_filed: t.dateFiled || null,
      date_paid: t.datePaid || null,
      reference_no: t.referenceNo || null,
      confirmation_no: t.confirmationNo || null,
      notes: t.notes || null,
    }));
    const { data: existing, error: readError } = await supabase
      .from('tax_deadlines').select('id').eq('client_id', currentClientId);
    if (readError) throw readError;
    const keep = new Set(rows.map(r => r.id));
    const stale = (existing || []).map((r: any) => String(r.id)).filter(id => !keep.has(id));
    if (rows.length) {
      const { error } = await supabase.from('tax_deadlines').upsert(rows, { onConflict: 'id' });
      if (error) throw error;
    }
    if (stale.length) {
      const { error } = await supabase
        .from('tax_deadlines').delete().eq('client_id', currentClientId).in('id', stale);
      if (error) throw error;
    }
    updateClientState(currentClientId, { taxDeadlines: deadlines });
    showToast('Compliance deadlines saved');
  };

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
    // Bridge to the stacked toast system (Run 003 / T003) — all existing
    // showToast call sites now render as stacking success toasts.
    toast.success(msg);
  };

  // Flush queued offline writes when connectivity returns.
  useEffect(() => {
    const onOnline = async () => {
      if ((await pendingDirtyCount()) === 0) return;
      try {
        const flushed = await flushDirtyQueue(async ({ table, op, row }) => {
          if (op === 'delete') {
            const { error } = await supabase.from(table).delete().eq('id', (row as any).id);
            if (error) throw error;
          } else {
            const conflictTarget = table === 'coa_accounts' ? 'client_id,id' : 'id';
            const { error } = await supabase.from(table).upsert(row as any, { onConflict: conflictTarget });
            if (error) throw error;
          }
        });
        if (flushed > 0) showToast(`Flushed ${flushed} offline change(s)`);
      } catch (e) { console.warn('[localDb] offline flush failed', e); }
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, []);

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
    () => (rawCurrentClient
      ? syncGeneralLedger(syncSalesJournal(syncCashReceiptsJournal(syncCashDisbursementsJournal(syncPurchasesJournal(rawCurrentClient)))))
      : null),
    [rawCurrentClient]
  );

  // Persist every source-derived CDJ transaction into the normalized
  // journal_entries table. syncCashDisbursementsJournal() intentionally stays
  // pure, so the generated CDJ rows exist in currentClient but are not written
  // to Supabase unless we explicitly reconcile them here. This is important
  // for migrated clients: journal_entries may contain only a subset of the
  // transactions that are currently derivable from Purchases/JVs/GJ.
  useEffect(() => {
    if (!user || !rawCurrentClient || !currentClient) return;

    const persistedEntries = rawCurrentClient.cdjEntries || [];
    const generatedEntries = (currentClient.cdjEntries || []).filter(
      (entry: any) => entry.auto
    );

    const persistedIds = new Set(
      persistedEntries.map((entry: any) => String(entry.id))
    );

    const missingGenerated = generatedEntries.filter(
      (entry: any) => !persistedIds.has(String(entry.id))
    );

    // Auto CDJ rows are source-derived. If an auto row exists in Supabase but
    // is no longer present in the freshly generated CDJ, its source transaction
    // was deleted (or is no longer eligible for CDJ) and the journal_entries
    // row must be deleted too. Manual CDJ rows are never touched here.
    const currentGeneratedIds = new Set(
      generatedEntries.map((entry: any) => String(entry.id))
    );
    const staleGeneratedIds = persistedEntries
      .filter((entry: any) => entry.auto && !currentGeneratedIds.has(String(entry.id)))
      .map((entry: any) => String(entry.id));

    if (!missingGenerated.length && !staleGeneratedIds.length) return;

    let cancelled = false;
    const rows = missingGenerated.map((entry: any) =>
      journalEntryRow(rawCurrentClient.id, 'CDJ', entry)
    );

    void (async () => {
      try {
        if (rows.length) {
          const { error } = await supabase
            .from('journal_entries')
            .upsert(rows, { onConflict: 'id' });
          if (error) throw error;
        }

        if (staleGeneratedIds.length) {
          const { error } = await supabase
            .from('journal_entries')
            .delete()
            .eq('client_id', rawCurrentClient.id)
            .eq('journal_type', 'CDJ')
            .in('id', staleGeneratedIds);
          if (error) throw error;
        }

        if (!cancelled) {
          console.info(
            `CDJ persistence sync: added ${missingGenerated.length} generated transaction(s) and removed ${staleGeneratedIds.length} stale transaction(s).`
          );
        }
      } catch (error) {
        console.error('CDJ persistence sync failed:', error);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, rawCurrentClient, currentClient]);

  // -----------------------------------------------------------------------
  // Cleanup: remove legacy auto CDJ entries from excluded sources
  // (Purchases, General Journal, Check Vouchers, Miscellaneous Payments)
  // from the normalized journal_entries table. These entries were created
  // by an older version of syncCashDisbursementsJournal and should no
  // longer appear in the CDJ now that those sources are excluded.
  // -----------------------------------------------------------------------
  useEffect(() => {
    if (!user || !rawCurrentClient) return;

    const clientId = rawCurrentClient.id;
    const EXCLUDED_AUTO_SOURCES = new Set([
      'Purchases',
      'General Journal',
      'Check Voucher',
      'Check Vouchers',
      'Miscellaneous Payment',
      'Miscellaneous Payments',
    ]);
    const EXCLUDED_ID_PREFIXES = [
      'cdj-auto:purchase:',
      'cdj-auto:gj:',
      'cdj-auto:check-voucher:',
      'cdj-auto:cv:',
      'cdj-auto:misc-payment:',
    ];

    const toDelete = (rawCurrentClient.cdjEntries || [])
      .filter((entry: any) => {
        if (!entry.auto) return false;
        const id = String(entry.id);
        const source = String(entry.autoSource || '');
        return (
          EXCLUDED_AUTO_SOURCES.has(source) ||
          EXCLUDED_ID_PREFIXES.some(prefix => id.startsWith(prefix))
        );
      })
      .map((entry: any) => String(entry.id));

    if (!toDelete.length) return;

    let cancelled = false;
    void (async () => {
      try {
        const { error } = await supabase
          .from('journal_entries')
          .delete()
          .eq('client_id', clientId)
          .eq('journal_type', 'CDJ')
          .in('id', toDelete);

        if (error) {
          console.error('[CDJ Cleanup] Failed to remove legacy excluded entries:', error);
          return;
        }
        if (!cancelled) {
          console.info(`[CDJ Cleanup] Removed ${toDelete.length} legacy excluded auto entries from journal_entries`);
        }
      } catch (e) {
        console.error('[CDJ Cleanup] Error:', e);
      }
    })();

    return () => { cancelled = true; };
  }, [user, rawCurrentClient?.id]);

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
        ownerClientId: user ? ownerClientId(dataOwnerId) : null,
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
        saveFinancialReportSnapshot,
        saveAssetLapsingSchedule,
        saveTaxDeadlines,
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
