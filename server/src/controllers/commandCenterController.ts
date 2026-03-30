import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import { DealStage, RenewalTaskStatus } from '@prisma/client';

// Helper: rep filter
function repFilter(user: AuthRequest['user']) {
  if (user?.role === 'ADMIN') return {};
  return { assignedRepId: user!.id };
}

function repFundingFilter(user: AuthRequest['user']) {
  if (user?.role === 'ADMIN') return {};
  return { repId: user!.id };
}

export class CommandCenterController {
  // GET /api/command-center/metrics - All Money Zone + Execution Zone metrics
  static async getMetrics(req: AuthRequest, res: Response) {
    const filter = repFilter(req.user);
    const fundingFilter = repFundingFilter(req.user);
    const { repId } = req.query;

    // Admin viewing specific rep
    const effectiveFilter: any = { ...filter };
    const effectiveFundingFilter: any = { ...fundingFilter };
    if (req.user?.role === 'ADMIN' && repId) {
      effectiveFilter.assignedRepId = repId as string;
      effectiveFundingFilter.repId = repId as string;
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const daysElapsed = now.getDate();
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

    const [
      fundedMTDAgg,
      pipelineDeals,
      nurtureDeals,
      committedDeals,
      allActiveDeals,
      followUps7d,
      followUps30d,
      followUpsTotal,
      renewalsDue,
      lifetimeFundedAgg,
      fundedDealCount,
      fundedRepCount,
      futureNext7Value,
      futureNext30Value,
    ] = await Promise.all([
      // Funded MTD
      prisma.fundingEvent.aggregate({
        where: { ...effectiveFundingFilter, fundedDate: { gte: startOfMonth } },
        _sum: { amountFunded: true },
      }),
      // Pipeline deals (Approved + Committed)
      prisma.deal.findMany({
        where: { ...effectiveFilter, stage: { in: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING] } },
        select: { dealAmount: true, stage: true, nextActionDue: true, nextAction: true, lastActivityAt: true, offers: { select: { amount: true } } },
      }),
      // Nurture with prevOffer > 0 only (per spec: Pipeline Value includes nurture ONLY with prevOffer > 0)
      prisma.deal.findMany({
        where: { ...effectiveFilter, stage: DealStage.NURTURE, prevOffer: { gt: 0 } },
        select: { prevOffer: true, dealAmount: true },
      }),
      // Committed deals
      prisma.deal.findMany({
        where: { ...effectiveFilter, stage: DealStage.COMMITTED_FUNDING },
        select: { dealAmount: true },
      }),
      // All active deals for hot/stale/overdue
      prisma.deal.findMany({
        where: { ...effectiveFilter, stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] } },
        select: {
          id: true,
          dealAmount: true,
          stage: true,
          lastReplyAt: true,
          lenderEngaged: true,
          appSubmitted: true,
          nextAction: true,
          nextActionDue: true,
          lastActivityAt: true,
          staleDays: true,
          assignedRepId: true,
        },
      }),
      // Future Opportunities: Next 7 days
      prisma.deal.count({
        where: {
          ...effectiveFilter,
          followUpDate: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Future Opportunities: Next 30 days
      prisma.deal.count({
        where: {
          ...effectiveFilter,
          followUpDate: { gte: now, lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Future Opportunities: Total
      prisma.deal.count({
        where: { ...effectiveFilter, followUpDate: { gte: now } },
      }),
      // Renewals due
      prisma.renewalTask.count({
        where: {
          ...(effectiveFundingFilter.repId ? { repId: effectiveFundingFilter.repId } : {}),
          status: { in: [RenewalTaskStatus.PENDING, RenewalTaskStatus.OVERDUE] },
          dueDate: { lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        },
      }),
      // Lifetime funded
      prisma.fundingEvent.aggregate({
        where: { ...effectiveFundingFilter },
        _sum: { amountFunded: true },
      }),
      // Funded deal count MTD
      prisma.fundingEvent.count({
        where: { ...effectiveFundingFilter, fundedDate: { gte: startOfMonth } },
      }),
      // Funded rep count MTD (distinct reps)
      prisma.fundingEvent.groupBy({
        by: ['repId'],
        where: { ...effectiveFundingFilter, fundedDate: { gte: startOfMonth } },
      }).then((r) => r.length),
      // Future 7d value
      prisma.deal.aggregate({
        where: {
          ...effectiveFilter,
          followUpDate: { gte: now, lte: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
        },
        _sum: { dealAmount: true },
      }),
      // Future 30d value
      prisma.deal.aggregate({
        where: {
          ...effectiveFilter,
          followUpDate: { gte: now, lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
        },
        _sum: { dealAmount: true },
      }),
    ]);

    const fundedMTD = fundedMTDAgg._sum.amountFunded || 0;
    const lifetimeFunded = lifetimeFundedAgg._sum.amountFunded || 0;

    // Pipeline Value = Approved + Committed + Nurture (using offer amounts to match board)
    const bestOfferVal = (d: any) => {
      const best = (d.offers || []).reduce((b: any, o: any) => (!b || o.amount > b.amount ? o : b), null);
      return best?.amount || d.dealAmount || 0;
    };
    const approvedCommittedValue = pipelineDeals.reduce((s: number, d: any) => s + bestOfferVal(d), 0);
    const nurtureValue = nurtureDeals.reduce((s: number, d: any) => s + (d.prevOffer || d.dealAmount || 0), 0);
    const pipelineValue = approvedCommittedValue + nurtureValue;

    // Committed $ — use best offer (consistent with pipeline board)
    const committedValue = pipelineDeals
      .filter((d: any) => d.stage === DealStage.COMMITTED_FUNDING)
      .reduce((s: number, d: any) => s + bestOfferVal(d), 0);

    // At Risk: approved/committed with overdue or stalled
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const atRiskDeals = pipelineDeals.filter(
      (d) =>
        (d.nextActionDue && new Date(d.nextActionDue) < now) ||
        !d.nextAction ||
        (d.lastActivityAt && new Date(d.lastActivityAt) < fortyEightHoursAgo),
    );
    const atRisk = atRiskDeals.reduce((s: number, d: any) => s + bestOfferVal(d), 0);

    // Hot count
    const hotDeals = allActiveDeals.filter((d) => {
      const fortyEightH = 48 * 60 * 60 * 1000;
      if (d.lastReplyAt && now.getTime() - new Date(d.lastReplyAt).getTime() < fortyEightH) return true;
      if ([DealStage.APPROVED_OFFERS as string, DealStage.COMMITTED_FUNDING as string].includes(d.stage)) return true;
      if (d.lenderEngaged && d.appSubmitted) return true;
      return false;
    });

    // Stale deals (no activity 24h+)
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const staleDeals = allActiveDeals.filter(
      (d) => d.lastActivityAt && new Date(d.lastActivityAt) < twentyFourHoursAgo,
    );
    const staleRevenue = staleDeals
      .filter((d) => [DealStage.APPROVED_OFFERS as string, DealStage.COMMITTED_FUNDING as string].includes(d.stage))
      .reduce((s: number, d: any) => s + (d.dealAmount || 0), 0);

    // Overdue tasks
    const overdueDeals = allActiveDeals.filter((d) => d.nextActionDue && new Date(d.nextActionDue) < now);

    // No next action set
    const noNextActionCount = allActiveDeals.filter((d) => !d.nextAction).length;

    // Idle reps (24h+) — reps with no deal activity in 24h
    const twentyFourHMs = 24 * 60 * 60 * 1000;
    const repLastActivity: Record<string, Date> = {};
    allActiveDeals.forEach((d: any) => {
      if (d.assignedRepId && d.lastActivityAt) {
        const la = new Date(d.lastActivityAt);
        if (!repLastActivity[d.assignedRepId] || la > repLastActivity[d.assignedRepId]) {
          repLastActivity[d.assignedRepId] = la;
        }
      }
    });
    const idleRepsCount = Object.values(repLastActivity).filter(
      (la) => now.getTime() - la.getTime() > twentyFourHMs,
    ).length;

    // Get goal for progress
    let monthlyGoal = 0;
    if (req.user?.role === 'ADMIN' && !repId) {
      // Team goal
      const goal = await prisma.goal.findUnique({
        where: { entityType_entityId: { entityType: 'team', entityId: 'team' } },
      });
      monthlyGoal = goal?.monthlyGoal || 5800000;
    } else {
      const targetId = (repId as string) || req.user!.id;
      const userRecord = await prisma.user.findUnique({ where: { id: targetId }, select: { monthlyGoal: true } });
      monthlyGoal = userRecord?.monthlyGoal || 0;
    }

    const goalProgress = monthlyGoal > 0 ? (fundedMTD / monthlyGoal) * 100 : 0;
    const projectedMonthEnd = daysElapsed > 0 ? (fundedMTD / daysElapsed) * daysInMonth : 0;

    // Conversion rate: Submitted → Funded
    const [submittedCount, fundedCount] = await Promise.all([
      prisma.deal.count({
        where: {
          ...effectiveFilter,
          stage: { in: [DealStage.SUBMITTED_IN_REVIEW, DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING, DealStage.FUNDED] },
        },
      }),
      prisma.deal.count({
        where: { ...effectiveFilter, stage: DealStage.FUNDED },
      }),
    ]);
    const conversionRate = submittedCount > 0 ? Math.round((fundedCount / submittedCount) * 100) : 0;

    res.json({
      // Money Zone
      fundedMTD,
      lifetimeFunded,
      pipelineValue,
      committedValue,
      atRisk,
      goalProgress: Math.min(goalProgress, 100),
      projectedMonthEnd,
      monthlyGoal,

      // Execution Zone counts
      hotCount: hotDeals.length,
      staleCount: staleDeals.length,
      staleRevenue,
      overdueCount: overdueDeals.length,
      noNextAction: noNextActionCount,
      idleRepsCount,

      // Conversion
      conversionRate,

      // Future Opportunities
      futureNext7: followUps7d,
      futureNext30: followUps30d,
      futureTotal: followUpsTotal,
      futureNext7Value: futureNext7Value._sum.dealAmount || 0,
      futureNext30Value: futureNext30Value._sum.dealAmount || 0,
      renewalsDue,

      // Funded meta
      fundedDealCount,
      fundedRepCount,
      totalActiveDeals: allActiveDeals.length,
    });
  }

  // GET /api/command-center/operator-queue - Operator Queue
  static async getOperatorQueue(req: AuthRequest, res: Response) {
    const filter = repFilter(req.user);
    const { repId } = req.query;

    const where: any = {
      ...filter,
      stage: {
        in: [
          DealStage.APPROVED_OFFERS,
          DealStage.COMMITTED_FUNDING,
          DealStage.QUALIFIED,
          DealStage.SUBMITTED_IN_REVIEW,
          DealStage.ENGAGED_INTERESTED,
          DealStage.NEW_LEAD,
        ],
      },
    };

    if (req.user?.role === 'ADMIN' && repId) {
      where.assignedRepId = repId as string;
    }

    const deals = await prisma.deal.findMany({
      where,
      include: {
        client: true,
        assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true } },
        offers: { take: 1, orderBy: { createdAt: 'desc' } },
      },
      orderBy: [{ dealAmount: 'desc' }],
      take: 20,
    });

    // Determine primary action for each deal
    const enriched = deals.map((deal) => {
      let primaryAction = 'Follow Up';
      if (deal.stage === DealStage.APPROVED_OFFERS) primaryAction = 'Call Now';
      else if (deal.stage === DealStage.COMMITTED_FUNDING) primaryAction = 'Request Docs';
      else if (deal.stage === DealStage.NEW_LEAD || deal.stage === DealStage.ENGAGED_INTERESTED)
        primaryAction = 'Follow Up';
      else if (deal.stage === DealStage.QUALIFIED) primaryAction = 'Send Offer';
      else if (deal.stage === DealStage.SUBMITTED_IN_REVIEW) primaryAction = 'Follow Up';

      return {
        ...deal,
        primaryAction,
        isHot: computeIsHot(deal),
        stageLabel: STAGE_LABELS[deal.stage],
      };
    });

    res.json(enriched);
  }

  // GET /api/command-center/hot-leads
  static async getHotLeads(req: AuthRequest, res: Response) {
    const filter = repFilter(req.user);
    const { repId } = req.query;

    const where: any = { ...filter, stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED, DealStage.NURTURE] } };
    if (req.user?.role === 'ADMIN' && repId) where.assignedRepId = repId as string;

    const deals = await prisma.deal.findMany({
      where,
      include: {
        client: true,
        assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true } },
      },
      orderBy: { lastActivityAt: 'desc' },
    });

    const hot = deals.filter((d) => computeIsHot(d)).slice(0, 10);
    res.json(hot.map((d) => ({ ...d, isHot: true, stageLabel: STAGE_LABELS[d.stage] })));
  }

  // GET /api/command-center/stale-deals
  static async getStaleDeals(req: AuthRequest, res: Response) {
    const filter = repFilter(req.user);
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const deals = await prisma.deal.findMany({
      where: {
        ...filter,
        stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] },
        lastActivityAt: { lt: twentyFourHoursAgo },
      },
      include: {
        client: true,
        assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true } },
      },
      orderBy: { lastActivityAt: 'asc' },
      take: 20,
    });

    res.json(deals.map((d) => ({ ...d, stageLabel: STAGE_LABELS[d.stage] })));
  }

  // GET /api/command-center/overdue-tasks
  static async getOverdueTasks(req: AuthRequest, res: Response) {
    const filter = repFilter(req.user);
    const now = new Date();

    const deals = await prisma.deal.findMany({
      where: { ...filter, stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] }, nextActionDue: { lt: now } },
      include: {
        client: true,
        assignedRep: { select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true } },
      },
      orderBy: { nextActionDue: 'asc' },
      take: 20,
    });

    res.json(deals.map((d) => ({ ...d, stageLabel: STAGE_LABELS[d.stage] })));
  }

  // GET /api/command-center/intelligence - Admin Intelligence Zone
  static async getIntelligence(req: AuthRequest, res: Response) {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Admin only' });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // System Bottlenecks: $ stuck per stage with rep ownership
    const bottleneckDeals = await prisma.deal.findMany({
      where: {
        stage: {
          in: [
            DealStage.SUBMITTED_IN_REVIEW,
            DealStage.APPROVED_OFFERS,
            DealStage.COMMITTED_FUNDING,
            DealStage.QUALIFIED,
            DealStage.ENGAGED_INTERESTED,
          ],
        },
      },
      select: {
        stage: true,
        dealAmount: true,
        assignedRepId: true,
        assignedRep: { select: { initials: true, firstName: true, lastName: true } },
      },
    });

    const bottleneckMap: Record<string, { total: number; count: number; reps: Record<string, number> }> = {};
    for (const d of bottleneckDeals) {
      if (!bottleneckMap[d.stage]) bottleneckMap[d.stage] = { total: 0, count: 0, reps: {} };
      bottleneckMap[d.stage].total += d.dealAmount || 0;
      bottleneckMap[d.stage].count += 1;
      const init =
        d.assignedRep?.initials ||
        ((d.assignedRep?.firstName?.[0] || '') + (d.assignedRep?.lastName?.[0] || '')).toUpperCase() ||
        '??';
      bottleneckMap[d.stage].reps[init] = (bottleneckMap[d.stage].reps[init] || 0) + 1;
    }
    // Convert to array sorted by value desc (frontend expects array with .slice)
    const bottlenecks = Object.entries(bottleneckMap)
      .map(([stage, v]) => ({ stage, count: v.count, value: v.total, reps: v.reps }))
      .sort((a, b) => b.value - a.value);

    // Rep Activity Monitor
    const reps = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['REP', 'ADMIN'] } },
      select: { id: true, firstName: true, lastName: true, initials: true, avatarColor: true, monthlyGoal: true },
    });

    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const repActivity = await Promise.all(
      reps.map(async (rep) => {
        const [
          dealsAtRisk,
          overdueCount,
          lastEvent,
          fundedMTD,
          pipelineValue,
          committedValue,
          totalDeals,
          submittedCount,
          fundedCount,
        ] = await Promise.all([
          prisma.deal.count({
            where: {
              assignedRepId: rep.id,
              stage: { in: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING] },
              OR: [
                { nextActionDue: { lt: now } },
                { lastActivityAt: { lt: new Date(now.getTime() - 48 * 60 * 60 * 1000) } },
              ],
            },
          }),
          prisma.deal.count({
            where: {
              assignedRepId: rep.id,
              nextActionDue: { lt: now },
              stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] },
            },
          }),
          prisma.dealEvent.findFirst({
            where: { repId: rep.id },
            orderBy: { createdAt: 'desc' },
            select: { createdAt: true },
          }),
          prisma.fundingEvent.aggregate({
            where: { repId: rep.id, fundedDate: { gte: startOfMonth } },
            _sum: { amountFunded: true },
          }),
          prisma.deal.findMany({
            where: { assignedRepId: rep.id, stage: { in: [DealStage.APPROVED_OFFERS, DealStage.COMMITTED_FUNDING] } },
            select: { dealAmount: true, stage: true, offers: { select: { amount: true } } },
          }),
          prisma.deal.findMany({
            where: { assignedRepId: rep.id, stage: DealStage.COMMITTED_FUNDING },
            select: { dealAmount: true, offers: { select: { amount: true } } },
          }),
          prisma.deal.count({ where: { assignedRepId: rep.id, stage: { notIn: [DealStage.CLOSED] } } }),
          prisma.deal.count({ where: { assignedRepId: rep.id, stage: DealStage.SUBMITTED_IN_REVIEW } }),
          prisma.fundingEvent.count({ where: { repId: rep.id, fundedDate: { gte: startOfMonth } } }),
        ]);

        const isActive = lastEvent?.createdAt && new Date(lastEvent.createdAt) > twentyFourHoursAgo;

        return {
          id: rep.id,
          name: `${rep.firstName} ${rep.lastName}`,
          initials: rep.initials || ((rep.firstName?.[0] || '') + (rep.lastName?.[0] || '')).toUpperCase(),
          avatarColor: rep.avatarColor,
          monthlyGoal: rep.monthlyGoal,
          status: isActive ? 'active' : 'idle',
          lastTouch: lastEvent?.createdAt || null,
          dealsAtRisk,
          overdueCount,
          fundedMTD: fundedMTD._sum.amountFunded || 0,
          pipelineValue: pipelineValue.reduce((s: number, d: any) => {
            const best = (d.offers || []).reduce((b: any, o: any) => (!b || o.amount > b.amount ? o : b), null);
            return s + (best?.amount || d.dealAmount || 0);
          }, 0),
          committedValue: committedValue.reduce((s: number, d: any) => {
            const best = (d.offers || []).reduce((b: any, o: any) => (!b || o.amount > b.amount ? o : b), null);
            return s + (best?.amount || d.dealAmount || 0);
          }, 0),
          activeDeals: totalDeals,
          submittedCount,
          fundedCount,
        };
      }),
    );

    // Pipeline Snapshot: all 9 stages with count + $ volume
    const stages: DealStage[] = [
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
    const stageSnapshot = await Promise.all(
      stages.map(async (stage: DealStage) => {
        const [count, sumResult] = await Promise.all([
          prisma.deal.count({ where: { stage } }),
          // Submitted shows count ONLY — no dollar amount
          stage === DealStage.SUBMITTED_IN_REVIEW
            ? Promise.resolve({ _sum: { dealAmount: null } })
            : prisma.deal.aggregate({ where: { stage }, _sum: { dealAmount: true } }),
        ]);
        return {
          stage,
          label: STAGE_LABELS[stage as keyof typeof STAGE_LABELS],
          count,
          volume: sumResult._sum.dealAmount || 0,
          // Submitted: no dollar volume
          hideDollar: stage === DealStage.SUBMITTED_IN_REVIEW,
        };
      }),
    );

    // Conversion Funnel
    const funnelStages: DealStage[] = [
      DealStage.NEW_LEAD,
      DealStage.ENGAGED_INTERESTED,
      DealStage.QUALIFIED,
      DealStage.SUBMITTED_IN_REVIEW,
      DealStage.APPROVED_OFFERS,
      DealStage.COMMITTED_FUNDING,
      DealStage.FUNDED,
    ];
    const stageCounts = await prisma.deal.groupBy({
      by: ['stage'],
      where: { stage: { in: funnelStages } },
      _count: true,
    });

    const totalDealsInFunnel = stageCounts.reduce((sum, s: any) => sum + ((s._count as number) || 0), 0);

    const funnel = funnelStages.map((stage: DealStage) => {
      const count = (stageCounts.find((s: any) => s.stage === stage)?._count as number) || 0;
      return {
        stage,
        label: STAGE_LABELS[stage as keyof typeof STAGE_LABELS],
        count,
        rate: totalDealsInFunnel > 0 ? Math.round((count / totalDealsInFunnel) * 100) : 0,
      };
    });

    // Pipeline Health
    const activeDeals = await prisma.deal.findMany({
      where: { stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] } },
      select: { nextAction: true, nextActionDue: true, lastActivityAt: true, stage: true },
    });

    const totalActive = activeDeals.length || 1;
    const withNextAction = activeDeals.filter((d) => d.nextAction).length;
    const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const touchedRecently = activeDeals.filter(
      (d) => d.lastActivityAt && new Date(d.lastActivityAt) > fortyEightHoursAgo,
    ).length;

    res.json({
      bottlenecks,
      repActivity,
      stageSnapshot,
      conversionFunnel: funnel,
      pipelineHealth: {
        withNextAction: Math.round((withNextAction / totalActive) * 100),
        touched48h: Math.round((touchedRecently / totalActive) * 100),
        properlyStaged: 100, // all have Stage set
        totalDeals: activeDeals.length,
        withNextActionCount: withNextAction,
        touchedRecentlyCount: touchedRecently,
      },
    });
  }

  // GET /api/command-center/execution-scores - Execution Score bar
  static async getExecutionScores(req: AuthRequest, res: Response) {
    const reps = await prisma.user.findMany({
      where: { isActive: true, role: { in: ['REP', 'ADMIN'] } },
      select: { id: true, initials: true, avatarColor: true, firstName: true, lastName: true },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const scores = await Promise.all(
      reps.map(async (rep) => {
        const [todayActions, assignedDeals, overdueCount, touchedToday] = await Promise.all([
          prisma.dealEvent.count({
            where: { repId: rep.id, eventType: 'action_completed', createdAt: { gte: today } },
          }),
          prisma.deal.count({
            where: {
              assignedRepId: rep.id,
              stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] },
            },
          }),
          prisma.deal.count({
            where: {
              assignedRepId: rep.id,
              nextActionDue: { lt: new Date() },
              stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] },
            },
          }),
          prisma.dealEvent.groupBy({
            by: ['dealId'],
            where: { repId: rep.id, createdAt: { gte: today } },
          }).then((r) => r.length),
        ]);

        const totalAssigned = assignedDeals;

        return {
          id: rep.id,
          initials: rep.initials || ((rep.firstName?.[0] || '') + (rep.lastName?.[0] || '')).toUpperCase(),
          avatarColor: rep.avatarColor,
          firstName: rep.firstName,
          lastName: rep.lastName,
          score: totalAssigned > 0 ? Math.round(((totalAssigned - overdueCount) / totalAssigned) * 100) : 0,
          completed: todayActions,
          assigned: totalAssigned,
          overdue: overdueCount,
          touchedToday,
        };
      }),
    );

    res.json(scores);
  }

  // GET /api/command-center/product-mix - Product Mix module
  static async getProductMix(req: AuthRequest, res: Response) {
    const { repId, period } = req.query;
    const filter: any = {};

    if (repId) filter.repId = repId as string;
    else if (req.user?.role !== 'ADMIN') filter.repId = req.user!.id;

    if (period === '30d') {
      filter.fundedDate = { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    }

    const events = await prisma.fundingEvent.findMany({
      where: filter,
      select: { productType: true, amountFunded: true, repId: true },
    });

    // Group by product type
    const mix: Record<string, { amount: number; count: number }> = {};
    let total = 0;
    for (const e of events) {
      const pt = e.productType || 'OTHER';
      if (!mix[pt]) mix[pt] = { amount: 0, count: 0 };
      mix[pt].amount += e.amountFunded;
      mix[pt].count += 1;
      total += e.amountFunded;
    }

    const products = Object.entries(mix)
      .map(([type, data]) => ({
        type,
        amount: data.amount,
        count: data.count,
        percentage: total > 0 ? Math.round((data.amount / total) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);

    // If admin, also get rep breakdown
    let repBreakdown: any[] = [];
    if (req.user?.role === 'ADMIN' && !repId) {
      const reps = await prisma.user.findMany({
        where: { isActive: true },
        select: { id: true, firstName: true, lastName: true, initials: true },
      });

      repBreakdown = await Promise.all(
        reps.map(async (rep) => {
          const repEvents = await prisma.fundingEvent.findMany({
            where: {
              repId: rep.id,
              ...(period === '30d' ? { fundedDate: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } : {}),
            },
            select: { productType: true, amountFunded: true },
          });

          const repMix: Record<string, number> = {};
          let repTotal = 0;
          for (const e of repEvents) {
            const pt = e.productType || 'OTHER';
            repMix[pt] = (repMix[pt] || 0) + e.amountFunded;
            repTotal += e.amountFunded;
          }

          return {
            id: rep.id,
            name: `${rep.firstName} ${rep.lastName}`,
            initials: rep.initials,
            funded: repTotal,
            mix: Object.entries(repMix).map(([type, amount]) => ({
              type,
              amount,
              percentage: repTotal > 0 ? Math.round((amount / repTotal) * 1000) / 10 : 0,
              vsTeam:
                total > 0 && mix[type] ? Math.round((amount / repTotal - mix[type].amount / total) * 1000) / 10 : 0,
            })),
          };
        }),
      );

      repBreakdown = repBreakdown.filter((r) => r.funded > 0).sort((a, b) => b.funded - a.funded);
    }

    res.json({ products, total, repBreakdown });
  }

  // GET /api/command-center/activity-feed - Activity Feed
  static async getActivityFeed(req: AuthRequest, res: Response) {
    const filter: any = {};
    const { repId } = req.query;
    if (req.user?.role === 'ADMIN' && repId) {
      filter.repId = repId as string;
    } else if (req.user?.role !== 'ADMIN') {
      filter.repId = req.user!.id;
    }

    const events = await prisma.dealEvent.findMany({
      where: filter,
      include: {
        deal: { select: { id: true, client: { select: { businessName: true } }, stage: true } },
        rep: { select: { id: true, firstName: true, lastName: true, initials: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    res.json(events);
  }

  // GET /api/command-center/sms-metrics - SMS Metrics strip
  static async getSmsMetrics(req: AuthRequest, res: Response) {
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Get user's assigned numbers
    let numberFilter: any = {};
    if (req.user?.role !== 'ADMIN') {
      const assignments = await prisma.numberAssignment.findMany({
        where: { userId: req.user!.id, isActive: true },
        select: { phoneNumber: { select: { phoneNumber: true } } },
      });
      const myNumbers = assignments.map((a) => a.phoneNumber.phoneNumber);
      if (myNumbers.length > 0) {
        numberFilter.fromNumber = { in: myNumbers };
      }
    }

    const [sent24h, delivered24h, failed24h, inbound7d, outbound7d, totalLeads] = await Promise.all([
      prisma.message.count({
        where: { ...numberFilter, direction: 'OUTBOUND', createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.message.count({
        where: { ...numberFilter, direction: 'OUTBOUND', status: 'DELIVERED', createdAt: { gte: twentyFourHoursAgo } },
      }),
      prisma.message.count({
        where: {
          ...numberFilter,
          direction: 'OUTBOUND',
          status: { in: ['FAILED', 'UNDELIVERED'] },
          createdAt: { gte: twentyFourHoursAgo },
        },
      }),
      prisma.message.count({ where: { ...numberFilter, direction: 'INBOUND', createdAt: { gte: sevenDaysAgo } } }),
      prisma.message.count({ where: { ...numberFilter, direction: 'OUTBOUND', createdAt: { gte: sevenDaysAgo } } }),
      prisma.lead.count({ where: { deletedAt: null } }),
    ]);

    const replyRate = outbound7d > 0 ? Math.round((inbound7d / outbound7d) * 1000) / 10 : 0;
    const errorRate = sent24h > 0 ? Math.round((failed24h / sent24h) * 1000) / 10 : 0;

    const automationCount = await prisma.automationRule.count({ where: { isActive: true } });

    res.json({
      sent24h,
      delivered24h,
      totalLeads,
      replyRate7d: replyRate,
      errorRate,
      activeAutomations: automationCount,
    });
  }
}

// Helper functions used in controller
const STAGE_LABELS: Record<string, string> = {
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
