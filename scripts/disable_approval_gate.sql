-- ============================================================================
-- disable_approval_gate.sql — remove the dev-approval requirement.
--
-- New users now get into the app immediately; profiles.approved no longer
-- gates access (the client no longer checks it). We default it to TRUE and
-- backfill existing users so the "pending approval" badge / Admin UI stays
-- consistent (zero pending, everyone approved).
--
-- REVOKE / BLOCK IS UNCHANGED:
--   - profiles.blocked (default FALSE) + blocked_at
--   - public.set_user_blocked(UUID, BOOLEAN) RPC
--   - public.is_user_blocked() RPC
--   - capot_blocked_users_guard RESTRICTIVE RLS policies on every table
--     (USING / WITH CHECK: NOT public.is_user_blocked())
--   A blocked user can still read nothing and write nothing.
-- ============================================================================

ALTER TABLE public.profiles ALTER COLUMN approved SET DEFAULT TRUE;

UPDATE public.profiles
   SET approved = TRUE,
       approved_at = COALESCE(approved_at, now())
 WHERE approved IS NOT TRUE;
