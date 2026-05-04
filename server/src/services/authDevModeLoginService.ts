import { UserRole } from '@prisma/client';
import prisma from '../config/database';
import { config } from '../config';
import { authLogger } from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { normalizeOtpEmail } from './authOtpPolicy';

export interface AuthDevModeUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
}

export interface DevModeLoginArgs {
  email: string;
  devKey?: string;
  requestId: string;
  ip: string;
}

interface DevModeLoginEnv {
  NODE_ENV?: string;
  DEV_MODE_LOGIN_ENABLED?: string;
  DEV_MODE_LOGIN_SECRET?: string;
}

export function isDevModeLoginEnabled(envSource: DevModeLoginEnv = process.env): boolean {
  const nodeEnv = envSource.NODE_ENV || 'development';
  const enabled = (envSource.DEV_MODE_LOGIN_ENABLED || '').trim().toLowerCase() === 'true';
  return nodeEnv !== 'production' && enabled;
}

export function isDevModeLoginKeyValid(devKey?: string, envSource: DevModeLoginEnv = process.env): boolean {
  const expectedSecret = (envSource.DEV_MODE_LOGIN_SECRET || '').trim();
  if (!expectedSecret) return true;
  return devKey === expectedSecret;
}

export class AuthDevModeLoginService {
  static async login(args: DevModeLoginArgs): Promise<AuthDevModeUser> {
    if (!config.devModeLogin.enabled || !isDevModeLoginEnabled()) {
      authLogger.warn('Dev mode login blocked: disabled or production environment', {
        requestId: args.requestId,
        ip: args.ip,
        nodeEnv: process.env.NODE_ENV,
      });
      throw new AppError('Dev mode login is not available', 404);
    }

    if (!isDevModeLoginKeyValid(args.devKey)) {
      authLogger.warn('Dev mode login blocked: invalid dev key', {
        requestId: args.requestId,
        ip: args.ip,
      });
      throw new AppError('Dev mode login is not available', 404);
    }

    const email = normalizeOtpEmail(args.email);
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      authLogger.warn('Dev mode login failed: user not found or inactive', {
        requestId: args.requestId,
        email,
        ip: args.ip,
      });
      throw new AppError('Invalid dev mode login account', 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    authLogger.info('Dev mode login successful', {
      requestId: args.requestId,
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: args.ip,
    });

    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
    };
  }
}
