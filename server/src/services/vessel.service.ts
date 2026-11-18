import { db } from '../../prisma/db.js';

export type FaultSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

const SEVERITY_PENALTY: Record<FaultSeverity, number> = {
  LOW: 4,
  MEDIUM: 10,
  HIGH: 18,
  CRITICAL: 28,
};

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

  // Apply deterministic health degradation from an incoming fault report
  async applyFaultDamage(
    vesselId: number,
    severity: FaultSeverity,
    partCount: number
  ) {
    const vessel = await this.getVesselById(vesselId);

    if (!vessel) {
      throw new Error(`Vessel with ID ${vesselId} not found`);
    }

    const penalty = SEVERITY_PENALTY[severity] + partCount * 2;
    const previousHealth = vessel.health;
    const newHealth = Math.max(0, Math.min(100, previousHealth - penalty));

    const updatedVessel = await db.orm.Vessel
      .where((v) => v.id.eq(vesselId))
      .update({
        health: newHealth,
        operationalStatus:
          newHealth < 70 ? 'MAINTENANCE_REQUIRED' : vessel.operationalStatus,
      });

    return {
      vessel: updatedVessel,
      previousHealth,
      newHealth,
      penalty,
    };
  },
};