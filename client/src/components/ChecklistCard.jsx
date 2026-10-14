import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getChecklist } from '../api/learning';

export default function ChecklistCard({ compact = false }) {
  const [state, setState] = useState({ status: 'loading', data: null });

  useEffect(() => {
    getChecklist()
      .then((res) => setState({ status: 'success', data: res.data }))
      .catch(() => setState({ status: 'error', data: null }));
  }, []);

  if (state.status === 'loading') {
    return (
      <div className="card flex items-center gap-3">
        <span className="h-5 w-5 animate-spin rounded-full border-2 border-brand-600 border-t-transparent" />
        <p className="text-sm text-slate-600">Checking your setup…</p>
      </div>
    );
  }
  if (state.status === 'error' || !state.data) return null;

  const { steps, done, total, pct, next } = state.data;

  return (
    <div className="card">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Setup checklist</h3>
        <span className="text-sm font-semibold text-brand-700">{done}/{total} · {pct}%</span>
      </div>
      <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      {!compact && (
        <ul className="mt-3 space-y-1.5">
          {steps.map((s) => (
            <li key={s.key} className="flex items-center gap-2 text-sm">
              <span className={s.done ? 'text-green-600' : 'text-slate-300'}>{s.done ? '✓' : '○'}</span>
              <span className={s.done ? 'text-slate-500 line-through' : 'text-slate-700'}>{s.label}</span>
            </li>
          ))}
        </ul>
      )}
      {next ? (
        <Link to={next.href} className="btn-primary mt-4 w-full">
          Next: {next.label} →
        </Link>
      ) : (
        <p className="mt-3 text-sm font-semibold text-green-700">Setup complete — ready for your AI study plan 🎉</p>
      )}
    </div>
  );
}
