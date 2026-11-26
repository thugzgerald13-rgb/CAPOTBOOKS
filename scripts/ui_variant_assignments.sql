-- Per-user / per-plan UI variant assignments ("swap the universal page, button
-- or feature with a customized one"). Run in Supabase SQL Editor. Safe to re-run.
-- Requires scripts/modules_entitlements.sql (public.entitlement_owner).
--
-- This table stores ONLY ids ("slot" -> "variant"). The customized UI itself is
-- code that ships in the app bundle (src/custom/registry.ts), so an assignment
-- can never load arbitrary code: an unknown variant id simply falls back to the
-- universal UI.
--
-- Resolution order for the signed-in user (first match wins):
--   1. assignment for the user's own account             (scope_type = 'user')
--   2. assignment for the account OWNER (team members inherit their owner's UI)
--   3. assignment for the owner's subscription plan       (scope_type = 'plan')
--   4. nothing -> the universal UI

create table if not exists public.app_ui_variant_assignments (
  id uuid primary key default gen_random_uuid(),
  scope_type text not null check (scope_type in ('user', 'plan')),
  scope_key text not null,
  slot_id text not null,
  variant_id text not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint app_ui_variant_assignments_unique unique (scope_type, scope_key, slot_id),
  constraint app_ui_variant_assignments_scope_key_nonempty check (length(trim(scope_key)) > 0),
  constraint app_ui_variant_assignments_slot_nonempty check (length(trim(slot_id)) > 0 and length(slot_id) <= 100),
  constraint app_ui_variant_assignments_variant_nonempty check (length(trim(variant_id)) > 0 and length(variant_id) <= 100)
);

create index if not exists idx_app_ui_variant_assignments_lookup
  on public.app_ui_variant_assignments (scope_type, scope_key, slot_id);

-- No direct table access from the client; everything goes through the RPCs below.
alter table public.app_ui_variant_assignments enable row level security;
drop policy if exists app_ui_variant_assignments_no_direct_access on public.app_ui_variant_assignments;
create policy app_ui_variant_assignments_no_direct_access
  on public.app_ui_variant_assignments for all to authenticated
  using (false) with check (false);

-- Effective { "<slot_id>": "<variant_id>" } map for auth.uid().
create or replace function public.get_my_ui_variants()
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
  v_result jsonb := '{}'::jsonb;
  v_rule record;
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

  -- Lowest precedence first; later loops overwrite earlier ones.
  for v_rule in
    select slot_id, variant_id
    from public.app_ui_variant_assignments
    where scope_type = 'plan' and scope_key = v_plan
  loop
    v_result := jsonb_set(v_result, array[v_rule.slot_id], to_jsonb(v_rule.variant_id), true);
  end loop;

  if v_owner <> v_uid then
    for v_rule in
      select slot_id, variant_id
      from public.app_ui_variant_assignments
      where scope_type = 'user' and scope_key = v_owner::text
    loop
      v_result := jsonb_set(v_result, array[v_rule.slot_id], to_jsonb(v_rule.variant_id), true);
    end loop;
  end if;

  for v_rule in
    select slot_id, variant_id
    from public.app_ui_variant_assignments
    where scope_type = 'user' and scope_key = v_uid::text
  loop
    v_result := jsonb_set(v_result, array[v_rule.slot_id], to_jsonb(v_rule.variant_id), true);
  end loop;

  return v_result;
end;
$$;

-- Developer-only: list every assignment (used by Developer System Config).
create or replace function public.developer_get_ui_variant_assignments()
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
      'slot_id', slot_id,
      'variant_id', variant_id
    ) order by scope_type, scope_key, slot_id)
    from public.app_ui_variant_assignments
  ), '[]'::jsonb);
end;
$$;

-- Developer-only: assign a variant (p_variant_id) or remove the assignment
-- (p_variant_id is null -> that scope goes back to the universal UI / inherits).
create or replace function public.developer_set_ui_variant_assignment(
  p_scope_type text,
  p_scope_key text,
  p_slot_id text,
  p_variant_id text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scope text := lower(trim(coalesce(p_scope_type, '')));
  v_key text := trim(coalesce(p_scope_key, ''));
  v_slot text := trim(coalesce(p_slot_id, ''));
  v_variant text := nullif(trim(coalesce(p_variant_id, '')), '');
  v_user_id uuid;
begin
  if lower(trim(coalesce(auth.jwt() ->> 'email', ''))) <> 'thugz.gerald13@gmail.com' then
    raise exception 'Developer access required';
  end if;
  if v_scope not in ('user', 'plan') then
    raise exception 'Scope must be user or plan';
  end if;
  if v_key = '' or v_slot = '' or length(v_slot) > 100 or length(coalesce(v_variant, '')) > 100 then
    raise exception 'Scope key, slot ID and (optional) variant ID are required and must be <= 100 chars';
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

  if v_variant is null then
    delete from public.app_ui_variant_assignments
    where scope_type = v_scope and scope_key = v_key and slot_id = v_slot;
  else
    insert into public.app_ui_variant_assignments
      (scope_type, scope_key, slot_id, variant_id, updated_at, updated_by)
    values (v_scope, v_key, v_slot, v_variant, now(), auth.uid())
    on conflict (scope_type, scope_key, slot_id) do update
      set variant_id = excluded.variant_id,
          updated_at = now(),
          updated_by = auth.uid();
  end if;
end;
$$;

revoke all on function public.get_my_ui_variants() from public;
revoke all on function public.developer_get_ui_variant_assignments() from public;
revoke all on function public.developer_set_ui_variant_assignment(text, text, text, text) from public;
grant execute on function public.get_my_ui_variants() to authenticated;
grant execute on function public.developer_get_ui_variant_assignments() to authenticated;
grant execute on function public.developer_set_ui_variant_assignment(text, text, text, text) to authenticated;
