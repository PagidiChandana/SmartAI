import { Assessment } from '../models/Assessment.js';
import { Question, QUESTION_TYPES } from '../models/Question.js';
import { Attempt } from '../models/Attempt.js';
import { User, isAdminRole } from '../models/User.js';
import { Resource } from '../models/Resource.js';
import { ApiError } from '../utils/ApiError.js';
import { generateJSON, extractJSON } from './ai.service.js';
import { env } from '../config/env.js';

const GRACE_SEC = 60;

function isEducator(user) {
  return user.role === 'educator' || isAdminRole(user.role);
}

async function ownAssessment(user, id) {
  const a = await Assessment.findById(id);
  if (!a) throw new ApiError(404, 'Assessment not found');
  if (!isAdminRole(user.role) && a.owner.toString() !== user._id.toString()) {
    throw new ApiError(404, 'Assessment not found');
  }
  return a;
}

async function recomputeTotal(assessmentId) {
  const qs = await Question.find({ assessment: assessmentId }).select('marks');
  const total = qs.reduce((s, q) => s + q.marks, 0);
  await Assessment.findByIdAndUpdate(assessmentId, { totalMarks: total });
  return total;
}

function canStudentSee(user, assessment) {
  if (assessment.status !== 'published') return false;
  if (assessment.visibility === 'all') return true;
  return assessment.assignees.some((id) => id.toString() === user._id.toString());
}

function releasedFor(assessment) {
  if (assessment.releaseMode === 'immediate') return true;
  if (assessment.releaseMode === 'manual') return assessment.released;
  if (assessment.releaseMode === 'after-deadline') {
    return assessment.deadline ? new Date() > new Date(assessment.deadline) : false;
  }
  return false; // 'never'
}

// Strip answers unless released. Correct fields are select:false at the
// model level; this shapes the rest (explanations, model answers).
function shapeQuestion(q, { reveal }) {
  const o = q.toObject ? q.toObject() : { ...q };
  delete o.correctOption;
  delete o.correctBool;
  delete o.modelAnswer;
  if (!reveal) delete o.explanation;
  delete o.__v;
  return o;
}

// ---------- Educator: assessments ----------
export async function createAssessment(user, data) {
  if (!isEducator(user)) throw new ApiError(403, 'Only educators can create assessments');
  if (data.deadline && new Date(data.deadline) <= new Date()) throw new ApiError(400, 'Deadline must be in the future');
  const a = await Assessment.create({
    owner: user._id,
    title: data.title.trim(),
    description: data.description || '',
    kind: data.kind || 'test',
    subject: data.subject.trim(),
    topic: (data.topic || '').trim(),
    difficulty: data.difficulty || 'beginner',
    durationMin: data.durationMin ?? (data.kind === 'assignment' ? 0 : 30),
    deadline: data.deadline || null,
    maxAttempts: data.maxAttempts || 1,
    visibility: data.visibility || 'all',
    releaseMode: data.releaseMode || 'after-deadline',
    showExplanations: data.showExplanations ?? true,
  });
  return a;
}

export async function listOwned(user) {
  const items = await Assessment.find({ owner: user._id }).sort({ updatedAt: -1 });
  const withCounts = await Promise.all(
    items.map(async (a) => {
      const [questions, attempts, pending] = await Promise.all([
        Question.countDocuments({ assessment: a._id }),
        Attempt.countDocuments({ assessment: a._id, status: { $ne: 'in-progress' } }),
        Attempt.countDocuments({ assessment: a._id, status: 'submitted' }),
      ]);
      return { ...a.toObject(), questionCount: questions, attemptCount: attempts, needsGrading: pending };
    })
  );
  return withCounts;
}

