/**
 * CAPOT legacy -> normalized migration.
 *
 * SAFETY: run against staging first. This script requires BOTH:
 *   MIGRATION_ALLOW=YES
 *   --confirm
 * and uses SUPABASE_SERVICE_ROLE_KEY so it can migrate every tenant owned by
 * the authenticated database project without depending on browser sessions.
 *
 * Attachments are decoded and uploaded to the private client-files bucket.
 * Base64/data URLs are never written to PostgreSQL.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
if (process.env.MIGRATION_ALLOW !== 'YES' || !process.argv.includes('--confirm')) {
  throw new Error('Refusing to run. Set MIGRATION_ALLOW=YES and pass --confirm.');
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const BUCKET = 'client-files';
const BATCH = 200;

const arr = (v) => Array.isArray(v) ? v : [];
const str = (v, fallback = null) => v == null ? fallback : String(v);
const num = (v, fallback = 0) => v == null || v === '' ? fallback : Number(v);
const bool = (v) => !!v;
const date = (v) => {
  if (!v) return null;
  const s = String(v);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}` : s.slice(0,10);
};
const batches = (xs, n=BATCH) => Array.from({length: Math.ceil(xs.length/n)}, (_,i)=>xs.slice(i*n,(i+1)*n));
const idOf = (x, fallback) => str(x?.id ?? fallback);

async function upsert(table, rows) {
  const clean = rows.filter(Boolean);
  for (const part of batches(clean)) {
    if (!part.length) continue;
    const { error } = await supabase.from(table).upsert(part, { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

function decodeDataUrl(value) {
  const raw = String(value || '');
  const comma = raw.indexOf(',');
  let meta = '', payload = raw;
  if (comma >= 0) { meta = raw.slice(0, comma); payload = raw.slice(comma + 1); }
  const mime = (meta.match(/^data:([^;]+)/i)?.[1]) || 'application/octet-stream';
  const base64 = meta.toLowerCase().includes(';base64') ? payload : Buffer.from(decodeURIComponent(payload), 'utf8').toString('base64');
  return { mime, bytes: Buffer.from(base64, 'base64') };
}

async function uploadAttachment(clientId, entity, entityId, attachment) {
  const data = attachment?.data ?? attachment?.content;
  if (!data) return attachment?.storagePath || attachment?.storage_path || null;
  const safeName = String(attachment.name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `${clientId}/${entity}/${entityId}/${safeName}`;
  const { mime, bytes } = decodeDataUrl(data);
  const contentType = attachment.type || mime || 'application/octet-stream';
  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType, upsert: true });
  if (error) throw new Error(`Storage ${path}: ${error.message}`);
  return path;
}

async function migrateClient(row) {
  const clientId = String(row.id);
  const d = row.data && typeof row.data === 'object' ? row.data : {};
  const report = { clientId, tables: {}, attachments: 0 };

  // Preserve/refresh the normalized tenancy shell from the existing client row.
  const parent = {
    id: clientId, user_id: row.user_id, name: row.name || d.name || clientId,
    address: row.address ?? d.address ?? null, tax_id: row.tax_id ?? d.taxId ?? null,
    tin: row.tin ?? d.tin ?? null, taxpayer_classification: row.taxpayer_classification ?? d.taxpayerClassification ?? null,
    registered_name: row.registered_name ?? d.registeredName ?? null, last_name: row.last_name ?? d.lastName ?? null,
    first_name: row.first_name ?? d.firstName ?? null, middle_name: row.middle_name ?? d.middleName ?? null,
    trade_name: row.trade_name ?? d.tradeName ?? null, substreet: row.substreet ?? d.substreet ?? null,
    street: row.street ?? d.street ?? null, barangay: row.barangay ?? d.barangay ?? null,
    district: row.district ?? d.district ?? null, city: row.city ?? d.city ?? null,
    zip_code: row.zip_code ?? d.zipCode ?? null, rdo_code: row.rdo_code ?? d.rdoCode ?? null,
    phone: row.phone ?? d.phone ?? null, email: row.email ?? d.email ?? null,
    category: row.category || d.category || 'private', has_multiple_business_lines: row.has_multiple_business_lines ?? !!d.hasMultipleBusinessLines,
    accounting_type: row.accounting_type || d.accountingType || 'Calendar', fiscal_month_end: row.fiscal_month_end || d.fiscalMonthEnd || 12,
    coa_format: row.coa_format || d.coaFormat || 'numeric', updated_at: new Date().toISOString()
  };
  const { error: parentError } = await supabase.from('clients').upsert(parent, { onConflict:'id' });
  if (parentError) throw parentError;

  const purchases = [];
  for (const p of arr(d.purchases)) {
    const id = idOf(p, `legacy-purchase-${clientId}-${p.date || ''}-${p.invoiceNo || ''}`);
    const storagePath = await uploadAttachment(clientId, 'purchases', id, p.attachment);
    if (storagePath) report.attachments++;
    purchases.push({ id, client_id: clientId, dat_month_year:p.datMonthYear||null, date:date(p.date), payment_method:p.paymentMethod||'', check_number:p.checkNumber||null, bank_name:p.bankName||null, invoice_no:p.invoiceNo||null, supplier_name:p.supplierName||'', supplier_address:p.supplierAddress||null, supplier_tin:p.supplierTin||null, amount:num(p.amount), vat_type:p.vatType||null, expense_type:p.expenseType||null, account_title:p.accountTitle||null, transaction_details:p.transactionDetails||null, input_tax:num(p.inputTax), attachment_name:p.attachment?.name||null, attachment_type:p.attachment?.type||null, attachment_original_type:p.attachment?.originalType||p.attachment?.type||null, attachment_size:p.attachment?.size||null, attachment_original_size:p.attachment?.originalSize||p.attachment?.size||null, attachment_compression:p.attachment?.compression||null, attachment_storage_path:storagePath, withholding_option:p.withholdingOption||null, atc_code:p.atcCode||null, wht_rate:p.whtRate??null, wht_amount:p.whtAmount??null });
  }
  await upsert('purchases', purchases); report.tables.purchases=purchases.length;

  const sales=arr(d.sales).map(s=>({id:idOf(s),client_id:clientId,dat_month_year:s.datMonthYear||null,date:date(s.date),ref:s.ref||null,payment_type:s.paymentType||null,buyer_tin:s.buyerTin||null,buyer_name:s.buyerName||null,buyer_address:s.buyerAddress||null,vat_type:s.vatType||null,amount:num(s.amount),net_of_vat:num(s.netOfVat),output_tax:num(s.outputTax),income_type:s.incomeType||null,description:s.desc||null}));
  await upsert('sales',sales); report.tables.sales=sales.length;
  const expenses=arr(d.expenses).map(e=>({id:idOf(e),client_id:clientId,date:date(e.date),amount:num(e.amount),category:e.category||'',description:e.description||''}));
  await upsert('expenses',expenses); report.tables.expenses=expenses.length;

  const coaColumns=arr(d.coaColumns).map(c=>({id:idOf(c),client_id:clientId,name:c.name,is_system:bool(c.isSystem)}));
  await upsert('coa_columns',coaColumns); report.tables.coa_columns=coaColumns.length;
  const accounts=arr(d.accounts).map(a=>{const {id,name,type,normalSide,parentId,hidden,openingBalance,...custom}=a||{};return{id:idOf({id}),client_id:clientId,name:name||'',type:type||'',normal_side:normalSide||null,parent_id:parentId||null,hidden:bool(hidden),opening_balance:num(openingBalance),custom_values:custom};});
  await upsert('coa_accounts',accounts); report.tables.coa_accounts=accounts.length;

  const journalTypes=[['CRJ','crjColumns','crjEntries'],['CDJ','cdjColumns','cdjEntries'],['PJ','pjColumns','pjEntries'],['GJ','gjColumns','gjEntries']];
  for (const [type,colKey,entryKey] of journalTypes) {
    const cols=arr(d[colKey]).map(c=>({id:idOf(c),client_id:clientId,journal_type:type,name:c.name,type:c.type||null,category:c.category||null,is_system:bool(c.isSystem)}));
    const entries=arr(d[entryKey]).map(e=>({id:idOf(e),client_id:clientId,journal_type:type,values:e.values||{},auto:bool(e.auto),auto_source:e.autoSource||null}));
    await upsert('journal_columns',cols); await upsert('journal_entries',entries);
    report.tables[`journal_columns_${type}`]=cols.length; report.tables[`journal_entries_${type}`]=entries.length;
  }

  const jvs=arr(d.journalVouchers).map(v=>({id:idOf(v),client_id:clientId,date:date(v.date),reference:v.reference||null,memo:v.memo||null}));
  const jvl=[]; arr(d.journalVouchers).forEach(v=>arr(v.lines).forEach((l,i)=>jvl.push({id:idOf(l,`${v.id}:line:${i}`),client_id:clientId,journal_voucher_id:idOf(v),account_id:l.accountId||null,account_name:l.accountName||null,debit:num(l.debit),credit:num(l.credit)})));
  await upsert('journal_vouchers',jvs); await upsert('journal_voucher_lines',jvl); report.tables.journal_vouchers=jvs.length; report.tables.journal_voucher_lines=jvl.length;

  const pos=arr(d.purchaseOrders).map(o=>({id:idOf(o),client_id:clientId,date:date(o.date),supplier_id:o.supplierId||null,supplier_name:o.supplierName||null,total_amount:num(o.totalAmount),status:o.status||null}));
  await upsert('purchase_orders',pos); report.tables.purchase_orders=pos.length;

  const rrs=arr(d.receivingReports).map(r=>({id:idOf(r),client_id:clientId,date:date(r.date),po_id:r.poId||null,supplier_name:r.supplierName||null,total_amount:num(r.totalAmount),received_by:r.receivedBy||null}));
  const rri=[]; arr(d.receivingReports).forEach(r=>arr(r.items).forEach((i,n)=>rri.push({id:`${idOf(r)}:item:${n}`,client_id:clientId,receiving_report_id:idOf(r),item_code:i.itemCode||null,description:i.description||null,qty_ordered:num(i.qtyOrdered),qty_received:num(i.qtyReceived),unit_price:num(i.unitPrice)})));
  await upsert('receiving_reports',rrs); await upsert('receiving_report_items',rri); report.tables.receiving_reports=rrs.length; report.tables.receiving_report_items=rri.length;

  const pis=arr(d.payableInvoices).map(i=>({id:idOf(i),client_id:clientId,invoice_number:i.invoiceNumber||null,date:date(i.date),due_date:date(i.dueDate),po_id:i.poId||null,rr_id:i.rrId||null,supplier_id:i.supplierId||null,supplier_name:i.supplierName||null,subtotal:num(i.subtotal),vat_amount:num(i.vatAmount),is_vatable:bool(i.isVatable),withholding_tax_id:i.withholdingTaxId||null,wht_amount:i.whtAmount??null,total_amount:num(i.totalAmount),status:i.status||null,discrepancy_details:i.discrepancyDetails||null,applied_prepayments:i.appliedPrepayments??null}));
  const pii=[]; arr(d.payableInvoices).forEach(i=>arr(i.items).forEach((x,n)=>pii.push({id:`${idOf(i)}:item:${n}`,client_id:clientId,payable_invoice_id:idOf(i),item_code:x.itemCode||null,description:x.description||null,qty:num(x.qty),unit_price:num(x.unitPrice)})));
  await upsert('payable_invoices',pis); await upsert('payable_invoice_items',pii); report.tables.payable_invoices=pis.length; report.tables.payable_invoice_items=pii.length;

  const inventoryColumns=arr(d.inventoryColumns).map(c=>({id:idOf(c),client_id:clientId,label:c.label||null}));
  const inventoryItems=arr(d.inventoryItems).map(i=>({id:idOf(i),client_id:clientId,code:i.code||null,name:i.name||null,sku:i.sku||null,description:i.description||null,category:i.category||null,unit_of_measure:i.unitOfMeasure||null,cost_price:num(i.costPrice),selling_price:num(i.sellingPrice),stock_level:num(i.stockLevel),reorder_point:num(i.reorderPoint),location:i.location||null,custom_fields:i.customFields||{}}));
  const movements=arr(d.inventoryMovements).map(m=>({id:idOf(m),client_id:clientId,item_id:m.itemId||null,item_name:m.itemName||null,item_code:m.itemCode||null,date:date(m.date),type:m.type||null,qty:num(m.qty),unit_cost:num(m.unitCost),total_value:num(m.totalValue),reference:m.reference||null,notes:m.notes||null}));
  await upsert('inventory_columns',inventoryColumns); await upsert('inventory_items',inventoryItems); await upsert('inventory_movements',movements);
  report.tables.inventory_columns=inventoryColumns.length; report.tables.inventory_items=inventoryItems.length; report.tables.inventory_movements=movements.length;

  const folders=arr(d.folders).map(f=>({id:idOf(f),client_id:clientId,name:f.name||null,is_default:bool(f.isDefault),type:f.type||'custom'}));
  await upsert('app_folders',folders); report.tables.app_folders=folders.length;
  const files=[];
  for (const f of arr(d.files)) {
    const id=idOf(f); let storagePath=f.storagePath||f.storage_path||null;
    if (!storagePath && (f.content || f.data)) { storagePath=await uploadAttachment(clientId,'files',id,f); if(storagePath) report.attachments++; }
    if (storagePath) files.push({id,client_id:clientId,name:f.name||null,type:f.type||'application/octet-stream',size:num(f.size,0),uploaded_at:f.uploadedAt||new Date().toISOString(),folder_id:f.folderId||null,storage_path:storagePath,description:f.description||null});
  }
  await upsert('app_files',files); report.tables.app_files=files.length;

  const tins=[...arr(d.tinLibrary?.customers).map(x=>({...x,partyType:'customer'})),...arr(d.tinLibrary?.suppliers).map(x=>({...x,partyType:'supplier'}))].map(x=>{const normalized=String(x.tin||'').replace(/\D/g,'');const stable=`tin_${x.partyType}_${normalized||String(x.name||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_')}`;return{id:idOf(x,stable),client_id:clientId,tin:String(x.tin||''),name:String(x.name||'').trim(),address:x.address||null,party_type:x.partyType};});
  await upsert('tin_entries',tins); report.tables.tin_entries=tins.length;
  const deadlines=arr(d.taxDeadlines).map(t=>({id:idOf(t),client_id:clientId,form_type:t.formType||null,title:t.title||null,period:t.period||null,due_date:date(t.dueDate),status:t.status||null,tax_status:t.taxStatus||null,amount_due:t.amountDue??null,date_filed:date(t.dateFiled),date_paid:date(t.datePaid),reference_no:t.referenceNo||null,confirmation_no:t.confirmationNo||null,notes:t.notes||null})); await upsert('tax_deadlines',deadlines); report.tables.tax_deadlines=deadlines.length;
  const banks=arr(d.bankAccounts).map(b=>({id:idOf(b),client_id:clientId,bank_name:b.bankName||null,account_number:b.accountNumber||null,balance:num(b.balance)})); await upsert('bank_accounts',banks); report.tables.bank_accounts=banks.length;
  const misc=arr(d.miscellaneousPayments).map(m=>({id:idOf(m),client_id:clientId,date:date(m.date),payee_name:m.payeeName||null,amount:num(m.amount),bank_account_id:m.bankAccountId||null,bank_name:m.bankName||null,check_number:m.checkNumber||null,expense_category:m.expenseCategory||null,description:m.description||null})); await upsert('miscellaneous_payments',misc); report.tables.miscellaneous_payments=misc.length;
  const als=arr(d.assetLapsingSchedule).map(a=>({id:idOf(a),client_id:clientId,date_purchased:date(a.datePurchased),invoice_no:a.invoiceNo||null,description:a.description||null,cost:num(a.cost),useful_life_years:num(a.usefulLifeYears),salvage_value:num(a.salvageValue)})); await upsert('asset_lapsing_schedule',als); report.tables.asset_lapsing_schedule=als.length;
  const bi=arr(d.billingInvoices).map(b=>({id:idOf(b),client_id:clientId,date:date(b.date),due_date:date(b.dueDate),invoice_no:b.invoiceNo||null,customer_tin:b.customerTin||null,customer_name:b.customerName||null,customer_address:b.customerAddress||null,vat_type:b.vatType||null,amount:num(b.amount),net_of_vat:num(b.netOfVat),output_tax:num(b.outputTax),description:b.description||null,status:b.status||null,payment_type:b.paymentType||null,date_paid:date(b.datePaid),is_recurring:bool(b.isRecurring),recurrence_frequency:b.recurrenceFrequency||null,next_billing_date:date(b.nextBillingDate),parent_invoice_id:b.parentInvoiceId||null})); await upsert('billing_invoices',bi); report.tables.billing_invoices=bi.length;

  const snapshots=[];
  if(d.plData) snapshots.push({id:`${clientId}:pl`,client_id:clientId,report_type:'P&L',period_key:d.plData.period||'current',data:d.plData});
  if(d.bsData) snapshots.push({id:`${clientId}:bs`,client_id:clientId,report_type:'Balance Sheet',period_key:d.bsData.asOfDate||'current',data:d.bsData});
  if(d.cfData) snapshots.push({id:`${clientId}:cf`,client_id:clientId,report_type:'Cash Flow',period_key:d.cfData.period||'current',data:d.cfData});
  await upsert('financial_report_snapshots',snapshots); report.tables.financial_report_snapshots=snapshots.length;

  return report;
}

const { data: clients, error } = await supabase.from('clients').select('*').not('data','is',null).order('id');
if (error) throw error;
console.log(`Found ${clients.length} legacy client documents.`);
const results=[];
for (const client of clients) {
  try { const r=await migrateClient(client); results.push(r); console.log(JSON.stringify(r)); }
  catch (e) { console.error(`FAILED ${client.id}: ${e.message}`); process.exitCode=1; }
}
console.log(`Migration finished for ${results.length}/${clients.length} clients.`);
