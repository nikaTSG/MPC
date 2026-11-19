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

export const INTAKE_CATEGORIES = {
  DEFECT_REPORT: 'Defect report',
  VESSEL_UPDATE: 'Vessel update',
  SUPPLIER_QUOTE: 'Supplier quote',
  OTHER: 'Other',
} as const;

export interface IntakeSource {
  sender?: string;
  subject?: string;
  filename?: string;
}

export interface IntakeReview {
  intakeId: string;
  extraction: {
    category: keyof typeof INTAKE_CATEGORIES;
    vesselName: string | null;
    imo: string | null;
    severity: FaultSeverity | null;
    summary: string;
    parts: { partNumber: string | null; partName: string; quantity: number | null; notes: string | null }[];
    facts: { label: string; value: string }[];
  };
}

export interface ProcessedIntake {
  id: string;
  vesselId: number | null;
  category: string;
  subject: string | null;
  filename: string | null;
  createdAt: string;
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

export const VESSEL_CATEGORIES = {
  BULK_CARRIER: 'Bulk carriers',
  CONTAINER: 'Container ships',
  TANKER: 'Tankers',
  GENERAL_CARGO: 'General cargo ships',
} as const;

export type VesselCategory = keyof typeof VESSEL_CATEGORIES;
export type NewVessel = Pick<Vessel, 'name' | 'imo' | 'mmsi' | 'flagState' | 'yearBuilt' | 'dwt' |
  'grossTonnage' | 'lengthOverall' | 'beam' | 'maxDraught'> & { vesselType: VesselCategory };

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

function requestAi<T>(path: 'pdf' | 'drafts' | 'report' | 'intake' | 'intake/process', settings: AiSettings, payload: object) {
  return request<T>(`/api/v1/ai/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${settings.apiKey}` },
    body: JSON.stringify({ ...payload, provider: settings.provider, model: settings.model }),
    cache: 'no-store',
  });
}

async function streamAiMessage(
  settings: AiSettings,
  messages: AiChatMessage[],
  onDelta: (text: string) => void,
  signal: AbortSignal,
  dashboardContext?: Record<string, unknown>,
): Promise<string> {
  const response = await fetch('/api/v1/ai/chat', {
    method: 'POST',
    headers: {
      Accept: 'application/x-ndjson',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify({
      messages,
      provider: settings.provider,
      model: settings.model,
      ...(dashboardContext === undefined ? {} : { dashboardContext }),
    }),
    cache: 'no-store',
    signal,
  });
  if (!response.ok) {
    const payload: { error?: unknown } | null = await response.json().catch(() => null);
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not start the reply.');
  }

  const contentType = response.headers.get('Content-Type')?.split(';', 1)[0];
  if (!response.body || contentType !== 'application/x-ndjson') {
    await response.body?.cancel();
    throw new Error('The server could not stream a reply.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const interrupted = 'The reply was interrupted. Send the message again to retry.';
  let pending = '';
  let reply = '';
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) throw new Error(interrupted);

      const lines = (pending + decoder.decode(chunk.value, { stream: true })).split('\n');
      pending = lines.pop() ?? '';
      for (const line of lines) {
        let event: { type?: unknown; text?: unknown; error?: unknown } | null;
        try {
          event = JSON.parse(line);
        } catch {
          throw new Error(interrupted);
        }
        if (event?.type === 'delta' && typeof event.text === 'string') {
          reply += event.text;
          onDelta(event.text);
        } else if (event?.type === 'done' && reply.trim()) {
          return reply;
        } else if (event?.type === 'error' && typeof event.error === 'string') {
          throw new Error(event.error);
        } else {
          throw new Error(interrupted);
        }
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
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

  streamAiMessage,

  readPdf: (settings: AiSettings, filename: string, fileData: string) =>
    requestAi<PdfReport>('pdf', settings, { filename, fileData }),

  readIntake: (settings: AiSettings, source: IntakeSource & { body?: string; fileData?: string }) =>
    requestAi<IntakeReview>('intake', settings, source),

  processIntake: (settings: AiSettings, review: IntakeReview, vesselId: number | null, source: IntakeSource) =>
    requestAi<{ id: string; vesselId: number | null; category: string; draftCount: number }>(
      'intake/process', settings, { ...review, vesselId, ...source },
    ),

  getRecentIntakes: (signal: AbortSignal) =>
    request<{ records: ProcessedIntake[]; latestEmail: ProcessedIntake | null }>('/api/v1/ai/intake/recent', {
      method: 'POST', body: '{}', cache: 'no-store', signal,
    }),

  generateAiDrafts: (settings: AiSettings, vesselId: number, extractedParts: ExtractedPart[]) =>
    requestAi<OrderDraft[]>('drafts', settings, { vesselId, extractedParts }),

  getVessels: async (): Promise<Vessel[]> => {
    const raw = await request<unknown>('/api/v1/vessels');
    return extractArray<Vessel>(raw, 'vessels');
  },

  getVesselById: (id: number) => request<Vessel>(`/api/v1/vessels/${id}`),

  createVessel: async (vessel: NewVessel) => {
    const result = await request<{ success: true; data: Vessel }>('/api/v1/vessels', {
      method: 'POST', body: JSON.stringify(vessel),
    });
    return result.data;
  },

  submitFaultReport: (payload: FaultReportPayload, settings: AiSettings) =>
    requestAi<FaultReportResult>('report', settings, payload),

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
