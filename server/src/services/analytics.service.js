import mongoose from 'mongoose';
import { PlanTask } from '../models/PlanTask.js';
import { Topic } from '../models/Topic.js';
import { Subject } from '../models/Subject.js';
import { Attempt } from '../models/Attempt.js';
import { Question } from '../models/Question.js';
import { Assessment } from '../models/Assessment.js';
import { Diagnostic } from '../models/Diagnostic.js';
import { StudyPlan } from '../models/StudyPlan.js';
import { StudentProfile } from '../models/StudentProfile.js';

const DAY = 86400000;
export const todayDay = () => new Date().toISOString().slice(0, 10);
const dayOf = (d) => new Date(d).toISOString().slice(0, 10);

// All functions scope to one user id — analytics never cross accounts.
function uid(user) {
  return user._id;
}

function lastDays(n) {
  const out = [];
  const now = Date.now();
  for (let i = n - 1; i >= 0; i -= 1) out.push(dayOf(now - i * DAY));
  return out;
}

function weekKey(day) {
  const d = new Date(`${day}T00:00:00Z`);
  const monday = new Date(d);
  const dow = (d.getUTCDay() + 6) % 7;
  monday.setUTCDate(d.getUTCDate() - dow);
  return monday.toISOString().slice(0, 10);
}

