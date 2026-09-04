import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { collectDefaultMetrics } from "prom-client";
import notificationRoutes from "./routes/notification.routes";
import { errorHandler, notFoundHandler, metricsHandler } from "./middleware/error.middleware";

// Collect default Prometheus metrics
collectDefaultMetrics({ prefix: "notification_service_" });

const app = express();

// ──────────────────────────────────────────────
// Security & parsing middleware
// ──────────────────────────────────────────────
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// ──────────────────────────────────────────────
// HTTP request logger (skip in test)
// ──────────────────────────────────────────────
if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

// ──────────────────────────────────────────────
// Routes
// ──────────────────────────────────────────────
app.use(notificationRoutes);

// ──────────────────────────────────────────────
// Prometheus metrics
// ──────────────────────────────────────────────
app.get("/metrics", metricsHandler);

// ──────────────────────────────────────────────
// 404 & Error handlers (must be last)
// ──────────────────────────────────────────────
app.use(notFoundHandler);
app.use(errorHandler);

export default app;
