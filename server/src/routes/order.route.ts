import { Router } from "express";
import { orderController } from "../controllers/order.controller.js";

const router = Router();

router.post("/generate", orderController.generateDrafts);
router.get("/", orderController.listOrders); // ?status=PENDING_APPROVAL or ?status=SENT
router.post("/vessel/:id/measured-health", orderController.recordMeasuredHealth);
router.patch("/:id", orderController.updateDraft);
router.post("/:id/approve", orderController.approveOrder);
router.post("/:id/record-send", orderController.recordSend);
router.post("/:id/complete-repair", orderController.completeRepair);
router.post("/:id/reject", orderController.rejectOrder);

export default router;
