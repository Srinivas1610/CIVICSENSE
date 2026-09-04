import { Request, Response, NextFunction } from 'express';
import { validationResult } from 'express-validator';

/**
 * Reads express-validator results. If any errors exist, returns 422 with the
 * first validation error message; otherwise passes control to the next handler.
 */
export function validateRequest(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const firstError = errors.array()[0];
    res.status(422).json({
      success: false,
      error: firstError.msg,
      details: errors.array(),
    });
    return;
  }
  next();
}
