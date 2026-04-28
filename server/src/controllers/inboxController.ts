import { Response } from 'express';
import prisma from '../config/database';
import logger from '../config/logger';
import { config } from '../config';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { SendingEngine } from '../services/sendingEngine';
import { NumberService } from '../services/numberService';
import { ComplianceService } from '../services/complianceService';
import { OutboundGateService } from '../services/outboundGateService';
import { AIService, resolveAiSuggestions } from '../services/aiService';
import { resolveFollowupStatus } from '../services/followupPolicy';

type InboxFilter =
  | 'all'
  | 'unread'
  | 'hot'
  | 'email_rcv'
  | 'my_campaigns'
  | 'interested'
  | 'followup'
  | 'in_pipeline'
  | 'dnc';
type InboxSort = 'ai_priority' | 'newest_activity' | 'oldest_untouched' | 'unread_first' | 'hot_first';

const DEAL_STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  ENGAGED_INTERESTED: 'Engaged / Interested',
  QUALIFIED: 'Qualified',
  SUBMITTED_IN_REVIEW: 'Submitted (In Review)',
  APPROVED_OFFERS: 'Approved / Offers',
  COMMITTED_FUNDING: 'Committed (Funding)',
  FUNDED: 'Funded',
  NURTURE: 'Nurture',
  CLOSED: 'Closed',
};

export class InboxController {
  private static readonly FILTER_KEYS: InboxFilter[] = [
    'all',
    'unread',
    'hot',
    'email_rcv',
    'my_campaigns',
    'interested',
    'followup',
    'in_pipeline',
    'dnc',
  ];
  private static readonly SORT_KEYS: InboxSort[] = [
    'ai_priority',
    'newest_activity',
    'oldest_untouched',
    'unread_first',
    'hot_first',
  ];
  private static readonly OPT_OUT_KEYWORDS = [
    'stop',
    'stopall',
    'unsubscribe',
    'cancel',
    'end',
    'quit',
    'opt out',
    'optout',
  ];
  private static readonly GENERIC_SOURCE_TOKENS = new Set(['csvimport', 'import', 'inbox', 'sms', 'smsinbox']);

  // Pixel-perfect (M3): кэш rep stats для секции REP PERFORMANCE в правой панели
  // Кеш на 5 минут — агрегации по сообщениям не критичны к real-time, но дорогие.
  private static readonly REP_STATS_CACHE_MS = 5 * 60 * 1000;
  private static readonly repStatsCache = new Map<
    string,
    {
      ts: number;
      data: { avgFirstResponseSec: number | null; aiUsageRatePct: number | null; aiConversionsCount: number };
    }
  >();

  /**
   * Считает performance-метрики rep'а для отображения в правой панели Inbox:
   * - avgFirstResponseSec: avg(время от первого INBOUND до следующего OUTBOUND) по последним 30 inbound'ам.
   * - aiUsageRatePct: доля conversations с aiClassifiedAt из всех assigned rep'у (proxy для AI usage).
   * - aiConversionsCount: count(assigned conversations со статусом 'Interested' и aiClassifiedAt IS NOT NULL).
   *
   * Кешируется на 5 минут per-rep чтобы не нагружать DB на каждом открытии треда.
   */
  private static async computeRepStats(repId: string): Promise<{
    avgFirstResponseSec: number | null;
    aiUsageRatePct: number | null;
    aiConversionsCount: number;
  }> {
    const cached = InboxController.repStatsCache.get(repId);
    if (cached && Date.now() - cached.ts < InboxController.REP_STATS_CACHE_MS) {
      return cached.data;
    }

    const [totalConv, classifiedConv, interestedConv, recentInbounds] = await Promise.all([
      prisma.conversation.count({ where: { assignedRepId: repId } }),
      prisma.conversation.count({ where: { assignedRepId: repId, aiClassifiedAt: { not: null } } }),
      prisma.conversation.count({
        where: { assignedRepId: repId, leadStatus: 'Interested', aiClassifiedAt: { not: null } },
      }),
      prisma.message.findMany({
        where: {
          direction: 'INBOUND',
          conversation: { assignedRepId: repId },
        },
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: { id: true, createdAt: true, conversationId: true },
      }),
    ]);

    let totalDeltaSec = 0;
    let count = 0;
    for (const inb of recentInbounds) {
      const nextOut = await prisma.message.findFirst({
        where: {
          conversationId: inb.conversationId,
          direction: 'OUTBOUND',
          createdAt: { gt: inb.createdAt },
        },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });
      if (!nextOut) continue;
      const delta = Math.floor((nextOut.createdAt.getTime() - inb.createdAt.getTime()) / 1000);
      // Skip outliers (>7d значит rep не отвечал и это спорно для AVG response)
      if (delta > 0 && delta < 7 * 24 * 3600) {
        totalDeltaSec += delta;
        count += 1;
      }
    }

    const data = {
      avgFirstResponseSec: count > 0 ? Math.floor(totalDeltaSec / count) : null,
      aiUsageRatePct: totalConv > 0 ? Math.round((classifiedConv / totalConv) * 100) : null,
      aiConversionsCount: interestedConv,
    };
    InboxController.repStatsCache.set(repId, { ts: Date.now(), data });
    return data;
  }

  private static buildAiPersistenceFields(signals: Record<string, unknown>): {
    extractedIndustry: string | null;
    helocFitFlag: boolean | null;
    extractedRevenue: number | null;
    extractedAsk: string | null;
  } {
    const extractedIndustry =
      typeof signals.industry === 'string' && signals.industry.trim() ? signals.industry.trim() : null;
    const helocFitFlag = typeof signals.helocFitFlag === 'boolean' ? signals.helocFitFlag : null;
    const extractedRevenue = typeof signals.revenueMonthly === 'number' ? Math.round(signals.revenueMonthly) : null;
    const extractedAsk = typeof signals.ask === 'string' && signals.ask.trim() ? signals.ask.trim() : null;

    return {
      extractedIndustry,
      helocFitFlag,
      extractedRevenue,
      extractedAsk,
    };
  }

  private static async logAuditEvent(input: {
    conversationId: string;
    actorId?: string | null;
    eventType: string;
    source?: string;
    oldValue?: Record<string, unknown>;
    newValue?: Record<string, unknown>;
  }): Promise<void> {
    await prisma.conversationAudit.create({
      data: {
        conversationId: input.conversationId,
        actorId: input.actorId || null,
        eventType: input.eventType,
        source: input.source || null,
        oldValue: input.oldValue as object | undefined,
        newValue: input.newValue as object | undefined,
      },
    });
  }

  private static triggerOwnerActionReclassification(
    req: AuthRequest,
    conversationId: string,
    reason: 'status_update' | 'note_added' | 'pipeline_added' | 'reply_sent',
    repId: string | null,
  ): void {
    if (!config.ai.classificationEnabled) return;

    void (async () => {
      try {
        const ai = await AIService.classifyInbound(conversationId);
        if (!ai) return;

        const persistedSignals = {
          ...(ai.signals as Record<string, unknown>),
          classifierPromptVersion: ai.promptVersion,
          reclassificationReason: reason,
          reclassifiedAt: new Date().toISOString(),
          reclassifiedByUserId: req.user?.id || null,
        };
        const aiPersistence = InboxController.buildAiPersistenceFields(persistedSignals);

        await prisma.conversation.update({
          where: { id: conversationId },
          data: {
            aiClassification: ai.classification,
            aiSignals: persistedSignals as object,
            aiSuggestions: ai.suggestions as object,
            ...aiPersistence,
            isCaliforniaNumber: ai.isCaliforniaNumber,
            aiLeadScore: ai.leadScore,
            aiClassifiedAt: new Date(),
          },
        });

        await InboxController.logAuditEvent({
          conversationId,
          actorId: req.user?.id,
          eventType: 'ai_state_changed',
          source: `owner_action_${reason}`,
          oldValue: { reason },
          newValue: {
            aiClassification: ai.classification,
            aiLeadScore: ai.leadScore,
            promptVersion: ai.promptVersion,
          },
        });

        const io = (req.app as any).io;
        if (io) {
          const payload = {
            conversationId,
            classification: ai.classification,
            leadScore: ai.leadScore,
            signals: persistedSignals,
            suggestions: ai.suggestions,
            promptVersion: ai.promptVersion,
            isCaliforniaNumber: ai.isCaliforniaNumber,
            source: 'owner_action',
            reason,
          };
          if (repId) {
            io.to(`inbox:${repId}`).emit('ai-classified', payload);
          }
          io.to(`conversation:${conversationId}`).emit('ai-classified', payload);
        }
      } catch (error) {
        logger.error('Owner-action AI reclassification failed', {
          conversationId,
          reason,
          error: (error as Error).message,
        });
      }
    })();
  }

  private static resolveFilter(raw: unknown): InboxFilter {
    const normalized = String(raw || 'all').toLowerCase() as InboxFilter;
    return InboxController.FILTER_KEYS.includes(normalized) ? normalized : 'all';
  }

  private static resolveSort(raw: unknown): InboxSort {
    const normalized = String(raw || 'newest_activity').toLowerCase() as InboxSort;
    return InboxController.SORT_KEYS.includes(normalized) ? normalized : 'newest_activity';
  }

  private static hotConversationCondition(): any {
    return {
      OR: [{ aiClassification: 'HOT' }, { hotLead: true }],
    };
  }

