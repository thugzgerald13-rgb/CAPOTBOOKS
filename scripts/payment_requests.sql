-- ============================================================================
-- Manual GCash payment flow — schema migration
-- Run this in Supabase → SQL Editor.
-- ============================================================================

-- 1. Subscription columns on profiles (source of truth — not localStorage).
--    `role` lets the admin/developer account manage payment requests via RLS.
alter table public.profiles add column if not exists role text;
alter table public.profiles add column if not exists subscription_plan text default 'free';
alter table public.profiles add column if not exists subscription_status text default 'active';
alter table public.profiles add column if not exists subscription_activated_at timestamptz;
alter table public.profiles add column if not exists subscription_expires_at timestamptz;

-- 2. Payment requests submitted by users after scanning the GCash QR.
--    user_email / user_name are denormalized at insert time so the admin list
--    works without joining through profiles RLS.
create table if not exists public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  user_email text,
  user_name text,
  plan text not null check (plan in ('starter','pro','enterprise')),
  amount numeric(10,2) not null,
  receipt_url text,                 -- storage path in the 'receipts' bucket
  status text default 'pending' check (status in ('pending','approved','rejected')),
  admin_notes text,
  reviewed_by uuid references public.profiles(id),
  reviewed_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists idx_payment_requests_user on public.payment_requests(user_id);
create index if not exists idx_payment_requests_status on public.payment_requests(status);

alter table public.payment_requests enable row level security;

-- Users see only their own requests.
drop policy if exists "Users view own payment requests" on public.payment_requests;
create policy "Users view own payment requests"
  on public.payment_requests for select
  using (auth.uid() = user_id);

-- Users can create their own requests.
drop policy if exists "Users create payment requests" on public.payment_requests;
create policy "Users create payment requests"
  on public.payment_requests for insert
  with check (auth.uid() = user_id);

-- Admin (profiles.role = 'admin') can view & update all requests.
drop policy if exists "Admin manage all payment requests" on public.payment_requests;
create policy "Admin manage all payment requests"
  on public.payment_requests for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- ----------------------------------------------------------------------------
-- 3. SECURITY DEFINER RPCs — the admin page calls these so we never need a
--    broad "admin can update any profile" RLS policy. Only callers whose
--    profiles.role = 'admin' may execute them.
-- ----------------------------------------------------------------------------
create or replace function public.approve_payment_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_plan text;
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;

  select user_id, plan into v_user_id, v_plan
  from public.payment_requests where id = p_request_id;

  if not found then
    raise exception 'Payment request not found';
  end if;

  update public.payment_requests
  set status = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now(),
      admin_notes = coalesce(admin_notes, 'Approved — plan activated.')
  where id = p_request_id;

  -- Activate the plan for 30 days from approval.
  update public.profiles
  set subscription_plan = v_plan,
      subscription_status = 'active',
      subscription_activated_at = now(),
      subscription_expires_at = now() + interval '30 days'
  where id = v_user_id;
end;
$$;

revoke all on function public.approve_payment_request(uuid) from public;
grant execute on function public.approve_payment_request(uuid) to authenticated;

create or replace function public.reject_payment_request(p_request_id uuid, p_notes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;

  update public.payment_requests
  set status = 'rejected',
      admin_notes = p_notes,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.reject_payment_request(uuid, text) from public;
grant execute on function public.reject_payment_request(uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. Mark YOUR account as admin (replace with your email).
--    The app also gates the admin page by developer email, but role='admin'
--    is what unlocks RLS + the approve/reject RPCs above.
-- ----------------------------------------------------------------------------
-- update public.profiles set role = 'admin' where email = 'YOUR_EMAIL_HERE';

-- ----------------------------------------------------------------------------
-- 5. Storage (do this in the dashboard, SQL can't create buckets reliably):
--      Supabase → Storage → New bucket → name: receipts → Public bucket: ON
--    Then add these storage policies (or run in SQL Editor):
-- ----------------------------------------------------------------------------
-- insert into storage.buckets (id, name, public) values ('receipts','receipts', true)
--   on conflict (id) do update set public = true;
--
-- create policy "Users upload own receipts" on storage.objects for insert
--   to authenticated with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = auth.uid()::text);
-- create policy "Receipts are public" on storage.objects for select
--   to public using (bucket_id = 'receipts');
