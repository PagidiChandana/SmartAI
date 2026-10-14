import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { roleMatrix, adminResources, adminResourceUpdate, adminResourceDelete, adminPlans, adminPlanDetail, adminAssessments, adminAssessmentAttempts, aiStatus, broadcastAnnouncement, notifStats, platformAnalytics, systemHealth } from '../../api/admin';
import Loading from '../../components/Loading';
import ErrorState from '../../components/ErrorState';
import Empty from '../../components/Empty';
import { getApiMessage } from '../../utils/validation';
import { RoleBadge, StatusBadge, Pager, Modal, Field, Badge } from './ui';

export function Roles() {
  const [data, setData] = useState(null);
  useEffect(() => {
    roleMatrix().then((r) => setData(r.data)).catch(() => setData({ error: true }));
  }, []);
  if (!data) return <Loading label="Loading roles…" />;
  if (data.error) return <ErrorState message="Roles unavailable." onRetry={() => window.location.reload()} />;
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-bold">Roles & permissions</h3>
        <p className="text-sm text-slate-500">Hierarchy: super_admin ⊃ admin ⊃ educator/student. Ordinary admins cannot grant admin privileges — only super admins can.</p>
        <div className="mt-2 flex gap-2">{data.roles.map((r) => <span key={r} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{r}: <b>{data.counts[r] || 0}</b></span>)}</div>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500"><th className="py-2">Capability</th>{data.roles.map((r) => <th key={r} className="capitalize">{r.replace('_', ' ')}</th>)}</tr></thead>
          <tbody>
            {data.matrix.map((m) => (
              <tr key={m.capability} className="border-t">
                <td className="py-2">{m.capability}</td>
                {data.roles.map((r) => <td key={r}>{m[r] ? '✅' : '—'}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function Subjects({ taxonomy }) {
  const [engagement, setEngagement] = useState([]);
  useEffect(() => {
    platformAnalytics(90).then((r) => setEngagement(r.data.topSubjects)).catch(() => {});
  }, []);
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-bold">Subject engagement (topics created platform-wide, 90d window)</h3>
        {engagement.length === 0 ? <p className="text-sm text-slate-500">No syllabus topics yet.</p> : (
          <ul className="mt-2 space-y-1 text-sm">{engagement.map((s) => <li key={s.subject}>{s.subject}: <b>{s.topics}</b> topics</li>)}</ul>
        )}
      </div>
      {taxonomy}
    </div>
  );
}

export function Resources() {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [editing, setEditing] = useState(null);
  const load = async (p = 1) => {
    const params = { page: p, limit: 15 };
    if (q.trim()) params.q = q.trim();
    if (status) params.status = status;
    const res = await adminResources(params);
    setData(res.data);
    setPage(p);
  };
  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);
  if (!data) return <Loading label="Loading resources…" />;
  const pages = Math.max(1, Math.ceil(data.total / 15));
  return (
    <div className="card space-y-3 overflow-x-auto">
      <div className="flex flex-wrap gap-2">
        <input className="input w-auto" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} placeholder="Search…" aria-label="Search resources" />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="pending">pending</option>
          <option value="approved">approved</option>
          <option value="rejected">rejected</option>
          <option value="archived">archived</option>
        </select>
        <button className="btn-ghost text-sm" onClick={() => load(1)}>Apply</button>
        <Link to="/review" className="btn-ghost ml-auto text-sm">Review queue →</Link>
      </div>
      {data.items.length === 0 ? <Empty title="No resources" hint="Adjust filters." /> : (
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500"><th>Title</th><th>Subject</th><th>Format</th><th>Status</th><th>Owner</th><th>Actions</th></tr></thead>
          <tbody>
            {data.items.map((r) => (
              <tr key={r._id} className="border-t">
                <td className="py-2 font-medium">{r.title}</td>
                <td>{r.subject}</td>
                <td>{r.format}</td>
                <td><StatusBadge status={r.status} /></td>
                <td className="text-slate-500">{r.owner?.email}</td>
                <td className="flex gap-1 py-2">
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setEditing(r)}>Edit</button>
                  <button className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={async () => { if (confirm(`Delete “${r.title}”?`)) { await adminResourceDelete(r._id); load(page); } }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager page={page} pages={pages} total={data.total} onPage={(p) => load(p)} />
      {editing && <ResourceEditModal r={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(page); }} />}
    </div>
  );
}

function ResourceEditModal({ r, onClose, onDone }) {
  const [form, setForm] = useState({ title: r.title, description: r.description || '', subject: r.subject, topic: r.topic || '', difficulty: r.difficulty, examType: r.examType, format: r.format });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await adminResourceUpdate(r._id, form);
      onDone();
    } catch (err) { setError(getApiMessage(err, 'Update failed')); }
  };
  return (
    <Modal title="Edit resource metadata" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required /></Field>
        <Field label="Description"><textarea className="input" rows="2" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Subject"><input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} required /></Field>
          <Field label="Topic"><input className="input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} /></Field>
          <Field label="Difficulty"><select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}><option value="beginner">beginner</option><option value="intermediate">intermediate</option><option value="advanced">advanced</option></select></Field>
          <Field label="Format"><select className="input" value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>{['pdf', 'note', 'article', 'video', 'link', 'other'].map((f) => <option key={f} value={f}>{f}</option>)}</select></Field>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full">Save (audited)</button>
      </form>
    </Modal>
  );
}

export function Plans() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [detail, setDetail] = useState(null);
  const load = async (p = 1) => {
    const params = { page: p, limit: 15 };
    if (status) params.status = status;
    if (q.trim()) params.q = q.trim();
    const res = await adminPlans(params);
    setData(res.data);
    setPage(p);
  };
  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);
  if (!data) return <Loading label="Loading plans…" />;
  const pages = Math.max(1, Math.ceil(data.total / 15));
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap gap-2">
        <input className="input w-auto" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} placeholder="Owner email…" aria-label="Search by owner email" />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="active">active</option>
          <option value="archived">archived</option>
          <option value="completed">completed</option>
        </select>
        <button className="btn-ghost text-sm" onClick={() => load(1)}>Apply</button>
        <span className="self-center text-xs text-slate-400">Metadata only — plans are never edited here; students regenerate their own.</span>
      </div>
      {data.items.length === 0 ? <Empty title="No plans" hint="Adjust filters." /> : data.items.map((p) => (
        <div key={p._id} className="card flex flex-wrap items-center gap-2 text-sm">
          <b>{p.title}</b><StatusBadge status={p.status} /><span className="text-slate-500">v{p.version} · {p.source} · {p.user?.email}</span>
          <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={async () => { const r = await adminPlanDetail(p._id); setDetail(r.data); }}>Inspect</button>
        </div>
      ))}
      <Pager page={page} pages={pages} total={data.total} onPage={(p) => load(p)} />
      {detail && (
        <Modal title="Plan metadata" onClose={() => setDetail(null)}>
          <div className="space-y-2 text-sm">
            <p><b>{detail.plan.title}</b> v{detail.plan.version} · {detail.plan.source} · exam {new Date(detail.plan.examDate).toLocaleDateString()}</p>
            <p>Tasks total: <b>{detail.tasks.total}</b> · by status: {detail.tasks.byStatus.map((s) => `${s._id}:${s.n}`).join(', ')}</p>
            <p>By kind: {detail.tasks.byKind.map((s) => `${s._id}:${s.n}`).join(', ')}</p>
            <p className="text-xs text-slate-400">Individual task content stays private to the student.</p>
          </div>
        </Modal>
      )}
    </div>
  );
}

