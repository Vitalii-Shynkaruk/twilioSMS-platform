import { Router, Response } from 'express';
import { AIService } from '../services/aiService';
import { authenticate } from '../middleware/auth';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

/**
 * POST /api/ai/draft-reply
 * Generate a draft reply for a conversation
 */
router.post(
  '/draft-reply',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { conversationId } = req.body;

    if (!conversationId) {
      res.status(400).json({ error: 'conversationId required' });
      return;
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        lead: { select: { firstName: true, lastName: true, status: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          take: 20,
          select: { direction: true, body: true },
        },
      },
    });

    if (!conversation) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }

    const draft = await AIService.generateDraftReply(
      conversation.messages.map((m) => ({ direction: m.direction, body: m.body })),
      {
        firstName: conversation.lead.firstName || undefined,
        lastName: conversation.lead.lastName || undefined,
        status: conversation.lead.status,
      },
    );

    if (!draft) {
      res.status(503).json({ error: 'AI not configured or unavailable' });
      return;
    }

    res.json({ draft });
  }),
);

/**
 * POST /api/ai/classify
 * Classify an inbound message intent
 */
router.post(
  '/classify',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { body } = req.body;
    if (!body) {
      res.status(400).json({ error: 'body required' });
      return;
    }

    const category = await AIService.classifyMessage(body);
    if (!category) {
      res.status(503).json({ error: 'AI not configured or unavailable' });
      return;
    }

    res.json({ category });
  }),
);

/**
 * POST /api/ai/score-lead
 * Score a lead
 */
router.post(
  '/score-lead',
  authenticate,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { leadId } = req.body;

    if (!leadId) {
      res.status(400).json({ error: 'leadId required' });
      return;
    }

    const lead = await prisma.lead.findUnique({
      where: { id: leadId },
      include: {
        conversations: {
          include: {
            messages: { select: { direction: true } },
          },
        },
      },
    });

    if (!lead) {
      res.status(404).json({ error: 'Lead not found' });
      return;
    }

    const allMessages = lead.conversations.flatMap((c) => c.messages);
    const messageCount = allMessages.filter((m) => m.direction === 'OUTBOUND').length;
    const repliedCount = allMessages.filter((m) => m.direction === 'INBOUND').length;

    const score = await AIService.scoreLead(
      {
        firstName: lead.firstName || undefined,
        status: lead.status,
        source: lead.source || undefined,
        createdAt: lead.createdAt,
      },
      messageCount,
      repliedCount,
    );

    if (score === null) {
      res.status(503).json({ error: 'AI not configured or unavailable' });
      return;
    }

    res.json({ score, leadId });
  }),
);

export default router;
