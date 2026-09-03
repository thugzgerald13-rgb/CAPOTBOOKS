-- CAPOT normalized Supabase schema
-- Reconstructed from the CAPOT TypeScript source, migration plan, and security specification.
-- IMPORTANT: This is intended for a STAGING database first. Review against any existing
-- production schema before applying to production.
--
-- Assumptions:
--   * client IDs are text (the app normalizes IDs to strings).
--   * auth.users is the Supabase Auth user table.
--   * legacy clients.data is retained temporarily for rollback/migration verification.
--   * child tables are tenant-scoped by client_id.
--   * AppFile content/base64 is intentionally NOT stored in app_files.
--   * Purchase attachment content is intentionally NOT stored in purchases.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Utility: updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Tenancy root
-- ---------------------------------------------------------------------------

create table if not exists public.clients (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  address text,
  tax_id text,
  tin text,
  taxpayer_classification text,
  registered_name text,
  last_name text,
  first_name text,
  middle_name text,
  trade_name text,
  substreet text,
  street text,
  barangay text,
  district text,
  city text,
  zip_code text,
  rdo_code text,
  phone text,
  email text,
  category text not null default 'private',
  has_multiple_business_lines boolean not null default false,
  accounting_type text not null default 'Calendar',
  fiscal_month_end integer not null default 12,
  coa_format text not null default 'numeric',

  -- Temporary legacy compatibility payload.
  -- Remove only after migration verification + rollback window.
  data jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint clients_category_check
    check (category in ('private', 'government')),
  constraint clients_accounting_type_check
    check (accounting_type in ('Calendar', 'Fiscal')),
  constraint clients_fiscal_month_end_check
    check (fiscal_month_end between 1 and 12),
  constraint clients_coa_format_check
    check (coa_format in ('numeric', 'alphanumeric'))
);

create index if not exists idx_clients_user_id
  on public.clients(user_id);

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
      and c.user_id = auth.uid()
  );
$$;

revoke all on function public.is_client_owner(text) from public;
grant execute on function public.is_client_owner(text) to authenticated;

drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
before update on public.clients
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Purchases / sales
-- ---------------------------------------------------------------------------

