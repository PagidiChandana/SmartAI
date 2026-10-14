import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { attemptResult } from '../api/assessments';
import Loading from '../components/Loading';
import ErrorState from '../components/ErrorState';
import { getApiMessage } from '../utils/validation';

export default function AttemptResult() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');

  const load = async () => {
    setStatus('loading');
    try {
      const res = await attemptResult(id);
      setData(res.data);
      setStatus('success');
    } catch (err) {
      setError(getApiMessage(err, 'Could not load result'));
      setStatus('error');
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  if (status === 'loading') return <Loading label="Loading result…" />;
  if (status === 'error') return <ErrorState message={error} onRetry={load} />;

  const byQ = new Map((data.answers || []).map((a) => [(a.question?._id || a.question)?.toString(), a]));

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/assessments" className="btn-ghost text-sm">← All assessments</Link>
      <div className="card flex flex-wrap items-center gap-4">
        <div>
          <h2 className="text-xl font-bold">{data.assessment?.title} — Attempt {data.attemptNo}</h2>
          <p className="text-sm text-slate-500">
            Status: <b className="capitalize">{data.status}</b> · {Math.round(data.timeSpentSec / 60)} min spent
            {!data.released && ' · ⏳ Detailed answers release later'}
          </p>
        </div>
        <div className="ml-auto text-center">
          <p className="text-3xl font-bold">{data.score}<span className="text-lg text-slate-400">/{data.maxScore}</span></p>
          <p className="text-sm text-slate-500">{data.accuracy}% accuracy (auto-graded)</p>
        </div>
      </div>

      {(data.questions || []).map((q, i) => {
        const a = byQ.get(q._id.toString()) || {};
        return (
          <div key={q._id} className={`card space-y-2 ${a.isCorrect === true ? 'ring-green-200' : a.isCorrect === false ? 'ring-red-200' : ''}`}>
            <p className="text-xs text-slate-500">Q{i + 1} · {q.marks} mark(s) · awarded <b>{a.marksAwarded ?? 0}</b></p>
            <p className="font-semibold">{q.text}</p>
            {q.type === 'mcq' && <p className="text-sm">Your answer: <b>{a.selectedOption !== null && a.selectedOption !== undefined ? q.options[a.selectedOption] : '—'}</b></p>}
            {q.type === 'truefalse' && <p className="text-sm">Your answer: <b>{a.boolAnswer === null || a.boolAnswer === undefined ? '—' : String(a.boolAnswer)}</b></p>}
            {q.type === 'short' && <p className="text-sm whitespace-pre-wrap">Your answer: {a.textAnswer || '—'}</p>}
            {a.needsGrading && <p className="text-sm text-amber-600">⏳ Awaiting educator grading</p>}
            {a.feedback && <p className="rounded-lg bg-blue-50 p-2 text-sm text-blue-800">Educator feedback: {a.feedback}</p>}
            {data.released && q.correct && (
              <div className="rounded-xl bg-green-50 p-2 text-sm ring-1 ring-green-200">
                <p>✓ Correct: <b>{q.type === 'mcq' ? q.options[q.correct.option] : q.type === 'truefalse' ? String(q.correct.bool) : q.correct.modelAnswer}</b></p>
                {q.explanation && <p className="mt-1 text-slate-600">💡 {q.explanation}</p>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
