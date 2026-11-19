import type { Vessel } from '../api/mpcApi';

export interface MaritimePort {
  code: string; // UN/LOCODE matching Vessel.destinationPortCode
  name: string;
  country: string;
  coords: [number, number];
}

interface SeaNode {
  id: string;
  coords: [number, number];
  port?: MaritimePort;
}

export const MARITIME_PORTS: Record<string, MaritimePort> = {
  NLRTM: { code: 'NLRTM', name: 'Port of Rotterdam', country: 'NL', coords: [51.95, 4.14] },
  ESALG: { code: 'ESALG', name: 'Port of Algeciras', country: 'ES', coords: [36.13, -5.43] },
  GRPIR: { code: 'GRPIR', name: 'Port of Piraeus', country: 'GR', coords: [37.94, 23.64] },
  EGPSD: { code: 'EGPSD', name: 'Port Said (Suez North)', country: 'EG', coords: [31.26, 32.31] },
  SAJED: { code: 'SAJED', name: 'Jeddah Islamic Port', country: 'SA', coords: [21.48, 39.15] },
  AEJEA: { code: 'AEJEA', name: 'Jebel Ali / Dubai', country: 'AE', coords: [25.01, 55.06] },
  INBOM: { code: 'INBOM', name: 'Mumbai / Nhava Sheva', country: 'IN', coords: [18.95, 72.95] },
  LKCMB: { code: 'LKCMB', name: 'Port of Colombo', country: 'LK', coords: [6.94, 79.84] },
  MYPKG: { code: 'MYPKG', name: 'Port Klang', country: 'MY', coords: [3.00, 101.39] },
  SGSIN: { code: 'SGSIN', name: 'Port of Singapore', country: 'SG', coords: [1.26, 103.82] },
  HKHKG: { code: 'HKHKG', name: 'Port of Hong Kong', country: 'HK', coords: [22.33, 114.13] },
  CNSHA: { code: 'CNSHA', name: 'Port of Shanghai', country: 'CN', coords: [31.23, 121.49] },
  JPTYO: { code: 'JPTYO', name: 'Port of Tokyo', country: 'JP', coords: [35.45, 139.65] },
};

