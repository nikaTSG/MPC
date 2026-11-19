import type { Request, Response } from 'express';
import { orderService } from '../services/order.service.js';
import { isAuthorizedBrowserPost } from '../routes/ai.route.js';

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
      if (!rejected) return res.status(409).json({ error: 'No rejectable order was found.' });
      return res.json(rejected);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to reject order' });
    }
  },

  async completeRepair(req: Request, res: Response) {
    if (!isAuthorizedBrowserPost(req)) return res.status(403).json({ error: 'Request origin or network is not allowed.' });
    const id = parseId(req.params.id);
    const { measuredHealth, expectedHealth } = req.body ?? {};
    const percentage = (value: unknown): value is number =>
      typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
    if (!id || !percentage(measuredHealth) || !percentage(expectedHealth)) {
      return res.status(400).json({ error: 'Enter a whole-number health percentage from 0 to 100.' });
    }
    try {
      const result = await orderService.completeRepair(id, measuredHealth, expectedHealth);
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ error: 'Failed to save the repair and vessel health.' });
    }
  },
};
