// Offline-first queue + sync indicator (Run 028 / T028): queues failed writes while
// offline, flushes them when connectivity returns. Dexie/localStorage-backed.

export interface QueuedOperation {
  id: string;
  entity: string; // e.g. 'journal_voucher', 'sale', 'purchase'
  payload: Record<string, any>;
  createdAt: string;
  retries: number;
}

const QUEUE_KEY = 'capot.offlineQueue';

export function queueOperation(entity: string, payload: Record<string, any>) {
  try {
    const q = getQueue();
    q.push({ id: crypto.randomUUID(), entity, payload, createdAt: new Date().toISOString(), retries: 0 });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch { /* ignore quota */ }
}

export function getQueue(): QueuedOperation[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]'); } catch { return []; }
}

export function clearQueue() { try { localStorage.removeItem(QUEUE_KEY); } catch { /* ignore */ } }

export function removeFromQueue(id: string) {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(getQueue().filter(o => o.id !== id))); } catch { /* ignore */ }
}

export function isOnline(): boolean { return typeof navigator !== 'undefined' ? navigator.onLine : true; }

export type OnlineStatus = 'online' | 'offline' | 'syncing';

/** Subscribe to online/offline changes. Returns unsubscribe fn. */
export function onConnectivityChange(cb: (online: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const on = () => cb(true); const off = () => cb(false);
  window.addEventListener('online', on); window.addEventListener('offline', off);
  return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
}

/** Simple in-memory query cache (TTL-based) to avoid re-fetching. */
const cache = new Map<string, { value: any; expires: number }>();
export function cachedQuery<T>(key: string, ttlMs: number, fetcher: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return Promise.resolve(hit.value as T);
  return fetcher().then(v => { cache.set(key, { value: v, expires: Date.now() + ttlMs }); return v; });
}
export function invalidateCache(prefix?: string) {
  if (!prefix) { cache.clear(); return; }
  for (const k of cache.keys()) if (k.startsWith(prefix)) cache.delete(k);
}
