import { Router } from 'express';
import { body, param } from 'express-validator';
import {
  register,
  login,
  logout,
  me,
  updateMe,
  changePassword,
  forgotPassword,
  resetPassword,
  listUsers,
  getUserById,
  updateUserRole,
  deleteUser,
} from '../controllers/auth.controller.js';
import { validate } from '../middleware/validate.middleware.js';
import { requireAuth, requireRole, requireSelfOrAdmin } from '../middleware/auth.middleware.js';
import { authLimiter, resetLimiter } from '../middleware/rateLimit.middleware.js';

const router = Router();

const passwordRule = body('password')
  .isLength({ min: 6 })
  .withMessage('Password must be at least 6 characters');

router.post(
  '/register',
  authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 80 }).withMessage('Name too long'),
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    passwordRule,
    body('role').optional().isIn(['student', 'educator']).withMessage('Role must be student or educator'),
  ],
  validate,
  register
);

router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().withMessage('Enter a valid email').normalizeEmail(),
    body('password').notEmpty().withMessage('Password is required'),
  ],
  validate,
  login
);

router.post('/logout', logout);

router.post(
  '/forgot-password',
  resetLimiter,
  [body('email').isEmail().withMessage('Enter a valid email').normalizeEmail()],
  validate,
  forgotPassword
);

router.post(
  '/reset-password',
  resetLimiter,
  [
    body('token').notEmpty().withMessage('Reset token is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ],
  validate,
  resetPassword
);

router.get('/me', requireAuth, me);

router.patch(
  '/me',
  requireAuth,
  [
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty'),
    body('email').optional().isEmail().withMessage('Enter a valid email').normalizeEmail(),
  ],
  validate,
  updateMe
);

router.patch(
  '/me/password',
  requireAuth,
  [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters'),
  ],
  validate,
  changePassword
);

// Ownership-protected single-user fetch (self or admin).
router.get('/users/:id', requireAuth, requireSelfOrAdmin('id'), getUserById);

// Admin-only management.
router.get('/users', requireAuth, requireRole('admin'), listUsers);
router.patch(
  '/users/:id/role',
  requireAuth,
  requireRole('admin'),
  [
    param('id').isMongoId().withMessage('Invalid user id'),
    body('role').isIn(['student', 'educator', 'admin', 'super_admin']).withMessage('Invalid role'),
  ],
  validate,
  updateUserRole
);
router.delete(
  '/users/:id',
  requireAuth,
  requireRole('admin'),
  [param('id').isMongoId().withMessage('Invalid user id')],
  validate,
  deleteUser
);

export default router;