export async function patchAssessment(user, id, data) {
  const a = await ownAssessment(user, id);
  if (a.status !== 'draft' && data.durationMin !== undefined && data.durationMin !== a.durationMin) {
    const live = await Attempt.countDocuments({ assessment: a._id, status: 'in-progress' });
    if (live > 0) throw new ApiError(400, 'Cannot change duration while attempts are in progress');
  }
  for (const k of ['title', 'description', 'subject', 'topic', 'difficulty', 'durationMin', 'deadline', 'maxAttempts', 'visibility', 'releaseMode', 'showExplanations', 'kind']) {
    if (data[k] !== undefined) a[k] = data[k] === '' && k === 'deadline' ? null : data[k];
  }
  if (data.deadline && new Date(data.deadline) <= new Date()) throw new ApiError(400, 'Deadline must be in the future');
  await a.save();
  return a;
}

export async function setStatus(user, id, status) {
  const a = await ownAssessment(user, id);
  if (status === 'published') {
    const [qCount, unreviewed] = await Promise.all([
      Question.countDocuments({ assessment: a._id }),
      Question.countDocuments({ assessment: a._id, aiGenerated: true, reviewed: false }),
    ]);
    if (qCount === 0) throw new ApiError(400, 'Add at least one question before publishing');
    if (unreviewed > 0) throw new ApiError(400, `${unreviewed} AI-drafted question(s) need educator review before publishing`);
    if (a.deadline && new Date(a.deadline) <= new Date()) throw new ApiError(400, 'Deadline has passed — extend it before publishing');
  }
  a.status = status;
  await a.save();
  return a;
}

export async function setAssignees(user, id, emails) {
  const a = await ownAssessment(user, id);
  const clean = [...new Set((emails || []).map((e) => e.toLowerCase().trim()).filter(Boolean))].slice(0, 200);
  const students = await User.find({ email: { $in: clean }, role: 'student' }).select('_id email');
  const found = new Set(students.map((s) => s.email));
  const missing = clean.filter((e) => !found.has(e));
  if (missing.length) throw new ApiError(404, `Students not found: ${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}`);
  a.assignees = students.map((s) => s._id);
  a.visibility = 'selected';
  await a.save();
  return a;
}

// Append-only variant: links one student without touching existing
// assignees or visibility. Used by the Students page "link student" flow.
export async function addAssignee(user, id, email) {
  const a = await ownAssessment(user, id);
  const clean = (email || '').toLowerCase().trim();
  if (!clean) throw new ApiError(400, 'Student email is required');
  const student = await User.findOne({ email: clean, role: 'student' }).select('_id email');
  if (!student) throw new ApiError(404, `Student not found: ${clean}`);
  const already = (a.assignees || []).some((s) => s.toString() === student._id.toString());
  if (!already) {
    a.assignees = [...(a.assignees || []), student._id];
    await a.save();
  }
  return { id: a._id, linked: student.email, already };
}

export async function releaseResults(user, id, released) {
  const a = await ownAssessment(user, id);
  a.released = released;
  if (released && a.releaseMode === 'never') a.releaseMode = 'manual';
  await a.save();
  return a;
}

// ---------- Educator: questions ----------
function validateQuestionInput(data, isDraft = false) {
  if (!QUESTION_TYPES.includes(data.type)) throw new ApiError(400, 'Invalid question type');
  if (!data.text?.trim()) throw new ApiError(400, 'Question text is required');
  if (data.type === 'mcq') {
    const opts = (data.options || []).map((o) => (o || '').toString().trim()).filter(Boolean);
    if (!isDraft && opts.length < 2) throw new ApiError(400, 'MCQ needs at least 2 options');
    if (data.correctOption !== undefined && data.correctOption !== null) {
      if (!Number.isInteger(data.correctOption) || data.correctOption < 0 || data.correctOption >= Math.max(opts.length, 1)) {
        throw new ApiError(400, 'correctOption is out of range');
      }
    } else if (!isDraft) throw new ApiError(400, 'MCQ needs a correct option');
  }
  if (data.type === 'truefalse' && !isDraft && typeof data.correctBool !== 'boolean') {
    throw new ApiError(400, 'True/false needs the correct answer');
  }
}

