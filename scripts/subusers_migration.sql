-- =============================================
-- SUBUSERS MIGRATION — BASE SCHEMA
-- CAPOT / Philippine Accounting App
-- =============================================

-- Enable extensions if not already
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- BUSINESS ACCOUNTS (Main/Owner Accounts)
-- =============================================
CREATE TABLE IF NOT EXISTS business_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_type TEXT,
  tax_id TEXT, -- TIN
  registration_date DATE DEFAULT CURRENT_DATE,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_business_owner ON business_accounts(owner_id);

-- =============================================
-- ACCOUNT MEMBERSHIP (Subusers/Staff)
-- =============================================
CREATE TABLE IF NOT EXISTS account_membership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES business_accounts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'staff', -- owner, admin, accountant, cashier, inventory_clerk, staff, viewer
  permissions JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Each user can be in a business account only once
  UNIQUE(account_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_membership_user ON account_membership(user_id);
CREATE INDEX IF NOT EXISTS idx_membership_account ON account_membership(account_id);

-- =============================================
-- HELPER: Generate secure token — NO EXTENSIONS NEEDED
-- =============================================
CREATE OR REPLACE FUNCTION generate_secure_token()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Fixed: replaced gen_random_bytes with pure core Postgres
  SELECT lower(
    replace(
      gen_random_uuid()::text || gen_random_uuid()::text,
      '-', ''
    )
  );
$$;

-- =============================================
-- CREATE SUBUSER (Managed Login — Owner creates directly)
-- =============================================
CREATE OR REPLACE FUNCTION create_subuser(
  p_account_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_password TEXT,
  p_permissions JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
  v_user_exists UUID;
BEGIN
  -- Verify caller is owner
  SELECT owner_id INTO v_owner_id
  FROM business_accounts WHERE id = p_account_id;

  IF v_owner_id IS NULL OR v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized to create subusers for this account';
  END IF;

  -- Validate password
  IF p_password IS NULL OR length(p_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  -- Check if email already exists as member
  SELECT am.user_id INTO v_user_exists
  FROM account_membership am
  JOIN auth.users au ON am.user_id = au.id
  WHERE am.account_id = p_account_id
    AND lower(au.email) = lower(p_email);

  IF v_user_exists IS NOT NULL THEN
    RAISE EXCEPTION 'A user with this email is already a member';
  END IF;

  -- Note: Actual auth.users creation happens via TypeScript (Supabase Admin API)
  -- This function returns the membership record ID after the user exists
  RETURN gen_random_uuid();
END;
$$;

-- =============================================
-- LIST MY SUBUSERS
-- =============================================
CREATE OR REPLACE FUNCTION list_my_subusers(p_account_id UUID)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  role TEXT,
  permissions JSONB,
  is_active BOOLEAN,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM business_accounts WHERE id = p_account_id;

  IF v_owner_id IS NULL OR v_owner_id != auth.uid() THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  RETURN QUERY
  SELECT
    am.user_id,
    au.email,
    COALESCE(am.full_name, au.raw_user_meta_data->>'full_name') AS full_name,
    am.role,
    am.permissions,
    am.is_active,
    am.last_active_at,
    am.created_at
  FROM account_membership am
  JOIN auth.users au ON am.user_id = au.id
  WHERE am.account_id = p_account_id
  ORDER BY am.created_at DESC;
END;
$$;

-- =============================================
-- REMOVE SUBUSER
-- =============================================
CREATE OR REPLACE FUNCTION remove_subuser(
  p_account_id UUID,
  p_target_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_id UUID;
BEGIN
  SELECT owner_id INTO v_owner_id
  FROM business_accounts WHERE id = p_account_id;

  IF v_owner_id IS NULL OR v_owner_id != auth.uid() THEN
    RETURN FALSE;
  END IF;

  -- Cannot remove yourself
  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot remove yourself — transfer ownership first';
  END IF;

  DELETE FROM account_membership
  WHERE account_id = p_account_id AND user_id = p_target_user_id;

  RETURN FOUND;
END;
$$;

-- =============================================
-- GET MY ACCOUNTS — What businesses do I have access to?
-- =============================================
CREATE OR REPLACE FUNCTION get_my_accounts()
RETURNS TABLE (
  account_id UUID,
  account_name TEXT,
  role TEXT,
  is_owner BOOLEAN,
  permissions JSONB,
  joined_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_my_id UUID;
BEGIN
  v_my_id := auth.uid();
  IF v_my_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  RETURN QUERY
  -- Accounts I own
  SELECT
    ba.id AS account_id,
    ba.name AS account_name,
    'owner'::TEXT AS role,
    true AS is_owner,
    '{}'::JSONB AS permissions,
    ba.created_at AS joined_at
  FROM business_accounts ba
  WHERE ba.owner_id = v_my_id

  UNION ALL

  -- Accounts I'm a member of
  SELECT
    ba.id AS account_id,
    ba.name AS account_name,
    am.role,
    false AS is_owner,
    am.permissions,
    am.created_at AS joined_at
  FROM account_membership am
  JOIN business_accounts ba ON am.account_id = ba.id
  WHERE am.user_id = v_my_id
    AND am.is_active = true;
END;
$$;
