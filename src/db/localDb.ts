/**
 * localDb.ts — Dexie (IndexedDB) persistence layer for CAPOT.
 *
 * Three jobs:
 *  1. Persist the normalized delta-sync rows + per-client watermark cursor so
 *     a page refresh does NOT trigger a full re-download (the current
 *     `deltaSyncCache` is an in-memory Map that dies on reload).
 *  2. Offline dirty-write queue: mutations written while offline are flushed
 *     when connectivity returns.
 *  3. Storage blob cache: signed-URL downloads (attachments, PDFs, scans) are
 *     cached locally so repeat views cost zero egress.
 *
 * Metrics (cache-hit bytes vs network bytes) are tracked here too so you can
 * verify the egress savings from the Diagnostics tab.
 *
 * Drop this file at src/db/localDb.ts. Requires dexie@^4 (already in your
 * package.json). No other changes needed to compile this file.
 */
import Dexie, { type Table } from 'dexie';

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

interface CachedRow {
  table: string;       // normalized table name, e.g. 'purchases'
  id: string;          // row primary key
  client_id: string;
  updated_at: string;  // ISO — used for delta eviction / watermarking
  row: unknown;        // the full projected row as returned by PostgREST
}

interface MetaEntry {
  key: string;
  value: unknown;
}

interface DirtyEntry {
  id?: number;
  table: string;
  client_id: string;
  op: 'put' | 'delete';
  row: unknown;          // full row for put; { id } for delete
  createdAt: number;
}

interface BlobEntry {
  storagePath: string;   // Supabase Storage path, e.g. 'client-files/<uuid>/...'
  blob: Blob;
  contentType: string;
  size: number;
  fetchedAt: number;
}

class CapotLocalDb extends Dexie {
  cachedRows!: Table<CachedRow, [string, string]>; // compound PK [table+id]
  meta!: Table<MetaEntry, string>;
  dirtyQueue!: Table<DirtyEntry, number>;
  blobs!: Table<BlobEntry, string>;

  constructor() {
    super('capot-local-v1');
    this.version(1).stores({
      // compound primary key + indexes used by the hydrate/delta paths
      cachedRows: '[table+id], table, client_id, [client_id+table], updated_at',
      meta: '&key',
      dirtyQueue: '++id, table, client_id, op, createdAt',
      blobs: '&storagePath, fetchedAt, size',
    });
    // v2: read-through query-result cache for paginated / period-scoped views
    this.version(2).stores({
      queryCache: '&key, table, client_id, fetchedAt',
    });
  }
}

export const localDb = new CapotLocalDb();

// ---------------------------------------------------------------------------
// Cache schema versioning. The delta-sync cache stores full rows in
// IndexedDB keyed by [table+id]. A row that is DELETED from Supabase has no
// `updated_at`, so a `gte(cursor)` delta query can never discover its removal
// — the stale copy survives in IndexedDB forever and "comes back" on every
// refresh (this is exactly the duplicated-account-title bug). Bump this
// constant whenever the cache shape changes or a stale-cache bug is fixed;
// validateCacheSchema() will then wipe every cached row + every watermark
// cursor once, forcing one clean full re-sync from the authoritative tables.
// ---------------------------------------------------------------------------
export const CACHE_SCHEMA_VERSION = '2';
const VERSION_KEY = 'cache_schema_version';

export async function validateCacheSchema(): Promise<boolean> {
  try {
    const entry = await localDb.meta.get(VERSION_KEY);
    const stored = entry?.value as string | undefined;
    if (stored === CACHE_SCHEMA_VERSION) return false;
    // Wipe everything cached: rows (all tables/clients) and watermark cursors.
    await localDb.cachedRows.clear();
    await localDb.meta.where('key').startsWith('watermark:').delete();
    // Also drop the read-through query cache if present (best-effort).
    try { await (localDb as any).queryCache?.clear(); } catch { /* older schema */ }
    await localDb.meta.put({ key: VERSION_KEY, value: CACHE_SCHEMA_VERSION });
    return true;
  } catch (e) {
    console.warn('[localDb] validateCacheSchema failed (non-fatal)', e);
    return false;
  }
}

