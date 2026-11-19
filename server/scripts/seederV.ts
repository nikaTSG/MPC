import { db } from "../prisma/db.js";

const missingVesselDetails = [
  {
    imo: "0000103", // DEMO AEGEAN EXPRESS (CONTAINER)
    destinationPortCode: "GRPIR",
    eta: new Date(Date.now() + 4 * 60 * 60 * 1000),
    callSign: "SVAE1",
    classSociety: "DNV",
    builder: "Hyundai Samho Heavy Industries",
    mainEngineModel: "HYUNDAI-MAN B&W 6G70ME-C9.5",
    teuCapacity: 4250,
  },
  {
    imo: "0000115", // DEMO PELAGOS LINE (CONTAINER)
    destinationPortCode: "EGSUZ",
    eta: new Date(Date.now() + 24 * 60 * 60 * 1000),
    callSign: "SVPL2",
    classSociety: "LR",
    builder: "Samsung Heavy Industries",
    mainEngineModel: "WinGD 7X72",
    teuCapacity: 5500,
  },
  {
    imo: "0000206", // DEMO IONIAN SPIRIT (TANKER)
    destinationPortCode: "NLRTM",
    eta: new Date(Date.now() + 18 * 60 * 60 * 1000),
    callSign: "SVIS3",
    classSociety: "ABS",
    builder: "Daewoo Shipbuilding & Marine Engineering",
    mainEngineModel: "MAN B&W 6G60ME-C9.5",
  },
  {
    imo: "0000218", // DEMO NEREID STAR (TANKER)
    destinationPortCode: "ROCND",
    eta: new Date(Date.now() + 10 * 60 * 60 * 1000),
    callSign: "SVNS4",
    classSociety: "BV",
    builder: "STX Offshore & Shipbuilding",
    mainEngineModel: "MAN B&W 6S50ME-B9.3",
  },
  {
    imo: "0000309", // DEMO CYCLADES TRADER (GENERAL_CARGO)
    destinationPortCode: "GRTHE",
    eta: new Date(Date.now() + 12 * 60 * 60 * 1000),
    callSign: "SVCT5",
    classSociety: "DNV",
    builder: "Oshima Shipbuilding",
    mainEngineModel: "Mitsui-MAN B&W 5S50ME-B9.3",
  },
  {
    imo: "0000310", // DEMO DODECANESE RUNNER (GENERAL_CARGO)
    destinationPortCode: "GRPIR",
    eta: new Date(Date.now() + 8 * 60 * 60 * 1000),
    callSign: "SVDR6",
    classSociety: "LR",
    builder: "Imabari Shipbuilding",
    mainEngineModel: "Makita-MAN B&W 6S42MC7",
  },
];

async function main() {
  console.log("Filling missing fields on existing vessels...");

  for (const { imo, ...missingFields } of missingVesselDetails) {
    await db.orm.Vessel.where({ imo }).update(missingFields);
  }

  console.log(`Done. Updated ${missingVesselDetails.length} existing vessel(s).`);
}

main().catch((err) => {
  console.error("Failed to update vessels:", err);
  process.exit(1);
});