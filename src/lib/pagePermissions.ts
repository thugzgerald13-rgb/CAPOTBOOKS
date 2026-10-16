/**
 * pagePermissions.ts — Route-level access control (Goal A).
 *
 * Single source of truth mapping each client-side route to the capability
 * required to open it. Used by the route guard in App.tsx (RequirePermission)
 * AND by the command palette so a restricted user cannot reach a sensitive
 * screen just by typing its URL (e.g. #/sales-journal, #/cash-receipt) or
 * picking it from the palette.
 *
 * Enforcement model mirrors the Sidebar `canUse` rule:
 *   - Non-subusers (Owner / standalone Accountant / Bookkeeper accounts) are
 *     NOT gated at route level — the server RPC still enforces what they can
 *     *do*, and the Sidebar already shows them all pages.
 *   - Team subusers (isSubuser = true) are gated by their effective
 *     server-sourced permissions (AuthContext.hasPermission, backed by
 *     get_my_account_permissions()).
 *   - Developer/admin-only routes have no regular Permission and are blocked
 *     for everyone except the developer account (isAdmin).
 *
 * FAIL-CLOSED: every route must be explicitly classified. Any route that is
 * neither OPEN_ROUTES nor listed in ROUTE_PERMISSIONS nor admin-only defaults
 * to requiring `manage_users` — which no subuser holds — so an unmapped route
 * is never silently reachable by an invited user. Add new routes here.
 */
import type { Permission } from './accessControl';

/** Routes that are genuinely open to any authenticated user (self-service). */
const OPEN_ROUTES: ReadonlySet<string> = new Set([
  '/',                 // dashboard
  '/account-settings', // user changes their own password / display name
  '/plan-billing',     // plan & subscription — own page; purchases gated inside
  '/functions',        // legacy alias → redirects to /account-settings
]);

/** Exact route path (HashRouter pathname, leading slash) -> required permission. */
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  // ---- User / team management — Owner/Admin only ----
  '/team': 'manage_users',

  // ---- Account configuration — subusers cannot reconfigure the books ----
  '/business': 'manage_settings',
  '/clients': 'manage_settings',
  '/coa': 'manage_settings',
  '/tinlibrary': 'manage_settings',
  '/payroll/settings': 'manage_settings',

  // ---- Transaction-entry workspaces (Viewer excluded) ----
  '/sales': 'edit_transactions',
  '/billing': 'edit_transactions',
  '/journal-voucher': 'edit_transactions',
  '/files': 'edit_transactions',
  '/payroll': 'edit_transactions',
  '/eis-center': 'edit_transactions',
  '/purchases': 'edit_transactions',
  '/purchases/invoiced': 'edit_transactions',
  '/purchases/other-payments': 'edit_transactions',
  '/purchases/ap': 'edit_transactions',
  '/ap-workspace': 'edit_transactions', // alias → /purchases/ap
  // Special journals are transaction-entry workspaces, not view-only registers.
  '/cash-receipt': 'edit_transactions',
  '/cash-disbursement': 'edit_transactions',
  '/sales-journal': 'edit_transactions',
  '/purchase-journal': 'edit_transactions',

  // ---- View-only registers / reports / compliance (any role with view access) ----
  '/journal': 'view_reports',        // General Journal — posted entries, read-only view
  '/ledger': 'view_reports',         // General Ledger — read-only register
  '/history': 'view_reports',
  '/trialbalance': 'view_reports',
  '/balancesheet': 'view_reports',
  '/pl': 'view_reports',
  '/assetlapsing': 'view_reports',
  '/cashflow': 'view_reports',
  '/bir-forms': 'view_reports',
  '/relief': 'view_reports',
  '/reports': 'view_reports',
  '/taxnotes': 'view_reports',
  '/books': 'view_reports',
  '/afs-financial-position': 'view_reports',
  '/afs-income-statements': 'view_reports',
  '/afs-equity-retained-earnings': 'view_reports',
  '/afs-ppe': 'view_reports',
};

/** Developer/admin-only routes — no regular Permission covers these. */
export const ADMIN_ONLY_ROUTES: ReadonlySet<string> = new Set([
  '/developertools/systemconfig',
  '/developertools/diagnostics',
  '/diagnostics',
  '/compliance-tracker',
  '/inventory',
  '/admin/payments',
]);

/**
 * Permission required to open `pathname`.
 *  - open self-service routes → null (no permission needed)
 *  - mapped routes → their required permission
 *  - anything else (fail-closed) → 'manage_users', which no subuser holds,
 *    so an unmapped route bounces an invited user back to the dashboard.
 */
export function routeRequiresPermission(pathname: string): Permission | null {
  if (OPEN_ROUTES.has(pathname)) return null;
  if (pathname in ROUTE_PERMISSIONS) return ROUTE_PERMISSIONS[pathname];
  if (ADMIN_ONLY_ROUTES.has(pathname)) return null; // handled by routeIsAdminOnly
  return 'manage_users';
}

/** True if `pathname` is restricted to the developer account. */
export function routeIsAdminOnly(pathname: string): boolean {
  return ADMIN_ONLY_ROUTES.has(pathname);
}


// ---------------------------------------------------------------------------
// Hard feature allowlist (global lock).
//
// Every authenticated user EXCEPT the developer account (isAdmin) may open
// ONLY the pages listed below. All other routes — even if typed directly in
// the URL bar or reached via a dashboard widget — are bounced back to the
// dashboard by the RequirePermission guard in App.tsx. The Sidebar submenus,
// inline search and command palette are filtered by the same allowlist so
// locked functions are hidden as well.
//
// Allowed: Dashboard (/), Chart of Accounts, Purchases (all sub-workspaces),
// Journal Voucher, Expense/Income History, Upload Files, General Journal,
// General Ledger, Business Profiles, TIN Library, Account Settings,
// Team & Subusers, Trial Balance.
// ---------------------------------------------------------------------------

const FEATURE_ALLOWED_PAGE_IDS: ReadonlySet<string> = new Set([
  'coa',
  'purchases',
  'journal-voucher',
  'history',
  'files',
  'journal',
  'ledger',
  'business',
  'tinlibrary',
  'account-settings',
  'plan-billing',
  'team',
  'trialbalance',
]);

/**
 * True if `pageIdOrPath` (a sidebar pageId like 'coa' or a route path like
 * '/purchases/invoiced') is inside the feature allowlist. The dashboard
 * (null / '' / '/') is always allowed so the user is never bounced into a
 * redirect loop.
 */
export function featureAllows(pageIdOrPath: string | null): boolean {
  if (pageIdOrPath == null) return true;
  const norm = String(pageIdOrPath).trim().replace(/^\/+/, '').split(/[?#]/)[0];
  if (norm === '') return true; // dashboard
  if (norm === 'purchases' || norm.startsWith('purchases/')) return true;
  return FEATURE_ALLOWED_PAGE_IDS.has(norm);
}

/** True if `pathname` is outside the feature allowlist (blocked for non-devs). */
export function routeIsFeatureLocked(pathname: string): boolean {
  return !featureAllows(pathname);
}
