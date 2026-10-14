import { env } from '../config/env.js';
import { StudentProfile } from '../models/StudentProfile.js';
import { Subject } from '../models/Subject.js';
import { Topic } from '../models/Topic.js';
import { Goal } from '../models/Goal.js';
import { Diagnostic } from '../models/Diagnostic.js';
import { StudyPlan } from '../models/StudyPlan.js';
import { PlanTask, TASK_KIND } from '../models/PlanTask.js';
import { ApiError } from '../utils/ApiError.js';
import { generateJSON, extractJSON } from './ai.service.js';

const DAY_MS = 86400000;
const MAX_PLAN_DAYS = 42; // bound generated horizon; longer prep compresses priorities
const MAX_TASKS = 500;
const AI_MAX_ATTEMPTS = 2;

// Effective planner limits: Setting overrides (admin-configured) with safe
// clamping, falling back to built-in constants. Cached briefly to avoid a
// settings lookup on every generation step.
let limitsCache = { at: 0, value: null };
export async function getPlannerLimits() {
  if (Date.now() - limitsCache.at < 60000 && limitsCache.value) return limitsCache.value;
  let value = { maxDays: MAX_PLAN_DAYS, maxTasks: MAX_TASKS };
  try {
    const { Setting } = await import('../models/Setting.js');
    const docs = await Setting.find({ key: { $in: ['plan.maxDays', 'plan.maxTasks'] } }).lean();
    for (const d of docs) {
      const n = Number(d.value);
      if (!Number.isFinite(n)) continue;
      if (d.key === 'plan.maxDays') value.maxDays = Math.min(120, Math.max(7, Math.round(n)));
      if (d.key === 'plan.maxTasks') value.maxTasks = Math.min(2000, Math.max(50, Math.round(n)));
    }
  } catch {
    // settings unavailable — use built-in defaults
  }
  limitsCache = { at: Date.now(), value };
  return value;
}

const toDay = (d) => new Date(d).toISOString().slice(0, 10);
const todayDay = () => toDay(new Date());

// ---------- Snapshot ----------
async function buildSnapshot(user, { subjectIds, examDate, targetScore, dailyHours, weeklyHours }) {
  const subjects = await Subject.find({ _id: { $in: subjectIds }, user: user._id }).lean();
  if (subjects.length !== subjectIds.length) throw new ApiError(404, 'One or more subjects not found');
  const topics = await Topic.find({ user: user._id, subject: { $in: subjectIds } }).lean();
  const [profile, goals, diags] = await Promise.all([
    StudentProfile.findOne({ user: user._id }).lean(),
    Goal.find({ user: user._id }).sort({ targetDate: 1 }).lean(),
    Diagnostic.find({ user: user._id, submitted: true }).sort({ createdAt: -1 }).lean(),
  ]);
  const diagBySubject = new Map();
  for (const d of diags) {
    const key = (d.subject?._id || d.subject || d.subjectName || '').toString();
    if (!diagBySubject.has(key)) diagBySubject.set(key, d);
  }
  const completed = topics.filter((t) => t.status === 'completed').length;
  return {
    examDate: toDay(examDate),
    targetScore,
    dailyHours,
    weeklyHours: weeklyHours || Math.min(112, Math.round(dailyHours * 7 * 10) / 10),
    learningStyle: profile?.learningStyle || 'mixed',
    subjects: subjects.map((s) => ({ id: s._id.toString(), name: s.name })),
    topics: topics.map((t) => ({
      id: t._id.toString(),
      subject: t.subject.toString(),
      title: t.title,
      status: t.status,
      difficulty: t.difficulty,
      confidence: t.confidence,
    })),
    completedTopics: completed,
    pendingTopics: topics.length - completed,
    diagnostics: [...diagBySubject.values()].map((d) => ({
      subject: d.subjectName,
      scorePct: d.scorePct,
      level: d.level,
    })),
    goals: goals.map((g) => ({ title: g.title, targetDate: toDay(g.targetDate) })),
  };
}

