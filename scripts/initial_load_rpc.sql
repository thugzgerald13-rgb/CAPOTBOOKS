-- =============================================================================
-- initial_load_rpc.sql — Consolidated initial-load RPC + idempotent indexes
--
-- Replaces the 19 parallel GETs fired by loadNormalizedClient() in
-- src/context/AccountingContext.tsx with ONE rpc() call. The TypeScript side
-- (src/lib/initialLoad.ts) falls back to the original per-table fetches if
-- this function is missing, errors, or returns NULL — deploying this is
-- always safe; rolling back means the app degrades gracefully.
--
-- Run once in the Supabase SQL editor (or via the CLI). Safe to re-run.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Consolidated initial-load function
--
-- SECURITY MODEL: SECURITY INVOKER (the default — deliberately NOT SECURITY
-- DEFINER). The function runs with the caller's privileges, so existing RLS
-- policies on every table are applied to each subquery. Team members / subusers
-- who can read a client via normal PostgREST can read it via this RPC; anyone
-- else gets empty arrays. This avoids the data-leak risk of SECURITY DEFINER
-- (which bypasses RLS and would require an explicit, maintained access check).
--
-- If you later want the (marginal) speedup of SECURITY DEFINER, you MUST add an
-- explicit access guard (owner OR team-member) before the RETURN — do not just
-- flip the keyword.
--
-- Returns NULL when p_client_id is null so the caller falls back.
-- -----------------------------------------------------------------------------
create or replace function public.get_initial_client_data(p_client_id text)
returns jsonb
language sql
stable
set search_path = public
as $$
  select
    case when p_client_id is null then null
    else jsonb_build_object(
      -- 8 delta-synced tables (mirrors DELTA_SYNC_TABLES in AccountingContext)
      'purchases',              coalesce((select jsonb_agg(to_jsonb(t)) from public.purchases              t where t.client_id = p_client_id), '[]'::jsonb),
      'sales',                  coalesce((select jsonb_agg(to_jsonb(t)) from public.sales                  t where t.client_id = p_client_id), '[]'::jsonb),
      'coa_columns',            coalesce((select jsonb_agg(to_jsonb(t)) from public.coa_columns            t where t.client_id = p_client_id), '[]'::jsonb),
      'coa_accounts',           coalesce((select jsonb_agg(to_jsonb(t)) from public.coa_accounts           t where t.client_id = p_client_id), '[]'::jsonb),
      'journal_columns',        coalesce((select jsonb_agg(to_jsonb(t)) from public.journal_columns        t where t.client_id = p_client_id), '[]'::jsonb),
      'journal_entries',        coalesce((select jsonb_agg(to_jsonb(t)) from public.journal_entries        t where t.client_id = p_client_id), '[]'::jsonb),
      'journal_vouchers',       coalesce((select jsonb_agg(to_jsonb(t)) from public.journal_vouchers       t where t.client_id = p_client_id), '[]'::jsonb),
      'journal_voucher_lines',  coalesce((select jsonb_agg(to_jsonb(t)) from public.journal_voucher_lines  t where t.client_id = p_client_id), '[]'::jsonb),
      -- 11 full-fetch tables (mirrors fullQueryPromises in AccountingContext)
      'inventory_columns',      coalesce((select jsonb_agg(to_jsonb(t)) from public.inventory_columns      t where t.client_id = p_client_id), '[]'::jsonb),
      'inventory_items',        coalesce((select jsonb_agg(to_jsonb(t)) from public.inventory_items        t where t.client_id = p_client_id), '[]'::jsonb),
      'inventory_movements',    coalesce((select jsonb_agg(to_jsonb(t)) from public.inventory_movements    t where t.client_id = p_client_id), '[]'::jsonb),
      'app_folders',            coalesce((select jsonb_agg(to_jsonb(t)) from public.app_folders            t where t.client_id = p_client_id), '[]'::jsonb),
      'app_files',              coalesce((select jsonb_agg(to_jsonb(t)) from public.app_files              t where t.client_id = p_client_id), '[]'::jsonb),
      'tin_entries',            coalesce((select jsonb_agg(to_jsonb(t)) from public.tin_entries            t where t.client_id = p_client_id), '[]'::jsonb),
      'tax_deadlines',          coalesce((select jsonb_agg(to_jsonb(t)) from public.tax_deadlines          t where t.client_id = p_client_id), '[]'::jsonb),
      'bank_accounts',          coalesce((select jsonb_agg(to_jsonb(t)) from public.bank_accounts          t where t.client_id = p_client_id), '[]'::jsonb),
      'asset_lapsing_schedule', coalesce((select jsonb_agg(to_jsonb(t)) from public.asset_lapsing_schedule t where t.client_id = p_client_id), '[]'::jsonb),
      'billing_invoices',       coalesce((select jsonb_agg(to_jsonb(t)) from public.billing_invoices       t where t.client_id = p_client_id), '[]'::jsonb),
      'financial_report_snapshots', coalesce((select jsonb_agg(to_jsonb(t)) from public.financial_report_snapshots t where t.client_id = p_client_id), '[]'::jsonb)
    )
    end;
