# CAPOTBOOKS Payroll — Supabase Setup

The web app now uses CAPOTBOOKS' existing Supabase client, authenticated session, and active `currentClientId` to load and save payroll data. Each business' employees, attendance rows, payroll periods, settings, and audit events are stored in `public.payroll_records`, protected by Row Level Security (RLS).

## 1. Confirm the existing CAPOTBOOKS schema

The Supabase project must already contain:

- `public.clients` with the business/client IDs CAPOTBOOKS uses.
- `public.set_updated_at()` from `scripts/schema.sql`.
- `public.can_access_client_operation(text, text)` from `scripts/client_specific_permissions.sql`.

Do not re-run the entire base schema against production just for payroll. Check that these dependencies are present first.

## 2. Apply the payroll migration

Open the correct CAPOTBOOKS project in Supabase Dashboard → SQL Editor. Run the contents of:

`scripts/payroll_supabase_migration.sql`

This creates `public.payroll_records`, adds the tenant/type index and update trigger, and enables RLS. Payroll read/write access uses the existing `manage_settings` capability; the account owner is allowed by the existing access helper. With the current team-role matrix, payroll should be treated as owner-only until a dedicated payroll permission is added and tested.

## 3. Check the web app environment

In the environment used to build/deploy CAPOTBOOKS, configure:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
```

Use the project's public anon/publishable key only. Never put a Supabase `service_role` key in browser code or a `VITE_` variable. Rebuild/redeploy the web app after changing Vite environment values.

## 4. Validate the integration

1. Sign in to CAPOTBOOKS and select the intended business/client.
2. Open Payroll. The header should show `SUPABASE SYNCED` after the load/save succeeds.
3. Add a test employee and confirm that a corresponding `employee` row exists in `payroll_records` for the selected `client_id`.
4. Open the app in a second signed-in browser session with authorized access to that same business and verify the employee appears.
5. Try an account without access to that business; RLS should prevent reading or writing its payroll records.
6. Test attendance CSV import, a draft payroll run, settings changes, and a payslip/export before entering live data.

## Existing browser-local data

New local cache keys are scoped to the selected CAPOTBOOKS client. Old company-name-based browser records are not copied to a tenant automatically because the previous key does not reliably identify which client should own the records. If the selected business has no employees, attendance, or payroll runs in Supabase, the app offers **Migrate Local Data** after load. Confirm the displayed business carefully before using it. Payroll records already in Supabase block this migration button.

The JSON Backup/Import controls remain available. Keep an independent backup until multi-device sync, RLS, and exports have been tested successfully.

## Notes

- This code package prepares the app and migration; it does not apply SQL to the remote Supabase project automatically.
- Supabase sync requires the SQL migration and correct Vite environment values. If either is missing or RLS rejects access, the header shows `CLOUD SYNC ERROR`; use **Retry Sync** after fixing the cause.
- Payroll calculations and statutory settings still require review against current Philippine rules before live payroll.