// ---------- Priority + rule-based timetable ----------
function priorityOf(t, diagLevel) {
  let score = 0;
  if (t.status === 'completed') return -1000; // revision-only
  if (t.status === 'in-progress') score += 3;
  if (t.status === 'not-started') score += 5;
  if (t.difficulty === 'hard') score += 4;
  else if (t.difficulty === 'medium') score += 2;
  score += (6 - t.confidence) * 1.5; // low confidence first
  if (diagLevel === 'beginner') score += 4;
  else if (diagLevel === 'intermediate') score += 2;
  return score;
}

function objectiveFor(kind, topicTitle, style) {
  const how = style === 'visual' ? 'a diagram from memory' : style === 'auditory' ? 'a 2-minute spoken recap' : style === 'reading' ? 'a half-page written summary' : '5 flashcards';
  switch (kind) {
    case 'learn':
      return `Explain "${topicTitle}" without notes and produce ${how}`;
    case 'revision':
      return `Recall "${topicTitle}" — spaced recall, fix 3 gaps`;
    case 'practice-test':
      return `Timed set on "${topicTitle}": 10 questions, review every miss`;
    case 'break':
      return 'Step away — hydrate, stretch, rest eyes';
    default:
      return `Make progress on "${topicTitle}"`;
  }
}

/**
 * Deterministic fallback: prioritizes weak/unfinished topics, respects the
 * daily/weekly minute budgets, mixes learn + revision + weekly practice tests
 * + breaks. Never allocates more minutes per day than the budget allows.
 */
export function buildRuleBasedPlan(snap, limits = {}) {
  const maxDays = limits.maxDays ?? MAX_PLAN_DAYS;
  const maxTasks = limits.maxTasks ?? MAX_TASKS;
  const start = new Date(`${todayDay()}T00:00:00Z`).getTime() + DAY_MS; // start tomorrow
  const exam = new Date(`${snap.examDate}T00:00:00Z`).getTime();
  let days = Math.max(1, Math.round((exam - start) / DAY_MS) + 1);
  const compressed = days > maxDays;
  if (compressed) days = maxDays;

  const dayBudget = Math.round(snap.dailyHours * 60);
  const weekBudget = Math.round(snap.weeklyHours * 60);
  const subjName = (t) => snap.subjects.find((s) => s.id === t.subject)?.name || 'General';
  const diagLevel = (name) => snap.diagnostics.find((d) => d.subject === name)?.level;

  const pending = snap.topics
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => priorityOf(b, diagLevel(subjName(b))) - priorityOf(a, diagLevel(subjName(a))));
  const done = snap.topics.filter((t) => t.status === 'completed');

  const queue = [...pending];
  const tasks = [];
  let weekMin = 0;
  let weekIdx = 0;
  let topicCursor = 0;

  const push = (day, kind, topic, minutes, startMin) => {
    tasks.push({
      subjectName: topic ? subjName(topic) : null,
      topicTitle: topic?.title || (kind === 'practice-test' ? 'Mixed practice set' : kind === 'break' ? 'Break' : 'Study block'),
      kind,
      date: day,
      startMin,
      durationMin: minutes,
      title:
        kind === 'break'
          ? 'Break'
          : kind === 'practice-test'
            ? `Practice test — ${topic ? subjName(topic) : 'mixed subjects'}`
            : `${kind === 'revision' ? 'Revise' : 'Learn'}: ${topic.title}`,
      objective: objectiveFor(kind, topic?.title || 'the syllabus', snap.learningStyle),
      _topicId: topic?.id || null,
    });
  };

  for (let d = 0; d < days && tasks.length < maxTasks; d += 1) {
    if (d % 7 === 0) {
      weekMin = 0;
      weekIdx += 1;
    }
    const day = toDay(start + d * DAY_MS);
    let used = 0;
    let clock = 540; // 09:00
    const remainingWeek = weekBudget - weekMin;
    const budget = Math.min(dayBudget, Math.max(0, remainingWeek));
    if (budget < 30) continue; // weekly cap reached — rest day

    const take = (minutes) => {
      if (used + minutes > budget) return 0;
      used += minutes;
      weekMin += minutes;
      const s = clock;
      clock += minutes;
      return s;
    };

    // Weekly practice test on day 7 of each week (or last day of short plans).
    const isTestDay = (d + 1) % 7 === 0 || (days < 7 && d === days - 1);
    if (isTestDay && queue.length + done.length > 0) {
      const t = queue[topicCursor % Math.max(1, queue.length)] || done[0] || null;
      const s = take(45);
      if (s) push(day, 'practice-test', t, 45, s);
    }

    // Fill the day: rotate through weak topics (learn), sprinkle revision.
    // cursor persists across days so every topic gets covered over the plan.
    let guard = 0;
    while (used + 30 <= budget && tasks.length < maxTasks && guard < 12) {
      guard += 1;
      const pool = queue.length > 0 ? queue : done;
      if (pool.length === 0) break;
      const topic = pool[topicCursor % pool.length];
      topicCursor += 1;
      const kind = topic.status === 'completed' || topicCursor % 3 === 0 ? 'revision' : 'learn';
      const minutes = kind === 'revision' ? 30 : topic.difficulty === 'hard' ? 60 : 45;
      if (used + minutes > budget) break;
      const s = take(minutes);
      push(day, kind, topic, minutes, s);
      // Short break after each study block when room remains.
      if (used + 10 <= budget) {
        const bs = take(10);
        push(day, 'break', null, 10, bs);
      }
    }
  }

  return {
    tasks,
    note: compressed
      ? `Exam is far out — generated the first ${maxDays} days. Regenerate as the exam nears for the next block.`
      : tasks.length === 0
        ? 'No topics to schedule. Add topics first.'
        : `Covers ${days} day(s) within ${snap.dailyHours}h/day and ${snap.weeklyHours}h/week budgets.`,
  };
}

