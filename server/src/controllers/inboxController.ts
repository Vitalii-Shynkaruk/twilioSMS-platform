import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { SendingEngine } from '../services/sendingEngine';
import { NumberService } from '../services/numberService';
import { ComplianceService } from '../services/complianceService';

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
type InboxSort = 'newest_activity' | 'oldest_untouched' | 'unread_first' | 'hot_first';

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
  private static readonly SORT_KEYS: InboxSort[] = ['newest_activity', 'oldest_untouched', 'unread_first', 'hot_first'];
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

  private static resolveFilter(raw: unknown): InboxFilter {
    const normalized = String(raw || 'all').toLowerCase() as InboxFilter;
    return InboxController.FILTER_KEYS.includes(normalized) ? normalized : 'all';
  }

  private static resolveSort(raw: unknown): InboxSort {
    const normalized = String(raw || 'newest_activity').toLowerCase() as InboxSort;
    return InboxController.SORT_KEYS.includes(normalized) ? normalized : 'newest_activity';
  }

  private static buildFilterCondition(filter: InboxFilter, req: AuthRequest): any | null {
    switch (filter) {
      case 'unread':
        return { unreadCount: { gt: 0 } };
      case 'hot':
        return { hotLead: true };
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
        return { nextFollowupAt: { gte: new Date() } };
      case 'in_pipeline':
        return {
          deals: {
            some: {
              createdFromSms: true,
              ...(req.user?.role === 'REP' ? { assignedRepId: req.user.id } : {}),
            },
          },
        };
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
      case 'oldest_untouched':
        return [{ lastMessageAt: 'asc' }, { updatedAt: 'asc' }];
      case 'unread_first':
        return [{ unreadCount: 'desc' }, { lastMessageAt: 'desc' }, { updatedAt: 'desc' }];
      case 'hot_first':
        return [{ hotLead: 'desc' }, { lastMessageAt: 'desc' }, { updatedAt: 'desc' }];
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
    return InboxController.OPT_OUT_KEYWORDS.map((keyword) => ({
      body: {
        contains: keyword,
      },
    }));
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

  private static withConditions(baseWhere: any, extraConditions: any[]): any {
    const baseAnd = Array.isArray(baseWhere.AND) ? [...baseWhere.AND] : [];
    return {
      ...baseWhere,
      ...(baseAnd.length > 0 || extraConditions.length > 0 ? { AND: [...baseAnd, ...extraConditions] } : {}),
    };
  }

  private static async enrichFromNumberFields<
    T extends { twilioNumber?: any; stickyNumber?: any; messages?: any[]; deals?: any[]; unreadCount?: number },
  >(
    conversations: T[],
  ): Promise<
    Array<T & { fromNumber: string; fromNumberFriendlyName: string | null; isInPipeline: boolean; unreadDot: boolean }>
  > {
    const candidateNumbers = new Set<string>();
    for (const conv of conversations) {
      const lastMessage = conv.messages?.[0];
      const derived =
        conv.twilioNumber?.phoneNumber ||
        conv.stickyNumber?.phoneNumber ||
        (lastMessage ? (lastMessage.direction === 'OUTBOUND' ? lastMessage.fromNumber : lastMessage.toNumber) : '');
      if (derived) candidateNumbers.add(derived);
    }

    const fallbackNumbers =
      candidateNumbers.size > 0
        ? await prisma.phoneNumber.findMany({
            where: { phoneNumber: { in: Array.from(candidateNumbers) } },
            select: { phoneNumber: true, friendlyName: true },
          })
        : [];
    const fallbackMap = new Map(fallbackNumbers.map((n) => [n.phoneNumber, n.friendlyName || null]));

    return conversations.map((conv) => {
      const lastMessage = conv.messages?.[0];
      const fromNumber =
        conv.twilioNumber?.phoneNumber ||
        conv.stickyNumber?.phoneNumber ||
        (lastMessage ? (lastMessage.direction === 'OUTBOUND' ? lastMessage.fromNumber : lastMessage.toNumber) : '') ||
        '';
      const fromNumberFriendlyName =
        conv.twilioNumber?.friendlyName || conv.stickyNumber?.friendlyName || fallbackMap.get(fromNumber) || null;
      const isInPipeline = (conv.deals || []).some((d: any) => d.createdFromSms);

      return {
        ...conv,
        fromNumber,
        fromNumberFriendlyName,
        isInPipeline,
        unreadDot: (conv.unreadCount || 0) > 0,
      };
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
    } = req.query;
    const parsedPage = Math.max(parseInt(page as string, 10) || 1, 1);
    const parsedLimit = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100);
    const skip = (parsedPage - 1) * parsedLimit;

    const baseWhere: any = { isActive: true };
    const baseAndFilters: any[] = [];

    // Rep can only see their conversations
    if (req.user?.role === 'REP') {
      baseWhere.assignedRepId = req.user.id;
    }

    const normalizedFilter = InboxController.resolveFilter(filter);
    const normalizedSort = InboxController.resolveSort(sort);
    const includeFilterCounts = withFilterCounts === 'true';

    const listConditions: any[] = [];
    if (unreadOnly === 'true') listConditions.push({ unreadCount: { gt: 0 } });
    if (normalizedFilter !== 'dnc') {
      listConditions.push(InboxController.excludeDncCondition());
    }
    listConditions.push(
      normalizedFilter === 'dnc' ? InboxController.inboundAnyCondition() : InboxController.inboundNonOptOutCondition(),
    );
    const selectedFilterCondition = InboxController.buildFilterCondition(normalizedFilter, req);
    if (selectedFilterCondition) listConditions.push(selectedFilterCondition);

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

    const [conversations, total, filterCounts] = await Promise.all([
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
            const baseWithSearch = {
              ...baseWhere,
              ...(baseAndFilters.length > 0 ? { AND: baseAndFilters } : {}),
            };
            const counts = await Promise.all(
              InboxController.FILTER_KEYS.map(async (key) => {
                const condition = InboxController.buildFilterCondition(key, req);
                const visibilityCondition =
                  key === 'dnc' ? InboxController.inboundAnyCondition() : InboxController.inboundNonOptOutCondition();
                const baseVisibility =
                  key === 'dnc' ? [visibilityCondition] : [InboxController.excludeDncCondition(), visibilityCondition];
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
    ]);
    const enriched = await InboxController.enrichFromNumberFields(conversations);

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
    if (req.user?.role === 'REP' && conversation.assignedRepId !== req.user.id) {
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
    const latestSmsDeal = conversation.deals.find((d) => d.createdFromSms) || conversation.deals[0] || null;
    const statusStrip = {
      hotLead: !!conversation.hotLead,
      pipelineState: latestSmsDeal ? 'in_pipeline' : 'not_in_pipeline',
      pipelineLabel: latestSmsDeal ? '→ In Pipeline' : 'Not in pipeline',
      fromNumber,
      fromNumberFriendlyName,
      assignedRep: conversation.assignedRep
        ? `${conversation.assignedRep.firstName} ${conversation.assignedRep.lastName || ''}`.trim()
        : null,
      followUpAt: conversation.nextFollowupAt,
    };

    const contactInfo = {
      email: conversation.lead.email || '',
      phone: conversation.lead.phone || '',
      company: conversation.lead.company || '',
      source: sourceName,
      product: latestSmsDeal?.productType || '',
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

    // Mark as read
    if (conversation.unreadCount > 0) {
      await prisma.conversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
    }

    res.json({
      conversation: {
        ...conversation,
        fromNumber,
        fromNumberFriendlyName,
        isInPipeline: !!latestSmsDeal,
        contactInfo,
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

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new AppError('Conversation not found', 404);

    if (conversation.unreadCount > 0) {
      await prisma.conversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
    }

    res.json({ message: 'Marked as read' });
  }

  static async markUnread(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new AppError('Conversation not found', 404);

    await prisma.conversation.update({
      where: { id },
      data: { unreadCount: Math.max(1, conversation.unreadCount || 0) },
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
    if (req.user?.role === 'REP' && conversation.assignedRepId && conversation.assignedRepId !== req.user.id) {
      throw new AppError('Not authorized to message this conversation', 403);
    }

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
        lastMessageAt: new Date(),
        lastDirection: 'outbound',
        nextFollowupAt: null,
      },
    });

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
      if (conversation.assignedRepId) {
        io.to(`inbox:${conversation.assignedRepId}`).emit('new-message', {
          conversationId: id,
        });
      }
    }

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
   * PATCH /:id/status — Обновить статус разговора (hotLead, leadStatus, emailReceived, nextFollowupAt)
   */
  static async updateConversationStatus(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { hotLead, leadStatus, emailReceived, nextFollowupAt } = req.body;

    const conversation = await prisma.conversation.findUnique({ where: { id } });
    if (!conversation) throw new AppError('Conversation not found', 404);

    const data: any = {};
    if (hotLead !== undefined) data.hotLead = hotLead;
    if (leadStatus !== undefined) data.leadStatus = leadStatus || null;
    if (emailReceived !== undefined) data.emailReceived = emailReceived;
    if (nextFollowupAt !== undefined) data.nextFollowupAt = nextFollowupAt ? new Date(nextFollowupAt) : null;

    const updated = await prisma.conversation.update({
      where: { id },
      data,
      include: {
        lead: {
          select: { id: true, firstName: true, lastName: true, phone: true, status: true },
        },
      },
    });

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

    res.json({ notes });
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

    // Проверяем, нет ли уже deal для этого разговора
    const existingDeal = await prisma.deal.findFirst({
      where: { smsConversationId: id },
    });
    if (existingDeal) throw new AppError('Deal already exists for this conversation', 409);

    // Ищем клиента по телефону лида
    let client = await prisma.client.findFirst({
      where: { phone: conversation.lead.phone },
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

    res.status(201).json({ deal });
  }
}
