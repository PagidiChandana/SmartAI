/**
 * Explainable rule-based recommender (ranker: "rule-v1").
 *
 * Modular by design: ranking lives behind `rankResources()`. To add
 * AI-based ranking later, implement `rankWithAI(resources, context)` with
 * the same return shape [{ resource, score, reasons[] }] and select it in
 * `rankResources()` via env flag — no route/service changes needed.
 */

const FORMAT_BY_STYLE = {
  visual: ['video', 'pdf'],
  auditory: ['video', 'article'],
  reading: ['article', 'note', 'pdf'],
  kinesthetic: ['video', 'note'],
  mixed: [],
};

function norm(s) {
  return (s || '').toString().trim().toLowerCase();
}

// One difficulty step above the learner's level stretches without frustrating.
function difficultyFit(resourceDifficulty, learnerLevel) {
  const order = ['beginner', 'intermediate', 'advanced'];
  const r = order.indexOf(resourceDifficulty);
  const l = order.indexOf(learnerLevel);
  if (r === -1) return { score: 0, reason: null };
  if (r === l) return { score: 4, reason: `Matches your ${learnerLevel} level` };
  if (r === l + 1) return { score: 2, reason: `One step above your ${learnerLevel} level — good stretch` };
  if (r < l) return { score: 1, reason: null };
  return { score: 0, reason: `Above your current ${learnerLevel} level` };
}

export function scoreResource(resource, ctx) {
  let score = 0;
  const reasons = [];
  const rSubject = norm(resource.subject);
  const rTopic = norm(resource.topic);

  if (ctx.subjects.has(rSubject)) {
    score += 6;
    reasons.push(`Matches your subject "${resource.subject}"`);
  }
  for (const t of ctx.weakTopics) {
    if (rTopic && (rTopic.includes(t) || t.includes(rTopic))) {
      score += 8;
      reasons.push(`Targets your weak area "${t}"`);
      break;
    }
  }
  if (!reasons.some((r) => r.startsWith('Targets'))) {
    for (const t of ctx.planTopics) {
      if (rTopic && (rTopic.includes(t) || t.includes(rTopic))) {
        score += 5;
        reasons.push(`Covers your current plan topic "${t}"`);
        break;
      }
    }
  }
  if (ctx.examType && norm(resource.examType) === ctx.examType && ctx.examType !== 'other') {
    score += 3;
    reasons.push(`Fits your ${resource.examType.toUpperCase()} exam focus`);
  }
  const fit = difficultyFit(resource.difficulty, ctx.level);
  score += fit.score;
  if (fit.reason && fit.score >= 2) reasons.push(fit.reason);

  const preferred = FORMAT_BY_STYLE[ctx.learningStyle] || [];
  if (preferred.includes(resource.format)) {
    score += 2;
    reasons.push(`Suits your ${ctx.learningStyle} learning style`);
  }
  if ((resource.bookmarkCount || 0) >= 3 || (resource.views || 0) >= 10) {
    score += 1;
    reasons.push('Popular with other learners');
  }
  return { score, reasons };
}

export function rankResources(resources, ctx) {
  return resources
    .map((resource) => ({ resource, ...scoreResource(resource, ctx) }))
    .filter((r) => r.score > 0 && r.reasons.length > 0)
    .sort((a, b) => b.score - a.score);
}

export const RANKER_VERSION = 'rule-v1';
