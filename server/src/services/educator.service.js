import { User, isAdminRole } from '../models/User.js';
import { Resource } from '../models/Resource.js';
import { Assessment } from '../models/Assessment.js';
import { Attempt } from '../models/Attempt.js';
import { Question } from '../models/Question.js';
import { Notification } from '../models/Notification.js';
import { ApiError } from '../utils/ApiError.js';
import { topicMastery } from './analytics.service.js';

function needEducator(user) {
  if (user.role !== 'educator' && !isAdminRole(user.role)) throw new ApiError(403, 'Educator access required');
}

// Students connected to this educator: attempted or assigned to their assessments.
// Nothing else is visible — no access to unrelated students' private data.
async function connectedStudentIds(educatorId) {
  const assessments = await Assessment.find({ owner: educatorId }).select('_id assignees');
  const ids = new Set();
  assessments.forEach((a) => (a.assignees || []).forEach((id) => ids.add(id.toString())));
  if (assessments.length) {
    const attempted = await Attempt.distinct('user', { assessment: { $in: assessments.map((a) => a._id) } });
    attempted.forEach((id) => ids.add(id.toString()));
  }
  return { ids: [...ids], assessmentIds: assessments.map((a) => a._id) };
}

export async function getProfile(user) {
  needEducator(user);
  const fresh = await User.findById(user._id);
  return fresh.toSafeJSON();
}

