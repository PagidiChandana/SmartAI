import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import apiRoutes from './routes/index.js';
import { errorHandler, notFound } from './middleware/error.middleware.js';

export function createApp() {
  const app = express();
  // Behind Render/Heroku-style proxies so req.securecookies behave on HTTPS.
  app.set('trust proxy', 1);
  app.use(helmet());
  // Restricted CORS: single trusted client origin + credentials for httpOnly cookies.
  // CLIENT_URL must exactly match the deployed frontend origin (Vercel URL).
  app.use(cors({ origin: env.clientUrl, credentials: true }));
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(morgan('dev'));

  app.get('/', (_req, res) => {
    res.json({ success: true, message: 'StudyAI API running. See /api/health', data: null });
  });
  app.use('/api', apiRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