export async function addQuestion(user, assessmentId, data) {
  const a = await ownAssessment(user, assessmentId);
  if (a.status !== 'draft') throw new ApiError(400, 'Questions can only be edited in draft status');
  validateQuestionInput(data);
  const order = await Question.countDocuments({ assessment: a._id });
  const q = await Question.create({
    assessment: a._id,
    type: data.type,
    text: data.text.trim(),
    topic: (data.topic || a.topic || '').trim(),
    options: data.type === 'mcq' ? data.options.map((o) => o.toString().trim()).filter(Boolean) : [],
    correctOption: data.type === 'mcq' ? data.correctOption : null,
    correctBool: data.type === 'truefalse' ? data.correctBool : null,
    modelAnswer: data.type === 'short' ? (data.modelAnswer || '') : '',
    explanation: data.explanation || '',
    marks: data.marks || 1,
    order,
  });
  await recomputeTotal(a._id);
  return shapeQuestion(q, { reveal: true });
}

export async function patchQuestion(user, assessmentId, questionId, data) {
  const a = await ownAssessment(user, assessmentId);
  if (a.status !== 'draft') throw new ApiError(400, 'Questions can only be edited in draft status');
  const q = await Question.findOne({ _id: questionId, assessment: a._id }).select('+correctOption +correctBool +modelAnswer');
  if (!q) throw new ApiError(404, 'Question not found');
  for (const k of ['text', 'topic', 'options', 'correctOption', 'correctBool', 'modelAnswer', 'explanation', 'marks', 'order']) {
    if (data[k] !== undefined) q[k] = data[k];
  }
  validateQuestionInput({ type: q.type, text: q.text, options: q.options, correctOption: q.correctOption, correctBool: q.correctBool }, true);
  await q.save();
  await recomputeTotal(a._id);
  return shapeQuestion(q, { reveal: true });
}

export async function deleteQuestion(user, assessmentId, questionId) {
  const a = await ownAssessment(user, assessmentId);
  if (a.status !== 'draft') throw new ApiError(400, 'Questions can only be edited in draft status');
  const q = await Question.findOneAndDelete({ _id: questionId, assessment: a._id });
  if (!q) throw new ApiError(404, 'Question not found');
  await recomputeTotal(a._id);
  return { id: questionId };
}

export async function reviewQuestion(user, assessmentId, questionId, { approved, edits }) {
  const a = await ownAssessment(user, assessmentId);
  if (a.status !== 'draft') throw new ApiError(400, 'Questions can only be reviewed in draft status');
  const q = await Question.findOne({ _id: questionId, assessment: a._id }).select('+correctOption +correctBool +modelAnswer');
  if (!q) throw new ApiError(404, 'Question not found');
  if (!q.aiGenerated) throw new ApiError(400, 'Only AI-drafted questions need review');
  if (edits) {
    for (const k of ['text', 'options', 'correctOption', 'correctBool', 'modelAnswer', 'explanation', 'marks', 'topic']) {
      if (edits[k] !== undefined) q[k] = edits[k];
    }
  }
  if (approved) {
    validateQuestionInput({ type: q.type, text: q.text, options: q.options, correctOption: q.correctOption, correctBool: q.correctBool });
    q.reviewed = true;
  } else {
    await q.deleteOne();
    await recomputeTotal(a._id);
    return { rejected: true, id: questionId };
  }
  await q.save();
  await recomputeTotal(a._id);
  return shapeQuestion(q, { reveal: true });
}

