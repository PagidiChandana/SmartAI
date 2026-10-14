import { Router } from 'express';
import { body, query } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as c from '../controllers/analytics.controller.js';

const router = Router();

// Students see only their own analytics; admins may pass ?userId= for support.
router.use(requireAuth, requireRole('student', 'admin'));

router.get('/overview', c.overview);
router.get(
  '/time',
  [query('days').optional().isInt({ min: 1, max: 90 }).withMessage('days must be 1-90')],
  validate,
  c.studyTime
);
router.get('/tasks', c.taskStats);
router.get('/syllabus', c.syllabus);
router.get(
  '/scores',
  [query('limit').optional().isInt({ min: 1, max: 100 })],
  validate,
  c.scores
);
router.get('/topics', c.topics);

// Adaptive learning (rule-based first, optional AI layer)
router.get('/recommendations', c.recommend);
router.post(
  '/boost',
  [body('topic').trim().notEmpty().withMessage('Topic is required').isLength({ max: 200 }), body('subject').optional().isString().isLength({ max: 100 })],
  validate,
  c.boost
);
router.get('/insights', c.insights);

export default router;
