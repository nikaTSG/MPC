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
// Natural Earth 1:10m land and minor islands, v5.1.2 (public domain).
// The 1 arcminute mask blocks coastal cells intersecting land. Each latitude row
// stores pairs of longitude indices marking half-open land runs [west, east).
// https://github.com/nvkelso/natural-earth-vector/tree/v5.1.2/geojson
const CELLS_PER_DEGREE = 60;
const COLUMNS = 360 * CELLS_PER_DEGREE;
const ROWS = 180 * CELLS_PER_DEGREE;
type Point = [number, number];
interface Coastline {
  offsets: Uint32Array;
  runs: Uint16Array;
}

let coastlineRequest: Promise<Coastline> | undefined;

function loadCoastline(): Promise<Coastline> {
  coastlineRequest ??= fetch(new URL('../assets/repair-coastline.bin', import.meta.url))
    .then(async (response) => {
      if (!response.ok) throw new Error('Coastline unavailable');
      const bytes = await response.arrayBuffer();
      const offsets = new Uint32Array(bytes, 0, ROWS + 1);
      const runs = new Uint16Array(bytes, offsets.byteLength);
      if (offsets[ROWS] !== runs.length) throw new Error('Invalid coastline');
      return { offsets, runs };
    }).catch((error: unknown) => {
      coastlineRequest = undefined;
      throw error;
    });
  return coastlineRequest;
}

function localWaterGrid(origin: Point, destination: Point, coastline: Coastline) {
  const cell = ([lat, lon]: Point): Point => [
    Math.floor((lon + 180) * CELLS_PER_DEGREE),
    Math.min(ROWS - 1, Math.floor((90 - lat) * CELLS_PER_DEGREE)),
  ];
  const from = cell(origin);
  const to = cell(destination);
  // A regional window keeps the search bounded, including near the date line.
  const padding = Math.min(160, Math.max(20, Math.ceil(distanceNm(origin, destination) * 1.25)));
  const polarLatitude = Math.max(Math.abs(origin[0]), Math.abs(destination[0]));
  const longitudePadding = Math.ceil(padding / Math.max(0.1, Math.cos(polarLatitude * Math.PI / 180)));
  const west = Math.min(from[0], to[0]) - longitudePadding;
  const east = Math.max(from[0], to[0]) + longitudePadding;
  const north = Math.max(0, Math.min(from[1], to[1]) - padding);
  const south = Math.min(ROWS - 1, Math.max(from[1], to[1]) + padding);
  const width = east - west + 1;
  const height = south - north + 1;
  if (width >= COLUMNS || height * width > 1_500_000) return null;

  // 0 means open water, -1 land. A border prevents a search step wrapping a row.
  const cells = new Int8Array(width * height);
  const { offsets, runs } = coastline;
  for (let row = north; row <= south; row++) {
    const start = (row - north) * width;
    for (let world = Math.floor(west / COLUMNS); world <= Math.floor(east / COLUMNS); world++) {
      const shift = world * COLUMNS - west;
      for (let i = offsets[row]; i < offsets[row + 1]; i += 2) {
        const left = Math.max(0, runs[i] + shift);
        const right = Math.min(width, runs[i + 1] + shift);
        if (right > left) cells.fill(-1, start + left, start + right);
      }
    }
    cells[start] = cells[start + width - 1] = -1;
  }
  cells.fill(-1, 0, width);
  cells.fill(-1, cells.length - width);
  const index = ([x, y]: Point) => (y - north) * width + x - west;
  const center = (i: number): Point => [
    90 - (north + Math.floor(i / width) + 0.5) / CELLS_PER_DEGREE,
    (west + i % width + 0.5) / CELLS_PER_DEGREE - 180,
  ];
  function approach(point: Point, location: Point) {
    const here = index(point);
    if (cells[here] === 0) return here;
    // WPI often marks a port office or quay. Stop at water within four NM;
    // drawing a final line between that approach and the marker could cross land.
    let best = -1;
    let closest = 4;
    const longitudeRange = Math.ceil(4 / Math.max(0.1, Math.cos(location[0] * Math.PI / 180)));
    for (let y = Math.max(north, point[1] - 4); y <= Math.min(south, point[1] + 4); y++) {
      for (let x = Math.max(west, point[0] - longitudeRange); x <= Math.min(east, point[0] + longitudeRange); x++) {
        const candidate = index([x, y]);
        if (cells[candidate] !== 0) continue;
        const distance = distanceNm(location, center(candidate));
        if (distance < closest) { closest = distance; best = candidate; }
      }
    }
    return best;
  }
  return { cells, width, center, start: approach(from, origin), end: approach(to, destination),
    originAtSea: cells[index(from)] === 0, destinationAtSea: cells[index(to)] === 0 };
}

