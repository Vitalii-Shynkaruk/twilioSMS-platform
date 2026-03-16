import prisma from '../config/database';
import logger from '../config/logger';
import { SendingEngine } from './sendingEngine';
import { Queue } from 'bullmq';
import redis from '../config/redis';

/**
 * AutomationService - Rule-based follow-ups, keyword triggers, state changes
 * 
 * Phase 1 (MVP): 
 * - Send follow-up after X days if no reply
 * - Stop automation if reply detected
 * - Basic tagging rules
 * - Time-delay logic
 * 
 * Phase 2 (Future):
 * - AI-assisted draft replies
 * - Smart template selection
 * - Lead scoring
 */

export const automationQueue = new Queue('automation-process', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 10000 },
    removeOnComplete: { age: 86400 },
  },
});

export class AutomationService {

  /**
   * Check and process all active automation runs
   * Called periodically by the automation worker
   */
  static async processScheduledAutomations(): Promise<void> {
    const now = new Date();

    // Find all automation runs that are due
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

  /**
   * Execute the next step in an automation sequence
   */
  static async executeAutomationStep(run: any): Promise<void> {
    const { automationRule, lead } = run;
    const templates = automationRule.templates;

    // Check if lead has replied (auto-pause)
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

    // Check if lead opted out
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

    // Get the current template in sequence
    const currentTemplate = templates.find(
      (t: any) => t.sequenceOrder === run.currentStep + 1
    );

    if (!currentTemplate) {
      // Sequence complete
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

    // Interpolate and send the template
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

    // Calculate next run time
    const nextTemplate = templates.find(
      (t: any) => t.sequenceOrder === run.currentStep + 2
    );

    const nextRunAt = nextTemplate
      ? new Date(Date.now() + nextTemplate.delayDays * 24 * 60 * 60 * 1000)
      : null;

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

  /**
   * Start an automation sequence for a lead
   */
  static async startAutomation(
    automationRuleId: string,
    leadId: string
  ): Promise<string> {
    // Check if already running
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
    const nextRunAt = firstTemplate
      ? new Date(Date.now() + firstTemplate.delayDays * 24 * 60 * 60 * 1000)
      : null;

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

  /**
   * Pause automation for a lead (on reply)
   */
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

  /**
   * Handle incoming reply - pause automations
   */
  static async onLeadReply(leadId: string): Promise<void> {
    await this.pauseAutomationsForLead(leadId, 'reply_detected');

    // Update lead status if currently "CONTACTED"
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (lead && lead.status === 'CONTACTED') {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          status: 'REPLIED',
          lastRepliedAt: new Date(),
        },
      });
    } else if (lead) {
      await prisma.lead.update({
        where: { id: leadId },
        data: { lastRepliedAt: new Date() },
      });
    }
  }
}
