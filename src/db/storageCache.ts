/**
 * storageCache.ts — Supabase Storage helpers with (a) immutable versioned
 * upload paths + long cache-control so the CDN actually caches, and (b) a
 * Dexie blob cache so repeat signed-URL downloads cost zero egress.
 *
 * Drop at src/db/storageCache.ts. Depends on ./localDb and ../lib/supabase.
 */
import { supabase } from '../lib/supabase';
import { storageBucket } from '../lib/r2Storage';
import { getCachedBlob, putCachedBlob, evictBlob, recordBlobCacheHit, recordNetworkFetch } from './localDb';

const FILES_BUCKET = 'client-files';
// R2 gateway when VITE_R2_ENABLED=true, otherwise Supabase Storage (same API).
const filesBucket = () => storageBucket(FILES_BUCKET);
const LONG_CACHE = 'public, max-age=31536000, immutable';

/**
 * Immutable, versioned storage path. Never reuse a path (that's what forced
 * the 1-hour default TTL) — include a timestamp/hash so we can set a 1-year
 * immutable cache-control and the CDN can serve it from edge indefinitely.
 */
export function buildVersionedPath(
  clientId: string,
  entity: string,
  entityId: string,
  fileName: string
): string {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]+/g, '_');
  const ts = Date.now().toString(36);
  return `${clientId}/${entity}/${entityId}/${ts}-${safe}`;
}

/** Upload a file with versioned path + long-lived CDN cache headers. */
export async function uploadVersioned(
  clientId: string,
  entity: string,
  entityId: string,
  file: Blob | File | Uint8Array,
  fileName: string,
  contentType?: string
): Promise<{ storagePath: string }> {
  const storagePath = buildVersionedPath(clientId, entity, entityId, fileName);
  const { error } = await filesBucket()
    .upload(storagePath, file, {
      contentType: contentType || (file as File).type || 'application/octet-stream',
      cacheControl: LONG_CACHE,
      upsert: false, // immutable path — must be false
    });
  if (error) throw new Error(`Storage upload ${storagePath}: ${error.message}`);
  return { storagePath };
}

/**
 * Download a file: Dexie blob cache first, then signed-URL fetch. Repeat views
 * of the same attachment never hit the network (signed URLs rotate every
 * request, so CDN caching is near-useless for them — local cache is the win).
 */
export async function downloadWithCache(
  storagePath: string,
  signedUrlTtlSeconds = 60
): Promise<Blob> {
  const cached = await getCachedBlob(storagePath);
  if (cached) {
    recordBlobCacheHit(cached.size);
    return cached;
  }
  const { data, error } = await filesBucket()
    .createSignedUrl(storagePath, signedUrlTtlSeconds);
  if (error || !data?.signedUrl) throw error || new Error('Unable to create download URL');

  const response = await fetch(data.signedUrl);
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);
  const blob = await response.blob();

  // egress accounting: approximate wire bytes (blob.size is close enough)
  recordNetworkFetch(blob.size);
  // best-effort cache; never fail the download if caching errors
  putCachedBlob(storagePath, blob).catch(e => console.warn('[storageCache] blob cache put failed', e));
  return blob;
}

/** Call this when a file is deleted/replaced so the stale blob is evicted. */
export async function evictCachedFile(storagePath: string): Promise<void> {
  await evictBlob(storagePath);
}
