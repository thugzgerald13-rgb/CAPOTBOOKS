-- Per-subscription-plan and per-user feature visibility overrides.
-- Run in Supabase SQL Editor after scripts/developer_feature_visibility.sql and
-- scripts/modules_entitlements.sql. Safe to re-run.

create table if not exists public.app_feature_access_rules (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('user', 'plan')),
  scope_key text not null,
  feature_id text not null,
  enabled boolean not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint app_feature_access_rules_unique unique (scope_type, scope_key, feature_id),
  constraint app_feature_access_rules_scope_key_nonempty check (length(trim(scope_key)) > 0),
  constraint app_feature_access_rules_feature_id_nonempty check (length(trim(feature_id)) > 0)
);

create index if not exists idx_app_feature_access_rules_lookup
  on public.app_feature_access_rules (scope_type, scope_key, feature_id);

alter table public.app_feature_access_rules enable row level security;
drop policy if exists app_feature_access_rules_no_direct_access on public.app_feature_access_rules;
create policy app_feature_access_rules_no_direct_access
  on public.app_feature_access_rules for all to authenticated
  using (false) with check (false);

-- Resolve current account visibility. Order of precedence:
-- global OFF is a master restriction; otherwise user override > plan override > ON.
-- Team members inherit their account owner's subscription plan.
create or replace function public.get_my_feature_visibility()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_plan text;
  v_global jsonb;
  v_result jsonb;
  v_rule record;
  v_global_enabled boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_owner := coalesce(public.entitlement_owner(v_uid), v_uid);
  select lower(trim(coalesce(subscription_plan, 'free')))
    into v_plan
  from public.profiles
  where id = v_owner;
  v_plan := coalesce(nullif(v_plan, ''), 'free');

  select visibility into v_global
  from public.app_feature_visibility
  where id = 1;
  v_result := coalesce(v_global, '{}'::jsonb);

  for v_rule in
    select feature_id, enabled
    from public.app_feature_access_rules
    where scope_type = 'plan' and scope_key = v_plan
  loop
    v_global_enabled := coalesce((v_global ->> v_rule.feature_id)::boolean, true);
    v_result := jsonb_set(v_result, array[v_rule.feature_id], to_jsonb(v_global_enabled and v_rule.enabled), true);
  end loop;

  for v_rule in
    select feature_id, enabled
    from public.app_feature_access_rules
    where scope_type = 'user' and scope_key = v_uid::text
  loop
    v_global_enabled := coalesce((v_global ->> v_rule.feature_id)::boolean, true);
    v_result := jsonb_set(v_result, array[v_rule.feature_id], to_jsonb(v_global_enabled and v_rule.enabled), true);
  end loop;

  return v_result;
end;
$$;

-- Developer-only list API used by Developer System Config.
create or replace function public.developer_get_feature_access_rules()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> 'thugz.gerald13@gmail.com' then
    raise exception 'Developer access required';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'scope_type', scope_type,
      'scope_key', scope_key,
      'feature_id', feature_id,
      'enabled', enabled
    ) order by scope_type, scope_key, feature_id)
    from public.app_feature_access_rules
  ), '[]'::jsonb);
end;
$$;

-- Set enabled=true/false to create or update a rule; null removes it (inherit).
create or replace function public.developer_set_feature_access_rule(
  p_scope_type text,
  p_scope_key text,
  p_feature_id text,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := lower(trim(coalesce(p_scope_type, '')));
  v_key text := trim(coalesce(p_scope_key, ''));
  v_feature text := trim(coalesce(p_feature_id, ''));
  v_user_id uuid;
begin
  if lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> 'thugz.gerald13@gmail.com' then
    raise exception 'Developer access required';
  end if;
  if v_scope not in ('user', 'plan') then
    raise exception 'Scope must be user or plan';
  end if;
  if v_key = '' or v_feature = '' or length(v_feature) > 100 then
    raise exception 'Scope key and feature ID are required';
  end if;

  if v_scope = 'user' then
    begin
      v_user_id := v_key::uuid;
    exception when invalid_text_representation then
      raise exception 'User scope key must be a valid user ID';
    end;
    if not exists (select 1 from public.profiles where id = v_user_id) then
      raise exception 'Selected user was not found';
    end if;
    v_key := v_user_id::text;
  else
    v_key := lower(v_key);
  end if;

  if p_enabled is null then
    delete from public.app_feature_access_rules
    where scope_type = v_scope and scope_key = v_key and feature_id = v_feature;
  else
    insert into public.app_feature_access_rules
      (scope_type, scope_key, feature_id, enabled, updated_at, updated_by)
    values (v_scope, v_key, v_feature, p_enabled, now(), auth.uid())
    on conflict (scope_type, scope_key, feature_id) do update
      set enabled = excluded.enabled,
          updated_at = now(),
          updated_by = auth.uid();
  end if;
end;
$$;

revoke all on function public.get_my_feature_visibility() from public;
revoke all on function public.developer_get_feature_access_rules() from public;
revoke all on function public.developer_set_feature_access_rule(text, text, text, boolean) from public;
grant execute on function public.get_my_feature_visibility() to authenticated;
grant execute on function public.developer_get_feature_access_rules() to authenticated;
grant execute on function public.developer_set_feature_access_rule(text, text, text, boolean) to authenticated;
