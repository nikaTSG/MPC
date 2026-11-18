import type { ExtractedPartInput } from '../../services/order.service.js';

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
1. "vessel": Vessel details (name, IMO, destinationPortCode, eta).
2. "neededParts": Spare parts required from an onboard technical fault report.
3. "suppliers": Approved vendors in our database, their portLocation, and the parts they supply.

Your job:
- Match each needed part to the single best supplier from "suppliers" based on part catalog match and proximity to the vessel's destinationPortCode.
- Consolidate multiple parts going to the same supplier into ONE email draft (never send multiple emails to the same supplier).
- Write a concise, professional maritime Request for Quotation (RFQ) email for each matched supplier.
- Include the Vessel Name, IMO number, target delivery port, OEM part numbers, part names, and quantities in the email body.
- Set "urgency" to "CRITICAL", "NORMAL", or "LOW" based on the part notes and criticality.
- ONLY use valid numeric "supplierId" values from the provided "suppliers" list. Never invent suppliers.

You MUST respond with valid JSON matching this exact schema (no markdown, no extra text):
{
  "drafts": [
    {
      "supplierId": 1,
      "urgency": "CRITICAL",
      "subject": "URGENT RFQ - M/V STAR MARISA (IMO 9696660) - Main Engine Spares - SGSIN",
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

export async function draftSupplierEmails(
  input: DraftEmailsInput
): Promise<AgentProcurementResponse> {
  const baseUrl = (process.env.AI_BASE_URL || 'http://localhost:11434/v1').replace(/\/$/, '');
  const apiKey = process.env.AI_API_KEY || 'ollama';
  const model = process.env.AI_MODEL || 'llama3.2';

  // Strip sensitive/unnecessary fields (like supplier emails) before sending to the LLM
  const sanitizedPayload = {
    vessel: {
      name: input.vessel.name,
      imo: input.vessel.imo,
      destinationPortCode: input.vessel.destinationPortCode ?? 'TBD',
      eta: input.vessel.eta ?? 'TBD',
    },
    neededParts: input.extractedParts,
    suppliers: input.suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      portLocation: s.portLocation,
      parts: s.parts,
    })),
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2, // Low temperature keeps part numbers and IDs factual
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: JSON.stringify(sanitizedPayload) },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`AI provider error (${response.status}): ${errText}`);
  }

  const data = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };

  const rawContent = data.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error('AI provider returned an empty response');
  }

  // Clean accidental ```json fences if a local model adds them
  const cleanedJson = rawContent.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  const parsed = JSON.parse(cleanedJson) as AgentProcurementResponse;

  if (!Array.isArray(parsed.drafts)) {
    throw new Error('AI response missing "drafts" array');
  }

  // Guardrail: drop any draft with a hallucinated supplierId so SQLite FK constraints never crash
  const validSupplierIds = new Set(input.suppliers.map((s) => s.id));
  const safeDrafts = parsed.drafts.filter((d) => validSupplierIds.has(Number(d.supplierId)));

  return { drafts: safeDrafts };
}