import type { CreateVesselInput } from '../src/services/vessel.service.js';

const demoVessels: CreateVesselInput[] = [
  {
    name: 'DEMO AEGEAN EXPRESS', imo: '0000103', mmsi: '000000103', flagState: 'GR',
    vesselType: 'CONTAINER', yearBuilt: 2021, dwt: 69_000, grossTonnage: 52_500,
    lengthOverall: 236, beam: 32.2, maxDraught: 12.6,
  },
  {
    name: 'DEMO PELAGOS LINE', imo: '0000115', mmsi: '000000115', flagState: 'GR',
    vesselType: 'CONTAINER', yearBuilt: 2019, dwt: 41_600, grossTonnage: 35_100,
    lengthOverall: 198, beam: 29.8, maxDraught: 10.4,
  },
  {
    name: 'DEMO IONIAN SPIRIT', imo: '0000206', mmsi: '000000206', flagState: 'GR',
    vesselType: 'TANKER', yearBuilt: 2018, dwt: 113_000, grossTonnage: 62_800,
    lengthOverall: 249, beam: 44, maxDraught: 14.8,
  },
  {
    name: 'DEMO NEREID STAR', imo: '0000218', mmsi: '000000218', flagState: 'GR',
    vesselType: 'TANKER', yearBuilt: 2020, dwt: 51_400, grossTonnage: 29_850,
    lengthOverall: 183, beam: 32.2, maxDraught: 12.2,
  },
  {
    name: 'DEMO CYCLADES TRADER', imo: '0000309', mmsi: '000000309', flagState: 'GR',
    vesselType: 'GENERAL_CARGO', yearBuilt: 2016, dwt: 12_600, grossTonnage: 8_800,
    lengthOverall: 137, beam: 20, maxDraught: 8.1,
  },
  {
    name: 'DEMO DODECANESE RUNNER', imo: '0000310', mmsi: '000000310', flagState: 'GR',
    vesselType: 'GENERAL_CARGO', yearBuilt: 2017, dwt: 8_850, grossTonnage: 6_650,
    lengthOverall: 115, beam: 18.5, maxDraught: 7.1,
  },
];

type FleetIdentity = Pick<CreateVesselInput, 'imo' | 'mmsi' | 'name' | 'vesselType'>;

async function main() {
  const port = Number(process.argv[2] ?? 3001);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) throw new Error('Expected a local API port.');
  const url = `http://127.0.0.1:${port}/api/v1/vessels`;
  const request = (init?: RequestInit) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(8_000) });

  const listing = await request();
  if (!listing.ok) throw new Error(`Could not read the local MPC fleet (${listing.status}).`);
  const payload = await listing.json() as { data?: FleetIdentity[] };
  if (!Array.isArray(payload.data)) throw new Error('The local API returned an invalid fleet listing.');
  const fleet = payload.data;

  const missing = demoVessels.filter((sample) => {
    const records = fleet.filter((vessel) => vessel.imo === sample.imo || vessel.mmsi === sample.mmsi);
    if (records.length === 0) return true;
    const [record] = records;
    if (records.length === 1 && record?.imo === sample.imo && record.mmsi === sample.mmsi &&
        record.name === sample.name && record.vesselType === sample.vesselType) return false;
    throw new Error(`Demo identifier conflict for ${sample.name}.`);
  });

  for (const sample of missing) {
    const response = await request({
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(sample),
    });
    if (!response.ok) throw new Error(`Could not add ${sample.name} (${response.status}).`);
  }
  console.log(`Demo vessels added: ${missing.length}. Already present: ${demoVessels.length - missing.length}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Could not populate the local demo fleet.');
  process.exitCode = 1;
});
