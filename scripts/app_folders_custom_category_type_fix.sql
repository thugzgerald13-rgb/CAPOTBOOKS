-- Upload Files custom-folder compatibility fix.
-- The canonical schema defines app_folders.type as unrestricted text, because
-- the UI stores page-scoped types: custom:income, custom:expense, custom:other.
-- Older deployments may still have a legacy CHECK constraint that only allows
-- revenue/expense/other/custom and rejects these newer folder types.
-- Dropping that legacy constraint aligns the live table with scripts/schema.sql.

ALTER TABLE public.app_folders
  DROP CONSTRAINT IF EXISTS app_folders_type_check;
