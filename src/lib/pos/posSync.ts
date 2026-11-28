/**
 * src/lib/pos/posSync.ts — POS online synchronization & accounting integration.
 *
 * Responsibilities:
 *  1. Mirror a completed POS sale into the existing CAPOTBOOKS books:
 *       - `sales` journal row (Cash Receipts / Sales Journal linkage)
 *       - inventory stock decrement (`inventory_items.stock_level`)
 *       - COGS outbound movements (`inventory_movements`, type Outbound)
 *  2. Persist POS-specific rows to `pos_transactions` / `pos_shifts` when those
 *     tables exist; when offline (or tables are not yet provisioned), the sale
 *     stays in the local Dexie queue and flushes automatically on reconnect.
 *  3. Duplicate protection: the transaction UUID is the server primary key and
 *     the upsert conflict target; receipt numbers are unique per client.
 *  4. Stock conflict reporting: server-side stock is revalidated at sync time;
 *     a disconnected device cannot guarantee globally current stock, so a
 *     shortfall flags the transaction instead of forcing a negative stock level.
 */
import { supabase } from '../supabase';
import type { InventoryItem } from '../../types';
import type { PosShift, PosTransaction } from './types';
import { saleDescription } from './tax';
import { putLocalTransaction, getPendingTransactions } from './posDb';

export interface PosAccountingDeps {
  currentClientId: string | null;
  inventoryItems: InventoryItem[];
  saveSale: (id: string, sale: any) => Promise<void>;
  saveInventoryItem: (item: any) => Promise<void>;
  saveInventoryMovement: (movement: any) => Promise<void>;
}

