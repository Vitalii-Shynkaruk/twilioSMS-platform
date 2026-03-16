import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { WebhookService } from '../services/webhookService';

export class PipelineController {

  static async getStages(req: AuthRequest, res: Response): Promise<void> {
    const cardsPerStage = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const cardPage = Math.max(0, parseInt(req.query.offset as string) || 0);

    const stages = await prisma.pipelineStage.findMany({
      orderBy: { order: 'asc' },
      include: {
        cards: {
          include: {
            lead: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                status: true,
                company: true,
                notes: true,
                lastContactedAt: true,
                lastRepliedAt: true,
                assignedRep: {
                  select: { id: true, firstName: true, lastName: true },
                },
                tags: {
                  include: { tag: true },
                },
              },
            },
          },
          orderBy: { position: 'asc' },
          take: cardsPerStage,
          skip: cardPage,
        },
        _count: { select: { cards: true } },
      },
    });

    res.json({ stages });
  }

  static async createStage(req: AuthRequest, res: Response): Promise<void> {
    const { name, color, mappedStatus } = req.body;

    if (!name) throw new AppError('Stage name is required', 400);

    const maxOrder = await prisma.pipelineStage.findFirst({
      orderBy: { order: 'desc' },
      select: { order: true },
    });

    const stage = await prisma.pipelineStage.create({
      data: {
        name,
        color: color || '#6366f1',
        order: (maxOrder?.order || 0) + 1,
        mappedStatus: mappedStatus || null,
      },
    });

    res.status(201).json({ stage });
  }

  static async updateStage(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, color, order, mappedStatus } = req.body;

    const stage = await prisma.pipelineStage.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(color && { color }),
        ...(order !== undefined && { order }),
        ...(mappedStatus !== undefined && { mappedStatus: mappedStatus || null }),
      },
    });

    res.json({ stage });
  }

  static async deleteStage(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    // Move cards to first stage
    const firstStage = await prisma.pipelineStage.findFirst({
      where: { id: { not: id } },
      orderBy: { order: 'asc' },
    });

    if (firstStage) {
      await prisma.pipelineCard.updateMany({
        where: { stageId: id },
        data: { stageId: firstStage.id },
      });
    }

    await prisma.pipelineStage.delete({ where: { id } });

    res.json({ message: 'Stage deleted' });
  }

  static async moveCard(req: AuthRequest, res: Response): Promise<void> {
    const { cardId } = req.params;
    const { stageId, position } = req.body;

    // Get previous stage before moving
    const prevCard = await prisma.pipelineCard.findUnique({
      where: { id: cardId },
      include: { stage: true },
    });
    const fromStageName = prevCard?.stage?.name || 'Unknown';

    const card = await prisma.pipelineCard.update({
      where: { id: cardId },
      data: {
        stageId,
        position: position || 0,
      },
      include: {
        stage: true,
        lead: true,
      },
    });

    // Fire webhook on stage change
    if (fromStageName !== card.stage.name) {
      WebhookService.onStageChange({
        leadId: card.leadId,
        fromStage: fromStageName,
        toStage: card.stage.name,
      }).catch(() => {}); // fire and forget
    }

    // Update lead status based on pipeline stage mapped status
    if (card.stage.mappedStatus && card.lead) {
      await prisma.lead.update({
        where: { id: card.leadId },
        data: { status: card.stage.mappedStatus },
      });
    }

    res.json({ card });
  }

  static async reorderStages(req: AuthRequest, res: Response): Promise<void> {
    const { stageOrder } = req.body; // [{ id, order }]

    // Use transaction for atomic reorder
    await prisma.$transaction(
      stageOrder.map((item: { id: string; order: number }) =>
        prisma.pipelineStage.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    );

    res.json({ message: 'Stages reordered' });
  }
}
