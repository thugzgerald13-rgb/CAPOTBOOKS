-- =============================================================================
-- CAPOT subusers / team members migration
-- Run ONCE in Supabase: Project -> SQL Editor -> New query -> paste -> Run.
-- Idempotent: safe to re-run.
-- =============================================================================
create extension if not exists pgcrypto;

-- 1. Extend public.profiles (additive columns)
alter table public.profiles add column if not exists account_owner_id uuid references auth.users(id) on delete set null;
alter table public.profiles add column if not exists member_role text;
alter table public.profiles add column if not exists member_status text not null default 'active';

-- 2. account_members: owner <-> subuser links
create table if not exists public.account_members (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  member_role text not null default 'bookkeeper' check (member_role in ('accountant','bookkeeper','staff','viewer')),
  status text not null default 'active' check (status in ('invited','active','disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, user_id),
  unique (owner_id, email)
);
create index if not exists idx_account_members_owner on public.account_members(owner_id);
create index if not exists idx_account_members_user  on public.account_members(user_id);
drop trigger if exists trg_account_members_updated_at on public.account_members;
create trigger trg_account_members_updated_at before update on public.account_members for each row execute function public.set_updated_at();
alter table public.account_members enable row level security;
drop policy if exists account_members_owner_all on public.account_members;
create policy account_members_owner_all on public.account_members for all to authenticated using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists account_members_member_read on public.account_members;
create policy account_members_member_read on public.account_members for select to authenticated using (user_id = auth.uid());

-- 3. current_account_owner() resolver
create or replace function public.current_account_owner() returns uuid language sql security definer stable set search_path = public as $$
  select coalesce((select m.owner_id from public.account_members m where m.user_id = auth.uid() and m.status = 'active' limit 1), auth.uid());
$$;
revoke all on function public.current_account_owner() from public;
grant execute on function public.current_account_owner() to authenticated;

-- 4. Redefine is_client_owner -> all child-table / Storage RLS auto-shares data
create or replace function public.is_client_owner(p_client_id text) returns boolean language sql security definer stable set search_path = public as $$
  select exists (select 1 from public.clients c where c.id = p_client_id and c.user_id = public.current_account_owner());
$$;
revoke all on function public.is_client_owner(text) from public;
grant execute on function public.is_client_owner(text) to authenticated;

-- 5. public.clients RLS: subusers can read/update; only real owner can insert/delete
alter table public.clients enable row level security;
drop policy if exists clients_select_own on public.clients;
create policy clients_select_own on public.clients for select to authenticated using (user_id = public.current_account_owner());
drop policy if exists clients_insert_own on public.clients;
create policy clients_insert_own on public.clients for insert to authenticated with check (user_id = auth.uid() and not exists (select 1 from public.account_members m where m.user_id = auth.uid() and m.status = 'active'));
drop policy if exists clients_update_own on public.clients;
create policy clients_update_own on public.clients for update to authenticated using (user_id = public.current_account_owner()) with check (user_id = public.current_account_owner());
drop policy if exists clients_delete_own on public.clients;
create policy clients_delete_own on public.clients for delete to authenticated using (user_id = auth.uid() and not exists (select 1 from public.account_members m where m.user_id = auth.uid() and m.status = 'active'));
-- NOTE: Storage `client-files` policies already call is_client_owner() -> subusers inherit file access.

-- 6. Helpers + RPCs (security definer; anon key cannot touch auth.users)
create or replace function public._capot_temp_password() returns text language sql security definer set search_path = public as $$
  select translate(substr(encode(gen_random_bytes(9), 'base64'), 1, 12), '+/=', 'abc');
$$;
revoke all on function public._capot_temp_password() from public;
grant execute on function public._capot_temp_password() to authenticated;

create or replace function public.invite_subuser(p_email text, p_display_name text default null, p_member_role text default 'bookkeeper') returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid := auth.uid();
  v_existing uuid; v_user_id uuid; v_temp text; v_owner_role text;
  v_email text := lower(trim(p_email));
begin
  if v_owner is null then raise exception 'Not authenticated.'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then raise exception 'A valid email address is required.'; end if;
  if p_member_role not in ('accountant','bookkeeper','staff','viewer') then raise exception 'Invalid member role.'; end if;
  select id into v_existing from auth.users where lower(email) = v_email;
  if v_existing = v_owner then raise exception 'You cannot invite your own email.'; end if;
  if exists (select 1 from public.account_members where owner_id = v_owner and lower(email) = v_email) then raise exception 'That email is already a member of your account.'; end if;
  select user_role into v_owner_role from public.profiles where id = v_owner;
  if v_existing is not null then
    v_user_id := v_existing; v_temp := null;
  else
    v_temp := public._capot_temp_password();
    insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, encrypted_password, created_at, updated_at, invited_at, confirmation_token, recovery_token, email_change_token, raw_app_meta_data, raw_user_meta_data, is_super_admin)
    values ('00000000-0000-0000-0000-000000000000'::uuid, gen_random_uuid(), 'authenticated', 'authenticated', v_email, now(), crypt(v_temp, gen_salt('bf')), now(), now(), now(), '', '', '',
      jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
      jsonb_build_object('invited_by', v_owner, 'account_owner_id', v_owner, 'subuser', true), false)
    returning id into v_user_id;
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id)
    values (v_email, v_user_id, jsonb_build_object('sub', v_user_id::text, 'email', v_email, 'email_verified', true), 'email', null, now(), now(), v_user_id::text)
    on conflict (provider, provider_id) do nothing;
  end if;
  insert into public.account_members (owner_id, user_id, email, display_name, member_role, status)
  values (v_owner, v_user_id, v_email, p_display_name, p_member_role, case when v_temp is null then 'active' else 'invited' end)
  on conflict (owner_id, user_id) do update set member_role = excluded.member_role, status = 'active', display_name = coalesce(excluded.display_name, public.account_members.display_name), updated_at = now();
  insert into public.profiles (id, email, display_name, user_role, photo_url, last_login, account_owner_id, member_role, member_status, updated_at)
  values (v_user_id, v_email, p_display_name, coalesce(v_owner_role, 'owner'), null, null, v_owner, p_member_role, 'active', now())
  on conflict (id) do update set account_owner_id = v_owner, member_role = p_member_role, member_status = 'active', display_name = coalesce(excluded.display_name, public.profiles.display_name), updated_at = now();
  return jsonb_build_object('user_id', v_user_id, 'email', v_email, 'temporary_password', v_temp, 'existing_user', v_existing is not null);
