import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import mongoose from 'mongoose';
import { collectDefaultMetrics, Registry, Counter, Histogram } from 'prom-client';
import issueRoutes from './routes/issue.routes';
import whatsappRoutes from './routes/whatsapp';

// ─── App Setup ────────────────────────────────────────────────────────────────
const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/issue_db';

// ─── Prometheus Metrics ───────────────────────────────────────────────────────
const register = new Registry();
collectDefaultMetrics({ register });

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [register],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [register],
});

// ─── Middleware ────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(morgan(process.env.NODE_ENV === 'test' ? 'silent' : 'combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Prometheus Instrumentation Middleware ─────────────────────────────────────
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path || req.path;
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    httpRequestDurationSeconds.observe(labels, duration);
  });
  next();
});

// ─── Health Endpoint ───────────────────────────────────────────────────────────
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'issue-service',
    timestamp: new Date(),
    mongo: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ─── Metrics Endpoint ─────────────────────────────────────────────────────────
app.get('/metrics', async (_req: Request, res: Response) => {
  res.set('Content-Type', register.contentType);
  res.end(await register.metrics());
});

// ─── API Routes ────────────────────────────────────────────────────────────────
app.use('/webhook/whatsapp', whatsappRoutes);
app.use('/api/issues/webhook/whatsapp', whatsappRoutes);
app.use('/api/issues', issueRoutes);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[issue-service] Unhandled error:', err);
  res.status(500).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── MongoDB Connection with Retry Logic ──────────────────────────────────────
const connectWithRetry = async (retries = 5, delay = 3000): Promise<void> => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      await mongoose.connect(MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log(`[issue-service] MongoDB connected: ${MONGO_URI}`);
      return;
    } catch (err) {
      console.error(`[issue-service] MongoDB connection attempt ${attempt}/${retries} failed:`, err);
      if (attempt < retries) {
        await new Promise((res) => setTimeout(res, delay));
      } else {
        throw new Error('Failed to connect to MongoDB after maximum retries');
      }
    }
  }
};

// ─── Start Server ─────────────────────────────────────────────────────────────
let server: ReturnType<typeof app.listen>;

const start = async (): Promise<void> => {
  if (process.env.NODE_ENV !== 'test') {
    await connectWithRetry();
    server = app.listen(PORT, () => {
      console.log(`[issue-service] Running on port ${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
    });
  }
};

start().catch((err) => {
  console.error('[issue-service] Fatal startup error:', err);
  process.exit(1);
});

// ─── Graceful Shutdown ────────────────────────────────────────────────────────
const gracefulShutdown = async (signal: string) => {
  console.log(`[issue-service] Received ${signal}. Shutting down gracefully...`);
  server?.close(async () => {
    await mongoose.connection.close();
    console.log('[issue-service] MongoDB connection closed. Server stopped.');
    process.exit(0);
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

export { app, connectWithRetry };
export default app;
