import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../config/logger';
import { ComplianceService } from '../services/complianceService';
import { AutomationService } from '../services/automationService';
import { AutoTagService } from '../services/autoTagService';
import { WebhookService } from '../services/webhookService';
import '../config/twilio';
import { getLiveCredentials } from '../config/twilio';
import { config } from '../config';
import { validateRequest } from 'twilio';
import { Queue, Worker } from 'bullmq';
import redis from '../config/redis';

const router = Router();

const POSITIVE_REPLY_PATTERNS: RegExp[] = [
  /\b(yes|yep|yeah|interested|i'?m interested|i am interested)\b/i,
  /\b(send|share)\b.*\b(info|information|details|terms|application)\b/i,
  /\b(call me|email me|reach me)\b/i,
  /\b(looking for|need)\b.*\b(funding|capital|loan|credit)\b/i,
  /\b(how much|what rates?|rate|terms?|qualify|qualification)\b/i,
  /\b(qualification|qualifications)\b/i,
  /\b(ok|okay|sure|thanks|thank you|thx)\b/i,
  /\b(need|want)\b.*\b(more|info|information|details)\b/i,
  /\b(tell me more|more info|more details)\b/i,
];

const NEGATIVE_REPLY_PATTERNS: RegExp[] = [
  /\b(no|nope|not interested|don'?t|do not|stop|unsubscribe|remove me|wrong number|dnc|bad lead)\b/i,
  /\b(kiss my ass|fuck off|screw you)\b/i,
];

function isPositiveCampaignReply(body: string): boolean {
  const text = body.trim();
  if (!text) return false;

  if (NEGATIVE_REPLY_PATTERNS.some((pattern) => pattern.test(text))) {
    return false;
  }

  if (/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(text)) {
    return true;
  }

  if (POSITIVE_REPLY_PATTERNS.some((pattern) => pattern.test(text))) {
    return true;
  }

  // Treat clear intent questions as positive engagement.
  if (
    text.includes('?') &&
    /\b(funding|capital|loan|credit|rate|term|offer|qualification|qualifications|info|details|company)\b/i.test(text)
  ) {
    return true;
  }

  return false;
}

function phoneDigits(raw?: string | null): string {
  return String(raw || '').replace(/\D/g, '');
}

function phoneLookupVariants(raw?: string | null): string[] {
  const digits = phoneDigits(raw);
  if (!digits) return [];

  const variants = new Set<string>();
  variants.add(digits);
  variants.add(`+${digits}`);

  if (digits.length === 10) {
    variants.add(`1${digits}`);
    variants.add(`+1${digits}`);
  }

  if (digits.length === 11 && digits.startsWith('1')) {
    const local = digits.slice(1);
    variants.add(local);
    variants.add(`+1${local}`);
  }

  return Array.from(variants);
}

function splitContactName(fullName?: string | null): { firstName: string; lastName: string } {
  const normalized = String(fullName || '').trim();
  if (!normalized) return { firstName: '', lastName: '' };
  const [firstName, ...rest] = normalized.split(/\s+/);
  return { firstName: firstName || '', lastName: rest.join(' ').trim() };
}

/**
 * Twilio webhook signature validation middleware
 * Validates that incoming requests are genuinely from Twilio.
 * Uses DB-stored auth token (via getLiveCredentials) so it stays in sync
 * with whatever token the user configured in Settings.
 */
async function validateTwilioSignature(req: Request, res: Response, next: () => void): Promise<void> {
  // Skip validation in development if no auth token configured
  if (config.env === 'development' && !config.twilio.authToken) {
    return next();
  }

  const twilioSignature = req.headers['x-twilio-signature'] as string;
  if (!twilioSignature) {
    logger.warn('Missing Twilio signature header');
    res.status(403).json({ error: 'Missing signature' });
    return;
  }

  // Use live credentials from DB (matches the token Twilio uses to sign)
  const creds = await getLiveCredentials();
  const authToken = creds?.token || config.twilio.authToken;

  const url = `${config.webhookBaseUrl}${req.originalUrl}`;
  const isValid = validateRequest(authToken, twilioSignature, url, req.body);

  if (!isValid) {
    logger.warn('Invalid Twilio signature', { url, signature: twilioSignature });
    res.status(403).json({ error: 'Invalid signature' });
    return;
  }

  next();
}

// Apply signature validation to all webhook routes
router.use(validateTwilioSignature);

/**
 * Twilio Inbound Message Webhook
 * Receives incoming SMS messages
 */
router.post('/inbound', async (req: Request, res: Response) => {
  try {
    const { MessageSid, From, To, Body, NumMedia: _NumMedia } = req.body;

    logger.info(`Inbound SMS: ${From} → ${To}: ${Body}`);

    // Process compliance keywords first
    const keywordResult = await ComplianceService.processInboundKeywords(From, Body);

    // Determine TwiML response — keyword auto-reply or empty
    let twimlResponse = '<Response></Response>';
    if (keywordResult.isKeyword && keywordResult.response) {
      twimlResponse = `<Response><Message>${keywordResult.response}</Message></Response>`;
    }

    // STOP/opt-out keywords are processed for compliance, but hidden from inbox
    // and do not trigger unread/new-message notifications.
    const suppressInboxMessage = keywordResult.isKeyword && keywordResult.action === 'opt_out';
    if (suppressInboxMessage) {
      logger.info('Inbound opt-out keyword processed without inbox record', { from: From, to: To });
      res.type('text/xml');
      res.send(twimlResponse);
      return;
    }

    const inboundTwilioNumber = await prisma.phoneNumber.findUnique({
      where: { phoneNumber: To },
      select: { id: true },
    });

    const leadPhoneVariants = phoneLookupVariants(From);

    // Find the lead by phone number (exact + normalized variants)
    const lead = await prisma.lead.findFirst({
      where: {
        phone: {
          in: leadPhoneVariants.length > 0 ? leadPhoneVariants : [From],
        },
      },
      include: { conversations: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (lead) {
      // Get or create conversation
      let conversation = lead.conversations[0];

      if (!conversation) {
        conversation = await prisma.conversation.create({
          data: {
            leadId: lead.id,
            assignedRepId: lead.assignedRepId,
            twilioNumberId: inboundTwilioNumber?.id || null,
            stickyNumberId: inboundTwilioNumber?.id || null,
            isActive: true,
          },
        });
      }

      // Save inbound message
      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'INBOUND',
          status: 'RECEIVED',
          fromNumber: From,
          toNumber: To,
          body: Body,
          twilioMessageSid: MessageSid,
          sentAt: new Date(),
        },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastDirection: 'inbound',
          unreadCount: { increment: 1 },
          nextFollowupAt: null,
          ...(inboundTwilioNumber?.id
            ? {
                twilioNumberId: inboundTwilioNumber.id,
                stickyNumberId: conversation.stickyNumberId || inboundTwilioNumber.id,
              }
            : {}),
        },
      });

      // Handle reply - pause automations, update lead status
      await AutomationService.onLeadReply(lead.id);
      await AutoTagService.onReply(lead.id);
      await WebhookService.onReply({
        leadId: lead.id,
        phone: From,
        body: Body,
        conversationId: conversation.id,
      });

      // Count campaign replies only for positive inbound intent.
      if (isPositiveCampaignReply(Body)) {
        const affectedCampaignLead = await prisma.campaignLead.findFirst({
          where: {
            leadId: lead.id,
            status: { in: ['SENT', 'DELIVERED'] },
          },
          select: { id: true, campaignId: true },
          orderBy: [{ deliveredAt: 'desc' }, { sentAt: 'desc' }, { createdAt: 'desc' }],
        });

        if (affectedCampaignLead) {
          await prisma.campaignLead.update({
            where: { id: affectedCampaignLead.id },
            data: {
              status: 'REPLIED',
              repliedAt: new Date(),
            },
          });

          await prisma.campaign.update({
            where: { id: affectedCampaignLead.campaignId },
            data: { totalReplied: { increment: 1 } },
          });
        }
      }

      // Emit Socket.IO event for real-time inbox update
      const io = req.app.get('io');
      if (io) {
        const updatedConversation = await prisma.conversation.findUnique({
          where: { id: conversation.id },
          include: {
            lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
            messages: { take: 1, orderBy: { createdAt: 'desc' } },
          },
        });
        // Notify assigned rep
        if (conversation.assignedRepId) {
          io.to(`inbox:${conversation.assignedRepId}`).emit('new-message', {
            conversation: updatedConversation,
          });
        }
        // Notify conversation viewers
        io.to(`conversation:${conversation.id}`).emit('message', {
          conversationId: conversation.id,
          direction: 'INBOUND',
          body: Body,
          from: From,
        });
      }
    } else {
      // Unknown number - try to infer lead metadata from existing client/deal by phone
      const matchedClient = await prisma.client.findFirst({
        where: {
          phone: {
            in: leadPhoneVariants.length > 0 ? leadPhoneVariants : [From],
          },
        },
        select: {
          id: true,
          businessName: true,
          contactName: true,
          email: true,
        },
      });

      const matchedDeal = matchedClient
        ? await prisma.deal.findFirst({
            where: { clientId: matchedClient.id },
            select: { assignedRepId: true },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          })
        : null;

      const parsedContact = splitContactName(matchedClient?.contactName);
      const newLead = await prisma.lead.create({
        data: {
          firstName: parsedContact.firstName || 'Unknown',
          lastName: parsedContact.lastName || undefined,
          phone: From,
          email: matchedClient?.email || undefined,
          company: matchedClient?.businessName || undefined,
          assignedRepId: matchedDeal?.assignedRepId || null,
          source: 'inbound_sms',
          status: 'REPLIED',
          lastRepliedAt: new Date(),
        },
      });

      // Create pipeline card for the new lead
      const repliedStage =
        (await prisma.pipelineStage.findFirst({ where: { mappedStatus: 'REPLIED' } })) ||
        (await prisma.pipelineStage.findFirst({ where: { isDefault: true } })) ||
        (await prisma.pipelineStage.findFirst({ orderBy: { order: 'asc' } }));
      if (repliedStage) {
        await prisma.pipelineCard.create({ data: { leadId: newLead.id, stageId: repliedStage.id } });
      }

      const conversation = await prisma.conversation.create({
        data: {
          leadId: newLead.id,
          assignedRepId: newLead.assignedRepId || null,
          twilioNumberId: inboundTwilioNumber?.id || null,
          stickyNumberId: inboundTwilioNumber?.id || null,
          isActive: true,
        },
      });

      await prisma.message.create({
        data: {
          conversationId: conversation.id,
          direction: 'INBOUND',
          status: 'RECEIVED',
          fromNumber: From,
          toNumber: To,
          body: Body,
          twilioMessageSid: MessageSid,
          sentAt: new Date(),
        },
      });

      // Notify rep if conversation could be auto-assigned
      const io = req.app.get('io');
      if (io && conversation.assignedRepId) {
        const updatedConversation = await prisma.conversation.findUnique({
          where: { id: conversation.id },
          include: {
            lead: { select: { id: true, firstName: true, lastName: true, phone: true } },
            messages: { take: 1, orderBy: { createdAt: 'desc' } },
          },
        });
        io.to(`inbox:${conversation.assignedRepId}`).emit('new-message', { conversation: updatedConversation });
      }
    }

    // Return TwiML (auto-reply for keywords, empty for regular messages)
    res.type('text/xml');
    res.send(twimlResponse);
  } catch (error: any) {
    logger.error('Inbound webhook error:', { error: error.message });
    res.type('text/xml');
    res.send('<Response></Response>');
  }
});

/**
 * Status Callback Queue — process webhook asynchronously for instant Twilio response
 */
const statusQueue = new Queue('webhook-status', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: { age: 3600, count: 5000 },
    removeOnFail: { age: 86400 },
  },
});

