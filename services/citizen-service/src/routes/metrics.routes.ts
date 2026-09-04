import { Router, Request, Response } from 'express';
import client from 'prom-client';

const router = Router();

// Collect default Node.js process metrics (memory, CPU, event loop lag, etc.)
client.collectDefaultMetrics({ prefix: 'citizen_service_' });

/**
 * GET /metrics
 * Exposes Prometheus-compatible metrics for scraping.
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const metrics = await client.register.metrics();
    res.set('Content-Type', client.register.contentType);
    res.status(200).send(metrics);
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to collect metrics' });
  }
});

export default router;