// ---------- AI draft (never fabricates: 503 when AI unavailable) ----------
function validateDraftJSON(obj) {
  if (!obj || !Array.isArray(obj.questions) || obj.questions.length === 0) throw new Error('AI returned no questions');
  if (obj.questions.length > 20) throw new Error('AI returned too many questions');
  return obj.questions.map((t, i) => {
    if (!QUESTION_TYPES.includes(t.type)) throw new Error(`Q${i}: bad type`);
    const text = String(t.text || '').trim().slice(0, 2000);
    if (!text) throw new Error(`Q${i}: empty text`);
    const marks = Math.min(100, Math.max(0.5, Number(t.marks) || 1));
    const base = { type: t.type, text, topic: String(t.topic || '').slice(0, 200), explanation: String(t.explanation || '').slice(0, 2000), marks };
    if (t.type === 'mcq') {
      const options = (t.options || []).map((o) => String(o).trim()).filter(Boolean).slice(0, 6);
      if (options.length < 2) throw new Error(`Q${i}: MCQ needs 2+ options`);
      const correctOption = Number(t.correctOption ?? t.answer);
      if (!Number.isInteger(correctOption) || correctOption < 0 || correctOption >= options.length) throw new Error(`Q${i}: bad correct option`);
      return { ...base, options, correctOption };
    }
    if (t.type === 'truefalse') {
      if (typeof t.correctBool !== 'boolean' && typeof t.answer !== 'boolean') throw new Error(`Q${i}: missing boolean answer`);
      return { ...base, correctBool: Boolean(t.correctBool ?? t.answer) };
    }
    return { ...base, modelAnswer: String(t.modelAnswer || t.answer || '').slice(0, 2000) };
  });
}

export async function draftQuestions(user, assessmentId, { topic, count = 5, resourceId }) {
  const a = await ownAssessment(user, assessmentId);
  if (a.status !== 'draft') throw new ApiError(400, 'Drafts can only be added in draft status');
  const n = Math.min(10, Math.max(1, Number(count) || 5));
  let context = `Subject: ${a.subject}. Topic: ${topic || a.topic || 'general syllabus'}.`;
  if (resourceId) {
    const r = await Resource.findById(resourceId).select('+extractedText title subject topic');
    if (!r || (!isAdminRole(user.role) && r.owner.toString() !== user._id.toString() && r.status !== 'approved')) {
      throw new ApiError(404, 'Source material not found');
    }
    const text = `${r.title}\n${r.topic}\n${r.description || ''}\n${r.extractedText || ''}`.slice(0, 6000);
    context += `\nSOURCE MATERIAL:\n${text}`;
  }
  let items;
  try {
    if (env.aiProvider === 'mock') throw new Error('AI provider is mock');
    const raw = await generateJSON(
      `Draft ${n} practice questions as JSON {"questions":[{type ("mcq"|"truefalse"|"short"), text, topic, options[] (mcq only, 4), correctOption (0-based, mcq), correctBool (truefalse), modelAnswer (short), explanation, marks}]}. Mix types. ${context} Reply JSON only.`,
      { system: 'You draft exam questions. Reply with valid JSON only.' }
    );
    items = validateDraftJSON(extractJSON(raw));
  } catch (err) {
    // Honest failure — never invent questions and label them AI-made.
    throw new ApiError(503, `AI drafting unavailable (${err.message}). Add questions manually.`);
  }
  const startOrder = await Question.countDocuments({ assessment: a._id });
  const docs = await Question.insertMany(
    items.map((t, i) => ({
      assessment: a._id,
      ...t,
      options: t.options || [],
      order: startOrder + i,
      aiGenerated: true,
      reviewed: false,
    }))
  );
  await recomputeTotal(a._id);
  return docs.map((d) => d.toObject());
}

// ---------- Student: discover + attempts ----------
export async function listAvailable(user) {
  const items = await Assessment.find({ status: 'published' }).populate('owner', 'name').sort({ deadline: 1 }).lean();
  const visible = items.filter((a) => canStudentSee(user, { ...a, assignees: a.assignees || [] }));
  const withState = await Promise.all(
    visible.map(async (a) => {
      const attempts = await Attempt.countDocuments({ user: user._id, assessment: a._id, status: { $ne: 'in-progress' } });
      const inProgress = await Attempt.findOne({ user: user._id, assessment: a._id, status: 'in-progress' }).select('_id');
      const questions = await Question.countDocuments({ assessment: a._id });
      const { assignees: _drop, ...rest } = a;
      return { ...rest, questionCount: questions, attemptsUsed: attempts, attemptsLeft: Math.max(0, a.maxAttempts - attempts), resumeId: inProgress?._id || null };
    })
  );
  return withState;
}

