import { Router } from 'express';
import vesselRoutes from './vessel.route.js';
//import agentRoutes from './agent.routes.js';
import orderRoutes from './order.route.js';
import reportRoutes from './report.route.js';

const router = Router();

router.use('/vessels', vesselRoutes);
//router.use('/agent', agentRoutes);
router.use('/orders', orderRoutes);
router.use('/reports', reportRoutes);

export default router;