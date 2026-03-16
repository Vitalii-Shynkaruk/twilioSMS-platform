import prisma from '../config/database';
import getTwilioClient, { getActiveTwilioClient, getSmsMode } from '../config/twilio';
import { config } from '../config';
import logger from '../config/logger';
import { NumberService } from './numberService';
import { ComplianceService } from './complianceService';
import { Queue } from 'bullmq';
import redis from '../config/redis';

/**
 * SendingEngine - Core message sending with throttling, queuing, and compliance
 * 
 * Architecture for 10k-20k+ messages/day:
 * 1. Messages enter the queue (BullMQ with Redis)
 * 2. Worker processes messages with rate limiting
 * 3. Smart number rotation distributes load
 * 4. Webhook callbacks update delivery status
 * 5. Failed messages retry with exponential backoff
 */

// BullMQ Queues
export const smsQueue = new Queue('sms-send', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: {
      age: 86400, // 24 hours
      count: 10000,
    },
    removeOnFail: {
      age: 604800, // 7 days
    },
  },
});

export const campaignQueue = new Queue('campaign-process', {
  connection: redis,
  defaultJobOptions: {
    attempts: 2,
    removeOnComplete: { age: 86400 },
  },
});

interface SendMessageOptions {
  toNumber: string;
  body: string;
  leadId: string;
  campaignId?: string;
  automationRunId?: string;
  sentByUserId?: string;
  preferredNumberId?: string;
  priority?: number;
}

interface BulkSendOptions {
  leads: Array<{
    leadId: string;
    phone: string;
    firstName?: string;
    lastName?: string;
    company?: string;
    customFields?: Record<string, string>;
  }>;
  messageTemplate: string;
  campaignId?: string;
  sentByUserId?: string;
  poolId?: string;
  sendingSpeed?: number; // messages per minute
}

export class SendingEngine {
  
  /**
   * Check if simulation mode is enabled (no API calls at all)
   */
  static async isSimulationMode(): Promise<boolean> {
    return (await getSmsMode()) === 'simulation';
  }

