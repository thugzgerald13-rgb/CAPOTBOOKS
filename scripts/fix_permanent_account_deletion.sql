-- ============================================================================
-- fix_permanent_account_deletion.sql
--
-- Consolidated, idempotent Supabase migration that fixes BOTH:
--   1. User self-deletion:      public.delete_my_account()
--   2. Developer deletion:      public.delete_user_account(p_target_user_id UUID)
--
-- Root causes fixed:
--   1. public.audit_logs immutability trigger (trg_audit_logs_immutable)
--      blocked PostgreSQL's ON DELETE SET NULL update on audit_logs.user_id
--      whenever a user was deleted from auth.users.
--   2. public.relief_records filed-month lock triggers
--      (trg_guard_relief_filed_month_writes & trg_protect_alphalist_filed_snapshots)
--      blocked cascading DELETE from public.clients -> public.relief_records
--      for any account with filed RELIEF or Monthly Alphalist snapshots.
--   3. Non-cascading foreign keys on payment_requests.reviewed_by,
--      app_feature_access_rules.updated_by, app_feature_visibility.updated_by,
--      ui_variant_assignments.updated_by, legacy business_profiles, and
--      Supabase storage.objects.owner caused foreign_key_violation on delete.
--   4. Managed staff accounts owned by a deleted subscriber left orphaned
--      auth.users rows behind.
--
-- Run this entire script ONCE in the Supabase SQL Editor.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Allow BIR CAS audit_logs to null ONLY user_id during account deletion.
--    All audit trail records remain intact and append-only (no DELETE, no
--    edits to action/entity/before_data/after_data/details/user_email/created_at).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prevent_audit_log_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
     AND coalesce(current_setting('app.account_deletion', true), '') = 'true'
     AND NEW.user_id IS NULL
     AND NEW.id          IS NOT DISTINCT FROM OLD.id
     AND NEW.client_id   IS NOT DISTINCT FROM OLD.client_id
     AND NEW.user_email  IS NOT DISTINCT FROM OLD.user_email
     AND NEW.action      IS NOT DISTINCT FROM OLD.action
     AND NEW.entity      IS NOT DISTINCT FROM OLD.entity
     AND NEW.entity_id   IS NOT DISTINCT FROM OLD.entity_id
     AND NEW.before_data IS NOT DISTINCT FROM OLD.before_data
     AND NEW.after_data  IS NOT DISTINCT FROM OLD.after_data
     AND NEW.details     IS NOT DISTINCT FROM OLD.details
     AND NEW.created_at  IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'audit_logs is append-only and cannot be modified or deleted (BIR CAS compliance).';
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Allow RELIEF & Monthly Alphalist filed-month triggers to permit cascading
--    DELETE strictly when app.account_deletion = 'true' (transaction-local).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.relief_records') IS NOT NULL THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.protect_alphalist_filed_snapshots()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $body$
      BEGIN
        IF TG_OP = 'DELETE'
           AND coalesce(current_setting('app.account_deletion', true), '') = 'true' THEN
          RETURN OLD;
        END IF;

        IF OLD.record_type = 'alphalist_filed'
           AND coalesce(current_setting('app.alphalist_amend', true), '') <> 'true' THEN
          RAISE EXCEPTION 'Monthly Alphalist month % is filed and locked. Use Amend before changing it.', OLD.record_id;
        END IF;

        IF TG_OP = 'DELETE' THEN
          RETURN OLD;
        END IF;
        RETURN NEW;
      END;
      $body$;
    $fn$;

    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.guard_relief_filed_month_writes()
      RETURNS TRIGGER
      LANGUAGE plpgsql
      SECURITY DEFINER
      SET search_path = public, pg_temp
      AS $body$
      DECLARE
        v_type text;
        v_id text;
        v_data jsonb;
        v_client_id text;
        v_source_month text;
        v_target_month text;
        v_locked_month text;
      BEGIN
        IF TG_OP = 'DELETE'
           AND coalesce(current_setting('app.account_deletion', true), '') = 'true' THEN
          RETURN OLD;
        END IF;

        IF TG_OP = 'UPDATE' THEN
          IF OLD.record_type = 'filed' OR NEW.record_type = 'filed' THEN
            IF current_setting('app.relief_allow_amend', true) IS DISTINCT FROM 'on' THEN
              RAISE EXCEPTION 'Filed RELIEF snapshots are immutable. Use Amend to unlock the selected month.' USING errcode = '55000';
            END IF;
          END IF;
        ELSIF TG_OP = 'DELETE' AND OLD.record_type = 'filed' THEN
          IF current_setting('app.relief_allow_amend', true) IS DISTINCT FROM 'on' THEN
            RAISE EXCEPTION 'Filed RELIEF snapshots are locked. Use Amend to unlock the selected month.' USING errcode = '55000';
          END IF;
        END IF;

        IF TG_OP = 'DELETE' THEN
          v_type := OLD.record_type; v_id := OLD.record_id; v_data := OLD.data; v_client_id := OLD.client_id;
        ELSE
          v_type := NEW.record_type; v_id := NEW.record_id; v_data := NEW.data; v_client_id := NEW.client_id;
        END IF;

        IF v_type = 'filed'
           AND v_id ~ '^(sales|purchases|imports)\|[0-9]{4}-(0[1-9]|1[0-2])$' THEN
          PERFORM pg_advisory_xact_lock(hashtextextended(v_client_id || '|' || v_id, 0));
        END IF;

        IF v_type = 'purchase_transfer' THEN
          v_source_month := regexp_replace(v_id, '^.*\|', '');
          v_target_month := coalesce(v_data ->> 'toMonth', '');
          IF v_source_month !~ '^\d{4}-(0[1-9]|1[0-2])$' OR v_target_month !~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
            RAISE EXCEPTION 'Invalid RELIEF transfer month. Expected YYYY-MM.' USING errcode = '23514';
          END IF;
          IF (v_client_id || '|purchases|' || v_source_month) < (v_client_id || '|purchases|' || v_target_month) THEN
            PERFORM pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_source_month, 0));
            PERFORM pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_target_month, 0));
          ELSE
            PERFORM pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_target_month, 0));
            PERFORM pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_source_month, 0));
          END IF;
          IF left(v_source_month, 4) <> left(v_target_month, 4) THEN
            RAISE EXCEPTION 'RELIEF purchase transfers must remain within the same calendar year.' USING errcode = '23514';
          END IF;
          IF EXISTS (
            SELECT 1 FROM public.relief_records rr WHERE rr.client_id = v_client_id
              AND rr.record_type = 'filed' AND rr.record_id = 'purchases|' || v_source_month
          ) THEN
            RAISE EXCEPTION 'Source month % is filed. Amend it before changing its transfer.', v_source_month USING errcode = '55000';
          END IF;
          IF EXISTS (
            SELECT 1 FROM public.relief_records rr WHERE rr.client_id = v_client_id
              AND rr.record_type = 'filed' AND rr.record_id = 'purchases|' || v_target_month
          ) THEN
            RAISE EXCEPTION 'Destination month % is filed. Amend it before transferring purchases into it.', v_target_month USING errcode = '55000';
          END IF;
        ELSIF v_type = 'settings' THEN
          v_locked_month := coalesce(v_data ->> 'monthKey', v_id);
          IF v_locked_month ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
            PERFORM pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_locked_month, 0));
          END IF;
          IF v_locked_month ~ '^\d{4}-(0[1-9]|1[0-2])$' AND EXISTS (
            SELECT 1 FROM public.relief_records rr WHERE rr.client_id = v_client_id
              AND rr.record_type = 'filed' AND rr.record_id = 'purchases|' || v_locked_month
          ) THEN
            RAISE EXCEPTION 'RELIEF settings for filed purchase month % are locked. Amend that month first.', v_locked_month USING errcode = '55000';
          END IF;
        ELSIF v_type = 'importation' THEN
          v_locked_month := coalesce(v_data ->> 'monthKey', split_part(v_id, '|', 1));
          IF v_locked_month ~ '^\d{4}-(0[1-9]|1[0-2])$' THEN
            PERFORM pg_advisory_xact_lock(hashtextextended(v_client_id || '|imports|' || v_locked_month, 0));
          END IF;
          IF v_locked_month ~ '^\d{4}-(0[1-9]|1[0-2])$' AND EXISTS (
            SELECT 1 FROM public.relief_records rr WHERE rr.client_id = v_client_id
              AND rr.record_type = 'filed' AND rr.record_id = 'imports|' || v_locked_month
          ) THEN
            RAISE EXCEPTION 'RELIEF importations for filed month % are locked. Amend that month first.', v_locked_month USING errcode = '55000';
          END IF;
        END IF;

        IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
      END;
      $body$;
    $fn$;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. Convert nullable NO ACTION / RESTRICT foreign keys on audit/admin metadata