// ---------- AI attempt + strict validation ----------
// Exported for regression tests: strict validation of AI plan JSON.
export function validatePlanJSON(obj, snap, limits = {}) {
  const maxTasks = limits.maxTasks ?? MAX_TASKS;
  if (!obj || !Array.isArray(obj.tasks) || obj.tasks.length === 0) throw new Error('AI returned no tasks');
  if (obj.tasks.length > maxTasks) throw new Error('AI returned too many tasks');
  const subjectNames = new Set(snap.subjects.map((s) => s.name));
  const dayBudget = Math.round(snap.dailyHours * 60);
  const perDay = new Map();
  const cleaned = obj.tasks.map((t, i) => {
    const kind = TASK_KIND.includes(t.kind) ? t.kind : 'learn';
    const date = typeof t.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.date) ? t.date : null;
    if (!date) throw new Error(`Task ${i}: bad date`);
    if (date <= todayDay() || date > snap.examDate) throw new Error(`Task ${i}: date outside plan window`);
    const durationMin = Number(t.durationMin);
    if (!Number.isFinite(durationMin) || durationMin < 5 || durationMin > 240) throw new Error(`Task ${i}: bad duration`);
    const startMin = Number(t.startMin ?? 540);
    if (!Number.isFinite(startMin) || startMin < 0 || startMin > 1439) throw new Error(`Task ${i}: bad startMin`);
    if (t.subjectName && !subjectNames.has(t.subjectName)) throw new Error(`Task ${i}: unknown subject`);
    const title = String(t.title || '').slice(0, 200) || `Study block ${i + 1}`;
    perDay.set(date, (perDay.get(date) || 0) + durationMin);
    return {
      subjectName: t.subjectName || null,
      topicTitle: String(t.topicTitle || t.title || '').slice(0, 200),
      kind,
      date,
      startMin,
      durationMin,
      title,
      objective: String(t.objective || '').slice(0, 500) || 'Make measurable progress',
    };
  });
  for (const [day, mins] of perDay) {
    if (mins > dayBudget) throw new Error(`AI over-allocated ${day}: ${mins}min > ${dayBudget}min budget`);
  }
  return cleaned;
}

