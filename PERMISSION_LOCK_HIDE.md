# CAPOTBOOKS — Lock & Hide Functions for Team Members Without Permission

## What was already enforced (URL level)
`RequirePermission` in `src/App.tsx` wraps the entire `<Routes>` block. Any
direct-typed URL is checked against `routeRequiresPermission()` (fail-closed —
unmapped routes require `manage_users`, which no team member holds) and against
`routeIsAdminOnly()` / the feature allowlist / module locks. Denied access is
bounced to `/` with `<Navigate replace />`. **Direct URL access was already
blocked.**

## What was missing (UI hiding) — fixed here
Team members could still *see* functions they couldn't use (grayed-out /
disabled, or fully visible), which is what "hide" closes.

### 1. `src/components/Sidebar.tsx`
- **`pagePermission()` was misaligned** with `src/lib/pagePermissions.ts`
  `ROUTE_PERMISSIONS`: it returned `null` (always visible) for
  journal/ledger/cash-journals, and `edit_transactions` for P&L / Balance
  Sheet / Cash Flow / History. Rewrote it to match `ROUTE_PERMISSIONS` exactly,
  so `canUse()`/`canAny()` now hide the right pages everywhere they're used
  (top-level buttons, inline search filter, `handleNavClick` guard).
- **Dropdown toggles that were only `disabled` are now `hidden`** when the
  member has none of the required capabilities:
  - Transactions → needs `edit_transactions` | `view_reports` | `manage_settings`
  - Reports → needs `view_reports`
  - Books → needs `view_reports` | `edit_transactions`
  - Compliance (BIR forms) → needs `view_reports`
  (Top-level buttons COA/Billing/Sales/Purchases/Journal Voucher/Payroll and
  the Developer Tools dropdown were already hidden; search results and the
  command palette were already filtered.)

### 2. `src/components/Header.tsx`
- The **+ New / Quick-add menu** (Invoice, Bill, Sale, Journal Voucher, Upload)
  is hidden entirely for members without `edit_transactions`.

### 3. `src/components/Dashboard.tsx`
- The **Quick actions** section (New invoice / bill / receipt / journal entry)
  is hidden for members without `edit_transactions`.

## Verify
```bash
npm run build    # exits 0
```
Sign in as a managed staff member with only `view_reports`: the sidebar shows
only Reports/Books (view-only) entries, no + New button, no transaction quick
actions, and typing `#/sales` bounces back to the dashboard.

## Files Changed
- `src/components/Sidebar.tsx`
- `src/components/Header.tsx`
- `src/components/Dashboard.tsx`
- `PERMISSION_LOCK_HIDE.md` (this file)
