# CAPOT normalized Supabase migration plan

## Target

Move CAPOT from the legacy `clients.data` document model to the normalized schema in `schema.sql`.

The new model keeps `clients` as the tenancy root and stores each business entity in its own table. Every child row carries `client_id` and is protected by the shared `public.is_client_owner(client_id)` RLS function.

## Important ordering

1. Apply `schema.sql` to a staging Supabase project first.
2. Back up the existing `clients` table before changing production.
3. Run the data migration from `clients.data` into the child tables.
4. Verify row counts and totals per client.
5. Deploy the application build that reads/writes the normalized tables.
6. Keep the legacy JSON document for a short rollback window if desired; do not let the new application write both models indefinitely.
7. After verification, remove the legacy `clients.data` column/table representation.

## Attachment migration

Legacy purchase attachments and `AppFile.content` are base64/data URLs. They should not be copied into PostgreSQL.

For each attachment:

- Decode the data URL/base64 into a Blob/file.
- Upload it to the private `client-files` Supabase Storage bucket.
- Use a path such as `<client_id>/<file_id>/<filename>`.
- Store only the path in `purchases.attachment_storage_path` or `app_files.storage_path`.
- Delete the base64 field from the migrated JSON.

## Journal migration

For each legacy journal type (`crjEntries`, `cdjEntries`, `pjEntries`, `gjEntries`):

- Insert one row per entry into `journal_entries`.
- Set `journal_type` to `CRJ`, `CDJ`, `PJ`, or `GJ`.
- Copy the entry's `values` object directly to `values jsonb`.
- Preserve `auto` and `autoSource`.
- Migrate the corresponding runtime column definitions into `journal_columns`.

## Financial statements

`plData`, `bsData`, and `cfData` are copied into `financial_report_snapshots.data` as regenerated snapshots. They are not decomposed into line tables because the UI regenerates the report as a whole.

## Application changes still required

The current CAPOT source still loads and saves `clients.data` in `AccountingContext.tsx`. `schema.sql` alone does not switch the running application to normalized persistence.

The application layer must next be changed to:

- load a client shell from `clients`;
- query child tables by `client_id`;
- hydrate the existing TypeScript `Client` shape for components that still expect it;
- replace `saveClient()` with targeted table writes/upserts/deletes;
- upload attachments to Storage and persist `storage_path`;
- subscribe to normalized tables for realtime updates;
- avoid replacing an entire client's dataset when one transaction changes.

That second phase is deliberately separate from the SQL migration so the database can be validated before changing application persistence behavior.
