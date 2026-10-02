-- ============================================================================
-- CAPOT DEVELOPER USER CONTROLS
--
-- Lets the authorized developer block/unblock or permanently delete a webapp
-- account from Developer System Config.
--
-- Block = account remains in Supabase Auth but CAPOT access is denied.
-- Delete = permanently removes the auth user; tables that reference auth.users
-- with ON DELETE CASCADE will be removed with the account as configured.
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_profiles_blocked
  ON public.profiles(blocked)
  WHERE blocked = TRUE;

-- ---------------------------------------------------------------------------
-- Shared helper for RLS. Security-definer avoids profile self-read policy
-- recursion when the helper is evaluated by policies on other tables.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_user_blocked()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT p.blocked
    FROM public.profiles p
    WHERE p.id = auth.uid()
    LIMIT 1
  ), FALSE);
$$;

REVOKE ALL ON FUNCTION public.is_user_blocked() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_user_blocked() TO authenticated;

-- ---------------------------------------------------------------------------
-- Developer-only block / unblock.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.set_user_blocked(UUID, BOOLEAN);

CREATE FUNCTION public.set_user_blocked(
  p_target_user_id UUID,
  p_blocked BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  target_email TEXT;
BEGIN
  caller_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  IF caller_email <> lower('thugz.gerald13@gmail.com') THEN
    RAISE EXCEPTION 'Not authorized to block or unblock users';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  SELECT lower(trim(coalesce(au.email, '')))
    INTO target_email
  FROM auth.users au
  WHERE au.id = p_target_user_id;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'Target user account not found';
  END IF;

  IF target_email = lower('thugz.gerald13@gmail.com')
     OR p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'The developer account cannot be blocked';
  END IF;

  UPDATE public.profiles
  SET
    blocked = p_blocked,
    blocked_at = CASE WHEN p_blocked THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_blocked(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_blocked(UUID, BOOLEAN) TO authenticated;

-- ---------------------------------------------------------------------------
-- Developer-only permanent deletion.
-- The explicit profiles delete handles deployments where profiles is not
-- declared with ON DELETE CASCADE. The auth.users delete then cascades through
-- clients, team links, invitations, legacy memberships, etc. where configured.
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.delete_user_account(UUID);

CREATE FUNCTION public.delete_user_account(
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  target_email TEXT;
BEGIN
  caller_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  IF caller_email <> lower('thugz.gerald13@gmail.com') THEN
    RAISE EXCEPTION 'Not authorized to delete users';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'The developer account cannot be deleted here';
  END IF;

  SELECT lower(trim(coalesce(au.email, '')))
    INTO target_email
  FROM auth.users au
  WHERE au.id = p_target_user_id;

  IF target_email IS NULL THEN
    RAISE EXCEPTION 'Target user account not found';
  END IF;

  IF target_email = lower('thugz.gerald13@gmail.com') THEN
    RAISE EXCEPTION 'The developer account cannot be deleted here';
  END IF;

  DELETE FROM public.profiles
  WHERE id = p_target_user_id;

  DELETE FROM auth.users
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target user account was not deleted';
  END IF;
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Cannot delete this account because another database object still references it. Block the account instead, or remove the dependent record first.';
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account(UUID) TO authenticated;

-- ---------------------------------------------------------------------------
-- Defense-in-depth RLS guard: a blocked user gets no CAPOT client/data access
-- even if they still possess a previously issued Supabase session token.
-- Profiles is intentionally excluded because AuthContext needs to read the
-- blocked flag before it displays the blocked-account screen.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  t TEXT;
BEGIN
  -- Root client rows.
  IF to_regclass('public.clients') IS NOT NULL THEN
    DROP POLICY IF EXISTS capot_blocked_users_guard ON public.clients;
    CREATE POLICY capot_blocked_users_guard
      ON public.clients
      AS RESTRICTIVE
      FOR ALL
      TO authenticated
      USING (NOT public.is_user_blocked())
      WITH CHECK (NOT public.is_user_blocked());
  END IF;

  -- Normalized child tables use the same restrictive guard regardless of the
  -- operation-specific permission policies already installed.
  FOREACH t IN ARRAY ARRAY[
    'purchases', 'sales', 'coa_columns', 'coa_accounts',
    'journal_columns', 'journal_entries', 'journal_vouchers', 'journal_voucher_lines',
    'purchase_orders', 'purchase_order_items', 'receiving_reports', 'receiving_report_items',
    'payable_invoices', 'payable_invoice_items', 'inventory_columns', 'inventory_items',
    'inventory_movements', 'app_folders', 'app_files', 'tin_entries', 'tax_deadlines',
    'bank_accounts', 'supplier_advances', 'withholding_tax_entries', 'debit_credit_memos',
    'check_vouchers', 'miscellaneous_payments', 'asset_lapsing_schedule',
    'billing_invoices', 'financial_report_snapshots'
  ] LOOP
    IF to_regclass(format('public.%I', t)) IS NOT NULL THEN
      EXECUTE format('DROP POLICY IF EXISTS capot_blocked_users_guard ON public.%I', t);
      EXECUTE format(
        'CREATE POLICY capot_blocked_users_guard ON public.%I AS RESTRICTIVE FOR ALL TO authenticated USING (NOT public.is_user_blocked()) WITH CHECK (NOT public.is_user_blocked())',
        t
      );
    END IF;
  END LOOP;
END $$;

-- Storage objects are also protected if the client-files bucket exists.
DROP POLICY IF EXISTS capot_blocked_users_guard ON storage.objects;
CREATE POLICY capot_blocked_users_guard
  ON storage.objects
  AS RESTRICTIVE
  FOR ALL
  TO authenticated
  USING (NOT public.is_user_blocked())
  WITH CHECK (NOT public.is_user_blocked());

-- Verification helpers:
-- select id, email, blocked, blocked_at from public.profiles order by updated_at desc;
-- select public.set_user_blocked('<USER-UUID>', true);
-- select public.set_user_blocked('<USER-UUID>', false);
-- select public.delete_user_account('<USER-UUID>');
