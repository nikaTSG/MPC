import type { Vessel } from '../api/mpcApi';
import { computeMaritimeRoute, distanceNm, estimateRepairApproach, MARITIME_PORTS, type RepairApproach } from './seaRouter';

const HOUR_MS = 3_600_000;
const DEMO_OPEN_HOUR_UTC = 8;
const DEMO_CLOSE_HOUR_UTC = 18;
export const DEMO_BERTH_HOURS = '08:00–18:00 UTC daily';

export function estimatePortCall(vessel: Vessel, now: number) {
  const port = MARITIME_PORTS[vessel.destinationPortCode?.toUpperCase() ?? ''] ?? null;
  if (!port) return null;

  const route = computeMaritimeRoute(vessel);
  return { port, ...estimatePortTiming(vessel, now, route.destinationPort ? route.remainingNm : null) };
}

export function estimatePortTiming(vessel: Vessel, now: number, remainingNm: number | null) {
  const speed = vessel.speedKnots;
  const travelMs = remainingNm !== null && remainingNm > 0 && speed !== null && speed > 0
    ? remainingNm / speed * HOUR_MS
    : NaN;
  const arrival = new Date(now + travelMs);
  const arrivalMs = arrival.getTime();
  const estimatedArrivalUtc = Number.isFinite(arrivalMs) ? arrival.toISOString() : null;
  const opening = new Date(arrivalMs);
  opening.setUTCHours(DEMO_OPEN_HOUR_UTC, 0, 0, 0);
  if (arrival.getUTCHours() >= DEMO_CLOSE_HOUR_UTC) {
    opening.setUTCDate(opening.getUTCDate() + 1);
  }
  const demoWaitMinutes = estimatedArrivalUtc
    ? Math.ceil(Math.max(0, opening.getTime() - arrivalMs) / 60_000)
    : null;

  return {
    remainingNm,
    estimatedArrivalUtc,
    reportedArrivalUtc: vessel.eta,
    demoWaitMinutes,
    demoBerthTimeUtc: estimatedArrivalUtc ? new Date(Math.max(arrivalMs, opening.getTime())).toISOString() : null,
  };
}

export const MARINE_WEATHER_SOURCE = 'https://open-meteo.com/en/docs/marine-weather-api';

export interface MarineConditions {
  forecastTimeUtc: string;
  waveHeightM: number;
  wavePeriodSeconds: number | null;
}

export async function getMarineConditions(coords: [number, number], signal: AbortSignal): Promise<MarineConditions> {
  const query = new URLSearchParams({
    latitude: String(coords[0]),
    longitude: String(coords[1]),
    current: 'wave_height,wave_period',
    timezone: 'GMT',
    timeformat: 'unixtime',
  });
  const response = await fetch(`https://marine-api.open-meteo.com/v1/marine?${query}`, { signal });
  if (!response.ok) throw new Error('Marine forecast unavailable');
  const { current } = await response.json();
  const forecastTime = new Date(Number.isFinite(current?.time) ? current.time * 1_000 : NaN);
  if (!Number.isFinite(forecastTime.getTime()) || !Number.isFinite(current?.wave_height)) {
    throw new Error('Marine forecast unavailable');
  }
  return {
    forecastTimeUtc: forecastTime.toISOString(),
    waveHeightM: current.wave_height,
    wavePeriodSeconds: Number.isFinite(current.wave_period) ? current.wave_period : null,
  };
}

export const WORLD_PORT_SOURCE = 'https://fgmod.nga.mil/apps/WPI-Viewer/';
const WORLD_PORT_QUERY = 'https://gis.unocha.org/server/rest/services/Hosted/global_world_seaport_index_202511/FeatureServer/0/query';
const PORT_PAGE_SIZE = 1000;

export interface WorldPort {
  id: number;
  name: string;
  country: string;
  coords: [number, number];
}

let worldPorts: WorldPort[] | undefined;

