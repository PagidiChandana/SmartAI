import rateLimit from 'express-rate-limit';

// Strict limiter for credential / token endpoints (brute-force protection).
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many attempts. Try again in 15 minutes.', errors: [] },
});

// Tighter limiter for password-reset requests (enumeration + mail abuse).
export const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Too many reset requests. Try again later.', errors: [] },
});

// Generation is expensive (LLM + hundreds of task docs) — cap burst usage.
export const planLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Plan generation limit reached (10/hour). Try again later.', errors: [] },
});

// Resource submissions (file parsing + review queue) — cap burst usage.
export const resourceLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Upload limit reached (30/hour). Try again later.', errors: [] },
});

// AI tutor answers (LLM cost + abuse protection).
export const tutorLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Tutor limit reached (50/hour). Try again later.', errors: [] },
});

// Assessment starts + AI drafting (attempt spam + LLM cost).
export const assessmentLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 40,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { success: false, message: 'Assessment limit reached (40/hour). Try again later.', errors: [] },
});
