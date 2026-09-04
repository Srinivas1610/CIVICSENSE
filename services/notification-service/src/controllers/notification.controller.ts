import { Request, Response, NextFunction } from "express";
import { validationResult } from "express-validator";
import { notificationService } from "../services/notification.service";
import { Notification } from "../models/notification.model";

/**
 * Helper to format validation errors from express-validator.
 */
function formatValidationErrors(req: Request): string | null {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return errors
      .array()
      .map((e) => e.msg)
      .join(", ");
  }
  return null;
}

/**
 * POST /api/notifications/send
 * Generic send notification endpoint.
 */
export async function sendNotification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validationError = formatValidationErrors(req);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const { citizenId, issueId, type, title, message, channel, metadata, citizenEmail } =
      req.body;

    const notification = await notificationService.sendNotification({
      citizenId,
      issueId,
      type,
      title,
      message,
      channel,
      metadata,
      citizenEmail,
    });

    res.status(201).json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/status-update
 * Send a status change alert.
 */
export async function sendStatusUpdate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validationError = formatValidationErrors(req);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const { citizenId, issueId, oldStatus, newStatus, citizenEmail } = req.body;

    const notification = await notificationService.sendStatusUpdate(
      citizenId,
      issueId,
      oldStatus,
      newStatus,
      citizenEmail
    );

    res.status(201).json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/escalation
 * Send an escalation alert.
 */
export async function sendEscalationAlert(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validationError = formatValidationErrors(req);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const { citizenId, issueId, escalationLevel, citizenEmail } = req.body;

    const notification = await notificationService.sendEscalationAlert(
      citizenId,
      issueId,
      escalationLevel,
      citizenEmail
    );

    res.status(201).json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/validation-request
 * Send validation requests to multiple nearby citizens.
 */
export async function sendValidationRequest(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validationError = formatValidationErrors(req);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const { nearbyCitizenIds, issueId, location, citizenEmails } = req.body;

    const notifications = await notificationService.sendValidationRequest(
      nearbyCitizenIds,
      issueId,
      location,
      citizenEmails
    );

    res.status(201).json({
      success: true,
      data: { sent: notifications.length, notifications },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/notifications/resolution
 * Send resolution notice to a citizen.
 */
export async function sendResolutionNotice(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const validationError = formatValidationErrors(req);
    if (validationError) {
      res.status(400).json({ success: false, error: validationError });
      return;
    }

    const { citizenId, issueId, citizenEmail } = req.body;

    const notification = await notificationService.sendResolutionNotice(
      citizenId,
      issueId,
      citizenEmail
    );

    res.status(201).json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/:citizenId
 * Get all notifications for a citizen with optional filters.
 */
export async function getNotificationsByCitizen(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { citizenId } = req.params;
    const { type, status, page, limit } = req.query;

    const result = await notificationService.getNotificationsForCitizen(citizenId, {
      type: type as string | undefined,
      status: status as string | undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/notifications/:id/read
 * Mark a notification as read.
 */
export async function markNotificationAsRead(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id } = req.params;

    const notification = await notificationService.markAsRead(id);

    if (!notification) {
      res.status(404).json({ success: false, error: "Notification not found" });
      return;
    }

    res.json({ success: true, data: notification });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/notifications/stats/summary
 * Get summary stats across all notifications.
 */
export async function getStatsSummary(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const stats = await notificationService.getStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/notifications/:citizenId/clear-read
 * Delete all read notifications for a citizen (housekeeping).
 */
export async function clearReadNotifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { citizenId } = req.params;
    const result = await Notification.deleteMany({ citizenId, status: "read" });
    res.json({
      success: true,
      data: { deleted: result.deletedCount },
    });
  } catch (err) {
    next(err);
  }
}
