import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isSuperAdmin, roleLabel } from '../utils/roles';
import {
  platformStats, adminTaxonomy, taxonomyAdd,
  taxonomyToggle, taxonomyDelete, adminSettings, saveSetting,
  usageStats, auditLog, adminReports, handleReport, planLimits,
} from '../api/admin';
import UserManager from './admin/UserManager';
import { Roles, Subjects, Resources, Plans, Quizzes, AiMonitor, NotificationsAdmin, AnalyticsAdmin, SystemHealth } from './admin/sections';
import Loading from '../components/Loading';
import ErrorState from '../components/ErrorState';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';

const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'users', label: 'Users' },
  { key: 'students', label: 'Students' },
  { key: 'educators', label: 'Educators' },
  { key: 'roles', label: 'Roles' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'resources', label: 'Resources' },
  { key: 'plans', label: 'Study plans' },
  { key: 'quizzes', label: 'Quizzes' },
  { key: 'ai', label: 'AI monitor' },
  { key: 'notifications', label: 'Notifications' },
  { key: 'analytics', label: 'Analytics' },
  { key: 'taxonomy', label: 'Taxonomy' },
  { key: 'settings', label: 'Settings' },
  { key: 'reports', label: 'Reports' },
  { key: 'audit', label: 'Audit log' },
  { key: 'security', label: 'Security' },
];

const TAB_TITLES = Object.fromEntries(TABS.map((t) => [t.key, t.label]));

export default function AdminDashboard() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState('overview');
  const [navOpen, setNavOpen] = useState(false);
  return (
    <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
      {/* Sidebar */}
      <aside className="card h-fit lg:sticky lg:top-20">
        <button className="btn-ghost w-full text-sm lg:hidden" onClick={() => setNavOpen(!navOpen)} aria-expanded={navOpen}>
          {navOpen ? 'Hide menu ✕' : `☰ ${(TAB_TITLES[tab] || tab)}`}
        </button>
        <nav className={`${navOpen ? 'block' : 'hidden'} mt-2 space-y-1 lg:block`} aria-label="Admin sections">
          {TABS.map((t) => (
            <button key={t.key} onClick={() => { setTab(t.key); setNavOpen(false); }}
              className={`block w-full rounded-xl px-3 py-2 text-left text-sm font-semibold ${tab === t.key ? 'bg-brand-600 text-white' : 'hover:bg-slate-100'}`}>
              {t.label}
            </button>
          ))}
          <Link to="/review" className="block rounded-xl bg-amber-100 px-3 py-2 text-sm font-semibold text-amber-800">Material review →</Link>
        </nav>
      </aside>

      {/* Main */}
      <div className="min-w-0 space-y-4">
        <div className="card flex flex-wrap items-center gap-3">
          <div>
            <h2 className="text-xl font-bold">Admin console <span className="text-sm font-normal text-slate-400">{TAB_TITLES[tab]}</span></h2>
            <p className="text-sm text-slate-500">
              Signed in as <b>{user?.name}</b> · <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-bold text-purple-700">{roleLabel(user?.role)}{isSuperAdmin(user?.role) ? ' ★' : ''}</span>
            </p>
          </div>
          <button className="btn-ghost ml-auto text-sm" onClick={async () => { await logout(); navigate('/'); }}>Logout</button>
        </div>
        {tab === 'overview' && <Overview />}
        {tab === 'users' && <UserManager title="All users" />}
        {tab === 'students' && <UserManager fixedRole="student" title="Students" />}
        {tab === 'educators' && <UserManager fixedRole="educator" title="Educators" />}
        {tab === 'roles' && <Roles />}
        {tab === 'subjects' && <Subjects taxonomy={<Taxonomy />} />}
        {tab === 'resources' && <Resources />}
        {tab === 'plans' && <Plans />}
        {tab === 'quizzes' && <Quizzes />}
        {tab === 'ai' && <AiMonitor />}
        {tab === 'notifications' && <NotificationsAdmin />}
        {tab === 'analytics' && <AnalyticsAdmin />}
        {tab === 'taxonomy' && <Taxonomy />}
        {tab === 'settings' && <Settings />}
        {tab === 'reports' && <Reports />}
        {tab === 'audit' && <Audit />}
        {tab === 'security' && <Security />}
      </div>
    </div>
  );
}