export function Quizzes() {
  const [status, setStatus] = useState('');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [attempts, setAttempts] = useState(null);
  const load = async (p = 1) => {
    const params = { page: p, limit: 15 };
    if (status) params.status = status;
    if (q.trim()) params.q = q.trim();
    const res = await adminAssessments(params);
    setData(res.data);
    setPage(p);
  };
  useEffect(() => { load(1); /* eslint-disable-next-line */ }, []);
  if (!data) return <Loading label="Loading assessments…" />;
  const pages = Math.max(1, Math.ceil(data.total / 15));
  return (
    <div className="space-y-3">
      <div className="card flex flex-wrap gap-2">
        <input className="input w-auto" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} placeholder="Search title…" aria-label="Search assessments" />
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="draft">draft</option>
          <option value="published">published</option>
          <option value="closed">closed</option>
          <option value="archived">archived</option>
        </select>
        <button className="btn-ghost text-sm" onClick={() => load(1)}>Apply</button>
        <span className="self-center text-xs text-slate-400">Scores are read-only here — grading belongs to the owning educator.</span>
      </div>
      {data.items.length === 0 ? <Empty title="No assessments" hint="Adjust filters." /> : data.items.map((a) => (
        <div key={a._id} className="card text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <b>{a.title}</b><StatusBadge status={a.status} />
            <span className="text-slate-500">{a.subject} · {a.questionCount}Q · {a.attemptCount} attempts · by {a.owner?.email}</span>
            <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={async () => { const r = await adminAssessmentAttempts(a._id, {}); setAttempts({ title: a.title, ...r.data }); }}>View results</button>
          </div>
        </div>
      ))}
      <Pager page={page} pages={pages} total={data.total} onPage={(p) => load(p)} />
      {attempts && (
        <Modal title={`Results — ${attempts.title}`} onClose={() => setAttempts(null)}>
          {attempts.items.length === 0 ? <p className="text-sm text-slate-500">No submitted attempts.</p> : (
            <ul className="space-y-1 text-sm">{attempts.items.map((t) => (
              <li key={t.id} className="border-t pt-1">{t.user?.name} ({t.user?.email}) — {t.score}/{t.maxScore} · {t.accuracy}% · {new Date(t.submittedAt).toLocaleString()}</li>
            ))}</ul>
          )}
          <p className="mt-2 text-xs text-slate-400">Summary rows only — individual answers stay private. Total: {attempts.total}</p>
        </Modal>
      )}
    </div>
  );
}

