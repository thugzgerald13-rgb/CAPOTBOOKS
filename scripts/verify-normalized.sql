-- CAPOT post-migration verification.
-- Run AFTER migration, before removing clients.data.

-- 1. Client legacy documents still available for rollback verification.
select count(*) as clients_total,
       count(*) filter (where data is not null) as clients_with_legacy_data
from public.clients;

-- 2. Row counts per client across normalized entities.
-- Journal counts are broken out so Sales Journal (SJ) cannot be missed.
select c.id as client_id, c.name,
       (select count(*) from purchases p where p.client_id=c.id) purchases,
       (select count(*) from sales s where s.client_id=c.id) sales,
       (select count(*) from expenses e where e.client_id=c.id) expenses,
       (select count(*) from coa_accounts a where a.client_id=c.id) coa_accounts,
       (select count(*) from journal_entries j where j.client_id=c.id) journal_entries,
       (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='CRJ') crj_entries,
       (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='CDJ') cdj_entries,
       (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='PJ') pj_entries,
       (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='SJ') sj_entries,
       (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='GJ') gj_entries,
       (select count(*) from journal_vouchers v where v.client_id=c.id) journal_vouchers,
       (select count(*) from purchase_orders x where x.client_id=c.id) purchase_orders,
       (select count(*) from receiving_reports x where x.client_id=c.id) receiving_reports,
       (select count(*) from payable_invoices x where x.client_id=c.id) payable_invoices,
       (select count(*) from inventory_items x where x.client_id=c.id) inventory_items,
       (select count(*) from app_files x where x.client_id=c.id) app_files,
       (select count(*) from financial_report_snapshots x where x.client_id=c.id) report_snapshots
from clients c order by c.id;

-- 3. Accounting totals by client.
select c.id as client_id, c.name,
       coalesce((select sum(amount) from purchases p where p.client_id=c.id),0) purchase_total,
       coalesce((select sum(input_tax) from purchases p where p.client_id=c.id),0) input_tax_total,
       coalesce((select sum(wht_amount) from purchases p where p.client_id=c.id),0) purchase_wht_total,
       coalesce((select sum(amount) from sales s where s.client_id=c.id),0) sales_total,
       coalesce((select sum(output_tax) from sales s where s.client_id=c.id),0) output_tax_total,
       coalesce((select sum(amount) from expenses e where e.client_id=c.id),0) expense_total
from clients c order by c.id;

-- 3A. Journal debit/credit totals by client and journal type.
-- This catches migrated rows whose values survived but monetary data was lost or altered.
select j.client_id, j.journal_type,
       count(*) as entries,
       coalesce(sum(j.total_debit),0) as stored_debit_total,
       coalesce(sum(j.total_credit),0) as stored_credit_total,
       coalesce(sum(nullif(replace(j.values->>'debit', ',', ''), '')::numeric),0) as values_debit_total,
       coalesce(sum(nullif(replace(j.values->>'credit', ',', ''), '')::numeric),0) as values_credit_total
from journal_entries j
group by j.client_id, j.journal_type
order by j.client_id, j.journal_type;

-- 4. AP line integrity and tenant integrity.
select 'receiving_report_items',count(*) from receiving_report_items i left join receiving_reports r on r.id=i.receiving_report_id where r.id is null
union all select 'payable_invoice_items',count(*) from payable_invoice_items i left join payable_invoices p on p.id=i.payable_invoice_id where p.id is null
union all select 'journal_voucher_lines',count(*) from journal_voucher_lines l left join journal_vouchers v on v.id=l.journal_voucher_id where v.id is null;

-- 5. No normalized child row should point to a missing client.
select 'purchases' table_name,count(*) orphan_count from purchases p left join clients c on c.id=p.client_id where c.id is null
union all select 'sales',count(*) from sales p left join clients c on c.id=p.client_id where c.id is null
union all select 'expenses',count(*) from expenses p left join clients c on c.id=p.client_id where c.id is null
union all select 'journal_entries',count(*) from journal_entries p left join clients c on c.id=p.client_id where c.id is null
union all select 'app_files',count(*) from app_files p left join clients c on c.id=p.client_id where c.id is null;

-- 6. Attachment metadata: PostgreSQL must contain paths, not base64 content.
select client_id,count(*) attachments_with_paths
from purchases where attachment_storage_path is not null group by client_id order by client_id;
select client_id,count(*) files_with_paths
from app_files where storage_path is not null group by client_id order by client_id;

-- 7. Journal coverage.
select client_id,journal_type,count(*) entry_count
from journal_entries group by client_id,journal_type order by client_id,journal_type;

-- 8. RLS helper.
select n.nspname schema_name,p.proname function_name
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.proname='is_client_owner';

