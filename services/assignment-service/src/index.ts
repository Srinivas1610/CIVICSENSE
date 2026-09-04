import 'dotenv/config';
import mongoose from 'mongoose';
import { createApp } from './app';
import { startEscalationCron, stopEscalationCron } from './services/escalation.service';

const PORT = parseInt(process.env.PORT || '3003', 10);
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/assignment_db';

async function start(): Promise<void> {
  try {
    // ─── Connect to MongoDB ─────────────────────────────────────────────────────
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });
    console.log('[Server] MongoDB connected:', MONGO_URI);

    // ─── Start Escalation Cron ──────────────────────────────────────────────────
    if (process.env.NODE_ENV !== 'test') {
      startEscalationCron();
    }

    // ─── Start HTTP Server ──────────────────────────────────────────────────────
    const app = createApp();
    const server = app.listen(PORT, () => {
      console.log(`[Server] assignment-service running on port ${PORT}`);
      console.log(`[Server] Environment: ${process.env.NODE_ENV || 'development'}`);
    });

    // ─── Graceful Shutdown ──────────────────────────────────────────────────────
    const shutdown = async (signal: string): Promise<void> => {
      console.log(`[Server] ${signal} received — shutting down gracefully...`);
      stopEscalationCron();
      server.close(async () => {
        await mongoose.connection.close();
        console.log('[Server] MongoDB connection closed. Exiting.');
        process.exit(0);
      });

      // Force exit after 15 seconds
      setTimeout(() => {
        console.error('[Server] Forced shutdown after timeout');
        process.exit(1);
      }, 15000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    process.on('unhandledRejection', (reason: unknown) => {
      console.error('[Server] Unhandled Rejection:', reason);
    });

    process.on('uncaughtException', (error: Error) => {
      console.error('[Server] Uncaught Exception:', error);
      process.exit(1);
    });
  } catch (error) {
    console.error('[Server] Failed to start:', error);
    process.exit(1);
  }
}

start();
