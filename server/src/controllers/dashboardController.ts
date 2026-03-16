import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { subDays, subHours, startOfDay } from 'date-fns';
import getTwilioClient, { getSmsMode } from '../config/twilio';
import redis from '../config/redis';
import { config } from '../config';
import logger from '../config/logger';

export class DashboardController {
  static async getStats(req: AuthRequest, res: Response): Promise<void> {
    const now = new Date();
    const last24h = subDays(now, 1);
    const last7d = subDays(now, 7);

    // Parallel queries for performance
    const [
      sentLast24h,
      deliveredLast24h,
      totalLeads,
      repliesLast7d,
      sentLast7d,
      pipelineSnapshot,
      recentCampaigns,
      numberHealth,
      activeAutomations,
    ] = await Promise.all([
      // Messages sent in last 24h
      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: last24h },
          status: { in: ['SENT', 'DELIVERED'] },
        },
      }),

      // Messages delivered in last 24h
      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: last24h },
          status: 'DELIVERED',
        },
      }),

      // Total leads
      prisma.lead.count(),

      // Replies in last 7 days
      prisma.message.count({
        where: {
          direction: 'INBOUND',
          createdAt: { gte: last7d },
        },
      }),

      // Sent in last 7 days
      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: last7d },
          status: { in: ['SENT', 'DELIVERED'] },
        },
      }),

      // Pipeline snapshot
      prisma.pipelineStage.findMany({
        include: {
          _count: { select: { cards: true } },
        },
        orderBy: { order: 'asc' },
      }),

      // Recent campaigns
      prisma.campaign.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          status: true,
          totalSent: true,
          totalDelivered: true,
          totalFailed: true,
          totalBlocked: true,
          totalReplied: true,
          createdAt: true,
        },
      }),

      // Number health summary
      prisma.phoneNumber.groupBy({
        by: ['status'],
        _count: true,
      }),

      // Active automations
      prisma.automationRun.count({
        where: { isActive: true, isPaused: false },
      }),
    ]);

    // Daily send volume (last 7 days)
    const dailyVolume = await prisma.$queryRaw`
      SELECT 
        DATE("createdAt") as date,
        COUNT(*) FILTER (WHERE status IN ('SENT', 'DELIVERED')) as sent,
        COUNT(*) FILTER (WHERE status = 'DELIVERED') as delivered,
        COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
        COUNT(*) FILTER (WHERE status = 'BLOCKED') as blocked
      FROM messages 
      WHERE direction = 'OUTBOUND' 
        AND "createdAt" >= ${last7d}
      GROUP BY DATE("createdAt")
      ORDER BY date ASC
    `;

    const replyRate = sentLast7d > 0 ? ((repliesLast7d / sentLast7d) * 100).toFixed(1) : '0';

    // Convert BigInt values from raw SQL to Number
    const safeDailyVolume = (dailyVolume as any[]).map((row: any) => ({
      date: row.date,
      sent: Number(row.sent || 0),
      delivered: Number(row.delivered || 0),
      failed: Number(row.failed || 0),
      blocked: Number(row.blocked || 0),
    }));

    res.json({
      overview: {
        sentLast24h,
        deliveredLast24h,
        totalLeads,
        replyRate: parseFloat(replyRate),
        activeAutomations,
      },
      pipelineSnapshot: pipelineSnapshot.map((stage) => ({
        id: stage.id,
        name: stage.name,
        color: stage.color,
        count: stage._count.cards,
      })),
      recentCampaigns,
      numberHealth: numberHealth.map((g) => ({
        status: g.status,
        count: g._count,
      })),
      dailyVolume: safeDailyVolume,
    });
  }

  static async getDeliveryMetrics(req: AuthRequest, res: Response): Promise<void> {
    const days = parseInt(req.query.days as string) || 7;
    const since = subDays(new Date(), days);

    const stats = await prisma.dailyNumberStats.findMany({
      where: { date: { gte: since } },
      orderBy: { date: 'asc' },
    });

    // Aggregate by date
    const aggregated = new Map<string, any>();
    const totals = { sent: 0, delivered: 0, failed: 0, blocked: 0, replies: 0, optOuts: 0 };
    for (const stat of stats) {
      const date = stat.date.toISOString().split('T')[0];
      if (!aggregated.has(date)) {
        aggregated.set(date, {
          date,
          sent: 0,
          delivered: 0,
          failed: 0,
          blocked: 0,
          replies: 0,
          optOuts: 0,
        });
      }
      const agg = aggregated.get(date);
      agg.sent += stat.sent;
      agg.delivered += stat.delivered;
      agg.failed += stat.failed;
      agg.blocked += stat.blocked;
      agg.replies += stat.replies;
      agg.optOuts += stat.optOuts;
      totals.sent += stat.sent;
      totals.delivered += stat.delivered;
      totals.failed += stat.failed;
      totals.blocked += stat.blocked;
      totals.replies += stat.replies;
      totals.optOuts += stat.optOuts;
    }

    res.json({
      metrics: Array.from(aggregated.values()),
      totals,
    });
  }

  /**
   * GET /dashboard/diagnostics — System health, SMS mode, error breakdown, uptime info
   */
  static async getDiagnostics(req: AuthRequest, res: Response): Promise<void> {
    const now = new Date();
    const last24h = subDays(now, 1);
    const last1h = subHours(now, 1);
    const last7d = subDays(now, 7);

    const smsMode = await getSmsMode();

    const [
      // 24h error breakdown
      errorBreakdown,
      // 1h sending velocity
      sentLastHour,
      // Queue depth (pending messages)
      pendingMessages,
      // Active numbers
      numberStats,
      // Total conversations
      totalConversations,
      // Last message sent
      lastMessage,
      // 24h stats
      stats24h,
      // 7d stats
      stats7d,
      // Recent errors (last 10)
      recentErrors,
      // Opt-outs 24h
      optOuts24h,
    ] = await Promise.all([
      prisma.message.groupBy({
        by: ['errorCode'],
        where: {
          status: { in: ['FAILED', 'BLOCKED'] },
          createdAt: { gte: last24h },
          errorCode: { not: null },
        },
        _count: true,
        orderBy: { _count: { errorCode: 'desc' } },
        take: 10,
      }),

      prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: last1h },
          status: { in: ['SENT', 'DELIVERED', 'SENDING'] },
        },
      }),

      prisma.message.count({
        where: { status: { in: ['QUEUED', 'SENDING'] } },
      }),

      prisma.phoneNumber.groupBy({
        by: ['status'],
        _count: true,
      }),

      prisma.conversation.count(),

      prisma.message.findFirst({
        where: { direction: 'OUTBOUND' },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true, status: true },
      }),

      prisma.message.groupBy({
        by: ['status'],
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: last24h },
        },
        _count: true,
      }),

      prisma.message.groupBy({
        by: ['status'],
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: last7d },
        },
        _count: true,
      }),

      prisma.message.findMany({
        where: {
          status: { in: ['FAILED', 'BLOCKED'] },
          createdAt: { gte: last24h },
        },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          status: true,
          errorCode: true,
          errorMessage: true,
          createdAt: true,
          failedAt: true,
          conversation: {
            select: { lead: { select: { phone: true } } },
          },
        },
      }),

      prisma.lead.count({
        where: {
          status: 'DNC',
          updatedAt: { gte: last24h },
        },
      }),
    ]);

    // Aggregate 24h and 7d stats into objects
    const aggregate = (groups: Array<{ status: string; _count: number }>) => {
      const m: Record<string, number> = {};
      for (const g of groups) m[g.status] = g._count;
      return {
        sent: (m.SENT || 0) + (m.DELIVERED || 0),
        delivered: m.DELIVERED || 0,
        failed: m.FAILED || 0,
        blocked: m.BLOCKED || 0,
        queued: m.QUEUED || 0,
        sending: m.SENDING || 0,
      };
    };

    const agg24h = aggregate(stats24h.map((s) => ({ status: s.status, _count: s._count })));
    const agg7d = aggregate(stats7d.map((s) => ({ status: s.status, _count: s._count })));

    // Number summary
    const numberSummary: Record<string, number> = {};
    for (const g of numberStats) {
      numberSummary[g.status] = g._count;
    }

    // Redis check
    let redisOk = false;
    try {
      await redis.ping();
      redisOk = true;
    } catch {
      /* */
    }

    res.json({
      smsMode,
      serverTime: now.toISOString(),
      uptime: process.uptime(),
      health: {
        database: true,
        redis: redisOk,
        twilio: smsMode === 'live',
      },
      sending: {
        velocityPerHour: sentLastHour,
        pendingInQueue: pendingMessages,
        lastMessageAt: lastMessage?.createdAt || null,
        lastMessageStatus: lastMessage?.status || null,
      },
      stats24h: {
        ...agg24h,
        optOuts: optOuts24h,
        deliveryRate: agg24h.sent > 0 ? +((agg24h.delivered / agg24h.sent) * 100).toFixed(1) : 0,
        errorRate: agg24h.sent > 0 ? +(((agg24h.failed + agg24h.blocked) / agg24h.sent) * 100).toFixed(1) : 0,
      },
      stats7d: {
        ...agg7d,
        deliveryRate: agg7d.sent > 0 ? +((agg7d.delivered / agg7d.sent) * 100).toFixed(1) : 0,
        errorRate: agg7d.sent > 0 ? +(((agg7d.failed + agg7d.blocked) / agg7d.sent) * 100).toFixed(1) : 0,
      },
      numbers: {
        total: Object.values(numberSummary).reduce((a, b) => a + b, 0),
        active: numberSummary.ACTIVE || 0,
        warming: numberSummary.WARMING || 0,
        cooling: numberSummary.COOLING || 0,
        disabled: numberSummary.DISABLED || 0,
      },
      conversations: totalConversations,
      errorBreakdown: errorBreakdown.map((e) => ({
        code: e.errorCode,
        count: e._count,
      })),
      recentErrors: recentErrors.map((e) => ({
        id: e.id,
        status: e.status,
        errorCode: e.errorCode,
        errorMessage: e.errorMessage,
        phone: e.conversation?.lead?.phone || null,
        createdAt: e.createdAt,
        failedAt: e.failedAt,
      })),
    });
  }

  /**
   * Full Twilio Account Diagnostics
   * Fetches: balance, account status, A2P brand/campaign info,
   * messaging services, phone numbers, usage records
   */
  static async getTwilioDiagnostics(req: AuthRequest, res: Response): Promise<void> {
    const client = getTwilioClient();
    if (!client) {
      res.status(503).json({ error: 'Twilio client not configured' });
      return;
    }

    const smsMode = await getSmsMode();
    const diagnostics: Record<string, any> = {
      timestamp: new Date().toISOString(),
      smsMode,
      configuredSid: config.twilio.accountSid?.slice(0, 8) + '...',
    };

    // ── 1) Account Info & Balance ──
    try {
      const account = await client.api.accounts(config.twilio.accountSid).fetch();
      diagnostics.account = {
        friendlyName: account.friendlyName,
        status: account.status, // active, suspended, closed
        type: account.type, // Full, Trial
        dateCreated: account.dateCreated,
        ownerAccountSid: account.ownerAccountSid,
      };
    } catch (err: any) {
      diagnostics.account = { error: err.message };
    }

    try {
      const balance = await client.api.accounts(config.twilio.accountSid).balance.fetch();
      diagnostics.balance = {
        currency: balance.currency,
        balance: balance.balance,
        accountSid: balance.accountSid,
      };
    } catch (err: any) {
      diagnostics.balance = { error: err.message };
    }

    // ── 2) Phone Numbers ──
    try {
      const numbers = await client.incomingPhoneNumbers.list({ limit: 100 });
      diagnostics.phoneNumbers = numbers.map((n) => ({
        sid: n.sid,
        phoneNumber: n.phoneNumber,
        friendlyName: n.friendlyName,
        smsEnabled: n.capabilities?.sms ?? false,
        mmsEnabled: n.capabilities?.mms ?? false,
        voiceEnabled: n.capabilities?.voice ?? false,
        statusCallback: n.statusCallback,
        smsUrl: n.smsUrl,
      }));
      diagnostics.phoneNumberCount = numbers.length;
    } catch (err: any) {
      diagnostics.phoneNumbers = { error: err.message };
    }

    // ── 3) Messaging Services ──
    try {
      const services = await client.messaging.v1.services.list({ limit: 20 });
      diagnostics.messagingServices = services.map((s) => ({
        sid: s.sid,
        friendlyName: s.friendlyName,
        inboundRequestUrl: s.inboundRequestUrl,
        statusCallback: s.statusCallback,
        useInboundWebhookOnNumber: s.useInboundWebhookOnNumber,
        // A2P compliance
        usecase: s.usecase,
        areaToBind: s.areaCodeGeomatch,
        stickySender: s.stickySender,
        fallbackToLongCode: s.fallbackToLongCode,
      }));
    } catch (err: any) {
      diagnostics.messagingServices = { error: err.message };
    }

    // ── 4) A2P 10DLC Brand Registrations ──
    try {
      const brands = await client.messaging.v1.brandRegistrations.list({ limit: 20 });
      diagnostics.a2pBrands = brands.map((b) => ({
        sid: b.sid,
        brandName: b.customerProfileBundleSid,
        status: (b as any).brandRegistrationStatus || (b as any).status,
        brandType: b.brandType,
        dateCreated: b.dateCreated,
        dateUpdated: b.dateUpdated,
        failureReason: (b as any).failureReason || null,
      }));
    } catch (err: any) {
      diagnostics.a2pBrands = { error: err.message };
    }

    // ── 5) A2P Campaign Registrations ──
    try {
      // Fetch campaigns for known messaging services
      if (diagnostics.messagingServices && Array.isArray(diagnostics.messagingServices)) {
        const campaigns: any[] = [];
        for (const svc of diagnostics.messagingServices) {
          try {
            const usAppToPersonList = await client.messaging.v1.services(svc.sid).usAppToPerson.list({ limit: 10 });
            for (const c of usAppToPersonList) {
              campaigns.push({
                sid: c.sid,
                messagingServiceSid: svc.sid,
                brandRegistrationSid: c.brandRegistrationSid,
                description: c.description,
                usecase: (c as any).usecase,
                campaignStatus: (c as any).campaignStatus,
                dateCreated: c.dateCreated,
                dateUpdated: c.dateUpdated,
              });
            }
          } catch {
            /* service may not have A2P campaigns */
          }
        }
        diagnostics.a2pCampaigns = campaigns;
      }
    } catch (err: any) {
      diagnostics.a2pCampaigns = { error: err.message };
    }

    // ── 6) Usage Records (last 30 days — SMS sent/received/cost) ──
    try {
      const usage = await client.usage.records.list({
        category: 'sms' as any,
        startDate: subDays(new Date(), 30),
        endDate: new Date(),
        limit: 5,
      });
      diagnostics.usage = usage.map((u) => ({
        category: u.category,
        description: u.description,
        count: u.count,
        countUnit: u.countUnit,
        price: u.price,
        priceUnit: u.priceUnit,
        startDate: u.startDate,
        endDate: u.endDate,
      }));
    } catch (err: any) {
      diagnostics.usage = { error: err.message };
    }

    // ── 7) Toll-Free Verification (if applicable) ──
    try {
      const tfVerifications = await (client as any).messaging.v1.tollfreeVerifications.list({ limit: 10 });
      diagnostics.tollFreeVerifications = tfVerifications.map((v: any) => ({
        sid: v.sid,
        status: v.status,
        phoneNumber: v.phoneNumber?.toString(),
        dateCreated: v.dateCreated,
        dateUpdated: v.dateUpdated,
      }));
    } catch (err: any) {
      diagnostics.tollFreeVerifications = { error: err.message };
    }

    // ── 8) Rate Limits & Sending Limits ──
    try {
      // Check daily sending volume in our DB
      const today = new Date();
      const startOfToday = startOfDay(today);
      const sentToday = await prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: startOfToday },
          status: { in: ['SENT', 'DELIVERED', 'SENDING'] },
        },
      });
      const failedToday = await prisma.message.count({
        where: {
          direction: 'OUTBOUND',
          createdAt: { gte: startOfToday },
          status: 'FAILED',
        },
      });
      diagnostics.todayVolume = {
        sent: sentToday,
        failed: failedToday,
        total: sentToday + failedToday,
        failureRate: sentToday + failedToday > 0 ? +((failedToday / (sentToday + failedToday)) * 100).toFixed(2) : 0,
      };
    } catch (err: any) {
      diagnostics.todayVolume = { error: err.message };
    }

    // ── 9) Regulatory Compliance Bundles ──
    try {
      const bundles = await client.numbers.v2.regulatoryCompliance.bundles.list({ limit: 10 });
      diagnostics.complianceBundles = bundles.map((b) => ({
        sid: b.sid,
        friendlyName: b.friendlyName,
        status: b.status,
        regulationSid: b.regulationSid,
        dateCreated: b.dateCreated,
        dateUpdated: b.dateUpdated,
      }));
    } catch (err: any) {
      diagnostics.complianceBundles = { error: err.message };
    }

    logger.info('Twilio diagnostics fetched', { by: req.user?.email });

    // ── 10) Trust Hub Customer Profiles ──
    try {
      const profiles = await (client as any).trusthub.v1.customerProfiles.list({ limit: 10 });
      diagnostics.trustHubProfiles = profiles.map((p: any) => ({
        sid: p.sid,
        friendlyName: p.friendlyName,
        status: p.status,
        statusCallback: p.statusCallback,
        policySid: p.policySid,
        dateCreated: p.dateCreated,
        dateUpdated: p.dateUpdated,
      }));
    } catch (err: any) {
      diagnostics.trustHubProfiles = { error: err.message };
    }

    // ── 11) Sub-accounts (if main account) ──
    try {
      const subAccounts = await client.api.accounts.list({ limit: 20 });
      diagnostics.subAccounts = subAccounts
        .filter((a: any) => a.sid !== config.twilio.accountSid)
        .map((a: any) => ({
          sid: a.sid,
          friendlyName: a.friendlyName,
          status: a.status,
          type: a.type,
          dateCreated: a.dateCreated,
        }));
    } catch (err: any) {
      diagnostics.subAccounts = { error: err.message };
    }

    // ── 12) Usage by category (sms, sms-inbound, phone numbers) ──
    try {
      const allUsage = await client.usage.records.list({
        startDate: subDays(new Date(), 30),
        endDate: new Date(),
        limit: 30,
      });
      diagnostics.usageByCategory = allUsage
        .filter((u: any) => parseFloat(u.price || '0') !== 0 || parseInt(u.count || '0', 10) > 0)
        .map((u: any) => ({
          category: u.category,
          description: u.description,
          count: u.count,
          price: u.price,
          priceUnit: u.priceUnit,
        }));
    } catch (err: any) {
      diagnostics.usageByCategory = { error: err.message };
    }

    // ── 13) Message statistics from Twilio (last 24h) ──
    try {
      const recentMessages = await client.messages.list({
        dateSentAfter: subDays(new Date(), 1),
        limit: 20,
      });
      const statusMap: Record<string, number> = {};
      for (const m of recentMessages) {
        const s = m.status;
        statusMap[s] = (statusMap[s] || 0) + 1;
      }
      diagnostics.twilioMessageStats24h = {
        sample: recentMessages.length,
        statuses: statusMap,
      };
    } catch (err: any) {
      diagnostics.twilioMessageStats24h = { error: err.message };
    }

    res.json(diagnostics);
  }
}
