// subscription.ts — Trial + module entitlements (server is the source of truth).
//
// MODEL
//   * Every account owner gets a 7-day free trial during which ALL modules
//     are unlocked. The trial clock is
//     stored on profiles and started by the server the first time the owner
//     opens the workspace after choosing a role — it cannot be reset by
//     clearing the browser.
//   * After the trial, the Free Core stays available for unlimited transaction
//     entry, COA and history. Formal journals, ledgers and trial balance are in
//     the paid accounting_books module. Other paid modules (reports, billing,
//     compliance, inventory, team) unlock only while a paid entitlement is
//     active. Entitlements are granted by the admin when a GCash receipt is
//     approved (scripts/modules_entitlements.sql).
//   * Managed staff inherit their account OWNER's trial/modules (resolved by the
//     get_my_entitlements() RPC). Independent primary-role accountants/bookkeepers
//     have their own subscription unless they are managed subusers.
//   * Gating is a UI-level lock backed by server-held entitlements. It does not
//     block direct database access; locked data is never deleted or hidden from
//     exports of Core data.
//   * On an entitlement RPC failure the last known entitlement cache is used;
//     without a valid cache, paid module screens fail closed while Free Core stays
//     available. Apply the migration before launch and test this behavior.
import { useSyncExternalStore } from 'react';
import { supabase } from './supabase';
import { isModuleId, type ModuleId, type ModuleKey } from './modules';

export interface PaidEntitlement {
  expiresAt: string | null;
  source: string; // 'purchase' | 'admin' | 'legacy_plan'
}

export interface EntitlementState {
  status: 'idle' | 'loading' | 'ready' | 'unavailable';
  userId: string | null;
  isTeamMember: boolean;
  isServerAdmin: boolean;
  trialStartedAt: string | null;
  trialEndsAt: string | null;
  paid: Partial<Record<ModuleId, PaidEntitlement>>;
  /** serverNow - clientNow at fetch time; keeps expiry checks honest if the device clock is wrong. */
  clockSkewMs: number;
}

const EMPTY: EntitlementState = {
  status: 'idle',
  userId: null,
  isTeamMember: false,
  isServerAdmin: false,
  trialStartedAt: null,
  trialEndsAt: null,
  paid: {},
  clockSkewMs: 0,
};

const CACHE_PREFIX = 'capot.entitlements';
const CACHE_TTL_MS = 60_000;

let state: EntitlementState = EMPTY;
let lastFetchAt = 0;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setState(next: EntitlementState) {
  state = next;
  listeners.forEach((l) => l());
}
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
function getSnapshot() { return state; }

/** React hook — re-renders when entitlements load or change. */
export function useEntitlements(): EntitlementState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
export function getEntitlements(): EntitlementState { return state; }

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------
const DAY_MS = 86_400_000;
const nowMs = (s: EntitlementState) => Date.now() + s.clockSkewMs;

export function isTrialActive(s: EntitlementState): boolean {
  return Boolean(s.trialEndsAt) && new Date(s.trialEndsAt!).getTime() > nowMs(s);
}
export function trialDaysLeft(s: EntitlementState): number {
  if (!s.trialEndsAt) return 0;
  return Math.max(0, Math.ceil((new Date(s.trialEndsAt).getTime() - nowMs(s)) / DAY_MS));
}
export function hasTrialEnded(s: EntitlementState): boolean {
  return Boolean(s.trialEndsAt) && !isTrialActive(s);
}
export function isPaidActive(s: EntitlementState, id: ModuleId): boolean {
  const p = s.paid[id];
  if (!p) return false;
  return !p.expiresAt || new Date(p.expiresAt).getTime() > nowMs(s);
}

/**
 * Is `id` usable right now? Core is always true. Paid modules require a confirmed
 * server entitlement or active trial; an unavailable entitlement service fails closed.
 */
export function isModuleUnlocked(s: EntitlementState, id: ModuleKey, isAdmin = false): boolean {
  if (id === 'core' || isAdmin || s.isServerAdmin) return true;
  if (s.status !== 'ready') return false;
  return isTrialActive(s) || isPaidActive(s, id);
}
/** True while the first server answer is still pending. */
export function isResolving(s: EntitlementState): boolean {
  return s.status === 'idle' || s.status === 'loading';
}

export type ModuleAccess = 'trial' | 'active' | 'locked';
export function moduleAccess(s: EntitlementState, id: ModuleId): ModuleAccess {
  if (isPaidActive(s, id)) return 'active';
  if (isTrialActive(s)) return 'trial';
  return 'locked';
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------
function parse(userId: string, raw: any): EntitlementState {
  const serverNow = raw?.server_now ? new Date(raw.server_now).getTime() : Date.now();
  const paid: EntitlementState['paid'] = {};
  for (const row of Array.isArray(raw?.modules) ? raw.modules : []) {
    if (!isModuleId(row?.module)) continue;
    const expires = row.expires_at ? String(row.expires_at) : null;
    const prev = paid[row.module];
    // Several sources can grant the same module — keep the latest expiry.
    if (!prev || (expires && prev.expiresAt && new Date(expires) > new Date(prev.expiresAt))) {
      paid[row.module] = { expiresAt: expires, source: String(row.source || 'purchase') };
    }
  }
  return {
    status: 'ready',
    userId,
    isTeamMember: Boolean(raw?.is_team_member),
    isServerAdmin: Boolean(raw?.is_admin),
    trialStartedAt: raw?.trial_started_at ? String(raw.trial_started_at) : null,
    trialEndsAt: raw?.trial_ends_at ? String(raw.trial_ends_at) : null,
    paid,
    clockSkewMs: serverNow - Date.now(),
  };
}

function readCache(userId: string): EntitlementState | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}.${userId}`);
    return raw ? ({ ...JSON.parse(raw), status: 'ready' } as EntitlementState) : null;
  } catch { return null; }
}
function writeCache(userId: string, s: EntitlementState) {
  try { localStorage.setItem(`${CACHE_PREFIX}.${userId}`, JSON.stringify(s)); } catch { /* ignore */ }
}

/** Fetch entitlements for the signed-in user. Safe to call often (60s cache). */
export function loadEntitlements(userId: string | null | undefined, opts: { force?: boolean } = {}): Promise<void> {
  if (!userId) { resetEntitlements(); return Promise.resolve(); }
  if (state.userId === userId && state.status === 'ready' && !opts.force && Date.now() - lastFetchAt < CACHE_TTL_MS) {
    return Promise.resolve();
  }
  if (inflight) return inflight;

  if (state.userId !== userId) setState({ ...EMPTY, status: 'loading', userId });
  else if (state.status === 'idle') setState({ ...state, status: 'loading' });

  inflight = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_my_entitlements');
      if (error) throw error;
      const next = parse(userId, data);
      lastFetchAt = Date.now();
      writeCache(userId, next);
      setState(next);
    } catch (err) {
      console.warn('Entitlements unavailable — using last known state.', err);
      const cached = readCache(userId);
      lastFetchAt = Date.now();
      setState(cached ? { ...cached, userId } : { ...EMPTY, status: 'unavailable', userId });
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export function invalidateEntitlements() { lastFetchAt = 0; }

export function resetEntitlements() {
  lastFetchAt = 0;
  inflight = null;
  if (state !== EMPTY) setState(EMPTY);
}

