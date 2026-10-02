-- ============================================================================
-- CAPOT INVITATION ROLE / OWNERSHIP / CLIENT SYNC FIX
--
-- Desired behavior:
--   * A Business Owner can invite ONLY an Accountant or Bookkeeper.
--   * The invited Accountant/Bookkeeper keeps ownership of their own CAPOT
--     account. They are NOT converted into the Business Owner's subuser.
--   * When that professional accepts, the Business Owner's business profile is
--     created/synchronized as a client profile inside the professional's own
--     Clients page.
--   * Existing client profiles are matched first by TIN, then by email.
--   * A deterministic relationship table keeps the synchronization anchored
--     to the two real accounts.
--   * Accountant/Bookkeeper accounts can still use the normal team/subuser
--     invitation flow for their own team. Business Owner invitations use the
--     separate professional-client relationship mode.
--
-- This patch is intended to run AFTER the existing team invitation migrations.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Record which invitation model was used.
-- ---------------------------------------------------------------------------

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

-- Repair pending invitations created by the previous implementation: if an
-- Owner invited an Accountant/Bookkeeper, preserve that invitation as the new
-- professional/client relationship flow instead of letting it create a
-- subuser ownership link when accepted.
update public.team_account_invitations ti
set invite_mode = 'owner_to_accountant',
    updated_at = now()
from public.profiles inviter
where inviter.id = ti.owner_user_id
  and lower(coalesce(inviter.user_role, '')) = 'owner'
  and ti.status = 'pending'
  and ti.member_role in ('accountant', 'bookkeeper');

-- ---------------------------------------------------------------------------
-- Deterministic relationship between a Business Owner and their accountant.
-- ---------------------------------------------------------------------------

create table if not exists public.accountant_client_links (
  id uuid primary key default gen_random_uuid(),
  business_owner_user_id uuid not null references auth.users(id) on delete cascade,
  accountant_user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_owner_user_id, accountant_user_id),
  constraint accountant_client_links_not_self
    check (business_owner_user_id <> accountant_user_id)
);

create index if not exists idx_accountant_client_links_business_owner
  on public.accountant_client_links(business_owner_user_id);

create index if not exists idx_accountant_client_links_accountant
  on public.accountant_client_links(accountant_user_id);

alter table public.accountant_client_links enable row level security;
revoke all on table public.accountant_client_links from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Sync one Business Owner into one Accountant/Bookkeeper's client directory.
-- This helper is intentionally not granted directly to authenticated users;
-- it is called by the accepting invitation RPC and the profile-sync trigger.
-- ---------------------------------------------------------------------------

