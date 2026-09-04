-- CAPOT post-migration verification.
-- Run AFTER migration, before removing clients.data.
-- This script is read-only. Review every result before cutover.

-- 1. Client legacy documents retained for rollback verification.
select count(*) as clients_total,
       count(*) filter (where data is not null) as clients_with_legacy_data
from public.clients;

-- 2. Row counts for every normalized entity by client.
select c.id as client_id, c.name,
       (select count(*) from purchases p where p.client_id=c.id) purchases,
       (select count(*) from sales s where s.client_id=c.id) sales,
       (select count(*) from coa_columns x where x.client_id=c.id) coa_columns,
       (select count(*) from coa_accounts x where x.client_id=c.id) coa_accounts,
       (select count(*) from journal_columns x where x.client_id=c.id) journal_columns,
       (select count(*) from journal_entries x where x.client_id=c.id) journal_entries,
       (select count(*) from journal_vouchers x where x.client_id=c.id) journal_vouchers,
       (select count(*) from journal_voucher_lines x where x.client_id=c.id) journal_voucher_lines,
       (select count(*) from inventory_columns x where x.client_id=c.id) inventory_columns,
       (select count(*) from inventory_items x where x.client_id=c.id) inventory_items,
       (select count(*) from inventory_movements x where x.client_id=c.id) inventory_movements,
       (select count(*) from app_folders x where x.client_id=c.id) app_folders,
       (select count(*) from app_files x where x.client_id=c.id) app_files,
       (select count(*) from tin_entries x where x.client_id=c.id) tin_entries,
       (select count(*) from tax_deadlines x where x.client_id=c.id) tax_deadlines,
       (select count(*) from bank_accounts x where x.client_id=c.id) bank_accounts,
       (select count(*) from asset_lapsing_schedule x where x.client_id=c.id) asset_lapsing_schedule,
       (select count(*) from billing_invoices x where x.client_id=c.id) billing_invoices,
       (select count(*) from financial_report_snapshots x where x.client_id=c.id) report_snapshots
from public.clients c
order by c.id;

-- 3. Legacy-vs-normalized count spot checks.
-- Every mismatch must be investigated before cutover.
select c.id as client_id, c.name,
       jsonb_array_length(coalesce(c.data->'purchases','[]'::jsonb)) as legacy_purchases,
       (select count(*) from purchases p where p.client_id=c.id) as normalized_purchases,
       jsonb_array_length(coalesce(c.data->'sales','[]'::jsonb)) as legacy_sales,
       (select count(*) from sales s where s.client_id=c.id) as normalized_sales,
       jsonb_array_length(coalesce(c.data->'accounts','[]'::jsonb)) as legacy_accounts,
       (select count(*) from coa_accounts a where a.client_id=c.id) as normalized_accounts,
       jsonb_array_length(coalesce(c.data->'inventoryItems','[]'::jsonb)) as legacy_inventory_items,
       (select count(*) from inventory_items x where x.client_id=c.id) as normalized_inventory_items
from public.clients c
where c.data is not null
order by c.id;

-- 4. Journal counts by client and journal type.
select client_id, journal_type, count(*) as entry_count
from public.journal_entries
group by client_id, journal_type
order by client_id, journal_type;

-- 5. Journal column counts by client and journal type.
select client_id, journal_type, count(*) as column_count
from public.journal_columns
group by client_id, journal_type
order by client_id, journal_type;

-- 6. Accounting totals by client.
select c.id as client_id, c.name,
       coalesce((select sum(amount) from purchases p where p.client_id=c.id),0) purchase_total,
       coalesce((select sum(input_tax) from purchases p where p.client_id=c.id),0) input_tax_total,
       coalesce((select sum(wht_amount) from purchases p where p.client_id=c.id),0) purchase_wht_total,
       coalesce((select sum(amount) from sales s where s.client_id=c.id),0) sales_total,
       coalesce((select sum(output_tax) from sales s where s.client_id=c.id),0) output_tax_total,
       coalesce((select sum(total_value) from inventory_movements x where x.client_id=c.id),0) inventory_movement_total
