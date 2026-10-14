-- ============================================================================
-- CAPOT TEAM INVITATIONS / ACCOUNT LINKING
--
-- Fixes the "new account is not connected to the inviter" flow.
--
-- Before this migration the browser could invoke create-staff-user, which
-- created a fresh auth user for an email that did not already exist. That
-- makes the new login look like an unrelated CAPOT workspace.
--
-- This migration implements an independent invitation flow:
--   1. Owner creates a pending invitation for an email. No auth user is made.
--   2. Invitee signs in or signs up using that exact email.
--   3. On the first authenticated sync, claim_team_invitation() creates the
--      owner -> member link and approves the invited profile.
--   4. client RLS resolves the member back to the real client owner, so the
--      invitee sees and edits the inviter's books instead of a new workspace.
--
-- The legacy account_membership/business_accounts model is also read by the
-- compatibility RPCs so existing managed subusers are not lost.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Independent account links
-- ---------------------------------------------------------------------------

create table if not exists public.account_team_links (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  member_email text not null,
  display_name text,
  member_role text not null default 'staff',
  member_kind text not null default 'independent',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(member_user_id),
  constraint account_team_links_role_check
    check (member_role in ('accountant', 'bookkeeper', 'staff', 'viewer')),
  constraint account_team_links_kind_check
    check (member_kind in ('managed', 'independent')),
  constraint account_team_links_status_check
    check (status in ('active', 'disabled')),
  constraint account_team_links_not_self
    check (owner_user_id <> member_user_id)
);

create index if not exists idx_account_team_links_owner
  on public.account_team_links(owner_user_id);

create index if not exists idx_account_team_links_member
  on public.account_team_links(member_user_id);

alter table public.account_team_links enable row level security;
revoke all on table public.account_team_links from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Pending invitations. This table deliberately contains no auth.users row.
-- ---------------------------------------------------------------------------

create table if not exists public.team_account_invitations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text,
  member_role text not null default 'staff',
  status text not null default 'pending',
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_user_id uuid references auth.users(id) on delete set null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint team_account_invitations_role_check
    check (member_role in ('accountant', 'bookkeeper', 'staff', 'viewer')),
  constraint team_account_invitations_status_check
    check (status in ('pending', 'accepted', 'revoked')),
  constraint team_account_invitations_email_check
    check (length(trim(email)) > 3)
);

create unique index if not exists uq_team_account_invitations_pending
  on public.team_account_invitations(owner_user_id, lower(trim(email)))
  where status = 'pending';

create index if not exists idx_team_account_invitations_email
  on public.team_account_invitations(lower(trim(email)), status, expires_at);

alter table public.team_account_invitations enable row level security;
revoke all on table public.team_account_invitations from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Send invitation. The inviter must own at least one CAPOT client.
-- ---------------------------------------------------------------------------

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
  v_invite_id uuid;