function Overview() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    platformStats().then((r) => setData(r.data)).catch((e) => setError(getApiMessage(e, 'Stats unavailable')));
  }, []);
  if (error) return <ErrorState message={error} onRetry={() => window.location.reload()} />;
  if (!data) return <Loading label="Loading platform stats…" />;
  const stat = (label, value) => (
    <div className="card"><p className="text-sm text-slate-500">{label}</p><p className="text-2xl font-bold">{value}</p></div>
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        {stat('Students', data.users.byRole.student || 0)}
        {stat('Educators', data.users.byRole.educator || 0)}
        {stat('Admins', data.users.byRole.admin || 0)}
        {stat('Suspended', data.users.byStatus.suspended || 0)}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {stat('Resources (approved)', data.resources.approved || 0)}
        {stat('Pending review', data.resources.pending || 0)}
        {stat('Published tests', data.assessments.published || 0)}
        {stat('Attempts', data.attempts)}
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        {stat('Active plans', data.activePlans)}
        {stat('Tutor chats', data.conversations)}
        {stat('Signups (7d)', data.users.signupsLast7d)}
        {stat('Open reports', data.openReports)}
      </div>
      <div className="card">
        <h3 className="font-bold">AI usage (real request counts)</h3>
        {data.aiUsage.length === 0 ? <p className="text-sm text-slate-500">No AI requests logged yet.</p> : (
          <ul className="mt-2 text-sm">{data.aiUsage.map((u, i) => <li key={i}>{u.feature} — {u.success ? 'ok' : 'failed'}: <b>{u.count}</b> (avg {u.avgLatencyMs}ms)</li>)}</ul>
        )}
      </div>
    </div>
  );
}

function Settings() {
  const [limits, setLimits] = useState(null);
  useEffect(() => {
    planLimits().then((r) => setLimits(r.data)).catch(() => setLimits({ error: true }));
  }, []);
  return (
    <div className="grid gap-4">
      <div className="card">
        <h3 className="font-bold">Effective planner limits</h3>
        {!limits ? <Loading label="Loading limits…" /> : limits.error ? (
          <p className="text-sm text-red-600">Unavailable.</p>
        ) : (
          <p className="text-sm">Max plan horizon: <b>{limits.maxDays} days</b> · Max tasks per plan: <b>{limits.maxTasks}</b> · Configure via <code className="text-xs">plan.maxDays</code> / <code className="text-xs">plan.maxTasks</code> below (ranges enforced server-side).</p>
        )}
      </div>
      <SettingsCard />
    </div>
  );
}

function Security() {
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-bold">Your admin account</h3>
        <p className="mt-1 text-sm">{user?.name} · {user?.email} · <b>{user?.role === 'super_admin' ? 'Super Admin ★' : 'Admin'}</b></p>
        <p className="mt-1 text-sm text-slate-500">Change your password from the <Link to="/profile" className="font-semibold text-brand-600">Profile page</Link> (requires current password).</p>
        {isSuperAdmin(user?.role) && (
          <p className="mt-1 text-sm text-slate-500">As super admin you can grant admin privileges and suspend admins — every such action is audited, and the last super admin can never be demoted, suspended, or deleted.</p>
        )}
      </div>
      <div className="card">
        <h3 className="font-bold">Bootstrap & recovery</h3>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-slate-600">
          <li>Initial super admin: <code className="text-xs">SUPER_ADMIN_EMAIL=… SUPER_ADMIN_PASSWORD=(12+ chars) npm run seed:superadmin</code></li>
          <li>Re-running never locks anyone out; add <code className="text-xs">SUPER_ADMIN_RESET_PASSWORD=true</code> to rotate the password explicitly.</li>
          <li>If all admin access is lost, anyone with server access can re-seed via the CLI.</li>
        </ul>
      </div>
    </div>
  );
}

