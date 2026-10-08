// User-selectable app functions (Run 024 / T024). On first run the user lands
// on a FunctionSelector page and ticks the modules they want; only selected
// functions remain visible in the sidebar and reachable by URL. Settings /
// onboarding pages are always available so the user is never locked out.

export type AppFunction = {
  id: string;
  label: string;
  description: string;
  group: string;
  pageIds: string[]; // sidebar pageIds this function unlocks
};

export const FUNCTION_GROUPS = [
  'Transactions',
  'History',
  'Books',
  'Reports',
  'Compliance',
  'Tools',
] as const;

export const FUNCTIONS: AppFunction[] = [
  // Transactions (sidebar hardcoded items — ids match sidebar item ids)
  { id: 'coa', label: 'Chart of Accounts', description: 'Maintain the account list used across the books', group: 'Transactions', pageIds: ['coa'] },
  { id: 'billing', label: 'Billing / Invoices', description: 'Create and manage customer invoices', group: 'Transactions', pageIds: ['billing'] },
  { id: 'sales', label: 'Income / Sales', description: 'Record sales and revenue transactions', group: 'Transactions', pageIds: ['sales'] },
  { id: 'purchases', label: 'Purchases / Bills', description: 'Record purchases, expenses and accounts payable', group: 'Transactions', pageIds: ['purchases'] },
  { id: 'journal-voucher', label: 'Journal Voucher', description: 'Manual journal entry vouchers', group: 'Transactions', pageIds: ['journal-voucher'] },
  // History
  { id: 'expenses', label: 'Expense History', description: 'Browse, search and edit expense records', group: 'History', pageIds: ['history'] },
  { id: 'income', label: 'Income History', description: 'Browse, search and edit income records', group: 'History', pageIds: ['history'] },
  // Books
  { id: 'journal', label: 'General Journal', description: 'General journal book', group: 'Books', pageIds: ['journal'] },
  { id: 'ledger', label: 'General Ledger', description: 'General ledger by account', group: 'Books', pageIds: ['ledger'] },
  { id: 'sales-journal', label: 'Sales Journal', description: 'Sales journal book', group: 'Books', pageIds: ['sales-journal'] },
  { id: 'purchase-journal', label: 'Purchase Journal', description: 'Purchase journal book', group: 'Books', pageIds: ['purchase-journal'] },
  { id: 'cash-disbursement', label: 'Cash Disbursement Book', description: 'Cash disbursements journal', group: 'Books', pageIds: ['cash-disbursement'] },
  { id: 'cash-receipt', label: 'Cash Receipt Journal', description: 'Cash receipts journal', group: 'Books', pageIds: ['cash-receipt'] },
  // Reports
  { id: 'trialbalance', label: 'Trial Balance', description: 'Period trial balance report', group: 'Reports', pageIds: ['trialbalance'] },
  { id: 'balancesheet', label: 'Balance Sheet', description: 'Statement of financial position', group: 'Reports', pageIds: ['balancesheet'] },
  { id: 'pl', label: 'Profit & Loss', description: 'Income statement / profit and loss', group: 'Reports', pageIds: ['pl'] },
  { id: 'assetlapsing', label: 'Asset Lapsing', description: 'Fixed asset depreciation schedule', group: 'Reports', pageIds: ['assetlapsing'] },
  // Compliance
  { id: 'compliance-tracker', label: 'Compliance Tracker', description: 'Track filing deadlines and compliance status', group: 'Compliance', pageIds: ['compliance-tracker'] },
  { id: 'bir-forms', label: 'BIR Forms', description: 'Generate BIR tax forms (1601, 2550, 1701, etc.)', group: 'Compliance', pageIds: ['bir-forms'] },
  // Tools
  { id: 'files', label: 'Upload Files', description: 'Upload receipts, invoices and documents', group: 'Tools', pageIds: ['files'] },
  { id: 'inventory', label: 'Inventory', description: 'Track stock items and quantities', group: 'Tools', pageIds: ['inventory'] },
];

