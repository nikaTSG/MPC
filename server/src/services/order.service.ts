import { db } from '../../prisma/db.js';
import { setTimeout as delay } from 'node:timers/promises';
import { draftSupplierEmails } from '../integrations/ai/orderAgent.js';
import type { AiCredentials } from '../integrations/ai/aiProvider.js';

export type RepairPort = { code: string | null; name: string; latitude: number; longitude: number };

export function readRepairPort(value: unknown): RepairPort | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const { code, name, latitude, longitude } = value as Record<string, unknown>;
  const normalizedCode = typeof code === 'string' ? code.trim().toUpperCase() : code;
  if ((normalizedCode !== null && (typeof normalizedCode !== 'string' || !/^[A-Z]{2}[A-Z0-9]{3}$/.test(normalizedCode))) ||
      typeof name !== 'string' || !name.trim() || name.length > 200 ||
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
};

async function prepareSupplierDrafts(
  vesselId: number,
  extractedParts: ExtractedPartInput[],
  credentials: AiCredentials,
) {
  const vessel = await db.orm.Vessel.where((v) => v.id.eq(vesselId)).first();
  if (!vessel) {
    throw new Error(`Vessel with ID ${vesselId} not found`);
  }

  const suppliers = await db.orm.Supplier.all();
  const agentResult = await draftSupplierEmails({ vessel, extractedParts, suppliers }, credentials);
  return { vessel, suppliers, drafts: agentResult.drafts };
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
      body: draft.body,
      items: draft.matchedParts.map((part) => ({
        partNumber: part.partNumber,
        partName: part.partName,
        quantity: part.quantity,
        notes: part.notes ?? null,
      })),
      urgency: draft.urgency,
      status: 'PENDING_APPROVAL',
    });

    orders.push({
      ...order,
      vessel: vesselForResponse,
      supplier: supplierMap.get(draft.supplierId) ?? null,
    });
  }

  return orders;
}

export const orderService = {
  //!KOUKH EDW KANEIS DOULITSA
  //Generate AI drafts from parsed PDF parts and persist them as PENDING_APPROVAL
  async generateDraftsFromReport(
    vesselId: number,
    extractedParts: ExtractedPartInput[],
    credentials: AiCredentials,
  ) {
    const prepared = await prepareSupplierDrafts(vesselId, extractedParts, credentials);
    return db.transaction((tx) =>
      persistPreparedSupplierDrafts(prepared, (input) => tx.orm.Order.create(input)),
    );
  },

  async prepareDraftsFromReport(
    vesselId: number,
    extractedParts: ExtractedPartInput[],
    credentials: AiCredentials,
  ) {
    return prepareSupplierDrafts(vesselId, extractedParts, credentials);
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
    return db.orm.Order
      .where((o) => o.id.eq(id))
      .update(data);
  },

  async approveOrder(id: number) {
    const updated = await db.orm.Order
      .where((o, { fns }) => fns.and(o.id.eq(id), o.status.eq('PENDING_APPROVAL')))
      .update({ status: 'APPROVED', approvedAt: new Date() });
    if (!updated) throw new Error('This draft is no longer awaiting approval.');
    return updated;
  },

  async recordSend(id: number, requestedPort?: RepairPort) {
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
      if (order.repairPort !== null && !storedPort) throw new Error('Invalid stored repair port.');
      if (requestedPort && storedPort && (requestedPort.code !== storedPort.code || requestedPort.name !== storedPort.name ||
          requestedPort.latitude !== storedPort.latitude || requestedPort.longitude !== storedPort.longitude)) {
        return { status: 409, body: { error: 'A different repair port was already selected for this fault.' } } as const;
      }

      const { repairFaultId } = order;
      const related = tx.orm.Order.where((row, { fns }) => repairFaultId === null ? row.id.eq(id) :
        fns.and(row.vesselId.eq(order.vesselId), row.repairFaultId.eq(repairFaultId)));
      const now = new Date();
      const sent = await tx.orm.Order.where((row, { fns }) => fns.and(row.id.eq(id), row.externalSentAt.isNull()))
        .update({ status: order.status === 'REPAIR_COMPLETED' ? order.status : 'SENT', externalSentAt: now, sentAt: now });
      if (!sent) throw new Error('The external send could not be recorded.');
      if (requestedPort && !storedPort) await related.updateAll({ repairPort: requestedPort });

      const group = await related.select('status', 'externalSentAt').all();
      const dispatchPending = group.some((rfq) => rfq.externalSentAt === null || rfq.status === 'REJECTED');
      const port = storedPort ?? requestedPort;
      if (dispatchPending || !port) {
        return { status: 200, body: { vessel: order.vessel, diverted: false, dispatchPending } } as const;
      }
      const vessel = await tx.orm.Vessel.where((row) => row.id.eq(order.vesselId))
        .update({ destinationPortCode: port.code, repairDestination: port, eta: null });
      if (!vessel) throw new Error('The linked vessel no longer exists.');
      return { status: 200, body: { vessel, diverted: true, dispatchPending: false } } as const;
    }));
  },

  async completeRepair(id: number, measurement?: { measuredHealth: number; expectedHealth: number }) {
    return retryOrderTransaction(() => db.transaction(async (tx) => {
      const order = await tx.orm.Order.where((row) => row.id.eq(id)).include('vessel').first();
      if (!order) return { status: 404, body: { error: 'Order not found.' } } as const;
      if (order.status !== 'APPROVED' && order.status !== 'SENT') {
        return { status: 409, body: { error: 'Only an approved order awaiting repair can be completed.' } } as const;
      }
      const { repairHealthLoss, repairFaultId } = order;
      const restoresRecordedLoss = repairFaultId !== null && repairHealthLoss !== null;
      let health: number;
      if (restoresRecordedLoss) {
        if (measurement) {
          return { status: 400, body: { error: 'Complete this repair without a measurement to restore its recorded health loss.' } } as const;
        }
        health = Math.min(100, order.vessel.health + repairHealthLoss);
      } else {
        if (!measurement) {
          return { status: 400, body: { error: 'This repair requires a measured health percentage and the previous reading.' } } as const;
        }
        if (order.vessel.health !== measurement.expectedHealth) {
          return { status: 409, body: { error: 'Vessel health changed. Check the latest reading and try again.' } } as const;
        }
        health = measurement.measuredHealth;
      }

      const completed = await tx.orm.Order.where((row, { fns }) =>
        fns.and(row.id.eq(id), row.status.eq(order.status))).update({ status: 'REPAIR_COMPLETED' });
      if (!completed) throw new Error('The order is no longer awaiting repair.');

      if (restoresRecordedLoss) {
        const unfinished = await tx.orm.Order.select('id').where((row, { fns }) => fns.and(
          row.repairFaultId.eq(repairFaultId), row.status.neq('REPAIR_COMPLETED'),
        )).first();
        if (unfinished) {
          return { status: 200, body: { vessel: order.vessel, orderId: completed.id, restorationPending: true } } as const;
        }
      }
      const vessel = await tx.orm.Vessel.where((row) => row.id.eq(order.vesselId)).update({ health });
      if (!vessel) throw new Error('The linked vessel no longer exists.');
      return { status: 200, body: { vessel, orderId: completed.id, restorationPending: false } } as const;
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
