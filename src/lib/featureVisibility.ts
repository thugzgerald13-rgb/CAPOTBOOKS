import { useEffect, useState } from 'react';
import { supabase } from './supabase';

/** Routes/pages and feature identifiers managed by the developer. */
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

export type FeatureRuleScope = 'user' | 'plan';
export interface FeatureAccessRule {
  scope_type: FeatureRuleScope;
  scope_key: string;
  feature_id: string;
  enabled: boolean;
}

let visibility: Record<string, boolean> = {};
let loaded = false;
let loading: { id: number; promise: Promise<void> } | null = null;
let requestId = 0;
const listeners = new Set<() => void>();
let authListenerInstalled = false;
const emit = () => listeners.forEach((listener) => listener());
function publish(next: Record<string, boolean>) {
  visibility = { ...next };
  loaded = true;
  emit();
}

/** Effective visibility for the signed-in account, including its plan/user rules. */
export function isFeatureVisible(pageId: string | null): boolean {
  if (!pageId) return true;
  return visibility[pageId] !== false;
}

export async function loadFeatureVisibility(force = false): Promise<void> {
  if (loading && !force) return loading.promise;
  if (loaded && !force) return;

  const id = ++requestId;
  const promise = (async () => {
    try {
      // New RPC returns global + plan + user rules already combined for auth.uid().
      const { data, error } = await supabase.rpc('get_my_feature_visibility');
      if (error) throw error;
      if (id === requestId) publish(data && typeof data === 'object' ? data as Record<string, boolean> : {});
    } catch (effectiveError) {
      // Backward-compatible fallback while the targeted-access migration is pending.
      try {
        const { data, error } = await supabase.rpc('get_feature_visibility');
        if (error) throw error;
        if (id === requestId) publish(data && typeof data === 'object' ? data as Record<string, boolean> : {});
      } catch (legacyError) {
        if (id === requestId) {
          console.warn('[Feature visibility] Could not load developer settings:', effectiveError, legacyError);
          loaded = true;
          emit();
        }
      }
    }
  })().finally(() => {
    if (loading?.id === id) loading = null;
  });
  loading = { id, promise };
  return promise;
}

export async function loadGlobalFeatureVisibility(): Promise<Record<string, boolean>> {
  const { data, error } = await supabase.rpc('get_feature_visibility');
  if (error) throw error;
  return data && typeof data === 'object' ? data as Record<string, boolean> : {};
}

export async function saveFeatureVisibility(next: Record<string, boolean>): Promise<void> {
  const { error } = await supabase.rpc('set_feature_visibility', { p_visibility: next });
  if (error) throw error;
  publish(next);
}

export async function loadDeveloperFeatureRules(): Promise<FeatureAccessRule[]> {
  const { data, error } = await supabase.rpc('developer_get_feature_access_rules');
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.filter((row: any) => row &&
    (row.scope_type === 'user' || row.scope_type === 'plan') &&
    typeof row.scope_key === 'string' && typeof row.feature_id === 'string' &&
    typeof row.enabled === 'boolean') as FeatureAccessRule[];
}

/** Pass null to remove a targeted rule and inherit from the next scope. */
export async function saveDeveloperFeatureRule(
  scopeType: FeatureRuleScope,
  scopeKey: string,
  featureId: string,
  enabled: boolean | null,
): Promise<void> {
  const { error } = await supabase.rpc('developer_set_feature_access_rule', {
    p_scope_type: scopeType,
    p_scope_key: scopeKey,
    p_feature_id: featureId,
    p_enabled: enabled,
  });
  if (error) throw error;
  // Refresh the current account's effective map; the selected target may be another user.
  await loadFeatureVisibility(true);
}

function installFeatureVisibilityAuthListener() {
  if (authListenerInstalled) return;
  authListenerInstalled = true;
  supabase.auth.onAuthStateChange((event) => {
    // Do not carry one account's effective feature map into another login.
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') {
      requestId += 1; // Ignore a response started under the previous login.
      loading = null;
      visibility = {};
      loaded = event === 'SIGNED_OUT';
      emit();
      if (event !== 'SIGNED_OUT') {
        // Defer the RPC until Supabase has released its auth-state lock.
        window.setTimeout(() => { void loadFeatureVisibility(true); }, 0);
      }
    }
  });
}

export function useFeatureVisibility(): void {
  const [, setRevision] = useState(0);
  useEffect(() => {
    const listener = () => setRevision((revision) => revision + 1);
    listeners.add(listener);
    installFeatureVisibilityAuthListener();
    void loadFeatureVisibility();
    return () => { listeners.delete(listener); };
  }, []);
}
