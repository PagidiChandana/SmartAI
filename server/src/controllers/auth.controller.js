import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiResponse } from '../utils/ApiResponse.js';
import { env } from '../config/env.js';
import * as authService from '../services/auth.service.js';

function setAuthCookie(res, token) {
  res.cookie(env.cookieName, token, authService.cookieOptions());
}

export const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  setAuthCookie(res, result.token);
  // Cookie-only sessions: the JWT lives in the httpOnly cookie, never in
  // the body or localStorage (XSS cannot read httpOnly cookies).
  new ApiResponse('Registered successfully', { user: result.user }, 201).send(res);
});

export const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  setAuthCookie(res, result.token);
  new ApiResponse('Logged in successfully', { user: result.user }).send(res);
});

export const logout = asyncHandler(async (_req, res) => {
  res.clearCookie(env.cookieName, { ...authService.cookieOptions(), maxAge: undefined });
  new ApiResponse('Logged out successfully', null).send(res);
});

export const me = asyncHandler(async (req, res) => {
  new ApiResponse('Profile fetched', req.user.toSafeJSON()).send(res);
});

export const updateMe = asyncHandler(async (req, res) => {
  const updated = await authService.updateMe(req.user._id, req.body);
  new ApiResponse('Profile updated', updated).send(res);
});

export const changePassword = asyncHandler(async (req, res) => {
  const updated = await authService.changePassword(req.user._id, req.body);
  new ApiResponse('Password changed', updated).send(res);
});

export const forgotPassword = asyncHandler(async (req, res) => {
  const { issued, rawToken } = await authService.forgotPassword(req.body.email);
  // Generic message always (anti-enumeration). Raw token only in non-production
  // so the frontend demo + tests can complete the flow before email is wired.
  const data = env.isProd ? null : rawToken && issued ? { devResetToken: rawToken } : null;
  new ApiResponse('If that email exists, a reset link has been generated', data).send(res);
});

export const resetPassword = asyncHandler(async (req, res) => {
  const updated = await authService.resetPassword(req.body);
  new ApiResponse('Password reset successful. Please log in.', updated).send(res);
});

// ---- Admin ----
export const listUsers = asyncHandler(async (req, res) => {
  const result = await authService.listUsers(req.query);
  new ApiResponse('Users fetched', result).send(res);
});

export const getUserById = asyncHandler(async (req, res) => {
  const user = await authService.getUserById(req.params.id, req.user);
  new ApiResponse('User fetched', user).send(res);
});

export const updateUserRole = asyncHandler(async (req, res) => {
  const user = await authService.updateUserRole(req.params.id, req.body.role, req.user);
  const { audit } = await import('../models/AuditLog.js');
  await audit(req.user, 'user.role', { targetType: 'User', targetId: req.params.id, meta: { role: req.body.role } });
  new ApiResponse('Role updated', user).send(res);
});

export const deleteUser = asyncHandler(async (req, res) => {
  const result = await authService.deleteUser(req.params.id, req.user);
  const { audit } = await import('../models/AuditLog.js');
  await audit(req.user, 'user.delete', { targetType: 'User', targetId: req.params.id });
  new ApiResponse('User deleted', result).send(res);
});
