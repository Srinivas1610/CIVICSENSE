import { Request, Response, NextFunction } from "express";
import { register as promRegister } from "prom-client";

/**
 * Global Express error handler middleware.
 * Catches any error passed via next(err) and returns a consistent JSON response.
 */
export function errorHandler(
  err: Error & { status?: number; statusCode?: number },
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  console.error(`[ErrorHandler] ${req.method} ${req.path} — ${status}: ${message}`);

  if (process.env.NODE_ENV !== "test") {
    console.error(err.stack);
  }

  res.status(status).json({
    success: false,
    error: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack }),
  });
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: `Route not found: ${req.method} ${req.path}`,
  });
}

/**
 * Prometheus metrics endpoint handler.
 */
export async function metricsHandler(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    res.set("Content-Type", promRegister.contentType);
    res.end(await promRegister.metrics());
  } catch (err) {
    next(err);
  }
}
