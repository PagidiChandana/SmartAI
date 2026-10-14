import dotenv from 'dotenv';
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd,
  port: Number(process.env.PORT || 5000),
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/studyai',
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  // Cookie auth: httpOnly always. sameSite/secure depend on deployment:
  // - same host (dev): lax + insecure is fine.
  // - split frontend/backend origins (Vercel + Render): browsers only send
  //   the cookie cross-site with SameSite=None + Secure (HTTPS).
  cookieName: process.env.AUTH_COOKIE_NAME || 'studyai_token',
  cookieSecure: ['true', '1'].includes(String(process.env.COOKIE_SECURE || '').toLowerCase()) || isProd,
  cookieSameSite: (process.env.COOKIE_SAMESITE || 'lax').toLowerCase(),
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  aiProvider: (process.env.AI_PROVIDER || 'mock').toLowerCase(),
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  geminiApiKey: process.env.GEMINI_API_KEY || '',
  geminiModel: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  // Local LLM via Ollama (no API key): install Ollama, `ollama pull <model>`,
  // `ollama serve`, then AI_PROVIDER=ollama.
  ollamaUrl: (process.env.OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
  ollamaModel: process.env.OLLAMA_MODEL || 'llama3.1',
  // Password reset token lifetime (minutes)
  resetTokenMinutes: Number(process.env.RESET_TOKEN_MINUTES || 30),
  // AI tutor knobs (credentials stay in OPENAI_API_KEY / GEMINI_API_KEY above)
  tutorTimeoutMs: Number(process.env.TUTOR_TIMEOUT_MS || 60000),
  tutorMaxQuestion: Number(process.env.TUTOR_MAX_QUESTION || 2000),
  tutorHistory: Number(process.env.TUTOR_HISTORY || 10),
  retriever: (process.env.RETRIEVER || 'keyword').toLowerCase(),
  // Seed admin (CLI only, never from public API)
  adminEmail: process.env.ADMIN_EMAIL || '',
  adminPassword: process.env.ADMIN_PASSWORD || '',
  adminName: process.env.ADMIN_NAME || 'Admin',
  // Seed super admin (CLI only, never from public API)
  superAdminEmail: process.env.SUPER_ADMIN_EMAIL || '',
  superAdminPassword: process.env.SUPER_ADMIN_PASSWORD || '',
  superAdminName: process.env.SUPER_ADMIN_NAME || 'Super Admin',
};
