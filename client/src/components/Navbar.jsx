import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminRole, isSuperAdmin, roleLabel } from '../utils/roles';

export default function Navbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const dashboardLabel =
    isAdminRole(user?.role) ? 'Admin' : user?.role === 'educator' ? 'Teach' : 'Dashboard';

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/80 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Link to="/" className="text-lg font-bold text-brand-700">
            StudyAI
          </Link>
          {user && (
            <span className="hidden rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold capitalize text-slate-600 md:inline-block">
              {roleLabel(user.role)}{isSuperAdmin(user.role) ? ' ★' : ''} · {user.email}
            </span>
          )}
        </div>
        <nav className="flex items-center gap-2">
          <Link to="/" className="btn-ghost">Home</Link>
          {user && (
            <>
              <Link to="/dashboard" className="btn-ghost">{dashboardLabel}</Link>
              {user.role === 'student' && <Link to="/setup" className="btn-ghost hidden sm:inline">Setup</Link>}
              {user.role === 'student' && <Link to="/plans" className="btn-ghost hidden sm:inline">Plans</Link>}
              {user.role === 'student' && <Link to="/library" className="btn-ghost hidden sm:inline">Library</Link>}
              {user.role === 'student' && <Link to="/tutor" className="btn-ghost hidden sm:inline">Tutor</Link>}
              {user.role === 'student' && <Link to="/assessments" className="btn-ghost hidden sm:inline">Tests</Link>}
              {user.role === 'student' && <Link to="/analytics" className="btn-ghost hidden sm:inline">Insights</Link>}
              {user.role === 'educator' && <Link to="/educator/assessments" className="btn-ghost hidden sm:inline">Tests</Link>}
              {user.role === 'educator' && <Link to="/educator/students" className="btn-ghost hidden sm:inline">Students</Link>}
              {user.role === 'educator' && <Link to="/studio" className="btn-ghost hidden sm:inline">Studio</Link>}
              {isAdminRole(user.role) && <Link to="/dashboard/admin" className="btn-ghost hidden sm:inline">Users</Link>}
              {isAdminRole(user.role) && <Link to="/review" className="btn-ghost hidden sm:inline">Review</Link>}
              <Link to="/inbox" className="btn-ghost">Inbox</Link>
              <Link to="/reminders" className="btn-ghost hidden sm:inline">Reminders</Link>
              <Link to="/profile" className="btn-ghost">Profile</Link>
              <button className="btn-ghost" onClick={handleLogout}>
                Logout
              </button>
            </>
          )}
          {!user && (
            <>
              <Link to="/login" className="btn-ghost">Login</Link>
              <Link to="/register" className="btn-primary">Get started</Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
