import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { SendingEngine } from '../services/sendingEngine';

type InboxFilter = 'all' | 'unread' | 'replied' | 'interested' | 'not_interested' | 'dnc' | 'opted_out';

export class InboxController {
  private static readonly FILTER_KEYS: InboxFilter[] = [
    'all',
    'unread',
    'replied',
    'interested',
    'not_interested',
    'dnc',
    'opted_out',
  ];

  private static buildFilterCondition(filter: InboxFilter): any | null {
    switch (filter) {
      case 'unread':
        return { unreadCount: { gt: 0 } };
      case 'replied':
        return {
          lead: {
            optedOut: false,
            lastRepliedAt: { not: null },
            status: { notIn: ['DNC', 'NOT_INTERESTED'] },
          },
        };
      case 'interested':
        return {
          lead: {
            optedOut: false,
            status: { in: ['INTERESTED', 'DOCS_REQUESTED', 'SUBMITTED', 'FUNDED'] },
          },
        };
      case 'not_interested':
        return { lead: { status: 'NOT_INTERESTED' } };
      case 'dnc':
        return { lead: { status: 'DNC' } };
      case 'opted_out':
        return { lead: { optedOut: true } };
      case 'all':
      default:
        return null;
    }
  }

  private static withConditions(baseWhere: any, extraConditions: any[]): any {
    const baseAnd = Array.isArray(baseWhere.AND) ? [...baseWhere.AND] : [];
    return {
      ...baseWhere,
      ...(baseAnd.length > 0 || extraConditions.length > 0 ? { AND: [...baseAnd, ...extraConditions] } : {}),
    };
  }

  static async listConversations(req: AuthRequest, res: Response): Promise<void> {
    const { page = '1', limit = '50', search, unreadOnly, filter = 'all', withFilterCounts = 'false' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const baseWhere: any = { isActive: true };
    const baseAndFilters: any[] = [];

    // Rep can only see their conversations
    if (req.user?.role === 'REP') {
      baseWhere.assignedRepId = req.user.id;
    }

    const normalizedFilter: InboxFilter = InboxController.FILTER_KEYS.includes((filter as string).toLowerCase() as InboxFilter)
      ? ((filter as string).toLowerCase() as InboxFilter)
      : 'all';
    const includeFilterCounts = withFilterCounts === 'true';

    const listConditions: any[] = [];
    if (unreadOnly === 'true') listConditions.push({ unreadCount: { gt: 0 } });
    const selectedFilterCondition = InboxController.buildFilterCondition(normalizedFilter);
    if (selectedFilterCondition) listConditions.push(selectedFilterCondition);

    if (search) {
      baseAndFilters.push({
        lead: {
          OR: [
            { firstName: { contains: search as string } },
            { lastName: { contains: search as string } },
            { phone: { contains: search as string } },
          ],
        },
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
        take: parseInt(limit as string),
        orderBy: { lastMessageAt: 'desc' },
        include: {
          lead: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
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
            },
          },
          assignedRep: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
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
                const condition = InboxController.buildFilterCondition(key);
                const scopedWhere = InboxController.withConditions(baseWithSearch, condition ? [condition] : []);
                const count = await prisma.conversation.count({ where: scopedWhere });
                return [key, count] as const;
              }),
            );

            return Object.fromEntries(counts);
          })()
        : Promise.resolve(null),
    ]);

    res.json({
      conversations,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
      ...(filterCounts ? { filterCounts } : {}),
    });
  }

  static async getConversation(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { page = '1', limit = '50' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

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
      },
    });

    if (!conversation) throw new AppError('Conversation not found', 404);

    const messages = await prisma.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'desc' },
      skip,
      take: parseInt(limit as string),
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

    const totalMessages = await prisma.message.count({
      where: { conversationId: id },
    });

    // Mark as read
    if (conversation.unreadCount > 0) {
      await prisma.conversation.update({
        where: { id },
        data: { unreadCount: 0 },
      });
    }

    res.json({
      conversation,
      messages: messages.reverse(), // Chronological order
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
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
        data: { leadId, isActive: true },
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

    let messageId: string;
    try {
      messageId = await SendingEngine.queueMessage({
        toNumber: conversation.lead.phone,
        body: body.trim(),
        leadId: conversation.lead.id,
        sentByUserId: req.user!.id,
        preferredNumberId: conversation.stickyNumberId || undefined,
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

    await prisma.conversation.update({
      where: { id },
      data: { assignedRepId: repId },
    });

    // Also update lead assignment
    const conversation = await prisma.conversation.findUnique({
      where: { id },
    });

    if (conversation) {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: { assignedRepId: repId },
      });
    }

    res.json({ message: 'Rep assigned' });
  }
}
