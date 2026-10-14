import { useState } from 'react';
import { Link } from 'react-router-dom';
import { forgotPassword } from '../api/auth';
import { validateEmail, getApiMessage } from '../utils/validation';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState({ status: 'idle', message: '', devToken: '' });

  const submit = async (e) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      setState({ status: 'error', message: 'Enter a valid email', devToken: '' });
      return;
    }
    setState({ status: 'loading', message: '', devToken: '' });
    try {
      const res = await forgotPassword({ email });
      setState({
        status: 'success',
        message: res.message,
        devToken: res.data?.devResetToken || '',
      });
    } catch (err) {
      setState({ status: 'error', message: getApiMessage(err, 'Request failed'), devToken: '' });
    }
  };

  return (
    <div className="card mx-auto max-w-md">
      <h2 className="text-xl font-bold">Forgot password</h2>
      <p className="mt-1 text-sm text-slate-500">We generate a time-limited reset token (30 min).</p>
      <form onSubmit={submit} className="mt-4 space-y-3">
        <div>
          <label className="label">Account email</label>
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {state.message && (
          <p className={`text-sm ${state.status === 'error' ? 'text-red-600' : 'text-green-600'}`}>{state.message}</p>
        )}
        {state.devToken && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
            <p className="font-semibold">Dev reset token (shown only when the server runs in non-production mode):</p>
            <code className="break-all text-xs">{state.devToken}</code>
            <p className="mt-2">
              <Link to={`/reset-password?token=${state.devToken}`} className="font-semibold text-brand-600">
                Continue to reset →
              </Link>
            </p>
          </div>
        )}
        <button className="btn-primary w-full" disabled={state.status === 'loading'}>
          {state.status === 'loading' ? 'Sending…' : 'Send reset link'}
        </button>
      </form>
      <p className="mt-3 text-sm text-slate-500">
        <Link to="/login" className="font-semibold text-brand-600">Back to login</Link>
      </p>
    </div>
  );
}
