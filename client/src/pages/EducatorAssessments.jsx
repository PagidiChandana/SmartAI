import { useEffect, useState } from 'react';
import {
  listOwned, createAssessment, patchAssessment, setAssessmentStatus,
  setAssignees, addQuestion, deleteQuestion,
  reviewQuestion, draftQuestions, gradingQueue, gradeShort, assessmentAnalytics,
  ownerQuestions,
} from '../api/assessments';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';

const blank = { title: '', subject: '', topic: '', kind: 'test', difficulty: 'beginner', durationMin: 30, deadline: '', maxAttempts: 1, releaseMode: 'after-deadline' };

export default function EducatorAssessments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(blank);
  const [msg, setMsg] = useState('');
  const [openId, setOpenId] = useState(null);

  const load = async () => {
    try {
      const res = await listOwned();
      setItems(res.data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const create = async (e) => {
    e.preventDefault();
    try {
      const res = await createAssessment({ ...form, durationMin: Number(form.durationMin), maxAttempts: Number(form.maxAttempts), deadline: form.deadline || undefined });
      setForm(blank);
      setMsg('');
      load();
      setOpenId(res.data._id);
    } catch (err) {
      setMsg(getApiMessage(err, 'Create failed'));
    }
  };

  if (loading) return <Loading label="Loading studio…" />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold">Assessment studio</h2>
        <p className="text-sm text-slate-500">Draft → add questions (or AI-draft + review) → publish → grade → analyze.</p>
      </div>

      <form onSubmit={create} className="card grid gap-2 sm:grid-cols-2">
        <input className="input sm:col-span-2" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title — e.g. Physics Mid-term" required />
        <input className="input" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Subject" required />
        <input className="input" value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Topic (optional)" />
        <select className="input" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="test">Timed test</option>
          <option value="assignment">Assignment</option>
        </select>
        <select className="input" value={form.difficulty} onChange={(e) => setForm({ ...form, difficulty: e.target.value })}>
          <option value="beginner">beginner</option>
          <option value="intermediate">intermediate</option>
          <option value="advanced">advanced</option>
        </select>
        <input className="input" type="number" min="0" max="600" value={form.durationMin} onChange={(e) => setForm({ ...form, durationMin: e.target.value })} title="Duration minutes (0 = untimed)" />
        <input className="input" type="date" value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} title="Deadline" />
        <input className="input" type="number" min="1" max="10" value={form.maxAttempts} onChange={(e) => setForm({ ...form, maxAttempts: e.target.value })} title="Max attempts" />
        <select className="input" value={form.releaseMode} onChange={(e) => setForm({ ...form, releaseMode: e.target.value })} title="Answer release">
          <option value="immediate">Release immediately</option>
          <option value="after-deadline">Release after deadline</option>
          <option value="manual">Release manually</option>
          <option value="never">Never release answers</option>
        </select>
        {msg && <p className="text-sm text-red-600 sm:col-span-2">{msg}</p>}
        <button className="btn-primary sm:col-span-2">Create draft</button>
      </form>

      {items.length === 0 ? (
        <Empty title="No assessments yet" hint="Create your first draft above." />
      ) : (
        items.map((a) => (
          <AssessmentRow key={a._id} a={a} open={openId === a._id} onToggle={() => setOpenId(openId === a._id ? null : a._id)} refresh={load} />
        ))
      )}
    </div>
  );
}

