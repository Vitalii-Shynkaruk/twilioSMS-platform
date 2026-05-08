import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { CampaignController } from '../src/controllers/campaignController';
import prisma from '../src/config/database';
import type { AuthRequest } from '../src/middleware/auth';
import { OutboundGateService } from '../src/services/outboundGateService';
import { AIService } from '../src/services/aiService';
import { NumberService } from '../src/services/numberService';

function createRequest(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    query: {},
    params: {},
    body: {},
    user: {
      id: 'admin-1',
      email: 'admin@sclcapital.io',
      role: 'ADMIN',
      firstName: 'Admin',
      lastName: 'One',
    },
    ...overrides,
  } as AuthRequest;
}

function createResponse(): Response {
  return {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
  } as unknown as Response;
}

function createCriteriaSnapshot(
  cohortId: 'multi-retarget' | 'new-restaurants' | 'renewal',
  options: { role?: 'ADMIN' | 'MANAGER' | 'REP'; userId?: string; industrySignals?: string[] } = {},
) {
  const role = options.role || 'ADMIN';
  const userId = options.userId || (role === 'REP' ? 'rep-1' : 'admin-1');
  const scope = role === 'REP' ? { type: 'rep', userId } : { type: 'all-reps' };
  const base = {
    activeOnly: true,
    excludes: ['deleted', 'opted_out', 'suppressed', 'DNC'],
    scope,
  };

  if (cohortId === 'multi-retarget') {
    return {
      ...base,
      cooldownDays: 7,
      deliveredCampaignsMin: 2,
      noInboundReply: true,
      primaryIndustry: null,
      industryGroups: [],
      sortBy: 'industry_total_revenue',
      excludesExistingDeals: true,
    };
  }

  if (cohortId === 'new-restaurants') {
    return {
      ...base,
      cooldownDays: 7,
      industrySignals: options.industrySignals || [],
      primaryIndustry: null,
      industryGroups: [],
      refreshWindowDays: 90,
      deliveredCampaignsMin: 1,
      revenueMin: 80000,
      deliveredPriorCampaign: true,
      noInboundReply: true,
    };
  }

  return {
    ...base,
    cooldownDays: 30,
    dealStage: 'FUNDED',
    fundedWindowMonthsAgo: { min: 8, max: 12 },
    adminOnly: true,
  };
}