// Pages that are never hidden (onboarding / settings / this selector).
const ALWAYS_ON_PAGE_IDS = new Set<string | null>([
  null, 'business', 'account-settings', 'team', 'functions',
  'reports', 'books', 'taxnotes', 'diagnostics', 'tinlibrary', 'clients',
]);

const STORAGE_PREFIX = 'capot.enabledFunctions';

function storageKey(userId?: string | null) {
  return userId ? `${STORAGE_PREFIX}.${userId}` : `${STORAGE_PREFIX}.default`;
}

/** null = never saved (first run → show the selector landing page).
 *  A per-user key takes precedence; otherwise falls back to the default key
 *  (the selection made before login, on the login screen). */
export function loadEnabledFunctionIds(userId?: string | null): string[] | null {
  try {
    if (userId) {
      const raw = localStorage.getItem(storageKey(userId));
      if (raw != null) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    }
    const raw = localStorage.getItem(storageKey(null));
    if (raw == null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveEnabledFunctionIds(ids: string[], userId?: string | null) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(ids));
  } catch { /* ignore quota */ }
}

/** Enabled function ids. If never saved, default to everything on. */
export function enabledFunctionSet(userId?: string | null): Set<string> {
  const saved = loadEnabledFunctionIds(userId);
  if (saved == null) return new Set(FUNCTIONS.map(f => f.id));
  return new Set(saved);
}

const PAGE_TO_FUNCTIONS = (() => {
  const map = new Map<string, string[]>();
  for (const fn of FUNCTIONS) {
    for (const pid of fn.pageIds) {
      const list = map.get(pid) || [];
      list.push(fn.id);
      map.set(pid, list);
    }
  }
  return map;
})();

/** True when the sidebar pageId is always-on or belongs to an enabled function. */
export function isPageEnabled(pageId: string | null, userId?: string | null): boolean {
  if (ALWAYS_ON_PAGE_IDS.has(pageId)) return true;
  const fns = PAGE_TO_FUNCTIONS.get(pageId || '');
  if (!fns || fns.length === 0) return true; // unknown page → allow
  const enabled = enabledFunctionSet(userId);
  return fns.some(id => enabled.has(id));
}

// Route path (HashRouter) → sidebar pageId. Unknown paths default to allowed.
const ROUTE_TO_PAGE: [RegExp, string][] = [
  [/^\/sales$/, 'sales'],
  [/^\/billing$/, 'billing'],
  [/^\/journal-voucher$/, 'journal-voucher'],
  [/^\/purchases(\/.*)?$/, 'purchases'],
  [/^\/coa$/, 'coa'],
  [/^\/history(\/.*)?$/, 'history'],
  [/^\/cash-receipt$/, 'cash-receipt'],
  [/^\/cash-disbursement$/, 'cash-disbursement'],
  [/^\/purchase-journal$/, 'purchase-journal'],
  [/^\/sales-journal$/, 'sales-journal'],
  [/^\/journal$/, 'journal'],
  [/^\/ledger$/, 'ledger'],
  [/^\/pl$/, 'pl'],
  [/^\/afs-income-statements$/, 'pl'],
  [/^\/balancesheet$/, 'balancesheet'],
  [/^\/afs-financial-position$/, 'balancesheet'],
  [/^\/afs-equity-retained-earnings$/, 'balancesheet'],
  [/^\/cashflow$/, 'cashflow'],
  [/^\/assetlapsing$/, 'assetlapsing'],
  [/^\/afs-ppe$/, 'assetlapsing'],
  [/^\/trialbalance$/, 'trialbalance'],
  [/^\/files$/, 'files'],
  [/^\/inventory$/, 'inventory'],
  [/^\/bir-forms$/, 'bir-forms'],
  [/^\/compliance-tracker$/, 'compliance-tracker'],
];

/** True when the current route belongs to an enabled function. */
export function isRouteEnabled(path: string, userId?: string | null): boolean {
  const clean = path.replace(/^#/, '').split('?')[0];
  for (const [re, pageId] of ROUTE_TO_PAGE) {
    if (re.test(clean)) return isPageEnabled(pageId, userId);
  }
  return true;
}
