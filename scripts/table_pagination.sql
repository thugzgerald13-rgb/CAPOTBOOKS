-- =============================================================================
-- table_pagination.sql — Keyset-paginated table loader for lazy / large views.
--
-- The initial-load RPC (get_initial_client_data) intentionally returns the
-- full client dataset in one call — reports are computed client-side from the
-- full dataset, so paginating that call would only add requests, not save
-- bandwidth. This function is for ON-DEMAND loading of large/old slices
-- (e.g. a user opens History for an old month, or a Sales list that grows
-- beyond the initial load). It uses keyset pagination on updated_at (no
-- OFFSET, so it stays fast at millions of rows) and is cached client-side via
-- src/lib/paginatedLoad.ts + the existing queryCache in localDb.
--
-- SECURITY: SECURITY INVOKER (RLS applies). Table name is whitelisted to
-- prevent SQL injection via the dynamic query. Safe to re-run.
-- =============================================================================

create or replace function public.get_table_page(
  p_table          text,
  p_client_id      text,
  p_cursor         text default null,   -- ISO timestamp; null = newest page
  p_limit          int  default 500
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_allowed     boolean;
  v_sql         text;
  v_rows        jsonb;
  v_next_cursor text;
  v_has_more    boolean;
begin
  if p_client_id is null then return null; end if;
  if p_limit is null or p_limit < 1 or p_limit > 5000 then p_limit := 500; end if;

  -- Whitelist: only tables the app actually uses. Anything else is an error.
  select p_table in (
    'purchases','sales','coa_columns','coa_accounts','journal_columns',
    'journal_entries','journal_vouchers','journal_voucher_lines',
    'inventory_columns','inventory_items','inventory_movements',
    'app_folders','app_files','tin_entries','tax_deadlines','bank_accounts',
    'asset_lapsing_schedule','billing_invoices','financial_report_snapshots'
  ) into v_allowed;
  if not v_allowed then
    raise exception 'get_table_page: table % is not whitelisted', p_table
      using errcode = 'check_violation';
  end if;

  -- Page of rows: updated_at <= cursor (older pages), newest first, no OFFSET.
  v_sql := format(
    $ex$
      select coalesce(jsonb_agg(row), '[]'::jsonb)
      from (
        select to_jsonb(t) as row
        from public.%I t
        where t.client_id = $1
          and ($2::timestamptz is null or t.updated_at <= $2::timestamptz)
        order by t.updated_at desc, t.id desc
        limit $3
      ) sub
    $ex$,
    p_table
  );
  execute v_sql using p_client_id, p_cursor, p_limit into v_rows;

  -- next_cursor = oldest updated_at in this page (last element, desc order).
  v_next_cursor := v_rows -> -1 ->> 'updated_at';

  -- has_more: any row strictly older than this page's oldest row. Uses the
  -- (client_id, updated_at) indexes — cheap.
  if v_next_cursor is null then
    v_has_more := false;
  else
    v_sql := format(
      $ex$ select exists (select 1 from public.%I t where t.client_id = $1 and t.updated_at < $2::timestamptz) $ex$,
      p_table
    );
    execute v_sql using p_client_id, v_next_cursor into v_has_more;
  end if;

  return jsonb_build_object(
    'rows',        v_rows,
    'next_cursor', v_next_cursor,
    'has_more',    v_has_more,
    'page_size',   jsonb_array_length(v_rows)
  );
end;
$$;

revoke all on function public.get_table_page(text, text, text, int) from public;
grant execute on function public.get_table_page(text, text, text, int) to authenticated;
