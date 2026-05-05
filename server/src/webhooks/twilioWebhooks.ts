import { Router, Request, Response } from 'express';
import prisma from '../config/database';
import logger from '../config/logger';
import { ComplianceService } from '../services/complianceService';
import { AutomationService } from '../services/automationService';
import { AutoTagService } from '../services/autoTagService';
import { WebhookService } from '../services/webhookService';
import { AIService } from '../services/aiService';
import { MobileAlertService } from '../services/mobileAlertService';
import { isRepOrTestPhoneNumber, parseRepTestPhoneAllowlist } from '../services/inboundPhoneSuppression';
import { resetDealEngagement, resetDealEngagementForConversation } from '../services/dealEngagementService';
import { queuePipelineExtractionForInboundSms } from '../services/pipelineAiService';
import '../config/twilio';
import { getLiveCredentials } from '../config/twilio';
import { config } from '../config';
import { Queue, Worker } from 'bullmq';
import redis from '../config/redis';
import {
  buildTwilioValidationUrl,
  getTwilioSignatureHeader,
  isTwilioSignatureValid,
  shouldSkipTwilioSignatureValidation,
} from './twilioSignatureValidation';
import { phoneLookupVariants, splitContactName } from './inboundParsing';
import { resolveInboundOwnerRepId } from './inboundOwnership';
import { getSocketIO } from '../realtime/socket';

const router = Router();

interface InboundAiClassificationJob {
  conversationId: string;
  repId: string | null;
  inboundBody: string;
  fromNumber: string;
  inboundReceivedAt?: string;
}

