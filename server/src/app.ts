import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import { db } from '../prisma/db.js';
import { requestAiText, streamAiText } from './integrations/ai/aiProvider.js';
import apiRoutes from './routes/index.js';
import { createAiRouter, isAuthorizedBrowserPost, isLocalBrowserRequest } from './routes/ai.route.js';
import { orderService } from './services/order.service.js';
import { reportService } from './services/report.service.js';
import { processReviewedIntake, recentReviewedIntakes, saveReviewedIntake } from './services/intake.service.js';
//import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use('/api/v1/orders', (request, response, next) => {
  const site = request.get('sec-fetch-site');
  const read = request.method === 'GET' || request.method === 'HEAD';
  if (
    !isLocalBrowserRequest(request) ||
    (site && site !== 'same-origin' && site !== 'none') ||
    ((!read || request.get('origin') !== undefined) && !isAuthorizedBrowserPost(request))
  ) {
    response.status(403).json({ error: 'Procurement is available only from the local MPC dashboard.' });
    return;
  }
  next();
});
app.use(cors());
app.use('/api/v1/ai', createAiRouter({
  requestAiText,
  streamAiText,
  saveReviewedIntake,
  processReviewedIntake,
  recentReviewedIntakes,
  generateDrafts: (vesselId, extractedParts, credentials, repairPort) =>
    orderService.generateDraftsFromReport(vesselId, extractedParts, credentials, repairPort),
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

if (process.env.NODE_ENV === 'production') {
  const clientDistPath = process.env.CLIENT_DIST_PATH
    ? path.resolve(process.env.CLIENT_DIST_PATH)
    : path.resolve(process.cwd(), '../client/dist');

  if (fs.existsSync(clientDistPath)) {
    app.use(express.static(clientDistPath));

    app.use((req, res, next) => {
      if (req.method !== 'GET' || req.path.startsWith('/api')) return next();
      res.sendFile(path.join(clientDistPath, 'index.html'));
    });
  }
}

//app.use(errorHandler);

export default app;