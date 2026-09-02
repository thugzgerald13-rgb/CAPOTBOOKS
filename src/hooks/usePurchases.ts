// src/hooks/usePurchases.ts
import { useQuery } from '@tanstack/react-query';
import { fetchPurchases } from '@/services/clientService';

export function usePurchases(clientId: string, page: number, pageSize = 20) {
  return useQuery({
    queryKey: ['purchases', clientId, page, pageSize],
    queryFn: () => fetchPurchases(clientId, page, pageSize),
    staleTime: 2 * 60 * 1000,
    placeholderData: previousData => previousData,
  });
}
