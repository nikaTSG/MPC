import { Router, type Request, type Response } from 'express';
import { vesselController } from '../controllers/vessel.controller.js';

const router = Router();

function isSameOriginPost(request: Request): boolean {
  const originHeader = request.get('origin');
  if (originHeader === undefined) return true;

  const host = request.get('host');
  if (!host || originHeader.length === 0 || originHeader.length > 2048 || originHeader.toLowerCase() === 'null') {
    return false;
  }

  try {
    const origin = new URL(originHeader);
    return (
      (origin.protocol === 'http:' || origin.protocol === 'https:') &&
      origin.username.length === 0 &&
      origin.password.length === 0 &&
      origin.pathname === '/' &&
      origin.search.length === 0 &&
      origin.hash.length === 0 &&
      origin.host.toLowerCase() === host.toLowerCase()
    );
  } catch {
    return false;
  }
}

function validateCreateRequest(request: Request, response: Response, next: (error?: unknown) => void) {
  if (!isSameOriginPost(request)) {
    return response.status(403).json({
      success: false,
      message: 'Origin must match the host serving MPC.',
    });
  }

  if (!request.is('application/json')) {
    return response.status(415).json({
      success: false,
      message: 'Content-Type must be application/json.',
    });
  }

  return next();
}

// Base path: /api/v1/vessels
router.post('/', validateCreateRequest, vesselController.create);
router.get('/', vesselController.getAll);
router.get('/:id', vesselController.getById);

export default router;
