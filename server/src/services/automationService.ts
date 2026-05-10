import prisma from '../config/database';
import logger from '../config/logger';
import { SendingEngine } from './sendingEngine';
import { Queue } from 'bullmq';
import redis from '../config/redis';


export const automationQueue = new Queue('automation-process', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { age: 86400 },
  },
});

export class AutomationService {
  static async processScheduledAutomations(): Promise<void> {
    const now = new Date();

    const dueRuns = await prisma.automationRun.findMany({
      where: {
        isActive: true,
        isPaused: false,
        nextRunAt: { lte: now },
      },
      include: {
        automationRule: {
          include: {
            templates: {
              orderBy: { sequenceOrder: 'asc' },
            },
          },
        },
        lead: true,
      },
      take: 100, // Process in batches
    });

    for (const run of dueRuns) {
      try {
        await this.executeAutomationStep(run);
      } catch (error: any) {
        logger.error(`Automation run ${run.id} failed:`, {
          error: error.message,
          leadId: run.leadId,
        });
      }
    }

    logger.info(`Processed ${dueRuns.length} automation runs`);
  }

  static async executeAutomationStep(run: any): Promise<void> {
    const { automationRule, lead } = run;
    const templates = automationRule.templates;

    if (lead.lastRepliedAt && lead.lastRepliedAt > run.createdAt) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          isActive: false,
          isPaused: true,
          pauseReason: 'reply_detected',
        },
      });
      logger.info(`Automation paused for lead ${lead.id}: reply detected`);
      return;
    }

    if (lead.optedOut) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          isActive: false,
          isPaused: true,
          pauseReason: 'opted_out',
        },
      });
      return;
    }

    const currentTemplate = templates.find((t: any) => t.sequenceOrder === run.currentStep + 1);

    if (!currentTemplate) {
      await prisma.automationRun.update({
        where: { id: run.id },
        data: {
          isActive: false,
          completedAt: new Date(),
        },
      });
      logger.info(`Automation completed for lead ${lead.id}`);
      return;
    }

    const body = SendingEngine.interpolateTemplate(currentTemplate.messageTemplate, {
      firstName: lead.firstName || '',
      lastName: lead.lastName || '',
      company: lead.company || '',
    });

    await SendingEngine.queueMessage({
      toNumber: lead.phone,
      body,
      leadId: lead.id,
      automationRunId: run.id,
    });

    const nextTemplate = templates.find((t: any) => t.sequenceOrder === run.currentStep + 2);

    const nextRunAt = nextTemplate ? new Date(Date.now() + nextTemplate.delayDays * 24 * 60 * 60 * 1000) : null;

    await prisma.automationRun.update({
      where: { id: run.id },
      data: {
        currentStep: run.currentStep + 1,
        lastRunAt: new Date(),
        nextRunAt,
        ...(nextRunAt === null && {
          isActive: false,
          completedAt: new Date(),
        }),
      },
    });
  }

  static async startAutomation(automationRuleId: string, leadId: string): Promise<string> {
    const existing = await prisma.automationRun.findFirst({
      where: {
        automationRuleId,
        leadId,
        isActive: true,
      },
    });

    if (existing) {
      throw new Error('Automation already running for this lead');
    }

    const rule = await prisma.automationRule.findUnique({
      where: { id: automationRuleId },
      include: {
        templates: { orderBy: { sequenceOrder: 'asc' } },
      },
    });

    if (!rule) throw new Error('Automation rule not found');

    const firstTemplate = rule.templates[0];
    const nextRunAt = firstTemplate ? new Date(Date.now() + firstTemplate.delayDays * 24 * 60 * 60 * 1000) : null;

    const run = await prisma.automationRun.create({
      data: {
        automationRuleId,
        leadId,
        currentStep: 0,
        isActive: true,
        nextRunAt,
      },
    });

    logger.info(`Automation started: ${rule.name} for lead ${leadId}`);
    return run.id;
  }

  static async pauseAutomationsForLead(leadId: string, reason: string): Promise<void> {
    await prisma.automationRun.updateMany({
      where: {
        leadId,
        isActive: true,
      },
      data: {
        isPaused: true,
        pauseReason: reason,
      },
    });
  }

  static async onLeadReply(leadId: string): Promise<void> {
    await this.pauseAutomationsForLead(leadId, 'reply_detected');

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return;

    const terminalStatuses = ['FUNDED', 'DNC'];

    if (!terminalStatuses.includes(lead.status)) {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          status: 'REPLIED',
          lastRepliedAt: new Date(),
        },
      });
      const repliedStage = await prisma.pipelineStage.findFirst({ where: { mappedStatus: 'REPLIED' } });
      if (repliedStage) {
        const card = await prisma.pipelineCard.findFirst({ where: { leadId } });
        if (card) {
          await prisma.pipelineCard.update({ where: { id: card.id }, data: { stageId: repliedStage.id } });
        } else {
          await prisma.pipelineCard.create({ data: { leadId, stageId: repliedStage.id } });
        }
      }
    } else {
      await prisma.lead.update({
        where: { id: leadId },
        data: { lastRepliedAt: new Date() },
      });
    }
  }
}