async function tryAIPlan(snap, limits = {}) {
  const maxTasks = limits.maxTasks ?? MAX_TASKS;
  const prompt = `Create a personalized study timetable as JSON. Constraints: exam date ${snap.examDate}, ${snap.dailyHours}h/day, ${snap.weeklyHours}h/week. Prioritize weak, unfinished, deadline-relevant topics. Mix learn/revision/practice-test/break kinds. Every task: {subjectName, topicTitle, kind, date (YYYY-MM-DD, after today, on/before exam), startMin (0-1439), durationMin (5-240), title, objective (measurable)}. Daily totals must not exceed the daily budget. Keep total tasks under ${Math.min(200, maxTasks)}.\n\nSTUDENT DATA:\n${JSON.stringify(snap).slice(0, 12000)}\n\nReply with {"tasks": [...]} only.`;
  let lastErr = null;
  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    try {
      const raw = await generateJSON(prompt, {
        system: 'You are StudyAI planner. Reply with valid JSON only: {"tasks": [...]}.',
      });
      return validatePlanJSON(extractJSON(raw), snap, limits);
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('AI unavailable');
}

// ---------- Persistence ----------
async function archiveActive(userId) {
  const active = await StudyPlan.find({ user: userId, status: 'active' });
  for (const p of active) {
    p.status = 'archived';
    await p.save();
  }
  return active.length;
}

export async function recalculatePlan(planId, userId) {
  const plan = await StudyPlan.findOne({ _id: planId, user: userId });
  if (!plan) throw new ApiError(404, 'Study plan not found');
  const agg = await PlanTask.aggregate([
    { $match: { plan: plan._id } },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
        minutes: { $sum: '$durationMin' },
      },
    },
  ]);
  const by = new Map(agg.map((a) => [a._id, a]));
  plan.totalTasks = (by.get('pending')?.count || 0) + (by.get('completed')?.count || 0) + (by.get('skipped')?.count || 0);
  plan.completedTasks = by.get('completed')?.count || 0;
  plan.skippedTasks = by.get('skipped')?.count || 0;
  const remaining = await PlanTask.aggregate([
    { $match: { plan: plan._id, status: 'pending' } },
    { $group: { _id: null, minutes: { $sum: '$durationMin' } } },
  ]);
  plan.totalMinutes = agg.reduce((s, a) => s + a.minutes, 0);
  plan.remainingMinutes = remaining[0]?.minutes || 0;
  await plan.save();
  return plan;
}

function resolveSubjectTopicIds(tasks, snap, subjectDocs, topicDocs) {
  const subjByName = new Map(subjectDocs.map((s) => [s.name, s._id]));
  const topicByTitle = new Map(topicDocs.map((t) => [t.title.toLowerCase(), t._id]));
  return tasks.map((t) => ({
    subject: t.subjectName ? subjByName.get(t.subjectName) || null : null,
    topic: t.topicTitle ? topicByTitle.get(t.topicTitle.toLowerCase()) || null : null,
    title: t.title,
    objective: t.objective,
    kind: t.kind,
    date: t.date,
    startMin: t.startMin,
    durationMin: t.durationMin,
  }));
}

