import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { campaignQueue } from '../services/sendingEngine';
import { ComplianceService } from '../services/complianceService';
import { NumberService } from '../services/numberService';
import { OutboundGateService } from '../services/outboundGateService';
import { getActiveTwilioClient } from '../config/twilio';
import logger from '../config/logger';

const AI_COHORT_IDS = {
  MULTI_RETARGET: 'multi-retarget',
  NEW_RESTAURANTS: 'new-restaurants',
  RENEWAL: 'renewal',
} as const;

type AiCohortId = (typeof AI_COHORT_IDS)[keyof typeof AI_COHORT_IDS];

type AiCohortSpec = {
  id: AiCohortId;
  title: string;
  priorityLabel: string;
  cohortType: 'multi-retarget' | 'new-cohort' | 'renewal';
  adminOnly: boolean;
  cooldownDays: number;
  predictedReplyRate: number;
  fundedRate: number;
  historicalAnchor: string;
  reasoningLead: string;
  reasoningText: string;
  defaultMessageTemplate: string;
};

const AI_COHORT_SPECS: Record<AiCohortId, AiCohortSpec> = {
  [AI_COHORT_IDS.MULTI_RETARGET]: {
    id: AI_COHORT_IDS.MULTI_RETARGET,
    title: 'Cross-rep retarget — replied with $80K+ revenue, stalled at docs',
    priorityLabel: 'HIGH PRIORITY',
    cohortType: 'multi-retarget',
    adminOnly: false,
    cooldownDays: 7,
    predictedReplyRate: 14,
    fundedRate: 0.0123,
    historicalAnchor: 'Last cross-rep retarget: 412 leads -> 54 replies -> 5 funded · $148K total',
    reasoningLead: "Pulled across all reps' campaigns.",
    reasoningText:
      'Pattern matches prior funded deals where re-engagement worked 30+ days post-stall with a HELOC alternative offer. Suggested send: Tue-Thu 11am ET.',
    defaultMessageTemplate:
      'Hi {{firstName}}, checking back in from SCL. We may have a different funding option for {{company}} based on the last conversation. Worth a quick look?',
  },
  [AI_COHORT_IDS.NEW_RESTAURANTS]: {
    id: AI_COHORT_IDS.NEW_RESTAURANTS,
    title: 'Restaurants · $80K+ rev · never contacted across all rep imports',
    priorityLabel: 'OPPORTUNITY',
    cohortType: 'new-cohort',
    adminOnly: false,
    cooldownDays: 7,
    predictedReplyRate: 9,
    fundedRate: 0.0065,
    historicalAnchor: 'Last restaurant cohort: 1,500 leads -> 142 replies -> 11 funded · $315K total',
    reasoningLead: "Cohort spans all reps' lists.",
    reasoningText:
      'Restaurants show the strongest single-industry reply rate across funded history. Recommend a smaller test cohort first to validate copy.',
    defaultMessageTemplate:
      'Hi {{firstName}}, SCL helps restaurants compare working-capital options quickly. Is {{company}} looking at funding in the next few weeks?',
  },
  [AI_COHORT_IDS.RENEWAL]: {
    id: AI_COHORT_IDS.RENEWAL,
    title: 'Funded 8-12 mo ago · likely renewals · admin-only',
    priorityLabel: 'RENEWAL',
    cohortType: 'renewal',
    adminOnly: true,
    cooldownDays: 30,
    predictedReplyRate: 28,
    fundedRate: 0.0685,
    historicalAnchor: 'Last renewal batch: 64 leads -> 17 replies -> 5 funded · $245K total',
    reasoningLead: "Admin-only cohort, all reps' funded history.",
    reasoningText:
      'Renewal close rate is materially higher than cold lead rate based on funded history. Personalize with prior funding context before launch.',
    defaultMessageTemplate:
      'Hi {{firstName}}, it has been a few months since the last funding round. Should we review renewal options for {{company}} this week?',
  },
};

export class CampaignController {
  private static readonly SEND_ATTEMPT_STATUSES = ['SENT', 'DELIVERED', 'FAILED', 'UNDELIVERED', 'BLOCKED'] as const;
  private static readonly FAILED_OR_BLOCKED_STATUSES = ['FAILED', 'UNDELIVERED', 'BLOCKED'] as const;

  private static isAdminLike(req: AuthRequest): boolean {
    return req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER';
  }

  private static getCampaignCaps(req: AuthRequest): { campaignCap: number; dailyCap: number } {
    return req.user?.role === 'REP' ? { campaignCap: 500, dailyCap: 800 } : { campaignCap: 3000, dailyCap: 4500 };
  }

  private static async getAiCampaignCapacity(req: AuthRequest): Promise<{
    campaignCap: number;
    dailyCap: number;
    dailyUsed: number;
    dailyRemaining: number;
    nearlyFull: boolean;
  }> {
    const { campaignCap, dailyCap } = CampaignController.getCampaignCaps(req);
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const dailyUsed = await prisma.message.count({
      where: {
        direction: 'OUTBOUND',
        sentByUserId: req.user!.id,
        createdAt: { gte: since },
        status: { in: [...CampaignController.SEND_ATTEMPT_STATUSES] },
      },
    });
    const dailyRemaining = Math.max(0, dailyCap - dailyUsed);

    return {
      campaignCap,
      dailyCap,
      dailyUsed,
      dailyRemaining,
      nearlyFull: dailyRemaining <= Math.ceil(dailyCap * 0.1),
    };
  }

  private static assertAiCohortAllowed(spec: AiCohortSpec, req: AuthRequest): void {
    if (spec.adminOnly && !CampaignController.isAdminLike(req)) {
      throw new AppError('This AI cohort is admin-only', 403);
    }
  }

  private static activeLeadWhere(req: AuthRequest): any {
    const where: any = {
      deletedAt: null,
      optedOut: false,
      isSuppressed: false,
      status: { not: 'DNC' },
    };

    if (req.user?.role === 'REP') where.assignedRepId = req.user.id;

    return where;
  }

