/**
 * paginatedLoad.ts — On-demand keyset-paginated table loader.
 *
 * Companion to scripts/table_pagination.sql (get_table_page RPC).
 *
 * The initial client load (get_initial_client_data) deliberately returns the
 * FULL dataset — P&L / Balance Sheet / GL are computed in-memory from it.
 * Paginating that load would only split the same bytes into more requests.
 * This module is for LAZY loading of large/old slices only when a user opens
 * a view that needs them (History months, long Sales/Purchases lists).
 *
 * Results are cached in IndexedDB via the existing queryCache in localDb,
 * so repeat views of the same page cost zero egress. Invalidate on mutation.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { cacheQuery, getCachedQuery, invalidateQueries } from '../db/localDb';

export interface TablePage {
  rows: Array<Record<string, unknown>>;
  nextCursor: string | null;
  hasMore: boolean;
  pageSize: number;
}

export interface LoadPageOptions {
  /** ISO updated_at cursor from a previous page's nextCursor. null = newest. */
  cursor?: string | null;
  /** Rows per page, 1–5000. Default 500. */
  limit?: number;
  /** Cache TTL in ms. Default 5 min. Pass 0 to bypass cache. */
  maxAgeMs?: number;
}

const DEFAULT_MAX_AGE = 5 * 60 * 1000;

const cacheKey = (table: string, clientId: string, cursor: string | null, limit: number) =>
  `page:${table}:${clientId}:${cursor ?? 'newest'}:${limit}`;

/**
 * Load one page. Serves from IndexedDB queryCache when fresh; otherwise hits
 * the get_table_page RPC and caches the result. Never throws — returns an
 * empty page on failure so callers can degrade gracefully.
 */
export async function loadTablePage(
  supabase: SupabaseClient,
  table: string,
  clientId: string,
  opts: LoadPageOptions = {}
): Promise<TablePage> {
  const empty: TablePage = { rows: [], nextCursor: null, hasMore: false, pageSize: 0 };
  if (!clientId) return empty;

  const cursor = opts.cursor ?? null;
  const limit = opts.limit ?? 500;
  const maxAge = opts.maxAgeMs ?? DEFAULT_MAX_AGE;
  const key = cacheKey(table, clientId, cursor, limit);

  try {
    if (maxAge > 0) {
      const cached = await getCachedQuery<TablePage>(key, maxAge);
      if (cached) return cached;
    }

    const { data, error } = await supabase.rpc('get_table_page', {
      p_table: table,
      p_client_id: clientId,
      p_cursor: cursor,
      p_limit: limit,
    });

    if (error || !data) {
      console.info('[paginatedLoad] page fetch failed, returning empty:', error?.message);
      return empty;
    }

    const page: TablePage = {
      rows: Array.isArray(data.rows) ? data.rows : [],
      nextCursor: data.next_cursor ?? null,
      hasMore: Boolean(data.has_more),
      pageSize: Number(data.page_size ?? 0),
    };

    if (maxAge > 0) {
      void cacheQuery(key, table, clientId, page).catch(() => {});
    }
    return page;
  } catch (e) {
    console.info('[paginatedLoad] threw, returning empty:', e);
    return empty;
  }
}

/**
 * Load ALL pages for a table (accumulates). Use ONLY when a report genuinely
 * needs the full history and the initial load was intentionally capped. Hard
 * cap of 50 pages to prevent runaway egress. Each page is cached.
 */
export async function loadAllPages(
  supabase: SupabaseClient,
  table: string,
  clientId: string,
  opts: Omit<LoadPageOptions, 'cursor'> = {},
  maxPages = 50
): Promise<Array<Record<string, unknown>>> {
  const all: Array<Record<string, unknown>> = [];
  let cursor: string | null = null;
  for (let i = 0; i < maxPages; i++) {
    const page = await loadTablePage(supabase, table, clientId, { ...opts, cursor });
    all.push(...page.rows);
    if (!page.hasMore || !page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
}

/** Invalidate all cached pages for a table (call after a save/import). */
export async function invalidateTablePages(table: string, clientId?: string): Promise<void> {
  try {
    await invalidateQueries(table, clientId);
  } catch {
    /* non-fatal */
  }
}
