// routePrefetch.ts — warms lazy-loaded page chunks on sidebar hover/focus and
// browser idle so route switches render immediately instead of stalling on
// network chunk downloads.

const prefetched = new Set<string>();

const ROUTE_LOADERS: Record<string, () => Promise<unknown>> = {
  sales: () => import('../components/Sales'),
  purchases: () => import('../components/Purchases'),
  'journal-voucher': () => import('../components/JournalVoucher'),
  history: () => import('../components/History'),
  billing: () => import('../components/Billing'),
  coa: () => import('../components/ChartOfAccounts'),
  journal: () => import('../components/GeneralJournal'),
  ledger: () => import('../components/GeneralLedger'),
  'subsidiary-ledger': () => import('../components/SubsidiaryGeneralLedger'),
  'aging-reports': () => import('../components/AgingReports'),
  'bank-reconciliation': () => import('../components/BankReconciliation'),
  'sales-journal': () => import('../components/SalesJournal'),
  'purchase-journal': () => import('../components/PurchasesJournal'),
  'cash-disbursement': () => import('../components/CashDisbursementsJournal'),
  'cash-receipt': () => import('../components/CashReceiptsJournal'),
  pl: () => import('../components/ProfitAndLoss'),
  balancesheet: () => import('../components/BalanceSheet'),
  trialbalance: () => import('../components/Extras'),
  clients: () => import('../components/Extras'),
  business: () => import('../components/Extras'),
  tinlibrary: () => import('../components/TinLibrary'),
  files: () => import('../components/FileManager'),
  team: () => import('../components/TeamSettings'),
  'account-settings': () => import('../components/AccountSettings'),
  'plan-billing': () => import('../components/PlanBillingPage'),
};

export function prefetchRoute(pageId: string | null | undefined): void {
  if (!pageId) return;
  const key = pageId.split('/')[0];
  if (prefetched.has(key)) return;
  const loader = ROUTE_LOADERS[key];
  if (!loader) return;
  prefetched.add(key);
  loader().catch(() => {
    prefetched.delete(key);
  });
}

let idleScheduled = false;

/** Warm the most frequently visited accounting routes during browser idle time. */
export function prefetchCoreRoutesOnIdle(): void {
  if (idleScheduled || typeof window === 'undefined') return;
  idleScheduled = true;
  const corePages = ['sales', 'purchases', 'ledger', 'balancesheet', 'pl', 'trialbalance', 'history', 'bank-reconciliation'];
  const run = () => {
    corePages.forEach((p, idx) => {
      window.setTimeout(() => prefetchRoute(p), idx * 180);
    });
  };
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(run, { timeout: 3000 });
  } else {
    window.setTimeout(run, 1500);
  }
}
