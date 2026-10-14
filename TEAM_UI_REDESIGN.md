# Team & Subusers — UI redesign + staff cap removed

## What changed
**1. Staff are no longer auto-restricted.**
Before, a managed Staff login could only ever receive `edit_transactions` and
`view_reports`; everything else (and the sidebar modules that depend on it) was
blocked even if the owner ticked it. Now staff can be granted any capability
except `manage_users` (inviting/removing people stays owner-only). Nothing is
granted automatically — the owner picks exactly what each person gets, per client.

**2. Friendlier Team page (`TeamSettings.tsx`).**
- Team list is now clean cards: avatar, name, badge, status, role, **Manage access**
  button and a `⋯` menu (Reset password / Disable / Remove). No more row of unlabeled icons.
- **Add member** is a 3–4 step guided dialog (Type → Details → Clients → Access)
  with validation per step, instead of one long form with every option at once.
- **Access templates**: Full access / Data entry / View only — one click, then
  tweak. Functions have plain-language descriptions. Page/button/dropdown
  fine-tuning is tucked into an optional section with search.
- **Manage access** dialog: client list with "Has access / No access" and unsaved
  markers, per-client editing, **Apply to all clients**, Esc to close.
- Fixes: new staff logins previously saved with every sidebar/button permission
  OFF unless the owner opened the detailed editor; templates now seed them correctly.
- Mobile friendly (dialogs become bottom sheets, client list scrolls horizontally).

## Files
- `src/components/TeamSettings.tsx` (rewritten)
- `src/components/GranularPermissionEditor.tsx` (search, clearer labels, collapsed by default)
- `src/lib/granularPermissions.ts` (adds `isModuleAvailableToUsers` + available-only lists)
- `src/lib/teamPermissions.tsx` (staff role ceiling = all except `manage_users`)
- `scripts/staff_remove_role_cap.sql` (**run once** in Supabase SQL Editor — server-side cap)

## Deploy
1. Run `scripts/staff_remove_role_cap.sql` in Supabase → SQL Editor (idempotent).
2. Deploy the frontend.
3. Open Team & Subusers → an existing staff member → **Manage access** and tick what they should have.

## Only available pages are selectable
Permission selections now list only pages regular users can actually open
(same allowlist as the route guard/sidebar). Locked pages (Sales, Billing, Payroll,
reports…) never appear, and aren't saved. When a page is added to
`FEATURE_ALLOWED_PAGE_IDS` it appears automatically.

## Not changed (intentional)
The global feature allowlist in `src/lib/pagePermissions.ts` (`FEATURE_ALLOWED_PAGE_IDS`)
hides most pages for **every** non-developer user, not just staff. It is a
separate product-wide lock; remove entries there if you want those pages
available to anyone.
