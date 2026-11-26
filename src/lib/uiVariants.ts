/**
 * uiVariants.ts — "swap the universal UI for a customized one" (per user / per plan).
 *
 * Vocabulary
 *   slot     A place in the app that CAN be swapped (a page, a button, a feature).
 *            Slots are declared once in SWAPPABLE_SLOTS below. The universal
 *            (default) UI is whatever is already rendered there today.
 *   variant  A customized replacement for one slot. Variants are plain code
 *            registered in src/custom/registry.ts — they ship in the app bundle.
 *   assignment  "slot X -> variant Y" for a user or a subscription plan, stored
 *            in Supabase (scripts/ui_variant_assignments.sql) and edited by the
 *            developer in Developer System Config.
 *
 * Safety properties (by design):
 *   - Assignments only store ids. An id that is not registered in the bundle
 *     resolves to the universal UI, so no remote/arbitrary code can ever run.
 *   - Page variants render INSIDE the existing route guards (permissions,
 *     feature visibility, module locks), so swapping a page never widens access.
 *   - If the assignment RPC is missing (migration not run) or errors, everyone
 *     simply gets the universal UI.
 */
import { useSyncExternalStore } from 'react';
import type { ComponentType } from 'react';
import { lazy } from 'react';
import { supabase } from './supabase';

// ---------------------------------------------------------------------------
// 1. Slot catalog — every universal page / button that can be swapped.
//    To make a NEW place swappable: add a row here, then wrap it with
//    <Swappable slot="..."> (components/pages) or applyActionOverride() (buttons).
// ---------------------------------------------------------------------------

export type SlotKind = 'page' | 'component' | 'action';

export interface SlotDef {
  id: string;
  label: string;
  group: string;
  kind: SlotKind;
}

const page = (route: string, label: string, group: string): SlotDef =>
  ({ id: `page.${route}`, label, group, kind: 'page' });
const quickAdd = (target: string, label: string): SlotDef =>
  ({ id: `action.header.quick-add.${target}`, label: `Quick-add (+ New): ${label}`, group: 'Buttons', kind: 'action' });

export const SWAPPABLE_SLOTS: readonly SlotDef[] = [
  // Transactions
  page('sales', 'Income / Sales', 'Transactions'),
  page('billing', 'Billing & Invoices', 'Transactions'),
  page('purchases', 'Purchases (all sub-workspaces)', 'Transactions'),
  page('journal-voucher', 'Journal Voucher', 'Transactions'),
  page('history', 'Income & Expense History', 'Transactions'),
  page('files', 'Upload Files', 'Transactions'),
  page('inventory', 'Inventory', 'Transactions'),
  page('payroll', 'Payroll', 'Transactions'),
  page('payroll-settings', 'Payroll Settings', 'Transactions'),
  // Accounting books
  page('journal', 'General Journal', 'Accounting Books'),
  page('ledger', 'General Ledger', 'Accounting Books'),
  page('subsidiary-ledger', 'Subsidiary General Ledger', 'Accounting Books'),
  page('aging-reports', 'A/R & A/P Aging Reports', 'Accounting Books'),
  page('sales-journal', 'Sales Journal', 'Accounting Books'),
  page('purchase-journal', 'Purchase Journal', 'Accounting Books'),
  page('cash-receipt', 'Cash Receipt Journal', 'Accounting Books'),
  page('cash-disbursement', 'Cash Disbursement Journal', 'Accounting Books'),
  page('books', 'Books landing page', 'Accounting Books'),
  // Reports
  page('trialbalance', 'Trial Balance', 'Reports'),
  page('pl', 'Profit & Loss', 'Reports'),
  page('balancesheet', 'Balance Sheet', 'Reports'),
  page('cashflow', 'Cash Flow', 'Reports'),
  page('assetlapsing', 'Asset Lapsing', 'Reports'),
  page('reports', 'Reports landing page', 'Reports'),
  page('afs-financial-position', 'AFS Financial Position', 'Reports'),
  page('afs-income-statements', 'AFS Income Statements', 'Reports'),
  page('afs-equity-retained-earnings', 'AFS Equity & Retained Earnings', 'Reports'),
  page('afs-ppe', 'AFS Property, Plant & Equipment', 'Reports'),
  // Tax & compliance
  page('bir-forms', 'BIR Forms', 'Tax & Compliance'),
  page('relief', 'Relief', 'Tax & Compliance'),
  page('alphalist', 'Alphalist', 'Tax & Compliance'),
  page('compliance-tracker', 'Compliance Tracker', 'Tax & Compliance'),
  page('eis-center', 'BIR E-Invoicing (EIS)', 'Tax & Compliance'),
  page('taxnotes', 'Tax Notes', 'Tax & Compliance'),
  // Setup & account
  page('coa', 'Chart of Accounts', 'Core & Setup'),
  page('business', 'Business Profile', 'Core & Setup'),
  page('clients', 'Client Profiles', 'Core & Setup'),
  page('tinlibrary', 'TIN Library', 'Core & Setup'),
  page('team', 'Team & Subusers', 'Core & Setup'),
  page('account-settings', 'Account Settings', 'Core & Setup'),
  // Buttons
  quickAdd('billing', 'New Invoice'),
  quickAdd('purchases', 'New Bill / Expense'),
  quickAdd('sales', 'New Income / Sale'),
  quickAdd('journal-voucher', 'Journal Voucher'),
  quickAdd('files', 'Upload Receipt / File'),
];

