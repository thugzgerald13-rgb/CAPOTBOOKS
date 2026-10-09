// supabase/functions/eis-transmit/index.ts
//
// Server-side BIR EIS transmitter. Why this exists:
//   * The BIR production EIS whitelists FIXED server IPs — a browser's IP is
//     never whitelisted, so production transmission must come from here.
//   * The Application Key and the RS256 signing private key must never reach
//     the browser. They live in Supabase Vault / Edge Function secrets.
//
// Secrets to configure (Supabase Dashboard > Edge Functions > Secrets):
//   EIS_APP_KEY                — Application Key from eis-cert.bir.gov.ph
//   EIS_SIGNING_PRIVATE_JWK    — JSON string of the RS256 private key (JWK)
//   EIS_BIR_PUBLIC_JWK         — JSON string of the BIR public RSA key (JWK)
//   EIS_SIGNING_KEY_ID         — kid header value for the JWS (default "default")
//   EIS_ENVIRONMENT            — "sandbox" or "production" (default sandbox)
//
// NOTE (RMC 98-2026): Production transmission of sales data (s.237-A, PTT) is
// not yet operative (Oct 2026). This function is used for EIS Certification
// sandbox tests and will carry live reporting once the BIR issues the rules.
//
// Request body: { action: "submit" | "inquiry", environment?, payload }
//   submit  payload: { invoices: EisInvoiceJson[] }  (1–100)
//   inquiry payload: { eisUniqueIds: string[] }
//
// Response: { batchId?, submittedAt?, results?: [...] } or { error: string }.

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

const ENDPOINTS = {
  sandbox: {
    auth: 'https://eis-cert.bir.gov.ph/eis/v1/authenticate',
    submit: 'https://eis-cert.bir.gov.ph/eis/v1/invoice/issuance',
    inquiry: 'https://eis-cert.bir.gov.ph/eis/v1/invoice/inquiry',
  },
  production: {
    auth: 'https://eis.bir.gov.ph/eis/v1/authenticate',
    submit: 'https://eis.bir.gov.ph/eis/v1/invoice/issuance',
    inquiry: 'https://eis.bir.gov.ph/eis/v1/invoice/inquiry',
  },
} as const;

type Env = keyof typeof ENDPOINTS;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// --- base64url helpers ---------------------------------------------------
function bufToB64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function strToBuf(s: string): Uint8Array { return new TextEncoder().encode(s); }

