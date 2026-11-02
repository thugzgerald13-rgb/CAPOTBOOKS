-- Developer-only taxpayer profile controls for every client workspace.
-- Run once in the Supabase SQL Editor after the existing CAPOT migrations.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS taxpayer_sub_classification text,
  ADD COLUMN IF NOT EXISTS taxpayer_tier text,
  ADD COLUMN IF NOT EXISTS income_tax_regime text,
  ADD COLUMN IF NOT EXISTS deduction_method text,
  ADD COLUMN IF NOT EXISTS percentage_tax_rate numeric;

CREATE OR REPLACE FUNCTION public.developer_list_taxpayer_profiles()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  IF v_email <> 'thugz.gerald13@gmail.com' THEN
    RAISE EXCEPTION 'Not authorized to view taxpayer profiles';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', c.id, 'user_id', c.user_id, 'owner_email', p.email,
      'owner_name', p.display_name, 'name', c.name,
      'taxpayer_classification', c.taxpayer_classification,
      'taxpayer_sub_classification', c.taxpayer_sub_classification,
      'vat_registration_type', c.vat_registration_type,
      'income_tax_regime', c.income_tax_regime,
      'deduction_method', c.deduction_method,
      'percentage_tax_rate', c.percentage_tax_rate,
      'taxpayer_tier', c.taxpayer_tier, 'industry', c.industry
    ) ORDER BY lower(coalesce(p.email, '')), lower(c.name))
    FROM public.clients c
    LEFT JOIN public.profiles p ON p.id = c.user_id
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.developer_update_taxpayer_profile(
  p_client_id text,
  p_taxpayer_classification text,
  p_taxpayer_sub_classification text,
  p_vat_registration_type text,
  p_income_tax_regime text,
  p_deduction_method text,
  p_percentage_tax_rate numeric,
  p_taxpayer_tier text,
  p_industry text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_email text;
BEGIN
  v_email := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  IF v_email <> 'thugz.gerald13@gmail.com' THEN
    RAISE EXCEPTION 'Not authorized to update taxpayer profiles';
  END IF;
  IF p_client_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.clients WHERE id = p_client_id) THEN
    RAISE EXCEPTION 'Client workspace not found';
  END IF;
  IF p_taxpayer_classification NOT IN ('Individual', 'Non-Individual') THEN
    RAISE EXCEPTION 'Invalid taxpayer classification';
  END IF;
  IF p_vat_registration_type NOT IN ('vat', 'non-vat', 'exempt', 'zero-rated') THEN
    RAISE EXCEPTION 'Invalid VAT/business tax registration type';
  END IF;
  IF p_taxpayer_tier NOT IN ('micro', 'small', 'medium', 'large') THEN
    RAISE EXCEPTION 'Invalid taxpayer tier';
  END IF;
  IF p_industry NOT IN ('retail', 'general-services', 'manufacturing', 'construction') THEN
    RAISE EXCEPTION 'Invalid industry';
  END IF;
  IF p_percentage_tax_rate IS NOT NULL AND (p_percentage_tax_rate < 0 OR p_percentage_tax_rate > 1) THEN
    RAISE EXCEPTION 'Percentage tax rate must be between 0 and 1';
  END IF;

  UPDATE public.clients SET
    taxpayer_classification = p_taxpayer_classification,
    taxpayer_sub_classification = nullif(p_taxpayer_sub_classification, ''),
    vat_registration_type = p_vat_registration_type,
    income_tax_regime = nullif(p_income_tax_regime, ''),
    deduction_method = nullif(p_deduction_method, ''),
    percentage_tax_rate = p_percentage_tax_rate,
    taxpayer_tier = p_taxpayer_tier,
    industry = p_industry,
    updated_at = now()
  WHERE id = p_client_id;
END;
$$;

REVOKE ALL ON FUNCTION public.developer_list_taxpayer_profiles() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.developer_update_taxpayer_profile(text,text,text,text,text,text,numeric,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.developer_list_taxpayer_profiles() TO authenticated;
GRANT EXECUTE ON FUNCTION public.developer_update_taxpayer_profile(text,text,text,text,text,text,numeric,text,text) TO authenticated;
