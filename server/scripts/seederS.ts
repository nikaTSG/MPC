import { db } from '../prisma/db.js';

interface SupplierSeed {
  name: string;
  email: string;
  portLocation: string;
  parts: {
    partNumber: string;
    partName: string;
    category: 'PROPULSION' | 'HYDRAULICS' | 'ELECTRONICS' | 'AUXILIARY' | 'SAFETY';
  }[];
}

const SUPPLIERS: SupplierSeed[] = [
  {
    name: 'Wärtsilä Hellas Marine Services',
    email: 'rfq.piraeus@wartsila-hellas-demo.gr',
    portLocation: 'Piraeus',
    parts: [
      { partNumber: 'W-FIV-992', partName: 'Main Engine Fuel Injection Valve', category: 'PROPULSION' },
      { partNumber: 'W-CYL-410', partName: 'Cylinder Liner Sealing Ring Kit', category: 'PROPULSION' },
      { partNumber: 'W-TCB-118', partName: 'Turbocharger Cartridge Bearing Assembly', category: 'PROPULSION' },
      { partNumber: 'W-LUB-305', partName: 'High-Pressure Lube Oil Pump', category: 'AUXILIARY' },
    ],
  },
  {
    name: 'Aegean Marine Hydraulics & Deck Co.',
    email: 'orders@aegean-hydraulics-demo.gr',
    portLocation: 'Piraeus',
    parts: [
      { partNumber: 'HYD-SG-880', partName: 'Steering Gear Hydraulic Actuator Cylinder', category: 'HYDRAULICS' },
      { partNumber: 'HYD-HC-214', partName: 'Hatch Cover High-Pressure Hose Assembly', category: 'HYDRAULICS' },
      { partNumber: 'HYD-WM-502', partName: 'Mooring Winch Proportional Control Valve', category: 'HYDRAULICS' },
      { partNumber: 'HYD-SL-099', partName: 'Viton Hydraulic Seal & O-Ring Master Kit', category: 'HYDRAULICS' },
    ],
  },
  {
    name: 'Suez Canal Technical Supply & Spares',
    email: 'procurement@suez-maritime-demo.eg',
    portLocation: 'Port Said',
    parts: [
      { partNumber: 'AUX-FWG-710', partName: 'Fresh Water Generator Titanium Plate Pack', category: 'AUXILIARY' },
      { partNumber: 'AUX-BFP-330', partName: 'Ballast Water Treatment UV Lamp & Sensor', category: 'AUXILIARY' },
      { partNumber: 'SAF-FFA-104', partName: 'Engine Room CO2 Release Solenoid Valve', category: 'SAFETY' },
    ],
  },
  {
    name: 'Furuno & Kongsberg NavCom Asia',
    email: 'spares.sg@navcom-asia-demo.sg',
    portLocation: 'Singapore',
    parts: [
      { partNumber: 'NAV-XBR-900', partName: 'X-Band Radar Magnetron & Transceiver Unit', category: 'ELECTRONICS' },
      { partNumber: 'NAV-EC-442', partName: 'ECDIS Main Processor & Dual Display Module', category: 'ELECTRONICS' },
      { partNumber: 'NAV-GYR-210', partName: 'Fiber-Optic Gyrocompass Heading Sensor', category: 'ELECTRONICS' },
      { partNumber: 'NAV-AIS-115', partName: 'Class-A AIS Transponder GPS Antenna', category: 'ELECTRONICS' },
    ],
  },
  {
    name: 'Jurong Marine Propulsion & Heavy Spares',
    email: 'rfq@jurong-heavy-demo.sg',
    portLocation: 'Singapore',
    parts: [
      // Intentional overlap with Piraeus so the AI chooses based on vessel route/next port
      { partNumber: 'W-FIV-992', partName: 'Main Engine Fuel Injection Valve', category: 'PROPULSION' },
      { partNumber: 'MAN-EXV-620', partName: 'Exhaust Valve Spindle & Seat Assembly', category: 'PROPULSION' },
      { partNumber: 'MAN-JWC-408', partName: 'Jacket Water Cooling Thermostat Valve', category: 'AUXILIARY' },
      { partNumber: 'HYD-SG-880', partName: 'Steering Gear Hydraulic Actuator Cylinder', category: 'HYDRAULICS' },
    ],
  },
];

export async function seedSuppliers() {
  console.log('Seeding maritime suppliers...');

  for (const supplier of SUPPLIERS) {
    const existing = await db.orm.Supplier
      .where((s) => s.email.eq(supplier.email))
      .first();

    if (existing) {
      await db.orm.Supplier
        .where((s) => s.id.eq(existing.id))
        .update({
          name: supplier.name,
          portLocation: supplier.portLocation,
          parts: supplier.parts,
        });
    } else {
      await db.orm.Supplier.create({
        name: supplier.name,
        email: supplier.email,
        portLocation: supplier.portLocation,
        parts: supplier.parts,
      });
    }
  }

  console.log(`Seeded ${SUPPLIERS.length} verified suppliers.`);
}

async function main() {
  console.log("Seeding maritime suppliers...");

  const inserted = await db.orm.Supplier.createAll(SUPPLIERS, {
    onConflict: "skip",
    conflictOn: ["email"],
  });

  console.log(`Seed complete. Inserted ${inserted.length} new supplier(s).`);
}

main().catch((err) => {
  console.error("Failed to seed suppliers:", err);
  process.exit(1);
});