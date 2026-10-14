import { env } from './config/env.js';
import { connectDB } from './config/db.js';
import { createApp } from './app.js';
import { startScheduler } from './services/scheduler.service.js';

const app = createApp();

// Connect to DB but don't crash the health check if Mongo is down in dev.
connectDB(env.mongoUri).catch((err) => {
  console.error('MongoDB connection failed (API still serves /api/health):', err.message);
});

// In-app reminder delivery tick (60s). Disable with DISABLE_SCHEDULER=1.
startScheduler();

// Production must never serve mock AI as real: warn loudly at boot.
// (Features fall back to labeled rule-based modes, but operators must know.)
if (env.isProd && env.aiProvider === 'mock') {
  console.error('WARNING: AI_PROVIDER=mock in production — configure OPENAI_API_KEY or GEMINI_API_KEY for live AI.');
}

app.listen(env.port, () => {
  console.log(`StudyAI server listening on http://localhost:${env.port}`);
});
