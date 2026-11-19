import { db } from '../../prisma/db.js';

export type FaultSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type VesselIdentifier = 'imo' | 'mmsi';
export type VesselType = 'CONTAINER' | 'BULK_CARRIER' | 'TANKER' | 'GENERAL_CARGO';

export interface CreateVesselInput {
  name: string;
  imo: string;
  mmsi: string;
  flagState: string;
  vesselType: VesselType;
  yearBuilt: number;
  dwt: number;
  grossTonnage: number;
  lengthOverall: number;
  beam: number;
  maxDraught: number;
}

export class VesselIdentifierConflictError extends Error {
  readonly identifiers: VesselIdentifier[];

  constructor(identifiers: VesselIdentifier[]) {
    super('A vessel with one or more of these identifiers already exists.');
    this.name = 'VesselIdentifierConflictError';
    this.identifiers = identifiers;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function getUniqueVesselIdentifiers(error: unknown): VesselIdentifier[] {
  const identifiers = new Set<VesselIdentifier>();
  const visited = new Set<object>();
  let candidate: unknown = error;

  for (let depth = 0; depth < 4 && isRecord(candidate) && !visited.has(candidate); depth += 1) {
    visited.add(candidate);

    // @prisma/adapter-better-sqlite3 maps SQLite unique errors to this cause shape.
    if (candidate.kind === 'UniqueConstraintViolation' && isRecord(candidate.constraint)) {
      const fields = candidate.constraint.fields;
      if (Array.isArray(fields)) {
        for (const field of fields) {
          if (field === 'imo' || field === 'mmsi') identifiers.add(field);
        }
      }
    }

    // Keep compatibility with Prisma's standard known-request error shape too.
    if (candidate.code === 'P2002' && isRecord(candidate.meta)) {
      const target = candidate.meta.target;
      const fields = Array.isArray(target) ? target : typeof target === 'string' ? [target] : [];
      for (const field of fields) {
        if (field === 'imo' || field === 'mmsi') identifiers.add(field);
      }
    }

    candidate = candidate.cause;
  }

  return [...identifiers];
}

const SEVERITY_PENALTY: Record<FaultSeverity, number> = {
  LOW: 4,
  MEDIUM: 10,
  HIGH: 18,
  CRITICAL: 28,
};

export function calculateFaultDamage(previousHealth: number, severity: FaultSeverity, partCount: number) {
  const penalty = SEVERITY_PENALTY[severity] + partCount * 2;
  const newHealth = Math.max(0, Math.min(100, previousHealth - penalty));
  return { previousHealth, newHealth, penalty };
}

type VesselTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]['orm']['Vessel'];

export async function applyFaultDamage(vessels: VesselTransaction, vesselId: number, severity: FaultSeverity, partCount: number) {
  const selection = vessels.where((row) => row.id.eq(vesselId));
  const vessel = await selection.first();
  if (!vessel) throw new Error(`Vessel with ID ${vesselId} not found`);

  const damage = calculateFaultDamage(vessel.health, severity, partCount);
  const updatedVessel = await selection.update({
    health: damage.newHealth,
    operationalStatus: damage.newHealth < 70 ? 'MAINTENANCE_REQUIRED' : vessel.operationalStatus,
  });
  if (!updatedVessel) throw new Error(`Vessel with ID ${vesselId} not found`);

  return { vessel: updatedVessel, ...damage };
}

export const vesselService = {
  // Fetch all vessels, ordered alphabetically by name
  async getAllVessels() {
    return db.orm.Vessel.orderBy((v) => v.name.asc()).all();
  },

  // Fetch a single vessel by its primary ID
  async getVesselById(id: number) {
    return db.orm.Vessel.where((v) => v.id.eq(id)).first();
  },

  async getVesselByImo(imo: string) {
    return db.orm.Vessel.where((v) => v.imo.eq(imo)).first();
  },

  async getVesselByMmsi(mmsi: string) {
    return db.orm.Vessel.where((v) => v.mmsi.eq(mmsi)).first();
  },

  async createVessel(input: CreateVesselInput) {
    const [existingImo, existingMmsi] = await Promise.all([
      this.getVesselByImo(input.imo),
      this.getVesselByMmsi(input.mmsi),
    ]);
    const existingIdentifiers: VesselIdentifier[] = [];
    if (existingImo) existingIdentifiers.push('imo');
    if (existingMmsi) existingIdentifiers.push('mmsi');
    if (existingIdentifiers.length > 0) {
      throw new VesselIdentifierConflictError(existingIdentifiers);
    }

    try {
      // Deliberately omit optional telemetry, position, and voyage fields so schema defaults apply.
      return await db.orm.Vessel.create(input);
    } catch (error) {
      const conflictingIdentifiers = getUniqueVesselIdentifiers(error);
      if (conflictingIdentifiers.length > 0) {
        throw new VesselIdentifierConflictError(conflictingIdentifiers);
      }
      throw error;
    }
  },

};
