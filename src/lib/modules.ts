// modules.ts — ERP-style module catalog, bundles and pricing (pure, no I/O).
//
// Replaces functionRegistry.ts (user-picked "functions") and the old flat
// Starter/Pro/Enterprise tiers. What a user can open is now decided by what
// they have PAID FOR (or their trial), not by a self-service checklist.
//
//   core        -> free COA, transaction entry and transaction history
//   paid modules-> accounting books, reports, billing, compliance, inventory, team
//
// Prices below are starting hypotheses for the manual-GCash flow (fixed
// amounts so each receipt is easy to verify). Tune them here ONLY — the UI and
// the admin approval screen both read from this file.

export type ModuleId = 'accounting_books' | 'reports' | 'billing' | 'compliance' | 'inventory' | 'team';
export type ModuleKey = 'core' | ModuleId;
export type BillingCycle = 'monthly' | 'annual';

export interface ModuleDef {
  id: ModuleId;
  label: string;
  tagline: string;
  includes: string[];
  monthly: number; // PHP, a la carte
}

export const PAID_MODULES: ModuleDef[] = [
  {
    id: 'accounting_books',
    label: 'Accounting Books & Ledgers',
    tagline: 'Formal books, journals and ledger balances',
    includes: ['General Journal', 'General Ledger', 'Trial Balance', 'Journal Vouchers', 'Sales, purchase and cash journals', 'Accounting-book exports'],
    monthly: 349,
  },
  {
    id: 'reports',
    label: 'Financial Reports',
    tagline: 'Statements and AFS-ready outputs',
    includes: ['Balance Sheet', 'Profit & Loss', 'Cash Flow', 'Asset Lapsing', 'AFS drafts'],
    monthly: 249,
  },
  {
    id: 'billing',
    label: 'Billing & Invoices',
    tagline: 'Invoice customers and track receivables',
    includes: ['Customer invoices', 'Branded invoice PDFs'],
    monthly: 249,
  },
  {
    id: 'compliance',
    label: 'Tax & Compliance',
    tagline: 'BIR forms and filing deadlines',
    includes: ['BIR forms (1601, 2550, 1701…)', 'Compliance tracker'],
    monthly: 499,
  },
  {
    id: 'inventory',
    label: 'Inventory',
    tagline: 'Stock tracking and cost of goods sold',
    includes: ['Stock items & quantities', 'COGS valuation'],
    monthly: 349,
  },
  {
    id: 'team',
    label: 'Team & Controls',
    tagline: 'Work with staff, partners and accountants',
    includes: ['Team members & invites', 'Role permissions', 'Per-client access'],
    monthly: 499,
  },
];

export const ALL_PAID_MODULE_IDS: ModuleId[] = PAID_MODULES.map((m) => m.id);

export const CORE_MODULE = {
  label: 'Free Core',
  tagline: 'Always free — unlimited transaction entry',
  includes: [
    'Chart of Accounts (create and manage accounts)',
    'Sales, purchases and expense data entry',
    'Transaction history (view and search)',
  ],
};

