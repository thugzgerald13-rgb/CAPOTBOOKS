import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Routes/page identifiers the developer can show or hide for regular users. */
export const FEATURE_VISIBILITY_ITEMS = [
  { id: 'coa', label: 'Chart of Accounts', group: 'Core & Setup' },
  { id: 'sales', label: 'Sales', group: 'Transactions' },
  { id: 'purchases', label: 'Purchases', group: 'Transactions' },
  { id: 'journal-voucher', label: 'Journal Voucher', group: 'Transactions' },
  { id: 'history', label: 'Income & Expense History', group: 'Transactions' },
  { id: 'files', label: 'Upload Files', group: 'Core & Setup' },
  { id: 'business', label: 'Business Profile', group: 'Core & Setup' },
  { id: 'clients', label: 'Client Profiles', group: 'Core & Setup' },
  { id: 'tinlibrary', label: 'TIN Library', group: 'Core & Setup' },
  { id: 'team', label: 'Team & Subusers', group: 'Core & Setup' },
  { id: 'billing', label: 'Billing & Invoices', group: 'Transactions' },
  { id: 'inventory', label: 'Inventory', group: 'Transactions' },
  { id: 'payroll', label: 'Payroll', group: 'Transactions' },
  { id: 'journal', label: 'General Journal', group: 'Accounting Books' },
  { id: 'ledger', label: 'General Ledger', group: 'Accounting Books' },
  { id: 'subsidiary-ledger', label: 'Subsidiary General Ledger', group: 'Accounting Books' },
  { id: 'aging-reports', label: 'A/R & A/P Aging Reports', group: 'Accounting Books' },
  { id: 'trialbalance', label: 'Trial Balance', group: 'Reports' },
  { id: 'sales-journal', label: 'Sales Journal', group: 'Accounting Books' },
  { id: 'purchase-journal', label: 'Purchase Journal', group: 'Accounting Books' },
  { id: 'cash-receipt', label: 'Cash Receipt Journal', group: 'Accounting Books' },
  { id: 'cash-disbursement', label: 'Cash Disbursement Journal', group: 'Accounting Books' },
  { id: 'pl', label: 'Profit & Loss', group: 'Reports' },
  { id: 'balancesheet', label: 'Balance Sheet', group: 'Reports' },
  { id: 'cashflow', label: 'Cash Flow', group: 'Reports' },
  { id: 'assetlapsing', label: 'Asset Lapsing', group: 'Reports' },
  { id: 'reports', label: 'AFS Reports', group: 'Reports' },
  { id: 'bir-forms', label: 'BIR Forms', group: 'Tax & Compliance' },
  { id: 'relief', label: 'Relief', group: 'Tax & Compliance' },
  { id: 'compliance-tracker', label: 'Compliance Tracker', group: 'Tax & Compliance' },
  { id: 'alphalist', label: 'Alphalist', group: 'Tax & Compliance' },
  { id: 'eis-center', label: 'BIR E-Invoicing (EIS)', group: 'Tax & Compliance' },
  { id: 'taxnotes', label: 'Tax Notes', group: 'Tax & Compliance' },
  { id: 'afs-financial-position', label: 'AFS Financial Position', group: 'Reports' },
  { id: 'afs-income-statements', label: 'AFS Income Statements', group: 'Reports' },
  { id: 'afs-equity-retained-earnings', label: 'AFS Equity & Retained Earnings', group: 'Reports' },
  { id: 'afs-ppe', label: 'AFS Property, Plant & Equipment', group: 'Reports' },
] as const;

const CACHE_KEY = 'capot.developerFeatureVisibility';
let visibility: Record<string, boolean> = {};
let loaded = false;
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((listener) => listener());
function publish(next: Record<string, boolean>) {
  visibility = { ...next };
  loaded = true;
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(visibility)); } catch { /* storage may be unavailable */ }
  emit();
}
function readCache() {
  try { const parsed = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); return parsed && typeof parsed === 'object' ? parsed : {}; }
  catch { return {}; }
}

export function isFeatureVisible(pageId: string | null): boolean {
  if (!pageId) return true;
  return visibility[pageId] !== false;
}

export async function loadFeatureVisibility(force = false): Promise<void> {
  if (loading) return loading;
  if (loaded && !force) return;
  loading = (async () => {
    if (!loaded) visibility = readCache();
    try {
      const { data, error } = await supabase.rpc('get_feature_visibility');
      if (error) throw error;
      publish(data && typeof data === 'object' ? data as Record<string, boolean> : {});
    } catch (error) {
      // Retain the last known cache when the migration has not yet been applied.
      console.warn('[Feature visibility] Could not load developer settings:', error);
      loaded = true;
      emit();
    }
  })().finally(() => { loading = null; });
  return loading;
}

export async function saveFeatureVisibility(next: Record<string, boolean>): Promise<void> {
  const { error } = await supabase.rpc('set_feature_visibility', { p_visibility: next });
  if (error) throw error;
  publish(next);
}

export function useFeatureVisibility(): void {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const listener = () => setRevision((revision) => revision + 1);
    listeners.add(listener);
    void loadFeatureVisibility();
    return () => { listeners.delete(listener); };
  }, []);
}
