import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { DealStage, ProductType, CommitSubStatus, RenewalTaskStatus } from '@prisma/client';
import { parse } from 'csv-parse/sync';

// Stage label mapping (exact names from spec)
const STAGE_LABELS: Record<DealStage, string> = {
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

const STAGE_ORDER: DealStage[] = [
  DealStage.NEW_LEAD,
  DealStage.ENGAGED_INTERESTED,
  DealStage.QUALIFIED,
  DealStage.SUBMITTED_IN_REVIEW,
  DealStage.APPROVED_OFFERS,
  DealStage.COMMITTED_FUNDING,
  DealStage.FUNDED,
  DealStage.NURTURE,
  DealStage.CLOSED,
];

// Helper: rep filter for data isolation
function repFilter(user: AuthRequest['user']) {
  if (user?.role === 'ADMIN') return {};
  return { assignedRepId: user!.id };
}

// Helper: compute HOT status (never stored)
function computeIsHot(deal: {
  lastReplyAt: Date | null;
  stage: DealStage;
  lenderEngaged: boolean;
  appSubmitted: boolean;
}): boolean {
  const now = Date.now();
  const fortyEightHours = 48 * 60 * 60 * 1000;
  if (deal.lastReplyAt && now - new Date(deal.lastReplyAt).getTime() < fortyEightHours) return true;
  if (deal.stage === DealStage.APPROVED_OFFERS || deal.stage === DealStage.COMMITTED_FUNDING) return true;
  if (deal.lenderEngaged && deal.appSubmitted) return true;
  return false;
}

export class DealController {
  // GET /api/deals - List all deals with pipeline board data
  static async getDeals(req: AuthRequest, res: Response) {
    const { stage, search, repId, view } = req.query;
    const filter = repFilter(req.user);

    const where: any = {
      ...filter,
    };

    // Admin can view specific rep's deals
    if (req.user?.role === 'ADMIN' && repId) {
      where.assignedRepId = repId as string;
    }

    if (stage) {
      where.stage = stage as DealStage;
    }

    if (search) {
      where.OR = [
        { client: { businessName: { contains: search as string } } },
        { client: { contactName: { contains: search as string } } },
        { client: { phone: { contains: search as string } } },
      ];
    }

    // Team View: only certain stages, no contact info
    if (view === 'team') {
      where.stage = {
        in: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING, DealStage.FUNDED, DealStage.NURTURE],
      };
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        client: true,
        assignedRep: {
          select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true, role: true },
        },
        offers: { orderBy: { createdAt: 'desc' } },
        _count: { select: { dealEvents: true, fundingEvents: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    // Compute HOT flag for each deal
    const enrichedDeals = deals.map((deal) => ({
      ...deal,
      isHot: computeIsHot(deal),
      stageLabel: STAGE_LABELS[deal.stage] || deal.stage,
    }));

    res.json(enrichedDeals);
  }

  // GET /api/deals/board - Pipeline board data grouped by stage
  static async getBoard(req: AuthRequest, res: Response) {
    const filter = repFilter(req.user);
    const { repId } = req.query;

    const where: any = { ...filter };
    if (req.user?.role === 'ADMIN' && repId) {
      where.assignedRepId = repId as string;
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        client: true,
        assignedRep: {
          select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true, role: true },
        },
        offers: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    // Group by stage
    const board: Record<string, any[]> = {};
    for (const stage of STAGE_ORDER) {
      board[stage] = [];
    }

    for (const deal of deals) {
      const enriched = {
        ...deal,
        isHot: computeIsHot(deal),
        stageLabel: STAGE_LABELS[deal.stage] || deal.stage,
      };
      if (board[deal.stage]) {
        board[deal.stage].push(enriched);
      }
    }

    // Stage metadata
    const stages = STAGE_ORDER.map((stage, index) => {
      const deals = board[stage] || [];
      return {
        stage,
        label: STAGE_LABELS[stage],
        order: index,
        deals,
        count: deals.length,
        value: deals.reduce((sum: number, d: any) => sum + (d.dealAmount || 0), 0),
      };
    });

    res.json({ stages });
  }

  // GET /api/deals/:id - Single deal with full details
  static async getDeal(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const filter = repFilter(req.user);

    const deal = await prisma.deal.findFirst({
      where: { id, ...filter },
      include: {
        client: true,
        assignedRep: {
          select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true, role: true },
        },
        offers: { orderBy: { createdAt: 'desc' } },
        fundingEvents: { orderBy: { createdAt: 'desc' } },
        dealEvents: {
          orderBy: { createdAt: 'desc' },
          take: 50,
          include: { rep: { select: { id: true, firstName: true, lastName: true, initials: true } } },
        },
        renewalTasks: { orderBy: { dueDate: 'asc' } },
      },
    });

    if (!deal) {
      return res.status(404).json({ error: 'Deal not found' });
    }

    // Also check assisting reps access
    if (req.user?.role !== 'ADMIN' && deal.assignedRepId !== req.user?.id) {
      const assistingIds = (deal.assistingRepIds as string[]) || [];
      if (!assistingIds.includes(req.user!.id)) {
        return res.status(404).json({ error: 'Deal not found' });
      }
    }

    res.json({
      ...deal,
      isHot: computeIsHot(deal),
      stageLabel: STAGE_LABELS[deal.stage] || deal.stage,
    });
  }

  // POST /api/deals - Create a new deal
  static async createDeal(req: AuthRequest, res: Response) {
    const {
      businessName,
      contactName,
      phone,
      email,
      state,
      productType,
      dealAmount,
      assignedRepId,
      nextAction,
      nextActionDue,
    } = req.body;

    // Create or connect client
    let client;
    if (phone) {
      client = await prisma.client.upsert({
        where: { phone },
        update: { businessName: businessName || undefined, contactName, email, state },
        create: { businessName: businessName || 'Unknown Business', contactName, phone, email, state },
      });
    } else {
      client = await prisma.client.create({
        data: { businessName: businessName || 'Unknown Business', contactName, email, state },
      });
    }

    const deal = await prisma.deal.create({
      data: {
        clientId: client.id,
        assignedRepId: assignedRepId || req.user!.id,
        stage: DealStage.NEW_LEAD,
        stageLabel: STAGE_LABELS[DealStage.NEW_LEAD],
        productType: productType || null,
        dealAmount: dealAmount ? parseFloat(dealAmount) : null,
        needsAmount: !dealAmount,
        nextAction: nextAction || 'Make first contact within 24h',
        nextActionDue: nextActionDue ? new Date(nextActionDue) : new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
      include: { client: true, assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } } },
    });

    // Log event
    await prisma.dealEvent.create({
      data: {
        dealId: deal.id,
        repId: req.user!.id,
        eventType: 'deal_created',
        toStage: DealStage.NEW_LEAD,
        note: `Deal created for ${client.businessName}`,
      },
    });

    // Emit real-time update
    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: deal.id, stage: deal.stage });

    res.status(201).json(deal);
  }

  // PUT /api/deals/:id - Update deal
  static async updateDeal(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const updateData = { ...req.body };

    const existing = await prisma.deal.findUnique({ where: { id }, include: { client: true } });
    if (!existing) return res.status(404).json({ error: 'Deal not found' });

    // Rule #9: Closed deals locked — only admin can edit
    if (existing.stage === DealStage.CLOSED && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Closed deals are locked. Ask an admin to unlock.' });
    }

    // Permission check
    if (req.user?.role !== 'ADMIN') {
      const assistingIds = (existing.assistingRepIds as string[]) || [];
      if (existing.assignedRepId !== req.user?.id && !assistingIds.includes(req.user!.id)) {
        return res.status(403).json({ error: 'Access denied' });
      }
      // Reps cannot change ownership
      delete updateData.assignedRepId;
      delete updateData.assistingRepIds;
    }

    // AUTOMATION RULE 1: App Submitted → Submitted (In Review)
    if (updateData.appSubmitted === true && !existing.appSubmitted) {
      updateData.stage = DealStage.SUBMITTED_IN_REVIEW;
      updateData.stageLabel = STAGE_LABELS[DealStage.SUBMITTED_IN_REVIEW];
      updateData.daysInStage = 0;
      updateData.nextAction = 'Follow up lender — app in review';

      await prisma.dealEvent.create({
        data: {
          dealId: id,
          repId: req.user!.id,
          eventType: 'stage_change',
          fromStage: existing.stage,
          toStage: DealStage.SUBMITTED_IN_REVIEW,
          note: 'Auto-moved: app submitted',
        },
      });
    }

    // AUTOMATION RULE 3: Client Accepted Terms → Committed (Funding)
    if (updateData.stage === DealStage.COMMITTED_FUNDING && existing.stage === DealStage.APPROVED_OFFERS) {
      updateData.stageLabel = STAGE_LABELS[DealStage.COMMITTED_FUNDING];
      updateData.commitSubStatus = CommitSubStatus.DOCS_REQUESTED;
      updateData.daysInSubStatus = 0;
      updateData.nextAction = 'Send doc checklist to client';

      await prisma.dealEvent.create({
        data: {
          dealId: id,
          repId: req.user!.id,
          eventType: 'stage_change',
          fromStage: DealStage.APPROVED_OFFERS,
          toStage: DealStage.COMMITTED_FUNDING,
          note: 'Client accepted terms',
        },
      });
    }

    // Stage label sync
    if (updateData.stage && updateData.stage !== existing.stage) {
      updateData.stageLabel = STAGE_LABELS[updateData.stage as DealStage] || updateData.stage;
      if (!updateData.daysInStage && updateData.daysInStage !== 0) {
        updateData.daysInStage = 0;
      }

      // Log stage change if not already logged above
      if (updateData.stage !== DealStage.SUBMITTED_IN_REVIEW && updateData.stage !== DealStage.COMMITTED_FUNDING) {
        await prisma.dealEvent.create({
          data: {
            dealId: id,
            repId: req.user!.id,
            eventType: 'stage_change',
            fromStage: existing.stage,
            toStage: updateData.stage,
            note: `Stage changed to ${STAGE_LABELS[updateData.stage as DealStage] || updateData.stage}`,
          },
        });
      }
    }

    // Update last activity
    updateData.lastActivityAt = new Date();

    // Clean up fields that aren't in the model
    delete updateData.id;
    delete updateData.createdAt;
    delete updateData.client;
    delete updateData.assignedRep;
    delete updateData.offers;
    delete updateData.fundingEvents;
    delete updateData.dealEvents;
    delete updateData.renewalTasks;
    delete updateData.isHot;

    const deal = await prisma.deal.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true } },
      },
    });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: deal.id, stage: deal.stage, repId: deal.assignedRepId });

    res.json({ ...deal, isHot: computeIsHot(deal), stageLabel: STAGE_LABELS[deal.stage] });
  }

  // PUT /api/deals/:id/move - Move deal to a different stage (drag and drop)
  static async moveDeal(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { stage } = req.body;

    if (!stage || !STAGE_ORDER.includes(stage as DealStage)) {
      return res.status(400).json({ error: 'Invalid stage' });
    }

    const existing = await prisma.deal.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ error: 'Deal not found' });

    // Rule #9: Closed deals locked — only admin can move
    if (existing.stage === DealStage.CLOSED && req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Closed deals are locked. Ask an admin to unlock.' });
    }

    // Nurture requires lost reason + follow-up date
    if (stage === 'NURTURE' && (!req.body.lostReason || !req.body.followUpDate)) {
      return res.status(400).json({ error: 'Nurture stage requires lost reason and follow-up date' });
    }

    // Closed requires disqualification reason
    if (stage === 'CLOSED' && !req.body.disqualReason) {
      return res.status(400).json({ error: 'Closed stage requires disqualification reason' });
    }

    const updateData: any = {
      stage: stage as DealStage,
      stageLabel: STAGE_LABELS[stage as DealStage],
      daysInStage: 0,
      lastActivityAt: new Date(),
    };

    if (req.body.lostReason) updateData.lostReason = req.body.lostReason;
    if (req.body.disqualReason) updateData.disqualReason = req.body.disqualReason;
    if (req.body.followUpDate) updateData.followUpDate = new Date(req.body.followUpDate);
    if (req.body.followUpType) updateData.followUpType = req.body.followUpType;
    if (req.body.followUpNote) updateData.followUpNote = req.body.followUpNote;

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'stage_change',
        fromStage: existing.stage,
        toStage: stage,
        note: `Moved to ${STAGE_LABELS[stage as DealStage]}`,
      },
    });

    const deal = await prisma.deal.update({
      where: { id },
      data: updateData,
      include: {
        client: true,
        assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true } },
      },
    });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: deal.id, stage: deal.stage, repId: deal.assignedRepId });

    res.json({ ...deal, isHot: computeIsHot(deal), stageLabel: STAGE_LABELS[deal.stage] });
  }

  // POST /api/deals/:id/offers - Add an offer (AUTOMATION RULE 2)
  static async addOffer(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { lenderName, amount, terms, expiryDays, productType } = req.body;

    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const offer = await prisma.offer.create({
      data: {
        dealId: id,
        lenderName,
        amount: parseFloat(amount),
        terms,
        expiryDays: expiryDays ? parseInt(expiryDays) : null,
        productType: productType || deal.productType,
      },
    });

    // AUTOMATION RULE 2: Offer Added → Approved / Offers
    const updateData: any = {
      stage: DealStage.APPROVED_OFFERS,
      stageLabel: STAGE_LABELS[DealStage.APPROVED_OFFERS],
      appSubmitted: true,
      daysInStage: 0,
      nextAction: 'Call client — present offer now',
      nextActionDue: new Date(),
      lastActivityAt: new Date(),
      dealAmount: parseFloat(amount),
    };

    await prisma.dealEvent.create({
      data: { dealId: id, repId: req.user!.id, eventType: 'offer_added', note: `Offer from ${lenderName}: $${amount}` },
    });

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'stage_change',
        fromStage: deal.stage,
        toStage: DealStage.APPROVED_OFFERS,
        note: 'Auto-moved: offer added',
      },
    });

    await prisma.deal.update({ where: { id }, data: updateData });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: id, stage: DealStage.APPROVED_OFFERS, repId: deal.assignedRepId });

    res.status(201).json(offer);
  }

  // POST /api/deals/:id/fund - Mark as Funded (AUTOMATION RULE 4)
  static async markFunded(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { amountFunded, lender, notes, productType, fundedDate } = req.body;

    const deal = await prisma.deal.findUnique({ where: { id }, include: { client: true } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    const amount = parseFloat(amountFunded);
    const fDate = fundedDate ? new Date(fundedDate) : new Date();

    // Calculate cycle time
    let cycleTime: number | null = null;
    if (deal.appSubmitted && deal.createdAt) {
      cycleTime = Math.ceil((fDate.getTime() - new Date(deal.createdAt).getTime()) / (1000 * 60 * 60 * 24));
    }

    // Create funding event
    const fundingEvent = await prisma.fundingEvent.create({
      data: {
        dealId: id,
        repId: deal.assignedRepId,
        amountFunded: amount,
        lender: lender || deal.lender,
        productType: (productType || deal.productType) as ProductType | null,
        fundedDate: fDate,
        notes,
      },
    });

    // Create 3 renewal tasks
    const renewalTaskDates = [
      { taskType: '35d_checkin', dueDate: new Date(fDate.getTime() + 35 * 24 * 60 * 60 * 1000) },
      { taskType: 'midpoint', dueDate: new Date(fDate.getTime() + 90 * 24 * 60 * 60 * 1000) },
      { taskType: 'payoff_30d', dueDate: new Date(fDate.getTime() + 150 * 24 * 60 * 60 * 1000) },
    ];

    await prisma.renewalTask.createMany({
      data: renewalTaskDates.map((t) => ({
        dealId: id,
        repId: deal.assignedRepId,
        taskType: t.taskType,
        dueDate: t.dueDate,
      })),
    });

    // Update deal to Funded
    await prisma.deal.update({
      where: { id },
      data: {
        stage: DealStage.FUNDED,
        stageLabel: STAGE_LABELS[DealStage.FUNDED],
        fundedDate: fDate,
        cycleTime,
        dealAmount: amount,
        lastActivityAt: new Date(),
        daysInStage: 0,
      },
    });

    // Update client totals
    await prisma.client.update({
      where: { id: deal.clientId },
      data: {
        totalFunded: { increment: amount },
        fundingCount: { increment: 1 },
        lastFundedDate: fDate,
      },
    });

    // Log events
    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'funded',
        note: `Deal funded: $${amount.toLocaleString()} via ${lender || 'N/A'}`,
      },
    });

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'stage_change',
        fromStage: deal.stage,
        toStage: DealStage.FUNDED,
        note: 'Marked as funded',
      },
    });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: id, stage: DealStage.FUNDED, repId: deal.assignedRepId });

    res.json({ fundingEvent, message: 'Deal marked as funded, 3 renewal tasks created' });
  }

  // POST /api/deals/:id/complete-action - Complete Action modal (2-step)
  static async completeAction(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { actionType, nextAction, nextActionDue, note } = req.body;

    if (!actionType) return res.status(400).json({ error: 'Action type is required' });
    if (!nextAction) return res.status(400).json({ error: 'Next action is required' });
    if (!nextActionDue) return res.status(400).json({ error: 'Next action due date is required' });

    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    // Log completed action
    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'action_completed',
        note: `${actionType}${note ? ' — ' + note : ''} → Next: ${nextAction}`,
        metadata: { actionType, nextAction, nextActionDue },
      },
    });

    // Update deal
    const updated = await prisma.deal.update({
      where: { id },
      data: {
        lastActivityAt: new Date(),
        nextAction,
        nextActionDue: new Date(nextActionDue),
        staleDays: 0,
      },
      include: { client: true, assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } } },
    });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: id, stage: deal.stage, repId: deal.assignedRepId });

    res.json(updated);
  }

  // POST /api/deals/:id/share - Share deal with assisting rep(s)
  static async shareDeal(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { assistingRepIds } = req.body;

    // Only admin or primary rep can share
    const deal = await prisma.deal.findUnique({ where: { id } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    if (req.user?.role !== 'ADMIN' && deal.assignedRepId !== req.user?.id) {
      return res.status(403).json({ error: 'Only the primary rep or admin can share deals' });
    }

    const updated = await prisma.deal.update({
      where: { id },
      data: { assistingRepIds: assistingRepIds || [] },
    });

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'deal_shared',
        note: `Deal shared with ${(assistingRepIds || []).length} rep(s)`,
      },
    });

    const io = (req.app as any).io;
    if (io) io.emit('deal:updated', { dealId: id, stage: deal.stage });

    res.json(updated);
  }

  // POST /api/deals/:id/log-call - Log a call
  static async logCall(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const deal = await prisma.deal.findUnique({ where: { id }, include: { client: true } });
    if (!deal) return res.status(404).json({ error: 'Deal not found' });

    await prisma.dealEvent.create({
      data: {
        dealId: id,
        repId: req.user!.id,
        eventType: 'call_logged',
        note: `Call initiated to ${deal.client.businessName}`,
      },
    });

    await prisma.deal.update({ where: { id }, data: { lastActivityAt: new Date(), staleDays: 0 } });

    res.json({ phoneNumber: deal.client.phone, message: 'Call logged' });
  }

  // GET /api/deals/stats - Bottom stats bar data
  static async getStats(req: AuthRequest, res: Response) {
    const filter = repFilter(req.user);
    const { repId } = req.query;

    const where: any = { ...filter };
    if (req.user?.role === 'ADMIN' && repId) {
      where.assignedRepId = repId as string;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [deals, fundedMTD, allDeals] = await Promise.all([
      // Active pipeline deals
      prisma.deal.findMany({
        where: { ...where, stage: { in: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING] } },
        select: { dealAmount: true, stage: true, nextActionDue: true, nextAction: true, lastActivityAt: true },
      }),
      // Funded MTD
      prisma.fundingEvent.aggregate({
        where: { ...(where.assignedRepId ? { repId: where.assignedRepId } : {}), fundedDate: { gte: startOfMonth } },
        _sum: { amountFunded: true },
      }),
      // All active deals for counts
      prisma.deal.findMany({
        where: { ...where, stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] } },
        select: {
          lastReplyAt: true,
          stage: true,
          lenderEngaged: true,
          appSubmitted: true,
          nextAction: true,
          nextActionDue: true,
          followUpDate: true,
          dealAmount: true,
          lastActivityAt: true,
          prevOffer: true,
        },
      }),
    ]);

    // Lifetime Funded
    const lifetimeFunded = await prisma.fundingEvent.aggregate({
      where: where.assignedRepId ? { repId: where.assignedRepId } : {},
      _sum: { amountFunded: true },
    });

    // Active Pipeline $ = Approved + Committed only
    const activePipeline = deals.reduce((sum, d) => sum + (d.dealAmount || 0), 0);

    // At Risk $ = Approved + Committed with overdue/stalled
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const atRisk = deals
      .filter(
        (d) =>
          (d.nextActionDue && new Date(d.nextActionDue) < now) ||
          !d.nextAction ||
          (d.lastActivityAt && new Date(d.lastActivityAt) < fortyEightHoursAgo),
      )
      .reduce((sum, d) => sum + (d.dealAmount || 0), 0);

    // Hot count
    const hotCount = allDeals.filter((d) => computeIsHot(d)).length;

    // No next action count
    const noNextAction = allDeals.filter((d) => !d.nextAction).length;

    // Queue today
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const queueToday = allDeals.filter((d) => d.followUpDate && new Date(d.followUpDate) <= tomorrow).length;

    // Pipeline Value = Approved + Committed + Nurture (prevOffer > 0)
    const pipelineValue = deals.reduce((sum, d) => sum + (d.dealAmount || 0), 0);
    const nurtureDeals = await prisma.deal.findMany({
      where: { ...where, stage: DealStage.NURTURE, prevOffer: { gt: 0 } },
      select: { prevOffer: true },
    });
    const nurtureValue = nurtureDeals.reduce((sum, d) => sum + (d.prevOffer || 0), 0);

    // Renewal tasks due
    const renewalsDue = await prisma.renewalTask.count({
      where: {
        ...(where.assignedRepId ? { repId: where.assignedRepId } : {}),
        status: { in: [RenewalTaskStatus.PENDING, RenewalTaskStatus.OVERDUE] },
        dueDate: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
      },
    });

    // Committed $
    const committedValue = deals
      .filter((d) => d.stage === DealStage.COMMITTED_FUNDING)
      .reduce((sum, d) => sum + (d.dealAmount || 0), 0);

    res.json({
      activePipeline,
      activeCount: deals.length,
      fundedMTD: fundedMTD._sum.amountFunded || 0,
      lifetimeFunded: lifetimeFunded._sum.amountFunded || 0,
      atRisk,
      hotCount,
      noNextAction,
      queueToday,
      pipelineValue: pipelineValue + nurtureValue,
      renewalsDue,
      committedValue,
    });
  }

  // GET /api/deals/revive-queue - Revive/Renewal Queue
  static async getReviveQueue(req: AuthRequest, res: Response) {
    const filter = repFilter(req.user);
    const now = new Date();

    const deals = await prisma.deal.findMany({
      where: {
        ...filter,
        followUpDate: { lte: now },
        stage: { notIn: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING, DealStage.CLOSED] },
      },
      include: {
        client: true,
        assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true } },
      },
      orderBy: { followUpDate: 'asc' },
    });

    res.json(deals);
  }

  // POST /api/deals/import-csv - Import historical funded deals from CSV (admin only)
  static async importCSV(req: AuthRequest, res: Response) {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'CSV file is required' });
    }

    const csvContent = req.file.buffer.toString('utf-8');
    const records = parse(csvContent, { columns: true, skip_empty_lines: true, trim: true });

    // Load reps for initials matching
    const reps = await prisma.user.findMany({ select: { id: true, firstName: true, lastName: true, initials: true } });

    const batchId = `import_${Date.now()}`;
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (const row of records) {
      const businessName = row.business_name || row.BusinessName || row.company || '';
      const repName = row.rep_name || row.RepName || row.rep || row.originator || '';
      const productRaw = (row.product_type || row.ProductType || row.product || '').toUpperCase();
      const amountStr = (row.funded_amount || row.FundedAmount || row.amount || '0').replace(/[$,]/g, '');
      const dateStr = row.funded_date || row.FundedDate || row.date || '';

      if (!businessName) {
        skipped++;
        errors.push('Row missing business_name');
        continue;
      }

      const amount = parseFloat(amountStr) || 0;
      const fundedDate = dateStr ? new Date(dateStr) : new Date();
      if (isNaN(fundedDate.getTime())) {
        skipped++;
        errors.push(`Invalid date: ${dateStr}`);
        continue;
      }

      // Match rep by initials or partial name
      const repMatch = reps.find(
        (r) =>
          r.initials?.toLowerCase() === repName.toLowerCase() ||
          `${r.firstName} ${r.lastName}`.toLowerCase().includes(repName.toLowerCase()) ||
          repName.toLowerCase().includes((r.initials || '').toLowerCase()),
      );
      const repId = repMatch?.id || req.user!.id;

      // Map product type
      const productMap: Record<string, ProductType> = {
        MCA: ProductType.MCA,
        LOC: ProductType.LOC,
        EQUIPMENT: ProductType.EQUIPMENT,
        HELOC: ProductType.HELOC,
        SBA: ProductType.SBA,
        CRE: ProductType.CRE,
        BRIDGE: ProductType.BRIDGE,
      };
      const productType = productMap[productRaw] || null;

      try {
        // Upsert client
        const client = await prisma.client.create({
          data: {
            businessName,
            contactName: row.contact_name || row.ContactName || businessName,
            phone: row.phone || row.Phone || null,
            email: row.email || row.Email || null,
            totalFunded: amount,
            fundingCount: 1,
            lastFundedDate: fundedDate,
          },
        });

        // Create deal in FUNDED stage
        const deal = await prisma.deal.create({
          data: {
            clientId: client.id,
            assignedRepId: repId,
            stage: DealStage.FUNDED,
            stageLabel: STAGE_LABELS[DealStage.FUNDED],
            productType,
            dealAmount: amount,
            fundedDate,
            lastActivityAt: fundedDate,
            importBatch: batchId,
            originatorName: repName || undefined,
            lender: row.lender || row.Lender || undefined,
            notes: row.notes || row.Notes || undefined,
          },
        });

        // Create funding event
        await prisma.fundingEvent.create({
          data: {
            dealId: deal.id,
            repId,
            amountFunded: amount,
            productType,
            fundedDate,
            lender: row.lender || row.Lender || undefined,
          },
        });

        // Create 3 renewal tasks from funded date
        const ms = (d: number) => d * 24 * 60 * 60 * 1000;
        await prisma.renewalTask.createMany({
          data: [
            { dealId: deal.id, taskType: '35d_checkin', dueDate: new Date(fundedDate.getTime() + ms(35)) },
            { dealId: deal.id, taskType: 'midpoint', dueDate: new Date(fundedDate.getTime() + ms(90)) },
            { dealId: deal.id, taskType: 'payoff_30d', dueDate: new Date(fundedDate.getTime() + ms(150)) },
          ],
        });

        imported++;
      } catch (err: any) {
        skipped++;
        errors.push(`${businessName}: ${err.message}`);
      }
    }

    res.json({ imported, skipped, total: records.length, batchId, errors: errors.slice(0, 20) });
  }
}
