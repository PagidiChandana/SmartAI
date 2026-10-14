import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { rolesSatisfy } from '../utils/roles';
import Loading from './Loading';

// Route guard: any authenticated user.
export function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Restoring session…" />;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Route guard: only the given roles (super_admin satisfies 'admin').
export function RequireRole({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Checking permissions…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (!rolesSatisfy(user.role, roles)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default RequireAuth;
