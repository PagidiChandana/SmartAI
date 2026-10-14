import { User, isAdminRole } from '../models/User.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { Goal } from '../models/Goal.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { SyllabusUpload } from '../models/SyllabusUpload.js';
import { Diagnostic } from '../models/Diagnostic.js';
import { ApiError } from '../utils/ApiError.js';
import { extractSyllabusText, topicsFromText } from './syllabus.service.js';

const uid = (reqUser) => reqUser._id;
const oid = (reqUser) => reqUser._id.toString();

// ---------- Profile ----------
export async function getProfile(reqUser) {
  return StudentProfile.findOne({ user: uid(reqUser) });
}

export async function upsertProfile(reqUser, data) {
  if (reqUser.role !== 'student' && !isAdminRole(reqUser.role)) {
    throw new ApiError(403, 'Only students can set up a learning profile');
  }
  const subjects = Array.isArray(data.subjects)
    ? [...new Set(data.subjects.map((s) => String(s).trim()).filter(Boolean))].slice(0, 20)
    : undefined;
  return StudentProfile.findOneAndUpdate(
    { user: uid(reqUser) },
    {
      $set: {
        ...(data.academicLevel && { academicLevel: data.academicLevel }),
        ...(subjects && { subjects }),
        ...(data.learningStyle && { learningStyle: data.learningStyle }),
        ...(data.examType && { examType: data.examType }),
        ...(data.dailyStudyHours !== undefined && { dailyStudyHours: data.dailyStudyHours }),
      },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
}

// ---------- Goals ----------
export async function listGoals(reqUser) {
  return Goal.find({ user: uid(reqUser) }).sort({ targetDate: 1 });
}

export async function createGoal(reqUser, data) {
  if (new Date(data.targetDate) <= new Date()) {
    throw new ApiError(400, 'Target date must be in the future');
  }
  return Goal.create({ user: uid(reqUser), ...data });
}

export async function patchGoal(reqUser, id, data) {
  const goal = await Goal.findOne({ _id: id, user: uid(reqUser) });
  if (!goal) throw new ApiError(404, 'Goal not found');
  if (data.targetDate && new Date(data.targetDate) <= new Date()) {
    throw new ApiError(400, 'Target date must be in the future');
  }
  Object.assign(goal, data);
  await goal.save();
  return goal;
}

export async function deleteGoal(reqUser, id) {
  const goal = await Goal.findOneAndDelete({ _id: id, user: uid(reqUser) });
  if (!goal) throw new ApiError(404, 'Goal not found');
  return { id };
}

// ---------- Subjects ----------
export async function listSubjects(reqUser) {
  const subjects = await Subject.find({ user: uid(reqUser) }).sort({ createdAt: 1 }).lean();
  const counts = await Topic.aggregate([
    { $match: { user: reqUser._id } },
    { $group: { _id: '$subject', total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } } } },
  ]);
  const bySubject = new Map(counts.map((c) => [c._id.toString(), c]));
  return subjects.map((s) => ({ ...s, ...(bySubject.get(s._id.toString()) || { total: 0, done: 0 }) }));
}

export async function createSubject(reqUser, data) {
  try {
    return await Subject.create({ user: uid(reqUser), name: data.name.trim(), description: data.description || '' });
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'Subject already exists');
    throw err;
  }
}

export async function patchSubject(reqUser, id, data) {
  const subject = await Subject.findOne({ _id: id, user: uid(reqUser) });
  if (!subject) throw new ApiError(404, 'Subject not found');
  if (data.name) subject.name = data.name.trim();
  if (data.description !== undefined) subject.description = data.description;
  try {
    await subject.save();
  } catch (err) {
    if (err.code === 11000) throw new ApiError(409, 'Subject already exists');
    throw err;
  }
  return subject;
}

export async function deleteSubject(reqUser, id) {
  const subject = await Subject.findOne({ _id: id, user: uid(reqUser) });
  if (!subject) throw new ApiError(404, 'Subject not found');
  await Topic.deleteMany({ user: uid(reqUser), subject: subject._id });
  await Diagnostic.deleteMany({ user: uid(reqUser), subject: subject._id });
  await subject.deleteOne();
  return { id };
}

// ---------- Topics ----------
async function assertOwnSubject(reqUser, subjectId) {
  const subject = await Subject.findOne({ _id: subjectId, user: uid(reqUser) });
  if (!subject) throw new ApiError(404, 'Subject not found');
  return subject;
}

export async function listTopics(reqUser, { subject, status } = {}) {
  const filter = { user: uid(reqUser) };
  if (subject) {
    await assertOwnSubject(reqUser, subject);
    filter.subject = subject;
  }
  if (status) filter.status = status;
  return Topic.find(filter).populate('subject', 'name').sort({ createdAt: 1 });
}

export async function createTopic(reqUser, data) {
  await assertOwnSubject(reqUser, data.subject);
  return Topic.create({ user: uid(reqUser), ...data, source: 'manual' });
}

export async function createTopicsBulk(reqUser, subjectId, titles) {
  await assertOwnSubject(reqUser, subjectId);
  const clean = [...new Set(titles.map((t) => String(t?.title ?? t).trim()).filter(Boolean))].slice(0, 100);
  if (clean.length === 0) throw new ApiError(400, 'No valid topic titles supplied');
  const docs = clean.map((title) => ({ user: uid(reqUser), subject: subjectId, title, source: 'manual' }));
  return Topic.insertMany(docs);
}

