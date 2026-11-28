/**
 * src/lib/pos/posDb.ts — Offline-first local store for the Pharmacy POS.
 *
 * A dedicated Dexie (IndexedDB) database `capot-pos-v1` holding:
 *  - catalog     : cached product catalogue for offline search / barcode scan
 *  - transactions: completed, voided, refunded sales; `syncStatus` distinguishes
 *                  locally queued (offline) rows from server-synced rows
 *  - shifts      : cashier shift open/close records
 *  - meta        : receipt-number sequence and local preferences
 *
 * The main app's `src/db/localDb.ts` owns its own schema; this separate database
 * keeps POS schema changes isolated and avoids bumping the shared cache version.
 */
import Dexie, { type Table } from 'dexie';
import type { PosCatalogItem, PosShift, PosTransaction } from './types';

class PosDb extends Dexie {
  catalog!: Table<PosCatalogItem, string>;
  transactions!: Table<PosTransaction, string>;
  shifts!: Table<PosShift, string>;
  meta!: Table<{ key: string; value: unknown }, string>;

  constructor() {
    super('capot-pos-v1');
    this.version(1).stores({
      catalog: 'id, clientId, *barcodes, name',
      transactions: 'id, clientId, receiptNo, status, syncStatus, shiftId, createdAt',
      shifts: 'id, clientId, status, openedAt',
      meta: '&key',
    });
  }
}

const db = new PosDb();

// ---------------------------------------------------------------------------
// Catalogue cache (offline product search + scanning)
// ---------------------------------------------------------------------------

/** Replace the cached catalogue for a client with the latest live snapshot. */
export async function syncCatalogCache(clientId: string | null, items: PosCatalogItem[]): Promise<void> {
  if (!clientId) return;
  await db.transaction('rw', db.catalog, async () => {
    const existing = await db.catalog.where('clientId').equals(clientId).primaryKeys();
    const incoming = new Set(items.map((i) => i.id));
    const stale = existing.filter((id) => !incoming.has(id));
    if (stale.length) await db.catalog.bulkDelete(stale);
    if (items.length) await db.catalog.bulkPut(items);
  });
}

export async function getCachedCatalog(clientId: string | null): Promise<PosCatalogItem[]> {
  if (!clientId) return [];
  return db.catalog.where('clientId').equals(clientId).toArray();
}

/**
 * Local catalogue search. Matches product name, generic name, brand, SKU,
 * code and any barcode. An exact barcode hit returns first (scanner flow).
 */
export async function searchCachedCatalog(
  clientId: string | null,
  query: string,
): Promise<PosCatalogItem[]> {
  const q = query.trim().toLowerCase();
  if (!clientId) return [];
  const all = await getCachedCatalog(clientId);
  if (!q) return all.slice(0, 60);
  const exactBarcode = all.filter((i) => i.barcodes.some((b) => b.toLowerCase() === q));
  const fuzzy = all.filter((i) => {
    if (exactBarcode.includes(i)) return false;
    return [i.name, i.genericName, i.brandName, i.sku, i.code]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });
  return [...exactBarcode, ...fuzzy];
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------

export async function putLocalTransaction(tx: PosTransaction): Promise<void> {
  await db.transactions.put(tx);
}

export async function getLocalTransactions(clientId: string | null): Promise<PosTransaction[]> {
  if (!clientId) return db.transactions.orderBy('createdAt').reverse().toArray();
  const rows = await db.transactions.where('clientId').equals(clientId).reverse().sortBy('createdAt');
  return rows;
}

export async function getLocalTransaction(id: string): Promise<PosTransaction | undefined> {
  return db.transactions.get(id);
}

export async function getPendingTransactions(clientId: string | null): Promise<PosTransaction[]> {
  const rows = await db.transactions.where('syncStatus').anyOf('pending', 'conflict').toArray();
  return rows.filter((t) => !clientId || t.clientId === clientId);
}

export async function countPending(clientId: string | null): Promise<number> {
  const pending = await getPendingTransactions(clientId);
  return pending.length;
}

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

export async function putLocalShift(shift: PosShift): Promise<void> {
  await db.shifts.put(shift);
}

export async function getOpenLocalShift(clientId: string | null): Promise<PosShift | undefined> {
  if (!clientId) return db.shifts.filter((s) => s.status === 'open').first();
  const rows = await db.shifts.where('clientId').equals(clientId).toArray();
  return rows.find((s) => s.status === 'open');
}

export async function listLocalShifts(clientId: string | null): Promise<PosShift[]> {
  if (!clientId) return db.shifts.orderBy('openedAt').reverse().toArray();
  const rows = await db.shifts.where('clientId').equals(clientId).reverse().sortBy('openedAt');
  return rows;
}

// ---------------------------------------------------------------------------
// Meta (receipt sequence)
// ---------------------------------------------------------------------------

async function getMeta(key: string): Promise<unknown> {
  const row = await db.meta.get(key);
  return row?.value;
}

async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

/** Monotonic per-client receipt sequence; resets only on IndexedDB wipe. */
export async function nextReceiptSequence(clientId: string | null): Promise<number> {
  const key = `receipt_seq:${clientId || 'local'}`;
  const current = Number((await getMeta(key)) || 0);
  const next = current + 1;
  await setMeta(key, next);
  return next;
}

export function buildReceiptNo(seq: number, date = new Date()): string {
  const ymd = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `POS-${ymd}-${String(seq).padStart(4, '0')}`;
}
