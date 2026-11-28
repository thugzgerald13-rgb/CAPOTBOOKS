// Access control + immutable audit trail + server-synced period lock (Run 023 / T023).
// Hardened for BIR CAS (RR No. 9-2009 / RMC No. 5-2021) & PSA 315/500 internal controls:
// - Audit entries persist append-only to Supabase `audit_logs` (with local cache fallback)
// - `clearAuditLog()` is disabled (no-op) to prevent client-side tampering
// - Period locks persist server-side per workspace in `accounting_period_locks`
// - Maker-checker helper prevents self-approval of journal vouchers

import { supabase } from './supabase';

export type Role = 'Owner' | 'Admin' | 'Accountant' | 'Viewer';

export type Permission =
  | 'manage_users' | 'edit_transactions' | 'delete_transactions'
  | 'approve_journal' | 'view_reports' | 'manage_settings' | 'export_data' | 'lock_period';

// Segregation of duties:
// - Admin / Owner retain administrative controls, but posted transactions should
//   use Void + Reversing Entries rather than hard deletes; Accountants prepare
//   entries while approval should use `canApproveEntry()` maker-checker checks.
const MATRIX: Record<Role, Permission[]> = {
  Owner: ['manage_users', 'edit_transactions', 'approve_journal', 'view_reports', 'manage_settings', 'export_data', 'lock_period'],
  Admin: ['manage_users', 'edit_transactions', 'approve_journal', 'view_reports', 'manage_settings', 'export_data', 'lock_period'],
  Accountant: ['edit_transactions', 'view_reports', 'export_data'],
  Viewer: ['view_reports', 'export_data'],
};

export function can(role: Role | string | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (MATRIX[role as Role] || []).includes(permission);
}

/**
 * Maker-checker segregation of duties check:
 * Approver must hold `approve_journal` and must not be the same user who prepared
 * the journal entry (unless single-user Owner override is explicitly enabled).
 */
export function canApproveEntry(
  role: Role | string | undefined,
  preparerEmail: string | undefined,
  approverEmail: string | undefined,
  allowSoleOwnerSelfApproval = false,
): boolean {
  if (!can(role, 'approve_journal')) return false;
  const prep = String(preparerEmail || '').trim().toLowerCase();
  const appr = String(approverEmail || '').trim().toLowerCase();
  if (prep && appr && prep === appr) {
    return allowSoleOwnerSelfApproval && role === 'Owner';
  }
  return true;
}

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: 'manage_users', label: 'Manage Users' },
  { key: 'edit_transactions', label: 'Edit Transactions' },
  { key: 'delete_transactions', label: 'Delete Transactions (Drafts Only)' },
  { key: 'approve_journal', label: 'Approve Journal Entries' },
  { key: 'view_reports', label: 'View Reports' },
  { key: 'manage_settings', label: 'Manage Settings' },
  { key: 'export_data', label: 'Export Data' },
  { key: 'lock_period', label: 'Lock Accounting Period' },
];

export const ROLES: Role[] = ['Owner', 'Admin', 'Accountant', 'Viewer'];

// ---- Immutable Audit Log (Supabase append-only + local read-through cache) ----
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  entity: string;
  entityId?: string;
  clientId?: string;
  beforeData?: Record<string, unknown> | null;
  afterData?: Record<string, unknown> | null;
  details?: string;
  ip?: string;
}

const AUDIT_KEY = 'capot.auditLog';
const MAX_CACHE_ENTRIES = 500;

export function logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
  const record: AuditLogEntry = {
    ...entry,
    id: crypto.randomUUID(),
    timestamp: new Date().toISOString(),
  };

  // 1. Update local read-through cache immediately for synchronous UI views
  try {
    const log = loadAuditLog();
    log.unshift(record);
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log.slice(0, MAX_CACHE_ENTRIES)));
  } catch { /* ignore storage quota */ }

  // 2. Persist append-only to Supabase `audit_logs` (non-blocking)
  void (async () => {
    try {
      const { data: sessionData } = await supabase.auth.getUser();
      const userId = sessionData?.user?.id ?? null;
      await supabase.from('audit_logs').insert({
        id: record.id,
        client_id: record.clientId ?? null,
        user_id: userId,
        user_email: record.userEmail,
        action: record.action,
        entity: record.entity,
        entity_id: record.entityId ?? null,
        before_data: record.beforeData ?? null,
        after_data: record.afterData ?? null,
        details: record.details ?? null,
        created_at: record.timestamp,
      });
    } catch {
      // Table may not yet be migrated in dev; local cache retains the entry.
    }
  })();
}

export function loadAuditLog(): AuditLogEntry[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}

