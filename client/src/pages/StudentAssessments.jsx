import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { listAvailable, myPerformance, attemptHistory } from '../api/assessments';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';

export default function StudentAssessments() {
  const [items, setItems] = useState([]);
  const [perf, setPerf] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([listAvailable().catch(() => ({ data: [] })), myPerformance().catch(() => ({ data: null }))])
      .then(([a, p]) => {
        setItems(a.data || []);
        setPerf(p.data || null);
      })
      .catch((err) => setError(getApiMessage(err, 'Could not load assessments')))
      .finally(() => setStatus('success'));
  }, []);

  if (status === 'loading') return <Loading label="Loading assessments…" />;

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold">Tests & assignments</h2>
        <p className="text-sm text-slate-500">Timed on the server — the countdown keeps running even if you reload.</p>
      </div>
      {error && <p className="card py-3 text-sm text-red-600">{error}</p>}

      {perf && perf.totalAttempts > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card"><p className="text-sm text-slate-500">Attempts</p><p className="text-2xl font-bold">{perf.totalAttempts}</p></div>
          <div className="card"><p className="text-sm text-slate-500">Avg accuracy</p><p className="text-2xl font-bold">{perf.avgAccuracy}%</p></div>
          <div className="card">
            <p className="text-sm text-slate-500">By topic</p>
            {perf.byTopic.slice(0, 3).map((t) => <p key={t.topic} className="text-sm">{t.topic}: <b>{t.avgAccuracy}%</b></p>)}
          </div>
        </div>
      )}

      {items.length === 0 ? (
        <Empty title="No assessments available" hint="Your educators haven't assigned anything yet. Check back soon." />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {items.map((a) => (
            <AssessmentCard key={a._id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AssessmentCard({ a }) {
  const [hist, setHist] = useState(null);
  const [histError, setHistError] = useState('');
  const deadline = a.deadline ? new Date(a.deadline).toLocaleString() : 'No deadline';
  return (
    <div className="card space-y-2">
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${a.kind === 'test' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>{a.kind}</span>
        <span className="text-xs text-slate-500">{a.subject}{a.topic ? ` · ${a.topic}` : ''}</span>
      </div>
      <h3 className="font-bold">{a.title}</h3>
      <p className="text-sm text-slate-500">
        {a.questionCount} questions · {a.totalMarks} marks · {a.durationMin > 0 ? `${a.durationMin} min timed` : 'untimed'} · ⏰ {deadline}
      </p>
      <p className="text-sm">Attempts: {a.attemptsUsed}/{a.attemptsUsed + a.attemptsLeft}{a.resumeId ? ' · <b>in progress — resume!</b>' : ''}</p>
      <div className="flex gap-2">
        {a.resumeId ? (
          <Link to={`/attempts/${a.resumeId}/resume`} className="btn-primary">Resume →</Link>
        ) : a.attemptsLeft > 0 ? (
          <Link to={`/assessments/${a._id}/take`} className="btn-primary">Start →</Link>
        ) : (
          <span className="text-sm text-slate-500">No attempts left</span>
        )}
        <button className="btn-ghost text-sm" onClick={async () => { try { setHistError(''); const h = await attemptHistory(a._id); setHist(h.data); } catch (err) { setHistError(getApiMessage(err, 'Could not load history')); } }}>
          History
        </button>
      </div>
      {histError && <p className="text-sm text-red-600">{histError}</p>}
      {hist && (
        hist.attempts.length === 0 ? (
          <p className="text-sm text-slate-500">No attempts yet — click Start to take this test.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {hist.attempts.map((t) => (
              <li key={t._id}><Link to={`/attempts/${t._id}`} className="text-brand-600 underline">Attempt {t.attemptNo}</Link> — {t.score}/{t.maxScore} · {t.status}</li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
