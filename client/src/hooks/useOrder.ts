import { useState, useEffect, useCallback } from 'react';
import { mpcApi, type OrderDraft } from '../api/mpcApi';

export type { OrderDraft };

export function useOrders(statusFilter: string = 'PENDING_APPROVAL') {
  const [orders, setOrders] = useState<OrderDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const data = await mpcApi.getOrders(statusFilter);
      setOrders(data);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load procurement drafts');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const approveOrder = async (id: number) => {
    const result = await mpcApi.approveOrder(id);
    await fetchOrders();
    return result;
  };

  const updateOrderDraft = async (id: number, updates: { subject?: string; body?: string }) => {
    await mpcApi.updateOrderDraft(id, updates);
    await fetchOrders();
  };

  return { orders, loading, error, refetch: fetchOrders, approveOrder, updateOrderDraft };
}