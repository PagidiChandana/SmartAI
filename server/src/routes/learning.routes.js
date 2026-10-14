import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { syllabusUpload } from '../middleware/upload.middleware.js';
import * as c from '../controllers/learning.controller.js';
import { ACADEMIC_LEVELS, LEARNING_STYLES, EXAM_TYPES } from '../models/StudentProfile.js';
import { TOPIC_STATUS, TOPIC_DIFFICULTY } from '../models/Topic.js';

const router = Router();

// All learning-setup data is private to the authenticated user.
// Students own it; admins may view/support. Educators are out of scope here.
router.use(requireAuth, requireRole('student', 'admin'));

const mongoId = (f) => param(f).isMongoId().withMessage('Invalid id');

// ---- Profile ----
router.get('/profile', c.getProfile);
router.put(
  '/profile',
  [
    body('academicLevel').optional().isIn(ACADEMIC_LEVELS).withMessage('Invalid academic level'),
    body('subjects').optional().isArray({ max: 20 }).withMessage('Subjects must be an array'),
    body('subjects.*').optional().isString().trim().isLength({ min: 1, max: 60 }).withMessage('Each subject 1-60 chars'),
    body('learningStyle').optional().isIn(LEARNING_STYLES).withMessage('Invalid learning style'),
    body('examType').optional().isIn(EXAM_TYPES).withMessage('Invalid exam type'),
    body('dailyStudyHours').optional().isFloat({ min: 0.5, max: 16 }).withMessage('Daily hours must be 0.5-16'),
  ],
  validate,
  c.upsertProfile
);

// ---- Goals ----
router.get('/goals', c.listGoals);
router.post(
  '/goals',
  [
    body('title').trim().notEmpty().withMessage('Goal title required').isLength({ max: 140 }).withMessage('Title too long'),
    body('subject').optional().isString().trim().isLength({ max: 100 }),
    body('targetDate').isISO8601().withMessage('Target date must be a valid date'),
    body('dailyStudyHours').optional().isFloat({ min: 0.5, max: 16 }).withMessage('Daily hours must be 0.5-16'),
    body('status').optional().isIn(['active', 'completed', 'paused']),
  ],
  validate,
  c.createGoal
);
router.patch(
  '/goals/:id',
  [
    mongoId('id'),
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('targetDate').optional().isISO8601().withMessage('Target date must be a valid date'),
    body('dailyStudyHours').optional().isFloat({ min: 0.5, max: 16 }),
    body('status').optional().isIn(['active', 'completed', 'paused']),
  ],
  validate,
  c.patchGoal
);
router.delete('/goals/:id', mongoId('id'), validate, c.deleteGoal);

// ---- Subjects ----
router.get('/subjects', c.listSubjects);
router.post(
  '/subjects',
  [
    body('name').trim().notEmpty().withMessage('Subject name required').isLength({ max: 100 }).withMessage('Name too long'),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  c.createSubject
);
router.patch(
  '/subjects/:id',
  [
    mongoId('id'),
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  c.patchSubject
);
router.delete('/subjects/:id', mongoId('id'), validate, c.deleteSubject);

// ---- Topics ----
router.get(
  '/topics',
  [
    query('subject').optional().isMongoId().withMessage('Invalid subject id'),
    query('status').optional().isIn(TOPIC_STATUS).withMessage('Invalid status'),
  ],
  validate,
  c.listTopics
);
router.post(
  '/topics',
  [
    body('subject').isMongoId().withMessage('Subject is required'),
    body('title').trim().notEmpty().withMessage('Topic title required').isLength({ max: 200 }),
    body('section').optional().isString().isLength({ max: 200 }),
    body('status').optional().isIn(TOPIC_STATUS),
    body('difficulty').optional().isIn(TOPIC_DIFFICULTY),
    body('confidence').optional().isInt({ min: 1, max: 5 }).withMessage('Confidence must be 1-5'),
  ],
  validate,
  c.createTopic
);
router.post(
  '/topics/bulk',
  [
    body('subject').isMongoId().withMessage('Subject is required'),
    body('titles').isArray({ min: 1, max: 100 }).withMessage('Provide 1-100 titles'),
  ],
  validate,
  c.createTopicsBulk
);
router.patch(
  '/topics/:id',
  [
    mongoId('id'),
    body('subject').optional().isMongoId().withMessage('Invalid subject id'),
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('status').optional().isIn(TOPIC_STATUS),
    body('difficulty').optional().isIn(TOPIC_DIFFICULTY),
    body('confidence').optional().isInt({ min: 1, max: 5 }).withMessage('Confidence must be 1-5'),
  ],
  validate,
  c.patchTopic
);
router.delete('/topics/:id', mongoId('id'), validate, c.deleteTopic);

// ---- Syllabus upload + extraction (PDF/TXT/MD, 10 MB) ----
router.post('/uploads', syllabusUpload.single('file'), c.uploadSyllabus);
router.get('/uploads', c.listUploads);

// ---- Diagnostics ----
router.get('/diagnostics', c.listDiagnostics);
router.post(
  '/diagnostics/start',
  [
    body('subjectId').optional().isMongoId().withMessage('Invalid subject id'),
    body('subjectName').optional().isString().trim().isLength({ max: 100 }),
  ],
  validate,
  c.startDiagnostic
);
router.post(
  '/diagnostics/:id/submit',
  [mongoId('id'), body('answers').isArray().withMessage('Answers must be an array')],
  validate,
  c.submitDiagnostic
);

// ---- Checklist ----
router.get('/checklist', c.getChecklist);

export default router;
