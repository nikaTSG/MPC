import { Router } from 'express';
import { reportController } from '../controllers/report.controller.js';

const router = Router();

//POST /api/v1/reports 
//Ingests fault report (apton kouki), drops ship health, and drafts RFQs
router.post('/', reportController.ingestReport);

export default router;