export function posIsOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/** Probe a table; returns false when it does not exist or the request fails. */
export async function posTableAvailable(table: 'pos_transactions' | 'pos_shifts'): Promise<boolean> {
  try {
    const { error } = await supabase.from(table).select('id').limit(1);
    if (error) return false;
    return true;
  } catch {
    return false;
  }
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------------------
// Row mapping
// ---------------------------------------------------------------------------

function txToServerRow(tx: PosTransaction): Record<string, any> {
  return {
    id: tx.id,
    client_id: tx.clientId,
    receipt_no: tx.receiptNo,
    cashier: tx.cashier,
    shift_id: tx.shiftId || null,
    status: tx.status,
    customer_type: tx.customer.type,
    customer_name: tx.customer.name || null,
    customer_id_type: tx.customer.idType || null,
    customer_id_no: tx.customer.idNo || null,
    customer_tin: tx.customer.tin || null,
    customer_address: tx.customer.address || null,
    discount_rate: tx.discountRate,
    discount_amount: tx.discountAmount,
    discount_senior: tx.discountSenior,
    discount_pwd: tx.discountPwd,
    gross_amount: tx.gross,
    vat_amount: tx.vatAmount,
    exempt_amount: tx.exemptAmount,
    net_amount: tx.net,
    vat_type: tx.vatType,
    payment_method: tx.paymentMethod,
    tendered: tx.tendered,
    change_due: tx.change,
    lines: tx.lines,
    sale_id: tx.saleId || null,
    void_reason: tx.voidReason || null,
    refund_reason: tx.refundReason || null,
    refund_of: tx.refundOf || null,
    sync_conflict: tx.conflict || null,
  };
}

function serverRowToTx(row: any): PosTransaction {
  return {
    id: String(row.id),
    clientId: row.client_id,
    receiptNo: row.receipt_no || '',
    cashier: row.cashier || '',
    shiftId: row.shift_id || null,
    status: row.status || 'completed',
    customer: {
      type: row.customer_type || 'regular',
      name: row.customer_name || '',
      idType: row.customer_id_type || '',
      idNo: row.customer_id_no || '',
      tin: row.customer_tin || '',
      address: row.customer_address || '',
    },
    discountRate: Number(row.discount_rate || 0),
    discountAmount: Number(row.discount_amount || 0),
    discountSenior: Number(row.discount_senior || 0),
    discountPwd: Number(row.discount_pwd || 0),
    gross: Number(row.gross_amount || 0),
    vatAmount: Number(row.vat_amount || 0),
    exemptAmount: Number(row.exempt_amount || 0),
    net: Number(row.net_amount || 0),
    vatType: row.vat_type || 'VAT Exempt',
    paymentMethod: row.payment_method || 'Cash',
    tendered: Number(row.tendered || 0),
    change: Number(row.change_due || 0),
    lines: Array.isArray(row.lines) ? row.lines : [],
    saleId: row.sale_id || undefined,
    voidReason: row.void_reason || undefined,
    refundReason: row.refund_reason || undefined,
    refundOf: row.refund_of || undefined,
    createdAt: row.created_at || new Date().toISOString(),
    syncStatus: 'synced',
    conflict: row.sync_conflict || undefined,
  };
}

function shiftToServerRow(shift: PosShift): Record<string, any> {
  return {
    id: shift.id,
    client_id: shift.clientId,
    cashier: shift.cashier,
    status: shift.status,
    opened_at: shift.openedAt,
    closed_at: shift.closedAt || null,
    opening_cash: shift.openingCash,
    closing_cash: shift.closingCash ?? null,
    expected_cash: shift.expectedCash ?? null,
    actual_cash: shift.actualCash ?? null,
    cash_variance: shift.cashVariance ?? null,
    totals: shift.totals,
    notes: shift.notes || null,
  };
}

// ---------------------------------------------------------------------------
// Accounting mirror (sales journal row + inventory COGS)
// ---------------------------------------------------------------------------

function buildSaleRow(tx: PosTransaction): any {
  const netOfVat = tx.vatType === 'VATable' ? round2(tx.net - tx.vatAmount) : tx.net;
  return {
    date: tx.createdAt.slice(0, 10),
    ref: tx.receiptNo,
    paymentType: tx.paymentMethod,
    buyerTin: tx.customer.tin || (tx.customer.type !== 'regular' ? tx.customer.idNo : ''),
    buyerName: tx.customer.name || (tx.customer.type === 'senior' ? 'Senior Citizen' : tx.customer.type === 'pwd' ? 'PWD Customer' : 'Walk-in Customer'),
    buyerAddress: tx.customer.address || '',
    vatType: tx.vatType,
    amount: tx.net,
    netOfVat,
    outputTax: tx.vatAmount,
    exemptAmount: tx.exemptAmount,
    incomeType: 'Sale of Goods',
    desc: saleDescription(tx),
    datMonthYear: tx.createdAt.slice(0, 7),
  };
}

/**
 * Post one completed sale to the books. Returns the sale row id and movement
 * ids; throws on failure so the caller keeps the transaction queued.
 */
async function postAccounting(tx: PosTransaction, deps: PosAccountingDeps): Promise<{ saleId: string; movementIds: string[]; conflict?: string }> {
  const saleId = `pos_sale_${tx.id}`;
  await deps.saveSale(saleId, buildSaleRow(tx));

  const movementIds: string[] = [];
  let conflict: string | undefined;
  const today = tx.createdAt.slice(0, 10);

  for (const line of tx.lines) {
    const item = deps.inventoryItems.find((i) => String(i.id) === line.itemId);
    if (!item) continue;
    const onHand = Number(item.stockLevel || 0);
    if (onHand < line.baseQty) {
      // Server-side stock validation failed at sync time. Record the sale but
      // flag the stock conflict; no negative stock level is written.
      conflict = `Insufficient stock for ${line.name}: on hand ${onHand}, needed ${line.baseQty} ${line.stockOnAdd ? '' : '(base units)'}`;
      continue;
    }
    const newStock = round2(onHand - line.baseQty);
    await deps.saveInventoryItem({ ...item, stockLevel: newStock });

    const movementId = `pos_mov_${tx.id}_${line.lineId}`;
    await deps.saveInventoryMovement({
      id: movementId,
      itemId: line.itemId,
      itemName: line.name,
      itemCode: line.code || line.sku || '',
      date: today,
      type: 'Outbound',
      qty: line.baseQty,
      unitCost: Number(item.costPrice || 0),
      totalValue: line.costTotal,
      reference: tx.receiptNo,
      notes: `POS sale${tx.customer.type !== 'regular' ? ` — ${tx.customer.type} discount` : ''}`,
    });
    movementIds.push(movementId);
  }

  return { saleId, movementIds, conflict };
}

/** Reverse a void/refunded sale: negative sale row + stock restored. */
export async function postReversal(
  original: PosTransaction,
  kind: 'void' | 'refund',
  reason: string,
  deps: PosAccountingDeps,
): Promise<void> {
  const reversalId = `pos_rev_${original.id}`;
  const neg = buildSaleRow(original);
  await deps.saveSale(reversalId, {
    ...neg,
    amount: -original.net,
    netOfVat: -neg.netOfVat,
    outputTax: -neg.outputTax,
    exemptAmount: -neg.exemptAmount,
    paymentType: original.paymentMethod,
    ref: `${original.receiptNo} ${kind === 'void' ? 'VOID' : 'REFUND'}`,
    desc: `${kind === 'void' ? 'VOID' : 'REFUND'} of ${original.receiptNo} — ${reason || 'no reason provided'}`,
  });

  for (const line of original.lines) {
    const item = deps.inventoryItems.find((i) => String(i.id) === line.itemId);
    if (!item) continue;
    const restored = round2(Number(item.stockLevel || 0) + line.baseQty);
    await deps.saveInventoryItem({ ...item, stockLevel: restored });
    await deps.saveInventoryMovement({
      id: `pos_revmov_${original.id}_${line.lineId}`,
      itemId: line.itemId,
      itemName: line.name,
      itemCode: line.code || line.sku || '',
      date: new Date().toISOString().slice(0, 10),
      type: 'Adjustment',
      qty: line.baseQty,
      unitCost: Number(item.costPrice || 0),
      totalValue: -line.costTotal,
      reference: `${original.receiptNo} ${kind === 'void' ? 'VOID' : 'REFUND'}`,
      notes: `Stock restored after ${kind} — ${reason || 'no reason provided'}`,
    });
  }
}

// ---------------------------------------------------------------------------
// Push / flush / pull
// ---------------------------------------------------------------------------

/** Persist only the POS transaction row (no accounting mirror). Used for
 *  void/refund status updates and offline status reconciliation. */
export async function pushTransactionRecord(tx: PosTransaction): Promise<void> {
  if (!posIsOnline() || !(await posTableAvailable('pos_transactions'))) return;
  const { error } = await supabase
    .from('pos_transactions')
    .upsert(txToServerRow(tx), { onConflict: 'id' });
  if (error) console.warn('[POS] transaction record sync skipped:', error.message);
}

/**
 * Push one transaction. Never throws: returns its resulting sync status so
 * the queue UI can show conflicts.
 */
export async function pushTransaction(
  tx: PosTransaction,
  deps: PosAccountingDeps,
): Promise<PosTransaction> {
  let next: PosTransaction = { ...tx };

  // 1) POS-specific row (best effort when the table is not provisioned).
  await pushTransactionRecord(next);

  // 2) Accounting books mirror (sales + stock + COGS).
  try {
    const result = await postAccounting(next, deps);
    next.saleId = result.saleId;
    next.movementIds = result.movementIds;
    if (result.conflict) {
      next.conflict = result.conflict;
      next.syncStatus = 'conflict';
      next.syncError = result.conflict;
    } else {
      next.syncStatus = 'synced';
      next.syncError = undefined;
      next.conflict = undefined;
    }
  } catch (e: any) {
    // Offline write failure (saveSale queues its own dirty row; stock/movement
    // writes retry here on the next flush). Keep queued for automatic retry.
    next.syncStatus = 'pending';
    next.syncError = e?.message || 'Sync deferred (offline or service unavailable)';
  }

  // 3) Persist back to the local queue/history.
  await putLocalTransaction(next);

  // 4) Best-effort update of the server row with accounting linkage ids.
  if (posIsOnline() && (await posTableAvailable('pos_transactions')) && next.syncStatus === 'synced') {
    await supabase
      .from('pos_transactions')
      .update({ sale_id: next.saleId, sync_conflict: null })
      .eq('id', next.id);
  }

  return next;
}

/** Flush every pending/conflicted local transaction. */
export async function flushPendingTransactions(
  deps: PosAccountingDeps,
): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingTransactions(deps.currentClientId);
  let synced = 0;
  let failed = 0;
  for (const tx of pending) {
    try {
      if (tx.status === 'completed') {
        const result = await pushTransaction(tx, deps);
        if (result.syncStatus === 'synced') synced += 1;
        else { failed += 1; await putLocalTransaction(result); }
      } else if (tx.reversalKind && tx.originalSnapshot) {
        // Void/refund: replay the accounting reversal (negative sale + stock
        // restoration), then record the updated status row server-side.
        await postReversal(tx.originalSnapshot, tx.reversalKind, tx.reversalReason || '', deps);
        await pushTransactionRecord(tx);
        const done: PosTransaction = { ...tx, syncStatus: 'synced', syncError: undefined, conflict: undefined };
        await putLocalTransaction(done);
        synced += 1;
      } else {
        await pushTransactionRecord(tx);
        const done: PosTransaction = { ...tx, syncStatus: 'synced', syncError: undefined };
        await putLocalTransaction(done);
        synced += 1;
      }
    } catch (e: any) {
      failed += 1;
      const failedTx: PosTransaction = { ...tx, syncStatus: 'conflict', syncError: e?.message || 'Sync failed' };
      await putLocalTransaction(failedTx);
    }
  }
  return { synced, failed };
}

