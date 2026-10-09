-- ============================================================================
-- Trial + module entitlements (replaces the 7-transaction cap and flat tiers)
-- Run in Supabase -> SQL Editor AFTER scripts/payment_requests.sql.
-- Idempotent: safe to re-run.
-- ============================================================================

-- 1. Trial clock on the account owner's profile ------------------------------
alter table public.profiles add column if not exists trial_started_at timestamptz;
alter table public.profiles add column if not exists trial_ends_at timestamptz;

-- 2. Paid module entitlements (one row per account owner + module) -----------
create table if not exists public.account_modules (
  user_id uuid not null references public.profiles(id) on delete cascade,
  module text not null check (module in ('accounting_books','reports','billing','compliance','inventory','team')),
  expires_at timestamptz not null,
  source text not null default 'purchase' check (source in ('purchase','admin')),
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (user_id, module)
);
-- Expand the allowed module keys for both fresh installs and installations
-- that already created account_modules using the earlier pricing migration.
alter table public.account_modules drop constraint if exists account_modules_module_check;
alter table public.account_modules
  add constraint account_modules_module_check
  check (module in ('accounting_books','reports','billing','compliance','inventory','team'));

create index if not exists idx_account_modules_expiry on public.account_modules(expires_at);

alter table public.account_modules enable row level security;

drop policy if exists "Users view own modules" on public.account_modules;
create policy "Users view own modules"
  on public.account_modules for select
  using (auth.uid() = user_id);

drop policy if exists "Admin manage all modules" on public.account_modules;
create policy "Admin manage all modules"
  on public.account_modules for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
-- No insert/update policy for regular users: rows are written only by the
-- SECURITY DEFINER RPCs below.

-- 3. payment_requests: pay for modules, monthly or annual --------------------
alter table public.payment_requests drop constraint if exists payment_requests_plan_check;
alter table public.payment_requests add column if not exists modules text[];
alter table public.payment_requests add column if not exists billing_cycle text not null default 'monthly';
alter table public.payment_requests drop constraint if exists payment_requests_billing_cycle_check;
alter table public.payment_requests
  add constraint payment_requests_billing_cycle_check check (billing_cycle in ('monthly','annual'));

-- Users may only file PENDING requests for themselves.
drop policy if exists "Users create payment requests" on public.payment_requests;
create policy "Users create payment requests"
  on public.payment_requests for insert
  with check (auth.uid() = user_id and status = 'pending');