function portCoordinates(latitude: unknown, longitude: unknown): [number, number] | null {
  return typeof latitude === 'number' && Math.abs(latitude) <= 90 &&
    typeof longitude === 'number' && Math.abs(longitude) <= 180
    ? [latitude, longitude] : null;
}

export async function getWorldPorts(signal: AbortSignal): Promise<WorldPort[]> {
  if (worldPorts) return worldPorts;
  const records = new Map<number, WorldPort>();

  for (let offset = 0; offset < 10_000; offset += PORT_PAGE_SIZE) {
    const query = new URLSearchParams({
      where: '1=1',
      outFields: 'objectid,port_name,country,latitude,longitude',
      outSR: '4326',
      orderByFields: 'objectid',
      resultOffset: String(offset),
      resultRecordCount: String(PORT_PAGE_SIZE),
      f: 'json',
    });
    const response = await fetch(`${WORLD_PORT_QUERY}?${query}`, { signal });
    if (!response.ok) break;
    const data = await response.json();
    if (!Array.isArray(data.features)) break;
    for (const feature of data.features) {
      const { attributes, geometry } = feature ?? {};
      const coords = portCoordinates(geometry?.y, geometry?.x) ??
        portCoordinates(attributes?.latitude, attributes?.longitude);
      if (!Number.isInteger(attributes?.objectid) || typeof attributes?.port_name !== 'string' || !coords) continue;
      records.set(attributes.objectid, {
        id: attributes.objectid,
        name: attributes.port_name,
        country: typeof attributes.country === 'string' ? attributes.country : '',
        coords,
      });
    }
    if (data.exceededTransferLimit !== true && data.features.length < PORT_PAGE_SIZE && records.size > 0) {
      worldPorts = [...records.values()];
      return worldPorts;
    }
    if (data.features.length !== PORT_PAGE_SIZE) break;
  }
  throw new Error('Worldwide port directory unavailable');
}

export const REPAIR_PORT_SOURCE = 'https://arcgis.netl.doe.gov/server/rest/services/Hosted/CCS_EJ_SJ_Data/FeatureServer/17';
export const REPAIR_PORT_RADIUS_NM = 500;
const REPAIR_SERVICES = ['Major', 'Moderate', 'Limited', 'Emergency Only'] as const;
const REPAIR_PAGE_SIZE = 2000;

export interface RepairPort extends WorldPort {
  code: string | null;
  repairService: typeof REPAIR_SERVICES[number];
  maxLoa: number | null;
  maxBeam: number | null;
  maxDraught: number | null;
}

export interface NearbyRepairPort extends RepairPort {
  distanceNm: number;
}

let repairPorts: RepairPort[] | undefined;

function publishedMetres(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  // The service stores decimal metres as floats (for example, 20.2 becomes 20.20000076).
  return Math.round(value * 1000) / 1000;
}

export async function getRepairPorts(signal: AbortSignal): Promise<RepairPort[]> {
  if (repairPorts) return repairPorts;
  const records = new Map<number, RepairPort>();
  const query = new URLSearchParams({
    where: `repair_code IN (${REPAIR_SERVICES.map(service => `'${service}'`).join(',')})`,
    outFields: 'objectid,main_port_name,wpi_cc,unlocode,repair_code,maxvessellength,maxvesselbeam,maxvesseldraft',
    outSR: '4326',
    orderByFields: 'objectid',
    resultRecordCount: String(REPAIR_PAGE_SIZE),
    f: 'json',
  });
  for (let offset = 0; ; ) {
    query.set('resultOffset', String(offset));
    const response = await fetch(`${REPAIR_PORT_SOURCE}/query?${query}`, { signal });
    if (!response.ok) break;
    const data = await response.json();
    if (!Array.isArray(data.features)) break;
    const previousCount = records.size;
    for (const feature of data.features) {
      const { attributes, geometry } = feature ?? {};
      const coords = portCoordinates(geometry?.y, geometry?.x);
      const repairService = REPAIR_SERVICES.find(service => service === attributes?.repair_code);
      if (!coords || !repairService || !Number.isInteger(attributes.objectid) ||
          typeof attributes.main_port_name !== 'string' || !attributes.main_port_name.trim()) continue;
      const code = typeof attributes.unlocode === 'string' ? attributes.unlocode.replace(/\s+/g, '').toUpperCase() : '';
      records.set(attributes.objectid, {
        id: attributes.objectid,
        name: attributes.main_port_name.trim(),
        country: typeof attributes.wpi_cc === 'string' ? attributes.wpi_cc : '',
        coords,
        code: /^[A-Z]{2}[A-Z0-9]{3}$/.test(code) ? code : null,
        repairService,
        maxLoa: publishedMetres(attributes.maxvessellength),
        maxBeam: publishedMetres(attributes.maxvesselbeam),
        maxDraught: publishedMetres(attributes.maxvesseldraft),
      });
    }
    if (data.exceededTransferLimit !== true && data.features.length < REPAIR_PAGE_SIZE) {
      if (!records.size) break;
      repairPorts = [...records.values()];
      return repairPorts;
    }
    if (records.size === previousCount) break;
    offset += data.features.length;
  }
  throw new Error('Repair port directory unavailable');
}