/** Pull server POS history (best effort; merges are done by the page). */
export async function pullServerTransactions(clientId: string | null): Promise<PosTransaction[]> {
  if (!clientId || !posIsOnline()) return [];
  if (!(await posTableAvailable('pos_transactions'))) return [];
  const { data, error } = await supabase
    .from('pos_transactions')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !Array.isArray(data)) return [];
  return data.map(serverRowToTx);
}

export async function pushShift(shift: PosShift): Promise<void> {
  if (!posIsOnline() || !(await posTableAvailable('pos_shifts'))) return;
  const { error } = await supabase.from('pos_shifts').upsert(shiftToServerRow(shift), { onConflict: 'id' });
  if (error) console.warn('[POS] shift sync skipped:', error.message);
}

export async function pullServerShifts(clientId: string | null): Promise<PosShift[]> {
  if (!clientId || !posIsOnline() || !(await posTableAvailable('pos_shifts'))) return [];
  const { data, error } = await supabase
    .from('pos_shifts')
    .select('*')
    .eq('client_id', clientId)
    .order('opened_at', { ascending: false })
    .limit(50);
  if (error || !Array.isArray(data)) return [];
  return data.map((r: any) => ({
    id: String(r.id),
    clientId: r.client_id,
    cashier: r.cashier || '',
    status: r.status,
    openedAt: r.opened_at,
    closedAt: r.closed_at || undefined,
    openingCash: Number(r.opening_cash || 0),
    closingCash: r.closing_cash == null ? undefined : Number(r.closing_cash),
    expectedCash: r.expected_cash == null ? undefined : Number(r.expected_cash),
    actualCash: r.actual_cash == null ? undefined : Number(r.actual_cash),
    cashVariance: r.cash_variance == null ? undefined : Number(r.cash_variance),
    totals: r.totals || {
      sales: 0, items: 0, gross: 0, discount: 0, net: 0, vat: 0,
      cash: 0, check: 0, card: 0, ewallet: 0, bank: 0, account: 0,
      voids: 0, refunds: 0, refundedAmount: 0,
    },
    notes: r.notes || undefined,
  }));
}
