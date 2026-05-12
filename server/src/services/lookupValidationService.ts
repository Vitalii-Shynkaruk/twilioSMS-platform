import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import logger from '../config/logger';
import { config } from '../config';
import { getActiveTwilioClient } from '../config/twilio';
import { SUPPRESSION_REASONS, isLookupSuppressionReason } from './suppressionReasons';

const LOOKUP_CACHE_TTL_DAYS = 90;
const LOOKUP_SHADOW_SETTING_KEY = 'lookupShadowStartedAt';
const LOOKUP_SHADOW_DURATION_MS = 24 * 60 * 60 * 1000;

const INVALID_LINE_TYPES = new Set(['landline', 'fixedvoip', 'invalid']);
const QUARANTINE_LINE_TYPES = new Set(['nonfixedvoip', 'unknown', 'personal', 'tollfree', 'pager', 'voicemail']);

export type LookupDecisionStatus = 'PASS' | 'SUPPRESS' | 'QUARANTINE' | 'RETRY_PENDING' | 'FAILED_REVIEW';

export interface LookupDecision {
  phone: string;
  status: LookupDecisionStatus;
  reason?: string | null;
  lineType?: string | null;
  carrierName?: string | null;
  validatedAt?: Date | null;
  source: 'cache' | 'twilio' | 'error';
  errorMessage?: string | null;
}

export interface LookupShadowModeStatus {
  active: boolean;
  startedAt: Date | null;
  endsAt: Date | null;
}

export class LookupTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LookupTransientError';
  }
}

function normalizeLineType(value?: string | null): string | null {
  const normalized = String(value || '')
    .trim()
    .replace(/[\s_-]+/g, '')
    .toLowerCase();
  return normalized || null;
}

