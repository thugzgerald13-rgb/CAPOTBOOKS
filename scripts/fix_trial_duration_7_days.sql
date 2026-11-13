-- ============================================================================
-- CAPOTBOOKS: enforce a 7-day trial for all trials started after this patch.
--
-- Why this patch exists:
--   The frontend and the original modules_entitlements.sql already specify
--   seven days. If newly created accounts are receiving fourteen days in the
--   live app, the deployed Supabase get_my_entitlements() RPC is out of sync.
--   Applying this script replaces that server-side function with the 7-day
--   implementation used by the app.
--
-- Run in Supabase Dashboard -> SQL Editor.
-- Existing profiles with trial_started_at/trial_ends_at already populated are
-- intentionally left unchanged. This changes the duration for trials that
-- start after this migration; it does not retroactively shorten active trials.
-- ============================================================================

create or replace function public.get_my_entitlements()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_member boolean;
  v_role text;
  v_trial_start timestamptz;
  v_trial_end timestamptz;
  v_plan text;
  v_status text;
  v_plan_exp timestamptz;
  v_mods jsonb;
  v_legacy text[];
  v_legacy_exp timestamptz;
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_owner := public.entitlement_owner(v_uid);
  v_member := v_owner <> v_uid;

  select lower(coalesce(user_role, '')), trial_started_at, trial_ends_at,
         subscription_plan, subscription_status, subscription_expires_at
    into v_role, v_trial_start, v_trial_end, v_plan, v_status, v_plan_exp
  from public.profiles
  where id = v_owner;

  v_is_admin := exists (
    select 1 from public.profiles where id = v_uid and role = 'admin'
  );

  -- Start the trial once, server-side, for account owners with a chosen role.
  -- Seven days is the authoritative duration for newly started trials.
  if not v_member and v_trial_start is null and v_role <> '' then
    v_trial_start := now();
    v_trial_end := v_trial_start + interval '7 days';

    update public.profiles
       set trial_started_at = v_trial_start,
           trial_ends_at = v_trial_end
     where id = v_owner;
  end if;

  -- Paid modules still in date.
  select coalesce(
           jsonb_agg(jsonb_build_object(
             'module', m.module,
             'expires_at', m.expires_at,
             'source', m.source
           )),
           '[]'::jsonb
         )
    into v_mods
  from public.account_modules m
  where m.user_id = v_owner
    and m.expires_at > now();

  -- Grandfather the old flat plans so existing payers keep what they paid for.
  if v_plan in ('starter','pro','enterprise')
     and coalesce(v_status, 'active') = 'active'
     and (v_plan_exp is null or v_plan_exp > now()) then
    v_legacy := case v_plan
      when 'starter' then array['accounting_books','reports','billing']
      when 'pro' then array['accounting_books','reports','billing','compliance','inventory']
      else array['accounting_books','reports','billing','compliance','inventory','team']
    end;
    v_legacy_exp := coalesce(v_plan_exp, now() + interval '3650 days');

    v_mods := v_mods || coalesce((
      select jsonb_agg(jsonb_build_object(
        'module', x,
        'expires_at', v_legacy_exp,
        'source', 'legacy_plan'
      ))
      from unnest(v_legacy) as x
    ), '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'trial_started_at', v_trial_start,
    'trial_ends_at', v_trial_end,
    'modules', v_mods,
    'is_team_member', v_member,
    'is_admin', v_is_admin,
    'server_now', now()
  );
end;
$$;

revoke all on function public.get_my_entitlements() from public;
grant execute on function public.get_my_entitlements() to authenticated;
