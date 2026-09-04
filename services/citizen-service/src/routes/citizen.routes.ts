import { Router } from 'express';
import { body, param } from 'express-validator';
import { authMiddleware } from '../middleware/auth.middleware';
import { validateRequest } from '../middleware/validate.middleware';
import {
  registerCitizen,
  loginCitizen,
  getCitizen,
  updateCitizen,
  getCitizenIssues,
  getCitizensByWard,
} from '../controllers/citizen.controller';

const router = Router();

// ─── Validation rule sets ────────────────────────────────────────────────────

const registerRules = [
  body('phone')
    .notEmpty().withMessage('Phone is required')
    .matches(/^\+[1-9]\d{1,14}$/).withMessage('Phone must be in E.164 format (e.g. +919876543210)'),
  body('name')
    .notEmpty().withMessage('Name is required')
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('wardId')
    .notEmpty().withMessage('Ward ID is required'),
  body('preferredLanguage')
    .optional()
    .isLength({ min: 2, max: 10 }).withMessage('Language code must be 2-10 characters'),
  body('role')
    .optional()
    .isIn(['citizen', 'staff', 'admin']).withMessage('Role must be citizen, staff, or admin'),
];

const loginRules = [
  body('phone')
    .notEmpty().withMessage('Phone is required')
    .matches(/^\+[1-9]\d{1,14}$/).withMessage('Phone must be in E.164 format'),
];

const updateRules = [
  param('id').isMongoId().withMessage('Invalid citizen ID'),
  body('name')
    .optional()
    .isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters'),
  body('geohash')
    .optional()
    .isString().withMessage('Geohash must be a string'),
  body('preferredLanguage')
    .optional()
    .isLength({ min: 2, max: 10 }).withMessage('Language code must be 2-10 characters'),
  body('trustScore')
    .optional()
    .isFloat({ min: 0, max: 100 }).withMessage('Trust score must be 0-100'),
  body('role')
    .optional()
    .isIn(['citizen', 'staff', 'admin']).withMessage('Role must be citizen, staff, or admin'),
];

const idParamRules = [
  param('id').isMongoId().withMessage('Invalid citizen ID'),
];

const wardParamRules = [
  param('wardId').notEmpty().withMessage('Ward ID is required'),
];

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * @route  POST /api/citizens/register
 * @desc   Register a new citizen
 * @access Public
 */
router.post(
  '/register',
  registerRules,
  validateRequest,
  registerCitizen,
);

/**
 * @route  POST /api/citizens/login
 * @desc   Login and receive a JWT token
 * @access Public
 */
router.post(
  '/login',
  loginRules,
  validateRequest,
  loginCitizen,
);

/**
 * @route  GET /api/citizens/ward/:wardId
 * @desc   List all citizens in a ward (paginated)
 * @access Public  (would be Protected in production; left open for demo)
 */
router.get(
  '/ward/:wardId',
  wardParamRules,
  validateRequest,
  getCitizensByWard,
);

/**
 * @route  GET /api/citizens/:id
 * @desc   Get citizen profile by ID
 * @access Protected
 */
router.get(
  '/:id',
  idParamRules,
  validateRequest,
  authMiddleware,
  getCitizen,
);

/**
 * @route  PUT /api/citizens/:id
 * @desc   Update citizen profile (own profile only, or admin)
 * @access Protected
 */
router.put(
  '/:id',
  updateRules,
  validateRequest,
  authMiddleware,
  updateCitizen,
);

/**
 * @route  GET /api/citizens/:id/issues
 * @desc   Proxy to issue-service to retrieve issues filed by this citizen
 * @access Protected
 */
router.get(
  '/:id/issues',
  idParamRules,
  validateRequest,
  authMiddleware,
  getCitizenIssues,
);

export default router;
