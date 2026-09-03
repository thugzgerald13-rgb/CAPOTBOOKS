#!/usr/bin/env node
/**
 * CAPOT legacy -> normalized Supabase migration.
 *
 * IMPORTANT:
 *   - Use a STAGING Supabase project first.
 *   - This script requires the SERVICE ROLE key because it migrates every
 *     client without relying on the signed-in browser user's RLS session.
 *   - Default mode is DRY RUN. Use --confirm to write data.
 *   - Legacy clients.data is never deleted by this script.
 *   - Base64/data URLs are uploaded to the private client-files bucket and
 *     only storage_path is written to PostgreSQL.
 *
 * Environment:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional:
 *   MIGRATION_BUCKET=client-files
 *   MIGRATION_BATCH_SIZE=200
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const args = new Set(process.argv.slice(2));
const CONFIRM = args.has('--confirm');
const ONLY_CLIENT = process.argv.includes('--client')
  ? process.argv[process.argv.indexOf('--client') + 1]
  : null;
const BUCKET = process.env.MIGRATION_BUCKET || 'client-files';
const BATCH_SIZE = Number(process.env.MIGRATION_BATCH_SIZE || 200);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

if (ONLY_CLIENT === '--confirm' || ONLY_CLIENT === '--dry-run') {
  console.error('Missing value after --client.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const str = (v) => (v == null ? '' : String(v));
const nullable = (v) => (v === undefined || v === null || v === '' ? null : v);
const num = (v, fallback = 0) => {
  if (v === '' || v === null || v === undefined) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};
const bool = (v) => !!v;
const date = (v) => (v ? String(v).slice(0, 10) : null);
const id = (v, fallback = null) => {
  if (v === undefined || v === null || v === '') return fallback;
  return String(v);
};
const asArray = (v) => {
  if (Array.isArray(v)) return v;
  if (v && typeof v === 'object') return Object.values(v);
  return [];
};
const chunks = (items, size = BATCH_SIZE) => {
  const result = [];
  for (let i = 0; i < items.length; i += size) result.push(items.slice(i, i + size));
  return result;
};

function stableTinId(partyType, tin, name) {
  const normalizedTin = str(tin).replace(/\D/g, '');
  const normalizedName = str(name).trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
  return `tin_${partyType}_${normalizedTin || normalizedName || 'unknown'}`;
}

function dataUrlToBuffer(value) {
  if (!value || typeof value !== 'string') return null;
  const match = value.match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.*)$/s);
  if (match) return { contentType: match[1] || 'application/octet-stream', buffer: Buffer.from(match[2], 'base64') };
  // Some legacy records may contain raw base64 without a data-url prefix.
  if (/^[A-Za-z0-9+/\r\n]+={0,2}$/.test(value) && value.length > 32) {
    try { return { contentType: 'application/octet-stream', buffer: Buffer.from(value, 'base64') }; } catch {}
  }
  return null;
}

function safeFilename(name, fallback = 'file') {
  const base = str(name || fallback).split(/[\\/]/).pop().replace(/[^a-zA-Z0-9._-]+/g, '_');
  return base || fallback;
}

async function ensureBucket() {
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw error;
  if (buckets?.some((b) => b.name === BUCKET)) return;
  if (!CONFIRM) {
    console.log(`[DRY RUN] Would create private Storage bucket: ${BUCKET}`);
    return;
  }
  const { error: createError } = await supabase.storage.createBucket(BUCKET, { public: false });
  if (createError && !/already exists/i.test(createError.message || '')) throw createError;
}

async function upsertMany(table, rows) {
  if (!rows.length) return;
  if (!CONFIRM) return;
  for (const part of chunks(rows)) {
    const { error } = await supabase.from(table).upsert(part, { onConflict: 'id' });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function uploadLegacyContent(clientId, fileId, attachment, defaultFolder = 'files') {
  if (!attachment) return null;
  const content = attachment.content;
  if (!content || attachment.storagePath) return attachment.storagePath || null;
  const decoded = dataUrlToBuffer(content);
  if (!decoded) {
    console.warn(`  ! Could not decode attachment ${fileId}; leaving it out of Storage migration.`);
    return null;
  }
  const filename = safeFilename(attachment.name, `${fileId}.bin`);
  const path = `${clientId}/${fileId}/${filename}`;
  if (CONFIRM) {
    const { error } = await supabase.storage.from(BUCKET).upload(path, decoded.buffer, {
      contentType: attachment.type || decoded.contentType,
      upsert: true,
    });
    if (error) throw new Error(`Storage upload ${path}: ${error.message}`);
  }
  return path;
}

async function migratePurchases(clientId, data, stats) {
  const rows = [];
  for (const p of asArray(data.purchases)) {
    const pid = id(p.id);
    if (!pid) continue;
    const storagePath = await uploadLegacyContent(clientId, pid, p.attachment, 'purchases');
    rows.push({
      id: pid, client_id: clientId, dat_month_year: nullable(p.datMonthYear), date: date(p.date),
      payment_method: str(p.paymentMethod), check_number: nullable(p.checkNumber), bank_name: nullable(p.bankName),
      invoice_no: nullable(p.invoiceNo), supplier_name: str(p.supplierName), supplier_address: nullable(p.supplierAddress),
      supplier_tin: nullable(p.supplierTin), amount: num(p.amount), vat_type: nullable(p.vatType),
      expense_type: nullable(p.expenseType), account_title: nullable(p.accountTitle), transaction_details: nullable(p.transactionDetails),
      input_tax: num(p.inputTax), attachment_name: nullable(p.attachment?.name), attachment_type: nullable(p.attachment?.type),
      attachment_original_type: nullable(p.attachment?.originalType), attachment_size: p.attachment?.size == null ? null : num(p.attachment.size),
      attachment_original_size: p.attachment?.originalSize == null ? null : num(p.attachment.originalSize),
      attachment_compression: nullable(p.attachment?.compression), attachment_storage_path: storagePath,
      withholding_option: nullable(p.withholdingOption), atc_code: nullable(p.atcCode), wht_rate: p.whtRate == null ? null : num(p.whtRate),
      wht_amount: p.whtAmount == null ? null : num(p.whtAmount),
    });
  }
  stats.purchases += rows.length;
  await upsertMany('purchases', rows);
}

async function migrateSimple(clientId, data, stats) {
  const sales = asArray(data.sales).filter((s) => id(s.id)).map((s) => ({
    id: id(s.id), client_id: clientId, dat_month_year: nullable(s.datMonthYear), date: date(s.date), ref: nullable(s.ref),
    payment_type: nullable(s.paymentType), buyer_tin: nullable(s.buyerTin), buyer_name: nullable(s.buyerName), buyer_address: nullable(s.buyerAddress),
    vat_type: nullable(s.vatType), amount: num(s.amount), net_of_vat: num(s.netOfVat), output_tax: num(s.outputTax),
    income_type: nullable(s.incomeType), description: nullable(s.desc ?? s.description),
  }));
  const expenses = asArray(data.expenses).filter((e) => id(e.id)).map((e) => ({
    id: id(e.id), client_id: clientId, date: date(e.date), amount: num(e.amount), category: str(e.category), description: str(e.description),
  }));
  await upsertMany('sales', sales); await upsertMany('expenses', expenses);
  stats.sales += sales.length; stats.expenses += expenses.length;
}

async function migrateCoa(clientId, data, stats) {
  const columns = asArray(data.coaColumns).filter((x) => id(x.id)).map((c) => ({ id: id(c.id), client_id: clientId, name: nullable(c.name), is_system: bool(c.isSystem) }));
  const accounts = asArray(data.accounts ?? data.coaAccounts).filter((x) => id(x.id)).map((a) => {
    const custom = { ...a };
    delete custom.id; delete custom.name; delete custom.type; delete custom.normalSide; delete custom.parentId;
    delete custom.hidden; delete custom.openingBalance;
    return { id: id(a.id), client_id: clientId, name: str(a.name), type: str(a.type), normal_side: nullable(a.normalSide),
      parent_id: nullable(a.parentId), hidden: bool(a.hidden), opening_balance: num(a.openingBalance), custom_values: custom };
  });
  await upsertMany('coa_columns', columns); await upsertMany('coa_accounts', accounts);
  stats.coa_columns += columns.length; stats.coa_accounts += accounts.length;
}

async function migrateJournals(clientId, data, stats) {
  const types = [['CRJ', 'crjColumns', 'crjEntries'], ['CDJ', 'cdjColumns', 'cdjEntries'], ['PJ', 'pjColumns', 'pjEntries'], ['GJ', 'gjColumns', 'gjEntries']];
  for (const [journalType, colKey, entryKey] of types) {
    const columns = asArray(data[colKey]).filter((x) => id(x.id)).map((c) => ({ id: id(c.id), client_id: clientId, journal_type: journalType,
      name: nullable(c.name), type: nullable(c.type), category: nullable(c.category), is_system: bool(c.isSystem) }));
    const entries = asArray(data[entryKey]).filter((x) => id(x.id)).map((e) => ({ id: id(e.id), client_id: clientId, journal_type: journalType,
      values: e.values && typeof e.values === 'object' ? e.values : {}, auto: bool(e.auto), auto_source: nullable(e.autoSource),
      entry_date: date(e.date ?? e.entryDate), description: nullable(e.description), total_debit: e.totalDebit == null ? null : num(e.totalDebit),
      total_credit: e.totalCredit == null ? null : num(e.totalCredit) }));
    await upsertMany('journal_columns', columns); await upsertMany('journal_entries', entries);
    stats.journal_columns += columns.length; stats.journal_entries += entries.length;
  }
}

async function migrateVouchers(clientId, data, stats) {
  const vouchers = asArray(data.journalVouchers).filter((v) => id(v.id)).map((v) => ({ id: id(v.id), client_id: clientId, date: date(v.date),
    reference: nullable(v.reference), memo: nullable(v.memo) }));
  const lines = [];
  for (const v of asArray(data.journalVouchers)) {
    const vid = id(v.id); if (!vid) continue;
    for (const l of asArray(v.lines)) if (id(l.id)) lines.push({ id: id(l.id), client_id: clientId, journal_voucher_id: vid,
      account_id: nullable(l.accountId), account_name: nullable(l.accountName), debit: num(l.debit), credit: num(l.credit) });
  }
  await upsertMany('journal_vouchers', vouchers); await upsertMany('journal_voucher_lines', lines);
  stats.journal_vouchers += vouchers.length; stats.journal_voucher_lines += lines.length;
}

async function migrateAp(clientId, data, stats) {
  const pos = []; const poItems = [];
  for (const o of asArray(data.purchaseOrders)) {
    const oid = id(o.id); if (!oid) continue;
    pos.push({ id: oid, client_id: clientId, date: date(o.date), supplier_id: nullable(o.supplierId), supplier_name: nullable(o.supplierName), total_amount: num(o.totalAmount), status: nullable(o.status) });
    asArray(o.items).forEach((i, index) => poItems.push({ id: id(i.id, `${oid}:item:${index}`), client_id: clientId, purchase_order_id: oid,
      item_code: nullable(i.itemCode), description: nullable(i.description), qty: num(i.qty), unit_price: num(i.unitPrice) }));
  }
  const rrs = []; const rrItems = [];
  for (const r of asArray(data.receivingReports)) {
    const rid = id(r.id); if (!rid) continue;
    rrs.push({ id: rid, client_id: clientId, date: date(r.date), po_id: nullable(r.poId), supplier_name: nullable(r.supplierName), total_amount: num(r.totalAmount), received_by: nullable(r.receivedBy) });
    asArray(r.items).forEach((i, index) => rrItems.push({ id: id(i.id, `${rid}:item:${index}`), client_id: clientId, receiving_report_id: rid,
      item_code: nullable(i.itemCode), description: nullable(i.description), qty_ordered: num(i.qtyOrdered), qty_received: num(i.qtyReceived), unit_price: num(i.unitPrice) }));
  }
  const invoices = []; const invoiceItems = [];
  for (const i of asArray(data.payableInvoices)) {
    const iid = id(i.id); if (!iid) continue;
    invoices.push({ id: iid, client_id: clientId, invoice_number: nullable(i.invoiceNumber), date: date(i.date), due_date: date(i.dueDate),
      po_id: nullable(i.poId), rr_id: nullable(i.rrId), supplier_id: nullable(i.supplierId), supplier_name: nullable(i.supplierName), subtotal: num(i.subtotal),
      vat_amount: num(i.vatAmount), is_vatable: bool(i.isVatable), withholding_tax_id: nullable(i.withholdingTaxId), wht_amount: i.whtAmount == null ? null : num(i.whtAmount),
      total_amount: num(i.totalAmount), status: nullable(i.status), discrepancy_details: nullable(i.discrepancyDetails),
      applied_prepayments: i.appliedPrepayments == null ? null : i.appliedPrepayments });
    asArray(i.items).forEach((x, index) => invoiceItems.push({ id: id(x.id, `${iid}:item:${index}`), client_id: clientId, payable_invoice_id: iid,
      item_code: nullable(x.itemCode), description: nullable(x.description), qty: num(x.qty), unit_price: num(x.unitPrice) }));
  }
  // Parents first because item tables have foreign keys.
  await upsertMany('purchase_orders', pos); await upsertMany('purchase_order_items', poItems);
  await upsertMany('receiving_reports', rrs); await upsertMany('receiving_report_items', rrItems);
  await upsertMany('payable_invoices', invoices); await upsertMany('payable_invoice_items', invoiceItems);
  stats.purchase_orders += pos.length; stats.purchase_order_items += poItems.length; stats.receiving_reports += rrs.length; stats.receiving_report_items += rrItems.length;
  stats.payable_invoices += invoices.length; stats.payable_invoice_items += invoiceItems.length;
}

async function migrateInventory(clientId, data, stats) {
  const columns = asArray(data.inventoryColumns).filter((x) => id(x.id)).map((c) => ({ id: id(c.id), client_id: clientId, label: nullable(c.label) }));
  const items = asArray(data.inventoryItems).filter((x) => id(x.id)).map((i) => ({ id: id(i.id), client_id: clientId, code: nullable(i.code), name: nullable(i.name), sku: nullable(i.sku),
    description: nullable(i.description), category: nullable(i.category), unit_of_measure: nullable(i.unitOfMeasure), cost_price: num(i.costPrice), selling_price: num(i.sellingPrice),
    stock_level: num(i.stockLevel), reorder_point: num(i.reorderPoint), location: nullable(i.location), custom_fields: i.customFields || {} }));
  const movements = asArray(data.inventoryMovements).filter((x) => id(x.id)).map((m) => ({ id: id(m.id), client_id: clientId, item_id: nullable(m.itemId), item_name: nullable(m.itemName), item_code: nullable(m.itemCode),
    date: date(m.date), type: nullable(m.type), qty: num(m.qty), unit_cost: num(m.unitCost), total_value: num(m.totalValue), reference: nullable(m.reference), notes: nullable(m.notes) }));
  await upsertMany('inventory_columns', columns); await upsertMany('inventory_items', items); await upsertMany('inventory_movements', movements);
  stats.inventory_columns += columns.length; stats.inventory_items += items.length; stats.inventory_movements += movements.length;
}

async function migrateFiles(clientId, data, stats) {
  const folders = asArray(data.folders).filter((x) => id(x.id)).map((f) => ({ id: id(f.id), client_id: clientId, name: nullable(f.name), is_default: bool(f.isDefault), type: nullable(f.type) || 'custom' }));
  const files = [];
  for (const f of asArray(data.files)) {
    const fid = id(f.id); if (!fid) continue;
    const storagePath = await uploadLegacyContent(clientId, fid, f, 'files');
    // A legacy file without content/path cannot be represented as a usable
    // normalized file. Keep metadata only when it already has a Storage path.
    if (!storagePath) continue;
    files.push({ id: fid, client_id: clientId, name: nullable(f.name), type: nullable(f.type) || 'application/octet-stream', size: f.size == null ? null : num(f.size),
      uploaded_at: f.uploadedAt || new Date().toISOString(), folder_id: nullable(f.folderId), storage_path: storagePath, description: nullable(f.description) });
  }
  await upsertMany('app_folders', folders); await upsertMany('app_files', files);
  stats.app_folders += folders.length; stats.app_files += files.length;
}

async function migrateTin(clientId, data, stats) {
  const tins = [];
  const library = data.tinLibrary || {};
  for (const partyType of ['customer', 'supplier']) {
    const source = partyType === 'customer' ? library.customers : library.suppliers;
    for (const x of asArray(source)) {
      const tin = str(x.tin); const name = str(x.name).trim();
      const tid = id(x.id, stableTinId(partyType, tin, name));
      tins.push({ id: tid, client_id: clientId, tin, name, address: nullable(x.address), party_type: partyType });
    }
  }
  await upsertMany('tin_entries', tins); stats.tin_entries += tins.length;
}

async function migrateMastersAndPayments(clientId, data, stats) {
  const tax = asArray(data.taxDeadlines).filter((x) => id(x.id)).map((t) => ({ id: id(t.id), client_id: clientId, form_type: nullable(t.formType), title: nullable(t.title), period: nullable(t.period), due_date: date(t.dueDate),
    status: nullable(t.status), tax_status: nullable(t.taxStatus), amount_due: t.amountDue == null ? null : num(t.amountDue), date_filed: date(t.dateFiled), date_paid: date(t.datePaid), reference_no: nullable(t.referenceNo), confirmation_no: nullable(t.confirmationNo), notes: nullable(t.notes) }));
  const banks = asArray(data.bankAccounts).filter((x) => id(x.id)).map((b) => ({ id: id(b.id), client_id: clientId, bank_name: nullable(b.bankName), account_number: nullable(b.accountNumber), balance: num(b.balance) }));
  const advances = asArray(data.supplierAdvances).filter((x) => id(x.id)).map((a) => ({ id: id(a.id), client_id: clientId, supplier_id: nullable(a.supplierId), supplier_name: nullable(a.supplierName), date: date(a.date), amount: num(a.amount), is_liquidated: bool(a.isLiquidated), notes: nullable(a.notes) }));
  const wht = asArray(data.withholdingTaxEntries).filter((x) => id(x.id)).map((w) => ({ id: id(w.id), client_id: clientId, atc_code: nullable(w.atcCode), description: nullable(w.description), tax_rate: num(w.taxRate), category: nullable(w.category) }));
  const memos = asArray(data.debitCreditMemos).filter((x) => id(x.id)).map((m) => ({ id: id(m.id), client_id: clientId, type: nullable(m.type), invoice_id: nullable(m.invoiceId), invoice_number: nullable(m.invoiceNumber), supplier_name: nullable(m.supplierName), date: date(m.date), amount: num(m.amount), reason: nullable(m.reason) }));
  const checks = asArray(data.checkVouchers).filter((x) => id(x.id)).map((v) => ({ id: id(v.id), client_id: clientId, date: date(v.date), payee_name: nullable(v.payeeName), invoice_id: nullable(v.invoiceId), invoice_number: nullable(v.invoiceNumber), payment_type: nullable(v.paymentType), misc_details: nullable(v.miscDetails), amount: num(v.amount), checked_by: nullable(v.checkedBy), approved_by: nullable(v.approvedBy), bank_account_id: nullable(v.bankAccountId), bank_name: nullable(v.bankName), check_number: nullable(v.checkNumber), status: nullable(v.status), reversed_reason: nullable(v.reversedReason), reversed_at: v.reversedAt || null }));
  const misc = asArray(data.miscellaneousPayments).filter((x) => id(x.id)).map((m) => ({ id: id(m.id), client_id: clientId, date: date(m.date), payee_name: nullable(m.payeeName), amount: num(m.amount), bank_account_id: nullable(m.bankAccountId), bank_name: nullable(m.bankName), check_number: nullable(m.checkNumber), expense_category: nullable(m.expenseCategory), description: nullable(m.description) }));
  const assets = asArray(data.assetLapsingSchedule).filter((x) => id(x.id)).map((a) => ({ id: id(a.id), client_id: clientId, date_purchased: date(a.datePurchased), invoice_no: nullable(a.invoiceNo), description: nullable(a.description), cost: num(a.cost), useful_life_years: num(a.usefulLifeYears), salvage_value: num(a.salvageValue) }));
  const billing = asArray(data.billingInvoices).filter((x) => id(x.id)).map((b) => ({ id: id(b.id), client_id: clientId, date: date(b.date), due_date: date(b.dueDate), invoice_no: nullable(b.invoiceNo), customer_tin: nullable(b.customerTin), customer_name: nullable(b.customerName), customer_address: nullable(b.customerAddress), vat_type: nullable(b.vatType), amount: num(b.amount), net_of_vat: num(b.netOfVat), output_tax: num(b.outputTax), description: nullable(b.description), status: nullable(b.status), payment_type: nullable(b.paymentType), date_paid: date(b.datePaid), is_recurring: bool(b.isRecurring), recurrence_frequency: nullable(b.recurrenceFrequency), next_billing_date: date(b.nextBillingDate), parent_invoice_id: nullable(b.parentInvoiceId) }));
  await upsertMany('tax_deadlines', tax); await upsertMany('bank_accounts', banks); await upsertMany('supplier_advances', advances); await upsertMany('withholding_tax_entries', wht);
  await upsertMany('debit_credit_memos', memos); await upsertMany('check_vouchers', checks); await upsertMany('miscellaneous_payments', misc); await upsertMany('asset_lapsing_schedule', assets); await upsertMany('billing_invoices', billing);
  stats.tax_deadlines += tax.length; stats.bank_accounts += banks.length; stats.supplier_advances += advances.length; stats.withholding_tax_entries += wht.length; stats.debit_credit_memos += memos.length; stats.check_vouchers += checks.length; stats.miscellaneous_payments += misc.length; stats.asset_lapsing_schedule += assets.length; stats.billing_invoices += billing.length;
}

async function migrateSnapshots(clientId, data, stats) {
  const snapshots = [];
  if (data.plData) snapshots.push({ id: `${clientId}:pl`, client_id: clientId, report_type: 'P&L', period_key: nullable(data.plData.period) || 'current', data: data.plData });
  if (data.bsData) snapshots.push({ id: `${clientId}:bs`, client_id: clientId, report_type: 'Balance Sheet', period_key: nullable(data.bsData.asOfDate) || 'current', data: data.bsData });
  if (data.cfData) snapshots.push({ id: `${clientId}:cf`, client_id: clientId, report_type: 'Cash Flow', period_key: nullable(data.cfData.period) || 'current', data: data.cfData });
  await upsertMany('financial_report_snapshots', snapshots); stats.report_snapshots += snapshots.length;
}

function emptyStats() {
  return Object.fromEntries([
    'purchases','sales','expenses','coa_columns','coa_accounts','journal_columns','journal_entries','journal_vouchers','journal_voucher_lines',
    'purchase_orders','purchase_order_items','receiving_reports','receiving_report_items','payable_invoices','payable_invoice_items',
    'inventory_columns','inventory_items','inventory_movements','app_folders','app_files','tin_entries','tax_deadlines','bank_accounts','supplier_advances',
    'withholding_tax_entries','debit_credit_memos','check_vouchers','miscellaneous_payments','asset_lapsing_schedule','billing_invoices','report_snapshots'
  ].map((k) => [k, 0]));
}

async function loadClients() {
  let query = supabase.from('clients').select('id,user_id,name,tin,taxpayer_classification,registered_name,last_name,first_name,middle_name,trade_name,substreet,street,barangay,district,city,zip_code,rdo_code,phone,email,category,has_multiple_business_lines,accounting_type,fiscal_month_end,coa_format,data');
  if (ONLY_CLIENT) query = query.eq('id', ONLY_CLIENT);
  const { data, error } = await query.order('id');
  if (error) throw error;
  return data || [];
}

async function migrateClient(row) {
  const legacy = row.data;
  if (!legacy || typeof legacy !== 'object') {
    console.log(`- ${row.id}: no clients.data payload; skipped.`);
    return { skipped: true, stats: emptyStats() };
  }

  const stats = emptyStats();
  const parent = {
    id: row.id, user_id: row.user_id, name: row.name || legacy.name || row.id,
    tin: nullable(row.tin ?? legacy.tin), taxpayer_classification: nullable(row.taxpayer_classification ?? legacy.taxpayerClassification),
    registered_name: nullable(row.registered_name ?? legacy.registeredName), last_name: nullable(row.last_name ?? legacy.lastName),
    first_name: nullable(row.first_name ?? legacy.firstName), middle_name: nullable(row.middle_name ?? legacy.middleName), trade_name: nullable(row.trade_name ?? legacy.tradeName),
    substreet: nullable(row.substreet ?? legacy.substreet), street: nullable(row.street ?? legacy.street), barangay: nullable(row.barangay ?? legacy.barangay),
    district: nullable(row.district ?? legacy.district), city: nullable(row.city ?? legacy.city), zip_code: nullable(row.zip_code ?? legacy.zipCode), rdo_code: nullable(row.rdo_code ?? legacy.rdoCode),
    phone: nullable(row.phone ?? legacy.phone), email: nullable(row.email ?? legacy.email), category: row.category || legacy.category || 'private',
    has_multiple_business_lines: row.has_multiple_business_lines ?? bool(legacy.hasMultipleBusinessLines), accounting_type: row.accounting_type || legacy.accountingType || 'Calendar',
    fiscal_month_end: row.fiscal_month_end || legacy.fiscalMonthEnd || 12, coa_format: row.coa_format || legacy.coaFormat || 'numeric'
  };

  if (CONFIRM) {
    const { error } = await supabase.from('clients').upsert(parent, { onConflict: 'id' });
    if (error) throw new Error(`clients ${row.id}: ${error.message}`);
  }

  await migratePurchases(row.id, legacy, stats);
  await migrateSimple(row.id, legacy, stats);
  await migrateCoa(row.id, legacy, stats);
  await migrateJournals(row.id, legacy, stats);
  await migrateVouchers(row.id, legacy, stats);
  await migrateAp(row.id, legacy, stats);
  await migrateInventory(row.id, legacy, stats);
  await migrateFiles(row.id, legacy, stats);
  await migrateTin(row.id, legacy, stats);
  await migrateMastersAndPayments(row.id, legacy, stats);
  await migrateSnapshots(row.id, legacy, stats);

  return { skipped: false, stats };
}

function printStats(stats) {
  const entries = Object.entries(stats).filter(([, v]) => v);
  if (!entries.length) return '  (no rows)';
  return entries.map(([k, v]) => `  ${k}: ${v}`).join('\n');
}

async function main() {
  console.log(`CAPOT legacy migration — ${CONFIRM ? 'WRITE MODE' : 'DRY RUN'}`);
  console.log(`Supabase: ${SUPABASE_URL}`);
  console.log(`Storage bucket: ${BUCKET}`);
  if (ONLY_CLIENT) console.log(`Client filter: ${ONLY_CLIENT}`);
  if (!CONFIRM) console.log('No database or Storage writes will be performed. Use --confirm to migrate.');
  if (CONFIRM && !args.has('--confirm')) throw new Error('Internal confirmation error.');

  await ensureBucket();
  const clients = await loadClients();
  console.log(`Found ${clients.length} client(s).`);

  const totals = emptyStats();
  let skipped = 0;
  for (const row of clients) {
    console.log(`\nMigrating ${row.id} — ${row.name || ''}`);
    try {
      const result = await migrateClient(row);
      if (result.skipped) { skipped += 1; continue; }
      for (const [key, value] of Object.entries(result.stats)) totals[key] += value;
      console.log(printStats(result.stats));
    } catch (error) {
      console.error(`FAILED ${row.id}: ${error.message}`);
      throw error;
    }
    await sleep(25);
  }

  console.log('\n=== MIGRATION SUMMARY ===');
  console.log(printStats(totals));
  console.log(`Clients skipped: ${skipped}`);
  console.log(CONFIRM
    ? '\nMigration writes completed. Run scripts/verify-normalized.sql before application cutover.'
    : '\nDRY RUN complete. Re-run with --confirm to write the normalized tables and Storage.');
}

main().catch((error) => {
  console.error('\nMigration aborted:', error.message || error);
  process.exit(1);
});
