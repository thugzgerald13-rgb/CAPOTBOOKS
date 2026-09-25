// Access control + audit trail (Run 023 / T023): role-permission matrix + audit log store.

export type Role = 'Owner' | 'Admin' | 'Accountant' | 'Viewer';

export type Permission =
  | 'manage_users' | 'edit_transactions' | 'delete_transactions'
  | 'approve_journal' | 'view_reports' | 'manage_settings' | 'export_data' | 'lock_period';

const MATRIX: Record<Role, Permission[]> = {
  Owner: ['manage_users', 'edit_transactions', 'delete_transactions', 'approve_journal', 'view_reports', 'manage_settings', 'export_data', 'lock_period'],
  Admin: ['manage_users', 'edit_transactions', 'delete_transactions', 'approve_journal', 'view_reports', 'manage_settings', 'export_data', 'lock_period'],
  Accountant: ['edit_transactions', 'approve_journal', 'view_reports', 'export_data'],
  Viewer: ['view_reports', 'export_data'],
};

export function can(role: Role | string | undefined, permission: Permission): boolean {
  if (!role) return false;
  return (MATRIX[role as Role] || []).includes(permission);
}

export const ALL_PERMISSIONS: { key: Permission; label: string }[] = [
  { key: 'manage_users', label: 'Manage Users' },
  { key: 'edit_transactions', label: 'Edit Transactions' },
  { key: 'delete_transactions', label: 'Delete Transactions' },
  { key: 'approve_journal', label: 'Approve Journal Entries' },
  { key: 'view_reports', label: 'View Reports' },
  { key: 'manage_settings', label: 'Manage Settings' },
  { key: 'export_data', label: 'Export Data' },
  { key: 'lock_period', label: 'Lock Accounting Period' },
];

export const ROLES: Role[] = ['Owner', 'Admin', 'Accountant', 'Viewer'];

// ---- Audit log (localStorage-backed, per workspace) ----
export interface AuditLogEntry {
  id: string;
  timestamp: string;
  userEmail: string;
  action: string;
  entity: string;
  details?: string;
  ip?: string;
}

const AUDIT_KEY = 'capot.auditLog';
const MAX_ENTRIES = 500;

export function logAudit(entry: Omit<AuditLogEntry, 'id' | 'timestamp'>) {
  try {
    const log = loadAuditLog();
    log.unshift({ ...entry, id: crypto.randomUUID(), timestamp: new Date().toISOString() });
    localStorage.setItem(AUDIT_KEY, JSON.stringify(log.slice(0, MAX_ENTRIES)));
  } catch { /* ignore quota */ }
}

export function loadAuditLog(): AuditLogEntry[] {
  try { return JSON.parse(localStorage.getItem(AUDIT_KEY) || '[]'); } catch { return []; }
}

export function clearAuditLog() { try { localStorage.removeItem(AUDIT_KEY); } catch { /* ignore */ } }

// ---- Period lock ----
const LOCK_KEY = 'capot.periodLockDate';
export function getPeriodLockDate(): string | null { return localStorage.getItem(LOCK_KEY); }
export function setPeriodLockDate(isoDate: string | null) {
  try { if (isoDate) localStorage.setItem(LOCK_KEY, isoDate); else localStorage.removeItem(LOCK_KEY); } catch { /* ignore */ }
}
export function isPeriodLocked(dateISO: string): boolean {
  const lock = getPeriodLockDate();
  return !!lock && dateISO <= lock;
}
