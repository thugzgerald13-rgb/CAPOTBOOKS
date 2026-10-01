/**
 * realtimeSubs.ts — Page-scoped realtime subscription utilities.
 *
 * IMPORTANT ARCHITECTURE NOTE (read before changing subscriptions):
 * ----------------------------------------------------------------
 * The app's main data channel (src/context/AccountingContext.tsx,
 * `clientsChannel`) is ALREADY connection-optimal: ONE websocket per user
 * with batched `client_id=in.(...)` filters for all 8 delta-synced tables.
 * That replaced the old "one subscription per (client × table)" model, so
 * active connections per tab are already just 2 (data channel + biz-profile).
 *
 * The subscribed table list MUST stay equal to DELTA_SYNC_TABLES — realtime
 * DELETE events are what evict rows from the in-memory + IndexedDB delta
 * cache. Removing a table from subscriptions would let a deleted row
 * resurrect on next load (the "duplicated account title" class of bug).
 * Do NOT trim that list without also handling DELETE eviction another way.
 *
 * What this module provides instead:
 *  1. PAGE_REALTIME_TABLES — which tables genuinely benefit from live
 *     updates per page, for future opt-in live features (e.g. a live Sales
 *     dashboard). Use these to add EXTRA per-page channels only where the
 *     live UX justifies a second connection.
 *  2. createBatchedRealtimeHandler — batches rapid-fire realtime events
 *     (e.g. bulk imports) into one setState flush, cutting re-renders and
 *     IndexedDB writes. Drop-in replacement for a raw event handler.
 */
import { useEffect, useRef } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

/** Tables that benefit from live updates per app page (opt-in extra channels). */
export const PAGE_REALTIME_TABLES: Record<string, readonly string[]> = {
  sales: ['sales'],
  purchases: ['purchases'],
  inventory: ['inventory_items', 'inventory_movements'],
  generalJournal: ['journal_entries', 'journal_vouchers', 'journal_voucher_lines'],
  dashboard: ['purchases', 'sales', 'journal_entries'],
} as const;

export interface RealtimeEvent {
  table: string;
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | '*';
  new?: Record<string, unknown> | null;
  old?: Record<string, unknown> | null;
}

type EventHandler = (events: RealtimeEvent[]) => void;

/**
 * Batch realtime events into flushes (default 500ms). Bulk imports / syncs
 * can fire hundreds of postgres_changes events in seconds; handling each one
 * synchronously (setState + IndexedDB write per row) janks the UI. Batching
 * keeps the channel open and correct while cutting handler work ~10–50×.
 */
export function createBatchedRealtimeHandler(
  flush: EventHandler,
  windowMs = 500
): (event: RealtimeEvent) => void {
  let queue: RealtimeEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;

  const doFlush = () => {
    timer = null;
    if (queue.length === 0) return;
    const batch = queue;
    queue = [];
    flush(batch);
  };

  return (event: RealtimeEvent) => {
    queue.push(event);
    if (timer == null) {
      timer = setTimeout(doFlush, windowMs);
    }
  };
}

/**
 * Opt-in: subscribe to a page's live tables for the duration the page is
 * mounted. Unsubscribes automatically on navigation. ONLY use this where a
 * live-updating view is a product requirement — the main channel already
 * keeps all delta-synced tables consistent across saves.
 */
export function usePageScopedRealtime(
  supabase: SupabaseClient,
  clientId: string,
  page: keyof typeof PAGE_REALTIME_TABLES | string,
  onEvent: (table: string, payload: unknown) => void
): void {
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    if (!clientId || !page) return;
    const tables = PAGE_REALTIME_TABLES[page as keyof typeof PAGE_REALTIME_TABLES];
    if (!tables || tables.length === 0) return;

    const channelName = `page-${page}-${clientId}`;
    let channel = supabase.channel(channelName);

    for (const table of tables) {
      channel = channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => onEventRef.current(table, payload)
      );
    }

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        console.debug(`[realtime] page-scoped subscribed: ${page} → [${tables.join(', ')}]`);
      }
    });

    return () => {
      void supabase.removeChannel(channel);
      console.debug(`[realtime] page-scoped unsubscribed: ${page}`);
    };
  }, [supabase, clientId, page]);
}

/** Force-cleanup helper for logout / user switch. */
export function removeAllPageChannels(supabase: SupabaseClient): void {
  void supabase.getChannels().forEach((ch) => {
    if (ch.topic?.startsWith('page-')) {
      void supabase.removeChannel(ch);
    }
  });
}
