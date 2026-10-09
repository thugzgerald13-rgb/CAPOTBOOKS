// eisCrypto.ts — BIR EIS cryptographic primitives (Web Crypto API, no deps).
//
// Per the EIS API Development Guide:
//   1. Each invoice JSON is signed as a JWS (RS256) with the taxpayer's
//      private signing key → integrity + origin.
//   2. A random AES-256 session key is generated per auth session, wrapped
//      (RSA-OAEP/SHA-1) with the BIR public key, and exchanged for a token.
//   3. The signed payload is encrypted (AES-256-GCM) with the session key →
//      confidentiality; only the BIR can decrypt.
//   4. Every submission request carries an HMAC-SHA256 signature over the
//      canonical request string, using the Application Key as the secret.
//
// NOTE: In production the private key and Application Key MUST live
// server-side (Supabase Edge Function `eis-transmit`) because BIR whitelists
// fixed server IPs. Browser-mode here is for sandbox / local testing only.

// ---------------------------------------------------------------------------
// Base64URL helpers (JWS/JWE compact serialization)
// ---------------------------------------------------------------------------

function bufToB64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlToBuf(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function strToBuf(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

// ---------------------------------------------------------------------------
// Signing key pair (RS256 = RSASSA-PKCS1-v1_5 + SHA-256)
// ---------------------------------------------------------------------------

export interface EisSigningKeyPair {
  keyId: string;
  publicJwk: JsonWebKey;
  privateJwk: JsonWebKey; // store securely — shown once by the EIS portal
}

export async function generateSigningKeyPair(): Promise<EisSigningKeyPair> {
  const pair = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', pair.publicKey);
  const privateJwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  // key id = first 8 chars of public key thumbprint (kid convention)
  const thumb = await crypto.subtle.digest('SHA-256', strToBuf(JSON.stringify(publicJwk)));
  const keyId = bufToB64Url(thumb).slice(0, 8).toUpperCase();
  return { keyId, publicJwk, privateJwk };
}

/**
 * Sign an invoice JSON as a compact JWS (RS256).
 * Header: { alg: "RS256", typ: "JWT", kid: <keyId> }
 */
export async function signJws(
  payload: object,
  privateJwk: JsonWebKey,
  keyId: string,
): Promise<string> {
  const key = await crypto.subtle.importKey('jwk', privateJwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const header = { alg: 'RS256', typ: 'JWT', kid: keyId };
  const headerB64 = bufToB64Url(strToBuf(JSON.stringify(header)));
  const payloadB64 = bufToB64Url(strToBuf(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, strToBuf(signingInput));
  return `${signingInput}.${bufToB64Url(sig)}`;
}

// ---------------------------------------------------------------------------
// AES-256-GCM session key + payload encryption
// ---------------------------------------------------------------------------

export async function generateAesSessionKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export interface AesEncrypted {
  ciphertextB64Url: string;
  ivB64Url: string;
  tagB64Url: string; // GCM auth tag (last 16 bytes of ciphertext buffer)
}

/** Encrypt the signed JWS string (or any payload) with AES-256-GCM. */
export async function encryptAesGcm(plaintext: string, key: CryptoKey): Promise<AesEncrypted> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, strToBuf(plaintext));
  const bytes = new Uint8Array(buf);
  // GCM appends a 16-byte auth tag; split it out for the EIS wire format.
  const ciphertext = bytes.slice(0, bytes.length - 16);
  const tag = bytes.slice(bytes.length - 16);
  return {
    ciphertextB64Url: bufToB64Url(ciphertext),
    ivB64Url: bufToB64Url(iv),
    tagB64Url: bufToB64Url(tag),
  };
}

// ---------------------------------------------------------------------------
// RSA-OAEP wrap of the AES session key with the BIR public key
// ---------------------------------------------------------------------------

export async function wrapSessionKeyWithBirKey(
  aesKey: CryptoKey,
  birPublicJwk: JsonWebKey,
): Promise<string> {
  const birKey = await crypto.subtle.importKey(
    'jwk', birPublicJwk, { name: 'RSA-OAEP', hash: 'SHA-1' }, false, ['wrapKey'],
  );
  const wrapped = await crypto.subtle.wrapKey('raw', aesKey, birKey, { name: 'RSA-OAEP' });
  return bufToB64Url(wrapped);
}

// ---------------------------------------------------------------------------
// HMAC-SHA256 request signature (Application Key as secret)
// ---------------------------------------------------------------------------

/**
 * Canonical request string for HMAC (EIS guide convention):
 *   method + "\n" + path + "\n" + timestamp + "\n" + bodyHash
 * where bodyHash = base64url(SHA-256(body)). Returns hex digest.
 */
export async function hmacSha256RequestSignature(
  method: string,
  path: string,
  timestamp: string,
  body: string,
  applicationKey: string,
): Promise<{ signature: string; bodyHash: string }> {
  const bodyHashBuf = await crypto.subtle.digest('SHA-256', strToBuf(body));
  const bodyHash = bufToB64Url(bodyHashBuf);
  const canonical = `${method.toUpperCase()}\n${path}\n${timestamp}\n${bodyHash}`;
  const key = await crypto.subtle.importKey(
    'raw', strToBuf(applicationKey), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, strToBuf(canonical));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return { signature: hex, bodyHash };
}

// ---------------------------------------------------------------------------
// Passphrase protection for the private key at rest (browser sandbox mode)
// ---------------------------------------------------------------------------

/** Derive a 256-bit key from a passphrase (PBKDF2, 600k iterations, SHA-256). */
async function deriveVaultKey(passphrase: string, salt: Uint8Array): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', strToBuf(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptPrivateKeyForStorage(
  privateJwk: JsonWebKey,
  passphrase: string,
): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveVaultKey(passphrase, salt);
  const plaintext = strToBuf(JSON.stringify(privateJwk));
  const buf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plaintext);
  return JSON.stringify({ v: 1, salt: bufToB64Url(salt), iv: bufToB64Url(iv), data: bufToB64Url(buf) });
}

export async function decryptPrivateKeyFromStorage(
  encrypted: string,
  passphrase: string,
): Promise<JsonWebKey> {
  const { salt, iv, data } = JSON.parse(encrypted);
  const key = await deriveVaultKey(passphrase, b64UrlToBuf(salt));
  const buf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64UrlToBuf(iv) }, key, b64UrlToBuf(data));
  return JSON.parse(new TextDecoder().decode(buf));
}

export { bufToB64Url, b64UrlToBuf, strToBuf };
