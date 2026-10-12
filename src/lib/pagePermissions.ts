/**
 * pagePermissions.ts — Route-level access control (Goal A).
 *
 * Single source of truth mapping each client-side route to the capability
 * required to open it. Used by the route guard in App.tsx so a restricted user
 * cannot reach a sensitive screen just by typing its URL (e.g. #/team,
 * #/business, #/developertools/systemconfig).
 *
 * Enforcement model mirrors the Sidebar `canUse` rule:
 *   - Non-subusers (Owner / standalone Accountant / Bookkeeper accounts) are
 *     NOT gated at route level — the server RPC still enforces what they can
 *     *do*, and the Sidebar already shows them all pages.
 *   - Team subusers are gated by their effective server-sourced permissions
 *     (AuthContext.hasPermission, backed by get_my_account_permissions()).
 *   - Developer/admin-only routes have no regular Permission and are blocked
 *     for everyone except the developer account (isAdmin).
 *
 * Routes NOT listed here are open to any authenticated user: Dashboard (/),
 * journals & ledger (/journal, /ledger, /sales-journal, /purchase-journal,
 * /cash-disbursement, /cash-receipt), Account Settings, etc.
 */
import type { Permission } from './accessControl';

/** Exact route path (HashRouter pathname, leading slash) -> required permission. */
export const ROUTE_PERMISSIONS: Record<string, Permission> = {
  // User / team management — Owner/Admin only.
  '/team': 'manage_users',
  // Account configuration — subusers cannot reconfigure the books.
  '/business': 'manage_settings',
  '/clients': 'manage_settings',
  '/coa': 'manage_settings',
  '/tinlibrary': 'manage_settings',
  // Transaction entry — Viewer (read-only) is excluded.
  // NOTE: /inventory is developer-only (see ADMIN_ONLY_ROUTES) until further notice.
  '/files': 'edit_transactions',
  '/sales': 'edit_transactions',
  '/billing': 'edit_transactions',
  '/journal-voucher': 'edit_transactions',
  '/payroll': 'edit_transactions',
  '/payroll/settings': 'manage_settings',
  '/purchases': 'edit_transactions',
  '/purchases/invoiced': 'edit_transactions',
  '/purchases/other-payments': 'edit_transactions',
  '/purchases/ap': 'edit_transactions',
  // Reports / compliance / BIR — any role with view access.
  '/history': 'view_reports',
  '/trialbalance': 'view_reports',
  '/balancesheet': 'view_reports',
  '/pl': 'view_reports',
  '/assetlapsing': 'view_reports',
  '/cashflow': 'view_reports',
  // NOTE: /compliance-tracker is developer-only (see ADMIN_ONLY_ROUTES) until further notice.
  '/bir-forms': 'view_reports',
  // BIR E-Invoicing (EIS) center — build/transmit e-invoices; transaction role.
  '/eis-center': 'edit_transactions',
  '/afs-financial-position': 'view_reports',
  '/afs-income-statements': 'view_reports',
  '/afs-equity-retained-earnings': 'view_reports',
  '/afs-ppe': 'view_reports',
  '/reports': 'view_reports',
  '/taxnotes': 'view_reports',
  '/books': 'view_reports',
};

/** Developer/admin-only routes — no regular Permission covers these.
 *  Compliance Tracker and Inventory are hidden from regular users until the
 *  developer finishes building them out. */
export const ADMIN_ONLY_ROUTES: ReadonlySet<string> = new Set([
  '/developertools/systemconfig',
  '/developertools/diagnostics',
  '/diagnostics',
  '/compliance-tracker',
  '/inventory',
  '/admin/payments',
]);

/** Permission required to open `pathname`, or null if the route is open. */
export function routeRequiresPermission(pathname: string): Permission | null {
  return ROUTE_PERMISSIONS[pathname] ?? null;
}

/** True if `pathname` is restricted to the developer account. */
export function routeIsAdminOnly(pathname: string): boolean {
  return ADMIN_ONLY_ROUTES.has(pathname);
}
