import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import prisma from '../config/database';
import redis from '../config/redis';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    firstName: string;
    lastName: string;
  };
  requestId?: string;
}

const USER_CACHE_TTL = 60; // seconds
const USER_CACHE_PREFIX = 'auth:user:';

export const authenticate = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const token = req.headers.authorization?.replace('Bearer ', '') ||
                  req.cookies?.token;

    if (!token) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const decoded = jwt.verify(token, config.jwt.secret) as {
      userId: string;
      email: string;
      role: string;
    };

    // ── Redis user cache: avoid DB hit on every request ──
    const cacheKey = `${USER_CACHE_PREFIX}${decoded.userId}`;
    let user: { id: string; email: string; role: string; firstName: string; lastName: string; isActive: boolean } | null = null;

    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        user = JSON.parse(cached);
      }
    } catch {
      // Redis down — fall through to DB
    }

    if (!user) {
      user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: {
          id: true,
          email: true,
          role: true,
          firstName: true,
          lastName: true,
          isActive: true,
        },
      });

      if (user) {
        try {
          await redis.set(cacheKey, JSON.stringify(user), 'EX', USER_CACHE_TTL);
        } catch {
          // Redis down — non-fatal
        }
      }
    }

    if (!user || !user.isActive) {
      res.status(401).json({ error: 'User not found or inactive' });
      return;
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      firstName: user.firstName,
      lastName: user.lastName,
    };

    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

/** Invalidate cached user (call on role/profile update) */
export const invalidateUserCache = async (userId: string) => {
  try { await redis.del(`${USER_CACHE_PREFIX}${userId}`); } catch { /* non-fatal */ }
};

export const requireRole = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' });
      return;
    }

    next();
  };
};
