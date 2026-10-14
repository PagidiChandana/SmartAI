import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { resetPassword } from '../api/auth';
import { getApiMessage } from '../utils/validation';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const [form, setForm] = useState({ token: params.get('token') || '', newPassword: '' });
  const [state, setState] = useState({ status: 'idle', message: '' });
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    if (!form.token) return setState({ status: 'error', message: 'Reset token is required' });
    if (!form.newPassword || form.newPassword.length < 6) {
      return setState({ status: 'error', message: 'New password must be at least 6 characters' });
    }
    setState({ status: 'loading', message: '' });
    try {
      await resetPassword(form);
      setState({ status: 'success', message: 'Password reset! Redirecting to login…' });
      setTimeout(() => navigate('/login'), 900);
    } catch (err) {
      setState({ status: 'error', message: getApiMessage(err, 'Reset failed') });
    }
  };

  return (
    <div className="card mx-auto max-w-md">
      <h2 className="text-xl font-bold">Reset password</h2>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label className="label">Reset token</label>
          <input className="input" value={form.token} onChange={(e) => setForm({ ...form, token: e.target.value })} placeholder="Paste token from email" />
        </div>
        <div>
          <label className="label">New password (min 6)</label>
          <input className="input" type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} />
        </div>
        {state.message && (
          <p className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>{state.message}</p>
        )}
        <button className="btn-primary w-full" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Resetting…' : 'Reset password'}
        </button>
      </form>
      <p className="mt-3 text-sm text-slate-500">
        <Link to="/login" className="font-semibold text-brand-600">Back to login</Link>
      </p>
    </div>
  );
}
