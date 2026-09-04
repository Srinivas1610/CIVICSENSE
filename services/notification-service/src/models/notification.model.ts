import mongoose, { Document, Schema } from "mongoose";

export type NotificationType =
  | "status_update"
  | "validation_request"
  | "escalation"
  | "resolution"
  | "assignment";

export type NotificationChannel = "in_app" | "email" | "sms";
export type NotificationStatus = "pending" | "sent" | "failed" | "read";

export interface INotification extends Document {
  citizenId: string;
  issueId: string;
  type: NotificationType;
  title: string;
  message: string;
  channel: NotificationChannel;
  status: NotificationStatus;
  metadata: Record<string, unknown>;
  sentAt: Date | null;
  readAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    citizenId: {
      type: String,
      required: [true, "citizenId is required"],
      index: true,
    },
    issueId: {
      type: String,
      required: [true, "issueId is required"],
      index: true,
    },
    type: {
      type: String,
      enum: [
        "status_update",
        "validation_request",
        "escalation",
        "resolution",
        "assignment",
      ],
      required: [true, "type is required"],
    },
    title: {
      type: String,
      required: [true, "title is required"],
      trim: true,
      maxlength: [200, "title cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: [true, "message is required"],
      trim: true,
      maxlength: [2000, "message cannot exceed 2000 characters"],
    },
    channel: {
      type: String,
      enum: ["in_app", "email", "sms"],
      default: "in_app",
    },
    status: {
      type: String,
      enum: ["pending", "sent", "failed", "read"],
      default: "pending",
    },
    metadata: {
      type: Schema.Types.Mixed,
      default: {},
    },
    sentAt: {
      type: Date,
      default: null,
    },
    readAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    versionKey: false,
  }
);

// Compound indexes for efficient queries
NotificationSchema.index({ citizenId: 1, status: 1 });
NotificationSchema.index({ citizenId: 1, type: 1 });
NotificationSchema.index({ citizenId: 1, createdAt: -1 });
NotificationSchema.index({ issueId: 1, type: 1 });

export const Notification = mongoose.model<INotification>(
  "Notification",
  NotificationSchema
);