-- 4. Who owns the entitlements for a given login? ----------------------------
-- Team members (managed or independent) use their account owner's trial and
-- modules. Everyone else is their own owner.
create or replace function public.entitlement_owner(p_user uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner uuid;
begin
  begin
    select l.owner_user_id into v_owner
    from public.account_team_links l
    where l.member_user_id = p_user and l.status = 'active'
    limit 1;
  exception when others then
    v_owner := null;
  end;

  if v_owner is null then
    -- Original account_membership schema (backward compatible).
    begin
      select ba.owner_id into v_owner
      from public.account_membership am
      join public.business_accounts ba on ba.id = am.account_id
      where am.user_id = p_user and am.is_active and ba.owner_id <> p_user
      limit 1;
    exception when others then
      v_owner := null;
    end;
  end if;

  return coalesce(v_owner, p_user);
end;
$$;
revoke all on function public.entitlement_owner(uuid) from public;
grant execute on function public.entitlement_owner(uuid) to authenticated;

-- 5. get_my_entitlements() — the single call the app makes -------------------
-- Lazily starts the trial the first time an account owner who has chosen a
-- role calls it: 7 days for Business Owners and Accountants/Bookkeepers
-- (keep in sync with TRIAL_DAYS in src/lib/modules.ts).
create or replace function public.get_my_entitlements()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid;
  v_member boolean;
  v_role text;
  v_trial_start timestamptz;
  v_trial_end timestamptz;
  v_plan text;
  v_status text;
  v_plan_exp timestamptz;
  v_mods jsonb;
  v_legacy text[];
  v_legacy_exp timestamptz;
  v_is_admin boolean;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_owner := public.entitlement_owner(v_uid);
  v_member := v_owner <> v_uid;

  select lower(coalesce(user_role, '')), trial_started_at, trial_ends_at,
         subscription_plan, subscription_status, subscription_expires_at
    into v_role, v_trial_start, v_trial_end, v_plan, v_status, v_plan_exp
  from public.profiles where id = v_owner;

  v_is_admin := exists (select 1 from public.profiles where id = v_uid and role = 'admin');

  -- Start the trial once, server-side, for account owners with a chosen role.
  if not v_member and v_trial_start is null and v_role <> '' then
    v_trial_start := now();
    v_trial_end := now() + interval '7 days';
    update public.profiles
       set trial_started_at = v_trial_start, trial_ends_at = v_trial_end
     where id = v_owner;
  end if;

  -- Paid modules still in date.
  select coalesce(jsonb_agg(jsonb_build_object(
           'module', m.module, 'expires_at', m.expires_at, 'source', m.source)), '[]'::jsonb)
    into v_mods
  from public.account_modules m
  where m.user_id = v_owner and m.expires_at > now();

  -- Grandfather the old flat plans so existing payers keep what they paid for.
  if v_plan in ('starter','pro','enterprise')
     and coalesce(v_status, 'active') = 'active'
     and (v_plan_exp is null or v_plan_exp > now()) then
    v_legacy := case v_plan
      when 'starter' then array['accounting_books','reports','billing']
      when 'pro'     then array['accounting_books','reports','billing','compliance','inventory']
      else                array['accounting_books','reports','billing','compliance','inventory','team']
    end;
    v_legacy_exp := coalesce(v_plan_exp, now() + interval '3650 days');
    v_mods := v_mods || coalesce((
      select jsonb_agg(jsonb_build_object('module', x, 'expires_at', v_legacy_exp, 'source', 'legacy_plan'))
      from unnest(v_legacy) as x
    ), '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'trial_started_at', v_trial_start,
    'trial_ends_at',    v_trial_end,
    'modules',          v_mods,
    'is_team_member',   v_member,
    'is_admin',         v_is_admin,
    'server_now',       now()
  );
end;
$$;
revoke all on function public.get_my_entitlements() from public;
grant execute on function public.get_my_entitlements() to authenticated;

-- 6. approve / reject (replaces the versions in payment_requests.sql) --------
create or replace function public.approve_payment_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req record;
  v_interval interval;
  v_mod text;
  v_allowed text[] := array['accounting_books','reports','billing','compliance','inventory','team'];
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;

  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'Payment request not found';
  end if;
  if v_req.status <> 'pending' then
    raise exception 'Request already %', v_req.status;
  end if;

  if v_req.modules is not null and coalesce(array_length(v_req.modules, 1), 0) > 0 then
    -- Module purchase. Renewals extend from the later of "now" and the current
    -- expiry, so paying early never wastes days.
    v_interval := case v_req.billing_cycle when 'annual' then interval '365 days' else interval '30 days' end;
    foreach v_mod in array v_req.modules loop
      if not (v_mod = any (v_allowed)) then
        raise exception 'Unknown module: %', v_mod;
      end if;
      insert into public.account_modules (user_id, module, expires_at, source, payment_request_id, updated_at)
      values (v_req.user_id, v_mod, now() + v_interval, 'purchase', v_req.id, now())
      on conflict (user_id, module) do update
        set expires_at = greatest(account_modules.expires_at, now()) + v_interval,
            source = 'purchase',
            payment_request_id = excluded.payment_request_id,
            updated_at = now();
    end loop;
  else
    -- Legacy flat-plan request (submitted before modules existed).
    update public.profiles
       set subscription_plan = v_req.plan,
           subscription_status = 'active',
           subscription_activated_at = now(),
           subscription_expires_at = now() + interval '30 days'
     where id = v_req.user_id;
  end if;

  update public.payment_requests
     set status = 'approved',
         reviewed_by = auth.uid(),
         reviewed_at = now(),
         admin_notes = coalesce(admin_notes, 'Approved — modules activated.')
   where id = p_request_id;
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
   where id = p_request_id and status = 'pending';

  if not found then
    raise exception 'Request not found or already reviewed';
  end if;
end;
$$;
revoke all on function public.reject_payment_request(uuid, text) from public;
grant execute on function public.reject_payment_request(uuid, text) to authenticated;

-- 7. Admin tool: extend someone's trial (e.g. an accountant evaluating) ------
--   select public.admin_extend_trial('<user uuid>', 7);
create or replace function public.admin_extend_trial(p_user_id uuid, p_days int)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from public.profiles where id = auth.uid() and role = 'admin') then
    raise exception 'Admin access required';
  end if;
  update public.profiles
     set trial_started_at = coalesce(trial_started_at, now()),
         trial_ends_at = greatest(coalesce(trial_ends_at, now()), now()) + make_interval(days => p_days)
   where id = p_user_id;
end;
$$;
revoke all on function public.admin_extend_trial(uuid, int) from public;
grant execute on function public.admin_extend_trial(uuid, int) to authenticated;
