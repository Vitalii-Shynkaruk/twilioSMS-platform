import prisma from '../config/database';
import redis from '../config/redis';
import getTwilioClient from '../config/twilio';
import { config } from '../config';
import logger from '../config/logger';
import { PhoneNumber, NumberStatus } from '@prisma/client';

/**
 * NumberService - Manages phone number pool, rotation, reputation & ramp-up
 * 
 * Key design decisions for high-volume:
 * - Numbers are reputation-grouped into pools
 * - Smart rotation distributes load evenly
 * - Ramp-up schedule prevents carrier filtering
 * - Cooling logic removes underperforming numbers temporarily
 * - Daily counters reset at midnight
 */
export class NumberService {

  private static readonly NUMBERS_CACHE_TTL = 30; // 30 seconds
  private static roundRobinIndex = 0; // In-memory round-robin counter

  /**
   * Get active numbers with Redis caching (30s TTL)
   * Avoids querying all numbers on every single message send
   */
  private static async getActiveNumbersCached(
    excludeNumbers: string[] = [],
    poolId?: string
  ): Promise<PhoneNumber[]> {
    const cacheKey = `active-numbers:${poolId || 'all'}`;
    const cached = await redis.get(cacheKey);

    let numbers: PhoneNumber[];
    if (cached) {
      numbers = JSON.parse(cached);
    } else {
      const now = new Date();
      numbers = await prisma.phoneNumber.findMany({
        where: {
          status: 'ACTIVE',
          OR: [
            { coolingUntil: null },
            { coolingUntil: { lt: now } },
          ],
          ...(poolId && {
            poolMemberships: {
              some: { poolId },
            },
          }),
        },
        orderBy: [
          { dailySentCount: 'asc' },
          { deliveryRate: 'desc' },
          { errorStreak: 'asc' },
        ],
      });
      await redis.setex(cacheKey, this.NUMBERS_CACHE_TTL, JSON.stringify(numbers));
    }

    // Filter in JS (excludes + daily limit)
    if (excludeNumbers.length > 0) {
      numbers = numbers.filter(n => !excludeNumbers.includes(n.phoneNumber));
    }

    return numbers;
  }

  /**
   * Invalidate active numbers cache (call after number changes)
   */
  static async invalidateNumbersCache(): Promise<void> {
    const keys = await redis.keys('active-numbers:*');
    if (keys.length > 0) await redis.del(...keys);
  }
  
  /**
   * Get the best available number for sending
   * Uses round-robin across eligible numbers to prevent stale-cache uneven distribution
   * Also applies delivery-rate based proactive throttling
   */
  static async getBestAvailableNumber(
    excludeNumbers: string[] = [],
    poolId?: string
  ): Promise<PhoneNumber | null> {
    const numbers = await this.getActiveNumbersCached(excludeNumbers, poolId);

    // Filter by daily limit (considering ramp-up) and delivery rate
    const eligible = numbers.filter(number => {
      const limit = this.getDailyLimit(number);
      if (number.dailySentCount >= limit) return false;

      // Proactive throttling: reduce capacity for underperforming numbers
      if (number.totalSent > 50 && number.deliveryRate < config.sms.deliveryRateThrottleAt) {
        // Only allow 50% of normal capacity for low-delivery numbers
        const reducedLimit = Math.floor(limit * 0.5);
        if (number.dailySentCount >= reducedLimit) return false;
      }

      return true;
    });

    if (eligible.length === 0) return null;

    // Round-robin selection for even distribution across numbers
    const index = this.roundRobinIndex % eligible.length;
    this.roundRobinIndex++;
    return eligible[index];
  }

  /**
   * Get daily limit considering ramp-up schedule
   */
  static getDailyLimit(number: PhoneNumber): number {
    if (!number.isRamping || !config.sms.rampUpEnabled) {
      return number.dailyLimit;
    }

    const rampDay = Math.min(number.rampDay, config.sms.rampSchedule.length);
    return config.sms.rampSchedule[rampDay - 1] || number.dailyLimit;
  }

  /**
   * Get the sticky sender for a conversation, or assign a new one
   */
  static async getStickyNumber(
    leadPhone: string,
    repId?: string
  ): Promise<PhoneNumber | null> {
    // First, check if there's an existing conversation with a sticky number
    const conversation = await prisma.conversation.findFirst({
      where: {
        lead: { phone: leadPhone },
        stickyNumberId: { not: null },
      },
    });

    if (conversation?.stickyNumberId) {
      const stickyNumber = await prisma.phoneNumber.findUnique({
        where: { id: conversation.stickyNumberId },
      });

      if (stickyNumber && stickyNumber.status === 'ACTIVE') {
        const limit = this.getDailyLimit(stickyNumber);
        if (stickyNumber.dailySentCount < limit) {
          return stickyNumber;
        }
      }
    }

    // If rep has assigned numbers, prefer those
    if (repId) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const assignment = await prisma.numberAssignment.findFirst({
        where: {
          userId: repId,
          isActive: true,
          assignedDate: { gte: today },
        },
        include: { phoneNumber: true },
        orderBy: { phoneNumber: { dailySentCount: 'asc' } },
      });

      if (assignment?.phoneNumber && assignment.phoneNumber.status === 'ACTIVE') {
        return assignment.phoneNumber;
      }
    }

