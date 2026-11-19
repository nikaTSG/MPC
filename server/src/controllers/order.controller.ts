import type { Request, Response } from 'express';
import { orderService } from '../services/order.service.js';

// Narrows Express 5's `string | string[] | undefined` to a positive integer
function parseId(raw: string | string[] | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function readMeasurement(input: unknown) {
  const percentage = (value: unknown): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 100;
  if (!isRecord(input) || Object.keys(input).length !== 2 ||
      !percentage(input.measuredHealth) || !percentage(input.expectedHealth)) return null;
  return { measuredHealth: input.measuredHealth, expectedHealth: input.expectedHealth };
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

    const input: unknown = req.body;
    if (!isRecord(input) || !Object.keys(input).length || Object.keys(input).some(key => key !== 'subject' && key !== 'body')) {
      return res.status(400).json({ error: 'Provide a subject, body, or both.' });
    }
    const draft: { subject?: string; body?: string } = {};
    for (const key of ['subject', 'body'] as const) {
      if (!(key in input)) continue;
      const value = input[key];
      const limit = key === 'subject' ? 500 : 24_000;
      if (typeof value !== 'string' || !value.trim() || value.length > limit) {
        return res.status(400).json({ error: `The draft ${key} must contain 1 to ${limit} characters.` });
      }
      draft[key] = value.trim();
    }
    try {
      const updated = await orderService.updateDraft(id, draft);
      if (!updated) return res.status(409).json({ error: 'Only a draft awaiting approval can be edited.' });
      return res.json(updated);
    } catch (error) {
      return res.status(500).json({ error: 'Failed to update draft' });
    }
  },

  async approveOrder(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order ID' });

    try {
      const approved = await orderService.approveOrder(id);
      return res.json(approved);
    } catch (error: any) {
      return res.status(400).json({ error: error.message || 'Failed to approve order' });
    }
  },

  async recordSend(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order ID' });
    if (req.body !== undefined && (!isRecord(req.body) || Object.keys(req.body).length)) {
      return res.status(400).json({ error: 'Record the external send with an empty object. The delivery port is set when drafting.' });
    }
    try {
      const result = await orderService.recordSend(id);
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ error: 'Failed to record the external send and repair destination.' });
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
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid order ID' });
    if (req.body !== undefined && (!isRecord(req.body) || Object.keys(req.body).length)) {
      return res.status(400).json({ error: 'Complete the repair without a hull health measurement.' });
    }
    try {
      const result = await orderService.completeRepair(id);
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ error: 'Failed to save the repair and vessel health.' });
    }
  },

  async recordMeasuredHealth(req: Request, res: Response) {
    const id = parseId(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid vessel ID.' });
    const measurement = readMeasurement(req.body);
    if (!measurement) return res.status(400).json({ error: 'Enter whole-number health percentages from 0 to 100.' });
    try {
      const result = await orderService.recordMeasuredHealth(id, measurement);
      return res.status(result.status).json(result.body);
    } catch {
      return res.status(500).json({ error: 'Failed to save the measured hull health.' });
    }
  },
};