-- 9. Legacy-vs-normalized migration count spot check for one client.
-- Replace the value below before running the queries.
-- Run these before deleting clients.data. Every legacy count should match its normalized count.
-- select c.id,
--   jsonb_array_length(coalesce(c.data->'purchases','[]'::jsonb)) legacy_purchases,
--   (select count(*) from purchases p where p.client_id=c.id) normalized_purchases,
--   jsonb_array_length(coalesce(c.data->'sales','[]'::jsonb)) legacy_sales,
--   (select count(*) from sales s where s.client_id=c.id) normalized_sales,
--   jsonb_array_length(coalesce(c.data->'expenses','[]'::jsonb)) legacy_expenses,
--   (select count(*) from expenses e where e.client_id=c.id) normalized_expenses,
--   jsonb_array_length(coalesce(c.data->'accounts','[]'::jsonb)) legacy_accounts,
--   (select count(*) from coa_accounts a where a.client_id=c.id) normalized_accounts,
--   jsonb_array_length(coalesce(c.data->'crjEntries','[]'::jsonb)) legacy_crj,
--   (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='CRJ') normalized_crj,
--   jsonb_array_length(coalesce(c.data->'cdjEntries','[]'::jsonb)) legacy_cdj,
--   (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='CDJ') normalized_cdj,
--   jsonb_array_length(coalesce(c.data->'pjEntries','[]'::jsonb)) legacy_pj,
--   (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='PJ') normalized_pj,
--   jsonb_array_length(coalesce(c.data->'sjEntries','[]'::jsonb)) legacy_sj,
--   (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='SJ') normalized_sj,
--   jsonb_array_length(coalesce(c.data->'gjEntries','[]'::jsonb)) legacy_gj,
--   (select count(*) from journal_entries j where j.client_id=c.id and j.journal_type='GJ') normalized_gj
-- from clients c where c.id='REPLACE_CLIENT_ID';

-- 10. Schema preflight: every table/column written by the migration must exist.
-- This catches older Supabase projects where CREATE TABLE IF NOT EXISTS did not
-- upgrade an already-existing table.
with required(table_name, column_name) as (
  values
    ('clients','id'),('clients','user_id'),('clients','data'),
    ('purchases','client_id'),('purchases','date'),('purchases','amount'),('purchases','input_tax'),('purchases','attachment_storage_path'),('purchases','wht_amount'),
    ('sales','client_id'),('sales','date'),('sales','amount'),('sales','net_of_vat'),('sales','output_tax'),
    ('expenses','client_id'),('expenses','date'),('expenses','amount'),
    ('coa_columns','client_id'),('coa_columns','name'),('coa_accounts','client_id'),('coa_accounts','name'),('coa_accounts','normal_side'),('coa_accounts','opening_balance'),
    ('journal_columns','client_id'),('journal_columns','journal_type'),('journal_columns','name'),
    ('journal_entries','client_id'),('journal_entries','journal_type'),('journal_entries','values'),('journal_entries','auto'),('journal_entries','auto_source'),('journal_entries','total_debit'),('journal_entries','total_credit'),
    ('journal_vouchers','client_id'),('journal_vouchers','date'),('journal_voucher_lines','client_id'),('journal_voucher_lines','journal_voucher_id'),
    ('purchase_orders','client_id'),('receiving_reports','client_id'),('payable_invoices','client_id'),('payable_invoice_items','client_id'),
    ('inventory_columns','client_id'),('inventory_items','client_id'),('inventory_movements','client_id'),
    ('app_folders','client_id'),('app_files','client_id'),('app_files','storage_path'),
    ('tin_entries','client_id'),('tax_deadlines','client_id'),('bank_accounts','client_id'),('asset_lapsing_schedule','client_id'),('billing_invoices','client_id'),
    ('financial_report_snapshots','client_id'),('financial_report_snapshots','report_type'),('financial_report_snapshots','data')
)
select r.table_name, r.column_name
from required r
left join information_schema.columns c
  on c.table_schema='public' and c.table_name=r.table_name and c.column_name=r.column_name
where c.column_name is null
order by r.table_name, r.column_name;

-- 11. RLS preflight for all tenant-scoped normalized tables.
select t.tablename, coalesce(c.relrowsecurity,false) as rls_enabled
from (values
  ('purchases'),('sales'),('expenses'),('coa_columns'),('coa_accounts'),
  ('journal_columns'),('journal_entries'),('journal_vouchers'),('journal_voucher_lines'),
  ('purchase_orders'),('receiving_reports'),('payable_invoices'),('payable_invoice_items'),
  ('inventory_columns'),('inventory_items'),('inventory_movements'),
  ('app_folders'),('app_files'),('tin_entries'),('tax_deadlines'),('bank_accounts'),
  ('asset_lapsing_schedule'),('billing_invoices'),('financial_report_snapshots')
) as t(tablename)
left join pg_class c on c.relname=t.tablename and c.relnamespace='public'::regnamespace
order by t.tablename;
