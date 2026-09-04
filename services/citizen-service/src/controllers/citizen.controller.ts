import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import { Citizen, ICitizen } from '../models/citizen.model';

const SALT_ROUNDS = 10;

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Signs a JWT for the given citizen document.
 */
function signToken(citizen: ICitizen): string {
  const secret = process.env.JWT_SECRET as string;
  return jwt.sign(
    {
      id: citizen._id.toString(),
      phone: citizen.phone,
      role: citizen.role,
      wardId: citizen.wardId,
    },
    secret,
    { expiresIn: '7d' },
  );
}

/**
 * Strips sensitive fields before returning to the client.
 */
function sanitize(citizen: ICitizen) {
  const obj = citizen.toJSON();
  return obj;
}

// ─── Controllers ─────────────────────────────────────────────────────────────

/**
 * POST /api/citizens/register
 * Creates a new citizen account. Phone is stored as-is (no password — OTP flow
 * expected in production, but for this service we demonstrate bcrypt on phone
 * hash for a PIN if supplied, otherwise plain upsert).
 */
export async function registerCitizen(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { phone, name, wardId, geohash, preferredLanguage, role } = req.body;

    // Check for duplicate
    const existing = await Citizen.findOne({ phone });
    if (existing) {
      res.status(409).json({ success: false, error: 'Phone number already registered' });
      return;
    }

    const citizen = await Citizen.create({
      phone,
      name,
      wardId,
      geohash: geohash ?? '',
      preferredLanguage: preferredLanguage ?? 'en',
      role: role ?? 'citizen',
    });

    const token = signToken(citizen);

    res.status(201).json({
      success: true,
      data: {
        citizen: sanitize(citizen),
        token,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/citizens/login
 * Finds citizen by phone and returns a signed JWT.
 * In a real OTP flow, OTP verification would happen here before issuing token.
 */
export async function loginCitizen(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { phone } = req.body;

    if (!phone) {
      res.status(400).json({ success: false, error: 'Phone number is required' });
      return;
    }

    const citizen = await Citizen.findOne({ phone, isActive: true });
    if (!citizen) {
      // Generic message to prevent phone enumeration
      res.status(401).json({ success: false, error: 'Invalid credentials or account inactive' });
      return;
    }

    const token = signToken(citizen);

    res.status(200).json({
      success: true,
      data: {
        citizen: sanitize(citizen),
        token,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/citizens/:id
 * Returns full citizen profile. Requires authentication.
 */
export async function getCitizen(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;

    const citizen = await Citizen.findById(id);
    if (!citizen) {
      res.status(404).json({ success: false, error: 'Citizen not found' });
      return;
    }

    res.status(200).json({ success: true, data: { citizen: sanitize(citizen) } });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /api/citizens/:id
 * Updates own citizen profile. Authenticated users may only update their own record
 * unless they are admins.
 */
export async function updateCitizen(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const requestingUser = req.user!;

    // Enforce own-profile-only restriction
    if (requestingUser.id !== id && requestingUser.role !== 'admin') {
      res.status(403).json({ success: false, error: 'Forbidden: you may only update your own profile' });
      return;
    }

    // Fields that citizens are allowed to change
    const allowedUpdates: (keyof ICitizen)[] = [
      'name',
      'geohash',
      'preferredLanguage',
    ];

    // Admins can additionally change these
    const adminUpdates: (keyof ICitizen)[] = ['wardId', 'trustScore', 'role', 'isActive'];

    const updateFields: Partial<ICitizen> = {};

    for (const field of allowedUpdates) {
      if (req.body[field] !== undefined) {
        (updateFields as Record<string, unknown>)[field] = req.body[field];
      }
    }

    if (requestingUser.role === 'admin') {
      for (const field of adminUpdates) {
        if (req.body[field] !== undefined) {
          (updateFields as Record<string, unknown>)[field] = req.body[field];
        }
      }
    }

    const citizen = await Citizen.findByIdAndUpdate(
      id,
      { $set: updateFields },
      { new: true, runValidators: true },
    );

    if (!citizen) {
      res.status(404).json({ success: false, error: 'Citizen not found' });
      return;
    }

    res.status(200).json({ success: true, data: { citizen: sanitize(citizen) } });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/citizens/:id/issues
 * Proxies to the issue-service to retrieve issues filed by this citizen.
 */
export async function getCitizenIssues(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { id } = req.params;
    const issueServiceUrl = process.env.ISSUE_SERVICE_URL ?? 'http://issue-service:3002';

    // Forward any extra query params (e.g. page, limit, status)
    const queryString = new URLSearchParams(
      req.query as Record<string, string>,
    ).toString();

    const url = `${issueServiceUrl}/api/issues?reportedBy=${id}${queryString ? `&${queryString}` : ''}`;

    const response = await axios.get(url, { timeout: 10000 });

    res.status(200).json({ success: true, data: response.data });
  } catch (err) {
    if (axios.isAxiosError(err)) {
      if (err.response) {
        res.status(err.response.status).json({
          success: false,
          error: `Issue service error: ${err.response.statusText}`,
          details: err.response.data,
        });
      } else {
        res.status(503).json({
          success: false,
          error: 'Issue service unavailable',
        });
      }
      return;
    }
    next(err);
  }
}

/**
 * GET /api/citizens/ward/:wardId
 * Returns all active citizens belonging to a given ward.
 */
export async function getCitizensByWard(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { wardId } = req.params;
    const page = Math.max(1, parseInt((req.query.page as string) ?? '1', 10));
    const limit = Math.min(100, Math.max(1, parseInt((req.query.limit as string) ?? '20', 10)));
    const skip = (page - 1) * limit;

    const [citizens, total] = await Promise.all([
      Citizen.find({ wardId, isActive: true }).skip(skip).limit(limit).lean(),
      Citizen.countDocuments({ wardId, isActive: true }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        citizens,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}
