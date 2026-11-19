import type { ExtractedPartInput, RepairPort } from '../../services/order.service.js';
import { requestAiText, type AiCredentials } from './aiProvider.js';

export interface DraftedSupplierEmail {
  supplierId: number;
  urgency: 'LOW' | 'NORMAL' | 'CRITICAL';
  subject: string;
  body: string;
  matchedParts: ExtractedPartInput[];
}

export interface AgentProcurementResponse {
  drafts: DraftedSupplierEmail[];
}

interface DraftEmailsInput {
  vessel: {
    id: number;
    name: string;
    imo: string;
    destinationPortCode?: string | null;
    eta?: Date | string | null;
  };
  extractedParts: ExtractedPartInput[];
  repairPort?: RepairPort;
  suppliers: {
    id: number;
    name: string;
    portLocation?: string | null;
    parts: unknown;
  }[];
}

const SYSTEM_PROMPT = `
You are a Senior Maritime Procurement Officer for ENOUGH Carriers.
You will receive JSON containing:
1. "vessel": Vessel name, IMO, target delivery port, and ETA if known.
2. "neededParts": Spare parts required from an onboard technical fault report.
3. "suppliers": Approved vendors in our database, their portLocation, and the parts they supply.

Your job:
- Match each needed part to one supplier based on its catalog and proximity to the vessel's delivery port.
- Use the supplied delivery port exactly. When no ETA is supplied, omit it. Do not infer a port or date.
- Consolidate multiple parts going to the same supplier into ONE email draft (never send multiple emails to the same supplier).
- Write a concise, professional maritime Request for Quotation (RFQ) email for each matched supplier.
- Include the Vessel Name, IMO number, target delivery port, OEM part numbers, part names, and quantities in the email body.
- Set "urgency" to "CRITICAL", "NORMAL", or "LOW" based on the part notes and criticality.
- ONLY use valid numeric "supplierId" values from the provided "suppliers" list. Never invent suppliers.
- Include a "notes" string for every matched part, or null when there are no notes.

You MUST respond with valid JSON matching this exact schema (no markdown, no extra text):
{
  "drafts": [
    {
      "supplierId": 1,
      "urgency": "CRITICAL",
      "subject": "RFQ - Main Engine Spares",
      "body": "Dear Supplier,\\n\\nPlease provide your best quotation and earliest availability...",
      "matchedParts": [
        {
          "partNumber": "W-FIV-992",
          "partName": "Main Engine Fuel Injection Valve",
          "quantity": 2,
          "notes": "Leaking injector noted in report"
        }
      ]
    }
  ]
}
`.trim();

const DRAFTS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    drafts: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        properties: {
          supplierId: { type: 'integer' },
          urgency: { type: 'string', enum: ['LOW', 'NORMAL', 'CRITICAL'] },
          subject: { type: 'string' },
          body: { type: 'string' },
          matchedParts: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                partNumber: { type: 'string' },
                partName: { type: 'string' },
                quantity: { type: 'integer' },
                notes: { anyOf: [{ type: 'string' }, { type: 'null' }] },
              },
              required: ['partNumber', 'partName', 'quantity', 'notes'],
            },
          },
        },
        required: ['supplierId', 'urgency', 'subject', 'body', 'matchedParts'],
      },
    },
  },
  required: ['drafts'],
};

export async function draftSupplierEmails(
  input: DraftEmailsInput,
  credentials: AiCredentials,
): Promise<AgentProcurementResponse> {
  const requestedParts = consolidateParts(sanitizeExtractedParts(input.extractedParts));
  const requestedNumbers = new Set(requestedParts.map(part => part.partNumber.toLowerCase()));
  const suppliers = input.suppliers.flatMap(supplier => {
    if (!Number.isSafeInteger(supplier.id) || supplier.id <= 0) return [];
    const parts = catalogParts(supplier.parts).filter(part => requestedNumbers.has(part.partNumber.trim().toLowerCase()));
    return parts.length ? [{ ...supplier, parts }] : [];
  });
  if (!suppliers.length) return { drafts: [] };
  const availableNumbers = new Set(suppliers.flatMap(supplier => supplier.parts.map(part => part.partNumber.trim().toLowerCase())));
  const extractedParts = requestedParts.filter(part => availableNumbers.has(part.partNumber.toLowerCase()));

  // Strip sensitive/unnecessary fields (like supplier emails) before sending to the LLM
  const sanitizedPayload = {
    vessel: {
      name: input.vessel.name,
      imo: input.vessel.imo,
      ...(input.repairPort
        ? { deliveryPort: input.repairPort.name, destinationPortCode: input.repairPort.code }
        : { destinationPortCode: input.vessel.destinationPortCode ?? null, ...(input.vessel.eta && { eta: input.vessel.eta }) }),
    },
    neededParts: extractedParts,
    suppliers: suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      portLocation: s.portLocation,
      parts: s.parts,
    })),
  };

  const rawContent = await requestAiText(credentials, {
    instructions: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: JSON.stringify(sanitizedPayload) }],
    jsonSchema: { name: 'supplier_email_drafts', schema: DRAFTS_SCHEMA },
    maxOutputTokens: 4000,
  });

  if (!rawContent) {
    throw new Error('AI provider returned an empty response');
  }

  // Clean accidental ```json fences before validation
  const cleanedJson = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed: unknown = JSON.parse(cleanedJson);

  if (!isRecord(parsed) || !Array.isArray(parsed.drafts)) {
    throw new Error('AI response missing "drafts" array');
  }

  return { drafts: validateDrafts(parsed.drafts, { ...input, extractedParts, suppliers }) };
}

