import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import Loading from '../components/Loading';
import ChecklistCard from '../components/ChecklistCard';
import ResourceCard from '../components/ResourceCard';
import { getRecommendations } from '../api/resources';
import { analyticsOverview } from '../api/analytics';

export default function StudentDashboard() {
  const { user, loading } = useAuth();
  const [recs, setRecs] = useState([]);
  const [stats, setStats] = useState(null);
  useEffect(() => {
    getRecommendations(3).then((r) => setRecs(r.data.items)).catch(() => {});
    analyticsOverview().then((r) => setStats(r.data)).catch(() => {});
  }, []);
  if (loading) return <Loading label="Loading dashboard…" />;
  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">Student dashboard</h2>
          <p className="text-sm text-slate-500">Namaste, {user?.name} — your plans, streaks and quizzes live here.</p>
        </div>
        <Link to="/setup" className="btn-primary">Continue setup →</Link>
      </div>
      <ChecklistCard />
      <div className="card flex flex-wrap items-center justify-between gap-3 bg-gradient-to-br from-brand-600 to-brand-700 text-white ring-0">
        <div>
          <h3 className="font-bold">Your AI study plan</h3>
          <p className="text-sm text-white/85">Timetable, daily tasks, overdue tracking and regeneration.</p>
        </div>
        <Link to="/plans" className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-brand-700">Open planner →</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="card"><p className="text-sm text-slate-500">Study time (14d)</p><p className="text-2xl font-bold">{stats ? `${Math.round(stats.studyTime.totalMinutes14d / 60 * 10) / 10}h` : '…'}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Tasks done</p><p className="text-2xl font-bold">{stats ? `${stats.tasks.completed} / ${stats.tasks.total}` : '…'}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Quiz accuracy</p><p className="text-2xl font-bold">{stats ? (stats.recentScores.length ? `${Math.round(stats.recentScores.reduce((s, r) => s + (r.accuracy || 0), 0) / stats.recentScores.length)}%` : '—') : '…'}</p></div>
      </div>
      {recs.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold">Recommended for you ✨</h3>
            <Link to="/library" className="text-sm font-semibold text-brand-600">Open library →</Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            {recs.map(({ resource, reasons }) => (
              <ResourceCard key={resource._id} resource={resource} reasons={reasons} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