  private static inPipelineCondition(): any {
    return {
      OR: [{ deals: { some: {} } }, { lead: { deal: { isNot: null } } }],
    };
  }

  private static inboxOwnershipCondition(userId: string): any {
    return {
      OR: [
        { assignedRepId: userId },
        { lead: { assignedRepId: userId } },
        {
          AND: [
            { assignedRepId: null },
            { lead: { assignedRepId: null } },
            {
              messages: {
                some: {
                  direction: 'OUTBOUND',
                  sentByUserId: userId,
                },
              },
            },
          ],
        },
      ],
    };
  }

  private static async canAccessConversation(
    conversation: { id: string; assignedRepId: string | null; lead?: { assignedRepId?: string | null } | null },
    user: AuthRequest['user'],
  ): Promise<boolean> {
    if (!user) return false;
    if (user.role === 'ADMIN' || user.role === 'MANAGER') return true;
    if (user.role !== 'REP') return false;
    if (conversation.assignedRepId === user.id || conversation.lead?.assignedRepId === user.id) return true;
    if (conversation.assignedRepId || conversation.lead?.assignedRepId) return false;

    const outboundCount = await prisma.message.count({
      where: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        sentByUserId: user.id,
      },
    });

    return outboundCount > 0;
  }

  private static async canUserClearUnread(
    conversation: { id: string; assignedRepId: string | null; lead?: { assignedRepId?: string | null } | null },
    user: AuthRequest['user'],
  ): Promise<boolean> {
    if (!user) return false;
    if (conversation.assignedRepId === user.id || conversation.lead?.assignedRepId === user.id) return true;
    if (conversation.assignedRepId || conversation.lead?.assignedRepId) return false;

    const outboundCount = await prisma.message.count({
      where: {
        conversationId: conversation.id,
        direction: 'OUTBOUND',
        sentByUserId: user.id,
      },
    });

    return outboundCount > 0;
  }

  private static buildFilterCondition(filter: InboxFilter, req: AuthRequest): any | null {
    switch (filter) {
      case 'unread':
        return { unreadCount: { gt: 0 } };
      case 'hot':
        return InboxController.hotConversationCondition();
      case 'email_rcv':
        return { emailReceived: true };
      case 'my_campaigns':
        return {
          messages: {
            some: {
              direction: 'OUTBOUND',
              campaignId: { not: null },
              sentByUserId: req.user?.id,
            },
          },
        };
      case 'interested':
        return {
          OR: [
            { leadStatus: 'Interested' },
            { lead: { status: { in: ['INTERESTED', 'DOCS_REQUESTED', 'SUBMITTED'] } } },
          ],
        };
      case 'followup':
        return { OR: [{ followupTime: { gte: new Date() } }, { nextFollowupAt: { gte: new Date() } }] };
      case 'in_pipeline':
        return InboxController.inPipelineCondition();
      case 'dnc':
        return {
          OR: [
            { leadStatus: 'DNC' },
            { lead: { status: 'DNC' } },
            { lead: { optedOut: true } },
            InboxController.optOutOnlyCondition(),
          ],
        };
      case 'all':
      default:
        return null;
    }
  }

  private static buildOrderBy(sort: InboxSort): any {
    switch (sort) {
      case 'ai_priority':
        return [
          { aiClassification: 'desc' },
          { aiLeadScore: 'desc' },
          { unreadCount: 'desc' },
          { lastMessageAt: 'desc' },
          { updatedAt: 'desc' },
        ];
      case 'oldest_untouched':
        return [{ lastMessageAt: 'asc' }, { updatedAt: 'asc' }];
      case 'unread_first':
        return [{ unreadCount: 'desc' }, { lastMessageAt: 'desc' }, { updatedAt: 'desc' }];
      case 'hot_first':
        return [{ aiClassification: 'desc' }, { hotLead: 'desc' }, { aiLeadScore: 'desc' }, { lastMessageAt: 'desc' }];
      case 'newest_activity':
      default:
        return [{ lastMessageAt: 'desc' }, { updatedAt: 'desc' }];
    }
  }

  private static normalizeDealStage(raw: unknown): string {
    const value = String(raw || '')
      .toUpperCase()
      .trim();
    if (value && DEAL_STAGE_LABELS[value]) return value;
    return 'NEW_LEAD';
  }

  private static optOutBodyConditions(): Array<any> {
    // Используем equals на точное совпадение, чтобы избежать false positives:
    // "Send it" содержит "end", "Equity" содержит "quit" и т.д.
    // Twilio сам обрабатывает opt-out keywords на своей стороне; здесь мы лишь
    // дополнительно фильтруем сообщения, которые целиком состоят из ключевого слова
    // (с возможными знаками препинания/пробелами).
    return InboxController.OPT_OUT_KEYWORDS.flatMap((keyword) => [
      { body: { equals: keyword } },
      { body: { equals: keyword.toUpperCase() } },
      { body: { equals: keyword + '.' } },
      { body: { equals: keyword.toUpperCase() + '.' } },
      { body: { equals: keyword + ' ' } },
      { body: { equals: ' ' + keyword } },
    ]);
  }

  private static inboundAnyCondition(): any {
    return {
      messages: {
        some: {
          direction: 'INBOUND',
        },
      },
    };
  }

  private static inboundNonOptOutCondition(): any {
    return {
      messages: {
        some: {
          direction: 'INBOUND',
          NOT: {
            OR: InboxController.optOutBodyConditions(),
          },
        },
      },
    };
  }

  private static excludeDncCondition(): any {
    return {
      AND: [{ lead: { status: { not: 'DNC' } } }, { lead: { optedOut: false } }],
    };
  }

  private static optOutOnlyCondition(): any {
    return {
      AND: [
        InboxController.inboundAnyCondition(),
        {
          NOT: InboxController.inboundNonOptOutCondition(),
        },
      ],
    };
  }

  private static async resolveSmsSource(
    conversationId: string,
    leadId: string,
    leadSource?: string | null,
  ): Promise<string> {
    const [campaignLead, campaignMessage, importListTag] = await Promise.all([
      prisma.campaignLead.findFirst({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
        include: { campaign: { select: { name: true } } },
      }),
      prisma.message.findFirst({
        where: {
          conversationId,
          campaignId: { not: null },
        },
        orderBy: { createdAt: 'desc' },
        include: { campaign: { select: { name: true } } },
      }),
      prisma.tag.findFirst({
        where: {
          isImportList: true,
          leads: {
            some: {
              leadId,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { name: true },
      }),
    ]);

    const campaignName = campaignLead?.campaign?.name?.trim() || campaignMessage?.campaign?.name?.trim() || '';
    const importListName = (importListTag?.name || '').trim();
    const fallback = InboxController.normalizeSourceCandidate(leadSource);
    return campaignName || importListName || fallback || 'Inbox';
  }

  private static normalizeSourceCandidate(source?: string | null): string {
    const raw = (source || '').trim();
    if (!raw) return '';
    const token = raw.toLowerCase().replace(/[^a-z0-9]+/g, '');
    if (InboxController.GENERIC_SOURCE_TOKENS.has(token)) return '';
    return raw;
  }

  private static phoneDigits(raw?: string | null): string {
    return String(raw || '').replace(/\D/g, '');
  }

  private static phoneMatchKey(raw?: string | null): string {
    const digits = InboxController.phoneDigits(raw);
    if (!digits) return '';
    if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
    return digits;
  }

  private static phoneLookupVariants(raw?: string | null): string[] {
    const digits = InboxController.phoneDigits(raw);
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

  private static pickPreferredPipelineDeal<T extends { stage?: string | null; updatedAt?: Date; createdAt?: Date }>(
    deals: T[],
  ): T | null {
    if (!deals.length) return null;

    const rank = (stage?: string | null) => {
      if (stage === 'CLOSED') return 3;
      if (stage === 'NURTURE') return 2;
      if (stage === 'FUNDED') return 1;
      return 0;
    };

    const sorted = deals.slice().sort((a, b) => {
      const stageDiff = rank(a.stage) - rank(b.stage);
      if (stageDiff !== 0) return stageDiff;

      const aTime = a.updatedAt?.getTime() || a.createdAt?.getTime() || 0;
      const bTime = b.updatedAt?.getTime() || b.createdAt?.getTime() || 0;
      return bTime - aTime;
    });

    return sorted[0] || null;
  }

  private static hydrateLeadFromDealClient(
    lead: {
      firstName?: string;
      lastName?: string | null;
      company?: string | null;
      email?: string | null;
      phone?: string | null;
    },
    dealClient?: { businessName?: string | null; contactName?: string | null; email?: string | null } | null,
  ) {
    if (!dealClient) return lead;

    const next = { ...lead };
    if (!next.company && dealClient.businessName) {
      next.company = dealClient.businessName.trim();
    }
    if (!next.email && dealClient.email) {
      next.email = dealClient.email.trim();
    }

    const first = (next.firstName || '').trim();
    const last = (next.lastName || '').trim();
    const unknownFirst = !first || first.toLowerCase() === 'unknown';
    const hasNoLast = !last;
    const contactName = (dealClient.contactName || '').trim();
    if ((unknownFirst || hasNoLast) && contactName) {
      const [firstPart, ...rest] = contactName.split(/\s+/);
      if (unknownFirst && firstPart) next.firstName = firstPart;
      if (hasNoLast && rest.length > 0) next.lastName = rest.join(' ');
    }

    return next;
  }

  private static withConditions(baseWhere: any, extraConditions: any[]): any {
    const baseAnd = Array.isArray(baseWhere.AND) ? [...baseWhere.AND] : [];
    return {
      ...baseWhere,
      ...(baseAnd.length > 0 || extraConditions.length > 0 ? { AND: [...baseAnd, ...extraConditions] } : {}),
    };
  }

  private static async enrichFromNumberFields<
    T extends {
      lead?: {
        id?: string;
        phone?: string;
        firstName?: string;
        lastName?: string | null;
        company?: string | null;
        email?: string | null;
        deal?: any;
      };
      twilioNumber?: any;
      stickyNumber?: any;
      messages?: any[];
      deals?: any[];
      unreadCount?: number;
    },
  >(
    conversations: T[],
    viewer?: { id: string; role: string } | null,
  ): Promise<
    Array<T & { fromNumber: string; fromNumberFriendlyName: string | null; isInPipeline: boolean; unreadDot: boolean }>
  > {
    const candidateNumbers = new Set<string>();
    const leadIds = new Set<string>();
    const leadPhoneLookupVariants = new Set<string>();
    for (const conv of conversations) {
      const lastMessage = conv.messages?.[0];
      const derived =
        conv.twilioNumber?.phoneNumber ||
        conv.stickyNumber?.phoneNumber ||
        (lastMessage ? (lastMessage.direction === 'OUTBOUND' ? lastMessage.fromNumber : lastMessage.toNumber) : '');
      if (derived) candidateNumbers.add(derived);
      if (conv.lead?.id) leadIds.add(conv.lead.id);
      for (const variant of InboxController.phoneLookupVariants(conv.lead?.phone)) {
        leadPhoneLookupVariants.add(variant);
      }
    }

    const fallbackNumbers =
      candidateNumbers.size > 0
        ? await prisma.phoneNumber.findMany({
            where: { phoneNumber: { in: Array.from(candidateNumbers) } },
            select: { phoneNumber: true, friendlyName: true },
          })
        : [];
    const fallbackMap = new Map(fallbackNumbers.map((n) => [n.phoneNumber, n.friendlyName || null]));

    const dealOrConditions: any[] = [];
    if (leadIds.size > 0) dealOrConditions.push({ leadId: { in: Array.from(leadIds) } });
    if (leadPhoneLookupVariants.size > 0) {
      dealOrConditions.push({ client: { phone: { in: Array.from(leadPhoneLookupVariants) } } });
    }

    const relatedDeals =
      dealOrConditions.length > 0
        ? await prisma.deal.findMany({
            where: {
              OR: dealOrConditions,
              ...(viewer?.role === 'REP' ? { assignedRepId: viewer.id } : {}),
            },
            select: {
              id: true,
              leadId: true,
              stage: true,
              stageLabel: true,
              createdFromSms: true,
              assignedRepId: true,
              smsConversationId: true,
              createdAt: true,
              updatedAt: true,
              client: {
                select: {
                  phone: true,
                  businessName: true,
                  contactName: true,
                  email: true,
                },
              },
            },
            orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
          })
        : [];

    const dealsByLeadId = new Map<string, any[]>();
    const dealsByPhoneKey = new Map<string, any[]>();
    for (const deal of relatedDeals) {
      if (deal.leadId) {
        const arr = dealsByLeadId.get(deal.leadId) || [];
        arr.push(deal);
        dealsByLeadId.set(deal.leadId, arr);
      }
      const phoneKey = InboxController.phoneMatchKey(deal.client?.phone);
      if (phoneKey) {
        const arr = dealsByPhoneKey.get(phoneKey) || [];
        arr.push(deal);
        dealsByPhoneKey.set(phoneKey, arr);
      }
    }

    return conversations.map((conv) => {
      const lastMessage = conv.messages?.[0];
      const fromNumber =
        conv.twilioNumber?.phoneNumber ||
        conv.stickyNumber?.phoneNumber ||
        (lastMessage ? (lastMessage.direction === 'OUTBOUND' ? lastMessage.fromNumber : lastMessage.toNumber) : '') ||
        '';
      const fromNumberFriendlyName =
        conv.twilioNumber?.friendlyName || conv.stickyNumber?.friendlyName || fallbackMap.get(fromNumber) || null;
      const leadDeal = conv.lead?.deal ? [conv.lead.deal] : [];
      const byLeadId = conv.lead?.id ? dealsByLeadId.get(conv.lead.id) || [] : [];
      const byPhone = dealsByPhoneKey.get(InboxController.phoneMatchKey(conv.lead?.phone)) || [];
      const pipelineDeal = InboxController.pickPreferredPipelineDeal([
        ...(conv.deals || []),
        ...leadDeal,
        ...byLeadId,
        ...byPhone,
      ]);
      const hydratedLead =
        conv.lead && pipelineDeal?.client
          ? InboxController.hydrateLeadFromDealClient(conv.lead, {
              businessName: pipelineDeal.client.businessName,
              contactName: pipelineDeal.client.contactName,
              email: pipelineDeal.client.email,
            })
          : conv.lead;
      const isInPipeline = !!pipelineDeal;

      return {
        ...conv,
        ...(hydratedLead ? { lead: hydratedLead } : {}),
        fromNumber,
        fromNumberFriendlyName,
        isInPipeline,
        unreadDot: (conv.unreadCount || 0) > 0,
      };
    });
  }

  // Быстрый агрегат для бейджа в sidebar.
  // Должен соответствовать тому, что видит rep в Inbox под фильтром "Unread":
  // — исключаем DNC/opted-out лиды
  // — требуем хотя бы одно входящее non-opt-out сообщение
  static async getUnreadSummary(req: AuthRequest, res: Response): Promise<void> {
    const baseWhere: any = {
      isActive: true,
      unreadCount: { gt: 0 },
      AND: [InboxController.excludeDncCondition(), InboxController.inboundNonOptOutCondition()],
    };
    if (req.user?.role === 'REP') {
      baseWhere.assignedRepId = req.user.id;
    }

    const [unreadConversations, agg] = await Promise.all([
      prisma.conversation.count({ where: baseWhere }),
      prisma.conversation.aggregate({
        where: baseWhere,
        _sum: { unreadCount: true },
      }),
    ]);

    res.json({
      unreadConversations,
      unreadMessages: agg._sum.unreadCount || 0,
    });
  }

  static async listConversations(req: AuthRequest, res: Response): Promise<void> {
    const {
      page = '1',
      limit = '50',
      search,
      unreadOnly,
      filter = 'all',
      sort,
      withFilterCounts = 'false',
      campaignId,
      scope,
    } = req.query;
    const parsedPage = Math.max(parseInt(page as string, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100);
    const skip = (parsedPage - 1) * parsedLimit;

    const baseWhere: any = { isActive: true };
    const baseAndFilters: any[] = [];

    // Rep visibility must follow the real SMS ownership chain:
    // conversation assignment, lead assignment, or any outbound sent by this rep.
    if (req.user?.role === 'REP') {
      baseAndFilters.push(InboxController.inboxOwnershipCondition(req.user.id));
    } else if ((req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER') && String(scope || '') === 'mine') {
      // Admin/Manager "My Convs" scope
      baseAndFilters.push(InboxController.inboxOwnershipCondition(req.user.id));
    }

    const normalizedFilter = InboxController.resolveFilter(filter);
    const normalizedSort = InboxController.resolveSort(sort);
    const includeFilterCounts = withFilterCounts === 'true';

    const hasCampaignFilter = !!(campaignId && String(campaignId).trim());

    const listConditions: any[] = [];
    if (unreadOnly === 'true') listConditions.push({ unreadCount: { gt: 0 } });
    // При deep-link по кампании — показываем ВСЕ replies, включая opt-out/DNC
    // (user click'нул именно за этой кампанией, ожидает увидеть полный список ответов).
    // DNC-метка показывается на UI как badge, но конверсация не скрывается.
    if (!hasCampaignFilter) {
      if (normalizedFilter !== 'dnc') {
        listConditions.push(InboxController.excludeDncCondition());
      }
      listConditions.push(
        normalizedFilter === 'dnc'
          ? InboxController.inboundAnyCondition()
          : InboxController.inboundNonOptOutCondition(),
      );
    } else {
      // В режиме фильтра по кампании учитываем все входящие, без отсечения opt-out
      listConditions.push(InboxController.inboundAnyCondition());
    }
    const selectedFilterCondition = InboxController.buildFilterCondition(normalizedFilter, req);
    if (selectedFilterCondition) listConditions.push(selectedFilterCondition);

    // Фильтр по кампании — показать треды лидов, которые replied в конкретной кампании
    let campaignScopeCondition: any | null = null;
    if (hasCampaignFilter) {
      const campaignLeads = await prisma.campaignLead.findMany({
        where: {
          campaignId: String(campaignId),
          status: 'REPLIED',
        },
        select: { leadId: true },
      });
      const repliedLeadIds = campaignLeads.map((cl) => cl.leadId);
      campaignScopeCondition = { lead: { id: { in: repliedLeadIds.length > 0 ? repliedLeadIds : ['__none__'] } } };
      listConditions.push(campaignScopeCondition);
    }

    if (search && String(search).trim()) {
      const text = String(search).trim();
      baseAndFilters.push({
        OR: [
          {
            lead: {
              OR: [
                { firstName: { contains: text } },
                { lastName: { contains: text } },
                { phone: { contains: text } },
                { company: { contains: text } },
              ],
            },
          },
          {
            messages: {
              some: { body: { contains: text } },
            },
          },
        ],
      });
    }

    const where = InboxController.withConditions(
      {
        ...baseWhere,
        ...(baseAndFilters.length > 0 ? { AND: baseAndFilters } : {}),
      },
      listConditions,
    );

    const [conversations, total, filterCounts, summaryCounts] = await Promise.all([
      prisma.conversation.findMany({
        where,
        skip,
        take: parsedLimit,
        orderBy: InboxController.buildOrderBy(normalizedSort),
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              email: true,
              company: true,
              source: true,
              status: true,
              optedOut: true,
              deal: {
                select: {
                  id: true,
                  stage: true,
                  stageLabel: true,
                  createdFromSms: true,
                  assignedRepId: true,
                  createdAt: true,
                  updatedAt: true,
                  client: {
                    select: {
                      phone: true,
                      businessName: true,
                      contactName: true,
                      email: true,
                    },
                  },
                },
              },
              tags: {
                include: { tag: true },
              },
            },
          },
          messages: {
            take: 1,
            orderBy: { createdAt: 'desc' },
            select: {
              body: true,
              direction: true,
              createdAt: true,
              status: true,
              fromNumber: true,
              toNumber: true,
            },
          },
          twilioNumber: {
            select: { id: true, phoneNumber: true, friendlyName: true },
          },
          stickyNumber: {
            select: { id: true, phoneNumber: true, friendlyName: true },
          },
          assignedRep: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
            },
          },
          deals: {
            orderBy: { createdAt: 'desc' },
            select: {
              id: true,
              stage: true,
              stageLabel: true,
              createdFromSms: true,
              assignedRepId: true,
              createdByUserId: true,
            },
          },
        },
      }),
      prisma.conversation.count({ where }),
      includeFilterCounts
        ? (async () => {
            const baseWithSearch = InboxController.withConditions(baseWhere, [
              ...baseAndFilters,
              ...(campaignScopeCondition ? [campaignScopeCondition] : []),
            ]);
            const counts = await Promise.all(
              InboxController.FILTER_KEYS.map(async (key) => {
                const condition = InboxController.buildFilterCondition(key, req);
                const visibilityCondition =
                  hasCampaignFilter || key === 'dnc'
                    ? InboxController.inboundAnyCondition()
                    : InboxController.inboundNonOptOutCondition();
                const baseVisibility = hasCampaignFilter
                  ? [visibilityCondition]
                  : key === 'dnc'
                    ? [visibilityCondition]
                    : [InboxController.excludeDncCondition(), visibilityCondition];
                const scopedWhere = InboxController.withConditions(
                  baseWithSearch,
                  condition ? [...baseVisibility, condition] : baseVisibility,
                );
                const count = await prisma.conversation.count({ where: scopedWhere });
                return [key, count] as const;
              }),
            );

            return Object.fromEntries(counts);
          })()
        : Promise.resolve(null),
      includeFilterCounts
        ? (async () => {
            const now = new Date();
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

            const baseWithSearch = InboxController.withConditions(baseWhere, [
              ...baseAndFilters,
              ...(campaignScopeCondition ? [campaignScopeCondition] : []),
            ]);

            const visibleWhere = InboxController.withConditions(
              baseWithSearch,
              hasCampaignFilter
                ? [InboxController.inboundAnyCondition()]
                : [InboxController.excludeDncCondition(), InboxController.inboundNonOptOutCondition()],
            );

            const [overdueFollowups, hotAiFlagged, newToday, unread, inPipelineQualified] = await Promise.all([
              prisma.conversation.count({
                where: InboxController.withConditions(visibleWhere, [
                  { OR: [{ followupTime: { lt: now } }, { nextFollowupAt: { lt: now } }] },
                ]),
              }),
              prisma.conversation.count({
                where: InboxController.withConditions(visibleWhere, [InboxController.hotConversationCondition()]),
              }),
              prisma.conversation.count({
                where: InboxController.withConditions(visibleWhere, [
                  { unreadCount: { gt: 0 } },
                  { lastDirection: 'inbound' },
                  { lastMessageAt: { gte: dayAgo } },
                ]),
              }),
              prisma.conversation.count({
                where: InboxController.withConditions(visibleWhere, [{ unreadCount: { gt: 0 } }]),
              }),
              prisma.conversation.count({
                where: InboxController.withConditions(visibleWhere, [InboxController.inPipelineCondition()]),
              }),
            ]);

            return {
              overdueFollowups,
              hotAiFlagged,
              newToday,
              unread,
              inPipelineQualified,
            };
          })()
        : Promise.resolve(null),
    ]);
    const enriched = await InboxController.enrichFromNumberFields(conversations, req.user || null);

    res.json({
      conversations: enriched,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total,
        pages: Math.ceil(total / parsedLimit),
      },
      sort: normalizedSort,
      filter: normalizedFilter,
      ...(filterCounts ? { filterCounts } : {}),
      ...(summaryCounts ? { summaryCounts } : {}),
    });
  }

  static async getConversation(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query;
    const parsedPage = Math.max(parseInt(page as string, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 200);
    const skip = (parsedPage - 1) * parsedLimit;

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        lead: {
          include: {
            tags: { include: { tag: true } },
            deal: {
              select: {
                id: true,
                stage: true,
                stageLabel: true,
                createdFromSms: true,
                assignedRepId: true,
                productType: true,
                createdAt: true,
                updatedAt: true,
                client: {
                  select: {
                    phone: true,
                    businessName: true,
                    contactName: true,
                    email: true,
                  },
                },
              },
            },
            pipelineCards: {
              include: { stage: true },
            },
          },
        },
        assignedRep: {
          select: { id: true, firstName: true, lastName: true },
        },
        twilioNumber: {
          select: { id: true, phoneNumber: true, friendlyName: true },
        },
        stickyNumber: {
          select: { id: true, phoneNumber: true, friendlyName: true },
        },
        deals: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            stage: true,
            stageLabel: true,
            createdAt: true,
            createdFromSms: true,
            productType: true,
            assignedRepId: true,
            assignedRep: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (!conversation) throw new AppError('Conversation not found', 404);
    const canAccessConversation = await InboxController.canAccessConversation(conversation, req.user);
    if (!canAccessConversation) {
      throw new AppError('Conversation not found', 404);
    }

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parsedLimit,
      select: {
        id: true,
        direction: true,
        status: true,
        body: true,
        fromNumber: true,
        toNumber: true,
        sentAt: true,
        deliveredAt: true,
        createdAt: true,
        sentByUser: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    const [
      totalMessages,
      latestCampaignLead,
      latestCampaignMessage,
      latestImportListTag,
      latestTemplateUse,
      notes,
      activityMessages,
      pipelineDeals,
      scheduled,
    ] = await Promise.all([
      prisma.message.count({ where: { conversationId: id } }),
      prisma.campaignLead.findFirst({
        where: { leadId: conversation.leadId },
        orderBy: { createdAt: 'desc' },
        include: { campaign: { select: { name: true } } },
      }),
      prisma.message.findFirst({
        where: { conversationId: id, campaignId: { not: null } },
        orderBy: { createdAt: 'desc' },
        include: { campaign: { select: { name: true } } },
      }),
      prisma.tag.findFirst({
        where: {
          isImportList: true,
          leads: {
            some: {
              leadId: conversation.leadId,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        select: { name: true },
      }),
      prisma.smsTemplateUsageLog.findFirst({
        where: { conversationId: id },
        orderBy: { usedAt: 'desc' },
        include: { template: { select: { name: true } } },
      }),
      prisma.conversationNote.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'desc' },
        take: 40,
        select: { id: true, createdAt: true, createdById: true, body: true },
      }),
      prisma.message.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'desc' },
        take: 80,
        select: {
          id: true,
          direction: true,
          body: true,
          status: true,
          sentAt: true,
          createdAt: true,
        },
      }),
      prisma.deal.findMany({
        where: { smsConversationId: id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          stage: true,
          stageLabel: true,
          createdAt: true,
          assignedRepId: true,
          assignedRep: { select: { firstName: true, lastName: true } },
        },
      }),
      prisma.scheduledMessage.findMany({
        where: { conversationId: id, status: 'PENDING' },
        orderBy: { scheduledAt: 'asc' },
        take: 20,
        select: { id: true, scheduledAt: true, body: true, createdById: true },
      }),
    ]);

    const noteAuthorIds = Array.from(new Set(notes.map((n) => n.createdById).filter(Boolean)));
    const noteAuthors =
      noteAuthorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: noteAuthorIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const noteAuthorMap = new Map(
      noteAuthors.map((u) => [u.id, [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.firstName]),
    );

    const messageForFrom = messages[0];
    let fromNumber =
      conversation.twilioNumber?.phoneNumber ||
      conversation.stickyNumber?.phoneNumber ||
      (messageForFrom
        ? messageForFrom.direction === 'OUTBOUND'
          ? messageForFrom.fromNumber
          : messageForFrom.toNumber
        : '') ||
      '';
    let fromNumberFriendlyName =
      conversation.twilioNumber?.friendlyName || conversation.stickyNumber?.friendlyName || null;

    if (fromNumber && !fromNumberFriendlyName) {
      const fallback = await prisma.phoneNumber.findUnique({
        where: { phoneNumber: fromNumber },
        select: { id: true, friendlyName: true },
      });
      if (fallback) {
        fromNumberFriendlyName = fallback.friendlyName || null;
        if (!conversation.twilioNumberId) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              twilioNumberId: fallback.id,
              stickyNumberId: conversation.stickyNumberId || fallback.id,
            },
          });
        }
      }
    }

    const sourceName =
      latestCampaignLead?.campaign?.name ||
      latestCampaignMessage?.campaign?.name ||
      latestImportListTag?.name ||
      InboxController.normalizeSourceCandidate(conversation.lead.source) ||
      'Inbox';
    const fallbackDealOrConditions: any[] = [{ leadId: conversation.leadId }];
    const phoneVariants = InboxController.phoneLookupVariants(conversation.lead.phone);
    if (phoneVariants.length > 0) {
      fallbackDealOrConditions.push({ client: { phone: { in: phoneVariants } } });
    }
    const phoneMatchedDeals = await prisma.deal.findMany({
      where: {
        OR: fallbackDealOrConditions,
        ...(req.user?.role === 'REP' ? { assignedRepId: req.user.id } : {}),
      },
      select: {
        id: true,
        stage: true,
        stageLabel: true,
        createdAt: true,
        updatedAt: true,
        createdFromSms: true,
        assignedRepId: true,
        productType: true,
        client: {
          select: {
            phone: true,
            businessName: true,
            contactName: true,
            email: true,
          },
        },
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
      take: 20,
    });
    const latestSmsDeal =
      InboxController.pickPreferredPipelineDeal([
        ...conversation.deals,
        ...(conversation.lead.deal ? [conversation.lead.deal] : []),
        ...phoneMatchedDeals,
      ]) || null;
    const latestDealClient =
      latestSmsDeal && typeof latestSmsDeal === 'object' && 'client' in latestSmsDeal ? latestSmsDeal.client : null;
    const hydratedLead = InboxController.hydrateLeadFromDealClient(conversation.lead, latestDealClient || null);
    const statusStrip = {
      hotLead: !!conversation.hotLead,
      pipelineState: latestSmsDeal ? 'in_pipeline' : 'not_in_pipeline',
      pipelineLabel: latestSmsDeal ? '→ In Pipeline' : 'Not in pipeline',
      fromNumber,
      fromNumberFriendlyName,
      assignedRep: conversation.assignedRep
        ? `${conversation.assignedRep.firstName} ${conversation.assignedRep.lastName || ''}`.trim()
        : null,
      followUpAt: conversation.followupTime || conversation.nextFollowupAt,
    };

    const contactInfo = {
      email: hydratedLead.email || '',
      phone: hydratedLead.phone || '',
      company: hydratedLead.company || '',
      source: sourceName,
      product:
        latestSmsDeal && typeof latestSmsDeal === 'object' && 'productType' in latestSmsDeal
          ? latestSmsDeal.productType || ''
          : '',
      assignedRep: statusStrip.assignedRep || '',
      conversationNumber: conversation.id,
      createdAt: conversation.createdAt,
      lastTemplateUsed: latestTemplateUse?.template?.name || '',
    };

    const activityEvents: Array<{
      id: string;
      type: string;
      text: string;
      at: Date;
      tone?: 'default' | 'teal' | 'gold';
    }> = [];
    for (const msg of activityMessages) {
      activityEvents.push({
        id: `msg_${msg.id}`,
        type: msg.direction === 'OUTBOUND' ? 'message_sent' : 'message_received',
        text: msg.direction === 'OUTBOUND' ? 'Message sent' : 'Message received',
        at: msg.sentAt || msg.createdAt,
      });
    }
    for (const note of notes) {
      const by = noteAuthorMap.get(note.createdById) || 'Rep';
      activityEvents.push({
        id: `note_${note.id}`,
        type: 'note_added',
        text: `Note added · ${by}`,
        at: note.createdAt,
      });
    }
    if (latestTemplateUse?.template?.name) {
      activityEvents.push({
        id: `template_${latestTemplateUse.id}`,
        type: 'template_used',
        text: `Template used · ${latestTemplateUse.template.name}`,
        at: latestTemplateUse.usedAt,
        tone: 'gold',
      });
    }
    for (const deal of pipelineDeals) {
      activityEvents.push({
        id: `pipe_${deal.id}`,
        type: 'pipeline_added',
        text: `→ Added to Pipeline · ${(deal.assignedRep?.firstName || '').trim() || 'Rep'}`,
        at: deal.createdAt,
        tone: 'teal',
      });
    }
    for (const item of scheduled) {
      activityEvents.push({
        id: `scheduled_${item.id}`,
        type: 'message_scheduled',
        text: `Scheduled message · ${item.scheduledAt.toISOString()}`,
        at: item.scheduledAt,
        tone: 'gold',
      });
    }
    activityEvents.sort((a, b) => b.at.getTime() - a.at.getTime());

    // Mark as read — ТОЛЬКО если открывает assigned rep этого треда.
    // Раньше: любой просмотр (включая ADMIN/MANAGER) сбрасывал unread →
    // assigned rep терял unread навсегда, не зная что пришёл ответ.
    // Теперь: ADMIN/MANAGER могут просматривать треды, не «съедая» unread у rep'а.
    // Для явного сброса есть отдельный endpoint markRead.
    const canClearUnread = (await InboxController.canUserClearUnread(conversation, req.user)) && canAccessConversation;
    if (conversation.unreadCount > 0 && canClearUnread) {
      await prisma.conversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
    }

    // Pixel-perfect M3: REP PERFORMANCE для правой панели — реальные числа, не placeholders.
    const repStats = conversation.assignedRepId
      ? await InboxController.computeRepStats(conversation.assignedRepId).catch((err) => {
          logger.warn('computeRepStats failed', { repId: conversation.assignedRepId, err: (err as Error).message });
          return { avgFirstResponseSec: null, aiUsageRatePct: null, aiConversionsCount: 0 };
        })
      : null;

    // Pixel-perfect M3: NOTES — отдельный массив с авторами для рендера в правой панели над input.
    const notesWithAuthor = notes.map((n) => ({
      id: n.id,
      body: n.body,
      createdAt: n.createdAt,
      authorName: noteAuthorMap.get(n.createdById) || 'Rep',
      authorId: n.createdById,
    }));

    const resolvedAiSuggestions = resolveAiSuggestions({
      suggestions: conversation.aiSuggestions,
      classification: conversation.aiClassification,
      signals: (conversation.aiSignals as Record<string, unknown> | null) || null,
      messages: messages
        .slice()
        .reverse()
        .map((message) => ({ direction: message.direction, body: message.body })),
    });
    const responseAiSignals = {
      ...(((conversation.aiSignals as Record<string, unknown> | null) || {}) as Record<string, unknown>),
    };
    if (typeof responseAiSignals.suggestedReply !== 'string' && resolvedAiSuggestions[0]?.text) {
      responseAiSignals.suggestedReply = resolvedAiSuggestions[0].text;
    }
    if (typeof responseAiSignals.suggestedReengageMessage !== 'string' && resolvedAiSuggestions[1]?.text) {
      responseAiSignals.suggestedReengageMessage = resolvedAiSuggestions[1].text;
    }

    res.json({
      conversation: {
        ...conversation,
        aiSignals: responseAiSignals,
        aiSuggestions: resolvedAiSuggestions,
        lead: hydratedLead,
        fromNumber,
        fromNumberFriendlyName,
        isInPipeline: !!latestSmsDeal,
        contactInfo,
        repStats,
        notesList: notesWithAuthor,
      },
      messages: messages.reverse(), // Chronological order
      statusStrip,
      contactInfo,
      activity: activityEvents.slice(0, 120),
      scheduled,
      pagination: {
        page: parsedPage,
        limit: parsedLimit,
        total: totalMessages,
      },
    });
  }

  static async getOrCreateByLead(req: AuthRequest, res: Response): Promise<void> {
    const { leadId } = req.params;

    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new AppError('Lead not found', 404);

    let conversation = await prisma.conversation.findFirst({
      where: { leadId },
      include: {
        lead: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            phone: true,
            status: true,
            optedOut: true,
            tags: { include: { tag: true } },
          },
        },
      },
    });

    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: { leadId, assignedRepId: lead.assignedRepId || null, isActive: true },
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              status: true,
              optedOut: true,
              tags: { include: { tag: true } },
            },
          },
        },
      });
    }

    res.json({ conversation });
  }

  static async markRead(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const conversation = await prisma.conversation.findUnique({ where: { id }, include: { lead: true } });
    if (!conversation) throw new AppError('Conversation not found', 404);
    if (!(await InboxController.canAccessConversation(conversation, req.user))) {
      throw new AppError('Not authorized to mark read for this conversation', 403);
    }
    if (!(await InboxController.canUserClearUnread(conversation, req.user))) {
      res.json({ message: 'Unread preserved for assigned rep' });
      return;
    }

    if (conversation.unreadCount > 0) {
      await prisma.conversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
      await InboxController.logAuditEvent({
        conversationId: id,
        actorId: req.user?.id,
        eventType: 'unread_changed',
        source: 'inbox_mark_read',
        oldValue: { unreadCount: conversation.unreadCount },
        newValue: { unreadCount: 0 },
      });
    }

    res.json({ message: 'Marked as read' });
  }

  static async markUnread(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    if (req.user?.role !== 'REP') {
      res.json({ message: 'Unread preserved for assigned rep' });
      return;
    }

    const conversation = await prisma.conversation.findUnique({ where: { id }, include: { lead: true } });
    if (!conversation) throw new AppError('Conversation not found', 404);
    if (!(await InboxController.canAccessConversation(conversation, req.user))) {
      throw new AppError('Not authorized to mark unread for this conversation', 403);
    }

    const nextUnread = Math.max(1, conversation.unreadCount || 0);

    await prisma.conversation.update({
      where: { id },
      data: { unreadCount: nextUnread },
    });

    await InboxController.logAuditEvent({
      conversationId: id,
      actorId: req.user?.id,
      eventType: 'unread_changed',
      source: 'inbox_mark_unread',
      oldValue: { unreadCount: conversation.unreadCount },
      newValue: { unreadCount: nextUnread },
    });

    res.json({ message: 'Marked as unread' });
  }

  static async sendReply(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { body } = req.body;

    if (!body || !body.trim()) {
      throw new AppError('Message body is required', 400);
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { lead: true },
    });

    if (!conversation) throw new AppError('Conversation not found', 404);
    if (!(await InboxController.canAccessConversation(conversation, req.user))) {
      throw new AppError('Not authorized to message this conversation', 403);
    }

    if (req.user?.role === 'REP') {
      const inboundCount = await prisma.message.count({
        where: { conversationId: id, direction: 'INBOUND' },
      });
      // Critical exception: never block replies in existing inbound threads.
      if (inboundCount === 0) {
        await OutboundGateService.ensureCanLaunchOutbound(req.user);
      }
    }

    const effectiveAssignedRepId =
      conversation.assignedRepId || conversation.lead.assignedRepId || (req.user?.role === 'REP' ? req.user.id : null);

    let messageId: string;
    try {
      messageId = await SendingEngine.queueMessage({
        toNumber: conversation.lead.phone,
        body: body.trim(),
        leadId: conversation.lead.id,
        sentByUserId: req.user!.id,
        preferredNumberId: conversation.twilioNumberId || conversation.stickyNumberId || undefined,
        priority: 10, // High priority for manual replies
      });
    } catch (err: any) {
      if (err.message?.startsWith('Cannot send:')) {
        throw new AppError(err.message, 422);
      }
      throw err;
    }

    // Update conversation
    await prisma.conversation.update({
      where: { id },
      data: {
        ...(req.user?.role === 'REP' && !conversation.assignedRepId ? { assignedRepId: req.user.id } : {}),
        lastMessageAt: new Date(),
        lastDirection: 'outbound',
        nextFollowupAt: null,
        followupTime: null,
        followupStatus: 'completed',
        followupSetBy: req.user?.id || null,
        followupSetAt: new Date(),
      },
    });

    if (req.user?.role === 'REP' && !conversation.lead.assignedRepId) {
      await prisma.lead.update({
        where: { id: conversation.lead.id },
        data: { assignedRepId: req.user.id },
      });
    }

    // Update lead status to CONTACTED if currently NEW, and sync pipeline card
    if (conversation.lead.status === 'NEW') {
      await prisma.lead.update({
        where: { id: conversation.lead.id },
        data: { status: 'CONTACTED', lastContactedAt: new Date() },
      });
      const contactedStage = await prisma.pipelineStage.findFirst({ where: { mappedStatus: 'CONTACTED' } });
      if (contactedStage) {
        const card = await prisma.pipelineCard.findFirst({ where: { leadId: conversation.lead.id } });
        if (card) {
          await prisma.pipelineCard.update({ where: { id: card.id }, data: { stageId: contactedStage.id } });
        } else {
          await prisma.pipelineCard.create({ data: { leadId: conversation.lead.id, stageId: contactedStage.id } });
        }
      }
    }

    // Broadcast to other conversation viewers via Socket.IO
    const io = req.app.get('io');
    if (io) {
      io.to(`conversation:${id}`).emit('message-sent', {
        conversationId: id,
        messageId,
        direction: 'OUTBOUND',
        body: body.trim(),
      });
      // Also notify inbox channel for conversation list refresh
      if (effectiveAssignedRepId) {
        io.to(`inbox:${effectiveAssignedRepId}`).emit('new-message', {
          conversationId: id,
        });
      }
    }

    InboxController.triggerOwnerActionReclassification(req, id, 'reply_sent', effectiveAssignedRepId);

    res.json({ messageId, status: 'queued' });
  }

  static async assignRep(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { repId } = req.body;

    const [conversation, nextRep] = await Promise.all([
      prisma.conversation.findUnique({
        where: { id },
        include: {
          assignedRep: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      prisma.user.findFirst({
        where: { id: repId, role: 'REP', isActive: true },
        select: { id: true, firstName: true, lastName: true },
      }),
    ]);

    if (!conversation) throw new AppError('Conversation not found', 404);
    if (!nextRep) throw new AppError('Assigned rep must be an active REP user', 400);

    const previousRepLabel = conversation.assignedRep
      ? `${conversation.assignedRep.firstName} ${conversation.assignedRep.lastName || ''}`.trim()
      : 'Unassigned';
    const nextRepLabel = `${nextRep.firstName} ${nextRep.lastName || ''}`.trim();
    const actorLabel = `${req.user!.firstName} ${req.user!.lastName || ''}`.trim();

    await prisma.$transaction([
      prisma.conversation.update({
        where: { id },
        data: { assignedRepId: repId },
      }),
      prisma.lead.update({
        where: { id: conversation.leadId },
        data: { assignedRepId: repId },
      }),
      prisma.conversationNote.create({
        data: {
          conversationId: id,
          createdById: req.user!.id,
          body: `Rep reassigned: ${previousRepLabel} → ${nextRepLabel} · by ${actorLabel}`,
        },
      }),
    ]);

    const io = (req.app as any).io;
    if (io) {
      const payload = { conversationId: id, type: 'assignment' };
      io.to(`inbox:${repId}`).emit('new-message', payload);
      io.to(`inbox:${req.user!.id}`).emit('new-message', payload);
      if (conversation.assignedRepId && conversation.assignedRepId !== repId) {
        io.to(`inbox:${conversation.assignedRepId}`).emit('new-message', payload);
      }
    }

    res.json({
      message: 'Rep assigned',
      assignedRep: nextRep,
      previousRepId: conversation.assignedRepId || null,
    });
  }

  // ============================================
  // PHASE 1: Расширенные методы SMS Inbox
  // ============================================

  /**
   * PATCH /:id/status — Обновить статус разговора (hotLead, leadStatus, emailReceived, follow-up)
   */
  static async updateConversationStatus(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { hotLead, leadStatus, emailReceived, nextFollowupAt, followupTime, followupReason, followupStatus } =
      req.body;

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new AppError('Conversation not found', 404);
    const beforeState = {
      hotLead: conversation.hotLead,
      leadStatus: conversation.leadStatus,
      emailReceived: conversation.emailReceived,
      nextFollowupAt: conversation.nextFollowupAt ? conversation.nextFollowupAt.toISOString() : null,
      followupState: conversation.followupState || null,
      followupTime: conversation.followupTime ? conversation.followupTime.toISOString() : null,
      followupReason: conversation.followupReason || null,
      followupSetBy: conversation.followupSetBy || null,
      followupSetAt: conversation.followupSetAt ? conversation.followupSetAt.toISOString() : null,
      followupStatus: conversation.followupStatus || null,
    };

    const data: any = {};
    if (hotLead !== undefined) data.hotLead = hotLead;
    if (leadStatus !== undefined) data.leadStatus = leadStatus || null;
    if (emailReceived !== undefined) data.emailReceived = emailReceived;
    const incomingFollowupTime = followupTime !== undefined ? followupTime : nextFollowupAt;
    const followupTouched =
      incomingFollowupTime !== undefined || followupReason !== undefined || followupStatus !== undefined;
    if (followupTouched) {
      const normalizedFollowup = incomingFollowupTime ? new Date(incomingFollowupTime) : null;
      const normalizedStatus = resolveFollowupStatus(normalizedFollowup, followupStatus);
      data.nextFollowupAt = normalizedFollowup;
      data.followupTime = normalizedFollowup;
      data.followupStatus = normalizedStatus;
      data.followupSetBy = req.user?.id || null;
      data.followupSetAt = new Date();
      if (followupReason !== undefined) {
        data.followupReason = followupReason ? String(followupReason).trim() : null;
      }
      if (normalizedStatus === 'cleared') {
        data.followupState = 'none';
        data.followupReason = null;
        data.nextFollowupAt = null;
        data.followupTime = null;
      } else if (normalizedStatus === 'completed') {
        data.followupState = 'none';
      } else {
        data.followupState = normalizedStatus;
      }
    }

    const updated = await prisma.conversation.update({
      where: { id },
      data,
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, phone: true, status: true },
        },
      },
    });

    const afterState = {
      hotLead: updated.hotLead,
      leadStatus: updated.leadStatus,
      emailReceived: updated.emailReceived,
      nextFollowupAt: updated.nextFollowupAt ? updated.nextFollowupAt.toISOString() : null,
      followupState: updated.followupState || null,
      followupTime: updated.followupTime ? updated.followupTime.toISOString() : null,
      followupReason: updated.followupReason || null,
      followupSetBy: updated.followupSetBy || null,
      followupSetAt: updated.followupSetAt ? updated.followupSetAt.toISOString() : null,
      followupStatus: updated.followupStatus || null,
    };

    const changedStatusFields = Object.keys(afterState).filter(
      (key) => JSON.stringify((beforeState as any)[key]) !== JSON.stringify((afterState as any)[key]),
    );
    if (changedStatusFields.length > 0) {
      await InboxController.logAuditEvent({
        conversationId: id,
        actorId: req.user?.id,
        eventType: 'status_changed',
        source: 'inbox_status_patch',
        oldValue: beforeState,
        newValue: afterState,
      });
    }

    // Lead status + compliance side-effects
    if (leadStatus === 'DNC') {
      const lead = await prisma.lead.update({
        where: { id: conversation.leadId },
        data: {
          status: 'DNC',
          optedOut: true,
          optedOutAt: new Date(),
          isSuppressed: true,
          suppressedAt: new Date(),
          suppressReason: 'DNC',
        },
        select: { phone: true },
      });
      if (lead.phone) {
        await prisma.suppressionEntry.upsert({
          where: { phone: lead.phone },
          create: { phone: lead.phone, reason: 'DNC', source: 'inbox_manual' },
          update: { reason: 'DNC', source: 'inbox_manual' },
        });
        await ComplianceService.invalidateCache(lead.phone);
      }
    } else if (leadStatus === 'Interested') {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: {
          status: 'INTERESTED',
          optedOut: false,
          optedOutAt: null,
        },
      });
    } else if (leadStatus === 'Not Interested') {
      const lead = await prisma.lead.update({
        where: { id: conversation.leadId },
        data: {
          status: 'NOT_INTERESTED',
          optedOut: true,
          optedOutAt: new Date(),
          isSuppressed: true,
          suppressedAt: new Date(),
          suppressReason: 'NOT_INTERESTED',
        },
        select: { phone: true },
      });
      if (lead.phone) {
        await prisma.suppressionEntry.upsert({
          where: { phone: lead.phone },
          create: { phone: lead.phone, reason: 'NOT_INTERESTED', source: 'inbox_manual' },
          update: { reason: 'NOT_INTERESTED', source: 'inbox_manual' },
        });
        await ComplianceService.invalidateCache(lead.phone);
      }
    }

    InboxController.triggerOwnerActionReclassification(
      req,
      id,
      'status_update',
      updated.assignedRepId || conversation.assignedRepId || null,
    );

    res.json({ conversation: updated });
  }

  // ─── Заметки (Notes) ───

  /**
   * GET /:id/notes — Список заметок для разговора
   */
  static async listNotes(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const notes = await prisma.conversationNote.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
    });

    // Pixel-perfect M3: подгружаем имена авторов для отображения "JB (admin) · 2hrs ago"
    const authorIds = Array.from(new Set(notes.map((n) => n.createdById).filter(Boolean)));
    const authors =
      authorIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: authorIds } },
            select: { id: true, firstName: true, lastName: true, role: true },
          })
        : [];
    const authorMap = new Map(
      authors.map((u) => [
        u.id,
        {
          name: [u.firstName, u.lastName].filter(Boolean).join(' ').trim() || u.firstName || 'Rep',
          initials: `${(u.firstName || '?')[0] || ''}${(u.lastName || '')[0] || ''}`.toUpperCase(),
          role: u.role,
        },
      ]),
    );

    const enriched = notes.map((n) => ({
      ...n,
      authorName: authorMap.get(n.createdById)?.name || 'Rep',
      authorInitials: authorMap.get(n.createdById)?.initials || '??',
      authorRole: authorMap.get(n.createdById)?.role || 'REP',
    }));

    res.json({ notes: enriched });
  }

  /**
   * POST /:id/notes — Создать заметку
   */
  static async createNote(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { body, dealId } = req.body;

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new AppError('Conversation not found', 404);

    const normalizedBody = String(body || '').trim();
    if (!normalizedBody) throw new AppError('Note body is required', 400);

    const explicitDeal =
      dealId && typeof dealId === 'string'
        ? await prisma.deal.findFirst({
            where: {
              id: dealId,
              smsConversationId: id,
            },
            select: { id: true, notes: true },
          })
        : null;

    const linkedSmsDeal =
      explicitDeal ||
      (await prisma.deal.findFirst({
        where: { smsConversationId: id, createdFromSms: true },
        orderBy: { createdAt: 'desc' },
        select: { id: true, notes: true },
      }));

    const syncLine = `[Inbox ${new Date().toISOString()}] ${normalizedBody}`;
    const nextDealNotes = linkedSmsDeal
      ? linkedSmsDeal.notes
        ? `${linkedSmsDeal.notes.trim()}\n${syncLine}`.trim()
        : syncLine
      : null;

    const txOps: any[] = [
      prisma.conversationNote.create({
        data: {
          conversationId: id,
          body: normalizedBody,
          dealId: linkedSmsDeal?.id || null,
          createdById: req.user!.id,
        },
      }),
    ];

    if (linkedSmsDeal && nextDealNotes) {
      txOps.push(
        prisma.deal.update({
          where: { id: linkedSmsDeal.id },
          data: { notes: nextDealNotes },
        }),
      );
      txOps.push(
        prisma.dealEvent.create({
          data: {
            dealId: linkedSmsDeal.id,
            repId: req.user!.id,
            eventType: 'note_added',
            note: `Inbox note synced · ${normalizedBody.slice(0, 80)}`,
          },
        }),
      );
    }

    const [note] = await prisma.$transaction(txOps);

    InboxController.triggerOwnerActionReclassification(req, id, 'note_added', conversation.assignedRepId || null);

    res.status(201).json({ note });
  }

  /**
   * DELETE /:id/notes/:noteId — Удалить заметку
   */
  static async deleteNote(req: AuthRequest, res: Response): Promise<void> {
    const { noteId } = req.params;

    const note = await prisma.conversationNote.findUnique({ where: { id: noteId } });
    if (!note) throw new AppError('Note not found', 404);

    // Удалить может только автор или админ
    if (note.createdById !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403);
    }

    await prisma.conversationNote.delete({ where: { id: noteId } });
    res.json({ message: 'Note deleted' });
  }

  /**
   * POST /:id/classification-feedback — сохранить feedback по AI (skip/use/override)
   */
  static async createClassificationFeedback(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { action, suggestionText, reason } = req.body as {
      action?: 'skip' | 'use' | 'override';
      suggestionText?: string;
      reason?: string;
    };

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      select: { id: true, assignedRepId: true, aiClassification: true, lead: { select: { assignedRepId: true } } },
    });
    if (!conversation) throw new AppError('Conversation not found', 404);

    if (!(await InboxController.canAccessConversation(conversation, req.user))) {
      throw new AppError('Forbidden', 403);
    }

    const feedback = await prisma.classificationFeedback.create({
      data: {
        conversationId: id,
        createdById: req.user!.id,
        action: action || 'skip',
        suggestionText: suggestionText?.trim() || null,
        reason: reason?.trim() || null,
        aiClassification: conversation.aiClassification || null,
      },
    });

    res.status(201).json({ feedback });
  }

  // ─── Шаблоны (Templates) ───

  /**
   * GET /templates — Список шаблонов (доступных пользователю)
   */
  static async listTemplates(req: AuthRequest, res: Response): Promise<void> {
    const { search, category, scope } = req.query;
    const userId = req.user!.id;

    const where: any = {
      isActive: true,
    };

    const normalizedScope = String(scope || '').toLowerCase();
    if (normalizedScope === 'mine') {
      where.createdById = userId;
    } else if (normalizedScope === 'team') {
      where.visibility = 'TEAM';
    } else if (normalizedScope === 'global') {
      where.visibility = 'GLOBAL';
    } else {
      where.OR = [{ visibility: 'GLOBAL' }, { visibility: 'TEAM' }, { createdById: userId, visibility: 'PRIVATE' }];
    }

    if (search) {
      where.AND = [
        {
          OR: [{ name: { contains: search as string } }, { body: { contains: search as string } }],
        },
      ];
    }
    if (category) {
      where.category = category as string;
    }

    const templates = await prisma.smsTemplate.findMany({
      where,
      orderBy: [{ usageCount: 'desc' }, { updatedAt: 'desc' }],
      include: {
        favorites: {
          where: { userId },
          select: { id: true },
        },
      },
    });

    const ownerIds = Array.from(new Set(templates.map((t) => t.createdById)));
    const owners =
      ownerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: ownerIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [];
    const ownerMap = new Map(owners.map((o) => [o.id, `${o.firstName} ${o.lastName || ''}`.trim()]));

    // Добавляем флаг isFavorite
    const result = templates.map((t) => ({
      ...t,
      isFavorite: t.favorites.length > 0,
      ownerName: ownerMap.get(t.createdById) || '',
      favorites: undefined,
    }));

    res.json({ templates: result });
  }

  /**
   * POST /templates — Создать шаблон
   */
  static async createTemplate(req: AuthRequest, res: Response): Promise<void> {
    const { name, body, category, visibility } = req.body;

    // Только ADMIN может создать GLOBAL шаблон
    if (visibility === 'GLOBAL' && req.user!.role !== 'ADMIN') {
      throw new AppError('Only admins can create global templates', 403);
    }

    const template = await prisma.smsTemplate.create({
      data: {
        name,
        body,
        category: category || null,
        visibility: visibility || 'PRIVATE',
        createdById: req.user!.id,
      },
    });

    res.status(201).json({ template });
  }

  /**
   * PUT /templates/:templateId — Обновить шаблон
   */
  static async updateTemplate(req: AuthRequest, res: Response): Promise<void> {
    const { templateId } = req.params;

    const existing = await prisma.smsTemplate.findUnique({ where: { id: templateId } });
    if (!existing) throw new AppError('Template not found', 404);

    if (req.body.visibility === 'GLOBAL' && req.user!.role !== 'ADMIN') {
      throw new AppError('Only admins can set global visibility', 403);
    }

    const template = await prisma.smsTemplate.update({
      where: { id: templateId },
      data: req.body,
    });

    res.json({ template });
  }

  /**
   * DELETE /templates/:templateId — Удалить шаблон (soft delete)
   */
  static async deleteTemplate(req: AuthRequest, res: Response): Promise<void> {
    const { templateId } = req.params;

    const existing = await prisma.smsTemplate.findUnique({ where: { id: templateId } });
    if (!existing) throw new AppError('Template not found', 404);

    await prisma.smsTemplate.update({
      where: { id: templateId },
      data: { isActive: false },
    });

    res.json({ message: 'Template deleted' });
  }

  /**
   * POST /templates/:templateId/favorite — Добавить/убрать из избранного
   */
  static async toggleFavorite(req: AuthRequest, res: Response): Promise<void> {
    const { templateId } = req.params;
    const userId = req.user!.id;

    const existing = await prisma.smsTemplateFavorite.findUnique({
      where: { userId_templateId: { userId, templateId } },
    });

    if (existing) {
      await prisma.smsTemplateFavorite.delete({ where: { id: existing.id } });
      res.json({ isFavorite: false });
    } else {
      await prisma.smsTemplateFavorite.create({
        data: { userId, templateId },
      });
      res.json({ isFavorite: true });
    }
  }

  /**
   * POST /templates/:templateId/use — Логировать использование шаблона
   */
  static async logTemplateUsage(req: AuthRequest, res: Response): Promise<void> {
    const { templateId } = req.params;
    const { conversationId } = req.body;

    await Promise.all([
      prisma.smsTemplateUsageLog.create({
        data: {
          userId: req.user!.id,
          templateId,
          conversationId: conversationId || null,
        },
      }),
      prisma.smsTemplate.update({
        where: { id: templateId },
        data: {
          usageCount: { increment: 1 },
          lastUsedAt: new Date(),
        },
      }),
    ]);

    res.json({ message: 'Usage logged' });
  }

  // ─── Отложенные сообщения (Scheduled Messages) ───

  /**
   * GET /:id/scheduled — Список отложенных сообщений для разговора
   */
  static async listScheduledMessages(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const scheduled = await prisma.scheduledMessage.findMany({
      where: {
        conversationId: id,
        status: 'PENDING',
      },
      orderBy: { scheduledAt: 'asc' },
    });

    res.json({ scheduled });
  }

  /**
   * POST /scheduled — Создать отложенное сообщение
   */
  static async createScheduledMessage(req: AuthRequest, res: Response): Promise<void> {
    const { conversationId, body, scheduledAt } = req.body;

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { lead: { select: { phone: true } } },
    });
    if (!conversation) throw new AppError('Conversation not found', 404);

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      throw new AppError('Scheduled time must be in the future', 400);
    }

    let senderNumber =
      (conversation.twilioNumberId
        ? await prisma.phoneNumber.findUnique({
            where: { id: conversation.twilioNumberId },
            select: { id: true, phoneNumber: true },
          })
        : null) ||
      (conversation.stickyNumberId
        ? await prisma.phoneNumber.findUnique({
            where: { id: conversation.stickyNumberId },
            select: { id: true, phoneNumber: true },
          })
        : null);

    if (!senderNumber) {
      senderNumber = await NumberService.getStickyNumber(
        conversation.lead.phone,
        conversation.assignedRepId || req.user!.id,
      );
    }
    if (!senderNumber) {
      throw new AppError('No sender number available for this conversation', 400);
    }

    if (!conversation.twilioNumberId || conversation.twilioNumberId !== senderNumber.id) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          twilioNumberId: senderNumber.id,
          stickyNumberId: conversation.stickyNumberId || senderNumber.id,
        },
      });
    }

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        conversationId,
        body,
        scheduledAt: scheduledDate,
        fromNumber: senderNumber.phoneNumber,
        createdById: req.user!.id,
      },
    });

    res.status(201).json({ scheduled });
  }

  /**
   * DELETE /scheduled/:scheduledId — Отменить отложенное сообщение
   */
  static async cancelScheduledMessage(req: AuthRequest, res: Response): Promise<void> {
    const { scheduledId } = req.params;

    const existing = await prisma.scheduledMessage.findUnique({ where: { id: scheduledId } });
    if (!existing) throw new AppError('Scheduled message not found', 404);
    if (existing.status !== 'PENDING') throw new AppError('Cannot cancel non-pending message', 400);

    await prisma.scheduledMessage.update({
      where: { id: scheduledId },
      data: { status: 'CANCELLED' },
    });

    res.json({ message: 'Scheduled message cancelled' });
  }

  // ─── Pipeline интеграция ───

  /**
   * POST /:id/add-to-pipeline — Создать deal из разговора и добавить в pipeline
   */
  static async addToPipeline(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { stageId, dealStage, stage } = req.body as { stageId?: string; dealStage?: string; stage?: string };

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { lead: true },
    });
    if (!conversation) throw new AppError('Conversation not found', 404);

    // Проверяем, нет ли уже deal для этого разговора/лида/номера клиента
    const phoneVariants = InboxController.phoneLookupVariants(conversation.lead.phone);
    const existingDeal = await prisma.deal.findFirst({
      where: {
        OR: [
          { smsConversationId: id },
          { leadId: conversation.leadId },
          ...(phoneVariants.length > 0 ? [{ client: { phone: { in: phoneVariants } } }] : []),
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    });
    if (existingDeal) {
      const updateData: { leadId?: string; smsConversationId?: string } = {};
      if (!existingDeal.leadId) {
        const alreadyLinked = await prisma.deal.findFirst({
          where: { leadId: conversation.leadId },
          select: { id: true },
        });
        if (!alreadyLinked || alreadyLinked.id === existingDeal.id) {
          updateData.leadId = conversation.leadId;
        }
      }
      if (!existingDeal.smsConversationId) {
        updateData.smsConversationId = id;
      }

      const reusedDeal =
        Object.keys(updateData).length > 0
          ? await prisma.deal.update({
              where: { id: existingDeal.id },
              data: updateData,
            })
          : existingDeal;

      res.status(200).json({ deal: reusedDeal, reused: true });
      return;
    }

    // Ищем клиента по телефону лида
    let client = await prisma.client.findFirst({
      where: {
        phone: {
          in: phoneVariants.length > 0 ? phoneVariants : [conversation.lead.phone],
        },
      },
    });

    // Если нет клиента — создаём
    if (!client) {
      client = await prisma.client.create({
        data: {
          contactName: `${conversation.lead.firstName} ${conversation.lead.lastName || ''}`.trim(),
          businessName: conversation.lead.company || conversation.lead.firstName,
          phone: conversation.lead.phone,
          email: conversation.lead.email || '',
        },
      });
    }

    const [normalizedSource, conversationNotes] = await Promise.all([
      InboxController.resolveSmsSource(id, conversation.leadId, conversation.lead.source),
      prisma.conversationNote.findMany({
        where: { conversationId: id },
        orderBy: { createdAt: 'asc' },
        select: { body: true },
      }),
    ]);

    const syncedNotes = conversationNotes
      .map((n) => (n.body || '').trim())
      .filter(Boolean)
      .join('\n')
      .trim();
    const assignedRepId = req.user!.role === 'REP' ? req.user!.id : conversation.assignedRepId || req.user!.id;
    const normalizedDealStage = InboxController.normalizeDealStage(dealStage || stage);
    const normalizedDealStageLabel = DEAL_STAGE_LABELS[normalizedDealStage] || 'New Lead';

    // Создаём deal
    const deal = await prisma.deal.create({
      data: {
        clientId: client.id,
        stage: normalizedDealStage as any,
        stageLabel: normalizedDealStageLabel,
        assignedRepId,
        createdFromSms: true,
        smsConversationId: id,
        createdByUserId: req.user!.id,
        leadId: conversation.leadId,
        clientNotes: `Source: SMS — ${normalizedSource}`,
        notes: syncedNotes ? syncedNotes.slice(0, 5000) : null,
      },
    });

    let resolvedStageId = stageId;
    if (!resolvedStageId) {
      const existingCard = await prisma.pipelineCard.findUnique({
        where: { leadId: conversation.leadId },
        select: { stageId: true },
      });
      resolvedStageId = existingCard?.stageId;
    }
    if (!resolvedStageId) {
      const defaultStage =
        (await prisma.pipelineStage.findFirst({ where: { isDefault: true }, select: { id: true } })) ||
        (await prisma.pipelineStage.findFirst({ orderBy: { order: 'asc' }, select: { id: true } }));
      if (!defaultStage) throw new AppError('No pipeline stages configured', 400);
      resolvedStageId = defaultStage.id;
    }

    // Создаём или обновляем pipeline card
    await prisma.pipelineCard.upsert({
      where: { leadId: conversation.leadId },
      create: {
        leadId: conversation.leadId,
        stageId: resolvedStageId,
      },
      update: {
        stageId: resolvedStageId,
      },
    });

    InboxController.triggerOwnerActionReclassification(req, id, 'pipeline_added', conversation.assignedRepId || null);

    res.status(201).json({ deal });
  }
}
