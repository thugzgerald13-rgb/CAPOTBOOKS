# Manual GCash Payment Flow — Setup Guide

This package contains **only the changed / new files**. Drop them into your
existing `CAPOTBOOKS-main` project (merge folders), then follow the steps below.

## Files in this package

| File | Change |
|---|---|
| `src/lib/subscription.ts` | Rewritten — plan/status now read from Supabase `profiles` (authoritative), 60s in-memory cache, localStorage kept only as offline fallback + free-tier counter. |
| `src/components/PaymentInstructions.tsx` | **New** — QR-only payment modal (GCash QR + amount + receipt upload). No numbers/account details shown. |
| `src/components/AccountSettings.tsx` | Updated — Subscribe buttons open the QR modal; shows "Payment pending" banner; plan loaded from Supabase. |
| `src/components/PaymentApproval.tsx` | **New** — admin dashboard to view receipts, Approve (activates plan 30 days) / Reject. |
| `src/context/AccountingContext.tsx` | Cap check now `await`s the Supabase-backed `checkTransactionLimit()` (2 call sites). |
| `src/App.tsx` | Registers admin route `#/admin/payments`. |
| `src/lib/pagePermissions.ts` | `#/admin/payments` added to admin-only routes. |
| `public/images/gcash-qr.png` | **New** — your GCash QR (cropped to the code only; no numbers/name). |
| `scripts/payment_requests.sql` | **New** — schema + RLS + approve/reject RPCs. |

## Steps

1. **Merge the files** into your project (overwrite the existing ones; add the new ones).

2. **Run the SQL** — open Supabase → SQL Editor, paste `scripts/payment_requests.sql`, run.
   At the bottom, uncomment the `update profiles set role='admin' …` line, put your email, and run it. (The admin page is also gated by your developer email in-app, but `role='admin'` is what unlocks the database-side approve/reject.)

3. **Create the storage bucket** — Supabase → Storage → New bucket:
   - Name: `receipts`
   - **Public bucket: ON** (so receipts display in the admin dashboard; if you prefer private, switch the admin page to `createSignedUrl`)
   - Run the two storage policies at the bottom of the SQL file.

4. **QR image** — already included at `public/images/gcash-qr.png` (extracted from your `myQR.pdf`, cropped to the QR only). Replace it anytime with a newer export using the same path.

5. **Deploy** (`npm run build` / push to Vercel).

## How it works for users

1. Settings → Plan & Billing → **Subscribe** on Starter (₱499) / Pro (₱1,499) / Enterprise (₱3,999).
2. Modal shows **only the GCash QR + amount**. User scans, pays, uploads the receipt screenshot.
3. A `payment_requests` row is created (status `pending`); user sees a "Payment pending verification" banner.

## How it works for you (admin)

1. Open `#/admin/payments` (logged in as the developer/admin account).
2. See each request: user email, plan, amount, receipt thumbnail (click to enlarge).
3. Verify the payment in your GCash app → **Approve & Activate Plan** (plan activates for 30 days instantly) or **Reject** with an optional note.
4. The user's `profiles.subscription_plan/status` are updated server-side — they cannot be tampered with via localStorage.

## Notes / design decisions

- The **free-tier transaction counter** (7 free transactions) stays in localStorage by design. It only meters the free tier; it cannot upgrade a plan. Counting it server-side would require a per-user transaction table and would lock out users with imported historical data.
- Subscription validity: `subscription_expires_at` is set to approval + 30 days. Expired plans fall back to free automatically.
- Enterprise plan price set to ₱3,999 (matches your spec); change `PLAN_AMOUNTS` in `PaymentInstructions.tsx` and the card price in `AccountSettings.tsx` if you want "Custom / Contact Sales" instead.
