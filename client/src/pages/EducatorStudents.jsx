import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { educatorStudents, educatorStudentDetail, educatorClassSummary, sendStudentNote } from '../api/educator';
import { listOwned, addAssignee } from '../api/assessments';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';

export function EducatorStudents() {
  const [students, setStudents] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [note, setNote] = useState({ title: '', body: '' });
  const [msg, setMsg] = useState('');
  const [assessments, setAssessments] = useState([]);
  const [linkForm, setLinkForm] = useState({ assessmentId: '', email: '' });
  const [linkMsg, setLinkMsg] = useState('');

  const loadStudents = async () => {
    try {
      const res = await educatorStudents();
      setStudents(res.data);
    } catch {
      setStudents([]);
    }
  };

  useEffect(() => {
    loadStudents();
    listOwned().then((r) => {
      const list = r.data || [];
      setAssessments(list);
      if (list.length > 0) setLinkForm((f) => ({ ...f, assessmentId: f.assessmentId || list[0]._id }));
    }).catch(() => {});
  }, []);

  const open = async (id) => {
    setSelected(id);
    setDetail(null);
    try {
      const res = await educatorStudentDetail(id);
      setDetail(res.data);
    } catch (err) {
      setMsg(getApiMessage(err, 'Could not load progress'));
    }
  };

  const send = async (e) => {
    e.preventDefault();
    try {
      await sendStudentNote({ studentId: selected, ...note });
      setNote({ title: '', body: '' });
      setMsg('Feedback sent ✓ — it appears in the student inbox');
    } catch (err) {
      setMsg(getApiMessage(err, 'Send failed'));
    }
  };

  const linkStudent = async (e) => {
    e.preventDefault();
    if (!linkForm.assessmentId || !linkForm.email.trim()) {
      setLinkMsg('Pick an assessment and enter the student email.');
      return;
    }
    try {
      const res = await addAssignee(linkForm.assessmentId, linkForm.email.trim());
      setLinkMsg(res.message || 'Student linked ✓');
      setLinkForm((f) => ({ ...f, email: '' }));
      loadStudents();
    } catch (err) {
      setLinkMsg(getApiMessage(err, 'Could not link student'));
    }
  };

  if (students === null) return <Loading label="Loading students…" />;

  return (
    <div className="grid gap-4 md:grid-cols-[280px_1fr]">
      <div className="card h-fit">
        <h2 className="font-bold">My students ({students.length})</h2>
        <p className="text-xs text-slate-400">Students linked to your assessments — via attempts or explicit linking below.</p>
        <form onSubmit={linkStudent} className="mt-3 space-y-2 rounded-xl bg-slate-50 p-3">
          <p className="text-sm font-semibold">Link a student ➕</p>
          {assessments.length === 0 ? (
            <p className="text-xs text-slate-500">Create an assessment first, then link students to it. <Link to="/educator/assessments" className="font-semibold text-brand-600">Go to Tests →</Link></p>
          ) : (
            <>
              <select className="input text-sm" value={linkForm.assessmentId} onChange={(e) => setLinkForm({ ...linkForm, assessmentId: e.target.value })} aria-label="Assessment">
                {assessments.map((a) => <option key={a._id} value={a._id}>{a.title}</option>)}
              </select>
              <input className="input text-sm" type="email" value={linkForm.email} onChange={(e) => setLinkForm({ ...linkForm, email: e.target.value })} placeholder="student email…" aria-label="Student email" />
              <button className="btn-primary w-full text-sm">Link student</button>
            </>
          )}
          {linkMsg && <p className="text-xs text-slate-600">{linkMsg}</p>}
        </form>
        {students.length === 0 ? (
          <div className="mt-2"><Empty title="No students yet" hint="Link a student above, or they appear here after attempting your assessments." /></div>
        ) : (
          <ul className="mt-2 space-y-1">
            {students.map((s) => (
              <li key={s._id}>
                <button onClick={() => open(s._id)} className={`w-full rounded-xl px-3 py-2 text-left text-sm ${selected === s._id ? 'bg-brand-50 ring-1 ring-brand-500/30' : 'hover:bg-slate-50'}`}>
                  <b>{s.name}</b>
                  <span className="block text-xs text-slate-500">{s.attempts} attempts · {s.avgAccuracy === null ? 'no scores' : `${s.avgAccuracy}% avg`}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card min-h-[40vh]">
        {!selected ? (
          <p className="text-sm text-slate-500">Select a student to see progress and send feedback.</p>
        ) : !detail ? (
          <Loading label="Loading progress…" />
        ) : (
          <div className="space-y-3">
            <h3 className="font-bold">{detail.student.name} <span className="text-sm font-normal text-slate-500">{detail.student.email}</span></h3>
            <div>
              <p className="text-sm font-semibold">Weak topics 🎯</p>
              {detail.weakTopics.length === 0 ? <p className="text-sm text-slate-500">None detected.</p> : (
                <ul className="text-sm">{detail.weakTopics.map((w, i) => <li key={i}>{w.topic} ({w.subject}) — {w.accuracy}% over {w.answered}</li>)}</ul>
              )}
            </div>
            <div>
              <p className="text-sm font-semibold">Recent attempts</p>
              {detail.attempts.length === 0 ? <p className="text-sm text-slate-500">No attempts yet.</p> : (
                <ul className="text-sm">{detail.attempts.slice(0, 5).map((t) => <li key={t.id}>{t.assessment?.title} — {t.score}/{t.maxScore} ({t.accuracy}%)</li>)}</ul>
              )}
            </div>
            <form onSubmit={send} className="space-y-2 rounded-xl bg-slate-50 p-3">
              <p className="text-sm font-semibold">Send feedback / recommendation</p>
              <input className="input" value={note.title} onChange={(e) => setNote({ ...note, title: e.target.value })} placeholder="Title — e.g. Focus on algebra this week" required />
              <textarea className="input" rows="2" value={note.body} onChange={(e) => setNote({ ...note, body: e.target.value })} placeholder="Details and next steps…" />
              <button className="btn-primary text-sm">Send →</button>
            </form>
            {msg && <p className="text-sm text-slate-600">{msg}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

export function ClassSummary() {
  const [data, setData] = useState(null);
  useEffect(() => {
    educatorClassSummary().then((r) => setData(r.data)).catch(() => setData({ error: true }));
  }, []);
  if (!data) return <Loading label="Computing class summary…" />;
  if (data.error) return <div className="card text-sm text-red-600">Summary unavailable.</div>;
  return (
    <div className="space-y-4">
      <div className="card"><h2 className="text-xl font-bold">Class performance</h2></div>
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="card"><p className="text-sm text-slate-500">Assessments</p><p className="text-2xl font-bold">{data.assessments}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Attempts</p><p className="text-2xl font-bold">{data.attempts}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Students active</p><p className="text-2xl font-bold">{data.students}</p></div>
        <div className="card"><p className="text-sm text-slate-500">Avg accuracy</p><p className="text-2xl font-bold">{data.avgAccuracy === null ? '—' : `${data.avgAccuracy}%`}</p></div>
      </div>
      <div className="card">
        <h3 className="font-bold">Topics needing support 🎯</h3>
        {data.topicsNeedingSupport.length === 0 ? <p className="text-sm text-slate-500">Not enough evidence yet (needs 2+ answered per topic).</p> : (
          <ul className="mt-2 space-y-1 text-sm">{data.topicsNeedingSupport.map((t) => <li key={t.topic}><b>{t.topic}</b> — {t.accuracy}% class accuracy ({t.answered} answered)</li>)}</ul>
        )}
      </div>
      <div className="card">
        <h3 className="font-bold">Per assessment</h3>
        <ul className="mt-2 space-y-1 text-sm">{data.perAssessment.map((a) => <li key={a.id}>{a.title} ({a.status}) — {a.attempts} attempts · {a.avgAccuracy === null ? 'no scores' : `${a.avgAccuracy}%`}</li>)}</ul>
      </div>
    </div>
  );
}