export async function startAttempt(user, assessmentId) {
  if (user.role !== 'student') throw new ApiError(403, 'Only students take assessments');
  const a = await Assessment.findById(assessmentId);
  if (!a || !canStudentSee(user, a)) throw new ApiError(404, 'Assessment not available');
  if (a.deadline && new Date() > new Date(a.deadline)) throw new ApiError(400, 'Deadline has passed');
  const used = await Attempt.countDocuments({ user: user._id, assessment: a._id, status: { $ne: 'in-progress' } });
  const existing = await Attempt.findOne({ user: user._id, assessment: a._id, status: 'in-progress' });
  if (existing) {
    if (existing.expiresAt && new Date() > existing.expiresAt) {
      existing.status = 'submitted';
      existing.submittedAt = new Date();
      await existing.save();
      await gradeAttempt(existing._id);
      throw new ApiError(400, 'Previous attempt expired and was auto-submitted. Start a new one if attempts remain.');
    }
    // Include questions so re-entering an in-progress attempt renders them.
    const existingQs = await Question.find({ assessment: a._id }).sort({ order: 1 }).select('-correctOption -correctBool -modelAnswer -explanation');
    return attemptView(existing, a, false, existingQs);
  }
  if (used >= a.maxAttempts) throw new ApiError(400, 'No attempts left (retakes exhausted)');
  const questions = await Question.find({ assessment: a._id }).sort({ order: 1 }).select('-correctOption -correctBool -modelAnswer -explanation');
  const attemptNo = used + 1;
  const attempt = await Attempt.create({
    user: user._id,
    assessment: a._id,
    attemptNo,
    answers: questions.map((q) => ({ question: q._id })),
    maxScore: a.totalMarks,
    expiresAt: a.durationMin > 0 ? new Date(Date.now() + a.durationMin * 60000) : null,
  });
  return attemptView(attempt, a, false, questions);
}

async function loadAttempt(user, attemptId, { includeAssessment = true } = {}) {
  const attempt = await Attempt.findOne({ _id: attemptId, user: user._id });
  if (!attempt) throw new ApiError(404, 'Attempt not found');
  const a = includeAssessment ? await Assessment.findById(attempt.assessment) : null;
  if (includeAssessment && !a) throw new ApiError(404, 'Assessment not found');
  return { attempt, assessment: a };
}

function attemptView(attempt, assessment, reveal, questions = null) {
  return {
    _id: attempt._id,
    status: attempt.status,
    attemptNo: attempt.attemptNo,
    startedAt: attempt.startedAt,
    expiresAt: attempt.expiresAt,
    serverNow: new Date(),
    timeLeftSec: attempt.expiresAt ? Math.max(0, Math.round((new Date(attempt.expiresAt) - Date.now()) / 1000)) : null,
    score: attempt.score,
    maxScore: attempt.maxScore,
    accuracy: attempt.accuracy,
    submittedAt: attempt.submittedAt,
    timeSpentSec: attempt.timeSpentSec,
    assessment: assessment ? { _id: assessment._id, title: assessment.title, durationMin: assessment.durationMin, deadline: assessment.deadline, releaseMode: assessment.releaseMode } : undefined,
    questions,
    answers: attempt.answers,
  };
}

function ensureWritable(attempt, assessment) {
  if (attempt.status !== 'in-progress') throw new ApiError(400, 'Attempt already submitted — duplicate submissions are rejected');
  if (attempt.expiresAt && new Date() > new Date(attempt.expiresAt)) throw new ApiError(400, 'Time expired for this attempt');
  if (assessment.status === 'archived') throw new ApiError(400, 'Assessment is archived');
  if (assessment.deadline && new Date() > new Date(assessment.deadline)) throw new ApiError(400, 'Deadline has passed');
}

