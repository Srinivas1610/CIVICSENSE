import axios from 'axios';
import { IssueStatus } from '../models/issue.model';

// ─── Notification Trigger Service ─────────────────────────────────────────────
// After issue status changes, notify the notification-service to send
// alerts to the citizen and relevant stakeholders.

const NOTIFICATION_SERVICE_URL =
  process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3004';

export interface StatusChangeNotificationPayload {
  issueId: string;
  recipientId: string;
  oldStatus: IssueStatus;
  newStatus: IssueStatus;
  wardId: string;
  category: string;
  rawDescription: string;
  updatedBy: string;
}

const STATUS_MESSAGE_MAP: Record<IssueStatus, string> = {
  pending: 'Your issue has been received and is pending review.',
  validated: 'Your issue has been validated by the community.',
  assigned: 'Your issue has been assigned to the relevant department.',
  in_progress: 'Work has started on your reported issue.',
  resolved: 'Your issue has been resolved. Thank you for reporting!',
  escalated: 'Your issue has been escalated to higher authorities for urgent action.',
  Submitted: 'Your issue has been submitted and is undergoing autonomous AI triage.',
  submitted: 'Your issue has been submitted and is undergoing autonomous AI triage.',
};

export async function triggerStatusChangeNotification(
  payload: StatusChangeNotificationPayload
): Promise<void> {
  const notificationBody = {
    type: 'STATUS_CHANGE',
    issueId: payload.issueId,
    recipientId: payload.recipientId,
    channels: ['push', 'sms'],
    title: `Issue Update: ${payload.category}`,
    message: STATUS_MESSAGE_MAP[payload.newStatus] || `Issue status updated to ${payload.newStatus}.`,
    metadata: {
      oldStatus: payload.oldStatus,
      newStatus: payload.newStatus,
      wardId: payload.wardId,
      category: payload.category,
      updatedBy: payload.updatedBy,
      issueDescription: payload.rawDescription.substring(0, 100),
    },
  };

  try {
    const response = await axios.post(
      `${NOTIFICATION_SERVICE_URL}/api/notifications`,
      notificationBody,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 10000,
      }
    );
    console.log(
      `[notification-trigger] Notification sent for issue ${payload.issueId} status → ${payload.newStatus}:`,
      response.data
    );
  } catch (err) {
    const error = err as Error;
    // Non-critical: log but do not throw — status was already updated
    console.error(
      `[notification-trigger] Failed to send notification for issue ${payload.issueId}:`,
      error.message
    );
  }
}