export function AiMonitor() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    aiStatus().then((r) => setData(r.data)).catch((e) => setError(getApiMessage(e, 'AI status unavailable')));
  }, []);
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!data) return <Loading label="Checking AI services…" />;
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-bold">Provider status</h3>
        <p className="mt-1 text-sm">Provider: <b>{data.provider}</b> · Configured: <b>{data.configured ? 'yes' : 'no'}</b></p>
        <p className="text-sm text-slate-500">Models: openai={data.models.openai} · gemini={data.models.gemini} · ollama={data.models.ollama}</p>
        {data.ollama && (
          <p className="mt-2 text-sm">
            Ollama: <b>{data.ollama.reachable ? `reachable ✓ (model “${data.ollama.modelConfigured}” ${data.ollama.modelPulled ? 'pulled ✓' : 'NOT pulled — run `ollama pull ' + data.ollama.modelConfigured + '`'})` : 'unreachable — start `ollama serve`'}</b>
            {data.ollama.modelsAvailable?.length > 0 && <span className="text-slate-500"> · installed: {data.ollama.modelsAvailable.join(', ')}</span>}
          </p>
        )}
        {data.mockWarning && <p className="mt-2 rounded-xl bg-amber-50 p-2 text-sm text-amber-800 ring-1 ring-amber-200">⚠️ {data.mockWarning}</p>}
        {data.credentialsWarning && <p className="mt-2 rounded-xl bg-red-50 p-2 text-sm text-red-700 ring-1 ring-red-200">⚠️ {data.credentialsWarning}</p>}
        <p className="mt-2 text-sm">Last 24h: {data.last24h.total} requests · {data.last24h.failures} failures</p>
        <p className="mt-1 text-xs text-slate-400">{data.note}</p>
      </div>
      <div className="card">
        <h3 className="font-bold">Configuration</h3>
        <p className="text-sm text-slate-500">Provider and keys are server-side environment config (<code className="text-xs">AI_PROVIDER, OPENAI_API_KEY, GEMINI_API_KEY, OLLAMA_URL, OLLAMA_MODEL</code>) — never editable from the browser, never returned by any API. Free local AI: install Ollama, <code className="text-xs">ollama pull llama3.1</code>, <code className="text-xs">ollama serve</code>, set <code className="text-xs">AI_PROVIDER=ollama</code>.</p>
      </div>
    </div>
  );
}

export function NotificationsAdmin() {
  const [stats, setStats] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', roles: ['student', 'educator'] });
  const [msg, setMsg] = useState('');
  const load = async () => {
    const res = await notifStats();
    setStats(res.data);
  };
  useEffect(() => { load(); }, []);
  const send = async (e) => {
    e.preventDefault();
    try {
      const res = await broadcastAnnouncement(form);
      setMsg(`Announcement sent to ${res.data.recipients} users ✓ (audited)`);
      setForm({ title: '', body: '', roles: ['student', 'educator'] });
      load();
    } catch (err) { setMsg(getApiMessage(err, 'Send failed')); }
  };
  const toggleRole = (r) => setForm((f) => ({ ...f, roles: f.roles.includes(r) ? f.roles.filter((x) => x !== r) : [...f.roles, r] }));
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-bold">Delivery status (in-app only)</h3>
        {!stats ? <Loading label="Loading…" /> : stats.error ? <p className="text-sm text-red-600">Unavailable.</p> : (
          <>
            <p className="text-sm">By kind: {Object.entries(stats.byKind).map(([k, v]) => `${k}:${v}`).join(' · ') || 'none'} · Unread: <b>{stats.unread}</b> · Last 7d: <b>{stats.last7d}</b></p>
            <p className="mt-1 text-xs text-slate-400">{stats.note}</p>
          </>
        )}
      </div>
      <form onSubmit={send} className="card space-y-3">
        <h3 className="font-bold">Broadcast announcement</h3>
        <Field2 label="Title"><input className="input" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required maxLength={200} /></Field2>
        <Field2 label="Body"><textarea className="input" rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} maxLength={2000} /></Field2>
        <div className="flex flex-wrap gap-2 text-sm">
          {['student', 'educator', 'admin', 'super_admin'].map((r) => (
            <label key={r} className="flex items-center gap-1"><input type="checkbox" checked={form.roles.includes(r)} onChange={() => toggleRole(r)} />{r}</label>
          ))}
        </div>
        {msg && <p className="text-sm text-slate-700">{msg}</p>}
        <button className="btn-primary">Send announcement</button>
      </form>
    </div>
  );
}

