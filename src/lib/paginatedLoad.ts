// src/lib/paginatedLoad.ts
// Keyset-paginated Supabase fetcher with TTL cache + consolidated-RPC fallback.
// Keyset pagination (cursor on updated_at + id) avoids the O(n) cost of OFFSET
// on large transaction tables (journal_entries, purchases, sales, ...).
//
// Usage:
//   const { rows, nextCursor, hasMore } = await fetchPage(supabase, clientId, 'journal_entries', { limit: 500 });
//   const page2 = await fetchPage(..., { limit: 500, cursor: nextCursor });
//   const all = await fetchAllPages(supabase, clientId, 'coa_accounts'); // small master tables

import type { SupabaseClient } from '@supabase/supabase-js';
import { getCache, setCache, DEFAULT_TTL } from './cacheDB';

export interface PageOptions {
  limit?: number;
  cursor?: string | null; // JSON-encoded { updated_at, id } of the last row; null/undefined = first page
  select?: string;        // column list, default '*'
  orderBy?: string;       // default 'updated_at'
  orderAscending?: boolean;
  ttl?: number;
}

export interface PageResult<T = Record<string, any>> {
  rows: T[];
  nextCursor: string | null;
  hasMore: boolean;
  fromCache: boolean;
}

const DEFAULT_LIMIT = 500;

function cacheKey(clientId: string, table: string, opts: PageOptions): string {
  const cursor = opts.cursor ?? 'first';
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const select = (opts.select ?? '*').replace(/\s+/g, '');
  return `client:${clientId}:${table}:${cursor}:${limit}:${select}`;
}

// Build the keyset filter. Cursor is the LAST row of the previous page.
function applyCursor(query: any, opts: PageOptions): any {
  if (!opts.cursor) return query;
  try {
    const last = JSON.parse(opts.cursor) as { updated_at: string; id: string | number };
    const orderCol = opts.orderBy ?? 'updated_at';
    if (opts.orderAscending) {
      return query.or(`${orderCol}.gt.${last[orderCol as keyof typeof last]},and(${orderCol}.eq.${last[orderCol as keyof typeof last]},id.gt.${last.id})`);
    }
    return query.or(`${orderCol}.lt.${last[orderCol as keyof typeof last]},and(${orderCol}.eq.${last[orderCol as keyof typeof last]},id.lt.${last.id})`);
  } catch {
    return query; // malformed cursor → treat as first page
  }
}

export async function fetchPage<T = Record<string, any>>(
  supabase: SupabaseClient,
  clientId: string,
  table: string,
  opts: PageOptions = {},
): Promise<PageResult<T>> {
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const orderCol = opts.orderBy ?? 'updated_at';
  const key = cacheKey(clientId, table, opts);

  const cached = await getCache<PageResult<T>>(key);
  if (cached) return { ...cached, fromCache: true };

  let query = supabase
    .from(table)
    .select(opts.select ?? '*')
    .eq('client_id', clientId)
    .order(orderCol, { ascending: !!opts.orderAscending })
    .order('id', { ascending: !!opts.orderAscending })
    .limit(limit + 1); // fetch one extra to detect hasMore

  query = applyCursor(query, opts);

  const { data, error } = await query;
  if (error) throw error;

  const rows = (data || []) as T[];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const last = pageRows[pageRows.length - 1] as any;
  const nextCursor = hasMore && last
    ? JSON.stringify({ updated_at: last.updated_at, id: last.id })
    : null;

  const result: PageResult<T> = { rows: pageRows, nextCursor, hasMore, fromCache: false };
  void setCache(key, result, opts.ttl ?? DEFAULT_TTL);
  return result;
}

// Fetch every page of a (usually small) table. Caches each page individually.
export async function fetchAllPages<T = Record<string, any>>(
  supabase: SupabaseClient,
  clientId: string,
  table: string,
  opts: Omit<PageOptions, 'cursor'> = {},
): Promise<T[]> {
  const all: T[] = [];
  let cursor: string | null | undefined = undefined;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = await fetchPage<T>(supabase, clientId, table, { ...opts, cursor });
    all.push(...page.rows);
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}

// ---------------------------------------------------------------------------
// Consolidated initial load: one RPC call returns the first page (or full
// small tables) of every table. Falls back to individual paginated fetches.
// ---------------------------------------------------------------------------

export interface InitialLoadOptions {
  pageSize?: number;
  ttl?: number;
}

export interface InitialLoadResult {
  data: Record<string, any[]>;
  cursors: Record<string, string | null>; // next cursor per table for lazy-loading more
  fromRpc: boolean;
}

// Small master tables load fully in one shot; large transaction tables load
// only the first page and lazy-load more as the user scrolls/navigates.
const SMALL_TABLES = ['coa_accounts', 'coa_columns', 'inventory_columns', 'app_folders', 'bank_accounts', 'tax_deadlines', 'asset_lapsing_schedule'];
const LARGE_TABLES = ['purchases', 'sales', 'journal_entries', 'journal_columns', 'journal_vouchers', 'journal_voucher_lines', 'inventory_items', 'inventory_movements', 'app_files', 'tin_entries', 'billing_invoices', 'financial_report_snapshots'];

export async function loadInitialClientData(
  supabase: SupabaseClient,
  clientId: string,
  opts: InitialLoadOptions = {},
): Promise<InitialLoadResult> {
  const pageSize = opts.pageSize ?? 500;

  // 1) Try the consolidated RPC first (one call for everything).
  try {
    const { data, error } = await supabase.rpc('get_initial_client_data_paginated', {
      p_client_id: clientId,
      p_page_size: pageSize,
    });
    if (!error && data) {
      const result = data as { data: Record<string, any[]>; cursors: Record<string, string | null> };
      // Cache each table's first page.
      for (const [table, rows] of Object.entries(result.data)) {
        void setCache(cacheKey(clientId, table, { limit: pageSize }), { rows, nextCursor: result.cursors[table] ?? null, hasMore: !!result.cursors[table], fromCache: false }, opts.ttl ?? DEFAULT_TTL);
      }
      return { data: result.data, cursors: result.cursors, fromRpc: true };
    }
  } catch {
    // fall through to individual fetches
  }

  // 2) Fallback: small tables fully, large tables first page only.
  const data: Record<string, any[]> = {};
  const cursors: Record<string, string | null> = {};

  await Promise.all([
    ...SMALL_TABLES.map(async (table) => {
      data[table] = await fetchAllPages(supabase, clientId, table, { limit: pageSize, ttl: opts.ttl });
      cursors[table] = null;
    }),
    ...LARGE_TABLES.map(async (table) => {
      const page = await fetchPage(supabase, clientId, table, { limit: pageSize, ttl: opts.ttl });
      data[table] = page.rows;
      cursors[table] = page.nextCursor;
    }),
  ]);

  return { data, cursors, fromRpc: false };
}
