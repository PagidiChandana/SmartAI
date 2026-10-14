import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { generatePlan, listPlans } from '../api/plans';
import { listSubjects } from '../api/learning';
import { getApiMessage } from '../utils/validation';
import Loading from '../components/Loading';
import Empty from '../components/Empty';

const MAX_CLIENT_RETRIES = 3;

export default function PlanGenerator() {
  const navigate = useNavigate();
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ examDate: '', targetScore: '', subjectIds: [], dailyHours: 4, weeklyHours: '', title: '' });
  const [state, setState] = useState({ status: 'idle', message: '', attempts: 0 });
  const [existing, setExisting] = useState([]);

  useEffect(() => {
    Promise.all([listSubjects().catch(() => ({ data: [] })), listPlans().catch(() => ({ data: [] }))])
      .then(([s, p]) => {
        setSubjects(s.data || []);
        setExisting(p.data || []);
        setForm((f) => ({ ...f, subjectIds: (s.data || []).map((x) => x._id) }));
      })
      .finally(() => setLoading(false));
  }, []);

  const toggleSubject = (id) => {
    setForm((f) => ({
      ...f,
      subjectIds: f.subjectIds.includes(id) ? f.subjectIds.filter((x) => x !== id) : [...f.subjectIds, id],
    }));
  };

  const submit = async (force = false) => {
    if (state.attempts >= MAX_CLIENT_RETRIES && !force) {
      setState({ ...state, status: 'error', message: 'Retry limit reached (3). Check your inputs or try again later.' });
      return;
    }
    if (!form.examDate) return setState({ ...state, status: 'error', message: 'Pick your examination date' });
    if (form.subjectIds.length === 0) return setState({ ...state, status: 'error', message: 'Select at least one subject' });
    setState({ status: 'loading', message: 'Generating your plan… (AI first, rule-based fallback if needed)', attempts: state.attempts + 1 });
    try {
      const res = await generatePlan({
        examDate: form.examDate,
        targetScore: form.targetScore ? Number(form.targetScore) : undefined,
        subjectIds: form.subjectIds,
        dailyHours: Number(form.dailyHours),
        weeklyHours: form.weeklyHours ? Number(form.weeklyHours) : undefined,
        title: form.title || undefined,
        ...(force ? { force: true } : {}),
      });
      setState({ status: 'success', message: `Plan ready (${res.data.source === 'ai' ? 'AI' : 'rule-based'}) — opening…`, attempts: 0 });
      setTimeout(() => navigate(`/plans/${res.data.plan._id}`), 700);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 409) {
        setState({ status: 'conflict', message: getApiMessage(err, 'Active plan exists'), attempts: state.attempts });
      } else {
        setState({ status: 'error', message: getApiMessage(err, 'Generation failed'), attempts: state.attempts });
      }
    }
  };

  if (loading) return <Loading label="Loading generator…" />;
  if (subjects.length === 0) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="card"><h2 className="text-xl font-bold">Study plan generator</h2></div>
        <Empty title="Add subjects and topics first" hint="The planner needs your syllabus. Finish the setup wizard, then come back." />
        <Link to="/setup?step=subjects" className="btn-primary w-full">Go to setup →</Link>
      </div>
    );
  }

  const active = existing.find((p) => p.status === 'active');

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold">Study plan generator</h2>
        <p className="text-sm text-slate-500">Weak topics first, within your real hours. AI when available, validated rule-based plan otherwise.</p>
      </div>

      {active && (
        <div className="card border-amber-200 bg-amber-50">
          <p className="text-sm">Active plan: <b>{active.title}</b> (v{active.version})</p>
          <div className="mt-2 flex gap-2">
            <Link to={`/plans/${active._id}`} className="btn-primary">Open active plan</Link>
          </div>
        </div>
      )}

      <div className="card space-y-3">
        <div>
          <label className="label">Plan title (optional)</label>
          <input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. GATE push" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="label">Examination date</label>
            <input className="input" type="date" value={form.examDate} onChange={(e) => setForm({ ...form, examDate: e.target.value })} />
          </div>
          <div>
            <label className="label">Target score (0-100, optional)</label>
            <input className="input" type="number" min="0" max="100" value={form.targetScore} onChange={(e) => setForm({ ...form, targetScore: e.target.value })} />
          </div>
          <div>
            <label className="label">Daily study hours</label>
            <input className="input" type="number" min="0.5" max="16" step="0.5" value={form.dailyHours} onChange={(e) => setForm({ ...form, dailyHours: e.target.value })} />
          </div>
          <div>
            <label className="label">Weekly cap (optional)</label>
            <input className="input" type="number" min="1" max="112" step="0.5" value={form.weeklyHours} onChange={(e) => setForm({ ...form, weeklyHours: e.target.value })} placeholder="defaults to 7 × daily" />
          </div>
        </div>
        <div>
          <label className="label">Subjects</label>
          <div className="flex flex-wrap gap-2">
            {subjects.map((s) => (
              <button
                key={s._id}
                type="button"
                onClick={() => toggleSubject(s._id)}
                className={`rounded-full px-3 py-1.5 text-sm font-semibold ring-1 ${form.subjectIds.includes(s._id) ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-200'}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {state.message && (
          <p className={`text-sm ${state.status === 'error' || state.status === 'conflict' ? 'text-red-600' : 'text-green-600'}`}>
            {state.message}
          </p>
        )}
        {state.status === 'conflict' && (
          <button className="btn-primary w-full" onClick={() => submit(true)} disabled={state.status === 'loading'}>
            Archive it & generate fresh (keeps history)
          </button>
        )}
        {state.status !== 'conflict' && (
          <button className="btn-primary w-full" onClick={() => submit(false)} disabled={state.status === 'loading'}>
            {state.status === 'loading' ? 'Generating… (attempt ' + state.attempts + '/3)' : 'Generate my plan'}
          </button>
        )}
        {state.status === 'error' && state.attempts < MAX_CLIENT_RETRIES && (
          <button className="btn-ghost w-full" onClick={() => submit(false)}>Retry ({MAX_CLIENT_RETRIES - state.attempts} left)</button>
        )}
      </div>

      {existing.length > 0 && (
        <div className="card">
          <h3 className="font-semibold">Version history</h3>
          <ul className="mt-2 space-y-1.5 text-sm">
            {existing.map((p) => (
              <li key={p._id} className="flex justify-between">
                <span>v{p.version} · {p.title} · <span className="capitalize text-slate-500">{p.status}</span></span>
                <Link to={`/plans/${p._id}`} className="font-semibold text-brand-600">Open</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
