import type { Request, Response } from 'express';
import { orderService } from '../services/order.service.js';

// Narrows Express 5's `string | string[] | undefined` to a positive integer
function parseId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const orderController = {
  generateDrafts(_req: Request, res: Response) {
    return res.redirect(307, '/api/v1/ai/drafts');
  },

  async listOrders(req: Request, res: Response) {
    try {
      const status = typeof req.query.status === 'string' ? req.query.status : 'PENDING_APPROVAL';
      const orders = await orderService.getOrdersByStatus(status);
      return res.json(orders);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch orders' });
    }
  },

  async getOrder(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order ID' });

    try {
      const order = await orderService.getOrderById(id);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      return res.json(order);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch order' });
    }
  },

  async updateDraft(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order ID' });

    try {
      const { subject, body } = req.body;
      const updated = await orderService.updateDraft(id, { subject, body });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update draft' });
    }
  },

  async approveOrder(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order ID' });

    try {
      const sentOrder = await orderService.approveAndSend(id);
      return res.json(sentOrder);
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to approve order' });
    }
  },

  async rejectOrder(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order ID' });

    try {
      const rejected = await orderService.rejectOrder(id);
      return res.json(rejected);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to reject order' });
    }
  },
};