// ---------- Public API ----------
export async function generatePlan(user, input) {
  const subjectIds = input.subjectIds?.length
    ? input.subjectIds
    : (await Subject.find({ user: user._id }).select('_id').lean()).map((s) => s._id.toString());
  if (subjectIds.length === 0) throw new ApiError(400, 'Add at least one subject before generating a plan');

  const examDate = new Date(input.examDate);
  if (Number.isNaN(examDate.getTime()) || toDay(examDate) <= todayDay()) {
    throw new ApiError(400, 'Exam date must be a future date');
  }
  const weeklyHours = input.weeklyHours ?? Math.round(input.dailyHours * 7 * 10) / 10;
  if (weeklyHours > input.dailyHours * 7 + 1e-9) {
    throw new ApiError(400, `Weekly hours (${weeklyHours}) exceed 7 × daily hours (${input.dailyHours})`);
  }

  const existing = await StudyPlan.findOne({ user: user._id, status: 'active' });
  if (existing && !input.force) {
    throw new ApiError(409, 'An active plan already exists. Regenerate to create a new version, or pass force:true.');
  }

  const snap = await buildSnapshot(user, {
    subjectIds,
    examDate,
    targetScore: input.targetScore,
    dailyHours: input.dailyHours,
    weeklyHours,
  });
  if (snap.topics.length === 0) throw new ApiError(400, 'No syllabus topics found for these subjects. Add topics first.');

  let built;
  let source = 'rule-based';
  const limits = await getPlannerLimits();
  try {
    if (env.aiProvider !== 'mock') {
      built = { tasks: await tryAIPlan(snap, limits), note: 'Generated with AI and validated against your time budgets.' };
      source = 'ai';
    } else {
      throw new Error('mock provider');
    }
  } catch {
    const rule = buildRuleBasedPlan(snap, limits);
    built = rule;
    source = 'rule-based';
  }

  if (input.force || existing) await archiveActive(user._id);
  const version = existing ? existing.version + 1 : 1;
  const subjectDocs = await Subject.find({ _id: { $in: subjectIds } }).lean();
  const topicDocs = await Topic.find({ user: user._id, subject: { $in: subjectIds } }).lean();

  const plan = await StudyPlan.create({
    user: user._id,
    title: input.title || `Study plan — exam ${snap.examDate}`,
    examDate,
    targetScore: input.targetScore,
    dailyHours: input.dailyHours,
    weeklyHours,
    subjects: subjectIds,
    version,
    status: 'active',
    source,
    note: built.note || '',
  });

  const docs = resolveSubjectTopicIds(built.tasks, snap, subjectDocs, topicDocs).map((t) => ({
    user: user._id,
    plan: plan._id,
    ...t,
  }));
  await PlanTask.insertMany(docs);
  await recalculatePlan(plan._id, user._id);
  const fresh = await StudyPlan.findById(plan._id).populate('subjects', 'name').lean();
  const tasks = await PlanTask.find({ plan: plan._id }).sort({ date: 1, startMin: 1 }).lean();
  return { plan: fresh, tasks, source };
}

export async function regeneratePlan(user, planId) {
  const plan = await StudyPlan.findOne({ _id: planId, user: user._id });
  if (!plan) throw new ApiError(404, 'Study plan not found');
  const result = await generatePlan(user, {
    examDate: plan.examDate,
    targetScore: plan.targetScore,
    subjectIds: plan.subjects.map((s) => s.toString()),
    dailyHours: plan.dailyHours,
    weeklyHours: plan.weeklyHours,
    title: plan.title,
    force: true,
  });
  return result;
}

export async function listPlans(user) {
  return StudyPlan.find({ user: user._id }).populate('subjects', 'name').sort({ status: 1, version: -1 });
}

export async function getPlan(user, planId) {
  const plan = await StudyPlan.findOne({ _id: planId, user: user._id }).populate('subjects', 'name').lean();
  if (!plan) throw new ApiError(404, 'Study plan not found');
  const tasks = await PlanTask.find({ plan: plan._id }).populate('subject', 'name').sort({ date: 1, startMin: 1 }).lean();
  return { plan, tasks };
}

export async function planSummary(user, planId) {
  const { plan, tasks } = await getPlan(user, planId);
  const today = todayDay();
  const byDate = new Map();
  for (const t of tasks) {
    if (!byDate.has(t.date)) byDate.set(t.date, { total: 0, done: 0 });
    const d = byDate.get(t.date);
    d.total += 1;
    if (t.status === 'completed') d.done += 1;
  }
  const daily = [...byDate.entries()]
    .sort()
    .map(([date, v]) => ({ date, total: v.total, done: v.done, pct: v.total ? Math.round((v.done / v.total) * 100) : 0 }));
  const todayEntry = daily.find((d) => d.date === today) || { date: today, total: 0, done: 0, pct: 0 };
  const upcoming = tasks.filter((t) => t.status === 'pending' && t.date >= today).slice(0, 10);
  const overdue = tasks.filter((t) => t.status === 'pending' && t.date < today);
  const overallPct = plan.totalTasks ? Math.round((plan.completedTasks / plan.totalTasks) * 100) : 0;
  return { plan, today: todayEntry, daily, upcoming, overdue, overallPct };
}

