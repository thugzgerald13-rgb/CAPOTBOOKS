-- ===========================================================================
-- BIR E-Invoicing System (EIS) migration
-- Adds EIS settings, transmission audit trail, and EIS status columns on
-- billing invoices / sales. Run AFTER scripts/schema.sql.
--
-- Retention: eis_transmissions keeps JSON + JWS + BIR acknowledgments for the
-- 10-year record-keeping period required by the EIS (RR 11-2025 / RR 26-2025,
-- RMC 98-2026). Gating: PTI (Permit to Issue) before first e-invoice; EIS
-- Certification within 6 months of PTI. PTT (s.237-A reporting) not yet operative.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- EIS settings (per client / taxpayer)
-- ---------------------------------------------------------------------------
create table if not exists public.eis_settings (
  client_id text primary key references public.clients(id) on delete cascade,
  enabled boolean not null default false,
  environment text not null default 'sandbox' check (environment in ('sandbox','production')),
  application_key text,                    -- EIS Certification Portal Application Key
  covered_category text not null default 'cas-cba-software', -- Wave-1 group; 'micro-exempt' = voluntary
  eis_certificate_number text,             -- issued after sandbox tests pass
  permit_to_issue_number text,             -- PTI — REQUIRED before first e-invoice (RMC 98-2026)
  permit_to_issue_date date,               -- PTI issue date (6-month certification clock)
  permit_to_transmit_number text,          -- PTT — s.237-A reporting only, not yet operative (Oct 2026)
  certification_tests jsonb,               -- 5 mandatory + 2 optional API-callback test results
  default_delivery_method text not null default 'email', -- email/online_viewing/qr_code/mobile_app/web_platform
  taxpayer_tin text,                       -- 9 digits
  branch_code text not null default '00000',
  system_type text not null default 'CAS' check (system_type in ('CAS','CRM/POS')),
  signing_key_id text,
  public_key_jwk jsonb,
  -- NOTE: private key is NOT stored here. In production it lives in the
  -- eis-transmit Edge Function's secrets (SUPABASE_VAULT). Browser sandbox
  -- mode stores a passphrase-encrypted copy in localStorage only.
  use_edge_proxy boolean not null default true,
  whitelisted_ips text[],
  callback_url text,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- EIS transmission audit trail (10-year retention)
-- ---------------------------------------------------------------------------
create table if not exists public.eis_transmissions (
  id text primary key,
  client_id text not null references public.clients(id) on delete cascade,
  invoice_id text,                         -- billing_invoices.id or sale ref
  invoice_number text,
  eis_unique_id text not null,             -- 24 chars
  doc_type text not null check (doc_type in ('SI','OR','DR','CR')),
  issue_date date not null,
  amount_due numeric(14,2) not null default 0,
  status text not null default 'queued'
    check (status in ('draft','queued','submitted','accepted','rejected','cancelled')),
  batch_id text,                           -- one POST = 1..100 invoices
  submitted_at timestamptz,
  bir_ack_code text,                       -- ACC / SYN004 / ERR002 / ERR004 ...
  bir_ack_message text,
  bir_ack_at timestamptz,
  attempts integer not null default 0,
  last_error text,
  invoice_json jsonb,                      -- structured v2.01 JSON (retained)
  jws text,                                -- compact JWS signature (retained)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_eis_transmissions_client on public.eis_transmissions(client_id);
create index if not exists idx_eis_transmissions_status on public.eis_transmissions(client_id, status);
create unique index if not exists idx_eis_unique_id on public.eis_transmissions(eis_unique_id);

create trigger set_eis_transmissions_updated_at
  before update on public.eis_transmissions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- EIS status columns on billing invoices & sales (denormalized for fast UI)
-- ---------------------------------------------------------------------------
alter table public.billing_invoices
  add column if not exists eis_unique_id text,
  add column if not exists eis_doc_type text check (eis_doc_type in ('SI','OR','DR','CR')),
  add column if not exists eis_status text check (eis_status in ('queued','submitted','accepted','rejected','cancelled')),
  add column if not exists eis_ack_code text,
  add column if not exists eis_submitted_at timestamptz;

alter table public.sales
  add column if not exists eis_unique_id text,
  add column if not exists eis_doc_type text check (eis_doc_type in ('SI','OR','DR','CR')),
  add column if not exists eis_status text check (eis_status in ('queued','submitted','accepted','rejected','cancelled')),
  add column if not exists eis_ack_code text,
  add column if not exists eis_submitted_at timestamptz;

-- ---------------------------------------------------------------------------
-- RLS (mirrors the existing tenant-scoped policy pattern in schema.sql)
-- ---------------------------------------------------------------------------
alter table public.eis_settings enable row level security;
alter table public.eis_transmissions enable row level security;

-- Owners + account members can read/write their own client's EIS data.
drop policy if exists "eis_settings tenant select" on public.eis_settings;
create policy "eis_settings tenant select" on public.eis_settings
  for select using (public.is_client_owner_or_member(client_id));
drop policy if exists "eis_settings tenant write" on public.eis_settings;
create policy "eis_settings tenant write" on public.eis_settings
  for all using (public.is_client_owner_or_member(client_id))
  with check (public.is_client_owner_or_member(client_id));

drop policy if exists "eis_transmissions tenant select" on public.eis_transmissions;
create policy "eis_transmissions tenant select" on public.eis_transmissions
  for select using (public.is_client_owner_or_member(client_id));
drop policy if exists "eis_transmissions tenant write" on public.eis_transmissions;
create policy "eis_transmissions tenant write" on public.eis_transmissions
  for all using (public.is_client_owner_or_member(client_id))
  with check (public.is_client_owner_or_member(client_id));

-- NOTE: If your schema.sql defines is_client_owner_or_member() differently,
-- replace that function name above with your actual tenant-check helper.
