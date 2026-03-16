import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { SendingEngine, campaignQueue } from '../services/sendingEngine';

export class CampaignController {

  static async list(req: AuthRequest, res: Response): Promise<void> {
    const { status, search, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.name = { contains: search as string, mode: 'insensitive' };
    }

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { leads: true } },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    res.json({
      campaigns,
      pagination: {
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        total,
        pages: Math.ceil(total / parseInt(limit as string)),
      },
    });
  }

  static async get(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: {
        leads: {
          include: {
            lead: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                phone: true,
                status: true,
              },
            },
          },
          take: 100,
        },
        numberPool: true,
      },
    });

    if (!campaign) throw new AppError('Campaign not found', 404);

    res.json({ campaign });
  }

  static async create(req: AuthRequest, res: Response): Promise<void> {
    const {
      name,
      description,
      messageTemplate,
      numberPoolId,
      sendingSpeed,
      dailyLimit,
      scheduledAt,
      leadIds,
      filterTags,
      filterStatus,
      filterSource,
      filterState,
    } = req.body;

    if (!name || !messageTemplate) {
      throw new AppError('Name and message template are required', 400);
    }

    // Create campaign
    const campaign = await prisma.campaign.create({
      data: {
        name,
        description,
        messageTemplate,
        numberPoolId,
        sendingSpeed: sendingSpeed || 60,
        dailyLimit,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        createdById: req.user!.id,
        status: scheduledAt ? 'SCHEDULED' : 'DRAFT',
      },
    });

    // Add leads to campaign
    let leadQuery: any = {
      optedOut: false,
      isSuppressed: false,
    };

    if (leadIds && leadIds.length > 0) {
      leadQuery.id = { in: leadIds };
    } else {
      if (filterTags && filterTags.length > 0) {
        leadQuery.tags = {
          some: { tagId: { in: filterTags } },
        };
      }
      if (filterStatus && filterStatus.length > 0) {
        leadQuery.status = { in: filterStatus };
      }
      if (filterSource) {
        leadQuery.source = filterSource;
      }
      if (filterState) {
        leadQuery.state = filterState;
      }
    }

    const leads = await prisma.lead.findMany({
      where: leadQuery,
      select: { id: true },
    });

    if (leads.length > 0) {
      await prisma.campaignLead.createMany({
        data: leads.map((lead) => ({
          campaignId: campaign.id,
          leadId: lead.id,
          status: 'PENDING',
        })),
        skipDuplicates: true,
      });

      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { totalLeads: leads.length },
      });
    }

    res.status(201).json({
      campaign: {
        ...campaign,
        totalLeads: leads.length,
      },
    });
  }

  static async update(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, description, messageTemplate, numberPoolId, sendingSpeed, scheduledAt } = req.body;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    if (!['DRAFT', 'SCHEDULED'].includes(campaign.status)) {
      throw new AppError('Can only edit draft or scheduled campaigns', 400);
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(messageTemplate && { messageTemplate }),
        ...(numberPoolId && { numberPoolId }),
        ...(sendingSpeed && { sendingSpeed }),
        ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
      },
    });

    res.json({ campaign: updated });
  }

  static async start(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
      throw new AppError('Campaign cannot be started in current status', 400);
    }

    // Add to processing queue
    await campaignQueue.add('campaign-start', {
      action: 'start',
      campaignId: id,
    });

    res.json({ message: 'Campaign queued for sending' });
  }

  static async pause(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    await prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });

    res.json({ message: 'Campaign paused' });
  }

  static async cancel(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    await prisma.campaign.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });

    // Cancel pending campaign leads
    await prisma.campaignLead.updateMany({
      where: { campaignId: id, status: 'PENDING' },
      data: { status: 'SKIPPED' },
    });

    res.json({ message: 'Campaign cancelled' });
  }

  static async getAnalytics(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        status: true,
        totalLeads: true,
        totalSent: true,
        totalDelivered: true,
        totalFailed: true,
        totalBlocked: true,
        totalReplied: true,
        totalOptedOut: true,
        startedAt: true,
        completedAt: true,
      },
    });

    if (!campaign) throw new AppError('Campaign not found', 404);

    // Lead status breakdown
    const leadStatuses = await prisma.campaignLead.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    });

    res.json({
      campaign,
      leadStatuses: leadStatuses.map((s) => ({
        status: s.status,
        count: s._count,
      })),
      deliveryRate: campaign.totalSent > 0
        ? ((campaign.totalDelivered / campaign.totalSent) * 100).toFixed(1)
        : '0',
      replyRate: campaign.totalDelivered > 0
        ? ((campaign.totalReplied / campaign.totalDelivered) * 100).toFixed(1)
        : '0',
    });
  }

  static async delete(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);

    // Cannot delete active campaigns
    if (campaign.status === 'SENDING') {
      throw new AppError('Cannot delete an active campaign. Pause or cancel it first.', 400);
    }

    await prisma.$transaction([
      prisma.campaignLead.deleteMany({ where: { campaignId: id } }),
      prisma.campaign.delete({ where: { id } }),
    ]);

    res.json({ message: 'Campaign deleted successfully' });
  }
}
