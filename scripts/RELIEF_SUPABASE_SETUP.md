# CAPOTBOOKS BIR RELIEF — Supabase Setup

## What gets synchronized

The RELIEF page now stores these records in `public.relief_records` for the **currently active CAPOTBOOKS business/client profile**:

- Purchase-month transfers, used only while preparing RELIEF purchase listings and `.DAT` exports.
- RELIEF importation entries per tax month.
- RELIEF-only tax-month settings (non-creditable input tax and the consolidate-without-TIN option).
- Audit records for transfer, settings, importation, and legacy-transfer changes.

The feature does **not** update purchase transactions, supplier records, sales, journals, or ledger rows. Transferred purchase amounts are an adjustment in RELIEF report output only.

## Apply the migration

1. Open the Supabase project used by CAPOTBOOKS.
2. In SQL Editor, confirm the existing core schema and `public.can_access_client_operation(text, text)` helper are already installed. The usual prerequisites are `scripts/schema.sql` and `scripts/client_specific_permissions.sql`.
3. Run `scripts/relief_supabase_migration.sql`.
4. Deploy the web app containing the changed `src/components/Relief.tsx`.
5. Sign in, choose a business/client profile, open **BIR RELIEF**, and confirm the cloud status reports that data was loaded from Supabase.

The migration is repeatable. Do not run it before the `clients` table and permission helper exist.

## Access controls

RLS scopes every row to `client_id`. Reading follows the existing `view_reports` capability; creating/updating/removing RELIEF-only data requires `edit_transactions`. Audit rows can be inserted and read by authorized users but cannot be updated or deleted through the normal app role.

If a user can open RELIEF but is not allowed to edit transactions, that user can view data but their transfer/settings/importation writes will be rejected by RLS. Grant the appropriate existing client permission rather than disabling RLS.

## Existing browser-only transfers

The former `localStorage` key `relief-purchase-transfers` was not tagged with a business ID, so it is not assigned to a profile automatically. When the selected profile has no cloud transfers, RELIEF offers **Import old transfers to this profile**. Verify the active profile in the confirmation before accepting. After a successful import, the old browser key is removed. This imports transfer adjustments only; it does not modify original purchases.

## Validation

- With profile A active, create a purchase-month transfer, leave RELIEF, reopen it, and verify the transfer remains.
- Switch to profile B and verify that profile A's transfers are not shown.
- Change a claim month and confirm the source purchase transaction date/amount stays unchanged.
- Add an importation and verify it survives refresh for that profile and tax month.
- Change RELIEF-only settings, refresh, and verify the settings persist for that profile/month.
- Check `public.relief_records` and the `audit` rows; do not expose service-role keys in frontend environment variables.
