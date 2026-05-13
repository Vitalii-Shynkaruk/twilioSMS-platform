import { Response } from 'express';
import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { campaignQueue } from '../services/sendingEngine';
import { ComplianceService } from '../services/complianceService';
import { NumberService } from '../services/numberService';
import { OutboundGateService } from '../services/outboundGateService';
import { getActiveTwilioClient } from '../config/twilio';
import logger from '../config/logger';
import { AIService, CohortReasoningLeadSample } from '../services/aiService';
import {
  MAX_BULK_SEND_PER_ADMIN,
  MAX_BULK_SEND_PER_REP,
  MAX_DAILY_TOTAL_PER_ADMIN,
  MAX_DAILY_TOTAL_PER_REP,
} from '../config/limits';

const AI_COHORT_IDS = {
  MULTI_RETARGET: 'multi-retarget',
  NEW_RESTAURANTS: 'new-restaurants',
  RENEWAL: 'renewal',
} as const;

type AiCohortId = (typeof AI_COHORT_IDS)[keyof typeof AI_COHORT_IDS];

type AiCohortSpec = {
  id: AiCohortId;
  title: string;
  categoryLabel: string;
  description: string;
  priorityLabel: string;
  cohortType: 'multi-retarget' | 'new-cohort' | 'renewal';
  adminOnly: boolean;
  cooldownDays: number;
  historicalLabel: string;
  reasoningLead: string;
  reasoningText: string;
  defaultMessageTemplate: string;
};

interface AiCohortPerformanceMetrics {
  predictedReplyRate: number;
  fundedRate: number;
  historicalAnchor: string;
  deliveredCount: number;
  replyCount: number;
  fundedCount: number;
}

interface AiCohortCapacity {
  campaignCap: number;
  dailyCap: number;
  dailyUsed: number;
  dailyRemaining: number;
  nearlyFull: boolean;
}

interface AiCohortLeadRow {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  source?: string | null;
  status: string;
  updatedAt?: Date;
  industry?: string | null;
  monthlyRevenue?: Prisma.Decimal | number | null;
  assignedRep?: {
    firstName?: string | null;
    lastName?: string | null;
    initials?: string | null;
  } | null;
  conversations?: Array<{
    extractedIndustry?: string | null;
    extractedRevenue?: number | null;
  }>;
  cooldownOverride?: boolean;
}

interface AiCohortIndustryGroup {
  industry: string;
  leadCount: number;
  totalRevenue: number;
  averageRevenue: number;
}

interface AiCohortWhereResult {
  where: any;
  metadata?: Record<string, unknown>;
}

interface AiCohortResolveOptions {
  persistSnapshot?: boolean;
  forceReasoningRefresh?: boolean;
  includeCooldown?: boolean;
}

interface AiCohortJobUser {
  id: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
}

const AI_COHORT_SPECS: Record<AiCohortId, AiCohortSpec> = {
  [AI_COHORT_IDS.MULTI_RETARGET]: {
    id: AI_COHORT_IDS.MULTI_RETARGET,
    title: 'Cross-campaign no-reply retarget - top industry first',
    categoryLabel: 'Multi-Campaign Retarget',
    description:
      'Find leads delivered across 2+ scoped campaigns with no reply, then rank industries by revenue before build.',
    priorityLabel: 'HIGH PRIORITY',
    cohortType: 'multi-retarget',
    adminOnly: false,
    cooldownDays: 7,
    historicalLabel: 'cross-campaign retarget',
    reasoningLead: 'Scoped to the same campaign ownership rules as the operator.',
    reasoningText:
      'The cohort only keeps delivered, no-reply leads seen in 2+ prior campaigns, then surfaces the highest-revenue industry first.',
    defaultMessageTemplate:
      'Hi {{firstName}}, checking back in from SCL. We may have a different funding option for {{company}} based on the last conversation. Worth a quick look?',
  },
  [AI_COHORT_IDS.NEW_RESTAURANTS]: {
    id: AI_COHORT_IDS.NEW_RESTAURANTS,
    title: 'High-revenue silent leads - top funded industries',
    categoryLabel: 'New Cohort',
    description:
      'Target $80K+ delivered, no-reply leads in the industries that converted most in the last 90 days of funded history.',
    priorityLabel: 'OPPORTUNITY',
    cohortType: 'new-cohort',
    adminOnly: false,
    cooldownDays: 7,
    historicalLabel: 'high-revenue silent cohort',
    reasoningLead: 'Industry filter refreshes from recent funded history each cohort cycle.',
    reasoningText:
      'The cohort refreshes from the last 90 days of funded deals, keeps the strongest converting industries, and excludes retarget campaigns from the historical anchor.',
    defaultMessageTemplate:
      'Hi {{firstName}}, SCL is seeing strong funding demand in your industry right now. Is {{company}} exploring capital in the next few weeks?',
  },
  [AI_COHORT_IDS.RENEWAL]: {
    id: AI_COHORT_IDS.RENEWAL,
    title: 'Funded 8-12 months ago - likely renewals, admin-only',
    categoryLabel: 'Renewal',
    description: 'Surface previously funded businesses that are likely ready for a renewal conversation.',
    priorityLabel: 'RENEWAL',
    cohortType: 'renewal',
    adminOnly: true,
    cooldownDays: 30,
    historicalLabel: 'renewal batch',
    reasoningLead: "Admin-only cohort, all reps' funded history.",
    reasoningText:
      'Renewal close rate is materially higher than cold lead rate based on funded history. Personalize with prior funding context before launch.',
    defaultMessageTemplate:
      'Hi {{firstName}}, it has been a few months since the last funding round. Should we review renewal options for {{company}} this week?',
  },
};

export class CampaignController {
  private static readonly AI_RETARGET_MAX_LEADS = 350;
  private static readonly SEND_ATTEMPT_STATUSES = ['SENT', 'DELIVERED', 'FAILED', 'UNDELIVERED', 'BLOCKED'] as const;
  private static readonly FAILED_OR_BLOCKED_STATUSES = ['FAILED', 'UNDELIVERED', 'BLOCKED'] as const;

  private static isAdminLike(req: AuthRequest): boolean {
    return req.user?.role === 'ADMIN' || req.user?.role === 'MANAGER';
  }

  private static getCampaignCaps(req: AuthRequest): { campaignCap: number; dailyCap: number } {
    return req.user?.role === 'REP'
      ? { campaignCap: MAX_BULK_SEND_PER_REP, dailyCap: MAX_DAILY_TOTAL_PER_REP }
      : { campaignCap: MAX_BULK_SEND_PER_ADMIN, dailyCap: MAX_DAILY_TOTAL_PER_ADMIN };
  }

