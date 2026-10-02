-- ============================================================================
-- CAPOT CLIENT-SPECIFIC TEAM PERMISSIONS
--
-- Lets an account owner/accountant assign an invited team member a specific
-- set of capabilities for a specific client. The member role remains the
-- maximum capability set; this table stores the per-client subset actually
-- granted.
--
-- New independent invitations receive NO client access until a client grant is
-- created here. Existing active team members are seeded with their current
-- role permissions so this migration does not unexpectedly remove access.
-- ============================================================================

create table if not exists public.account_team_client_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, member_user_id, client_id),
  constraint account_team_client_permissions_object
    check (jsonb_typeof(permissions) = 'object')
);

create index if not exists idx_account_team_client_permissions_member
  on public.account_team_client_permissions(member_user_id, client_id);

create index if not exists idx_account_team_client_permissions_owner
  on public.account_team_client_permissions(owner_user_id, client_id);

alter table public.account_team_client_permissions enable row level security;
revoke all on table public.account_team_client_permissions from public, anon, authenticated;

-- Keep a normalized updated_at timestamp even if this migration is run after
-- the main schema's generic updated_at trigger setup.
drop trigger if exists trg_account_team_client_permissions_updated_at
  on public.account_team_client_permissions;
create trigger trg_account_team_client_permissions_updated_at
before update on public.account_team_client_permissions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Role -> maximum permissions helper.
-- ---------------------------------------------------------------------------

create or replace function public.team_role_allows_permission(
  p_role text,
  p_permission text
)
returns boolean
language sql
immutable
as $$
  select case lower(coalesce(p_role, ''))
    when 'accountant' then p_permission in (
      'edit_transactions', 'delete_transactions', 'approve_journal',
      'view_reports', 'export_data', 'lock_period'
    )
    when 'bookkeeper' then p_permission in (
      'edit_transactions', 'view_reports', 'export_data'
    )
    when 'staff' then p_permission in (
      'edit_transactions', 'view_reports'
    )
    when 'viewer' then p_permission in (
      'view_reports', 'export_data'
    )
    else false
  end;
$$;

