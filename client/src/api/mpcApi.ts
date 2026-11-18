export type FaultSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export interface Vessel {
  id: number;
  imo: string;
  mmsi: string;
  name: string;
  callSign: string | null;
  flagState: string;
  vesselType: string;
  classSociety: string | null;
  yearBuilt: number;
  builder: string | null;
  mainEngineModel: string | null;
  dwt: number;
  grossTonnage: number;
  teuCapacity: number | null;
  lengthOverall: number;
  beam: number;
  maxDraught: number;
  health: number;
  operationalStatus: string;
  latitude: number | null;
  longitude: number | null;
  speedKnots: number | null;
  heading: number | null;
  destinationPortCode: string | null;
  eta: string | null;
}

export interface FaultReportPayload {
  vesselId: number;
  severity: FaultSeverity;
  faultSummary?: string;
  extractedParts: {
    partNumber: string;
    partName: string;
    quantity: number;
    notes?: string;
  }[];
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
    ...options,
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }

  return data as T;
}

export const mpcApi = {
  getVessels: () => request<Vessel[]>('/api/v1/vessels'),
  getVesselById: (id: number) => request<Vessel>(`/api/v1/vessels/${id}`),
  submitFaultReport: (payload: FaultReportPayload) =>
    request<{
      healthUpdate: { vessel: Vessel; previousHealth: number; newHealth: number; penalty: number };
      draftedOrders: unknown[];
    }>('/api/v1/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
};