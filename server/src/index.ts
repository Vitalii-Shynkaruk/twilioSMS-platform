import 'dotenv/config';

(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return;
});
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EPIPE' || err.code === 'ERR_STREAM_DESTROYED') return;
});

import app from './app';
import { config } from './config';
import logger from './config/logger';
import prisma from './config/database';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { setSocketIO } from './realtime/socket';

import './jobs/worker';
import { stopAutomationWorker } from './jobs/automationWorker';
import { startDealCron, stopDealCron } from './jobs/dealCron';
import { startFollowupStateCron, stopFollowupStateCron } from './jobs/followupStateCron';
import { startReconciliationCron, stopReconciliationCron } from './jobs/reconciliationCron';
import { startAiCohortCron, stopAiCohortCron } from './jobs/aiCohortCron';
import { ensureDefaultTeamUsers } from './bootstrap/defaultUsers';

const httpServer = createServer(app);

const io = new SocketIOServer(httpServer, {
  path: '/api/socket.io/',
  cors: {
    origin: config.clientUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string; role: string };
    (socket as any).userId = decoded.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const authenticatedUserId: string | undefined = (socket as any).userId;
  logger.debug(`Socket connected: ${socket.id} (user: ${authenticatedUserId})`);

  if (authenticatedUserId) {
    socket.join(`inbox:${authenticatedUserId}`);
    logger.debug(`User ${authenticatedUserId} auto-joined inbox channel`);
  }

  socket.on('join:inbox', () => {
    if (authenticatedUserId) {
      socket.join(`inbox:${authenticatedUserId}`);
      logger.debug(`User ${authenticatedUserId} joined inbox channel`);
    }
  });

  socket.on('join:conversation', async (conversationId: string) => {
    try {
      if (!authenticatedUserId) return;
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true, assignedRepId: true, lead: { select: { assignedRepId: true } } },
      });
      if (!conversation) return;

      const user = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { role: true },
      });
      if (user?.role === 'REP') {
        const ownsByAssignment =
          conversation.assignedRepId === authenticatedUserId ||
          conversation.lead?.assignedRepId === authenticatedUserId;
        const hasAssignedOwner = !!(conversation.assignedRepId || conversation.lead?.assignedRepId);
        const ownsByOutbound = ownsByAssignment
          ? true
          : hasAssignedOwner
            ? false
            : (await prisma.message.count({
                where: {
                  conversationId,
                  direction: 'OUTBOUND',
                  sentByUserId: authenticatedUserId,
                },
              })) > 0;

        if (!ownsByOutbound) {
          logger.warn(`Socket: REP ${authenticatedUserId} denied access to conversation ${conversationId}`);
          return;
        }
      }
      socket.join(`conversation:${conversationId}`);
    } catch (err) {
      logger.error('Socket join:conversation error:', err);
    }
  });

  socket.on('disconnect', () => {
    logger.debug(`Socket disconnected: ${socket.id}`);
  });
});

app.set('io', io);
setSocketIO(io);

function validateProductionConfig() {
  if (config.env === 'production') {
    const weakSecrets = ['dev-secret-change-me', 'dev-refresh-secret-change-me', 'test-secret'];
    if (weakSecrets.includes(config.jwt.secret)) {
      logger.error('❌ FATAL: JWT_SECRET is using a default/weak value in production!');
      process.exit(1);
    }
    if (weakSecrets.includes(config.jwt.refreshSecret)) {
      logger.error('❌ FATAL: JWT_REFRESH_SECRET is using a default/weak value in production!');
      process.exit(1);
    }
    if (config.admin.password === 'admin123') {
      logger.error('❌ FATAL: ADMIN_PASSWORD is "admin123" in production!');
      process.exit(1);
    }
  }
}

async function start() {
  try {
    validateProductionConfig();

    await prisma.$connect();
    logger.info('✅ Database connected');

    await ensureAdminUser();
    await ensureDefaultTeamUsers();

    startDealCron();
    startFollowupStateCron();
    startReconciliationCron();
    startAiCohortCron();

    httpServer.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`📡 Environment: ${config.env}`);
      logger.info(`🌐 Client URL: ${config.clientUrl}`);
      logger.info(`🔗 Webhook URL: ${config.webhookBaseUrl}`);
    });

    httpServer.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} already in use, exiting`);
        process.exit(1);
      }
      throw err;
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

async function ensureAdminUser() {
  const { email, password, firstName, lastName } = config.admin;
  try {
    const existing = await prisma.user.findUnique({ where: { email } });
    if (!existing) {
      const passwordHash = await bcrypt.hash(password, 12);
      await prisma.user.create({
        data: { email, passwordHash, firstName, lastName, role: 'ADMIN' },
      });
      logger.info(`👤 Admin user auto-created: ${email}`);
    } else {
      logger.debug(`👤 Admin user exists: ${email}`);
    }
  } catch (err) {
    logger.error('Failed to ensure admin user:', err);
  }
}

process.on('unhandledRejection', (reason, _promise) => {
  logger.error('Unhandled Promise Rejection:', { reason });
});

process.on('uncaughtException', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE' || error.code === 'ERR_STREAM_DESTROYED') return;
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  process.exit(1);
});

import redis from './config/redis';

async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);

  stopAutomationWorker();
  stopDealCron();
  stopFollowupStateCron();
  stopReconciliationCron();
  stopAiCohortCron();

  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  io.close();
  logger.info('Socket.IO closed');

  try {
    await redis.quit();
    logger.info('Redis disconnected');
  } catch (err) {
    logger.error('Error disconnecting Redis:', err);
  }

  try {
    await prisma.$disconnect();
    logger.info('Database disconnected');
  } catch (err) {
    logger.error('Error disconnecting database:', err);
  }

  setTimeout(() => {
    logger.warn('Forced shutdown after timeout');
    process.exit(1);
  }, 10000).unref();

  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

start();

export { io };
