import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { collectDefaultMetrics, Registry, Counter, Histogram } from 'prom-client';

// ─── Prometheus Metrics ────────────────────────────────────────────────────────

const register = new Registry();
collectDefaultMetrics({ register });

const httpRequestCounter = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route'],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

// ─── App Factory ───────────────────────────────────────────────────────────────

export function createApp(): express.Application {
  const app = express();

  // ─── Core Middleware ──────────────────────────────────────────────────────────
  app.use(helmet());
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  }));
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));

  // ─── Request Tracking ─────────────────────────────────────────────────────────
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    const route = req.path;

    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      httpRequestCounter.labels(req.method, route, String(res.statusCode)).inc();
      httpRequestDuration.labels(req.method, route).observe(duration);
    });

    next();
  });

  // ─── Prometheus Metrics Endpoint ──────────────────────────────────────────────
  app.get('/metrics', async (_req, res) => {
    res.set('Content-Type', register.contentType);
    res.end(await register.metrics());
  });

  // ─── Health Check (root level, also defined in routes) ───────────────────────
  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'assignment-service',
      timestamp: new Date(),
    });
  });

  // ─── Routes ────────────────────────────────────────────────────────────────────
  // Routes are mounted at '/' since the router already has '/api/assignments' prefix
  const assignmentRouter = require('./routes/assignment.routes').default;
  app.use('/', assignmentRouter);

  // ─── 404 Handler ──────────────────────────────────────────────────────────────
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ success: false, error: 'Route not found' });
  });

  // ─── Global Error Handler ──────────────────────────────────────────────────────
  app.use((err: Error & { status?: number; code?: number }, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[ErrorHandler]', err.message, err.stack);

    // Mongoose validation error
    if (err.name === 'ValidationError') {
      res.status(400).json({ success: false, error: err.message });
      return;
    }

    // Mongoose duplicate key error
    if ((err as { code?: number }).code === 11000) {
      res.status(409).json({ success: false, error: 'Duplicate key error — resource already exists' });
      return;
    }

    // Mongoose cast error (bad ObjectId)
    if (err.name === 'CastError') {
      res.status(400).json({ success: false, error: 'Invalid ID format' });
      return;
    }

    const status = err.status || 500;
    res.status(status).json({
      success: false,
      error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    });
  });

  return app;
}
