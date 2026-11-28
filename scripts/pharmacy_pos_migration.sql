-- ============================================================================
-- Pharmacy Point-of-Sale (POS) — migration
-- ----------------------------------------------------------------------------
-- Tables backing the dev-only Cashier POS (route `/pos`, sidebar button under
-- Transactions shown only to the developer account until enabled for users):
--   * pos_transactions — completed / voided / refunded cashier sales, lines and
--     Senior Citizen / PWD discount records, payment and accounting linkage.
--   * pos_shifts       — cashier open/close shifts with cash and sales totals.
--
-- The POS page works offline-first: when these tables do not exist yet (or the
-- device is disconnected), transactions are queued in IndexedDB (Dexie,
-- src/lib/pos/posDb.ts) and flushed with duplicate protection when connectivity
-- returns. Server-side stock validation happens during synchronization, so a
-- disconnected device never guarantees globally current stock levels.
--
-- Safe to re-run. Run after scripts/schema.sql and
-- scripts/pharmacy_inventory_migration.sql (depends on public.clients).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- pos_transactions
-- One cashier sale. `id` is a client-generated UUID = the idempotency key used
-- to protect against duplicate entries during offline synchronization.
-- ---------------------------------------------------------------------------
create table if not exists public.pos_transactions (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  receipt_no text not null,
  cashier text,
  shift_id text,
  status text not null default 'completed'
    check (status in ('completed', 'voided', 'refunded')),
  customer_type text not null default 'regular'
    check (customer_type in ('regular', 'senior', 'pwd')),
  customer_name text,
  customer_id_type text,        -- e.g. Senior Citizen ID, PWD ID, Driver's License
  customer_id_no text,
  customer_tin text,
  customer_address text,
  discount_rate numeric(8,4) not null default 0,
  discount_amount numeric(18,2) not null default 0,
  discount_senior numeric(18,2) not null default 0,
  discount_pwd numeric(18,2) not null default 0,
  gross_amount numeric(18,2) not null default 0,
  vat_amount numeric(18,2) not null default 0,
  exempt_amount numeric(18,2) not null default 0,
  net_amount numeric(18,2) not null default 0,
  vat_type text,                -- VAT Exempt / VATable / Zero-Rated
  payment_method text,          -- Cash, Check, Credit Card, E-Wallet, Bank Transfer, On Account
  tendered numeric(18,2) not null default 0,
  change_due numeric(18,2) not null default 0,
  lines jsonb not null default '[]'::jsonb,
  sale_id text,                 -- linked `sales` journal row (accounting integration)
  void_reason text,
  refund_reason text,
  refund_of text,               -- pos_transactions.id this record refunds
  sync_conflict text,           -- stock/validation conflict reported on sync
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_tx_client_id
  on public.pos_transactions(client_id);
create index if not exists idx_pos_tx_created_at
  on public.pos_transactions(client_id, created_at desc);
create index if not exists idx_pos_tx_receipt_no
  on public.pos_transactions(client_id, receipt_no);
create index if not exists idx_pos_tx_shift_id
  on public.pos_transactions(client_id, shift_id);
create unique index if not exists uq_pos_tx_client_receipt
  on public.pos_transactions(client_id, receipt_no);

drop trigger if exists trg_pos_transactions_updated_at on public.pos_transactions;
create trigger trg_pos_transactions_updated_at
before update on public.pos_transactions
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- pos_shifts — cashier shift open/close with cash accountability.
-- ---------------------------------------------------------------------------
create table if not exists public.pos_shifts (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  cashier text,
  status text not null default 'open' check (status in ('open', 'closed')),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  opening_cash numeric(18,2) not null default 0,
  closing_cash numeric(18,2),
  expected_cash numeric(18,2),
  actual_cash numeric(18,2),
  cash_variance numeric(18,2),
  totals jsonb not null default '{}'::jsonb,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pos_shifts_client_id
  on public.pos_shifts(client_id);
create index if not exists idx_pos_shifts_status
  on public.pos_shifts(client_id, status);

drop trigger if exists trg_pos_shifts_updated_at on public.pos_shifts;
create trigger trg_pos_shifts_updated_at
before update on public.pos_shifts
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security — tenant policies mirroring pharmacy_stock_batches /
-- inventory_items (owner writes; future cashier roles may be granted narrower
-- policies once the permission model is extended).
-- ---------------------------------------------------------------------------
alter table public.pos_transactions enable row level security;
alter table public.pos_shifts enable row level security;

drop policy if exists pos_transactions_select_owner on public.pos_transactions;
create policy pos_transactions_select_owner
  on public.pos_transactions for select
  to authenticated
  using (public.is_client_owner(client_id));

drop policy if exists pos_transactions_insert_owner on public.pos_transactions;
create policy pos_transactions_insert_owner
  on public.pos_transactions for insert
  to authenticated
  with check (public.is_client_owner(client_id));

drop policy if exists pos_transactions_update_owner on public.pos_transactions;
create policy pos_transactions_update_owner
  on public.pos_transactions for update
  to authenticated
  using (public.is_client_owner(client_id))
  with check (public.is_client_owner(client_id));

drop policy if exists pos_transactions_delete_owner on public.pos_transactions;
create policy pos_transactions_delete_owner
  on public.pos_transactions for delete
  to authenticated
  using (public.is_client_owner(client_id));

drop policy if exists pos_shifts_select_owner on public.pos_shifts;
create policy pos_shifts_select_owner
  on public.pos_shifts for select
  to authenticated
  using (public.is_client_owner(client_id));

drop policy if exists pos_shifts_insert_owner on public.pos_shifts;
create policy pos_shifts_insert_owner
  on public.pos_shifts for insert
  to authenticated
  with check (public.is_client_owner(client_id));

drop policy if exists pos_shifts_update_owner on public.pos_shifts;
create policy pos_shifts_update_owner
  on public.pos_shifts for update
  to authenticated
  using (public.is_client_owner(client_id))
  with check (public.is_client_owner(client_id));

drop policy if exists pos_shifts_delete_owner on public.pos_shifts;
create policy pos_shifts_delete_owner
  on public.pos_shifts for delete
  to authenticated
  using (public.is_client_owner(client_id));

-- Realtime: include both tables in the application publication when the
-- publication exists (exception-tolerant, mirrors schema.sql pattern).
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'pos_transactions'
  ) then
    execute 'alter publication supabase_realtime add table public.pos_transactions';
  end if;
exception when undefined_object then
  raise notice 'supabase_realtime unavailable; pos_transactions realtime skipped.';
end $$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'pos_shifts'
  ) then
    execute 'alter publication supabase_realtime add table public.pos_shifts';
  end if;
exception when undefined_object then
  raise notice 'supabase_realtime unavailable; pos_shifts realtime skipped.';
end $$;

-- ---------------------------------------------------------------------------
-- Verification
--   select count(*) from public.pos_transactions;
--   select count(*) from public.pos_shifts;
-- ---------------------------------------------------------------------------
