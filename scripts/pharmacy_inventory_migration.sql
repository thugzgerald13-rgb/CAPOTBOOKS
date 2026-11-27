-- ============================================================================
-- Pharmacy Product Management — variant migration
-- ----------------------------------------------------------------------------
-- Adds the lot/batch receiving table used by the customized Inventory variant
-- (`src/custom/pages/PharmacyInventory.tsx`, variant id `pharmacy-inventory`
-- registered against slot `page.inventory`).
--
-- The drug catalogue itself reuses the existing `inventory_items` table:
-- generic/brand name, strength, dosage, dosage form, unit configuration and
-- the multiple scanned barcodes are stored in `inventory_items.custom_fields`
-- (JSONB), so no catalogue-column migration is required. This table only holds
-- the per-batch / per-lot receiving records (supplier, lot no, expiry date,
-- purchase cost, pack→base conversion factors, remaining quantity).
--
-- Safe to re-run. Run after scripts/schema.sql (depends on public.clients,
-- public.set_updated_at() and public.is_client_owner()).
-- ============================================================================

create table if not exists public.pharmacy_stock_batches (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  item_id text,
  item_name text,
  item_code text,
  barcode text,
  supplier_name text,
  batch_lot_no text,
  expiry_date date,
  pack_unit text,
  -- Base (inventory) units contained in one purchase pack, e.g. 100 tablets/box.
  pack_size numeric(18,4),
  packs_received numeric(18,4),
  -- packs_received × pack_size: quantity added to the item's base stock level.
  qty_received_base numeric(18,4),
  -- Remaining quantity in base units (decremented by outbound/adjustments).
  qty_on_hand_base numeric(18,4),
  unit_cost_pack numeric(18,4),
  unit_cost_base numeric(18,4),
  total_cost numeric(18,2),
  reference text,
  notes text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_pharmacy_batches_client_id
  on public.pharmacy_stock_batches(client_id);
create index if not exists idx_pharmacy_batches_item_id
  on public.pharmacy_stock_batches(client_id, item_id);
create index if not exists idx_pharmacy_batches_expiry
  on public.pharmacy_stock_batches(client_id, expiry_date);

-- updated_at trigger (mirrors scripts/schema.sql trigger list)
drop trigger if exists trg_pharmacy_stock_batches_updated_at on public.pharmacy_stock_batches;
create trigger trg_pharmacy_stock_batches_updated_at
  before update on public.pharmacy_stock_batches
  for each row execute function public.set_updated_at();

-- Row Level Security — tenant policies mirroring inventory_items
alter table public.pharmacy_stock_batches enable row level security;

drop policy if exists pharmacy_stock_batches_select_owner on public.pharmacy_stock_batches;
create policy pharmacy_stock_batches_select_owner
  on public.pharmacy_stock_batches for select
  to authenticated
  using (public.is_client_owner(client_id));

drop policy if exists pharmacy_stock_batches_insert_owner on public.pharmacy_stock_batches;
create policy pharmacy_stock_batches_insert_owner
  on public.pharmacy_stock_batches for insert
  to authenticated
  with check (public.is_client_owner(client_id));

drop policy if exists pharmacy_stock_batches_update_owner on public.pharmacy_stock_batches;
create policy pharmacy_stock_batches_update_owner
  on public.pharmacy_stock_batches for update
  to authenticated
  using (public.is_client_owner(client_id))
  with check (public.is_client_owner(client_id));

drop policy if exists pharmacy_stock_batches_delete_owner on public.pharmacy_stock_batches;
create policy pharmacy_stock_batches_delete_owner
  on public.pharmacy_stock_batches for delete
  to authenticated
  using (public.is_client_owner(client_id));

-- Realtime: include the batch table in the application publication when the
-- publication exists (mirrors schema.sql exception-tolerant DO block).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'pharmacy_stock_batches'
  ) then
    execute 'alter publication supabase_realtime add table public.pharmacy_stock_batches';
  end if;
exception
  when undefined_object then
    raise notice 'supabase_realtime publication is not available; pharmacy_stock_batches realtime subscription skipped.';
end $$;

-- ----------------------------------------------------------------------------
-- Verification
--   select count(*) from public.pharmacy_stock_batches;
--   select tablename, rowsecurity from pg_tables
--   where schemaname = 'public' and tablename = 'pharmacy_stock_batches';
-- ----------------------------------------------------------------------------
