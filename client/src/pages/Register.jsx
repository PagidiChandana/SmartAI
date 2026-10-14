import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../api/auth';
import { useAuth } from '../context/AuthContext';
import { validateRegister, getApiMessage } from '../utils/validation';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'student' });
  const [fieldErrors, setFieldErrors] = useState({});
  const [state, setState] = useState({ status: 'idle', message: '' });
  const { saveSession } = useAuth();
  const navigate = useNavigate();

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errors = validateRegister(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setState({ status: 'loading', message: '' });
    try {
      const res = await register(form);
      saveSession(res.data);
      setState({ status: 'success', message: `Account created as ${res.data.user.role}! Redirecting…` });
      setTimeout(() => navigate('/dashboard'), 600);
    } catch (err) {
      setState({ status: 'error', message: getApiMessage(err, 'Registration failed') });
    }
  };

  return (
    <div className="card mx-auto max-w-md">
      <h2 className="text-xl font-bold">Create your StudyAI account</h2>
      <p className="mt-1 text-sm text-slate-500">Public signup is open for students and educators only.</p>
      <form onSubmit={submit} className="mt-4 space-y-3" noValidate>
        <div>
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Aarav Sharma" />
          {fieldErrors.name && <p className="mt-1 text-sm text-red-600">{fieldErrors.name}</p>}
        </div>
        <div>
          <label className="label">Email</label>
          <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
          {fieldErrors.email && <p className="mt-1 text-sm text-red-600">{fieldErrors.email}</p>}
        </div>
        <div>
          <label className="label">Password (min 6)</label>
          <input className="input" type="password" value={form.password} onChange={set('password')} />
          {fieldErrors.password && <p className="mt-1 text-sm text-red-600">{fieldErrors.password}</p>}
        </div>
        <div>
          <label className="label">I am a…</label>
          <select className="input" value={form.role} onChange={set('role')}>
            <option value="student">Student</option>
            <option value="educator">Educator</option>
          </select>
          {fieldErrors.role && <p className="mt-1 text-sm text-red-600">{fieldErrors.role}</p>}
        </div>
        {state.message && (
          <p className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>{state.message}</p>
        )}
        <button className="btn-primary w-full" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Creating…' : 'Register'}
        </button>
      </form>
      <p className="mt-3 text-sm text-slate-500">
        Have an account? <Link to="/login" className="font-semibold text-brand-600">Login</Link>
      </p>
    </div>
  );
}
