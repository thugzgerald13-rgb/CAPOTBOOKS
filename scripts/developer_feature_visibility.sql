-- Global developer-controlled page/function visibility for CAPOTBOOKS.
-- Run once in the Supabase SQL Editor. Hidden pages are also blocked by the
-- client-side route guard; this controls visibility, not data/API authorization.

CREATE TABLE IF NOT EXISTS public.app_feature_visibility (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  visibility jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.app_feature_visibility ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_feature_visibility_no_direct_access ON public.app_feature_visibility;
CREATE POLICY app_feature_visibility_no_direct_access
  ON public.app_feature_visibility FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.get_feature_visibility()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((SELECT visibility FROM public.app_feature_visibility WHERE id = 1), '{}'::jsonb);
$$;

CREATE OR REPLACE FUNCTION public.set_feature_visibility(p_visibility jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  IF v_email <> 'thugz.gerald13@gmail.com' THEN
    RAISE EXCEPTION 'Not authorized to change feature visibility';
  END IF;
  IF p_visibility IS NULL OR jsonb_typeof(p_visibility) <> 'object' THEN
    RAISE EXCEPTION 'Feature visibility must be a JSON object';
  END IF;
  INSERT INTO public.app_feature_visibility (id, visibility, updated_at, updated_by)
  VALUES (1, p_visibility, now(), auth.uid())
  ON CONFLICT (id) DO UPDATE
    SET visibility = EXCLUDED.visibility, updated_at = now(), updated_by = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION public.get_feature_visibility() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_feature_visibility(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_feature_visibility() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_feature_visibility(jsonb) TO authenticated;
