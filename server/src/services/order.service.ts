import { db } from '../../prisma/db.js';
import { draftSupplierEmails } from '../integrations/ai/orderAgent.js';
import type { AiCredentials } from '../integrations/ai/aiProvider.js';
import { sendSupplierEmail } from '../integrations/email/nodemailer.js';

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
        ? fns.or(o.status.eq('SENT'), o.status.eq('REPAIR_COMPLETED'))
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

  // 5. Approve -> Dispatch Email -> Mark as SENT
  async approveAndSend(id: number) {
    const order = await db.orm.Order
      .where((o) => o.id.eq(id))
      .include('supplier')
      .first();

    if (!order) {
      throw new Error(`Procurement order ${id} not found`);
    }

    if (order.status !== 'PENDING_APPROVAL') {
      throw new Error(`Order is already ${order.status}`);
    }

    // await sendSupplierEmail({
    //   to: order.supplier.email,
    //   subject: order.subject,
    //   body: order.body,
    // });

    const now = new Date();
    const updated = await db.orm.Order
      .where((o, { fns }) => fns.and(o.id.eq(id), o.status.eq('PENDING_APPROVAL')))
      .update({
        status: 'SENT',
        approvedAt: now,
        sentAt: now,
      });
    if (!updated) throw new Error('This draft is no longer awaiting approval.');
    return updated;
  },

  async completeRepair(id: number, measuredHealth: number, expectedHealth: number) {
    return db.transaction(async (tx) => {
      const order = await tx.orm.Order.where((row) => row.id.eq(id)).include('vessel').first();
      if (!order) return { status: 404, body: { error: 'Order not found.' } } as const;
      if (order.status !== 'SENT') {
        return { status: 409, body: { error: 'Only an approved order awaiting repair can be completed.' } } as const;
      }
      if (order.vessel.health !== expectedHealth) {
        return { status: 409, body: { error: 'Vessel health changed. Check the latest reading and try again.' } } as const;
      }

      const vessel = await tx.orm.Vessel.where((row) => row.id.eq(order.vesselId)).update({ health: measuredHealth });
      if (!vessel) throw new Error('The linked vessel no longer exists.');
      const completed = await tx.orm.Order.where((row, { fns }) =>
        fns.and(row.id.eq(id), row.status.eq('SENT'))).update({ status: 'REPAIR_COMPLETED' });
      if (!completed) throw new Error('The order is no longer awaiting repair.');
      return { status: 200, body: { vessel, orderId: completed.id } } as const;
    });
  },

  // 6. Reject an unwanted draft
  async rejectOrder(id: number) {
    return db.orm.Order
      .where((o, { fns }) => fns.and(o.id.eq(id), fns.or(
        o.status.eq('PENDING_APPROVAL'), o.status.eq('SENT'), o.status.eq('REJECTED'),
      )))
      .update({ status: 'REJECTED' });
  },
};
