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

    const normalizedFilter: InboxFilter = InboxController.FILTER_KEYS.includes(
      (filter as string).toLowerCase() as InboxFilter,
    )
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

    // Если DNC — обновляем lead.status
    if (leadStatus === 'DNC') {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: { status: 'DNC' },
      });
    } else if (leadStatus === 'Interested') {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: { status: 'INTERESTED' },
      });
    } else if (leadStatus === 'Not Interested') {
      await prisma.lead.update({
        where: { id: conversation.leadId },
        data: { status: 'NOT_INTERESTED' },
      });
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

    const note = await prisma.conversationNote.create({
      data: {
        conversationId: id,
        body,
        dealId: dealId || null,
        createdById: req.user!.id,
      },
    });

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
    const { search, category } = req.query;
    const userId = req.user!.id;

    const where: any = {
      isActive: true,
      OR: [{ visibility: 'GLOBAL' }, { visibility: 'TEAM' }, { createdById: userId, visibility: 'PRIVATE' }],
    };

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
      orderBy: { usageCount: 'desc' },
      include: {
        favorites: {
          where: { userId },
          select: { id: true },
        },
      },
    });

    // Добавляем флаг isFavorite
    const result = templates.map((t) => ({
      ...t,
      isFavorite: t.favorites.length > 0,
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

    // Только автор или админ может редактировать
    if (existing.createdById !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403);
    }

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

    if (existing.createdById !== req.user!.id && req.user!.role !== 'ADMIN') {
      throw new AppError('Not authorized', 403);
    }

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
    const { conversationId, body, scheduledAt, fromNumber } = req.body;

    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
    if (!conversation) throw new AppError('Conversation not found', 404);

    const scheduledDate = new Date(scheduledAt);
    if (scheduledDate <= new Date()) {
      throw new AppError('Scheduled time must be in the future', 400);
    }

    const scheduled = await prisma.scheduledMessage.create({
      data: {
        conversationId,
        body,
        scheduledAt: scheduledDate,
        fromNumber,
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
    const { stageId } = req.body;

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

    // Проверяем что есть client для этого лида
    let client = await prisma.client.findFirst({
      where: { linkedLeadId: conversation.leadId },
    });

    // Если нет клиента — создаём
    if (!client) {
      client = await prisma.client.create({
        data: {
          contactName: `${conversation.lead.firstName} ${conversation.lead.lastName || ''}`.trim(),
          businessName: conversation.lead.company || conversation.lead.firstName,
          phone: conversation.lead.phone,
          email: conversation.lead.email || '',
          linkedLeadId: conversation.leadId,
          createdById: req.user!.id,
        },
      });
    }

    // Создаём deal
    const deal = await prisma.deal.create({
      data: {
        clientId: client.id,
        stageId,
        createdById: req.user!.id,
        assignedRepId: conversation.assignedRepId || req.user!.id,
        createdFromSms: true,
        smsConversationId: id,
        clientNotes: `Source: SMS — Inbox`,
      },
    });

    // Создаём pipeline card
    await prisma.pipelineCard.create({
      data: {
        leadId: conversation.leadId,
        stageId,
      },
    });

    res.status(201).json({ deal });
  }
}