export async function updateProfile(user, { name, bio, teachingSubjects }) {
  needEducator(user);
  const fresh = await User.findById(user._id);
  if (name !== undefined) {
    if (!name.trim()) throw new ApiError(400, 'Name cannot be empty');
    fresh.name = name.trim().slice(0, 80);
  }
  if (bio !== undefined) fresh.bio = String(bio).slice(0, 1000);
  if (teachingSubjects !== undefined) {
    if (!Array.isArray(teachingSubjects)) throw new ApiError(400, 'teachingSubjects must be an array');
    fresh.teachingSubjects = [...new Set(teachingSubjects.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20);
  }
  await fresh.save();
  return fresh.toSafeJSON();
}

export async function overview(user) {
  needEducator(user);
  const [assessments, resources, attempts, pending, students] = await Promise.all([
    Assessment.countDocuments({ owner: user._id }),
    Resource.aggregate([{ $match: { owner: user._id } }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Attempt.countDocuments({ assessment: { $in: (await Assessment.find({ owner: user._id }).select('_id')).map((a) => a._id) }, status: { $ne: 'in-progress' } }),
    Attempt.countDocuments({ assessment: { $in: (await Assessment.find({ owner: user._id }).select('_id')).map((a) => a._id) }, status: 'submitted' }),
    connectedStudentIds(user._id).then((r) => r.ids.length),
  ]);
  const resByStatus = {};
  resources.forEach((r) => { resByStatus[r._id] = r.n; });
  return { assessments, resources: resByStatus, attempts, pendingGrading: pending, students };
}

export async function listStudents(user) {
  needEducator(user);
  const { ids, assessmentIds } = await connectedStudentIds(user._id);
  if (!ids.length) return [];
  const users = await User.find({ _id: { $in: ids } }).select('name email createdAt').lean();
  const attempts = await Attempt.find({ assessment: { $in: assessmentIds }, user: { $in: ids }, status: { $ne: 'in-progress' } }).lean();
  const byUser = new Map();
  attempts.forEach((t) => {
    const k = t.user.toString();
    if (!byUser.has(k)) byUser.set(k, { attempts: 0, accSum: 0, last: null, score: 0 });
    const e = byUser.get(k);
    e.attempts += 1;
    e.accSum += t.accuracy || 0;
    e.score += t.score || 0;
    if (!e.last || t.submittedAt > e.last) e.last = t.submittedAt;
  });
  return users.map((u) => {
    const s = byUser.get(u._id.toString()) || { attempts: 0, accSum: 0, last: null, score: 0 };
    return { ...u, attempts: s.attempts, avgAccuracy: s.attempts ? Math.round(s.accSum / s.attempts) : null, totalScore: Math.round(s.score * 100) / 100, lastActive: s.last };
  });
}

export async function studentProgress(user, studentId) {
  needEducator(user);
  const { ids } = await connectedStudentIds(user._id);
  if (!ids.includes(studentId.toString())) throw new ApiError(404, 'Student not found in your classes');
  const student = await User.findById(studentId).select('name email role createdAt');
  if (!student || student.role !== 'student') throw new ApiError(404, 'Student not found');
  const mastery = await topicMastery({ _id: student._id });
  const attempts = await Attempt.find({ user: student._id, status: { $ne: 'in-progress' } })
    .populate('assessment', 'title subject')
    .sort({ submittedAt: -1 })
    .limit(20)
    .lean();
  return {
    student: { id: student._id, name: student.name, email: student.email },
    weakTopics: mastery.weak.slice(0, 5).map((w) => ({ topic: w.topic, subject: w.subject, accuracy: w.accuracy, answered: w.answered })),
    strongTopics: mastery.strong.slice(0, 5).map((s) => ({ topic: s.topic, accuracy: s.accuracy })),
    attempts: attempts.map((t) => ({ id: t._id, assessment: t.assessment, score: t.score, maxScore: t.maxScore, accuracy: t.accuracy, submittedAt: t.submittedAt })),
  };
}

export async function classSummary(user) {
  needEducator(user);
  const assessments = await Assessment.find({ owner: user._id }).select('title subject status').lean();
  const attempts = await Attempt.find({ assessment: { $in: assessments.map((a) => a._id) }, status: { $ne: 'in-progress' } }).lean();
  const qIds = [...new Set(attempts.flatMap((t) => t.answers.map((a) => a.question.toString())))];
  const questions = qIds.length ? await Question.find({ _id: { $in: qIds } }).select('topic').lean() : [];
  const qById = new Map(questions.map((q) => [q._id.toString(), q]));
  const byTopic = new Map();
  attempts.forEach((t) => t.answers.forEach((a) => {
    const q = qById.get(a.question.toString());
    if (!q || a.isCorrect === null || a.isCorrect === undefined) return;
    const topic = q.topic || 'general';
    if (!byTopic.has(topic)) byTopic.set(topic, { answered: 0, correct: 0 });
    const e = byTopic.get(topic);
    e.answered += 1;
    if (a.isCorrect) e.correct += 1;
  }));
  const topicsNeedingSupport = [...byTopic.entries()]
    .map(([topic, v]) => ({ topic, accuracy: Math.round((v.correct / v.answered) * 100), answered: v.answered }))
    .filter((t) => t.answered >= 2)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10);
  return {
    assessments: assessments.length,
    attempts: attempts.length,
    students: new Set(attempts.map((t) => t.user.toString())).size,
    avgAccuracy: attempts.length ? Math.round(attempts.reduce((s, t) => s + (t.accuracy || 0), 0) / attempts.length) : null,
    topicsNeedingSupport,
    perAssessment: assessments.map((a) => {
      const at = attempts.filter((t) => t.assessment.toString() === a._id.toString());
      return { id: a._id, title: a.title, subject: a.subject, status: a.status, attempts: at.length, avgAccuracy: at.length ? Math.round(at.reduce((s, t) => s + (t.accuracy || 0), 0) / at.length) : null };
    }),
  };
}

// Feedback / recommendation to one of the educator's own students.
export async function sendNote(user, { studentId, title, body }) {
  needEducator(user);
  const { ids } = await connectedStudentIds(user._id);
  if (!ids.includes(studentId.toString())) throw new ApiError(404, 'Student not found in your classes');
  const student = await User.findById(studentId);
  if (!student || student.role !== 'student') throw new ApiError(404, 'Student not found');
  if (!title?.trim()) throw new ApiError(400, 'Title is required');
  return Notification.create({
    user: student._id,
    from: user._id,
    kind: 'feedback',
    title: title.trim().slice(0, 200),
    body: (body || '').slice(0, 2000),
  });
}
