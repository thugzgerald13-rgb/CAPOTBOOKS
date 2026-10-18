/**
 * r2Storage.ts — Cloudflare R2 storage gateway client.
 *
 * Drop-in replacement for `supabase.storage.from(bucket)`: exposes the same
 * { upload, remove, getPublicUrl, createSignedUrl, download } shape, so call
 * sites only change `supabase.storage.from('client-files')` →
 * `storageBucket('client-files')`.
 *
 * When `VITE_R2_ENABLED !== 'true'` (the default), every call falls back to
 * Supabase Storage unchanged — zero risk, can be toggled per deploy.
 *
 * Auth: the Supabase access token is sent as `Authorization: Bearer` on
 * uploads/deletes and as a `?token=` query param on download URLs (so
 * <img src> and fetch both work). The token auto-refreshes and is cached
 * synchronously here so getPublicUrl() can stay synchronous (used in render).
 */
import { supabase } from './supabase';

export const R2_ENABLED = import.meta.env.VITE_R2_ENABLED === 'true';

// Cached access token, kept fresh by Supabase auto-refresh. Read synchronously
// by getPublicUrl() (called during render in PaymentApproval etc.).
let cachedToken = '';
supabase.auth.onAuthStateChange((_event, session) => {
  cachedToken = session?.access_token || '';
});
supabase.auth.getSession().then(({ data }) => {
  cachedToken = data.session?.access_token || '';
});

async function getAccessToken(): Promise<string> {
  if (cachedToken) return cachedToken;
  const { data } = await supabase.auth.getSession();
  cachedToken = data.session?.access_token || '';
  return cachedToken;
}

function r2Endpoint(bucket: string, key: string): string {
  return `/api/r2/${encodeURIComponent(bucket)}/${key.split('/').map(encodeURIComponent).join('/')}`;
}

async function r2Upload(
  bucket: string,
  key: string,
  file: Blob | File | Uint8Array | ArrayBuffer,
  opts?: { contentType?: string; cacheControl?: string; upsert?: boolean },
): Promise<{ error: { message: string } | null }> {
  try {
    const token = await getAccessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
    if (opts?.contentType) headers['Content-Type'] = opts.contentType;
    if (opts?.cacheControl) headers['X-Cache-Control'] = opts.cacheControl;
    const body: BodyInit =
      file instanceof Uint8Array ? (file.buffer as ArrayBuffer) : (file as Blob);
    const res = await fetch(r2Endpoint(bucket, key), { method: 'PUT', headers, body });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return { error: { message: `R2 upload failed (${res.status}): ${text.slice(0, 200)}` } };
    }
    return { error: null };
  } catch (e: any) {
    return { error: { message: e?.message || 'R2 upload failed' } };
  }
}

async function r2Remove(bucket: string, keys: string[]): Promise<{ error: { message: string } | null }> {
  try {
    const token = await getAccessToken();
    for (const key of keys) {
      const res = await fetch(r2Endpoint(bucket, key), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return { error: { message: `R2 delete failed (${res.status})` } };
    }
    return { error: null };
  } catch (e: any) {
    return { error: { message: e?.message || 'R2 delete failed' } };
  }
}

/** Authed GET URL with token in query — works for <img src>, <a href>, fetch. */
function r2AuthedUrlSync(bucket: string, key: string): string {
  const token = cachedToken;
  return `${r2Endpoint(bucket, key)}?token=${encodeURIComponent(token)}`;
}

async function r2AuthedUrl(bucket: string, key: string): Promise<string> {
  await getAccessToken();
  return r2AuthedUrlSync(bucket, key);
}

/**
 * Supabase-compatible bucket handle.
 * Return type is intentionally loose (`any`) so it is a drop-in for
 * `supabase.storage.from(bucket)` at every existing call site.
 */
export function storageBucket(bucket: 'client-files' | 'receipts' | string): any {
  if (!R2_ENABLED) return supabase.storage.from(bucket as any);

  return {
    upload: (path: string, file: any, opts?: any) => r2Upload(bucket, path, file, opts),
    remove: (paths: string[]) => r2Remove(bucket, paths),
    // Synchronous to match Supabase; token cached above.
    getPublicUrl: (path: string) => ({ data: { publicUrl: r2AuthedUrlSync(bucket, path) } }),
    createSignedUrl: async (path: string, _ttlSec?: number) => {
      try {
        const signedUrl = await r2AuthedUrl(bucket, path);
        return { data: { signedUrl }, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message || 'R2 sign failed' } };
      }
    },
    download: async (path: string) => {
      try {
        const token = await getAccessToken();
        const res = await fetch(r2Endpoint(bucket, path), {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return { data: null, error: { message: `R2 download failed (${res.status})` } };
        const blob = await res.blob();
        return { data: blob, error: null };
      } catch (e: any) {
        return { data: null, error: { message: e?.message || 'R2 download failed' } };
      }
    },
  };
}
