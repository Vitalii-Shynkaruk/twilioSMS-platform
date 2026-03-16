import 'dotenv/config';

// Fix BigInt serialization for JSON.stringify (Prisma raw queries return BigInt)
(BigInt.prototype as any).toJSON = function () {
  return Number(this);
};

import app from './app';
import { config } from './config';
import logger from './config/logger';
import prisma from './config/database';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Import workers so they start with the server
import './jobs/worker';
import { stopAutomationWorker } from './jobs/automationWorker';

const httpServer = createServer(app);

// Socket.IO for real-time inbox updates
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: config.clientUrl,
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Socket.IO auth middleware (MUST be before connection handler)
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
  if (!token) {
    return next(new Error('Authentication required'));
  }
  try {
    const decoded = jwt.verify(token, config.jwt.secret) as { userId: string; email: string; role: string };
    // Socket.IO doesn't have native data property typing — attach userId
    (socket as any).userId = decoded.userId;
    next();
  } catch {
    next(new Error('Invalid token'));
  }
});

io.on('connection', (socket) => {
  const authenticatedUserId: string | undefined = (socket as any).userId;
  logger.debug(`Socket connected: ${socket.id} (user: ${authenticatedUserId})`);

  // Only allow joining own inbox channel
  socket.on('join:inbox', () => {
    if (authenticatedUserId) {
      socket.join(`inbox:${authenticatedUserId}`);
      logger.debug(`User ${authenticatedUserId} joined inbox channel`);
    }
  });

  socket.on('join:conversation', async (conversationId: string) => {
    // Authorization: verify the user has access to this conversation
    try {
      const conversation = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { assignedRepId: true },
      });
      if (!conversation) return;

      // Get user role
      const user = await prisma.user.findUnique({
        where: { id: authenticatedUserId },
        select: { role: true },
      });
      // ADMIN/MANAGER can join any conversation; REP only their own
      if (user?.role === 'REP' && conversation.assignedRepId !== authenticatedUserId) {
        logger.warn(`Socket: REP ${authenticatedUserId} denied access to conversation ${conversationId}`);
        return;
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

// Make io accessible to routes
app.set('io', io);

// Production safety checks
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

// Start server
async function start() {
  try {
    // Validate configuration
    validateProductionConfig();

    // Test database connection
    await prisma.$connect();
    logger.info('✅ Database connected');

    // Ensure admin user exists (from .env credentials)
    await ensureAdminUser();

    httpServer.listen(config.port, () => {
      logger.info(`🚀 Server running on port ${config.port}`);
      logger.info(`📡 Environment: ${config.env}`);
      logger.info(`🌐 Client URL: ${config.clientUrl}`);
      logger.info(`🔗 Webhook URL: ${config.webhookBaseUrl}`);
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

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection:', { reason });
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Graceful shutdown
import redis from './config/redis';

async function gracefulShutdown(signal: string) {
  logger.info(`${signal} received, shutting down gracefully...`);
  
  // Stop automation intervals
  stopAutomationWorker();

  // Stop accepting new connections
  httpServer.close(() => {
    logger.info('HTTP server closed');
  });

  // Close Socket.IO
  io.close();
  logger.info('Socket.IO closed');

  // Disconnect databases
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

  // Force exit after 10s timeout
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
