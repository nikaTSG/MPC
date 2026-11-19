import { execFile } from 'node:child_process';
import { createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { AiCredentials, AiRequest } from './aiProvider.js';
import type { FaultSeverity } from '../../services/vessel.service.js';
import type { RepairPort } from '../../services/order.service.js';

const categories = ['DEFECT_REPORT', 'VESSEL_UPDATE', 'SUPPLIER_QUOTE', 'OTHER'] as const;
const severities: readonly FaultSeverity[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

export type IntakeExtraction = {
  category: typeof categories[number];
  vesselName: string | null;
  imo: string | null;
  severity: FaultSeverity | null;
  reportsActiveFault?: boolean;
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
type ReaderFindings = IntakeSource & { intakeId: string; hasEmail: boolean; extraction: IntakeExtraction };
export type ReviewedIntake = ReaderFindings & { vesselId: number | null; repairPort?: RepairPort };

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
      || (value.reportsActiveFault !== undefined && typeof value.reportsActiveFault !== 'boolean')
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
    imo: value.imo, severity: value.severity,
    ...(value.reportsActiveFault !== undefined && { reportsActiveFault: value.reportsActiveFault }),
    parts, facts };
}

// A restart invalidates outstanding reviews. No document or provider key is retained here.
const reviewKey = randomBytes(32);
const reviewLifetimeMs = 30 * 60_000;

function signReview(fields: ReaderFindings, expires: number) {
  return createHmac('sha256', reviewKey).update(JSON.stringify([
    expires, fields.intakeId, fields.sender, fields.subject, fields.filename, fields.hasEmail, fields.extraction,
  ])).digest('base64url');
}

export function issueIntakeReview(source: IntakeSource, hasEmail: boolean, extraction: IntakeExtraction) {
  // readIntakeExtraction establishes the property order used when verifying the signature.
  const fields = { ...source, intakeId: randomUUID(), hasEmail, extraction };
  const expires = Date.now() + reviewLifetimeMs;
  return { ...fields, reviewReceipt: `${expires}.${signReview(fields, expires)}` };
}

export function verifyIntakeReview(body: unknown): ReaderFindings | { error: string } {
  const invalid = { error: 'The document review is invalid or has expired. Read the document again.' };
  if (!isRecord(body) || typeof body.intakeId !== 'string' || body.intakeId.length !== 36 ||
      typeof body.hasEmail !== 'boolean' || typeof body.reviewReceipt !== 'string') return invalid;
  const receipt = /^(\d{13})\.([A-Za-z0-9_-]{43})$/.exec(body.reviewReceipt);
  const expires = Number(receipt?.[1]);
  const source = readIntakeSource(body);
  const extraction = readIntakeExtraction(body.extraction);
  if (!receipt?.[2] || expires <= Date.now() || !source || !extraction) return invalid;
  const fields = { ...source, intakeId: body.intakeId, hasEmail: body.hasEmail, extraction };
  if (!timingSafeEqual(Buffer.from(signReview(fields, expires)), Buffer.from(receipt[2]))) return invalid;

  return fields;
}
