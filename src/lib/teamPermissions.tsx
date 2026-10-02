/**
 * teamPermissions.ts — MemberRole → Permission bridge + UI guards.
 *
 * Two role systems exist in this codebase and this module unifies them:
 *   1. subusers.ts MemberRole: 'accountant' | 'bookkeeper' | 'staff' | 'viewer'
 *      — what an OWNER assigns when inviting a subuser.
 *   2. accessControl.ts Permission: manage_users, edit_transactions, ...
 *      — the granular capabilities checked by hasPermission() in AuthContext
 *        (sourced server-side from the current client's permission RPC).
 *
 * This matrix defines which capabilities each MemberRole grants. It MUST stay
 * in sync with the server-side get_my_account_permissions RPC (in
 * scripts/subusers_migration.sql) — the server is the source of truth; this
 * client-side matrix is for UI gating + display only. A subuser can never do
 * more than the server RPC allows, even if this matrix is wrong.
 */
import type { ReactNode } from 'react';
import { useAuth } from '../context/AuthContext';
import { ALL_PERMISSIONS, type Permission } from './accessControl';
import type { MemberRole } from '../types';

export const MEMBER_ROLE_PERMISSIONS: Record<MemberRole, Permission[]> = {
  // Full access to books, reports and compliance. Cannot manage users/billing.
  accountant: [
    'edit_transactions',
    'delete_transactions',
    'approve_journal',
    'view_reports',
    'export_data',
    'lock_period',
  ],
  // Data entry across sales, purchases and journals. Cannot delete or approve.
  bookkeeper: [
    'edit_transactions',
    'view_reports',
    'export_data',
  ],
  // Limited day-to-day transaction entry. Read-mostly.
  staff: [
    'edit_transactions',
    'view_reports',
  ],
  // Read-only access to reports and records.
  viewer: [
    'view_reports',
    'export_data',
  ],
};

/** Owner / account holder — full control. Not a subuser role but used for display. */
export const OWNER_PERMISSIONS: Permission[] = ALL_PERMISSIONS.map((p) => p.key);

export function canMember(role: MemberRole | string | undefined | null, permission: Permission): boolean {
  if (!role) return false;
  return (MEMBER_ROLE_PERMISSIONS[role as MemberRole] || []).includes(permission);
}

/** Permission metadata for display, keyed for the matrix table. */
export const PERMISSION_LABELS: Record<Permission, string> = Object.fromEntries(
  ALL_PERMISSIONS.map((p) => [p.key, p.label])
) as Record<Permission, string>;

export const MEMBER_ROLE_LABELS: Record<MemberRole, string> = {
  accountant: 'Accountant',
  bookkeeper: 'Bookkeeper',
  staff: 'Staff',
  viewer: 'Viewer',
};

export const MEMBER_ROLE_DESCRIPTIONS: Record<MemberRole, string> = {
  accountant: 'Full access to books, reports and compliance.',
  bookkeeper: 'Data entry across sales, purchases and journals.',
  staff: 'Limited day-to-day transaction entry.',
  viewer: 'Read-only access to reports and records.',
};

/** All roles in display order (owner first for the matrix header). */
export const MATRIX_ROLES: Array<'owner' | MemberRole> = ['owner', 'accountant', 'bookkeeper', 'staff', 'viewer'];

export function roleHasPermission(role: 'owner' | MemberRole, permission: Permission): boolean {
  if (role === 'owner') return true;
  return canMember(role, permission);
}

// ---------------------------------------------------------------------------
// React guards — wrap UI so a subuser only sees/acts on what their role allows.
// The server RPC is the real enforcement; these only hide disabled UI.
// ---------------------------------------------------------------------------

/** Hook: current signed-in user's capability check (from AuthContext). */
export function usePermission(permission: Permission): boolean {
  // AuthContext distinguishes a true Business Owner from a standalone
  // Accountant/Bookkeeper account and from a client-scoped team subuser.
  // Always use the effective server-sourced permission result here so the UI
  // cannot silently grant owner-level capabilities to professional accounts.
  const { hasPermission } = useAuth();
  return hasPermission(permission);
}

/** Render children only if the current user has the permission. */
export function Can({ permission, fallback = null, children }: {
  permission: Permission;
  fallback?: ReactNode;
  children: ReactNode;
}) {
  const allowed = usePermission(permission);
  return <>{allowed ? children : fallback}</>;
}

/** Disable a button/input when the current user lacks the permission. */
export function useDisabledWithout(permission: Permission): boolean {
  return !usePermission(permission);
}