async function processInboundAiClassification(jobData: InboundAiClassificationJob): Promise<void> {
  const { conversationId, repId, inboundBody, fromNumber, inboundReceivedAt } = jobData;

  const convForLead = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: {
      lead: { select: { firstName: true, lastName: true } },
      aiSignals: true,
      extractedIndustry: true,
      helocFitFlag: true,
      extractedRevenue: true,
      extractedAsk: true,
      messages: {
        where: { direction: 'INBOUND' },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { createdAt: true },
      },
    },
  });
  const leadFirst = convForLead?.lead?.firstName || '';
  const leadLast = convForLead?.lead?.lastName || '';
  const leadName = `${leadFirst} ${leadLast}`.trim() || 'Lead';

  const ai = await AIService.classifyInbound(conversationId);
  if (!ai) return;

  const existingSignals = ((convForLead?.aiSignals as Record<string, unknown> | null) || {}) as Record<string, unknown>;
  const incomingSignals = (ai.signals as Record<string, unknown>) || {};
  const incomingIndustry =
    typeof incomingSignals.industry === 'string' && incomingSignals.industry.trim()
      ? incomingSignals.industry.trim()
      : null;
  const incomingAsk =
    typeof incomingSignals.ask === 'string' && incomingSignals.ask.trim() ? incomingSignals.ask.trim() : null;
  const incomingRevenue =
    typeof incomingSignals.revenueMonthly === 'number' ? Math.round(incomingSignals.revenueMonthly) : null;
  const incomingHeloc = typeof incomingSignals.helocFitFlag === 'boolean' ? incomingSignals.helocFitFlag : null;

  const existingIndustry =
    typeof existingSignals.industry === 'string' && existingSignals.industry.trim()
      ? existingSignals.industry.trim()
      : convForLead?.extractedIndustry || null;
  const existingAsk =
    typeof existingSignals.ask === 'string' && existingSignals.ask.trim()
      ? existingSignals.ask.trim()
      : convForLead?.extractedAsk || null;
  const existingRevenue =
    typeof existingSignals.revenueMonthly === 'number'
      ? Math.round(existingSignals.revenueMonthly)
      : convForLead?.extractedRevenue || null;
  const existingHeloc =
    typeof existingSignals.helocFitFlag === 'boolean'
      ? existingSignals.helocFitFlag
      : typeof convForLead?.helocFitFlag === 'boolean'
        ? convForLead.helocFitFlag
        : null;

  const resolvedIndustry = incomingIndustry || existingIndustry || null;
  const resolvedAsk = incomingAsk || existingAsk || null;
  const resolvedRevenue = incomingRevenue ?? existingRevenue ?? null;
  const resolvedHeloc = typeof incomingHeloc === 'boolean' ? incomingHeloc : existingHeloc === true ? true : null;

  const persistedSignals: Record<string, unknown> = {
    ...existingSignals,
    ...incomingSignals,
    ...(resolvedIndustry ? { industry: resolvedIndustry } : {}),
    ...(resolvedAsk ? { ask: resolvedAsk } : {}),
    ...(typeof resolvedRevenue === 'number'
      ? {
          revenueMonthly: resolvedRevenue,
          revenueAnnual: resolvedRevenue * 12,
        }
      : {}),
    ...(typeof resolvedHeloc === 'boolean' ? { helocFitFlag: resolvedHeloc } : { helocFitFlag: null }),
    classifierPromptVersion: ai.promptVersion,
  };
  const extractedIndustry = resolvedIndustry;
  const helocFitFlag = resolvedHeloc;
  const extractedRevenue = resolvedRevenue;
  const extractedAsk = resolvedAsk;

  const phase1Lean = (process.env.PHASE1_LEAN ?? 'false').toLowerCase() !== 'false';
  let alertSent = false;
  const inboundTs = inboundReceivedAt ? new Date(inboundReceivedAt).getTime() : NaN;
  const latestInboundAt = convForLead?.messages?.[0]?.createdAt
    ? new Date(convForLead.messages[0].createdAt).getTime()
    : NaN;
  const isStaleInboundForAlert =
    Number.isFinite(inboundTs) && Number.isFinite(latestInboundAt) && latestInboundAt - inboundTs > 5000;
  if (ai.classification === 'HOT' && repId) {
    if (isStaleInboundForAlert) {
      logger.info('HOT-alert skipped: stale inbound classification job', {
        conversationId,
        repId,
        inboundReceivedAt,
        latestInboundAt: convForLead?.messages?.[0]?.createdAt?.toISOString?.() || null,
      });
    } else {
      const guardKey = `hot-alert:${conversationId}`;
      const guard = await redis.set(guardKey, '1', 'EX', 180, 'NX');
      if (guard === 'OK') {
        alertSent = await MobileAlertService.sendHotAlert(repId, leadName, inboundBody);
      } else {
        logger.info('HOT-alert: rate-limited (3 min window)', { conversationId });
      }
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      aiClassification: ai.classification,
      aiSignals: persistedSignals as object,
      aiSuggestions: ai.suggestions as object,
      extractedIndustry,
      helocFitFlag,
      extractedRevenue,
      extractedAsk,
      isCaliforniaNumber: ai.isCaliforniaNumber,
      aiLeadScore: ai.leadScore,
      aiClassifiedAt: new Date(),
    },
  });

  await prisma.conversationAudit.create({
    data: {
      conversationId,
      actorId: repId,
      eventType: 'ai_state_changed',
      source: 'twilio_inbound_worker',
      newValue: {
        aiClassification: ai.classification,
        aiLeadScore: ai.leadScore,
        promptVersion: ai.promptVersion,
      },
    },
  });

  const io = getSocketIO();
  if (!io) return;

  const aiPayload = {
    conversationId,
    classification: ai.classification,
    leadScore: ai.leadScore,
    signals: ai.signals,
    suggestions: ai.suggestions,
    promptVersion: ai.promptVersion,
    isCaliforniaNumber: ai.isCaliforniaNumber,
    alertSent,
  };

  if (repId) {
    io.to(`inbox:${repId}`).emit('ai-classified', aiPayload);
    if (!phase1Lean && ai.classification === 'HOT') {
      io.to(`inbox:${repId}`).emit('hot-lead-detected', {
        ...aiPayload,
        leadName,
        preview: (inboundBody || '').slice(0, 120),
      });
    }
  }
  io.to(`conversation:${conversationId}`).emit('ai-classified', aiPayload);

  const sig = ai.signals as Record<string, unknown> | null;
  if (sig && typeof sig === 'object' && sig.revenueMonthly != null) {
    io.to(`conversation:${conversationId}`).emit('revenue_updated', {
      conversationId,
      revenue: sig.revenue,
      revenueMonthly: sig.revenueMonthly,
      revenueAnnual: sig.revenueAnnual,
      revenueConfidence: sig.revenueConfidence,
    });
    if (repId) {
      io.to(`inbox:${repId}`).emit('revenue_updated', {
        conversationId,
        revenueMonthly: sig.revenueMonthly,
      });
    }
  }

  void queuePipelineExtractionForInboundSms({ conversationId, text: inboundBody }).catch((err) =>
    logger.error('Failed to enqueue pipeline AI extraction from inbound classifier', {
      conversationId,
      error: err.message,
    }),
  );

  logger.info('AI classification processed via queue worker', {
    conversationId,
    repId,
    fromNumber,
    classification: ai.classification,
    leadScore: ai.leadScore,
  });
}

