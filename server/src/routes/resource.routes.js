import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { resourceUpload } from '../middleware/upload.middleware.js';
import { resourceLimiter } from '../middleware/rateLimit.middleware.js';
import * as c from '../controllers/resource.controller.js';
import { RESOURCE_FORMATS, RESOURCE_DIFFICULTY, RESOURCE_STATUS, RESOURCE_EXAM_TYPES } from '../models/Resource.js';

const router = Router();
router.use(requireAuth);

const mongoId = (f) => param(f).isMongoId().withMessage('Invalid id');

const resourceFields = [
  body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }).withMessage('Title too long'),
  body('description').optional().isString().isLength({ max: 2000 }).withMessage('Description too long'),
  body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ max: 100 }),
  body('topic').optional().isString().trim().isLength({ max: 200 }),
  body('difficulty').optional().isIn(RESOURCE_DIFFICULTY).withMessage('Invalid difficulty'),
  body('examType').optional().isIn(RESOURCE_EXAM_TYPES).withMessage('Invalid exam type'),
  body('format').isIn(RESOURCE_FORMATS).withMessage('Invalid format'),
  body('externalUrl')
    .optional({ values: 'falsy' })
    .isURL({ protocols: ['http', 'https'], require_protocol: true })
    .withMessage('External URL must be a valid http(s) address')
    .isLength({ max: 2000 })
    .withMessage('URL too long'),
];

// ---- Educator submissions ----
router.post(
  '/',
  requireRole('educator', 'admin'),
  resourceLimiter,
  resourceUpload.single('file'),
  resourceFields,
  validate,
  c.createResource
);
router.get('/mine', requireRole('educator', 'admin'), c.listMine);
router.patch(
  '/:id',
  requireRole('educator', 'admin'),
  [
    mongoId('id'),
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty').isLength({ max: 200 }),
    body('description').optional().isString().isLength({ max: 2000 }),
    body('subject').optional().trim().notEmpty().withMessage('Subject cannot be empty').isLength({ max: 100 }),
    body('topic').optional().isString().trim().isLength({ max: 200 }),
    body('difficulty').optional().isIn(RESOURCE_DIFFICULTY).withMessage('Invalid difficulty'),
    body('examType').optional().isIn(RESOURCE_EXAM_TYPES).withMessage('Invalid exam type'),
    body('format').optional().isIn(RESOURCE_FORMATS).withMessage('Invalid format'),
    body('externalUrl')
      .optional({ values: 'falsy' })
      .isURL({ protocols: ['http', 'https'], require_protocol: true })
      .withMessage('External URL must be a valid http(s) address')
      .isLength({ max: 2000 }),
  ],
  validate,
  c.patchOwn
);
router.post('/:id/archive', requireRole('educator', 'admin'), mongoId('id'), validate, c.archiveOwn);
router.post('/:id/unarchive', requireRole('educator', 'admin'), mongoId('id'), validate, c.unarchiveOwn);
router.delete('/:id', requireRole('educator', 'admin'), mongoId('id'), validate, c.deleteOwn);

// ---- Admin review ----
router.get('/review/queue', requireRole('admin'), c.reviewQueue);
router.post(
  '/:id/approve',
  requireRole('admin'),
  [mongoId('id'), body('note').optional().isString().isLength({ max: 500 })],
  validate,
  c.approveResource
);
router.post(
  '/:id/reject',
  requireRole('admin'),
  [mongoId('id'), body('note').optional().isString().isLength({ max: 500 })],
  validate,
  c.rejectResource
);

// ---- Student library (educators browse approved + own; admin all) ----
router.get(
  '/',
  [
    query('q').optional().isString().trim().isLength({ max: 120 }),
    query('subject').optional().isString().trim().isLength({ max: 100 }),
    query('topic').optional().isString().trim().isLength({ max: 200 }),
    query('difficulty').optional().isIn(RESOURCE_DIFFICULTY),
    query('examType').optional().isIn(RESOURCE_EXAM_TYPES),
    query('format').optional().isIn(RESOURCE_FORMATS),
    query('status').optional().isIn(RESOURCE_STATUS),
    query('sort').optional().isIn(['newest', 'popular']),
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 48 }),
  ],
  validate,
  c.listLibrary
);

// ---- Recommendations (students; explainable rule-based, records persisted) ----
router.get('/recommendations', requireRole('student', 'admin'), c.recommendations);

// ---- Bookmarks ----
router.get('/bookmarks', c.listBookmarks);
router.post('/:id/bookmark', mongoId('id'), validate, c.toggleBookmark);
router.patch(
  '/:id/completed',
  [mongoId('id'), body('completed').isBoolean().withMessage('completed must be boolean')],
  validate,
  c.setCompleted
);

router.get('/:id/file', mongoId('id'), validate, c.downloadFile);
router.get('/:id', mongoId('id'), validate, c.getResource);

export default router;
