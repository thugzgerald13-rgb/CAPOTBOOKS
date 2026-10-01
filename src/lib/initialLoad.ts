/**
 * initialLoad.ts — Consolidated initial-load RPC client with safe fallback.
 *
 * loadNormalizedClient() in src/context/AccountingContext.tsx normally fires
 * 19 parallel GETs (8 delta-synced tables + 11 full-fetch tables) on every
 * client switch / cold load. This module tries ONE supabase.rpc() call first;
 * on any failure (function not deployed, RLS, network, empty payload) it
 * returns null and the caller falls back to the original per-table path — so
 * deploying the SQL function (scripts/initial_load_rpc.sql) is entirely
 * optional and never breaks the app.
 *
 * The returned shape is deliberately a "synthetic PostgREST response"
 * ({ data, error: null }) per table so it can be dropped straight into the
 * existing destructuring + merge + persist + mapping code in loadNormalizedClient
 * with zero changes to that logic.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

// Mirrors DELTA_SYNC_TABLES + fullQueryPromises in AccountingContext.tsx.
// Kept here as a single source of truth for the table set the RPC must return.
export const INITIAL_LOAD_DELTA_TABLES = [
  'purchases',
  'sales',
  'coa_columns',
  'coa_accounts',
  'journal_columns',
  'journal_entries',
  'journal_vouchers',
  'journal_voucher_lines',
] as const;

export const INITIAL_LOAD_FULL_TABLES = [
  'inventory_columns',
  'inventory_items',
  'inventory_movements',
  'app_folders',
  'app_files',
  'tin_entries',
  'tax_deadlines',
  'bank_accounts',
  'asset_lapsing_schedule',
  'billing_invoices',
  'financial_report_snapshots',
] as const;

export const INITIAL_LOAD_ALL_TABLES: readonly string[] = [
  ...INITIAL_LOAD_DELTA_TABLES,
  ...INITIAL_LOAD_FULL_TABLES,
];

/** Synthetic PostgREST response — exactly what .select() resolves to. */
interface SyntheticResponse {
  data: Array<Record<string, unknown>>;
  error: null;
}

export interface RpcLoadResult {
  /** One synthetic response per delta table, in DELTA_SYNC_TABLES order. */
  deltaResults: SyntheticResponse[];
  /** Synthetic responses for the 11 full-fetch tables, keyed by table name. */
  full: Record<(typeof INITIAL_LOAD_FULL_TABLES)[number], SyntheticResponse>;
}

const asResponse = (rows: unknown): SyntheticResponse => ({
  data: Array.isArray(rows) ? (rows as Array<Record<string, unknown>>) : [],
  error: null,
});

/**
 * Try the consolidated RPC. Returns null on ANY failure so the caller can
 * fall back to per-table fetches. Never throws.
 */
export async function loadInitialViaRpc(
  supabase: SupabaseClient,
  clientId: string
): Promise<RpcLoadResult | null> {
  if (!clientId) return null;
  try {
    const { data, error } = await supabase.rpc('get_initial_client_data', {
      p_client_id: clientId,
    });

    if (error) {
      // Most common: function not yet deployed (SQLSTATE 42883) or RLS.
      // Fall back silently — this is the expected state before deploy.
      console.info('[initialLoad] RPC unavailable, falling back to per-table fetch:', error.message);
      return null;
    }
    if (!data || typeof data !== 'object') {
      console.info('[initialLoad] RPC returned empty payload, falling back to per-table fetch');
      return null;
    }

    const payload = data as Record<string, unknown>;
    const full = {} as RpcLoadResult['full'];
    for (const table of INITIAL_LOAD_FULL_TABLES) {
      full[table] = asResponse(payload[table]);
    }

    return {
      deltaResults: INITIAL_LOAD_DELTA_TABLES.map((t) => asResponse(payload[t])),
      full,
    };
  } catch (e) {
    console.info('[initialLoad] RPC threw, falling back to per-table fetch:', e);
    return null;
  }
}

/**
 * Invalidate the persisted watermark for a client so the next load is a
 * authoritative full re-sync (RPC or per-table). Call after bulk operations /
 * imports where the in-memory cursor bump alone may not suffice.
 *
 * Normal saves already bump the in-memory cursor in AccountingContext; this
 * is the heavy hammer for cross-tab / cross-device staleness.
 */
export async function invalidateInitialLoad(clientId: string): Promise<void> {
  try {
    const { clearCachedCursor } = await import('../db/localDb');
    await clearCachedCursor(clientId);
  } catch {
    /* non-fatal — next load just re-fetches */
  }
}
