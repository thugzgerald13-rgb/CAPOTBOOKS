-- =============================================
-- USER APPROVAL / REVOCATION
-- CAPOT / Philippine Accounting App
-- =============================================
-- Run this migration in the Supabase SQL Editor when setting up the
-- approval RPC. The current deployed function uses p_target_user_id and
-- p_approved as its input parameter names.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

DROP FUNCTION IF EXISTS public.set_user_approved(UUID, BOOLEAN);

CREATE FUNCTION public.set_user_approved(
  p_target_user_id UUID,
  p_approved BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller_email TEXT;
  target_exists BOOLEAN;
BEGIN
  caller_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));

  IF caller_email <> lower('thugz.gerald13@gmail.com') THEN
    RAISE EXCEPTION 'Not authorized to change user approval';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'Target user is required';
  END IF;

  IF p_target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'The developer account cannot be approved or revoked here';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = p_target_user_id
  ) INTO target_exists;

  IF NOT target_exists THEN
    RAISE EXCEPTION 'Target user profile not found';
  END IF;

  UPDATE public.profiles
  SET
    approved = p_approved,
    approved_at = CASE WHEN p_approved THEN now() ELSE NULL END,
    updated_at = now()
  WHERE id = p_target_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.set_user_approved(UUID, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_user_approved(UUID, BOOLEAN) TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Developer can view all profiles" ON public.profiles;
CREATE POLICY "Developer can view all profiles"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    lower(trim(coalesce(auth.jwt() ->> 'email', ''))) = lower('thugz.gerald13@gmail.com')
  );