// Open-water waypoints + port nodes so routes never cross land
const SEA_NODES: Record<string, SeaNode> = {
  NLRTM: { id: 'NLRTM', coords: MARITIME_PORTS.NLRTM.coords, port: MARITIME_PORTS.NLRTM },
  WP_ENGLISH_CH: { id: 'WP_ENGLISH_CH', coords: [50.10, -1.50] },
  WP_BISCAY: { id: 'WP_BISCAY', coords: [45.50, -8.50] },
  WP_ST_VINCENT: { id: 'WP_ST_VINCENT', coords: [36.80, -9.30] },
  WP_GIBRALTAR: { id: 'WP_GIBRALTAR', coords: [35.96, -5.60] },
  ESALG: { id: 'ESALG', coords: MARITIME_PORTS.ESALG.coords, port: MARITIME_PORTS.ESALG },
  WP_ALBORAN: { id: 'WP_ALBORAN', coords: [36.20, -2.00] },
  WP_SICILY_CH: { id: 'WP_SICILY_CH', coords: [37.20, 11.50] },
  WP_IONIAN: { id: 'WP_IONIAN', coords: [36.00, 18.50] },
  WP_CRETE_S: { id: 'WP_CRETE_S', coords: [34.50, 24.50] },
  WP_AEGEAN_S: { id: 'WP_AEGEAN_S', coords: [36.70, 24.10] },
  GRPIR: { id: 'GRPIR', coords: MARITIME_PORTS.GRPIR.coords, port: MARITIME_PORTS.GRPIR },
  WP_LEV_SEA: { id: 'WP_LEV_SEA', coords: [33.00, 29.50] },
  WP_SUEZ_N: { id: 'WP_SUEZ_N', coords: [31.45, 32.35] },
  EGPSD: { id: 'EGPSD', coords: MARITIME_PORTS.EGPSD.coords, port: MARITIME_PORTS.EGPSD },
  WP_SUEZ_S: { id: 'WP_SUEZ_S', coords: [29.80, 32.58] },
  WP_RED_SEA_N: { id: 'WP_RED_SEA_N', coords: [27.20, 34.50] },
  WP_RED_SEA_MID: { id: 'WP_RED_SEA_MID', coords: [21.50, 38.20] },
  SAJED: { id: 'SAJED', coords: MARITIME_PORTS.SAJED.coords, port: MARITIME_PORTS.SAJED },
  WP_RED_SEA_S: { id: 'WP_RED_SEA_S', coords: [15.50, 41.80] },
  WP_BAB_EL_MANDEB: { id: 'WP_BAB_EL_MANDEB', coords: [12.58, 43.33] },
  WP_GULF_ADEN: { id: 'WP_GULF_ADEN', coords: [12.20, 49.00] },
  WP_SOCOTRA_N: { id: 'WP_SOCOTRA_N', coords: [13.50, 54.50] },
  WP_GULF_OMAN: { id: 'WP_GULF_OMAN', coords: [24.50, 58.50] },
  WP_HORMUZ: { id: 'WP_HORMUZ', coords: [26.56, 56.25] },
  AEJEA: { id: 'AEJEA', coords: MARITIME_PORTS.AEJEA.coords, port: MARITIME_PORTS.AEJEA },
  WP_ARABIAN_SEA: { id: 'WP_ARABIAN_SEA', coords: [18.50, 64.50] },
  INBOM: { id: 'INBOM', coords: MARITIME_PORTS.INBOM.coords, port: MARITIME_PORTS.INBOM },
  WP_INDIA_W: { id: 'WP_INDIA_W', coords: [13.00, 73.00] },
  WP_INDIA_SW: { id: 'WP_INDIA_SW', coords: [7.80, 76.80] },
  LKCMB: { id: 'LKCMB', coords: MARITIME_PORTS.LKCMB.coords, port: MARITIME_PORTS.LKCMB },
  WP_SRI_LANKA_S: { id: 'WP_SRI_LANKA_S', coords: [5.60, 80.60] },
  WP_BAY_BENGAL_S: { id: 'WP_BAY_BENGAL_S', coords: [5.80, 88.50] },
  WP_MALACCA_N: { id: 'WP_MALACCA_N', coords: [5.60, 96.50] },
  WP_MALACCA_MID: { id: 'WP_MALACCA_MID', coords: [3.20, 100.80] },
  MYPKG: { id: 'MYPKG', coords: MARITIME_PORTS.MYPKG.coords, port: MARITIME_PORTS.MYPKG },
  WP_MALACCA_S: { id: 'WP_MALACCA_S', coords: [1.70, 102.70] },
  WP_SINGAPORE_STR: { id: 'WP_SINGAPORE_STR', coords: [1.15, 103.82] },
  SGSIN: { id: 'SGSIN', coords: MARITIME_PORTS.SGSIN.coords, port: MARITIME_PORTS.SGSIN },
  WP_SOUTH_CHINA_S: { id: 'WP_SOUTH_CHINA_S', coords: [6.50, 108.50] },
  WP_SOUTH_CHINA_MID: { id: 'WP_SOUTH_CHINA_MID', coords: [14.50, 113.00] },
  HKHKG: { id: 'HKHKG', coords: MARITIME_PORTS.HKHKG.coords, port: MARITIME_PORTS.HKHKG },
  WP_TAIWAN_STR: { id: 'WP_TAIWAN_STR', coords: [23.80, 118.80] },
  WP_EAST_CHINA_S: { id: 'WP_EAST_CHINA_S', coords: [29.50, 123.50] },
  CNSHA: { id: 'CNSHA', coords: MARITIME_PORTS.CNSHA.coords, port: MARITIME_PORTS.CNSHA },
  WP_KYUSHU_S: { id: 'WP_KYUSHU_S', coords: [31.00, 131.50] },
  JPTYO: { id: 'JPTYO', coords: MARITIME_PORTS.JPTYO.coords, port: MARITIME_PORTS.JPTYO },
};

const SEA_EDGES: [string, string][] = [
  ['NLRTM', 'WP_ENGLISH_CH'],
  ['WP_ENGLISH_CH', 'WP_BISCAY'],
  ['WP_BISCAY', 'WP_ST_VINCENT'],
  ['WP_ST_VINCENT', 'WP_GIBRALTAR'],
  ['WP_GIBRALTAR', 'ESALG'],
  ['WP_GIBRALTAR', 'WP_ALBORAN'],
  ['WP_ALBORAN', 'WP_SICILY_CH'],
  ['WP_SICILY_CH', 'WP_IONIAN'],
  ['WP_IONIAN', 'WP_CRETE_S'],
  ['WP_CRETE_S', 'WP_AEGEAN_S'],
  ['WP_AEGEAN_S', 'GRPIR'],
  ['WP_CRETE_S', 'WP_LEV_SEA'],
  ['WP_LEV_SEA', 'WP_SUEZ_N'],
  ['WP_SUEZ_N', 'EGPSD'],
  ['EGPSD', 'WP_SUEZ_S'],
  ['WP_SUEZ_S', 'WP_RED_SEA_N'],
  ['WP_RED_SEA_N', 'WP_RED_SEA_MID'],
  ['WP_RED_SEA_MID', 'SAJED'],
  ['WP_RED_SEA_MID', 'WP_RED_SEA_S'],
  ['WP_RED_SEA_S', 'WP_BAB_EL_MANDEB'],
  ['WP_BAB_EL_MANDEB', 'WP_GULF_ADEN'],
  ['WP_GULF_ADEN', 'WP_SOCOTRA_N'],
  ['WP_SOCOTRA_N', 'WP_GULF_OMAN'],
  ['WP_GULF_OMAN', 'WP_HORMUZ'],
  ['WP_HORMUZ', 'AEJEA'],
  ['WP_SOCOTRA_N', 'WP_ARABIAN_SEA'],
  ['WP_GULF_OMAN', 'WP_ARABIAN_SEA'],
  ['WP_ARABIAN_SEA', 'INBOM'],
  ['WP_ARABIAN_SEA', 'WP_INDIA_W'],
  ['INBOM', 'WP_INDIA_W'],
  ['WP_INDIA_W', 'WP_INDIA_SW'],
  ['WP_INDIA_SW', 'LKCMB'],
  ['WP_INDIA_SW', 'WP_SRI_LANKA_S'],
  ['LKCMB', 'WP_SRI_LANKA_S'],
  ['WP_SRI_LANKA_S', 'WP_BAY_BENGAL_S'],
  ['WP_BAY_BENGAL_S', 'WP_MALACCA_N'],
  ['WP_MALACCA_N', 'WP_MALACCA_MID'],
  ['WP_MALACCA_MID', 'MYPKG'],
  ['WP_MALACCA_MID', 'WP_MALACCA_S'],
  ['WP_MALACCA_S', 'WP_SINGAPORE_STR'],
  ['WP_SINGAPORE_STR', 'SGSIN'],
  ['WP_SINGAPORE_STR', 'WP_SOUTH_CHINA_S'],
  ['WP_SOUTH_CHINA_S', 'WP_SOUTH_CHINA_MID'],
  ['WP_SOUTH_CHINA_MID', 'HKHKG'],
  ['WP_SOUTH_CHINA_MID', 'WP_TAIWAN_STR'],
  ['WP_TAIWAN_STR', 'WP_EAST_CHINA_S'],
  ['WP_EAST_CHINA_S', 'CNSHA'],
  ['WP_EAST_CHINA_S', 'WP_KYUSHU_S'],
  ['WP_KYUSHU_S', 'JPTYO'],
];

