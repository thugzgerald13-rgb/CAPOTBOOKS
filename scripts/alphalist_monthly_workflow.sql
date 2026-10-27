-- Monthly Alphalist of Payees: same-year claim-month transfers and filed/amend locks.
-- Apply after scripts/relief_supabase_migration.sql.
-- The workflow stores reporting assignments only; Expense History purchases are not changed.

begin;

do $$
begin
  if to_regclass('public.relief_records') is null then
    raise exception 'public.relief_records is missing. Apply scripts/relief_supabase_migration.sql first.';
  end if;
end;
$$;

-- Keep existing RELIEF record kinds and allow separate, namespaced Alphalist state.
alter table public.relief_records drop constraint if exists relief_records_type_check;
alter table public.relief_records
  add constraint relief_records_type_check check (
    record_type in (
      'purchase_transfer', 'importation', 'settings', 'filed', 'audit',
      'alphalist_transfer', 'alphalist_filed'
    )
  );

-- Enforce same-year forward-only transfers and reject transfer destinations already filed.
create or replace function public.enforce_alphalist_transfer_rules()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_from_month text;
  v_to_month text;
begin
  if tg_op = 'UPDATE' and old.record_type = 'alphalist_transfer' and new.record_type <> 'alphalist_transfer' then
    raise exception 'Alphalist transfer records cannot be retyped; use the Reset transfer action instead.';
  end if;
  if new.record_type <> 'alphalist_transfer' then
    return new;
  end if;

  v_from_month := new.data ->> 'fromMonth';
  v_to_month := new.data ->> 'toMonth';

  if v_from_month is null or v_from_month !~ '^\d{4}-(0[1-9]|1[0-2])$'
     or v_to_month is null or v_to_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Alphalist transfer requires valid fromMonth and toMonth values (YYYY-MM).';
  end if;
  if left(v_from_month, 4) <> left(v_to_month, 4) or v_to_month <= v_from_month then
    raise exception 'Alphalist transfers must go forward to a later month in the same calendar year.';
  end if;
  if exists (
    select 1 from public.relief_records filed
     where filed.client_id = new.client_id
       and filed.record_type = 'alphalist_filed'
       and filed.record_id = v_to_month
  ) then
    raise exception 'Cannot transfer Alphalist data into filed month %; amend that month first.', v_to_month;
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_alphalist_transfer_rules() from public, anon, authenticated;
drop trigger if exists trg_enforce_alphalist_transfer_rules on public.relief_records;
create trigger trg_enforce_alphalist_transfer_rules
  before insert or update on public.relief_records
  for each row execute function public.enforce_alphalist_transfer_rules();

-- Filed snapshots are immutable from direct table writes. Amend is performed by
-- the authorized RPC below, using a transaction-local flag checked by this trigger.
create or replace function public.protect_alphalist_filed_snapshots()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if old.record_type = 'alphalist_filed'
     and coalesce(current_setting('app.alphalist_amend', true), '') <> 'true' then
    raise exception 'Monthly Alphalist month % is filed and locked. Use Amend before changing it.', old.record_id;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function public.protect_alphalist_filed_snapshots() from public, anon, authenticated;
drop trigger if exists trg_protect_alphalist_filed_snapshots on public.relief_records;
create trigger trg_protect_alphalist_filed_snapshots
  before update or delete on public.relief_records
  for each row execute function public.protect_alphalist_filed_snapshots();

create or replace function public.amend_alphalist_month(
  p_client_id text,
  p_month_key text
) returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required to amend a filed Alphalist month.';
  end if;
  if p_month_key is null or p_month_key !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'Invalid Alphalist month key. Expected YYYY-MM.';
  end if;
  if not public.can_access_client_operation(p_client_id, 'edit_transactions') then
    raise exception 'You do not have permission to amend the Monthly Alphalist for this business profile.';
  end if;

  perform set_config('app.alphalist_amend', 'true', true);
  delete from public.relief_records
   where client_id = p_client_id
     and record_type = 'alphalist_filed'
     and record_id = p_month_key;
  get diagnostics v_deleted = row_count;
  return v_deleted > 0;
end;
$$;

revoke all on function public.amend_alphalist_month(text, text) from public, anon;
grant execute on function public.amend_alphalist_month(text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
