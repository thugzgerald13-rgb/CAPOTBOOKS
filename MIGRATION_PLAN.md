# Migration Plan: `clients.data` JSONB → Normalized Tables

Goal: move off the single JSON blob without a downtime cutover and without
risking data loss if something goes wrong partway through. Five phases,
each shippable and reversible on its own.

## Phase 0 — Prerequisites

- Run `schema.sql` against a fresh Supabase branch/staging project first,
  not directly against production.
- Create the `attachments` Storage bucket (private, RLS-gated) before any
  attachment backfill runs.
- Snapshot production (`pg_dump` or Supabase's built-in backup) immediately
  before Phase 1, and again before Phase 4.

## Phase 1 — Add the new tables, change nothing else

Run `schema.sql` against production. This is purely additive: new empty
tables alongside the existing `clients.data` column. The current app keeps
working exactly as it does today — nothing reads from or writes to the new
tables yet.

**Risk:** none. Rollback is `DROP TABLE` on anything just added.

## Phase 2 — Backfill: JSON → rows

A one-time script (run server-side, e.g. as a Supabase Edge Function or a
local script with the service-role key) that:

1. Reads every row from `clients` (`id`, `user_id`, `data`).
2. For each client, inserts one row into `clients` (new columns) — carrying
   over the promoted profile fields — and one row per array item into the
   matching new table (`purchases`, `sales`, `coa_accounts`, etc.), setting
   `client_id` to the original client's id.
3. For any `Purchase.attachment` / `AppFile.content` that has base64
   `content`, decodes it and uploads the bytes to the `attachments` Storage
   bucket, then writes a `purchase_attachments` / `app_files` row with the
   resulting `storage_path` instead of the base64 string.
4. Logs a per-client summary (row counts written vs. array lengths in the
   source JSON) so mismatches are caught immediately, not discovered later.

Run this against staging first, spot-check a handful of clients row-by-row
against the UI, then run against production. Because Phase 1's tables are
inert until Phase 3, the backfill can be re-run safely (truncate the new
tables and redo it) if a bug is found — the JSON blob is still the live
source of truth throughout.

**Risk:** low. The blob is untouched; this only ever reads from it.

## Phase 3 — Dual-write

Update `saveClient()` (and equivalents) to write to **both** places on
every save:

- The existing full-blob upsert to `clients.data` (unchanged, so the old
  code path — and anything not yet migrated to the new repos — keeps
  working).
- The corresponding row(s) in the new normalized tables, via the
  repositories in `dataAccessLayer.ts`.

Reads still come from the JSON blob during this phase (no UI changes yet).
This phase exists purely to prove the new write paths are correct against
real, live traffic before anything depends on them for reads. Run it for
at least one full billing/reporting cycle so period-boundary logic
(`datMonthYear` filtering, sequence numbers, etc.) gets exercised.

Add a periodic consistency check (e.g. a nightly job) comparing row counts
and checksums between the JSON blob's arrays and the normalized tables per
client, alerting on drift.

**Risk:** low — reads are unaffected; a bug in the new write path doesn't
corrupt anything the app currently depends on, it just produces a
normalized-table row that doesn't match the blob, which the consistency
check will catch.

## Phase 4 — Cut reads over, table by table

Migrate one page/feature at a time to read from the new repos instead of
`currentClient.purchases` / `.sales` / etc., starting with the
lowest-risk, most isolated page (e.g. Asset Lapsing or Tax Deadlines,
which few other features read), ending with the highest-traffic ones
(Purchases, Sales, General Ledger).

Per table being cut over:
1. Swap the page's data source to the corresponding repo (`usePurchases`-
   style hook from `dataAccessLayer.ts`).
2. Swap its save/delete calls to the repo's `create` / `update` / `remove`.
3. Leave the dual-write from Phase 3 running for that table for a short
   overlap window (a few days) as a safety net, then remove the blob-write
   for that specific array once confident.
4. Ship, watch error rates and the consistency check, move to the next
   table.

This is the only phase where user-facing behavior changes, and it's spread
across many small, independently revertible deploys instead of one big
cutover.

**Risk:** medium, but contained to one table/feature at a time. Rollback
for any single step is reverting that one deploy — the blob is still
being dual-written underneath until the corresponding write-path is
removed in step 3, so no data is lost even if a read-side bug ships.

## Phase 5 — Retire the blob

Once every array has been cut over (Phase 4 complete for all tables):

1. Stop writing to `clients.data` entirely.
2. Keep the column (renamed `data_legacy` or similar) populated by the
   last dual-write for a defined retention window (e.g. 30–90 days) as a
   cold rollback path, not read by the app.
3. After the retention window, drop the column.

**Risk:** low by this point — it's cleanup, not a functional change, and
the legacy column is the safety net until it's dropped.

## Rollback summary

| Phase | Rollback if something's wrong |
|---|---|
| 1 | `DROP TABLE` on anything added; blob still authoritative |
| 2 | Truncate new tables, re-run backfill; blob untouched |
| 3 | Remove the new-table write call; blob-write already unaffected |
| 4 (per table) | Revert that table's deploy; blob dual-write still running underneath |
| 5 | Restore `data_legacy` reads if still within retention window |

## What doesn't need migrating

- `financial_reports` (P&L/BS/CF) — these are regenerated wholesale from
  other data, not edited field-by-field, so they can move straight from
  being nested in the blob to being their own JSONB-snapshot rows in one
  step, with no backfill precision required (they'll simply regenerate
  correctly once triggered post-migration).
