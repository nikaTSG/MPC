import { isDeepStrictEqual } from 'node:util';
import { db } from '../../prisma/db.js';
import type { AiCredentials } from '../integrations/ai/aiProvider.js';
import { readIntakeExtraction, type IntakeExtraction, type ReviewedIntake } from '../integrations/ai/documentReader.js';
import { orderService, type ExtractedPartInput } from './order.service.js';

type IntakeReceipt = { id: string; vesselId: number | null; category: string };
type ProcessReceipt = IntakeReceipt & { draftCount: number };
type IntakeError = { status: 404 | 409 | 503; body: { error: string } };
export type IntakeSaveResult = { status: 200 | 201; body: IntakeReceipt } | IntakeError;
export type IntakeProcessResult = { status: 200 | 201; body: ProcessReceipt } | IntakeError;
type RecentIntake = IntakeReceipt & {
  subject: string | null;
  filename: string | null;
  createdAt: string;
  extraction?: IntakeExtraction | null;
  extractionLimited?: boolean;
};
export type RecentIntakeResult =
  | { status: 200; body: { records: RecentIntake[]; latestEmail: RecentIntake | null } }
  | { status: 503; body: { error: string } };

const storageUnavailable = {
  status: 503 as const,
  body: { error: 'Reader storage is unavailable. Apply the ReaderIntake database update.' },
};

function storageFailure(error: unknown) {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    if (/no such table:\s*(?:main\.)?ReaderIntake\b/i.test(cause.message)) return 'missingTable';
    if ('sqlState' in cause && (cause.sqlState === '23503' || cause.sqlState === '23505')) return cause.sqlState;
  }
  return null;
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function previousReview(input: ReviewedIntake): Promise<IntakeProcessResult | null> {
  const row = await db.orm.ReaderIntake.where((item) => item.id.eq(input.intakeId)).first();
  if (!row) return null;

  if (isJsonObject(row.extraction)) {
    // Earlier manual saves contain just the extraction and created no orders.
    const { draftCount = 0, ...extraction } = row.extraction;
    if (row.vesselId === input.vesselId && row.sender === input.sender && row.subject === input.subject &&
        row.filename === input.filename && row.category === input.extraction.category &&
        typeof draftCount === 'number' && Number.isSafeInteger(draftCount) && draftCount >= 0 &&
        isDeepStrictEqual(extraction, input.extraction)) {
      return { status: 200, body: { id: row.id, vesselId: row.vesselId, category: row.category, draftCount } };
    }
  }
  return { status: 409, body: { error: 'This review was already saved with different details.' } };
}

async function storeIntake(input: ReviewedIntake, credentials?: AiCredentials): Promise<IntakeProcessResult> {
  const { intakeId: id, vesselId, sender, subject, filename, extraction } = input;
  const category = extraction.category;
  const data = { id, vesselId, sender, subject, filename, category, extraction };

  try {
    if (credentials) {
      // Check before looking up suppliers or using the provider on a retry.
      const existing = await previousReview(input);
      if (existing) return existing;
    }
    if (credentials && vesselId !== null && category === 'DEFECT_REPORT') {
      const parts = extraction.parts.flatMap((part): ExtractedPartInput[] =>
        part.partNumber && part.quantity !== null ? [{ ...part, partNumber: part.partNumber, quantity: part.quantity }] : [],
      );
      if (parts.length) {
        // Match against the current catalog before taking the SQLite write lock.
        const prepared = await orderService.prepareDraftsFromReport(vesselId, parts, credentials);
        const draftCount = prepared.drafts.length;
        await db.transaction(async (tx) => {
          // The intake primary key claims the review before any orders are inserted.
          await tx.orm.ReaderIntake.create({ ...data, extraction: { ...extraction, draftCount } });
          try {
            await orderService.persistPreparedDrafts(prepared, (order) => tx.orm.Order.create(order));
          } catch (error) {
            if (storageFailure(error) === '23503') throw new CatalogChangedError();
            throw error;
          }
        });
        return { status: 201, body: { id, vesselId, category, draftCount } };
      }
    }
    await db.orm.ReaderIntake.create(data);
    return { status: 201, body: { id, vesselId, category, draftCount: 0 } };
  } catch (error) {
    const failure = storageFailure(error);
    if (failure === 'missingTable') return storageUnavailable;
    if (failure === '23503' || (error instanceof Error && error.message === `Vessel with ID ${vesselId} not found`)) {
      return { status: 404, body: { error: 'The selected vessel no longer exists.' } };
    }
    if (error instanceof CatalogChangedError) {
      return { status: 409, body: { error: 'A selected supplier no longer exists. Retry to match the current catalog.' } };
    }
    if (failure === '23505') {
      const existing = await previousReview(input);
      if (existing) return existing;
    }
    throw error;
  }
}

class CatalogChangedError extends Error {}

export function processReviewedIntake(input: ReviewedIntake, credentials: AiCredentials): Promise<IntakeProcessResult> {
  return storeIntake(input, credentials);
}

export async function saveReviewedIntake(input: ReviewedIntake): Promise<IntakeSaveResult> {
  const result = await storeIntake(input);
  if (result.status !== 200 && result.status !== 201) return result;
  const { id, vesselId, category } = result.body;
  return { status: result.status, body: { id, vesselId, category } };
}

function fitExtraction(extraction: IntakeExtraction | null) {
  if (!extraction || JSON.stringify(extraction).length <= 2_000) return { extraction };
  function fitItems<T>(items: T[]) {
    const included: T[] = [];
    let remaining = 650;
    for (const item of items) {
      const size = JSON.stringify(item).length + 1;
      if (size > remaining) continue;
      included.push(item);
      remaining -= size;
    }
    return included;
  }
  return {
    extraction: {
      ...extraction, summary: extraction.summary.slice(0, 500),
      facts: fitItems(extraction.facts), parts: fitItems(extraction.parts),
    },
    extractionLimited: true,
  };
}

export async function recentReviewedIntakes(includeExtraction = false): Promise<RecentIntakeResult> {
  try {
    const { records, latestEmail } = await db.transaction(async (tx) => {
      const summaries = tx.orm.ReaderIntake.select('id', 'vesselId', 'category', 'subject', 'filename', 'createdAt', 'extraction')
        .orderBy([(item) => item.createdAt.desc(), (item) => item.id.desc()]);
      const records = await summaries.limit(5).all();
      // Older reviews have no source-kind column. Email headers or a plain text submission
      // identify email records; an attachment alone could be a standalone document.
      const latestEmail = await summaries.where((item, { fns }) => fns.or(
        item.subject.isNotNull(), item.sender.isNotNull(), item.filename.isNull(),
      )).first();
      return { records, latestEmail };
    });
    const serialize = ({ extraction, createdAt, ...metadata }: typeof records[number]): RecentIntake => ({
      ...metadata, createdAt: createdAt.toISOString(),
      ...(includeExtraction ? fitExtraction(readIntakeExtraction(extraction)) : {}),
    });
    return { status: 200, body: { records: records.map(serialize), latestEmail: latestEmail ? serialize(latestEmail) : null } };
  } catch (error) {
    if (storageFailure(error) === 'missingTable') return storageUnavailable;
    throw error;
  }
}
