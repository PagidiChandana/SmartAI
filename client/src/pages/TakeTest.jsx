import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { startAttempt, autosaveAttempt, submitAttempt, attemptResult } from '../api/assessments';
import Loading from '../components/Loading';
import ErrorState from '../components/ErrorState';
import { getApiMessage } from '../utils/validation';

export default function TakeTest({ resume = false }) {
  const { id } = useParams(); // assessment id (take) or attempt id (resume/result shared below)
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [idx, setIdx] = useState(0);
  const [answers, setAnswers] = useState({});
  const [left, setLeft] = useState(null);
  const [saving, setSaving] = useState('');
  const answersRef = useRef({});
  const attemptRef = useRef(null);

  const boot = useCallback(async () => {
    setStatus('loading');
    try {
      const res = resume ? await attemptResult(id) : await startAttempt(id);
      const d = res.data;
      setData(d);
      attemptRef.current = d._id;
      const map = {};
      (d.answers || []).forEach((a) => {
        const qid = (a.question?._id || a.question)?.toString();
        map[qid] = { selectedOption: a.selectedOption ?? null, boolAnswer: a.boolAnswer ?? null, textAnswer: a.textAnswer || '' };
      });
      setAnswers(map);
      answersRef.current = map;
      setStatus('success');
    } catch (err) {
      setError(getApiMessage(err, 'Could not start attempt'));
      setStatus('error');
    }
  }, [id, resume]);

  useEffect(() => {
    boot();
  }, [boot]);

  // Server-authoritative countdown (expiresAt from server; survives reload).
  // submittedRef guarantees exactly one auto-submit when time hits zero.
  const submittedRef = useRef(false);
  const submittingRef = useRef(false);
  useEffect(() => {
    if (!data?.expiresAt || data.status !== 'in-progress') return;
    const tick = () => {
      const s = Math.max(0, Math.round((new Date(data.expiresAt) - Date.now()) / 1000));
      setLeft(s);
      if (s === 0 && !submittedRef.current) {
        submittedRef.current = true;
        handleSubmit(true);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.expiresAt, data?.status]);

  // Autosave every 20s.
  useEffect(() => {
    if (!data || data.status !== 'in-progress') return;
    const t = setInterval(async () => {
      try {
        setSaving('Saving…');
        await autosaveAttempt(attemptRef.current, toPayload());
        setSaving('Saved ✓ ' + new Date().toLocaleTimeString());
      } catch {
        setSaving('Save failed — retrying');
      }
    }, 20000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.status]);

  const toPayload = () =>
    Object.entries(answersRef.current).map(([question, a]) => ({ question, ...a }));

  const set = (qid, patch) => {
    const next = { ...answersRef.current, [qid]: { ...answersRef.current[qid], ...patch } };
    answersRef.current = next;
    setAnswers(next);
  };

  const handleSubmit = async (auto = false) => {
    if (!attemptRef.current || submittingRef.current) return;
    if (!auto && !confirm('Submit your answers? This cannot be undone.')) return;
    submittingRef.current = true;
    try {
      setSaving(auto ? 'Time up — submitting…' : 'Submitting…');
      const res = await submitAttempt(attemptRef.current, toPayload());
      navigate(`/attempts/${res.data._id}`, { replace: true });
    } catch (err) {
      submittingRef.current = false;
      setError(getApiMessage(err, 'Submit failed — your autosaved answers are safe'));
    }
  };

  if (status === 'loading') return <Loading label={resume ? 'Resuming attempt…' : 'Starting attempt — timer begins now…'} />;
  if (status === 'error') return <ErrorState message={error} onRetry={boot} />;

  const qs = data.questions || [];
  const q = qs[idx];
  if (!q) return <div className="card">No questions in this assessment.</div>;
  const qid = q._id.toString();
  const ans = answers[qid] || {};
  const answered = qs.filter((x) => {
    const a = answers[x._id.toString()] || {};
    return a.selectedOption !== null || a.boolAnswer !== null || (a.textAnswer || '').trim();
  }).length;

  const mm = left !== null ? `${String(Math.floor(left / 60)).padStart(2, '0')}:${String(left % 60).padStart(2, '0')}` : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <h2 className="font-bold">{data.assessment?.title}</h2>
        {mm && <span className={`rounded-full px-3 py-1 font-mono font-bold ${left < 300 ? 'bg-red-100 text-red-700' : 'bg-slate-100'}`}>⏱ {mm}</span>}
        <span className="text-sm text-slate-500">{answered}/{qs.length} answered</span>
        <span className="text-xs text-slate-400">{saving}</span>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {qs.map((x, i) => {
          const a = answers[x._id.toString()] || {};
          const done = a.selectedOption !== null || a.boolAnswer !== null || (a.textAnswer || '').trim();
          return (
            <button key={x._id} onClick={() => setIdx(i)} className={`h-8 w-8 rounded-lg text-sm font-bold ${i === idx ? 'bg-brand-600 text-white' : done ? 'bg-green-100 text-green-700' : 'bg-slate-100'}`}>{i + 1}</button>
          );
        })}
      </div>

      <div className="card space-y-3">
        <p className="text-xs text-slate-500">Q{idx + 1}/{qs.length} · {q.marks} mark(s) · {q.type}</p>
        <p className="font-semibold">{q.text}</p>
        {q.type === 'mcq' && (
          <div className="grid gap-2">
            {q.options.map((op, oi) => (
              <button key={oi} onClick={() => set(qid, { selectedOption: oi })} className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ${ans.selectedOption === oi ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-200'}`}>
                {String.fromCharCode(65 + oi)}. {op}
              </button>
            ))}
          </div>
        )}
        {q.type === 'truefalse' && (
          <div className="flex gap-2">
            {[true, false].map((b) => (
              <button key={String(b)} onClick={() => set(qid, { boolAnswer: b })} className={`rounded-xl px-4 py-2 text-sm font-semibold ring-1 ${ans.boolAnswer === b ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-200'}`}>
                {b ? 'True' : 'False'}
              </button>
            ))}
          </div>
        )}
        {q.type === 'short' && (
          <textarea className="input" rows="4" value={ans.textAnswer || ''} onChange={(e) => set(qid, { textAnswer: e.target.value })} placeholder="Write your answer… (graded by your educator)" />
        )}
        <div className="flex justify-between">
          <button className="btn-ghost" disabled={idx === 0} onClick={() => setIdx(idx - 1)}>← Prev</button>
          {idx < qs.length - 1 ? (
            <button className="btn-primary" onClick={() => setIdx(idx + 1)}>Next →</button>
          ) : (
            <button className="btn-primary" onClick={() => handleSubmit(false)}>Submit ✓</button>
          )}
        </div>
      </div>
      <Link to="/assessments" className="btn-ghost text-sm">← Leave (autosaved — resume from the list)</Link>
    </div>
  );
}
