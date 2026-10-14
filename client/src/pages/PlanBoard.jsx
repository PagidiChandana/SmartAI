import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  getPlanSummary, listPlanTasks, patchTask, completeTask, skipTask,
  rescheduleTask, deleteTask, regeneratePlan, KIND_LABEL, fmtTime,
} from '../api/plans';
import { getApiMessage } from '../utils/validation';
import Loading from '../components/Loading';
import ErrorState from '../components/ErrorState';
import Empty from '../components/Empty';

const KIND_COLOR = {
  learn: 'bg-blue-100 text-blue-700',
  revision: 'bg-purple-100 text-purple-700',
  'practice-test': 'bg-orange-100 text-orange-700',
  break: 'bg-slate-100 text-slate-500',
};

function dayLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export default function PlanBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [summary, setSummary] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ subject: '', status: '', date: '' });
  const [tasks, setTasks] = useState([]);
  const [editing, setEditing] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [s, t] = await Promise.all([getPlanSummary(id), listPlanTasks(id, {})]);
      setSummary(s.data);
      setTasks(t.data);
      setStatus('success');
    } catch (err) {
      setError(getApiMessage(err, 'Could not load plan'));
      setStatus('error');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const subjectOptions = useMemo(() => {
    const map = new Map();
    tasks.forEach((t) => {
      const sid = t.subject?._id || t.subject;
      if (sid) map.set(sid.toString(), t.subject?.name || 'Subject');
    });
    return [...map.entries()];
  }, [tasks]);

  const filtered = tasks.filter((t) => {
    if (filters.subject && (t.subject?._id || t.subject)?.toString() !== filters.subject) return false;
    if (filters.status && t.status !== filters.status) return false;
    if (filters.date && t.date !== filters.date) return false;
    return true;
  });

  // 7-day calendar strip starting today.
  const week = useMemo(() => {
    const out = [];
    const now = new Date();
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(now);
      d.setDate(now.getDate() + i);
      out.push(d.toISOString().slice(0, 10));
    }
    return out;
  }, []);

  const weekCount = (day) => tasks.filter((t) => t.date === day && t.status === 'pending').length;

  const act = async (fn, okMsg) => {
    try {
      setNotice('');
      await fn();
      const [s, t] = await Promise.all([getPlanSummary(id), listPlanTasks(id, {})]);
      setSummary(s.data);
      setTasks(t.data);
      if (okMsg) setNotice(okMsg);
    } catch (err) {
      setNotice(getApiMessage(err, 'Action failed'));
    }
  };

  const startEdit = (t) => {
    setEditing(t._id);
    setEditForm({ title: t.title, objective: t.objective, date: t.date, startMin: t.startMin, durationMin: t.durationMin });
  };

  const saveEdit = (taskId) =>
    act(() => patchTask(taskId, { ...editForm, startMin: Number(editForm.startMin), durationMin: Number(editForm.durationMin) }).then(() => setEditing(null)), 'Task updated ✓ — remaining time recalculated');

  const onRegenerate = async () => {
    if (!confirm('Regenerate this plan? Current version is archived as history.')) return;
    try {
      const res = await regeneratePlan(id);
      navigate(`/plans/${res.data.plan._id}`);
    } catch (err) {
      setNotice(getApiMessage(err, 'Regeneration failed'));
    }
  };

  if (status === 'loading') return <Loading label="Loading your plan…" />;
  if (status === 'error') return <ErrorState message={error} onRetry={load} />;

  const { plan, today, upcoming, overdue, overallPct } = summary;

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">{plan.title} <span className="text-sm font-semibold text-slate-400">v{plan.version} · {plan.status} · {plan.source === 'ai' ? 'AI' : 'rule-based'}</span></h2>
          <p className="text-sm text-slate-500">Exam {new Date(plan.examDate).toLocaleDateString()} · {plan.dailyHours}h/day · {plan.completedTasks}/{plan.totalTasks} done</p>
        </div>
        <div className="flex gap-2">
          <Link to="/plans" className="btn-ghost">All plans</Link>
          {plan.status === 'active' && <button className="btn-primary" onClick={onRegenerate}>Regenerate</button>}
        </div>
      </div>

      {notice && <p className="card py-3 text-sm">{notice}</p>}

      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card"><p className="text-sm text-slate-500">Overall</p><p className="text-2xl font-bold">{overallPct}%</p></div>
        <div className="card"><p className="text-sm text-slate-500">Today ({today.total})</p><p className="text-2xl font-bold">{today.pct}%</p></div>
        <div className="card"><p className="text-sm text-slate-500">Upcoming</p><p className="text-2xl font-bold">{upcoming.length}</p></div>
        <div className={`card ${overdue.length ? 'border-red-200 bg-red-50' : ''}`}><p className="text-sm text-slate-500">Overdue</p><p className="text-2xl font-bold">{overdue.length}</p></div>
      </div>

      {overdue.length > 0 && (
        <div className="card border-red-200 bg-red-50">
          <h3 className="font-semibold text-red-700">Overdue work ({overdue.length})</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {overdue.slice(0, 5).map((t) => (
              <li key={t._id} className="flex justify-between gap-2">
                <span>{t.title} <span className="text-red-500">· {t.date}</span></span>
                <button className="font-semibold text-brand-600" onClick={() => act(() => rescheduleTask(t._id, { date: new Date().toISOString().slice(0, 10) }), 'Moved to today ✓')}>Move to today</button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card">
        <h3 className="font-semibold">Next 7 days</h3>
        <div className="mt-2 grid grid-cols-7 gap-1.5">
          {week.map((day) => (
            <button
              key={day}
              onClick={() => setFilters({ ...filters, date: filters.date === day ? '' : day })}
              className={`rounded-xl p-2 text-center ring-1 ${filters.date === day ? 'bg-brand-600 text-white ring-brand-600' : 'bg-slate-50 ring-slate-200'}`}
            >
              <p className="text-xs">{dayLabel(day)}</p>
              <p className="text-lg font-bold">{weekCount(day)}</p>
            </button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="flex flex-wrap gap-2">
          <select className="input w-auto" value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })}>
            <option value="">All subjects</option>
            {subjectOptions.map(([sid, name]) => <option key={sid} value={sid}>{name}</option>)}
          </select>
          <select className="input w-auto" value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="skipped">Skipped</option>
          </select>
          <input className="input w-auto" type="date" value={filters.date} onChange={(e) => setFilters({ ...filters, date: e.target.value })} />
          {(filters.subject || filters.status || filters.date) && (
            <button className="btn-ghost" onClick={() => setFilters({ subject: '', status: '', date: '' })}>Clear</button>
          )}
          <span className="ml-auto self-center text-sm text-slate-500">{filtered.length} tasks</span>
        </div>

        {filtered.length === 0 ? (
          <div className="mt-3"><Empty title="No tasks match" hint="Clear filters or pick another day." /></div>
        ) : (
          <ul className="mt-3 space-y-2">
            {filtered.slice(0, 100).map((t) => (
              <li key={t._id} className={`rounded-xl p-3 ring-1 ${t.status === 'completed' ? 'bg-green-50 ring-green-200' : 'bg-slate-50 ring-slate-200'}`}>
                {editing === t._id ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input className="input sm:col-span-2" value={editForm.title} onChange={(e) => setEditForm({ ...editForm, title: e.target.value })} />
                    <input className="input sm:col-span-2" value={editForm.objective} onChange={(e) => setEditForm({ ...editForm, objective: e.target.value })} placeholder="Objective" />
                    <input className="input" type="date" value={editForm.date} onChange={(e) => setEditForm({ ...editForm, date: e.target.value })} />
                    <div className="flex gap-2">
                      <input className="input" type="number" value={editForm.startMin} onChange={(e) => setEditForm({ ...editForm, startMin: e.target.value })} title="Start (min after midnight)" />
                      <input className="input" type="number" value={editForm.durationMin} onChange={(e) => setEditForm({ ...editForm, durationMin: e.target.value })} title="Duration (min)" />
                    </div>
                    <div className="flex gap-2 sm:col-span-2">
                      <button className="btn-primary" onClick={() => saveEdit(t._id)}>Save</button>
                      <button className="btn-ghost" onClick={() => setEditing(null)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${KIND_COLOR[t.kind]}`}>{KIND_LABEL[t.kind]}</span>
                    <span className="font-semibold">{t.title}</span>
                    <span className="text-slate-500">{t.date} · {fmtTime(t.startMin)} · {t.durationMin} min</span>
                    {t.subject?.name && <span className="text-slate-500">· {t.subject.name}</span>}
                    <span className={`capitalize ${t.status === 'completed' ? 'text-green-600' : 'text-slate-400'}`}>· {t.status}</span>
                    {t.objective && <p className="w-full text-slate-500">🎯 {t.objective}</p>}
                    {t.status === 'pending' && (
                      <div className="flex w-full gap-1.5">
                        <button className="btn-primary px-3 py-1 text-xs" onClick={() => act(() => completeTask(t._id), 'Completed ✓')}>Complete</button>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => act(() => skipTask(t._id))}>Skip</button>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => startEdit(t)}>Edit</button>
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => act(() => rescheduleTask(t._id, { date: new Date(Date.now() + 86400000).toISOString().slice(0, 10) }), 'Moved to tomorrow ✓')}>Tomorrow</button>
                        <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => { if (confirm('Delete this task?')) act(() => deleteTask(t._id), 'Deleted'); }}>Delete</button>
                      </div>
                    )}
                    {t.status !== 'pending' && (
                      <div className="flex w-full gap-1.5">
                        <button className="btn-ghost px-3 py-1 text-xs" onClick={() => act(() => patchTask(t._id, { status: 'pending' }), 'Reopened')}>Reopen</button>
                      </div>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {filtered.length > 100 && <p className="mt-2 text-sm text-slate-500">Showing first 100 — narrow filters to see more.</p>}
      </div>
    </div>
  );
}
