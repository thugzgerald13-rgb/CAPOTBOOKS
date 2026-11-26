-- Per-account breakdown of a purchase ("Payment for" + additional accounts).
-- Shape: [{ "accountTitle": "Office Supplies", "amount": 1500.00 }, ...] (main account first).
-- NULL when the purchase has a single account. Run this BEFORE deploying the app change.
alter table public.purchases
  add column if not exists payment_entries jsonb;
