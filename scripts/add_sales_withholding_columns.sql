-- ============================================================================
-- Add income-side VAT breakdown + creditable withholding tax columns to sales.
-- Mirrors the existing purchases columns (exempt_amount, zero_rated_amount,
-- withholding_option, atc_code, wht_rate, wht_amount) so Income History can
-- display Exempt / 0-Rated / CWT amounts per entry, and the Income page can
-- capture creditable withholding tax (ATC + rate + amount) on save/update.
-- Safe to re-run (all adds use IF NOT EXISTS).
-- ============================================================================

alter table public.sales
  add column if not exists exempt_amount numeric(18,2) not null default 0,
  add column if not exists zero_rated_amount numeric(18,2) not null default 0,
  add column if not exists withholding_option text,
  add column if not exists atc_code text,
  add column if not exists wht_rate numeric(9,4),
  add column if not exists wht_amount numeric(18,2) not null default 0;