/**
 * Twilio Status Callback Webhook
 * Returns 200 immediately, processes asynchronously via BullMQ
 */
router.post('/status', async (req: Request, res: Response) => {
  const { MessageSid, MessageStatus, ErrorCode, ErrorMessage } = req.body;

  // Respond immediately — never make Twilio wait
  res.sendStatus(200);

  // Queue for async processing
  await statusQueue
    .add('process-status', {
      messageSid: MessageSid,
      messageStatus: MessageStatus,
      errorCode: ErrorCode,
      errorMessage: ErrorMessage,
    })
    .catch((err) => logger.error('Failed to queue status webhook:', { error: err.message }));
});

/**
 * Status webhook worker — processes delivery updates asynchronously
 */
const statusWorker = new Worker(
  'webhook-status',
  async (job) => {
    const { messageSid, messageStatus, errorCode, errorMessage } = job.data;

    logger.debug(`Status callback: ${messageSid} → ${messageStatus}`);

    const statusMap: Record<string, string> = {
      queued: 'QUEUED',
      sending: 'SENDING',
      sent: 'SENT',
      delivered: 'DELIVERED',
      failed: 'FAILED',
      undelivered: 'UNDELIVERED',
    };

    const mappedStatus = statusMap[messageStatus] || messageStatus.toUpperCase();
    const isBlocked = errorCode === '30007' || errorCode === '30034';
    const finalStatus = isBlocked ? 'BLOCKED' : mappedStatus;

    // Status priority: only advance forward, never regress
    const statusPriority: Record<string, number> = {
      QUEUED: 1,
      SENDING: 2,
      SENT: 3,
      DELIVERED: 4,
      FAILED: 5,
      UNDELIVERED: 5,
      BLOCKED: 5,
    };

    const message = await prisma.message.findFirst({
      where: { twilioMessageSid: messageSid },
    });

    if (!message) return;
    if (finalStatus === message.status) return;

    const currentPriority = statusPriority[message.status] ?? 0;
    const newPriority = statusPriority[finalStatus] ?? 0;
    if (newPriority < currentPriority) return;

    await prisma.message.update({
      where: { id: message.id },
      data: {
        status: finalStatus as any,
        ...(finalStatus === 'DELIVERED' && { deliveredAt: new Date() }),
        ...(finalStatus === 'FAILED' || finalStatus === 'UNDELIVERED' || isBlocked
          ? { failedAt: new Date(), errorCode, errorMessage }
          : {}),
      },
    });

    // Update campaign stats if applicable
    if (message.campaignId) {
      const updateField =
        finalStatus === 'DELIVERED'
          ? 'totalDelivered'
          : finalStatus === 'FAILED' || finalStatus === 'UNDELIVERED'
            ? 'totalFailed'
            : finalStatus === 'BLOCKED'
              ? 'totalBlocked'
              : null;

      if (updateField) {
        await prisma.campaign.update({
          where: { id: message.campaignId },
          data: {
            [updateField]: { increment: 1 },
          },
        });
      }

      if (message.phoneNumberId) {
        const conversation = await prisma.conversation.findUnique({
          where: { id: message.conversationId },
        });

        if (conversation) {
          await prisma.campaignLead.updateMany({
            where: {
              campaignId: message.campaignId,
              leadId: conversation.leadId,
            },
            data: {
              status: finalStatus === 'DELIVERED' ? 'DELIVERED' : 'FAILED',
              ...(finalStatus === 'DELIVERED' && { deliveredAt: new Date() }),
              ...(errorCode && { errorCode }),
            },
          });
        }
      }
    }

    // Update number health stats
    if (message.phoneNumberId) {
      if (finalStatus === 'DELIVERED') {
        await prisma.phoneNumber.update({
          where: { id: message.phoneNumberId },
          data: { totalDelivered: { increment: 1 } },
        });
      } else if (isBlocked) {
        await prisma.phoneNumber.update({
          where: { id: message.phoneNumberId },
          data: {
            totalBlocked: { increment: 1 },
            errorStreak: { increment: 1 },
          },
        });
      }
    }
  },
  {
    connection: redis,
    concurrency: 10, // Process 10 status updates in parallel
  },
);

statusWorker.on('failed', (job, err) => {
  logger.error(`Status webhook processing failed: ${job?.id}`, { error: err.message });
});

export default router;
