-- ============================================================================
-- CAPOT FIX: INVITED ACCOUNTANT DOES NOT APPEAR IN TEAM MEMBERS LIST
--
-- Symptom: a user invites an Accountant (or Bookkeeper/Viewer). The
-- invitation is created in public.team_account_invitations with status
-- 'pending', but public.list_my_subusers() only returns rows from
-- public.account_team_links (already-accepted members) plus the legacy
-- public.account_membership table. Pending invitations are never returned,
-- so the invited person never shows up in the Team & Subusers list until
-- (and unless) they sign in and claim the invite.
--
-- Additionally, for the Business-Owner -> Accountant flow the accepted
-- relationship is stored in public.accountant_client_links and was also
-- invisible in the team list.
--
-- This migration:
--   1. Re-creates list_my_subusers() with an extra `invite_mode` column and
--      UNIONs in (a) pending invitations (status = 'invited'), and
--      (b) accepted owner->accountant client relationships.
--   2. Re-creates remove_subuser() so it can revoke a pending invitation
--      (by invitation id) and sever an owner->accountant client link, in
--      addition to the existing account_team_links / legacy removal.
--   3. Re-creates update_subuser_role() so the role of a still-pending
--      invitation can be changed before acceptance.
--
-- Apply AFTER every existing subuser/invite migration:
--   1. scripts/subusers_migration.sql
--   2. scripts/subusers_invites_migration.sql
--   3. scripts/client_specific_permissions.sql
--   4. scripts/invite_role_ownership_client_sync.sql
--   5. scripts/owner_invitation_requires_existing_account.sql
--   6. scripts/managed_staff_login_migration.sql
--   7. THIS FILE
-- ============================================================================

-- Idempotent: ensure the invite_mode column exists even if an earlier
-- role/ownership sync migration was not applied.
alter table public.team_account_invitations
  add column if not exists invite_mode text not null default 'team_member';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'team_account_invitations_mode_check'
      and conrelid = 'public.team_account_invitations'::regclass
  ) then
    alter table public.team_account_invitations
      add constraint team_account_invitations_mode_check
      check (invite_mode in ('team_member', 'owner_to_accountant'));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 1. list_my_subusers(): include pending invitations and accepted
--    owner->accountant relationships.
--
--    For a pending invitation there is no member_user_id yet (the invitee
--    may not have signed up). We emit the invitation uuid as user_id so the
--    frontend can pass it back to remove_subuser() / update_subuser_role().
--    status is reported as 'invited', which the frontend already renders
--    with an amber "Invited" badge.
-- ---------------------------------------------------------------------------
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
  member_kind text,
  invite_mode text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- (a) Accepted team members (independent + managed staff).
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
    l.member_kind,
    'team_member'::text
  from public.account_team_links l
  join auth.users au on au.id = l.member_user_id
  left join public.profiles p on p.id = l.member_user_id
  left join public.account_managed_staff_credentials ms
    on ms.owner_user_id = l.owner_user_id
   and ms.auth_user_id = l.member_user_id
  where l.owner_user_id = auth.uid();

  -- (b) Legacy managed subusers (original account_membership schema).
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
      'managed'::text,
      null::text
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

  -- (c) Pending invitations sent by this owner (not yet accepted).
  --     Emitted with status = 'invited' so the UI shows the amber badge.
  --     user_id carries the invitation uuid so the row can be revoked /
  --     re-roled before acceptance.
  return query
  select
    i.id,
    i.id as user_id,
    lower(trim(i.email)),
    i.display_name,
    i.member_role,
    'invited'::text as status,
    null::timestamptz as last_login,
    i.created_at,
    'independent'::text as member_kind,
    coalesce(i.invite_mode, 'team_member')::text
  from public.team_account_invitations i
  where i.owner_user_id = auth.uid()
    and i.status = 'pending'
    and i.expires_at > now();

  -- (d) Accepted Business-Owner -> Accountant/Bookkeeper relationships.
  --     These are stored in accountant_client_links (a client relationship,
  --     not an account-team link) and were previously invisible.
  begin
    return query
    select
      acl.id,
      acl.accountant_user_id,
      lower(au.email),
      coalesce(p.display_name, au.raw_user_meta_data->>'full_name', au.email),
      lower(coalesce(p.user_role, 'accountant')),
      'active'::text,
      p.last_login,
      acl.created_at,
      'independent'::text,
      'owner_to_accountant'::text
    from public.accountant_client_links acl
    join auth.users au on au.id = acl.accountant_user_id
    left join public.profiles p on p.id = acl.accountant_user_id
    where acl.business_owner_user_id = auth.uid();
  exception
    when undefined_table then
      null;
  end;
end;
$$;

revoke all on function public.list_my_subusers() from public;
grant execute on function public.list_my_subusers() to authenticated;

-- ---------------------------------------------------------------------------
-- 2. remove_subuser(): also revoke a pending invitation (matched by its
--    invitation uuid in p_user_id) and sever an owner->accountant link.
-- ---------------------------------------------------------------------------
drop function if exists public.remove_subuser(uuid);

create or replace function public.remove_subuser(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Accepted independent / managed team member.
  delete from public.account_team_links
  where owner_user_id = auth.uid()
    and member_user_id = p_user_id;

  if found then
    return;
  end if;

  -- Legacy managed subuser.
  delete from public.account_membership am
  using public.business_accounts ba
  where am.account_id = ba.id
    and ba.owner_id = auth.uid()
    and am.user_id = p_user_id;

  if found then
    return;
  end if;

  -- Pending invitation: p_user_id carries the invitation uuid (see
  -- list_my_subusers above). Revoke it so it can no longer be claimed.
  update public.team_account_invitations
  set status = 'revoked', updated_at = now()
  where id = p_user_id
    and owner_user_id = auth.uid()
    and status = 'pending';

  if found then
    return;
  end if;

  -- Accepted owner->accountant relationship: sever the link (the synced
  -- client profile in the accountant's account is left in place).
  begin
    delete from public.accountant_client_links
    where business_owner_user_id = auth.uid()
      and accountant_user_id = p_user_id;

    if found then
      return;
    end if;
  exception
    when undefined_table then
      null;
  end;

  raise exception 'Team member not found';
end;
$$;

revoke all on function public.remove_subuser(uuid) from public;
grant execute on function public.remove_subuser(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. update_subuser_role(): also allow changing the role of a still-pending
--    invitation before it is accepted.
-- ---------------------------------------------------------------------------
drop function if exists public.update_subuser_role(uuid, text);

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

  -- Pending invitation: p_user_id carries the invitation uuid.
  update public.team_account_invitations
  set member_role = v_role, updated_at = now()
  where id = p_user_id
    and owner_user_id = auth.uid()
    and status = 'pending';

  if found then
    return;
  end if;

  -- Legacy managed subuser.
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

-- Verification helpers:
-- select * from public.list_my_subusers();
-- select public.send_team_invitation('accountant@example.com', 'Accountant', 'accountant');
-- select public.remove_subuser('<invitation-id-uuid>');
