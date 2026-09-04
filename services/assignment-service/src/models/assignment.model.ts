import mongoose, { Document, Schema } from 'mongoose';

// ─── Escalation Draft Sub-document ────────────────────────────────────────────

export interface IEscalationDraft {
  level: 1 | 2 | 3 | 4;
  type: 'follow_up' | 'senior_escalation' | 'rti' | 'social_pack';
  content: string;
  status: 'pending_approval' | 'approved' | 'sent' | 'dismissed';
  generatedAt: Date;
}

const EscalationDraftSchema = new Schema<IEscalationDraft>(
  {
    level: {
      type: Number,
      required: true,
      enum: [1, 2, 3, 4],
    },
    type: {
      type: String,
      required: true,
      enum: ['follow_up', 'senior_escalation', 'rti', 'social_pack'],
    },
    content: {
      type: String,
      required: true,
    },
    status: {
      type: String,
      required: true,
      enum: ['pending_approval', 'approved', 'sent', 'dismissed'],
      default: 'pending_approval',
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: true }
);

// ─── Assignment Interface ──────────────────────────────────────────────────────

export interface IAssignment {
  issueId: string;
  category: string;
  departmentName: string;
  contactEmail: string;
  zoneId: string;
  assignedTo: string | null;
  assignedAt: Date;
  dueDate: Date;
  status: 'pending' | 'acknowledged' | 'in_progress' | 'completed' | 'escalated';
  escalationLevel: 0 | 1 | 2 | 3 | 4;
  escalationDrafts: IEscalationDraft[];
  notes: string;
  wardId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IAssignmentDocument extends IAssignment, Document {}

// ─── Assignment Schema ─────────────────────────────────────────────────────────

const AssignmentSchema = new Schema<IAssignmentDocument>(
  {
    issueId: {
      type: String,
      required: [true, 'issueId is required'],
      index: true,
    },
    category: {
      type: String,
      required: [true, 'category is required'],
      lowercase: true,
      trim: true,
    },
    departmentName: {
      type: String,
      required: [true, 'departmentName is required'],
    },
    contactEmail: {
      type: String,
      required: [true, 'contactEmail is required'],
      lowercase: true,
    },
    zoneId: {
      type: String,
      default: 'default-zone',
    },
    assignedTo: {
      type: String,
      default: null,
    },
    assignedAt: {
      type: Date,
      default: Date.now,
    },
    dueDate: {
      type: Date,
      required: [true, 'dueDate is required'],
    },
    status: {
      type: String,
      required: true,
      enum: ['pending', 'acknowledged', 'in_progress', 'completed', 'escalated'],
      default: 'pending',
    },
    escalationLevel: {
      type: Number,
      required: true,
      enum: [0, 1, 2, 3, 4],
      default: 0,
    },
    escalationDrafts: {
      type: [EscalationDraftSchema],
      default: [],
    },
    notes: {
      type: String,
      default: '',
    },
    wardId: {
      type: String,
      required: [true, 'wardId is required'],
    },
  },
  {
    timestamps: true,
    versionKey: false,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ───────────────────────────────────────────────────────────────────

AssignmentSchema.index({ status: 1, escalationLevel: 1 });
AssignmentSchema.index({ departmentName: 1, status: 1 });
AssignmentSchema.index({ dueDate: 1, status: 1 });
AssignmentSchema.index({ wardId: 1 });

// ─── Virtual: isOverdue ────────────────────────────────────────────────────────

AssignmentSchema.virtual('isOverdue').get(function (this: IAssignmentDocument) {
  return this.status !== 'completed' && new Date() > this.dueDate;
});

// ─── Model ────────────────────────────────────────────────────────────────────

const Assignment = mongoose.model<IAssignmentDocument>('Assignment', AssignmentSchema);

export default Assignment;