function Field2({ label, children }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>;
}

export function AnalyticsAdmin() {
  const [days, setDays] = useState(14);
  const [data, setData] = useState(null);
  const load = async (d = days) => {
    const res = await platformAnalytics(d);
    setData(res.data);
  };
  useEffect(() => { load(14); /* eslint-disable-next-line */ }, []);
  if (!data) return <Loading label="Computing platform analytics…" />;
  const maxS = Math.max(1, ...data.signupsPerDay.map((d) => d.count));
  const maxA = Math.max(1, ...data.attemptsPerDay.map((d) => d.count));
  return (
    <div className="space-y-4">
      <div className="card flex items-center gap-2">
        <h3 className="font-bold">Platform analytics</h3>
        <select className="input ml-auto w-auto" value={days} onChange={(e) => { setDays(Number(e.target.value)); load(Number(e.target.value)); }} aria-label="Time period">
          <option value={7}>Last 7 days</option>
          <option value={14}>Last 14 days</option>
          <option value={30}>Last 30 days</option>
          <option value={90}>Last 90 days</option>
        </select>
      </div>
      <div className="card">
        <h3 className="font-bold">Signups per day (last {data.days} days)</h3>
        <Bar rows={data.signupsPerDay.map((d) => ({ label: d.date.slice(5), value: d.count, max: maxS }))} />
      </div>
      <div className="card">
        <h3 className="font-bold">Attempts per day (avg accuracy)</h3>
        <Bar rows={data.attemptsPerDay.map((d) => ({ label: d.date.slice(5), value: d.count, max: maxA, extra: d.avgAccuracy === null ? '' : `${d.avgAccuracy}%` }))} />
      </div>
      <div className="card">
        <h3 className="font-bold">Top subjects by syllabus topics</h3>
        {data.topSubjects.length === 0 ? <p className="text-sm text-slate-500">No topics yet.</p> : (
          <ul className="text-sm">{data.topSubjects.map((s) => <li key={s.subject}>{s.subject}: <b>{s.topics}</b></li>)}</ul>
        )}
      </div>
    </div>
  );
}

function Bar({ rows }) {
  return (
    <div className="mt-2 space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-xs">
          <span className="w-12 shrink-0 text-slate-500">{r.label}</span>
          <div className="h-3 flex-1 overflow-hidden rounded bg-slate-100">
            <div className="h-full rounded bg-brand-600" style={{ width: `${Math.round((r.value / r.max) * 100)}%` }} />
          </div>
          <span className="w-16 shrink-0 text-right">{r.value}{r.extra ? ` · ${r.extra}` : ''}</span>
        </div>
      ))}
    </div>
  );
}

export function SystemHealth() {
  const [data, setData] = useState(null);
  useEffect(() => {
    import('../../api/admin').then((m) => m.systemHealth().then((r) => setData(r.data)).catch(() => setData({ error: true })));
  }, []);
  if (!data) return <Loading label="Checking system health…" />;
  if (data.error) return <ErrorState message="Health check unavailable." onRetry={() => window.location.reload()} />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="card"><p className="text-sm text-slate-500">Overall</p><p className="text-2xl font-bold">{data.status}</p></div>
      <div className="card"><p className="text-sm text-slate-500">MongoDB</p><p className="text-2xl font-bold">{data.mongo.status}{data.mongo.pingMs !== null && ` · ${data.mongo.pingMs}ms`}</p></div>
      <div className="card"><p className="text-sm text-slate-500">Uptime</p><p className="text-2xl font-bold">{Math.floor(data.uptimeSec / 3600)}h {Math.floor((data.uptimeSec % 3600) / 60)}m</p></div>
      <div className="card"><p className="text-sm text-slate-500">Memory (RSS / heap)</p><p className="text-2xl font-bold">{data.memory.rssMB} / {data.memory.heapMB} MB</p></div>
      <div className="card sm:col-span-2 text-sm text-slate-500">
        <p>Node {data.node} · env {data.env} · AI provider {data.aiProvider}</p>
        <p className="mt-1">{data.scheduler}</p>
      </div>
    </div>
  );
}
