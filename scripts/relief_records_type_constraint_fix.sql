-- Repair the RELIEF record_type check constraint in existing deployments.
-- Apply in the Supabase SQL Editor if saving a purchase-month transfer fails
-- with SQLSTATE 23514 / relief_records_type_check.
--
-- The current CAPOTBOOKS RELIEF UI stores these record types:
-- purchase_transfer, importation, settings, filed, and audit.
-- CREATE TABLE IF NOT EXISTS does not change constraints on an existing table,
-- so this migration explicitly replaces the check constraint.

begin;

alter table public.relief_records
  drop constraint if exists relief_records_type_check;

alter table public.relief_records
  add constraint relief_records_type_check
  check (record_type in (
    'purchase_transfer',
    'importation',
    'settings',
    'filed',
    'audit'
  ));

commit;