create or replace function public.sync_business_owner_client_for_accountant(
  p_business_owner_user_id uuid,
  p_accountant_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_email text;
  v_owner_name text;
  v_profile jsonb := '{}'::jsonb;
  v_client_id text;
  v_existing_client_id text;
  v_tin text;
  v_category text;
  v_accounting_type text;
  v_industry text;
  v_fiscal_month_end integer;
  v_has_multiple_business_lines boolean;
  v_address text;
  v_phone text;
  v_client_email text;
begin
  if p_business_owner_user_id is null or p_accountant_user_id is null then
    raise exception 'Business owner and accountant are required';
  end if;

  if p_business_owner_user_id = p_accountant_user_id then
    raise exception 'Business owner and accountant cannot be the same account';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_business_owner_user_id
      and lower(coalesce(p.user_role, '')) = 'owner'
  ) then
    raise exception 'The source account is not a Business Owner account';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = p_accountant_user_id
      and lower(coalesce(p.user_role, '')) in ('accountant', 'bookkeeper')
  ) then
    raise exception 'The receiving account must be an Accountant or Bookkeeper';
  end if;

  select lower(coalesce(au.email, '')),
         coalesce(nullif(trim(p.display_name), ''), nullif(trim(au.raw_user_meta_data->>'full_name'), ''), au.email)
    into v_owner_email, v_owner_name
  from auth.users au
  left join public.profiles p on p.id = au.id
  where au.id = p_business_owner_user_id;

  select coalesce(bp.data, '{}'::jsonb)
    into v_profile
  from public.business_profiles bp
  where bp.user_id = p_business_owner_user_id
  limit 1;

  v_tin := nullif(trim(coalesce(v_profile->>'tin', '')), '');
  v_client_email := coalesce(nullif(trim(v_profile->>'email'), ''), v_owner_email);
  v_phone := nullif(trim(coalesce(v_profile->>'phone', '')), '');
  v_owner_name := coalesce(
    nullif(trim(v_profile->>'registeredName'), ''),
    nullif(trim(v_profile->>'tradeName'), ''),
    nullif(trim(v_profile->>'name'), ''),
    v_owner_name,
    v_owner_email,
    'Client'
  );

  v_category := case lower(coalesce(v_profile->>'category', 'private'))
    when 'government' then 'government'
    else 'private'
  end;

  v_accounting_type := case lower(coalesce(v_profile->>'accountingType', 'calendar'))
    when 'fiscal' then 'Fiscal'
    else 'Calendar'
  end;

  v_industry := case lower(coalesce(v_profile->>'industry', 'general-services'))
    when 'retail' then 'retail'
    when 'general-services' then 'general-services'
    when 'manufacturing' then 'manufacturing'
    when 'construction' then 'construction'
    else 'general-services'
  end;

  v_fiscal_month_end := case
    when coalesce(v_profile->>'fiscalMonthEnd', '') ~ '^[0-9]+$'
      then greatest(1, least(12, (v_profile->>'fiscalMonthEnd')::integer))
    else 12
  end;

  v_has_multiple_business_lines := lower(coalesce(v_profile->>'hasMultipleBusinessLines', 'false')) = 'true';

  v_address := nullif(trim(concat_ws(', ',
    nullif(trim(v_profile->>'substreet'), ''),
    nullif(trim(v_profile->>'street'), ''),
    nullif(trim(v_profile->>'barangay'), ''),
    nullif(trim(v_profile->>'district'), ''),
    nullif(trim(v_profile->>'city'), ''),
    nullif(trim(v_profile->>'zipCode'), '')
  )), '');

  -- A relationship already established by an earlier acceptance is the source
  -- of truth for the client row to update.
  select acl.client_id
    into v_client_id
  from public.accountant_client_links acl
  where acl.business_owner_user_id = p_business_owner_user_id
    and acl.accountant_user_id = p_accountant_user_id
  limit 1;

  -- If there is no prior relationship, reuse an existing accountant-owned
  -- client profile when its TIN or email identifies the Business Owner.
  if v_client_id is null and v_tin is not null then
    select c.id
      into v_existing_client_id
    from public.clients c
    where c.user_id = p_accountant_user_id
      and c.tin = v_tin
    order by c.updated_at desc nulls last, c.created_at desc
    limit 1;
    v_client_id := v_existing_client_id;
  end if;

  if v_client_id is null and v_client_email is not null then
    select c.id
      into v_existing_client_id
    from public.clients c
    where c.user_id = p_accountant_user_id
      and lower(coalesce(c.email, '')) = lower(v_client_email)
    order by c.updated_at desc nulls last, c.created_at desc
    limit 1;
    v_client_id := v_existing_client_id;
  end if;

  if v_client_id is null and v_owner_name is not null then
    select c.id
      into v_existing_client_id
    from public.clients c
    where c.user_id = p_accountant_user_id
      and lower(trim(coalesce(c.registered_name, c.trade_name, c.name, ''))) = lower(trim(v_owner_name))
    order by c.updated_at desc nulls last, c.created_at desc
    limit 1;
    v_client_id := v_existing_client_id;
  end if;

  -- No matching profile: create one deterministically. The ID includes both
  -- accounts because clients.id is globally unique but one Business Owner can
  -- legitimately be represented by more than one Accountant.
  if v_client_id is null then
    v_client_id := 'client_from_business_owner_' || replace(p_business_owner_user_id::text, '-', '') || '_' || replace(p_accountant_user_id::text, '-', '');
  end if;

  insert into public.clients (
    id,
    user_id,
    name,
    address,
    tax_id,
    tin,
    taxpayer_classification,
    registered_name,
    last_name,
    first_name,
    middle_name,
    trade_name,
    substreet,
    street,
    barangay,
    district,
    city,
    zip_code,
    rdo_code,
    phone,
    email,
    category,
    has_multiple_business_lines,
    accounting_type,
    fiscal_month_end,
    industry,
    updated_at
  )
  values (
    v_client_id,
    p_accountant_user_id,
    v_owner_name,
    v_address,
    v_tin,
    v_tin,
    nullif(trim(v_profile->>'taxpayerClassification'), ''),
    coalesce(nullif(trim(v_profile->>'registeredName'), ''), v_owner_name),
    nullif(trim(v_profile->>'lastName'), ''),
    nullif(trim(v_profile->>'firstName'), ''),
    nullif(trim(v_profile->>'middleName'), ''),
    nullif(trim(v_profile->>'tradeName'), ''),
    nullif(trim(v_profile->>'substreet'), ''),
    nullif(trim(v_profile->>'street'), ''),
    nullif(trim(v_profile->>'barangay'), ''),
    nullif(trim(v_profile->>'district'), ''),
    nullif(trim(v_profile->>'city'), ''),
    nullif(trim(v_profile->>'zipCode'), ''),
    nullif(trim(v_profile->>'rdoCode'), ''),
    v_phone,
    v_client_email,
    v_category,
    v_has_multiple_business_lines,
    v_accounting_type,
    v_fiscal_month_end,
    v_industry,
    now()
  )
  on conflict (id) do update
  set
    name = excluded.name,
    address = excluded.address,
    tax_id = excluded.tax_id,
    tin = excluded.tin,
    taxpayer_classification = excluded.taxpayer_classification,
    registered_name = excluded.registered_name,
    last_name = excluded.last_name,
    first_name = excluded.first_name,
    middle_name = excluded.middle_name,
    trade_name = excluded.trade_name,
    substreet = excluded.substreet,
    street = excluded.street,
    barangay = excluded.barangay,
    district = excluded.district,
    city = excluded.city,
    zip_code = excluded.zip_code,
    rdo_code = excluded.rdo_code,
    phone = excluded.phone,
    email = excluded.email,
    category = excluded.category,
    has_multiple_business_lines = excluded.has_multiple_business_lines,
    accounting_type = excluded.accounting_type,
    fiscal_month_end = excluded.fiscal_month_end,
    industry = excluded.industry,
    updated_at = now();

  insert into public.accountant_client_links (
    business_owner_user_id,
    accountant_user_id,
    client_id,
    updated_at
  )
  values (
    p_business_owner_user_id,
    p_accountant_user_id,
    v_client_id,
    now()
  )
  on conflict (business_owner_user_id, accountant_user_id)
  do update set
    client_id = excluded.client_id,
    updated_at = now();

  return v_client_id;
