import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AiCredentials, AiRequest } from './aiProvider.js';
import type { FaultSeverity } from '../../services/vessel.service.js';

const categories = ['DEFECT_REPORT', 'VESSEL_UPDATE', 'SUPPLIER_QUOTE', 'OTHER'] as const;
const severities: readonly FaultSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export type IntakeExtraction = {
  category: typeof categories[number];
  vesselName: string | null;
  imo: string | null;
  severity: FaultSeverity | null;
  summary: string;
  parts: {
    partNumber: string | null;
    partName: string;
    quantity: number | null;
    notes: string | null;
  }[];
  facts: { label: string; value: string }[];
};

export type IntakeSource = { sender: string | null; subject: string | null; filename: string | null };
export type ReviewedIntake = { intakeId: string; vesselId: number | null; extraction: IntakeExtraction } & IntakeSource;

type DocumentReadResult = { extraction: IntakeExtraction } | { status: number; error: string };

const readerPath = fileURLToPath(new URL('./main.py', import.meta.url));
const localPythonPath = fileURLToPath(new URL(
  process.platform === 'win32' ? '../../../.venv.local/Scripts/python.exe' : '../../../.venv.local/bin/python',
  import.meta.url,
));
const readerErrorMessages: Readonly<Record<number, string>> = {
  400: 'The reader could not open this document. Check that the PDF is valid and unlocked.',
  401: 'The AI provider rejected the API key.',
  403: 'The API key does not have access to this AI provider or model.',
  413: 'The PDF must be at most 5 MiB.',
  429: 'The AI provider rate limit or quota was reached.',
  502: 'The selected AI provider could not extract this document. Check the model in AI settings.',
  504: 'The AI provider timed out.',
};

export function readDocumentWithPython(
  credentials: AiCredentials, source: IntakeSource, body: string, pdf?: AiRequest['pdf'],
): Promise<DocumentReadResult> {
  const python = process.env.MPC_READER_PYTHON?.trim() || (existsSync(localPythonPath) ? localPythonPath : 'python3');
  return new Promise((resolve) => {
    const child = execFile(python,
      ['-B', readerPath, '--extract-json'],
      { timeout: 75_000, maxBuffer: 256 * 1024 },
      (error, stdout) => {
        if (error) {
          resolve(error.killed
            ? { status: 504, error: 'The Python reader timed out.' }
            : { status: 503, error: 'The Python reader could not start. Check its Python dependencies and MPC_READER_PYTHON.' });
          return;
        }
        let result: unknown;
        try {
          result = JSON.parse(stdout);
        } catch {
          resolve({ status: 502, error: 'The Python reader returned an invalid response.' });
          return;
        }
        if (isRecord(result) && typeof result.status === 'number' && Object.hasOwn(readerErrorMessages, result.status)) {
          resolve({ status: result.status, error: readerErrorMessages[result.status]! });
          return;
        }
        const extraction = isRecord(result) ? readIntakeExtraction(result.extraction) : null;
        resolve(extraction ? { extraction } : { status: 502, error: 'The AI provider returned an invalid document analysis.' });
      });
    child.stdin?.on('error', () => {});
    child.stdin?.end(JSON.stringify({
      authorization: `Bearer ${credentials.apiKey}`,
      request: {
        provider: credentials.provider, model: credentials.model,
        sender: source.sender ?? '', subject: source.subject ?? '', filename: source.filename ?? '', body,
      },
      pdf: pdf?.base64,
    }));
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max && value.trim().length > 0;
}

function isNullableText(value: unknown, max: number): value is string | null {
  return value === null || isText(value, max);
}

function isMember<T extends string>(allowed: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && allowed.some((item) => item === value);
}

export function readIntakeSource(input: Record<string, unknown>): IntakeSource | null {
  for (const [field, max] of [['sender', 320], ['subject', 500], ['filename', 200]] as const) {
    const value = input[field];
    if (value != null && (typeof value !== 'string' || value.length > max || /[\u0000-\u001f\u007f]/.test(value))) return null;
  }
  const field = (key: string) => typeof input[key] === 'string' ? input[key].trim() || null : null;
  return { sender: field('sender'), subject: field('subject'), filename: field('filename') };
}

export function readIntakeExtraction(value: unknown): IntakeExtraction | null {
  if (!isRecord(value) || !isMember(categories, value.category) || !isText(value.summary, 4000)
      || !isNullableText(value.vesselName, 200) || !(value.imo === null || (typeof value.imo === 'string' && /^\d{7}$/.test(value.imo)))
      || !(value.severity === null || isMember(severities, value.severity))
      || !Array.isArray(value.parts) || value.parts.length > 25 || !Array.isArray(value.facts) || value.facts.length > 30) return null;

  const parts: IntakeExtraction['parts'] = [];
  for (const part of value.parts) {
    if (!isRecord(part) || !isText(part.partName, 300) || !isNullableText(part.partNumber, 200) || !isNullableText(part.notes, 1000)) return null;
    const quantity = part.quantity;
    if (!(quantity === null || (typeof quantity === 'number' && Number.isSafeInteger(quantity) && quantity >= 1 && quantity <= 1_000_000))) return null;
    parts.push({ partName: part.partName.trim(), partNumber: part.partNumber?.trim() ?? null, quantity, notes: part.notes?.trim() ?? null });
  }
  const facts: IntakeExtraction['facts'] = [];
  for (const fact of value.facts) {
    if (!isRecord(fact) || !isText(fact.label, 120) || !isText(fact.value, 1000)) return null;
    facts.push({ label: fact.label.trim(), value: fact.value.trim() });
  }
  return { category: value.category, summary: value.summary.trim(), vesselName: value.vesselName?.trim() ?? null,
    imo: value.imo, severity: value.severity, parts, facts };
}

/** With plain text, drop identifiers that cannot be traced back to the submitted source. */
export function groundTextIdentifiers(extraction: IntakeExtraction, text: string): IntakeExtraction {
  const normalize = (input: string) => input.replace(/\s+/g, ' ').toUpperCase();
  const source = normalize(text);
  const literal = (value: string | null) => value && source.includes(normalize(value)) ? value : null;
  return {
    ...extraction,
    vesselName: literal(extraction.vesselName),
    imo: extraction.imo && new RegExp('(?<![0-9])' + extraction.imo + '(?![0-9])').test(source) ? extraction.imo : null,
    parts: extraction.parts.map((part) => ({ ...part, partNumber: literal(part.partNumber) })),
  };
}