  private static async getAiCampaignCapacity(req: AuthRequest): Promise<AiCohortCapacity> {
    const { campaignCap: defaultCampaignCap, dailyCap: defaultDailyCap } = CampaignController.getCampaignCaps(req);
    const userId = req.user?.id;
    const assignedCapacity = userId ? await NumberService.getAssignedNumberCapacity(userId) : null;

    let campaignCap = defaultCampaignCap;
    let dailyCap = defaultDailyCap;
    let dailyUsed: number;

    if (assignedCapacity) {
      dailyCap = assignedCapacity.dailyCap;
      dailyUsed = assignedCapacity.dailyUsed;

      if (req.user?.role === 'REP') {
        campaignCap = Math.max(defaultCampaignCap, assignedCapacity.dailyCap);
      }
    } else {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
      dailyUsed = await prisma.campaignLead.count({
        where: {
          campaign: { createdById: userId },
          createdAt: { gte: since },
        },
      });
    }

    const dailyRemaining = Math.max(0, dailyCap - dailyUsed);

    return {
      campaignCap,
      dailyCap,
      dailyUsed,
      dailyRemaining,
      nearlyFull: dailyRemaining <= Math.ceil(dailyCap * 0.1),
    };
  }

  private static async respondIfCampaignCapsExceeded(
    req: AuthRequest,
    res: Response,
    requestedLeadCount: number,
  ): Promise<boolean> {
    const capacity = await CampaignController.getAiCampaignCapacity(req);
    const role = CampaignController.isAdminLike(req) ? 'admin' : 'rep';

    if (requestedLeadCount > capacity.campaignCap) {
      res.status(400).json({
        error: 'PER_CAMPAIGN_CAP_EXCEEDED',
        message: `Campaign size (${requestedLeadCount}) exceeds the ${capacity.campaignCap}-lead per-campaign limit. Reduce the cohort.`,
        requested: requestedLeadCount,
        cap: capacity.campaignCap,
        role,
      });
      return true;
    }

    if (capacity.dailyUsed + requestedLeadCount > capacity.dailyCap) {
      const remaining = Math.max(0, capacity.dailyCap - capacity.dailyUsed);
      res.status(400).json({
        error: 'DAILY_TOTAL_CAP_EXCEEDED',
        message: `Daily capacity: ${capacity.dailyUsed} of ${capacity.dailyCap} already used. Adding ${requestedLeadCount} would push over. Remaining capacity: ${remaining}.`,
        dailyUsed: capacity.dailyUsed,
        dailyTotalCap: capacity.dailyCap,
        remaining,
        requested: requestedLeadCount,
      });
      return true;
    }

    return false;
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
    const { conversations, AND, ...restWhere } = where;
    const andConditions = Array.isArray(AND) ? [...AND] : AND ? [AND] : [];

    if (conversations) {
      andConditions.push({ conversations });
    }

    andConditions.push({
      conversations: {
        none: {
          messages: {
            some: {
              direction: 'OUTBOUND',
              createdAt: { gte: since },
            },
          },
        },
      },
    });

    return {
      ...restWhere,
      AND: andConditions,
    };
  }

  private static withRecentOutboundTouch(where: any, cooldownDays: number): any {
    const since = new Date(Date.now() - cooldownDays * 24 * 60 * 60 * 1000);
    const { conversations, AND, ...restWhere } = where;
    const andConditions = Array.isArray(AND) ? [...AND] : AND ? [AND] : [];

    if (conversations) {
      andConditions.push({ conversations });
    }

    andConditions.push({
      conversations: {
        some: {
          messages: {
            some: {
              direction: 'OUTBOUND',
              createdAt: { gte: since },
            },
          },
        },
      },
    });

    return {
      ...restWhere,
      AND: andConditions,
    };
  }

  private static getRenewalFundedWindow(): { twelveMonthsAgo: Date; eightMonthsAgo: Date } {
    const twelveMonthsAgo = new Date();
    twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
    const eightMonthsAgo = new Date();
    eightMonthsAgo.setMonth(eightMonthsAgo.getMonth() - 8);

    return { twelveMonthsAgo, eightMonthsAgo };
  }

  private static async buildRenewalLeadWhere(req: AuthRequest): Promise<AiCohortWhereResult> {
    const baseWhere = CampaignController.activeLeadWhere(req);
    const { twelveMonthsAgo, eightMonthsAgo } = CampaignController.getRenewalFundedWindow();
    const fundedDealWhere = {
      stage: 'FUNDED' as const,
      fundedDate: {
        gte: twelveMonthsAgo,
        lte: eightMonthsAgo,
      },
    };

    const fundedDeals = await prisma.deal.findMany({
      where: fundedDealWhere,
      select: {
        leadId: true,
        client: { select: { phone: true, email: true } },
      },
      take: 1000,
    });
    const directLeadIds = Array.from(
      new Set(fundedDeals.map((deal) => deal.leadId).filter((leadId): leadId is string => Boolean(leadId))),
    );
    const clientPhoneVariants = Array.from(
      new Set(fundedDeals.flatMap((deal) => CampaignController.phoneLookupVariants(deal.client?.phone))),
    );
    const clientEmails = Array.from(
      new Set(
        fundedDeals
          .map((deal) =>
            String(deal.client?.email || '')
              .trim()
              .toLowerCase(),
          )
          .filter((email) => email.length > 0),
      ),
    );
    const renewalLeadMatches: any[] = [
      {
        deal: {
          is: fundedDealWhere,
        },
      },
    ];

    if (directLeadIds.length > 0) {
      renewalLeadMatches.push({ id: { in: directLeadIds } });
    }
    if (clientPhoneVariants.length > 0) {
      renewalLeadMatches.push({ phone: { in: clientPhoneVariants } });
    }
    if (clientEmails.length > 0) {
      renewalLeadMatches.push({ email: { in: clientEmails } });
    }

    return {
      where: {
        ...baseWhere,
        OR: renewalLeadMatches,
      },
      metadata: {
        renewalFundedDealsScanned: fundedDeals.length,
        renewalDirectLeadIds: directLeadIds.length,
        renewalClientPhoneVariants: clientPhoneVariants.length,
        renewalClientEmails: clientEmails.length,
      },
    };
  }

  private static campaignScope(req: AuthRequest): Prisma.CampaignWhereInput {
    return req.user?.role === 'REP' ? { createdById: req.user.id } : {};
  }

