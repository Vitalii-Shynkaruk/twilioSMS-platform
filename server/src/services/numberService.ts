import prisma from '../config/database';
import redis from '../config/redis';
import { getActiveMessagingServiceSid } from '../config/twilio';
import { config } from '../config';
import logger from '../config/logger';
import { PhoneNumber } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

export class NumberService {
  private static readonly NUMBERS_CACHE_TTL = 30; // 30 seconds
  private static roundRobinIndex = 0; // In-memory round-robin counter
  private static readonly SEND_ATTEMPT_STATUSES = ['SENT', 'DELIVERED', 'FAILED', 'UNDELIVERED', 'BLOCKED'] as const;

  private static getRoutableNumbers<T extends Pick<PhoneNumber, 'id' | 'messagingServiceSid'>>(
    numbers: T[],
    activeMessagingServiceSid: string | null,
  ): T[] {
    const requireMessagingServiceRouting = Boolean(activeMessagingServiceSid);
    const a2pNumbers = numbers.filter(
      (number) =>
        Boolean(number.messagingServiceSid) &&
        (!activeMessagingServiceSid || number.messagingServiceSid === activeMessagingServiceSid),
    );

    if (requireMessagingServiceRouting) {
      return a2pNumbers;
    }

    return a2pNumbers.length > 0 ? a2pNumbers : numbers;
  }

  private static getDatePartsInTimezone(
    date: Date,
    timeZone: string,
  ): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(date);

