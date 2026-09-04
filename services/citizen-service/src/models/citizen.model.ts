import { Schema, model, Document, Model } from 'mongoose';

/**
 * ICitizen describes the shape of a citizen document in MongoDB.
 */
export interface ICitizen extends Document {
  phone: string;           // E.164 format, unique
  name: string;
  wardId: string;
  geohash: string;
  trustScore: number;      // 0-100, default 50
  preferredLanguage: string; // default 'en'
  role: 'citizen' | 'staff' | 'admin';
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CitizenSchema = new Schema<ICitizen>(
  {
    phone: {
      type: String,
      required: [true, 'Phone number is required'],
      unique: true,
      trim: true,
      match: [
        /^\+[1-9]\d{1,14}$/,
        'Phone must be in E.164 format (e.g. +919876543210)',
      ],
    },
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [100, 'Name must not exceed 100 characters'],
    },
    wardId: {
      type: String,
      required: [true, 'Ward ID is required'],
      trim: true,
      index: true,
    },
    geohash: {
      type: String,
      trim: true,
      default: '',
    },
    trustScore: {
      type: Number,
      default: 50,
      min: [0, 'Trust score cannot be below 0'],
      max: [100, 'Trust score cannot exceed 100'],
    },
    preferredLanguage: {
      type: String,
      default: 'en',
      trim: true,
      lowercase: true,
    },
    role: {
      type: String,
      enum: {
        values: ['citizen', 'staff', 'admin'],
        message: '{VALUE} is not a valid role',
      },
      default: 'citizen',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,         // auto-manages createdAt & updatedAt
    versionKey: false,
    toJSON: {
      transform(_doc, ret) {
        delete (ret as Record<string, unknown>).__v;
        return ret;
      },
    },
  },
);

// Compound index for ward-based queries
CitizenSchema.index({ wardId: 1, isActive: 1 });

export const Citizen: Model<ICitizen> = model<ICitizen>('Citizen', CitizenSchema);
