import { vesselService, type FaultSeverity } from './vessel.service.js';
import { orderService, type ExtractedPartInput } from './order.service.js';

export interface IncomingFaultReport {
  vesselId: number;
  severity: FaultSeverity;
  faultSummary?: string;
  extractedParts: ExtractedPartInput[];
}

export const reportService = {
  async processFaultReport(input: IncomingFaultReport) {
    // 1. Apply deterministic health penalty to the vessel
    const healthUpdate = await vesselService.applyFaultDamage(
      input.vesselId,
      input.severity,
      input.extractedParts.length
    );

    // 2. Reuse your existing AI procurement pipeline to draft supplier RFQs
    const draftedOrders = await orderService.generateDraftsFromReport(
      input.vesselId,
      input.extractedParts
    );

    return {
      healthUpdate,
      draftedOrders,
    };
  },
};