create table if not exists public.purchases (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  dat_month_year text,
  date date,
  payment_method text,
  check_number text,
  bank_name text,
  invoice_no text,
  supplier_name text,
  supplier_address text,
  supplier_tin text,
  amount numeric(18,2),
  vat_type text,
  expense_type text,
  account_title text,
  transaction_details text,
  input_tax numeric(18,2),
  attachment_name text,
  attachment_type text,
  attachment_original_type text,
  attachment_size bigint,
  attachment_original_size bigint,
  attachment_compression text,
  attachment_storage_path text,
  withholding_option text,
  atc_code text,
  wht_rate numeric(9,4),
  wht_amount numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_purchases_client_id on public.purchases(client_id);
create index if not exists idx_purchases_date on public.purchases(client_id, date);

drop trigger if exists trg_purchases_updated_at on public.purchases;
create trigger trg_purchases_updated_at
before update on public.purchases
for each row execute function public.set_updated_at();

create table if not exists public.sales (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  dat_month_year text,
  date date,
  ref text,
  payment_type text,
  buyer_tin text,
  buyer_name text,
  buyer_address text,
  vat_type text,
  amount numeric(18,2),
  net_of_vat numeric(18,2),
  output_tax numeric(18,2),
  income_type text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_sales_client_id on public.sales(client_id);

drop trigger if exists trg_sales_updated_at on public.sales;
create trigger trg_sales_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Chart of accounts
-- ---------------------------------------------------------------------------

create table if not exists public.coa_columns (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  name text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_coa_columns_client_id on public.coa_columns(client_id);

create table if not exists public.coa_accounts (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  name text,
  type text,
  normal_side text,
  parent_id text,
  hidden boolean not null default false,
  opening_balance numeric(18,2),
  custom_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_coa_accounts_client_id on public.coa_accounts(client_id);
create index if not exists idx_coa_accounts_parent_id on public.coa_accounts(client_id, parent_id);

-- ---------------------------------------------------------------------------
-- Journals
-- ---------------------------------------------------------------------------

create table if not exists public.journal_columns (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  journal_type text not null,
  name text,
  type text,
  category text,
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_journal_columns_client_type
  on public.journal_columns(client_id, journal_type);

create table if not exists public.journal_entries (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  journal_type text not null,
  "values" jsonb not null default '{}'::jsonb,
  auto boolean not null default false,
  auto_source text,
  entry_date date,
  description text,
  total_debit numeric(18,2),
  total_credit numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Upgrade existing journal_entries tables created by earlier CAPOT versions.
-- CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
alter table public.journal_entries add column if not exists journal_type text;
alter table public.journal_entries add column if not exists "values" jsonb not null default '{}'::jsonb;
alter table public.journal_entries add column if not exists auto boolean not null default false;
alter table public.journal_entries add column if not exists auto_source text;
alter table public.journal_entries add column if not exists entry_date date;
alter table public.journal_entries add column if not exists description text;
alter table public.journal_entries add column if not exists total_debit numeric(18,2);
alter table public.journal_entries add column if not exists total_credit numeric(18,2);

create index if not exists idx_journal_entries_client_type
  on public.journal_entries(client_id, journal_type);
create index if not exists idx_journal_entries_date
  on public.journal_entries(client_id, entry_date);

create table if not exists public.journal_vouchers (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  date date,
  reference text,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_journal_vouchers_client_id
  on public.journal_vouchers(client_id);

create table if not exists public.journal_voucher_lines (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  journal_voucher_id text not null references public.journal_vouchers(id) on delete cascade,
  account_id text,
  account_name text,
  debit numeric(18,2) not null default 0,
  credit numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_journal_voucher_lines_client_id
  on public.journal_voucher_lines(client_id);
create index if not exists idx_journal_voucher_lines_voucher_id
  on public.journal_voucher_lines(journal_voucher_id);

-- ---------------------------------------------------------------------------
-- Accounts payable / purchasing workflow
-- ---------------------------------------------------------------------------

create table if not exists public.purchase_orders (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  date date,
  supplier_id text,
  supplier_name text,
  total_amount numeric(18,2),
  status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_purchase_orders_client_id
  on public.purchase_orders(client_id);

create table if not exists public.receiving_reports (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  date date,
  po_id text,
  supplier_name text,
  total_amount numeric(18,2),
  received_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_receiving_reports_client_id
  on public.receiving_reports(client_id);

create table if not exists public.receiving_report_items (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  receiving_report_id text not null references public.receiving_reports(id) on delete cascade,
  item_code text,
  description text,
  qty_ordered numeric(18,4),
  qty_received numeric(18,4),
  unit_price numeric(18,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_receiving_report_items_client_id
  on public.receiving_report_items(client_id);
create index if not exists idx_receiving_report_items_rr_id
  on public.receiving_report_items(receiving_report_id);

create table if not exists public.payable_invoices (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  invoice_number text,
  date date,
  due_date date,
  po_id text,
  rr_id text,
  supplier_id text,
  supplier_name text,
  subtotal numeric(18,2),
  vat_amount numeric(18,2),
  is_vatable boolean,
  withholding_tax_id text,
  wht_amount numeric(18,2),
  total_amount numeric(18,2),
  status text,
  discrepancy_details text,
  applied_prepayments jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payable_invoices_client_id
  on public.payable_invoices(client_id);
create index if not exists idx_payable_invoices_due_date
  on public.payable_invoices(client_id, due_date);

create table if not exists public.payable_invoice_items (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  payable_invoice_id text not null references public.payable_invoices(id) on delete cascade,
  item_code text,
  description text,
  qty numeric(18,4),
  unit_price numeric(18,4),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_payable_invoice_items_client_id
  on public.payable_invoice_items(client_id);
create index if not exists idx_payable_invoice_items_invoice_id
  on public.payable_invoice_items(payable_invoice_id);

-- ---------------------------------------------------------------------------
-- Inventory
-- ---------------------------------------------------------------------------

create table if not exists public.inventory_columns (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_columns_client_id
  on public.inventory_columns(client_id);

create table if not exists public.inventory_items (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  code text,
  name text,
  sku text,
  description text,
  category text,
  unit_of_measure text,
  cost_price numeric(18,4),
  selling_price numeric(18,4),
  stock_level numeric(18,4),
  reorder_point numeric(18,4),
  location text,
  custom_fields jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_items_client_id
  on public.inventory_items(client_id);

create table if not exists public.inventory_movements (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  item_id text,
  item_name text,
  item_code text,
  date date,
  type text,
  qty numeric(18,4),
  unit_cost numeric(18,4),
  total_value numeric(18,2),
  reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_inventory_movements_client_id
  on public.inventory_movements(client_id);
create index if not exists idx_inventory_movements_item_id
  on public.inventory_movements(client_id, item_id);

-- ---------------------------------------------------------------------------
-- Files / folders
-- ---------------------------------------------------------------------------

create table if not exists public.app_folders (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  name text,
  is_default boolean not null default false,
  type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_folders_client_id
  on public.app_folders(client_id);

create table if not exists public.app_files (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  name text,
  type text,
  size bigint,
  uploaded_at timestamptz,
  folder_id text references public.app_folders(id) on delete set null,
  storage_path text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_app_files_client_id
  on public.app_files(client_id);
create index if not exists idx_app_files_folder_id
  on public.app_files(folder_id);

-- ---------------------------------------------------------------------------
-- Tax / master data
-- ---------------------------------------------------------------------------

create table if not exists public.tin_entries (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  tin text,
  name text,
  address text,
  party_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tin_entries_client_id
  on public.tin_entries(client_id);

create table if not exists public.tax_deadlines (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  form_type text,
  title text,
  period text,
  due_date date,
  status text,
  tax_status text,
  amount_due numeric(18,2),
  date_filed date,
  date_paid date,
  reference_no text,
  confirmation_no text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_tax_deadlines_client_id
  on public.tax_deadlines(client_id);
create index if not exists idx_tax_deadlines_due_date
  on public.tax_deadlines(client_id, due_date);

create table if not exists public.bank_accounts (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  bank_name text,
  account_number text,
  balance numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_bank_accounts_client_id
  on public.bank_accounts(client_id);

create table if not exists public.withholding_tax_entries (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  atc_code text,
  description text,
  tax_rate numeric(9,4),
  category text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_withholding_tax_entries_client_id
  on public.withholding_tax_entries(client_id);

-- ---------------------------------------------------------------------------
-- Memos / payments / checks
-- ---------------------------------------------------------------------------

create table if not exists public.debit_credit_memos (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  type text,
  invoice_id text,
  invoice_number text,
  supplier_name text,
  date date,
  amount numeric(18,2),
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_debit_credit_memos_client_id
  on public.debit_credit_memos(client_id);

create table if not exists public.check_vouchers (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  date date,
  payee_name text,
  invoice_id text,
  invoice_number text,
  payment_type text,
  misc_details text,
  amount numeric(18,2),
  checked_by text,
  approved_by text,
  bank_account_id text,
  bank_name text,
  check_number text,
  status text,
  reversed_reason text,
  reversed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_check_vouchers_client_id
  on public.check_vouchers(client_id);

create table if not exists public.miscellaneous_payments (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  date date,
  payee_name text,
  amount numeric(18,2),
  bank_account_id text,
  bank_name text,
  check_number text,
  expense_category text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_miscellaneous_payments_client_id
  on public.miscellaneous_payments(client_id);

create table if not exists public.asset_lapsing_schedule (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  date_purchased date,
  invoice_no text,
  description text,
  cost numeric(18,2),
  useful_life_years numeric(10,2),
  salvage_value numeric(18,2),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_asset_lapsing_schedule_client_id
  on public.asset_lapsing_schedule(client_id);

-- ---------------------------------------------------------------------------
-- Billing
-- ---------------------------------------------------------------------------

create table if not exists public.billing_invoices (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  date date,
  due_date date,
  invoice_no text,
  customer_tin text,
  customer_name text,
  customer_address text,
  vat_type text,
  amount numeric(18,2),
  net_of_vat numeric(18,2),
  output_tax numeric(18,2),
  description text,
  status text,
  payment_type text,
  date_paid date,
  is_recurring boolean not null default false,
  recurrence_frequency text,
  next_billing_date date,
  parent_invoice_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_billing_invoices_client_id
  on public.billing_invoices(client_id);
create index if not exists idx_billing_invoices_due_date
  on public.billing_invoices(client_id, due_date);

-- ---------------------------------------------------------------------------
-- Financial statement snapshots
-- ---------------------------------------------------------------------------

create table if not exists public.financial_report_snapshots (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  report_type text not null,
  period_key text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_financial_report_snapshots_client_type
  on public.financial_report_snapshots(client_id, report_type);
create index if not exists idx_financial_report_snapshots_period
  on public.financial_report_snapshots(client_id, period_key);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------

do $$
declare
  t text;
begin
  foreach t in array array[
    'coa_columns',
    'coa_accounts',
    'journal_columns',
    'journal_entries',
    'journal_vouchers',
    'journal_voucher_lines',
    'purchase_orders',
    'receiving_reports',
    'receiving_report_items',
    'payable_invoices',
    'payable_invoice_items',
    'inventory_columns',
    'inventory_items',
    'inventory_movements',
    'app_folders',
    'app_files',
    'tin_entries',
    'tax_deadlines',
    'bank_accounts',
    'withholding_tax_entries',
    'debit_credit_memos',
    'check_vouchers',
    'miscellaneous_payments',
    'asset_lapsing_schedule',
    'billing_invoices',
    'financial_report_snapshots'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I', t, t);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.clients enable row level security;

drop policy if exists clients_select_own on public.clients;
create policy clients_select_own
on public.clients for select
to authenticated
using (user_id = auth.uid());

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

-- Tenant child-table RLS.
do $$
declare
  t text;
begin
  foreach t in array array[
    'purchases',
    'sales',
    'coa_columns',
    'coa_accounts',
    'journal_columns',
    'journal_entries',
    'journal_vouchers',
    'journal_voucher_lines',
    'purchase_orders',
    'receiving_reports',
    'receiving_report_items',
    'payable_invoices',
    'payable_invoice_items',
    'inventory_columns',
    'inventory_items',
    'inventory_movements',
    'app_folders',
    'app_files',
    'tin_entries',
    'tax_deadlines',
    'bank_accounts',
    'withholding_tax_entries',
    'debit_credit_memos',
    'check_vouchers',
    'miscellaneous_payments',
    'asset_lapsing_schedule',
    'billing_invoices',
    'financial_report_snapshots'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);

    execute format('drop policy if exists %I on public.%I', t || '_select_owner', t);
    execute format(
      'create policy %I on public.%I for select to authenticated using (public.is_client_owner(client_id))',
      t || '_select_owner', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_insert_owner', t);
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (public.is_client_owner(client_id))',
      t || '_insert_owner', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_update_owner', t);
    execute format(
      'create policy %I on public.%I for update to authenticated using (public.is_client_owner(client_id)) with check (public.is_client_owner(client_id))',
      t || '_update_owner', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_delete_owner', t);
    execute format(
      'create policy %I on public.%I for delete to authenticated using (public.is_client_owner(client_id))',
      t || '_delete_owner', t
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Realtime: normalized tables
-- ---------------------------------------------------------------------------
-- Supabase Realtime must be enabled for child-table changes to reach the app.
-- The DO block is idempotent and safe to run after tables already exist.
do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'clients','purchases','sales','coa_columns','coa_accounts','journal_columns',
    'journal_entries','journal_vouchers','journal_voucher_lines','purchase_orders',
    'receiving_reports','receiving_report_items','payable_invoices',
    'payable_invoice_items','inventory_columns','inventory_items','inventory_movements',
    'app_folders','app_files','tin_entries','tax_deadlines','bank_accounts',
    'withholding_tax_entries','debit_credit_memos','check_vouchers','miscellaneous_payments',
    'asset_lapsing_schedule','billing_invoices','financial_report_snapshots'
  ] loop
    if not exists (
      select 1
      from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', tbl);
    end if;
  end loop;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication is not available in this database; enable Realtime in Supabase before applying the application realtime subscriptions.';
end $$;

-- ---------------------------------------------------------------------------
-- Storage: private client-files bucket
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public)
values ('client-files', 'client-files', false)
on conflict (id) do update set public = false;

drop policy if exists client_files_select_owner on storage.objects;
create policy client_files_select_owner
on storage.objects for select
to authenticated
using (
  bucket_id = 'client-files'
  and public.is_client_owner((storage.foldername(name))[1])
);

drop policy if exists client_files_insert_owner on storage.objects;
create policy client_files_insert_owner
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'client-files'
  and public.is_client_owner((storage.foldername(name))[1])
);

drop policy if exists client_files_update_owner on storage.objects;
create policy client_files_update_owner
on storage.objects for update
to authenticated
using (
  bucket_id = 'client-files'
  and public.is_client_owner((storage.foldername(name))[1])
)
with check (
  bucket_id = 'client-files'
  and public.is_client_owner((storage.foldername(name))[1])
);

drop policy if exists client_files_delete_owner on storage.objects;
create policy client_files_delete_owner
on storage.objects for delete
to authenticated
using (
  bucket_id = 'client-files'
  and public.is_client_owner((storage.foldername(name))[1])
);

-- ---------------------------------------------------------------------------
-- Recommended verification queries
-- ---------------------------------------------------------------------------

-- 1. Confirm every client has exactly one owner:
-- select id, user_id from public.clients order by id;

-- 2. Confirm child rows cannot exist without a client:
-- select table_name
-- from information_schema.columns
-- where table_schema = 'public' and column_name = 'client_id'
-- order by table_name;

-- 3. Confirm RLS is enabled:
-- select schemaname, tablename, rowsecurity
-- from pg_tables
-- where schemaname = 'public'
-- order by tablename;

-- 4. Legacy payload is intentionally retained until migration verification:
-- select count(*) as clients_with_legacy_data
-- from public.clients
-- where data is not null;

-- DO NOT DROP clients.data until:
--   * legacy -> normalized row counts are verified
--   * financial totals reconcile
--   * attachment files are verified in Storage
--   * normalized app build is deployed and tested
--   * rollback window has expired
