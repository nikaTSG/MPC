import type { Request, Response } from 'express';
import { vesselService } from '../services/vessel.service.js';

export const vesselController = {
  // GET /api/vessels
  async getAll(req: Request, res: Response) {
    try {
      const vessels = await vesselService.getAllVessels();
      return res.status(200).json({
        success: true,
        count: vessels.length,
        data: vessels,
      });
    } catch (error) {
      console.error('Error in vesselController.getAll:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve fleet vessels.',
      });
    }
  },

  // GET /api/vessels/:id
  async getById(req: Request, res: Response) {
    try {
      const id = Number(req.params.id);

      if (Number.isNaN(id) || id <= 0) {
        return res.status(400).json({
          success: false,
          message: 'Invalid vessel ID. Expected a positive integer.',
        });
      }

      const vessel = await vesselService.getVesselById(id);

      if (!vessel) {
        return res.status(404).json({
          success: false,
          message: `Vessel with ID ${id} not found.`,
        });
      }

      return res.status(200).json({
        success: true,
        data: vessel,
      });
    } catch (error) {
      console.error('Error in vesselController.getById:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to retrieve vessel details.',
      });
    }
  },
};