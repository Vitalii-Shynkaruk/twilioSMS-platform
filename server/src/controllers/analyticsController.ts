import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { subDays, subHours, startOfDay, format } from 'date-fns';

export class AnalyticsController {

  /**
   * GET /analytics/overview — High-level KPIs with trends
   */
  static async getOverview(req: AuthRequest, res: Response): Promise<void> {
    const now = new Date();
    const last24h = subDays(now, 1);
    const last7d = subDays(now, 7);
    const last30d = subDays(now, 30);
    const prev7d = subDays(now, 14);

    const [
      totalLeads,
      leadsLast7d,
      leadsPrev7d,
      totalMessages,
      messagesLast7d,
      messagesPrev7d,
      totalDelivered7d,
      totalFailed7d,
      repliesLast7d,
      repliesPrev7d,
      optOutsLast7d,
      totalCampaigns,
      activeCampaigns,
      totalConversations,
      activeAutomations,
    ] = await Promise.all([
      prisma.lead.count(),
      prisma.lead.count({ where: { createdAt: { gte: last7d } } }),
      prisma.lead.count({ where: { createdAt: { gte: prev7d, lt: last7d } } }),
      prisma.message.count({ where: { direction: 'OUTBOUND' } }),
      prisma.message.count({ where: { direction: 'OUTBOUND', createdAt: { gte: last7d } } }),
      prisma.message.count({ where: { direction: 'OUTBOUND', createdAt: { gte: prev7d, lt: last7d } } }),
      prisma.message.count({ where: { direction: 'OUTBOUND', status: 'DELIVERED', createdAt: { gte: last7d } } }),
      prisma.message.count({ where: { direction: 'OUTBOUND', status: { in: ['FAILED', 'BLOCKED'] }, createdAt: { gte: last7d } } }),
      prisma.message.count({ where: { direction: 'INBOUND', createdAt: { gte: last7d } } }),
      prisma.message.count({ where: { direction: 'INBOUND', createdAt: { gte: prev7d, lt: last7d } } }),
      prisma.lead.count({ where: { optedOut: true, optedOutAt: { gte: last7d } } }),
      prisma.campaign.count(),
      prisma.campaign.count({ where: { status: { in: ['SENDING', 'SCHEDULED'] } } }),
      prisma.conversation.count(),
      prisma.automationRun.count({ where: { isActive: true, isPaused: false } }),
    ]);

    const deliveryRate = messagesLast7d > 0 ? +((totalDelivered7d / messagesLast7d) * 100).toFixed(1) : 0;
    const replyRate = messagesLast7d > 0 ? +((repliesLast7d / messagesLast7d) * 100).toFixed(1) : 0;
    const calcTrend = (current: number, previous: number) =>
      previous > 0 ? +(((current - previous) / previous) * 100).toFixed(1) : current > 0 ? 100 : 0;

    res.json({
      kpis: {
        totalLeads,
        newLeadsWeek: leadsLast7d,
        leadsTrend: calcTrend(leadsLast7d, leadsPrev7d),
        totalMessagesSent: totalMessages,
        messagesSentWeek: messagesLast7d,
        messagesTrend: calcTrend(messagesLast7d, messagesPrev7d),
        deliveryRate,
        replyRate,
        repliesWeek: repliesLast7d,
        repliesTrend: calcTrend(repliesLast7d, repliesPrev7d),
        optOutsWeek: optOutsLast7d,
        totalCampaigns,
        activeCampaigns,
        totalConversations,
        activeAutomations,
      },
    });
  }

  /**
   * GET /analytics/lead-funnel — Lead status distribution & conversion funnel
   */
  static async getLeadFunnel(req: AuthRequest, res: Response): Promise<void> {
    const statusCounts = await prisma.lead.groupBy({
      by: ['status'],
      _count: true,
    });

    // Pipeline stages with card counts
    const stages = await prisma.pipelineStage.findMany({
      orderBy: { order: 'asc' },
      include: { _count: { select: { cards: true } } },
    });

    // Source distribution
    const sourceCounts = await prisma.lead.groupBy({
      by: ['source'],
      _count: true,
      orderBy: { _count: { source: 'desc' } },
      take: 10,
    });

    // Lead creation over time (last 30 days)
    const last30d = subDays(new Date(), 30);
    const leadTimeline = await prisma.$queryRaw`
      SELECT DATE("createdAt") as date, COUNT(*)::int as count
      FROM leads
      WHERE "createdAt" >= ${last30d}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    ` as Array<{ date: Date; count: number }>;

    res.json({
      statusDistribution: statusCounts.map(s => ({
        status: s.status,
        count: s._count,
      })),
      pipelineFunnel: stages.map(s => ({
        id: s.id,
        name: s.name,
        color: s.color,
        order: s.order,
        count: s._count.cards,
      })),
      sourceDistribution: sourceCounts.map(s => ({
        source: s.source || 'Unknown',
        count: s._count,
      })),
      leadTimeline: leadTimeline.map(r => ({
        date: format(new Date(r.date), 'yyyy-MM-dd'),
        count: r.count,
      })),
    });
  }

