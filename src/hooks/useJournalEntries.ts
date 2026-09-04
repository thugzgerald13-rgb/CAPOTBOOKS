// src/hooks/useJournalEntries.ts
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  fetchJournalEntries,
  fetchJournalEntryDetail,
  upsertJournalEntry,
  deleteJournalEntry,
} from '@/services/clientService';

export function useJournalEntries(clientId: string, page: number, pageSize = 20) {
  return useQuery({
    queryKey: ['journalEntries', clientId, page, pageSize],
    queryFn: () => fetchJournalEntries(clientId, page, pageSize),
    staleTime: 2 * 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export function useJournalEntryDetail(entryId: string | null) {
  return useQuery({
    queryKey: ['journalEntryDetail', entryId],
    queryFn: () => fetchJournalEntryDetail(entryId!),
    enabled: !!entryId,
    staleTime: 5 * 60 * 1000,
  });
}

export function useUpsertJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: upsertJournalEntry,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
      if (variables.id) {
        queryClient.invalidateQueries({ queryKey: ['journalEntryDetail', variables.id] });
      }
    },
  });
}

export function useDeleteJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteJournalEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    },
  });
}