export async function autosave(user, attemptId, answers) {
  const { attempt, assessment } = await loadAttempt(user, attemptId);
  ensureWritable(attempt, assessment);
  const validQs = new Set((await Question.find({ assessment: assessment._id }).select('_id')).map((q) => q._id.toString()));
  for (const ans of answers || []) {
    if (!ans.question || !validQs.has(ans.question.toString())) continue;
    const slot = attempt.answers.find((s) => s.question.toString() === ans.question.toString());
    if (!slot) continue;
    if (ans.selectedOption !== undefined) slot.selectedOption = ans.selectedOption;
    if (ans.boolAnswer !== undefined) slot.boolAnswer = ans.boolAnswer;
    if (ans.textAnswer !== undefined) slot.textAnswer = String(ans.textAnswer).slice(0, 5000);
  }
  attempt.autosavedAt = new Date();
  await attempt.save();
  return { autosavedAt: attempt.autosavedAt };
}

export async function gradeAttempt(attemptId) {
  const attempt = await Attempt.findById(attemptId);
  if (!attempt) return null;
  const questions = await Question.find({ assessment: attempt.assessment }).select('+correctOption +correctBool +modelAnswer');
  const byId = new Map(questions.map((q) => [q._id.toString(), q]));
  let score = 0;
  let autoTotal = 0;
  let autoGot = 0;
  let pending = false;
  for (const ans of attempt.answers) {
    const q = byId.get(ans.question.toString());
    if (!q) continue;
    if (q.type === 'mcq') {
      autoTotal += q.marks;
      ans.isCorrect = ans.selectedOption !== null && ans.selectedOption === q.correctOption;
      ans.marksAwarded = ans.isCorrect ? q.marks : 0;
      ans.needsGrading = false;
      autoGot += ans.marksAwarded;
      score += ans.marksAwarded;
    } else if (q.type === 'truefalse') {
      autoTotal += q.marks;
      ans.isCorrect = ans.boolAnswer !== null && ans.boolAnswer === q.correctBool;
      ans.marksAwarded = ans.isCorrect ? q.marks : 0;
      ans.needsGrading = false;
      autoGot += ans.marksAwarded;
      score += ans.marksAwarded;
    } else {
      ans.needsGrading = true;
      ans.isCorrect = null;
      pending = true;
    }
  }
  attempt.score = Math.round(score * 100) / 100;
  attempt.accuracy = autoTotal ? Math.round((autoGot / autoTotal) * 100) : 0;
  attempt.status = pending ? 'submitted' : 'graded';
  await attempt.save();
  return attempt;
}

export async function submitAttempt(user, attemptId, answers) {
  const { attempt, assessment } = await loadAttempt(user, attemptId);
  ensureWritable(attempt, assessment);
  if (answers) {
    // reuse autosave validation, then submit
    const validQs = new Set((await Question.find({ assessment: assessment._id }).select('_id')).map((q) => q._id.toString()));
    for (const ans of answers) {
      if (!ans.question || !validQs.has(ans.question.toString())) continue;
      const slot = attempt.answers.find((s) => s.question.toString() === ans.question.toString());
      if (!slot) continue;
      if (ans.selectedOption !== undefined) slot.selectedOption = ans.selectedOption;
      if (ans.boolAnswer !== undefined) slot.boolAnswer = ans.boolAnswer;
      if (ans.textAnswer !== undefined) slot.textAnswer = String(ans.textAnswer).slice(0, 5000);
    }
  }
  // all questions must have some response (assignments may allow skip? enforce for tests)
  attempt.status = 'submitted';
  attempt.submittedAt = new Date();
  attempt.timeSpentSec = Math.round((attempt.submittedAt - attempt.startedAt) / 1000);
  await attempt.save();
  await gradeAttempt(attempt._id);
  return getAttemptResult(user, attemptId);
}

