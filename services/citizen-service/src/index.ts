import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';

import { connectDatabase } from './config/database';
import healthRouter from './routes/health.routes';
import metricsRouter from './routes/metrics.routes';
import citizenRouter from './routes/citizen.routes';

const app = express();

// ─── Security & Utility Middleware ────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/health', healthRouter);
app.use('/metrics', metricsRouter);
app.use('/api/citizens', citizenRouter);

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req: Request, res: Response) => {
  res.status(404).json({ success: false, error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(`[citizen-service] Unhandled error: ${err.message}`, err.stack);

  // Mongoose duplicate-key error
  if ((err as NodeJS.ErrnoException).name === 'MongoServerError' && (err as any).code === 11000) {
    res.status(409).json({ success: false, error: 'Duplicate key: resource already exists' });
    return;
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    res.status(422).json({ success: false, error: err.message });
    return;
  }

  // Mongoose CastError (bad ObjectId)
  if (err.name === 'CastError') {
    res.status(400).json({ success: false, error: 'Invalid ID format' });
    return;
  }

  const statusCode = (err as any).status ?? (err as any).statusCode ?? 500;
  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT ?? '3001', 10);
const MONGO_URI = process.env.MONGO_URI ?? 'mongodb://localhost:27017/citizen_db';

async function bootstrap(): Promise<void> {
  await connectDatabase(MONGO_URI);

  app.listen(PORT, () => {
    console.log(
      `[citizen-service] Service started on port ${PORT} | env=${process.env.NODE_ENV ?? 'development'}`,
    );
  });
}

bootstrap().catch((err) => {
  console.error('[citizen-service] Fatal bootstrap error:', err);
  process.exit(1);
});

export default app; // Exported for testing
