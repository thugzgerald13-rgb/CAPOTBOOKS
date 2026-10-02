-- ============================================================================
-- CAPOT OWNER INVITATION: REQUIRE EXISTING ACCOUNT
--
-- Business Owners may invite only an Accountant/Bookkeeper who already has
-- their own CAPOT webapp account. An invitation must never be used to create
-- or bootstrap a professional account.
--
-- Run AFTER scripts/invite_role_ownership_client_sync.sql.
-- ============================================================================

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
  v_target_role text;
  v_target_user_id uuid;
  v_invite_mode text;
  v_invite_id uuid;
begin
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  select lower(coalesce(p.user_role, ''))
    into v_inviter_role
  from public.profiles p
  where p.id = v_owner_id;

  if v_inviter_role not in ('owner', 'accountant', 'bookkeeper') then
    raise exception 'Only a Business Owner, Accountant, or Bookkeeper can send team invitations';
  end if;

  if v_email = '' or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'A valid invitation email is required';
  end if;

  if v_email = lower(coalesce(auth.jwt() ->> 'email', '')) then
    raise exception 'You cannot invite your own email address';
  end if;

  if v_inviter_role = 'owner' then
    if v_role not in ('accountant', 'bookkeeper') then
      raise exception 'Business Owners can invite only Accountant or Bookkeeper accounts';
    end if;
    v_invite_mode := 'owner_to_accountant';
  else
    if v_role not in ('accountant', 'bookkeeper', 'staff', 'viewer') then
      raise exception 'Invalid team role';
    end if;
    v_invite_mode := 'team_member';
  end if;

  -- Resolve the target account once. auth.users is the source of truth for
  -- whether the email already has a CAPOT login.
  select au.id, lower(coalesce(p.user_role, ''))
    into v_target_user_id, v_target_role
  from auth.users au
  left join public.profiles p on p.id = au.id
  where lower(au.email) = v_email
  limit 1;

  if v_invite_mode = 'owner_to_accountant' and v_target_user_id is null then
    raise exception 'The Accountant/Bookkeeper must already have their own CAPOT webapp account before a Business Owner can invite them';
  end if;

  if v_target_role = 'owner' then
    raise exception 'A Business Owner account cannot be invited. Invite an Accountant or Bookkeeper account instead';
  end if;

  if v_invite_mode = 'owner_to_accountant' then
    if v_target_role not in ('accountant', 'bookkeeper') then
      raise exception 'This existing account is not an Accountant or Bookkeeper account';
    end if;
    if v_target_role <> v_role then
      raise exception 'The selected role must match the existing Accountant/Bookkeeper account role';
    end if;
  end if;

  if v_invite_mode = 'owner_to_accountant' and exists (
    select 1
    from public.account_team_links l
    where l.member_user_id = v_target_user_id
      and l.status = 'active'
  ) then
    raise exception 'That account is already an active team member and must leave its current team before accepting this professional invitation';
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

  update public.team_account_invitations as ti
  set
    display_name = v_name,
    member_role = v_role,
    expires_at = now() + interval '7 days',
    updated_at = now(),
    invite_mode = v_invite_mode
  where ti.owner_user_id = v_owner_id
    and lower(trim(ti.email)) = v_email
    and ti.status = 'pending'
  returning ti.id into v_invite_id;

  if not found then
    begin
      insert into public.team_account_invitations (
        owner_user_id, email, display_name, member_role, status,
        expires_at, updated_at, invite_mode
      )
      values (
        v_owner_id, v_email, v_name, v_role, 'pending',
        now() + interval '7 days', now(), v_invite_mode
      )
      returning id into v_invite_id;
    exception
      when unique_violation then
        update public.team_account_invitations as ti
        set
          display_name = v_name,
          member_role = v_role,
          expires_at = now() + interval '7 days',
          updated_at = now(),
          invite_mode = v_invite_mode
        where ti.owner_user_id = v_owner_id
          and lower(trim(ti.email)) = v_email
          and ti.status = 'pending'
        returning ti.id into v_invite_id;
    end;
  end if;

  return query
  select i.id, i.email, i.display_name, i.member_role, i.expires_at
  from public.team_account_invitations i
  where i.id = v_invite_id;
end;
$$;

revoke all on function public.send_team_invitation(text, text, text) from public;
grant execute on function public.send_team_invitation(text, text, text) to authenticated;
