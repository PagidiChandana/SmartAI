import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { updateMe, changePassword } from '../api/auth';
import Loading from '../components/Loading';
import { getApiMessage } from '../utils/validation';

export default function Profile() {
  const { user, loading, refresh } = useAuth();
  const [form, setForm] = useState(null);
  const [pw, setPw] = useState({ currentPassword: '', newPassword: '' });
  const [msg, setMsg] = useState({ profile: '', password: '' });

  if (loading) return <Loading label="Loading profile…" />;
  const current = form ?? { name: user?.name || '', email: user?.email || '' };

  const saveProfile = async (e) => {
    e.preventDefault();
    try {
      await updateMe({ name: current.name, email: current.email });
      await refresh();
      setMsg({ ...msg, profile: 'Profile updated ✓' });
    } catch (err) {
      setMsg({ ...msg, profile: getApiMessage(err, 'Update failed') });
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    try {
      await changePassword(pw);
      setPw({ currentPassword: '', newPassword: '' });
      setMsg({ ...msg, password: 'Password changed ✓' });
    } catch (err) {
      setMsg({ ...msg, password: getApiMessage(err, 'Password change failed') });
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold">Profile</h2>
        <p className="text-sm text-slate-500">
          {user?.email} · <span className="font-semibold capitalize">{user?.role}</span>
        </p>
        <form onSubmit={saveProfile} className="mt-4 space-y-3">
          <div>
            <label className="label">Name</label>
            <input className="input" value={current.name} onChange={(e) => setForm({ ...current, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={current.email} onChange={(e) => setForm({ ...current, email: e.target.value })} />
          </div>
          {msg.profile && <p className="text-sm text-slate-600">{msg.profile}</p>}
          <button className="btn-primary">Save profile</button>
        </form>
      </div>
      <div className="card">
        <h3 className="font-semibold">Change password</h3>
        <form onSubmit={savePassword} className="mt-3 space-y-3">
          <input className="input" type="password" placeholder="Current password" value={pw.currentPassword} onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
          <input className="input" type="password" placeholder="New password (min 6)" value={pw.newPassword} onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
          {msg.password && <p className="text-sm text-slate-600">{msg.password}</p>}
          <button className="btn-primary">Change password</button>
        </form>
      </div>
    </div>
  );
}
