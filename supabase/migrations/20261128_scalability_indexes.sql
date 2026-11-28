-- ============================================================================
-- scalability_indexes.sql
--
-- Composite PostgreSQL indexes for multi-user, multi-client scalability in
-- CAPOTBOOKS (fast per-client hydration, date-range ledger queries, and
-- paginated Transaction History).
--
-- 100% additive & idempotent (safe to run multiple times in Supabase SQL Editor).
-- ============================================================================

DO $$
BEGIN
  -- 1. Clients directory lookup per owner / accountant
  IF to_regclass('public.clients') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_clients_user_updated
      ON public.clients (user_id, updated_at DESC);
  END IF;

  -- 2. Purchases: date-range queries, delta sync (updated_at), and invoice lookup
  IF to_regclass('public.purchases') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_purchases_client_date_desc
      ON public.purchases (client_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_purchases_client_updated
      ON public.purchases (client_id, updated_at DESC);
  END IF;

  -- 3. Sales: date-range queries and delta sync (updated_at)
  IF to_regclass('public.sales') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_sales_client_date_desc
      ON public.sales (client_id, date DESC);
    CREATE INDEX IF NOT EXISTS idx_sales_client_updated
      ON public.sales (client_id, updated_at DESC);
  END IF;

  -- 4. Journal Entries: per-journal-type lookups and delta sync
  IF to_regclass('public.journal_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_journal_entries_client_type_date
      ON public.journal_entries (client_id, journal_type, entry_date DESC);
    CREATE INDEX IF NOT EXISTS idx_journal_entries_client_updated
      ON public.journal_entries (client_id, updated_at DESC);
  END IF;

  -- 5. Journal Vouchers & Lines
  IF to_regclass('public.journal_vouchers') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_journal_vouchers_client_date
      ON public.journal_vouchers (client_id, date DESC);
  END IF;
  IF to_regclass('public.journal_voucher_lines') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_journal_voucher_lines_client_voucher
      ON public.journal_voucher_lines (client_id, journal_voucher_id);
  END IF;

  -- 6. Chart of Accounts, Billing Invoices, TIN Library, App Files
  IF to_regclass('public.coa_accounts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_coa_accounts_client_updated
      ON public.coa_accounts (client_id, updated_at DESC);
  END IF;
  IF to_regclass('public.billing_invoices') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_billing_invoices_client_date
      ON public.billing_invoices (client_id, date DESC);
  END IF;
  IF to_regclass('public.tin_entries') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_tin_entries_client_type
      ON public.tin_entries (client_id, entry_type);
  END IF;
  IF to_regclass('public.app_files') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_app_files_client_folder
      ON public.app_files (client_id, folder_id);
  END IF;

  -- 7. Team / Permission lookups for multi-user firms
  IF to_regclass('public.account_team_links') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_account_team_links_member_status
      ON public.account_team_links (member_user_id, status);
  END IF;
  IF to_regclass('public.account_team_client_permissions') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_atcp_member_client
      ON public.account_team_client_permissions (member_user_id, client_id);
  END IF;
END $$;
