export type FaultSeverity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

export const AI_PROVIDERS = {
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  anthropic: 'Anthropic Claude',
} as const;

export type AiProvider = keyof typeof AI_PROVIDERS;
export type AiModels = Record<AiProvider, string[]>;

export interface AiSettings {
  provider: AiProvider;
  model: string;
  apiKey: string;
}

export interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export const MAX_PDF_SIZE = 5 * 1024 * 1024;

export interface ExtractedPart {
  partNumber: string;
  partName: string;
  quantity: number;
  notes?: string | null;
}

export interface PdfReport {
  summary: string;
  parts: ExtractedPart[];
}

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
  extractedParts: ExtractedPart[];
}

interface FaultReportResult {
  healthUpdate: { vessel: Vessel; previousHealth: number; newHealth: number; penalty: number };
  draftedOrders: OrderDraft[];
}

export interface OrderDraft {
  id: number;
  vesselId: number;
  subject: string;
  body: string;
  urgency: 'LOW' | 'NORMAL' | 'CRITICAL';
  status: 'PENDING_APPROVAL' | 'SENT' | 'REJECTED';
  items: { partNumber: string; partName: string; quantity: number; notes?: string }[];
  vessel?: { id: number; name: string; imo: string };
  supplier?: { id: number; name: string; email: string; portLocation?: string };
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');

  const res = await fetch(url, {
    ...options,
    headers,
  });

  const rawText = await res.text();
  let data: unknown = {};

  if (rawText) {
    try {
      data = JSON.parse(rawText);
    } catch {
      // Catches Vite returning index.html on 200 OK when the Express server isn't hit
      throw new Error(
        `API ${url} returned non-JSON (status ${res.status}). Check that your Express server is running on port 3001.`
      );
    }
  }

  if (!res.ok) {
    const errObj = data as { error?: string; message?: string };
    throw new Error(errObj.error || errObj.message || `Request failed (${res.status})`);
  }

  return data as T;
}

function requestAi<T>(path: 'chat' | 'pdf' | 'drafts' | 'report', settings: AiSettings, payload: object) {
  return request<T>(`/api/v1/ai/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ ...payload, provider: settings.provider, model: settings.model }),
    cache: 'no-store',
  });
}

// Safely unwraps either `[...]` or `{ [key]: [...] }` or `{ data: [...] }`
function extractArray<T>(payload: unknown, key: string): T[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    if (Array.isArray(record[key])) return record[key] as T[];
    if (Array.isArray(record.data)) return record.data as T[];
  }
  return [];
}

export const mpcApi = {
  getAiModels: () => request<AiModels>('/api/v1/ai/models', { cache: 'no-store' }),

  sendAiMessage: (settings: AiSettings, messages: AiChatMessage[]) =>
    requestAi<{ reply: string }>('chat', settings, { messages }),

  readPdf: (settings: AiSettings, filename: string, fileData: string) =>
    requestAi<PdfReport>('pdf', settings, { filename, fileData }),

  generateAiDrafts: (settings: AiSettings, vesselId: number, extractedParts: ExtractedPart[]) =>
    requestAi<OrderDraft[]>('drafts', settings, { vesselId, extractedParts }),

  getVessels: async (): Promise<Vessel[]> => {
    const raw = await request<unknown>('/api/v1/vessels');
    return extractArray<Vessel>(raw, 'vessels');
  },

  getVesselById: (id: number) => request<Vessel>(`/api/v1/vessels/${id}`),

  submitFaultReport: (payload: FaultReportPayload, settings?: AiSettings) =>
    settings
      ? requestAi<FaultReportResult>('report', settings, payload)
      : request<FaultReportResult>('/api/v1/reports', {
          method: 'POST',
          body: JSON.stringify(payload),
        }),

  getOrders: async (status: string): Promise<OrderDraft[]> => {
    const raw = await request<unknown>(`/api/v1/orders?status=${encodeURIComponent(status)}`);
    const list = extractArray<OrderDraft>(raw, 'orders');

    // SQLite + Prisma often stores JSON arrays as strings; parse safely so .map() never crashes
    return list.map((order) => ({
      ...order,
      items:
        typeof order.items === 'string'
          ? JSON.parse(order.items)
          : Array.isArray(order.items)
            ? order.items
            : [],
    }));
  },

  approveOrder: (id: number) =>
    request<{ message: string; previewUrl?: string }>(`/api/v1/orders/${id}/approve`, {
      method: 'POST',
    }),

  updateOrderDraft: (id: number, updates: { subject?: string; body?: string }) =>
    request<OrderDraft>(`/api/v1/orders/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    }),
};
