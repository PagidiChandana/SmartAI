import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { planLimiter } from '../middleware/rateLimit.middleware.js';
import * as c from '../controllers/planner.controller.js';
import { TASK_KIND, TASK_STATUS } from '../models/PlanTask.js';

const router = Router();

// Plans are private to the authenticated student (admins may support).
router.use(requireAuth, requireRole('student', 'admin'));

const mongoId = (f) => param(f).isMongoId().withMessage('Invalid id');
const dayRe = /^\d{4}-\d{2}-\d{2}$/;

// ---- Generation (rate-limited, usage-capped) ----
router.post(
  '/generate',
  planLimiter,
  [
    body('examDate').isISO8601().withMessage('Exam date must be a valid future date'),
    body('targetScore').optional().isFloat({ min: 0, max: 100 }).withMessage('Target score must be 0-100'),
    body('subjectIds').optional().isArray().withMessage('subjectIds must be an array'),
    body('subjectIds.*').optional().isMongoId().withMessage('Invalid subject id'),
    body('dailyHours').isFloat({ min: 0.5, max: 16 }).withMessage('Daily hours must be 0.5-16'),
    body('weeklyHours').optional().isFloat({ min: 1, max: 112 }).withMessage('Weekly hours must be 1-112'),
    body('title').optional().isString().trim().isLength({ max: 140 }).withMessage('Title too long'),
    body('force').optional().isBoolean().withMessage('force must be boolean'),
  ],
  validate,
  c.generatePlan
);

router.post('/:id/regenerate', planLimiter, mongoId('id'), validate, c.regeneratePlan);

// ---- Plans ----
router.get('/', c.listPlans);
router.get('/:id/summary', mongoId('id'), validate, c.planSummary);
router.get('/:id', mongoId('id'), validate, c.getPlan);
router.patch(
  '/:id',
  [
    mongoId('id'),
    body('title').optional().isString().trim().notEmpty().withMessage('Title cannot be empty').isLength({ max: 140 }),
    body('status').optional().isIn(['completed', 'archived']).withMessage('Status must be completed or archived'),
  ],
  validate,
  c.patchPlan
);

// ---- Tasks ----
router.get(
  '/:id/tasks',
  [
    mongoId('id'),
    query('subject').optional().isMongoId().withMessage('Invalid subject id'),
    query('status').optional().isIn(TASK_STATUS).withMessage('Invalid status'),
    query('date').optional().matches(dayRe).withMessage('date must be YYYY-MM-DD'),
    query('from').optional().matches(dayRe).withMessage('from must be YYYY-MM-DD'),
    query('to').optional().matches(dayRe).withMessage('to must be YYYY-MM-DD'),
  ],
  validate,
  c.listPlanTasks
);

const taskPatchRules = [
  body('title').optional().isString().trim().notEmpty().withMessage('Title cannot be empty').isLength({ max: 200 }),
  body('objective').optional().isString().isLength({ max: 500 }),
  body('kind').optional().isIn(TASK_KIND).withMessage('Invalid task kind'),
  body('date').optional().matches(dayRe).withMessage('date must be YYYY-MM-DD'),
  body('startMin').optional().isInt({ min: 0, max: 1439 }).withMessage('startMin must be 0-1439'),
  body('durationMin').optional().isInt({ min: 5, max: 240 }).withMessage('durationMin must be 5-240'),
  body('status').optional().isIn(TASK_STATUS).withMessage('Invalid status'),
];

router.patch('/tasks/:taskId', param('taskId').isMongoId().withMessage('Invalid task id'), taskPatchRules, validate, c.patchTask);
router.post('/tasks/:taskId/complete', param('taskId').isMongoId().withMessage('Invalid task id'), validate, c.completeTask);
router.post('/tasks/:taskId/skip', param('taskId').isMongoId().withMessage('Invalid task id'), validate, c.skipTask);
router.post(
  '/tasks/:taskId/reschedule',
  [
    param('taskId').isMongoId().withMessage('Invalid task id'),
    body('date').matches(dayRe).withMessage('date must be YYYY-MM-DD'),
    body('startMin').optional().isInt({ min: 0, max: 1439 }).withMessage('startMin must be 0-1439'),
  ],
  validate,
  c.rescheduleTask
);
router.delete('/tasks/:taskId', param('taskId').isMongoId().withMessage('Invalid task id'), validate, c.deleteTask);

export default router;
