import { isDeepStrictEqual } from 'node:util';
import { db } from '../../prisma/db.js';
import type { ReviewedIntake } from '../integrations/ai/documentReader.js';

type IntakeReceipt = { id: string; vesselId: number | null; category: string };
export type IntakeSaveResult =
  | { status: 200 | 201; body: IntakeReceipt }
  | { status: 404 | 409 | 503; body: { error: string } };

export async function saveReviewedIntake(input: ReviewedIntake): Promise<IntakeSaveResult> {
  const { intakeId: id, vesselId, sender, subject, filename, extraction } = input;
  const category = extraction.category;
  const data = { id, vesselId, sender, subject, filename, category, extraction };
  try {
    await db.orm.ReaderIntake.create(data);
    return { status: 201, body: { id, vesselId, category } };
  } catch (error) {
    // The SQLite driver normalizes uniqueness and foreign-key failures to SQLSTATE.
    // An ID identifies one immutable operator review, including across request retries.
    for (let cause = error; cause instanceof Error; cause = cause.cause) {
      if (/no such table:\s*(?:main\.)?ReaderIntake\b/i.test(cause.message)) {
        return { status: 503, body: { error: 'Reader storage is unavailable. Apply the ReaderIntake database update before saving.' } };
      }
      if (!('sqlState' in cause)) continue;
      if (cause.sqlState === '23503') {
        return { status: 404, body: { error: 'The selected vessel no longer exists.' } };
      }
      if (cause.sqlState === '23505') {
        const row = await db.orm.ReaderIntake.where((item) => item.id.eq(id)).first();
        if (row && row.vesselId === vesselId && row.sender === sender && row.subject === subject
            && row.filename === filename && row.category === category && isDeepStrictEqual(row.extraction, extraction)) {
          return { status: 200, body: { id, vesselId, category } };
        }
        return { status: 409, body: { error: 'This review was already saved with different details.' } };
      }
    }
    throw error;
  }
}
