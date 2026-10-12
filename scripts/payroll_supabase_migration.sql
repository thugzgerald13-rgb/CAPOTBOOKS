-- CAPOTBOOKS Payroll Supabase integration
-- Apply AFTER scripts/schema.sql and scripts/client_specific_permissions.sql.
-- This migration stores one JSONB payload per payroll entity while keeping each
-- row scoped to the existing CAPOTBOOKS client/business id.

begin;

create table if not exists public.payroll_records (
  client_id text not null references public.clients(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payroll_records_pkey primary key (client_id, record_type, record_id),
  constraint payroll_records_type_check check (
    record_type in ('employee', 'attendance', 'payroll', 'settings', 'audit')
  ),
  constraint payroll_records_data_object check (jsonb_typeof(data) = 'object'),
  constraint payroll_records_record_id_not_empty check (length(trim(record_id)) > 0)
);

create index if not exists idx_payroll_records_client_type
  on public.payroll_records(client_id, record_type);

create index if not exists idx_payroll_records_updated_at
  on public.payroll_records(client_id, updated_at desc);

alter table public.payroll_records enable row level security;

revoke all on table public.payroll_records from public, anon;
grant select, insert, update, delete on table public.payroll_records to authenticated;

-- Payroll data contains personal and compensation details. Owners are allowed
-- through can_access_client_operation. In the current CAPOTBOOKS team-role
-- matrix, non-owner roles do not receive manage_settings, so payroll is owner-only
-- until a dedicated payroll permission is added and tested.
drop policy if exists payroll_records_select_authorized on public.payroll_records;
create policy payroll_records_select_authorized
  on public.payroll_records
  for select to authenticated
  using (public.can_access_client_operation(client_id, 'manage_settings'));

drop policy if exists payroll_records_insert_authorized on public.payroll_records;
create policy payroll_records_insert_authorized
  on public.payroll_records
  for insert to authenticated
  with check (public.can_access_client_operation(client_id, 'manage_settings'));

drop policy if exists payroll_records_update_authorized on public.payroll_records;
create policy payroll_records_update_authorized
  on public.payroll_records
  for update to authenticated
  using (public.can_access_client_operation(client_id, 'manage_settings'))
  with check (public.can_access_client_operation(client_id, 'manage_settings'));

drop policy if exists payroll_records_delete_authorized on public.payroll_records;
create policy payroll_records_delete_authorized
  on public.payroll_records
  for delete to authenticated
  using (public.can_access_client_operation(client_id, 'manage_settings'));

drop trigger if exists trg_payroll_records_updated_at on public.payroll_records;
create trigger trg_payroll_records_updated_at
  before update on public.payroll_records
  for each row execute function public.set_updated_at();

comment on table public.payroll_records is
  'CAPOTBOOKS payroll employees, attendance, payroll periods, settings and audit log; tenant-scoped by client_id and protected by RLS.';
comment on column public.payroll_records.data is
  'The matching application record serialized as JSONB. Keep salary and government identifier data restricted by RLS.';

commit;