// ---------- Study time (completed plan tasks only — observed, not estimated) ----------
// Grouped by completion day (updatedAt of the completed task), because
// scheduled dates can lie in the future while the work happened today.
export async function studyTime(user, { days = 14 } = {}) {
  const n = Math.min(90, Math.max(1, Number(days) || 14));
  const sinceDate = new Date(Date.now() - (n - 1) * DAY);
  const rows = await PlanTask.aggregate([
    { $match: { user: new mongoose.Types.ObjectId(uid(user)), status: 'completed', updatedAt: { $gte: sinceDate } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$updatedAt' } }, minutes: { $sum: '$durationMin' }, tasks: { $sum: 1 } } },
  ]);
  const byDay = new Map(rows.map((r) => [r._id, r]));
  const daily = lastDays(n).map((date) => ({
    date,
    minutes: byDay.get(date)?.minutes || 0,
    tasks: byDay.get(date)?.tasks || 0,
  }));
  const weeks = new Map();
  for (const d of daily) {
    const w = weekKey(d.date);
    weeks.set(w, { week: w, minutes: (weeks.get(w)?.minutes || 0) + d.minutes, tasks: (weeks.get(w)?.tasks || 0) + d.tasks });
  }
  const totalMinutes = daily.reduce((s, d) => s + d.minutes, 0);
  return { daily, weekly: [...weeks.values()], totalMinutes, totalTasks: daily.reduce((s, d) => s + d.tasks, 0) };
}

// ---------- Task completion + adherence ----------
// Adherence = completed / (completed + overdue). Overdue = pending with date
// before today. Documented definition, computed from real task rows.
export async function taskStats(user) {
  const [total, completed, skipped, overdue] = await Promise.all([
    PlanTask.countDocuments({ user: uid(user) }),
    PlanTask.countDocuments({ user: uid(user), status: 'completed' }),
    PlanTask.countDocuments({ user: uid(user), status: 'skipped' }),
    PlanTask.countDocuments({ user: uid(user), status: 'pending', date: { $lt: todayDay() } }),
  ]);
  const pending = total - completed - skipped;
  const adherence = completed + overdue === 0 ? null : Math.round((completed / (completed + overdue)) * 100);
  return { total, completed, skipped, pending, overdue, adherence };
}

// ---------- Syllabus completion by subject ----------
export async function syllabusBySubject(user) {
  const subjects = await Subject.find({ user: uid(user) }).lean();
  const topics = await Topic.find({ user: uid(user) }).lean();
  const bySubject = new Map(subjects.map((s) => [s._id.toString(), { subject: s.name, total: 0, completed: 0 }]));
  for (const t of topics) {
    const key = t.subject.toString();
    if (!bySubject.has(key)) bySubject.set(key, { subject: 'Other', total: 0, completed: 0 });
    const e = bySubject.get(key);
    e.total += 1;
    if (t.status === 'completed') e.completed += 1;
  }
  return [...bySubject.values()].map((e) => ({
    ...e,
    pct: e.total ? Math.round((e.completed / e.total) * 100) : 0,
  }));
}

// ---------- Assessment scores over time ----------
export async function scoreTrend(user, { limit = 30 } = {}) {
  const attempts = await Attempt.find({ user: uid(user), status: { $ne: 'in-progress' } })
    .populate('assessment', 'title subject')
    .sort({ submittedAt: 1 })
    .limit(Math.min(100, Number(limit) || 30))
    .lean();
  return attempts.map((t) => ({
    date: t.submittedAt ? dayOf(t.submittedAt) : null,
    title: t.assessment?.title || 'Assessment',
    subject: t.assessment?.subject || '',
    score: t.score,
    maxScore: t.maxScore,
    scorePct: t.maxScore ? Math.round((t.score / t.maxScore) * 100) : 0,
    accuracy: t.accuracy,
    timeSpentSec: t.timeSpentSec,
  }));
}

// ---------- Topic mastery (observed assessment evidence only) ----------
// status: needs-data (0 answered) | strong (≥75, n≥2) | developing |
// weak (<50 with any evidence, or repeated mistakes, or low confidence +
// unfinished). Single-answer verdicts always carry n=1 in reasons downstream.
// Exported for regression tests: transparent mastery labeling rule.
export function masteryStatus(accuracy, answered, repeated, topicDoc) {
  if (answered === 0) {
    if (topicDoc && topicDoc.confidence <= 2 && topicDoc.status !== 'completed') return 'weak';
    return 'needs-data';
  }
  if (accuracy < 50 || repeated.length > 0) return 'weak';
  if (answered >= 2 && accuracy >= 75) return 'strong';
  return 'developing';
}
export async function topicMastery(user) {
  const [attempts, topics] = await Promise.all([
    Attempt.find({ user: uid(user), status: { $ne: 'in-progress' } }).lean(),
    Topic.find({ user: uid(user) }).populate('subject', 'name').lean(),
  ]);
  const qIds = new Set();
  attempts.forEach((t) => t.answers.forEach((a) => qIds.add(a.question.toString())));
  const questions = qIds.size
    ? await Question.find({ _id: { $in: [...qIds] } }).select('topic assessment type').lean()
    : [];
  const qById = new Map(questions.map((q) => [q._id.toString(), q]));
  const aIds = [...new Set(attempts.map((t) => t.assessment.toString()))];
  const aDocs = aIds.length
    ? await Assessment.find({ _id: { $in: aIds } }).select('subject title').lean()
    : [];
  const aById = new Map(aDocs.map((a) => [a._id.toString(), a]));

  const agg = new Map(); // topicKey -> {topic, subject, answered, correct, wrongQ:{}}
  const bump = (topic, subject) => {
    const key = `${subject}::${topic}`.toLowerCase();
    if (!agg.has(key)) agg.set(key, { topic, subject, answered: 0, correct: 0, wrongQ: {} });
    return agg.get(key);
  };
  for (const t of attempts) {
    for (const ans of t.answers) {
      const q = qById.get(ans.question.toString());
      if (!q || ans.isCorrect === null || ans.isCorrect === undefined) continue;
      const aMeta = aById.get(t.assessment.toString());
      const e = bump(q.topic || 'general', aMeta?.subject || 'General');
      e.answered += 1;
      if (ans.isCorrect) e.correct += 1;
      else e.wrongQ[ans.question.toString()] = (e.wrongQ[ans.question.toString()] || 0) + 1;
    }
  }
  // Split attempts into older/newer halves for an honest trend arrow.
  const half = Math.max(1, Math.floor(attempts.length / 2));

  const out = [];
  for (const e of agg.values()) {
    const accuracy = e.answered ? Math.round((e.correct / e.answered) * 100) : 0;
    const repeated = Object.entries(e.wrongQ).filter(([, n]) => n >= 2);
    let recent = 0;
    let recentN = 0;
    // recompute recent-half accuracy for this topic
    for (const t of attempts.slice(-half)) {
      for (const ans of t.answers) {
        const q = qById.get(ans.question.toString());
        if (!q) continue;
        const aMeta = aById.get(t.assessment.toString());
        if (`${aMeta?.subject || 'General'}::${q.topic || 'general'}`.toLowerCase() !== `${e.subject}::${e.topic}`.toLowerCase()) continue;
        if (ans.isCorrect === null || ans.isCorrect === undefined) continue;
        recentN += 1;
        if (ans.isCorrect) recent += 1;
      }
    }
    const recentAcc = recentN ? Math.round((recent / recentN) * 100) : null;
    const topicDoc = topics.find(
      (t) => (t.subject?.name || 'General').toLowerCase() === e.subject.toLowerCase() && t.title.toLowerCase() === e.topic.toLowerCase()
    );
    const status = masteryStatus(accuracy, e.answered, repeated, topicDoc);
    out.push({
      topic: e.topic,
      subject: e.subject,
      answered: e.answered,
      correct: e.correct,
      accuracy,
      recentAccuracy: recentAcc,
      trend: recentAcc === null || recentN < 2 ? 'unknown' : recentAcc > accuracy ? 'improving' : recentAcc < accuracy ? 'declining' : 'steady',
      repeatedMistakes: repeated.map(([qid, n]) => ({ questionId: qid, timesWrong: n })),
      status,
    });
  }
  // Include syllabus topics with zero evidence (confidence fallback inside).
  const seen = new Set(out.map((o) => `${o.subject}::${o.topic}`.toLowerCase()));
  for (const t of topics) {
    const sName = t.subject?.name || 'General';
    const key = `${sName}::${t.title}`.toLowerCase();
    if (seen.has(key)) continue;
    const status = masteryStatus(null, 0, [], t);
    out.push({ topic: t.title, subject: sName, answered: 0, correct: 0, accuracy: null, recentAccuracy: null, trend: 'unknown', repeatedMistakes: [], status, confidenceNote: status === 'weak' ? `Self-reported confidence ${t.confidence}/5` : undefined });
  }
  const order = { weak: 0, developing: 1, 'needs-data': 2, strong: 3 };
  out.sort((a, b) => order[a.status] - order[b.status] || (b.answered || 0) - (a.answered || 0));
  return { topics: out, weak: out.filter((o) => o.status === 'weak'), strong: out.filter((o) => o.status === 'strong') };
}

// ---------- Overview bundle ----------
export async function overview(user) {
  const [time, tasks, syllabus, trend, mastery, diags, plans] = await Promise.all([
    studyTime(user, { days: 14 }),
    taskStats(user),
    syllabusBySubject(user),
    scoreTrend(user, { limit: 10 }),
    topicMastery(user),
    Diagnostic.find({ user: uid(user), submitted: true }).sort({ createdAt: -1 }).limit(5).lean(),
    StudyPlan.find({ user: uid(user) }).select('title version status totalTasks completedTasks').sort({ version: -1 }).limit(5).lean(),
  ]);
  const revisionTasks = await PlanTask.countDocuments({ user: uid(user), kind: 'revision', status: 'completed' });
  const gradedAttempts = await Attempt.countDocuments({ user: uid(user), status: 'graded' });
  return {
    studyTime: { totalMinutes14d: time.totalMinutes, totalTasks14d: time.totalTasks },
    tasks,
    syllabus,
    syllabusAvg: syllabus.length ? Math.round(syllabus.reduce((s, x) => s + x.pct, 0) / syllabus.length) : null,
    recentScores: trend,
    mastery: { weak: mastery.weak.length, strong: mastery.strong.length, total: mastery.topics.length },
    diagnostics: diags.map((d) => ({ subject: d.subjectName, scorePct: d.scorePct, level: d.level })),
    plans,
    revision: { revisionTasksCompleted: revisionTasks, gradedAttempts },
  };
}

export async function profileUsed(user) {
  const profile = await StudentProfile.findOne({ user: uid(user) }).lean();
  if (!profile) return { set: false };
  return {
    set: true,
    academicLevel: profile.academicLevel || null,
    subjects: profile.subjects || [],
    learningStyle: profile.learningStyle || null,
    examType: profile.examType || null,
    dailyStudyHours: profile.dailyStudyHours ?? null,
  };
}
