import prisma from '../config/database';
import logger from '../config/logger';
import { CampaignController } from '../controllers/campaignController';

let aiCohortTimer: NodeJS.Timeout | null = null;

export async function runAiCohortRefreshOnce(): Promise<{
  userCount: number;
  attempted: number;
  refreshed: number;
  failures: number;
}> {
  const users = await prisma.user.findMany({
    where: {
      isActive: true,
      role: { in: ['ADMIN', 'MANAGER', 'REP'] },
    },
    select: {
      id: true,
      email: true,
      role: true,
      firstName: true,
      lastName: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const summary = {
    userCount: users.length,
    attempted: 0,
    refreshed: 0,
    failures: 0,
  };

  for (const user of users) {
    try {
      const result = await CampaignController.warmAiCohortsForUser(user);
      summary.attempted += result.attempted;
      summary.refreshed += result.refreshed;
      summary.failures += result.failures;
    } catch (error) {
      summary.failures += 1;
      logger.warn('AI cohort cron user refresh failed', {
        userId: user.id,
        email: user.email,
        error: (error as Error).message,
      });
    }
  }

  logger.info('AI cohort cron completed', summary);
  return summary;
}

export function startAiCohortCron(): void {
  if (aiCohortTimer) return;
  aiCohortTimer = setInterval(() => {
    void runAiCohortRefreshOnce();
  }, 15 * 60_000);
  logger.info('AI cohort cron started (every 15 min)');
  void runAiCohortRefreshOnce();
}

export function stopAiCohortCron(): void {
  if (!aiCohortTimer) return;
  clearInterval(aiCohortTimer);
  aiCohortTimer = null;
  logger.info('AI cohort cron stopped');
}
