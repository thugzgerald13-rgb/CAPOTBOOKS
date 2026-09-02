-- CAPOT normalized-schema verification
-- Run against the migrated Supabase database after replacing the example
-- client id where a client-specific check is required.

-- 1. Orphan checks: every normalized child must have a valid client.
select 'purchases' as table_name, count(*) as orphan_count
from purchases p
left join clients c on c.id = p.client_id
where c.id is null
union all
select 'sales', count(*)
from sales s
left join clients c on c.id = s.client_id
where c.id is null
union all
select 'expenses', count(*)
from expenses e
left join clients c on c.id = e.client_id
where c.id is null
union all
select 'journal_entries', count(*)
from journal_entries j
left join clients c on c.id = j.client_id
where c.id is null
union all
select 'app_files', count(*)
from app_files f
left join clients c on c.id = f.client_id
where c.id is null;

-- 2. AP child-row integrity.
select 'purchase_order_items' as table_name, count(*) as orphan_count
from purchase_order_items i
left join purchase_orders p on p.id = i.purchase_order_id
where p.id is null
union all
select 'receiving_report_items', count(*)
from receiving_report_items i
left join receiving_reports r on r.id = i.receiving_report_id
where r.id is null
union all
select 'payable_invoice_items', count(*)
from payable_invoice_items i
left join payable_invoices p on p.id = i.payable_invoice_id
where p.id is null;

-- 3. Attachment paths: normalized records should not retain base64 content.
select count(*) as purchases_with_storage_paths
from purchases
where attachment_storage_path is not null;

select count(*) as app_files_with_storage_paths
from app_files
where storage_path is not null;

-- 4. Journal type distribution.
select client_id, journal_type, count(*) as entry_count
from journal_entries
group by client_id, journal_type
order by client_id, journal_type;

-- 5. Financial report snapshot coverage.
select client_id, count(*) as snapshot_count
from financial_report_snapshots
group by client_id
order by client_id;

-- 6. Confirm the shared RLS helper exists.
select n.nspname as schema_name,
       p.proname as function_name
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'is_client_owner';
