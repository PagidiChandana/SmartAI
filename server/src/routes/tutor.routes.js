import { Router } from 'express';
import { body, param } from 'express-validator';
import { requireAuth, requireRole } from '../middleware/auth.middleware.js';
import { validate } from '../middleware/validate.middleware.js';
import { tutorLimiter } from '../middleware/rateLimit.middleware.js';
import * as c from '../controllers/tutor.controller.js';
import { TUTOR_MODES } from '../services/tutor.service.js';

const router = Router();

// Tutor is a student tool (admins may support). All data scoped to the user.
router.use(requireAuth, requireRole('student', 'admin'));

const mongoId = (f) => param(f).isMongoId().withMessage('Invalid id');

const askRules = [
  body('question')
    .isString()
    .withMessage('Question must be text')
    .trim()
    .notEmpty()
    .withMessage('Question cannot be empty')
    .isLength({ max: 2000 })
    .withMessage('Question too long (max 2000 characters)'),
  body('mode').optional().isIn(TUTOR_MODES).withMessage('Invalid tutor mode'),
];

router.get('/conversations', c.listConversations);
router.post(
  '/conversations',
  [
    body('title').optional().isString().trim().isLength({ max: 120 }),
    body('mode').optional().isIn(TUTOR_MODES).withMessage('Invalid tutor mode'),
  ],
  validate,
  c.createConversation
);
router.get('/conversations/:id', mongoId('id'), validate, c.getConversation);
router.patch(
  '/conversations/:id',
  [
    mongoId('id'),
    body('title').optional().isString().trim().notEmpty().withMessage('Title cannot be empty').isLength({ max: 120 }),
    body('mode').optional().isIn(TUTOR_MODES).withMessage('Invalid tutor mode'),
  ],
  validate,
  c.renameConversation
);
router.delete('/conversations/:id', mongoId('id'), validate, c.deleteConversation);

// Blocking answer (validated + persisted before responding).
router.post('/conversations/:id/messages', tutorLimiter, mongoId('id'), askRules, validate, c.ask);
// Streaming answer (SSE). New chat when :id omitted is not supported here —
// create the conversation first, then stream into it.
router.post('/conversations/:id/messages/stream', tutorLimiter, mongoId('id'), askRules, validate, c.askStream);

// Helpful / unhelpful votes on assistant answers.
router.patch(
  '/messages/:messageId/vote',
  [
    param('messageId').isMongoId().withMessage('Invalid message id'),
    body('vote').isIn(['helpful', 'unhelpful']).withMessage('Vote must be helpful or unhelpful'),
  ],
  validate,
  c.vote
);

export default router;