// --- JWS RS256 sign ------------------------------------------------------
async function signJws(payload: object, privateJwk: JsonWebKey, keyId: string): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const header = { alg: 'RS256', typ: 'JWT', kid: keyId };
  const h = bufToB64Url(strToBuf(JSON.stringify(header)));
  const p = bufToB64Url(strToBuf(JSON.stringify(payload)));
  const input = `${h}.${p}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, strToBuf(input));
  return `${input}.${bufToB64Url(sig)}`;
}

// --- AES-256-GCM + RSA-OAEP wrap -----------------------------------------
async function generateAesKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}
async function encryptAes(plaintext: string, key: CryptoKey) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, strToBuf(plaintext));
  const bytes = new Uint8Array(buf);
  return {
    ciphertext: bufToB64Url(bytes.slice(0, bytes.length - 16)),
    tag: bufToB64Url(bytes.slice(bytes.length - 16)),
    iv: bufToB64Url(iv),
  };
}
async function wrapKey(aesKey: CryptoKey, birJwk: JsonWebKey): Promise<string> {
  const birKey = await crypto.subtle.importKey('jwk', birJwk, { name: 'RSA-OAEP', hash: 'SHA-1' }, false, ['wrapKey']);
  const wrapped = await crypto.subtle.wrapKey('raw', aesKey, birKey, { name: 'RSA-OAEP' });
  return bufToB64Url(wrapped);
}

// --- HMAC-SHA256 request signature ---------------------------------------
async function hmacSig(method: string, path: string, ts: string, body: string, appKey: string) {
  const bodyHash = bufToB64Url(await crypto.subtle.digest('SHA-256', strToBuf(body)));
  const canonical = `${method.toUpperCase()}\n${path}\n${ts}\n${bodyHash}`;
  const key = await crypto.subtle.importKey('raw', strToBuf(appKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, strToBuf(canonical));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

let cachedToken: { token: string; expiresAt: number } | null = null;

async function authenticate(env: Env, appKey: string, birJwk: JsonWebKey): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const ep = ENDPOINTS[env];
  const aesKey = await generateAesKey();
  const wrapped = await wrapKey(aesKey, birJwk);
  const ts = new Date().toISOString();
  const body = JSON.stringify({ applicationKey: appKey, wrappedSessionKey: wrapped });
  const sig = await hmacSig('POST', new URL(ep.auth).pathname, ts, body, appKey);
  const res = await fetch(ep.auth, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-EIS-Timestamp': ts, 'X-EIS-Signature': sig, 'X-EIS-AppKey': appKey },
    body,
  });
  if (!res.ok) throw new Error(`EIS auth failed: ${res.status} ${await res.text()}`);
  const data: any = await res.json();
  const token = data.token || data.accessToken || data.authToken;
  cachedToken = { token, expiresAt: Date.now() + 5.5 * 3600 * 1000 };
  return token;
}

async function handleSubmit(env: Env, invoices: any[], secrets: { appKey: string; privateJwk: JsonWebKey; birJwk: JsonWebKey; keyId: string }) {
  if (invoices.length === 0 || invoices.length > 100) throw new Error('Batch must contain 1–100 invoices');
  const token = await authenticate(env, secrets.appKey, secrets.birJwk);
  const signed = await Promise.all(invoices.map(inv => signJws(inv, secrets.privateJwk, secrets.keyId)));
  const aesKey = await generateAesKey();
  const enc = await encryptAes(JSON.stringify({ invoices: signed }), aesKey);
  const wrapped = await wrapKey(aesKey, secrets.birJwk);
  const ep = ENDPOINTS[env];
  const ts = new Date().toISOString();
  const body = JSON.stringify({ wrappedSessionKey: wrapped, iv: enc.iv, tag: enc.tag, ciphertext: enc.ciphertext });
  const sig = await hmacSig('POST', new URL(ep.submit).pathname, ts, body, secrets.appKey);
  const res = await fetch(ep.submit, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-EIS-Timestamp': ts, 'X-EIS-Signature': sig, 'X-EIS-AppKey': secrets.appKey },
    body,
  });
  const data: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`EIS submit failed: ${res.status} ${JSON.stringify(data)}`);
  return { batchId: data.batchId || data.submissionId || `batch-${Date.now()}`, submittedAt: new Date().toISOString(), rawResponse: data, jws: signed };
}

async function handleInquiry(env: Env, ids: string[], secrets: { appKey: string; birJwk: JsonWebKey }) {
  const token = await authenticate(env, secrets.appKey, secrets.birJwk);
  const ep = ENDPOINTS[env];
  const ts = new Date().toISOString();
  const body = JSON.stringify({ eisUniqueIds: ids });
  const sig = await hmacSig('POST', new URL(ep.inquiry).pathname, ts, body, secrets.appKey);
  const res = await fetch(ep.inquiry, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, 'X-EIS-Timestamp': ts, 'X-EIS-Signature': sig, 'X-EIS-AppKey': secrets.appKey },
    body,
  });
  if (!res.ok) throw new Error(`EIS inquiry failed: ${res.status}`);
  const data: any = await res.json();
  return { results: (data.results || []).map((r: any) => ({ eisUniqueId: r.eisUniqueId, code: r.code || r.ackCode || 'UNKNOWN', message: r.message, receivedAt: r.receivedAt })) };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const body = await req.json();
    const env: Env = (body.environment || Deno.env.get('EIS_ENVIRONMENT') || 'sandbox') as Env;
    const appKey = Deno.env.get('EIS_APP_KEY');
    const privateJwkRaw = Deno.env.get('EIS_SIGNING_PRIVATE_JWK');
    const birJwkRaw = Deno.env.get('EIS_BIR_PUBLIC_JWK');
    if (!appKey || !privateJwkRaw || !birJwkRaw) {
      return new Response(JSON.stringify({ error: 'EIS secrets not configured (EIS_APP_KEY, EIS_SIGNING_PRIVATE_JWK, EIS_BIR_PUBLIC_JWK)' }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const privateJwk = JSON.parse(privateJwkRaw);
    const birJwk = JSON.parse(birJwkRaw);
    const keyId = Deno.env.get('EIS_SIGNING_KEY_ID') || 'default';
    const secrets = { appKey, privateJwk, birJwk, keyId };

    let result: any;
    if (body.action === 'submit') result = await handleSubmit(env, body.payload?.invoices || [], secrets);
    else if (body.action === 'inquiry') result = await handleInquiry(env, body.payload?.eisUniqueIds || [], { appKey, birJwk });
    else if (body.action === 'auth-test') { await authenticate(env, appKey, birJwk); result = { ok: true, message: 'Authenticated to EIS ' + env }; }
    else throw new Error('Unknown action: ' + body.action);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message || String(e) }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
