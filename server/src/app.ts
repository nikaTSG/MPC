import express from 'express';
import cors from 'cors';
import { db } from '../prisma/db.js';
import { requestAiText, streamAiText } from './integrations/ai/aiProvider.js';
import apiRoutes from './routes/index.js';
import { createAiRouter } from './routes/ai.route.js';
import { orderService } from './services/order.service.js';
import { reportService } from './services/report.service.js';
//import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(cors());
app.use('/api/v1/ai', createAiRouter({
  requestAiText,
  streamAiText,
  generateDrafts: (vesselId, extractedParts, credentials) =>
    orderService.generateDraftsFromReport(vesselId, extractedParts, credentials),
  processFaultReport: (input, credentials) => reportService.processFaultReport(input, credentials),
}));
app.use(express.json());

app.get('/api/health', async (_req, res, next) => {
  try {
    const vessels = await db.orm.Vessel.all();
    res.json({ ok: true, vessels });
  } catch (error) {
    next(error);
  }
});

app.use('/api/v1', apiRoutes);
//app.use(errorHandler);

export default app;
