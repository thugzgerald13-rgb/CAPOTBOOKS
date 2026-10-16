-- ============================================================================
-- CAPOT FIX: KEEP BUSINESS OWNERS' ACCOUNTANTS OUT OF THE SUBUSER FLOW
--
-- RUN THIS AFTER the existing invitation/permission migrations, especially:
--   scripts/client_specific_permissions.sql
--   scripts/invite_role_ownership_client_sync.sql
--   scripts/owner_invitation_requires_existing_account.sql
--   scripts/invite_selected_permissions_migration.sql
--   scripts/managed_staff_login_migration.sql
--   scripts/fix_invited_accountant_team_list.sql
--
-- Root issue: later invitation migrations replaced the role-aware sender and
-- claim functions. As a result, Business Owner -> Accountant invitations were
-- stored as team_member and claimed through account_team_links. That causes an
-- independent accountant login to be treated as a subuser and can hide their
-- own client directory. This migration restores owner_to_accountant routing.
--
-- Existing accepted owner -> accountant/bookkeeper invitations are repaired:
--   * invitation mode is corrected to owner_to_accountant;
--   * only the matching owner/accountant account-team link is removed;
--   * the owner is synchronized as a client, reusing an existing client by TIN,
--     email, or name where possible;
--   * other clients and their records are not deleted.
-- ============================================================================

begin;

create extension if not exists pgcrypto;

alter table public.team_account_invitations
  add column if not exists invite_mode text not null default 'team_member';

alter table public.team_account_invitations
  add column if not exists selected_permissions jsonb not null default '{}'::jsonb;

-- Correct pending rows created by versions that did not set invite_mode.
update public.team_account_invitations ti
set invite_mode = 'owner_to_accountant', updated_at = now()
from public.profiles inviter
where inviter.id = ti.owner_user_id
  and lower(coalesce(inviter.user_role, '')) = 'owner'
  and lower(coalesce(ti.member_role, '')) in ('accountant', 'bookkeeper')
  and ti.status = 'pending';

-- The 3-argument overload shadows the default-argument 4-argument function in
-- some PostgREST/function-resolution combinations, so retain one canonical RPC.
drop function if exists public.send_team_invitation(text, text, text);

