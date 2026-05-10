import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { OtpChannel } from '@prisma/client';
import prisma from '../config/database';
import { config } from '../config';
import { AuthRequest, invalidateUserCache } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import logger, { authLogger } from '../config/logger';
import { AuthDevModeLoginService } from '../services/authDevModeLoginService';
import { AuthOtpService, OtpInvalidCodeError, OtpLockedError, OtpRateLimitError } from '../services/authOtpService';
import { AuthTesterLoginService } from '../services/authTesterLoginService';

export class AuthController {
  private static createSession(user: { id: string; email: string; firstName: string; lastName: string; role: string }) {
    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, config.jwt.secret, {
      expiresIn: config.jwt.expiresIn,
    } as jwt.SignOptions);

    const refreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, config.jwt.refreshSecret, {
      expiresIn: config.jwt.refreshExpiresIn,
    } as jwt.SignOptions);

    return {
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    };
  }

  static async login(req: AuthRequest, res: Response): Promise<void> {
    const { email, password } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const requestId = req.requestId || '-';

    authLogger.info('Login attempt', { requestId, email, ip, userAgent });

    if (!email || !password) {
      authLogger.warn('Login failed: missing credentials', { requestId, ip });
      throw new AppError('Email and password are required', 400);
    }

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user) {
      authLogger.warn('Login failed: user not found', { requestId, email, ip });
      throw new AppError('Invalid credentials', 401);
    }

    if (!user.isActive) {
      authLogger.warn('Login failed: account disabled', { requestId, email, userId: user.id, ip });
      throw new AppError('Invalid credentials', 401);
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      authLogger.warn('Login failed: wrong password', { requestId, email, userId: user.id, ip });
      throw new AppError('Invalid credentials', 401);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    authLogger.info('Login successful', {
      requestId,
      userId: user.id,
      email: user.email,
      role: user.role,
      ip,
    });

    res.json(AuthController.createSession(user));
  }

  static async requestOtp(req: AuthRequest, res: Response): Promise<void> {
    const { email, channel } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const requestId = req.requestId || '-';

    try {
      const result = await AuthOtpService.requestOtp({
        email,
        channel: channel as OtpChannel,
        requestId,
        ip,
        userAgent,
      });

      res.json({
        message: 'Sign-in code sent',
        channel: result.channel,
        maskedDestination: result.maskedDestination,
        expiresInSeconds: result.expiresInSeconds,
      });
    } catch (error) {
      if (error instanceof OtpRateLimitError) {
        res.status(429).json({
          error: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
          retryAt: error.retryAt.toISOString(),
        });
        return;
      }

      if (error instanceof OtpLockedError) {
        res.status(423).json({
          error: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
          lockedUntil: error.lockedUntil.toISOString(),
        });
        return;
      }

      throw error;
    }
  }

  static async verifyOtp(req: AuthRequest, res: Response): Promise<void> {
    const { email, code } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const requestId = req.requestId || '-';

    try {
      const user = await AuthOtpService.verifyOtp({ email, code, requestId, ip });
      await invalidateUserCache(user.id);

      res.json(AuthController.createSession(user));
    } catch (error) {
      if (error instanceof OtpLockedError) {
        res.status(423).json({
          error: error.message,
          retryAfterSeconds: error.retryAfterSeconds,
          lockedUntil: error.lockedUntil.toISOString(),
        });
        return;
      }

      if (error instanceof OtpInvalidCodeError) {
        res.status(401).json({
          error: error.message,
          attemptsRemaining: error.attemptsRemaining,
        });
        return;
      }

      throw error;
    }
  }

  static async devModeLogin(req: AuthRequest, res: Response): Promise<void> {
    const { email, devKey } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const requestId = req.requestId || '-';

    const user = await AuthDevModeLoginService.login({ email, devKey, requestId, ip });
    await invalidateUserCache(user.id);

    res.json(AuthController.createSession(user));
  }

  static async testerLogin(req: AuthRequest, res: Response): Promise<void> {
    const { email, password, testerCode } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const userAgent = req.get('user-agent') || 'unknown';
    const requestId = req.requestId || '-';

    const user = await AuthTesterLoginService.login({ email, password, testerCode, requestId, ip, userAgent });
    await invalidateUserCache(user.id);

    res.json(AuthController.createSession(user));
  }

  static async register(req: AuthRequest, res: Response): Promise<void> {
    const { email, password, firstName, lastName, role, mobilePhone, hotAlertsEnabled } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const requestId = req.requestId || '-';

    authLogger.info('User registration attempt', {
      requestId,
      email,
      role: role || 'REP',
      createdBy: req.user?.id,
      ip,
    });

    if (req.user?.role !== 'ADMIN') {
      authLogger.warn('Registration denied: not admin', {
        requestId,
        requesterId: req.user?.id,
        requesterRole: req.user?.role,
        ip,
      });
      throw new AppError('Only admins can create users', 403);
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (existingUser) {
      authLogger.warn('Registration failed: email exists', { requestId, email, ip });
      throw new AppError('Email already exists', 409);
    }

    if (!password || password.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }
    if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
      throw new AppError('Password must contain uppercase, lowercase, and a number', 400);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        firstName,
        lastName,
        role: role || 'REP',
        ...(mobilePhone !== undefined ? { mobilePhone: mobilePhone || null } : {}),
        ...(hotAlertsEnabled !== undefined ? { hotAlertsEnabled: !!hotAlertsEnabled } : {}),
      },
    });

    authLogger.info('User registered successfully', {
      requestId,
      newUserId: user.id,
      email: user.email,
      role: user.role,
      createdBy: req.user?.id,
    });

    res.status(201).json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  }

  static async getMe(req: AuthRequest, res: Response): Promise<void> {
    const requestId = req.requestId || '-';
    authLogger.info('Token verification (getMe)', {
      requestId,
      userId: req.user?.id,
      email: req.user?.email,
    });
    res.json({ user: req.user });
  }

  static async refresh(req: AuthRequest, res: Response): Promise<void> {
    const { refreshToken } = req.body;
    const requestId = req.requestId || '-';

    if (!refreshToken) {
      throw new AppError('Refresh token required', 400);
    }

    try {
      const decoded = jwt.verify(refreshToken, config.jwt.refreshSecret) as {
        userId: string;
        type: string;
      };

      if (decoded.type !== 'refresh') {
        throw new AppError('Invalid token type', 401);
      }

      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, email: true, role: true, isActive: true, firstName: true, lastName: true },
      });

      if (!user || !user.isActive) {
        throw new AppError('User not found or inactive', 401);
      }

      const newToken = jwt.sign({ userId: user.id, email: user.email, role: user.role }, config.jwt.secret, {
        expiresIn: config.jwt.expiresIn,
      } as jwt.SignOptions);

      const newRefreshToken = jwt.sign({ userId: user.id, type: 'refresh' }, config.jwt.refreshSecret, {
        expiresIn: config.jwt.refreshExpiresIn,
      } as jwt.SignOptions);

      authLogger.info('Token refreshed', { requestId, userId: user.id });

      res.json({
        token: newToken,
        refreshToken: newRefreshToken,
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
        },
      });
    } catch (error) {
      if (error instanceof AppError) throw error;
      authLogger.warn('Token refresh failed', { requestId, error: (error as Error).message });
      throw new AppError('Invalid refresh token', 401);
    }
  }

  static async getUsers(req: AuthRequest, res: Response): Promise<void> {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        mobilePhone: true,
        hotAlertsEnabled: true,
        otpLockedUntil: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { firstName: 'asc' },
    });

    logger.info('Users list fetched', { count: users.length, by: req.user?.id });

    res.json({ users });
  }

  static async updateUser(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { firstName, lastName, email, role, isActive, password, mobilePhone, hotAlertsEnabled } = req.body;
    const requestId = req.requestId || '-';

    authLogger.info('User update attempt', {
      requestId,
      targetUserId: id,
      updatedBy: req.user?.id,
      fields: Object.keys(req.body),
    });

    const data: any = {};
    if (firstName) data.firstName = firstName;
    if (lastName) data.lastName = lastName;
    if (email && req.user?.role === 'ADMIN') {
      const emailOwner = await prisma.user.findUnique({ where: { email }, select: { id: true } });
      if (emailOwner && emailOwner.id !== id) {
        throw new AppError('Email is already in use', 409);
      }
      data.email = email;
    }
    if (role && req.user?.role === 'ADMIN') data.role = role;
    if (isActive !== undefined && req.user?.role === 'ADMIN') data.isActive = isActive;
    if (password) data.passwordHash = await bcrypt.hash(password, 12);
    const canEditTarget = req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER' || req.user?.id === id;
    if (mobilePhone !== undefined && canEditTarget) data.mobilePhone = mobilePhone || null;
    if (hotAlertsEnabled !== undefined && canEditTarget) data.hotAlertsEnabled = !!hotAlertsEnabled;

    const user = await prisma.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        mobilePhone: true,
        hotAlertsEnabled: true,
        otpLockedUntil: true,
      },
    });

    await invalidateUserCache(id);

    authLogger.info('User updated successfully', {
      requestId,
      targetUserId: id,
      updatedBy: req.user?.id,
      newRole: user.role,
      isActive: user.isActive,
    });

    res.json({ user });
  }

  static async unlockOtp(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const requestId = req.requestId || '-';

    const target = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true } });
    if (!target) {
      throw new AppError('User not found', 404);
    }

    await AuthOtpService.unlockUser(id);
    await invalidateUserCache(id);

    authLogger.info('OTP lock cleared by admin', {
      requestId,
      targetUserId: id,
      targetEmail: target.email,
      unlockedBy: req.user?.id,
    });

    res.json({ message: 'OTP lock cleared' });
  }

  static async changePassword(req: AuthRequest, res: Response): Promise<void> {
    const { currentPassword, newPassword } = req.body;
    const requestId = req.requestId || '-';
    const userId = req.user!.id;

    if (!currentPassword || !newPassword) {
      throw new AppError('Current password and new password are required', 400);
    }

    if (newPassword.length < 8) {
      throw new AppError('New password must be at least 8 characters long', 400);
    }

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, passwordHash: true } });
    if (!user) {
      throw new AppError('User not found', 404);
    }

    const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValid) {
      authLogger.warn('Password change failed: wrong current password', { requestId, userId });
      throw new AppError('Current password is incorrect', 401);
    }

    const newHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: newHash } });

    authLogger.info('Password changed successfully', { requestId, userId });
    res.json({ message: 'Password updated successfully' });
  }

  static async deleteUser(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const requestId = req.requestId || '-';

    authLogger.info('User delete attempt', {
      requestId,
      targetUserId: id,
      deletedBy: req.user?.id,
    });

    if (id === req.user?.id) {
      throw new AppError('Cannot delete your own account', 400);
    }

    const target = await prisma.user.findUnique({ where: { id } });
    if (!target) {
      throw new AppError('User not found', 404);
    }

    await prisma.user.update({
      where: { id },
      data: { isActive: false },
    });

    authLogger.info('User deleted (deactivated)', {
      requestId,
      targetUserId: id,
      email: target.email,
      deletedBy: req.user?.id,
    });

    res.json({ message: 'User deleted' });
  }
}
