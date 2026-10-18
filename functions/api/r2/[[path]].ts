/**
 * Cloudflare Pages Function — R2 object-storage gateway for CAPOT Books.
 *
 * Route:  /api/r2/<bucket>/<key...>
 *   PUT/POST — upload object body (auth required)
 *   GET/HEAD — download object (auth via Authorization: Bearer header OR
 *              ?token= query param, so <img src> and <a download> work)
 *   DELETE   — delete object
 *
 * Setup (Pages dashboard → your project → Settings):
 *   1. Functions → R2 bucket bindings → add binding name "FILES" → select
 *      your R2 bucket (e.g. "capotbooks-files").
 *   2. Environment variables → Production → add secrets:
 *        SUPABASE_JWT_SECRET  (recommended) — verifies the Supabase access
 *          token locally with HS256. Found in Supabase → Settings → API →
 *          JWT Settings → Secret.
 *        SUPABASE_URL + SUPABASE_ANON_KEY — only needed if JWT secret is
 *          unset (fallback introspection via /auth/v1/user). VITE_* copies
 *          are auto-detected too.
 *
 * Object keys: <bucket>/<storagePath> — bucket is the logical Supabase bucket
 * name ("client-files" | "receipts"), storagePath is the same immutable
 * versioned path the app already uses, so an S3→R2 copy migrates everything.
 */
export interface Env {
  FILES: R2Bucket;
  SUPABASE_JWT_SECRET?: string;
  SUPABASE_URL?: string;
  SUPABASE_ANON_KEY?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' };
const ALLOWED_BUCKETS = new Set(['client-files', 'receipts']);
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024; // Workers/Pages request body cap

function json(body: unknown, status = 200, extraHeaders?: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...JSON_HEADERS, ...(extraHeaders || {}) },
  });
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function verifySupabaseToken(token: string, env: Env): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const [headerB64, payloadB64, sigB64] = parts;
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(payloadB64)));
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return false;

    // Preferred: local HS256 verification (no upstream call)
    if (env.SUPABASE_JWT_SECRET) {
      const key = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(env.SUPABASE_JWT_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      const data = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
      return await crypto.subtle.verify('HMAC', key, b64urlDecode(sigB64), data);
    }

    // Fallback: introspect via Supabase Auth
    const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL;
    const anon = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY;
    if (!url || !anon) return false;
    const res = await fetch(`${url.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    });
    return res.ok;
  } catch {
    return false;
  }
}

function extractToken(request: Request, url: URL): string | null {
  const auth = request.headers.get('Authorization');
  if (auth && auth.slice(0, 7).toLowerCase() === 'bearer ') return auth.slice(7).trim();
  const q = url.searchParams.get('token');
  return q || null;
}

function parseRange(range: string): R2Range {
  const m = /bytes=(\d*)-(\d*)/.exec(range);
  if (!m) return { offset: 0 };
  const start = m[1] ? parseInt(m[1], 10) : undefined;
  const end = m[2] ? parseInt(m[2], 10) : undefined;
  if (start === undefined && end !== undefined) return { suffix: end };
  if (start === undefined) return { offset: 0 };
  if (end === undefined) return { offset: start };
  return { offset: start, length: Math.max(1, end - start + 1) };
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context;
  const url = new URL(request.url);

  if (!env.FILES) {
    return json({ error: 'R2 bucket binding "FILES" is not configured.' }, 503);
  }

  const rawPath = Array.isArray(params.path) ? params.path.join('/') : String(params.path || '');
  const slashIdx = rawPath.indexOf('/');
  if (slashIdx < 0) return json({ error: 'Path must be /api/r2/<bucket>/<key>.' }, 400);

  const bucket = rawPath.slice(0, slashIdx);
  const key = rawPath.slice(slashIdx + 1);
  if (!ALLOWED_BUCKETS.has(bucket) || !key) {
    return json({ error: 'Invalid bucket or empty object key.' }, 400);
  }
  const r2Key = `${bucket}/${key}`;

  const token = extractToken(request, url);
  if (!token || !(await verifySupabaseToken(token, env))) {
    return json({ error: 'Unauthorized.' }, 401);
  }

  const method = request.method.toUpperCase();

  // ---- Upload ----
  if (method === 'PUT' || method === 'POST') {
    const len = Number(request.headers.get('Content-Length') || 0);
    if (len > MAX_UPLOAD_BYTES) return json({ error: 'File exceeds 100 MB upload limit.' }, 413);
    const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
    const cacheControl = request.headers.get('X-Cache-Control') || 'public, max-age=31536000, immutable';
    const obj = await env.FILES.put(r2Key, request.body as ReadableStream<Uint8Array>, {
      httpMetadata: { contentType, cacheControl },
    });
    return json({ key: r2Key, etag: obj.etag, size: obj.size });
  }

  // ---- Delete ----
  if (method === 'DELETE') {
    await env.FILES.delete(r2Key);
    return json({ key: r2Key, deleted: true });
  }

  // ---- Download ----
  if (method === 'GET' || method === 'HEAD') {
    const rangeHeader = request.headers.get('Range');
    const obj = rangeHeader
      ? await env.FILES.get(r2Key, { range: parseRange(rangeHeader) })
      : await env.FILES.get(r2Key);
    if (!obj) return json({ error: 'Object not found.' }, 404);

    const headers = new Headers();
    obj.writeHttpMetadata(headers);
    headers.set('etag', obj.httpEtag);
    if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'private, max-age=3600');

    if (rangeHeader && obj.range) {
      const off = obj.range.offset ?? 0;
      const len = obj.range.length ?? (obj.size - off);
      headers.set('Content-Range', `bytes ${off}-${off + len - 1}/${obj.size}`);
      return new Response(obj.body, { status: 206, headers });
    }
    return new Response(obj.body, { status: 200, headers });
  }

  return json({ error: `Method ${method} not allowed.` }, 405, { Allow: 'GET, HEAD, PUT, POST, DELETE' });
};
