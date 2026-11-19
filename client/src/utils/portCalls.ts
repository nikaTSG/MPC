import type { Vessel } from '../api/mpcApi';
import { computeMaritimeRoute, MARITIME_PORTS } from './seaRouter';

const HOUR_MS = 3_600_000;
const DEMO_OPEN_HOUR_UTC = 8;
const DEMO_CLOSE_HOUR_UTC = 18;
export const DEMO_BERTH_HOURS = '08:00–18:00 UTC daily';

export function estimatePortCall(vessel: Vessel, now: number) {
  const port = MARITIME_PORTS[vessel.destinationPortCode?.toUpperCase() ?? ''] ?? null;
  if (!port) return null;

  const route = computeMaritimeRoute(vessel);
  const speed = vessel.speedKnots;
  const travelMs = route.destinationPort && route.remainingNm > 0 && speed !== null && speed > 0
    ? route.remainingNm / speed * HOUR_MS
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
    port,
    remainingNm: route.destinationPort ? route.remainingNm : null,
    estimatedArrivalUtc,
    reportedArrivalUtc: vessel.eta,
    fitsPublishedDemoLimits: vessel.maxDraught <= port.maxDraught && vessel.lengthOverall <= port.maxLoa,
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

export async function getWorldPorts(signal: AbortSignal): Promise<WorldPort[]> {
  if (worldPorts) return worldPorts;
  const records = new Map<number, WorldPort>();

  for (let offset = 0; offset < 10_000; offset += PORT_PAGE_SIZE) {
    const query = new URLSearchParams({
      where: '1=1',
      outFields: 'objectid,port_name,country',
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
      if (!Number.isInteger(attributes?.objectid) || typeof attributes?.port_name !== 'string' ||
          !Number.isFinite(geometry?.y) || Math.abs(geometry.y) > 90 ||
          !Number.isFinite(geometry?.x) || Math.abs(geometry.x) > 180) continue;
      records.set(attributes.objectid, {
        id: attributes.objectid,
        name: attributes.port_name,
        country: typeof attributes.country === 'string' ? attributes.country : '',
        coords: [geometry.y, geometry.x],
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