/** Fetch authoritative server-side audit log entries from Supabase and refresh local cache. */
export async function fetchAuditLog(clientId?: string, limit = 200): Promise<AuditLogEntry[]> {
  try {
    let query = supabase
      .from('audit_logs')
      .select('id, created_at, user_email, action, entity, entity_id, client_id, before_data, after_data, details')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (clientId) query = query.eq('client_id', clientId);
    const { data, error } = await query;
    if (error || !Array.isArray(data)) return loadAuditLog();
    const mapped: AuditLogEntry[] = data.map((row: any) => ({
      id: String(row.id),
      timestamp: String(row.created_at),
      userEmail: String(row.user_email || 'unknown'),
      action: String(row.action || ''),
      entity: String(row.entity || ''),
      entityId: row.entity_id ?? undefined,
      clientId: row.client_id ?? undefined,
      beforeData: row.before_data ?? undefined,
      afterData: row.after_data ?? undefined,
      details: row.details ?? undefined,
    }));
    try {
      localStorage.setItem(AUDIT_KEY, JSON.stringify(mapped.slice(0, MAX_CACHE_ENTRIES)));
    } catch { /* ignore */ }
    return mapped;
  } catch {
    return loadAuditLog();
  }
}

/**
 * Disabled for BIR CAS & PSA audit-trail compliance:
 * Audit logs are immutable and cannot be cleared by end users.
 */
export function clearAuditLog() {
  console.warn('[CAPOTBOOKS Audit] clearAuditLog() is disabled: audit logs are immutable under BIR CAS / PSA standards.');
}

// ---- Accounting Period Lock (Supabase-backed per client + local cache) ----
const LOCK_KEY = 'capot.periodLockDate';
const lockStorageKey = (clientId?: string) => (clientId ? `${LOCK_KEY}.${clientId}` : LOCK_KEY);

export function getPeriodLockDate(clientId?: string): string | null {
  try {
    return localStorage.getItem(lockStorageKey(clientId)) || (clientId ? localStorage.getItem(LOCK_KEY) : null);
  } catch {
    return null;
  }
}

export async function syncPeriodLockFromServer(clientId: string): Promise<string | null> {
  if (!clientId) return getPeriodLockDate();
  try {
    const { data, error } = await supabase
      .from('accounting_period_locks')
      .select('lock_date')
      .eq('client_id', clientId)
      .maybeSingle();
    if (error) return getPeriodLockDate(clientId);
    const lockDate = data?.lock_date ? String(data.lock_date).slice(0, 10) : null;
    try {
      if (lockDate) localStorage.setItem(lockStorageKey(clientId), lockDate);
      else localStorage.removeItem(lockStorageKey(clientId));
    } catch { /* ignore */ }
    return lockDate;
  } catch {
    return getPeriodLockDate(clientId);
  }
}

export function setPeriodLockDate(isoDate: string | null, clientId?: string, actorEmail = 'system') {
  const normalized = isoDate ? String(isoDate).slice(0, 10) : null;
  const previous = getPeriodLockDate(clientId);

  try {
    if (normalized) localStorage.setItem(lockStorageKey(clientId), normalized);
    else localStorage.removeItem(lockStorageKey(clientId));
  } catch { /* ignore */ }

  logAudit({
    userEmail: actorEmail,
    action: normalized ? 'period_lock_set' : 'period_lock_cleared',
    entity: 'accounting_period_locks',
    clientId,
    beforeData: { lock_date: previous },
    afterData: { lock_date: normalized },
    details: normalized ? `Locked accounting period through ${normalized}` : 'Cleared accounting period lock',
  });

  if (clientId) {
    void (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getUser();
        const userId = sessionData?.user?.id ?? null;
        if (normalized) {
          await supabase.from('accounting_period_locks').upsert({
            client_id: clientId,
            lock_date: normalized,
            locked_by: userId,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'client_id' });
        } else {
          await supabase.from('accounting_period_locks').delete().eq('client_id', clientId);
        }
      } catch { /* table may not be migrated yet */ }
    })();
  }
}

export function isPeriodLocked(dateISO: string, clientId?: string): boolean {
  const lock = getPeriodLockDate(clientId);
  const d = String(dateISO || '').slice(0, 10);
  return Boolean(lock && d && d <= lock);
}

/** Guard helper to block posting/editing/deleting transactions in a closed accounting period. */
export function assertPeriodUnlocked(dateISO: string, clientId?: string): void {
  if (isPeriodLocked(dateISO, clientId)) {
    const lock = getPeriodLockDate(clientId);
    throw new Error(`Accounting period is locked through ${lock}. Post a reversing or adjusting entry in an open period instead.`);
  }
}