function AssessmentRow({ a, open, onToggle, refresh }) {
  const [tab, setTab] = useState('questions');
  const [msg, setMsg] = useState('');
  const [queue, setQueue] = useState(null);
  const [stats, setStats] = useState(null);
  const [emails, setEmails] = useState('');
  const [draft, setDraft] = useState({ topic: '', count: 5, resourceId: '' });
  const [newQ, setNewQ] = useState({ type: 'mcq', text: '', options: '', correctOption: 0, correctBool: true, modelAnswer: '', explanation: '', marks: 1 });

  const err = (e, fb) => setMsg(getApiMessage(e, fb));

  const doStatus = async (status) => {
    try {
      await setAssessmentStatus(a._id, status);
      setMsg('');
      refresh();
    } catch (e) {
      err(e, 'Status change failed');
    }
  };

  const addQ = async (e) => {
    e.preventDefault();
    try {
      await addQuestion(a._id, {
        ...newQ,
        options: newQ.options.split('\n').map((o) => o.trim()).filter(Boolean),
        correctOption: Number(newQ.correctOption),
        marks: Number(newQ.marks),
      });
      setNewQ({ type: 'mcq', text: '', options: '', correctOption: 0, correctBool: true, modelAnswer: '', explanation: '', marks: 1 });
      setQs(null);
      refresh();
    } catch (e) {
      err(e, 'Add failed');
    }
  };

  const doDraft = async () => {
    try {
      setMsg('Drafting with AI… (honest 503 if AI is unavailable)');
      const res = await draftQuestions(a._id, { topic: draft.topic || undefined, count: Number(draft.count), resourceId: draft.resourceId || undefined });
      setMsg(res.message);
      setQs(null);
      refresh();
    } catch (e) {
      err(e, 'Draft failed');
    }
  };

  return (
    <div className="card space-y-2">
      <button className="flex w-full flex-wrap items-center gap-2 text-left" onClick={onToggle}>
        <b>{a.title}</b>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold capitalize">{a.status}</span>
        <span className="text-xs text-slate-500">{a.subject} · {a.questionCount}Q · {a.totalMarks} marks · {a.attemptCount} attempts{a.needsGrading > 0 && ` · ⏳ ${a.needsGrading} to grade`}</span>
      </button>
      {msg && <p className="text-sm text-slate-700">{msg}</p>}
      {open && (
        <div className="space-y-3 border-t border-slate-100 pt-3">
          <div className="flex flex-wrap gap-1.5">
            {['questions', 'ai-draft', 'assign', 'grading', 'analytics'].map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`rounded-full px-3 py-1 text-xs font-semibold ${tab === t ? 'bg-brand-600 text-white' : 'bg-slate-100'}`}>{t}</button>
            ))}
            <span className="ml-auto flex gap-1.5">
              {a.status === 'draft' && <button className="btn-primary px-3 py-1 text-xs" onClick={() => doStatus('published')}>Publish</button>}
              {a.status === 'published' && <button className="btn-ghost px-3 py-1 text-xs" onClick={() => doStatus('closed')}>Close</button>}
              {a.status !== 'archived' && <button className="btn-ghost px-3 py-1 text-xs" onClick={() => doStatus('archived')}>Archive</button>}
              {(a.status === 'closed' || a.status === 'archived') && <button className="btn-ghost px-3 py-1 text-xs" onClick={() => doStatus('draft')}>Back to draft</button>}
            </span>
          </div>

          {tab === 'questions' && <QuestionsTab aid={a._id} refresh={refresh} />}
          {tab === 'questions' && (
            <form onSubmit={addQ} className="grid gap-2 rounded-xl bg-slate-50 p-3">
              <div className="flex gap-2">
                <select className="input w-auto" value={newQ.type} onChange={(e) => setNewQ({ ...newQ, type: e.target.value })}>
                  <option value="mcq">MCQ</option>
                  <option value="truefalse">True/False</option>
                  <option value="short">Short answer</option>
                </select>
                <input className="input" type="number" min="0.5" max="100" step="0.5" value={newQ.marks} onChange={(e) => setNewQ({ ...newQ, marks: e.target.value })} title="Marks" />
              </div>
              <input className="input" value={newQ.text} onChange={(e) => setNewQ({ ...newQ, text: e.target.value })} placeholder="Question text" required />
              {newQ.type === 'mcq' && (
                <>
                  <textarea className="input" rows="2" value={newQ.options} onChange={(e) => setNewQ({ ...newQ, options: e.target.value })} placeholder="Options, one per line" />
                  <input className="input" type="number" min="0" value={newQ.correctOption} onChange={(e) => setNewQ({ ...newQ, correctOption: e.target.value })} title="Correct option index (0-based)" />
                </>
              )}
              {newQ.type === 'truefalse' && (
                <select className="input w-auto" value={String(newQ.correctBool)} onChange={(e) => setNewQ({ ...newQ, correctBool: e.target.value === 'true' })}>
                  <option value="true">True</option>
                  <option value="false">False</option>
                </select>
              )}
              {newQ.type === 'short' && <input className="input" value={newQ.modelAnswer} onChange={(e) => setNewQ({ ...newQ, modelAnswer: e.target.value })} placeholder="Model answer (for grading reference)" />}
              <input className="input" value={newQ.explanation} onChange={(e) => setNewQ({ ...newQ, explanation: e.target.value })} placeholder="Explanation (shown after release)" />
              <button className="btn-primary w-fit">Add question</button>
            </form>
          )}

          {tab === 'ai-draft' && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-600">AI drafts <b>unreviewed</b> questions. Publishing stays blocked until you approve each one. If AI is unavailable you get an honest error — never fake questions.</p>
              <div className="flex flex-wrap gap-2">
                <input className="input w-auto" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="Topic" />
                <input className="input w-24" type="number" min="1" max="10" value={draft.count} onChange={(e) => setDraft({ ...draft, count: e.target.value })} title="Count" />
                <input className="input" value={draft.resourceId} onChange={(e) => setDraft({ ...draft, resourceId: e.target.value })} placeholder="Source resource ID (optional)" />
                <button className="btn-primary" onClick={doDraft}>Draft with AI</button>
              </div>
              <p className="text-xs text-slate-500">Drafts appear in the Questions tab flagged amber — approve or reject each one there.</p>
            </div>
          )}

          {tab === 'assign' && (
            <div className="space-y-2 rounded-xl bg-slate-50 p-3">
              <p className="text-sm text-slate-600">Assign to specific students by email (switches visibility to selected), or keep open to all students.</p>
              <div className="flex gap-2">
                <input className="input" value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="student1@mail.com, student2@mail.com" />
                <button className="btn-primary" onClick={async () => { try { await setAssignees(a._id, emails.split(',').map((s) => s.trim()).filter(Boolean)); setMsg('Assigned ✓'); refresh(); } catch (e) { err(e, 'Assign failed'); } }}>Assign</button>
              </div>
              <button className="btn-ghost text-sm" onClick={async () => { try { await patchAssessment(a._id, { visibility: 'all' }); setMsg('Opened to all students ✓'); refresh(); } catch (e) { err(e, 'Update failed'); } }}>Open to all (now: <b>{a.visibility}</b>)</button>
            </div>
          )}

          {tab === 'grading' && <GradingTab aid={a._id} queue={queue} setQueue={setQueue} />}
          {tab === 'analytics' && <AnalyticsTab aid={a._id} stats={stats} setStats={setStats} />}
        </div>
      )}
    </div>
  );
}