--    columns to ON DELETE SET NULL so they never block user deletion.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT
      con.conname,
      ns.nspname AS tbl_schema,
      cls.relname AS tbl_name,
      att.attname AS col_name,
      ref_ns.nspname AS ref_schema,
      ref_cls.relname AS ref_table,
      ref_att.attname AS ref_col
    FROM pg_constraint con
    JOIN pg_class cls ON cls.oid = con.conrelid
    JOIN pg_namespace ns ON ns.oid = cls.relnamespace
    JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
    JOIN pg_class ref_cls ON ref_cls.oid = con.confrelid
    JOIN pg_namespace ref_ns ON ref_ns.oid = ref_cls.relnamespace
    JOIN pg_attribute ref_att ON ref_att.attrelid = con.confrelid AND ref_att.attnum = con.confkey[1]
    WHERE con.contype = 'f'
      AND array_length(con.conkey, 1) = 1
      AND ns.nspname = 'public'
      AND cls.relname IN (
        'payment_requests',
        'app_feature_access_rules',
        'app_feature_visibility',
        'ui_variant_assignments'
      )
      AND att.attname IN ('reviewed_by', 'updated_by')
      AND con.confdeltype IN ('a', 'r')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT %I',
      rec.tbl_schema, rec.tbl_name, rec.conname
    );
    EXECUTE format(
      'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES %I.%I(%I) ON DELETE SET NULL',
      rec.tbl_schema, rec.tbl_name, rec.conname,
      rec.col_name, rec.ref_schema, rec.ref_table, rec.ref_col
    );
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Internal helper that performs complete, safe permanent deletion of a
--    user account (plus any managed staff auth accounts owned by that user).
--    Revoked from PUBLIC, anon, and authenticated — only callable via
--    delete_my_account() and delete_user_account(UUID).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._permanently_delete_user_account(
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_staff_ids UUID[] := ARRAY[]::UUID[];
  v_all_user_ids UUID[];
  v_uid UUID;
  v_fk RECORD;
  v_deleted BOOLEAN := FALSE;
BEGIN
  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  -- Transaction-local flags so BIR CAS audit_logs (user_id -> NULL only) and
  -- RELIEF/Alphalist filed-month locks allow this authorized account deletion.
  PERFORM set_config('app.account_deletion', 'true', true);
  PERFORM set_config('app.relief_allow_amend', 'on', true);
  PERFORM set_config('app.alphalist_amend', 'true', true);

  -- Collect any managed staff auth accounts owned by the deleted subscriber
  -- so they are not left behind as orphaned auth.users rows.
  IF to_regclass('public.account_managed_staff_credentials') IS NOT NULL THEN
    SELECT coalesce(array_agg(DISTINCT msc.auth_user_id), ARRAY[]::UUID[])
      INTO v_staff_ids
    FROM public.account_managed_staff_credentials msc
    JOIN auth.users au ON au.id = msc.auth_user_id
    WHERE msc.owner_user_id = p_target_user_id
      AND msc.auth_user_id <> p_target_user_id
      AND lower(trim(coalesce(au.email, ''))) <> lower('thugz.gerald13@gmail.com');
  END IF;

  -- Delete managed staff accounts first, then the primary account.
  v_all_user_ids := array_append(coalesce(v_staff_ids, ARRAY[]::UUID[]), p_target_user_id);

  FOREACH v_uid IN ARRAY v_all_user_ids LOOP
    -- 1. Detach immutable BIR CAS audit logs (preserves audit trail rows).
    IF to_regclass('public.audit_logs') IS NOT NULL THEN
      UPDATE public.audit_logs SET user_id = NULL WHERE user_id = v_uid;
    END IF;

    -- 2. Detach period locks & RELIEF created_by pointers.
    IF to_regclass('public.accounting_period_locks') IS NOT NULL THEN
      UPDATE public.accounting_period_locks SET locked_by = NULL WHERE locked_by = v_uid;
    END IF;
    IF to_regclass('public.relief_records') IS NOT NULL THEN
      UPDATE public.relief_records SET created_by = NULL WHERE created_by = v_uid;
    END IF;

    -- 3. Clean up billing, module entitlements, and developer override rules.
    IF to_regclass('public.payment_requests') IS NOT NULL THEN
      UPDATE public.payment_requests SET reviewed_by = NULL WHERE reviewed_by = v_uid;
      DELETE FROM public.payment_requests WHERE user_id = v_uid;
    END IF;
    IF to_regclass('public.account_modules') IS NOT NULL THEN
      DELETE FROM public.account_modules WHERE user_id = v_uid;
    END IF;
    IF to_regclass('public.app_feature_access_rules') IS NOT NULL THEN
      UPDATE public.app_feature_access_rules SET updated_by = NULL WHERE updated_by = v_uid;
      DELETE FROM public.app_feature_access_rules
       WHERE scope_type = 'user' AND scope_key = v_uid::text;
    END IF;
    IF to_regclass('public.app_feature_visibility') IS NOT NULL THEN
      UPDATE public.app_feature_visibility SET updated_by = NULL WHERE updated_by = v_uid;
    END IF;
    IF to_regclass('public.ui_variant_assignments') IS NOT NULL THEN
      UPDATE public.ui_variant_assignments SET updated_by = NULL WHERE updated_by = v_uid;
      DELETE FROM public.ui_variant_assignments
       WHERE scope_type = 'user' AND scope_key = v_uid::text;
    END IF;

    -- 4. Clean up team / subuser / accountant link tables.
    IF to_regclass('public.account_team_client_ui_permissions') IS NOT NULL THEN
      DELETE FROM public.account_team_client_ui_permissions
       WHERE owner_user_id = v_uid OR member_user_id = v_uid;
    END IF;
    IF to_regclass('public.account_team_client_permissions') IS NOT NULL THEN
      DELETE FROM public.account_team_client_permissions
       WHERE owner_user_id = v_uid OR member_user_id = v_uid;
    END IF;
    IF to_regclass('public.accountant_client_links') IS NOT NULL THEN
      DELETE FROM public.accountant_client_links
       WHERE business_owner_user_id = v_uid OR accountant_user_id = v_uid;
    END IF;
    IF to_regclass('public.account_managed_staff_credentials') IS NOT NULL THEN
      DELETE FROM public.account_managed_staff_credentials
       WHERE owner_user_id = v_uid OR auth_user_id = v_uid;
    END IF;
    IF to_regclass('public.account_team_links') IS NOT NULL THEN
      DELETE FROM public.account_team_links
       WHERE owner_user_id = v_uid OR member_user_id = v_uid;
    END IF;
    IF to_regclass('public.team_account_invitations') IS NOT NULL THEN
      UPDATE public.team_account_invitations
         SET accepted_user_id = NULL
       WHERE accepted_user_id = v_uid;
      DELETE FROM public.team_account_invitations
       WHERE owner_user_id = v_uid;
    END IF;
    IF to_regclass('public.subusers') IS NOT NULL THEN
      DELETE FROM public.subusers WHERE user_id = v_uid;
    END IF;
    IF to_regclass('public.business_accounts') IS NOT NULL THEN
      DELETE FROM public.business_accounts WHERE owner_id = v_uid;
    END IF;

    -- 5. Clean up legacy business_profiles and owned client workspaces
    --    (cascades through purchases, sales, journals, relief, payroll, etc.).
    IF to_regclass('public.business_profiles') IS NOT NULL THEN
      DELETE FROM public.business_profiles WHERE user_id = v_uid;
    END IF;
    IF to_regclass('public.clients') IS NOT NULL THEN
      DELETE FROM public.clients WHERE user_id = v_uid;
    END IF;

    -- 6. Detach Supabase Storage object/bucket ownership so uploaded receipts
    --    or client attachments never block DELETE FROM auth.users via
    --    storage.objects_owner_fkey.
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'owner'
      ) THEN
        EXECUTE 'UPDATE storage.objects SET owner = NULL WHERE owner = $1' USING v_uid;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'storage' AND table_name = 'objects' AND column_name = 'owner_id'
      ) THEN
        EXECUTE 'UPDATE storage.objects SET owner_id = NULL WHERE owner_id = $1' USING v_uid::text;
      END IF;
      IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'owner'
      ) THEN
        EXECUTE 'UPDATE storage.buckets SET owner = NULL WHERE owner = $1' USING v_uid;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        -- Ignore if storage schema is unavailable or uses a different layout.
        NULL;
    END;

    -- 7. Dynamic safety net for any remaining public-schema NO ACTION / RESTRICT
    --    foreign keys pointing at public.profiles or auth.users.
    FOR v_fk IN
      SELECT
        ns.nspname AS tbl_schema,
        cls.relname AS tbl_name,
        att.attname AS col_name,
        att.attnotnull AS is_not_null
      FROM pg_constraint con
      JOIN pg_class cls ON cls.oid = con.conrelid
      JOIN pg_namespace ns ON ns.oid = cls.relnamespace
      JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
      JOIN pg_class ref_cls ON ref_cls.oid = con.confrelid
      JOIN pg_namespace ref_ns ON ref_ns.oid = ref_cls.relnamespace
      WHERE con.contype = 'f'
        AND array_length(con.conkey, 1) = 1
        AND ns.nspname = 'public'
        AND con.confdeltype IN ('a', 'r')
        AND (
          (ref_ns.nspname = 'auth' AND ref_cls.relname = 'users')
          OR (ref_ns.nspname = 'public' AND ref_cls.relname = 'profiles')
        )
        AND NOT (ns.nspname = 'public' AND cls.relname = 'profiles')
    LOOP
      IF NOT v_fk.is_not_null THEN
        EXECUTE format(
          'UPDATE %I.%I SET %I = NULL WHERE %I = $1',
          v_fk.tbl_schema, v_fk.tbl_name, v_fk.col_name, v_fk.col_name
        ) USING v_uid;
      ELSE
        EXECUTE format(
          'DELETE FROM %I.%I WHERE %I = $1',
          v_fk.tbl_schema, v_fk.tbl_name, v_fk.col_name
        ) USING v_uid;
      END IF;
    END LOOP;

    -- 8. Delete profile row, then permanently delete auth.users row.
    IF to_regclass('public.profiles') IS NOT NULL THEN
      DELETE FROM public.profiles WHERE id = v_uid;
    END IF;

    DELETE FROM auth.users WHERE id = v_uid;
    IF v_uid = p_target_user_id AND FOUND THEN
      v_deleted := TRUE;
    END IF;
  END LOOP;

  IF NOT v_deleted THEN
    RAISE EXCEPTION 'Target user account was not deleted';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._permanently_delete_user_account(UUID) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. User self-deletion RPC: public.delete_my_account()
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  caller_email TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  caller_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  -- Protect the developer account from self-deletion.
  IF caller_email = lower('thugz.gerald13@gmail.com') THEN
    RAISE EXCEPTION 'The developer account cannot be deleted here';
  END IF;

  PERFORM public._permanently_delete_user_account(auth.uid());
END;
$$;

REVOKE ALL ON FUNCTION public.delete_my_account() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. Developer-only subscriber deletion RPC: public.delete_user_account(UUID)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.delete_user_account(UUID);

CREATE FUNCTION public.delete_user_account(
  p_target_user_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
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
    -- Handle orphan profile row whose auth.users entry was already removed.
    IF to_regclass('public.profiles') IS NOT NULL THEN
      DELETE FROM public.profiles WHERE id = p_target_user_id;
      IF FOUND THEN
        RETURN;
      END IF;
    END IF;
    RAISE EXCEPTION 'Target user account not found';
  END IF;

  IF target_email = lower('thugz.gerald13@gmail.com') THEN
    RAISE EXCEPTION 'The developer account cannot be deleted here';
  END IF;

  PERFORM public._permanently_delete_user_account(p_target_user_id);
EXCEPTION
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Cannot delete this account due to a remaining database reference: %', SQLERRM;
END;
$$;

REVOKE ALL ON FUNCTION public.delete_user_account(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_user_account(UUID) TO authenticated;

-- Reload PostgREST schema cache so the updated RPCs take effect immediately.
NOTIFY pgrst, 'reload schema';