const SLOT_BY_ID = new Map(SWAPPABLE_SLOTS.map((slot) => [slot.id, slot]));
export const getSlot = (slotId: string): SlotDef | undefined => SLOT_BY_ID.get(slotId);

// ---------------------------------------------------------------------------
// 2. Variant registry (populated by src/custom/registry.ts)
// ---------------------------------------------------------------------------

/** Props every page/component variant receives, on top of the universal one's props. */
export type CustomComponentProps<P extends object = {}> = P & {
  /** The universal component for this slot. Render it to extend instead of rewrite. */
  Universal: ComponentType<P>;
};

export interface ComponentVariantDef {
  id: string;
  label: string;
  description?: string;
  /** Lazy loader, e.g. () => import('./pages/AcmeSales'). Module must default-export a component. */
  load: () => Promise<{ default: ComponentType<any> }>;
}

export interface ActionContext {
  navigateToPage: (page: string | null) => void;
}

/** Changes to a universal button. Omitted fields keep the universal value. */
export interface ActionOverride {
  label?: string;
  icon?: ComponentType<{ className?: string }>;
  /** Route to open (same values the universal button passes to navigateToPage). */
  page?: string;
  /** Run custom behaviour instead of navigating (open a modal, call an API, ...). */
  onSelect?: (ctx: ActionContext) => void;
  /** Remove this button for the assigned users. */
  hidden?: boolean;
}

export interface ActionVariantDef {
  id: string;
  label: string;
  description?: string;
  override: ActionOverride;
}

type RegisteredComponentVariant = ComponentVariantDef & { Component: ComponentType<any> };

const componentVariants = new Map<string, Map<string, RegisteredComponentVariant>>();
const actionVariants = new Map<string, Map<string, ActionVariantDef>>();

function warnIfBadSlot(fn: string, slotId: string, kinds: SlotKind[]) {
  const slot = getSlot(slotId);
  if (!slot) console.warn(`[ui-variants] ${fn}: unknown slot "${slotId}". Add it to SWAPPABLE_SLOTS first.`);
  else if (!kinds.includes(slot.kind)) console.warn(`[ui-variants] ${fn}: slot "${slotId}" is a "${slot.kind}" slot.`);
}

/** Register a customized page/component for a slot. Call from src/custom/registry.ts. */
export function registerComponentVariant(slotId: string, def: ComponentVariantDef): void {
  warnIfBadSlot('registerComponentVariant', slotId, ['page', 'component']);
  const bucket = componentVariants.get(slotId) ?? new Map();
  bucket.set(def.id, { ...def, Component: lazy(def.load) });
  componentVariants.set(slotId, bucket);
}

/** Register a customized button for an action slot. Call from src/custom/registry.ts. */
export function registerActionVariant(slotId: string, def: ActionVariantDef): void {
  warnIfBadSlot('registerActionVariant', slotId, ['action']);
  const bucket = actionVariants.get(slotId) ?? new Map();
  bucket.set(def.id, def);
  actionVariants.set(slotId, bucket);
}

/** Variants a developer can assign to a slot (used by the Developer System Config panel). */
export function listVariantsForSlot(slotId: string): { id: string; label: string; description?: string }[] {
  const out: { id: string; label: string; description?: string }[] = [];
  for (const v of componentVariants.get(slotId)?.values() ?? []) out.push({ id: v.id, label: v.label, description: v.description });
  for (const v of actionVariants.get(slotId)?.values() ?? []) out.push({ id: v.id, label: v.label, description: v.description });
  return out;
}

// ---------------------------------------------------------------------------
// 3. Per-user assignment store (server-resolved: user > owner > plan)
// ---------------------------------------------------------------------------

let assignments: Record<string, string> = {};
let loaded = false;
let revision = 0;
let requestId = 0;
let inflight: Promise<void> | null = null;
let currentUserId: string | null | undefined;
let authListenerInstalled = false;
const listeners = new Set<() => void>();

/** Never block the UI on a slow/failed RPC for longer than this (then show universal UI). */
const LOAD_TIMEOUT_MS = 4000;

function emit() {
  revision += 1;
  listeners.forEach((listener) => listener());
}

function sameMap(a: Record<string, string>, b: Record<string, string>) {
  const ak = Object.keys(a);
  return ak.length === Object.keys(b).length && ak.every((k) => a[k] === b[k]);
}

function publish(next: Record<string, string>) {
  const changed = !sameMap(assignments, next);
  assignments = next;
  if (changed || !loaded) { loaded = true; emit(); }
}