export function findNearbyRepairPorts(vessel: Vessel, ports: RepairPort[], limit = 3) {
  const fits: NearbyRepairPort[] = [];
  const needsConfirmation: NearbyRepairPort[] = [];
  const origin = portCoordinates(vessel.latitude, vessel.longitude);
  if (origin) {
    for (const port of ports) {
      const distance = distanceNm(origin, port.coords);
      if (!Number.isFinite(distance) || distance > REPAIR_PORT_RADIUS_NM) continue;
      const dimensions = [
        [vessel.lengthOverall, port.maxLoa],
        [vessel.beam, port.maxBeam],
        [vessel.maxDraught, port.maxDraught],
      ] as const;
      if (dimensions.some(([required, limit]) => limit !== null && required > limit)) continue;
      const verified = dimensions.every(([required, limit]) => Number.isFinite(required) && required > 0 && limit !== null);
      const group = verified ? fits : needsConfirmation;
      group.push({ ...port, distanceNm: distance });
    }
  }
  const nearest = (a: NearbyRepairPort, b: NearbyRepairPort) => a.distanceNm - b.distanceNm || a.id - b.id;
  return { fits: fits.sort(nearest).slice(0, limit), needsConfirmation: needsConfirmation.sort(nearest).slice(0, limit) };
}

interface AutomaticRepairPort {
  port: NearbyRepairPort;
  route: RepairApproach | null;
  failed: boolean;
}

// The RFQ and the map share the most recent completed calculation. A change
// to the directory, ship position or fit constraints requires a fresh choice.
let lastAutomatic: { ports: RepairPort[]; key: string; result: AutomaticRepairPort } | undefined;

export async function resolveAutomaticRepairPort(vessel: Vessel, ports: RepairPort[], signal: AbortSignal): Promise<AutomaticRepairPort | null> {
  signal.throwIfAborted();
  const origin = portCoordinates(vessel.latitude, vessel.longitude);
  if (!origin) return null;
  const key = JSON.stringify([origin, vessel.lengthOverall, vessel.beam, vessel.maxDraught]);
  if (lastAutomatic?.ports === ports && lastAutomatic.key === key) return lastAutomatic.result;
  const { fits } = findNearbyRepairPorts(vessel, ports, Infinity);
  if (!fits.length) return null;
  let result: AutomaticRepairPort = { port: fits[0], route: null, failed: false };
  try {
    for (const port of fits) {
      const route = await estimateRepairApproach(origin, port.coords, signal);
      signal.throwIfAborted();
      if (route) {
        result = { port, route, failed: false };
        break;
      }
    }
  } catch {
    signal.throwIfAborted();
    // A missing coastline affects every candidate. Keep the nearest confirmed
    // fit available to Procurement and leave the map able to retry.
    return { ...result, failed: true };
  }
  lastAutomatic = { ports, key, result };
  return result;
}
