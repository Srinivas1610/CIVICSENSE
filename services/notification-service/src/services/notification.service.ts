import {
  Notification,
  INotification,
  NotificationType,
  NotificationChannel,
} from "../models/notification.model";
import { emailService } from "./email.service";

export interface SendNotificationPayload {
  citizenId: string;
  issueId: string;
  type: NotificationType;
  title: string;
  message: string;
  channel?: NotificationChannel;
  metadata?: Record<string, unknown>;
  citizenEmail?: string;
}

export interface PaginatedNotifications {
  notifications: INotification[];
  total: number;
  page: number;
  totalPages: number;
}

export interface NotificationStats {
  total: number;
  byType: Record<string, number>;
  byChannel: Record<string, number>;
  byStatus: Record<string, number>;
}

class NotificationService {
  /**
   * Create and persist a notification record, then dispatch via chosen channel.
   */
  async sendNotification(payload: SendNotificationPayload): Promise<INotification> {
    const {
      citizenId,
      issueId,
      type,
      title,
      message,
      channel = "in_app",
      metadata = {},
      citizenEmail,
    } = payload;

    const notification = new Notification({
      citizenId,
      issueId,
      type,
      title,
      message,
      channel,
      status: "pending",
      metadata,
    });

    await notification.save();

    // Dispatch based on channel
    try {
      if (channel === "email" && citizenEmail) {
        await emailService.sendEmail({
          to: citizenEmail,
          subject: title,
          html: `<p>${message}</p>`,
        });
      }
      // in_app: stored in DB — client polls or websocket (future)
      // sms: external provider (future integration point)

      notification.status = "sent";
      notification.sentAt = new Date();
    } catch (dispatchErr: unknown) {
      const errMsg =
        dispatchErr instanceof Error ? dispatchErr.message : "Dispatch error";
      console.error(`[NotificationService] Dispatch failed: ${errMsg}`);
      notification.status = "failed";
      notification.metadata = { ...notification.metadata, dispatchError: errMsg };
    }

    await notification.save();
    return notification;
  }

  /**
   * Create a status update notification and send email if address provided.
   */
  async sendStatusUpdate(
    citizenId: string,
    issueId: string,
    oldStatus: string,
    newStatus: string,
    citizenEmail?: string
  ): Promise<INotification> {
    const title = `Issue #${issueId} Status Updated`;
    const message = `Your issue status has changed from "${oldStatus}" to "${newStatus}".`;

    const notification = await this.sendNotification({
      citizenId,
      issueId,
      type: "status_update",
      title,
      message,
      channel: citizenEmail ? "email" : "in_app",
      metadata: { oldStatus, newStatus },
      citizenEmail,
    });

    // Additionally send the formatted status email
    if (citizenEmail) {
      await emailService.sendStatusUpdateEmail(citizenEmail, issueId, oldStatus, newStatus);
    }

    return notification;
  }

  /**
   * Send validation requests to multiple nearby citizens in bulk.
   */
  async sendValidationRequest(
    nearbyCitizenIds: string[],
    issueId: string,
    location: string,
    citizenEmails?: Record<string, string>
  ): Promise<INotification[]> {
    const title = `Validation Needed — Issue Near ${location}`;
    const message = `A civic issue has been reported near ${location}. Please validate issue #${issueId}.`;

    const notifications = await Promise.all(
      nearbyCitizenIds.map(async (citizenId) => {
        const email = citizenEmails?.[citizenId];
        const notification = await this.sendNotification({
          citizenId,
          issueId,
          type: "validation_request",
          title,
          message,
          channel: email ? "email" : "in_app",
          metadata: { location },
          citizenEmail: email,
        });

        if (email) {
          await emailService.sendValidationRequestEmail(email, issueId, location);
        }

        return notification;
      })
    );

    console.log(
      `[NotificationService] Sent ${notifications.length} validation requests for issue #${issueId}`
    );
    return notifications;
  }

  /**
   * Send an escalation alert to a citizen.
   */
  async sendEscalationAlert(
    citizenId: string,
    issueId: string,
    escalationLevel: number,
    citizenEmail?: string
  ): Promise<INotification> {
    const title = `⚠️ Issue #${issueId} Escalated to Level ${escalationLevel}`;
    const message = `Your issue has been escalated to level ${escalationLevel} and is now being handled by senior authorities.`;

    const notification = await this.sendNotification({
      citizenId,
      issueId,
      type: "escalation",
      title,
      message,
      channel: citizenEmail ? "email" : "in_app",
      metadata: { escalationLevel },
      citizenEmail,
    });

    if (citizenEmail) {
      await emailService.sendEscalationEmail(citizenEmail, issueId, escalationLevel);
    }

    return notification;
  }

  /**
   * Send a resolution notice to a citizen.
   */
  async sendResolutionNotice(
    citizenId: string,
    issueId: string,
    citizenEmail?: string
  ): Promise<INotification> {
    const title = `✅ Issue #${issueId} Resolved`;
    const message = `Great news! Your reported issue #${issueId} has been successfully resolved. Thank you for making your community better.`;

    const notification = await this.sendNotification({
      citizenId,
      issueId,
      type: "resolution",
      title,
      message,
      channel: citizenEmail ? "email" : "in_app",
      metadata: { resolvedAt: new Date().toISOString() },
      citizenEmail,
    });

    if (citizenEmail) {
      await emailService.sendResolutionEmail(citizenEmail, issueId);
    }

    return notification;
  }

  /**
   * Get paginated notifications for a citizen with optional filters.
   */
  async getNotificationsForCitizen(
    citizenId: string,
    options: {
      type?: string;
      status?: string;
      page?: number;
      limit?: number;
    } = {}
  ): Promise<PaginatedNotifications> {
    const { type, status, page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = { citizenId };
    if (type) filter.type = type;
    if (status) filter.status = status;

    const [notifications, total] = await Promise.all([
      Notification.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean()
        .exec(),
      Notification.countDocuments(filter),
    ]);

    return {
      notifications: notifications as unknown as INotification[],
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Mark a notification as read.
   */
  async markAsRead(notificationId: string): Promise<INotification | null> {
    const notification = await Notification.findByIdAndUpdate(
      notificationId,
      {
        status: "read",
        readAt: new Date(),
      },
      { new: true }
    );
    return notification;
  }

  /**
   * Get summary stats for all notifications.
   */
  async getStats(): Promise<NotificationStats> {
    const [total, byTypeRaw, byChannelRaw, byStatusRaw] = await Promise.all([
      Notification.countDocuments(),
      Notification.aggregate([
        { $group: { _id: "$type", count: { $sum: 1 } } },
      ]),
      Notification.aggregate([
        { $group: { _id: "$channel", count: { $sum: 1 } } },
      ]),
      Notification.aggregate([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
    ]);

    const toMap = (
      arr: Array<{ _id: string; count: number }>
    ): Record<string, number> =>
      arr.reduce((acc, { _id, count }) => ({ ...acc, [_id]: count }), {});

    return {
      total,
      byType: toMap(byTypeRaw),
      byChannel: toMap(byChannelRaw),
      byStatus: toMap(byStatusRaw),
    };
  }
}

export const notificationService = new NotificationService();
