import type { Request, Response } from 'express';
import { reportService } from '../services/report.service.js';
import type { FaultSeverity } from '../services/vessel.service.js';

const VALID_SEVERITIES: FaultSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export const reportController = {
  async ingestReport(req: Request, res: Response) {
    try {
      const { vesselId, severity = 'MEDIUM', faultSummary, extractedParts } = req.body;

      if (!vesselId || !Array.isArray(extractedParts) || extractedParts.length === 0) {
        return res.status(400).json({
          error: 'vesselId and a non-empty extractedParts array are required',
        });
      }

      if (!VALID_SEVERITIES.includes(severity)) {
        return res.status(400).json({
          error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}`,
        });
      }

      const result = await reportService.processFaultReport({
        vesselId: Number(vesselId),
        severity,
        faultSummary,
        extractedParts,
      });

      return res.status(201).json(result);
    } catch (error: any) {
      console.error('Failed to process fault report:', error);
      return res.status(500).json({
        error: error.message || 'Failed to process fault report',
      });
    }
  },
};