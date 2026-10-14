import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { login } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { validateLogin, getApiMessage } from '../utils/validation';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [state, setState] = useState({ status: 'idle', message: '' });
  const { saveSession } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    const errors = validateLogin(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setState({ status: 'loading', message: '' });
    try {
      const res = await login(form);
      saveSession(res.data);
      setState({ status: 'success', message: `Welcome back, ${res.data.user.name}! Redirecting…` });
      setTimeout(() => navigate('/dashboard'), 600);
    } catch (err) {
      setState({ status: 'error', message: getApiMessage(err, 'Login failed') });
    }
  };

  return (
    <div className="card mx-auto max-w-md">
      <h2 className="text-xl font-bold">Welcome back</h2>
      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <div>
          <label className="label">Email</label>
          <input
            className="input"
            type="email"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            placeholder="you@example.com"
          />
          {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
        </div>
        <div>
          <label className="label">Password</label>
          <input
            className="input"
            type="password"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
          />
          {fieldErrors.password && <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>}
        </div>
        {state.message && (
          <p className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>{state.message}</p>
        )}
        <button className="btn-primary w-full" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Signing in…' : 'Login'}
        </button>
      </form>
      <div className="mt-3 flex justify-between text-sm">
        <Link to="/forgot-password" className="font-semibold text-brand-600">Forgot password?</Link>
        <Link to="/register" className="text-slate-500">No account? <span className="font-semibold text-brand-600">Register</span></Link>
      </div>
    </div>
  );
}
