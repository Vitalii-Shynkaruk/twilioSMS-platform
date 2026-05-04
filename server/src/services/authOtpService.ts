import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { OtpChannel, UserRole } from '@prisma/client';
import prisma from '../config/database';
import logger, { authLogger } from '../config/logger';
import { AppError } from '../middleware/errorHandler';
import { getActiveMessagingServiceSid, getActiveTwilioClient } from '../config/twilio';
import {
  OTP_EXPIRY_MS,
  OTP_FAILURE_LIMIT,
  OTP_FAILURE_WINDOW_MS,
  OTP_LOCK_MS,
  OTP_SEND_WINDOW_MS,
  getOtpRateLimitStatus,
  maskOtpDestination,
  normalizeOtpEmail,
  normalizeOtpPhone,
} from './authOtpPolicy';

const OTP_LENGTH = 6;

export interface AuthOtpUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  mobilePhone: string | null;
  otpFailedAttempts: number;
  otpFailedWindowStartedAt: Date | null;
  otpLockedUntil: Date | null;
}

export interface RequestOtpArgs {
  email: string;
  channel: OtpChannel;
  requestId: string;
  ip: string;
  userAgent: string;
}

export interface RequestOtpResult {
  channel: OtpChannel;
  maskedDestination: string;
  expiresInSeconds: number;
}

export interface VerifyOtpArgs {
  email: string;
  code: string;
  requestId: string;
  ip: string;
}

export class OtpRateLimitError extends Error {
  retryAfterSeconds: number;
  retryAt: Date;

  constructor(retryAfterSeconds: number, retryAt: Date) {
    super('Too many sign-in codes requested. Please wait before requesting another code.');
    this.retryAfterSeconds = retryAfterSeconds;
    this.retryAt = retryAt;
  }
}

export class OtpLockedError extends Error {
  retryAfterSeconds: number;
  lockedUntil: Date;

  constructor(lockedUntil: Date) {
    const retryAfterSeconds = Math.max(1, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000));
    super('Account is temporarily locked because of too many invalid code attempts.');
    this.retryAfterSeconds = retryAfterSeconds;
    this.lockedUntil = lockedUntil;
  }
}

export class OtpInvalidCodeError extends Error {
  attemptsRemaining: number;

  constructor(attemptsRemaining: number) {
    super(
      `Invalid or expired sign-in code. ${attemptsRemaining} attempt${attemptsRemaining === 1 ? '' : 's'} remaining.`,
    );
    this.attemptsRemaining = attemptsRemaining;
  }
}

function createOtpCode(): string {
  return crypto
    .randomInt(0, 10 ** OTP_LENGTH)
    .toString()
    .padStart(OTP_LENGTH, '0');
}

function createDestinationKey(channel: OtpChannel, destination: string): string {
  return crypto.createHash('sha256').update(`${channel}:${destination}`).digest('hex');
}

function getOtpMessage(code: string): string {
  return `SCL Capital sign-in code: ${code}. It expires in 5 minutes. Do not share it.`;
}

function getGenericRequestOtpResult(channel: OtpChannel): RequestOtpResult {
  return {
    channel,
    maskedDestination: channel === OtpChannel.EMAIL ? 'your email address' : 'your mobile phone',
    expiresInSeconds: OTP_EXPIRY_MS / 1000,
  };
}

async function getSmsSendOrigin(): Promise<{ messagingServiceSid: string } | { from: string } | null> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: 'hotAlertFromNumber' } });
  const fromSetting = typeof setting?.value === 'string' ? setting.value.trim() : '';
  if (fromSetting) return { from: fromSetting };

  const messagingServiceSid = await getActiveMessagingServiceSid();
  if (messagingServiceSid) return { messagingServiceSid };

  const envFrom = (process.env.TWILIO_FROM_NUMBER || '').trim();
  if (envFrom) return { from: envFrom };

  const firstActive = await prisma.phoneNumber.findFirst({
    where: { status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { phoneNumber: true },
  });

  return firstActive ? { from: firstActive.phoneNumber } : null;
}

async function sendSmsOtp(destination: string, code: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    logger.info('OTP SMS skipped in test mode', { destination: maskOtpDestination(OtpChannel.SMS, destination) });
    return;
  }

  const client = await getActiveTwilioClient();
  if (!client) throw new AppError('SMS sign-in is not configured', 503);

  const origin = await getSmsSendOrigin();
  if (!origin) throw new AppError('SMS sender is not configured', 503);

  await client.messages.create({
    to: destination,
    body: getOtpMessage(code),
    ...origin,
  });
}