function Reports() {
  const [items, setItems] = useState(null);
  const [filter, setFilter] = useState('open');
  const load = async (f = filter) => {
    const res = await adminReports(f);
    setItems(res.data);
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const handle = async (id, status, archive) => {
    if (!confirm(`${status} this report${archive ? ' and archive the material' : ''}?`)) return;
    await handleReport(id, { status, archiveResource: archive });
    load();
  };
  if (!items) return <Loading label="Loading reports…" />;
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {['open', 'resolved', 'dismissed', 'all'].map((s) => (
          <button key={s} onClick={() => { setFilter(s); load(s); }} className={`rounded-full px-3 py-1 text-sm capitalize ${filter === s ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>{s}</button>
        ))}
      </div>
      {items.length === 0 ? <Empty title="No reports" hint="Content reports from students and educators appear here." /> : items.map((r) => (
        <div key={r._id} className="card text-sm">
          <p><b>{r.reason}</b> <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{r.status}</span></p>
          <p className="text-slate-500">On “{r.resource?.title}” ({r.resource?.status}) by {r.reporter?.name} ({r.reporter?.email})</p>
          {r.details && <p className="mt-1">{r.details}</p>}
          {r.status === 'open' && (
            <div className="mt-2 flex gap-2">
              <button className="btn-primary px-3 py-1 text-xs" onClick={() => handle(r._id, 'resolved', true)}>Resolve + archive material</button>
              <button className="btn-ghost px-3 py-1 text-xs" onClick={() => handle(r._id, 'resolved', false)}>Resolve (keep)</button>
              <button className="btn-ghost px-3 py-1 text-xs" onClick={() => handle(r._id, 'dismissed', false)}>Dismiss</button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function Taxonomy() {
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ type: 'subject', value: '' });
  const load = async () => {
    const res = await adminTaxonomy();
    setData(res.data);
  };
  useEffect(() => {
    load();
  }, []);
  if (!data) return <Loading label="Loading taxonomy…" />;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {['subject', 'exam'].map((t) => (
        <div key={t} className="card">
          <h3 className="font-bold capitalize">{t === 'exam' ? 'Exam categories' : 'Subjects'}</h3>
          <ul className="mt-2 space-y-1 text-sm">
            {data.all.filter((x) => x.type === t).map((x) => (
              <li key={x._id} className="flex items-center gap-2">
                <span className={x.active ? '' : 'text-slate-400 line-through'}>{x.value}</span>
                <button className="btn-ghost px-2 py-0.5 text-xs" onClick={async () => { await taxonomyToggle(x._id, !x.active); load(); }}>{x.active ? 'Disable' : 'Enable'}</button>
                <button className="btn-ghost px-2 py-0.5 text-xs text-red-600" onClick={async () => { if (confirm(`Delete ${x.value}?`)) { await taxonomyDelete(x._id); load(); } }}>Delete</button>
              </li>
            ))}
          </ul>
        </div>
      ))}
      <form className="card flex gap-2 sm:col-span-2" onSubmit={async (e) => { e.preventDefault(); await taxonomyAdd(form); setForm({ ...form, value: '' }); load(); }}>
        <select className="input w-auto" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          <option value="subject">subject</option>
          <option value="exam">exam</option>
        </select>
        <input className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="New value…" required />
        <button className="btn-primary">Add</button>
      </form>
      <SettingsCard />
    </div>
  );
}

function SettingsCard() {
  const [items, setItems] = useState([]);
  const [form, setForm] = useState({ key: '', value: '' });
  useEffect(() => {
    adminSettings().then((r) => setItems(r.data)).catch(() => {});
  }, []);
  return (
    <div className="card sm:col-span-2">
      <h3 className="font-bold">Platform settings</h3>
      <ul className="mt-2 text-sm">{items.map((s) => <li key={s.key}><b>{s.key}</b>: {s.value}</li>)}</ul>
      <form className="mt-2 flex gap-2" onSubmit={async (e) => { e.preventDefault(); await saveSetting(form.key, form.value); setForm({ key: '', value: '' }); adminSettings().then((r) => setItems(r.data)); }}>
        <input className="input w-40" value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="key" required />
        <input className="input" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} placeholder="value" />
        <button className="btn-primary">Save</button>
      </form>
    </div>
  );
}

function Usage() {
  const [data, setData] = useState(null);
  useEffect(() => {
    usageStats({ limit: 20 }).then((r) => setData(r.data)).catch(() => setData({ totals: [], errors: [] }));
  }, []);
  if (!data) return <Loading label="Loading usage…" />;
  return (
    <div className="space-y-4">
      <div className="card">
        <h3 className="font-bold">AI requests by feature (real counts)</h3>
        {data.totals.length === 0 ? <p className="text-sm text-slate-500">No AI requests logged yet.</p> : (
          <ul className="mt-2 text-sm">{data.totals.map((t, i) => <li key={i}>{t._id}: <b>{t.n}</b> ({t.failures} failed)</li>)}</ul>
        )}
      </div>
      <div className="card">
        <h3 className="font-bold">Recent service errors</h3>
        {data.errors.length === 0 ? <p className="text-sm text-slate-500">No failures recorded 🎉</p> : (
          <ul className="mt-2 space-y-1 text-sm">{data.errors.map((e) => <li key={e._id}>{new Date(e.createdAt).toLocaleString()} · {e.feature} · {e.user?.email || '?'} · {e.error}</li>)}</ul>
        )}
      </div>
    </div>
  );
}

function Audit() {
  const [data, setData] = useState(null);
  const [action, setAction] = useState('');
  const load = async (a = action) => {
    const res = await auditLog(a ? { action: a } : {});
    setData(res.data);
  };
  useEffect(() => {
    load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!data) return <Loading label="Loading audit log…" />;
  return (
    <div className="card space-y-2">
      <div className="flex gap-2">
        <input className="input w-auto" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Filter by action, e.g. user.suspended" />
        <button className="btn-ghost text-sm" onClick={() => load()}>Filter</button>
        <button className="btn-ghost text-sm" onClick={() => { setAction(''); load(''); }}>Clear</button>
      </div>
      {data.items.length === 0 ? <Empty title="No audit entries" hint="Admin actions like suspensions, role changes and approvals are recorded here." /> : (
        <ul className="space-y-1 text-sm">
          {data.items.map((e) => (
            <li key={e._id} className="border-t pt-1">{new Date(e.createdAt).toLocaleString()} · <b>{e.action}</b> · by {e.actorEmail} · {e.targetType} {e.targetId}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