// Each canonical line is offered to the provider once, with its entire requested quantity.
function consolidateParts(parts: ExtractedPartInput[]) {
  const byKey = new Map<string, ExtractedPartInput>();
  for (const part of parts) {
    const key = JSON.stringify([part.partNumber.toLowerCase(), part.partName.toLowerCase()]);
    const prior = byKey.get(key);
    if (!prior) byKey.set(key, { ...part });
    else {
      prior.quantity += part.quantity;
      if (part.notes && part.notes !== prior.notes) prior.notes = [prior.notes, part.notes].filter(Boolean).join('\n');
    }
  }
  return [...byKey.values()];
}

function sanitizeExtractedParts(value: unknown): ExtractedPartInput[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ExtractedPartInput[] => {
    if (
      !isRecord(item) ||
      typeof item.partNumber !== 'string' ||
      item.partNumber.trim().length === 0 ||
      item.partNumber.length > 200 ||
      typeof item.partName !== 'string' ||
      item.partName.trim().length === 0 ||
      item.partName.length > 300 ||
      !Number.isSafeInteger(item.quantity) ||
      (item.quantity as number) < 1 ||
      (item.quantity as number) > 1_000_000 ||
      (item.notes !== undefined && item.notes !== null && typeof item.notes !== 'string')
    ) {
      return [];
    }
    return [{
      partNumber: item.partNumber.trim(),
      partName: item.partName.trim(),
      quantity: item.quantity as number,
      notes: typeof item.notes === 'string' ? item.notes.trim().slice(0, 1000) || null : null,
    }];
  });
}

function validateDrafts(rawDrafts: unknown[], input: DraftEmailsInput): DraftedSupplierEmail[] {
  const suppliersById = new Map(
    input.suppliers
      .filter((supplier) => Number.isSafeInteger(supplier.id) && supplier.id > 0)
      .map((supplier) => [supplier.id, supplier]),
  );
  const usedPartIndexes = new Set<number>();
  const draftsBySupplier = new Map<number, DraftedSupplierEmail>();

  for (const rawDraft of rawDrafts) {
    if (!isRecord(rawDraft)) continue;
    const supplierId = rawDraft.supplierId;
    const supplier = typeof supplierId === 'number' ? suppliersById.get(supplierId) : undefined;
    if (!supplier) continue;

    const subject = boundedText(rawDraft.subject, 500);
    const body = boundedText(rawDraft.body, 8000);
    if (!subject || !body || !Array.isArray(rawDraft.matchedParts)) continue;

    const matchedParts: ExtractedPartInput[] = [];
    for (const rawPart of rawDraft.matchedParts) {
      if (!isRecord(rawPart)) continue;
      const requestedIndex = input.extractedParts.findIndex((part, index) =>
        !usedPartIndexes.has(index) &&
        typeof rawPart.partNumber === 'string' &&
        typeof rawPart.partName === 'string' &&
        rawPart.partNumber.trim().toLowerCase() === part.partNumber.trim().toLowerCase() &&
        rawPart.partName.trim().toLowerCase() === part.partName.trim().toLowerCase() &&
        rawPart.quantity === part.quantity,
      );
      if (requestedIndex < 0) continue;

      const requestedPart = input.extractedParts[requestedIndex];
      if (!requestedPart || !catalogParts(supplier.parts).some(part =>
        part.partNumber.trim().toLowerCase() === requestedPart.partNumber.toLowerCase())) continue;
      usedPartIndexes.add(requestedIndex);
      matchedParts.push({ ...requestedPart, notes: requestedPart.notes ?? null });
    }
    if (matchedParts.length === 0) continue;

    const urgency = isUrgency(rawDraft.urgency) ? rawDraft.urgency : 'NORMAL';
    const existing = draftsBySupplier.get(supplier.id);
    if (!existing) {
      draftsBySupplier.set(supplier.id, { supplierId: supplier.id, urgency, subject, body, matchedParts });
      continue;
    }

    existing.matchedParts.push(...matchedParts);
    const bullets = matchedParts.map((part) => `- ${part.partNumber} — ${part.partName} (quantity: ${part.quantity})`);
    existing.body += `\n\nAdditional verified requested parts:\n${bullets.join('\n')}`;
    if (urgencyRank(urgency) > urgencyRank(existing.urgency)) existing.urgency = urgency;
  }

  return [...draftsBySupplier.values()];
}

function catalogParts(catalog: unknown): (Record<string, unknown> & { partNumber: string })[] {
  let items = catalog;
  if (typeof items === 'string') {
    try {
      items = JSON.parse(items) as unknown;
    } catch {
      return [];
    }
  }
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is Record<string, unknown> & { partNumber: string } =>
    isRecord(item) && typeof item.partNumber === 'string',
  );
}

function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maxLength ? normalized : null;
}

function isUrgency(value: unknown): value is DraftedSupplierEmail['urgency'] {
  return value === 'LOW' || value === 'NORMAL' || value === 'CRITICAL';
}

function urgencyRank(value: DraftedSupplierEmail['urgency']): number {
  return value === 'CRITICAL' ? 2 : value === 'NORMAL' ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
