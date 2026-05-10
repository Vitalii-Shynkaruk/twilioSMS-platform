import prisma from '../config/database';
import { DealStage } from '@prisma/client';
import { AppError } from '../middleware/errorHandler';

type Actor = {
  id?: string | null;
  role?: string | null;
};

type OutboundGateStatus = {
  blocked: boolean;
  overdueTasks: number;
  threshold: number;
  message: string;
};

function isAdminLike(role?: string | null): boolean {
  return role === 'ADMIN' || role === 'MANAGER';
}

export class OutboundGateService {
  static readonly THRESHOLD_KEY_PREFIX = 'smsOutboundOverdueThreshold:';
  static readonly DEFAULT_THRESHOLD = 1;

  static thresholdKeyForRep(repId: string): string {
    return `${OutboundGateService.THRESHOLD_KEY_PREFIX}${repId}`;
  }

  static parseThreshold(value: unknown): number {
    const parsed = typeof value === 'number' ? value : parseInt(String(value ?? ''), 10);
    if (!Number.isFinite(parsed) || parsed < 0) return OutboundGateService.DEFAULT_THRESHOLD;
    return Math.floor(parsed);
  }

  static async getThresholdForRep(repId: string): Promise<number> {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: OutboundGateService.thresholdKeyForRep(repId) },
      select: { value: true },
    });
    if (!setting) return OutboundGateService.DEFAULT_THRESHOLD;
    return OutboundGateService.parseThreshold(setting.value);
  }

  static async setThresholdForRep(repId: string, threshold: number): Promise<void> {
    const normalized = Number.isFinite(threshold) ? Math.max(0, Math.floor(threshold)) : OutboundGateService.DEFAULT_THRESHOLD;
    await prisma.systemSetting.upsert({
      where: { key: OutboundGateService.thresholdKeyForRep(repId) },
      create: {
        key: OutboundGateService.thresholdKeyForRep(repId),
        value: normalized,
      },
      update: {
        value: normalized,
      },
    });
  }

  static async getOverdueTasksForRep(repId: string): Promise<number> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const overdueDeals = await prisma.deal.count({
      where: {
        assignedRepId: repId,
        stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] },
        nextActionDue: { lt: startOfToday },
      },
    });
    return overdueDeals;
  }

  static async getGateStatus(actor: Actor | null | undefined): Promise<OutboundGateStatus> {
    if (!actor?.id || isAdminLike(actor.role)) {
      return {
        blocked: false,
        overdueTasks: 0,
        threshold: OutboundGateService.DEFAULT_THRESHOLD,
        message: '0 overdue tasks — clear to unlock SMS',
      };
    }

    const [threshold, overdueTasks] = await Promise.all([
      OutboundGateService.getThresholdForRep(actor.id),
      OutboundGateService.getOverdueTasksForRep(actor.id),
    ]);

    const blocked = threshold > 0 && overdueTasks >= threshold;
    return {
      blocked,
      overdueTasks,
      threshold,
      message: `${overdueTasks} overdue tasks — clear to unlock SMS`,
    };
  }

  static async ensureCanLaunchOutbound(actor: Actor | null | undefined): Promise<void> {
    const status = await OutboundGateService.getGateStatus(actor);
    if (status.blocked) {
      throw new AppError(status.message, 403);
    }
  }
}