async function persistOptOutInboxTrace(input: {
  leadId: string;
  assignedRepId: string | null;
  existingConversationId: string | null;
  existingStickyNumberId: string | null;
  inboundTwilioNumberId: string | null;
  fromNumber: string;
  toNumber: string;
  body: string;
  messageSid?: string;
}): Promise<void> {
  const {
    leadId,
    assignedRepId,
    existingConversationId,
    existingStickyNumberId,
    inboundTwilioNumberId,
    fromNumber,
    toNumber,
    body,
    messageSid,
  } = input;

  let conversationId = existingConversationId;
  let stickyNumberId = existingStickyNumberId;

  if (!conversationId) {
    const createdConversation = await prisma.conversation.create({
      data: {
        leadId,
        assignedRepId,
        twilioNumberId: inboundTwilioNumberId,
        stickyNumberId: inboundTwilioNumberId,
        isActive: true,
      },
      select: { id: true, stickyNumberId: true },
    });
    conversationId = createdConversation.id;
    stickyNumberId = createdConversation.stickyNumberId;
  }

  try {
    await prisma.message.create({
      data: {
        conversationId,
        direction: 'INBOUND',
        status: 'RECEIVED',
        fromNumber,
        toNumber,
        body,
        twilioMessageSid: messageSid,
        sentAt: new Date(),
      },
    });
  } catch (err: any) {
    // Twilio may retry inbound webhooks. If the same MessageSid already exists, skip duplicate trace.
    if (err?.code !== 'P2002') {
      throw err;
    }
  }

  await prisma.conversation.update({
    where: { id: conversationId },
    data: {
      lastMessageAt: new Date(),
      lastDirection: 'inbound',
      ...(inboundTwilioNumberId
        ? {
            twilioNumberId: inboundTwilioNumberId,
            stickyNumberId: stickyNumberId || inboundTwilioNumberId,
          }
        : {}),
    },
  });
}

/**
 * Twilio webhook signature validation middleware
 * Validates that incoming requests are genuinely from Twilio.
 * Uses DB-stored auth token (via getLiveCredentials) so it stays in sync
 * with whatever token the user configured in Settings.
 */