export async function patchPlan(user, planId, data) {
  const plan = await StudyPlan.findOne({ _id: planId, user: user._id });
  if (!plan) throw new ApiError(404, 'Study plan not found');
  if (data.title) plan.title = data.title;
  if (data.status === 'completed' || data.status === 'archived') plan.status = data.status;
  await plan.save();
  return plan;
}

// ---------- Tasks ----------
async function ownTask(user, taskId) {
  const task = await PlanTask.findOne({ _id: taskId, user: user._id });
  if (!task) throw new ApiError(404, 'Task not found');
  return task;
}

export async function listPlanTasks(user, planId, { subject, status, date, from, to } = {}) {
  const plan = await StudyPlan.findOne({ _id: planId, user: user._id });
  if (!plan) throw new ApiError(404, 'Study plan not found');
  const filter = { plan: plan._id };
  if (subject) filter.subject = subject;
  if (status) filter.status = status;
  if (date) filter.date = date;
  else if (from || to) filter.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
  return PlanTask.find(filter).populate('subject', 'name').sort({ date: 1, startMin: 1 });
}

export async function patchTask(user, taskId, data) {
  const task = await ownTask(user, taskId);
  for (const k of ['title', 'objective', 'kind', 'startMin', 'durationMin', 'status', 'date']) {
    if (data[k] !== undefined) task[k] = data[k];
  }
  if (data.subject !== undefined) {
    if (data.subject) {
      const s = await Subject.findOne({ _id: data.subject, user: user._id });
      if (!s) throw new ApiError(404, 'Subject not found');
      task.subject = s._id;
    } else task.subject = null;
  }
  if (data.topic !== undefined) {
    if (data.topic) {
      const t = await Topic.findOne({ _id: data.topic, user: user._id });
      if (!t) throw new ApiError(404, 'Topic not found');
      task.topic = t._id;
    } else task.topic = null;
  }
  // Guard the day budget after the edit.
  const plan = await StudyPlan.findById(task.plan);
  const dayTotal = await PlanTask.aggregate([
    { $match: { plan: plan._id, date: task.date, _id: { $ne: task._id }, status: { $ne: 'skipped' } } },
    { $group: { _id: null, minutes: { $sum: '$durationMin' } } },
  ]);
  const used = (dayTotal[0]?.minutes || 0) + (task.status === 'skipped' ? 0 : task.durationMin);
  if (used > Math.round(plan.dailyHours * 60)) {
    throw new ApiError(400, `That change would over-allocate ${task.date} (${used}min > ${Math.round(plan.dailyHours * 60)}min budget)`);
  }
  await task.save();
  await recalculatePlan(plan._id, user._id);
  return task;
}

export async function setTaskStatus(user, taskId, status) {
  return patchTask(user, taskId, { status });
}

export async function rescheduleTask(user, taskId, { date, startMin }) {
  const task = await ownTask(user, taskId);
  const plan = await StudyPlan.findById(task.plan);
  if (date < todayDay()) throw new ApiError(400, 'Cannot reschedule into the past');
  if (date > toDay(plan.examDate)) throw new ApiError(400, 'Cannot reschedule past the exam date');
  return patchTask(user, taskId, { date, ...(startMin !== undefined ? { startMin } : {}) });
}

export async function deleteTask(user, taskId) {
  const task = await PlanTask.findOneAndDelete({ _id: taskId, user: user._id });
  if (!task) throw new ApiError(404, 'Task not found');
  await recalculatePlan(task.plan, user._id);
  return { id: taskId };
}
