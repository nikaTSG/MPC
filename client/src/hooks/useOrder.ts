import { useState, useEffect, useCallback } from 'react';

export interface OrderDraft {
  id: number;
  vesselId: number;
  subject: string;
  body: string;
  urgency: 'LOW' | 'NORMAL' | 'CRITICAL';
  status: 'PENDING_APPROVAL' | 'SENT' | 'REJECTED';
  items: { partNumber: string; partName: string; quantity: number; notes?: string }[];
  vessel?: { id: number; name: string; imo: string };
  supplier?: { id: number; name: string; email: string; portLocation?: string };
}

export function useOrders(statusFilter: string = 'PENDING_APPROVAL') {
  const [orders, setOrders] = useState<OrderDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/v1/orders?status=${statusFilter}`);
      if (!res.ok) throw new Error('Failed to load procurement drafts');
      const data = await res.json();
      setOrders(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  const approveOrder = async (id: number) => {
    const res = await fetch(`/api/v1/orders/${id}/approve`, { method: 'POST' });
    if (!res.ok) throw new Error('Failed to approve and send email');
    const result = await res.json(); // Contains previewUrl from Ethereal
    await fetchOrders();
    return result;
  };

  const updateOrderDraft = async (id: number, updates: { subject?: string; body?: string }) => {
    const res = await fetch(`/api/v1/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error('Failed to save draft edits');
    await fetchOrders();
  };

  return { orders, loading, error, refetch: fetchOrders, approveOrder, updateOrderDraft };
}