export function getModule(id: ModuleId): ModuleDef {
  return PAID_MODULES.find((m) => m.id === id)!;
}
export function isModuleId(value: unknown): value is ModuleId {
  return typeof value === 'string' && (ALL_PAID_MODULE_IDS as string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Bundles (~15-22% below a la carte). `audience` only affects which one is
// highlighted as "Recommended" for the user's chosen role.
// ---------------------------------------------------------------------------
export interface BundleDef {
  id: string;
  label: string;
  tagline: string;
  modules: ModuleId[];
  monthly: number;
  audience: 'owner' | 'accountant';
}

export const BUNDLES: BundleDef[] = [
  {
    id: 'essentials',
    label: 'Business Essentials',
    tagline: 'For owners who file their own taxes',
    modules: ['accounting_books', 'reports', 'billing', 'compliance'],
    monthly: 999,
    audience: 'owner',
  },
  {
    id: 'retail',
    label: 'Retail & Trading',
    tagline: 'Essentials plus stock tracking',
    modules: ['accounting_books', 'reports', 'billing', 'compliance', 'inventory'],
    monthly: 1249,
    audience: 'owner',
  },
  {
    id: 'practice',
    label: 'Accountant Practice',
    tagline: 'Every module, built for multi-client work',
    modules: ['accounting_books', 'reports', 'billing', 'compliance', 'inventory', 'team'],
    monthly: 1799,
    audience: 'accountant',
  },
];

export function recommendedBundleId(userRole: string | null | undefined): string {
  const r = String(userRole || '').toLowerCase();
  return r === 'accountant' || r === 'bookkeeper' ? 'practice' : 'essentials';
}

// ---------------------------------------------------------------------------
// Trial + billing cycle
// ---------------------------------------------------------------------------
// MUST match the CASE in scripts/modules_entitlements.sql (get_my_entitlements).
export const TRIAL_DAYS = { owner: 7, accountant: 7 } as const;
export function trialDaysForRole(userRole: string | null | undefined): number {
  const r = String(userRole || '').toLowerCase();
  return r === 'accountant' || r === 'bookkeeper' ? TRIAL_DAYS.accountant : TRIAL_DAYS.owner;
}

/** Annual billing pays for 10 months and covers 12 (2 months free). */
export const ANNUAL_MONTHS_CHARGED = 10;
export function cycleDays(cycle: BillingCycle): number {
  return cycle === 'annual' ? 365 : 30;
}

// ---------------------------------------------------------------------------
// Quote: cheapest way to buy a selection (a la carte vs. any bundle that fits).
// ---------------------------------------------------------------------------
export interface Quote {
  modules: ModuleId[];
  cycle: BillingCycle;
  monthlyEquivalent: number; // price per month before the annual discount
  total: number; // amount to pay now
  alaCarteMonthly: number;
  savingsMonthly: number;
  bundleId: string | null; // bundle applied, if any
}

export function quote(selection: ModuleId[], cycle: BillingCycle = 'monthly'): Quote {
  // Reports and tax/compliance workflows depend on the underlying accounting books.
  // Include that foundation in quotes even if a caller passes only a dependent module.
  const selected = new Set<ModuleId>(selection);
  if (selected.has('reports') || selected.has('compliance')) selected.add('accounting_books');
  const modules = ALL_PAID_MODULE_IDS.filter((id) => selected.has(id)); // stable order
  const sum = (ids: ModuleId[]) => ids.reduce((acc, id) => acc + getModule(id).monthly, 0);
  const alaCarteMonthly = sum(modules);

  let best = { monthly: alaCarteMonthly, bundleId: null as string | null };
  for (const b of BUNDLES) {
    if (!b.modules.every((m) => modules.includes(m))) continue;
    const rest = modules.filter((m) => !b.modules.includes(m));
    const monthly = b.monthly + sum(rest);
    if (monthly < best.monthly) best = { monthly, bundleId: b.id };
  }

  const total = cycle === 'annual' ? best.monthly * ANNUAL_MONTHS_CHARGED : best.monthly;
  return {
    modules,
    cycle,
    monthlyEquivalent: best.monthly,
    total,
    alaCarteMonthly,
    savingsMonthly: alaCarteMonthly - best.monthly,
    bundleId: best.bundleId,
  };
}

/** What gets written to payment_requests and shown in the payment modal. */
export interface PaymentOrder {
  label: string;
  modules: ModuleId[];
  cycle: BillingCycle;
  amount: number;
  bundleId: string | null;
}

export function orderFromSelection(selection: ModuleId[], cycle: BillingCycle): PaymentOrder {
  const q = quote(selection, cycle);
  const bundle = q.bundleId ? BUNDLES.find((b) => b.id === q.bundleId) : null;
  const exactBundle = bundle && bundle.modules.length === q.modules.length;
  const label = exactBundle
    ? bundle!.label
    : q.modules.map((m) => getModule(m).label).join(' + ') || 'Modules';
  return { label, modules: q.modules, cycle, amount: q.total, bundleId: q.bundleId };
}

// ---------------------------------------------------------------------------
// Route -> module. Anything not listed here is Core (never locked).
// ---------------------------------------------------------------------------
const ROUTE_MODULES: [RegExp, ModuleId][] = [
  [/^\/(journal-voucher|journal|ledger|trialbalance|sales-journal|purchase-journal|cash-receipt|cash-disbursement|books)$/, 'accounting_books'],
  [/^\/pl$/, 'reports'],
  [/^\/balancesheet$/, 'reports'],
  [/^\/cashflow$/, 'reports'],
  [/^\/assetlapsing$/, 'reports'],
  [/^\/afs-(financial-position|income-statements|equity-retained-earnings|ppe)$/, 'reports'],
  [/^\/billing$/, 'billing'],
  [/^\/bir-forms$/, 'compliance'],
  [/^\/compliance-tracker$/, 'compliance'],
  [/^\/inventory$/, 'inventory'],
  [/^\/team$/, 'team'],
];

/** Module that gates `path`, or null when the route is Core. */
export function moduleForRoute(path: string): ModuleId | null {
  const clean = path.replace(/^#/, '').split('?')[0];
  for (const [re, id] of ROUTE_MODULES) if (re.test(clean)) return id;
  return null;
}

export const peso = (n: number) => `₱${Math.round(n).toLocaleString('en-PH')}`;