$$;

-- Only authenticated users may call it. Accounting data is never public.
revoke all on function public.get_initial_client_data(text) from public;
grant execute on function public.get_initial_client_data(text) to authenticated;

-- -----------------------------------------------------------------------------
-- 2. Idempotent client_id indexes.
--
-- Most of these already exist in scripts/schema.sql; this block guarantees
-- they are present (CREATE INDEX IF NOT EXISTS is a no-op if they are). Run
-- this even if you think indexes exist — it is harmless and confirms coverage.
-- -----------------------------------------------------------------------------
create index if not exists idx_purchases_client_id             on public.purchases(client_id);
create index if not exists idx_sales_client_id                 on public.sales(client_id);
create index if not exists idx_coa_columns_client_id           on public.coa_columns(client_id);
create index if not exists idx_coa_accounts_client_id          on public.coa_accounts(client_id);
create index if not exists idx_journal_columns_client_id       on public.journal_columns(client_id);
create index if not exists idx_journal_entries_client_id       on public.journal_entries(client_id);
create index if not exists idx_journal_vouchers_client_id      on public.journal_vouchers(client_id);
create index if not exists idx_journal_voucher_lines_client_id on public.journal_voucher_lines(client_id);
create index if not exists idx_inventory_columns_client_id     on public.inventory_columns(client_id);
create index if not exists idx_inventory_items_client_id       on public.inventory_items(client_id);
create index if not exists idx_inventory_movements_client_id   on public.inventory_movements(client_id);
create index if not exists idx_app_folders_client_id           on public.app_folders(client_id);
create index if not exists idx_app_files_client_id             on public.app_files(client_id);
create index if not exists idx_tin_entries_client_id           on public.tin_entries(client_id);
create index if not exists idx_tax_deadlines_client_id         on public.tax_deadlines(client_id);
create index if not exists idx_bank_accounts_client_id         on public.bank_accounts(client_id);
create index if not exists idx_asset_lapsing_schedule_client_id on public.asset_lapsing_schedule(client_id);
create index if not exists idx_billing_invoices_client_id      on public.billing_invoices(client_id);
create index if not exists idx_financial_report_snapshots_client_id on public.financial_report_snapshots(client_id);

-- Composite indexes that materially speed the delta-sync `gte(updated_at)`
-- filter and the common (client_id, date) report scans. No-ops if present.
create index if not exists idx_purchases_client_updated        on public.purchases(client_id, updated_at);
create index if not exists idx_sales_client_updated            on public.sales(client_id, updated_at);
create index if not exists idx_journal_entries_client_updated  on public.journal_entries(client_id, updated_at);
create index if not exists idx_coa_accounts_client_updated     on public.coa_accounts(client_id, updated_at);
