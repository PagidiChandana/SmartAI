import { Router } from 'express';
import { body, param, query } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import * as c from '../controllers/notification.controller.js';
import * as admin from '../controllers/admin.controller.js';
import * as r from '../controllers/reminder.controller.js';
import { REMINDER_TYPES } from '../models/Reminder.js';

const router = Router();
router.use(requireAuth);

// Student/educator/admin inbox
router.get('/', c.inbox);
router.patch('/:id/read', param('id').isMongoId().withMessage('Invalid id'), validate, c.markRead);
router.post('/read-all', c.markAllRead);

// Report inappropriate or incorrect content (any authenticated user)
router.post(
  '/reports',
  requireRole('student', 'educator', 'admin'),
  [
    body('resourceId').isMongoId().withMessage('Valid resource id required'),
    body('reason').trim().notEmpty().withMessage('Reason is required').isLength({ max: 200 }),
    body('details').optional().isString().isLength({ max: 2000 }),
  ],
  validate,
  admin.reportCreate
);

// ---- Reminders (all roles; strictly own records) ----
router.get(
  '/reminders',
  [
    query('status').optional().isIn(['scheduled', 'sending', 'sent', 'cancelled', 'done', 'missed']),
    query('upcoming').optional().isIn(['true', 'false']),
  ],
  validate,
  r.listReminders
);
router.post(
  '/reminders',
  [
    body('title').trim().notEmpty().withMessage('Title is required').isLength({ max: 200 }),
    body('body').optional().isString().isLength({ max: 2000 }),
    body('type').optional().isIn(REMINDER_TYPES).withMessage('Invalid reminder type'),
    body('refKind').optional().isIn(['none', 'planTask', 'assessment']),
    body('refId').optional().isString().isLength({ max: 100 }),
    body('scheduledAt').notEmpty().withMessage('scheduledAt is required').isISO8601().withMessage('scheduledAt must be ISO-8601'),
  ],
  validate,
  r.createReminder
);
router.patch(
  '/reminders/:id',
  [
    param('id').isMongoId().withMessage('Invalid id'),
    body('title').optional().isString().trim().isLength({ max: 200 }),
    body('body').optional().isString().isLength({ max: 2000 }),
    body('scheduledAt').optional().isISO8601().withMessage('scheduledAt must be ISO-8601'),
  ],
  validate,
  r.patchReminder
);
router.post(
  '/reminders/:id/status',
  [
    param('id').isMongoId().withMessage('Invalid id'),
    body('status').isIn(['cancelled', 'done']).withMessage('Status must be cancelled or done'),
  ],
  validate,
  r.setReminderStatus
);
router.delete('/reminders/:id', param('id').isMongoId().withMessage('Invalid id'), validate, r.deleteReminder);

router.get('/reminders/preferences', r.getPrefs);
router.put(
  '/reminders/preferences',
  [
    body('taskReminders').optional().isBoolean(),
    body('examReminders').optional().isBoolean(),
    body('sessionReminders').optional().isBoolean(),
    body('customReminders').optional().isBoolean(),
    body('leadMinutes').optional().isInt({ min: 0, max: 1440 }),
  ],
  validate,
  r.setPrefs
);

// Web Push: honest 501 stub (no VAPID/service-worker integration yet).
router.post('/push/subscribe', r.pushSubscribe);

export default router;
