import mongoose, { Document, Schema, Model } from 'mongoose';

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface IIssueLocation {
  lat: number;
  lng: number;
  geohash: string;
  address: string;
  wardId: string;
  wardName: string;
}

export interface IIssueDNADepartment {
  name: string;
  zoneId: string;
  contactEmail: string;
}

export interface IIssueDNA {
  classification: string;
  subcategory: string;
  rootCauseHypothesis: string;
  clusterId: string | null;
  severityScore: number;
  severityTrajectory: 'stable' | 'worsening' | 'critical';
  trajectoryReason: string;
  department: IIssueDNADepartment;
  resolutionETA: string | null;
  confidence: number;
}

export type IssueStatus =
  | 'pending'
  | 'validated'
  | 'assigned'
  | 'in_progress'
  | 'resolved'
  | 'escalated';

export type IssueCategory =
  | 'roads'
  | 'garbage'
  | 'streetlights'
  | 'water'
  | 'drainage'
  | 'other';

export type IssueChannel = 'app' | 'whatsapp' | 'voice' | 'qr';

export type ValidationResponse = 'confirmed_bad' | 'confirmed_minor' | 'denied' | 'worse';

export interface IIssue {
  reportedBy: string;
  channel: IssueChannel;
  category: IssueCategory;
  location: IIssueLocation;
  media: string[];
  rawDescription: string;
  dna: IIssueDNA | null;
  status: IssueStatus;
  validationCount: number;
  escalationLevel: 0 | 1 | 2 | 3 | 4;
  createdAt: Date;
  updatedAt: Date;
}

export interface IIssueDocument extends IIssue, Document {}

// ─── Sub-Schemas ──────────────────────────────────────────────────────────────

const LocationSchema = new Schema<IIssueLocation>(
  {
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    geohash: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    wardId: { type: String, required: true, trim: true },
    wardName: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const DepartmentSchema = new Schema<IIssueDNADepartment>(
  {
    name: { type: String, required: true },
    zoneId: { type: String, required: true },
    contactEmail: { type: String, required: true },
  },
  { _id: false }
);

const DNASchema = new Schema<IIssueDNA>(
  {
    classification: { type: String, required: true },
    subcategory: { type: String, required: true },
    rootCauseHypothesis: { type: String, required: true },
    clusterId: { type: String, default: null },
    severityScore: { type: Number, required: true, min: 1, max: 10 },
    severityTrajectory: {
      type: String,
      enum: ['stable', 'worsening', 'critical'],
      required: true,
    },
    trajectoryReason: { type: String, required: true },
    department: { type: DepartmentSchema, required: true },
    resolutionETA: { type: String, default: null },
    confidence: { type: Number, required: true, min: 0, max: 1 },
  },
  { _id: false }
);

// ─── Main Issue Schema ────────────────────────────────────────────────────────

const IssueSchema = new Schema<IIssueDocument>(
  {
    reportedBy: {
      type: String,
      required: [true, 'reportedBy (citizen ID) is required'],
      trim: true,
      index: true,
    },
    channel: {
      type: String,
      enum: ['app', 'whatsapp', 'voice', 'qr'],
      required: [true, 'channel is required'],
    },
    category: {
      type: String,
      enum: ['roads', 'garbage', 'streetlights', 'water', 'drainage', 'other'],
      required: [true, 'category is required'],
      index: true,
    },
    location: {
      type: LocationSchema,
      required: [true, 'location is required'],
    },
    media: {
      type: [String],
      default: [],
    },
    rawDescription: {
      type: String,
      required: [true, 'rawDescription is required'],
      trim: true,
      minlength: [10, 'Description must be at least 10 characters'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    dna: {
      type: DNASchema,
      default: null,
    },
    status: {
      type: String,
      enum: ['pending', 'validated', 'assigned', 'in_progress', 'resolved', 'escalated'],
      default: 'pending',
      index: true,
    },
    validationCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    escalationLevel: {
      type: Number,
      enum: [0, 1, 2, 3, 4],
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ─── Indexes ──────────────────────────────────────────────────────────────────

// Compound index: ward + status + createdAt for efficient ward dashboard queries
IssueSchema.index({ 'location.wardId': 1, status: 1, createdAt: -1 });

// Text index for full-text search on descriptions
IssueSchema.index({ rawDescription: 'text' });

// Index for listing by reporter
IssueSchema.index({ reportedBy: 1, createdAt: -1 });

// Index for category queries
IssueSchema.index({ category: 1, createdAt: -1 });

// ─── Model ────────────────────────────────────────────────────────────────────

const Issue: Model<IIssueDocument> = mongoose.model<IIssueDocument>('Issue', IssueSchema);

export default Issue;
