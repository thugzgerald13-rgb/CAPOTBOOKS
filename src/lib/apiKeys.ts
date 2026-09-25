// API keys + webhooks + payment gateway config (Run 024 / T024). Persisted per workspace in localStorage.

export interface ApiKey {
  id: string;
  label: string;
  key: string; // capot_sk_... (shown once at creation)
  prefix: string; // stored for display (capot_sk_****)
  createdAt: string;
  lastUsed?: string;
  scopes: string[];
  revoked: boolean;
}

export interface WebhookConfig {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  secret: string;
  createdAt: string;
}

export interface PaymentGateway {
  id: string;
  name: string; // 'GCash' | 'Maya' | 'Stripe' | 'PayMongo'
  enabled: boolean;
  publicKey: string;
  secretKey: string; // stored masked; full shown once
  webhookUrl?: string;
}

const KEYS_KEY = 'capot.apiKeys';
const WEBHOOKS_KEY = 'capot.webhooks';
const GATEWAYS_KEY = 'capot.paymentGateways';

const read = <T>(k: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(k) || 'null') || fallback; } catch { return fallback; } };
const write = (k: string, v: any) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* ignore */ } };

export const WEBHOOK_EVENTS = ['invoice.created', 'invoice.paid', 'payment.received', 'journal.posted', 'client.updated'];

export function generateApiKey(label: string, scopes: string[] = ['read', 'write']): ApiKey {
  const raw = 'capot_sk_' + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
  const key: ApiKey = { id: crypto.randomUUID(), label, key: raw, prefix: raw.slice(0, 12) + '••••', createdAt: new Date().toISOString(), scopes, revoked: false };
  const all = read<ApiKey[]>(KEYS_KEY, []);
  all.unshift(key);
  write(KEYS_KEY, all);
  return key;
}
export function listApiKeys(): ApiKey[] { return read<ApiKey[]>(KEYS_KEY, []); }
export function revokeApiKey(id: string) { write(KEYS_KEY, read<ApiKey[]>(KEYS_KEY, []).map(k => k.id === id ? { ...k, revoked: true } : k)); }

export function listWebhooks(): WebhookConfig[] { return read<WebhookConfig[]>(WEBHOOKS_KEY, []); }
export function saveWebhook(w: WebhookConfig) {
  const all = read<WebhookConfig[]>(WEBHOOKS_KEY, []);
  const idx = all.findIndex(x => x.id === w.id);
  if (idx >= 0) all[idx] = w; else all.unshift(w);
  write(WEBHOOKS_KEY, all);
}
export function deleteWebhook(id: string) { write(WEBHOOKS_KEY, read<WebhookConfig[]>(WEBHOOKS_KEY, []).filter(w => w.id !== id)); }
export function generateWebhookSecret(): string { return 'whsec_' + Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join(''); }

const DEFAULT_GATEWAYS: PaymentGateway[] = [
  { id: 'gcash', name: 'GCash', enabled: false, publicKey: '', secretKey: '' },
  { id: 'maya', name: 'Maya', enabled: false, publicKey: '', secretKey: '' },
  { id: 'paymongo', name: 'PayMongo', enabled: false, publicKey: '', secretKey: '' },
  { id: 'stripe', name: 'Stripe', enabled: false, publicKey: '', secretKey: '' },
];
export function listGateways(): PaymentGateway[] {
  const stored = read<PaymentGateway[]>(GATEWAYS_KEY, []);
  if (!stored.length) return DEFAULT_GATEWAYS;
  return DEFAULT_GATEWAYS.map(d => stored.find(s => s.id === d.id) || d);
}
export function saveGateway(g: PaymentGateway) {
  const all = listGateways().map(x => x.id === g.id ? g : x);
  write(GATEWAYS_KEY, all);
}
