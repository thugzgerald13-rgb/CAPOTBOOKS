-- ============================================================================
-- CAPOT MANAGED STAFF LOGIN
--
-- Staff are NOT independent CAPOT webapp accounts.
-- The inviter owns the staff credential, membership and workspace.
-- A hidden Supabase auth identity is used only as the technical login/session
-- identity; it is never treated as a standalone CAPOT business/account owner.
--
-- Apply AFTER:
--   1. scripts/subusers_migration.sql
--   2. scripts/subusers_invites_migration.sql
--   3. scripts/client_specific_permissions.sql
-- ============================================================================

create table if not exists public.account_managed_staff_credentials (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  login_name text not null,
  display_name text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_managed_staff_login_name_check
    check (login_name = lower(trim(login_name)) and login_name ~ '^[a-z0-9._-]{3,32}$'),
  constraint account_managed_staff_not_self
    check (owner_user_id <> auth_user_id)
);

create unique index if not exists uq_account_managed_staff_login_name
  on public.account_managed_staff_credentials(lower(trim(login_name)));

create index if not exists idx_account_managed_staff_owner
  on public.account_managed_staff_credentials(owner_user_id, is_active);

alter table public.account_managed_staff_credentials enable row level security;
revoke all on table public.account_managed_staff_credentials from public, anon, authenticated;

drop trigger if exists trg_account_managed_staff_credentials_updated_at
  on public.account_managed_staff_credentials;
create trigger trg_account_managed_staff_credentials_updated_at
before update on public.account_managed_staff_credentials
for each row execute function public.set_updated_at();

-- Login lookup is intentionally limited to resolving an active managed login
-- into its hidden technical auth email. It does not expose owner/client data.
create or replace function public.resolve_managed_staff_login(
  p_login_name text
)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select lower(au.email)
  from public.account_managed_staff_credentials s
  join public.account_team_links l
    on l.owner_user_id = s.owner_user_id
   and l.member_user_id = s.auth_user_id
   and l.member_kind = 'managed'
   and l.member_role in ('staff', 'viewer')
   and l.status = 'active'
  join auth.users au on au.id = s.auth_user_id
  where s.is_active = true
    and lower(trim(s.login_name)) = lower(trim(coalesce(p_login_name, '')))
  limit 1;
$$;

revoke all on function public.resolve_managed_staff_login(text) from public;
grant execute on function public.resolve_managed_staff_login(text) to anon, authenticated;

-- Existing pending staff invitations came from the older independent-account
-- flow. They must not create standalone staff accounts anymore.
update public.team_account_invitations
set status = 'revoked', updated_at = now()
where status = 'pending'
  and lower(member_role) = 'staff';

-- Staff are created by the managed-staff Edge Function, not by the generic
-- independent invitation RPC. Professional roles retain their existing flow.
create or replace function public.send_team_invitation(
  p_email text,
  p_display_name text default null,
  p_member_role text default 'staff'
)
returns table (
  invitation_id uuid,
  email text,
  display_name text,
  member_role text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(p_email, '')));
  v_name text := nullif(trim(coalesce(p_display_name, '')), '');
  v_role text := lower(trim(coalesce(p_member_role, 'staff')));
  v_inviter_role text;
  v_invite_id uuid;
begin
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  select lower(p.user_role) into v_inviter_role
  from public.profiles p
  where p.id = v_owner_id;

  if v_inviter_role not in ('owner', 'accountant', 'bookkeeper') then
    raise exception 'Only a Business Owner, Accountant, or Bookkeeper can invite team members';
  end if;

  if v_role = 'staff' then
    raise exception 'Staff use managed credentials created under the inviting account';
  end if;

  if not exists (select 1 from public.clients c where c.user_id = v_owner_id) then
    raise exception 'Only an account holder with at least one client can invite team members';
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid invitation email is required';
  end if;

  if v_email = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'You cannot invite your own email address';
  end if;

  if v_role not in ('accountant', 'bookkeeper', 'viewer') then
    raise exception 'Invalid team role';
  end if;

  if v_inviter_role = 'owner' and v_role not in ('accountant', 'bookkeeper') then
    raise exception 'Business Owners can invite only Accountant or Bookkeeper accounts';
  end if;

  if v_role in ('accountant', 'bookkeeper')
     and not exists (select 1 from auth.users au where lower(au.email) = v_email) then
    raise exception 'The invited Accountant or Bookkeeper must already have a CAPOT webapp account';
  end if;

  if exists (
    select 1 from public.account_team_links l
    where l.owner_user_id = v_owner_id
      and lower(l.member_email) = v_email
      and l.status = 'active'
  ) then
    raise exception 'This email is already a member of your account';
  end if;

  insert into public.team_account_invitations (
    owner_user_id, email, display_name, member_role, status, expires_at, updated_at
  )
  values (
    v_owner_id, v_email, v_name, v_role, 'pending', now() + interval '7 days', now()
  )
  on conflict (owner_user_id, (lower(trim(email)))) where status = 'pending'
  do update set
    display_name = excluded.display_name,
    member_role = excluded.member_role,
    expires_at = now() + interval '7 days',
    updated_at = now()
  returning id into v_invite_id;

  return query
  select i.id, i.email, i.display_name, i.member_role, i.expires_at
  from public.team_account_invitations i
  where i.id = v_invite_id;
