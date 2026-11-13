-- CAPOTBOOKS service invoice support
-- Run once in Supabase SQL Editor before deploying the updated Billing page.
alter table public.billing_invoices
  add column if not exists customer_email text,
  add column if not exists line_items jsonb not null default '[]'::jsonb,
  add column if not exists discount_percent numeric(9,4) not null default 0,
  add column if not exists template_id text;

comment on column public.billing_invoices.line_items is
  'Service invoice lines; each item stores description, qty, unitPrice and amount.';
comment on column public.billing_invoices.discount_percent is
  'Invoice-level discount percentage applied to the sum of service invoice lines.';
comment on column public.billing_invoices.template_id is
  'Invoice template selected when the service invoice was created.';


-- Supports recurring-bill schedule lookups by client and next due date.
create index if not exists idx_billing_invoices_recurring_due
  on public.billing_invoices(client_id, next_billing_date)
  where is_recurring = true;

comment on column public.billing_invoices.next_billing_date is
  'Next scheduled generation date for an active recurring bill.';
comment on column public.billing_invoices.parent_invoice_id is
  'Links generated recurring bills to their recurring bill schedule record.';
