import express from 'express';
import cors from 'cors';
import { db } from '../prisma/db.js';
import apiRoutes from './routes/index.js';
//import { errorHandler } from './middlewares/errorHandler.js';

const app = express();

app.use(cors());
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