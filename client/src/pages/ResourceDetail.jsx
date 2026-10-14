import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { getResource, toggleBookmark, setCompleted, resourceFileUrl, STATUS_STYLE } from '../api/resources';
import { reportResource } from '../api/notifications';
import Loading from '../components/Loading';
import ErrorState from '../components/ErrorState';
import { getApiMessage } from '../utils/validation';

export default function ResourceDetail() {
  const { id } = useParams();
  const [res, setRes] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = async () => {
    setStatus('loading');
    try {
      const r = await getResource(id);
      setRes(r.data);
      setStatus('success');
    } catch (err) {
      setError(getApiMessage(err, 'Could not open resource'));
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const bookmark = async () => {
    const r = await toggleBookmark(id);
    setRes({ ...res, bookmarked: r.data.bookmarked });
  };

  const complete = async () => {
    try {
      if (!res.bookmarked) {
        await toggleBookmark(id);
      }
      const r = await setCompleted(id, !res.completed);
      setRes({ ...res, bookmarked: true, completed: r.data.completed });
      setNotice(r.data.completed ? 'Marked complete ✓' : 'Marked incomplete');
    } catch (err) {
      setNotice(getApiMessage(err, 'Action failed'));
    }
  };

  if (status === 'loading') return <Loading label="Opening resource…" />;
  if (status === 'error') return <ErrorState message={error} onRetry={load} />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link to="/library" className="btn-ghost text-sm">← Library</Link>
      <div className="card space-y-3">
        <div className="flex flex-wrap gap-1.5">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{res.format}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold capitalize">{res.difficulty}</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold">{res.examType?.toUpperCase()}</span>
          {res.status !== 'approved' && (
            <span className={`rounded-full px-2 py-0.5 text-xs font-bold capitalize ${STATUS_STYLE[res.status]}`}>{res.status}</span>
          )}
        </div>
        <h2 className="text-xl font-bold">{res.title}</h2>
        <p className="text-sm text-slate-500">
          {res.subject}{res.topic ? ` · ${res.topic}` : ''} · by {res.owner?.name || 'Educator'} · 👁 {res.views} · 🔖 {res.bookmarkCount} · ✓ {res.completedCount} completed
        </p>
        {res.description && <p className="text-sm text-slate-700">{res.description}</p>}

        {res.hasFile && (
          <a className="btn-primary w-full" href={resourceFileUrl(res._id)} target="_blank" rel="noreferrer">
            Download {res.fileName} ({Math.round((res.size || 0) / 1024)} KB)
          </a>
        )}
        {res.externalUrl && (
          <div className="rounded-xl bg-amber-50 p-3 text-sm ring-1 ring-amber-200">
            <a className="font-semibold text-brand-700 underline" href={res.externalUrl} target="_blank" rel="noreferrer noopener">
              Open external {res.format} ↗
            </a>
            <p className="mt-1 text-xs text-amber-700">Educator-submitted link. StudyAI has not verified this content — use your judgement.</p>
          </div>
        )}

        {notice && <p className="text-sm text-slate-600">{notice}</p>}
        <div className="flex gap-2">
          <button className="btn-primary" onClick={bookmark}>{res.bookmarked ? '★ Saved' : '☆ Save'}</button>
          <button className="btn-ghost" onClick={complete}>{res.completed ? '✓ Completed' : 'Mark complete'}</button>
        </div>
        <ReportBox resourceId={res._id} />
      </div>
    </div>
  );
}

function ReportBox({ resourceId }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ reason: '', details: '' });
  const [msg, setMsg] = useState('');
  if (!open) {
    return <button className="text-xs text-slate-400 underline" onClick={() => setOpen(true)}>Report inappropriate or incorrect content</button>;
  }
  return (
    <form
      className="space-y-2 rounded-xl bg-slate-50 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await reportResource({ resourceId, ...form });
          setMsg('Report submitted — admins will review it ✓');
          setForm({ reason: '', details: '' });
        } catch (err) {
          setMsg(getApiMessage(err, 'Report failed'));
        }
      }}
    >
      <input className="input" value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Reason — e.g. incorrect facts" required />
      <textarea className="input" rows="2" value={form.details} onChange={(e) => setForm({ ...form, details: e.target.value })} placeholder="Details (optional)" />
      {msg && <p className="text-xs">{msg}</p>}
      <div className="flex gap-2">
        <button className="btn-primary px-3 py-1 text-xs">Submit report</button>
        <button type="button" className="btn-ghost px-3 py-1 text-xs" onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}
