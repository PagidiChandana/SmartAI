import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  analyticsOverview, studyTime, scoreTrend, topicMastery,
  adaptiveRecs, applyBoost, aiInsights,
} from '../api/analytics';
import Loading from '../components/Loading';
import Empty from '../components/Empty';
import { getApiMessage } from '../utils/validation';

const COLORS = { strong: '#16a34a', developing: '#d97706', weak: '#dc2626', 'needs-data': '#94a3b8' };
const PIE = ['#3b63f3', '#16a34a', '#94a3b8'];

function ChartCard({ title, hint, children, empty }) {
  return (
    <div className="card">
      <h3 className="font-semibold">{title}</h3>
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
      <div className="mt-2">
        {empty ? <p className="py-6 text-center text-sm text-slate-400">{empty}</p> : children}
      </div>
    </div>
  );
}

const shortDate = (iso) => (iso ? iso.slice(5) : '');

export default function Analytics() {
  const [tab, setTab] = useState('overview');
  const [ov, setOv] = useState(null);
  const [time, setTime] = useState(null);
  const [scores, setScores] = useState([]);
  const [topics, setTopics] = useState(null);
  const [recs, setRecs] = useState(null);
  const [ai, setAi] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([
      analyticsOverview().catch(() => ({ data: null })),
      studyTime(14).catch(() => ({ data: null })),
      scoreTrend(30).catch(() => ({ data: [] })),
      topicMastery().catch(() => ({ data: null })),
      adaptiveRecs().catch(() => ({ data: null })),
    ])
      .then(([o, t, s, m, r]) => {
        setOv(o.data);
        setTime(t.data);
        setScores(s.data || []);
        setTopics(m.data);
        setRecs(r.data);
        setStatus('success');
      })
      .catch((err) => {
        setError(getApiMessage(err, 'Could not load analytics'));
        setStatus('error');
      });
  }, []);

  const loadAi = async () => {
    try {
      setAi({ loading: true });
      const res = await aiInsights();
      setAi(res.data);
    } catch (err) {
      setAi({ error: getApiMessage(err, 'AI insights unavailable — the rule-based list below always works.') });
    }
  };

  const boost = async (topic, subject) => {
    try {
      setNotice('');
      const res = await applyBoost({ topic, subject });
      setNotice(`Added ${res.data.created.length} revision sessions to your active plan ✓`);
    } catch (err) {
      setNotice(getApiMessage(err, 'Could not add sessions'));
    }
  };

  if (status === 'loading') return <Loading label="Crunching your numbers…" />;
  if (status === 'error') return <div className="card text-sm text-red-600">{error}</div>;
  if (!ov) return <Empty title="No analytics yet" hint="Complete study tasks and take assessments — charts appear here." />;

  const taskPie = [
    { name: 'Completed', value: ov.tasks.completed },
    { name: 'Pending', value: Math.max(0, ov.tasks.pending - ov.tasks.overdue) },
    { name: 'Overdue', value: ov.tasks.overdue },
  ].filter((d) => d.value > 0);

  const scoreData = scores.map((s) => ({ ...s, label: `${shortDate(s.date)} ${s.title.slice(0, 14)}` }));

  return (
    <div className="space-y-4">
      <div className="card flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Progress analytics</h2>
          <p className="text-sm text-slate-500">Observed results from your real activity — never fabricated.</p>
        </div>
        <div className="ml-auto flex gap-2">
          {['overview', 'topics', 'adaptive'].map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-full px-4 py-1.5 text-sm font-semibold capitalize ${tab === t ? 'bg-brand-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{t}</button>
          ))}
        </div>
      </div>

      {notice && <p className="card py-3 text-sm">{notice}</p>}

      {tab === 'overview' && (
        <>
          <div className="grid gap-4 sm:grid-cols-4">
            <div className="card"><p className="text-sm text-slate-500">Study time (14d)</p><p className="text-2xl font-bold">{Math.round(ov.studyTime.totalMinutes14d / 60 * 10) / 10}h</p></div>
            <div className="card"><p className="text-sm text-slate-500">Adherence</p><p className="text-2xl font-bold">{ov.tasks.adherence === null ? '—' : `${ov.tasks.adherence}%`}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Overdue tasks</p><p className="text-2xl font-bold">{ov.tasks.overdue}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Revision done</p><p className="text-2xl font-bold">{ov.revision.revisionTasksCompleted} tasks · {ov.revision.gradedAttempts} graded</p></div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Daily study time" hint="Minutes of completed plan tasks per day" empty={time && time.daily.every((d) => d.minutes === 0) ? 'No completed tasks yet — finish a plan task to start the chart.' : null}>
              {time && (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={time.daily.map((d) => ({ ...d, label: shortDate(d.date) }))}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={2} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Bar dataKey="minutes" fill="#3b63f3" name="minutes" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Task completion" hint="Completed vs pending vs overdue">
              {taskPie.length === 0 ? <p className="py-6 text-center text-sm text-slate-400">No plan tasks yet — generate a study plan first.</p> : (
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={taskPie} dataKey="value" nameKey="name" outerRadius={80} label>
                      {taskPie.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Score trend" hint="Submitted attempts over time" empty={scoreData.length === 0 ? 'Take an assessment — your scores will trend here.' : null}>
              {scoreData.length > 0 && (
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={scoreData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} interval={1} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="scorePct" stroke="#16a34a" name="score %" dot />
                    <Line type="monotone" dataKey="accuracy" stroke="#3b63f3" name="accuracy %" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Syllabus completion" hint="Topics completed per subject" empty={ov.syllabus.length === 0 ? 'Add subjects and topics in Learning Setup.' : null}>
              <div className="space-y-2">
                {ov.syllabus.map((s) => (
                  <div key={s.subject}>
                    <div className="flex justify-between text-sm"><span>{s.subject}</span><span className="text-slate-500">{s.completed}/{s.total} · {s.pct}%</span></div>
                    <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-full rounded-full bg-brand-600" style={{ width: `${s.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          <ChartCard title="Weekly study time" hint="Aggregated Monday-start weeks" empty={time && time.weekly.every((w) => w.minutes === 0) ? 'Nothing logged yet.' : null}>
            {time && (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={time.weekly.map((w) => ({ ...w, label: `w/c ${shortDate(w.week)}` }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="minutes" fill="#7c3aed" name="minutes" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </>
      )}

      {tab === 'topics' && topics && (
        <div className="space-y-3">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="card"><p className="text-sm text-slate-500">Strong 💪</p><p className="text-2xl font-bold text-green-600">{topics.strong.length}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Weak 🎯</p><p className="text-2xl font-bold text-red-600">{topics.weak.length}</p></div>
            <div className="card"><p className="text-sm text-slate-500">Tracked</p><p className="text-2xl font-bold">{topics.topics.length}</p></div>
          </div>
          {topics.topics.length === 0 && <Empty title="No topic data" hint="Topics appear once you add syllabus topics or take assessments." />}
          {topics.topics.map((t, i) => (
            <div key={i} className="card flex flex-wrap items-center gap-3">
              <span className="rounded-full px-2 py-0.5 text-xs font-bold capitalize text-white" style={{ background: COLORS[t.status] }}>{t.status}</span>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{t.topic} <span className="text-sm font-normal text-slate-500">· {t.subject}</span></p>
                <p className="text-xs text-slate-500">
                  {t.answered > 0 ? `${t.accuracy}% over ${t.answered} assessed · trend: ${t.trend}` : 'No assessment evidence yet'}
                  {t.repeatedMistakes.length > 0 && ` · ⚠️ same question missed ${t.repeatedMistakes[0].timesWrong}×`}
                  {t.confidenceNote && ` · ${t.confidenceNote}`}
                </p>
              </div>
              {t.status === 'weak' && <button className="btn-primary px-3 py-1 text-xs" onClick={() => boost(t.topic, t.subject)}>+ Revise</button>}
            </div>
          ))}
        </div>
      )}

      {tab === 'adaptive' && (
        <div className="space-y-3">
          <div className="card">
            <h3 className="font-semibold">How this works</h3>
            <p className="text-sm text-slate-500">Rule-based recommendations from observed evidence (scores, mistakes, confidences). Each card states its reasons and evidence size — predictions are labeled as suggestions, never as measured mastery.</p>
          </div>
          {!recs || recs.items.length === 0 ? (
            <Empty title="No weak areas detected 🎉" hint="Keep attempting assessments — targeted revision appears here when evidence shows a gap." />
          ) : (
            recs.items.map((r, i) => (
              <div key={i} className="card space-y-2">
                <p className="font-bold">🎯 {r.topic} <span className="text-sm font-normal text-slate-500">· {r.subject} · observed accuracy {r.observed.accuracy}% (n={r.observed.answered})</span></p>
                <ul className="rounded-xl bg-brand-50 p-2 text-sm text-brand-800 ring-1 ring-brand-500/20">
                  {r.reasons.map((reason, j) => <li key={j}>• {reason}</li>)}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-primary px-3 py-1 text-xs" onClick={() => boost(r.topic, r.subject)}>Add revision sessions</button>
                  {r.actions.filter((a) => a.type === 'practice').map((a) => (
                    <Link key={a.assessmentId} to={`/assessments`} className="btn-ghost px-3 py-1 text-xs">Practice: {a.label.replace('Practice: ', '')} →</Link>
                  ))}
                </div>
              </div>
            ))
          )}
          <div className="card">
            <h3 className="font-semibold">Personalization inputs used</h3>
            {recs?.profileUsed?.set ? (
              <p className="text-sm text-slate-600">
                Level: {recs.profileUsed.academicLevel || '—'} · Style: {recs.profileUsed.learningStyle || '—'} · Exam: {recs.profileUsed.examType || '—'} · {recs.profileUsed.dailyStudyHours ?? '—'}h/day · Subjects: {(recs.profileUsed.subjects || []).join(', ') || '—'}
              </p>
            ) : (
              <p className="text-sm text-slate-500">No learning profile yet.</p>
            )}
            <Link to="/setup?step=profile" className="btn-ghost mt-2 text-sm">Review / correct in Learning Setup →</Link>
          </div>
          <div className="card">
            <h3 className="font-semibold">Optional AI insights <span className="text-xs font-normal text-slate-400">(labeled layer, may be unavailable)</span></h3>
            {!ai ? (
              <button className="btn-ghost mt-2 text-sm" onClick={loadAi}>Generate AI insights</button>
            ) : ai.loading ? (
              <p className="text-sm text-slate-500">Thinking…</p>
            ) : ai.error ? (
              <p className="text-sm text-amber-700">{ai.error}</p>
            ) : (
              <div className="mt-2 space-y-1">
                <p className="text-xs font-bold text-purple-700">🤖 AI layer — suggestions grounded in the observed stats above</p>
                <p className="whitespace-pre-wrap text-sm">{ai.suggestions}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