export async function getAttemptResult(user, attemptId) {
  const { attempt, assessment } = await loadAttempt(user, attemptId);
  if (attempt.status === 'in-progress') {
    const questions = await Question.find({ assessment: assessment._id }).sort({ order: 1 }).select('-correctOption -correctBool -modelAnswer -explanation');
    return attemptView(attempt, assessment, false, questions);
  }
  const reveal = releasedFor(assessment);
  const questions = await Question.find({ assessment: assessment._id }).sort({ order: 1 }).select('+correctOption +correctBool +modelAnswer');
  const shaped = questions.map((q) => shapeQuestion(q, { reveal: reveal && assessment.showExplanations ? true : reveal }));
  // when revealed but explanations hidden, strip explanation text only
  const finalQs = shaped.map((q, i) => {
    const full = questions[i];
    let out = q;
    if (reveal && !assessment.showExplanations) {
      const { explanation: _drop, ...rest } = q;
      out = rest;
    }
    // Correct answers are returned ONLY after release — never before.
    if (reveal) {
      out.correct = full.type === 'mcq' ? { option: full.correctOption } : full.type === 'truefalse' ? { bool: full.correctBool } : { modelAnswer: full.modelAnswer };
    }
    return out;
  });
  return { ...attemptView(attempt, assessment, reveal), questions: finalQs, released: reveal };
}

export async function attemptHistory(user, assessmentId) {
  const a = await Assessment.findById(assessmentId);
  if (!a) throw new ApiError(404, 'Assessment not found');
  const attempts = await Attempt.find({ user: user._id, assessment: assessmentId }).sort({ attemptNo: 1 }).select('-answers');
  const used = attempts.filter((t) => t.status !== 'in-progress').length;
  return { attempts, attemptsUsed: used, attemptsLeft: Math.max(0, a.maxAttempts - used), released: releasedFor(a) };
}

// ---------- Educator: manual grading ----------
export async function needsGradingQueue(user, assessmentId) {
  const a = await ownAssessment(user, assessmentId);
  const attempts = await Attempt.find({ assessment: a._id, status: 'submitted' }).populate('user', 'name email').sort({ submittedAt: 1 });
  const questions = await Question.find({ assessment: a._id }).select('marks text type');
  const marksByQ = new Map(questions.map((q) => [q._id.toString(), { marks: q.marks, text: q.text, type: q.type }]));
  return attempts.map((t) => ({
    ...t.toObject(),
    pending: t.answers.filter((x) => x.needsGrading).map((x) => ({ ...x.toObject?.() ?? x, max: marksByQ.get(x.question.toString())?.marks ?? 0, qtext: marksByQ.get(x.question.toString())?.text ?? '' })),
  }));
}

// Owner-visible full question bodies (answers included — educators only,
// never exposed on student paths).
export async function listOwnerQuestions(user, assessmentId) {
  const a = await ownAssessment(user, assessmentId);
  const qs = await Question.find({ assessment: a._id }).sort({ order: 1 }).select('+correctOption +correctBool +modelAnswer');
  return qs;
}

export async function gradeShortAnswer(user, attemptId, questionId, { marks, feedback }) {
  const attempt = await Attempt.findById(attemptId).populate('assessment');
  if (!attempt) throw new ApiError(404, 'Attempt not found');
  const a = await ownAssessment(user, attempt.assessment._id || attempt.assessment);
  const q = await Question.findOne({ _id: questionId, assessment: a._id });
  if (!q) throw new ApiError(404, 'Question not found');
  if (q.type !== 'short') throw new ApiError(400, 'Only short answers need manual grading');
  if (marks < 0 || marks > q.marks) throw new ApiError(400, `Marks must be 0-${q.marks}`);
  const ans = attempt.answers.find((s) => s.question.toString() === questionId.toString());
  if (!ans) throw new ApiError(404, 'Answer not found');
  ans.marksAwarded = marks;
  ans.isCorrect = marks >= q.marks / 2;
  ans.needsGrading = false;
  ans.feedback = (feedback || '').slice(0, 1000);
  await attempt.save();
  attempt.score = Math.round(attempt.answers.reduce((s, x) => s + (x.marksAwarded || 0), 0) * 100) / 100;
  const stillPending = attempt.answers.some((x) => x.needsGrading);
  attempt.status = stillPending ? 'submitted' : 'graded';
  await attempt.save();
  return attempt;
}

