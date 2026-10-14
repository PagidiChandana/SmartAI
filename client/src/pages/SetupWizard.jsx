import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  getProfile, saveProfile, listSubjects, createSubject, deleteSubject,
  listTopics, createTopic, bulkTopics, patchTopic,
  uploadSyllabus, listGoals, createGoal, deleteGoal,
  startDiagnostic, submitDiagnostic, listDiagnostics, getChecklist,
  ACADEMIC_LEVELS, LEARNING_STYLES, EXAM_TYPES,
} from '../api/learning';
import { getApiMessage } from '../utils/validation';
import Loading from '../components/Loading';
import Empty from '../components/Empty';

const STEPS = [
  { key: 'profile', label: 'Profile' },
  { key: 'subjects', label: 'Subjects' },
  { key: 'syllabus', label: 'Syllabus' },
  { key: 'goals', label: 'Goals' },
  { key: 'diagnostic', label: 'Diagnostic' },
  { key: 'review', label: 'Review' },
];

const STATUS_COLOR = { 'not-started': 'bg-slate-100 text-slate-600', 'in-progress': 'bg-amber-100 text-amber-700', completed: 'bg-green-100 text-green-700' };

export default function SetupWizard() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const initial = STEPS.findIndex((s) => s.key === params.get('step'));
  const [stepIdx, setStepIdx] = useState(initial >= 0 ? initial : 0);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [profile, setProfile] = useState({ academicLevel: '', subjects: '', learningStyle: '', examType: '', dailyStudyHours: '' });
  const [subjects, setSubjects] = useState([]);
  const [newSubject, setNewSubject] = useState('');
  const [topics, setTopics] = useState([]);
  const [topicSubject, setTopicSubject] = useState('');
  const [manualTopic, setManualTopic] = useState('');
  const [bulkText, setBulkText] = useState('');
  const [uploadResult, setUploadResult] = useState(null);
  const [goals, setGoals] = useState([]);
  const [goalForm, setGoalForm] = useState({ title: '', subject: '', targetDate: '', dailyStudyHours: '' });
  const [diagSubject, setDiagSubject] = useState('');
  const [diag, setDiag] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [diags, setDiags] = useState([]);
  const [checklist, setChecklist] = useState(null);

  const step = STEPS[stepIdx].key;

  const refresh = useCallback(async () => {
    try {
      const [p, s, g, d, cl] = await Promise.all([
        getProfile().catch(() => ({ data: null })),
        listSubjects().catch(() => ({ data: [] })),
        listGoals().catch(() => ({ data: [] })),
        listDiagnostics().catch(() => ({ data: [] })),
        getChecklist().catch(() => ({ data: null })),
      ]);
      if (p.data) {
        setProfile({
          academicLevel: p.data.academicLevel || '',
          subjects: (p.data.subjects || []).join(', '),
          learningStyle: p.data.learningStyle || '',
          examType: p.data.examType || '',
          dailyStudyHours: p.data.dailyStudyHours || '',
        });
      }
      setSubjects(s.data || []);
      setGoals(g.data || []);
      setDiags(d.data || []);
      setChecklist(cl.data || null);
      if (s.data?.length && !topicSubject) setTopicSubject(s.data[0]._id);
      if (s.data?.length && !diagSubject) setDiagSubject(s.data[0]._id);
      if (s.data?.length) {
        const t = await listTopics({ subject: (topicSubject || s.data[0]._id) }).catch(() => ({ data: [] }));
        setTopics(t.data || []);
      }
    } finally {
      setLoading(false);
    }
  }, [topicSubject, diagSubject]);

  useEffect(() => {
    refresh();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (i) => {
    setStepIdx(i);
    setParams({ step: STEPS[i].key });
    setMsg('');
    window.scrollTo(0, 0);
  };

  const saveProfileStep = async (e) => {
    e.preventDefault();
    try {
      await saveProfile({
        academicLevel: profile.academicLevel || undefined,
        subjects: profile.subjects.split(',').map((s) => s.trim()).filter(Boolean),
        learningStyle: profile.learningStyle || undefined,
        examType: profile.examType || undefined,
        dailyStudyHours: profile.dailyStudyHours ? Number(profile.dailyStudyHours) : undefined,
      });
      setMsg('Profile saved ✓');
      await refresh();
      go(stepIdx + 1);
    } catch (err) {
      setMsg(getApiMessage(err, 'Could not save profile'));
    }
  };

  const addSubject = async (e) => {
    e.preventDefault();
    if (!newSubject.trim()) return;
    try {
      await createSubject({ name: newSubject.trim() });
      setNewSubject('');
      await refresh();
    } catch (err) {
      setMsg(getApiMessage(err, 'Could not add subject'));
    }
  };

  const addManualTopic = async (e) => {
    e.preventDefault();
    if (!topicSubject || !manualTopic.trim()) {
      setMsg('Pick a subject and type a topic title');
      return;
    }
    try {
      await createTopic({ subject: topicSubject, title: manualTopic.trim() });
      setManualTopic('');
      const t = await listTopics({ subject: topicSubject });
      setTopics(t.data);
      setMsg('Topic added ✓');
    } catch (err) {
      setMsg(getApiMessage(err, 'Could not add topic'));
    }
  };

  const addBulk = async () => {
    const titles = bulkText.split('\n').map((l) => l.trim()).filter(Boolean);
    if (!topicSubject || titles.length === 0) {
      setMsg('Pick a subject and paste at least one topic per line');
      return;
    }
    try {
      await bulkTopics({ subject: topicSubject, titles });
      setBulkText('');
      const t = await listTopics({ subject: topicSubject });
      setTopics(t.data);
      setMsg(`${titles.length} topics added ✓`);
    } catch (err) {
      setMsg(getApiMessage(err, 'Bulk add failed'));
    }
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!topicSubject) {
      setMsg('Pick a subject first — extracted topics attach to it');
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('subject', topicSubject);
    try {
      setMsg('Extracting syllabus…');
      const res = await uploadSyllabus(fd);
      setUploadResult(res.data);
      const t = await listTopics({ subject: topicSubject });
      setTopics(t.data);
      setMsg(`Extracted ${res.data.totalExtracted} topics ✓`);
    } catch (err) {
      setMsg(getApiMessage(err, 'Upload failed'));
    }
  };

  const addGoal = async (e) => {
    e.preventDefault();
    try {
      await createGoal({
        title: goalForm.title,
        subject: goalForm.subject || undefined,
        targetDate: goalForm.targetDate,
        dailyStudyHours: goalForm.dailyStudyHours ? Number(goalForm.dailyStudyHours) : undefined,
      });
      setGoalForm({ title: '', subject: '', targetDate: '', dailyStudyHours: '' });
      await refresh();
      setMsg('Goal added ✓');
    } catch (err) {
      setMsg(getApiMessage(err, 'Could not add goal'));
    }
  };

  const beginDiag = async () => {
    if (!diagSubject) {
      setMsg('Create a subject first');
      return;
    }
    try {
      const res = await startDiagnostic({ subjectId: diagSubject });
      setDiag(res.data);
      setAnswers(new Array(res.data.totalQuestions).fill(null));
      setMsg('');
    } catch (err) {
      setMsg(getApiMessage(err, 'Could not start diagnostic'));
    }
  };

  const submitDiag = async () => {
    try {
      const res = await submitDiagnostic(diag._id, answers);
      setDiag(res.data);
      await refresh();
      setMsg(`Scored ${res.data.scorePct}% — ${res.data.level} ✓`);
    } catch (err) {
      setMsg(getApiMessage(err, 'Submit failed'));
    }
  };

  if (loading) return <Loading label="Loading your setup…" />;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="card">
        <h2 className="text-xl font-bold">Learning setup</h2>
        <div className="mt-3 flex items-center gap-1">
          {STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => go(i)}
              className={`h-2 flex-1 rounded-full ${i <= stepIdx ? 'bg-brand-600' : 'bg-slate-200'}`}
              title={s.label}
            />
          ))}
        </div>
        <div className="mt-2 flex justify-between text-xs text-slate-500">
          {STEPS.map((s, i) => (
            <button key={s.key} onClick={() => go(i)} className={i === stepIdx ? 'font-bold text-brand-700' : ''}>
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {msg && <p className="card py-3 text-sm text-slate-700">{msg}</p>}

      {step === 'profile' && (
        <form onSubmit={saveProfileStep} className="card space-y-3">
          <h3 className="font-semibold">1. Your learning profile</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Academic level</label>
              <select className="input" value={profile.academicLevel} onChange={(e) => setProfile({ ...profile, academicLevel: e.target.value })}>
                <option value="">Select…</option>
                {ACADEMIC_LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Exam type</label>
              <select className="input" value={profile.examType} onChange={(e) => setProfile({ ...profile, examType: e.target.value })}>
                <option value="">Select…</option>
                {EXAM_TYPES.map((l) => <option key={l} value={l}>{l.toUpperCase()}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Learning style</label>
              <select className="input" value={profile.learningStyle} onChange={(e) => setProfile({ ...profile, learningStyle: e.target.value })}>
                <option value="">Select…</option>
                {LEARNING_STYLES.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Daily study hours</label>
              <input className="input" type="number" min="0.5" max="16" step="0.5" value={profile.dailyStudyHours} onChange={(e) => setProfile({ ...profile, dailyStudyHours: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Subjects (comma separated)</label>
            <input className="input" value={profile.subjects} onChange={(e) => setProfile({ ...profile, subjects: e.target.value })} placeholder="Physics, Maths, English" />
          </div>
          <button className="btn-primary w-full">Save & continue →</button>
        </form>
      )}

      {step === 'subjects' && (
        <div className="card space-y-3">
          <h3 className="font-semibold">2. Manage subjects</h3>
          <form onSubmit={addSubject} className="flex gap-2">
            <input className="input" value={newSubject} onChange={(e) => setNewSubject(e.target.value)} placeholder="e.g. Physics" />
            <button className="btn-primary">Add</button>
          </form>
          {subjects.length === 0 ? (
            <Empty title="No subjects yet" hint="Add your first subject above — e.g. the one for your GATE or board exam." />
          ) : (
            <ul className="space-y-2">
              {subjects.map((s) => (
                <li key={s._id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                  <span><b>{s.name}</b> <span className="text-xs text-slate-500">{s.done || 0}/{s.total || 0} done</span></span>
                  <button className="btn-ghost text-red-600" onClick={async () => { await deleteSubject(s._id); await refresh(); }}>Delete</button>
                </li>
              ))}
            </ul>
          )}
          <button className="btn-primary w-full" onClick={() => go(stepIdx + 1)}>Save & continue →</button>
        </div>
      )}

      {step === 'syllabus' && (
        <div className="space-y-4">
          <div className="card space-y-3">
            <h3 className="font-semibold">3. Syllabus & topics</h3>
            {subjects.length === 0 ? (
              <Empty title="Add a subject first" hint="Go back one step and create a subject — topics attach to it." />
            ) : (
              <>
                <div>
                  <label className="label">Working subject</label>
                  <select className="input" value={topicSubject} onChange={async (e) => { setTopicSubject(e.target.value); const t = await listTopics({ subject: e.target.value }); setTopics(t.data); }}>
                    {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
                  </select>
                </div>
                <form onSubmit={addManualTopic} className="flex gap-2">
                  <input className="input" value={manualTopic} onChange={(e) => setManualTopic(e.target.value)} placeholder="Add a topic manually…" />
                  <button className="btn-primary">Add</button>
                </form>
                <div>
                  <label className="label">Or paste many (one per line)</label>
                  <textarea className="input" rows="3" value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder={'Kinematics\nThermodynamics\nOptics'} />
                  <button className="btn-ghost mt-1" onClick={addBulk}>Add all</button>
                </div>
                <div>
                  <label className="label">Or upload syllabus (PDF / TXT / MD, max 10 MB)</label>
                  <input type="file" accept=".pdf,.txt,.md" onChange={onFile} className="text-sm" />
                  {uploadResult && <p className="mt-1 text-sm text-green-700">Attached {uploadResult.upload.topicsCreated} topics from {uploadResult.upload.originalName}</p>}
                </div>
              </>
            )}
          </div>
          <div className="card">
            <h4 className="font-semibold">Topics ({topics.length})</h4>
            {topics.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">No topics yet — add manually, paste, or upload a syllabus.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {topics.map((t) => (
                  <li key={t._id} className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                    <span className="font-medium">{t.title}</span>
                    {t.section && <span className="text-xs text-slate-400">· {t.section}</span>}
                    <select
                      className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_COLOR[t.status]}`}
                      value={t.status}
                      onChange={async (e) => { await patchTopic(t._id, { status: e.target.value }); const r = await listTopics({ subject: topicSubject }); setTopics(r.data); }}
                    >
                      <option value="not-started">Not Started</option>
                      <option value="in-progress">In Progress</option>
                      <option value="completed">Completed</option>
                    </select>
                    <select className="rounded-full bg-white px-2 py-1 text-xs ring-1 ring-slate-200" value={t.difficulty} onChange={async (e) => { await patchTopic(t._id, { difficulty: e.target.value }); const r = await listTopics({ subject: topicSubject }); setTopics(r.data); }}>
                      <option value="easy">easy</option>
                      <option value="medium">medium</option>
                      <option value="hard">hard</option>
                    </select>
                    <select className="rounded-full bg-white px-2 py-1 text-xs ring-1 ring-slate-200" value={t.confidence} onChange={async (e) => { await patchTopic(t._id, { confidence: Number(e.target.value) }); const r = await listTopics({ subject: topicSubject }); setTopics(r.data); }} title="Confidence 1-5">
                      {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>conf {n}</option>)}
                    </select>
                  </li>
                ))}
              </ul>
            )}
            <button className="btn-primary mt-3 w-full" onClick={() => go(stepIdx + 1)}>Save & continue →</button>
          </div>
        </div>
      )}

      {step === 'goals' && (
        <div className="card space-y-3">
          <h3 className="font-semibold">4. Learning goals</h3>
          <form onSubmit={addGoal} className="grid gap-2 sm:grid-cols-2">
            <input className="input sm:col-span-2" value={goalForm.title} onChange={(e) => setGoalForm({ ...goalForm, title: e.target.value })} placeholder="Goal — e.g. Crack GATE Physics" required />
            <input className="input" value={goalForm.subject} onChange={(e) => setGoalForm({ ...goalForm, subject: e.target.value })} placeholder="Subject (optional)" />
            <input className="input" type="date" value={goalForm.targetDate} onChange={(e) => setGoalForm({ ...goalForm, targetDate: e.target.value })} required />
            <input className="input" type="number" min="0.5" max="16" step="0.5" value={goalForm.dailyStudyHours} onChange={(e) => setGoalForm({ ...goalForm, dailyStudyHours: e.target.value })} placeholder="Hours/day" />
            <button className="btn-primary sm:col-span-2">Add goal</button>
          </form>
          {goals.length === 0 ? (
            <Empty title="No goals yet" hint="Set a goal with a future target date — it powers your study plan." />
          ) : (
            <ul className="space-y-2">
              {goals.map((g) => (
                <li key={g._id} className="flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span><b>{g.title}</b> <span className="text-slate-500">→ {new Date(g.targetDate).toLocaleDateString()}</span></span>
                  <button className="btn-ghost text-red-600" onClick={async () => { await deleteGoal(g._id); await refresh(); }}>Delete</button>
                </li>
              ))}
            </ul>
          )}
          <button className="btn-primary w-full" onClick={() => go(stepIdx + 1)}>Save & continue →</button>
        </div>
      )}

      {step === 'diagnostic' && (
        <div className="card space-y-3">
          <h3 className="font-semibold">5. Diagnostic assessment</h3>
          {diags.filter((d) => d.submitted).length > 0 && (
            <p className="text-sm text-green-700">Completed: {diags.filter((d) => d.submitted).map((d) => `${d.subjectName} (${d.scorePct}% ${d.level})`).join(' · ')}</p>
          )}
          {!diag && (
            <div className="flex gap-2">
              <select className="input" value={diagSubject} onChange={(e) => setDiagSubject(e.target.value)}>
                {subjects.map((s) => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
              <button className="btn-primary" onClick={beginDiag}>Start</button>
            </div>
          )}
          {diag && !diag.submitted && (
            <div className="space-y-3">
              {diag.responses.map((q, i) => (
                <div key={i} className="rounded-xl bg-slate-50 p-3">
                  <p className="text-sm font-medium">{q.question}</p>
                  <div className="mt-2 grid gap-1">
                    {q.options.map((op, oi) => (
                      <button
                        key={oi}
                        onClick={() => setAnswers(answers.map((a, j) => (j === i ? oi : a)))}
                        className={`rounded-lg px-3 py-1.5 text-left text-sm ring-1 ${answers[i] === oi ? 'bg-brand-600 text-white ring-brand-600' : 'bg-white ring-slate-200'}`}
                      >
                        {op}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button className="btn-primary w-full" onClick={submitDiag}>Submit assessment</button>
            </div>
          )}
          {diag?.submitted && (
            <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700 ring-1 ring-green-200">
              Score {diag.scorePct}% · Level <b>{diag.level}</b>
            </div>
          )}
          <button className="btn-primary w-full" onClick={() => go(stepIdx + 1)}>Save & continue →</button>
        </div>
      )}

      {step === 'review' && (
        <div className="card space-y-3">
          <h3 className="font-semibold">6. Review & next action</h3>
          {checklist ? (
            <>
              <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full bg-brand-600" style={{ width: `${checklist.pct}%` }} />
              </div>
              <ul className="space-y-1.5">
                {checklist.steps.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-sm">
                    <span className={s.done ? 'text-green-600' : 'text-slate-300'}>{s.done ? '✓' : '○'}</span>
                    <Link to={`/setup?step=${s.key}`} onClick={() => go(STEPS.findIndex((x) => x.key === s.key))} className="text-brand-700 underline">
                      {s.label}
                    </Link>
                  </li>
                ))}
              </ul>
              {checklist.next ? (
                <p className="text-sm">Recommended next: <b>{checklist.next.label}</b></p>
              ) : (
                <p className="text-sm font-semibold text-green-700">All done — your AI study plan unlocks next 🎉</p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">Checklist unavailable.</p>
          )}
          <button className="btn-primary w-full" onClick={() => navigate('/dashboard/student')}>Finish → Dashboard</button>
        </div>
      )}

      <div className="flex justify-between">
        <button className="btn-ghost" disabled={stepIdx === 0} onClick={() => go(stepIdx - 1)}>← Back</button>
        {stepIdx < STEPS.length - 1 && <button className="btn-ghost" onClick={() => go(stepIdx + 1)}>Skip →</button>}
      </div>
    </div>
  );
}
