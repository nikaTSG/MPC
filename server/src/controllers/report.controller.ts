import type { Request, Response } from 'express';

export const reportController = {
  ingestReport(_req: Request, res: Response) {
    return res.redirect(307, '/api/v1/ai/report');
  },
};