function QuestionsTab({ aid, refresh }) {
  const [qs, setQs] = useState(null);
  const [msg, setMsg] = useState('');
  const load = async () => {
    try {
      const res = await ownerQuestions(aid);
      setQs(res.data);
    } catch (e) {
      setMsg(getApiMessage(e, 'Could not load questions'));
    }
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aid]);
  const review = async (qid, approved) => {
    try {
      await reviewQuestion(aid, qid, { approved });
      load();
      refresh();
    } catch (e) {
      setMsg(getApiMessage(e, 'Review failed'));
    }
  };
  const remove = async (qid) => {
    if (!confirm('Delete this question?')) return;
    try {
      await deleteQuestion(aid, qid);
      load();
      refresh();
    } catch (e) {
      setMsg(getApiMessage(e, 'Delete failed'));
    }
  };
  if (!qs) return <p className="text-sm text-slate-500">{msg || 'Loading questions…'}</p>;
  if (qs.length === 0) return <p className="text-sm text-slate-500">No questions yet — add manually above or draft with AI.</p>;
  return (
    <div className="space-y-2">
      {msg && <p className="text-sm text-red-600">{msg}</p>}
      {qs.map((q, i) => (
        <div key={q._id} className={`rounded-xl p-2 text-sm ring-1 ${q.aiGenerated && !q.reviewed ? 'bg-amber-50 ring-amber-300' : 'bg-slate-50 ring-slate-200'}`}>
          <p><b>Q{i + 1} [{q.type}]</b> {q.text} <span className="text-slate-500">({q.marks}m)</span></p>
          {q.type === 'mcq' && <p className="text-xs text-slate-500">Options: {q.options.join(' | ')} → correct: <b>{q.options[q.correctOption]}</b></p>}
          {q.type === 'truefalse' && <p className="text-xs text-slate-500">Correct: <b>{String(q.correctBool)}</b></p>}
          {q.type === 'short' && <p className="text-xs text-slate-500">Model: {q.modelAnswer || '—'}</p>}
          {q.aiGenerated && !q.reviewed ? (
            <div className="mt-1 flex items-center gap-2">
              <span className="text-xs font-bold text-amber-600">AI draft — needs review</span>
              <button className="btn-primary px-3 py-1 text-xs" onClick={() => review(q._id, true)}>Approve</button>
              <button className="btn-ghost px-3 py-1 text-xs text-red-600" onClick={() => review(q._id, false)}>Reject</button>
            </div>
          ) : (
            <button className="btn-ghost px-2 py-0.5 text-xs text-red-600" onClick={() => remove(q._id)}>Delete</button>
          )}
        </div>
      ))}
    </div>
  );
}