revoke all on function public.team_role_allows_permission(text, text) from public;
grant execute on function public.team_role_allows_permission(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Effective permission helper used by RLS and by the auth client.
-- ---------------------------------------------------------------------------

create or replace function public.can_access_client_operation(
  p_client_id text,
  p_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_client_owner uuid;
  v_link record;
  v_legacy record;
  v_grant jsonb;
  v_permission text := lower(trim(coalesce(p_permission, '')));
begin
  if auth.uid() is null or p_client_id is null then
    return false;
  end if;

  select c.user_id
    into v_client_owner
  from public.clients c
  where c.id = p_client_id;

  if v_client_owner is null then
    return false;
  end if;

  -- Owner has unrestricted access to their own clients.
  if v_client_owner = auth.uid() then
    return true;
  end if;

  -- New invitation/account-team-link model.
  select l.owner_user_id, l.member_role, l.status
    into v_link
  from public.account_team_links l
  where l.owner_user_id = v_client_owner
    and l.member_user_id = auth.uid()
  order by l.created_at desc
  limit 1;

  if found then
    if v_link.status <> 'active' then
      return false;
    end if;

    select p.permissions
      into v_grant
    from public.account_team_client_permissions p
    where p.owner_user_id = v_client_owner
      and p.member_user_id = auth.uid()
      and p.client_id = p_client_id
    limit 1;

    if v_permission = 'read' then
      return (
        public.team_role_allows_permission(v_link.member_role, 'edit_transactions')
          and coalesce((v_grant ->> 'edit_transactions') = 'true', false)
      ) or (
        public.team_role_allows_permission(v_link.member_role, 'delete_transactions')
          and coalesce((v_grant ->> 'delete_transactions') = 'true', false)
      ) or (
        public.team_role_allows_permission(v_link.member_role, 'approve_journal')
          and coalesce((v_grant ->> 'approve_journal') = 'true', false)
      ) or (
        public.team_role_allows_permission(v_link.member_role, 'view_reports')
          and coalesce((v_grant ->> 'view_reports') = 'true', false)
      ) or (
        public.team_role_allows_permission(v_link.member_role, 'export_data')
          and coalesce((v_grant ->> 'export_data') = 'true', false)
      ) or (
        public.team_role_allows_permission(v_link.member_role, 'lock_period')
          and coalesce((v_grant ->> 'lock_period') = 'true', false)
      ) or (
        public.team_role_allows_permission(v_link.member_role, 'manage_users')
          and coalesce((v_grant ->> 'manage_users') = 'true', false)
      ) or (
        public.team_role_allows_permission(v_link.member_role, 'manage_settings')
          and coalesce((v_grant ->> 'manage_settings') = 'true', false)
      );
    end if;

    if not public.team_role_allows_permission(v_link.member_role, v_permission) then
      return false;
    end if;

    return coalesce((v_grant ->> v_permission) = 'true', false);
  end if;

  -- Backward-compatible managed subusers. They retain their original role
  -- behavior when no client-specific row exists for them.
  begin
    select am.role, am.is_active
      into v_legacy
    from public.account_membership am
    join public.business_accounts ba on ba.id = am.account_id
    where ba.owner_id = v_client_owner
      and am.user_id = auth.uid()
    order by am.created_at desc
    limit 1;

    if found then
      if not v_legacy.is_active then
        return false;
      end if;
      if v_permission = 'read' then
        return public.team_role_allows_permission(v_legacy.role, 'edit_transactions')
          or public.team_role_allows_permission(v_legacy.role, 'delete_transactions')
          or public.team_role_allows_permission(v_legacy.role, 'approve_journal')
          or public.team_role_allows_permission(v_legacy.role, 'view_reports')
          or public.team_role_allows_permission(v_legacy.role, 'export_data')
          or public.team_role_allows_permission(v_legacy.role, 'lock_period');
      end if;
      return public.team_role_allows_permission(v_legacy.role, v_permission);
    end if;
  exception
    when undefined_table then
      null;
  end;

  return false;
end;
$$;

revoke all on function public.can_access_client_operation(text, text) from public;
grant execute on function public.can_access_client_operation(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Owners grant/revoke permissions for one member on one client.
-- ---------------------------------------------------------------------------

create or replace function public.set_subuser_client_permissions(
  p_user_id uuid,
  p_client_id text,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_client_owner uuid;
  v_member_role text;
  v_link_exists boolean := false;
  v_legacy_exists boolean := false;
  v_normalized jsonb := '{}'::jsonb;
  v_permission_key text;
  v_requested boolean;
  v_allowed text[] := array[
    'manage_users', 'edit_transactions', 'delete_transactions',
    'approve_journal', 'view_reports', 'manage_settings', 'export_data',
    'lock_period'
  ];
begin
  if v_owner_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_user_id is null or p_client_id is null or trim(p_client_id) = '' then
    raise exception 'Member and client are required';
  end if;

  select c.user_id
    into v_client_owner
  from public.clients c
  where c.id = p_client_id;

  if v_client_owner is distinct from v_owner_id then
    raise exception 'You can only manage permissions for your own clients';
  end if;

  select l.member_role
    into v_member_role
  from public.account_team_links l
  where l.owner_user_id = v_owner_id
    and l.member_user_id = p_user_id
    and l.status = 'active'
  order by l.created_at desc
  limit 1;

  v_link_exists := found;

  if not v_link_exists then
    begin
      select lower(am.role)
        into v_member_role
      from public.account_membership am
      join public.business_accounts ba on ba.id = am.account_id
      where ba.owner_id = v_owner_id
        and am.user_id = p_user_id
        and am.is_active = true
      order by am.created_at desc
      limit 1;

      v_legacy_exists := found;
    exception
      when undefined_table then
        v_member_role := null;
    end;
  end if;

  if not v_link_exists and not v_legacy_exists then
    raise exception 'Active team member not found';
  end if;

  -- Only permissions supported by the selected member role can be granted.
  foreach v_permission_key in array v_allowed loop
    v_requested := false;
    if p_permissions is not null and jsonb_typeof(p_permissions) = 'object' then
      v_requested := coalesce((p_permissions ->> v_permission_key) = 'true', false);
    end if;

    if v_requested and public.team_role_allows_permission(v_member_role, v_permission_key) then
      v_normalized := jsonb_set(v_normalized, array[v_permission_key], 'true'::jsonb, true);
    else
      v_normalized := jsonb_set(v_normalized, array[v_permission_key], 'false'::jsonb, true);
    end if;
  end loop;

  insert into public.account_team_client_permissions (
    owner_user_id, member_user_id, client_id, permissions, updated_at
  )
  values (
    v_owner_id, p_user_id, p_client_id, v_normalized, now()
  )
  on conflict (owner_user_id, member_user_id, client_id)
  do update set
    permissions = excluded.permissions,
    updated_at = now();
end;
$$;

revoke all on function public.set_subuser_client_permissions(uuid, text, jsonb) from public;
grant execute on function public.set_subuser_client_permissions(uuid, text, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Read current grants for a member. The caller must own the member account.
-- ---------------------------------------------------------------------------

create or replace function public.list_subuser_client_permissions(
  p_user_id uuid
)
returns table (
  client_id text,
  client_name text,
  permissions jsonb
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_is_member boolean := false;
begin
  if v_owner_id is null or p_user_id is null then
    raise exception 'Member is required';
  end if;

  select exists (
    select 1
    from public.account_team_links l
    where l.owner_user_id = v_owner_id
      and l.member_user_id = p_user_id
  )
  or exists (
    select 1
    from public.account_membership am
    join public.business_accounts ba on ba.id = am.account_id
    where ba.owner_id = v_owner_id
      and am.user_id = p_user_id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Team member not found';
  end if;

  return query
  select
    p.client_id,
    c.name,
    p.permissions
  from public.account_team_client_permissions p
  join public.clients c on c.id = p.client_id
  where p.owner_user_id = v_owner_id
    and p.member_user_id = p_user_id
    and c.user_id = v_owner_id
  order by lower(c.name), c.id;
end;
$$;

revoke all on function public.list_subuser_client_permissions(uuid) from public;
grant execute on function public.list_subuser_client_permissions(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Invited member's effective permissions for the currently selected client.
-- ---------------------------------------------------------------------------

create or replace function public.get_my_client_permissions(
  p_client_id text
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_role text;
  v_permissions jsonb;
begin
  if auth.uid() is null or p_client_id is null then
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

  select c.user_id
    into v_owner_id
  from public.clients c
  where c.id = p_client_id;

  if v_owner_id = auth.uid() then
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

  select l.member_role, p.permissions
    into v_role, v_permissions
  from public.account_team_client_permissions p
  join public.account_team_links l
    on l.owner_user_id = p.owner_user_id
   and l.member_user_id = p.member_user_id
  where p.owner_user_id = v_owner_id
    and p.member_user_id = auth.uid()
    and p.client_id = p_client_id
    and l.status = 'active'
  limit 1;

  if found then
    return jsonb_build_object(
      'manage_users', public.team_role_allows_permission(v_role, 'manage_users') and coalesce((v_permissions ->> 'manage_users') = 'true', false),
      'edit_transactions', public.team_role_allows_permission(v_role, 'edit_transactions') and coalesce((v_permissions ->> 'edit_transactions') = 'true', false),
      'delete_transactions', public.team_role_allows_permission(v_role, 'delete_transactions') and coalesce((v_permissions ->> 'delete_transactions') = 'true', false),
      'approve_journal', public.team_role_allows_permission(v_role, 'approve_journal') and coalesce((v_permissions ->> 'approve_journal') = 'true', false),
      'view_reports', public.team_role_allows_permission(v_role, 'view_reports') and coalesce((v_permissions ->> 'view_reports') = 'true', false),
      'manage_settings', public.team_role_allows_permission(v_role, 'manage_settings') and coalesce((v_permissions ->> 'manage_settings') = 'true', false),
      'export_data', public.team_role_allows_permission(v_role, 'export_data') and coalesce((v_permissions ->> 'export_data') = 'true', false),
      'lock_period', public.team_role_allows_permission(v_role, 'lock_period') and coalesce((v_permissions ->> 'lock_period') = 'true', false)
    );
  end if;

  -- Legacy managed members continue to receive their role permissions until
  -- they are migrated to the independent invitation model.
  begin
    select case lower(am.role)
      when 'accountant' then jsonb_build_object(
        'manage_users', false, 'edit_transactions', true,
        'delete_transactions', true, 'approve_journal', true,
        'view_reports', true, 'manage_settings', false,
        'export_data', true, 'lock_period', true
      )
      when 'bookkeeper' then jsonb_build_object(
        'manage_users', false, 'edit_transactions', true,
        'delete_transactions', false, 'approve_journal', false,
        'view_reports', true, 'manage_settings', false,
        'export_data', true, 'lock_period', false
      )
      when 'viewer' then jsonb_build_object(
        'manage_users', false, 'edit_transactions', false,
        'delete_transactions', false, 'approve_journal', false,
        'view_reports', true, 'manage_settings', false,
        'export_data', true, 'lock_period', false
      )
      else jsonb_build_object(
        'manage_users', false, 'edit_transactions', true,
        'delete_transactions', false, 'approve_journal', false,
        'view_reports', true, 'manage_settings', false,
        'export_data', false, 'lock_period', false
      )
    end
      into v_permissions
    from public.account_membership am
    join public.business_accounts ba on ba.id = am.account_id
    where ba.owner_id = v_owner_id
      and am.user_id = auth.uid()
      and am.is_active = true
    order by am.created_at desc
    limit 1;
  exception
    when undefined_table then
      v_permissions := null;
  end;

  return coalesce(
    v_permissions,
    jsonb_build_object(
      'manage_users', false,
      'edit_transactions', false,
      'delete_transactions', false,
      'approve_journal', false,
      'view_reports', false,
      'manage_settings', false,
      'export_data', false,
      'lock_period', false
    )
  );
end;
$$;

revoke all on function public.get_my_client_permissions(text) from public;
grant execute on function public.get_my_client_permissions(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seed existing active independent members from their current role so this
-- migration is non-breaking for already-configured team accounts.
-- New invitations deliberately start with no client rows and must be granted
-- access explicitly by the account owner.
-- ---------------------------------------------------------------------------

insert into public.account_team_client_permissions (
  owner_user_id, member_user_id, client_id, permissions
)
select
  l.owner_user_id,
  l.member_user_id,
  c.id,
  case lower(l.member_role)
    when 'accountant' then jsonb_build_object(
      'manage_users', false, 'edit_transactions', true,
      'delete_transactions', true, 'approve_journal', true,
      'view_reports', true, 'manage_settings', false,
      'export_data', true, 'lock_period', true
    )
    when 'bookkeeper' then jsonb_build_object(
      'manage_users', false, 'edit_transactions', true,
      'delete_transactions', false, 'approve_journal', false,
      'view_reports', true, 'manage_settings', false,
      'export_data', true, 'lock_period', false
    )
    when 'viewer' then jsonb_build_object(
      'manage_users', false, 'edit_transactions', false,
      'delete_transactions', false, 'approve_journal', false,
      'view_reports', true, 'manage_settings', false,
      'export_data', true, 'lock_period', false
    )
    else jsonb_build_object(
      'manage_users', false, 'edit_transactions', true,
      'delete_transactions', false, 'approve_journal', false,
      'view_reports', true, 'manage_settings', false,
      'export_data', false, 'lock_period', false
    )
  end
from public.account_team_links l
join public.clients c on c.user_id = l.owner_user_id
where l.status = 'active'
on conflict (owner_user_id, member_user_id, client_id) do nothing;

-- ---------------------------------------------------------------------------
-- Client and child-table RLS.
-- Owners remain unrestricted. Team members can only see clients for which
-- they have at least one grant, and writes require the matching operation.
-- ---------------------------------------------------------------------------

drop policy if exists clients_select_own on public.clients;
create policy clients_select_own
on public.clients for select
to authenticated
using (
  user_id = auth.uid()
  or public.can_access_client_operation(id, 'read')
);

-- Client root mutations remain owner-only.
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

-- Apply operation-level permission checks to all normalized client child data.
do $$
declare
  t text;
begin
  foreach t in array array[
    'purchases', 'sales', 'coa_columns', 'coa_accounts',
    'journal_columns', 'journal_entries', 'journal_vouchers', 'journal_voucher_lines',
    'purchase_orders', 'purchase_order_items', 'receiving_reports', 'receiving_report_items',
    'payable_invoices', 'payable_invoice_items', 'inventory_columns', 'inventory_items',
    'inventory_movements', 'app_folders', 'app_files', 'tin_entries', 'tax_deadlines',
    'bank_accounts', 'supplier_advances', 'withholding_tax_entries', 'debit_credit_memos',
    'check_vouchers', 'miscellaneous_payments', 'asset_lapsing_schedule',
    'billing_invoices', 'financial_report_snapshots'
  ] loop
    execute format('drop policy if exists %I on public.%I', t || '_select_owner', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.can_access_client_operation(client_id, ''read''))',
      t || '_select_owner', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_insert_owner', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.can_access_client_operation(client_id, ''edit_transactions''))',
      t || '_insert_owner', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_update_owner', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.can_access_client_operation(client_id, ''edit_transactions'')) with check (public.can_access_client_operation(client_id, ''edit_transactions''))',
      t || '_update_owner', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_delete_owner', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.can_access_client_operation(client_id, ''delete_transactions''))',
      t || '_delete_owner', t
    );
  end loop;
end $$;

-- Private files follow the same client-level permissions.
drop policy if exists client_files_select_owner on storage.objects;
create policy client_files_select_owner
on storage.objects for select
to authenticated
using (
  bucket_id = 'client-files'
  and public.can_access_client_operation((storage.foldername(name))[1], 'read')
);

drop policy if exists client_files_insert_owner on storage.objects;
create policy client_files_insert_owner
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'client-files'
  and public.can_access_client_operation((storage.foldername(name))[1], 'edit_transactions')
);

drop policy if exists client_files_update_owner on storage.objects;
create policy client_files_update_owner
on storage.objects for update
to authenticated
using (
  bucket_id = 'client-files'
  and public.can_access_client_operation((storage.foldername(name))[1], 'edit_transactions')
)
with check (
  bucket_id = 'client-files'
  and public.can_access_client_operation((storage.foldername(name))[1], 'edit_transactions')
);

drop policy if exists client_files_delete_owner on storage.objects;
create policy client_files_delete_owner
on storage.objects for delete
to authenticated
using (
  bucket_id = 'client-files'
  and public.can_access_client_operation((storage.foldername(name))[1], 'delete_transactions')
);

-- Verification examples:
-- select * from public.list_subuser_client_permissions('<MEMBER-UUID>');
-- select public.set_subuser_client_permissions(
--   '<MEMBER-UUID>', '<CLIENT-ID>',
--   '{"edit_transactions":true,"view_reports":true}'::jsonb
-- );
-- select public.get_my_client_permissions('<CLIENT-ID>');