// Haversine distance in Nautical Miles
export function distanceNm(a: [number, number], b: [number, number]): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3440.065; // Earth radius in nautical miles
  const dLat = toRad(b[0] - a[0]);
  const dLon = toRad(b[1] - a[1]);
  const lat1 = toRad(a[0]);
  const lat2 = toRad(b[0]);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function buildAdjacency(): Record<string, { to: string; cost: number }[]> {
  const adj: Record<string, { to: string; cost: number }[]> = {};
  for (const id of Object.keys(SEA_NODES)) adj[id] = [];

  for (const [u, v] of SEA_EDGES) {
    const cost = distanceNm(SEA_NODES[u].coords, SEA_NODES[v].coords);
    adj[u].push({ to: v, cost });
    adj[v].push({ to: u, cost });
  }
  return adj;
}

const ADJACENCY = buildAdjacency();

function findNearestSeaNode(coords: [number, number]): string {
  let bestId = 'WP_ARABIAN_SEA';
  let bestDist = Infinity;

  for (const node of Object.values(SEA_NODES)) {
    const d = distanceNm(coords, node.coords);
    if (d < bestDist) {
      bestDist = d;
      bestId = node.id;
    }
  }
  return bestId;
}

export interface SeaRouteResult {
  coordinates: [number, number][];
  destinationPort: MaritimePort | null;
  remainingNm: number;
}

export function computeMaritimeRoute(vessel: Vessel): SeaRouteResult {
  if (vessel.latitude === null || vessel.longitude === null) {
    return { coordinates: [], destinationPort: null, remainingNm: 0 };
  }

  const origin: [number, number] = [vessel.latitude, vessel.longitude];
  const destCode = vessel.destinationPortCode?.toUpperCase() ?? '';
  const destinationPort = MARITIME_PORTS[destCode] ?? null;

  if (!destinationPort || !SEA_NODES[destCode]) {
    return {
      coordinates: [origin],
      destinationPort: null,
      remainingNm: 0,
    };
  }

  const startNode = findNearestSeaNode(origin);
  const endNode = destCode;

  // Dijkstra shortest path over sea lanes
  const dist: Record<string, number> = {};
  const prev: Record<string, string | null> = {};
  const unvisited = new Set<string>(Object.keys(SEA_NODES));

  for (const id of unvisited) {
    dist[id] = Infinity;
    prev[id] = null;
  }
  dist[startNode] = 0;

  while (unvisited.size > 0) {
    let current: string | null = null;
    for (const id of unvisited) {
      if (current === null || dist[id] < dist[current]) current = id;
    }
    if (!current || current === endNode || dist[current] === Infinity) break;

    unvisited.delete(current);
    for (const edge of ADJACENCY[current]) {
      if (!unvisited.has(edge.to)) continue;
      const alt = dist[current] + edge.cost;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = current;
      }
    }
  }

  const pathCoords: [number, number][] = [];
  let step: string | null = endNode;
  while (step) {
    pathCoords.unshift(SEA_NODES[step].coords);
    step = prev[step];
  }

  const fullCoords: [number, number][] = [origin, ...pathCoords];
  let totalNm = 0;
  for (let i = 0; i < fullCoords.length - 1; i++) {
    totalNm += distanceNm(fullCoords[i], fullCoords[i + 1]);
  }

  return {
    coordinates: fullCoords,
    destinationPort,
    remainingNm: Math.round(totalNm),
  };
}