function readStringField(source: Record<string, unknown> | null, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isFreshValidation(validatedAt?: Date | string | null): boolean {
  if (!validatedAt) return false;
  const validatedTime = new Date(validatedAt).getTime();
  if (!Number.isFinite(validatedTime)) return false;
  return Date.now() - validatedTime < LOOKUP_CACHE_TTL_DAYS * 24 * 60 * 60 * 1000;
}

function parseSettingDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function classifyLineType(input: {
  phone: string;
  lineType?: string | null;
  carrierName?: string | null;
  valid?: boolean | null;
  source: 'cache' | 'twilio';
  validatedAt?: Date | null;
}): LookupDecision {
  const normalizedLineType = normalizeLineType(input.lineType);
  const validatedAt = input.validatedAt || new Date();

  if (input.valid === false || normalizedLineType === 'invalid') {
    return {
      phone: input.phone,
      status: 'SUPPRESS',
      reason: SUPPRESSION_REASONS.LOOKUP_INVALID,
      lineType: input.lineType || 'invalid',
      carrierName: input.carrierName || null,
      validatedAt,
      source: input.source,
    };
  }

  if (normalizedLineType === 'mobile') {
    return {
      phone: input.phone,
      status: 'PASS',
      reason: null,
      lineType: input.lineType || 'mobile',
      carrierName: input.carrierName || null,
      validatedAt,
      source: input.source,
    };
  }

  if (normalizedLineType && INVALID_LINE_TYPES.has(normalizedLineType)) {
    return {
      phone: input.phone,
      status: 'SUPPRESS',
      reason: SUPPRESSION_REASONS.LOOKUP_INVALID,
      lineType: input.lineType || normalizedLineType,
      carrierName: input.carrierName || null,
      validatedAt,
      source: input.source,
    };
  }

  if (!normalizedLineType || QUARANTINE_LINE_TYPES.has(normalizedLineType)) {
    return {
      phone: input.phone,
      status: 'QUARANTINE',
      reason: SUPPRESSION_REASONS.LOOKUP_QUARANTINE,
      lineType: input.lineType || 'unknown',
      carrierName: input.carrierName || null,
      validatedAt,
      source: input.source,
    };
  }

  return {
    phone: input.phone,
    status: 'QUARANTINE',
    reason: SUPPRESSION_REASONS.LOOKUP_QUARANTINE,
    lineType: input.lineType || normalizedLineType,
    carrierName: input.carrierName || null,
    validatedAt,
    source: input.source,
  };
}

function isProtectedFromLookupSuppression(input: {
  lead?: { optedOut?: boolean | null; isSuppressed?: boolean | null; suppressReason?: string | null } | null;
  suppressionEntry?: { reason?: string | null } | null;
}): boolean {
  if (input.lead?.optedOut) return true;
  if (input.lead?.isSuppressed && !isLookupSuppressionReason(input.lead.suppressReason)) return true;
  return !!input.suppressionEntry?.reason && !isLookupSuppressionReason(input.suppressionEntry.reason);
}

export function classifyLookupLineType(input: {
  phone: string;
  lineType?: string | null;
  carrierName?: string | null;
  valid?: boolean | null;
}): LookupDecision {
  return classifyLineType({ ...input, source: 'twilio', validatedAt: new Date() });
}

export class LookupValidationService {
  static async getShadowModeStatus(options?: { ensureStarted?: boolean }): Promise<LookupShadowModeStatus> {
    if (config.env !== 'production') {
      return { active: false, startedAt: null, endsAt: null };
    }

    const setting = await prisma.systemSetting.findUnique({ where: { key: LOOKUP_SHADOW_SETTING_KEY } });
    let startedAt = parseSettingDate(setting?.value);

    if (!startedAt && options?.ensureStarted) {
      startedAt = new Date();
      await prisma.systemSetting.upsert({
        where: { key: LOOKUP_SHADOW_SETTING_KEY },
        create: { key: LOOKUP_SHADOW_SETTING_KEY, value: startedAt.toISOString() },
        update: { value: startedAt.toISOString() },
      });
    }

    if (!startedAt) {
      return { active: false, startedAt: null, endsAt: null };
    }

    const endsAt = new Date(startedAt.getTime() + LOOKUP_SHADOW_DURATION_MS);
    return {
      active: Date.now() < endsAt.getTime(),
      startedAt,
      endsAt,
    };
  }

  static async validatePhone(phone: string): Promise<LookupDecision> {
    const existing = await prisma.lead.findUnique({
      where: { phone },
      select: {
        lineType: true,
        carrierName: true,
        validatedAt: true,
      },
    });

    if (existing?.lineType && isFreshValidation(existing.validatedAt)) {
      return classifyLineType({
        phone,
        lineType: existing.lineType,
        carrierName: existing.carrierName,
        validatedAt: existing.validatedAt,
        source: 'cache',
      });
    }

    const client = await getActiveTwilioClient();
    const lookupClient = (client as any)?.lookups?.v2;
    if (!lookupClient) {
      throw new LookupTransientError('Twilio Lookup client is not available');
    }

    try {
      const response = await lookupClient.phoneNumbers(phone).fetch({ fields: 'line_type_intelligence' });
      const responseRecord = asRecord(response);
      const intelligence =
        asRecord(responseRecord?.lineTypeIntelligence) || asRecord(responseRecord?.line_type_intelligence);
      const lineType = readStringField(intelligence, ['type', 'lineType', 'line_type']);
      const carrierName = readStringField(intelligence, ['carrierName', 'carrier_name', 'carrier']);
      const valid = typeof responseRecord?.valid === 'boolean' ? responseRecord.valid : null;

      return classifyLineType({
        phone,
        lineType,
        carrierName,
        valid,
        validatedAt: new Date(),
        source: 'twilio',
      });
    } catch (error: unknown) {
      const status =
        typeof (error as { status?: unknown }).status === 'number' ? (error as { status: number }).status : null;
      const code = String((error as { code?: unknown }).code || '');
      if (status === 404 || code === '20404') {
        return classifyLineType({
          phone,
          lineType: 'invalid',
          valid: false,
          validatedAt: new Date(),
          source: 'twilio',
        });
      }

      const message = error instanceof Error ? error.message : 'Twilio Lookup request failed';
      throw new LookupTransientError(message);
    }
  }

  static async upsertSuppressionEntry(phone: string, reason: string, source: string): Promise<void> {
    if (!isLookupSuppressionReason(reason)) {
      return;
    }

    const existing = await prisma.suppressionEntry.findUnique({ where: { phone } });
    if (existing && !isLookupSuppressionReason(existing.reason)) {
      return;
    }

    await prisma.suppressionEntry.upsert({
      where: { phone },
      create: { phone, reason, source },
      update: { reason, source },
    });
  }

  static async clearLookupSuppression(phone: string, leadId?: string): Promise<void> {
    const [lead, suppressionEntry] = await Promise.all([
      leadId
        ? prisma.lead.findUnique({
            where: { id: leadId },
            select: { optedOut: true, isSuppressed: true, suppressReason: true },
          })
        : prisma.lead.findUnique({
            where: { phone },
            select: { id: true, optedOut: true, isSuppressed: true, suppressReason: true },
          }),
      prisma.suppressionEntry.findUnique({ where: { phone }, select: { reason: true } }),
    ]);

    const operations: Prisma.PrismaPromise<unknown>[] = [];
    if (lead && !lead.optedOut && lead.isSuppressed && isLookupSuppressionReason(lead.suppressReason)) {
      operations.push(
        prisma.lead.updateMany({
          where: leadId ? { id: leadId } : { phone },
          data: {
            isSuppressed: false,
            suppressedAt: null,
            suppressReason: null,
          },
        }),
      );
    }

    if (suppressionEntry && isLookupSuppressionReason(suppressionEntry.reason)) {
      operations.push(prisma.suppressionEntry.deleteMany({ where: { phone } }));
    }

    if (operations.length > 0) {
      await prisma.$transaction(operations);
    }
  }

  static async clearAutoSuppression(phone: string, leadId?: string): Promise<void> {
    await this.clearLookupSuppression(phone, leadId);
  }

  static async hasProtectedSuppression(phone: string, leadId?: string): Promise<boolean> {
    const [lead, suppressionEntry] = await Promise.all([
      leadId
        ? prisma.lead.findUnique({
            where: { id: leadId },
            select: { optedOut: true, isSuppressed: true, suppressReason: true },
          })
        : prisma.lead.findUnique({
            where: { phone },
            select: { optedOut: true, isSuppressed: true, suppressReason: true },
          }),
      prisma.suppressionEntry.findUnique({ where: { phone }, select: { reason: true } }),
    ]);

    return isProtectedFromLookupSuppression({ lead, suppressionEntry });
  }

  static async escalateLookupFailureToReview(input: {
    leadId: string;
    phone: string;
    errorMessage?: string | null;
    requestedByUserId?: string | null;
  }): Promise<void> {
    if (await this.hasProtectedSuppression(input.phone, input.leadId)) {
      logger.warn('Lookup retry manual-review escalation skipped for protected suppression', {
        leadId: input.leadId,
        phone: input.phone,
        errorMessage: input.errorMessage || null,
      });
      return;
    }

    const now = new Date();
    await prisma.$transaction([
      prisma.lead.update({
        where: { id: input.leadId },
        data: {
          isSuppressed: true,
          suppressedAt: now,
          suppressReason: SUPPRESSION_REASONS.LOOKUP_FAILED_REVIEW,
        },
      }),
      prisma.suppressionEntry.upsert({
        where: { phone: input.phone },
        create: {
          phone: input.phone,
          reason: SUPPRESSION_REASONS.LOOKUP_FAILED_REVIEW,
          source: 'lookup_retry',
        },
        update: {
          reason: SUPPRESSION_REASONS.LOOKUP_FAILED_REVIEW,
          source: 'lookup_retry',
        },
      }),
      prisma.activityLog.create({
        data: {
          userId: input.requestedByUserId || null,
          action: 'lead.lookup_failed_review',
          entityType: 'lead',
          entityId: input.leadId,
          metadata: {
            phone: input.phone,
            errorMessage: input.errorMessage || null,
          },
        },
      }),
    ]);

    logger.warn('Lookup retry escalated lead to manual review', {
      leadId: input.leadId,
      phone: input.phone,
      errorMessage: input.errorMessage || null,
    });
  }
}