  /**
   * GET /analytics/messaging — Message volume, delivery rates, hourly patterns
   */
  static async getMessaging(req: AuthRequest, res: Response): Promise<void> {
    const days = parseInt(req.query.days as string) || 30;
    const since = subDays(new Date(), days);

    // Daily volume
    const dailyVolume = await prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*) FILTER (WHERE direction = 'OUTBOUND')::int as outbound,
        COUNT(*) FILTER (WHERE direction = 'INBOUND')::int as inbound,
        COUNT(*) FILTER (WHERE direction = 'OUTBOUND' AND status = 'DELIVERED')::int as delivered,
        COUNT(*) FILTER (WHERE direction = 'OUTBOUND' AND status IN ('FAILED', 'BLOCKED'))::int as failed
      FROM messages
      WHERE "createdAt" >= ${since}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    ` as Array<{ date: Date; outbound: number; inbound: number; delivered: number; failed: number }>;

    // Hourly distribution (all time)
    const hourlyPattern = await prisma.$queryRaw`
      SELECT 
        EXTRACT(HOUR FROM "createdAt")::int as hour,
        COUNT(*) FILTER (WHERE direction = 'OUTBOUND')::int as outbound,
        COUNT(*) FILTER (WHERE direction = 'INBOUND')::int as inbound
      FROM messages
      WHERE "createdAt" >= ${since}
      GROUP BY hour
      ORDER BY hour
    ` as Array<{ hour: number; outbound: number; inbound: number }>;

    // Day of week distribution
    const weekdayPattern = await prisma.$queryRaw`
      SELECT 
        EXTRACT(DOW FROM "createdAt")::int as dow,
        COUNT(*) FILTER (WHERE direction = 'OUTBOUND')::int as outbound,
        COUNT(*) FILTER (WHERE direction = 'INBOUND')::int as inbound
      FROM messages
      WHERE "createdAt" >= ${since}
      GROUP BY dow
      ORDER BY dow
    ` as Array<{ dow: number; outbound: number; inbound: number }>;

    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    // Error code distribution
    const errorCodes = await prisma.message.groupBy({
      by: ['errorCode'],
      where: {
        status: { in: ['FAILED', 'BLOCKED'] },
        createdAt: { gte: since },
        errorCode: { not: null },
      },
      _count: true,
      orderBy: { _count: { errorCode: 'desc' } },
      take: 10,
    });

    // Average response time (time between outbound and inbound in same conversation)
    const avgResponseTime = await prisma.$queryRaw`
      WITH outbound_msgs AS (
        SELECT id, "conversationId", "createdAt" as sent_at
        FROM messages
        WHERE direction = 'OUTBOUND' AND "createdAt" >= ${since}
      ),
      first_reply AS (
        SELECT DISTINCT ON (om."conversationId")
          om."conversationId",
          EXTRACT(EPOCH FROM (im."createdAt" - om.sent_at)) as response_seconds
        FROM outbound_msgs om
        JOIN messages im ON im."conversationId" = om."conversationId"
          AND im.direction = 'INBOUND'
          AND im."createdAt" > om.sent_at
        ORDER BY om."conversationId", im."createdAt"
      )
      SELECT 
        AVG(response_seconds)::int as avg_seconds,
        MIN(response_seconds)::int as min_seconds,
        MAX(response_seconds)::int as max_seconds,
        COUNT(*)::int as total_replies
      FROM first_reply
      WHERE response_seconds > 0 AND response_seconds < 86400 * 7
    ` as Array<{ avg_seconds: number | null; min_seconds: number | null; max_seconds: number | null; total_replies: number }>;

    res.json({
      dailyVolume: dailyVolume.map(r => ({
        date: format(new Date(r.date), 'yyyy-MM-dd'),
        outbound: r.outbound,
        inbound: r.inbound,
        delivered: r.delivered,
        failed: r.failed,
      })),
      hourlyPattern: hourlyPattern.map(r => ({
        hour: r.hour,
        label: `${r.hour.toString().padStart(2, '0')}:00`,
        outbound: r.outbound,
        inbound: r.inbound,
      })),
      weekdayPattern: weekdayPattern.map(r => ({
        dow: r.dow,
        day: dayNames[r.dow],
        outbound: r.outbound,
        inbound: r.inbound,
      })),
      errorCodes: errorCodes.map(e => ({
        code: e.errorCode,
        count: e._count,
      })),
      responseTime: avgResponseTime[0] || { avg_seconds: null, min_seconds: null, max_seconds: null, total_replies: 0 },
    });
  }

  /**
   * GET /analytics/campaigns — Campaign performance comparison
   */
  static async getCampaigns(req: AuthRequest, res: Response): Promise<void> {
    const campaigns = await prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
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
        sendingSpeed: true,
        startedAt: true,
        completedAt: true,
        createdAt: true,
        createdBy: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    const campaignAnalytics = campaigns.map(c => ({
      ...c,
      deliveryRate: c.totalSent > 0 ? +((c.totalDelivered / c.totalSent) * 100).toFixed(1) : 0,
      replyRate: c.totalSent > 0 ? +((c.totalReplied / c.totalSent) * 100).toFixed(1) : 0,
      optOutRate: c.totalSent > 0 ? +((c.totalOptedOut / c.totalSent) * 100).toFixed(1) : 0,
      failRate: c.totalSent > 0 ? +(((c.totalFailed + c.totalBlocked) / c.totalSent) * 100).toFixed(1) : 0,
      durationMinutes: c.startedAt && c.completedAt
        ? Math.round((c.completedAt.getTime() - c.startedAt.getTime()) / 60000)
        : null,
    }));

    res.json({ campaigns: campaignAnalytics });
  }

  /**
   * GET /analytics/numbers — Phone number performance metrics
   */
  static async getNumbers(req: AuthRequest, res: Response): Promise<void> {
    const numbers = await prisma.phoneNumber.findMany({
      orderBy: { totalSent: 'desc' },
      select: {
        id: true,
        phoneNumber: true,
        friendlyName: true,
        status: true,
        totalSent: true,
        totalDelivered: true,
        totalFailed: true,
        totalBlocked: true,
        deliveryRate: true,
        dailySentCount: true,
        dailyLimit: true,
        errorStreak: true,
        rampDay: true,
        isRamping: true,
        lastSentAt: true,
        lastErrorAt: true,
      },
    });

    // Daily stats per number (last 7 days)
    const last7d = subDays(new Date(), 7);
    const dailyStats = await prisma.dailyNumberStats.findMany({
      where: { date: { gte: last7d } },
      orderBy: { date: 'asc' },
    });

    // Aggregate daily stats by number
    const numberDailyMap = new Map<string, Array<{ date: string; sent: number; delivered: number; failed: number }>>();
    for (const stat of dailyStats) {
      const key = stat.phoneNumberId;
      if (!numberDailyMap.has(key)) numberDailyMap.set(key, []);
      numberDailyMap.get(key)!.push({
        date: format(new Date(stat.date), 'yyyy-MM-dd'),
        sent: stat.sent,
        delivered: stat.delivered,
        failed: stat.failed + stat.blocked,
      });
    }

    const numberAnalytics = numbers.map(n => ({
      ...n,
      utilizationPct: n.dailyLimit > 0 ? +((n.dailySentCount / n.dailyLimit) * 100).toFixed(1) : 0,
      failRate: n.totalSent > 0 ? +(((n.totalFailed + n.totalBlocked) / n.totalSent) * 100).toFixed(1) : 0,
      dailyTrend: numberDailyMap.get(n.id) || [],
    }));

    // Status summary
    const statusSummary = await prisma.phoneNumber.groupBy({
      by: ['status'],
      _count: true,
      _avg: { deliveryRate: true },
    });

    res.json({
      numbers: numberAnalytics,
      statusSummary: statusSummary.map(s => ({
        status: s.status,
        count: s._count,
        avgDeliveryRate: +(s._avg.deliveryRate || 0).toFixed(1),
      })),
    });
  }

  /**
   * GET /analytics/rep-performance — Per-user performance metrics
   */
  static async getRepPerformance(req: AuthRequest, res: Response): Promise<void> {
    const last30d = subDays(new Date(), 30);

    const reps = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        _count: {
          select: {
            assignedLeads: true,
            conversations: true,
            sentMessages: true,
          },
        },
      },
    });

    // Per-rep message stats (last 30 days)
    const repMessageStats = await prisma.$queryRaw`
      SELECT 
        m."sentByUserId" as user_id,
        COUNT(*) FILTER (WHERE m.direction = 'OUTBOUND')::int as sent,
        COUNT(*) FILTER (WHERE m.status = 'DELIVERED')::int as delivered,
        COUNT(*) FILTER (WHERE m.status IN ('FAILED', 'BLOCKED'))::int as failed
      FROM messages m
      WHERE m."sentByUserId" IS NOT NULL
        AND m."createdAt" >= ${last30d}
      GROUP BY m."sentByUserId"
    ` as Array<{ user_id: string; sent: number; delivered: number; failed: number }>;

    // Per-rep reply counts
    const repReplies = await prisma.$queryRaw`
      SELECT 
        c."assignedRepId" as user_id,
        COUNT(*)::int as replies
      FROM messages m
      JOIN conversations c ON m."conversationId" = c.id
      WHERE m.direction = 'INBOUND'
        AND c."assignedRepId" IS NOT NULL
        AND m."createdAt" >= ${last30d}
      GROUP BY c."assignedRepId"
    ` as Array<{ user_id: string; replies: number }>;

    const msgMap = new Map(repMessageStats.map(r => [r.user_id, r]));
    const replyMap = new Map(repReplies.map(r => [r.user_id, r.replies]));

    const repPerformance = reps.map(rep => {
      const msgs = msgMap.get(rep.id);
      const replies = replyMap.get(rep.id) || 0;
      return {
        id: rep.id,
        name: `${rep.firstName} ${rep.lastName}`,
        role: rep.role,
        totalLeads: rep._count.assignedLeads,
        totalConversations: rep._count.conversations,
        totalMessagesSent: rep._count.sentMessages,
        last30d: {
          sent: msgs?.sent || 0,
          delivered: msgs?.delivered || 0,
          failed: msgs?.failed || 0,
          replies,
          deliveryRate: msgs && msgs.sent > 0 ? +((msgs.delivered / msgs.sent) * 100).toFixed(1) : 0,
          replyRate: msgs && msgs.sent > 0 ? +((replies / msgs.sent) * 100).toFixed(1) : 0,
        },
      };
    });

    res.json({ reps: repPerformance });
  }

  /**
   * GET /analytics/automation — Automation performance metrics
   */
  static async getAutomation(req: AuthRequest, res: Response): Promise<void> {
    const rules = await prisma.automationRule.findMany({
      include: {
        _count: {
          select: { runs: true, templates: true },
        },
        runs: {
          select: {
            isActive: true,
            isPaused: true,
            completedAt: true,
            currentStep: true,
          },
        },
      },
    });

    const automationAnalytics = rules.map(rule => {
      const totalRuns = rule.runs.length;
      const activeRuns = rule.runs.filter(r => r.isActive && !r.isPaused).length;
      const pausedRuns = rule.runs.filter(r => r.isPaused).length;
      const completedRuns = rule.runs.filter(r => r.completedAt).length;

      return {
        id: rule.id,
        name: rule.name,
        type: rule.type,
        isActive: rule.isActive,
        templateCount: rule._count.templates,
        totalRuns,
        activeRuns,
        pausedRuns,
        completedRuns,
        completionRate: totalRuns > 0 ? +((completedRuns / totalRuns) * 100).toFixed(1) : 0,
        sendWindow: `${rule.sendAfterHour}:00 - ${rule.sendBeforeHour}:00`,
        sendOnWeekends: rule.sendOnWeekends,
      };
    });

    // Summary
    const totalActive = automationAnalytics.filter(a => a.isActive).length;
    const totalRuns = automationAnalytics.reduce((sum, a) => sum + a.totalRuns, 0);
    const activeRuns = automationAnalytics.reduce((sum, a) => sum + a.activeRuns, 0);

    res.json({
      rules: automationAnalytics,
      summary: {
        totalRules: rules.length,
        activeRules: totalActive,
        totalRuns,
        activeRuns,
      },
    });
  }
}
