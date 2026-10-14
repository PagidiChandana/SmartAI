import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminRole } from '../utils/roles';
import Loading from '../components/Loading';

// /dashboard resolves to the role home.
export default function Dashboard() {
  const { user, loading } = useAuth();
  if (loading) return <Loading label="Loading dashboard…" />;
  if (!user) return <Navigate to="/login" replace />;
  if (isAdminRole(user.role)) return <Navigate to="/dashboard/admin" replace />;
  if (user.role === 'educator') return <Navigate to="/dashboard/educator" replace />;
  return <Navigate to="/dashboard/student" replace />;
}