async function sendEmailOtp(destination: string, code: string): Promise<void> {
  if (process.env.NODE_ENV === 'test') {
    logger.info('OTP email skipped in test mode', { destination: maskOtpDestination(OtpChannel.EMAIL, destination) });
    return;
  }

  const [apiKeySetting, fromSetting] = await Promise.all([
    prisma.systemSetting.findUnique({ where: { key: 'resendApiKey' } }),
    prisma.systemSetting.findUnique({ where: { key: 'resendFromEmail' } }),
  ]);
  const apiKey = (
    typeof apiKeySetting?.value === 'string' ? apiKeySetting.value : process.env.RESEND_API_KEY || ''
  ).trim();
  const from = (
    typeof fromSetting?.value === 'string' ? fromSetting.value : process.env.RESEND_FROM_EMAIL || ''
  ).trim();
  if (!apiKey || !from) throw new AppError('Email sign-in fallback is not configured', 503);

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: destination,
      subject: 'SCL Capital · Your sign-in code',
      text: `Your SCL Capital sign-in code is ${code}. It expires in 5 minutes. Do not share it.`,
      html: `<p>Your SCL Capital sign-in code is <strong>${code}</strong>.</p><p>It expires in 5 minutes. Do not share it.</p>`,
    }),
  });

  if (!response.ok) {
    const responseText = await response.text().catch(() => '');
    logger.error('OTP email send failed', { status: response.status, responseText });
    throw new AppError('Email sign-in fallback failed', 503);
  }
}

function assertNotLocked(user: Pick<AuthOtpUser, 'otpLockedUntil'>): void {
  if (user.otpLockedUntil && user.otpLockedUntil > new Date()) {
    throw new OtpLockedError(user.otpLockedUntil);
  }
}

async function clearExpiredOtpLock(user: AuthOtpUser): Promise<AuthOtpUser> {
  if (!user.otpLockedUntil || user.otpLockedUntil > new Date()) {
    return user;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      otpFailedAttempts: 0,
      otpFailedWindowStartedAt: null,
      otpLockedUntil: null,
    },
  });

  return {
    ...user,
    otpFailedAttempts: 0,
    otpFailedWindowStartedAt: null,
    otpLockedUntil: null,
  };
}

async function recordOtpFailure(user: AuthOtpUser): Promise<number> {
  const now = new Date();
  const windowStartedAt = user.otpFailedWindowStartedAt;
  const withinWindow = !!windowStartedAt && now.getTime() - windowStartedAt.getTime() <= OTP_FAILURE_WINDOW_MS;
  const nextAttempts = withinWindow ? user.otpFailedAttempts + 1 : 1;
  const nextWindowStartedAt = withinWindow ? windowStartedAt : now;

  if (nextAttempts >= OTP_FAILURE_LIMIT) {
    const lockedUntil = new Date(now.getTime() + OTP_LOCK_MS);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        otpFailedAttempts: nextAttempts,
        otpFailedWindowStartedAt: nextWindowStartedAt,
        otpLockedUntil: lockedUntil,
      },
    });
    throw new OtpLockedError(lockedUntil);
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      otpFailedAttempts: nextAttempts,
      otpFailedWindowStartedAt: nextWindowStartedAt,
    },
  });

  return OTP_FAILURE_LIMIT - nextAttempts;
}

async function getAuthOtpUser(email: string): Promise<AuthOtpUser | null> {
  return prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      role: true,
      isActive: true,
      mobilePhone: true,
      otpFailedAttempts: true,
      otpFailedWindowStartedAt: true,
      otpLockedUntil: true,
    },
  });
}

