import { Router } from "express";
import { body, param } from "express-validator";
import {
  sendNotification,
  sendStatusUpdate,
  sendEscalationAlert,
  sendValidationRequest,
  sendResolutionNotice,
  getNotificationsByCitizen,
  markNotificationAsRead,
  getStatsSummary,
  clearReadNotifications,
} from "../controllers/notification.controller";

const router = Router();

// ──────────────────────────────────────────────
// Health check
// ──────────────────────────────────────────────
router.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "notification-service",
    timestamp: new Date(),
  });
});

// ──────────────────────────────────────────────
// Stats (before /:citizenId to avoid param clash)
// ──────────────────────────────────────────────
router.get("/api/notifications/stats/summary", getStatsSummary);

// ──────────────────────────────────────────────
// Send endpoints
// ──────────────────────────────────────────────

/**
 * POST /api/notifications/send
 * Generic notification send.
 */
router.post(
  "/api/notifications/send",
  [
    body("citizenId").notEmpty().withMessage("citizenId is required"),
    body("issueId").notEmpty().withMessage("issueId is required"),
    body("type")
      .isIn(["status_update", "validation_request", "escalation", "resolution", "assignment"])
      .withMessage("type must be one of: status_update, validation_request, escalation, resolution, assignment"),
    body("title").notEmpty().withMessage("title is required"),
    body("message").notEmpty().withMessage("message is required"),
    body("channel")
      .optional()
      .isIn(["in_app", "email", "sms"])
      .withMessage("channel must be one of: in_app, email, sms"),
    body("citizenEmail")
      .optional()
      .isEmail()
      .withMessage("citizenEmail must be a valid email"),
  ],
  sendNotification
);

/**
 * POST /api/notifications/status-update
 * Status change notification.
 */
router.post(
  "/api/notifications/status-update",
  [
    body("citizenId").notEmpty().withMessage("citizenId is required"),
    body("issueId").notEmpty().withMessage("issueId is required"),
    body("oldStatus").notEmpty().withMessage("oldStatus is required"),
    body("newStatus").notEmpty().withMessage("newStatus is required"),
    body("citizenEmail")
      .optional()
      .isEmail()
      .withMessage("citizenEmail must be a valid email"),
  ],
  sendStatusUpdate
);

/**
 * POST /api/notifications/escalation
 * Escalation alert notification.
 */
router.post(
  "/api/notifications/escalation",
  [
    body("citizenId").notEmpty().withMessage("citizenId is required"),
    body("issueId").notEmpty().withMessage("issueId is required"),
    body("escalationLevel")
      .isInt({ min: 1, max: 5 })
      .withMessage("escalationLevel must be an integer between 1 and 5"),
    body("citizenEmail")
      .optional()
      .isEmail()
      .withMessage("citizenEmail must be a valid email"),
  ],
  sendEscalationAlert
);

/**
 * POST /api/notifications/validation-request
 * Bulk validation request to nearby citizens.
 */
router.post(
  "/api/notifications/validation-request",
  [
    body("nearbyCitizenIds")
      .isArray({ min: 1 })
      .withMessage("nearbyCitizenIds must be a non-empty array"),
    body("issueId").notEmpty().withMessage("issueId is required"),
    body("location").notEmpty().withMessage("location is required"),
  ],
  sendValidationRequest
);

/**
 * POST /api/notifications/resolution
 * Resolution notice.
 */
router.post(
  "/api/notifications/resolution",
  [
    body("citizenId").notEmpty().withMessage("citizenId is required"),
    body("issueId").notEmpty().withMessage("issueId is required"),
    body("citizenEmail")
      .optional()
      .isEmail()
      .withMessage("citizenEmail must be a valid email"),
  ],
  sendResolutionNotice
);

// ──────────────────────────────────────────────
// Citizen notification queries
// ──────────────────────────────────────────────

/**
 * GET /api/notifications/:citizenId
 * Get notifications for a citizen. Query: type, status, page, limit.
 */
router.get(
  "/api/notifications/:citizenId",
  [param("citizenId").notEmpty().withMessage("citizenId is required")],
  getNotificationsByCitizen
);

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read.
 */
router.put(
  "/api/notifications/:id/read",
  [param("id").notEmpty().withMessage("id is required")],
  markNotificationAsRead
);

/**
 * DELETE /api/notifications/:citizenId/clear-read
 * Delete all read notifications for a citizen.
 */
router.delete(
  "/api/notifications/:citizenId/clear-read",
  [param("citizenId").notEmpty().withMessage("citizenId is required")],
  clearReadNotifications
);

export default router;
