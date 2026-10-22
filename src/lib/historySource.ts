/**
 * historySource.ts — Single source of truth for the Income History / Expense
 * History records that both the History page and the BIR RELIEF page consume.
 *
 * Before this module, the History page fetched month-filtered purchases/sales
 * directly from Supabase and mapped them locally (mapPurchaseRow / mapSaleRow),
 * while Relief.tsx read currentClient.purchases / currentClient.sales from the
 * AccountingContext delta-sync. The two code paths could drift (different
 * column projections, cache staleness, mapping differences), so RELIEF numbers
 * did not always match what the user saw in Income / Expense History.
 *
 * Now both pages call fetchHistoryMonthRecords() with the same (clientId, year,
 * month) and receive identically-shaped, identically-filtered records:
 *   - purchases[] → Expense History → RELIEF Summary List of Purchases (SLP)
 *   - sales[]     → Income History  → RELIEF Summary List of Sales (SLS)
 */
import { supabase } from './supabase';
import { getCachedQuery, cacheQuery } from '../db/localDb';

// Column projections — exactly the fields the History grid and RELIEF
// aggregation read. Selecting '*' wastes PostgREST egress on every load.
export const HISTORY_PURCHASE_COLS =
  'id,client_id,date,payment_method,check_number,bank_name,invoice_no,supplier_name,supplier_address,supplier_tin,amount,vat_type,account_title,transaction_details,input_tax,attachment_name,attachment_type,attachment_original_type,attachment_size,attachment_original_size,attachment_compression,attachment_storage_path,withholding_option,atc_code,wht_rate,wht_amount,exempt_amount,zero_rated_amount,entry_source';

export const HISTORY_SALE_COLS =
  'id,client_id,date,ref,payment_type,buyer_tin,buyer_name,buyer_address,vat_type,amount,net_of_vat,output_tax,income_type,description,exempt_amount,zero_rated_amount,withholding_option,atc_code,wht_rate,wht_amount';

/** Map a raw purchases row to the Expense History record shape. */
export function mapPurchaseHistoryRow(p: any) {
  return {
    id: p.id,
    date: p.date,
    paymentMethod: p.payment_method,
    checkNumber: p.check_number,
    bankName: p.bank_name,
    invoiceNo: p.invoice_no,
    supplierName: p.supplier_name || '',
    supplierAddress: p.supplier_address || '',
    supplierTin: p.supplier_tin || '',
    amount: Number(p.amount || 0),
    vatType: p.vat_type,
    accountTitle: p.account_title,
    transactionDetails: p.transaction_details,
    inputTax: Number(p.input_tax || 0),
    attachment: p.attachment_storage_path
      ? {
          storagePath: p.attachment_storage_path,
          name: p.attachment_name,
          type: p.attachment_type,
          originalType: p.attachment_original_type,
          compression: p.attachment_compression,
        }
      : undefined,
    withholdingOption: p.withholding_option,
    atcCode: p.atc_code,
    whtRate: p.wht_rate == null ? undefined : Number(p.wht_rate),
    whtAmount: Number(p.wht_amount || 0),
    exemptAmount: Number(p.exempt_amount || 0),
    zeroRatedAmount: Number(p.zero_rated_amount || 0),
    entrySource: p.entry_source,
  };
}

/** Map a raw sales row to the Income History record shape. */
export function mapSaleHistoryRow(s: any) {
  return {
    id: s.id,
    date: s.date,
    ref: s.ref,
    paymentType: s.payment_type,
    buyerTin: s.buyer_tin,
    buyerName: s.buyer_name || '',
    buyerAddress: s.buyer_address || '',
    vatType: s.vat_type,
    amount: Number(s.amount || 0),
    netOfVat: Number(s.net_of_vat || 0),
    outputTax: Number(s.output_tax || 0),
    incomeType: s.income_type,
    description: s.description,
    exemptAmount: Number(s.exempt_amount || 0),
    zeroRatedAmount: Number(s.zero_rated_amount || 0),
    withholdingOption: s.withholding_option,
    atcCode: s.atc_code,
    whtRate: s.wht_rate == null ? undefined : Number(s.wht_rate),
    whtAmount: Number(s.wht_amount || 0),
  };
}

export interface HistoryMonthRecords {
  purchases: ReturnType<typeof mapPurchaseHistoryRow>[];
  sales: ReturnType<typeof mapSaleHistoryRow>[];
  fromCache: boolean;
}

/**
 * Fetch the Expense History (purchases) and Income History (sales) records for
 * a single tax month, exactly as the History page displays them. Results are
 * cached per (client, table, month) so the History grid and RELIEF share the
 * same snapshot for the same period.
 */
export async function fetchHistoryMonthRecords(
  clientId: string,
  year: number,
  month: number,
): Promise<HistoryMonthRecords> {
  const empty: HistoryMonthRecords = { purchases: [], sales: [], fromCache: false };
  if (!clientId) return empty;

  const periodKey = `${year}-${String(month).padStart(2, '0')}`;
  const startDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 1); // month is 1-indexed; Date month is 0-indexed, so (year, month, 1) = first day of next month
  const endDateString = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-01`;

  const purCacheKey = `purchases:${clientId}:month:${periodKey}`;
  const salCacheKey = `sales:${clientId}:month:${periodKey}`;

  const [purCached, salCached] = await Promise.all([
    getCachedQuery<any[]>(purCacheKey),
    getCachedQuery<any[]>(salCacheKey),
  ]);
  // The cache stores already-mapped records (same shape the History grid
  // expects), so a cache hit is returned directly without re-mapping.
  if (purCached && salCached) {
    return { purchases: purCached, sales: salCached, fromCache: true };
  }

  const [purchaseResult, salesResult] = await Promise.all([
    supabase
      .from('purchases')
      .select(HISTORY_PURCHASE_COLS)
      .eq('client_id', clientId)
      .gte('date', startDate)
      .lt('date', endDateString)
      .order('date', { ascending: true }),
    supabase
      .from('sales')
      .select(HISTORY_SALE_COLS)
      .eq('client_id', clientId)
      .gte('date', startDate)
      .lt('date', endDateString)
      .order('date', { ascending: true }),
  ]);

  if (purchaseResult.error) console.error('[historySource] purchases query failed:', purchaseResult.error);
  if (salesResult.error) console.error('[historySource] sales query failed:', salesResult.error);

  const purchases = (purchaseResult.data || []).map(mapPurchaseHistoryRow);
  const sales = (salesResult.data || []).map(mapSaleHistoryRow);

  // Cache mapped records so the History grid and RELIEF share one snapshot.
  if (!purchaseResult.error) cacheQuery(purCacheKey, 'purchases', clientId, purchases).catch(() => {});
  if (!salesResult.error) cacheQuery(salCacheKey, 'sales', clientId, sales).catch(() => {});

  return { purchases, sales, fromCache: false };
}