// ---------------------------------------------------------------------------
// 1. Delta-cache persistence (the egress win)
// ---------------------------------------------------------------------------

const cursorKey = (clientId: string) => `watermark:${clientId}`;

/** Per-client `updated_at` cursor used by loadNormalizedClient delta queries. */
export async function getCachedCursor(clientId: string): Promise<string | null> {
  const entry = await localDb.meta.get(cursorKey(clientId));
  return (entry?.value as string | null) ?? null;
}

export async function setCachedCursor(clientId: string, cursorIso: string): Promise<void> {
  await localDb.meta.put({ key: cursorKey(clientId), value: cursorIso });
}

/** Remove the watermark for a client so the next load is a full re-sync. */
export async function clearCachedCursor(clientId: string): Promise<void> {
  await localDb.meta.delete(cursorKey(clientId));
}

/** Bulk-insert/replace cached rows for one table of one client. */
export async function putCachedRows(table: string, clientId: string, rows: Array<Record<string, any>>): Promise<void> {
  if (!rows.length) return;
  const cached: CachedRow[] = rows
    .filter(r => r && r.id)
    .map(r => ({
      table,
      id: String(r.id),
      client_id: clientId,
      updated_at: r.updated_at || new Date().toISOString(),
      row: r,
    }));
  await localDb.cachedRows.bulkPut(cached);
}

/** All cached rows for one table + client, in insertion order. */
export async function getCachedRows(table: string, clientId: string): Promise<Array<Record<string, any>>> {
  const entries = await localDb.cachedRows
    .where('[client_id+table]')
    .equals([clientId, table])
    .toArray();
  return entries.map(e => e.row as Record<string, any>);
}

/** Apply a single realtime delta row to the local cache (upsert or delete). */
export async function applyCachedRowDelta(
  table: string,
  clientId: string,
  op: 'put' | 'delete',
  row: Record<string, any>
): Promise<void> {
  if (!row?.id) return;
  if (op === 'delete') {
    await localDb.cachedRows.delete([table, String(row.id)]);
  } else {
    await putCachedRows(table, clientId, [row]);
  }
}

/** Wipe cached rows for a client (force full re-sync) or entirely. */
export async function clearCachedRows(clientId?: string): Promise<void> {
  if (clientId) {
    await localDb.cachedRows.where('client_id').equals(clientId).delete();
    await localDb.meta.delete(cursorKey(clientId));
  } else {
    await localDb.cachedRows.clear();
    await localDb.meta.where('key').startsWith('watermark:').delete();
  }
}

// ---------------------------------------------------------------------------
// 2. Offline dirty-write queue
// ---------------------------------------------------------------------------

export async function queueDirtyWrite(table: string, clientId: string, op: 'put' | 'delete', row: unknown): Promise<void> {
  await localDb.dirtyQueue.add({ table, client_id: clientId, op, row, createdAt: Date.now() });
}

export async function pendingDirtyCount(): Promise<number> {
  return localDb.dirtyQueue.count();
}

/**
 * Drain the queue. `flushOne` receives each entry and must perform the actual
 * Supabase write; entries that throw are left in the queue for the next flush.
 * Returns the number flushed.
 */
export async function flushDirtyQueue(
  flushOne: (entry: { table: string; client_id: string; op: 'put' | 'delete'; row: unknown }) => Promise<void>
): Promise<number> {
  const pending = await localDb.dirtyQueue.orderBy('createdAt').toArray();
  let flushed = 0;
  for (const entry of pending) {
    try {
      await flushOne({ table: entry.table, client_id: entry.client_id, op: entry.op, row: entry.row });
      if (entry.id != null) await localDb.dirtyQueue.delete(entry.id);
      flushed++;
    } catch (e) {
      // leave in queue, stop flushing — preserves ordering
      console.warn('[localDb] flush stalled at', entry.table, entry.id, e);
      break;
    }
  }
  return flushed;
}

// ---------------------------------------------------------------------------
// 3. Storage blob cache (signed-URL downloads)
// ---------------------------------------------------------------------------

const BLOB_MAX_BYTES = 250 * 1024 * 1024; // 250 MB local cap — evict LRU-ish by fetchedAt