async function validateTwilioSignature(req: Request, res: Response, next: () => void): Promise<void> {
  // Skip validation in development if no auth token configured
  if (shouldSkipTwilioSignatureValidation(config.env, config.twilio.authToken)) {
    return next();
  }

  const twilioSignature = getTwilioSignatureHeader(req.headers['x-twilio-signature']);
  if (!twilioSignature) {
    logger.warn('Missing Twilio signature header');
    res.status(403).json({ error: 'Missing signature' });
    return;
  }

  // Use live credentials from DB (matches the token Twilio uses to sign)
  const creds = await getLiveCredentials();
  const authToken = creds?.token || config.twilio.authToken;

  const url = buildTwilioValidationUrl(config.webhookBaseUrl, req.originalUrl);
  const isValid = isTwilioSignatureValid(authToken, twilioSignature, url, req.body);

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
    const shouldResetDealEngagement = String(Body || '').trim().length > 0;

    const inboundTwilioNumber = await prisma.phoneNumber.findUnique({
      where: { phoneNumber: To },
      select: { id: true },
    });

    const leadPhoneVariants = phoneLookupVariants(From);
    const repMobiles = await prisma.user.findMany({
      where: {
        isActive: true,
        mobilePhone: { not: null },
      },
      select: { mobilePhone: true },
    });
    const envSuppressed = parseRepTestPhoneAllowlist(process.env.REP_TEST_PHONE_ALLOWLIST);
    const suppressedNumbers = [...repMobiles.map((u) => String(u.mobilePhone || '')), ...envSuppressed];
    const suppressRepOrTestNumber = isRepOrTestPhoneNumber(From, suppressedNumbers);

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

    if (suppressInboxMessage) {
      if (lead) {
        const existingConversation = lead.conversations[0] || null;
        await persistOptOutInboxTrace({
          leadId: lead.id,
          assignedRepId: lead.assignedRepId || null,
          existingConversationId: existingConversation?.id || null,
          existingStickyNumberId: existingConversation?.stickyNumberId || null,
          inboundTwilioNumberId: inboundTwilioNumber?.id || null,
          fromNumber: From,
          toNumber: To,
          body: Body,
          messageSid: MessageSid,
        });
      }
      logger.info('Inbound opt-out keyword processed without unread/notifications', {
        from: From,
        to: To,
        leadId: lead?.id || null,
      });
      res.type('text/xml');
      res.send(twimlResponse);
      return;
    }

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
      const inboundMessage = await prisma.message.create({
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
        select: { createdAt: true },
      });

      // Update conversation
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          lastMessageAt: new Date(),
          lastDirection: 'inbound',
          unreadCount: { increment: 1 },
          nextFollowupAt: null,
          followupTime: null,
          followupStatus: 'completed',
          ...(inboundTwilioNumber?.id
            ? {
                twilioNumberId: inboundTwilioNumber.id,
                stickyNumberId: conversation.stickyNumberId || inboundTwilioNumber.id,
              }
            : {}),
        },
      });

      if (shouldResetDealEngagement) {
        void resetDealEngagementForConversation({
          conversationId: conversation.id,
          leadId: lead.id,
          reason: 'inbound_sms',
        }).catch((err) =>
          logger.error('Failed to reset deal engagement on inbound SMS', {
            conversationId: conversation.id,
            leadId: lead.id,
            error: err.message,
          }),
        );
        void queuePipelineExtractionForInboundSms({
          conversationId: conversation.id,
          leadId: lead.id,
          text: Body,
        }).catch((err) =>
          logger.error('Failed to enqueue pipeline AI extraction on inbound SMS', {
            conversationId: conversation.id,
            leadId: lead.id,
            error: err.message,
          }),
        );
      }

      // Keep the explicit owner when that rep is still active.
      // Fall back to the latest active human sender only when the thread is unassigned or the owner is inactive.
      const lastOutboundCandidates = await prisma.message.findMany({
        where: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          sentByUserId: { not: null },
        },
        orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
        take: 10,
        select: { sentByUserId: true },
      });
      const candidateIds = lastOutboundCandidates
        .map((message) => message.sentByUserId)
        .filter((id): id is string => !!id);
      const activeRepLookupIds = Array.from(
        new Set([conversation.assignedRepId, lead.assignedRepId, ...candidateIds].filter((id): id is string => !!id)),
      );
      const activeUsers =
        activeRepLookupIds.length > 0
          ? await prisma.user.findMany({
              where: { id: { in: activeRepLookupIds }, isActive: true },
              select: { id: true },
            })
          : [];
      const nextOwnerRepId = resolveInboundOwnerRepId({
        currentAssignedRepId: conversation.assignedRepId,
        leadAssignedRepId: lead.assignedRepId,
        recentHumanOutboundRepIds: candidateIds,
        activeRepIds: activeUsers.map((user) => user.id),
      });

      if (nextOwnerRepId && nextOwnerRepId !== conversation.assignedRepId) {
        await prisma.conversation.update({
          where: { id: conversation.id },
          data: { assignedRepId: nextOwnerRepId },
        });
        conversation.assignedRepId = nextOwnerRepId;
      }

      if (nextOwnerRepId && nextOwnerRepId !== lead.assignedRepId) {
        await prisma.lead.update({
          where: { id: lead.id },
          data: { assignedRepId: nextOwnerRepId },
        });
        lead.assignedRepId = nextOwnerRepId;
      }

      // Handle reply - pause automations, update lead status
      await AutomationService.onLeadReply(lead.id);
      await AutoTagService.onReply(lead.id);
      await WebhookService.onReply({
        leadId: lead.id,
        phone: From,
        body: Body,
        conversationId: conversation.id,
      });

      // Count campaign replies by attributing inbound to the latest CAMPAIGN outbound in this thread.
      // Важно: ищем последнее outbound с campaignId IS NOT NULL, чтобы manual rep replies
      // (campaignId=null) не «съедали» атрибуцию ответа лида.
      // Time window 14 дней: если последняя кампания была давно — это уже не reply на неё.
      const ATTRIBUTION_WINDOW_DAYS = 14;
      const attributionCutoff = new Date(Date.now() - ATTRIBUTION_WINDOW_DAYS * 86400000);
      const latestCampaignOutbound = await prisma.message.findFirst({
        where: {
          conversationId: conversation.id,
          direction: 'OUTBOUND',
          campaignId: { not: null },
          OR: [{ sentAt: { gte: attributionCutoff } }, { createdAt: { gte: attributionCutoff } }],
        },
        orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
        select: { campaignId: true },
      });

      if (latestCampaignOutbound?.campaignId) {
        const replyUpdate = await prisma.campaignLead.updateMany({
          where: {
            campaignId: latestCampaignOutbound.campaignId,
            leadId: lead.id,
            status: { in: ['SENT', 'DELIVERED'] },
          },
          data: {
            status: 'REPLIED',
            repliedAt: new Date(),
          },
        });

        if (replyUpdate.count > 0) {
          await prisma.campaign.update({
            where: { id: latestCampaignOutbound.campaignId },
            data: { totalReplied: { increment: replyUpdate.count } },
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

      if (!config.ai.classificationEnabled) {
        logger.info('AI classification skipped: AI_CLASSIFICATION_ENABLED is OFF', {
          conversationId: conversation.id,
        });
      } else if (suppressRepOrTestNumber) {
        logger.info('AI classification skipped for rep/test inbound number', {
          from: From,
          conversationId: conversation.id,
        });
      } else {
        void inboundAiClassificationQueue
          .add('classify-inbound', {
            conversationId: conversation.id,
            repId: conversation.assignedRepId || null,
            inboundBody: Body,
            fromNumber: From,
            inboundReceivedAt: inboundMessage.createdAt.toISOString(),
          })
          .catch((err) =>
            logger.error('Failed to enqueue inbound AI classification', {
              conversationId: conversation.id,
              error: err.message,
            }),
          );
      }
    } else {
      if (suppressRepOrTestNumber) {
        logger.warn('Inbound from rep/test number suppressed from lead creation', { from: From, to: To });
        res.type('text/xml');
        res.send(twimlResponse);
        return;
      }

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
            select: { id: true, assignedRepId: true },
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

      const inboundMessage = await prisma.message.create({
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
        select: { createdAt: true },
      });

      if (matchedDeal?.id && shouldResetDealEngagement) {
        void resetDealEngagement({ dealId: matchedDeal.id, reason: 'inbound_sms' }).catch((err) =>
          logger.error('Failed to reset matched deal engagement on inbound SMS', {
            dealId: matchedDeal.id,
            error: err.message,
          }),
        );
        void queuePipelineExtractionForInboundSms({
          conversationId: conversation.id,
          leadId: newLead.id,
          dealIds: [matchedDeal.id],
          text: Body,
        }).catch((err) =>
          logger.error('Failed to enqueue pipeline AI extraction for matched deal inbound SMS', {
            dealId: matchedDeal.id,
            conversationId: conversation.id,
            error: err.message,
          }),
        );
      }

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

      if (config.ai.classificationEnabled) {
        void inboundAiClassificationQueue
          .add('classify-inbound', {
            conversationId: conversation.id,
            repId: conversation.assignedRepId || null,
            inboundBody: Body,
            fromNumber: From,
            inboundReceivedAt: inboundMessage.createdAt.toISOString(),
          })
          .catch((err) =>
            logger.error('Failed to enqueue inbound AI classification (new lead flow)', {
              conversationId: conversation.id,
              error: err.message,
            }),
          );
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

const inboundAiClassificationQueue = new Queue('inbound-ai-classification', {
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

const inboundAiClassificationWorker = new Worker(
  'inbound-ai-classification',
  async (job) => {
    await processInboundAiClassification(job.data as InboundAiClassificationJob);
  },
  {
    connection: redis,
    concurrency: 5,
  },
);

inboundAiClassificationWorker.on('failed', (job, err) => {
  logger.error(`Inbound AI classification failed: ${job?.id}`, {
    error: err.message,
  });
});

export default router;
