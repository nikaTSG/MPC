import { db } from '../../prisma/db.js';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { draftSupplierEmails } from '../integrations/ai/orderAgent.js';
import type { AiCredentials } from '../integrations/ai/aiProvider.js';

export type RepairPort = { code: string | null; name: string; latitude: number; longitude: number };

export function readRepairPort(value: unknown): RepairPort | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { code, name, latitude, longitude } = value as Record<string, unknown>;
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : code;
  if ((normalizedCode !== null && (typeof normalizedCode !== 'string' || !/^[A-Z]{2}[A-Z0-9]{3}$/.test(normalizedCode))) ||
      typeof name !== 'string' || !name.trim() || name.length > 200 || /[\x00-\x1f\x7f\u2028\u2029]/.test(name) ||
      typeof latitude !== 'number' || !Number.isFinite(latitude) || Math.abs(latitude) > 90 ||
      typeof longitude !== 'number' || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { code: normalizedCode, name: name.trim(), latitude, longitude };
}

export type ExtractedPartInput = {
  partNumber: string;
  partName: string;
  quantity: number;
  notes?: string | null;
};

type OrderCreateInput = {
  vesselId: number;
  supplierId: number;
  subject: string;
  body: string;
  items: ExtractedPartInput[];
  urgency: 'LOW' | 'NORMAL' | 'CRITICAL';
  status: 'PENDING_APPROVAL';
  repairPort?: RepairPort;
};

async function prepareSupplierDrafts(
  vesselId: number,
  extractedParts: ExtractedPartInput[],
  credentials: AiCredentials,
  repairPort?: RepairPort,
) {
  const vessel = await db.orm.Vessel.where((v) => v.id.eq(vesselId)).first();
  if (!vessel) {
    throw new Error(`Vessel with ID ${vesselId} not found`);
  }

  const suppliers = await db.orm.Supplier.all();
  const selection = repairPort ? { repairPort } : {};
  const agentResult = await draftSupplierEmails({ vessel, extractedParts, suppliers, ...selection }, credentials);
  return { vessel, suppliers, drafts: agentResult.drafts, ...selection };
}

export type PreparedSupplierDrafts = Awaited<ReturnType<typeof prepareSupplierDrafts>>;

function isSqliteBusy(error: unknown): boolean {
  for (let cause = error; cause instanceof Error; cause = cause.cause) {
    // SQLite's extended BUSY codes share the same primary result code (5).
    if ('errcode' in cause && typeof cause.errcode === 'number' && (cause.errcode & 255) === 5) return true;
  }
  return false;
}

// SQLite readers can conflict when upgrading to a writer. Re-read each order
// and its siblings in a fresh transaction after the winner commits.
async function retryOrderTransaction<T>(operation: () => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!isSqliteBusy(error)) throw error;
      if (attempt === 3) return { status: 503, body: { error: 'Another update is in progress. Retry the request.' } } as const;
      await delay(10 * 2 ** attempt);
    }
  }
}

async function persistPreparedSupplierDrafts<Order extends object>(
  prepared: PreparedSupplierDrafts,
  createOrder: (input: OrderCreateInput) => Promise<Order>,
  vesselForResponse: PreparedSupplierDrafts['vessel'] = prepared.vessel,
) {
  const supplierMap = new Map(prepared.suppliers.map((supplier) => [supplier.id, supplier]));
  const orders = [];

  for (const draft of prepared.drafts) {
    const order = await createOrder({
      vesselId: prepared.vessel.id,
      supplierId: draft.supplierId,
      subject: draft.subject,
      body: prepared.repairPort ? withDeliveryPort(draft.body, prepared.repairPort) : draft.body,
      items: draft.matchedParts.map((part) => ({
        partNumber: part.partNumber,
        partName: part.partName,
        quantity: part.quantity,
        notes: part.notes ?? null,
      })),
      urgency: draft.urgency,
      status: 'PENDING_APPROVAL',
      ...(prepared.repairPort && { repairPort: prepared.repairPort }),
    });

    orders.push({
      ...order,
      vessel: vesselForResponse,
      supplier: supplierMap.get(draft.supplierId) ?? null,
    });
  }

  return orders;
}

const OPEN_ORDER_STATUSES = ['PENDING_APPROVAL', 'APPROVED', 'SENT'];

function samePort(left: RepairPort, right: RepairPort | null) {
  return right !== null && left.code === right.code && left.name === right.name &&
    left.latitude === right.latitude && left.longitude === right.longitude;
}

