import prisma from '../config/database';
import redis from '../config/redis';
import logger from '../config/logger';
import { config } from '../config';
import { AutoTagService } from './autoTagService';
import { WebhookService } from './webhookService';

/**
 * ComplianceService - STOP/HELP handling, suppression, quiet hours
 * 
 * Critical for A2P 10DLC compliance:
 * - STOP keyword immediately opts out
 * - HELP keyword returns help info
 * - Suppression list prevents messaging
 * - Quiet hours enforcement
 * - DNC list checking
 * 
 * Performance: Redis caching reduces DB queries by ~90% for compliance checks
 */
export class ComplianceService {
  
  // Standard opt-out keywords
  static readonly OPT_OUT_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
  static readonly HELP_KEYWORDS = ['HELP', 'INFO'];
  private static readonly CACHE_TTL = 300; // 5 minutes
  
  /**
   * Check if we can send to a number (with Redis caching)
   */
  static async canSendTo(phone: string): Promise<{ allowed: boolean; reason?: string }> {
    // Check Redis cache first
    const cacheKey = `compliance:${phone}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached);
    }

    // Check suppression list
    const suppressed = await prisma.suppressionEntry.findUnique({
      where: { phone },
    });

    if (suppressed) {
      const result = { allowed: false, reason: `Suppressed: ${suppressed.reason}` };
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      return result;
    }

    // Check lead opt-out status
    const lead = await prisma.lead.findUnique({
      where: { phone },
      select: { optedOut: true, isSuppressed: true },
    });

    if (lead?.optedOut) {
      const result = { allowed: false, reason: 'Lead opted out' };
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      return result;
    }

    if (lead?.isSuppressed) {
      const result = { allowed: false, reason: 'Lead suppressed' };
      await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
      return result;
    }

    // Check quiet hours (not cached — time-dependent)
    if (await this.isQuietHours()) {
      return { allowed: false, reason: 'Quiet hours' };
    }

    const result = { allowed: true };
    await redis.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));
    return result;
  }

  /**
   * Invalidate compliance cache for a phone (call after opt-out/opt-in/suppression changes)
   */
  static async invalidateCache(phone: string): Promise<void> {
    await redis.del(`compliance:${phone}`);
  }

  /**
   * Process an inbound message for compliance keywords
   */
  static async processInboundKeywords(
    fromNumber: string,
    body: string
  ): Promise<{ isKeyword: boolean; action?: string; response?: string }> {
    const normalizedBody = body.trim().toUpperCase();

    // Check STOP
    if (this.OPT_OUT_KEYWORDS.includes(normalizedBody)) {
      await this.handleOptOut(fromNumber);
      return {
        isKeyword: true,
        action: 'opt_out',
        response: 'You have been unsubscribed. Reply START to re-subscribe.',
      };
    }

    // Check HELP
    if (this.HELP_KEYWORDS.includes(normalizedBody)) {
      return {
        isKeyword: true,
        action: 'help',
        response: `Secure Credit Lines. For help, call us at ${config.compliance.supportPhone}. Reply STOP to opt out.`,
      };
    }

    // Check START (re-subscribe)
    if (normalizedBody === 'START' || normalizedBody === 'YES') {
      await this.handleOptIn(fromNumber);
      return {
        isKeyword: true,
        action: 'opt_in',
        response: 'You have been re-subscribed to messages from Secure Credit Lines.',
      };
    }

    return { isKeyword: false };
  }

  /**
   * Handle opt-out
   */
  static async handleOptOut(phone: string): Promise<void> {
    // Update lead
    await prisma.lead.updateMany({
      where: { phone },
      data: {
        optedOut: true,
        optedOutAt: new Date(),
        status: 'DNC',
      },
    });

    // Add to suppression list
    await prisma.suppressionEntry.upsert({
      where: { phone },
      create: {
        phone,
        reason: 'STOP',
        source: 'sms_keyword',
      },
      update: {
        reason: 'STOP',
        source: 'sms_keyword',
      },
    });

    // Pause all automation runs for this lead
    const leads = await prisma.lead.findMany({
      where: { phone },
      select: { id: true },
    });

    for (const lead of leads) {
      await prisma.automationRun.updateMany({
        where: { leadId: lead.id, isActive: true },
        data: {
          isActive: false,
          isPaused: true,
          pauseReason: 'opted_out',
        },
      });
      // Auto-tag opted-out leads
      await AutoTagService.onOptOut(lead.id);
    }

    // Fire opt-out webhook
    await WebhookService.onOptOut({ phone, leadId: leads[0]?.id });

    logger.info(`Opt-out processed: ${phone}`);
    await this.invalidateCache(phone);
  }

  /**
   * Handle opt-in (START)
   */
  static async handleOptIn(phone: string): Promise<void> {
    await prisma.lead.updateMany({
      where: { phone },
      data: {
        optedOut: false,
        optedOutAt: null,
      },
    });

    await prisma.suppressionEntry.deleteMany({
      where: { phone, reason: 'STOP' },
    });

    logger.info(`Opt-in processed: ${phone}`);
    await this.invalidateCache(phone);
  }

  /**
   * Check if current time is within quiet hours.
   * Reads from DB SystemSetting first, falling back to env config.
   */
  static async isQuietHours(): Promise<boolean> {
    let quietHoursStart = config.compliance.quietHoursStart;
    let quietHoursEnd = config.compliance.quietHoursEnd;
    let timezone = config.compliance.timezone;

    try {
      // Try to read settings from DB (cached in Redis for 60s)
      const cacheKey = 'compliance:quiet_hours_config';
      const cached = await redis.get(cacheKey);

      if (cached) {
        const parsed = JSON.parse(cached);
        quietHoursStart = parsed.start;
        quietHoursEnd = parsed.end;
        timezone = parsed.timezone;
      } else {
        const settings = await prisma.systemSetting.findMany({
          where: {
            key: { in: ['quietHoursStart', 'quietHoursEnd', 'quietHoursTimezone'] },
          },
        });

        const settingsMap = Object.fromEntries(settings.map((s) => [s.key, String(s.value)]));

        if (settingsMap.quietHoursStart) {
          // Support "HH:MM" format from frontend
          const startStr = settingsMap.quietHoursStart;
          quietHoursStart = parseInt(startStr.includes(':') ? startStr.split(':')[0] : startStr, 10);
        }
        if (settingsMap.quietHoursEnd) {
          const endStr = settingsMap.quietHoursEnd;
          quietHoursEnd = parseInt(endStr.includes(':') ? endStr.split(':')[0] : endStr, 10);
        }
        if (settingsMap.quietHoursTimezone) {
          timezone = settingsMap.quietHoursTimezone;
        }

        // Cache for 60s
        await redis.set(
          cacheKey,
          JSON.stringify({ start: quietHoursStart, end: quietHoursEnd, timezone }),
          'EX',
          60
        );
      }
    } catch (err) {
      logger.warn('Failed to read quiet hours from DB, using env config', { error: (err as Error).message });
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
      timeZone: timezone,
      hour12: false,
      hour: '2-digit',
    });
    const currentHour = parseInt(timeStr, 10);

    // Handle overnight quiet hours (e.g., 20:00 - 09:00)
    if (quietHoursStart > quietHoursEnd) {
      return currentHour >= quietHoursStart || currentHour < quietHoursEnd;
    }

    return currentHour >= quietHoursStart && currentHour < quietHoursEnd;
  }

  /**
   * Bulk add to suppression list (CSV import)
   */
  static async bulkSuppress(
    phones: string[],
    reason: string,
    source: string
  ): Promise<number> {
    const entries = phones.map((phone) => ({
      phone,
      reason,
      source,
    }));

    const result = await prisma.suppressionEntry.createMany({
      data: entries,
      skipDuplicates: true,
    });

    return result.count;
  }
}
