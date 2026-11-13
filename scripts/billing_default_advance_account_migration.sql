-- Company-wide default Advance Account for Billing invoices.
-- Apply this migration in Supabase SQL Editor before deploying the frontend patch.
-- The mapping is stored on the client/company record so all authorized team
-- members use the same liability account for newly created Advances bill lines.

ALTER TABLE public.clients
  ADD COLUMN IF NOT EXISTS default_advance_account_id text,
  ADD COLUMN IF NOT EXISTS default_advance_account_title text;

COMMENT ON COLUMN public.clients.default_advance_account_id IS
  'Company default postable liability account ID used for Billing lines marked Advances.';
COMMENT ON COLUMN public.clients.default_advance_account_title IS
  'Snapshot of the company default Advance Account title for display and compatibility.';