function sanitize(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [slot, variant] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof variant === 'string' && variant) out[slot] = variant;
    }
  }
  return out;
}

export function loadUiVariants(force = false): Promise<void> {
  if (inflight && !force) return inflight;
  if (loaded && !force) return Promise.resolve();

  const id = ++requestId;
  const timeout = window.setTimeout(() => { if (id === requestId && !loaded) publish({}); }, LOAD_TIMEOUT_MS);
  const promise = (async () => {
    try {
      const { data, error } = await supabase.rpc('get_my_ui_variants');
      if (error) throw error;
      if (id === requestId) publish(sanitize(data));
    } catch (error) {
      // Migration not run / offline: fall back to universal UI; keep any prior map on refresh failures.
      console.warn('[ui-variants] Could not load assignments, using the universal UI:', error);
      if (id === requestId) publish(loaded ? assignments : {});
    }
  })().finally(() => {
    window.clearTimeout(timeout);
    if (inflight === promise) inflight = null;
  });
  inflight = promise;
  return promise;
}

function installAuthListener() {
  if (authListenerInstalled) return;
  authListenerInstalled = true;
  supabase.auth.onAuthStateChange((event, session) => {
    const uid = session?.user?.id ?? null;
    const first = currentUserId === undefined;
    if (!first && uid === currentUserId) {
      // Same account (token refresh / tab refocus / profile update): keep the current
      // map on screen — never reset to a skeleton — and just revalidate on profile change.
      if (event === 'USER_UPDATED') window.setTimeout(() => { void loadUiVariants(true); }, 0);
      return;
    }
    currentUserId = uid;
    // First event after subscribing for an already-signed-in user: subscribe() already started the load.
    if (first && uid) return;
    // Different account (or sign-out): never carry one account's UI into another login.
    requestId += 1;
    inflight = null;
    assignments = {};
    loaded = uid === null;
    emit();
    // Defer the RPC until Supabase has released its auth-state lock.
    if (uid) window.setTimeout(() => { void loadUiVariants(true); }, 0);
  });
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  installAuthListener();
  void loadUiVariants();
  return () => { listeners.delete(listener); };
}

/** Subscribe a component to assignment changes. Returns true once assignments are known. */
export function useUiVariants(): boolean {
  useSyncExternalStore(subscribe, () => revision, () => revision);
  return loaded;
}

export function getAssignedVariantId(slotId: string): string | undefined {
  return assignments[slotId];
}

// ---------------------------------------------------------------------------
// 4. Resolvers used by <Swappable> and by buttons
// ---------------------------------------------------------------------------

export function resolveComponentVariant(slotId: string): RegisteredComponentVariant | null {
  const variantId = assignments[slotId];
  if (!variantId) return null;
  const found = componentVariants.get(slotId)?.get(variantId) ?? null;
  if (!found) console.warn(`[ui-variants] "${slotId}" is assigned unknown variant "${variantId}" — using universal UI.`);
  return found;
}

export type ActionItem = { label: string; icon: ComponentType<{ className?: string }>; page: string };

/**
 * Apply the assigned override (if any) to a universal button definition.
 * Returns null when the variant hides the button.
 */
export function applyActionOverride<T extends ActionItem>(
  slotId: string,
  base: T,
): (T & { onSelect?: ActionOverride['onSelect'] }) | null {
  const variantId = assignments[slotId];
  const variant = variantId ? actionVariants.get(slotId)?.get(variantId) : undefined;
  if (!variant) return base;
  const o = variant.override;
  if (o.hidden) return null;
  return {
    ...base,
    label: o.label ?? base.label,
    icon: o.icon ?? base.icon,
    page: o.page ?? base.page,
    onSelect: o.onSelect,
  };
}

// ---------------------------------------------------------------------------
// 5. Developer APIs (Developer System Config)
// ---------------------------------------------------------------------------

export type VariantScope = 'user' | 'plan';
export interface VariantAssignment {
  scope_type: VariantScope;
  scope_key: string;
  slot_id: string;
  variant_id: string;
}

export async function loadDeveloperVariantAssignments(): Promise<VariantAssignment[]> {
  const { data, error } = await supabase.rpc('developer_get_ui_variant_assignments');
  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data.filter((row: any) => row
    && (row.scope_type === 'user' || row.scope_type === 'plan')
    && typeof row.scope_key === 'string' && typeof row.slot_id === 'string'
    && typeof row.variant_id === 'string') as VariantAssignment[];
}

/** Pass variantId = null to remove the assignment (scope goes back to universal / inherited). */
export async function saveDeveloperVariantAssignment(
  scopeType: VariantScope,
  scopeKey: string,
  slotId: string,
  variantId: string | null,
): Promise<void> {
  const { error } = await supabase.rpc('developer_set_ui_variant_assignment', {
    p_scope_type: scopeType,
    p_scope_key: scopeKey,
    p_slot_id: slotId,
    p_variant_id: variantId,
  });
  if (error) throw error;
  // The developer may be editing their own account/plan — refresh the live map.
  await loadUiVariants(true);
}
