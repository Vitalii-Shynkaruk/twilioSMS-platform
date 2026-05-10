import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import { config } from './config';
import _logger from './config/logger';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';

import authRoutes from './routes/auth';
import dashboardRoutes from './routes/dashboard';
import campaignRoutes from './routes/campaigns';
import inboxRoutes from './routes/inbox';
import leadRoutes from './routes/leads';
import pipelineRoutes from './routes/pipeline';
import numberRoutes from './routes/numbers';
import automationRoutes from './routes/automation';
import settingsRoutes from './routes/settings';
import aiRoutes from './routes/ai';
import analyticsRoutes from './routes/analytics';
import dealRoutes from './routes/deals';
import commandCenterRoutes from './routes/commandCenter';
import repRoutes from './routes/reps';
import importRoutes from './routes/import';

import twilioWebhooks from './webhooks/twilioWebhooks';

import prisma from './config/database';
import redis from './config/redis';

const app = express();

app.set('trust proxy', 1);

app.use(
  helmet({
    contentSecurityPolicy:
      config.env === 'production'
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'", "'unsafe-inline'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:', 'blob:'],
              connectSrc: ["'self'", 'wss:', 'ws:'],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
    crossOriginEmbedderPolicy: config.env === 'production',
  }),
);

app.use(
  cors({
    origin: config.clientUrl,
    credentials: true,
  }),
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(compression());

const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
  skip: (req) => req.path === '/api/health' || req.path.startsWith('/api/webhooks/'),
});
app.use('/api/', apiLimiter);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes' },
});
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);

app.use(requestLogger);

app.get('/api/health', async (req, res) => {
  try {
    const [dbOk, redisOk] = await Promise.allSettled([prisma.$queryRaw`SELECT 1`, redis.ping()]);

    const status = dbOk.status === 'fulfilled' && redisOk.status === 'fulfilled' ? 'ok' : 'degraded';
    const statusCode = status === 'ok' ? 200 : 503;

    res.status(statusCode).json({
      status,
      env: config.env,
      timestamp: new Date().toISOString(),
      services: {
        database: dbOk.status === 'fulfilled' ? 'ok' : 'error',
        redis: redisOk.status === 'fulfilled' ? 'ok' : 'error',
      },
    });
  } catch (_error) {
    res.status(503).json({ status: 'error', timestamp: new Date().toISOString() });
  }
});

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/campaigns', campaignRoutes);
app.use('/api/inbox', inboxRoutes);
app.use('/api/leads', leadRoutes);
app.use('/api/pipeline', pipelineRoutes);
app.use('/api/numbers', numberRoutes);
app.use('/api/automation', automationRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/command-center', commandCenterRoutes);
app.use('/api/reps', repRoutes);
app.use('/api/import', importRoutes);

app.use('/api/webhooks/twilio', twilioWebhooks);

if (config.env === 'production') {
  const clientDist = path.resolve(__dirname, '../../client/dist');
  const indexPath = path.join(clientDist, 'index.html');
  if (fs.existsSync(indexPath)) {
    app.use(express.static(clientDist, { maxAge: '30d', immutable: true }));
    app.get('*', (req, res) => {
      res.sendFile(indexPath);
    });
  }
}

app.use(notFoundHandler);
app.use(errorHandler);

export { app };
export default app;
