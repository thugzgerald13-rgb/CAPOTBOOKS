// src/hooks/useClientShell.ts
import { useQuery } from '@tanstack/react-query';
import { fetchClientShell } from '@/services/clientService';

export function useClientShell(clientId: string) {
  return useQuery({
    queryKey: ['clientShell', clientId],
    queryFn: () => fetchClientShell(clientId),
    staleTime: 10 * 60 * 1000,
    cacheTime: 30 * 60 * 1000,
  });
}
