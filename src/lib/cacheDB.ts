// src/lib/cacheDB.ts
// TTL-aware IndexedDB cache for Supabase table fetches.
// Keys are pagination-aware: `client:<clientId>:<table>:<cursor>:<limit>`.
// On any write to a table, invalidate ALL cached pages for that table.

const DB_NAME = 'capot_cache';
const DB_VERSION = 1;
const STORE_NAME = 'table_cache';

export const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry {
  key: string;
  data: unknown;
  timestamp: number;
  ttl: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function setCache<T>(key: string, data: T, ttl = DEFAULT_TTL): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put({ key, data, timestamp: Date.now(), ttl } as CacheEntry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function getCache<T>(key: string): Promise<T | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(key);
    req.onsuccess = () => {
      db.close();
      const entry = req.result as CacheEntry | undefined;
      if (!entry) return resolve(null);
      if (Date.now() - entry.timestamp > entry.ttl) {
        void deleteCache(key);
        return resolve(null);
      }
      resolve(entry.data as T);
    };
    req.onerror = () => { db.close(); reject(null); };
  });
}

export async function deleteCache(key: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// Invalidate every cached page for a table (all cursors/limits).
export async function invalidateTable(clientId: string, table: string): Promise<void> {
  const prefix = `client:${clientId}:${table}:`;
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.openCursor();
    req.onsuccess = () => {
      const cursor = req.result;
      if (cursor) {
        if (String(cursor.key).startsWith(prefix)) cursor.delete();
        cursor.continue();
      }
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

export async function clearAllCache(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// Cross-tab invalidation: one tab saves → all tabs drop their cache.
const CHANNEL = 'capot_cache_invalidate';
const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;

export function setupCacheInvalidationListener(onInvalidate: (clientId: string, tables: string[]) => void): () => void {
  if (!bc) return () => {};
  bc.onmessage = (event) => {
    if (event.data?.type === 'invalidate') onInvalidate(event.data.clientId, event.data.tables || []);
  };
  return () => { if (bc) bc.onmessage = null; };
}

export function broadcastInvalidate(clientId: string, tables: string[]): void {
  void Promise.all(tables.map(t => invalidateTable(clientId, t)));
  bc?.postMessage({ type: 'invalidate', clientId, tables });
}
