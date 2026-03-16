import { Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import prisma from '../config/database';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import logger, { authLogger } from '../config/logger';

export class AuthController {
  
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

    const token = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      config.jwt.secret,
      { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
    );

    const refreshToken = jwt.sign(
      { userId: user.id, type: 'refresh' },
      config.jwt.refreshSecret,
      { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions
    );

    // Update last login
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

    res.json({
      token,
      refreshToken,
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
      },
    });
  }

  static async register(req: AuthRequest, res: Response): Promise<void> {
    const { email, password, firstName, lastName, role } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const requestId = req.requestId || '-';

    authLogger.info('User registration attempt', {
      requestId,
      email,
      role: role || 'REP',
      createdBy: req.user?.id,
      ip,
    });

    // Only admins can create users
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

    // Password complexity validation
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

      const newToken = jwt.sign(
        { userId: user.id, email: user.email, role: user.role },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn } as jwt.SignOptions
      );

      const newRefreshToken = jwt.sign(
        { userId: user.id, type: 'refresh' },
        config.jwt.refreshSecret,
        { expiresIn: config.jwt.refreshExpiresIn } as jwt.SignOptions
      );

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
    const { firstName, lastName, role, isActive, password } = req.body;
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
    if (role && req.user?.role === 'ADMIN') data.role = role;
    if (isActive !== undefined && req.user?.role === 'ADMIN') data.isActive = isActive;
    if (password) data.passwordHash = await bcrypt.hash(password, 12);

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
      },
    });

    authLogger.info('User updated successfully', {
      requestId,
      targetUserId: id,
      updatedBy: req.user?.id,
      newRole: user.role,
      isActive: user.isActive,
    });

    res.json({ user });
  }
}