end;
$$;

revoke all on function public.sync_business_owner_client_for_accountant(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Keep linked client profiles synchronized when the Business Owner changes
-- their business profile after acceptance.
-- ---------------------------------------------------------------------------

create or replace function public.sync_linked_accountant_clients_after_business_profile_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select acl.accountant_user_id
    from public.accountant_client_links acl
    where acl.business_owner_user_id = new.user_id
  loop
    begin
      perform public.sync_business_owner_client_for_accountant(
        new.user_id,
        r.accountant_user_id
      );
    exception
      when others then
        raise notice 'Could not synchronize linked accountant client for %: %', r.accountant_user_id, sqlerrm;
    end;
  end loop;

  return new;
end;
$$;

revoke all on function public.sync_linked_accountant_clients_after_business_profile_update() from public, anon, authenticated;

drop trigger if exists trg_sync_linked_accountant_clients
  on public.business_profiles;
create trigger trg_sync_linked_accountant_clients
after insert or update of data on public.business_profiles
for each row
execute function public.sync_linked_accountant_clients_after_business_profile_update();

-- ---------------------------------------------------------------------------
-- Invitation sender: role-aware routing.
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
  v_inviter_role text;
  v_target_role text;
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

  -- Existing accounts are validated before an invitation is created. A
  -- Business Owner target is never a valid team/professional invitation.
  select lower(coalesce(p.user_role, ''))
    into v_target_role
  from auth.users au
  left join public.profiles p on p.id = au.id
  where lower(au.email) = v_email
  limit 1;

  if v_target_role = 'owner' then
    raise exception 'A Business Owner account cannot be invited. Invite an Accountant or Bookkeeper account instead';
  end if;

  -- Business Owner invitations are only for professionals who already have
  -- their own CAPOT webapp account. Never create a pending owner-to-
  -- accountant invitation for an email that does not exist in auth.users.
  if v_invite_mode = 'owner_to_accountant' and not exists (
    select 1
    from auth.users au
    where lower(au.email) = v_email
  ) then
    raise exception 'The Accountant/Bookkeeper must already have their own CAPOT webapp account before a Business Owner can invite them';
  end if;

  if v_invite_mode = 'owner_to_accountant' and v_target_role is not null and v_target_role <> '' then
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
    where l.member_user_id = (
      select au.id from auth.users au where lower(au.email) = v_email limit 1
    )
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

  -- Do not use an expression-based ON CONFLICT here. This function has a
  -- RETURNS TABLE output column named `email`, which can make an unqualified
  -- `email` in the conflict target ambiguous in PL/pgSQL.
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

-- ---------------------------------------------------------------------------
-- Claim invitation. Owner -> Accountant/Bookkeeper is NOT a subuser claim.
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
  v_owner_role text;
  v_existing_member boolean;
  v_linked_client_id text;
  v_current_role text;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  if v_email = '' then
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

  select lower(au.email), lower(coalesce(p.user_role, ''))
    into v_owner_email, v_owner_role
  from auth.users au
  left join public.profiles p on p.id = au.id
  where au.id = v_invite.owner_user_id;

  if v_email = lower(coalesce(v_owner_email, '')) then
    raise exception 'Invalid invitation target';
  end if;

  v_current_role := lower(coalesce((
    select p.user_role from public.profiles p where p.id = v_user_id
  ), ''));

  if v_invite.invite_mode = 'owner_to_accountant' then
    if v_owner_role <> 'owner' then
      raise exception 'This invitation is no longer valid because the inviting account is not a Business Owner';
    end if;

    if v_current_role = 'owner' then
      raise exception 'A Business Owner account cannot accept this invitation as a team member';
    end if;

    if v_current_role not in ('', 'accountant', 'bookkeeper') then
      raise exception 'Only an Accountant or Bookkeeper account can accept this invitation';
    end if;

    if v_current_role in ('accountant', 'bookkeeper') and v_current_role <> v_invite.member_role then
      raise exception 'Your existing Accountant/Bookkeeper role does not match this invitation';
    end if;

    -- A professional invitation produces a client relationship, not an
    -- account-team ownership relationship.
    v_existing_member := exists (
      select 1
      from public.account_team_links l
      where l.member_user_id = v_user_id
        and l.status = 'active'
    );

    if v_existing_member then
      raise exception 'Leave the current team before accepting a Business Owner client invitation';
    end if;

    update public.profiles
    set
      user_role = v_invite.member_role,
      display_name = coalesce(nullif(display_name, ''), v_invite.display_name),
      approved = true,
      approved_at = coalesce(approved_at, now()),
      updated_at = now()
    where id = v_user_id;

    v_linked_client_id := public.sync_business_owner_client_for_accountant(
      v_invite.owner_user_id,
      v_user_id
    );

    update public.team_account_invitations
    set status = 'accepted',
        accepted_user_id = v_user_id,
        accepted_at = now(),
        updated_at = now()
    where id = v_invite.id;

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

  -- Normal team invitation: retain the existing subuser behavior.
  if v_current_role = 'owner' then
    raise exception 'A Business Owner account cannot be invited as a team member';
  end if;

  if exists (
    select 1
    from public.account_team_links l
    where l.member_user_id = v_user_id
  ) then
    return null;
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
    'relationship_kind', 'team_member',
    'invitation_id', v_invite.id
  );