// ---------- Analytics ----------
export async function assessmentAnalytics(user, assessmentId) {
  const a = await ownAssessment(user, assessmentId);
  const attempts = await Attempt.find({ assessment: a._id, status: { $ne: 'in-progress' } }).populate('user', 'name email');
  const questions = await Question.find({ assessment: a._id }).sort({ order: 1 });
  const scores = attempts.map((t) => t.score);
  const byTopic = {};
  for (const t of attempts) {
    for (const ans of t.answers) {
      const q = questions.find((qq) => qq._id.toString() === ans.question.toString());
      const topic = q?.topic || a.topic || 'general';
      byTopic[topic] = byTopic[topic] || { attempted: 0, correct: 0, marks: 0, max: 0 };
      byTopic[topic].attempted += 1;
      byTopic[topic].marks += ans.marksAwarded || 0;
      byTopic[topic].max += q?.marks || 0;
      if (ans.isCorrect) byTopic[topic].correct += 1;
    }
  }
  const perTopic = Object.entries(byTopic).map(([topic, v]) => ({
    topic,
    attempted: v.attempted,
    accuracy: v.attempted ? Math.round((v.correct / v.attempted) * 100) : 0,
    avgScore: v.max ? Math.round((v.marks / v.max) * 100) : 0,
  }));
  const perQuestion = questions.map((q) => {
    let correct = 0;
    let answered = 0;
    for (const t of attempts) {
      const ans = t.answers.find((x) => x.question.toString() === q._id.toString());
      if (!ans) continue;
      if (q.type === 'short' && ans.needsGrading) continue;
      answered += 1;
      if (ans.isCorrect) correct += 1;
    }
    return { questionId: q._id, text: q.text.slice(0, 120), type: q.type, answered, accuracy: answered ? Math.round((correct / answered) * 100) : 0 };
  });
  return {
    attempts: attempts.length,
    avgScore: scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 100) / 100 : 0,
    maxScore: a.totalMarks,
    avgAccuracy: attempts.length ? Math.round(attempts.reduce((s, t) => s + t.accuracy, 0) / attempts.length) : 0,
    avgTimeSec: attempts.length ? Math.round(attempts.reduce((s, t) => s + (t.timeSpentSec || 0), 0) / attempts.length) : 0,
    perTopic,
    perQuestion,
    recent: attempts.slice(-10).reverse().map((t) => ({ user: t.user, score: t.score, accuracy: t.accuracy, submittedAt: t.submittedAt })),
  };
}

export async function studentPerformance(user) {
  const attempts = await Attempt.find({ user: user._id, status: { $ne: 'in-progress' } }).populate('assessment', 'title subject topic').sort({ submittedAt: 1 });
  const byTopic = {};
  for (const t of attempts) {
    const key = t.assessment?.topic || t.assessment?.subject || 'general';
    byTopic[key] = byTopic[key] || { attempts: 0, totalScore: 0, totalAcc: 0 };
    byTopic[key].attempts += 1;
    byTopic[key].totalScore += t.score;
    byTopic[key].totalAcc += t.accuracy;
  }
  return {
    totalAttempts: attempts.length,
    avgAccuracy: attempts.length ? Math.round(attempts.reduce((s, t) => s + t.accuracy, 0) / attempts.length) : 0,
    history: attempts.map((t) => ({ assessment: t.assessment, score: t.score, maxScore: t.maxScore, accuracy: t.accuracy, timeSpentSec: t.timeSpentSec, submittedAt: t.submittedAt })),
    byTopic: Object.entries(byTopic).map(([topic, v]) => ({ topic, attempts: v.attempts, avgScore: Math.round((v.totalScore / v.attempts) * 100) / 100, avgAccuracy: Math.round(v.totalAcc / v.attempts) })),
  };
}
