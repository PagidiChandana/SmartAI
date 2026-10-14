import { Router } from 'express';
import { body, param } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { assessmentLimiter } from '../middleware/rateLimit.middleware.js';
import * as c from '../controllers/assessment.controller.js';
import { ASSESSMENT_KIND, ASSESSMENT_STATUS, ASSESSMENT_DIFFICULTY, RELEASE_MODES } from '../models/Assessment.js';
import { QUESTION_TYPES } from '../models/Question.js';

const router = Router();
router.use(requireAuth);

const mongoId = (f) => param(f).isMongoId().withMessage('Invalid id');
const edu = () => requireRole('educator', 'admin');

// ---------- Educator: assessments ----------
router.post(
  '/',
  edu(),
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('description').optional().isString().isLength({ max: 2000 }),
    body('kind').optional().isIn(ASSESSMENT_KIND),
    body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ max: 100 }),
    body('topic').optional().isString().isLength({ max: 200 }),
    body('difficulty').optional().isIn(ASSESSMENT_DIFFICULTY),
    body('durationMin').optional().isInt({ min: 0, max: 600 }).withMessage('Duration must be 0-600 minutes'),
    body('deadline').optional({ values: 'falsy' }).isISO8601().withMessage('Deadline must be a valid date'),
    body('maxAttempts').optional().isInt({ min: 1, max: 10 }),
    body('visibility').optional().isIn(['all', 'selected']),
    body('releaseMode').optional().isIn(RELEASE_MODES),
    body('showExplanations').optional().isBoolean(),
  ],
  validate,
  c.createAssessment
);
router.get('/mine', edu(), c.listOwned);
router.patch(
  '/:id',
  edu(),
  [
    mongoId('id'),
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('durationMin').optional().isInt({ min: 0, max: 600 }),
    body('deadline').optional({ values: 'falsy' }).isISO8601(),
    body('maxAttempts').optional().isInt({ min: 1, max: 10 }),
    body('releaseMode').optional().isIn(RELEASE_MODES),
    body('showExplanations').optional().isBoolean(),
    body('visibility').optional().isIn(['all', 'selected']),
  ],
  validate,
  c.patchAssessment
);
router.post(
  '/:id/status',
  edu(),
  [mongoId('id'), body('status').isIn(ASSESSMENT_STATUS).withMessage('Invalid status')],
  validate,
  c.setStatus
);
router.post(
  '/:id/assignees',
  edu(),
  [mongoId('id'), body('emails').isArray({ min: 1, max: 200 }).withMessage('Provide 1-200 student emails')],
  validate,
  c.setAssignees
);
router.post(
  '/:id/assignees/add',
  edu(),
  [mongoId('id'), body('email').isEmail().withMessage('Valid student email required')],
  validate,
  c.addAssignee
);
router.post(
  '/:id/release',
  edu(),
  [mongoId('id'), body('released').isBoolean().withMessage('released must be boolean')],
  validate,
  c.releaseResults
);

// ---------- Educator: questions ----------
const questionRules = [
  body('type').isIn(QUESTION_TYPES).withMessage('Invalid question type'),
  body('text').trim().notEmpty().withMessage('Question text is required').isLength({ max: 2000 }),
  body('topic').optional().isString().isLength({ max: 200 }),
  body('options').optional().isArray({ max: 6 }),
  body('correctOption').optional().isInt({ min: 0, max: 5 }),
  body('correctBool').optional().isBoolean(),
  body('modelAnswer').optional().isString().isLength({ max: 2000 }),
  body('explanation').optional().isString().isLength({ max: 2000 }),
  body('marks').optional().isFloat({ min: 0.5, max: 100 }),
];
router.post('/:id/questions', edu(), mongoId('id'), questionRules, validate, c.addQuestion);
router.patch('/:id/questions/:questionId', edu(), [mongoId('id'), param('questionId').isMongoId()], validate, c.patchQuestion);
router.delete('/:id/questions/:questionId', edu(), [mongoId('id'), param('questionId').isMongoId()], validate, c.deleteQuestion);
router.post(
  '/:id/questions/:questionId/review',
  edu(),
  [mongoId('id'), param('questionId').isMongoId(), body('approved').isBoolean().withMessage('approved must be boolean')],
  validate,
  c.reviewQuestion
);
router.post(
  '/:id/draft',
  edu(),
  assessmentLimiter,
  [
    mongoId('id'),
    body('topic').optional().isString().isLength({ max: 200 }),
    body('count').optional().isInt({ min: 1, max: 10 }),
    body('resourceId').optional().isMongoId(),
  ],
  validate,
  c.draftQuestions
);

// ---------- Educator: grading + analytics ----------
router.get('/:id/grading', edu(), mongoId('id'), validate, c.gradingQueue);
router.get('/:id/questions', edu(), mongoId('id'), validate, c.ownerQuestions);
router.patch(
  '/attempts/:attemptId/grade/:questionId',
  edu(),
  [
    param('attemptId').isMongoId().withMessage('Invalid attempt id'),
    param('questionId').isMongoId().withMessage('Invalid question id'),
    body('marks').isFloat({ min: 0 }).withMessage('Marks must be a number'),
    body('feedback').optional().isString().isLength({ max: 1000 }),
  ],
  validate,
  c.gradeShort
);
router.get('/:id/analytics', edu(), mongoId('id'), validate, c.analytics);

// ---------- Student ----------
router.get('/available', requireRole('student', 'admin'), c.listAvailable);
router.get('/my/performance', requireRole('student', 'admin'), c.myPerformance);
router.post('/:id/start', requireRole('student'), assessmentLimiter, mongoId('id'), validate, c.startAttempt);
router.get('/:id/history', requireRole('student', 'admin'), mongoId('id'), validate, c.attemptHistory);
router.patch(
  '/attempts/:attemptId/autosave',
  requireRole('student'),
  [
    param('attemptId').isMongoId().withMessage('Invalid attempt id'),
    body('answers').isArray().withMessage('answers must be an array'),
  ],
  validate,
  c.autosave
);
router.post(
  '/attempts/:attemptId/submit',
  requireRole('student'),
  [param('attemptId').isMongoId().withMessage('Invalid attempt id')],
  validate,
  c.submitAttempt
);
router.get('/attempts/:attemptId', requireRole('student', 'admin'), param('attemptId').isMongoId(), validate, c.attemptResult);

export default router;
