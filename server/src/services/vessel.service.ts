import { db } from '../../prisma/db.js';

export const vesselService = {
  // Fetch all vessels, ordered alphabetically by name
  async getAllVessels() {
    return db.orm.Vessel.orderBy((v) => v.name.asc()).all();
  },

  // Fetch a single vessel by its primary ID
  async getVesselById(id: number) {
    return db.orm.Vessel.where((v) => v.id.eq(id)).first();
  },

  // Fetch a single vessel by its unique maritime IMO number
  async getVesselByImo(imo: string) {
    return db.orm.Vessel.where((v) => v.imo.eq(imo)).first();
  },
};