// Traverse every intersected cell (including both neighbours at diagonal corners).
function clearWaterLine(start: number, end: number, width: number, cells: Int8Array) {
  const dx = end % width - start % width;
  const dy = Math.floor(end / width) - Math.floor(start / width);
  const xStep = Math.sign(dx);
  const yStep = Math.sign(dy) * width;
  const nx = Math.abs(dx);
  const ny = Math.abs(dy);
  let cell = start;
  let x = 0;
  let y = 0;
  while (x < nx || y < ny) {
    const balance = (2 * x + 1) * ny - (2 * y + 1) * nx;
    if (balance === 0 && (cells[cell + xStep] < 0 || cells[cell + yStep] < 0)) return false;
    if (balance <= 0) { cell += xStep; x++; }
    if (balance >= 0) { cell += yStep; y++; }
    if (cells[cell] < 0) return false;
  }
  return true;
}

function waterPath(start: number, end: number, width: number, cells: Int8Array): number[] | null {
  if (clearWaterLine(start, end, width, cells)) return start === end ? [start] : [start, end];
  const directions = [1, -1, width, -width];
  const queue = new Int32Array(cells.length);
  let head = 0;
  let tail = 1;
  queue[0] = start;
  cells[start] = 5;
  while (head < tail && cells[end] === 0) {
    const current = queue[head++];
    for (let d = 0; d < directions.length; d++) {
      const next = current + directions[d];
      if (cells[next] !== 0) continue;
      cells[next] = d + 1;
      queue[tail++] = next;
    }
  }
  if (cells[end] === 0) return null;

  const reverse = [end];
  for (let i = end; i !== start;) {
    i -= directions[cells[i] - 1];
    reverse.push(i);
  }
  const path = reverse.reverse();
  const turns = [start];
  let last = start;
  for (let i = 2; i < path.length; i++) {
    if (!clearWaterLine(last, path[i], width, cells)) {
      last = path[i - 1];
      turns.push(last);
    }
  }
  turns.push(end);
  return turns;
}

export interface RepairApproach {
  coordinates: Point[];
  remainingNm: number;
  offshore: boolean;
}

export async function estimateRepairApproach(origin: Point, destination: Point, signal: AbortSignal): Promise<RepairApproach | null> {
  const coast = await loadCoastline();
  signal.throwIfAborted();
  const end: Point = [destination[0], destination[1]];
  if (Math.abs(end[1] - origin[1]) > 180) end[1] += end[1] < origin[1] ? 360 : -360;
  const grid = localWaterGrid(origin, end, coast);
  if (!grid || grid.start < 0 || grid.end < 0) return null;
  const path = waterPath(grid.start, grid.end, grid.width, grid.cells);
  if (!path) return null;
  const coordinates = path.map(grid.center);
  // Join an actual position only within its own open cell.
  if (grid.originAtSea) coordinates.unshift(origin);
  if (grid.destinationAtSea) coordinates.push(end);
  let distance = 0;
  // Leaflet projects to Mercator. Subdivide long latitude changes so a drawn
  // segment follows the checked line in the geographic grid at high latitude.
  const projected = [coordinates[0]];
  for (let i = 1; i < coordinates.length; i++) {
    const [lat, lon] = coordinates[i - 1];
    const [nextLat, nextLon] = coordinates[i];
    const steps = Math.max(1, Math.ceil(Math.abs(nextLat - lat) * 4));
    for (let step = 1; step <= steps; step++) {
      const next: Point = [lat + (nextLat - lat) * step / steps, lon + (nextLon - lon) * step / steps];
      distance += distanceNm(projected[projected.length - 1], next);
      projected.push(next);
    }
  }
  return { coordinates: projected, remainingNm: Math.round(distance), offshore: !grid.originAtSea || !grid.destinationAtSea };
}
