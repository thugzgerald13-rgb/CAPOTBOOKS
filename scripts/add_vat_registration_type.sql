-- ===========================================================================
-- Add vat_registration_type column to public.clients
-- ===========================================================================
-- BIR VAT registration type for each taxpayer/client:
--   'vat'        = VAT Registered (default — RELIEF / SLSP filing required)
--   'non-vat'    = Non-VAT (no RELIEF obligation — RELIEF menu hidden & locked)
--   'exempt'     = VAT Exempt (no RELIEF obligation — RELIEF menu hidden & locked)
--   'zero-rated' = Zero-Rated (VAT-registered, RELIEF available)
--
-- Apply to an EXISTING Supabase database (fresh installs already include the
-- column via scripts/schema.sql). Safe to re-run (IF NOT EXISTS / idempotent).
-- ===========================================================================

alter table public.clients
  add column if not exists vat_registration_type text not null default 'vat';

-- Drop + recreate the check constraint so re-runs never fail on an
-- already-existing constraint.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'clients_vat_registration_type_check'
  ) then
    alter table public.clients drop constraint clients_vat_registration_type_check;
  end if;
end $$;

alter table public.clients
  add constraint clients_vat_registration_type_check
  check (vat_registration_type in ('vat', 'non-vat', 'exempt', 'zero-rated'));

-- Backfill any legacy rows that somehow ended up with NULL (the column default
-- above already covers new rows; this guards pre-existing data).
update public.clients
   set vat_registration_type = 'vat'
 where vat_registration_type is null;
