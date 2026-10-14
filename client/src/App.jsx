import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Suspense, lazy } from 'react';
import Navbar from './components/Navbar';
import { RequireAuth, RequireRole } from './components/ProtectedRoute';
import Home from './pages/Home';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Profile from './pages/Profile';
import Dashboard from './pages/Dashboard';
import StudentDashboard from './pages/StudentDashboard';
import SetupWizard from './pages/SetupWizard';
import PlanGenerator from './pages/PlanGenerator';
import PlanBoard from './pages/PlanBoard';
import EducatorDashboard from './pages/EducatorDashboard';
import AdminDashboard from './pages/AdminDashboard';
import Library from './pages/Library';
import ResourceDetail from './pages/ResourceDetail';
import ResourceStudio from './pages/ResourceStudio';
import ResourceReview from './pages/ResourceReview';
import Tutor from './pages/Tutor';
import StudentAssessments from './pages/StudentAssessments';
import TakeTest from './pages/TakeTest';
import AttemptResult from './pages/AttemptResult';
import EducatorAssessments from './pages/EducatorAssessments';
import { EducatorStudents, ClassSummary } from './pages/EducatorStudents';
import Notifications from './pages/Notifications';
import Reminders from './pages/Reminders';
import NotFound from './pages/NotFound';

// Recharts is heavy — split the analytics bundle off the initial load.
const Analytics = lazy(() => import('./pages/Analytics'));
const LoadingFallback = () => <div className="card">Loading…</div>;

export default function App() {
  return (
    <BrowserRouter>
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><Dashboard /></RequireAuth>} />
          <Route
            path="/dashboard/student"
            element={<RequireRole roles={['student']}><StudentDashboard /></RequireRole>}
          />
          <Route
            path="/setup"
            element={<RequireRole roles={['student']}><SetupWizard /></RequireRole>}
          />
          <Route
            path="/plans"
            element={<RequireRole roles={['student']}><PlanGenerator /></RequireRole>}
          />
          <Route
            path="/plans/:id"
            element={<RequireRole roles={['student']}><PlanBoard /></RequireRole>}
          />
          <Route
            path="/dashboard/educator"
            element={<RequireRole roles={['educator']}><EducatorDashboard /></RequireRole>}
          />
          <Route
            path="/studio"
            element={<RequireRole roles={['educator', 'admin']}><ResourceStudio /></RequireRole>}
          />
          <Route
            path="/library"
            element={<RequireRole roles={['student', 'educator', 'admin']}><Library /></RequireRole>}
          />
          <Route
            path="/library/:id"
            element={<RequireRole roles={['student', 'educator', 'admin']}><ResourceDetail /></RequireRole>}
          />
          <Route
            path="/review"
            element={<RequireRole roles={['admin']}><ResourceReview /></RequireRole>}
          />
          <Route
            path="/tutor"
            element={<RequireRole roles={['student', 'admin']}><Tutor /></RequireRole>}
          />
          <Route
            path="/assessments"
            element={<RequireRole roles={['student']}><StudentAssessments /></RequireRole>}
          />
          <Route
            path="/assessments/:id/take"
            element={<RequireRole roles={['student']}><TakeTest /></RequireRole>}
          />
          <Route
            path="/attempts/:id"
            element={<RequireRole roles={['student']}><AttemptResult /></RequireRole>}
          />
          <Route
            path="/attempts/:id/resume"
            element={<RequireRole roles={['student']}><TakeTest resume /></RequireRole>}
          />
          <Route
            path="/analytics"
            element={<RequireRole roles={['student']}><Suspense fallback={<LoadingFallback />}><Analytics /></Suspense></RequireRole>}
          />
          <Route
            path="/educator/assessments"
            element={<RequireRole roles={['educator', 'admin']}><EducatorAssessments /></RequireRole>}
          />
          <Route
            path="/educator/students"
            element={<RequireRole roles={['educator', 'admin']}><EducatorStudents /></RequireRole>}
          />
          <Route
            path="/educator/class"
            element={<RequireRole roles={['educator', 'admin']}><ClassSummary /></RequireRole>}
          />
          <Route
            path="/inbox"
            element={<RequireAuth><Notifications /></RequireAuth>}
          />
          <Route
            path="/reminders"
            element={<RequireAuth><Reminders /></RequireAuth>}
          />
          <Route
            path="/dashboard/admin"
            element={<RequireRole roles={['admin']}><AdminDashboard /></RequireRole>}
          />

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
    </BrowserRouter>
  );
}