  /**
   * Queue a single message for sending
   */
  static async queueMessage(options: SendMessageOptions): Promise<string> {
    // Compliance checks
    const complianceCheck = await ComplianceService.canSendTo(options.toNumber);
    if (!complianceCheck.allowed) {
      logger.warn(`Message blocked by compliance: ${complianceCheck.reason}`, {
        toNumber: options.toNumber,
      });
      throw new Error(`Cannot send: ${complianceCheck.reason}`);
    }

    // Create or get conversation
    const conversation = await this.getOrCreateConversation(
      options.leadId,
      options.sentByUserId
    );

    // Get best number
    const fromNumber = options.preferredNumberId
      ? await prisma.phoneNumber.findUnique({ where: { id: options.preferredNumberId } })
      : await NumberService.getStickyNumber(
          options.toNumber,
          options.sentByUserId
        );

    if (!fromNumber) {
      throw new Error('No available phone numbers for sending');
    }

    // Create message record
    const message = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        status: 'QUEUED',
        fromNumber: fromNumber.phoneNumber,
        toNumber: options.toNumber,
        body: options.body,
        campaignId: options.campaignId,
        automationRunId: options.automationRunId,
        sentByUserId: options.sentByUserId,
        phoneNumberId: fromNumber.id,
      },
    });

    // Add to queue
    await smsQueue.add(
      'send-sms',
      {
        messageId: message.id,
        fromNumber: fromNumber.phoneNumber,
        toNumber: options.toNumber,
        body: options.body,
        phoneNumberId: fromNumber.id,
      },
      {
        priority: options.priority || 0,
        delay: 0,
      }
    );

    return message.id;
  }

  /**
   * Queue a bulk campaign send
   * OPTIMIZED: Pre-fetches compliance data + uses batch operations
   * Reduces ~50K DB queries to ~10 for a 10K campaign
   */
  static async queueBulkSend(options: BulkSendOptions): Promise<{
    queued: number;
    skipped: number;
    errors: string[];
  }> {
    let queued = 0;
    let skipped = 0;
    const errors: string[] = [];

    const sendingSpeed = options.sendingSpeed || config.sms.maxPerMinute;
    const baseDelayBetweenMs = Math.ceil(60000 / sendingSpeed);

    // ── BATCH PRE-FETCH: compliance data in 2 queries instead of 2 per lead ──
    const phones = options.leads.map(l => l.phone);
    const [suppressedEntries, leadsStatus] = await Promise.all([
      prisma.suppressionEntry.findMany({
        where: { phone: { in: phones } },
        select: { phone: true },
      }),
      prisma.lead.findMany({
        where: { phone: { in: phones }, OR: [{ optedOut: true }, { isSuppressed: true }] },
        select: { phone: true },
      }),
    ]);
    const blockedPhones = new Set([
      ...suppressedEntries.map(s => s.phone),
      ...leadsStatus.map(l => l.phone),
    ]);

    // Check quiet hours once
    if (await ComplianceService.isQuietHours()) {
      return { queued: 0, skipped: options.leads.length, errors: ['Quiet hours — all skipped'] };
    }

    // ── BATCH PRE-FETCH: existing conversations ──
    const leadIds = options.leads.map(l => l.leadId);
    const existingConvos = await prisma.conversation.findMany({
      where: { leadId: { in: leadIds } },
      select: { id: true, leadId: true },
    });
    const convoMap = new Map(existingConvos.map(c => [c.leadId, c.id]));

    // ── PROCESS LEADS ──
    const jobsToQueue: Array<{ name: string; data: any; opts: any }> = [];
    const missingConvoLeads: string[] = [];

    // Find leads that need new conversations
    for (const lead of options.leads) {
      if (!convoMap.has(lead.leadId)) {
        missingConvoLeads.push(lead.leadId);
      }
    }

    // Batch-create missing conversations
    if (missingConvoLeads.length > 0) {
      await prisma.conversation.createMany({
        data: missingConvoLeads.map(leadId => ({
          leadId,
          assignedRepId: options.sentByUserId,
          isActive: true,
        })),
        skipDuplicates: true,
      });
      // Re-fetch to get IDs
      const newConvos = await prisma.conversation.findMany({
        where: { leadId: { in: missingConvoLeads } },
        select: { id: true, leadId: true },
      });
      for (const c of newConvos) {
        convoMap.set(c.leadId, c.id);
      }
    }

    // Prepare messages and jobs
    let jobIndex = 0;
    const skippedLeadIds: string[] = [];
    const messageDataToCreate: Array<{
      conversationId: string;
      direction: 'OUTBOUND';
      status: 'QUEUED';
      fromNumber: string;
      toNumber: string;
      body: string;
      campaignId?: string;
      sentByUserId?: string;
      phoneNumberId: string;
      leadId: string; // temp: used for job mapping, not stored
    }> = [];

    for (const lead of options.leads) {
      // Check compliance from pre-fetched set
      if (blockedPhones.has(lead.phone)) {
        skipped++;
        skippedLeadIds.push(lead.leadId);
        continue;
      }

      const body = this.interpolateTemplate(options.messageTemplate, {
        firstName: lead.firstName || '',
        lastName: lead.lastName || '',
        company: lead.company || '',
        ...lead.customFields,
      });

      const fromNumber = await NumberService.getBestAvailableNumber([], options.poolId);
      if (!fromNumber) {
        errors.push(`No available numbers for lead ${lead.leadId}`);
        continue;
      }

      const conversationId = convoMap.get(lead.leadId);
      if (!conversationId) {
        errors.push(`No conversation for lead ${lead.leadId}`);
        continue;
      }

      messageDataToCreate.push({
        conversationId,
        direction: 'OUTBOUND',
        status: 'QUEUED',
        fromNumber: fromNumber.phoneNumber,
        toNumber: lead.phone,
        body,
        campaignId: options.campaignId,
        sentByUserId: options.sentByUserId,
        phoneNumberId: fromNumber.id,
        leadId: lead.leadId,
      });
    }

    // ── BATCH: Update skipped campaign leads in one query ──
    if (options.campaignId && skippedLeadIds.length > 0) {
      await prisma.campaignLead.updateMany({
        where: { campaignId: options.campaignId, leadId: { in: skippedLeadIds } },
        data: { status: 'SKIPPED' },
      });
    }

    // ── BATCH: Create all messages in a single transaction ──
    if (messageDataToCreate.length > 0) {
      const messages = await prisma.$transaction(
        messageDataToCreate.map(({ leadId, ...data }) =>
          prisma.message.create({ data })
        )
      );

      // Build jobs from created messages
      for (let i = 0; i < messages.length; i++) {
        const message = messages[i];
        const msgData = messageDataToCreate[i];

        // Calculate delay: base interval + jitter + optional time distribution
        const jitteredDelay = this.calculateJitteredDelay(baseDelayBetweenMs);
        const timeDistDelay = this.calculateTimeDistributedDelay(jobIndex, messageDataToCreate.length);
        const totalDelay = timeDistDelay > 0 ? timeDistDelay : jobIndex * jitteredDelay;

        jobsToQueue.push({
          name: 'send-sms',
          data: {
            messageId: message.id,
            fromNumber: msgData.fromNumber,
            toNumber: msgData.toNumber,
            body: msgData.body,
            phoneNumberId: msgData.phoneNumberId,
            campaignId: options.campaignId,
            leadId: msgData.leadId,
          },
          opts: {
            delay: totalDelay,
            priority: 5,
          },
        });

        jobIndex++;
        queued++;
      }
    }

    // ── BULK ADD to BullMQ (one Redis call instead of N) ──
    if (jobsToQueue.length > 0) {
      await smsQueue.addBulk(jobsToQueue);
    }

    return { queued, skipped, errors };
  }

  /**
   * Actually send the message via Twilio
   * Called by the queue worker
   */
  static async sendViaTwilio(
    messageId: string,
    fromNumber: string,
    toNumber: string,
    body: string,
    phoneNumberId: string
  ): Promise<void> {
    try {
      // Update status to SENDING
      await prisma.message.update({
        where: { id: messageId },
        data: { status: 'SENDING' },
      });

      // ── SIMULATION MODE: simulate delivery without calling Twilio ──
      const smsMode = await getSmsMode();
      const testMode = smsMode === 'simulation';
      if (testMode) {
        const fakeSid = `TEST_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        
        // Simulate a small delay 
        await new Promise(r => setTimeout(r, 50 + Math.random() * 100));

        await prisma.message.update({
          where: { id: messageId },
          data: {
            twilioMessageSid: fakeSid,
            status: 'SENT',
            sentAt: new Date(),
          },
        });

        await NumberService.recordSend(phoneNumberId, true);

        // Update lead contact tracking same as real send
        const msg = await prisma.message.findUnique({
          where: { id: messageId },
          include: { conversation: { include: { lead: true } } },
        });

        if (msg?.conversation?.leadId) {
          const isFirstContact = msg.conversation.lead?.status === 'NEW';
          await prisma.lead.update({
            where: { id: msg.conversation.leadId },
            data: {
              lastContactedAt: new Date(),
              contactCount: { increment: 1 },
              ...(isFirstContact && { status: 'CONTACTED' }),
            },
          });
        }

        logger.info(`[SIMULATION] Message simulated: ${messageId} → ${toNumber}`, {
          fakeSid,
          fromNumber,
        });
        return;
      }

      // ── REAL MODE: Send via Twilio (test or live credentials) ──
      const client = await getActiveTwilioClient();
      if (!client) {
        throw new Error('Twilio client not configured');
      }

      const twilioTestActive = smsMode === 'twilio_test';
      const twilioMessage = await client.messages.create({
        body,
        from: fromNumber,
        to: toNumber,
        statusCallback: `${config.webhookBaseUrl}/api/webhooks/twilio/status`,
      });

      // Update with Twilio SID
      await prisma.message.update({
        where: { id: messageId },
        data: {
          twilioMessageSid: twilioMessage.sid,
          status: 'SENT',
          sentAt: new Date(),
        },
      });

      // Record send on number
      await NumberService.recordSend(phoneNumberId, true);

      // Update lead contact tracking
      const msg = await prisma.message.findUnique({
        where: { id: messageId },
        include: { conversation: { include: { lead: true } } },
      });

      if (msg?.conversation?.leadId) {
        const isFirstContact = msg.conversation.lead?.status === 'NEW';
        await prisma.lead.update({
          where: { id: msg.conversation.leadId },
          data: {
            lastContactedAt: new Date(),
            contactCount: { increment: 1 },
            ...(isFirstContact && { status: 'CONTACTED' }),
          },
        });
      }

      logger.info(`${twilioTestActive ? '[TWILIO TEST] ' : ''}Message sent: ${messageId} → ${toNumber}`, {
        twilioSid: twilioMessage.sid,
        fromNumber,
        twilioTestMode: twilioTestActive,
      });
    } catch (error: any) {
      const isBlocked = error.code === 30007 || error.code === 30034;

      await prisma.message.update({
        where: { id: messageId },
        data: {
          status: isBlocked ? 'BLOCKED' : 'FAILED',
          errorCode: error.code?.toString(),
          errorMessage: error.message,
          failedAt: new Date(),
        },
      });

      await NumberService.recordSend(phoneNumberId, false, isBlocked);

      logger.error(`Message failed: ${messageId}`, {
        error: error.message,
        code: error.code,
        toNumber,
      });

      throw error; // Let BullMQ handle retry
    }
  }

  /**
   * Template interpolation with {{variable}} syntax + spintax support
   * Spintax: {Hello|Hi|Hey} → randomly selects one variant
   * This prevents carrier fingerprinting of identical messages
   */
  static interpolateTemplate(
    template: string,
    variables: Record<string, string>
  ): string {
    // First, resolve variables
    let result = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return variables[key] || match;
    });

    // Then, resolve spintax {option1|option2|option3}
    if (config.sms.spintaxEnabled) {
      result = this.resolveSpintax(result);
    }

    return result;
  }

  /**
   * Resolve spintax patterns: {Hello|Hi|Hey} → randomly picks one
   * Supports nested spintax: {Good {morning|afternoon}|Hello}
   */
  static resolveSpintax(text: string): string {
    // Resolve innermost spintax first (non-greedy, no nested braces)
    const spintaxRegex = /\{([^{}]+)\}/g;
    let result = text;
    let iterations = 0;
    
    while (spintaxRegex.test(result) && iterations < 10) {
      result = result.replace(spintaxRegex, (_, options) => {
        // Only treat as spintax if there's a pipe separator
        if (!options.includes('|')) return `{${options}}`;
        const choices = options.split('|');
        return choices[Math.floor(Math.random() * choices.length)];
      });
      iterations++;
    }

    return result;
  }

  /**
   * Calculate delay with jitter for anti-fingerprinting
   * Adds ±N% random variation to the base delay
   */
  static calculateJitteredDelay(baseDelayMs: number): number {
    const jitter = config.sms.jitterPercent / 100;
    const min = baseDelayMs * (1 - jitter);
    const max = baseDelayMs * (1 + jitter);
    return Math.round(min + Math.random() * (max - min));
  }

  /**
   * Calculate time-distributed delay to spread messages across business hours
   * Instead of sending all at once, spreads evenly from now until business hours end
   */
  static calculateTimeDistributedDelay(index: number, totalMessages: number): number {
    if (!config.sms.timeDistributionEnabled || totalMessages < 100) {
      return 0; // Don't distribute small batches
    }

    const now = new Date();
    const endHour = config.sms.businessHoursEnd;
    const endTime = new Date(now);
    endTime.setHours(endHour, 0, 0, 0);

    // If past business hours, don't add distribution delay
    if (now >= endTime) return 0;

    const remainingMs = endTime.getTime() - now.getTime();
    // Spread across 80% of remaining time (leave 20% buffer)
    const spreadWindow = remainingMs * 0.8;
    const baseDelay = (spreadWindow / totalMessages) * index;

    // Add jitter to the distribution
    return Math.round(baseDelay + (Math.random() - 0.5) * (spreadWindow / totalMessages));
  }

  /**
   * Check circuit breaker: pause campaign if failure rate is too high
   */
  static async checkCircuitBreaker(campaignId: string): Promise<boolean> {
    const recentMessages = await prisma.message.findMany({
      where: { campaignId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { status: true },
    });

    if (recentMessages.length < 20) return false; // Not enough data

    const failedCount = recentMessages.filter(
      m => m.status === 'FAILED' || m.status === 'BLOCKED'
    ).length;

    const failRate = (failedCount / recentMessages.length) * 100;
    return failRate >= config.sms.circuitBreakerThreshold;
  }

  /**
   * Get or create a conversation for a lead
   */
  private static async getOrCreateConversation(
    leadId: string,
    repId?: string
  ) {
    let conversation = await prisma.conversation.findUnique({
      where: { leadId },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          leadId,
          assignedRepId: repId,
          isActive: true,
        },
      });
    }

    return conversation;
  }
}