describe('M2.3 AI retarget cohorts', () => {
  beforeEach(() => {
    vi.spyOn(prisma.leadCohort, 'findFirst').mockResolvedValue(null as never);
    vi.spyOn(prisma.leadCohort, 'create').mockResolvedValue({ id: 'lead-cohort-cache' } as never);
    vi.spyOn(prisma.campaign, 'findMany').mockResolvedValue([] as never);
    vi.spyOn(prisma.campaign, 'findFirst').mockResolvedValue(null as never);
    vi.spyOn(prisma.campaignLead, 'groupBy').mockResolvedValue([] as never);
    vi.spyOn(prisma.campaignLead, 'findMany').mockResolvedValue([] as never);
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([] as never);
    vi.spyOn(prisma.deal, 'findMany').mockResolvedValue([] as never);
    vi.spyOn(prisma.fundingEvent, 'aggregate').mockResolvedValue({
      _count: { _all: 0 },
      _sum: { amountFunded: null },
    } as never);
    vi.spyOn(AIService, 'generateCohortReasoning').mockResolvedValue(null);
    vi.spyOn(NumberService, 'getAssignedNumberCapacity').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('lists admin AI cohorts with capacity and expected funded metrics', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(125);
    vi.spyOn(prisma.campaign, 'count').mockResolvedValue(312);
    vi.spyOn(prisma.lead, 'count').mockImplementation(async ({ where }: any) => {
      const hasCooldownWindow = Array.isArray(where?.AND);
      const isRenewal = Array.isArray(where?.OR) && where.OR.some((entry: any) => entry?.deal?.is?.stage === 'FUNDED');
      const isMultiRetarget = where?.deal?.is === null;

      if (isRenewal) return hasCooldownWindow ? 70 : 73;
      if (isMultiRetarget) return hasCooldownWindow ? 487 : 510;
      return hasCooldownWindow ? 1200 : 1842;
    });
    const response = createResponse();

    await CampaignController.listAiCohorts(createRequest(), response);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        sourceCampaignCount: 312,
        capacity: expect.objectContaining({ campaignCap: 3000, dailyCap: 4500, dailyUsed: 125 }),
        summary: expect.objectContaining({ cohortCount: 3 }),
        cohorts: expect.arrayContaining([
          expect.objectContaining({
            id: 'multi-retarget',
            categoryLabel: 'Multi-Campaign Retarget',
            description: expect.stringContaining('delivered across 2+ scoped campaigns'),
            leadCount: 350,
            expectedFunded: 0,
            warnings: expect.arrayContaining(['23 leads are inside 7d cooldown and were excluded']),
          }),
          expect.objectContaining({ id: 'renewal', adminOnly: true, leadCount: 70 }),
        ]),
      }),
    );
  });

  it('hides admin-only renewal cohort from reps', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    const campaignCount = vi.spyOn(prisma.campaign, 'count').mockResolvedValue(5);
    vi.spyOn(prisma.lead, 'count')
      .mockResolvedValueOnce(40)
      .mockResolvedValueOnce(35)
      .mockResolvedValueOnce(90)
      .mockResolvedValueOnce(80);
    const response = createResponse();

    await CampaignController.listAiCohorts(
      createRequest({
        user: {
          id: 'rep-1',
          email: 'rep@sclcapital.io',
          role: 'REP',
          firstName: 'Rep',
          lastName: 'One',
        },
      }),
      response,
    );

    expect(campaignCount).toHaveBeenCalledWith({ where: { createdById: 'rep-1' } });
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cohorts: expect.not.arrayContaining([expect.objectContaining({ id: 'renewal' })]),
      }),
    );
  });

  it('caps rep AI cohort at the AI retarget max before campaign cap', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.campaign, 'count').mockResolvedValue(5);
    vi.spyOn(prisma.lead, 'count')
      .mockResolvedValueOnce(900)
      .mockResolvedValueOnce(900)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    const response = createResponse();

    await CampaignController.listAiCohorts(
      createRequest({
        user: {
          id: 'rep-1',
          email: 'rep@sclcapital.io',
          role: 'REP',
          firstName: 'Rep',
          lastName: 'One',
        },
      }),
      response,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        capacity: expect.objectContaining({ campaignCap: 500, dailyCap: 800, dailyRemaining: 800 }),
        cohorts: expect.arrayContaining([
          expect.objectContaining({
            id: 'multi-retarget',
            leadCount: 350,
            cap: expect.objectContaining({ trimmed: 550 }),
          }),
        ]),
      }),
    );
  });

  it('creates draft campaign from AI cohort without auto-send', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    vi.mocked(prisma.lead.findMany).mockResolvedValue([
      { id: 'lead-1', firstName: 'Ana', conversations: [] },
      { id: 'lead-2', firstName: 'Ben', conversations: [] },
    ] as never);
    vi.spyOn(OutboundGateService, 'ensureCanLaunchOutbound').mockResolvedValue(undefined);
    const campaignCreate = vi.fn().mockResolvedValue({ id: 'campaign-ai', name: 'AI Retarget - Cross-rep' });
    const campaignLeadCreateMany = vi.fn().mockResolvedValue({ count: 2 });
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) =>
      callback({ campaign: { create: campaignCreate }, campaignLead: { createMany: campaignLeadCreateMany } }),
    );
    const response = createResponse();

    await CampaignController.buildAiCohortCampaign(
      createRequest({ params: { cohortId: 'multi-retarget' }, body: {} }),
      response,
    );

    expect(campaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'DRAFT',
          isRetarget: true,
          sourceCampaignId: null,
          description: 'AI Cohort - 2 leads, ~0 funded expected',
          totalLeads: 2,
        }),
      }),
    );
    expect(campaignLeadCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          { campaignId: 'campaign-ai', leadId: 'lead-1', status: 'PENDING' },
          { campaignId: 'campaign-ai', leadId: 'lead-2', status: 'PENDING' },
        ],
      }),
    );
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('должен показывать renewal cohort через matching funded clients к existing leads', async () => {
    vi.mocked(prisma.deal.findMany).mockResolvedValueOnce([
      {
        leadId: null,
        client: { phone: '(202) 285-0080', email: 'client@example.com' },
      },
    ] as never);
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    const leadCount = vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(14).mockResolvedValueOnce(14);
    vi.mocked(prisma.lead.findMany).mockResolvedValue([
      { id: 'lead-renewal-1', firstName: 'Renewal', company: 'Funded Client', status: 'CONTACTED', conversations: [] },
    ] as never);
    const response = createResponse();

    await CampaignController.previewAiCohort(createRequest({ params: { cohortId: 'renewal' } }), response);

    expect(leadCount).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            expect.objectContaining({ phone: { in: expect.arrayContaining(['+12022850080']) } }),
            { email: { in: ['client@example.com'] } },
          ]),
        }),
      }),
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cohort: expect.objectContaining({
          id: 'renewal',
          leadCount: 14,
          totalMatchCount: 14,
        }),
      }),
    );
  });

  it('должен записывать audit entries при admin cooldown override в AI cohort', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(3).mockResolvedValueOnce(2);
    vi.mocked(prisma.lead.findMany)
      .mockResolvedValueOnce([{ id: 'lead-1' }] as never)
      .mockResolvedValueOnce([
        { id: 'lead-1', firstName: 'Ana', conversations: [] },
        { id: 'lead-2', firstName: 'Ben', conversations: [] },
        { id: 'lead-3', firstName: 'Cam', conversations: [] },
      ] as never);
    vi.spyOn(OutboundGateService, 'ensureCanLaunchOutbound').mockResolvedValue(undefined);
    const campaignCreate = vi.fn().mockResolvedValue({ id: 'campaign-ai', name: 'AI Retarget - Cross-rep' });
    const campaignLeadCreateMany = vi.fn().mockResolvedValue({ count: 3 });
    const activityLogCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    const dealFindMany = vi.fn().mockResolvedValue([{ id: 'deal-1', leadId: 'lead-1' }]);
    const dealEventCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) =>
      callback({
        campaign: { create: campaignCreate },
        campaignLead: { createMany: campaignLeadCreateMany },
        activityLog: { createMany: activityLogCreateMany },
        deal: { findMany: dealFindMany },
        dealEvent: { createMany: dealEventCreateMany },
      }),
    );
    const response = createResponse();

    await CampaignController.buildAiCohortCampaign(
      createRequest({ params: { cohortId: 'multi-retarget' }, body: { includeCooldown: true } }),
      response,
    );

    expect(activityLogCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            action: 'ai_cohort.cooldown_override',
            entityType: 'lead',
            entityId: 'lead-1',
            metadata: expect.objectContaining({ campaignId: 'campaign-ai', cohortId: 'multi-retarget' }),
          }),
        ],
      }),
    );
    expect(dealEventCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            dealId: 'deal-1',
            eventType: 'ai_cohort_cooldown_override',
            metadata: expect.objectContaining({ campaignId: 'campaign-ai', leadId: 'lead-1' }),
          }),
        ],
      }),
    );
    expect(response.status).toHaveBeenCalledWith(201);
  });

  it('allows admin preview to include cooldown leads with an override warning', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(10).mockResolvedValueOnce(7);
    vi.mocked(prisma.lead.findMany)
      .mockResolvedValueOnce([{ id: 'lead-0' }, { id: 'lead-1' }, { id: 'lead-2' }] as never)
      .mockResolvedValueOnce(
        Array.from({ length: 10 }, (_, index) => ({ id: `lead-${index}`, firstName: `Lead ${index}`, conversations: [] })) as never,
      );
    const response = createResponse();

    await CampaignController.previewAiCohort(
      createRequest({ params: { cohortId: 'multi-retarget' }, query: { includeCooldown: 'true' } }),
      response,
    );

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cohort: expect.objectContaining({
          leadCount: 10,
          eligibleCount: 10,
          warnings: expect.arrayContaining(['Admin cooldown override enabled: 3 leads inside 7d cooldown included']),
        }),
      }),
    );
  });

  it('uses LeadCohort cache when resolved lead count still matches', async () => {
    vi.mocked(prisma.leadCohort.findFirst).mockImplementation(async ({ where }: any) => {
      if (where?.cohortType === 'multi-retarget') {
        return {
          aiReasoning: 'Cached cohort reasoning from LeadCohort snapshot.',
          resolvedLeadCount: 10,
          queryJson: createCriteriaSnapshot('multi-retarget'),
        } as never;
      }

      if (where?.cohortType === 'new-cohort') {
        return {
          aiReasoning: 'Cached cohort reasoning from LeadCohort snapshot.',
          resolvedLeadCount: 20,
          queryJson: createCriteriaSnapshot('new-restaurants'),
        } as never;
      }

      return {
        aiReasoning: 'Cached cohort reasoning from LeadCohort snapshot.',
        resolvedLeadCount: 5,
        queryJson: createCriteriaSnapshot('renewal'),
      } as never;
    });
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.campaign, 'count').mockResolvedValue(3);
    vi.spyOn(prisma.lead, 'count').mockImplementation(async ({ where }: any) => {
      const isRenewal = Array.isArray(where?.OR) && where.OR.some((entry: any) => entry?.deal?.is?.stage === 'FUNDED');
      const isMultiRetarget = where?.deal?.is === null;

      if (isRenewal) return 5;
      if (isMultiRetarget) return 10;
      return 20;
    });
    const leadFindMany = vi.mocked(prisma.lead.findMany);
    const response = createResponse();

    await CampaignController.listAiCohorts(createRequest(), response);

    expect(AIService.generateCohortReasoning).not.toHaveBeenCalled();
    expect(prisma.leadCohort.findFirst).toHaveBeenCalledTimes(3);
    expect(leadFindMany).toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cohorts: expect.arrayContaining([
          expect.objectContaining({ reasoningText: 'Cached cohort reasoning from LeadCohort snapshot.' }),
        ]),
      }),
    );
  });

  it('creates a 24h LeadCohort snapshot with generated reasoning on cache miss', async () => {
    vi.mocked(prisma.leadCohort.findFirst).mockResolvedValueOnce(null);
    vi.mocked(AIService.generateCohortReasoning).mockResolvedValueOnce({
      text: 'Generated Sonnet 4.5 cohort reasoning based on funded history and sample leads.',
      model: 'claude-sonnet-4-5',
    });
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    vi.mocked(prisma.lead.findMany).mockResolvedValue([
      {
        id: 'lead-1',
        firstName: 'Ana',
        company: 'Restaurant Group',
        source: 'FDR Apr',
        status: 'REPLIED',
        assignedRep: { firstName: 'Ana', lastName: 'Rep', initials: 'AN' },
        conversations: [{ extractedIndustry: 'Restaurants', extractedRevenue: 95000 }],
      },
      {
        id: 'lead-2',
        firstName: 'Ben',
        company: 'Cafe Holdings',
        source: 'CJ 10.8 12K',
        status: 'INTERESTED',
        assignedRep: { firstName: 'Hector', lastName: 'Rep', initials: 'HB' },
        conversations: [{ extractedIndustry: 'Food', extractedRevenue: 120000 }],
      },
    ] as never);
    const response = createResponse();

    await CampaignController.previewAiCohort(createRequest({ params: { cohortId: 'multi-retarget' } }), response);

    expect(prisma.leadCohort.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          cohortType: 'multi-retarget',
          expiresAt: { gt: expect.any(Date) },
        }),
      }),
    );
    expect(AIService.generateCohortReasoning).toHaveBeenCalledWith(
      expect.objectContaining({
        cohortId: 'multi-retarget',
        historicalAnchor: '',
        sampleLeads: expect.arrayContaining([
          expect.objectContaining({ company: 'Restaurant Group', revenue: 95000, assignedRepInitials: 'AN' }),
        ]),
      }),
    );
    expect(prisma.leadCohort.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cohortType: 'multi-retarget',
          title: expect.stringContaining('Cross-campaign no-reply retarget'),
          queryJson: expect.objectContaining({ deliveredCampaignsMin: 2, noInboundReply: true, excludesExistingDeals: true }),
          predictedReplyRate: 0,
          expectedFundedCount: 0,
          aiReasoning: 'Generated Sonnet 4.5 cohort reasoning based on funded history and sample leads.',
          resolvedLeadCount: 2,
          totalMatchCount: 2,
          eligibleCount: 2,
          dailyRemainingCapacity: 4500,
          expiresAt: expect.any(Date),
        }),
      }),
    );
    const createdArgs = vi.mocked(prisma.leadCohort.create).mock.calls[0]?.[0] as { data: { expiresAt: Date } };
    expect(createdArgs.data.expiresAt.getTime()).toBeGreaterThan(Date.now() + 23 * 60 * 60 * 1000);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cohort: expect.objectContaining({
          reasoningText: 'Generated Sonnet 4.5 cohort reasoning based on funded history and sample leads.',
        }),
      }),
    );
  });

  it('groups multi-retarget preview by industry and surfaces the highest-revenue cohort first', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(4).mockResolvedValueOnce(4);
    vi.mocked(prisma.lead.findMany).mockResolvedValue([
      {
        id: 'lead-1',
        firstName: 'Ava',
        status: 'NEW',
        updatedAt: new Date('2026-05-02T12:00:00.000Z'),
        industry: 'Construction',
        monthlyRevenue: 150000,
        conversations: [{ extractedIndustry: 'Construction', extractedRevenue: 150000 }],
      },
      {
        id: 'lead-2',
        firstName: 'Ben',
        status: 'NEW',
        updatedAt: new Date('2026-05-02T11:00:00.000Z'),
        industry: 'Construction',
        monthlyRevenue: 120000,
        conversations: [{ extractedIndustry: 'Construction', extractedRevenue: 120000 }],
      },
      {
        id: 'lead-3',
        firstName: 'Cam',
        status: 'NEW',
        updatedAt: new Date('2026-05-02T10:00:00.000Z'),
        industry: 'Medical',
        monthlyRevenue: 110000,
        conversations: [{ extractedIndustry: 'Medical', extractedRevenue: 110000 }],
      },
      {
        id: 'lead-4',
        firstName: 'Drew',
        status: 'NEW',
        updatedAt: new Date('2026-05-02T09:00:00.000Z'),
        industry: 'Medical',
        monthlyRevenue: 60000,
        conversations: [{ extractedIndustry: 'Medical', extractedRevenue: 60000 }],
      },
    ] as never);
    const response = createResponse();

    await CampaignController.previewAiCohort(createRequest({ params: { cohortId: 'multi-retarget' } }), response);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cohort: expect.objectContaining({
          leadIds: ['lead-1', 'lead-2', 'lead-3', 'lead-4'],
          industryGroups: [
            expect.objectContaining({ industry: 'Construction', leadCount: 2, totalRevenue: 270000 }),
            expect.objectContaining({ industry: 'Medical', leadCount: 2, totalRevenue: 170000 }),
          ],
        }),
      }),
    );
  });

  it('derives the new-cohort industry list from recent funded history', async () => {
    vi.mocked(prisma.deal.findMany).mockResolvedValue([
      {
        dealAmount: 180000,
        client: { phone: '+15550000001', email: 'builder@example.com' },
        lead: {
          id: 'lead-funded-1',
          phone: '+15550000001',
          email: 'builder@example.com',
          industry: 'Construction',
          monthlyRevenue: 140000,
          conversations: [{ extractedIndustry: 'Construction', extractedRevenue: 140000 }],
        },
      },
      {
        dealAmount: 90000,
        client: { phone: '+15550000002', email: 'clinic@example.com' },
        lead: {
          id: 'lead-funded-2',
          phone: '+15550000002',
          email: 'clinic@example.com',
          industry: 'Medical',
          monthlyRevenue: 90000,
          conversations: [{ extractedIndustry: 'Medical', extractedRevenue: 90000 }],
        },
      },
      {
        dealAmount: 125000,
        client: { phone: '+15550000003', email: 'builder-2@example.com' },
        lead: {
          id: 'lead-funded-3',
          phone: '+15550000003',
          email: 'builder-2@example.com',
          industry: 'Construction',
          monthlyRevenue: 125000,
          conversations: [{ extractedIndustry: 'Construction', extractedRevenue: 125000 }],
        },
      },
    ] as never);

    const industries = await (CampaignController as any).resolveTopFundedIndustries(createRequest());

    expect(industries).toEqual(['Construction', 'Medical']);
  });

  it('excludes retarget campaigns from the new-cohort historical anchor lookup', () => {
    const where = (CampaignController as any).buildComparableCampaignWhere(
      {
        id: 'new-restaurants',
        title: 'High-revenue silent leads - top funded industries',
        categoryLabel: 'New Cohort',
        description: '',
        priorityLabel: 'OPPORTUNITY',
        cohortType: 'new-cohort',
        adminOnly: false,
        cooldownDays: 7,
        historicalLabel: 'high-revenue silent cohort',
        reasoningLead: '',
        reasoningText: '',
        defaultMessageTemplate: '',
      },
      createRequest(),
      { industrySignals: ['Construction', 'Medical'] },
    );

    expect(where).toEqual(
      expect.objectContaining({
        isRetarget: false,
        leads: expect.objectContaining({
          some: expect.objectContaining({
            lead: expect.objectContaining({
              OR: expect.arrayContaining([
                { industry: { contains: 'Construction' } },
                { conversations: { some: { extractedIndustry: { contains: 'Medical' } } } },
              ]),
            }),
          }),
        }),
      }),
    );
  });

  it('limits comparable cohort metrics to the recent 90d window and rep scope', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.campaign, 'count').mockResolvedValue(5);
    vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(10).mockResolvedValueOnce(10).mockResolvedValueOnce(5).mockResolvedValueOnce(5);
    const campaignFindMany = vi.spyOn(prisma.campaign, 'findMany').mockResolvedValue([] as never);
    const response = createResponse();

    await CampaignController.listAiCohorts(
      createRequest({
        user: {
          id: 'rep-1',
          email: 'rep@sclcapital.io',
          role: 'REP',
          firstName: 'Rep',
          lastName: 'One',
        },
      }),
      response,
    );

    expect(campaignFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdById: 'rep-1',
          createdAt: { gte: expect.any(Date) },
        }),
      }),
    );
  });

  it('rejects manual campaign create when per-campaign cap is exceeded', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(
      Array.from({ length: 3001 }, (_, index) => ({ id: `lead-${index}` })) as never,
    );
    const campaignCreate = vi.spyOn(prisma.campaign, 'create').mockResolvedValue({ id: 'campaign-1' } as never);
    const response = createResponse();

    await CampaignController.create(
      createRequest({
        body: {
          name: 'Manual bulk campaign',
          messageTemplate: 'Hi {{firstName}}',
          leadIds: ['lead-1'],
        },
      }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'PER_CAMPAIGN_CAP_EXCEEDED',
        requested: 3001,
        cap: 3000,
      }),
    );
    expect(campaignCreate).not.toHaveBeenCalled();
  });

  it('rejects manual campaign create when rolling daily cap is exceeded', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(4495);
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(
      Array.from({ length: 10 }, (_, index) => ({ id: `lead-${index}` })) as never,
    );
    const campaignCreate = vi.spyOn(prisma.campaign, 'create').mockResolvedValue({ id: 'campaign-1' } as never);
    const response = createResponse();

    await CampaignController.create(
      createRequest({
        body: {
          name: 'Manual daily cap campaign',
          messageTemplate: 'Hi {{firstName}}',
          leadIds: ['lead-1'],
        },
      }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'DAILY_TOTAL_CAP_EXCEEDED',
        dailyUsed: 4495,
        dailyTotalCap: 4500,
        remaining: 5,
        requested: 10,
      }),
    );
    expect(campaignCreate).not.toHaveBeenCalled();
  });

  it('rejects AI cohort build when rep rolling daily cap has no remaining capacity', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(800);
    vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(25).mockResolvedValueOnce(25);

    await expect(
      CampaignController.buildAiCohortCampaign(
        createRequest({
          params: { cohortId: 'multi-retarget' },
          body: {},
          user: {
            id: 'rep-1',
            email: 'rep@sclcapital.io',
            role: 'REP',
            firstName: 'Rep',
            lastName: 'One',
          },
        }),
        createResponse(),
      ),
    ).rejects.toMatchObject({
      statusCode: 400,
      message:
        'AI cohort capacity exceeded: requested 25, role REP, per-campaign cap 500, daily used 800/800, remaining 0',
    });
  });
});