create or replace function public.send_team_invitation(
  p_email text,
  p_display_name text default null,
  p_member_role text default 'staff',
  p_permissions jsonb default '{}'::jsonb
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
  v_target_user_id uuid;
  v_target_role text;
  v_invite_mode text;
  v_safe_permissions jsonb := '{}'::jsonb;
  v_invite_id uuid;
  v_requested_permissions jsonb := coalesce(p_permissions, '{}'::jsonb);
begin
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  select lower(coalesce(p.user_role, ''))
    into v_inviter_role
  from public.profiles p
  where p.id = v_owner_id;

  if coalesce(v_inviter_role, '') not in ('owner', 'accountant', 'bookkeeper') then
    raise exception 'Only a Business Owner, Accountant, or Bookkeeper can send invitations';
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid invitation email is required';
  end if;
  if v_email = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'You cannot invite your own email address';
  end if;
  if jsonb_typeof(v_requested_permissions) <> 'object' then
    raise exception 'Permissions must be a JSON object';
  end if;

  if v_inviter_role = 'owner' then
    if v_role not in ('accountant', 'bookkeeper') then
      raise exception 'Business Owners can invite only Accountant or Bookkeeper accounts';
    end if;
    v_invite_mode := 'owner_to_accountant';

    -- A professional must already have an independent CAPOT account.
    select au.id, lower(coalesce(p.user_role, ''))
      into v_target_user_id, v_target_role
    from auth.users au
    left join public.profiles p on p.id = au.id
    where lower(au.email) = v_email
    limit 1;

    if v_target_user_id is null then
      raise exception 'The Accountant/Bookkeeper must already have their own CAPOT account';
    end if;
    if coalesce(v_target_role, '') not in ('accountant', 'bookkeeper') then
      raise exception 'The existing account is not an Accountant or Bookkeeper account';
    end if;
    if coalesce(v_target_role, '') <> v_role then
      raise exception 'The selected role must match the existing Accountant/Bookkeeper account role';
    end if;
    if exists (
      select 1 from public.accountant_client_links acl
      where acl.business_owner_user_id = v_owner_id
        and acl.accountant_user_id = v_target_user_id
    ) then
      raise exception 'This Accountant/Bookkeeper is already linked to your business';
    end if;
    if exists (
      select 1 from public.account_team_links l
      where l.member_user_id = v_target_user_id
    ) then
      raise exception 'That account is already linked to a team. Remove that team link before inviting it as a business client';
    end if;
  else
    v_invite_mode := 'team_member';
    if v_role not in ('accountant', 'bookkeeper', 'staff', 'viewer') then
      raise exception 'Invalid team role';
    end if;
    if not exists (select 1 from public.clients c where c.user_id = v_owner_id) then
      raise exception 'Only an account with at least one client can invite team members';
    end if;
    select lower(coalesce(p.user_role, ''))
      into v_target_role
    from auth.users au
    left join public.profiles p on p.id = au.id
    where lower(au.email) = v_email
    limit 1;
    if coalesce(v_target_role, '') = 'owner' then
      raise exception 'A Business Owner account cannot be invited as a team member';
    end if;
    if exists (
      select 1 from public.account_team_links l
      where l.owner_user_id = v_owner_id
        and lower(l.member_email) = v_email
        and l.status = 'active'
    ) then
      raise exception 'This email is already a member of your account';
    end if;
  end if;

  -- Intersect the requested set with the role cap on the server.
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb)
    into v_safe_permissions
  from jsonb_object_keys(v_requested_permissions) as requested(k)
  where jsonb_typeof(v_requested_permissions -> k) = 'boolean'
    and (v_requested_permissions ->> k) = 'true'
    and public.team_role_allows_permission(v_role, k);

  -- Update the existing pending invitation or insert a new one. Explicit table
  -- aliases avoid the OUT parameter `email` ambiguity from ON CONFLICT clauses.
  update public.team_account_invitations as ti
  set display_name = v_name,
      member_role = v_role,
      selected_permissions = v_safe_permissions,
      invite_mode = v_invite_mode,
      expires_at = now() + interval '7 days',
      updated_at = now()
  where ti.owner_user_id = v_owner_id
    and lower(trim(ti.email)) = v_email
    and ti.status = 'pending'
  returning ti.id into v_invite_id;

  if not found then
    begin
      insert into public.team_account_invitations (
        owner_user_id, email, display_name, member_role, selected_permissions,
        invite_mode, status, expires_at, updated_at
      ) values (
        v_owner_id, v_email, v_name, v_role, v_safe_permissions,
        v_invite_mode, 'pending', now() + interval '7 days', now()
      ) returning id into v_invite_id;
    exception when unique_violation then
      update public.team_account_invitations as ti
      set display_name = v_name,
          member_role = v_role,
          selected_permissions = v_safe_permissions,
          invite_mode = v_invite_mode,
          expires_at = now() + interval '7 days',
          updated_at = now()
      where ti.owner_user_id = v_owner_id
        and lower(trim(ti.email)) = v_email
        and ti.status = 'pending'
      returning ti.id into v_invite_id;
    end;
  end if;

  return query
  select ti.id, ti.email, ti.display_name, ti.member_role, ti.expires_at
  from public.team_account_invitations ti
  where ti.id = v_invite_id;
end;
$$;

revoke all on function public.send_team_invitation(text, text, text, jsonb) from public;
grant execute on function public.send_team_invitation(text, text, text, jsonb) to authenticated;

