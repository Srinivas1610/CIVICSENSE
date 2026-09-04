import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

/**
 * Shape of the JWT payload issued on login.
 */
export interface JwtPayload {
  id: string;
  phone: string;
  role: string;
  wardId: string;
}

// Extend Express Request so downstream handlers can access `req.user`
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

/**
 * Verifies the Bearer JWT in the Authorization header.
 * Attaches decoded payload to req.user.
 */
export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, error: 'Authorization token missing or malformed' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const secret = process.env.JWT_SECRET as string;

  try {
    const decoded = jwt.verify(token, secret) as JwtPayload;
    req.user = decoded;
    next();
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid token';
    res.status(401).json({ success: false, error: `Unauthorized: ${message}` });
  }
}