  private static toFiniteNumber(value: unknown): number {
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private static stableJsonStringify(value: unknown): string {
    const normalize = (input: unknown): unknown => {
      if (Array.isArray(input)) {
        return input.map((entry) => normalize(entry));
      }

      if (input && typeof input === 'object') {
        return Object.keys(input as Record<string, unknown>)
          .sort()
          .reduce<Record<string, unknown>>((accumulator, key) => {
            accumulator[key] = normalize((input as Record<string, unknown>)[key]);
            return accumulator;
          }, {});
      }

      return input;
    };

    return JSON.stringify(normalize(value));
  }

  private static normalizeIndustryLabel(value: unknown): string | null {
    const raw = String(value || '')
      .trim()
      .replace(/\s+/g, ' ');
    if (!raw) return null;

    return raw
      .split(' ')
      .map((part) => (part ? `${part.charAt(0).toUpperCase()}${part.slice(1).toLowerCase()}` : part))
      .join(' ');
  }

  private static industryGroupKey(value: unknown): string | null {
    const normalized = CampaignController.normalizeIndustryLabel(value);
    if (!normalized) return null;

    return normalized
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  private static getLeadIndustry(lead: Pick<AiCohortLeadRow, 'industry' | 'conversations'>): string | null {
    return CampaignController.normalizeIndustryLabel(
      lead.industry || lead.conversations?.[0]?.extractedIndustry || null,
    );
  }

  private static getLeadRevenue(lead: Pick<AiCohortLeadRow, 'monthlyRevenue' | 'conversations'>): number {
    return Math.max(
      CampaignController.toFiniteNumber(lead.monthlyRevenue),
      CampaignController.toFiniteNumber(lead.conversations?.[0]?.extractedRevenue),
      0,
    );
  }

  private static async resolveScopedDeliveredNoReplyLeadIds(
    req: AuthRequest,
    minDeliveredCampaigns: number,
  ): Promise<string[]> {
    const campaignScope = CampaignController.campaignScope(req);
    const [deliveredRows, repliedRows] = await Promise.all([
      prisma.campaignLead.groupBy({
        by: ['leadId'],
        where: {
          status: 'DELIVERED',
          campaign: campaignScope,
        },
        _count: { campaignId: true },
      }),
      prisma.campaignLead.findMany({
        where: {
          status: 'REPLIED',
          campaign: campaignScope,
        },
        select: { leadId: true },
      }),
    ]);

    const repliedLeadIds = new Set(repliedRows.map((row) => row.leadId));

    return deliveredRows
      .filter((row) => row._count.campaignId >= minDeliveredCampaigns && !repliedLeadIds.has(row.leadId))
      .map((row) => row.leadId);
  }

  private static async fetchAiCohortLeadRows(where: any, take?: number): Promise<AiCohortLeadRow[]> {
    return prisma.lead.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        company: true,
        source: true,
        status: true,
        updatedAt: true,
        industry: true,
        monthlyRevenue: true,
        assignedRep: { select: { firstName: true, lastName: true, initials: true } },
        conversations: {
          take: 1,
          orderBy: { updatedAt: 'desc' },
          select: { extractedIndustry: true, extractedRevenue: true },
        },
      },
      orderBy: { updatedAt: 'desc' },
      ...(typeof take === 'number' ? { take } : {}),
    });
  }

  private static buildRankedIndustryGroups(
    leadRows: AiCohortLeadRow[],
    preferredIndustries: string[] = [],
  ): Array<AiCohortIndustryGroup & { leadIds: string[] }> {
    const preferredOrder = new Map(
      preferredIndustries
        .map((industry, index) => [CampaignController.industryGroupKey(industry), index] as const)
        .filter(([industryKey]) => Boolean(industryKey)),
    );
    const groups = new Map<string, AiCohortIndustryGroup & { leadIds: string[]; sortIndex: number }>();

    leadRows.forEach((lead) => {
      const industry = CampaignController.getLeadIndustry(lead) || 'Unknown';
      const industryKey = CampaignController.industryGroupKey(industry) || industry.toLowerCase();
      const current = groups.get(industryKey) || {
        industry,
        leadCount: 0,
        totalRevenue: 0,
        averageRevenue: 0,
        leadIds: [],
        sortIndex: preferredOrder.get(industryKey) ?? Number.POSITIVE_INFINITY,
      };
      current.leadCount += 1;
      current.totalRevenue += CampaignController.getLeadRevenue(lead);
      current.averageRevenue = current.leadCount > 0 ? Math.round(current.totalRevenue / current.leadCount) : 0;
      current.leadIds.push(lead.id);
      groups.set(industryKey, current);
    });

    return Array.from(groups.values())
      .sort((left, right) => {
        if (left.sortIndex !== right.sortIndex) return left.sortIndex - right.sortIndex;
        if (right.totalRevenue !== left.totalRevenue) return right.totalRevenue - left.totalRevenue;
        if (right.leadCount !== left.leadCount) return right.leadCount - left.leadCount;
        return left.industry.localeCompare(right.industry);
      })
      .map(({ sortIndex: _sortIndex, ...group }) => group);
  }

  private static orderLeadRowsByIndustry(
    leadRows: AiCohortLeadRow[],
    preferredIndustries: string[] = [],
  ): { orderedLeadRows: AiCohortLeadRow[]; industryGroups: AiCohortIndustryGroup[] } {
    const rankedGroups = CampaignController.buildRankedIndustryGroups(leadRows, preferredIndustries);
    const groupOrder = new Map(
      rankedGroups
        .map((group, index) => [CampaignController.industryGroupKey(group.industry), index] as const)
        .filter(([industryKey]) => Boolean(industryKey)),
    );

    const orderedLeadRows = [...leadRows].sort((left, right) => {
      const leftGroup =
        groupOrder.get(CampaignController.industryGroupKey(CampaignController.getLeadIndustry(left) || 'Unknown')) ??
        Number.POSITIVE_INFINITY;
      const rightGroup =
        groupOrder.get(CampaignController.industryGroupKey(CampaignController.getLeadIndustry(right) || 'Unknown')) ??
        Number.POSITIVE_INFINITY;
      if (leftGroup !== rightGroup) return leftGroup - rightGroup;

      const revenueDiff = CampaignController.getLeadRevenue(right) - CampaignController.getLeadRevenue(left);
      if (revenueDiff !== 0) return revenueDiff;

      return (right.updatedAt?.getTime() || 0) - (left.updatedAt?.getTime() || 0);
    });

    return {
      orderedLeadRows,
      industryGroups: rankedGroups.map(({ industry, leadCount, totalRevenue, averageRevenue }) => ({
        industry,
        leadCount,
        totalRevenue,
        averageRevenue,
      })),
    };
  }

  private static async resolveTopFundedIndustries(req: AuthRequest, limit = 5): Promise<string[]> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const fundedDeals = await prisma.deal.findMany({
      where: {
        stage: 'FUNDED',
        ...(req.user?.role === 'REP' ? { assignedRepId: req.user.id } : {}),
        OR: [{ fundedDate: { gte: since } }, { fundedDate: null, createdAt: { gte: since } }],
      },
      select: {
        dealAmount: true,
        client: { select: { phone: true, email: true } },
        lead: {
          select: {
            id: true,
            phone: true,
            email: true,
            industry: true,
            monthlyRevenue: true,
            conversations: {
              take: 1,
              orderBy: { updatedAt: 'desc' },
              select: { extractedIndustry: true, extractedRevenue: true },
            },
          },
        },
      },
      take: 2000,
      orderBy: { createdAt: 'desc' },
    });

    const fallbackPhoneVariants = Array.from(
      new Set(
        fundedDeals
          .filter((deal) => !deal.lead)
          .flatMap((deal) => CampaignController.phoneLookupVariants(deal.client?.phone)),
      ),
    );
    const fallbackEmails = Array.from(
      new Set(
        fundedDeals
          .filter((deal) => !deal.lead)
          .map((deal) =>
            String(deal.client?.email || '')
              .trim()
              .toLowerCase(),
          )
          .filter((email) => email.length > 0),
      ),
    );

    const fallbackLeadOr: Prisma.LeadWhereInput[] = [];
    if (fallbackPhoneVariants.length > 0) {
      fallbackLeadOr.push({ phone: { in: fallbackPhoneVariants } });
    }
    if (fallbackEmails.length > 0) {
      fallbackLeadOr.push({ email: { in: fallbackEmails } });
    }

    const fallbackLeads =
      fallbackLeadOr.length > 0
        ? await prisma.lead.findMany({
            where: {
              deletedAt: null,
              OR: fallbackLeadOr,
            },
            select: {
              id: true,
              phone: true,
              email: true,
              industry: true,
              monthlyRevenue: true,
              conversations: {
                take: 1,
                orderBy: { updatedAt: 'desc' },
                select: { extractedIndustry: true, extractedRevenue: true },
              },
            },
          })
        : [];

    const fallbackLeadByPhone = new Map<string, (typeof fallbackLeads)[number]>();
    const fallbackLeadByEmail = new Map<string, (typeof fallbackLeads)[number]>();

    fallbackLeads.forEach((lead) => {
      CampaignController.phoneLookupVariants(lead.phone).forEach((variant) => {
        fallbackLeadByPhone.set(variant, lead);
      });

      const normalizedEmail = String(lead.email || '')
        .trim()
        .toLowerCase();
      if (normalizedEmail) {
        fallbackLeadByEmail.set(normalizedEmail, lead);
      }
    });

    const industryStats = new Map<string, { industry: string; fundedCount: number; totalVolume: number }>();

    fundedDeals.forEach((deal) => {
      const matchedLead =
        deal.lead ||
        CampaignController.phoneLookupVariants(deal.client?.phone)
          .map((variant) => fallbackLeadByPhone.get(variant))
          .find((lead): lead is NonNullable<typeof lead> => Boolean(lead)) ||
        fallbackLeadByEmail.get(
          String(deal.client?.email || '')
            .trim()
            .toLowerCase(),
        ) ||
        null;
      const industry = matchedLead ? CampaignController.getLeadIndustry(matchedLead) : null;
      const industryKey = CampaignController.industryGroupKey(industry);

      if (!industry || !industryKey) return;

      const current = industryStats.get(industryKey) || { industry, fundedCount: 0, totalVolume: 0 };
      current.fundedCount += 1;
      current.totalVolume +=
        CampaignController.toFiniteNumber(deal.dealAmount) ||
        (matchedLead ? CampaignController.getLeadRevenue(matchedLead) : 0);
      industryStats.set(industryKey, current);
    });

    return Array.from(industryStats.values())
      .sort((left, right) => {
        if (right.fundedCount !== left.fundedCount) return right.fundedCount - left.fundedCount;
        if (right.totalVolume !== left.totalVolume) return right.totalVolume - left.totalVolume;
        return left.industry.localeCompare(right.industry);
      })
      .slice(0, limit)
      .map((row) => row.industry);
  }

  private static async buildAiCohortWhere(spec: AiCohortSpec, req: AuthRequest): Promise<AiCohortWhereResult> {
    const baseWhere = CampaignController.activeLeadWhere(req);

    if (spec.id === AI_COHORT_IDS.MULTI_RETARGET) {
      const deliveredNoReplyLeadIds = await CampaignController.resolveScopedDeliveredNoReplyLeadIds(req, 2);

      return {
        where: {
          ...baseWhere,
          id: { in: deliveredNoReplyLeadIds },
          deal: { is: null },
        },
        metadata: {
          deliveredCampaignsMin: 2,
          noInboundReply: true,
        },
      };
    }

    if (spec.id === AI_COHORT_IDS.NEW_RESTAURANTS) {
      const deliveredNoReplyLeadIds = await CampaignController.resolveScopedDeliveredNoReplyLeadIds(req, 1);
      const industrySignals = await CampaignController.resolveTopFundedIndustries(req);
      const candidateLeadRows = await CampaignController.fetchAiCohortLeadRows({
        ...baseWhere,
        id: { in: deliveredNoReplyLeadIds },
      });
      const allowedIndustryKeys = new Set(
        industrySignals
          .map((industry) => CampaignController.industryGroupKey(industry))
          .filter((industryKey): industryKey is string => Boolean(industryKey)),
      );
      const filteredLeadIds = candidateLeadRows
        .filter((lead) => CampaignController.getLeadRevenue(lead) >= 80000)
        .filter((lead) => {
          if (allowedIndustryKeys.size === 0) return true;
          const industryKey = CampaignController.industryGroupKey(CampaignController.getLeadIndustry(lead));
          return !!industryKey && allowedIndustryKeys.has(industryKey);
        })
        .map((lead) => lead.id);

      return {
        where: {
          ...baseWhere,
          id: { in: filteredLeadIds },
        },
        metadata: {
          deliveredCampaignsMin: 1,
          noInboundReply: true,
          industrySignals,
          revenueMin: 80000,
          refreshWindowDays: 90,
        },
      };
    }

    return CampaignController.buildRenewalLeadWhere(req);
  }

  private static buildAiCohortCriteriaMetadata(
    spec: AiCohortSpec,
    req: AuthRequest,
    metadata: Record<string, unknown> = {},
    industryGroups: AiCohortIndustryGroup[] = [],
  ): Record<string, unknown> {
    const scope = req.user?.role === 'REP' ? { type: 'rep', userId: req.user.id } : { type: 'all-reps' };
    const industrySnapshot = industryGroups.slice(0, 5).map((group) => ({
      industry: group.industry,
      leadCount: group.leadCount,
      totalRevenue: group.totalRevenue,
    }));

    const baseCriteria = {
      activeOnly: true,
      excludes: ['deleted', 'opted_out', 'suppressed', 'DNC'],
      cooldownDays: spec.cooldownDays,
      scope,
    };

    if (spec.id === AI_COHORT_IDS.MULTI_RETARGET) {
      return {
        ...baseCriteria,
        deliveredCampaignsMin: 2,
        noInboundReply: true,
        primaryIndustry: industrySnapshot[0]?.industry || null,
        industryGroups: industrySnapshot,
        sortBy: 'industry_total_revenue',
        excludesExistingDeals: true,
      };
    }

    if (spec.id === AI_COHORT_IDS.NEW_RESTAURANTS) {
      return {
        ...baseCriteria,
        industrySignals: Array.isArray(metadata.industrySignals) ? metadata.industrySignals : [],
        primaryIndustry: industrySnapshot[0]?.industry || null,
        industryGroups: industrySnapshot,
        refreshWindowDays: metadata.refreshWindowDays || 90,
        deliveredCampaignsMin: metadata.deliveredCampaignsMin || 1,
        revenueMin: metadata.revenueMin || 80000,
        deliveredPriorCampaign: true,
        noInboundReply: true,
      };
    }

    return {
      ...baseCriteria,
      dealStage: 'FUNDED',
      fundedWindowMonthsAgo: { min: 8, max: 12 },
      adminOnly: true,
    };
  }

  private static toCohortReasoningLeadSamples(leadRows: AiCohortLeadRow[]): CohortReasoningLeadSample[] {
    return leadRows.slice(0, 5).map((lead) => {
      const conversation = lead.conversations?.[0];
      return {
        company: lead.company || lead.source || null,
        source: lead.source || null,
        status: lead.status,
        industry: conversation?.extractedIndustry || null,
        revenue: conversation?.extractedRevenue || null,
        assignedRepInitials: lead.assignedRep?.initials || null,
      };
    });
  }

  private static async fetchAiCohortSampleLeads(where: any, take: number): Promise<AiCohortLeadRow[]> {
    if (take <= 0) return [];

    return CampaignController.fetchAiCohortLeadRows(where, take);
  }

  private static buildComparableCampaignWhere(
    spec: AiCohortSpec,
    req: AuthRequest,
    metadata: Record<string, unknown> = {},
    options: { allReps?: boolean; since?: Date } = {},
  ): Prisma.CampaignWhereInput {
    const where: Prisma.CampaignWhereInput = {
      totalLeads: { gt: 0 },
      ...(options.since ? { createdAt: { gte: options.since } } : {}),
    };

    if (!options.allReps && req.user?.role === 'REP') {
      where.createdById = req.user.id;
    }

    if (spec.id === AI_COHORT_IDS.MULTI_RETARGET) {
      where.OR = [{ isRetarget: true }, { name: { contains: 'Retarget' } }, { name: { contains: 'retarget' } }];
      return where;
    }

    if (spec.id === AI_COHORT_IDS.NEW_RESTAURANTS) {
      where.isRetarget = false;

      const industrySignals = Array.isArray(metadata.industrySignals)
        ? metadata.industrySignals.filter(
            (industry): industry is string => typeof industry === 'string' && industry.trim().length > 0,
          )
        : [];

      if (industrySignals.length > 0) {
        where.leads = {
          some: {
            lead: {
              OR: industrySignals.flatMap((industry) => [
                { industry: { contains: industry } },
                { conversations: { some: { extractedIndustry: { contains: industry } } } },
              ]),
            },
          },
        };
      }

      return where;
    }

    where.OR = [
      { name: { contains: 'Renewal' } },
      { name: { contains: 'renewal' } },
      { leads: { some: { lead: { deal: { is: { stage: 'FUNDED' } } } } } },
    ];
    return where;
  }

  private static async countFundedOutcomes(
    campaignIds: string[],
    since?: Date,
  ): Promise<{ count: number; total: number }> {
    if (campaignIds.length === 0) return { count: 0, total: 0 };

    const aggregate = await prisma.fundingEvent.aggregate({
      where: {
        deal: {
          lead: {
            is: {
              campaignLeads: { some: { campaignId: { in: campaignIds } } },
            },
          },
        },
        ...(since
          ? {
              OR: [{ fundedDate: { gte: since } }, { fundedDate: null, createdAt: { gte: since } }],
            }
          : {}),
      },
      _count: { _all: true },
      _sum: { amountFunded: true },
    });

    return {
      count: aggregate._count._all,
      total: aggregate._sum.amountFunded || 0,
    };
  }

  private static formatHistoricalAnchor(
    spec: AiCohortSpec,
    input: {
      leadCount: number;
      replyCount: number;
      fundedCount: number;
      fundedTotal: number;
    },
  ): string {
    const fundedTotalK = Math.round(input.fundedTotal / 1000);
    const totalLabel = fundedTotalK > 0 ? `$${fundedTotalK.toLocaleString()}K total` : '$0 total';
    return `Last ${spec.historicalLabel}: ${input.leadCount.toLocaleString()} leads -> ${input.replyCount.toLocaleString()} replies -> ${input.fundedCount.toLocaleString()} funded · ${totalLabel}`;
  }

  private static async readCohortPerformanceMetrics(
    spec: AiCohortSpec,
    req: AuthRequest,
    metadata: Record<string, unknown> = {},
    options: { allReps?: boolean } = {},
  ): Promise<AiCohortPerformanceMetrics> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const campaignWhere = CampaignController.buildComparableCampaignWhere(spec, req, metadata, {
      allReps: options.allReps,
      since,
    });
    const campaigns = await prisma.campaign.findMany({
      where: campaignWhere,
      select: {
        id: true,
        totalLeads: true,
        totalDelivered: true,
        totalReplied: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const campaignIds = campaigns.map((campaign) => campaign.id);
    const deliveredCount = campaigns.reduce((sum, campaign) => sum + campaign.totalDelivered, 0);
    const replyCount = campaigns.reduce((sum, campaign) => sum + campaign.totalReplied, 0);
    const fundedOutcomes = await CampaignController.countFundedOutcomes(campaignIds, since);
    const predictedReplyRate = deliveredCount > 0 ? Math.round((replyCount / deliveredCount) * 100) : 0;
    const fundedRate = replyCount > 0 ? fundedOutcomes.count / replyCount : 0;

    const historicalCampaign = await prisma.campaign.findFirst({
      where: CampaignController.buildComparableCampaignWhere(spec, req, metadata, { allReps: options.allReps }),
      select: { id: true, totalLeads: true, totalReplied: true },
      orderBy: { createdAt: 'desc' },
    });
    const historicalOutcomes = historicalCampaign
      ? await CampaignController.countFundedOutcomes([historicalCampaign.id])
      : { count: 0, total: 0 };

    return {
      predictedReplyRate,
      fundedRate,
      historicalAnchor: historicalCampaign
        ? CampaignController.formatHistoricalAnchor(spec, {
            leadCount: historicalCampaign.totalLeads,
            replyCount: historicalCampaign.totalReplied,
            fundedCount: historicalOutcomes.count,
            fundedTotal: historicalOutcomes.total,
          })
        : '',
      deliveredCount,
      replyCount,
      fundedCount: fundedOutcomes.count,
    };
  }

  private static async computeCohortPerformanceMetrics(
    spec: AiCohortSpec,
    req: AuthRequest,
    metadata: Record<string, unknown> = {},
  ): Promise<AiCohortPerformanceMetrics> {
    try {
      const scopedMetrics = await CampaignController.readCohortPerformanceMetrics(spec, req, metadata);
      if (req.user?.role !== 'REP' || scopedMetrics.deliveredCount >= 50) return scopedMetrics;

      const allRepMetrics = await CampaignController.readCohortPerformanceMetrics(spec, req, metadata, {
        allReps: true,
      });
      return allRepMetrics.deliveredCount > 0 ? allRepMetrics : scopedMetrics;
    } catch (error) {
      logger.warn('AI cohort performance metrics unavailable', {
        cohortId: spec.id,
        userId: req.user?.id || null,
        error: (error as Error).message,
      });
      return {
        predictedReplyRate: 0,
        fundedRate: 0,
        historicalAnchor: '',
        deliveredCount: 0,
        replyCount: 0,
        fundedCount: 0,
      };
    }
  }

  private static async getCachedAiCohortReasoning(
    req: AuthRequest,
    spec: AiCohortSpec,
    resolvedLeadCount: number,
    criteria: Record<string, unknown>,
    forceRefresh: boolean,
  ): Promise<string | null> {
    if (forceRefresh || !req.user?.id) return null;

    try {
      const cached = await prisma.leadCohort.findFirst({
        where: {
          userId: req.user.id,
          cohortType: spec.cohortType,
          title: spec.title,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
        select: { aiReasoning: true, resolvedLeadCount: true, queryJson: true },
      });
      if (!cached || cached.resolvedLeadCount !== resolvedLeadCount) return null;
      if (
        CampaignController.stableJsonStringify(cached.queryJson || {}) !==
        CampaignController.stableJsonStringify(criteria)
      ) {
        return null;
      }
      return cached.aiReasoning || null;
    } catch (error) {
      logger.warn('AI cohort cache read failed', {
        userId: req.user.id,
        cohortId: spec.id,
        error: (error as Error).message,
      });
      return null;
    }
  }

  private static async persistAiCohortSnapshot(args: {
    req: AuthRequest;
    spec: AiCohortSpec;
    criteria: Record<string, unknown>;
    sourceAttribution: Record<string, unknown>;
    capacity: AiCohortCapacity;
    totalMatchCount: number;
    eligibleCount: number;
    resolvedLeadCount: number;
    expectedFunded: number;
    capTrimmed: number;
    warnings: string[];
    reasoningText: string;
    sampleLeads: CohortReasoningLeadSample[];
    leadIds: string[];
    performanceMetrics: AiCohortPerformanceMetrics;
  }): Promise<void> {
    if (!args.req.user?.id) return;

    try {
      await prisma.leadCohort.create({
        data: {
          userId: args.req.user.id,
          cohortType: args.spec.cohortType,
          title: args.spec.title,
          description: args.spec.reasoningLead,
          queryJson: args.criteria as Prisma.InputJsonValue,
          sourceAttribution: args.sourceAttribution as Prisma.InputJsonValue,
          predictedReplyRate: args.performanceMetrics.predictedReplyRate,
          expectedFundedCount: args.expectedFunded,
          historicalAnchor: args.performanceMetrics.historicalAnchor,
          aiReasoning: args.reasoningText,
          resolvedLeadCount: args.resolvedLeadCount,
          totalMatchCount: args.totalMatchCount,
          eligibleCount: args.eligibleCount,
          capTrimmedCount: args.capTrimmed,
          dailyRemainingCapacity: args.capacity.dailyRemaining,
          dailyCap: args.capacity.dailyCap,
          campaignCap: args.capacity.campaignCap,
          cooldownDays: args.spec.cooldownDays,
          warningJson: args.warnings as Prisma.InputJsonValue,
          sampleLeadJson: args.sampleLeads as unknown as Prisma.InputJsonValue,
          resolvedLeadIdsJson: args.leadIds as unknown as Prisma.InputJsonValue,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    } catch (error) {
      logger.warn('AI cohort cache write failed', {
        userId: args.req.user.id,
        cohortId: args.spec.id,
        error: (error as Error).message,
      });
    }
  }

  private static async resolveAiCohort(
    cohortId: string,
    req: AuthRequest,
    capacity: AiCohortCapacity,
    includeLeads = false,
    options: AiCohortResolveOptions = {},
  ): Promise<any> {
    const spec = AI_COHORT_SPECS[cohortId as AiCohortId];
    if (!spec) throw new AppError('AI cohort not found', 404);

    CampaignController.assertAiCohortAllowed(spec, req);

    const cohortWhere = await CampaignController.buildAiCohortWhere(spec, req);
    const baseWhere = cohortWhere.where;
    const cooldownWhere = CampaignController.withCooldown(baseWhere, spec.cooldownDays);
    const cooldownOverrideWhere = CampaignController.withRecentOutboundTouch(baseWhere, spec.cooldownDays);
    const includeCooldown = !!options.includeCooldown && CampaignController.isAdminLike(req);
    const eligibleWhere = includeCooldown ? baseWhere : cooldownWhere;
    const [totalMatchCount, cooldownEligibleCount, cooldownOverrideRows, performanceMetrics] = await Promise.all([
      prisma.lead.count({ where: baseWhere }),
      prisma.lead.count({ where: cooldownWhere }),
      includeCooldown
        ? prisma.lead.findMany({
            where: cooldownOverrideWhere,
            select: { id: true },
            take: CampaignController.AI_RETARGET_MAX_LEADS,
          })
        : Promise.resolve([]),
      CampaignController.computeCohortPerformanceMetrics(spec, req, cohortWhere.metadata || {}),
    ]);
    const eligibleCount = includeCooldown ? totalMatchCount : cooldownEligibleCount;
    const resolvedLeadCount = Math.min(
      eligibleCount,
      CampaignController.AI_RETARGET_MAX_LEADS,
      capacity.campaignCap,
      capacity.dailyRemaining,
    );
    const expectedFunded =
      resolvedLeadCount > 0 && performanceMetrics.fundedRate > 0
        ? Math.max(1, Math.round(resolvedLeadCount * performanceMetrics.fundedRate))
        : 0;
    const cooldownMatched = Math.max(0, totalMatchCount - cooldownEligibleCount);
    const cooldownExcluded = includeCooldown ? 0 : cooldownMatched;
    const cooldownOverrideCount = includeCooldown ? cooldownMatched : 0;
    const cooldownOverrideLeadIdSet = new Set(cooldownOverrideRows.map((lead) => lead.id));
    const capTrimmed = Math.max(0, eligibleCount - resolvedLeadCount);
    const warnings: string[] = [];

    if (cooldownOverrideCount > 0) {
      warnings.push(
        `Admin cooldown override enabled: ${cooldownOverrideCount} leads inside ${spec.cooldownDays}d cooldown included`,
      );
    } else if (cooldownExcluded > 0) {
      warnings.push(`${cooldownExcluded} leads are inside ${spec.cooldownDays}d cooldown and were excluded`);
    }
    if (capTrimmed > 0) {
      warnings.push(`${capTrimmed} eligible leads exceed current campaign/daily capacity`);
    }
    if (capacity.nearlyFull) {
      warnings.push(`Daily capacity nearly full: ${capacity.dailyRemaining} of ${capacity.dailyCap} remaining`);
    }

    const needsIndustryRanking = spec.id === AI_COHORT_IDS.MULTI_RETARGET || spec.id === AI_COHORT_IDS.NEW_RESTAURANTS;
    const candidateLeadRows =
      needsIndustryRanking && eligibleCount > 0
        ? await CampaignController.fetchAiCohortLeadRows(eligibleWhere)
        : includeLeads && resolvedLeadCount > 0
          ? await CampaignController.fetchAiCohortLeadRows(eligibleWhere, resolvedLeadCount)
          : [];
    const preferredIndustries = Array.isArray(cohortWhere.metadata?.industrySignals)
      ? cohortWhere.metadata.industrySignals.filter(
          (industry): industry is string => typeof industry === 'string' && industry.trim().length > 0,
        )
      : [];
    const { orderedLeadRows, industryGroups } = needsIndustryRanking
      ? CampaignController.orderLeadRowsByIndustry(
          candidateLeadRows,
          spec.id === AI_COHORT_IDS.NEW_RESTAURANTS ? preferredIndustries : [],
        )
      : { orderedLeadRows: candidateLeadRows, industryGroups: [] };
    const selectedLeadIds = orderedLeadRows.slice(0, resolvedLeadCount).map((lead) => lead.id);
    const leadRows: AiCohortLeadRow[] = includeLeads
      ? orderedLeadRows.slice(0, resolvedLeadCount).map((lead) => ({
          ...lead,
          cooldownOverride: cooldownOverrideLeadIdSet.has(lead.id),
        }))
      : [];
    const criteria = CampaignController.buildAiCohortCriteriaMetadata(
      spec,
      req,
      cohortWhere.metadata || {},
      industryGroups,
    );
    const sourceAttribution = {
      origin: spec.cohortType,
      scope: req.user?.role === 'REP' ? 'rep-owned-leads' : 'all-reps',
      userId: req.user?.id || null,
      generatedFrom: 'campaigns-leads-deals-conversations',
      cooldownOverride: includeCooldown,
      cooldownOverrideCount,
      cooldownOverrideLeadIds: leadRows.filter((lead) => lead.cooldownOverride).map((lead) => lead.id),
      ...(cohortWhere.metadata || {}),
    };
    let reasoningText = spec.reasoningText;
    const shouldPersistSnapshot = options.persistSnapshot !== false;
    const cachedReasoning = await CampaignController.getCachedAiCohortReasoning(
      req,
      spec,
      resolvedLeadCount,
      criteria,
      !!options.forceReasoningRefresh || includeCooldown,
    );
    const sampleRowsForReasoning =
      !cachedReasoning && shouldPersistSnapshot && orderedLeadRows.length > 0
        ? orderedLeadRows.slice(0, 5)
        : !cachedReasoning && shouldPersistSnapshot
          ? await CampaignController.fetchAiCohortSampleLeads(eligibleWhere, Math.min(resolvedLeadCount, 5))
          : [];
    const sampleLeads = CampaignController.toCohortReasoningLeadSamples(sampleRowsForReasoning);

    if (cachedReasoning) {
      reasoningText = cachedReasoning;
    } else if (shouldPersistSnapshot) {
      const generatedReasoning = await AIService.generateCohortReasoning({
        cohortId: spec.id,
        cohortType: spec.cohortType,
        title: spec.title,
        criteria,
        counts: {
          totalMatchCount,
          eligibleCount,
          resolvedLeadCount,
          cooldownExcluded,
          capTrimmed,
        },
        capacity: {
          campaignCap: capacity.campaignCap,
          dailyCap: capacity.dailyCap,
          dailyUsed: capacity.dailyUsed,
          dailyRemaining: capacity.dailyRemaining,
        },
        predictedReplyRate: performanceMetrics.predictedReplyRate,
        expectedFunded,
        historicalAnchor: performanceMetrics.historicalAnchor,
        sampleLeads,
      });
      reasoningText = generatedReasoning?.text || spec.reasoningText;

      await CampaignController.persistAiCohortSnapshot({
        req,
        spec,
        criteria,
        sourceAttribution,
        capacity,
        totalMatchCount,
        eligibleCount,
        resolvedLeadCount,
        expectedFunded,
        capTrimmed,
        warnings,
        reasoningText,
        sampleLeads,
        leadIds: selectedLeadIds,
        performanceMetrics,
      });
    }

    return {
      id: spec.id,
      cohortType: spec.cohortType,
      title: spec.title,
      categoryLabel: spec.categoryLabel,
      description: spec.description,
      priorityLabel: spec.priorityLabel,
      adminOnly: spec.adminOnly,
      leadCount: resolvedLeadCount,
      totalMatchCount,
      eligibleCount,
      predictedReplyRate: performanceMetrics.predictedReplyRate,
      expectedFunded,
      historicalAnchor: performanceMetrics.historicalAnchor,
      reasoningLead: spec.reasoningLead,
      reasoningText,
      warnings,
      cooldownOverrideCount,
      cooldownOverrideLeadIds: leadRows.filter((lead) => lead.cooldownOverride).map((lead) => lead.id),
      cooldownDays: spec.cooldownDays,
      cachedUntil: shouldPersistSnapshot ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null,
      cap: {
        campaignCap: capacity.campaignCap,
        dailyCap: capacity.dailyCap,
        dailyUsed: capacity.dailyUsed,
        dailyRemaining: capacity.dailyRemaining,
        trimmed: capTrimmed,
      },
      defaults: {
        name: `AI Retarget - ${spec.title.split(' - ')[0]}`,
        messageTemplate: spec.defaultMessageTemplate,
      },
      leadIds: selectedLeadIds,
      industryGroups,
      industrySignals: preferredIndustries,
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
        name: `Retarget - ${sourceCampaign.name}`,
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
    const resolvedCohorts = await Promise.allSettled(
      specs.map((spec) =>
        CampaignController.resolveAiCohort(spec.id, req, capacity, false, {
          persistSnapshot: false,
        }),
      ),
    );
    const cohorts = resolvedCohorts.flatMap((result, index) => {
      const spec = specs[index];
      if (result.status === 'rejected') {
        logger.warn('AI cohort resolve failed in list', {
          cohortId: spec.id,
          error: (result.reason as Error).message,
        });
        return [];
      }

      return result.value.totalMatchCount > 0 ? [result.value] : [];
    });

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

  static async warmAiCohortsForUser(user: AiCohortJobUser): Promise<{
    attempted: number;
    refreshed: number;
    failures: number;
  }> {
    const req = { user } as AuthRequest;
    const capacity = await CampaignController.getAiCampaignCapacity(req);
    const specs = Object.values(AI_COHORT_SPECS).filter(
      (spec) => !spec.adminOnly || user.role === 'ADMIN' || user.role === 'MANAGER',
    );
    let refreshed = 0;
    let failures = 0;

    for (const spec of specs) {
      try {
        await CampaignController.resolveAiCohort(spec.id, req, capacity, false, { persistSnapshot: true });
        refreshed += 1;
      } catch (error) {
        failures += 1;
        logger.warn('AI cohort warm failed', {
          userId: user.id,
          cohortId: spec.id,
          error: (error as Error).message,
        });
      }
    }

    return { attempted: specs.length, refreshed, failures };
  }

  static async previewAiCohort(req: AuthRequest, res: Response): Promise<void> {
    const { cohortId } = req.params;
    const includeCooldown = req.query.includeCooldown === 'true';
    const capacity = await CampaignController.getAiCampaignCapacity(req);
    const cohort = await CampaignController.resolveAiCohort(cohortId, req, capacity, true, { includeCooldown });

    res.json({ cohort });
  }

  static async buildAiCohortCampaign(req: AuthRequest, res: Response): Promise<void> {
    const { cohortId } = req.params;
    const { name, messageTemplate, includeCooldown } = req.body as {
      name?: string;
      messageTemplate?: string;
      includeCooldown?: boolean;
    };
    const capacity = await CampaignController.getAiCampaignCapacity(req);
    const cohort = await CampaignController.resolveAiCohort(cohortId, req, capacity, true, { includeCooldown });

    if (cohort.leadIds.length === 0) {
      throw new AppError(
        `AI cohort capacity exceeded: requested ${cohort.eligibleCount}, role ${req.user?.role || 'UNKNOWN'}, per-campaign cap ${capacity.campaignCap}, daily used ${capacity.dailyUsed}/${capacity.dailyCap}, remaining ${capacity.dailyRemaining}`,
        400,
      );
    }

    if (await CampaignController.respondIfCampaignCapsExceeded(req, res, cohort.leadIds.length)) {
      return;
    }

    await OutboundGateService.ensureCanLaunchOutbound(req.user);

    const campaignName = (name || cohort.defaults.name).trim();
    const resolvedMessageTemplate = (messageTemplate || cohort.defaults.messageTemplate).trim();
    const cooldownOverrideLineage = cohort.warnings.some((warning: string) =>
      warning.toLowerCase().includes('cooldown override'),
    )
      ? ' with admin cooldown override'
      : '';
    const lineage = `AI Cohort - ${cohort.leadIds.length} leads, ~${cohort.expectedFunded} funded expected${cooldownOverrideLineage}`;
    const cooldownOverrideLeadIds = Array.isArray(cohort.cooldownOverrideLeadIds)
      ? cohort.cooldownOverrideLeadIds.filter((leadId: unknown): leadId is string => typeof leadId === 'string')
      : [];

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

      if (cooldownOverrideLeadIds.length > 0) {
        await tx.activityLog.createMany({
          data: cooldownOverrideLeadIds.map((leadId: string) => ({
            userId: req.user!.id,
            action: 'ai_cohort.cooldown_override',
            entityType: 'lead',
            entityId: leadId,
            metadata: {
              campaignId: createdCampaign.id,
              cohortId: cohort.id,
              cooldownDays: cohort.cooldownDays,
            },
            ipAddress: req.ip || null,
          })),
        });

        const relatedDeals = await tx.deal.findMany({
          where: { leadId: { in: cooldownOverrideLeadIds } },
          select: { id: true, leadId: true },
        });
        if (relatedDeals.length > 0) {
          await tx.dealEvent.createMany({
            data: relatedDeals.map((deal: { id: string; leadId: string | null }) => ({
              dealId: deal.id,
              repId: req.user!.id,
              eventType: 'ai_cohort_cooldown_override',
              note: 'Admin included this lead in an AI Retarget campaign inside the cooldown window.',
              metadata: {
                campaignId: createdCampaign.id,
                leadId: deal.leadId,
                cohortId: cohort.id,
                cooldownDays: cohort.cooldownDays,
              },
            })),
          });
        }
      }

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
            // Breakdown by sender number.
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
            // Breakdown by rep.
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
            // Delivery breakdown maps FAILED and UNDELIVERED together.
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

    // Build delivery breakdown maps.
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

    // Build per-campaign breakdown maps.
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

    if (leads.length > 0 && (await CampaignController.respondIfCampaignCapsExceeded(req, res, leads.length))) {
      return;
    }

    // Create campaign only after safety/cap checks pass.
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
      throw new AppError('Cannot start campaign during quiet hours. Adjust quiet hours in Settings - Compliance.', 400);
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
    // due to ownership guard, allow recovery regardless of prior message history.
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
              // For retarget campaigns: these leads always have prior threads by design, so allow recovery.
              // Admins/managers can also bypass this check.
              if (!isRetargetCampaign && !isAdminOrManager) {
                const hasReplied = (conversation?._count?.messages || 0) > 0;
                if (hasReplied) return false;
              }

              // Ownership check: only enforce if the lead has actually replied (has inbound messages).
              // If a lead was only sent outbound messages and never replied, they are not "claimed"
              // by any rep, so any campaign can contact them again.
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
        'Campaign has no sendable leads. All leads were skipped - they may have already replied ' +
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
    const capacity = await CampaignController.getAiCampaignCapacity(req);

    res.json({
      sourceCampaign: {
        id: preview.sourceCampaign.id,
        name: preview.sourceCampaign.name,
      },
      defaults: preview.defaults,
      summary: preview.summary,
      capacity,
    });
  }

  static async retargetCreate(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, messageTemplate, sendingSpeed } = req.body as {
      name: string;
      messageTemplate: string;
      sendingSpeed?: number;
    };

    const preview = await CampaignController.buildRetargetPreview(id);
    CampaignController.ensureRetargetAccess(preview.sourceCampaign, req);

    await OutboundGateService.ensureCanLaunchOutbound(req.user);

    if (preview.summary.willReceive === 0) {
      throw new AppError('No eligible recipients. All delivered contacts have replied or are on DNC.', 400);
    }

    if (await CampaignController.respondIfCampaignCapsExceeded(req, res, preview.eligibleLeadIds.length)) {
      return;
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
          sendingSpeed: sendingSpeed ?? 4,
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
      select: {
        id: true,
        twilioMessageSid: true,
        status: true,
        phoneNumberId: true,
        conversationId: true,
        toNumber: true,
      },
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

        if (finalStatus === 'FAILED' || finalStatus === 'UNDELIVERED' || finalStatus === 'BLOCKED') {
          await ComplianceService.handleDeliveryFailure(msg.toNumber, twilioMsg.errorCode, {
            errorMessage: twilioMsg.errorMessage || null,
            source: 'twilio_status_sync',
          });
        }

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