export class AuthOtpService {
  static async requestOtp(args: RequestOtpArgs): Promise<RequestOtpResult> {
    const email = normalizeOtpEmail(args.email);
    let user = await getAuthOtpUser(email);

    if (!user || !user.isActive) {
      authLogger.warn('OTP request skipped: user not found or inactive', {
        requestId: args.requestId,
        email,
        ip: args.ip,
      });
      return getGenericRequestOtpResult(args.channel);
    }

    user = await clearExpiredOtpLock(user);
    assertNotLocked(user);

    const destination = args.channel === OtpChannel.SMS ? normalizeOtpPhone(user.mobilePhone || '') : user.email;
    if (args.channel === OtpChannel.SMS && !user.mobilePhone) {
      authLogger.warn('OTP SMS request skipped: mobile phone is not configured', {
        requestId: args.requestId,
        userId: user.id,
        ip: args.ip,
      });
      return getGenericRequestOtpResult(args.channel);
    }

    const destinationKey = createDestinationKey(args.channel, destination);
    const sendWindowStart = new Date(Date.now() - OTP_SEND_WINDOW_MS);
    const recentOtpRows = await prisma.loginOtp.findMany({
      where: {
        channel: args.channel,
        destinationKey,
        createdAt: { gte: sendWindowStart },
      },
      select: { createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    const rateLimitStatus = getOtpRateLimitStatus(recentOtpRows.map((row) => row.createdAt));
    if (rateLimitStatus.blocked && rateLimitStatus.retryAt) {
      throw new OtpRateLimitError(rateLimitStatus.retryAfterSeconds, rateLimitStatus.retryAt);
    }

    const now = new Date();
    const code = createOtpCode();
    const codeHash = await bcrypt.hash(code, 12);
    const expiresAt = new Date(now.getTime() + OTP_EXPIRY_MS);
    const maskedDestination = maskOtpDestination(args.channel, destination);

    const otp = await prisma.$transaction(async (tx) => {
      await tx.loginOtp.updateMany({
        where: {
          userId: user.id,
          consumedAt: null,
          invalidatedAt: null,
          expiresAt: { gt: now },
        },
        data: { invalidatedAt: now },
      });

      return tx.loginOtp.create({
        data: {
          userId: user.id,
          channel: args.channel,
          destinationKey,
          destinationMasked: maskedDestination,
          codeHash,
          expiresAt,
        },
      });
    });

    try {
      if (args.channel === OtpChannel.EMAIL) {
        await sendEmailOtp(destination, code);
      } else {
        await sendSmsOtp(destination, code);
      }
    } catch (error) {
      await prisma.loginOtp.update({ where: { id: otp.id }, data: { invalidatedAt: new Date() } });
      throw error;
    }

    authLogger.info('OTP sent', {
      requestId: args.requestId,
      userId: user.id,
      channel: args.channel,
      maskedDestination,
      ip: args.ip,
      userAgent: args.userAgent,
    });

    return { channel: args.channel, maskedDestination, expiresInSeconds: OTP_EXPIRY_MS / 1000 };
  }

  static async verifyOtp(args: VerifyOtpArgs): Promise<AuthOtpUser> {
    const email = normalizeOtpEmail(args.email);
    let user = await getAuthOtpUser(email);
    const now = new Date();

    if (!user || !user.isActive) {
      authLogger.warn('OTP verification failed: user not found or inactive', {
        requestId: args.requestId,
        email,
        ip: args.ip,
      });
      throw new AppError('Invalid or expired sign-in code', 401);
    }

    user = await clearExpiredOtpLock(user);
    assertNotLocked(user);

    const activeOtps = await prisma.loginOtp.findMany({
      where: {
        userId: user.id,
        consumedAt: null,
        invalidatedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    for (const otp of activeOtps) {
      const matches = await bcrypt.compare(args.code, otp.codeHash);
      if (!matches) continue;

      await prisma.$transaction([
        prisma.loginOtp.update({ where: { id: otp.id }, data: { consumedAt: now } }),
        prisma.loginOtp.updateMany({
          where: {
            userId: user.id,
            id: { not: otp.id },
            consumedAt: null,
            invalidatedAt: null,
          },
          data: { invalidatedAt: now },
        }),
        prisma.user.update({
          where: { id: user.id },
          data: {
            lastLoginAt: now,
            otpFailedAttempts: 0,
            otpFailedWindowStartedAt: null,
            otpLockedUntil: null,
          },
        }),
      ]);

      authLogger.info('OTP verification successful', { requestId: args.requestId, userId: user.id, ip: args.ip });
      return { ...user, otpFailedAttempts: 0, otpFailedWindowStartedAt: null, otpLockedUntil: null };
    }

    const attemptsRemaining = await recordOtpFailure(user);
    authLogger.warn('OTP verification failed: invalid code', {
      requestId: args.requestId,
      userId: user.id,
      ip: args.ip,
      attemptsRemaining,
    });
    throw new OtpInvalidCodeError(attemptsRemaining);
  }

  static async unlockUser(userId: string): Promise<void> {
    const now = new Date();
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          otpFailedAttempts: 0,
          otpFailedWindowStartedAt: null,
          otpLockedUntil: null,
        },
      }),
      prisma.loginOtp.updateMany({
        where: {
          userId,
          consumedAt: null,
          invalidatedAt: null,
        },
        data: { invalidatedAt: now },
      }),
    ]);
  }
}