  private static withCooldown(where: any, cooldownDays: number): any {
    const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);

    return {
      ...where,
      conversations: {
        ...(where.conversations || {}),
        none: {
          messages: {
            some: {
              direction: 'OUTBOUND',
              createdAt: { gte: since },
            },
          },
        },
      },
    };
  }

  private static buildAiCohortWhere(spec: AiCohortSpec, req: AuthRequest): any {
    const baseWhere = CampaignController.activeLeadWhere(req);

    if (spec.id === AI_COHORT_IDS.MULTI_RETARGET) {
      return {
        ...baseWhere,
        status: { in: ['REPLIED', 'INTERESTED', 'DOCS_REQUESTED'] },
        deal: { is: null },
        conversations: {
          some: {
            extractedRevenue: { gte: 80000 },
            messages: { some: { direction: 'INBOUND' } },
          },
        },
      };
    }

    if (spec.id === AI_COHORT_IDS.NEW_RESTAURANTS) {
      return {
        ...baseWhere,
        campaignLeads: { none: {} },
        lastContactedAt: null,
        OR: [
          { company: { contains: 'Restaurant' } },
          { company: { contains: 'Cafe' } },
          { source: { contains: 'restaurant' } },
          {
            conversations: {
              some: { extractedIndustry: { contains: 'Restaurant' }, extractedRevenue: { gte: 80000 } },
            },
          },
          { conversations: { some: { extractedIndustry: { contains: 'Food' }, extractedRevenue: { gte: 80000 } } } },
        ],
      };
    }

    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const eightMonthsAgo = new Date();
    eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);

    return {
      ...baseWhere,
      deal: {
        is: {
          stage: 'FUNDED',
          fundedDate: {
            gte: twelveMonthsAgo,
            lte: eightMonthsAgo,
          },
        },
      },
    };
  }

  private static async resolveAiCohort(
    cohortId: string,
    req: AuthRequest,
    capacity: Awaited<ReturnType<typeof CampaignController.getAiCampaignCapacity>>,
    includeLeads = false,
  ): Promise<any> {
    const spec = AI_COHORT_SPECS[cohortId as AiCohortId];
    if (!spec) throw new AppError('AI cohort not found', 404);

    CampaignController.assertAiCohortAllowed(spec, req);

    const baseWhere = CampaignController.buildAiCohortWhere(spec, req);
    const eligibleWhere = CampaignController.withCooldown(baseWhere, spec.cooldownDays);
    const [totalMatchCount, eligibleCount] = await Promise.all([
      prisma.lead.count({ where: baseWhere }),
      prisma.lead.count({ where: eligibleWhere }),
    ]);
    const resolvedLeadCount = Math.min(eligibleCount, capacity.campaignCap, capacity.dailyRemaining);
    const expectedFunded = resolvedLeadCount > 0 ? Math.max(1, Math.round(resolvedLeadCount * spec.fundedRate)) : 0;
    const cooldownExcluded = Math.max(0, totalMatchCount - eligibleCount);
    const capTrimmed = Math.max(0, eligibleCount - resolvedLeadCount);
    const warnings: string[] = [];

    if (cooldownExcluded > 0) {
      warnings.push(`${cooldownExcluded} leads are inside ${spec.cooldownDays}d cooldown and were excluded`);
    }
    if (capTrimmed > 0) {
      warnings.push(`${capTrimmed} eligible leads exceed current campaign/daily capacity`);
    }
    if (capacity.nearlyFull) {
      warnings.push(`Daily capacity nearly full: ${capacity.dailyRemaining} of ${capacity.dailyCap} remaining`);
    }

    const leadRows =
      includeLeads && resolvedLeadCount > 0
        ? await prisma.lead.findMany({
            where: eligibleWhere,
            select: {
              id: true,
              firstName: true,
              lastName: true,
              company: true,
              source: true,
              status: true,
              assignedRep: { select: { firstName: true, lastName: true, initials: true } },
              conversations: {
                take: 1,
                orderBy: { updatedAt: 'desc' },
                select: { extractedIndustry: true, extractedRevenue: true },
              },
            },
            orderBy: { updatedAt: 'desc' },
            take: resolvedLeadCount,
          })
        : [];

    return {
      id: spec.id,
      cohortType: spec.cohortType,
      title: spec.title,
      priorityLabel: spec.priorityLabel,
      adminOnly: spec.adminOnly,
      leadCount: resolvedLeadCount,
      totalMatchCount,
      eligibleCount,
      predictedReplyRate: spec.predictedReplyRate,
      expectedFunded,
      historicalAnchor: spec.historicalAnchor,
      reasoningLead: spec.reasoningLead,
      reasoningText: spec.reasoningText,
      warnings,
      cooldownDays: spec.cooldownDays,
      cap: {
        campaignCap: capacity.campaignCap,
        dailyCap: capacity.dailyCap,
        dailyUsed: capacity.dailyUsed,
        dailyRemaining: capacity.dailyRemaining,
        trimmed: capTrimmed,
      },
      defaults: {
        name: `AI Retarget — ${spec.title.split(' — ')[0]}`,
        messageTemplate: spec.defaultMessageTemplate,
      },
      leadIds: leadRows.map((lead) => lead.id),
      sampleLeads: leadRows.slice(0, 25),
    };
  }

  private static phoneDigits(raw?: string | null): string {
    return String(raw || '').replace(/\D/g, '');
  }

  private static phoneLookupVariants(raw?: string | null): string[] {
    const digits = CampaignController.phoneDigits(raw);
    if (!digits) return [];

    const variants = new Set<string>();
    variants.add(digits);
    variants.add(`+${digits}`);

    if (digits.length === 10) {
      variants.add(`1${digits}`);
      variants.add(`+1${digits}`);
    }

    if (digits.length === 11 && digits.startsWith('1')) {
      const local = digits.slice(1);
      variants.add(local);
      variants.add(`+1${local}`);
    }

    return Array.from(variants);
  }

  private static ensureRetargetAccess(sourceCampaign: { id: string; createdById: string }, req: AuthRequest): void {
    if (req.user?.role === 'REP' && sourceCampaign.createdById !== req.user.id) {
      throw new AppError('You can only retarget your own campaigns', 403);
    }
  }

  private static ensureCampaignAccess(campaign: { id: string; createdById: string }, req: AuthRequest): void {
    if (req.user?.role === 'REP' && campaign.createdById !== req.user.id) {
      throw new AppError('Access denied: you can only manage your own campaigns', 403);
    }
  }

  private static async buildRetargetPreview(sourceCampaignId: string): Promise<{
    sourceCampaign: {
      id: string;
      name: string;
      messageTemplate: string;
      numberPoolId: string | null;
      sendingSpeed: number;
      dailyLimit: number | null;
      createdById: string;
    };
    summary: {
      totalDelivered: number;
      replied: number;
      failedBlocked: number;
      dncFiltered: number;
      willReceive: number;
    };
    defaults: {
      name: string;
      messageTemplate: string;
    };
    eligibleLeadIds: string[];
  }> {
    const sourceCampaign = await prisma.campaign.findUnique({
      where: { id: sourceCampaignId },
      select: {
        id: true,
        name: true,
        messageTemplate: true,
        numberPoolId: true,
        sendingSpeed: true,
        dailyLimit: true,
        createdById: true,
      },
    });

    if (!sourceCampaign) throw new AppError('Source campaign not found', 404);

    const [sourceCampaignLeads, sourceMessages] = await Promise.all([
      prisma.campaignLead.findMany({
        where: { campaignId: sourceCampaignId },
        select: {
          status: true,
          leadId: true,
          lead: {
            select: {
              id: true,
              phone: true,
              status: true,
              optedOut: true,
              isSuppressed: true,
            },
          },
        },
      }),
      prisma.message.findMany({
        where: {
          campaignId: sourceCampaignId,
          direction: 'OUTBOUND',
        },
        select: {
          status: true,
          sentAt: true,
          createdAt: true,
          conversation: {
            select: {
              leadId: true,
            },
          },
        },
      }),
    ]);

    const leadById = new Map(
      sourceCampaignLeads.map((row) => [
        row.leadId,
        {
          id: row.lead.id,
          phone: row.lead.phone,
          status: row.lead.status,
          optedOut: row.lead.optedOut,
          isSuppressed: row.lead.isSuppressed,
        },
      ]),
    );

    const repliedByCampaignStatusLeadIds = new Set(
      sourceCampaignLeads.filter((row) => row.status === 'REPLIED').map((row) => row.leadId),
    );

    const outboundByLead = new Map<
      string,
      {
        firstOutboundAt: Date;
        hasDelivered: boolean;
        hasFailedOrBlocked: boolean;
      }
    >();

    for (const msg of sourceMessages) {
      const leadId = msg.conversation.leadId;
      if (!leadId) continue;

      const outboundAt = msg.sentAt || msg.createdAt;
      const current = outboundByLead.get(leadId);
      if (!current) {
        outboundByLead.set(leadId, {
          firstOutboundAt: outboundAt,
          hasDelivered: msg.status === 'DELIVERED',
          hasFailedOrBlocked: CampaignController.FAILED_OR_BLOCKED_STATUSES.includes(
            msg.status as (typeof CampaignController.FAILED_OR_BLOCKED_STATUSES)[number],
          ),
        });
        continue;
      }

      if (outboundAt < current.firstOutboundAt) current.firstOutboundAt = outboundAt;
      if (msg.status === 'DELIVERED') current.hasDelivered = true;
      if (
        CampaignController.FAILED_OR_BLOCKED_STATUSES.includes(
          msg.status as (typeof CampaignController.FAILED_OR_BLOCKED_STATUSES)[number],
        )
      ) {
        current.hasFailedOrBlocked = true;
      }
    }

    const deliveredLeadIds = Array.from(outboundByLead.entries())
      .filter(([, entry]) => entry.hasDelivered)
      .map(([leadId]) => leadId);

    const failedBlocked = Array.from(outboundByLead.values()).filter(
      (entry) => entry.hasFailedOrBlocked && !entry.hasDelivered,
    ).length;

    const missingLeadIds = deliveredLeadIds.filter((leadId) => !leadById.has(leadId));
    if (missingLeadIds.length > 0) {
      const missingLeads = await prisma.lead.findMany({
        where: { id: { in: missingLeadIds } },
        select: { id: true, phone: true, status: true, optedOut: true, isSuppressed: true },
      });
      for (const lead of missingLeads) {
        leadById.set(lead.id, lead);
      }
    }

    const minOutboundAt = deliveredLeadIds.reduce<Date | null>((minAt, leadId) => {
      const at = outboundByLead.get(leadId)?.firstOutboundAt;
      if (!at) return minAt;
      if (!minAt || at < minAt) return at;
      return minAt;
    }, null);

    const inboundMessages =
      deliveredLeadIds.length > 0 && minOutboundAt
        ? await prisma.message.findMany({
            where: {
              direction: 'INBOUND',
              createdAt: { gte: minOutboundAt },
              conversation: {
                leadId: { in: deliveredLeadIds },
              },
            },
            select: {
              createdAt: true,
              conversation: {
                select: {
                  leadId: true,
                },
              },
            },
          })
        : [];

    const repliedLeadIds = new Set<string>();
    for (const leadId of deliveredLeadIds) {
      if (repliedByCampaignStatusLeadIds.has(leadId)) {
        repliedLeadIds.add(leadId);
      }
    }

    for (const message of inboundMessages) {
      const leadId = message.conversation.leadId;
      if (!leadId) continue;
      const firstOutboundAt = outboundByLead.get(leadId)?.firstOutboundAt;
      if (!firstOutboundAt) continue;
      if (message.createdAt >= firstOutboundAt) {
        repliedLeadIds.add(leadId);
      }
    }

    const deliveredLeads: Array<{
      leadId: string;
      lead: {
        id: string;
        phone: string;
        status: string;
        optedOut: boolean;
        isSuppressed: boolean;
      };
    }> = [];
    for (const leadId of deliveredLeadIds) {
      const lead = leadById.get(leadId);
      if (!lead) continue;
      deliveredLeads.push({ leadId, lead });
    }

    const suppressionLookup = new Set<string>();
    for (const row of deliveredLeads) {
      for (const variant of CampaignController.phoneLookupVariants(row.lead.phone)) {
        suppressionLookup.add(variant);
      }
    }

    const suppressionRows =
      suppressionLookup.size > 0
        ? await prisma.suppressionEntry.findMany({
            where: {
              phone: { in: Array.from(suppressionLookup) },
            },
            select: { phone: true },
          })
        : [];

    const suppressedDigits = new Set(
      suppressionRows.map((row) => CampaignController.phoneDigits(row.phone)).filter(Boolean),
    );

    const dncLeadIds = new Set<string>();
    for (const row of deliveredLeads) {
      const isDncStatus = row.lead.status === 'DNC';
      const isOptedOut = row.lead.optedOut;
      const isSuppressed = row.lead.isSuppressed;
      const phoneDigits = CampaignController.phoneDigits(row.lead.phone);
      const inSuppressionList = phoneDigits ? suppressedDigits.has(phoneDigits) : false;
      if (isDncStatus || isOptedOut || isSuppressed || inSuppressionList) {
        dncLeadIds.add(row.leadId);
      }
    }

    // Filter order is strict: Delivered -> exclude Replied -> exclude DNC.
    const afterReplyLeadIds = deliveredLeadIds.filter((leadId) => !repliedLeadIds.has(leadId));
    const dncFilteredLeadIds = afterReplyLeadIds.filter((leadId) => dncLeadIds.has(leadId));
    const eligibleLeadIds = afterReplyLeadIds.filter((leadId) => !dncLeadIds.has(leadId));

    return {
      sourceCampaign,
      summary: {
        totalDelivered: deliveredLeadIds.length,
        replied: repliedLeadIds.size,
        failedBlocked: failedBlocked,
        dncFiltered: dncFilteredLeadIds.length,
        willReceive: eligibleLeadIds.length,
      },
      defaults: {
        name: `Retarget — ${sourceCampaign.name}`,
        messageTemplate: sourceCampaign.messageTemplate,
      },
      eligibleLeadIds,
    };
  }

  static async listAiCohorts(req: AuthRequest, res: Response): Promise<void> {
    const capacity = await CampaignController.getAiCampaignCapacity(req);
    const campaignWhere = req.user?.role === 'REP' ? { createdById: req.user.id } : {};
    const sourceCampaignCount = await prisma.campaign.count({ where: campaignWhere });
    const specs = Object.values(AI_COHORT_SPECS).filter(
      (spec) => !spec.adminOnly || CampaignController.isAdminLike(req),
    );
    const cohorts = [];

    for (const spec of specs) {
      const cohort = await CampaignController.resolveAiCohort(spec.id, req, capacity, false);
      if (cohort.totalMatchCount > 0) cohorts.push(cohort);
    }

    res.json({
      cohorts,
      capacity,
      sourceCampaignCount,
      refreshedAt: new Date().toISOString(),
      summary: {
        cohortCount: cohorts.length,
        expectedFunded: cohorts.reduce((sum, cohort) => sum + cohort.expectedFunded, 0),
      },
    });
  }

  static async previewAiCohort(req: AuthRequest, res: Response): Promise<void> {
    const { cohortId } = req.params;
    const capacity = await CampaignController.getAiCampaignCapacity(req);
    const cohort = await CampaignController.resolveAiCohort(cohortId, req, capacity, true);

    res.json({ cohort });
  }

  static async buildAiCohortCampaign(req: AuthRequest, res: Response): Promise<void> {
    const { cohortId } = req.params;
    const { name, messageTemplate } = req.body as { name?: string; messageTemplate?: string };
    const capacity = await CampaignController.getAiCampaignCapacity(req);
    const cohort = await CampaignController.resolveAiCohort(cohortId, req, capacity, true);

    if (cohort.leadIds.length === 0) {
      throw new AppError(
        `AI cohort capacity exceeded: requested ${cohort.eligibleCount}, role ${req.user?.role || 'UNKNOWN'}, per-campaign cap ${capacity.campaignCap}, daily used ${capacity.dailyUsed}/${capacity.dailyCap}, remaining ${capacity.dailyRemaining}`,
        400,
      );
    }

    await OutboundGateService.ensureCanLaunchOutbound(req.user);

    const campaignName = (name || cohort.defaults.name).trim();
    const resolvedMessageTemplate = (messageTemplate || cohort.defaults.messageTemplate).trim();
    const lineage = `AI Cohort · ${cohort.leadIds.length} leads · ~${cohort.expectedFunded} funded expected`;

    const campaign = await prisma.$transaction(async (tx: any) => {
      const createdCampaign = await tx.campaign.create({
        data: {
          name: campaignName,
          description: lineage,
          messageTemplate: resolvedMessageTemplate,
          sendingSpeed: 60,
          dailyLimit: Math.min(cohort.leadIds.length, capacity.campaignCap),
          createdById: req.user!.id,
          status: 'DRAFT',
          totalLeads: cohort.leadIds.length,
          isRetarget: true,
          sourceCampaignId: null,
        },
      });

      await tx.campaignLead.createMany({
        data: cohort.leadIds.map((leadId: string) => ({
          campaignId: createdCampaign.id,
          leadId,
          status: 'PENDING',
        })),
        skipDuplicates: true,
      });

      return createdCampaign;
    });

    res.status(201).json({
      campaign,
      cohort: {
        id: cohort.id,
        title: cohort.title,
        leadCount: cohort.leadIds.length,
        expectedFunded: cohort.expectedFunded,
        lineage,
      },
      message: 'AI cohort campaign created as draft',
    });
  }

  static async list(req: AuthRequest, res: Response): Promise<void> {
    const { status, search, page = '1', limit = '20' } = req.query;
    const skip = (parseInt(page as string) - 1) * parseInt(limit as string);

    const where: any = {};
    if (status) where.status = status;
    if (search) {
      where.name = { contains: search as string };
    }
    if (req.user?.role === 'REP') {
      where.createdById = req.user.id;
    }

    const [campaigns, total] = await Promise.all([
      (prisma.campaign as any).findMany({
        where,
        skip,
        take: parseInt(limit as string),
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { leads: true } },
          sourceCampaign: {
            select: { id: true, name: true },
          },
          createdBy: {
            select: { id: true, firstName: true, lastName: true, initials: true },
          },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    // Use message-based counters so "Sent" reflects actual attempts, not queued items.
    const campaignIds = (campaigns as any[]).map((c: any) => c.id);
    const [liveRows, numberRows, repRows, failureReasonRows, leadStatusRows] =
      campaignIds.length > 0
        ? await Promise.all([
            prisma.message.groupBy({
              by: ['campaignId', 'status'],
              where: {
                campaignId: { in: campaignIds },
                direction: 'OUTBOUND',
                status: { in: [...CampaignController.SEND_ATTEMPT_STATUSES] },
              },
              _count: { id: true },
            }),
            // Breakdown по номерам
            prisma.message.groupBy({
              by: ['campaignId', 'phoneNumberId'],
              where: {
                campaignId: { in: campaignIds },
                direction: 'OUTBOUND',
                status: { in: [...CampaignController.SEND_ATTEMPT_STATUSES] },
                phoneNumberId: { not: null },
              },
              _count: { id: true },
            }),
            // Breakdown по репам
            prisma.message.groupBy({
              by: ['campaignId', 'sentByUserId'],
              where: {
                campaignId: { in: campaignIds },
                direction: 'OUTBOUND',
                status: { in: [...CampaignController.SEND_ATTEMPT_STATUSES] },
                sentByUserId: { not: null },
              },
              _count: { id: true },
            }),
            // Breakdown причин только для Failed (FAILED + UNDELIVERED)
            prisma.message.groupBy({
              by: ['campaignId', 'errorCode', 'errorMessage'],
              where: {
                campaignId: { in: campaignIds },
                direction: 'OUTBOUND',
                status: { in: ['FAILED', 'UNDELIVERED'] },
              },
              _count: { id: true },
            }),
            prisma.campaignLead.groupBy({
              by: ['campaignId', 'status'],
              where: { campaignId: { in: campaignIds } },
              _count: { id: true },
            }),
          ])
        : [[], [], [], [], []];

    // Получаем имена номеров и репов
    const phoneNumberIds = [...new Set(numberRows.map((r) => r.phoneNumberId).filter(Boolean))] as string[];
    const repIds = [...new Set(repRows.map((r) => r.sentByUserId).filter(Boolean))] as string[];

    const [phoneNumbers, repUsers] = await Promise.all([
      phoneNumberIds.length > 0
        ? prisma.phoneNumber.findMany({
            where: { id: { in: phoneNumberIds } },
            select: { id: true, phoneNumber: true },
          })
        : [],
      repIds.length > 0
        ? prisma.user.findMany({
            where: { id: { in: repIds } },
            select: { id: true, firstName: true, lastName: true },
          })
        : [],
    ]);

    const phoneMap = new Map(phoneNumbers.map((p) => [p.id, p.phoneNumber]));
    const repNameMap = new Map(repUsers.map((r) => [r.id, `${r.firstName} ${r.lastName?.[0] || ''}.`]));

    // Собираем per-campaign breakdown maps
    const numberByCampaign = new Map<string, Array<{ number: string; count: number }>>();
    for (const row of numberRows) {
      if (!row.campaignId || !row.phoneNumberId) continue;
      const arr = numberByCampaign.get(row.campaignId) || [];
      arr.push({ number: phoneMap.get(row.phoneNumberId) || row.phoneNumberId, count: row._count.id });
      numberByCampaign.set(row.campaignId, arr);
    }

    const repByCampaign = new Map<string, Array<{ name: string; count: number }>>();
    for (const row of repRows) {
      if (!row.campaignId || !row.sentByUserId) continue;
      const arr = repByCampaign.get(row.campaignId) || [];
      arr.push({ name: repNameMap.get(row.sentByUserId) || 'Unknown', count: row._count.id });
      repByCampaign.set(row.campaignId, arr);
    }

    // Group failure reasons by campaign and error code
    const failureReasonMapByCampaign = new Map<string, Map<string, { code: string; message: string; count: number }>>();
    for (const row of failureReasonRows) {
      if (!row.campaignId) continue;
      const code = (row.errorCode || '').trim() || 'UNKNOWN';
      const message = (row.errorMessage || '').trim();
      const byCode = failureReasonMapByCampaign.get(row.campaignId) || new Map();
      const current = byCode.get(code);
      if (current) {
        current.count += row._count.id;
        if (!current.message && message) current.message = message;
      } else {
        byCode.set(code, { code, message, count: row._count.id });
      }
      failureReasonMapByCampaign.set(row.campaignId, byCode);
    }

    const failureReasonsByCampaign = new Map<string, Array<{ code: string; message: string; count: number }>>();
    for (const [campaignId, byCode] of failureReasonMapByCampaign.entries()) {
      failureReasonsByCampaign.set(
        campaignId,
        Array.from(byCode.values()).sort((a, b) => b.count - a.count),
      );
    }

    const leadStatusByCampaign = new Map<
      string,
      { pending: number; skipped: number; delivered: number; failed: number; replied: number }
    >();
    for (const row of leadStatusRows) {
      if (!row.campaignId) continue;
      const current = leadStatusByCampaign.get(row.campaignId) || {
        pending: 0,
        skipped: 0,
        delivered: 0,
        failed: 0,
        replied: 0,
      };
      const count = row._count.id;
      if (row.status === 'PENDING') current.pending += count;
      if (row.status === 'SKIPPED') current.skipped += count;
      if (row.status === 'DELIVERED') current.delivered += count;
      if (row.status === 'FAILED') current.failed += count;
      if (row.status === 'REPLIED') current.replied += count;
      leadStatusByCampaign.set(row.campaignId, current);
    }

    const liveByCampaign = new Map<
      string,
      { totalSent: number; totalDelivered: number; totalFailed: number; totalBlocked: number }
    >();
    for (const row of liveRows) {
      if (!row.campaignId) continue;
      const current = liveByCampaign.get(row.campaignId) || {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalBlocked: 0,
      };
      const count = row._count.id;

      current.totalSent += count;
      if (row.status === 'DELIVERED') current.totalDelivered += count;
      if (row.status === 'FAILED' || row.status === 'UNDELIVERED') current.totalFailed += count;
      if (row.status === 'BLOCKED') current.totalBlocked += count;

      liveByCampaign.set(row.campaignId, current);
    }

    const campaignsWithLiveCounters = (campaigns as any[]).map((campaign: any) => {
      const live = liveByCampaign.get(campaign.id) || {
        totalSent: 0,
        totalDelivered: 0,
        totalFailed: 0,
        totalBlocked: 0,
      };
      const numbers = (numberByCampaign.get(campaign.id) || []).sort((a, b) => b.count - a.count);
      const reps = (repByCampaign.get(campaign.id) || []).sort((a, b) => b.count - a.count);
      const leadBreakdown = leadStatusByCampaign.get(campaign.id) || {
        pending: 0,
        skipped: 0,
        delivered: 0,
        failed: 0,
        replied: 0,
      };
      const aiBuilt = Boolean(
        campaign.isRetarget && !campaign.sourceCampaignId && String(campaign.description || '').startsWith('AI Cohort'),
      );
      return {
        ...campaign,
        sourceCampaignName: campaign.sourceCampaign?.name || null,
        creatorInitials:
          campaign.createdBy?.initials ||
          `${campaign.createdBy?.firstName?.[0] || ''}${campaign.createdBy?.lastName?.[0] || ''}` ||
          null,
        aiBuilt,
        aiLineageLabel: aiBuilt ? campaign.description : null,
        totalLeads: campaign._count?.leads ?? campaign.totalLeads ?? 0,
        totalSent: live.totalSent,
        totalDelivered: live.totalDelivered,
        totalFailed: live.totalFailed,
        totalBlocked: live.totalBlocked,
        sentBreakdown: { numbers, reps },
        failedBreakdown: { reasons: failureReasonsByCampaign.get(campaign.id) || [] },
        leadBreakdown,
      };
    });

    res.json({
      campaigns: campaignsWithLiveCounters,
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

    const campaign = await (prisma.campaign as any).findUnique({
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
        sourceCampaign: {
          select: { id: true, name: true },
        },
      },
    });

    if (!campaign) throw new AppError('Campaign not found', 404);
    CampaignController.ensureCampaignAccess(campaign, req);

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
      deletedAt: null,
    };
    if (req.user?.role === 'REP') {
      leadQuery.assignedRepId = req.user.id;
    }

    let hasFilter = false;

    if (leadIds && leadIds.length > 0) {
      leadQuery.id = { in: leadIds };
      hasFilter = true;
    } else {
      if (filterTags && filterTags.length > 0) {
        leadQuery.tags = {
          some: { tagId: { in: filterTags } },
        };
        hasFilter = true;
      }
      if (filterStatus && filterStatus.length > 0) {
        leadQuery.status = { in: filterStatus };
        hasFilter = true;
      }
      if (filterSource) {
        leadQuery.source = filterSource;
        hasFilter = true;
      }
      if (filterState) {
        leadQuery.state = filterState;
        hasFilter = true;
      }
    }

    // Safety: if no filter criteria provided, don't add any leads (prevents adding ALL leads)
    let leads: { id: string }[] = [];
    if (hasFilter) {
      leads = await prisma.lead.findMany({
        where: leadQuery,
        select: { id: true },
      });
    }

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
    CampaignController.ensureCampaignAccess(campaign, req);

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

    const campaign = await prisma.campaign.findUnique({
      where: { id },
      include: { _count: { select: { leads: true } } },
    });
    if (!campaign) throw new AppError('Campaign not found', 404);
    CampaignController.ensureCampaignAccess(campaign, req);

    if (!['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status)) {
      throw new AppError('Campaign cannot be started in current status', 400);
    }

    await OutboundGateService.ensureCanLaunchOutbound(req.user);

    // Pre-validate: check quiet hours before queueing
    if (await ComplianceService.isQuietHours()) {
      throw new AppError('Cannot start campaign during quiet hours. Adjust quiet hours in Settings → Compliance.', 400);
    }

    // Pre-validate: check that leads exist
    if (campaign._count.leads === 0) {
      throw new AppError('Campaign has no leads. Add leads before starting.', 400);
    }

    let pendingCount = await prisma.campaignLead.count({
      where: { campaignId: id, status: 'PENDING' },
    });
    const isRetargetCampaign = Boolean((campaign as any).isRetarget);

    // Recovery logic: if no pending leads, try to recover SKIPPED leads back to PENDING.
    // For DRAFT retarget campaigns: all leads may have been SKIPPED by the auto-start
    // due to ownership guard — allow recovery regardless of prior message history.
    if (pendingCount === 0 && ['DRAFT', 'PAUSED', 'COMPLETED'].includes(campaign.status)) {
      const hasUnsentGap = (campaign.totalSent || 0) < campaign._count.leads;
      if (hasUnsentGap || campaign.status === 'DRAFT') {
        const skippedCandidates = await prisma.campaignLead.findMany({
          where: {
            campaignId: id,
            status: 'SKIPPED',
          },
          select: {
            id: true,
            leadId: true,
            lead: {
              select: {
                phone: true,
                assignedRepId: true,
                optedOut: true,
                isSuppressed: true,
              },
            },
          },
          take: 10000,
        });

        if (skippedCandidates.length > 0) {
          const leadIds = skippedCandidates.map((row) => row.leadId);
          const phones = skippedCandidates.map((row) => row.lead.phone);

          // Also fetch the campaign creator role for admin bypass
          const campaignCreator = await prisma.user.findUnique({
            where: { id: campaign.createdById },
            select: { role: true },
          });
          const isAdminOrManager = campaignCreator?.role === 'ADMIN' || campaignCreator?.role === 'MANAGER';

          const [existingConvos, suppressedEntries] = await Promise.all([
            prisma.conversation.findMany({
              where: { leadId: { in: leadIds } },
              select: {
                leadId: true,
                assignedRepId: true,
                // Count only INBOUND (replies) to match sendingEngine logic.
                _count: { select: { messages: { where: { direction: 'INBOUND' } } } },
              },
            }),
            prisma.suppressionEntry.findMany({
              where: { phone: { in: phones } },
              select: { phone: true },
            }),
          ]);

          const blockedPhones = new Set(suppressedEntries.map((row) => row.phone));
          const convoByLead = new Map(existingConvos.map((row) => [row.leadId, row]));
          const recoverableIds = skippedCandidates
            .filter((row) => {
              const conversation = convoByLead.get(row.leadId);

              // For regular campaigns: skip leads who have replied (have inbound messages).
              // Leads that were only sent outbound messages (no reply) are recoverable.
              // For retarget campaigns: these leads always have prior threads by design — allow recovery.
              // Admins/managers can also bypass this check.
              if (!isRetargetCampaign && !isAdminOrManager) {
                const hasReplied = (conversation?._count?.messages || 0) > 0;
                if (hasReplied) return false;
              }

              // Ownership check: only enforce if the lead has actually replied (has inbound messages).
              // If a lead was only sent outbound messages and never replied, they are not "claimed"
              // by any rep — any campaign can contact them again.
              // Admins and managers bypass this entirely.
              if (!isAdminOrManager) {
                const hasReplied = (conversation?._count?.messages || 0) > 0; // _count is INBOUND-only
                if (hasReplied) {
                  const effectiveOwnerId = conversation?.assignedRepId || row.lead.assignedRepId || null;
                  if (effectiveOwnerId && effectiveOwnerId !== campaign.createdById) return false;
                }
              }

              if (row.lead.optedOut || row.lead.isSuppressed || blockedPhones.has(row.lead.phone)) return false;

              return true;
            })
            .map((row) => row.id);

          if (recoverableIds.length === 0) {
            logger.info(`Campaign ${id}: no policy-eligible skipped leads to recover on resume`);
          } else {
            await prisma.campaignLead.updateMany({
              where: { id: { in: recoverableIds } },
              data: {
                status: 'PENDING',
                sentAt: null,
                deliveredAt: null,
                repliedAt: null,
                fromNumber: null,
                errorCode: null,
              },
            });
            pendingCount = recoverableIds.length;
            logger.warn(
              `Campaign ${id}: recovered ${recoverableIds.length} eligible skipped leads back to PENDING on resume`,
            );
          }
        }

        if (pendingCount === 0) {
          logger.info(`Campaign ${id}: no recoverable leads found for resume`);
        }
      }
    }
    if (pendingCount === 0) {
      throw new AppError(
        'Campaign has no sendable leads. All leads were skipped — they may have already replied ' +
          '(use Retarget to follow up with non-responders from the original campaign), ' +
          'belong to another rep, or failed a compliance check.',
        400,
      );
    }

    let restrictToPhoneNumberIds: string[] | undefined;
    const creator = await prisma.user.findUnique({
      where: { id: campaign.createdById },
      select: { role: true },
    });
    const assignedActiveNumberIds = await NumberService.getActiveAssignedNumberIds(campaign.createdById);

    if (creator?.role === 'REP') {
      restrictToPhoneNumberIds = assignedActiveNumberIds;
      if (restrictToPhoneNumberIds.length === 0) {
        throw new AppError('This rep has no active assigned numbers. Assign numbers in Numbers page first.', 400);
      }
    } else if (assignedActiveNumberIds.length > 0) {
      // Admin/manager campaigns are also pinned to assigned active numbers when assignments exist.
      restrictToPhoneNumberIds = assignedActiveNumberIds;
    }

    // Pre-validate: check that at least one sending number is available
    const availableNumber = await NumberService.getBestAvailableNumber(
      [],
      campaign.numberPoolId || undefined,
      restrictToPhoneNumberIds,
    );
    if (!availableNumber) {
      throw new AppError('No available phone numbers for sending. Check Numbers settings.', 400);
    }

    // Add to processing queue
    await campaignQueue.add('campaign-start', {
      action: 'start',
      campaignId: id,
    });

    res.json({ message: 'Campaign queued for sending' });
  }

  static async retargetPreview(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const preview = await CampaignController.buildRetargetPreview(id);
    CampaignController.ensureRetargetAccess(preview.sourceCampaign, req);

    res.json({
      sourceCampaign: {
        id: preview.sourceCampaign.id,
        name: preview.sourceCampaign.name,
      },
      defaults: preview.defaults,
      summary: preview.summary,
    });
  }

  static async retargetCreate(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, messageTemplate } = req.body as { name: string; messageTemplate: string };

    const preview = await CampaignController.buildRetargetPreview(id);
    CampaignController.ensureRetargetAccess(preview.sourceCampaign, req);

    await OutboundGateService.ensureCanLaunchOutbound(req.user);

    if (preview.summary.willReceive === 0) {
      throw new AppError('No eligible recipients. All delivered contacts have replied or are on DNC.', 400);
    }

    if (await ComplianceService.isQuietHours()) {
      throw new AppError('Cannot start retarget campaign during quiet hours. Adjust quiet hours in Settings.', 400);
    }

    let restrictToPhoneNumberIds: string[] | undefined;
    const assignedActiveNumberIds = await NumberService.getActiveAssignedNumberIds(req.user!.id);
    if (req.user?.role === 'REP') {
      restrictToPhoneNumberIds = assignedActiveNumberIds;
      if (restrictToPhoneNumberIds.length === 0) {
        throw new AppError('This rep has no active assigned numbers. Assign numbers in Numbers page first.', 400);
      }
    } else if (assignedActiveNumberIds.length > 0) {
      restrictToPhoneNumberIds = assignedActiveNumberIds;
    }

    const availableNumber = await NumberService.getBestAvailableNumber(
      [],
      preview.sourceCampaign.numberPoolId || undefined,
      restrictToPhoneNumberIds,
    );
    if (!availableNumber) {
      throw new AppError('No available phone numbers for sending. Check Numbers settings.', 400);
    }

    const campaign = await prisma.$transaction(async (tx: any) => {
      const createdCampaign = await (tx.campaign as any).create({
        data: {
          name,
          messageTemplate,
          numberPoolId: preview.sourceCampaign.numberPoolId || null,
          sendingSpeed: preview.sourceCampaign.sendingSpeed || 60,
          dailyLimit: preview.sourceCampaign.dailyLimit,
          createdById: req.user!.id,
          status: 'DRAFT',
          totalLeads: preview.eligibleLeadIds.length,
          isRetarget: true,
          sourceCampaignId: preview.sourceCampaign.id,
        },
      });

      await tx.campaignLead.createMany({
        data: preview.eligibleLeadIds.map((leadId) => ({
          campaignId: createdCampaign.id,
          leadId,
          status: 'PENDING',
        })),
        skipDuplicates: true,
      });

      return createdCampaign;
    });

    try {
      await campaignQueue.add('campaign-start', {
        action: 'start',
        campaignId: campaign.id,
      });
    } catch (error: any) {
      await prisma.campaign.update({
        where: { id: campaign.id },
        data: { status: 'DRAFT', startedAt: null },
      });
      throw new AppError(`Failed to queue retarget campaign: ${error.message}`, 500);
    }

    res.status(201).json({
      campaign,
      summary: preview.summary,
      message: 'Retarget campaign created and queued for sending',
    });
  }

  static async pause(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);
    CampaignController.ensureCampaignAccess(campaign, req);

    await prisma.campaign.update({
      where: { id },
      data: { status: 'PAUSED' },
    });

    res.json({ message: 'Campaign paused' });
  }

  static async cancel(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);
    CampaignController.ensureCampaignAccess(campaign, req);

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
        createdById: true,
      },
    });

    if (!campaign) throw new AppError('Campaign not found', 404);
    CampaignController.ensureCampaignAccess(campaign, req);

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
      deliveryRate: campaign.totalSent > 0 ? ((campaign.totalDelivered / campaign.totalSent) * 100).toFixed(1) : '0',
      replyRate:
        campaign.totalDelivered > 0 ? ((campaign.totalReplied / campaign.totalDelivered) * 100).toFixed(1) : '0',
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

  /**
   * Sync stuck message statuses from Twilio API.
   * Queries Twilio for actual status of messages stuck in SENT/QUEUED/SENDING.
   */
  static async syncStatuses(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const campaign = await prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new AppError('Campaign not found', 404);
    CampaignController.ensureCampaignAccess(campaign, req);

    const stuckMessages = await prisma.message.findMany({
      where: {
        campaignId: id,
        status: { in: ['SENT', 'QUEUED', 'SENDING'] },
        twilioMessageSid: { not: null },
      },
      select: { id: true, twilioMessageSid: true, status: true, phoneNumberId: true, conversationId: true },
    });

    if (stuckMessages.length === 0) {
      res.json({ message: 'No stuck messages to sync', synced: 0 });
      return;
    }

    const client = await getActiveTwilioClient();
    if (!client) throw new AppError('Twilio client not configured', 500);

    let delivered = 0;
    let failed = 0;
    let unchanged = 0;
    let errors = 0;

    for (const msg of stuckMessages) {
      try {
        const twilioMsg = await client.messages(msg.twilioMessageSid!).fetch();
        const statusMap: Record<string, string> = {
          queued: 'QUEUED',
          sending: 'SENDING',
          sent: 'SENT',
          delivered: 'DELIVERED',
          failed: 'FAILED',
          undelivered: 'UNDELIVERED',
        };
        const newStatus = statusMap[twilioMsg.status] || twilioMsg.status.toUpperCase();
        const isBlocked = twilioMsg.errorCode === 30007 || twilioMsg.errorCode === 30034;
        const finalStatus = isBlocked ? 'BLOCKED' : newStatus;

        if (finalStatus === msg.status) {
          unchanged++;
          continue;
        }

        await prisma.message.update({
          where: { id: msg.id },
          data: {
            status: finalStatus as any,
            ...(finalStatus === 'DELIVERED' && { deliveredAt: new Date() }),
            ...(finalStatus === 'FAILED' || finalStatus === 'UNDELIVERED' || isBlocked
              ? {
                  failedAt: new Date(),
                  errorCode: String(twilioMsg.errorCode || ''),
                  errorMessage: twilioMsg.errorMessage || '',
                }
              : {}),
          },
        });

        if (finalStatus === 'DELIVERED') delivered++;
        else if (['FAILED', 'UNDELIVERED', 'BLOCKED'].includes(finalStatus)) failed++;
        else unchanged++;
      } catch (err: any) {
        logger.error(`Sync error for ${msg.twilioMessageSid}: ${err.message}`);
        errors++;
      }
    }

    // Recalculate campaign counters from actual data
    const statusCounts = await prisma.message.groupBy({
      by: ['status'],
      where: { campaignId: id },
      _count: true,
    });

    const counts: Record<string, number> = {};
    for (const s of statusCounts) counts[s.status] = s._count;

    await prisma.campaign.update({
      where: { id },
      data: {
        totalSent:
          (counts['SENT'] || 0) +
          (counts['DELIVERED'] || 0) +
          (counts['FAILED'] || 0) +
          (counts['UNDELIVERED'] || 0) +
          (counts['BLOCKED'] || 0),
        totalDelivered: counts['DELIVERED'] || 0,
        totalFailed: (counts['FAILED'] || 0) + (counts['UNDELIVERED'] || 0),
        totalBlocked: counts['BLOCKED'] || 0,
      },
    });

    res.json({
      message: `Synced ${stuckMessages.length} messages`,
      delivered,
      failed,
      unchanged,
      errors,
    });
  }
}