-- Restore the claim RPC with both invitation modes and permission seeding.
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
  v_owner_role text;
  v_current_role text;
  v_linked_client_id text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if v_email = '' then
    return null;
  end if;

  select * into v_invite
  from public.team_account_invitations ti
  where lower(trim(ti.email)) = v_email
    and ti.status = 'pending'
    and ti.expires_at > now()
    and lower(coalesce(ti.member_role, '')) <> 'staff'
  order by ti.created_at desc
  limit 1
  for update;

  if not found then
    return null;
  end if;

  select lower(au.email), lower(coalesce(p.user_role, ''))
    into v_owner_email, v_owner_role
  from auth.users au
  left join public.profiles p on p.id = au.id
  where au.id = v_invite.owner_user_id;

  if v_email = lower(coalesce(v_owner_email, '')) then
    raise exception 'Invalid invitation target';
  end if;

  select lower(coalesce(p.user_role, ''))
    into v_current_role
  from public.profiles p
  where p.id = v_user_id;
  v_current_role := coalesce(v_current_role, '');

  if v_invite.invite_mode = 'owner_to_accountant' then
    if v_owner_role <> 'owner' then
      raise exception 'This invitation is no longer valid because the inviter is not a Business Owner';
    end if;
    if v_current_role not in ('accountant', 'bookkeeper') then
      raise exception 'Only an existing Accountant or Bookkeeper account can accept this invitation';
    end if;
    if v_current_role <> lower(v_invite.member_role) then
      raise exception 'Your existing Accountant/Bookkeeper role does not match this invitation';
    end if;
    if exists (select 1 from public.account_team_links l where l.member_user_id = v_user_id) then
      raise exception 'Remove the existing team membership before accepting this Business Owner client invitation';
    end if;

    -- Keep this login independent. Do not insert into account_team_links.
    v_linked_client_id := public.sync_business_owner_client_for_accountant(
      v_invite.owner_user_id, v_user_id
    );

    update public.team_account_invitations ti
    set status = 'accepted', accepted_user_id = v_user_id,
        accepted_at = now(), updated_at = now(), invite_mode = 'owner_to_accountant'
    where ti.id = v_invite.id;

    return jsonb_build_object(
      'is_subuser', false,
      'owner_id', null,
      'owner_email', v_owner_email,
      'member_role', v_invite.member_role,
      'status', 'active',
      'member_kind', 'account_owner',
      'relationship_kind', 'client',
      'client_id', v_linked_client_id,
      'invitation_id', v_invite.id
    );
  end if;

  -- Preserve ordinary account team behavior for non-owner invitations.
  if v_owner_role = 'owner' then
    raise exception 'A Business Owner invitation to an Accountant/Bookkeeper must use owner_to_accountant mode';
  end if;
  if v_current_role = 'owner' then
    raise exception 'A Business Owner account cannot be invited as a team member';
  end if;
  if exists (select 1 from public.account_team_links l where l.member_user_id = v_user_id) then
    return null;
  end if;

  insert into public.account_team_links (
    owner_user_id, member_user_id, member_email, display_name,
    member_role, member_kind, status, updated_at
  ) values (
    v_invite.owner_user_id, v_user_id, v_email, v_invite.display_name,
    v_invite.member_role, 'independent', 'active', now()
  );

  update public.team_account_invitations ti
  set status = 'accepted', accepted_user_id = v_user_id,
      accepted_at = now(), updated_at = now()
  where ti.id = v_invite.id;

  update public.profiles p
  set user_role = v_invite.member_role,
      display_name = coalesce(nullif(p.display_name, ''), v_invite.display_name),
      approved = true,
      approved_at = coalesce(p.approved_at, now()),
      updated_at = now()
  where p.id = v_user_id;

  if coalesce(v_invite.selected_permissions, '{}'::jsonb) <> '{}'::jsonb then
    insert into public.account_team_client_permissions (
      owner_user_id, member_user_id, client_id, permissions, created_at, updated_at
    )
    select v_invite.owner_user_id, v_user_id, c.id,
           v_invite.selected_permissions, now(), now()
    from public.clients c
    where c.user_id = v_invite.owner_user_id
    on conflict (owner_user_id, member_user_id, client_id)
    do update set permissions = excluded.permissions, updated_at = now();
  end if;

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

-- Backfill previously accepted Owner -> Accountant/Bookkeeper relationships.
-- This is data-preserving: it removes only the bad team link for the exact pair;
-- the accountant's own public.clients rows are not deleted.
do $$
declare
  r record;
begin
  for r in
    select distinct ti.owner_user_id as owner_id,
           ti.accepted_user_id as accountant_id
    from public.team_account_invitations ti
    join public.profiles inviter on inviter.id = ti.owner_user_id
    join public.profiles invitee on invitee.id = ti.accepted_user_id
    where ti.status = 'accepted'
      and ti.accepted_user_id is not null
      and lower(coalesce(inviter.user_role, '')) = 'owner'
      and lower(coalesce(invitee.user_role, '')) in ('accountant', 'bookkeeper')
  loop
    update public.team_account_invitations ti
    set invite_mode = 'owner_to_accountant', updated_at = now()
    where ti.owner_user_id = r.owner_id
      and ti.accepted_user_id = r.accountant_id
      and ti.status = 'accepted'
      and ti.invite_mode is distinct from 'owner_to_accountant';

    -- Clean permission rows attached to the mistaken subuser membership.
    delete from public.account_team_client_permissions p
    where p.owner_user_id = r.owner_id
      and p.member_user_id = r.accountant_id;

    delete from public.account_team_links l
    where l.owner_user_id = r.owner_id
      and l.member_user_id = r.accountant_id;

    perform public.sync_business_owner_client_for_accountant(
      r.owner_id, r.accountant_id
    );
  end loop;
end;
$$;

commit;

-- Verify after running:
-- select business_owner_user_id, accountant_user_id, client_id
-- from public.accountant_client_links
-- where business_owner_user_id = '<BUSINESS-OWNER-UUID>';
--
-- select id, user_id, name, tin, tax_id
-- from public.clients
-- where user_id = '<ACCOUNTANT-UUID>'
-- order by created_at;
--
-- select owner_user_id, member_user_id
-- from public.account_team_links
-- where owner_user_id = '<BUSINESS-OWNER-UUID>'
--   and member_user_id = '<ACCOUNTANT-UUID>';