end;
$$;

revoke all on function public.claim_team_invitation() from public;
grant execute on function public.claim_team_invitation() to authenticated;

-- ---------------------------------------------------------------------------
-- Standalone Accountant/Bookkeeper permissions come from their profile role.
-- The old function returned full owner permissions whenever no subuser link
-- existed, which incorrectly gave a new professional account unrestricted
-- owner-level capabilities.
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
    select lower(coalesce(p.user_role, ''))
      into v_role
    from public.profiles p
    where p.id = auth.uid();
  end if;

  if v_role is null or v_role = '' or v_role = 'owner' then
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
-- One-time repair for users already affected by the earlier ownership bug.
-- Any independent Accountant/Bookkeeper linked beneath an Owner is converted
-- into the intended accountant/client relationship and its bad team link is
-- removed. Managed/staff memberships are left untouched.
-- ---------------------------------------------------------------------------

do $$
declare
  r record;
  v_client_id text;
begin
  if to_regclass('public.account_team_links') is null then
    return;
  end if;

  for r in
    select
      l.id as link_id,
      l.owner_user_id,
      l.member_user_id,
      lower(coalesce(l.member_role, '')) as member_role
    from public.account_team_links l
    join public.profiles owner_profile on owner_profile.id = l.owner_user_id
    join public.profiles member_profile on member_profile.id = l.member_user_id
    where l.member_kind = 'independent'
      and lower(coalesce(owner_profile.user_role, '')) = 'owner'
      and lower(coalesce(member_profile.user_role, l.member_role, '')) in ('accountant', 'bookkeeper')
  loop
    begin
      update public.profiles
      set user_role = r.member_role,
          approved = true,
          approved_at = coalesce(approved_at, now()),
          updated_at = now()
      where id = r.member_user_id;

      v_client_id := public.sync_business_owner_client_for_accountant(
        r.owner_user_id,
        r.member_user_id
      );

      delete from public.account_team_links
      where id = r.link_id;

      raise notice 'Repaired owner/accountant relationship % -> client %', r.member_user_id, v_client_id;
    exception
      when others then
        raise notice 'Skipped repair for member %: %', r.member_user_id, sqlerrm;
    end;
  end loop;
end $$;

-- Verification helpers:
-- select public.get_my_account_permissions();
-- select public.send_team_invitation('accountant@example.com', 'Accountant', 'accountant');
-- select public.claim_team_invitation();
-- select * from public.accountant_client_links;
-- select id, user_id, name, tin, email from public.clients order by updated_at desc;
