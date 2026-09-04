-- CAPOT post-migration verification.
-- Run AFTER migration, before removing clients.data.

-- 1. Client legacy documents still available for rollback verification.
select count(*) as clients_total,
       count(*) filter (where data is not null) as clients_with_legacy_data
from public.clients;

-- 2. Row counts per client across normalized entities.
select c.id as client_id, c.name,
       (select count(*) from purchases p where p.client_id=c.id) purchases,
       (select count(*) from sales s where s.client_id=c.id) sales,
       (select count(*) from coa_accounts a where a.client_id=c.id) coa_accounts,
       (select count(*) from journal_entries j where j.client_id=c.id) journal_entries,
       (select count(*) from journal_vouchers v where v.client_id=c.id) journal_vouchers,
       (select count(*) from purchase_orders x where x.client_id=c.id) purchase_orders,
       (select count(*) from receiving_reports x where x.client_id=c.id) receiving_reports,
       (select count(*) from payable_invoices x where x.client_id=c.id) payable_invoices,
       (select count(*) from inventory_items x where x.client_id=c.id) inventory_items,
       (select count(*) from app_files x where x.client_id=c.id) app_files,
       (select count(*) from financial_report_snapshots x where x.client_id=c.id) report_snapshots
from clients c order by c.id;

-- 3. Accounting totals by client.
-- Expense history is derived from purchases in the normalized application model.
select c.id as client_id, c.name,
       coalesce((select sum(amount) from purchases p where p.client_id=c.id),0) purchase_total,
       coalesce((select sum(input_tax) from purchases p where p.client_id=c.id),0) input_tax_total,
       coalesce((select sum(wht_amount) from purchases p where p.client_id=c.id),0) purchase_wht_total,
       coalesce((select sum(amount) from sales s where s.client_id=c.id),0) sales_total,
       coalesce((select sum(output_tax) from sales s where s.client_id=c.id),0) output_tax_total,
       coalesce((select sum(amount) from purchases p where p.client_id=c.id),0) expense_activity_total
from clients c order by c.id;

-- 4. AP line integrity and tenant integrity.
select 'receiving_report_items',count(*) from receiving_report_items i left join receiving_reports r on r.id=i.receiving_report_id where r.id is null
union all select 'payable_invoice_items',count(*) from payable_invoice_items i left join payable_invoices p on p.id=i.payable_invoice_id where p.id is null
union all select 'journal_voucher_lines',count(*) from journal_voucher_lines l left join journal_vouchers v on v.id=l.journal_voucher_id where v.id is null;

-- 5. No normalized child row should point to a missing client.
select 'purchases' table_name,count(*) orphan_count from purchases p left join clients c on c.id=p.client_id where c.id is null
union all select 'sales',count(*) from sales p left join clients c on c.id=p.client_id where c.id is null
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

-- 9. Legacy-vs-normalized migration spot check for one client.
-- Note: legacy expense rows are not a normalized table; purchases are the source for expense history.
-- Replace the value below before running the query.
-- select id, jsonb_array_length(coalesce(data->'purchases','[]'::jsonb)) legacy_purchases,
--        (select count(*) from purchases p where p.client_id=clients.id) normalized_purchases
-- from clients where id='REPLACE_CLIENT_ID';
