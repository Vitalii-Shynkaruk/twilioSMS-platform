import { DealStage, RenewalTaskStatus } from '@prisma/client';
import prisma from '../src/config/database';

async function main() {
  const now = new Date();

  const resolvedTasks = await prisma.renewalTask.updateMany({
    where: {
      deal: {
        stage: { in: [DealStage.CLOSED, DealStage.NURTURE] },
      },
      status: { in: [RenewalTaskStatus.PENDING, RenewalTaskStatus.OVERDUE] },
    },
    data: {
      status: RenewalTaskStatus.SKIPPED,
      completedAt: now,
    },
  });

  const clearedClosedDealFlags = await prisma.deal.updateMany({
    where: {
      stage: DealStage.CLOSED,
      OR: [{ nextAction: { not: null } }, { nextActionDue: { not: null } }],
    },
    data: {
      nextAction: null,
      nextActionDue: null,
      followUpDate: null,
      followUpType: null,
    },
  });

  console.log('[retroactive-closed-task-cleanup] done');
  console.log(
    JSON.stringify(
      {
        resolvedTasks: resolvedTasks.count,
        closedDealsCleared: clearedClosedDealFlags.count,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error('[retroactive-closed-task-cleanup] failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
