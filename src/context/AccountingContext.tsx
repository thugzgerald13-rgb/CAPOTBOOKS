// src/context/AccountingContext.tsx
import React, { createContext, useContext, useMemo, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useClientShell } from '@/hooks/useClientShell';
import { useJournalEntries } from '@/hooks/useJournalEntries';
import { usePurchases } from '@/hooks/usePurchases';
// ... import other hooks as needed

interface AccountingContextValue {
  clientId: string;
  shell: ReturnType<typeof useClientShell>;
  // Expose hooks as methods so components can call them with page/pageSize
  useJournalEntries: (page: number, pageSize?: number) => ReturnType<typeof useJournalEntries>;
  usePurchases: (page: number, pageSize?: number) => ReturnType<typeof usePurchases>;
  // ... more hooks
}

const AccountingContext = createContext<AccountingContextValue | null>(null);

export function AccountingProvider({ clientId, children }: { clientId: string; children: ReactNode }) {
  const shell = useClientShell(clientId);
  const queryClient = useQueryClient();

  // Set up real‑time subscriptions (optional – we’ll do it here)
  useRealtimeSubscriptions(clientId, queryClient);

  const value = useMemo(
    () => ({
      clientId,
      shell,
      useJournalEntries: (page: number, pageSize = 20) => useJournalEntries(clientId, page, pageSize),
      usePurchases: (page: number, pageSize = 20) => usePurchases(clientId, page, pageSize),
      // ... bind other hooks
    }),
    [clientId, shell]
  );

  return <AccountingContext.Provider value={value}>{children}</AccountingContext.Provider>;
}

// Helper for real‑time (same as before)
function useRealtimeSubscriptions(clientId: string, queryClient: any) {
  React.useEffect(() => {
    if (!clientId) return;
    const channel = supabase
      .channel(`client-${clientId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'journal_entries', filter: `client_id=eq.${clientId}` },
        () => queryClient.invalidateQueries({ queryKey: ['journalEntries', clientId] })
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'purchases', filter: `client_id=eq.${clientId}` },
        () => queryClient.invalidateQueries({ queryKey: ['purchases', clientId] })
      )
      // add other tables as needed
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [clientId, queryClient]);
}

export function useAccounting() {
  const ctx = useContext(AccountingContext);
  if (!ctx) throw new Error('useAccounting must be used within AccountingProvider');
  return ctx;
}
