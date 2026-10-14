-- CAPOT hierarchical UI permissions — apply AFTER scripts/client_specific_permissions.sql.
-- Stores owner-selected module, action, and dropdown permissions per team member and client.
-- Base transaction permissions remain enforced through can_access_client_operation().

create table if not exists public.account_team_client_ui_permissions (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  permissions jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_user_id, member_user_id, client_id),
  constraint account_team_client_ui_permissions_object check (jsonb_typeof(permissions) = 'object')
);
create index if not exists idx_account_team_client_ui_permissions_member
  on public.account_team_client_ui_permissions(member_user_id, client_id);
alter table public.account_team_client_ui_permissions enable row level security;
revoke all on table public.account_team_client_ui_permissions from public, anon, authenticated;

drop trigger if exists trg_account_team_client_ui_permissions_updated_at on public.account_team_client_ui_permissions;
create trigger trg_account_team_client_ui_permissions_updated_at
before update on public.account_team_client_ui_permissions
for each row execute function public.set_updated_at();

create table if not exists public.capot_ui_permission_catalog (
  permission_key text primary key,
  module_id text not null,
  permission_kind text not null check (permission_kind in ('module','action','dropdown')),
  label text not null,
  required_permission text null,
  updated_at timestamptz not null default now()
);
revoke all on table public.capot_ui_permission_catalog from public, anon, authenticated;
insert into public.capot_ui_permission_catalog (permission_key, module_id, permission_kind, label, required_permission)
values
  ('module.dashboard', 'dashboard', 'module', 'Dashboard', NULL),
  ('action.dashboard.view', 'dashboard', 'action', 'View', NULL),
  ('module.coa', 'coa', 'module', 'Chart of Accounts', 'manage_settings'),
  ('action.coa.view', 'coa', 'action', 'View', 'manage_settings'),
  ('action.coa.add', 'coa', 'action', 'Add', 'edit_transactions'),
  ('action.coa.edit', 'coa', 'action', 'Edit', 'edit_transactions'),
  ('action.coa.delete', 'coa', 'action', 'Delete', 'delete_transactions'),
  ('action.coa.import', 'coa', 'action', 'Import', 'edit_transactions'),
  ('action.coa.export', 'coa', 'action', 'Export', 'export_data'),
  ('action.coa.print', 'coa', 'action', 'Print', 'manage_settings'),
  ('action.coa.manage', 'coa', 'action', 'Manage settings/users', 'manage_settings'),
  ('dropdown.coa.account_type.asset', 'coa', 'dropdown', 'Asset', 'manage_settings'),
  ('dropdown.coa.account_type.liability', 'coa', 'dropdown', 'Liability', 'manage_settings'),
  ('dropdown.coa.account_type.equity', 'coa', 'dropdown', 'Equity', 'manage_settings'),
  ('dropdown.coa.account_type.income', 'coa', 'dropdown', 'Income', 'manage_settings'),
  ('dropdown.coa.account_type.expense', 'coa', 'dropdown', 'Expense', 'manage_settings'),
  ('module.billing', 'billing', 'module', 'Billing / Invoices', 'edit_transactions'),
  ('action.billing.view', 'billing', 'action', 'View', 'edit_transactions'),
  ('action.billing.add', 'billing', 'action', 'Add', 'edit_transactions'),
  ('action.billing.edit', 'billing', 'action', 'Edit', 'edit_transactions'),
  ('action.billing.delete', 'billing', 'action', 'Delete', 'delete_transactions'),
  ('action.billing.post', 'billing', 'action', 'Post', 'edit_transactions'),
  ('action.billing.print', 'billing', 'action', 'Print', 'edit_transactions'),
  ('action.billing.export', 'billing', 'action', 'Export', 'export_data'),
  ('dropdown.billing.document_type.invoice', 'billing', 'dropdown', 'Invoice', 'edit_transactions'),
  ('dropdown.billing.document_type.official_receipt', 'billing', 'dropdown', 'Official receipt', 'edit_transactions'),
  ('dropdown.billing.document_type.statement_of_account', 'billing', 'dropdown', 'Statement of account', 'edit_transactions'),
  ('dropdown.billing.payment_type.cash', 'billing', 'dropdown', 'Cash', 'edit_transactions'),
  ('dropdown.billing.payment_type.check', 'billing', 'dropdown', 'Check', 'edit_transactions'),
  ('dropdown.billing.payment_type.e_payment', 'billing', 'dropdown', 'E-Payment', 'edit_transactions'),
  ('dropdown.billing.payment_type.bank_transfer', 'billing', 'dropdown', 'Bank transfer', 'edit_transactions'),
  ('dropdown.billing.payment_type.credit_card', 'billing', 'dropdown', 'Credit card', 'edit_transactions'),
  ('dropdown.billing.payment_type.on_account', 'billing', 'dropdown', 'On account', 'edit_transactions'),
  ('module.payroll', 'payroll', 'module', 'Payroll', 'edit_transactions'),
  ('action.payroll.view', 'payroll', 'action', 'View', 'edit_transactions'),
  ('action.payroll.add', 'payroll', 'action', 'Add', 'edit_transactions'),
  ('action.payroll.edit', 'payroll', 'action', 'Edit', 'edit_transactions'),
  ('action.payroll.delete', 'payroll', 'action', 'Delete', 'delete_transactions'),
  ('action.payroll.approve', 'payroll', 'action', 'Approve', 'approve_journal'),
  ('action.payroll.print', 'payroll', 'action', 'Print', 'edit_transactions'),
  ('action.payroll.export', 'payroll', 'action', 'Export', 'export_data'),
  ('dropdown.payroll.workspace.employees', 'payroll', 'dropdown', 'Employees', 'edit_transactions'),
  ('dropdown.payroll.workspace.payroll_register', 'payroll', 'dropdown', 'Payroll register', 'edit_transactions'),
  ('dropdown.payroll.workspace.payslips', 'payroll', 'dropdown', 'Payslips', 'edit_transactions'),
  ('dropdown.payroll.workspace.statutory_reports', 'payroll', 'dropdown', 'Statutory reports', 'edit_transactions'),
  ('module.payroll_settings', 'payroll_settings', 'module', 'Payroll Settings', 'manage_settings'),
  ('action.payroll_settings.view', 'payroll_settings', 'action', 'View', 'manage_settings'),
  ('action.payroll_settings.edit', 'payroll_settings', 'action', 'Edit', 'edit_transactions'),
  ('action.payroll_settings.manage', 'payroll_settings', 'action', 'Manage settings/users', 'manage_settings'),
  ('dropdown.payroll_settings.settings.pay_periods', 'payroll_settings', 'dropdown', 'Pay periods', 'manage_settings'),
  ('dropdown.payroll_settings.settings.statutory_rates', 'payroll_settings', 'dropdown', 'Statutory rates', 'manage_settings'),
  ('dropdown.payroll_settings.settings.withholding_rules', 'payroll_settings', 'dropdown', 'Withholding rules', 'manage_settings'),
  ('dropdown.payroll_settings.settings.overtime_rules', 'payroll_settings', 'dropdown', 'Overtime rules', 'manage_settings'),
  ('module.sales', 'sales', 'module', 'Income / Sales', 'edit_transactions'),
  ('action.sales.view', 'sales', 'action', 'View', 'edit_transactions'),
  ('action.sales.add', 'sales', 'action', 'Add', 'edit_transactions'),
  ('action.sales.edit', 'sales', 'action', 'Edit', 'edit_transactions'),
  ('action.sales.delete', 'sales', 'action', 'Delete', 'delete_transactions'),
  ('action.sales.post', 'sales', 'action', 'Post', 'edit_transactions'),
  ('action.sales.print', 'sales', 'action', 'Print', 'edit_transactions'),
  ('action.sales.export', 'sales', 'action', 'Export', 'export_data'),
  ('dropdown.sales.payment_type.cash', 'sales', 'dropdown', 'Cash', 'edit_transactions'),
  ('dropdown.sales.payment_type.check', 'sales', 'dropdown', 'Check', 'edit_transactions'),
  ('dropdown.sales.payment_type.bank', 'sales', 'dropdown', 'Bank transfer', 'edit_transactions'),
  ('dropdown.sales.payment_type.credit', 'sales', 'dropdown', 'Credit', 'edit_transactions'),
  ('dropdown.sales.vat_type.vatable', 'sales', 'dropdown', 'VATable', 'edit_transactions'),
  ('dropdown.sales.vat_type.vat_exempt', 'sales', 'dropdown', 'VAT-exempt', 'edit_transactions'),
  ('dropdown.sales.vat_type.zero_rated', 'sales', 'dropdown', 'Zero-rated', 'edit_transactions'),
  ('dropdown.sales.income_type.goods', 'sales', 'dropdown', 'Sale of goods', 'edit_transactions'),
  ('dropdown.sales.income_type.services', 'sales', 'dropdown', 'Sale of services', 'edit_transactions'),
  ('module.purchases', 'purchases', 'module', 'Purchases / Bills', 'edit_transactions'),
  ('action.purchases.view', 'purchases', 'action', 'View', 'edit_transactions'),
  ('action.purchases.add', 'purchases', 'action', 'Add', 'edit_transactions'),
  ('action.purchases.edit', 'purchases', 'action', 'Edit', 'edit_transactions'),
  ('action.purchases.delete', 'purchases', 'action', 'Delete', 'delete_transactions'),
  ('action.purchases.post', 'purchases', 'action', 'Post', 'edit_transactions'),
  ('action.purchases.approve', 'purchases', 'action', 'Approve', 'approve_journal'),
  ('action.purchases.print', 'purchases', 'action', 'Print', 'edit_transactions'),
  ('action.purchases.export', 'purchases', 'action', 'Export', 'export_data'),
  ('action.purchases.import', 'purchases', 'action', 'Import', 'edit_transactions'),
  ('dropdown.purchases.payment_method.cash', 'purchases', 'dropdown', 'Cash', 'edit_transactions'),
  ('dropdown.purchases.payment_method.check', 'purchases', 'dropdown', 'Check', 'edit_transactions'),
  ('dropdown.purchases.payment_method.bank_transfer', 'purchases', 'dropdown', 'Bank transfer', 'edit_transactions'),
  ('dropdown.purchases.payment_method.credit', 'purchases', 'dropdown', 'Credit / payable', 'edit_transactions'),
  ('dropdown.purchases.vat_type.vat', 'purchases', 'dropdown', 'VAT', 'edit_transactions'),
  ('dropdown.purchases.vat_type.non_vat', 'purchases', 'dropdown', 'Non-VAT', 'edit_transactions'),
  ('dropdown.purchases.vat_type.vat_nonvat', 'purchases', 'dropdown', 'VAT + Non-VAT', 'edit_transactions'),
  ('dropdown.purchases.vat_type.zero_rated', 'purchases', 'dropdown', 'Zero-rated', 'edit_transactions'),
  ('dropdown.purchases.withholding.none', 'purchases', 'dropdown', 'No withholding', 'edit_transactions'),
  ('dropdown.purchases.withholding.withholding', 'purchases', 'dropdown', 'Apply withholding tax', 'edit_transactions'),
  ('dropdown.purchases.purchase_type.capital_goods', 'purchases', 'dropdown', 'Capital goods', 'edit_transactions'),
  ('dropdown.purchases.purchase_type.operating_expense', 'purchases', 'dropdown', 'Operating expense', 'edit_transactions'),
  ('dropdown.purchases.purchase_type.other_payment', 'purchases', 'dropdown', 'Other payment', 'edit_transactions'),
  ('module.purchases_invoiced', 'purchases_invoiced', 'module', 'Purchases · Invoiced', 'edit_transactions'),
  ('action.purchases_invoiced.view', 'purchases_invoiced', 'action', 'View', 'edit_transactions'),
  ('action.purchases_invoiced.add', 'purchases_invoiced', 'action', 'Add', 'edit_transactions'),
  ('action.purchases_invoiced.edit', 'purchases_invoiced', 'action', 'Edit', 'edit_transactions'),
  ('action.purchases_invoiced.delete', 'purchases_invoiced', 'action', 'Delete', 'delete_transactions'),
  ('action.purchases_invoiced.post', 'purchases_invoiced', 'action', 'Post', 'edit_transactions'),
  ('action.purchases_invoiced.print', 'purchases_invoiced', 'action', 'Print', 'edit_transactions'),
  ('action.purchases_invoiced.export', 'purchases_invoiced', 'action', 'Export', 'export_data'),
  ('module.purchases_other_payments', 'purchases_other_payments', 'module', 'Purchases · Other Payments', 'edit_transactions'),
  ('action.purchases_other_payments.view', 'purchases_other_payments', 'action', 'View', 'edit_transactions'),
  ('action.purchases_other_payments.add', 'purchases_other_payments', 'action', 'Add', 'edit_transactions'),
  ('action.purchases_other_payments.edit', 'purchases_other_payments', 'action', 'Edit', 'edit_transactions'),
  ('action.purchases_other_payments.delete', 'purchases_other_payments', 'action', 'Delete', 'delete_transactions'),
  ('action.purchases_other_payments.post', 'purchases_other_payments', 'action', 'Post', 'edit_transactions'),
  ('action.purchases_other_payments.print', 'purchases_other_payments', 'action', 'Print', 'edit_transactions'),
  ('action.purchases_other_payments.export', 'purchases_other_payments', 'action', 'Export', 'export_data'),
  ('module.purchases_ap', 'purchases_ap', 'module', 'Purchases · Accounts Payable', 'edit_transactions'),
  ('action.purchases_ap.view', 'purchases_ap', 'action', 'View', 'edit_transactions'),
  ('action.purchases_ap.add', 'purchases_ap', 'action', 'Add', 'edit_transactions'),
  ('action.purchases_ap.edit', 'purchases_ap', 'action', 'Edit', 'edit_transactions'),
  ('action.purchases_ap.delete', 'purchases_ap', 'action', 'Delete', 'delete_transactions'),
  ('action.purchases_ap.post', 'purchases_ap', 'action', 'Post', 'edit_transactions'),
  ('action.purchases_ap.approve', 'purchases_ap', 'action', 'Approve', 'approve_journal'),
  ('action.purchases_ap.print', 'purchases_ap', 'action', 'Print', 'edit_transactions'),
  ('action.purchases_ap.export', 'purchases_ap', 'action', 'Export', 'export_data'),
  ('dropdown.purchases_ap.ap_action.record_payment', 'purchases_ap', 'dropdown', 'Record payment', 'edit_transactions'),
  ('dropdown.purchases_ap.ap_action.apply_credit', 'purchases_ap', 'dropdown', 'Apply credit', 'edit_transactions'),
  ('dropdown.purchases_ap.ap_action.view_aging', 'purchases_ap', 'dropdown', 'View aging report', 'view_reports'),
  ('module.journal_voucher', 'journal_voucher', 'module', 'Journal Voucher', 'edit_transactions'),
  ('action.journal_voucher.view', 'journal_voucher', 'action', 'View', 'edit_transactions'),
  ('action.journal_voucher.add', 'journal_voucher', 'action', 'Add', 'edit_transactions'),
  ('action.journal_voucher.edit', 'journal_voucher', 'action', 'Edit', 'edit_transactions'),
  ('action.journal_voucher.delete', 'journal_voucher', 'action', 'Delete', 'delete_transactions'),
  ('action.journal_voucher.post', 'journal_voucher', 'action', 'Post', 'edit_transactions'),
  ('action.journal_voucher.approve', 'journal_voucher', 'action', 'Approve', 'approve_journal'),
  ('action.journal_voucher.print', 'journal_voucher', 'action', 'Print', 'edit_transactions'),
  ('action.journal_voucher.export', 'journal_voucher', 'action', 'Export', 'export_data'),
  ('dropdown.journal_voucher.voucher_type.general', 'journal_voucher', 'dropdown', 'General', 'edit_transactions'),
  ('dropdown.journal_voucher.voucher_type.adjusting', 'journal_voucher', 'dropdown', 'Adjusting', 'edit_transactions'),
  ('dropdown.journal_voucher.voucher_type.closing', 'journal_voucher', 'dropdown', 'Closing', 'edit_transactions'),
  ('dropdown.journal_voucher.voucher_type.reversing', 'journal_voucher', 'dropdown', 'Reversing', 'edit_transactions'),
  ('module.history', 'history', 'module', 'Expense / Income History', 'view_reports'),
  ('action.history.view', 'history', 'action', 'View', 'view_reports'),
  ('action.history.print', 'history', 'action', 'Print', 'view_reports'),
  ('action.history.export', 'history', 'action', 'Export', 'export_data'),
  ('dropdown.history.history_type.expenses', 'history', 'dropdown', 'Expense history', 'view_reports'),
  ('dropdown.history.history_type.income', 'history', 'dropdown', 'Income history', 'view_reports'),
  ('module.compliance_tracker', 'compliance_tracker', 'module', 'Compliance Tracker', 'view_reports'),
  ('action.compliance_tracker.view', 'compliance_tracker', 'action', 'View', 'view_reports'),
  ('action.compliance_tracker.edit', 'compliance_tracker', 'action', 'Edit', 'edit_transactions'),
  ('action.compliance_tracker.approve', 'compliance_tracker', 'action', 'Approve', 'approve_journal'),
  ('action.compliance_tracker.print', 'compliance_tracker', 'action', 'Print', 'view_reports'),
  ('action.compliance_tracker.export', 'compliance_tracker', 'action', 'Export', 'export_data'),
  ('dropdown.compliance_tracker.compliance_action.deadlines', 'compliance_tracker', 'dropdown', 'View deadlines', 'view_reports'),
  ('dropdown.compliance_tracker.compliance_action.mark_paid', 'compliance_tracker', 'dropdown', 'Mark as paid', 'edit_transactions'),
  ('dropdown.compliance_tracker.compliance_action.mark_filed', 'compliance_tracker', 'dropdown', 'Mark as filed', 'edit_transactions'),
  ('module.bir_forms', 'bir_forms', 'module', 'BIR Forms', 'view_reports'),
  ('action.bir_forms.view', 'bir_forms', 'action', 'View', 'view_reports'),
  ('action.bir_forms.print', 'bir_forms', 'action', 'Print', 'view_reports'),
  ('action.bir_forms.export', 'bir_forms', 'action', 'Export', 'export_data'),
  ('dropdown.bir_forms.bir_form.2550q', 'bir_forms', 'dropdown', 'BIR Form 2550Q', 'view_reports'),
  ('dropdown.bir_forms.bir_form.1701q', 'bir_forms', 'dropdown', 'BIR Form 1701Q', 'view_reports'),
  ('dropdown.bir_forms.bir_form.2551q', 'bir_forms', 'dropdown', 'BIR Form 2551Q', 'view_reports'),
  ('dropdown.bir_forms.bir_form.1601c', 'bir_forms', 'dropdown', 'BIR Form 1601-C', 'view_reports'),
  ('dropdown.bir_forms.bir_form.0619e', 'bir_forms', 'dropdown', 'BIR Form 0619-E', 'view_reports'),
  ('dropdown.bir_forms.bir_form.1601eq', 'bir_forms', 'dropdown', 'BIR Form 1601-EQ', 'view_reports'),
  ('module.eis_center', 'eis_center', 'module', 'BIR E-Invoicing (EIS)', 'edit_transactions'),
  ('action.eis_center.view', 'eis_center', 'action', 'View', 'edit_transactions'),
  ('action.eis_center.add', 'eis_center', 'action', 'Add', 'edit_transactions'),
  ('action.eis_center.edit', 'eis_center', 'action', 'Edit', 'edit_transactions'),
  ('action.eis_center.post', 'eis_center', 'action', 'Post', 'edit_transactions'),
  ('action.eis_center.print', 'eis_center', 'action', 'Print', 'edit_transactions'),
  ('action.eis_center.export', 'eis_center', 'action', 'Export', 'export_data'),
  ('dropdown.eis_center.eis_action.build_json', 'eis_center', 'dropdown', 'Build payload', 'edit_transactions'),
  ('dropdown.eis_center.eis_action.validate', 'eis_center', 'dropdown', 'Validate payload', 'edit_transactions'),
  ('dropdown.eis_center.eis_action.transmit', 'eis_center', 'dropdown', 'Transmit to BIR', 'edit_transactions'),
  ('module.cashflow', 'cashflow', 'module', 'Cash Flow', 'view_reports'),
  ('action.cashflow.view', 'cashflow', 'action', 'View', 'view_reports'),
  ('action.cashflow.print', 'cashflow', 'action', 'Print', 'view_reports'),
  ('action.cashflow.export', 'cashflow', 'action', 'Export', 'export_data'),
  ('module.journal', 'journal', 'module', 'General Journal', 'view_reports'),
  ('action.journal.view', 'journal', 'action', 'View', 'view_reports'),
  ('action.journal.add', 'journal', 'action', 'Add', 'edit_transactions'),
  ('action.journal.edit', 'journal', 'action', 'Edit', 'edit_transactions'),
  ('action.journal.delete', 'journal', 'action', 'Delete', 'delete_transactions'),
  ('action.journal.post', 'journal', 'action', 'Post', 'edit_transactions'),
  ('action.journal.approve', 'journal', 'action', 'Approve', 'approve_journal'),
  ('action.journal.print', 'journal', 'action', 'Print', 'view_reports'),
  ('action.journal.export', 'journal', 'action', 'Export', 'export_data'),
  ('dropdown.journal.journal_type.general', 'journal', 'dropdown', 'General journal', 'view_reports'),
  ('dropdown.journal.journal_type.adjusting', 'journal', 'dropdown', 'Adjusting entries', 'view_reports'),
  ('dropdown.journal.journal_type.closing', 'journal', 'dropdown', 'Closing entries', 'view_reports'),
  ('dropdown.journal.journal_type.reversing', 'journal', 'dropdown', 'Reversing entries', 'view_reports'),
  ('module.ledger', 'ledger', 'module', 'General Ledger', 'view_reports'),
  ('action.ledger.view', 'ledger', 'action', 'View', 'view_reports'),
  ('action.ledger.print', 'ledger', 'action', 'Print', 'view_reports'),
  ('action.ledger.export', 'ledger', 'action', 'Export', 'export_data'),
  ('module.sales_journal', 'sales_journal', 'module', 'Sales Journal', 'edit_transactions'),
  ('action.sales_journal.view', 'sales_journal', 'action', 'View', 'edit_transactions'),
  ('action.sales_journal.add', 'sales_journal', 'action', 'Add', 'edit_transactions'),
  ('action.sales_journal.edit', 'sales_journal', 'action', 'Edit', 'edit_transactions'),
  ('action.sales_journal.delete', 'sales_journal', 'action', 'Delete', 'delete_transactions'),
  ('action.sales_journal.post', 'sales_journal', 'action', 'Post', 'edit_transactions'),
  ('action.sales_journal.print', 'sales_journal', 'action', 'Print', 'edit_transactions'),
  ('action.sales_journal.export', 'sales_journal', 'action', 'Export', 'export_data'),
  ('module.purchase_journal', 'purchase_journal', 'module', 'Purchase Journal', 'edit_transactions'),
  ('action.purchase_journal.view', 'purchase_journal', 'action', 'View', 'edit_transactions'),
  ('action.purchase_journal.add', 'purchase_journal', 'action', 'Add', 'edit_transactions'),
  ('action.purchase_journal.edit', 'purchase_journal', 'action', 'Edit', 'edit_transactions'),
  ('action.purchase_journal.delete', 'purchase_journal', 'action', 'Delete', 'delete_transactions'),
  ('action.purchase_journal.post', 'purchase_journal', 'action', 'Post', 'edit_transactions'),
  ('action.purchase_journal.print', 'purchase_journal', 'action', 'Print', 'edit_transactions'),
  ('action.purchase_journal.export', 'purchase_journal', 'action', 'Export', 'export_data'),
  ('module.cash_disbursement', 'cash_disbursement', 'module', 'Cash Disbursement Book', 'edit_transactions'),
  ('action.cash_disbursement.view', 'cash_disbursement', 'action', 'View', 'edit_transactions'),
  ('action.cash_disbursement.add', 'cash_disbursement', 'action', 'Add', 'edit_transactions'),
  ('action.cash_disbursement.edit', 'cash_disbursement', 'action', 'Edit', 'edit_transactions'),
  ('action.cash_disbursement.delete', 'cash_disbursement', 'action', 'Delete', 'delete_transactions'),
  ('action.cash_disbursement.post', 'cash_disbursement', 'action', 'Post', 'edit_transactions'),
  ('action.cash_disbursement.approve', 'cash_disbursement', 'action', 'Approve', 'approve_journal'),
  ('action.cash_disbursement.print', 'cash_disbursement', 'action', 'Print', 'edit_transactions'),
  ('action.cash_disbursement.export', 'cash_disbursement', 'action', 'Export', 'export_data'),
  ('dropdown.cash_disbursement.payment_method.cash', 'cash_disbursement', 'dropdown', 'Cash', 'edit_transactions'),
  ('dropdown.cash_disbursement.payment_method.check', 'cash_disbursement', 'dropdown', 'Check', 'edit_transactions'),
  ('dropdown.cash_disbursement.payment_method.bank_transfer', 'cash_disbursement', 'dropdown', 'Bank transfer', 'edit_transactions'),
  ('module.cash_receipt', 'cash_receipt', 'module', 'Cash Receipt Journal', 'edit_transactions'),
  ('action.cash_receipt.view', 'cash_receipt', 'action', 'View', 'edit_transactions'),
  ('action.cash_receipt.add', 'cash_receipt', 'action', 'Add', 'edit_transactions'),
  ('action.cash_receipt.edit', 'cash_receipt', 'action', 'Edit', 'edit_transactions'),
  ('action.cash_receipt.delete', 'cash_receipt', 'action', 'Delete', 'delete_transactions'),
  ('action.cash_receipt.post', 'cash_receipt', 'action', 'Post', 'edit_transactions'),
  ('action.cash_receipt.print', 'cash_receipt', 'action', 'Print', 'edit_transactions'),
  ('action.cash_receipt.export', 'cash_receipt', 'action', 'Export', 'export_data'),
  ('dropdown.cash_receipt.receipt_type.cash_sales', 'cash_receipt', 'dropdown', 'Cash sales', 'edit_transactions'),
  ('dropdown.cash_receipt.receipt_type.collection', 'cash_receipt', 'dropdown', 'Customer collection', 'edit_transactions'),
  ('dropdown.cash_receipt.receipt_type.other_receipt', 'cash_receipt', 'dropdown', 'Other receipt', 'edit_transactions'),
  ('module.trialbalance', 'trialbalance', 'module', 'Trial Balance', 'view_reports'),
  ('action.trialbalance.view', 'trialbalance', 'action', 'View', 'view_reports'),
  ('action.trialbalance.print', 'trialbalance', 'action', 'Print', 'view_reports'),
  ('action.trialbalance.export', 'trialbalance', 'action', 'Export', 'export_data'),
  ('module.balancesheet', 'balancesheet', 'module', 'Balance Sheet', 'view_reports'),
  ('action.balancesheet.view', 'balancesheet', 'action', 'View', 'view_reports'),
  ('action.balancesheet.print', 'balancesheet', 'action', 'Print', 'view_reports'),
  ('action.balancesheet.export', 'balancesheet', 'action', 'Export', 'export_data'),
  ('module.pl', 'pl', 'module', 'Profit & Loss', 'view_reports'),
  ('action.pl.view', 'pl', 'action', 'View', 'view_reports'),
  ('action.pl.print', 'pl', 'action', 'Print', 'view_reports'),
  ('action.pl.export', 'pl', 'action', 'Export', 'export_data'),
  ('module.assetlapsing', 'assetlapsing', 'module', 'Asset Lapsing', 'view_reports'),
  ('action.assetlapsing.view', 'assetlapsing', 'action', 'View', 'view_reports'),
  ('action.assetlapsing.add', 'assetlapsing', 'action', 'Add', 'edit_transactions'),
  ('action.assetlapsing.edit', 'assetlapsing', 'action', 'Edit', 'edit_transactions'),
  ('action.assetlapsing.delete', 'assetlapsing', 'action', 'Delete', 'delete_transactions'),
  ('action.assetlapsing.print', 'assetlapsing', 'action', 'Print', 'view_reports'),
  ('action.assetlapsing.export', 'assetlapsing', 'action', 'Export', 'export_data'),
  ('dropdown.assetlapsing.asset_action.view_schedule', 'assetlapsing', 'dropdown', 'View schedule', 'view_reports'),
  ('dropdown.assetlapsing.asset_action.record_depreciation', 'assetlapsing', 'dropdown', 'Record depreciation', 'edit_transactions'),
  ('module.files', 'files', 'module', 'Upload Files', 'edit_transactions'),
  ('action.files.view', 'files', 'action', 'View', 'edit_transactions'),
  ('action.files.add', 'files', 'action', 'Add', 'edit_transactions'),
  ('action.files.edit', 'files', 'action', 'Edit', 'edit_transactions'),
  ('action.files.delete', 'files', 'action', 'Delete', 'delete_transactions'),
  ('action.files.download', 'files', 'action', 'Download', 'edit_transactions'),
  ('action.files.export', 'files', 'action', 'Export', 'export_data'),
  ('dropdown.files.file_action.upload', 'files', 'dropdown', 'Upload file', 'edit_transactions'),
  ('dropdown.files.file_action.download', 'files', 'dropdown', 'Download file', 'edit_transactions'),
  ('dropdown.files.file_action.preview', 'files', 'dropdown', 'Preview file', 'edit_transactions'),
  ('module.inventory', 'inventory', 'module', 'Inventory', 'edit_transactions'),
  ('action.inventory.view', 'inventory', 'action', 'View', 'edit_transactions'),
  ('action.inventory.add', 'inventory', 'action', 'Add', 'edit_transactions'),
  ('action.inventory.edit', 'inventory', 'action', 'Edit', 'edit_transactions'),
  ('action.inventory.delete', 'inventory', 'action', 'Delete', 'delete_transactions'),
  ('action.inventory.post', 'inventory', 'action', 'Post', 'edit_transactions'),
  ('action.inventory.import', 'inventory', 'action', 'Import', 'edit_transactions'),
  ('action.inventory.export', 'inventory', 'action', 'Export', 'export_data'),
  ('dropdown.inventory.inventory_action.items', 'inventory', 'dropdown', 'Manage items', 'edit_transactions'),
  ('dropdown.inventory.inventory_action.movements', 'inventory', 'dropdown', 'View stock movements', 'edit_transactions'),
  ('dropdown.inventory.inventory_action.adjustments', 'inventory', 'dropdown', 'Stock adjustments', 'edit_transactions'),
  ('module.clients', 'clients', 'module', 'Clients', 'manage_settings'),
  ('action.clients.view', 'clients', 'action', 'View', 'manage_settings'),
  ('action.clients.add', 'clients', 'action', 'Add', 'edit_transactions'),
  ('action.clients.edit', 'clients', 'action', 'Edit', 'edit_transactions'),
  ('action.clients.delete', 'clients', 'action', 'Delete', 'delete_transactions'),
  ('action.clients.manage', 'clients', 'action', 'Manage settings/users', 'manage_settings'),
  ('module.business', 'business', 'module', 'Business Profile', 'manage_settings'),
  ('action.business.view', 'business', 'action', 'View', 'manage_settings'),
  ('action.business.edit', 'business', 'action', 'Edit', 'edit_transactions'),
  ('action.business.manage', 'business', 'action', 'Manage settings/users', 'manage_settings'),
  ('module.account_settings', 'account_settings', 'module', 'Account Settings', NULL),
  ('action.account_settings.view', 'account_settings', 'action', 'View', NULL),
  ('action.account_settings.export', 'account_settings', 'action', 'Export', 'export_data'),
  ('dropdown.account_settings.account_action.profile', 'account_settings', 'dropdown', 'Profile details', NULL),
  ('dropdown.account_settings.account_action.password', 'account_settings', 'dropdown', 'Change password', NULL),
  ('dropdown.account_settings.account_action.export_data', 'account_settings', 'dropdown', 'Export account data', 'export_data'),
  ('module.tinlibrary', 'tinlibrary', 'module', 'TIN Library', 'manage_settings'),
  ('action.tinlibrary.view', 'tinlibrary', 'action', 'View', 'manage_settings'),
  ('action.tinlibrary.add', 'tinlibrary', 'action', 'Add', 'edit_transactions'),
  ('action.tinlibrary.edit', 'tinlibrary', 'action', 'Edit', 'edit_transactions'),
  ('action.tinlibrary.delete', 'tinlibrary', 'action', 'Delete', 'delete_transactions'),
  ('action.tinlibrary.import', 'tinlibrary', 'action', 'Import', 'edit_transactions'),
  ('action.tinlibrary.export', 'tinlibrary', 'action', 'Export', 'export_data'),
  ('module.team', 'team', 'module', 'Team & Subusers', 'manage_users'),
  ('action.team.view', 'team', 'action', 'View', 'manage_users'),
  ('action.team.add', 'team', 'action', 'Add', 'edit_transactions'),
  ('action.team.edit', 'team', 'action', 'Edit', 'edit_transactions'),
  ('action.team.delete', 'team', 'action', 'Delete', 'delete_transactions'),
  ('action.team.manage', 'team', 'action', 'Manage settings/users', 'manage_users'),
  ('dropdown.team.team_action.invite', 'team', 'dropdown', 'Invite users', 'manage_users'),
  ('dropdown.team.team_action.change_roles', 'team', 'dropdown', 'Change roles', 'manage_users'),
  ('dropdown.team.team_action.reset_password', 'team', 'dropdown', 'Reset managed password', 'manage_users'),
  ('dropdown.team.team_action.grant_permissions', 'team', 'dropdown', 'Manage permissions', 'manage_users'),
  ('module.reports', 'reports', 'module', 'Reports', 'view_reports'),
  ('action.reports.view', 'reports', 'action', 'View', 'view_reports'),
  ('action.reports.print', 'reports', 'action', 'Print', 'view_reports'),
  ('action.reports.export', 'reports', 'action', 'Export', 'export_data'),
  ('dropdown.reports.report_format.pdf', 'reports', 'dropdown', 'PDF', 'view_reports'),
  ('dropdown.reports.report_format.csv', 'reports', 'dropdown', 'CSV', 'view_reports'),
  ('dropdown.reports.report_format.excel', 'reports', 'dropdown', 'Excel', 'view_reports'),
  ('dropdown.reports.report_format.print', 'reports', 'dropdown', 'Print', 'view_reports'),
  ('module.relief', 'relief', 'module', 'RELIEF', 'view_reports'),
  ('action.relief.view', 'relief', 'action', 'View', 'view_reports'),
  ('action.relief.edit', 'relief', 'action', 'Edit', 'edit_transactions'),
  ('action.relief.print', 'relief', 'action', 'Print', 'view_reports'),
  ('action.relief.export', 'relief', 'action', 'Export', 'export_data'),
  ('dropdown.relief.relief_action.view_schedule', 'relief', 'dropdown', 'View schedule', 'view_reports'),
  ('dropdown.relief.relief_action.edit_transfers', 'relief', 'dropdown', 'Edit transfers', 'edit_transactions'),
  ('dropdown.relief.relief_action.reset_transfers', 'relief', 'dropdown', 'Reset transfers', 'delete_transactions'),
  ('module.taxnotes', 'taxnotes', 'module', 'Tax Notes', 'view_reports'),
  ('action.taxnotes.view', 'taxnotes', 'action', 'View', 'view_reports'),
  ('action.taxnotes.add', 'taxnotes', 'action', 'Add', 'edit_transactions'),
  ('action.taxnotes.edit', 'taxnotes', 'action', 'Edit', 'edit_transactions'),
  ('action.taxnotes.delete', 'taxnotes', 'action', 'Delete', 'delete_transactions'),
  ('action.taxnotes.print', 'taxnotes', 'action', 'Print', 'view_reports'),
  ('action.taxnotes.export', 'taxnotes', 'action', 'Export', 'export_data'),
  ('module.books', 'books', 'module', 'Books', 'view_reports'),
  ('action.books.view', 'books', 'action', 'View', 'view_reports'),
  ('action.books.print', 'books', 'action', 'Print', 'view_reports'),
  ('action.books.export', 'books', 'action', 'Export', 'export_data'),
  ('module.afs_financial_position', 'afs_financial_position', 'module', 'AFS · Financial Position', 'view_reports'),
  ('action.afs_financial_position.view', 'afs_financial_position', 'action', 'View', 'view_reports'),
  ('action.afs_financial_position.print', 'afs_financial_position', 'action', 'Print', 'view_reports'),
  ('action.afs_financial_position.export', 'afs_financial_position', 'action', 'Export', 'export_data'),
  ('module.afs_income_statements', 'afs_income_statements', 'module', 'AFS · Income Statements', 'view_reports'),
  ('action.afs_income_statements.view', 'afs_income_statements', 'action', 'View', 'view_reports'),
  ('action.afs_income_statements.print', 'afs_income_statements', 'action', 'Print', 'view_reports'),
  ('action.afs_income_statements.export', 'afs_income_statements', 'action', 'Export', 'export_data'),
  ('module.afs_equity_retained_earnings', 'afs_equity_retained_earnings', 'module', 'AFS · Equity & Retained Earnings', 'view_reports'),
  ('action.afs_equity_retained_earnings.view', 'afs_equity_retained_earnings', 'action', 'View', 'view_reports'),
  ('action.afs_equity_retained_earnings.print', 'afs_equity_retained_earnings', 'action', 'Print', 'view_reports'),
  ('action.afs_equity_retained_earnings.export', 'afs_equity_retained_earnings', 'action', 'Export', 'export_data'),
  ('module.afs_ppe', 'afs_ppe', 'module', 'AFS · Property, Plant & Equipment', 'view_reports'),
  ('action.afs_ppe.view', 'afs_ppe', 'action', 'View', 'view_reports'),
  ('action.afs_ppe.add', 'afs_ppe', 'action', 'Add', 'edit_transactions'),
  ('action.afs_ppe.edit', 'afs_ppe', 'action', 'Edit', 'edit_transactions'),
  ('action.afs_ppe.delete', 'afs_ppe', 'action', 'Delete', 'delete_transactions'),
  ('action.afs_ppe.print', 'afs_ppe', 'action', 'Print', 'view_reports'),
  ('action.afs_ppe.export', 'afs_ppe', 'action', 'Export', 'export_data')
