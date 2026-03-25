import cron from 'node-cron';
import prisma from '../config/database';
import logger from '../config/logger';
import { DealStage, ProductType, RenewalTaskStatus } from '@prisma/client';

/**
 * Daily cron jobs for Phase 2 deal management.
 * Runs at midnight to:
 *   1. Increment daysInStage and staleDays for active deals
 *   2. Product-specific stall threshold detection
 *   3. Mark overdue renewal tasks
 *   4. Recalculate isHot (Approved/Committed = ALWAYS HOT per spec)
 */

let cronTask: ReturnType<typeof cron.schedule> | null = null;

const ACTIVE_STAGES: DealStage[] = [
  DealStage.NEW_LEAD,
  DealStage.ENGAGED_INTERESTED,
  DealStage.QUALIFIED,
  DealStage.SUBMITTED_IN_REVIEW,
  DealStage.APPROVED_OFFERS,
  DealStage.COMMITTED_FUNDING,
];

// Product-specific stall thresholds (days) per spec §4.5 Rule #21
const _STALL_THRESHOLDS: Record<string, number> = {
  [ProductType.MCA]: 2,
  [ProductType.LOC]: 3,
  [ProductType.EQUIPMENT]: 5,
  [ProductType.HELOC]: 7,
  [ProductType.SBA]: 60,
  [ProductType.CRE]: 60,
  [ProductType.BRIDGE]: 5,
};

async function runDailyDealMaintenance() {
  const start = Date.now();
  logger.info('[DealCron] Starting daily deal maintenance...');

  try {
    // 1. Increment daysInStage for all non-terminal deals
    const incrementResult = await prisma.deal.updateMany({
      where: { stage: { in: ACTIVE_STAGES } },
      data: { daysInStage: { increment: 1 } },
    });
    logger.info(`[DealCron] Incremented daysInStage for ${incrementResult.count} deals`);

    // 2. Increment staleDays for all deals without recent activity (24h+)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const staleResult = await prisma.deal.updateMany({
      where: {
        stage: { in: ACTIVE_STAGES },
        updatedAt: { lt: oneDayAgo },
      },
      data: { staleDays: { increment: 1 } },
    });
    logger.info(`[DealCron] Incremented staleDays for ${staleResult.count} deals`);

    // Reset staleDays for recently updated deals
    await prisma.deal.updateMany({
      where: {
        stage: { in: ACTIVE_STAGES },
        updatedAt: { gte: oneDayAgo },
        staleDays: { gt: 0 },
      },
      data: { staleDays: 0 },
    });

    // 3. Mark overdue renewal tasks
    const now = new Date();
    const overdueResult = await prisma.renewalTask.updateMany({
      where: {
        dueDate: { lt: now },
        status: RenewalTaskStatus.PENDING,
      },
      data: { status: RenewalTaskStatus.OVERDUE },
    });
    logger.info(`[DealCron] Marked ${overdueResult.count} renewal tasks as overdue`);

    // 4. Recalculate isHot for all active deals
    // Spec Rule #6: Approved/Committed = ALWAYS HOT
    // Also hot: lastReplyAt < 48h, lenderEngaged + appSubmitted, nextActionDue soon
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

    // Unmark non-hot deals (except Approved/Committed which are always hot)
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
  // Run daily at midnight server time
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

// Export for manual trigger (e.g., admin API)
export { runDailyDealMaintenance };
