// server/src/routes/index.ts
import { Router } from 'express';
import vesselRoutes from './vessel.route.js';
//import agentRoutes from './agent.routes.js';
//import orderRoutes from './order.routes.js';

const router = Router();

router.use('/vessels', vesselRoutes);
//router.use('/agent', agentRoutes);
//router.use('/orders', orderRoutes);

export default router;