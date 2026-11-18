import type { Request, Response } from 'express';
import { orderService } from '../services/order.service.js';

// Narrows Express 5's `string | string[] | undefined` to a positive integer
function parseId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export const orderController = {
  async generateDrafts(req: Request, res: Response) {
    try {
      const vesselId = Number(req.body.vesselId);
      const { extractedParts } = req.body;

      if (!Number.isInteger(vesselId) || vesselId <= 0) {
        return res.status(400).json({ error: 'Valid numeric vesselId is required' });
      }
      if (!Array.isArray(extractedParts) || extractedParts.length === 0) {
        return res.status(400).json({ error: 'Non-empty extractedParts array is required' });
      }

      const drafts = await orderService.generateDraftsFromReport(vesselId, extractedParts);
      return res.status(201).json(drafts);
    } catch (error) {
      console.error('Failed to generate order drafts:', error);
      return res.status(500).json({ error: 'Failed to generate supplier drafts' });
    }
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