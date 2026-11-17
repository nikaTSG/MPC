import { Router } from 'express';
import { vesselController } from '../controllers/vessel.controller.js';

const router = Router();

// Base path: /api/vessels
router.get('/', vesselController.getAll);
router.get('/:id', vesselController.getById);

export default router;