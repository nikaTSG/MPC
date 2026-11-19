import { db } from '../../prisma/db.js';
import { calculateFaultDamage, type FaultSeverity } from './vessel.service.js';
import { orderService, type ExtractedPartInput } from './order.service.js';
import type { AiCredentials } from '../integrations/ai/aiProvider.js';

export interface IncomingFaultReport {
  vesselId: number;
  severity: FaultSeverity;
  faultSummary?: string;
  extractedParts: ExtractedPartInput[];
}

export const reportService = {
  async processFaultReport(input: IncomingFaultReport, credentials: AiCredentials) {
    // Resolve the model output before opening a write transaction. A rejected
    // key or failed provider request therefore changes no database state.
    const prepared = await orderService.prepareDraftsFromReport(
      input.vesselId,
      input.extractedParts,
      credentials,
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

      const draftedOrders = await orderService.persistPreparedDrafts(
        prepared,
        (order) => tx.orm.Order.create(order),
        updatedVessel,
      );

      return {
        healthUpdate: { vessel: updatedVessel, ...damage },
        draftedOrders,
      };
    });
  },
};
