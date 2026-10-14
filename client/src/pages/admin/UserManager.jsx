import { useEffect, useState } from 'react';
import { listUsers, updateUserRole, deleteUser } from '../../api/auth';
import {
  setUserStatus, createUser, userDetail, issueResetToken,
} from '../../api/admin';
import { useAuth } from '../../context/AuthContext';
import { isSuperAdmin } from '../../utils/roles';
import Loading from '../../components/Loading';
import ErrorState from '../../components/ErrorState';
import Empty from '../../components/Empty';
import { getApiMessage } from '../../utils/validation';
import { RoleBadge, StatusBadge, Pager, Modal, Field } from './ui';

// Shared user browser used by Users / Students / Educators tabs.
// fixedRole locks the role filter (students or educators tab).
export default function UserManager({ fixedRole = '', title = 'Users' }) {
  const { user: me } = useAuth();
  const iAmSuper = isSuperAdmin(me?.role);
  const [q, setQ] = useState('');
  const [role, setRole] = useState(fixedRole);
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [creating, setCreating] = useState(false);
  const [resetInfo, setResetInfo] = useState(null);

  const load = async (p = 1) => {
    try {
      const params = { page: p, limit: 20 };
      if (q.trim()) params.q = q.trim();
      if (role) params.role = role;
      if (status) params.status = status;
      const res = await listUsers(params);
      setData(res.data);
      setPage(p);
      setError('');
    } catch (err) {
      setError(getApiMessage(err, 'Failed to load users'));
    }
  };

  useEffect(() => {
    load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const act = async (fn, confirmMsg) => {
    if (confirmMsg && !confirm(confirmMsg)) return;
    try {
      await fn();
      load(page);
    } catch (err) {
      alert(getApiMessage(err, 'Action failed'));
    }
  };

  // Backend is the source of truth; the UI additionally explains blocks.
  const privileged = (u) => u.role === 'admin' || u.role === 'super_admin';
  const canManage = (u) => iAmSuper || !privileged(u);
  const blockReason = (u) => (!iAmSuper && privileged(u) ? 'Only super admins can manage privileged accounts' : '');

  if (!data && !error) return <Loading label={`Loading ${title.toLowerCase()}…`} />;
  if (error) return <ErrorState message={error} onRetry={() => load(1)} />;
  const pages = Math.max(1, Math.ceil(data.total / 20));

  return (
    <div className="card space-y-3 overflow-x-auto">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-bold">{title}</h3>
        <button className="btn-primary ml-auto px-3 py-1 text-sm" onClick={() => setCreating(true)}>+ New user</button>
      </div>
      <div className="flex flex-wrap gap-2">
        <input className="input w-auto" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && load(1)} placeholder="Search name/email…" aria-label="Search users" />
        {!fixedRole && (
          <select className="input w-auto" value={role} onChange={(e) => { setRole(e.target.value); }} aria-label="Filter by role">
            <option value="">All roles</option>
            <option value="student">student</option>
            <option value="educator">educator</option>
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
          </select>
        )}
        <select className="input w-auto" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="active">active</option>
          <option value="suspended">suspended</option>
        </select>
        <button className="btn-ghost text-sm" onClick={() => load(1)}>Apply</button>
      </div>
      {data.items.length === 0 ? <Empty title="No users match" hint="Adjust search or filters." /> : (
        <table className="w-full text-left text-sm">
          <thead><tr className="text-slate-500"><th className="py-2">Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
          <tbody>
            {data.items.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="py-2 font-medium"><button className="underline decoration-dotted" onClick={() => setDetailId(u.id)} title="View details">{u.name}</button></td>
                <td>{u.email}</td>
                <td>
                  <select
                    className="input w-32 py-1" value={u.role} disabled={!canManage(u)}
                    title={blockReason(u) || 'Change role'}
                    onChange={(e) => act(() => updateUserRole(u.id, e.target.value), `Change ${u.email} to ${e.target.value}? This is audited.`)}>
                    <option value="student">student</option>
                    <option value="educator">educator</option>
                    <option value="admin">admin</option>
                    {iAmSuper && <option value="super_admin">super_admin</option>}
                  </select>
                </td>
                <td><StatusBadge status={u.status} /></td>
                <td>
                  <div className="flex flex-wrap gap-1 py-2">
                    {u.status === 'active' ? (
                      <button className="btn-ghost px-2 py-1 text-xs text-amber-700" disabled={!canManage(u)} title={blockReason(u) || 'Suspend account'}
                        onClick={() => act(() => setUserStatus(u.id, 'suspended'), `Suspend ${u.email}? They will be logged out immediately.`)}>Suspend</button>
                    ) : (
                      <button className="btn-ghost px-2 py-1 text-xs text-green-700" disabled={!canManage(u)} title={blockReason(u) || 'Reactivate account'}
                        onClick={() => act(() => setUserStatus(u.id, 'active'))}>Activate</button>
                    )}
                    <button className="btn-ghost px-2 py-1 text-xs" onClick={async () => {
                      try {
                        const r = await issueResetToken(u.id);
                        setResetInfo({ email: u.email, token: r.data.resetToken, minutes: r.data.expiresInMinutes });
                      } catch (err) { alert(getApiMessage(err, 'Reset failed')); }
                    }} title="Issue a single-use reset token (shown once)">Reset pwd</button>
                    <button className="btn-ghost px-2 py-1 text-xs text-red-600" disabled={!canManage(u)} title={blockReason(u) || 'Delete permanently'}
                      onClick={() => act(() => deleteUser(u.id), `Permanently delete ${u.email}? This cannot be undone.`)}>Delete</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <Pager page={page} pages={pages} total={data.total} onPage={(p) => load(p)} />
      {detailId && <UserDetailModal id={detailId} onClose={() => setDetailId(null)} />}
      {creating && <CreateUserModal fixedRole={fixedRole} iAmSuper={iAmSuper} onClose={() => setCreating(false)} onDone={() => { setCreating(false); load(page); }} />}
      {resetInfo && (
        <Modal title="Reset token — show once" onClose={() => setResetInfo(null)}>
          <p className="text-sm">For <b>{resetInfo.email}</b>. Single-use, expires in {resetInfo.minutes} min. Pass it to the user out-of-band; it will never be shown again.</p>
          <code className="mt-2 block break-all rounded bg-slate-100 p-2 text-xs">{resetInfo.token}</code>
        </Modal>
      )}
    </div>
  );
}

function UserDetailModal({ id, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    userDetail(id).then((r) => setData(r.data)).catch((e) => setError(getApiMessage(e, 'Failed to load')));
  }, [id]);
  return (
    <Modal title="User detail" onClose={onClose}>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!data && !error && <Loading label="Loading…" />}
      {data && (
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2"><b>{data.user.name}</b><RoleBadge role={data.user.role} /><StatusBadge status={data.user.status} /></div>
          <p className="text-slate-500">{data.user.email} · joined {new Date(data.user.createdAt).toLocaleDateString()}</p>
          {data.user.role === 'educator' && (
            <p>Bio: {data.user.bio || '—'} · Subjects: {(data.user.teachingSubjects || []).join(', ') || '—'}</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {Object.entries(data.learning).map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-2 text-center"><p className="text-lg font-bold">{v}</p><p className="text-xs capitalize text-slate-500">{k}</p></div>
            ))}
          </div>
          <div>
            <p className="font-semibold">Recent attempts</p>
            {data.recentAttempts.length === 0 ? <p className="text-slate-500">None.</p> : (
              <ul>{data.recentAttempts.map((t) => <li key={t.id}>{t.assessment} — {t.score}/{t.maxScore} ({t.status})</li>)}</ul>
            )}
          </div>
          <p className="text-xs text-slate-400">This inspection was recorded in the audit log.</p>
        </div>
      )}
    </Modal>
  );
}

function CreateUserModal({ fixedRole, iAmSuper, onClose, onDone }) {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: fixedRole || 'student' });
  const [error, setError] = useState('');
  const submit = async (e) => {
    e.preventDefault();
    try {
      await createUser(form);
      onDone();
    } catch (err) {
      setError(getApiMessage(err, 'Create failed'));
    }
  };
  return (
    <Modal title="Create user" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Name"><input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></Field>
        <Field label="Email"><input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></Field>
        <Field label="Temporary password (min 6 — share out-of-band)"><input className="input" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></Field>
        <Field label="Role" hint={!iAmSuper ? 'Only super admins can create admin accounts.' : ''}>
          <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="student">student</option>
            <option value="educator">educator</option>
            <option value="admin">admin</option>
            {iAmSuper && <option value="super_admin">super_admin</option>}
          </select>
        </Field>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button className="btn-primary w-full">Create</button>
      </form>
    </Modal>
  );
}
