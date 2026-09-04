import { Router, Request, Response } from 'express';

const router = Router();

/**
 * GET /health
 * Simple liveness probe for Docker, Kubernetes, and load balancers.
 */
router.get('/', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    service: 'citizen-service',
    uptime: process.uptime(),
    timestamp: new Date(),
  });
});

export default router;
