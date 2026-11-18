import { db } from '../../prisma/db.js';
import { draftSupplierEmails } from '../integrations/ai/orderAgent.js';
// import { sendSupplierEmail } from './email.service.js';

export type ExtractedPartInput = {
  partNumber: string;
  partName: string;
  quantity: number;
  notes?: string | null;
};

export const orderService = { 
  //!KOUKH EDW KANEIS DOULITSA  
  //Generate AI drafts from parsed PDF parts and persist them as PENDING_APPROVAL
  async generateDraftsFromReport(vesselId: number, extractedParts: ExtractedPartInput[]) {
    const vessel = await db.orm.Vessel.where((v) => v.id.eq(vesselId)).first();
    if (!vessel) {
      throw new Error(`Vessel with ID ${vesselId} not found`);
    }

    const suppliers = await db.orm.Supplier.all();
    const supplierMap = new Map(suppliers.map((s) => [s.id, s]));

    const agentResult = await draftSupplierEmails({
      vessel,
      extractedParts,
      suppliers,
    });

    const createdOrders = await db.transaction(async (tx) => {
      const orders = [];

      for (const draft of agentResult.drafts) {
        const order = await tx.orm.Order.create({
          vesselId: vessel.id,
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
          vessel,
          supplier: supplierMap.get(draft.supplierId) ?? null,
        });
      }

      return orders;
    });

    return createdOrders;
  },

  // 2. Fetch drafts filtered by status (defaults to PENDING_APPROVAL queue)
  async getOrdersByStatus(status = 'PENDING_APPROVAL') {
    return db.orm.Order
      .where((o) => o.status.eq(status))
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
    return db.orm.Order
      .where((o) => o.id.eq(id))
      .update({
        status: 'SENT',
        approvedAt: now,
        sentAt: now,
      });
  },

  // 6. Reject an unwanted draft
  async rejectOrder(id: number) {
    return db.orm.Order
      .where((o) => o.id.eq(id))
      .update({ status: 'REJECTED' });
  },
};