-- Database-enforced RELIEF filed-month protection and purchase rollover.
-- Apply AFTER scripts/schema.sql and scripts/relief_supabase_migration.sql.
-- Ordinary purchases remain encodable in public.purchases. This migration
-- assigns each purchase to its RELIEF month without changing its transaction date.

begin;

do $$
begin
  if to_regclass('public.purchases') is null then
    raise exception 'public.purchases is missing. Apply scripts/schema.sql first.';
  end if;
  if to_regclass('public.relief_records') is null then
    raise exception 'public.relief_records is missing. Apply scripts/relief_supabase_migration.sql first.';
  end if;
end;
$$;

-- The app stores filed-month snapshots as relief_records rows too.
-- Ensure the type constraint allows every RELIEF record type used by the app.
alter table public.relief_records drop constraint if exists relief_records_type_check;
alter table public.relief_records
  add constraint relief_records_type_check
  check (record_type in ('purchase_transfer', 'importation', 'settings', 'filed', 'audit'));

create table if not exists public.relief_purchase_assignments (
  purchase_id text primary key references public.purchases(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  source_month text not null check (source_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  relief_month text check (relief_month is null or relief_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  assignment_status text not null check (assignment_status in ('same_month', 'filed_snapshot', 'rolled_forward', 'filed_rollover_snapshot', 'no_unfiled_month')),
  updated_at timestamptz not null default now(),
  constraint relief_purchase_assignment_year_check check (
    relief_month is null or left(source_month, 4) = left(relief_month, 4)
  )
);

create index if not exists idx_relief_purchase_assignments_client_month
  on public.relief_purchase_assignments(client_id, relief_month, source_month);

alter table public.relief_purchase_assignments enable row level security;
revoke all on table public.relief_purchase_assignments from public, anon, authenticated;
grant select on table public.relief_purchase_assignments to authenticated;

drop policy if exists relief_purchase_assignments_select_authorized on public.relief_purchase_assignments;
create policy relief_purchase_assignments_select_authorized
  on public.relief_purchase_assignments
  for select to authenticated
  using (public.can_access_client_operation(client_id, 'view_reports'));

-- True when this source transaction belonged to the snapshot at filing.
-- New-format filings use stable transaction IDs; older filings fall back to
-- created_at compared to the persisted filedAt timestamp.
create or replace function public.relief_purchase_was_in_filed_snapshot(
  p_client_id text,
  p_purchase_id text,
  p_source_month text,
  p_created_at timestamptz
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_data jsonb;
  v_filed_at timestamptz;
  v_filed_at_text text;
begin
  select rr.data
    into v_data
    from public.relief_records rr
   where rr.client_id = p_client_id
     and rr.record_type = 'filed'
     and rr.record_id = 'purchases|' || p_source_month
   limit 1;

  if not found then
    return false;
  end if;

  if jsonb_typeof(v_data -> 'purchaseTransactionIds') = 'array' then
    return coalesce((v_data -> 'purchaseTransactionIds') ? p_purchase_id, false);
  end if;

  v_filed_at_text := nullif(v_data ->> 'filedAt', '');
  if v_filed_at_text is null then
    -- The legacy record does not contain enough evidence to certify that a
    -- purchase was part of the filed snapshot. Fail closed: treat it as late.
    return false;
  end if;
  begin
    v_filed_at := v_filed_at_text::timestamptz;
  exception when others then
    return false;
  end;

  return coalesce(p_created_at <= v_filed_at, false);
end;
$$;

revoke all on function public.relief_purchase_was_in_filed_snapshot(text, text, text, timestamptz) from public, anon, authenticated;

-- Recover and preserve roll-forward rows that were already included in a later
-- filed RELIEF snapshot before this database assignment migration was installed.
-- Filed SLP entryIds are aggregate supplier rows, so the source month + supplier
-- key is matched together with created_at <= the destination filing timestamp.
create or replace function public.relief_purchase_filed_rollover_snapshot_month(
  p_client_id text,
  p_purchase_id text,
  p_source_month text,
  p_created_at timestamptz
) returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_tin text;
  v_supplier_name text;
  v_supplier_key text;
  v_entry_key text;
  v_row record;
  v_filed_at timestamptz;
  v_filed_at_text text;
  v_target_month text;
begin
  -- Only reconstruct a rolled-forward filed snapshot while the source filing
  -- still exists. A source-snapshot member must never be moved based on another
  -- purchase from the same supplier sharing its aggregate row key.
  if not exists (
    select 1 from public.relief_records rr
     where rr.client_id = p_client_id
       and rr.record_type = 'filed'
       and rr.record_id = 'purchases|' || p_source_month
  ) then
    return null;
  end if;
  if public.relief_purchase_was_in_filed_snapshot(p_client_id, p_purchase_id, p_source_month, p_created_at) then
    return null;
  end if;

  select p.supplier_tin, p.supplier_name
    into v_tin, v_supplier_name
    from public.purchases p
   where p.id = p_purchase_id
     and p.client_id = p_client_id;
  if not found then return null; end if;

  if coalesce(trim(v_tin), '') = '' then
    v_supplier_key := '000000002';
  else
    v_supplier_key := trim(v_tin) || '|' || coalesce(trim(v_supplier_name), '');
  end if;
  v_entry_key := 'purchase-roll:' || p_source_month || ':' || v_supplier_key;

  for v_row in
    select rr.record_id, rr.data
      from public.relief_records rr
     where rr.client_id = p_client_id
       and rr.record_type = 'filed'
       and rr.record_id ~ '^purchases\|[0-9]{4}-(0[1-9]|1[0-2])$'
       and split_part(rr.record_id, '|', 2) > p_source_month
       and left(split_part(rr.record_id, '|', 2), 4) = left(p_source_month, 4)
       and coalesce(jsonb_typeof(rr.data -> 'entryIds') = 'array', false)
       and ((rr.data -> 'entryIds') ? v_entry_key)
     order by split_part(rr.record_id, '|', 2)
  loop
    v_filed_at_text := nullif(v_row.data ->> 'filedAt', '');
    if v_filed_at_text is null then continue; end if;
    begin
      v_filed_at := v_filed_at_text::timestamptz;
    exception when others then
      continue;
    end;
    if p_created_at <= v_filed_at then
      v_target_month := split_part(v_row.record_id, '|', 2);
      return v_target_month;
    end if;
  end loop;

  return null;
end;
$$;

revoke all on function public.relief_purchase_filed_rollover_snapshot_month(text, text, text, timestamptz) from public, anon, authenticated;

-- The database is authoritative for where purchases appear in RELIEF. If the
-- source month is filed, only transactions in that filing snapshot stay there;
-- late entries go to the first later unfiled month in the same calendar year.
create or replace function public.reconcile_relief_purchase_assignment(
  p_client_id text,
  p_purchase_id text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date;
  v_created_at timestamptz;
  v_source_month text;
  v_relief_month text;
  v_status text;
  v_source_year integer;
  v_source_month_number integer;
  v_candidate text;
  v_month_number integer;
  v_existing_source_month text;
  v_existing_relief_month text;
  v_existing_status text;
  v_filed_rollover_month text;
begin
  select p.date, p.created_at
    into v_date, v_created_at
    from public.purchases p
   where p.id = p_purchase_id
     and p.client_id = p_client_id;

  if not found or v_date is null then
    delete from public.relief_purchase_assignments a where a.purchase_id = p_purchase_id;
    return;
  end if;

  v_source_month := to_char(v_date, 'YYYY-MM');
  v_source_year := extract(year from v_date)::integer;
  v_source_month_number := extract(month from v_date)::integer;

  select a.source_month, a.relief_month, a.assignment_status
    into v_existing_source_month, v_existing_relief_month, v_existing_status
    from public.relief_purchase_assignments a
   where a.purchase_id = p_purchase_id;

  -- Once a late purchase was included in a filed destination snapshot, keep it
  -- there even if the original source month is later amended. Unlocking the
  -- destination lets this reconciliation choose a new assignment normally.
  if v_existing_source_month is not null
     and v_existing_source_month = v_source_month
     and v_existing_status = 'filed_rollover_snapshot'
     and v_existing_relief_month is not null
     and exists (
       select 1 from public.relief_records rr
        where rr.client_id = p_client_id
          and rr.record_type = 'filed'
          and rr.record_id = 'purchases|' || v_existing_relief_month
     ) then
    return;
  end if;

  v_filed_rollover_month := public.relief_purchase_filed_rollover_snapshot_month(
    p_client_id, p_purchase_id, v_source_month, v_created_at
  );
  if v_filed_rollover_month is not null then
    v_relief_month := v_filed_rollover_month;
    v_status := 'filed_rollover_snapshot';
    insert into public.relief_purchase_assignments (
      purchase_id, client_id, source_month, relief_month, assignment_status, updated_at
    ) values (
      p_purchase_id, p_client_id, v_source_month, v_relief_month, v_status, now()
    )
    on conflict (purchase_id) do update set
      client_id = excluded.client_id,
      source_month = excluded.source_month,
      relief_month = excluded.relief_month,
      assignment_status = excluded.assignment_status,
      updated_at = now();
    return;
  end if;

  if not exists (
    select 1 from public.relief_records rr
     where rr.client_id = p_client_id
       and rr.record_type = 'filed'
       and rr.record_id = 'purchases|' || v_source_month
  ) then
    v_relief_month := v_source_month;
    v_status := 'same_month';
  elsif public.relief_purchase_was_in_filed_snapshot(p_client_id, p_purchase_id, v_source_month, v_created_at) then
    v_relief_month := v_source_month;
    v_status := 'filed_snapshot';
  else
    v_relief_month := null;
    v_status := 'no_unfiled_month';
    for v_month_number in (v_source_month_number + 1)..12 loop
      v_candidate := to_char(make_date(v_source_year, v_month_number, 1), 'YYYY-MM');
      if not exists (
        select 1 from public.relief_records rr
         where rr.client_id = p_client_id
           and rr.record_type = 'filed'
           and rr.record_id = 'purchases|' || v_candidate
      ) then
        v_relief_month := v_candidate;
        v_status := 'rolled_forward';
        exit;
      end if;
    end loop;
  end if;

  insert into public.relief_purchase_assignments (
    purchase_id, client_id, source_month, relief_month, assignment_status, updated_at
  ) values (
    p_purchase_id, p_client_id, v_source_month, v_relief_month, v_status, now()
  )
  on conflict (purchase_id) do update set
    client_id = excluded.client_id,
    source_month = excluded.source_month,
    relief_month = excluded.relief_month,
    assignment_status = excluded.assignment_status,
    updated_at = now();
end;
$$;

revoke all on function public.reconcile_relief_purchase_assignment(text, text) from public, anon, authenticated;

-- Serialize purchase writes with filing of their date month. This closes the
-- race where a purchase and a filing could otherwise pass each other mid-save.
create or replace function public.lock_relief_purchase_month_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_old_key text;
  v_new_key text;
begin
  if tg_op = 'UPDATE' then
    if old.date is not null then
      v_old_key := old.client_id || '|purchases|' || to_char(old.date, 'YYYY-MM');
    end if;
  end if;
  if new.date is not null then
    v_new_key := new.client_id || '|purchases|' || to_char(new.date, 'YYYY-MM');
  end if;

  if v_old_key is not null and v_new_key is not null and v_old_key <> v_new_key then
    if v_old_key < v_new_key then
      perform pg_advisory_xact_lock(hashtextextended(v_old_key, 0));
      perform pg_advisory_xact_lock(hashtextextended(v_new_key, 0));
    else
      perform pg_advisory_xact_lock(hashtextextended(v_new_key, 0));
      perform pg_advisory_xact_lock(hashtextextended(v_old_key, 0));
    end if;
  elsif v_new_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_new_key, 0));
  elsif v_old_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(v_old_key, 0));
  end if;

  return new;
end;
$$;

revoke all on function public.lock_relief_purchase_month_change() from public, anon, authenticated;
drop trigger if exists trg_lock_relief_purchase_month_change on public.purchases;
create trigger trg_lock_relief_purchase_month_change
  before insert or update of client_id, date, created_at on public.purchases
  for each row execute function public.lock_relief_purchase_month_change();

-- Guard even against privileged application paths attempting to assign a
-- purchase to a filed month or bypass the calendar-year/first-open-month rules.
create or replace function public.guard_relief_purchase_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_date date;
  v_created_at timestamptz;
  v_source_year integer;
  v_source_month_number integer;
  v_relief_month_number integer;
  v_candidate text;
  v_month_number integer;
  v_source_is_filed boolean;
  v_relief_is_filed boolean;
  v_was_in_snapshot boolean;
begin
  select p.date, p.created_at
    into v_date, v_created_at
    from public.purchases p
   where p.id = new.purchase_id
     and p.client_id = new.client_id;

  if not found or v_date is null then
    raise exception 'RELIEF assignment must reference an existing dated purchase for the same client.' using errcode = '23514';
  end if;

  if to_char(v_date, 'YYYY-MM') <> new.source_month then
    raise exception 'RELIEF assignment source month must match the purchase transaction date.' using errcode = '23514';
  end if;

  v_source_year := substring(new.source_month, 1, 4)::integer;
  v_source_month_number := substring(new.source_month, 6, 2)::integer;
  select exists (
    select 1 from public.relief_records rr
     where rr.client_id = new.client_id
       and rr.record_type = 'filed'
       and rr.record_id = 'purchases|' || new.source_month
  ) into v_source_is_filed;

  v_was_in_snapshot := case when v_source_is_filed
    then public.relief_purchase_was_in_filed_snapshot(new.client_id, new.purchase_id, new.source_month, v_created_at)
    else false end;

  if new.relief_month is null then
    if new.assignment_status <> 'no_unfiled_month' or not v_source_is_filed or v_was_in_snapshot then
      raise exception 'Only late purchases from filed months with no succeeding unfiled month can remain unassigned in RELIEF.' using errcode = '23514';
    end if;
    for v_month_number in (v_source_month_number + 1)..12 loop
      v_candidate := to_char(make_date(v_source_year, v_month_number, 1), 'YYYY-MM');
      if not exists (
        select 1 from public.relief_records rr
         where rr.client_id = new.client_id
           and rr.record_type = 'filed'
           and rr.record_id = 'purchases|' || v_candidate
      ) then
        raise exception 'A succeeding unfiled RELIEF month exists (%); the purchase must be assigned there.', v_candidate using errcode = '23514';
      end if;
    end loop;
    return new;
  end if;

  if left(new.relief_month, 4)::integer <> v_source_year then
    raise exception 'RELIEF purchase assignments cannot cross calendar years.' using errcode = '23514';
  end if;
  v_relief_month_number := substring(new.relief_month, 6, 2)::integer;
  select exists (
    select 1 from public.relief_records rr
     where rr.client_id = new.client_id
       and rr.record_type = 'filed'
       and rr.record_id = 'purchases|' || new.relief_month
  ) into v_relief_is_filed;

  if new.assignment_status = 'filed_rollover_snapshot' then
    if not v_relief_is_filed
       or new.relief_month = new.source_month
       or v_relief_month_number <= v_source_month_number
       or public.relief_purchase_filed_rollover_snapshot_month(
            new.client_id, new.purchase_id, new.source_month, v_created_at
          ) is distinct from new.relief_month then
      raise exception 'A filed rollover assignment must match a purchase row in the filed destination snapshot.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.relief_month = new.source_month then
    if v_source_is_filed then
      if new.assignment_status <> 'filed_snapshot' or not v_was_in_snapshot then
        raise exception 'A purchase cannot be assigned to a filed RELIEF month unless it belongs to that filing snapshot.' using errcode = '23514';
      end if;
    elsif new.assignment_status <> 'same_month' then
      raise exception 'A purchase in an unfiled source month must use the same RELIEF month.' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.assignment_status <> 'rolled_forward' or not v_source_is_filed or v_was_in_snapshot then
    raise exception 'Only late purchases from a filed month can be rolled forward.' using errcode = '23514';
  end if;
  if v_relief_month_number <= v_source_month_number then
    raise exception 'A rolled-forward RELIEF month must come after its source month.' using errcode = '23514';
  end if;
  if v_relief_is_filed then
    raise exception 'Cannot assign a RELIEF purchase to filed month %.', new.relief_month using errcode = '23514';
  end if;

  for v_month_number in (v_source_month_number + 1)..(v_relief_month_number - 1) loop
    v_candidate := to_char(make_date(v_source_year, v_month_number, 1), 'YYYY-MM');
    if not exists (
      select 1 from public.relief_records rr
       where rr.client_id = new.client_id
         and rr.record_type = 'filed'
         and rr.record_id = 'purchases|' || v_candidate
    ) then
      raise exception 'RELIEF purchase must use the first succeeding unfiled month (%).', v_candidate using errcode = '23514';
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function public.guard_relief_purchase_assignment() from public, anon, authenticated;
drop trigger if exists trg_guard_relief_purchase_assignment on public.relief_purchase_assignments;
create trigger trg_guard_relief_purchase_assignment
  before insert or update on public.relief_purchase_assignments
  for each row execute function public.guard_relief_purchase_assignment();

-- Only the source transaction triggers and filed-month trigger can write assignment rows.
create or replace function public.trg_reconcile_relief_purchase_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.relief_purchase_assignments a where a.purchase_id = old.id;
    return old;
  end if;

  perform public.reconcile_relief_purchase_assignment(new.client_id, new.id);
  return new;
end;
$$;

revoke all on function public.trg_reconcile_relief_purchase_assignment() from public, anon, authenticated;
drop trigger if exists trg_reconcile_relief_purchase_assignment on public.purchases;
create trigger trg_reconcile_relief_purchase_assignment
  after insert or update of client_id, date, created_at or delete on public.purchases
  for each row execute function public.trg_reconcile_relief_purchase_assignment();

-- When a purchase month is filed or amended, immediately refresh every purchase
-- assignment for that source month so the database remains the source of truth.
create or replace function public.trg_refresh_relief_assignments_after_filing()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_client_id text;
  v_record_id text;
  v_record_type text;
  v_month text;
  v_purchase_id text;
begin
  if tg_op = 'DELETE' then
    v_client_id := old.client_id;
    v_record_id := old.record_id;
    v_record_type := old.record_type;
  else
    v_client_id := new.client_id;
    v_record_id := new.record_id;
    v_record_type := new.record_type;
  end if;

  if v_record_type <> 'filed'
     or v_record_id !~ '^purchases\|\d{4}-(0[1-9]|1[0-2])$' then
    if tg_op = 'DELETE' then return old; else return new; end if;
  end if;

  v_month := substring(v_record_id from 'purchases\|(\d{4}-(0[1-9]|1[0-2]))');
  for v_purchase_id in
    select distinct p.id
      from public.purchases p
      left join public.relief_purchase_assignments a on a.purchase_id = p.id
     where p.client_id = v_client_id
       and (
         (p.date >= (v_month || '-01')::date
          and p.date < ((v_month || '-01')::date + interval '1 month')::date)
         or a.relief_month = v_month
       )
  loop
    perform public.reconcile_relief_purchase_assignment(v_client_id, v_purchase_id);
  end loop;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.trg_refresh_relief_assignments_after_filing() from public, anon, authenticated;
drop trigger if exists trg_refresh_relief_assignments_after_filing on public.relief_records;
create trigger trg_refresh_relief_assignments_after_filing
  after insert or delete on public.relief_records
  for each row execute function public.trg_refresh_relief_assignments_after_filing();

-- Check and enforce month-level locks for RELIEF adjustments. Purchases themselves
-- may still be encoded; their assignment is determined by the purchase trigger.
create or replace function public.guard_relief_filed_month_writes()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_type text;
  v_id text;
  v_data jsonb;
  v_client_id text;
  v_source_month text;
  v_target_month text;
  v_locked_month text;
begin
  if tg_op = 'UPDATE' then
    if old.record_type = 'filed' or new.record_type = 'filed' then
      if current_setting('app.relief_allow_amend', true) is distinct from 'on' then
        raise exception 'Filed RELIEF snapshots are immutable. Use Amend to unlock the selected month.' using errcode = '55000';
      end if;
    end if;
  elsif tg_op = 'DELETE' and old.record_type = 'filed' then
    if current_setting('app.relief_allow_amend', true) is distinct from 'on' then
      raise exception 'Filed RELIEF snapshots are locked. Use Amend to unlock the selected month.' using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then
    v_type := old.record_type; v_id := old.record_id; v_data := old.data; v_client_id := old.client_id;
  else
    v_type := new.record_type; v_id := new.record_id; v_data := new.data; v_client_id := new.client_id;
  end if;

  -- Use the same client/tab/month advisory lock for a filing and any related
  -- adjustment write, so the lock check cannot race the filing insert.
  if v_type = 'filed'
     and v_id ~ '^(sales|purchases|imports)\|[0-9]{4}-(0[1-9]|1[0-2])$' then
    perform pg_advisory_xact_lock(hashtextextended(v_client_id || '|' || v_id, 0));
  end if;

  if v_type = 'purchase_transfer' then
    v_source_month := regexp_replace(v_id, '^.*\|', '');
    v_target_month := coalesce(v_data ->> 'toMonth', '');
    if v_source_month !~ '^\d{4}-(0[1-9]|1[0-2])$' or v_target_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
      raise exception 'Invalid RELIEF transfer month. Expected YYYY-MM.' using errcode = '23514';
    end if;
    if (v_client_id || '|purchases|' || v_source_month) < (v_client_id || '|purchases|' || v_target_month) then
      perform pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_source_month, 0));
      perform pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_target_month, 0));
    else
      perform pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_target_month, 0));
      perform pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_source_month, 0));
    end if;
    if left(v_source_month, 4) <> left(v_target_month, 4) then
      raise exception 'RELIEF purchase transfers must remain within the same calendar year.' using errcode = '23514';
    end if;
    if exists (
      select 1 from public.relief_records rr where rr.client_id = v_client_id
        and rr.record_type = 'filed' and rr.record_id = 'purchases|' || v_source_month
    ) then
      raise exception 'Source month % is filed. Amend it before changing its transfer.', v_source_month using errcode = '55000';
    end if;
    if exists (
      select 1 from public.relief_records rr where rr.client_id = v_client_id
        and rr.record_type = 'filed' and rr.record_id = 'purchases|' || v_target_month
    ) then
      raise exception 'Destination month % is filed. Amend it before transferring purchases into it.', v_target_month using errcode = '55000';
    end if;
  elsif v_type = 'settings' then
    v_locked_month := coalesce(v_data ->> 'monthKey', v_id);
    if v_locked_month ~ '^\d{4}-(0[1-9]|1[0-2])$' then
      perform pg_advisory_xact_lock(hashtextextended(v_client_id || '|purchases|' || v_locked_month, 0));
    end if;
    if v_locked_month ~ '^\d{4}-(0[1-9]|1[0-2])$' and exists (
      select 1 from public.relief_records rr where rr.client_id = v_client_id
        and rr.record_type = 'filed' and rr.record_id = 'purchases|' || v_locked_month
    ) then
      raise exception 'RELIEF settings for filed purchase month % are locked. Amend that month first.', v_locked_month using errcode = '55000';
    end if;
  elsif v_type = 'importation' then
    v_locked_month := coalesce(v_data ->> 'monthKey', split_part(v_id, '|', 1));
    if v_locked_month ~ '^\d{4}-(0[1-9]|1[0-2])$' then
      perform pg_advisory_xact_lock(hashtextextended(v_client_id || '|imports|' || v_locked_month, 0));
    end if;
    if v_locked_month ~ '^\d{4}-(0[1-9]|1[0-2])$' and exists (
      select 1 from public.relief_records rr where rr.client_id = v_client_id
        and rr.record_type = 'filed' and rr.record_id = 'imports|' || v_locked_month
    ) then
      raise exception 'RELIEF importations for filed month % are locked. Amend that month first.', v_locked_month using errcode = '55000';
    end if;
  end if;

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

