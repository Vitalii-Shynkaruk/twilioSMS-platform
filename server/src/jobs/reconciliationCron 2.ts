import prisma from '../config/database';
import logger from '../config/logger';

let reconciliationTimer: NodeJS.Timeout | null = null;

async function runReconciliation(): Promise<void> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const repliedRows = await prisma.campaignLead.findMany({
    where: {
      status: 'REPLIED',
      repliedAt: { gte: since },
    },
    select: {
      campaignId: true,
      leadId: true,
      repliedAt: true,
    },
    take: 1000,
  });

  if (repliedRows.length === 0) return;

  const leadIds = [...new Set(repliedRows.map((row) => row.leadId))];
  const conversations = await prisma.conversation.findMany({
    where: { leadId: { in: leadIds } },
    select: {
      id: true,
      leadId: true,
      isActive: true,
      lastDirection: true,
      lastMessageAt: true,
      unreadCount: true,
    },
  });

  const conversationByLead = new Map(conversations.map((item) => [item.leadId, item]));
  const mismatches = repliedRows
    .map((row) => {
      const conversation = conversationByLead.get(row.leadId);
      if (!conversation) {
        return {
          leadId: row.leadId,
          campaignId: row.campaignId,
          issue: 'missing_conversation',
        };
      }

      const repliedAtTs = row.repliedAt ? row.repliedAt.getTime() : 0;
      const lastMessageTs = conversation.lastMessageAt ? conversation.lastMessageAt.getTime() : 0;
      if (!conversation.isActive) {
        return {
          leadId: row.leadId,
          campaignId: row.campaignId,
          conversationId: conversation.id,
          issue: 'inactive_conversation',
        };
      }
      if ((conversation.lastDirection || '').toLowerCase() !== 'inbound') {
        return {
          leadId: row.leadId,
          campaignId: row.campaignId,
          conversationId: conversation.id,
          issue: 'last_direction_not_inbound',
        };
      }
      if (lastMessageTs > 0 && repliedAtTs > 0 && lastMessageTs < repliedAtTs) {
        return {
          leadId: row.leadId,
          campaignId: row.campaignId,
          conversationId: conversation.id,
          issue: 'reply_timestamp_newer_than_conversation',
        };
      }
      return null;
    })
    .filter(Boolean)
    .slice(0, 50);

  if (mismatches.length > 0) {
    logger.warn('Inbox reconciliation mismatch detected', {
      mismatchCount: mismatches.length,
      mismatches,
    });
  }
}

export function startReconciliationCron(): void {
  if (reconciliationTimer) return;
  reconciliationTimer = setInterval(() => {
    void runReconciliation();
  }, 5 * 60_000);
  logger.info('Reconciliation cron started (every 5 min)');
  void runReconciliation();
}

export function stopReconciliationCron(): void {
  if (!reconciliationTimer) return;
  clearInterval(reconciliationTimer);
  reconciliationTimer = null;
  logger.info('Reconciliation cron stopped');
}
