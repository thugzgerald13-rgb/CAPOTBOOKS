-- ============================================================================
-- INVITE-TIME PERMISSION SELECTION
--
-- Lets an inviter pick the exact permitted functions when creating a team
-- invitation (the "Permissions *" checklist on the Invite form). The chosen
-- set is stored on the pending invitation and, on claim, seeded as the
-- per-client grant for every client owned by the inviter. The member role
-- remains the maximum capability cap — any selected permission outside the
-- role's allowed set is dropped server-side.
--
-- Backward compatible:
--   * send_team_invitation gains a 4th optional arg (p_permissions), default
--     '{}'. Existing 3-arg callers continue to work unchanged.
--   * If selected_permissions is empty ('{}'), claim behaves exactly as
--     before: NO client access is seeded (owner grants it explicitly).
--
-- Run in Supabase SQL Editor (Project → SQL Editor → New query → paste → Run).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Store the inviter's chosen permission set on the pending invitation.
-- ---------------------------------------------------------------------------
alter table public.team_account_invitations
  add column if not exists selected_permissions jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'team_account_invitations_permissions_object'
  ) then
    alter table public.team_account_invitations
      add constraint team_account_invitations_permissions_object
      check (jsonb_typeof(selected_permissions) = 'object');
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. Extend send_team_invitation with an optional p_permissions argument.
--    The old 3-arg overload is dropped first so there is exactly one function.
--    Selected permissions are intersected with the role cap server-side.
-- ---------------------------------------------------------------------------
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
  v_safe_permissions jsonb;
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

  -- Intersect selected permissions with the role cap. A subuser can never
  -- receive more than the role allows, even if the client UI is tampered with.
  select coalesce(jsonb_object_agg(k, true), '{}'::jsonb)
    into v_safe_permissions
  from jsonb_object_keys(coalesce(p_permissions, '{}'::jsonb)) as k
  where (p_permissions ->> k)::boolean is true
    and public.team_role_allows_permission(v_role, k);

  -- Avoid an expression-based ON CONFLICT target here. Because this
  -- function RETURNS TABLE with an output column named `email`, the bare
  -- `email` inside lower(trim(email)) can be ambiguous in PL/pgSQL.
  -- Update an existing pending invitation first, then insert if none exists.
  update public.team_account_invitations as ti
  set
    display_name = v_name,
    member_role = v_role,
    selected_permissions = v_safe_permissions,
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
        status, expires_at, updated_at
      )
      values (
        v_owner_id, v_email, v_name, v_role, v_safe_permissions,
        'pending', now() + interval '7 days', now()
      )
      returning id into v_invite_id;
    exception
      when unique_violation then
        -- A concurrent request may have created the same pending invite.
        update public.team_account_invitations as ti
        set
          display_name = v_name,
          member_role = v_role,
          selected_permissions = v_safe_permissions,
          expires_at = now() + interval '7 days',
          updated_at = now()
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

revoke all on function public.send_team_invitation(text, text, text, jsonb) from public;
grant execute on function public.send_team_invitation(text, text, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. On claim, seed the per-client grants for every client owned by the
--    inviter — but only when the invitation carried a non-empty permission
--    set. Empty set preserves the legacy behaviour (no client access until
--    explicitly granted). The role cap was already applied at invite time.
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

  -- Seed per-client grants from the inviter's selection. Already role-capped
  -- at invite time. Empty object => legacy behaviour (no seeded access).
  if v_invite.selected_permissions <> '{}'::jsonb then
    insert into public.account_team_client_permissions (
      owner_user_id, member_user_id, client_id, permissions, created_at, updated_at
    )
    select
      v_invite.owner_user_id,
      v_user_id,
      c.id,
      v_invite.selected_permissions,
      now(),
      now()
    from public.clients c
    where c.user_id = v_invite.owner_user_id
    on conflict (owner_user_id, member_user_id, client_id)
    do update set
      permissions = excluded.permissions,
      updated_at = now();
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

-- ============================================================================
-- Done. Existing pending invitations (selected_permissions = '{}') keep the
-- legacy no-seeded-access behaviour. New invitations carry the inviter's
-- exact selection and apply it automatically on first sign-in.
-- ============================================================================
