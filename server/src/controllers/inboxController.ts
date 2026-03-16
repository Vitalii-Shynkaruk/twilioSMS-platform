import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { SendingEngine } from '../services/sendingEngine';

export class InboxController {

  static async listConversations(req: AuthRequest, res: Response): Promise<void> {
    const { page = '1', limit = '50', search, unreadOnly } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = { isActive: true };

    // Rep can only see their conversations
    if (req.user?.role === 'REP') {
      where.assignedRepId = req.user.id;
    }

    if (unreadOnly === 'true') {
      where.unreadCount = { gt: 0 };
    }

    if (search) {
      where.lead = {
        OR: [
          { firstName: { contains: search as string, mode: 'insensitive' } },
          { lastName: { contains: search as string, mode: 'insensitive' } },
          { phone: { contains: search as string } },
        ],
      };
    }

    const [conversations, total] = await Promise.all([
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
    ]);

    res.json({
      conversations,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
      },
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

    const messageId = await SendingEngine.queueMessage({
      toNumber: conversation.lead.phone,
      body: body.trim(),
      leadId: conversation.lead.id,
      sentByUserId: req.user!.id,
      preferredNumberId: conversation.stickyNumberId || undefined,
      priority: 10, // High priority for manual replies
    });

    // Update conversation
    await prisma.conversation.update({
      where: { id },
      data: {
        lastMessageAt: new Date(),
        lastDirection: 'outbound',
      },
    });

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