from public.clients c
order by c.id;

select 'journal_voucher_lines', count(*)
from journal_voucher_lines l
left join journal_vouchers v on v.id=l.journal_voucher_id
where v.id is null;

-- 8. No normalized child row should point to a missing client.
select 'purchases',count(*) from purchases p left join clients c on c.id=p.client_id where c.id is null
union all select 'sales',count(*) from sales p left join clients c on c.id=p.client_id where c.id is null
union all select 'coa_columns',count(*) from coa_columns p left join clients c on c.id=p.client_id where c.id is null
union all select 'coa_accounts',count(*) from coa_accounts p left join clients c on c.id=p.client_id where c.id is null
union all select 'journal_columns',count(*) from journal_columns p left join clients c on c.id=p.client_id where c.id is null
union all select 'journal_entries',count(*) from journal_entries p left join clients c on c.id=p.client_id where c.id is null
union all select 'journal_vouchers',count(*) from journal_vouchers p left join clients c on c.id=p.client_id where c.id is null
union all select 'journal_voucher_lines',count(*) from journal_voucher_lines p left join clients c on c.id=p.client_id where c.id is null
union all select 'inventory_items',count(*) from inventory_items p left join clients c on c.id=p.client_id where c.id is null
union all select 'inventory_movements',count(*) from inventory_movements p left join clients c on c.id=p.client_id where c.id is null
union all select 'app_files',count(*) from app_files p left join clients c on c.id=p.client_id where c.id is null
union all select 'financial_report_snapshots',count(*) from financial_report_snapshots p left join clients c on c.id=p.client_id where c.id is null;

-- 9. Attachment metadata. PostgreSQL should contain Storage paths, not file bytes.
select client_id,
       count(*) as purchases_with_attachments,
       count(*) filter (where attachment_storage_path is not null) as purchases_with_paths,
       count(*) filter (where attachment_storage_path like 'data:%') as purchases_with_data_urls
from purchases
where attachment_name is not null or attachment_storage_path is not null
group by client_id
order by client_id;

select client_id,
       count(*) as app_files,
       count(*) filter (where storage_path is not null) as files_with_paths,
       count(*) filter (where storage_path like 'data:%') as files_with_data_urls
from app_files
group by client_id
order by client_id;

-- 10. Check the legacy JSON for attachment data URLs before cleanup.
-- This should be zero after the migration has removed attachment payloads from
-- the legacy document. Do not use this as a reason to drop clients.data by itself.
select id as client_id,
       case when data::text ~ 'data:[^"\s]+' then 1 else 0 end as possible_data_url_in_legacy_json
from clients
where data is not null
order by id;

-- 11. Financial statement snapshot coverage.
select client_id, report_type, period_key, count(*) as snapshot_count
from financial_report_snapshots
group by client_id, report_type, period_key
order by client_id, report_type, period_key;

-- 12. Inventory totals by client.
select client_id,
       coalesce(sum(stock_level * cost_price),0) as inventory_cost_value,
       coalesce(sum(stock_level * selling_price),0) as inventory_selling_value
from inventory_items
group by client_id
order by client_id;

-- 13. RLS helper and policies must exist.
select n.nspname as schema_name, p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='is_client_owner';

select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname='public'
  and tablename in (
    'clients','purchases','sales','coa_columns','coa_accounts','journal_columns',
    'journal_entries','journal_vouchers','journal_voucher_lines','inventory_columns','inventory_items','inventory_movements',
    'app_folders','app_files','tin_entries','tax_deadlines','bank_accounts',
    'withholding_tax_entries','asset_lapsing_schedule','billing_invoices','financial_report_snapshots'
  )
order by tablename, policyname;

-- 14. Realtime publication coverage.
select schemaname, tablename
from pg_publication_tables
where pubname='supabase_realtime'
  and schemaname='public'
order by tablename;

-- DO NOT DROP clients.data until:
--   * every required row-count comparison passes;
--   * financial totals reconcile;
--   * attachment files are verified in Storage;
--   * normalized application testing is complete;
--   * RLS/realtime checks pass;
--   * the rollback window has expired.
