import "dotenv/config";
import mongoose from "mongoose";
import app from "./app";

const PORT = parseInt(process.env.PORT || "3004", 10);
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/notification_db";

async function bootstrap(): Promise<void> {
  try {
    await mongoose.connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log("[notification-service] MongoDB connected:", MONGO_URI);

    const server = app.listen(PORT, () => {
      console.log(`[notification-service] Listening on port ${PORT}`);
    });

    // Graceful shutdown
    const shutdown = async (signal: string): Promise<void> => {
      console.log(`[notification-service] ${signal} received — shutting down...`);
      server.close(async () => {
        await mongoose.disconnect();
        console.log("[notification-service] MongoDB disconnected. Bye!");
        process.exit(0);
      });
    };

    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[notification-service] Startup failed:", message);
    process.exit(1);
  }
}

bootstrap();
