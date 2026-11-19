import type { Request, Response } from 'express';
import {
  vesselService,
  VesselIdentifierConflictError,
  type CreateVesselInput,
} from '../services/vessel.service.js';

const VESSEL_TYPES = ['CONTAINER', 'BULK_CARRIER', 'TANKER', 'GENERAL_CARGO'] as const;

type CreateVesselValidation =
  | { valid: true; value: CreateVesselInput }
  | { valid: false; message: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readCreateVesselInput(value: unknown): CreateVesselValidation {
  if (!isRecord(value)) {
    return { valid: false, message: 'Request body must be a JSON object containing vessel details.' };
  }

  const errors: string[] = [];
  const name = typeof value.name === 'string' ? value.name.trim() : '';
  const imo = typeof value.imo === 'string' ? value.imo.trim() : '';
  const mmsi = typeof value.mmsi === 'string' ? value.mmsi.trim() : '';
  const flagState = typeof value.flagState === 'string' ? value.flagState.trim().toUpperCase() : '';
  const vesselType = value.vesselType;
  const yearBuilt = value.yearBuilt;
  const dwt = value.dwt;
  const grossTonnage = value.grossTonnage;
  const lengthOverall = value.lengthOverall;
  const beam = value.beam;
  const maxDraught = value.maxDraught;

  if (!name) errors.push('Name is required.');
  else if (name.length > 120) errors.push('Name must be 120 characters or fewer.');
  if (!/^\d{7}$/.test(imo)) errors.push('IMO must contain exactly 7 digits.');
  if (!/^\d{9}$/.test(mmsi)) errors.push('MMSI must contain exactly 9 digits.');
  if (!/^[A-Z]{2}$/.test(flagState)) errors.push('Flag state must be a two-letter country code.');
  if (typeof vesselType !== 'string' || !VESSEL_TYPES.includes(vesselType as (typeof VESSEL_TYPES)[number])) {
    errors.push(`Vessel type must be one of: ${VESSEL_TYPES.join(', ')}.`);
  }

  const currentYear = new Date().getFullYear();
  if (!Number.isInteger(yearBuilt) || (yearBuilt as number) < 1800 || (yearBuilt as number) > currentYear) {
    errors.push(`Year built must be a whole year from 1800 through ${currentYear}.`);
  }

  for (const [field, fieldValue] of [['DWT', dwt], ['Gross tonnage', grossTonnage]] as const) {
    if (
      !Number.isSafeInteger(fieldValue) ||
      (fieldValue as number) <= 0 ||
      (fieldValue as number) > 2_147_483_647
    ) {
      errors.push(`${field} must be a positive whole number no greater than 2147483647.`);
    }
  }

  for (const [field, fieldValue] of [
    ['Length overall', lengthOverall],
    ['Beam', beam],
    ['Maximum draught', maxDraught],
  ] as const) {
    if (typeof fieldValue !== 'number' || !Number.isFinite(fieldValue) || fieldValue <= 0) {
      errors.push(`${field} must be a positive finite number of meters.`);
    }
  }

  if (errors.length > 0) {
    return { valid: false, message: `Invalid vessel details: ${errors.join(' ')}` };
  }

  return {
    valid: true,
    value: {
      name,
      imo,
      mmsi,
      flagState,
      vesselType: vesselType as CreateVesselInput['vesselType'],
      yearBuilt: yearBuilt as number,
      dwt: dwt as number,
      grossTonnage: grossTonnage as number,
      lengthOverall: lengthOverall as number,
      beam: beam as number,
      maxDraught: maxDraught as number,
    },
  };
}

export const vesselController = {
  // POST /api/v1/vessels
  async create(req: Request, res: Response) {
    const validation = readCreateVesselInput(req.body);
    if (!validation.valid) {
      return res.status(400).json({ success: false, message: validation.message });
    }

    try {
      const vessel = await vesselService.createVessel(validation.value);
      return res.status(201).json({ success: true, data: vessel });
    } catch (error) {
      if (error instanceof VesselIdentifierConflictError) {
        const conflicts = error.identifiers;
        const message = conflicts.length === 2
          ? 'Both IMO and MMSI are already registered to another vessel.'
          : `${conflicts[0]?.toUpperCase() ?? 'IMO or MMSI'} is already registered to another vessel.`;
        return res.status(409).json({ success: false, message, fields: conflicts });
      }

      console.error('Error in vesselController.create:', error);
      return res.status(500).json({
        success: false,
        message: 'Failed to create vessel.',
      });
    }
  },

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
