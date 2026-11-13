-- CAPOTBOOKS Billing Nature / Sales Journal posting support.
-- Run once in Supabase SQL Editor before deploying this Billing update.
-- line_items is JSONB so Nature Billing, linked Advance Account Title, and
-- deterministic Sales Journal source IDs persist together with each invoice.

alter table public.billing_invoices
  add column if not exists customer_email text,
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists discount_percent numeric(9,4) not null default 0,
  add column if not exists template_id text;

comment on column public.billing_invoices.line_items is
  'Invoice lines including natureBilling, advanceAccountId, advanceAccountTitle, postingAccountTitle, amount, and Sales Journal source ID.';
