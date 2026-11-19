import { randomUUID } from 'node:crypto';
import { db } from '../../prisma/db.js';
import { calculateFaultDamage, type FaultSeverity } from './vessel.service.js';
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
      const vessel = await tx.orm.Vessel.where((row) => row.id.eq(input.vesselId)).first();
      if (!vessel) throw new Error(`Vessel with ID ${input.vesselId} not found`);

      const damage = calculateFaultDamage(vessel.health, input.severity, input.extractedParts.length);
      const updatedVessel = await tx.orm.Vessel
        .where((row) => row.id.eq(input.vesselId))
        .update({
          health: damage.newHealth,
          operationalStatus:
            damage.newHealth < 70 ? 'MAINTENANCE_REQUIRED' : vessel.operationalStatus,
        });
      if (!updatedVessel) throw new Error(`Vessel with ID ${input.vesselId} not found`);

      // Each validated line retains the full requested quantity, including consolidated duplicates.
      const requestedQuantity = input.extractedParts.reduce((sum, part) => sum + part.quantity, 0);
      const matchedQuantity = prepared.drafts.reduce((sum, draft) =>
        sum + draft.matchedParts.reduce((count, part) => count + part.quantity, 0), 0);
      const repairFaultId = randomUUID();
      const repairHealthLoss = matchedQuantity === requestedQuantity
        ? damage.previousHealth - damage.newHealth
        : null;
      const draftedOrders = await orderService.persistPreparedDrafts(
        prepared,
        (order) => tx.orm.Order.create({ ...order, repairFaultId, repairHealthLoss }),
        updatedVessel,
      );

      return {
        healthUpdate: { vessel: updatedVessel, ...damage },
        draftedOrders,
      };
    });
  },
};
