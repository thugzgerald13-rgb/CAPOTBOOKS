// subscription.ts — Free-plan transaction cap + plan state (client-side stub).
// There is no payment integration yet: a plan is chosen via Settings → Plan &
// Billing and persisted per user in localStorage. Subscribed plans (anything
// other than 'free') get unlimited transactions; free / unsubscribed users are
// capped at FREE_TRANSACTION_LIMIT newly-added transactions. Counting covers
// the primary transaction records (sales + purchases), which also covers
// Billing invoices because they create a sale.
export const FREE_TRANSACTION_LIMIT = 7;
export type SubscriptionPlan = 'free' | 'starter' | 'pro' | 'enterprise';

const PLAN_PREFIX = 'capot.subscription.plan';
const TX_COUNT_PREFIX = 'capot.txCount';

function planKey(userId?: string | null) { return `${PLAN_PREFIX}.${userId || 'default'}`; }
function txKey(userId?: string | null) { return `${TX_COUNT_PREFIX}.${userId || 'default'}`; }

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

export type LimitCheck = {
  allowed: boolean;
  count: number;
  limit: number;
  isSubscribed: boolean;
  remaining: number;
};

export function checkTransactionLimit(userId?: string | null): LimitCheck {
  const sub = isSubscribed(userId);
  const count = getTransactionCount(userId);
  const limit = FREE_TRANSACTION_LIMIT;
  const allowed = sub || count < limit;
  const remaining = sub ? Infinity : Math.max(0, limit - count);
  return { allowed, count, limit, isSubscribed: sub, remaining };
}