function GradingTab({ aid, queue, setQueue }) {
  const [msg, setMsg] = useState('');
  const [marks, setMarks] = useState({});
  useEffect(() => {
    gradingQueue(aid).then((r) => setQueue(r.data)).catch(() => setQueue([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aid]);
  if (!queue) return <Loading label="Loading queue…" />;
  if (queue.length === 0) return <p className="text-sm text-green-700">Nothing awaiting manual grading 🎉</p>;
  const grade = async (attemptId, qid, max) => {
    const m = Number(marks[`${attemptId}-${qid}`]);
    if (!Number.isFinite(m) || m < 0 || m > max) {
      setMsg(`Marks must be 0-${max}`);
      return;
    }
    try {
      await gradeShort(attemptId, qid, { marks: m });
      setMsg('Graded ✓');
      gradingQueue(aid).then((r) => setQueue(r.data));
    } catch (e) {
      setMsg(getApiMessage(e, 'Grading failed'));
    }
  };
  return (
    <div className="space-y-2">
      {msg && <p className="text-sm">{msg}</p>}
      {queue.map((t) => (
        <div key={t._id} className="rounded-xl bg-slate-50 p-2 text-sm">
          <p><b>{t.user?.name}</b> ({t.user?.email}) — attempt {t.attemptNo} — score so far {t.score}</p>
          {(t.pending || []).map((a, i) => (
            <div key={i} className="mt-1 flex flex-wrap items-center gap-2">
              <span className="flex-1">Q: “{a.qtext || t.answers.find((x) => x.question === a.question)?.textAnswer || a.textAnswer || '—'}” <span className="text-slate-500">(max {a.max})</span></span>
              <input className="input w-24" type="number" placeholder="marks" value={marks[`${t._id}-${a.question}`] || ''} onChange={(e) => setMarks({ ...marks, [`${t._id}-${a.question}`]: e.target.value })} />
              <button className="btn-primary px-3 py-1 text-xs" onClick={() => grade(t._id, a.question, a.max)}>Save</button>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab({ aid, stats, setStats }) {
  useEffect(() => {
    assessmentAnalytics(aid).then((r) => setStats(r.data)).catch(() => setStats({ error: true }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aid]);
  if (!stats) return <Loading label="Computing analytics…" />;
  if (stats.error) return <p className="text-sm text-red-600">Analytics unavailable.</p>;
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2">
      <div className="rounded-xl bg-slate-50 p-2">Attempts: <b>{stats.attempts}</b> · Avg: <b>{stats.avgScore}/{stats.maxScore}</b> · Accuracy: <b>{stats.avgAccuracy}%</b> · Avg time: <b>{Math.round(stats.avgTimeSec / 60)} min</b></div>
      <div className="rounded-xl bg-slate-50 p-2">
        <b>By topic</b>
        {stats.perTopic.map((t) => <p key={t.topic}>{t.topic}: {t.accuracy}% acc · {t.avgScore}% score</p>)}
      </div>
      <div className="rounded-xl bg-slate-50 p-2 sm:col-span-2">
        <b>Per question</b>
        {stats.perQuestion.map((q) => <p key={q.questionId}>[{q.type}] {q.text} — {q.accuracy}% ({q.answered} answered)</p>)}
      </div>
    </div>
  );
}