    const map = new Map(parts.map((part) => [part.type, part.value]));
    return {
      year: Number(map.get('year')),
      month: Number(map.get('month')),
      day: Number(map.get('day')),
      hour: Number(map.get('hour')),
      minute: Number(map.get('minute')),
      second: Number(map.get('second')),
    };
  }

  private static getTimezoneOffsetMinutes(date: Date, timeZone: string): number {
    const p = this.getDatePartsInTimezone(date, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUtc - date.getTime()) / 60000);
  }

  private static getBusinessDayStart(date: Date = new Date()): Date {
    const tz = config.compliance.timezone || 'America/New_York';
    const p = this.getDatePartsInTimezone(date, tz);
    const utcMidnight = Date.UTC(p.year, p.month - 1, p.day, 0, 0, 0);
    const offsetMinutes = this.getTimezoneOffsetMinutes(new Date(utcMidnight), tz);
    return new Date(utcMidnight - offsetMinutes * 60000);
  }

  private static async getActiveNumbersCached(excludeNumbers: string[] = [], poolId?: string): Promise<PhoneNumber[]> {
    const cacheKey = `active-numbers:${poolId || 'all'}`;
    const cached = await redis.get(cacheKey);

    let numbers: PhoneNumber[];
    if (cached) {
      numbers = JSON.parse(cached);
    } else {
      const now = new Date();
      numbers = await prisma.phoneNumber.findMany({
        where: {
          OR: [{ status: 'ACTIVE' }, { status: 'COOLING', coolingUntil: { lt: now } }],
          ...(poolId && {
            poolMemberships: {
              some: { poolId },
            },
          }),
        },
        orderBy: [{ dailySentCount: 'asc' }, { deliveryRate: 'desc' }, { errorStreak: 'asc' }],
      });
      const expiredCooling = numbers.filter((n) => n.status === 'COOLING');
      if (expiredCooling.length > 0) {
        await prisma.phoneNumber.updateMany({
          where: { id: { in: expiredCooling.map((n) => n.id) } },
          data: { status: 'ACTIVE', coolingUntil: null, cooldownReason: null },
        });
      }
      await redis.setex(cacheKey, this.NUMBERS_CACHE_TTL, JSON.stringify(numbers));
    }

    if (excludeNumbers.length > 0) {
      numbers = numbers.filter((n) => !excludeNumbers.includes(n.phoneNumber));
    }

    return numbers;
  }

  static async invalidateNumbersCache(): Promise<void> {
    const keys = await redis.keys('active-numbers:*');
    if (keys.length > 0) await redis.del(...keys);
  }

  static async getBestAvailableNumber(
    excludeNumbers: string[] = [],
    poolId?: string,
    restrictToPhoneNumberIds?: string[],
  ): Promise<PhoneNumber | null> {
    let numbers = await this.getActiveNumbersCached(excludeNumbers, poolId);

    if (restrictToPhoneNumberIds !== undefined) {
      const allowed = new Set(restrictToPhoneNumberIds);
      numbers = numbers.filter((n) => allowed.has(n.id));
    }

    const activeMessagingServiceSid = await getActiveMessagingServiceSid();
    const requireMessagingServiceRouting = Boolean(activeMessagingServiceSid);
    const serviceCandidates = numbers.filter(
      (number) =>
        Boolean(number.messagingServiceSid) &&
        (!activeMessagingServiceSid || number.messagingServiceSid === activeMessagingServiceSid),
    );
    const pool = this.getRoutableNumbers(numbers, activeMessagingServiceSid);

    const eligible = pool.filter((number) => {
      const limit = this.getDailyLimit(number);
      if (number.dailySentCount >= limit) return false;

      if (number.totalSent > 50 && number.deliveryRate < config.sms.deliveryRateThrottleAt) {
        const reducedLimit = Math.floor(limit * 0.5);
        if (number.dailySentCount >= reducedLimit) return false;
      }

      return true;
    });

    if (requireMessagingServiceRouting && eligible.length === 0) {
      logger.warn('No Messaging Service-linked numbers available for send selection', {
        activeMessagingServiceSid,
        poolId: poolId || null,
        totalCandidates: numbers.length,
        serviceCandidates: serviceCandidates.length,
      });
      return null;
    }

    if (eligible.length === 0) return null;

    const index = this.roundRobinIndex % eligible.length;
    this.roundRobinIndex++;
    return eligible[index];
  }

  static async getActiveAssignedNumberIds(userId: string): Promise<string[]> {
    const now = new Date();
    const rows = await prisma.numberAssignment.findMany({
      where: {
        userId,
        isActive: true,
        phoneNumber: {
          OR: [{ status: 'ACTIVE' }, { status: 'COOLING', coolingUntil: { lt: now } }],
        },
      },
      select: { phoneNumberId: true },
    });

    return rows.map((r) => r.phoneNumberId);
  }

  static async getAssignedNumberCapacity(userId: string): Promise<{
    phoneNumberIds: string[];
    dailyCap: number;
    dailyUsed: number;
    dailyRemaining: number;
  } | null> {
    try {
      const now = new Date();
      const assignments = await prisma.numberAssignment.findMany({
        where: {
          userId,
          isActive: true,
          phoneNumber: {
            OR: [{ status: 'ACTIVE' }, { status: 'COOLING', coolingUntil: { lt: now } }],
          },
        },
        select: {
          phoneNumber: {
            select: {
              id: true,
              messagingServiceSid: true,
              dailySentCount: true,
              dailyLimit: true,
              isRamping: true,
              rampDay: true,
              status: true,
              coolingUntil: true,
            },
          },
        },
      });

      if (assignments.length === 0) {
        return null;
      }

      const assignedNumbers = assignments.map((assignment) => assignment.phoneNumber);
      const activeMessagingServiceSid = await getActiveMessagingServiceSid();
      const routableNumbers = this.getRoutableNumbers(assignedNumbers, activeMessagingServiceSid);

      if (routableNumbers.length === 0) {
        return {
          phoneNumberIds: [],
          dailyCap: 0,
          dailyUsed: 0,
          dailyRemaining: 0,
        };
      }

      const todayStart = this.getBusinessDayStart();
      const sentTodayCounts = await prisma.message.groupBy({
        by: ['phoneNumberId'],
        where: {
          direction: 'OUTBOUND',
          status: { in: [...this.SEND_ATTEMPT_STATUSES] },
          OR: [{ sentAt: { gte: todayStart } }, { failedAt: { gte: todayStart } }],
          phoneNumberId: { in: routableNumbers.map((number) => number.id) },
        },
        _count: { id: true },
      });

      const sentTodayMap = new Map<string, number>();
      for (const row of sentTodayCounts) {
        if (row.phoneNumberId) {
          sentTodayMap.set(row.phoneNumberId, row._count.id);
        }
      }

      const summary = routableNumbers.reduce(
        (acc, number) => {
          const limit = this.getDailyLimit(number);
          const used = sentTodayMap.get(number.id) ?? number.dailySentCount;

          acc.phoneNumberIds.push(number.id);
          acc.dailyCap += limit;
          acc.dailyUsed += used;
          acc.dailyRemaining += Math.max(0, limit - used);
          return acc;
        },
        {
          phoneNumberIds: [] as string[],
          dailyCap: 0,
          dailyUsed: 0,
          dailyRemaining: 0,
        },
      );

      return summary;
    } catch (error) {
      logger.warn('Assigned number capacity lookup failed', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return null;
    }
  }

  static getDailyLimit(number: Pick<PhoneNumber, 'dailyLimit' | 'isRamping' | 'rampDay'>): number {
    if (!number.isRamping || !config.sms.rampUpEnabled) {
      return number.dailyLimit;
    }

    const rampDay = Math.min(number.rampDay, config.sms.rampSchedule.length);
    return config.sms.rampSchedule[rampDay - 1] || number.dailyLimit;
  }

  static async getStickyNumber(leadPhone: string, repId?: string): Promise<PhoneNumber | null> {
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

      if (
        stickyNumber &&
        (stickyNumber.status === 'ACTIVE' ||
          (stickyNumber.status === 'COOLING' && stickyNumber.coolingUntil && stickyNumber.coolingUntil < new Date()))
      ) {
        const limit = this.getDailyLimit(stickyNumber);
        if (stickyNumber.dailySentCount < limit) {
          return stickyNumber;
        }
      }
    }

    if (repId) {
      const assignment = await prisma.numberAssignment.findFirst({
        where: {
          userId: repId,
          isActive: true,
        },
        include: { phoneNumber: true },
        orderBy: { phoneNumber: { dailySentCount: 'asc' } },
      });

      if (
        assignment?.phoneNumber &&
        (assignment.phoneNumber.status === 'ACTIVE' ||
          (assignment.phoneNumber.status === 'COOLING' &&
            assignment.phoneNumber.coolingUntil &&
            assignment.phoneNumber.coolingUntil < new Date()))
      ) {
        return assignment.phoneNumber;
      }
    }

    return this.getBestAvailableNumber();
  }

  static async recordSend(phoneNumberId: string, success: boolean, blocked: boolean = false): Promise<void> {
    const updates: any = {
      dailySentCount: { increment: 1 },
      totalSent: { increment: 1 },
      lastSentAt: new Date(),
    };

    if (success) {
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

    if (number.errorStreak >= 5) {
      await this.coolNumber(phoneNumberId, 'High error streak');
    }

    if (number.totalSent > 0) {
      const deliveryRate = (number.totalDelivered / number.totalSent) * 100;
      await prisma.phoneNumber.update({
        where: { id: phoneNumberId },
        data: { deliveryRate },
      });
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const id = `dns_${phoneNumberId}_${today.toISOString().slice(0, 10)}`;
    const deliveredInc = success ? 1 : 0;
    const failedInc = !success && !blocked ? 1 : 0;
    const blockedInc = blocked ? 1 : 0;

    await prisma.$executeRawUnsafe(
      `INSERT INTO daily_number_stats (id, phoneNumberId, date, sent, delivered, failed, blocked, replies, optOuts, deliveryRate, createdAt, updatedAt)
       VALUES (?, ?, ?, 1, ?, ?, ?, 0, 0, 100.0, NOW(), NOW())
       ON DUPLICATE KEY UPDATE
         sent = sent + 1,
         delivered = delivered + ?,
         failed = failed + ?,
         blocked = blocked + ?,
         updatedAt = NOW()`,
      id,
      phoneNumberId,
      today,
      deliveredInc,
      failedInc,
      blockedInc,
      deliveredInc,
      failedInc,
      blockedInc,
    );
  }

  static async coolNumber(phoneNumberId: string, reason: string, hours: number = 24): Promise<void> {
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

  static async recalculateDailyCounts(): Promise<void> {
    const todayStart = this.getBusinessDayStart();

    const counts = await prisma.message.groupBy({
      by: ['phoneNumberId'],
      where: {
        direction: 'OUTBOUND',
        status: { in: [...this.SEND_ATTEMPT_STATUSES] },
        OR: [{ sentAt: { gte: todayStart } }, { failedAt: { gte: todayStart } }],
        phoneNumberId: { not: null },
      },
      _count: { id: true },
    });

    await prisma.phoneNumber.updateMany({ data: { dailySentCount: 0 } });

    for (const row of counts) {
      if (row.phoneNumberId) {
        await prisma.phoneNumber.update({
          where: { id: row.phoneNumberId },
          data: { dailySentCount: row._count.id },
        });
      }
    }

    await this.invalidateNumbersCache();
    logger.info(`Daily counts recalculated from messages: ${counts.length} numbers updated`);
  }

  static async resetDailyCounters(): Promise<void> {
    await prisma.phoneNumber.updateMany({
      data: { dailySentCount: 0 },
    });

    await prisma.phoneNumber.updateMany({
      where: { isRamping: true },
      data: { rampDay: { increment: 1 } },
    });

    await prisma.phoneNumber.updateMany({
      where: {
        isRamping: true,
        rampDay: { gt: config.sms.rampSchedule.length },
      },
      data: {
        isRamping: false,
      },
    });

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

  static async assignNumbersToRep(repId: string, phoneNumberIds: string[]): Promise<void> {
    const now = new Date();
    const activeMessagingServiceSid = await getActiveMessagingServiceSid();

    if (activeMessagingServiceSid) {
      const selectedNumbers = await prisma.phoneNumber.findMany({
        where: { id: { in: phoneNumberIds } },
        select: {
          id: true,
          phoneNumber: true,
          messagingServiceSid: true,
        },
      });

      const invalidNumbers = selectedNumbers.filter(
        (number) => number.messagingServiceSid !== activeMessagingServiceSid,
      );
      if (invalidNumbers.length > 0) {
        throw new AppError(
          `Cannot assign numbers that are not linked to the active Messaging Service: ${invalidNumbers
            .map((number) => number.phoneNumber)
            .join(', ')}`,
          400,
        );
      }
    }

    await prisma.numberAssignment.updateMany({
      where: {
        userId: repId,
        isActive: true,
      },
      data: { isActive: false },
    });

    await prisma.numberAssignment.updateMany({
      where: {
        phoneNumberId: { in: phoneNumberIds },
        isActive: true,
      },
      data: { isActive: false },
    });

    await prisma.numberAssignment.createMany({
      data: phoneNumberIds.map((phoneNumberId) => ({
        userId: repId,
        phoneNumberId,
        assignedDate: now,
        isActive: true,
      })),
    });

    logger.info(`Assigned ${phoneNumberIds.length} numbers to rep ${repId}`);
  }

  static async getNumberHealthOverview() {
    const todayStart = this.getBusinessDayStart();

    const sentTodayCounts = await prisma.message.groupBy({
      by: ['phoneNumberId'],
      where: {
        direction: 'OUTBOUND',
        status: { in: [...this.SEND_ATTEMPT_STATUSES] },
        OR: [{ sentAt: { gte: todayStart } }, { failedAt: { gte: todayStart } }],
        phoneNumberId: { not: null },
      },
      _count: { id: true },
    });

    const statusBreakdown = await prisma.message.groupBy({
      by: ['phoneNumberId', 'status'],
      where: {
        direction: 'OUTBOUND',
        status: { in: [...this.SEND_ATTEMPT_STATUSES] },
        OR: [{ sentAt: { gte: todayStart } }, { failedAt: { gte: todayStart } }],
        phoneNumberId: { not: null },
      },
      _count: { id: true },
    });

    const campaignCounts = await prisma.message.groupBy({
      by: ['phoneNumberId'],
      where: {
        direction: 'OUTBOUND',
        status: { in: [...this.SEND_ATTEMPT_STATUSES] },
        OR: [{ sentAt: { gte: todayStart } }, { failedAt: { gte: todayStart } }],
        phoneNumberId: { not: null },
        campaignId: { not: null },
      },
      _count: { id: true },
    });

    const repCounts = await prisma.message.groupBy({
      by: ['phoneNumberId', 'sentByUserId'],
      where: {
        direction: 'OUTBOUND',
        status: { in: [...this.SEND_ATTEMPT_STATUSES] },
        OR: [{ sentAt: { gte: todayStart } }, { failedAt: { gte: todayStart } }],
        phoneNumberId: { not: null },
        sentByUserId: { not: null },
      },
      _count: { id: true },
    });

    const repIds = [...new Set(repCounts.map((r) => r.sentByUserId).filter(Boolean))] as string[];
    const reps =
      repIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: repIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const repNameMap = new Map(reps.map((r) => [r.id, `${r.firstName} ${r.lastName?.[0] || ''}.`]));

    const sentTodayMap = new Map<string, number>();
    for (const row of sentTodayCounts) {
      if (row.phoneNumberId) {
        sentTodayMap.set(row.phoneNumberId, row._count.id);
      }
    }

    const statusMap = new Map<string, Array<{ status: string; count: number }>>();
    for (const row of statusBreakdown) {
      if (!row.phoneNumberId) continue;
      const arr = statusMap.get(row.phoneNumberId) || [];
      arr.push({ status: row.status, count: row._count.id });
      statusMap.set(row.phoneNumberId, arr);
    }

    const campaignMap = new Map<string, number>();
    for (const row of campaignCounts) {
      if (row.phoneNumberId) campaignMap.set(row.phoneNumberId, row._count.id);
    }

    const repMap = new Map<string, Array<{ name: string; count: number }>>();
    for (const row of repCounts) {
      if (!row.phoneNumberId || !row.sentByUserId) continue;
      const arr = repMap.get(row.phoneNumberId) || [];
      arr.push({
        name: repNameMap.get(row.sentByUserId) || 'Unknown',
        count: row._count.id,
      });
      repMap.set(row.phoneNumberId, arr);
    }

    const numbers = await prisma.phoneNumber.findMany({
      select: {
        id: true,
        phoneNumber: true,
        friendlyName: true,
        twilioSid: true,
        messagingServiceSid: true,
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

    const numbersWithActualCounts = numbers.map((n) => {
      const total = sentTodayMap.get(n.id) ?? n.dailySentCount;
      const campaignCount = campaignMap.get(n.id) ?? 0;
      const manualCount = total - campaignCount;
      const statuses = statusMap.get(n.id) || [];
      const reps = (repMap.get(n.id) || []).sort((a, b) => b.count - a.count);

      return {
        ...n,
        dailySentCount: total,
        sentBreakdown: {
          campaign: campaignCount,
          manual: manualCount < 0 ? 0 : manualCount,
          statuses,
          reps,
        },
      };
    });

    const summary = {
      total: numbersWithActualCounts.length,
      active: numbersWithActualCounts.filter((n) => n.status === 'ACTIVE').length,
      warming: numbersWithActualCounts.filter((n) => n.status === 'WARMING').length,
      cooling: numbersWithActualCounts.filter((n) => n.status === 'COOLING').length,
      suspended: numbersWithActualCounts.filter((n) => n.status === 'SUSPENDED').length,
      totalCapacity: numbersWithActualCounts.reduce((sum, n) => sum + n.dailyLimit, 0),
      totalUsed: numbersWithActualCounts.reduce((sum, n) => sum + n.dailySentCount, 0),
      avgDeliveryRate:
        numbersWithActualCounts.length > 0
          ? numbersWithActualCounts.reduce((sum, n) => sum + n.deliveryRate, 0) / numbersWithActualCounts.length
          : 0,
    };

    return { numbers: numbersWithActualCounts, summary };
  }
}
