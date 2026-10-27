-- CAPOTBOOKS BIR RELIEF persistence
-- Apply AFTER scripts/schema.sql and scripts/client_specific_permissions.sql.
-- All records are private to the active CAPOTBOOKS client/business and use the
-- existing client access controls. This table stores RELIEF-only adjustments;
-- it does NOT update sales, purchases, journals, ledgers, or source transactions.

begin;

create table if not exists public.relief_records (
  client_id text not null references public.clients(id) on delete cascade,
  record_type text not null,
  record_id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint relief_records_pkey primary key (client_id, record_type, record_id),
  constraint relief_records_type_check check (
    record_type in ('purchase_transfer', 'importation', 'settings', 'filed', 'audit', 'alphalist_transfer', 'alphalist_filed')
  ),
  constraint relief_records_data_object check (jsonb_typeof(data) = 'object'),
  constraint relief_records_record_id_not_empty check (length(trim(record_id)) > 0)
);

create index if not exists idx_relief_records_client_type
  on public.relief_records(client_id, record_type);

create index if not exists idx_relief_records_client_updated
  on public.relief_records(client_id, updated_at desc);

create index if not exists idx_relief_records_audit
  on public.relief_records(client_id, created_at desc)
  where record_type = 'audit';

alter table public.relief_records enable row level security;
revoke all on table public.relief_records from public, anon;
grant select, insert, update, delete on table public.relief_records to authenticated;

-- Viewing RELIEF follows the existing report permission. Mutating RELIEF-only
-- adjustments requires the existing edit_transactions permission.
drop policy if exists relief_records_select_authorized on public.relief_records;
create policy relief_records_select_authorized
  on public.relief_records
  for select to authenticated
  using (public.can_access_client_operation(client_id, 'view_reports'));

drop policy if exists relief_records_insert_authorized on public.relief_records;
create policy relief_records_insert_authorized
  on public.relief_records
  for insert to authenticated
  with check (public.can_access_client_operation(client_id, 'edit_transactions'));

drop policy if exists relief_records_update_authorized on public.relief_records;
create policy relief_records_update_authorized
  on public.relief_records
  for update to authenticated
  using (
    record_type <> 'audit'
    and public.can_access_client_operation(client_id, 'edit_transactions')
  )
  with check (
    record_type <> 'audit'
    and public.can_access_client_operation(client_id, 'edit_transactions')
  );

drop policy if exists relief_records_delete_authorized on public.relief_records;
create policy relief_records_delete_authorized
  on public.relief_records
  for delete to authenticated
  using (
    record_type <> 'audit'
    and public.can_access_client_operation(client_id, 'edit_transactions')
  );

drop trigger if exists trg_relief_records_updated_at on public.relief_records;
create trigger trg_relief_records_updated_at
  before update on public.relief_records
  for each row execute function public.set_updated_at();

comment on table public.relief_records is
  'Client-scoped RELIEF and Monthly Alphalist report state, transfer assignments, filing snapshots, importations, settings, and audit records protected by RLS.';
comment on column public.relief_records.data is
  'JSON payload for report-only RELIEF or Monthly Alphalist assignments and filing snapshots; source accounting transactions are never modified by this table.';
comment on column public.relief_records.created_by is
  'Supabase authenticated user who first created the record; populated from auth.uid().';

commit;