end;
$$;

revoke all on function public.send_team_invitation(text, text, text) from public;
grant execute on function public.send_team_invitation(text, text, text) to authenticated;

-- Make the member list show the managed staff login instead of its hidden
-- technical auth email. Existing independent professional accounts continue
-- to show their real email address.
create or replace function public.list_my_subusers()
returns table (
  id uuid,
  user_id uuid,
  email text,
  display_name text,
  member_role text,
  status text,
  last_login timestamptz,
  created_at timestamptz,
  member_kind text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  return query
  select
    l.id,
    l.member_user_id,
    coalesce(ms.login_name, lower(au.email)),
    coalesce(l.display_name, p.display_name, au.raw_user_meta_data->>'full_name'),
    l.member_role,
    l.status,
    p.last_login,
    l.created_at,
    l.member_kind
  from public.account_team_links l
  join auth.users au on au.id = l.member_user_id
  left join public.profiles p on p.id = l.member_user_id
  left join public.account_managed_staff_credentials ms
    on ms.owner_user_id = l.owner_user_id
   and ms.auth_user_id = l.member_user_id
  where l.owner_user_id = auth.uid();

  begin
    return query
    select
      am.id,
      am.user_id,
      lower(au.email),
      coalesce(am.full_name, p.display_name, au.raw_user_meta_data->>'full_name'),
      case
        when lower(am.role) in ('accountant','bookkeeper','staff','viewer') then lower(am.role)
        else 'staff'
      end,
      case when am.is_active then 'active' else 'disabled' end,
      p.last_login,
      am.created_at,
      'managed'
    from public.account_membership am
    join public.business_accounts ba on ba.id = am.account_id
    join auth.users au on au.id = am.user_id
    left join public.profiles p on p.id = am.user_id
    where ba.owner_id = auth.uid()
      and am.user_id <> auth.uid();
  exception
    when undefined_table then
      null;
  end;
end;
$$;

revoke all on function public.list_my_subusers() from public;
grant execute on function public.list_my_subusers() to authenticated;

-- Managed staff cannot be promoted into a separate professional account role.
create or replace function public.update_subuser_role(
  p_user_id uuid,
  p_member_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := lower(trim(coalesce(p_member_role, '')));
  v_kind text;
begin
  if v_role not in ('accountant', 'bookkeeper', 'staff', 'viewer') then
    raise exception 'Invalid team role';
  end if;

  select l.member_kind into v_kind
  from public.account_team_links l
  where l.owner_user_id = auth.uid()
    and l.member_user_id = p_user_id
  limit 1;

  if v_kind = 'managed' and v_role <> 'staff' then
    raise exception 'Managed staff credentials use the Staff role only';
  end if;

  update public.account_team_links
  set member_role = v_role, updated_at = now()
  where owner_user_id = auth.uid()
    and member_user_id = p_user_id;

  if found then
    return;
  end if;

  update public.account_membership am
  set role = v_role
  from public.business_accounts ba
  where am.account_id = ba.id
    and ba.owner_id = auth.uid()
    and am.user_id = p_user_id;

  if not found then
    raise exception 'Team member not found';
  end if;
end;
$$;

revoke all on function public.update_subuser_role(uuid, text) from public;
grant execute on function public.update_subuser_role(uuid, text) to authenticated;

-- Staff invitations must never be claimed as independent Auth accounts.
create or replace function public.claim_team_invitation()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  v_invite public.team_account_invitations%rowtype;
  v_owner_email text;
  v_active_member boolean;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_email = '' then
    return null;
  end if;

  select exists (
    select 1 from public.account_team_links l where l.member_user_id = v_user_id
  ) into v_active_member;

  if v_active_member then
    return null;
  end if;

  select * into v_invite
  from public.team_account_invitations i
  where lower(trim(i.email)) = v_email
    and i.status = 'pending'
    and i.expires_at > now()
    and lower(i.member_role) <> 'staff'
  order by i.created_at desc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  select lower(au.email) into v_owner_email
  from auth.users au where au.id = v_invite.owner_user_id;

  if v_email = lower(coalesce(v_owner_email, '')) then
    raise exception 'Invalid invitation target';
  end if;

  insert into public.account_team_links (
    owner_user_id, member_user_id, member_email, display_name,
    member_role, member_kind, status, updated_at
  )
  values (
    v_invite.owner_user_id, v_user_id, v_email, v_invite.display_name,
    v_invite.member_role, 'independent', 'active', now()
  );

  update public.team_account_invitations
  set status = 'accepted', accepted_user_id = v_user_id,
      accepted_at = now(), updated_at = now()
  where id = v_invite.id;

  update public.profiles
  set user_role = v_invite.member_role,
      display_name = coalesce(nullif(display_name, ''), v_invite.display_name),
      approved = true,
      approved_at = coalesce(approved_at, now()),
      updated_at = now()
  where id = v_user_id;

  return jsonb_build_object(
    'is_subuser', true,
    'owner_id', v_invite.owner_user_id,
    'owner_email', v_owner_email,
    'member_role', v_invite.member_role,
    'status', 'active',
    'member_kind', 'independent',
    'invitation_id', v_invite.id
  );
end;
$$;

revoke all on function public.claim_team_invitation() from public;
grant execute on function public.claim_team_invitation() to authenticated;