on conflict (permission_key) do update set
  module_id = excluded.module_id,
  permission_kind = excluded.permission_kind,
  label = excluded.label,
  required_permission = excluded.required_permission,
  updated_at = now();

-- Validate that the member's selected permissions never exceed the base role/grant.
create or replace function public.set_subuser_client_ui_permissions(
  p_user_id uuid,
  p_client_id text,
  p_permissions jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owner_id uuid := auth.uid();
  v_client_owner uuid;
  v_member_role text;
  v_base_permissions jsonb := '{}'::jsonb;
  v_normalized jsonb := '{}'::jsonb;
  v_item record;
  v_requested boolean;
  v_base_allowed boolean;
  v_module_selected boolean;
begin
  if v_owner_id is null then raise exception 'Not authenticated'; end if;
  if p_user_id is null or p_client_id is null or trim(p_client_id) = '' then
    raise exception 'Member and client are required';
  end if;
  select c.user_id into v_client_owner from public.clients c where c.id = p_client_id;
  if v_client_owner is distinct from v_owner_id then
    raise exception 'You can only manage permissions for your own clients';
  end if;

  select l.member_role into v_member_role
  from public.account_team_links l
  where l.owner_user_id = v_owner_id and l.member_user_id = p_user_id and l.status = 'active'
  order by l.created_at desc limit 1;
  if not found then
    begin
      select lower(am.role) into v_member_role
      from public.account_membership am
      join public.business_accounts ba on ba.id = am.account_id
      where ba.owner_id = v_owner_id and am.user_id = p_user_id and am.is_active = true
      order by am.created_at desc limit 1;
    exception when undefined_table then v_member_role := null;
    end;
  end if;
  if v_member_role is null then raise exception 'Active team member not found'; end if;

  select p.permissions into v_base_permissions
  from public.account_team_client_permissions p
  where p.owner_user_id = v_owner_id and p.member_user_id = p_user_id and p.client_id = p_client_id;

  for v_item in select permission_key, module_id, permission_kind, required_permission from public.capot_ui_permission_catalog order by permission_key loop
    v_requested := coalesce((p_permissions ->> v_item.permission_key) = 'true', false);
    v_base_allowed := true;
    if v_item.required_permission is not null then
      v_base_allowed := public.team_role_allows_permission(v_member_role, v_item.required_permission)
        and coalesce((v_base_permissions ->> v_item.required_permission) = 'true', public.team_role_allows_permission(v_member_role, v_item.required_permission));
    end if;
    v_module_selected := true;
    if v_item.permission_kind <> 'module' then
      v_module_selected := coalesce((p_permissions ->> ('module.' || v_item.module_id)) = 'true', false);
    end if;
    v_normalized := jsonb_set(v_normalized, array[v_item.permission_key], to_jsonb(v_requested and v_base_allowed and v_module_selected), true);
  end loop;

  insert into public.account_team_client_ui_permissions (owner_user_id, member_user_id, client_id, permissions, updated_at)
  values (v_owner_id, p_user_id, p_client_id, v_normalized, now())
  on conflict (owner_user_id, member_user_id, client_id)
  do update set permissions = excluded.permissions, updated_at = now();
end;
$$;
revoke all on function public.set_subuser_client_ui_permissions(uuid, text, jsonb) from public;
grant execute on function public.set_subuser_client_ui_permissions(uuid, text, jsonb) to authenticated;

-- Return explicit UI grants to the owner for the editor.
create or replace function public.list_subuser_client_ui_permissions(p_user_id uuid)
returns table (client_id text, permissions jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_owner_id uuid := auth.uid(); v_is_member boolean := false;
begin
  if v_owner_id is null or p_user_id is null then raise exception 'Member is required'; end if;
  select exists(select 1 from public.account_team_links l where l.owner_user_id = v_owner_id and l.member_user_id = p_user_id)
    or exists(select 1 from public.account_membership am join public.business_accounts ba on ba.id = am.account_id where ba.owner_id = v_owner_id and am.user_id = p_user_id)
    into v_is_member;
  if not v_is_member then raise exception 'Team member not found'; end if;
  return query select p.client_id, p.permissions from public.account_team_client_ui_permissions p
    join public.clients c on c.id = p.client_id
    where p.owner_user_id = v_owner_id and p.member_user_id = p_user_id and c.user_id = v_owner_id
    order by p.client_id;
end;
$$;
revoke all on function public.list_subuser_client_ui_permissions(uuid) from public;
grant execute on function public.list_subuser_client_ui_permissions(uuid) to authenticated;

-- Calculate current user's effective UI grants. Existing accounts without an explicit UI grant
-- fall back to their current base role/client permissions until the owner saves a granular matrix.
create or replace function public.get_my_client_ui_permissions(p_client_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_saved jsonb := '{}'::jsonb;
  v_has_saved boolean := false;
  v_result jsonb := '{}'::jsonb;
  v_item record;
  v_module_allowed boolean;
  v_allowed boolean;
begin
  if auth.uid() is null or p_client_id is null then return '{}'::jsonb; end if;
  select c.user_id into v_owner_id from public.clients c where c.id = p_client_id;
  if v_owner_id is null then return '{}'::jsonb; end if;
  if v_owner_id = auth.uid() then
    select coalesce(jsonb_object_agg(permission_key, true), '{}'::jsonb) into v_result from public.capot_ui_permission_catalog;
    return v_result;
  end if;

  -- A valid base read capability proves that this user is still an active member
  -- of this client's owner's account. This also supports legacy account_membership.
  if not public.can_access_client_operation(p_client_id, 'read') then return '{}'::jsonb; end if;

  select p.permissions into v_saved
  from public.account_team_client_ui_permissions p
  where p.owner_user_id = v_owner_id and p.member_user_id = auth.uid() and p.client_id = p_client_id;
  v_has_saved := found;

  for v_item in select permission_key, module_id, permission_kind, required_permission from public.capot_ui_permission_catalog order by permission_key loop
    v_allowed := v_item.required_permission is null or public.can_access_client_operation(p_client_id, v_item.required_permission);
    if v_item.permission_kind = 'action' or v_item.permission_kind = 'dropdown' then
      select (c.required_permission is null or public.can_access_client_operation(p_client_id, c.required_permission))
        into v_module_allowed from public.capot_ui_permission_catalog c
        where c.permission_key = 'module.' || v_item.module_id;
      v_allowed := v_allowed and coalesce(v_module_allowed, false);
    end if;
    if v_item.module_id in ('purchases_invoiced', 'purchases_other_payments', 'purchases_ap') then
      v_allowed := v_allowed and (not v_has_saved or coalesce((v_saved ->> 'module.purchases') = 'true', false));
    end if;
    if v_has_saved then
      v_allowed := v_allowed and coalesce((v_saved ->> v_item.permission_key) = 'true', false);
      if v_item.permission_kind <> 'module' then
        v_allowed := v_allowed and coalesce((v_saved ->> ('module.' || v_item.module_id)) = 'true', false);
      end if;
    end if;
    v_result := jsonb_set(v_result, array[v_item.permission_key], to_jsonb(coalesce(v_allowed, false)), true);
  end loop;
  return v_result;
end;
$$;
revoke all on function public.get_my_client_ui_permissions(text) from public;
grant execute on function public.get_my_client_ui_permissions(text) to authenticated;

-- Fine-grained server-side helper used by row-level security policies.
create or replace function public.can_access_client_ui_operation(
  p_client_id text,
  p_module_id text,
  p_action_id text,
  p_base_permission text
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_saved jsonb;
  v_has_saved boolean := false;
begin
  if auth.uid() is null or p_client_id is null then return false; end if;
  select c.user_id into v_owner_id from public.clients c where c.id = p_client_id;
  if v_owner_id is null then return false; end if;
  if v_owner_id = auth.uid() then return true; end if;
  if not public.can_access_client_operation(p_client_id, p_base_permission) then return false; end if;
  select p.permissions into v_saved from public.account_team_client_ui_permissions p
    where p.owner_user_id = v_owner_id and p.member_user_id = auth.uid() and p.client_id = p_client_id;
  v_has_saved := found;
  if not v_has_saved then return true; end if;
  if p_module_id in ('purchases_invoiced', 'purchases_other_payments', 'purchases_ap')
     and not coalesce((v_saved ->> 'module.purchases') = 'true', false) then return false; end if;
  return coalesce((v_saved ->> ('module.' || p_module_id)) = 'true', false)
    and coalesce((v_saved ->> ('action.' || p_module_id || '.' || p_action_id)) = 'true', false);
end;
$$;
revoke all on function public.can_access_client_ui_operation(text, text, text, text) from public;
grant execute on function public.can_access_client_ui_operation(text, text, text, text) to authenticated;

-- Dropdown choices are also checked server-side for normalized Sales/Purchases
-- rows. The UI filter is convenience; this helper protects direct API writes.
create or replace function public.can_access_client_ui_dropdown(
  p_client_id text,
  p_module_id text,
  p_group_id text,
  p_option_id text,
  p_base_permission text default 'edit_transactions'
)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_owner_id uuid;
  v_saved jsonb;
  v_has_saved boolean := false;
begin
  if auth.uid() is null or p_client_id is null or p_module_id is null or p_group_id is null or p_option_id is null then return false; end if;
  select c.user_id into v_owner_id from public.clients c where c.id = p_client_id;
  if v_owner_id is null then return false; end if;
  if v_owner_id = auth.uid() then return true; end if;
  if not public.can_access_client_operation(p_client_id, p_base_permission) then return false; end if;
  select p.permissions into v_saved from public.account_team_client_ui_permissions p
    where p.owner_user_id = v_owner_id and p.member_user_id = auth.uid() and p.client_id = p_client_id;
  v_has_saved := found;
  if not v_has_saved then return true; end if;
  return coalesce((v_saved ->> ('module.' || p_module_id)) = 'true', false)
    and coalesce((v_saved ->> ('dropdown.' || p_module_id || '.' || p_group_id || '.' || p_option_id)) = 'true', false);
end;
$$;
revoke all on function public.can_access_client_ui_dropdown(text, text, text, text, text) from public;
grant execute on function public.can_access_client_ui_dropdown(text, text, text, text, text) to authenticated;

create or replace function public.enforce_granular_transaction_dropdowns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row jsonb := to_jsonb(new);
  v_client_id text := v_row ->> 'client_id';
  v_module_id text;
  v_group_id text;
  v_column text;
  v_raw text;
  v_option_id text;
  v_check record;
begin
  if tg_table_name = 'purchases' then
    v_module_id := 'purchases';
    for v_check in select * from (values
      ('payment_method', 'payment_method'),
      ('vat_type', 'vat_type'),
      ('withholding_option', 'withholding')
    ) as fields(column_name, group_id)
    loop
      if not (v_row ? v_check.column_name) then continue; end if;
      v_column := v_check.column_name;
      if tg_op = 'UPDATE' and (v_row ->> v_column) is not distinct from (to_jsonb(old) ->> v_column) then continue; end if;
      v_group_id := v_check.group_id;
      v_raw := lower(trim(coalesce(v_row ->> v_column, '')));
      v_option_id := case v_group_id
        when 'payment_method' then case
          when v_raw in ('cash') then 'cash'
          when v_raw in ('check', 'cheque') then 'check'
          when v_raw in ('e-payments', 'e-payment', 'e payments', 'epayment', 'bank transfer', 'bank_transfer', 'bank') then 'bank_transfer'
          when v_raw in ('on account', 'credit', 'credit / payable', 'credit/payable') then 'credit'
          else '__invalid__' end
        when 'vat_type' then case
          when v_raw in ('vat', 'vatable', 'vat-able') then 'vat'
          when v_raw in ('non-vat', 'non vat', 'nonvat') then 'non_vat'
          when v_raw in ('vat-nonvat', 'vat + non-vat', 'vat/non-vat', 'vat nonvat') then 'vat_nonvat'
          when v_raw in ('zero-rated', 'zero rated', 'zero_rated') then 'zero_rated'
          else '__invalid__' end
        when 'withholding' then case
          when v_raw in ('', 'none', 'no withholding', 'without withholding', 'w/o', 'n/a', 'na') then 'none'
          else 'withholding' end
        else '__invalid__' end;
      if not public.can_access_client_ui_dropdown(v_client_id, v_module_id, v_group_id, v_option_id, 'edit_transactions') then
        raise exception 'You do not have permission to use this % option on purchases', v_group_id using errcode = '42501';
      end if;
    end loop;
  elsif tg_table_name = 'sales' then
    v_module_id := 'sales';
    for v_check in select * from (values
      ('payment_type', 'payment_type'),
      ('vat_type', 'vat_type'),
      ('income_type', 'income_type')
    ) as fields(column_name, group_id)
    loop
      if not (v_row ? v_check.column_name) then continue; end if;
      v_column := v_check.column_name;
      if tg_op = 'UPDATE' and (v_row ->> v_column) is not distinct from (to_jsonb(old) ->> v_column) then continue; end if;
      v_group_id := v_check.group_id;
      v_raw := lower(trim(coalesce(v_row ->> v_column, '')));
      v_option_id := case v_group_id
        when 'payment_type' then case
          when v_raw in ('cash') then 'cash'
          when v_raw in ('check', 'cheque') then 'check'
          when v_raw in ('bank', 'bank transfer', 'bank_transfer', 'e-payment', 'e-payments') then 'bank'
          when v_raw in ('credit', 'on account', 'credit card') then 'credit'
          else '__invalid__' end
        when 'vat_type' then case
          when v_raw in ('vatable', 'vat', 'vat-able') then 'vatable'
          when v_raw in ('vat-exempt', 'vat exempt', 'exempt', 'vat_exempt') then 'vat_exempt'
          when v_raw in ('zero-rated', 'zero rated', 'zero_rated') then 'zero_rated'
          else '__invalid__' end
        when 'income_type' then case
          when v_raw in ('goods', 'sale of goods', 'good') then 'goods'
          when v_raw in ('services', 'service', 'service income', 'sale of services') then 'services'
          when v_raw = 'multiple' then 'multiple'
          else '__invalid__' end
        else '__invalid__' end;
      if v_group_id = 'income_type' and v_option_id = 'multiple' then
        if not public.can_access_client_ui_dropdown(v_client_id, v_module_id, v_group_id, 'goods', 'edit_transactions')
           or not public.can_access_client_ui_dropdown(v_client_id, v_module_id, v_group_id, 'services', 'edit_transactions') then
          raise exception 'Multiple income type requires both goods and services permissions' using errcode = '42501';
        end if;
      elsif not public.can_access_client_ui_dropdown(v_client_id, v_module_id, v_group_id, v_option_id, 'edit_transactions') then
        raise exception 'You do not have permission to use this % option on sales', v_group_id using errcode = '42501';
      end if;
    end loop;
  end if;
  return new;
end;
$$;
revoke all on function public.enforce_granular_transaction_dropdowns() from public, anon, authenticated;

do $$
begin
  if to_regclass('public.purchases') is not null then
    execute 'drop trigger if exists trg_enforce_granular_purchase_dropdowns on public.purchases';
    execute 'create trigger trg_enforce_granular_purchase_dropdowns before insert or update on public.purchases for each row execute function public.enforce_granular_transaction_dropdowns()';
  end if;
  if to_regclass('public.sales') is not null then
    execute 'drop trigger if exists trg_enforce_granular_sales_dropdowns on public.sales';
    execute 'create trigger trg_enforce_granular_sales_dropdowns before insert or update on public.sales for each row execute function public.enforce_granular_transaction_dropdowns()';
  end if;
end $$;

-- Tighten client data policies so UI fine-grants also constrain server-side CRUD.
-- Only tables that already exist are changed; missing optional tables are skipped.
do $$
declare
  t record;
  module_id text;
begin
  for t in select * from (values
    ('purchases','purchases'), ('sales','sales'), ('coa_columns','coa'), ('coa_accounts','coa'),
    ('journal_columns','journal'), ('journal_entries','journal'), ('journal_vouchers','journal_voucher'), ('journal_voucher_lines','journal_voucher'),
    ('purchase_orders','purchases'), ('purchase_order_items','purchases'), ('receiving_reports','purchases'), ('receiving_report_items','purchases'),
    ('payable_invoices','purchases_ap'), ('payable_invoice_items','purchases_ap'),
    ('inventory_columns','inventory'), ('inventory_items','inventory'), ('inventory_movements','inventory'),
    ('app_folders','files'), ('app_files','files'), ('tin_entries','tinlibrary'), ('tax_deadlines','compliance_tracker'),
    ('bank_accounts','cash_disbursement'), ('supplier_advances','cash_disbursement'), ('withholding_tax_entries','purchases'),
    ('debit_credit_memos','purchases'), ('check_vouchers','cash_disbursement'), ('miscellaneous_payments','purchases_other_payments'),
    ('asset_lapsing_schedule','assetlapsing'), ('billing_invoices','billing'), ('financial_report_snapshots','reports')
  ) as m(table_name, module_id)
  loop
    if to_regclass('public.' || t.table_name) is null then continue; end if;
    if not exists (select 1 from information_schema.columns c where c.table_schema = 'public' and c.table_name = t.table_name and c.column_name = 'client_id') then continue; end if;
    module_id := t.module_id;
    execute format('drop policy if exists %I on public.%I', t.table_name || '_select_owner', t.table_name);
    execute format('create policy %I on public.%I for select to authenticated using (public.can_access_client_ui_operation(client_id, %L, ''view'', ''read''))', t.table_name || '_select_owner', t.table_name, module_id);
    execute format('drop policy if exists %I on public.%I', t.table_name || '_insert_owner', t.table_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.can_access_client_ui_operation(client_id, %L, ''add'', ''edit_transactions''))', t.table_name || '_insert_owner', t.table_name, module_id);
    execute format('drop policy if exists %I on public.%I', t.table_name || '_update_owner', t.table_name);
    execute format('create policy %I on public.%I for update to authenticated using (public.can_access_client_ui_operation(client_id, %L, ''edit'', ''edit_transactions'')) with check (public.can_access_client_ui_operation(client_id, %L, ''edit'', ''edit_transactions''))', t.table_name || '_update_owner', t.table_name, module_id, module_id);
    execute format('drop policy if exists %I on public.%I', t.table_name || '_delete_owner', t.table_name);
    execute format('create policy %I on public.%I for delete to authenticated using (public.can_access_client_ui_operation(client_id, %L, ''delete'', ''delete_transactions''))', t.table_name || '_delete_owner', t.table_name, module_id);
  end loop;
end $$;

-- Private client files also require the Files module/action grant.
drop policy if exists client_files_select_owner on storage.objects;
create policy client_files_select_owner on storage.objects for select to authenticated using (
  bucket_id = 'client-files' and public.can_access_client_ui_operation((storage.foldername(name))[1], 'files', 'view', 'read')
);
drop policy if exists client_files_insert_owner on storage.objects;
create policy client_files_insert_owner on storage.objects for insert to authenticated with check (
  bucket_id = 'client-files' and public.can_access_client_ui_operation((storage.foldername(name))[1], 'files', 'add', 'edit_transactions')
);
drop policy if exists client_files_update_owner on storage.objects;
create policy client_files_update_owner on storage.objects for update to authenticated using (
  bucket_id = 'client-files' and public.can_access_client_ui_operation((storage.foldername(name))[1], 'files', 'edit', 'edit_transactions')
) with check (
  bucket_id = 'client-files' and public.can_access_client_ui_operation((storage.foldername(name))[1], 'files', 'edit', 'edit_transactions')
);
drop policy if exists client_files_delete_owner on storage.objects;
create policy client_files_delete_owner on storage.objects for delete to authenticated using (
  bucket_id = 'client-files' and public.can_access_client_ui_operation((storage.foldername(name))[1], 'files', 'delete', 'delete_transactions')
);