function deliveryPortLine(port: RepairPort) {
  return `RFQ delivery port: ${port.name}${port.code ? ` (${port.code})` : ''}`;
}

function withDeliveryPort(body: string, port: RepairPort) {
  // The first line belongs to the saved delivery selection, including after a pending draft edit.
  const editableText = body.replace(/^RFQ delivery port:[^\n]*(?:\n|$)/i, '').trim();
  return `${deliveryPortLine(port)}\n\n${editableText}`.trimEnd();
}

export const orderService = {
  //!KOUKH EDW KANEIS DOULITSA
  //Generate AI drafts from parsed PDF parts and persist them as PENDING_APPROVAL
  async generateDraftsFromReport(
    vesselId: number,
    extractedParts: ExtractedPartInput[],
    credentials: AiCredentials,
    repairPort?: RepairPort,
  ) {
    const prepared = await prepareSupplierDrafts(vesselId, extractedParts, credentials, repairPort);
    const repairFaultId = randomUUID();
    return db.transaction((tx) =>
      persistPreparedSupplierDrafts(prepared, (input) => tx.orm.Order.create({ ...input, repairFaultId })),
    );
  },

  async prepareDraftsFromReport(
    vesselId: number,
    extractedParts: ExtractedPartInput[],
    credentials: AiCredentials,
    repairPort?: RepairPort,
  ) {
    return prepareSupplierDrafts(vesselId, extractedParts, credentials, repairPort);
  },

  async persistPreparedDrafts<Order extends object>(
    prepared: PreparedSupplierDrafts,
    createOrder: (input: OrderCreateInput) => Promise<Order>,
    vesselForResponse: PreparedSupplierDrafts['vessel'] = prepared.vessel,
  ) {
    return persistPreparedSupplierDrafts(prepared, createOrder, vesselForResponse);
  },

  // 2. Fetch drafts filtered by status (defaults to PENDING_APPROVAL queue)
  async getOrdersByStatus(status = 'PENDING_APPROVAL') {
    return db.orm.Order
      .where((o, { fns }) => status === 'REPAIRS'
        ? fns.or(o.status.eq('APPROVED'), o.status.eq('SENT'), o.status.eq('REPAIR_COMPLETED'))
        : o.status.eq(status))
      .include('supplier')
      .include('vessel')
      .orderBy((o) => o.createdAt.desc())
      .all();
  },

  // 3. Fetch a single order by ID
  async getOrderById(id: number) {
    return db.orm.Order
      .where((o) => o.id.eq(id))
      .include('supplier')
      .include('vessel')
      .first();
  },

  // 4. Edit draft subject/body before operator approval
  async updateDraft(id: number, data: { subject?: string; body?: string }) {
    const pending = db.orm.Order.where((o, { fns }) => fns.and(o.id.eq(id), o.status.eq('PENDING_APPROVAL')));
    if (data.body !== undefined) {
      const order = await pending.select('repairPort').first();
      if (!order) return null;
      const port = readRepairPort(order.repairPort);
      if (port) data = { ...data, body: withDeliveryPort(data.body, port) };
    }
    // Recheck status in this write in case the approval happened while preparing the text.
    return pending.update(data);
  },

  async approveOrder(id: number) {
    const updated = await db.orm.Order
      .where((o, { fns }) => fns.and(o.id.eq(id), o.status.eq('PENDING_APPROVAL')))
      .update({ status: 'APPROVED', approvedAt: new Date() });
    if (!updated) throw new Error('This draft is no longer awaiting approval.');
    return updated;
  },

  async recordSend(id: number) {
    return retryOrderTransaction(() => db.transaction(async (tx) => {
      const order = await tx.orm.Order.where((row) => row.id.eq(id)).include('vessel').first();
      if (!order) return { status: 404, body: { error: 'Order not found.' } } as const;
      if (order.externalSentAt !== null) {
        return { status: 409, body: { error: 'External sending was already recorded for this RFQ.' } } as const;
      }
      if (!['APPROVED', 'SENT', 'REPAIR_COMPLETED'].includes(order.status)) {
        return { status: 409, body: { error: 'Approve the RFQ before recording an external send.' } } as const;
      }

      const storedPort = readRepairPort(order.repairPort);

      const { repairFaultId } = order;
      const related = tx.orm.Order.where((row, { fns }) => repairFaultId === null ? row.id.eq(id) :
        fns.and(row.vesselId.eq(order.vesselId), row.repairFaultId.eq(repairFaultId)));
      const now = new Date();
      const sent = await tx.orm.Order.where((row, { fns }) => fns.and(row.id.eq(id), row.externalSentAt.isNull()))
        .update({ status: order.status === 'REPAIR_COMPLETED' ? order.status : 'SENT', externalSentAt: now, sentAt: order.sentAt ?? now });
      if (!sent) throw new Error('The external send could not be recorded.');

      const group = await related.select('status', 'externalSentAt', 'repairPort', 'body').all();
      const activeRepairs = group.some(row => row.status !== 'REPAIR_COMPLETED' && row.status !== 'REJECTED');
      const rejected = group.some(row => row.status === 'REJECTED');
      const dispatchPending = activeRepairs && !rejected && group.some(row => row.externalSentAt === null);
      if (!activeRepairs || rejected || dispatchPending || !storedPort ||
          !group.every(row => samePort(storedPort, readRepairPort(row.repairPort)) &&
            row.body.split('\n', 1)[0] === deliveryPortLine(storedPort))) {
        return { status: 200, body: { vessel: order.vessel, diverted: false, dispatchPending } } as const;
      }
      const vessel = await tx.orm.Vessel.where((row) => row.id.eq(order.vesselId))
        .update({ destinationPortCode: storedPort.code, repairDestination: storedPort, eta: null });
      if (!vessel) throw new Error('The linked vessel no longer exists.');
      return { status: 200, body: { vessel, diverted: true, dispatchPending: false } } as const;
    }));
  },

  async completeRepair(id: number) {
    return retryOrderTransaction(() => db.transaction(async (tx) => {
      const order = await tx.orm.Order.where((row) => row.id.eq(id)).include('vessel').first();
      if (!order) return { status: 404, body: { error: 'Order not found.' } } as const;
      if (order.status !== 'APPROVED' && order.status !== 'SENT') {
        return { status: 409, body: { error: 'Only an approved order awaiting repair can be completed.' } } as const;
      }
      const completed = await tx.orm.Order.where((row, { fns }) =>
        fns.and(row.id.eq(id), row.status.eq(order.status))).update({ status: 'REPAIR_COMPLETED' });
      if (!completed) throw new Error('The order is no longer awaiting repair.');

      const unfinished = await tx.orm.Order.select('id').where((row, { fns }) => fns.and(
        row.vesselId.eq(order.vesselId), row.status.in(OPEN_ORDER_STATUSES),
      )).first();
      if (unfinished) {
        return { status: 200, body: { vessel: order.vessel, orderId: completed.id, restorationPending: true } } as const;
      }
      const vessel = await tx.orm.Vessel.where((row) => row.id.eq(order.vesselId)).update({ health: 100 });
      if (!vessel) throw new Error('The linked vessel no longer exists.');
      return { status: 200, body: { vessel, orderId: completed.id, restorationPending: false } } as const;
    }));
  },

  async recordMeasuredHealth(vesselId: number, measurement: { expectedHealth: number; measuredHealth: number }) {
    return retryOrderTransaction(() => db.transaction(async (tx) => {
      const pending = await tx.orm.Order.select('id').where((row, { fns }) => fns.and(
        row.vesselId.eq(vesselId),
        row.status.in(OPEN_ORDER_STATUSES),
      )).first();
      if (pending) return {
        status: 409, body: { error: 'Finish the vessel’s open orders before recording hull health here.' },
      } as const;

      const vessel = await tx.orm.Vessel
        .where((row, { fns }) => fns.and(row.id.eq(vesselId), row.health.eq(measurement.expectedHealth)))
        .update({ health: measurement.measuredHealth });
      if (vessel) return { status: 200, body: { vessel } } as const;
      const existing = await tx.orm.Vessel.select('id').where(row => row.id.eq(vesselId)).first();
      return existing
        ? { status: 409, body: { error: 'Vessel health changed. Check the latest reading and try again.' } } as const
        : { status: 404, body: { error: 'Vessel not found.' } } as const;
    }));
  },

  // 6. Reject an unwanted draft
  async rejectOrder(id: number) {
    return db.orm.Order
      .where((o, { fns }) => fns.and(o.id.eq(id), o.externalSentAt.isNull(), fns.or(
        o.status.eq('PENDING_APPROVAL'), o.status.eq('APPROVED'), o.status.eq('SENT'), o.status.eq('REJECTED'),
      )))
      .update({ status: 'REJECTED' });
  },
};
