# CAPOTBOOKS — Staff Login Flicker: Root Cause & Fix

## Symptom
After a **managed staff member** signs in (Staff Login + password), the app
"keeps flickering" — the screen rapidly alternates between the dashboard and a
blank/redirecting content area. Owners / standalone accountants do not see it.

## Root Cause (infinite redirect loop)
Two bugs compound, both specific to subusers (managed staff / invited team):

### Bug 1 — Onboarding gate has no subuser bypass (`src/App.tsx`, `AppLayout`)
Once `userRole` is set, the onboarding gate forces every user whose Business
Profile looks incomplete to `/business`:

```ts
if (incomplete) navigateToPage('business');   // -> navigate('/business')
```

But `/business` requires the `manage_settings` permission
(`src/lib/pagePermissions.ts` → `ROUTE_PERMISSIONS`). The `staff` and `viewer`
roles are **never** granted `manage_settings`
(`scripts/client_specific_permissions.sql` → `team_role_allows_permission`:
staff allows only `edit_transactions` + `view_reports`).

So for a staff member:
1. Gate navigates to `#/business`.
2. `RequirePermission` sees `hasPermission('manage_settings') === false`
   → `<Navigate to="/" replace />`.
3. Back at `/`, the gate re-fires (`activePage` changed → effect deps change)
   → navigates to `/business` again.
4. Repeat forever → the URL and rendered content flip `/` ↔ `/business`
   dozens of times per second = visible flickering.

### Bug 2 — Data sync never loads the OWNER's data for staff
(`src/context/AccountingContext.tsx`, the realtime-sync `useEffect`)
The effect's dependency array was `[user?.id]` only. `dataOwnerId` is
`membership.ownerId` for subusers, but `membership` is resolved by
`AuthContext.syncUser()` **after** `userRole` is set (separated by `await`
boundaries, so the state updates flush in separate renders). By the time
`AccountingProvider` mounts, `membership` is still the default
(`{ isSubuser: false }`), so `dataOwnerId === staff user id`. The effect runs
once under the staff's own id: no clients found, and a **default, incomplete**
`business_profile` is created/loaded — which keeps `incomplete === true`
forever, feeding Bug 1's loop. When `membership` later resolves to the owner,
the effect never re-runs, so staff also see an empty workspace.

## Fixes Applied

### 1. `src/App.tsx` — break the redirect loop (primary fix)
- `AppLayout` now also reads `isSubuser` and `hasPermission` from `useAuth`.
- The onboarding gate returns early for subusers and, more generally, for any
  user who cannot open `/business` anyway
  (`!isAdmin && userRole !== 'owner' && !hasPermission('manage_settings')`).
  A user who can't reach `/business` can never be forced into the loop.
- The dashboard `EmptyState` ("Set up Business Profile" CTA) is replaced for
  subusers with a "No client workspaces assigned yet" message and no action
  button (clicking it would just bounce off the permission guard).

### 2. `src/context/AccountingContext.tsx` — load the owner's data for staff
- Added `dataOwnerId` to the sync-effect deps: `[user?.id, dataOwnerId]`.
  When `membership` resolves and `dataOwnerId` flips to the owner id, the
  effect re-runs (cleanup removes the old realtime channels) and loads
  clients + business profile + realtime subscriptions under the owner.
  Staff now actually see the owner's permitted clients.

## Verify
```bash
npm install
npm run build    # should exit 0
npm run dev      # sign in as a managed staff member — no flicker
```

## Secondary note (not the loop, worth a follow-up)
`AuthContext.onAuthStateChange` calls `deferUserSync()` on **every** auth event
with a user, including `TOKEN_REFRESHED`. Each re-sync calls
`setRolePermissions(newObject)` → the client-permission effect re-runs → for
subusers it sets `permissions = {}` before the async `get_my_client_permissions`
resolves. On a short-JWT project this can briefly flash the permission guard on
paid-module pages between refreshes. If you see residual flashing, debounce
`deferUserSync` (skip when `syncingUserId.current === usr.id` already covers
overlap, but not back-to-back completed syncs) or keep the previous permissions
until the new grant resolves.

## Files Changed
- `src/App.tsx`
- `src/context/AccountingContext.tsx`
- `STAFF_LOGIN_FLICKER_FIX.md` (this file)