end;
$$;
revoke all on function public.invite_subuser(text, text, text) from public;
grant execute on function public.invite_subuser(text, text, text) to authenticated;

create or replace function public.list_my_subusers() returns table (id uuid, user_id uuid, email text, display_name text, member_role text, status text, last_login timestamptz, created_at timestamptz) language sql security definer set search_path = public as $$
  select m.id, m.user_id, m.email, m.display_name, m.member_role, m.status, p.last_login, m.created_at
  from public.account_members m left join public.profiles p on p.id = m.user_id
  where m.owner_id = auth.uid() order by m.created_at desc;
$$;
revoke all on function public.list_my_subusers() from public;
grant execute on function public.list_my_subusers() to authenticated;

create or replace function public.update_subuser_role(p_user_id uuid, p_member_role text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_member_role not in ('accountant','bookkeeper','staff','viewer') then raise exception 'Invalid member role.'; end if;
  update public.account_members set member_role = p_member_role, updated_at = now() where owner_id = auth.uid() and user_id = p_user_id;
  if not found then raise exception 'Member not found.'; end if;
  update public.profiles set member_role = p_member_role, updated_at = now() where id = p_user_id;
end;
$$;
revoke all on function public.update_subuser_role(uuid, text) from public;
grant execute on function public.update_subuser_role(uuid, text) to authenticated;

create or replace function public.set_subuser_status(p_user_id uuid, p_status text) returns void language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('active','disabled') then raise exception 'Invalid status.'; end if;
  update public.account_members set status = p_status, updated_at = now() where owner_id = auth.uid() and user_id = p_user_id;
  if not found then raise exception 'Member not found.'; end if;
  update public.profiles set member_status = p_status, updated_at = now() where id = p_user_id;
end;
$$;
revoke all on function public.set_subuser_status(uuid, text) from public;
grant execute on function public.set_subuser_status(uuid, text) to authenticated;

create or replace function public.remove_subuser(p_user_id uuid) returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.account_members where owner_id = auth.uid() and user_id = p_user_id;
  if not found then raise exception 'Member not found.'; end if;
  update public.profiles set account_owner_id = null, member_role = null, member_status = 'active', updated_at = now() where id = p_user_id;
end;
$$;
revoke all on function public.remove_subuser(uuid) from public;
grant execute on function public.remove_subuser(uuid) to authenticated;

create or replace function public.reset_subuser_password(p_user_id uuid) returns text language plpgsql security definer set search_path = public as $$
declare v_temp text;
begin
  if not exists (select 1 from public.account_members where owner_id = auth.uid() and user_id = p_user_id) then raise exception 'Member not found.'; end if;
  v_temp := public._capot_temp_password();
  update auth.users set encrypted_password = crypt(v_temp, gen_salt('bf')), updated_at = now(), recovery_token = '' where id = p_user_id;
  return v_temp;
end;
$$;
revoke all on function public.reset_subuser_password(uuid) from public;
grant execute on function public.reset_subuser_password(uuid) to authenticated;

create or replace function public.get_my_account_membership() returns jsonb language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select m.owner_id, ou.email as owner_email, m.member_role, m.status into r
  from public.account_members m left join auth.users ou on ou.id = m.owner_id
  where m.user_id = auth.uid() and m.status = 'active' limit 1;
  if not found then return jsonb_build_object('is_subuser', false); end if;
  return jsonb_build_object('is_subuser', true, 'owner_id', r.owner_id, 'owner_email', r.owner_email, 'member_role', r.member_role, 'status', r.status);
end;
$$;
revoke all on function public.get_my_account_membership() from public;
grant execute on function public.get_my_account_membership() to authenticated;
-- Done. Verify: select public.current_account_owner(); select * from public.get_my_account_membership();
