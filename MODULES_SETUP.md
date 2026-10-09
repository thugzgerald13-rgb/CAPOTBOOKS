# Trial + Modular (ERP-style) Pricing — Setup

Replaces: the 7-transaction cap, the function-selection screen, and the flat
Starter/Pro/Enterprise tiers. This zip contains ONLY new/changed files — merge
it into `CAPOTBOOKS-main`.

## 1. Delete these two files (no longer used)
- `src/components/FunctionSelector.tsx`
- `src/lib/functionRegistry.ts`
(`SETUP_MANUAL_PAYMENT.md` is also outdated — this file supersedes it.)

## 2. Run the SQL (once, after `scripts/payment_requests.sql`)
Supabase → SQL Editor → paste `scripts/modules_entitlements.sql` → Run.
It is idempotent. It adds the trial columns, an `account_modules` table, the
`get_my_entitlements()` RPC, and replaces `approve_payment_request` /
`reject_payment_request` so approvals unlock modules (and can't be approved
twice). Not executed against a live database here — run it on a staging project
or review it first.

## 3. Deploy (`npm run build`)

## What users get
| | |
|---|---|
| **Trial** | 7 days (Business Owner) / 14 days (Accountant/Bookkeeper), every module unlocked. Clock is started and stored server-side on first workspace open after choosing a role. |
| **After trial** | **Core Books stay free, unlimited transactions**: COA, sales, purchases, journal vouchers, journals/ledger, trial balance, history, files. Data is never deleted or hidden. |
| **Paid modules** | Financial Reports ₱249 · Billing & Invoices ₱249 · Tax & Compliance ₱499 · Inventory ₱349 · Team & Controls ₱499 (per month) |
| **Bundles** | Business Essentials ₱799 (reports+billing+compliance) · Retail & Trading ₱1,049 (+inventory) · Accountant Practice ₱1,499 (all five) |
| **Annual** | Pay 10 months, get 12. |
| **Team members** | Inherit the account owner's trial/modules; they never pay. |

All prices live in `src/lib/modules.ts` (one place). Trial lengths are in that
file AND in the SQL `CASE` — change both together.

## Admin workflow
- `#/admin/payments` now shows the modules, term, amount paid vs. catalog price
  (amber warning on mismatch), then **Approve & Unlock Modules**.
- Renewals extend from the later of today or current expiry (no lost days).
- Extend an evaluation trial: `select public.admin_extend_trial('<user uuid>', 7);`

## Existing users (decide before launch)
- **Existing paid users are grandfathered**: starter → Reports+Billing, pro →
  +Compliance+Inventory, enterprise → all five, until their current expiry.
- **Existing free users get a fresh trial** the next time they sign in.

## Known limits — read before going live
1. **Gating is UI-level.** Entitlements are server-held, but locked pages are
   blocked in the app, not by database RLS. Fine for pricing; not a security boundary.
2. **Inventory and Compliance Tracker are still developer-only** (see
   `ADMIN_ONLY_ROUTES` in `pagePermissions.ts` and `ADMIN_ONLY_PAGES` in
   Sidebar). Customers who buy those modules cannot open those pages until you
   release them. Either release them first or hold back those two modules.
3. **Banking/AI and per-client pricing are not included.** Bank import, OCR and
   AI aren't separate routes, so they can't be gated without changing those
   components. Accountant plan is account-level (unlimited clients), not per client.
4. Entitlement fetch fails OPEN (nothing locks) if the SQL isn't applied or the
   network is down with no cached state — so a missed migration can't lock
   paying customers out of their books.
5. Trial abuse by re-registering with a new email is not prevented.

## Test checklist
1. New owner account → choose role → sidebar shows "Trial · 7 days left"; open Reports/BIR Forms (unlocked).
2. `update profiles set trial_ends_at = now() - interval '1 day' where email = '…'` → reload: Reports/BIR/Billing show the lock screen; Sales/Purchases still work, unlimited.
3. Settings → Plan & Billing → pick a bundle → upload receipt → `#/admin/payments` → approve → user refocuses the tab: modules unlock.
4. Invite a team member → they see the owner's unlocks, and billing is read-only for them.
