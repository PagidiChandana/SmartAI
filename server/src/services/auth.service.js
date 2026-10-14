import crypto from 'node:crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { User, PUBLIC_ROLES, ROLES, isAdminRole, isSuperAdmin } from '../models/User.js';
import { ApiError } from '../utils/ApiError.js';

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), role: user.role }, env.jwtSecret, {
    expiresIn: env.jwtExpiresIn,
  });
}

function sanitizeRole(role) {
  const r = (role || 'student').toLowerCase();
  // Privileged roles can NEVER be self-assigned through public registration.
  if (r === 'admin' || r === 'super_admin') {
    throw new ApiError(403, 'Privileged roles cannot be assigned via registration');
  }
  if (!PUBLIC_ROLES.includes(r)) throw new ApiError(400, 'Role must be student or educator');
  return r;
}

export function cookieOptions() {
  const sameSite = ['lax', 'strict', 'none'].includes(env.cookieSameSite) ? env.cookieSameSite : 'lax';
  return {
    httpOnly: true,
    // Browsers reject SameSite=None without Secure — enforce it.
    secure: sameSite === 'none' ? true : env.cookieSecure,
    sameSite,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  };
}

export async function register({ name, email, password, role }) {
  const { Setting } = await import('../models/Setting.js');
  const toggle = await Setting.findOne({ key: 'registration.enabled' }).lean();
  if (toggle && String(toggle.value).toLowerCase() === 'false') {
    throw new ApiError(403, 'Public registration is currently disabled by the administrator');
  }
  const exists = await User.findOne({ email: email.toLowerCase() });
  if (exists) throw new ApiError(409, 'Email already registered');
  const safeRole = sanitizeRole(role);
  const user = await User.create({ name, email: email.toLowerCase(), password, role: safeRole });
  return { user: user.toSafeJSON(), token: signToken(user) };
}

export async function login({ email, password }) {
  const user = await User.findOne({ email: email.toLowerCase() }).select('+password');
  if (!user) throw new ApiError(401, 'Invalid email or password');
  const ok = await user.comparePassword(password);
  if (!ok) throw new ApiError(401, 'Invalid email or password');
  if (user.status !== 'active') throw new ApiError(403, 'Account is suspended. Contact support.');
  const fresh = await User.findById(user._id);
  return { user: fresh.toSafeJSON(), token: signToken(fresh) };
}

export async function updateMe(userId, { name, email }) {
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'User not found');
  if (email && email.toLowerCase() !== user.email) {
    const taken = await User.findOne({ email: email.toLowerCase() });
    if (taken) throw new ApiError(409, 'Email already in use');
    user.email = email.toLowerCase();
  }
  if (name) user.name = name;
  await user.save();
  return user.toSafeJSON();
}

export async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw new ApiError(404, 'User not found');
  const ok = await user.comparePassword(currentPassword);
  if (!ok) throw new ApiError(401, 'Current password is incorrect');
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  return user.toSafeJSON();
}

// Forgot-password: store SHA-256 hash + expiry, return raw token only to caller.
// Route layer exposes raw token ONLY in non-production (dev/testing + future mailer).
export async function forgotPassword(email) {
  const user = await User.findOne({ email: email.toLowerCase() });
  // Always respond generically to prevent email enumeration.
  if (!user) return { issued: false };
  const raw = crypto.randomBytes(32).toString('hex');
  user.passwordResetToken = crypto.createHash('sha256').update(raw).digest('hex');
  user.passwordResetExpires = new Date(Date.now() + env.resetTokenMinutes * 60 * 1000);
  await user.save({ validateBeforeSave: false });
  return { issued: true, rawToken: raw };
}

export async function resetPassword({ token, newPassword }) {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const user = await User.findOne({
    passwordResetToken: hash,
    passwordResetExpires: { $gt: new Date() },
  }).select('+passwordResetToken +passwordResetExpires');
  if (!user) throw new ApiError(400, 'Reset token is invalid or has expired');
  user.password = newPassword;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  return user.toSafeJSON();
}

// ---- Admin-only operations ----
export async function listUsers({ page = 1, limit = 20, q, role, status } = {}) {
  const p = Math.max(1, Number(page) || 1);
  const l = Math.min(100, Math.max(1, Number(limit) || 20));
  const filter = {};
  if (role) {
    if (!ROLES.includes(role)) throw new ApiError(400, 'Invalid role filter');
    filter.role = role;
  }
  if (status) {
    if (!['active', 'suspended'].includes(status)) throw new ApiError(400, 'Invalid status filter');
    filter.status = status;
  }
  if (q?.trim()) {
    const safe = q.trim().slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [{ name: new RegExp(safe, 'i') }, { email: new RegExp(safe, 'i') }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l),
    User.countDocuments(filter),
  ]);
  return { items: items.map((u) => u.toSafeJSON()), page: p, limit: l, total };
}

export async function getUserById(id, requester) {
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  if (!isAdminRole(requester.role) && requester._id.toString() !== user._id.toString()) {
    throw new ApiError(403, 'You can only access your own records');
  }
  return user.toSafeJSON();
}

export async function updateUserRole(id, role, requester) {
  if (!ROLES.includes(role)) throw new ApiError(400, 'Invalid role');
  if (id === requester._id.toString()) throw new ApiError(400, 'Admins cannot change their own role');
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'User not found');
  const requesterIsSuper = isSuperAdmin(requester.role);
  // Only super admins may grant or revoke privileged roles, and only
  // super admins may change another privileged account at all. This blocks
  // ordinary admins from escalating themselves or anyone else.
  if ((role === 'admin' || role === 'super_admin' || isSuperAdmin(user.role)) && !requesterIsSuper) {
    throw new ApiError(403, 'Only super admins can manage admin privileges');
  }
  // Never demote or strand the last super admin.
  if (isSuperAdmin(user.role) && role !== 'super_admin') {
    const remaining = await User.countDocuments({ role: 'super_admin', _id: { $ne: user._id } });
    if (remaining === 0) throw new ApiError(400, 'Cannot demote the last super admin');
  }
  user.role = role;
  await user.save();
  return user.toSafeJSON();
}

export async function deleteUser(id, requester) {
  if (id === requester._id.toString()) throw new ApiError(400, 'Admins cannot delete themselves');
  const target = await User.findById(id);
  if (!target) throw new ApiError(404, 'User not found');
  // Only super admins may delete privileged accounts; never the last one.
  if ((target.role === 'admin' || isSuperAdmin(target.role)) && !isSuperAdmin(requester.role)) {
    throw new ApiError(403, 'Only super admins can delete admin accounts');
  }
  if (isSuperAdmin(target.role)) {
    const remaining = await User.countDocuments({ role: 'super_admin', _id: { $ne: target._id } });
    if (remaining === 0) throw new ApiError(400, 'Cannot delete the last super admin');
  }
  const user = await User.findByIdAndDelete(id);
  return { id: user._id.toString() };
}
