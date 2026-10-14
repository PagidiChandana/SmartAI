import { Assessment } from '../models/Assessment.js';
import { StudyPlan } from '../models/StudyPlan.js';
import { PlanTask } from '../models/PlanTask.js';
import { Subject } from '../models/Subject.js';
import { Attempt } from '../models/Attempt.js';
import { ApiError } from '../utils/ApiError.js';
import { env } from '../config/env.js';
import { generateChat } from './ai.service.js';
import { topicMastery, profileUsed, todayDay } from './analytics.service.js';

/**
 * Transparent rule-based adaptation (layer: "rule-v1").
 * Every recommendation carries `reasons` referencing observed evidence —
 * never a bare score. An optional AI layer (`aiInsights`) may rephrase or
 * extend these; it never replaces the evidence trail.
 */

// Assessments the student can retake / practice on a topic.
async function practiceOptions(user, subject, topic) {
  const pool = await Assessment.find({ status: 'published', subject: new RegExp(`^${subject.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') })
    .select('title topic maxAttempts')
    .limit(20)
    .lean();
  const norm = (s) => (s || '').toLowerCase();
  const t = norm(topic);
  const matched = pool.filter((a) => {
    const at = norm(a.topic);
    return at && (at.includes(t) || t.includes(at));
  });
  const list = (matched.length ? matched : pool.slice(0, 3)).slice(0, 3);
  return { options: list.map((a) => ({ assessmentId: a._id, title: a.title, topic: a.topic })) };
}

export async function recommend(user) {
  const [mastery, profile] = await Promise.all([topicMastery(user), profileUsed(user)]);
  const recs = [];
  for (const w of mastery.weak.slice(0, 8)) {
    const early = w.answered < 2 ? ' (early signal — limited evidence)' : '';
    const reasons = [`Scored ${w.accuracy}% over ${w.answered} assessed question${w.answered === 1 ? '' : 's'} on this topic${early}`];
    if (w.repeatedMistakes.length) reasons.push(`Missed the same question ${w.repeatedMistakes[0].timesWrong}× — a repeated mistake`);
    if (w.confidenceNote) reasons.push(w.confidenceNote + ' and the topic is unfinished');
    if (w.recentAccuracy !== null && w.trend === 'declining') reasons.push(`Recent accuracy (${w.recentAccuracy}%) is below overall (${w.accuracy}%)`);
    if (profile.examType && profile.examType !== 'other') reasons.push(`Priority-weighted for your ${profile.examType.toUpperCase()} exam focus`);
    const practice = await practiceOptions(user, w.subject, w.topic);
    recs.push({
      topic: w.topic,
      subject: w.subject,
      layer: 'rule-v1',
      observed: { accuracy: w.accuracy, answered: w.answered, trend: w.trend, repeatedMistakes: w.repeatedMistakes.length },
      reasons,
      actions: [
        { type: 'revise', label: `Add ${Math.min(3, 3)} revision sessions to my active plan`, detail: 'Creates kind=revision tasks on upcoming days within your daily budget' },
        ...(practice.options.length
          ? [{ type: 'practice', label: `Practice: ${practice.options[0].title}`, assessmentId: practice.options[0].assessmentId, detail: 'Retake or take a matching published assessment' }]
          : []),
      ],
    });
  }
  return {
    layer: 'rule-v1',
    generatedFrom: 'Observed assessment answers, confidences, and plan data — no predictions',
    profileUsed: { ...profile, correctIt: 'Review or edit these inputs in Learning Setup; recommendations recompute from the corrected values.' },
    weakCount: mastery.weak.length,
    strongCount: mastery.strong.length,
    items: recs,
  };
}

// Apply lever: insert up to 3 focused revision sessions (20 min) for a weak
// topic into the active plan's next 14 days, respecting the daily minute
// budget. Short sessions fit gaps that full study blocks cannot.
export async function applyBoost(user, { topic, subject }) {
  if (!topic?.trim()) throw new ApiError(400, 'Topic is required');
  const plan = await StudyPlan.findOne({ user: user._id, status: 'active' });
  if (!plan) throw new ApiError(400, 'No active study plan — generate one first');
  const subjects = await Subject.find({ user: user._id }).lean();
  const match = subjects.find((s) => s.name.toLowerCase() === (subject || '').toLowerCase()) || subjects[0];
  if (!match) throw new ApiError(400, 'Add a subject first');

  const budget = Math.round(plan.dailyHours * 60);
  const existing = await PlanTask.aggregate([
    { $match: { plan: plan._id, status: { $ne: 'skipped' } } },
    { $group: { _id: '$date', minutes: { $sum: '$durationMin' } } },
  ]);
  const used = new Map(existing.map((e) => [e._id, e.minutes]));
  const created = [];
  let day = todayDay();
  for (let i = 0; i < 14 && created.length < 3; i += 1) {
    const d = new Date(`${day}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + 1); // start tomorrow
    const key = d.toISOString().slice(0, 10);
    const dayUsed = used.get(key) || 0;
    if (dayUsed + 20 <= budget) {
      const task = await PlanTask.create({
        user: user._id,
        plan: plan._id,
        subject: match._id,
        title: `Revise: ${topic.trim()}`,
        objective: `Adaptive revision — close the gap on "${topic.trim()}" (rule-based recommendation)`,
        kind: 'revision',
        date: key,
        startMin: 1080, // 18:00 evening slot; student can reschedule
        durationMin: 20,
        status: 'pending',
      });
      created.push(task);
      used.set(key, dayUsed + 20);
    }
    day = key;
  }
  if (!created.length) throw new ApiError(400, 'No room in the next 14 days within your daily budget — reschedule or extend hours first');
  // refresh plan counters via planner recalculation path
  const { recalculatePlan } = await import('./planner.service.js');
  await recalculatePlan(plan._id, user._id);
  return { created, planId: plan._id };
}

// Optional AI layer: narrative insights over the observed stats.
// 503 when unavailable — the UI falls back to the rule-based list above.
export async function aiInsights(user) {
  const [mastery, profile] = await Promise.all([topicMastery(user), profileUsed(user)]);
  const observed = {
    weak: mastery.weak.slice(0, 5).map((w) => ({ topic: w.topic, accuracy: w.accuracy, answered: w.answered, trend: w.trend })),
    strong: mastery.strong.slice(0, 5).map((s) => ({ topic: s.topic, accuracy: s.accuracy })),
    profile,
  };
  if (env.aiProvider === 'mock') {
    throw new ApiError(503, 'AI insights unavailable (provider is mock). Use the rule-based recommendations, which are always available.');
  }
  try {
    const text = await generateChat(
      [{ role: 'user', content: `Study stats (observed, JSON): ${JSON.stringify(observed).slice(0, 4000)}\nWrite 3-5 short study suggestions. Label each as building on the observed stats above. Plain text, no invented numbers.` }],
      { system: 'You are StudyAI coach. Suggest study moves grounded ONLY in the stats given. Never invent scores or mastery claims.' }
    );
    const clean = (text || '').trim().slice(0, 3000);
    if (!clean) throw new Error('Empty AI response');
    return { layer: 'ai', observed, suggestions: clean };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(503, `AI insights failed (${err.message}). Rule-based recommendations remain available.`);
  }
}
