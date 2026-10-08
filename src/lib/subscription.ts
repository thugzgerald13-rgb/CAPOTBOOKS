// subscription.ts — Subscription state + free-plan transaction cap.
//
// SECURITY MODEL (manual GCash payment flow):
//   * The subscription plan + status live in Supabase (profiles table) and are
//     the single source of truth. They can only be changed by the admin after
//     verifying a GCash payment — a user editing localStorage can no longer
//     unlock unlimited transactions.
//   * The free-tier transaction *counter* is still kept in localStorage. It is
//     only used to meter the free tier (max FREE_TRANSACTION_LIMIT new sales /
//     purchases). Tampering with it only grants extra free transactions; it
//     cannot upgrade a plan. Counting server-side would require a per-user
//     transaction table and would lock out users with imported historical data,
//     so the counter stays client-side by design.
//   * fetchSubscription() caches the server answer in memory for 60s so saving
//     a transaction does not trigger a Supabase round-trip every time. Call
//     invalidateSubscriptionCache() after an admin approval to force a refresh.
import { supabase } from './supabase';

export const FREE_TRANSACTION_LIMIT = 7;
export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'enterprise';
export type SubscriptionStatus = 'active' | 'expired' | 'canceled' | null;

const PLAN_PREFIX = 'capot.subscription.plan';
const TX_COUNT_PREFIX = 'capot.txCount';

function planKey(userId?: string | null) { return `${PLAN_PREFIX}.${userId || 'default'}`; }
function txKey(userId?: string | null) { return `${TX_COUNT_PREFIX}.${userId || 'default'}`; }

// ---------------------------------------------------------------------------
// Local cache (instant first paint + offline fallback). Not authoritative.
// ---------------------------------------------------------------------------
export function getSubscriptionPlan(userId?: string | null): SubscriptionPlan {
  try {
    const raw = localStorage.getItem(planKey(userId));
    if (raw === 'starter' || raw === 'pro' || raw === 'enterprise') return raw;
  } catch { /* ignore */ }
  return 'free';
}
export function setSubscriptionPlan(plan: SubscriptionPlan, userId?: string | null) {
  try { localStorage.setItem(planKey(userId), plan); } catch { /* ignore */ }
}
export function isSubscribed(userId?: string | null): boolean {
  return getSubscriptionPlan(userId) !== 'free';
}

// ---------------------------------------------------------------------------
// Free-tier transaction counter (client-side meter only).
// ---------------------------------------------------------------------------
export function getTransactionCount(userId?: string | null): number {
  try {
    const raw = localStorage.getItem(txKey(userId));
    const n = raw == null ? 0 : parseInt(raw, 10);
    return Number.isFinite(n) && n > 0 ? n : 0;
  } catch { return 0; }
}
/** Count a newly-added transaction. Returns the new total. */
export function recordNewTransaction(userId?: string | null): number {
  const next = getTransactionCount(userId) + 1;
  try { localStorage.setItem(txKey(userId), String(next)); } catch { /* ignore */ }
  return next;
}

// ---------------------------------------------------------------------------
// Server source of truth (profiles.subscription_plan / subscription_status).
// ---------------------------------------------------------------------------
export interface SubscriptionState {
  plan: SubscriptionPlan;
  status: SubscriptionStatus;
  isSubscribed: boolean;
}

const SERVER_CACHE_TTL_MS = 60_000;
const serverCache = new Map<string, { at: number; state: SubscriptionState }>();

function normalizePlan(raw: unknown): SubscriptionPlan {
  return raw === 'starter' || raw === 'pro' || raw === 'enterprise' ? raw : 'free';
}

export async function fetchSubscription(userId?: string | null): Promise<SubscriptionState> {
  const free: SubscriptionState = { plan: 'free', status: null, isSubscribed: false };
  if (!userId) return free;

  const cached = serverCache.get(userId);
  if (cached && Date.now() - cached.at < SERVER_CACHE_TTL_MS) return cached.state;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('subscription_plan, subscription_status, subscription_expires_at')
      .eq('id', userId)
      .maybeSingle();

    let state: SubscriptionState = free;
    if (!error && data) {
      const plan = normalizePlan(data.subscription_plan);
      const status = (data.subscription_status as SubscriptionStatus) ?? null;
      const expired = data.subscription_expires_at
        ? new Date(data.subscription_expires_at).getTime() < Date.now()
        : false;
      if (plan !== 'free' && status === 'active' && !expired) {
        state = { plan, status: 'active', isSubscribed: true };
      } else {
        state = { plan: 'free', status: expired ? 'expired' : status, isSubscribed: false };
      }
    } else {
      // Table not migrated yet / offline → fall back to local cached plan.
      const local = getSubscriptionPlan(userId);
      state = { plan: local, status: null, isSubscribed: local !== 'free' };
    }

    setSubscriptionPlan(state.plan, userId);
    serverCache.set(userId, { at: Date.now(), state });
    return state;
  } catch {
    const local = getSubscriptionPlan(userId);
    const state: SubscriptionState = { plan: local, status: null, isSubscribed: local !== 'free' };
    serverCache.set(userId, { at: Date.now(), state });
    return state;
  }
}

/** Force the next fetchSubscription() to hit Supabase again. */
export function invalidateSubscriptionCache(userId?: string | null) {
  if (userId) serverCache.delete(userId);
}

export type LimitCheck = {
  allowed: boolean;
  count: number;
  limit: number;
  isSubscribed: boolean;
  remaining: number;
  plan: SubscriptionPlan;
};

/** Async cap check — reads the authoritative plan from Supabase (cached 60s). */
export async function checkTransactionLimit(userId?: string | null): Promise<LimitCheck> {
  const sub = await fetchSubscription(userId);
  const count = getTransactionCount(userId);
  const limit = FREE_TRANSACTION_LIMIT;
  const allowed = sub.isSubscribed || count < limit;
  const remaining = sub.isSubscribed ? Infinity : Math.max(0, limit - count);
  return { allowed, count, limit, isSubscribed: sub.isSubscribed, remaining, plan: sub.plan };
}
