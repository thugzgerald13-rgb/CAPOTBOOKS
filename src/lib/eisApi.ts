// eisApi.ts — BIR EIS API client.
//
// Two modes:
//   * edge-proxy (recommended for production): POSTs to the Supabase Edge
//     Function `eis-transmit`, which holds the private key + Application Key
//     and a fixed, BIR-whitelisted egress IP. The browser never sees secrets.
//   * direct (sandbox / dev only): signs and encrypts in the browser with
//     eisCrypto.ts and calls EIS endpoints directly. Requires the BIR public
//     key and your signing key to be configured locally.
//
// Three EIS calls: authenticate (token, 6h), invoice issuance (1–100/batch),
// and inquiry result (per-invoice ack codes).

import { EIS_ENDPOINTS, type EisEnvironment, type EisInvoiceJson, type EisSettings } from './eisTypes';
import { signJws, encryptAesGcm, generateAesSessionKey, wrapSessionKeyWithBirKey, hmacSha256RequestSignature, bufToB64Url } from './eisCrypto';

export interface EisSubmitResult {
  batchId: string;
  submittedAt: string;
  rawResponse?: any;
  perInvoice?: Array<{ eisUniqueId: string; code?: string; message?: string }>;
}

export interface EisInquiryResult {
  eisUniqueId: string;
  code: string;        // ACC = accepted; SYN*/ERR* = rejected
  message?: string;
  receivedAt?: string;
}

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
let cachedToken: { token: string; expiresAt: number } | null = null;

function edgeFunctionUrl(): string {
  // Matches supabase client config in src/lib/supabase.ts.
  const url = (import.meta as any).env?.VITE_SUPABASE_URL || '';
  return `${url}/functions/v1/eis-transmit`;
}

// ---------------------------------------------------------------------------
// Edge-proxy mode (production path)
// ---------------------------------------------------------------------------

async function callEdgeProxy(action: 'submit' | 'inquiry' | 'auth-test', payload: any, settings: EisSettings): Promise<any> {
  const anonKey = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '';
  const res = await fetch(edgeFunctionUrl(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify({ action, environment: settings.environment, payload }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`EIS proxy ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}

// ---------------------------------------------------------------------------
// Direct mode (sandbox / dev) — full sign + encrypt + HMAC in-browser
// ---------------------------------------------------------------------------

async function authenticateDirect(settings: EisSettings, birPublicJwk: JsonWebKey): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
  const sessionKey = await generateAesSessionKey();
  const wrappedKey = await wrapSessionKeyWithBirKey(sessionKey, birPublicJwk);
  const ep = EIS_ENDPOINTS[settings.environment];
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ applicationKey: settings.applicationKey, wrappedSessionKey: wrappedKey });
  const { signature } = await hmacSha256RequestSignature('POST', new URL(ep.auth).pathname, timestamp, body, settings.applicationKey);
  const res = await fetch(ep.auth, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-EIS-Timestamp': timestamp,
      'X-EIS-Signature': signature,
      'X-EIS-AppKey': settings.applicationKey,
    },
    body,
  });
  if (!res.ok) throw new Error(`EIS auth failed: ${res.status}`);
  const data = await res.json();
  const token = data.token || data.accessToken || data.authToken;
  cachedToken = { token, expiresAt: Date.now() + TOKEN_TTL_MS - 60_000 };
  return token;
}

async function submitDirect(
  invoices: EisInvoiceJson[],
  settings: EisSettings,
  privateJwk: JsonWebKey,
  birPublicJwk: JsonWebKey,
): Promise<EisSubmitResult> {
  const token = await authenticateDirect(settings, birPublicJwk);
  const sessionKey = await generateAesSessionKey();
  // Sign each invoice, then encrypt the batch payload.
  const signed = await Promise.all(invoices.map(inv =>
    signJws(inv, privateJwk, settings.signingKeyId || 'default'),
  ));
  const payloadBody = JSON.stringify({ invoices: signed });
  const enc = await encryptAesGcm(payloadBody, sessionKey);
  const wrappedKey = await wrapSessionKeyWithBirKey(sessionKey, birPublicJwk);
  const ep = EIS_ENDPOINTS[settings.environment];
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ wrappedSessionKey: wrappedKey, iv: enc.ivB64Url, tag: enc.tagB64Url, ciphertext: enc.ciphertextB64Url });
  const { signature } = await hmacSha256RequestSignature('POST', new URL(ep.submit).pathname, timestamp, body, settings.applicationKey);
  const res = await fetch(ep.submit, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-EIS-Timestamp': timestamp,
      'X-EIS-Signature': signature,
      'X-EIS-AppKey': settings.applicationKey,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`EIS submit failed: ${res.status} ${JSON.stringify(data)}`);
  return {
    batchId: data.batchId || data.submissionId || `batch-${Date.now()}`,
    submittedAt: new Date().toISOString(),
    rawResponse: data,
  };
}

// ---------------------------------------------------------------------------
// Public API — mode-agnostic
// ---------------------------------------------------------------------------

export async function submitInvoices(
  invoices: EisInvoiceJson[],
  settings: EisSettings,
  opts: { privateJwk?: JsonWebKey; birPublicJwk?: JsonWebKey } = {},
): Promise<EisSubmitResult> {
  if (invoices.length === 0) throw new Error('No invoices to submit');
  if (settings.useEdgeProxy) {
    return callEdgeProxy('submit', { invoices }, settings);
  }
  if (!opts.privateJwk || !opts.birPublicJwk) {
    throw new Error('Direct mode requires the signing private key and BIR public key (sandbox only)');
  }
  return submitDirect(invoices, settings, opts.privateJwk, opts.birPublicJwk);
}

export async function inquireResult(
  eisUniqueIds: string[],
  settings: EisSettings,
): Promise<EisInquiryResult[]> {
  if (settings.useEdgeProxy) {
    const data = await callEdgeProxy('inquiry', { eisUniqueIds }, settings);
    return data.results || [];
  }
  // Direct mode: poll inquiry endpoint with the auth token.
  if (!cachedToken) throw new Error('Authenticate first (direct sandbox mode)');
  const ep = EIS_ENDPOINTS[settings.environment];
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ eisUniqueIds });
  const { signature } = await hmacSha256RequestSignature('POST', new URL(ep.inquiry).pathname, timestamp, body, settings.applicationKey);
  const res = await fetch(ep.inquiry, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${cachedToken.token}`,
      'X-EIS-Timestamp': timestamp,
      'X-EIS-Signature': signature,
      'X-EIS-AppKey': settings.applicationKey,
    },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`EIS inquiry failed: ${res.status}`);
  return (data.results || []).map((r: any) => ({
    eisUniqueId: r.eisUniqueId,
    code: r.code || r.ackCode || 'UNKNOWN',
    message: r.message,
    receivedAt: r.receivedAt,
  }));
}

export function clearAuthTokenCache() { cachedToken = null; }

export { bufToB64Url };
export type { EisEnvironment };
