import { Router } from 'express';
import { body, query, param } from 'express-validator';
import * as IssueController from '../controllers/issue.controller';

const router = Router();

// ─── Validators ───────────────────────────────────────────────────────────────

const locationValidator = [
  body('location').isObject().withMessage('location must be an object'),
  body('location.lat')
    .isFloat({ min: -90, max: 90 })
    .withMessage('location.lat must be between -90 and 90'),
  body('location.lng')
    .isFloat({ min: -180, max: 180 })
    .withMessage('location.lng must be between -180 and 180'),
  body('location.geohash')
    .isString()
    .notEmpty()
    .withMessage('location.geohash is required'),
  body('location.address')
    .isString()
    .notEmpty()
    .withMessage('location.address is required'),
  body('location.wardId')
    .isString()
    .notEmpty()
    .withMessage('location.wardId is required'),
  body('location.wardName')
    .isString()
    .notEmpty()
    .withMessage('location.wardName is required'),
];

const createIssueValidator = [
  body('reportedBy')
    .isString()
    .notEmpty()
    .withMessage('reportedBy (citizen ID) is required'),
  body('rawDescription')
    .isString()
    .isLength({ min: 10, max: 2000 })
    .withMessage('rawDescription must be 10–2000 characters'),
  body('channel')
    .optional()
    .isIn(['app', 'whatsapp', 'voice', 'qr'])
    .withMessage('channel must be one of: app, whatsapp, voice, qr'),
  body('category')
    .optional()
    .isIn(['roads', 'garbage', 'streetlights', 'water', 'drainage', 'other'])
    .withMessage('category must be one of: roads, garbage, streetlights, water, drainage, other'),
  body('media').optional().isArray().withMessage('media must be an array of URLs'),
  body('media.*').optional().isURL().withMessage('Each media item must be a valid URL'),
  ...locationValidator,
];

const updateStatusValidator = [
  body('status')
    .isIn(['pending', 'validated', 'assigned', 'in_progress', 'resolved', 'escalated'])
    .withMessage('status must be one of: pending, validated, assigned, in_progress, resolved, escalated'),
  body('updatedBy').isString().notEmpty().withMessage('updatedBy is required'),
];

const validateIssueValidator = [
  body('citizenId').isString().notEmpty().withMessage('citizenId is required'),
  body('response')
    .isIn(['confirmed_bad', 'confirmed_minor', 'denied', 'worse'])
    .withMessage('response must be one of: confirmed_bad, confirmed_minor, denied, worse'),
];

const listIssuesValidator = [
  query('status')
    .optional()
    .isIn(['pending', 'validated', 'assigned', 'in_progress', 'resolved', 'escalated'])
    .withMessage('Invalid status filter'),
  query('category')
    .optional()
    .isIn(['roads', 'garbage', 'streetlights', 'water', 'drainage', 'other'])
    .withMessage('Invalid category filter'),
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('page must be a positive integer'),
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('limit must be between 1 and 100'),
];

// ─── Health ────────────────────────────────────────────────────────────────────
// GET /health (also mounted on top-level /health in index.ts)
router.get('/health', IssueController.healthCheck);

// ─── Issue CRUD ───────────────────────────────────────────────────────────────

/**
 * POST /api/issues
 * Create a new civic issue
 */
router.post('/', createIssueValidator, IssueController.createIssue);

/**
 * GET /api/issues
 * List issues with filters: status, category, wardId, reportedBy, page, limit
 */
router.get('/', listIssuesValidator, IssueController.listIssues);

/**
 * GET /api/issues/ward/:wardId/stats
 * Get aggregated stats for a specific ward
 * NOTE: Must be defined BEFORE /api/issues/:id to avoid param collision
 */
router.get('/ward/:wardId/stats', IssueController.getWardStats);

/**
 * GET /api/issues/webhook/whatsapp
 * Meta WhatsApp Cloud API verification challenge
 */
router.get('/webhook/whatsapp', IssueController.whatsappWebhookVerify);

/**
 * POST /api/issues/webhook/whatsapp
 * Meta WhatsApp Cloud API incoming message receiver
 */
router.post('/webhook/whatsapp', IssueController.whatsappWebhookReceive);

/**
 * GET /api/issues/:id
 * Get a single issue by ID
 */
router.get('/:id', IssueController.getIssueById);

/**
 * PATCH /api/issues/:id/status
 * Update issue status and trigger notification
 */
router.patch('/:id/status', updateStatusValidator, IssueController.updateIssueStatus);

/**
 * POST /api/issues/:id/analyze
 * Run DNA analysis on the issue, then trigger assignment
 */
router.post('/:id/analyze', IssueController.analyzeIssue);

/**
 * POST /api/issues/:id/validate
 * Community validation of an issue
 */
router.post('/:id/validate', validateIssueValidator, IssueController.validateIssue);

export default router;