revoke all on function public.guard_relief_filed_month_writes() from public, anon, authenticated;
drop trigger if exists trg_guard_relief_filed_month_writes on public.relief_records;
create trigger trg_guard_relief_filed_month_writes
  before insert or update or delete on public.relief_records
  for each row execute function public.guard_relief_filed_month_writes();

-- Controlled amendment path. RLS/permission checks still apply; direct API deletes
-- of filed snapshots are rejected by the trigger above.
create or replace function public.amend_relief_month(
  p_client_id text,
  p_filed_key text
) returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted_key text;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to amend a RELIEF month.' using errcode = '42501';
  end if;
  if not public.can_access_client_operation(p_client_id, 'edit_transactions') then
    raise exception 'You do not have permission to amend RELIEF months for this business.' using errcode = '42501';
  end if;
  if p_filed_key !~ '^(sales|purchases|imports)\|\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid filed RELIEF key.' using errcode = '22023';
  end if;

  perform set_config('app.relief_allow_amend', 'on', true);
  delete from public.relief_records rr
   where rr.client_id = p_client_id
     and rr.record_type = 'filed'
     and rr.record_id = p_filed_key
  returning rr.record_id into v_deleted_key;

  if v_deleted_key is null then
    raise exception 'The selected RELIEF month is not filed or was already amended.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.amend_relief_month(text, text) from public, anon;
grant execute on function public.amend_relief_month(text, text) to authenticated;

-- Backfill database assignments for existing purchases, then future rows remain
-- synchronized by trg_reconcile_relief_purchase_assignment.
do $$
declare
  v_purchase record;
begin
  for v_purchase in
    select p.client_id, p.id from public.purchases p where p.date is not null
  loop
    perform public.reconcile_relief_purchase_assignment(v_purchase.client_id, v_purchase.id);
  end loop;
end;
$$;

comment on table public.relief_purchase_assignments is
  'Database-authoritative RELIEF reporting month assignment for each purchase. Does not change the purchase date or accounting transaction.';
comment on column public.relief_purchase_assignments.relief_month is
  'Assigned RELIEF month, or NULL if the source month is filed and no succeeding unfiled month remains in that calendar year.';

commit;
