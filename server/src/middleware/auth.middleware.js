import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { ApiError } from '../utils/ApiError.js';
import { User } from '../models/User.js';

function extractToken(req) {
  const header = req.headers.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies[env.cookieName]) return req.cookies[env.cookieName];
  return null;
}

export async function requireAuth(req, _res, next) {
  try {
    const token = extractToken(req);
    if (!token) throw new ApiError(401, 'Authentication required. Please log in.');
    let payload;
    try {
      payload = jwt.verify(token, env.jwtSecret);
    } catch {
      throw new ApiError(401, 'Session expired. Please log in again.');
    }
    const user = await User.findById(payload.sub);
    if (!user) throw new ApiError(401, 'User no longer exists');
    if (user.status !== 'active') throw new ApiError(403, 'Account is suspended. Contact support.');
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof ApiError) return next(err);
    return next(new ApiError(401, 'Invalid or expired token'));
  }
}

// Usage: router.get('/admin', requireAuth, requireRole('admin'), handler)
// Hierarchy: 'super_admin' satisfies any requirement that includes 'admin',
// so existing admin routes automatically admit super admins.
export function requireRole(...roles) {
  const expanded = roles.includes('admin') && !roles.includes('super_admin')
    ? [...roles, 'super_admin']
    : roles;
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (!expanded.includes(req.user.role)) {
      return next(new ApiError(403, `Access denied. Requires role: ${roles.join(' or ')}`));
    }
    next();
  };
}

// Super-admin-only operations (role grants, admin suspension, etc.).
export function requireSuperAdmin() {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (req.user.role !== 'super_admin') {
      return next(new ApiError(403, 'Access denied. Requires role: super_admin'));
    }
    next();
  };
}

// Prevents user A from reading/mutating user B's private record.
// Admins and super admins bypass. Expects req.params.id to be a user id.
export function requireSelfOrAdmin(paramName = 'id') {
  return (req, _res, next) => {
    if (!req.user) return next(new ApiError(401, 'Authentication required'));
    if (req.user.role === 'admin' || req.user.role === 'super_admin') return next();
    if (req.params[paramName] !== req.user._id.toString()) {
      return next(new ApiError(403, 'You can only access your own records'));
    }
    next();
  };
}
