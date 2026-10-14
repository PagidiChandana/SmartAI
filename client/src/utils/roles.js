// Role hierarchy mirror of server/src/models/User.js.
// super_admin satisfies every 'admin' requirement — keep in sync.
export const ROLES = ['student', 'educator', 'admin', 'super_admin'];

export function isAdminRole(role) {
  return role === 'admin' || role === 'super_admin';
}

export function isSuperAdmin(role) {
  return role === 'super_admin';
}

export function roleSatisfies(userRole, required) {
  if (userRole === required) return true;
  if (required === 'admin' && isSuperAdmin(userRole)) return true;
  return false;
}

export function rolesSatisfy(userRole, requiredRoles) {
  return requiredRoles.some((r) => roleSatisfies(userRole, r));
}

export function roleLabel(role) {
  return role === 'super_admin' ? 'Super Admin' : role ? role[0].toUpperCase() + role.slice(1) : '';
}
