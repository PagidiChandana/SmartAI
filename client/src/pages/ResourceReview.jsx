import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { reviewQueue, approveResource, rejectResource } from '../api/resources';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';

export default function ResourceReview() {
  const [queue, setQueue] = useState([]);
  const [status, setStatus] = useState('loading');
  const [notes, setNotes] = useState({});
  const [msg, setMsg] = useState('');

  const load = async () => {
    setStatus('loading');
    try {
      const res = await reviewQueue();
      setQueue(res.data);
      setStatus('success');
    } catch (err) {
      setStatus('error');
      setMsg(getApiMessage(err, 'Could not load queue'));
    }
  };

  useEffect(() => {
    load();
  }, []);

  const decide = async (id, approve) => {
    try {
      if (approve) await approveResource(id, notes[id] || '');
      else await rejectResource(id, notes[id] || '');
      load();
    } catch (err) {
      setMsg(getApiMessage(err, 'Review failed'));
    }
  };

  if (status === 'loading') return <Loading label="Loading review queue…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold">Material review</h2>
        <p className="text-sm text-slate-500">Approve quality materials; reject with a note. Students only see approved items.</p>
      </div>
      {msg && <p className="card py-3 text-sm text-red-600">{msg}</p>}
      {queue.length === 0 ? (
        <Empty title="Queue is clear 🎉" hint="New educator submissions will appear here." />
      ) : (
        queue.map((r) => (
          <div key={r._id} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <b>{r.title}</b>
              <span className="text-xs text-slate-500">{r.subject}{r.topic ? ` · ${r.topic}` : ''} · {r.format} · {r.difficulty}</span>
            </div>
            <p className="text-xs text-slate-500">by {r.owner?.name} ({r.owner?.email}) · {r.externalUrl ? `URL: ${r.externalUrl}` : `file: ${r.fileName} (${Math.round((r.size || 0) / 1024)} KB)`}</p>
            {r.description && <p className="text-sm">{r.description}</p>}
            <input
              className="input"
              value={notes[r._id] || ''}
              onChange={(e) => setNotes({ ...notes, [r._id]: e.target.value })}
              placeholder="Reviewer note (optional, shown to educator)"
            />
            <div className="flex gap-2">
              <button className="btn-primary" onClick={() => decide(r._id, true)}>Approve</button>
              <button className="btn-ghost text-red-600" onClick={() => decide(r._id, false)}>Reject</button>
              <Link to={`/library/${r._id}`} className="btn-ghost">Preview</Link>
            </div>
          </div>
        ))
      )}
    </div>
  );
}