    // Fall back to best available
    return this.getBestAvailableNumber();
  }

  /**
   * Record a send and update number statistics
   * NOTE: totalDelivered is updated by the Twilio status webhook, not here
   */
  static async recordSend(
    phoneNumberId: string,
    success: boolean,
    blocked: boolean = false
  ): Promise<void> {
    const updates: any = {
      dailySentCount: { increment: 1 },
      totalSent: { increment: 1 },
      lastSentAt: new Date(),
    };

    if (success) {
      // Delivery confirmation comes from Twilio webhook, not here
      updates.errorStreak = { set: 0 };
    } else if (blocked) {
      updates.totalBlocked = { increment: 1 };
      updates.errorStreak = { increment: 1 };
    } else {
      updates.totalFailed = { increment: 1 };
      updates.errorStreak = { increment: 1 };
      updates.lastErrorAt = new Date();
    }

    const number = await prisma.phoneNumber.update({
      where: { id: phoneNumberId },
      data: updates,
    });

    // Check if number needs cooling
    if (number.errorStreak >= 5) {
      await this.coolNumber(phoneNumberId, 'High error streak');
    }

    // Update delivery rate
    if (number.totalSent > 0) {
      const deliveryRate = (number.totalDelivered / number.totalSent) * 100;
      await prisma.phoneNumber.update({
        where: { id: phoneNumberId },
        data: { deliveryRate },
      });
    }

    // Update daily stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    await prisma.dailyNumberStats.upsert({
      where: {
        phoneNumberId_date: {
          phoneNumberId,
          date: today,
        },
      },
      create: {
        phoneNumberId,
        date: today,
        sent: 1,
        delivered: success ? 1 : 0,
        failed: !success && !blocked ? 1 : 0,
        blocked: blocked ? 1 : 0,
      },
      update: {
        sent: { increment: 1 },
        ...(success && { delivered: { increment: 1 } }),
        ...(!success && !blocked && { failed: { increment: 1 } }),
        ...(blocked && { blocked: { increment: 1 } }),
      },
    });
  }

  /**
   * Cool down a number temporarily
   */
  static async coolNumber(
    phoneNumberId: string,
    reason: string,
    hours: number = 24
  ): Promise<void> {
    const coolingUntil = new Date();
    coolingUntil.setHours(coolingUntil.getHours() + hours);

    await prisma.phoneNumber.update({
      where: { id: phoneNumberId },
      data: {
        status: 'COOLING',
        coolingUntil,
        cooldownReason: reason,
      },
    });

    logger.warn(`Number ${phoneNumberId} cooled down: ${reason}`, {
      phoneNumberId,
      reason,
      coolingUntil,
    });

    await this.invalidateNumbersCache();
  }

  /**
   * Reset daily counters (run at midnight)
   */
  static async resetDailyCounters(): Promise<void> {
    await prisma.phoneNumber.updateMany({
      data: { dailySentCount: 0 },
    });

    // Advance ramp day for ramping numbers
    await prisma.phoneNumber.updateMany({
      where: { isRamping: true },
      data: { rampDay: { increment: 1 } },
    });

    // Graduate numbers that completed ramp-up
    await prisma.phoneNumber.updateMany({
      where: {
        isRamping: true,
        rampDay: { gt: config.sms.rampSchedule.length },
      },
      data: {
        isRamping: false,
      },
    });

    // Restore cooled numbers whose cooling period expired
    await prisma.phoneNumber.updateMany({
      where: {
        status: 'COOLING',
        coolingUntil: { lt: new Date() },
      },
      data: {
        status: 'ACTIVE',
        coolingUntil: null,
        cooldownReason: null,
        errorStreak: 0,
      },
    });

    logger.info('Daily number counters reset');
  }

  /**
   * Assign numbers to a rep for the day
   */
  static async assignNumbersToRep(
    repId: string,
    phoneNumberIds: string[]
  ): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Deactivate old assignments
    await prisma.numberAssignment.updateMany({
      where: {
        userId: repId,
        isActive: true,
      },
      data: { isActive: false },
    });

    // Create new assignments
    await prisma.numberAssignment.createMany({
      data: phoneNumberIds.map((phoneNumberId) => ({
        userId: repId,
        phoneNumberId,
        assignedDate: today,
        isActive: true,
      })),
      skipDuplicates: true,
    });

    logger.info(`Assigned ${phoneNumberIds.length} numbers to rep ${repId}`);
  }

  /**
   * Get number health overview for monitoring dashboard
   */
  static async getNumberHealthOverview() {
    const numbers = await prisma.phoneNumber.findMany({
      select: {
        id: true,
        phoneNumber: true,
        friendlyName: true,
        twilioSid: true,
        status: true,
        dailySentCount: true,
        dailyLimit: true,
        deliveryRate: true,
        totalSent: true,
        totalDelivered: true,
        totalFailed: true,
        errorStreak: true,
        isRamping: true,
        rampDay: true,
        coolingUntil: true,
        cooldownReason: true,
        createdAt: true,
        lastSentAt: true,
        assignments: {
          where: { isActive: true },
          select: {
            user: { select: { id: true, firstName: true, lastName: true } },
          },
          take: 1,
        },
      },
      orderBy: { phoneNumber: 'asc' },
    });

    const summary = {
      total: numbers.length,
      active: numbers.filter((n) => n.status === 'ACTIVE').length,
      warming: numbers.filter((n) => n.status === 'WARMING').length,
      cooling: numbers.filter((n) => n.status === 'COOLING').length,
      suspended: numbers.filter((n) => n.status === 'SUSPENDED').length,
      totalCapacity: numbers.reduce((sum, n) => sum + n.dailyLimit, 0),
      totalUsed: numbers.reduce((sum, n) => sum + n.dailySentCount, 0),
      avgDeliveryRate:
        numbers.length > 0
          ? numbers.reduce((sum, n) => sum + n.deliveryRate, 0) / numbers.length
          : 0,
    };

    return { numbers, summary };
  }
}
