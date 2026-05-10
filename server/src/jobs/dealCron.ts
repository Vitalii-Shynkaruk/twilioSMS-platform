import cron from 'node-cron';
import prisma from '../config/database';
import logger from '../config/logger';
import { DealStage, ProductType, RenewalTaskStatus } from '@prisma/client';


let cronTask: ReturnType<typeof cron.schedule> | null = null;

const ACTIVE_STAGES: DealStage[] = [
  DealStage.NEW_LEAD,
  DealStage.ENGAGED_INTERESTED,
  DealStage.QUALIFIED,
  DealStage.SUBMITTED_IN_REVIEW,
  DealStage.APPROVED_OFFERS,
  DealStage.COMMITTED_FUNDING,
];

const STALL_THRESHOLDS: Record<string, number> = {
  [ProductType.MCA]: 2,
  [ProductType.LOC]: 3,
  [ProductType.EQUIPMENT]: 5,
  [ProductType.HELOC]: 7,
  [ProductType.SBA]: 60,
  [ProductType.CRE]: 60,
  [ProductType.BRIDGE]: 5,
};
const DEFAULT_STALL_THRESHOLD = 3;

async function runDailyDealMaintenance() {
  const start = Date.now();
  logger.info('[DealCron] Starting daily deal maintenance...');

  try {
    const incrementResult = await prisma.deal.updateMany({
      where: { stage: { in: ACTIVE_STAGES } },
      data: { daysInStage: { increment: 1 } },
    });
    logger.info(`[DealCron] Incremented daysInStage for ${incrementResult.count} deals`);

    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleResult = await prisma.deal.updateMany({
      where: {
        stage: { in: ACTIVE_STAGES },
        lastActivityAt: { lt: oneDayAgo },
      },
      data: { staleDays: { increment: 1 } },
    });
    logger.info(`[DealCron] Incremented staleDays for ${staleResult.count} deals`);

    await prisma.deal.updateMany({
      where: {
        stage: { in: ACTIVE_STAGES },
        lastActivityAt: { gte: oneDayAgo },
        staleDays: { gt: 0 },
      },
      data: { staleDays: 0 },
    });

    const activeDeals = await prisma.deal.findMany({
      where: { stage: { in: ACTIVE_STAGES } },
      select: { id: true, productType: true, staleDays: true, isHot: true },
    });
    const stalled: string[] = [];
    for (const d of activeDeals) {
      const threshold = d.productType
        ? (STALL_THRESHOLDS[d.productType] ?? DEFAULT_STALL_THRESHOLD)
        : DEFAULT_STALL_THRESHOLD;
      if (d.staleDays >= threshold) stalled.push(d.id);
    }
    if (stalled.length > 0) {
      logger.info(`[DealCron] ${stalled.length} deals exceed product-specific stall threshold`);
    }

    const now = new Date();
    const overdueResult = await prisma.renewalTask.updateMany({
      where: {
        dueDate: { lt: now },
        status: RenewalTaskStatus.PENDING,
      },
      data: { status: RenewalTaskStatus.OVERDUE },
    });
    logger.info(`[DealCron] Marked ${overdueResult.count} renewal tasks as overdue`);

    await prisma.deal.updateMany({
      where: {
        stage: { in: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING] },
      },
      data: { isHot: true },
    });

    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    await prisma.deal.updateMany({
      where: {
        stage: { in: ACTIVE_STAGES, notIn: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING] },
        OR: [
          { lastReplyAt: { gte: twoDaysAgo } },
          { AND: [{ lenderEngaged: true }, { appSubmitted: true }] },
          { nextActionDue: { lte: tomorrow } },
        ],
      },
      data: { isHot: true },
    });

    await prisma.deal.updateMany({
      where: {
        stage: { in: ACTIVE_STAGES, notIn: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING] },
        isHot: true,
        lastReplyAt: { lt: twoDaysAgo },
        nextActionDue: { gt: tomorrow },
        OR: [{ lenderEngaged: false }, { appSubmitted: false }],
      },
      data: { isHot: false },
    });

    const elapsed = Date.now() - start;
    logger.info(`[DealCron] Daily maintenance completed in ${elapsed}ms`);
  } catch (error) {
    logger.error('[DealCron] Daily maintenance failed:', error);
  }
}

export function startDealCron() {
  cronTask = cron.schedule('0 0 * * *', runDailyDealMaintenance, {
    timezone: 'America/New_York',
  });
  logger.info('[DealCron] Scheduled daily deal maintenance at midnight EST');
}

export function stopDealCron() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info('[DealCron] Stopped daily deal maintenance cron');
  }
}

export { runDailyDealMaintenance };
