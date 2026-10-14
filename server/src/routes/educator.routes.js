import { Router } from 'express';
import { body, param } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as c from '../controllers/educator.controller.js';

const router = Router();
router.use(requireAuth, requireRole('educator', 'admin'));

router.get('/profile', c.getProfile);
router.patch(
  '/profile',
  [
    body('name').optional().isString().trim().isLength({ max: 80 }),
    body('bio').optional().isString().isLength({ max: 1000 }),
    body('teachingSubjects').optional().isArray({ max: 20 }).withMessage('teachingSubjects must be an array'),
    body('teachingSubjects.*').optional().isString().trim().isLength({ min: 1, max: 60 }),
  ],
  validate,
  c.updateProfile
);
router.get('/overview', c.overview);
router.get('/students', c.listStudents);
router.get('/students/:id', param('id').isMongoId().withMessage('Invalid id'), validate, c.studentProgress);
router.get('/class-summary', c.classSummary);
router.post(
  '/notes',
  [
    body('studentId').isMongoId().withMessage('Valid student id required'),
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('body').optional().isString().isLength({ max: 2000 }),
  ],
  validate,
  c.sendNote
);

export default router;