export async function patchTopic(reqUser, id, data) {
  const topic = await Topic.findOne({ _id: id, user: uid(reqUser) });
  if (!topic) throw new ApiError(404, 'Topic not found');
  if (data.subject && data.subject !== topic.subject.toString()) {
    await assertOwnSubject(reqUser, data.subject);
    topic.subject = data.subject;
  }
  for (const k of ['title', 'section', 'status', 'difficulty', 'confidence']) {
    if (data[k] !== undefined) topic[k] = data[k];
  }
  await topic.save();
  return topic;
}

export async function deleteTopic(reqUser, id) {
  const topic = await Topic.findOneAndDelete({ _id: id, user: uid(reqUser) });
  if (!topic) throw new ApiError(404, 'Topic not found');
  return { id };
}

// ---------- Upload + extraction ----------
export async function uploadSyllabus(reqUser, file, subjectId) {
  let subject = null;
  if (subjectId) subject = await assertOwnSubject(reqUser, subjectId);
  const text = await extractSyllabusText(file);
  const extracted = topicsFromText(text);
  let created = 0;
  if (subject && extracted.length > 0) {
    const docs = extracted.map((t) => ({
      user: uid(reqUser),
      subject: subject._id,
      title: t.title,
      section: t.section,
      source: 'upload',
    }));
    const res = await Topic.insertMany(docs, { ordered: false }).catch(() => []);
    created = res.length;
  }
  const record = await SyllabusUpload.create({
    user: uid(reqUser),
    subject: subject?._id || null,
    originalName: file.originalname,
    mimeType: file.mimetype,
    size: file.size,
    extractedChars: text.length,
    topicsCreated: created,
  });
  return {
    upload: record,
    preview: text.slice(0, 1200),
    topics: extracted.slice(0, 20),
    totalExtracted: extracted.length,
    attachedToSubject: Boolean(subject),
  };
}

export async function listUploads(reqUser) {
  return SyllabusUpload.find({ user: uid(reqUser) }).populate('subject', 'name').sort({ createdAt: -1 }).limit(20);
}

// ---------- Diagnostics ----------
function buildQuestions(topicTitles, subjectName) {
  const base = topicTitles.length > 0 ? topicTitles : ['Core concepts', 'Problem solving', 'Revision & recall'];
  return base.slice(0, 8).map((t, i) => ({
    question: `Diagnostic Q${i + 1} — how well can you explain "${t}" (${subjectName}) without notes?`,
    options: ['Not at all', ' vaguely', 'Fairly well', 'Confidently'],
    answer: 3,
  }));
}

export async function startDiagnostic(reqUser, { subjectId, subjectName }) {
  let subject = null;
  let name = (subjectName || '').trim();
  if (subjectId) {
    subject = await assertOwnSubject(reqUser, subjectId);
    name = subject.name;
  }
  if (!name) throw new ApiError(400, 'Select a subject for the diagnostic');
  const topics = await Topic.find({ user: uid(reqUser), ...(subject ? { subject: subject._id } : {}) })
    .limit(8)
    .lean();
  const questions = buildQuestions(topics.map((t) => t.title), name);
  return Diagnostic.create({
    user: uid(reqUser),
    subject: subject?._id || null,
    subjectName: name,
    totalQuestions: questions.length,
    responses: questions.map((q) => ({ ...q, selected: null, correct: false })),
  });
}

export async function submitDiagnostic(reqUser, id, answers) {
  const diag = await Diagnostic.findOne({ _id: id, user: uid(reqUser) });
  if (!diag) throw new ApiError(404, 'Assessment not found');
  if (diag.submitted) throw new ApiError(400, 'Assessment already submitted');
  if (!Array.isArray(answers) || answers.length !== diag.totalQuestions) {
    throw new ApiError(400, 'Answer every question before submitting');
  }
  let correct = 0;
  diag.responses.forEach((r, i) => {
    const sel = Number(answers[i]);
    r.selected = sel;
    r.correct = sel === r.answer;
    if (r.correct) correct += 1;
  });
  diag.correctAnswers = correct;
  diag.scorePct = Math.round((correct / diag.totalQuestions) * 100);
  diag.level = diag.scorePct >= 75 ? 'advanced' : diag.scorePct >= 45 ? 'intermediate' : 'beginner';
  diag.submitted = true;
  await diag.save();
  return diag;
}

export async function listDiagnostics(reqUser) {
  return Diagnostic.find({ user: uid(reqUser) }).populate('subject', 'name').sort({ createdAt: -1 }).limit(20);
}

// ---------- Setup checklist ----------
export async function getChecklist(reqUser) {
  const [profile, subjectCount, topicCount, goalCount, diagCount] = await Promise.all([
    StudentProfile.findOne({ user: uid(reqUser) }).lean(),
    Subject.countDocuments({ user: uid(reqUser) }),
    Topic.countDocuments({ user: uid(reqUser) }),
    Goal.countDocuments({ user: uid(reqUser) }),
    Diagnostic.countDocuments({ user: uid(reqUser), submitted: true }),
  ]);
  const steps = [
    { key: 'profile', label: 'Complete learning profile', done: Boolean(profile?.academicLevel && profile?.examType && profile?.dailyStudyHours), href: '/setup?step=profile' },
    { key: 'subjects', label: 'Add at least one subject', done: subjectCount > 0, href: '/setup?step=subjects' },
    { key: 'topics', label: 'Add or upload syllabus topics', done: topicCount > 0, href: '/setup?step=syllabus' },
    { key: 'goals', label: 'Set a learning goal with target date', done: goalCount > 0, href: '/setup?step=goals' },
    { key: 'diagnostic', label: 'Take the diagnostic assessment', done: diagCount > 0, href: '/setup?step=diagnostic' },
  ];
  const done = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done) || null;
  return { steps, done, total: steps.length, pct: Math.round((done / steps.length) * 100), next };
}

export { User };
