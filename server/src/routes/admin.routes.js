import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { requireAuth, requireRole, requireSuperAdmin } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as c from '../controllers/admin.controller.js';
import { ACCOUNT_STATUS, ROLES } from '../models/User.js';
import { TAXONOMY_TYPES } from '../models/Taxonomy.js';
import { RESOURCE_STATUS, RESOURCE_FORMATS } from '../models/Resource.js';

const router = Router();
router.use(requireAuth, requireRole('admin'));

const mongoId = (f) => param(f).isMongoId().withMessage('Invalid id');
const paging = [
  query('page').optional().isInt({ min: 1 }).withMessage('Invalid page'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Invalid limit'),
];

router.get('/stats', c.stats);
router.patch(
  '/users/:id/status',
  [mongoId('id'), body('status').isIn(ACCOUNT_STATUS).withMessage('Invalid status')],
  validate,
  c.setStatus
);

// ---------- User management (extended) ----------
router.post(
  '/users',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }),
    body('email').isEmail().withMessage('Valid email required').normalizeEmail(),
    body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
    body('role').optional().isIn(ROLES).withMessage('Invalid role'),
  ],
  validate,
  c.createUser
);
router.get('/users/:id', mongoId('id'), validate, c.userDetail);
router.post('/users/:id/reset-password', mongoId('id'), validate, c.userResetPassword);

router.get('/taxonomy', c.taxonomy);
router.post(
  '/taxonomy',
  [body('type').isIn(TAXONOMY_TYPES).withMessage('Invalid type'), body('value').trim().notEmpty().withMessage('Value is required').isLength({ max: 100 })],
  validate,
  c.taxonomyAdd
);
router.patch(
  '/taxonomy/:id',
  [mongoId('id'), body('active').isBoolean().withMessage('active must be boolean')],
  validate,
  c.taxonomyToggle
);
router.delete('/taxonomy/:id', mongoId('id'), validate, c.taxonomyDelete);

router.get('/settings', c.settings);
router.put(
  '/settings',
  [body('key').trim().notEmpty().withMessage('Key is required').isLength({ max: 100 }), body('value').optional().isString().isLength({ max: 5000 })],
  validate,
  c.settingSet
);

router.get('/usage', c.usage);
router.get(
  '/audit',
  [query('action').optional().isString().isLength({ max: 100 }), query('page').optional().isInt({ min: 1 }), query('limit').optional().isInt({ min: 1, max: 100 })],
  validate,
  c.auditLog
);

router.get(
  '/reports',
  [query('status').optional().isIn(['open', 'resolved', 'dismissed', 'all'])],
  validate,
  c.reports
);
router.post(
  '/reports/:id/handle',
  [mongoId('id'), body('status').isIn(['resolved', 'dismissed']).withMessage('Invalid status'), body('archiveResource').optional().isBoolean(), body('note').optional().isString().isLength({ max: 500 })],
  validate,
  c.reportHandle
);

// ---------- Study plans monitoring (metadata only; plans are never edited here) ----------
router.get(
  '/plans',
  [query('status').optional().isIn(['active', 'archived', 'completed']), query('q').optional().isString().isLength({ max: 100 }), ...paging],
  validate,
  c.plans
);
router.get('/plans/:id', mongoId('id'), validate, c.planDetail);
router.get('/plans-limits', c.planLimits);

// ---------- Learning resources management ----------
router.get(
  '/resources',
  [
    query('status').optional().isIn(RESOURCE_STATUS),
    query('format').optional().isIn(RESOURCE_FORMATS),
    query('q').optional().isString().isLength({ max: 120 }),
    ...paging,
  ],
  validate,
  c.resources
);
router.patch(
  '/resources/:id',
  [
    mongoId('id'),
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty').isLength({ max: 200 }),
    body('description').optional().isString().isLength({ max: 2000 }),
    body('subject').optional().trim().notEmpty().withMessage('Subject cannot be empty').isLength({ max: 100 }),
    body('topic').optional().isString().isLength({ max: 200 }),
    body('difficulty').optional().isIn(['beginner', 'intermediate', 'advanced']),
    body('examType').optional().isString().isLength({ max: 50 }),
    body('format').optional().isIn(RESOURCE_FORMATS),
  ],
  validate,
  c.resourceUpdate
);
router.delete('/resources/:id', mongoId('id'), validate, c.resourceDelete);

// ---------- Quizzes & assessments management (scores are never mutated here) ----------
router.get(
  '/assessments',
  [query('status').optional().isIn(['draft', 'published', 'closed', 'archived']), query('q').optional().isString().isLength({ max: 100 }), ...paging],
  validate,
  c.assessments
);
router.get('/assessments/:id/attempts', [mongoId('id'), ...paging], validate, c.assessmentAttempts);

// ---------- AI service monitoring (keys never leave the server) ----------
router.get('/ai-status', c.aiStatus);

// ---------- Notifications & announcements ----------
router.post(
  '/announcements',
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('body').optional().isString().isLength({ max: 2000 }),
    body('roles').optional().isArray({ max: 4 }).withMessage('roles must be an array'),
  ],
  validate,
  c.announce
);
router.get('/notifications/stats', c.notifStats);

// ---------- Platform analytics, health, roles ----------
router.get(
  '/analytics',
  [query('days').optional().isInt({ min: 1, max: 90 }).withMessage('days must be 1-90')],
  validate,
  c.analytics
);
router.get('/health', c.health);
router.get('/roles', c.roles);

export default router;
