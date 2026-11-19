import { randomUUID } from 'node:crypto';
import { db } from '../../prisma/db.js';
import { applyFaultDamage, type FaultSeverity } from './vessel.service.js';
import { orderService, type ExtractedPartInput, type RepairPort } from './order.service.js';
import type { AiCredentials } from '../integrations/ai/aiProvider.js';

export interface IncomingFaultReport {
  vesselId: number;
  severity: FaultSeverity;
  faultSummary?: string;
  extractedParts: ExtractedPartInput[];
  repairPort?: RepairPort;
}

export const reportService = {
  async processFaultReport(input: IncomingFaultReport, credentials: AiCredentials) {
    // Resolve the model output before opening a write transaction. A rejected
    // key or failed provider request therefore changes no database state.
    const prepared = await orderService.prepareDraftsFromReport(
      input.vesselId,
      input.extractedParts,
      credentials,
      input.repairPort,
    );

    return db.transaction(async (tx) => {
      const healthUpdate = await applyFaultDamage(tx.orm.Vessel, input.vesselId, input.severity, input.extractedParts.length);

      // Each validated line retains the full requested quantity, including consolidated duplicates.
      const requestedQuantity = input.extractedParts.reduce((sum, part) => sum + part.quantity, 0);
      const matchedQuantity = prepared.drafts.reduce((sum, draft) =>
        sum + draft.matchedParts.reduce((count, part) => count + part.quantity, 0), 0);
      const repairFaultId = randomUUID();
      const repairHealthLoss = matchedQuantity === requestedQuantity
        ? healthUpdate.previousHealth - healthUpdate.newHealth
        : null;
      const draftedOrders = await orderService.persistPreparedDrafts(
        prepared,
        (order) => tx.orm.Order.create({ ...order, repairFaultId, repairHealthLoss }),
        healthUpdate.vessel,
      );

      return {
        healthUpdate,
        draftedOrders,
      };
    });
  },
};
