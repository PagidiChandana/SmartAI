import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listLibrary, getRecommendations, toggleBookmark } from '../api/resources';
import ResourceCard from '../components/ResourceCard';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';
import { FORMATS, DIFFICULTIES, EXAM_TYPES } from '../api/resources';

export default function Library() {
  const [tab, setTab] = useState('browse'); // browse | foryou | saved
  const [filters, setFilters] = useState({ q: '', subject: '', difficulty: '', examType: '', format: '', sort: 'newest', page: 1 });
  const [data, setData] = useState({ items: [], total: 0 });
  const [recs, setRecs] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const load = async (f = filters, t = tab) => {
    setStatus('loading');
    try {
      if (t === 'foryou') {
        const res = await getRecommendations(12);
        setRecs(res.data.items);
        setStatus('success');
      } else {
        const params = { ...f };
        if (t === 'saved') params.bookmarked = 'true';
        Object.keys(params).forEach((k) => params[k] === '' && delete params[k]);
        const res = await listLibrary(params);
        setData(res.data);
        setStatus('success');
      }
    } catch (err) {
      setError(getApiMessage(err, 'Could not load library'));
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const search = (e) => {
    e.preventDefault();
    load({ ...filters, page: 1 });
  };

  const bookmark = async (resource) => {
    await toggleBookmark(resource._id);
    load();
  };

  const pages = Math.max(1, Math.ceil(data.total / 12));

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold">Resource library</h2>
        <p className="text-sm text-slate-500">Approved educator materials only. External links are educator-submitted and not verified by StudyAI.</p>
        <div className="mt-3 flex gap-2">
          {['browse', 'foryou', 'saved'].map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${tab === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}
            >
              {t === 'browse' ? 'Browse' : t === 'foryou' ? 'For you ✨' : 'Saved ★'}
            </button>
          ))}
        </div>
      </div>

      {tab === 'foryou' && (
        <div className="space-y-4">
          {status === 'loading' && <Loading label="Personalizing…" />}
          {status === 'error' && <p className="card text-sm text-red-600">{error}</p>}
          {status === 'success' && recs.length === 0 && (
            <Empty title="No recommendations yet" hint="Add subjects and topics in setup, or wait for educators to publish approved materials." />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {recs.map(({ resource, reasons }) => (
              <ResourceCard key={resource._id} resource={resource} reasons={reasons} onBookmark={bookmark} />
            ))}
          </div>
        </div>
      )}

      {tab !== 'foryou' && (
        <>
          <form onSubmit={search} className="card space-y-3">
            <div className="flex gap-2">
              <input className="input" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search titles, subjects, topics…" />
              <button className="btn-primary">Search</button>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
              <input className="input" value={filters.subject} onChange={(e) => setFilters({ ...filters, subject: e.target.value })} placeholder="Subject" />
              <select className="input" value={filters.difficulty} onChange={(e) => setFilters({ ...filters, difficulty: e.target.value })}>
                <option value="">Any level</option>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select className="input" value={filters.examType} onChange={(e) => setFilters({ ...filters, examType: e.target.value })}>
                <option value="">Any exam</option>
                {EXAM_TYPES.map((d) => <option key={d} value={d}>{d.toUpperCase()}</option>)}
              </select>
              <select className="input" value={filters.format} onChange={(e) => setFilters({ ...filters, format: e.target.value })}>
                <option value="">Any format</option>
                {FORMATS.map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
              <select className="input" value={filters.sort} onChange={(e) => setFilters({ ...filters, sort: e.target.value })}>
                <option value="newest">Newest</option>
                <option value="popular">Popular</option>
              </select>
            </div>
          </form>

          {status === 'loading' && <Loading label="Loading resources…" />}
          {status === 'error' && <p className="card text-sm text-red-600">{error} <button className="font-bold" onClick={() => load()}>Retry</button></p>}
          {status === 'success' && data.items.length === 0 && (
            <Empty title={tab === 'saved' ? 'No saved resources' : 'Nothing found'} hint={tab === 'saved' ? 'Tap ☆ Save on any resource to keep it here.' : 'Try different keywords or clear filters.'} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            {data.items.map((r) => <ResourceCard key={r._id} resource={r} onBookmark={bookmark} />)}
          </div>
          {pages > 1 && (
            <div className="flex items-center justify-center gap-3">
              <button className="btn-ghost" disabled={filters.page <= 1} onClick={() => { const f = { ...filters, page: filters.page - 1 }; setFilters(f); load(f); }}>← Prev</button>
              <span className="text-sm text-slate-500">Page {filters.page} of {pages} ({data.total})</span>
              <button className="btn-ghost" disabled={filters.page >= pages} onClick={() => { const f = { ...filters, page: filters.page + 1 }; setFilters(f); load(f); }}>Next →</button>
            </div>
          )}
        </>
      )}
      <p className="text-center text-xs text-slate-400"><Link to="/setup" className="underline">Update your subjects in setup</Link> to improve recommendations.</p>
    </div>
  );
}