begin
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  if not exists (
    select 1 from public.clients c where c.user_id = v_owner_id
  ) then
    raise exception 'Only an account owner with at least one client can invite users';
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid invitation email is required';
  end if;

  if v_email = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'You cannot invite your own email address';
  end if;

  if v_role not in ('accountant', 'bookkeeper', 'staff', 'viewer') then
    raise exception 'Invalid team role';
  end if;

  if exists (
    select 1
    from public.account_team_links l
    where l.owner_user_id = v_owner_id
      and lower(l.member_email) = v_email
      and l.status = 'active'
  ) then
    raise exception 'This email is already a member of your account';
  end if;

  insert into public.team_account_invitations (
    owner_user_id, email, display_name, member_role, status,
    expires_at, updated_at
  )
  values (
    v_owner_id, v_email, v_name, v_role, 'pending',
    now() + interval '7 days', now()
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

-- ---------------------------------------------------------------------------
-- Claim pending invitation on authenticated login/signup.
-- ---------------------------------------------------------------------------

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

  -- A user can belong to one account at a time. Existing membership wins over
  -- a second pending invitation.
  select exists (
    select 1
    from public.account_team_links l
    where l.member_user_id = v_user_id
  ) into v_active_member;

  if v_active_member then
    return null;
  end if;

  select *
    into v_invite
  from public.team_account_invitations i
  where lower(trim(i.email)) = v_email
    and i.status = 'pending'
    and i.expires_at > now()
  order by i.created_at desc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  -- Protect against an account-owner invitation being claimed by another
  -- user who happens to have a stale/duplicate email record.
  select lower(au.email)
    into v_owner_email
  from auth.users au
  where au.id = v_invite.owner_user_id;

  if v_email = lower(coalesce(v_owner_email, '')) then
    raise exception 'Invalid invitation target';
  end if;

  insert into public.account_team_links (
    owner_user_id,
    member_user_id,
    member_email,
    display_name,
    member_role,
    member_kind,
    status,
    updated_at
  )
  values (
    v_invite.owner_user_id,
    v_user_id,
    v_email,
    v_invite.display_name,
    v_invite.member_role,
    'independent',
    'active',
    now()
  );

  update public.team_account_invitations
  set status = 'accepted',
      accepted_user_id = v_user_id,
      accepted_at = now(),
      updated_at = now()
  where id = v_invite.id;

  -- Invitation is proof that the account owner approved access. Set the
  -- profile role/approval after authentication so the global approval gate
  -- does not treat this invited team member as an unrelated new user.
  update public.profiles
  set
    user_role = v_invite.member_role,
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

-- ---------------------------------------------------------------------------
-- Resolve current account membership.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_account_membership()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_link record;
  v_legacy record;
  v_owner_email text;
begin
  select l.*
    into v_link
  from public.account_team_links l
  where l.member_user_id = auth.uid()
  order by l.created_at desc
  limit 1;

  if found then
    select lower(au.email) into v_owner_email
    from auth.users au
    where au.id = v_link.owner_user_id;

    return jsonb_build_object(
      'is_subuser', true,
      'owner_id', v_link.owner_user_id,
      'owner_email', v_owner_email,
      'member_role', v_link.member_role,
      'status', v_link.status,
      'member_kind', v_link.member_kind
    );
  end if;

  -- Backward-compatible lookup for the original account_membership schema.
  begin
    select
      ba.owner_id,
      lower(au.email) as owner_email,
      am.role,
      case when am.is_active then 'active' else 'disabled' end as status
    into v_legacy
    from public.account_membership am
    join public.business_accounts ba on ba.id = am.account_id
    left join auth.users au on au.id = ba.owner_id
    where am.user_id = auth.uid()
      and ba.owner_id <> auth.uid()
    order by am.created_at desc
    limit 1;

    if found then
      return jsonb_build_object(
        'is_subuser', true,
        'owner_id', v_legacy.owner_id,
        'owner_email', v_legacy.owner_email,
        'member_role', case
          when lower(v_legacy.role) in ('accountant','bookkeeper','staff','viewer') then lower(v_legacy.role)
          else 'staff'
        end,
        'status', v_legacy.status,
        'member_kind', 'managed'
      );
    end if;
  exception
    when undefined_table then
      null;
  end;

  return jsonb_build_object('is_subuser', false);
end;
$$;

revoke all on function public.get_my_account_membership() from public;
grant execute on function public.get_my_account_membership() to authenticated;

-- ---------------------------------------------------------------------------
-- List members visible to the owner.
-- ---------------------------------------------------------------------------
-- Older migrations defined list_my_subusers() with different OUT columns.
-- PostgreSQL cannot replace a function when its TABLE return type changes, so
-- drop this exact zero-argument signature before creating the current version.
-- Do not use CASCADE; if a database object depends on this function, resolve
-- that dependency explicitly rather than removing unrelated objects.

drop function if exists public.list_my_subusers();

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
    lower(au.email),
    coalesce(l.display_name, p.display_name, au.raw_user_meta_data->>'full_name'),
    l.member_role,
    l.status,
    p.last_login,
    l.created_at,
    l.member_kind
  from public.account_team_links l
  join auth.users au on au.id = l.member_user_id
  left join public.profiles p on p.id = l.member_user_id
  where l.owner_user_id = auth.uid();

  -- Preserve legacy managed subusers created by the original migration.
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

-- ---------------------------------------------------------------------------
-- Member administration RPCs (independent + legacy managed).
-- ---------------------------------------------------------------------------

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
begin
  if v_role not in ('accountant', 'bookkeeper', 'staff', 'viewer') then
    raise exception 'Invalid team role';
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

create or replace function public.set_subuser_status(
  p_user_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_status text := lower(trim(coalesce(p_status, '')));
begin
  if v_status not in ('active', 'disabled') then
    raise exception 'Invalid team member status';
  end if;

  update public.account_team_links
  set status = v_status, updated_at = now()
  where owner_user_id = auth.uid()
    and member_user_id = p_user_id;

  if found then
    return;
  end if;

  update public.account_membership am
  set is_active = (v_status = 'active'), last_active_at = now()
  from public.business_accounts ba
  where am.account_id = ba.id
    and ba.owner_id = auth.uid()
    and am.user_id = p_user_id;

  if not found then
    raise exception 'Team member not found';
  end if;
end;
$$;

create or replace function public.remove_subuser(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.account_team_links
  where owner_user_id = auth.uid()
    and member_user_id = p_user_id;

  if found then
    return;
  end if;

  delete from public.account_membership am
  using public.business_accounts ba
  where am.account_id = ba.id
    and ba.owner_id = auth.uid()
    and am.user_id = p_user_id;

  if not found then
    raise exception 'Team member not found';
  end if;
end;
$$;

revoke all on function public.update_subuser_role(uuid, text) from public;
revoke all on function public.set_subuser_status(uuid, text) from public;
revoke all on function public.remove_subuser(uuid) from public;
grant execute on function public.update_subuser_role(uuid, text) to authenticated;
grant execute on function public.set_subuser_status(uuid, text) to authenticated;
grant execute on function public.remove_subuser(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Permission RPC. Keep this aligned with src/lib/teamPermissions.tsx.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_account_permissions()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_link record;
  v_role text;
begin
  select l.member_role, l.status
    into v_link
  from public.account_team_links l
  where l.member_user_id = auth.uid()
  limit 1;

  if found then
    if v_link.status <> 'active' then
      return jsonb_build_object(
        'manage_users', false,
        'edit_transactions', false,
        'delete_transactions', false,
        'approve_journal', false,
        'view_reports', false,
        'manage_settings', false,
        'export_data', false,
        'lock_period', false
      );
    end if;
    v_role := lower(v_link.member_role);
  else
    begin
      select lower(am.role)
        into v_role
      from public.account_membership am
      join public.business_accounts ba on ba.id = am.account_id
      where ba.owner_id <> auth.uid()
        and am.user_id = auth.uid()
        and am.is_active = true
      limit 1;
    exception
      when undefined_table then
        v_role := null;
    end;
  end if;

  if v_role is null then
    return jsonb_build_object(
      'manage_users', true,
      'edit_transactions', true,
      'delete_transactions', true,
      'approve_journal', true,
      'view_reports', true,
      'manage_settings', true,
      'export_data', true,
      'lock_period', true
    );
  end if;

  return case v_role
    when 'accountant' then jsonb_build_object(
      'manage_users', false,
      'edit_transactions', true,
      'delete_transactions', true,
      'approve_journal', true,
      'view_reports', true,
      'manage_settings', false,
      'export_data', true,
      'lock_period', true
    )
    when 'bookkeeper' then jsonb_build_object(
      'manage_users', false,
      'edit_transactions', true,
      'delete_transactions', false,
      'approve_journal', false,
      'view_reports', true,
      'manage_settings', false,
      'export_data', true,
      'lock_period', false
    )
    when 'viewer' then jsonb_build_object(
      'manage_users', false,
      'edit_transactions', false,
      'delete_transactions', false,
      'approve_journal', false,
      'view_reports', true,
      'manage_settings', false,
      'export_data', true,
      'lock_period', false
    )
    else jsonb_build_object(
      'manage_users', false,
      'edit_transactions', true,
      'delete_transactions', false,
      'approve_journal', false,
      'view_reports', true,
      'manage_settings', false,
      'export_data', false,
      'lock_period', false
    )
  end;
end;
$$;

revoke all on function public.get_my_account_permissions() from public;
grant execute on function public.get_my_account_permissions() to authenticated;

-- ---------------------------------------------------------------------------
-- Tenant RLS: team members can read/write child data for the real owner, but
-- only the real owner can create/update/delete the client root itself.
-- ---------------------------------------------------------------------------

create or replace function public.is_client_owner(p_client_id text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.clients c
    where c.id = p_client_id
      and (
        c.user_id = auth.uid()
        or exists (
          select 1
          from public.account_team_links l
          where l.owner_user_id = c.user_id
            and l.member_user_id = auth.uid()
            and l.status = 'active'
        )
        or exists (
          select 1
          from public.account_membership am
          join public.business_accounts ba on ba.id = am.account_id
          where ba.owner_id = c.user_id
            and am.user_id = auth.uid()
            and am.is_active = true
        )
      )
  );
$$;

revoke all on function public.is_client_owner(text) from public;
grant execute on function public.is_client_owner(text) to authenticated;

-- SELECT: owners and active team members see the owner's clients.
drop policy if exists clients_select_own on public.clients;
create policy clients_select_own
on public.clients for select
to authenticated
using (
  user_id = auth.uid()
  or public.is_client_owner(id)
);

-- INSERT / UPDATE / DELETE intentionally remain owner-only.
drop policy if exists clients_insert_own on public.clients;
create policy clients_insert_own
on public.clients for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists clients_update_own on public.clients;
create policy clients_update_own
on public.clients for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists clients_delete_own on public.clients;
create policy clients_delete_own
on public.clients for delete
to authenticated
using (user_id = auth.uid());

-- Verification helpers (run manually if desired):
-- select public.send_team_invitation('user@example.com', 'Invitee', 'bookkeeper');
-- select public.claim_team_invitation();
-- select public.get_my_account_membership();
-- select * from public.list_my_subusers();
-- select public.get_my_account_permissions();
