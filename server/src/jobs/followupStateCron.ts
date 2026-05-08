import prisma from '../config/database';
import logger from '../config/logger';
import { AIService } from '../services/aiService';
import { config } from '../config';
import { getSocketIO } from '../realtime/socket';
import { withInboxAiPriorityRank } from '../utils/inboxAiPriority';

let followupTimer: NodeJS.Timeout | null = null;

function buildAiPersistence(signals: Record<string, unknown>) {
  return {
    extractedIndustry: typeof signals.industry === 'string' && signals.industry.trim() ? signals.industry.trim() : null,
    helocFitFlag: typeof signals.helocFitFlag === 'boolean' ? signals.helocFitFlag : null,
    extractedRevenue: typeof signals.revenueMonthly === 'number' ? Math.round(signals.revenueMonthly) : null,
    extractedAsk: typeof signals.ask === 'string' && signals.ask.trim() ? signals.ask.trim() : null,
  };
}

async function processDueFollowups(): Promise<void> {
  const now = new Date();
  const dueConversations = await prisma.conversation.findMany({
    where: {
      OR: [{ followupTime: { lte: now } }, { nextFollowupAt: { lte: now } }],
      isActive: true,
      followupStatus: { notIn: ['due_now', 'completed'] },
    },
    select: {
      id: true,
      assignedRepId: true,
    },
    take: 200,
  });

  if (dueConversations.length === 0) {
    return;
  }

  const dueIds = dueConversations.map((conversation) => conversation.id);
  await prisma.conversation.updateMany({
    where: { id: { in: dueIds } },
    data: { followupState: 'due_now', followupStatus: 'due_now', aiPriorityRank: 1 },
  });

  logger.info('Follow-up cron: marked conversations as due_now', { count: dueIds.length });

  if (!config.ai.classificationEnabled) {
    return;
  }

  const io = getSocketIO();
  for (const conversation of dueConversations) {
    try {
      const ai = await AIService.classifyInbound(conversation.id);
      if (!ai) continue;

      const persistedSignals: Record<string, unknown> = {
        ...(ai.signals as Record<string, unknown>),
        classifierPromptVersion: ai.promptVersion,
        reclassificationReason: 'followup_due_now',
        reclassifiedAt: new Date().toISOString(),
      };

      const aiPersistence = buildAiPersistence(persistedSignals);

      await prisma.conversation.update({
        where: { id: conversation.id },
        data: withInboxAiPriorityRank(
          {
            followupStatus: 'due_now',
          },
          {
            aiClassification: ai.classification,
            aiSignals: persistedSignals as object,
            aiSuggestions: ai.suggestions as object,
            ...aiPersistence,
            isCaliforniaNumber: ai.isCaliforniaNumber,
            aiLeadScore: ai.leadScore,
            aiClassifiedAt: new Date(),
          },
        ),
      });

      if (io) {
        const payload = {
          conversationId: conversation.id,
          classification: ai.classification,
          leadScore: ai.leadScore,
          signals: persistedSignals,
          suggestions: ai.suggestions,
          promptVersion: ai.promptVersion,
          isCaliforniaNumber: ai.isCaliforniaNumber,
          source: 'followup_cron',
          reason: 'followup_due_now',
        };

        io.to(`conversation:${conversation.id}`).emit('ai-classified', payload);
        if (conversation.assignedRepId) {
          io.to(`inbox:${conversation.assignedRepId}`).emit('ai-classified', payload);
        }
      }
    } catch (error) {
      logger.error('Follow-up cron reclassification failed', {
        conversationId: conversation.id,
        error: (error as Error).message,
      });
    }
  }
}

export function startFollowupStateCron(): void {
  if (followupTimer) return;

  followupTimer = setInterval(() => {
    void processDueFollowups();
  }, 60_000);

  logger.info('Follow-up state cron started (every 60s)');
  void processDueFollowups();
}

export function stopFollowupStateCron(): void {
  if (!followupTimer) return;
  clearInterval(followupTimer);
  followupTimer = null;
  logger.info('Follow-up state cron stopped');
}
