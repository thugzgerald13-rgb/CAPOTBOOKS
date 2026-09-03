# CAPOT Normalized Migration Runbook

## 1. Staging

1. Apply the authoritative `schema.sql` to a staging Supabase project.
2. Confirm all normalized tables, foreign keys, indexes, RLS policies, and the
   `public.is_client_owner(client_id)` function exist.
3. Confirm the private `client-files` Storage bucket and its policies.

## 2. Backup

Before production migration, make a complete backup of the legacy `clients`
data, including the `data` JSON document.

## 3. Data migration

Migrate each legacy client's `data` document into the normalized child tables.
Do not store attachment base64/data URLs in PostgreSQL.

For attachments:

- decode the data URL/base64;
- upload the resulting file to `client-files`;
- use `<client_id>/<file_id>/<filename>` as the Storage path;
- store only the path in `attachment_storage_path` or `storage_path`.

For journals:

- `crjEntries` -> `CRJ`
- `cdjEntries` -> `CDJ`
- `pjEntries` -> `PJ`
- `gjEntries` -> `GJ`

Store `plData`, `bsData`, and `cfData` as regenerated
`financial_report_snapshots.data`.

## 4. Verification

Run `scripts/verify-normalized.sql` and compare:

- row counts by client;
- AP line counts;
- journal entry counts;
- inventory totals;
- purchase/sales/expense totals;
- financial report totals;
- attachment counts and Storage paths;
- orphan rows and RLS behavior.

## 5. Application cutover

Deploy the normalized application build only after staging verification and
production migration validation.

During the rollback window, keep the legacy backup available but do not allow
the application to write both persistence models indefinitely.

## 6. Cleanup

After successful verification and the rollback window, remove the legacy
`clients.data` representation according to the approved production migration.
