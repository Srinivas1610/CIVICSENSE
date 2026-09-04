import { Router } from 'express';
import { body, param, query } from 'express-validator';
import {
  createAssignment,
  getAssignmentByIssueId,
  updateAssignmentStatus,
  listByDepartment,
  getStatsOverview,
  approveEscalationDraft,
} from '../controllers/assignment.controller';

const router = Router();

// ─── Health Check ──────────────────────────────────────────────────────────────

router.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'assignment-service',
    timestamp: new Date(),
  });
});

// ─── Stats (before :issueId to avoid param collision) ─────────────────────────

/**
 * GET /api/assignments/stats/overview
 */
router.get('/api/assignments/stats/overview', getStatsOverview);

// ─── Department Listings ───────────────────────────────────────────────────────

/**
 * GET /api/assignments/department/:dept
 */
router.get(
  '/api/assignments/department/:dept',
  [
    param('dept').notEmpty().withMessage('Department name is required'),
    query('status')
      .optional()
      .isIn(['pending', 'acknowledged', 'in_progress', 'completed', 'escalated'])
      .withMessage('Invalid status filter'),
    query('page').optional().isInt({ min: 1 }).withMessage('page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be 1-100'),
  ],
  listByDepartment
);

// ─── Create Assignment ─────────────────────────────────────────────────────────

/**
 * POST /api/assignments
 */
router.post(
  '/api/assignments',
  [
    body('issueId').notEmpty().withMessage('issueId is required'),
    body('category').notEmpty().withMessage('category is required'),
    body('wardId').notEmpty().withMessage('wardId is required'),
    body('zoneId').optional().isString(),
    body('notes').optional().isString(),
  ],
  createAssignment
);

// ─── Get Assignment by issueId ─────────────────────────────────────────────────

/**
 * GET /api/assignments/:issueId
 */
router.get(
  '/api/assignments/:issueId',
  [param('issueId').notEmpty().withMessage('issueId is required')],
  getAssignmentByIssueId
);

// ─── Update Assignment Status ──────────────────────────────────────────────────

/**
 * PUT /api/assignments/:id/status
 */
router.put(
  '/api/assignments/:id/status',
  [
    param('id').isMongoId().withMessage('id must be a valid MongoDB ObjectId'),
    body('status')
      .isIn(['pending', 'acknowledged', 'in_progress', 'completed', 'escalated'])
      .withMessage('status must be one of: pending, acknowledged, in_progress, completed, escalated'),
    body('assignedTo').optional().isString(),
    body('notes').optional().isString(),
  ],
  updateAssignmentStatus
);

// ─── Approve Escalation Draft ──────────────────────────────────────────────────

/**
 * POST /api/assignments/:id/escalation/:draftIndex/approve
 */
router.post(
  '/api/assignments/:id/escalation/:draftIndex/approve',
  [
    param('id').isMongoId().withMessage('id must be a valid MongoDB ObjectId'),
    param('draftIndex').isInt({ min: 0 }).withMessage('draftIndex must be a non-negative integer'),
  ],
  approveEscalationDraft
);

export default router;
