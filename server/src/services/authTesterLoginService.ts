import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { config } from '../config';
import { authLogger } from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { normalizeOtpEmail } from './authOtpPolicy';

export interface AuthTesterLoginUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface TesterLoginArgs {
  email: string;
  password: string;
  testerCode?: string;
  requestId: string;
  ip: string;
  userAgent: string;
}

interface TesterLoginEnv {
  TESTER_LOGIN_ENABLED?: string;
  TESTER_LOGIN_CODE?: string;
}

export function isTesterLoginEnabled(envSource: TesterLoginEnv = process.env): boolean {
  return (envSource.TESTER_LOGIN_ENABLED || '').trim().toLowerCase() === 'true';
}

export function isTesterLoginCodeValid(testerCode?: string, envSource: TesterLoginEnv = process.env): boolean {
  const expectedCode = (envSource.TESTER_LOGIN_CODE || '').trim();
  if (!expectedCode) return false;
  return (testerCode || '').trim() === expectedCode;
}

export class AuthTesterLoginService {
  static async login(args: TesterLoginArgs): Promise<AuthTesterLoginUser> {
    if (!config.testerLogin.enabled || !config.testerLogin.code) {
      authLogger.warn('Tester login blocked: disabled or code missing', {
        requestId: args.requestId,
        ip: args.ip,
      });
      throw new AppError('Tester login is not available', 404);
    }

    if ((args.testerCode || '').trim() !== config.testerLogin.code.trim()) {
      authLogger.warn('Tester login failed: invalid tester code', {
        requestId: args.requestId,
        email: args.email,
        ip: args.ip,
      });
      throw new AppError('Invalid tester login credentials', 401);
    }

    const email = normalizeOtpEmail(args.email);
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      authLogger.warn('Tester login failed: user not found or inactive', {
        requestId: args.requestId,
        email,
        ip: args.ip,
      });
      throw new AppError('Invalid tester login credentials', 401);
    }

    const validPassword = await bcrypt.compare(args.password, user.passwordHash);
    if (!validPassword) {
      authLogger.warn('Tester login failed: wrong password', {
        requestId: args.requestId,
        email,
        userId: user.id,
        ip: args.ip,
      });
      throw new AppError('Invalid tester login credentials', 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    authLogger.info('Tester login successful', {
      requestId: args.requestId,
      userId: user.id,
      email: user.email,
      role: user.role,
      ip: args.ip,
      userAgent: args.userAgent,
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