export async function getCachedBlob(storagePath: string): Promise<Blob | null> {
  const entry = await localDb.blobs.get(storagePath);
  if (!entry) return null;
  // touch fetchedAt so it survives LRU eviction
  await localDb.blobs.put({ ...entry, fetchedAt: Date.now() });
  return entry.blob;
}

export async function putCachedBlob(storagePath: string, blob: Blob): Promise<void> {
  const total = (await localDb.blobs.toArray()).reduce((s, b) => s + b.size, 0);
  if (total + blob.size > BLOB_MAX_BYTES) {
    // evict oldest until we fit
    const oldest = await localDb.blobs.orderBy('fetchedAt').toArray();
    let acc = total;
    for (const b of oldest) {
      if (acc + blob.size <= BLOB_MAX_BYTES) break;
      await localDb.blobs.delete(b.storagePath);
      acc -= b.size;
    }
  }
  await localDb.blobs.put({
    storagePath,
    blob,
    contentType: blob.type || 'application/octet-stream',
    size: blob.size,
    fetchedAt: Date.now(),
  });
}

export async function evictBlob(storagePath: string): Promise<void> {
  await localDb.blobs.delete(storagePath);
}

// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// 5. Read-through query-result cache (Sales pages, History months, etc.)
//    Keyed by an arbitrary string; invalidated by table on any mutation.
// ---------------------------------------------------------------------------

interface QueryCacheEntry {
  key: string;
  table: string;          // for invalidation, e.g. 'sales' | 'purchases'
  client_id: string;
  fetchedAt: number;
  payload: unknown;       // { rows, total } or whatever the caller stores
}

/** Cache a query result under an arbitrary key (e.g. `sales:<client>:page:3`). */
export async function cacheQuery(key: string, table: string, clientId: string, payload: unknown): Promise<void> {
  await (localDb as any).queryCache.put({ key, table, client_id: clientId, fetchedAt: Date.now(), payload });
}

/** Retrieve a cached query; returns null on miss or if older than maxAgeMs. */
export async function getCachedQuery<T = unknown>(key: string, maxAgeMs?: number): Promise<T | null> {
  const entry = await (localDb as any).queryCache.get(key) as QueryCacheEntry | undefined;
  if (!entry) return null;
  if (maxAgeMs && Date.now() - entry.fetchedAt > maxAgeMs) return null;
  recordCacheHit(estimatePayloadBytes(entry.payload));
  return entry.payload as T;
}

/** Invalidate all cached queries for a table (and optionally one client). */
export async function invalidateQueries(table: string, clientId?: string): Promise<void> {
  let coll = (localDb as any).queryCache.where('table').equals(table);
  if (clientId) {
    // Dexie compound-ish filter: get keys then bulkDelete
    const entries = await coll.toArray();
    const keys = entries.filter((e: QueryCacheEntry) => e.client_id === clientId).map((e: QueryCacheEntry) => e.key);
    await (localDb as any).queryCache.bulkDelete(keys);
  } else {
    await coll.delete();
  }
}

function estimatePayloadBytes(p: unknown): number {
  try { return JSON.stringify(p).length; } catch { return 0; }
}

// 4. Egress metrics (expose in Diagnostics tab)
// ---------------------------------------------------------------------------

interface EgressMetrics {
  cacheHitBytes: number;
  networkBytes: number;
  blobCacheHitBytes: number;
  startedAt: number;
}

const metrics: EgressMetrics = {
  cacheHitBytes: 0,
  networkBytes: 0,
  blobCacheHitBytes: 0,
  startedAt: Date.now(),
};

export function recordCacheHit(bytes: number): void { metrics.cacheHitBytes += bytes; }
export function recordNetworkFetch(bytes: number): void { metrics.networkBytes += bytes; }
export function recordBlobCacheHit(bytes: number): void { metrics.blobCacheHitBytes += bytes; }

export function getEgressMetrics(): EgressMetrics & { hitRatio: number } {
  const total = metrics.cacheHitBytes + metrics.networkBytes;
  return { ...metrics, hitRatio: total > 0 ? metrics.cacheHitBytes / total : 0 };
}
