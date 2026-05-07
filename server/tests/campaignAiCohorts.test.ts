import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { CampaignController } from '../src/controllers/campaignController';
import prisma from '../src/config/database';
import type { AuthRequest } from '../src/middleware/auth';
import { OutboundGateService } from '../src/services/outboundGateService';
import { AIService } from '../src/services/aiService';
import { NumberService } from '../src/services/numberService';
import * as twilioConfig from '../src/config/twilio';

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

describe('M2.3 AI retarget cohorts', () => {
  beforeEach(() => {
    vi.spyOn(prisma.leadCohort, 'findFirst').mockResolvedValue({
      aiReasoning: 'Cached cohort reasoning from LeadCohort snapshot.',
    } as never);
    vi.spyOn(prisma.leadCohort, 'create').mockResolvedValue({ id: 'lead-cohort-cache' } as never);
    vi.spyOn(AIService, 'generateCohortReasoning').mockResolvedValue(null);
    vi.spyOn(twilioConfig, 'getActiveMessagingServiceSid').mockResolvedValue(null);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('возвращает admin AI cohorts с capacity и expected funded', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(125);
    vi.spyOn(prisma.campaign, 'count').mockResolvedValue(312);
    vi.spyOn(prisma.lead, 'count')
      .mockResolvedValueOnce(510)
      .mockResolvedValueOnce(487)
      .mockResolvedValueOnce(1842)
      .mockResolvedValueOnce(1200)
      .mockResolvedValueOnce(73)
      .mockResolvedValueOnce(70);
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
            description: expect.stringContaining('stalled warm replies'),
            leadCount: 487,
            expectedFunded: 6,
            warnings: expect.arrayContaining(['23 leads are inside 7d cooldown and were excluded']),
          }),
          expect.objectContaining({ id: 'renewal', adminOnly: true }),
        ]),
      }),
    );
  });

  it('не показывает rep admin-only renewal cohort', async () => {
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

  it('обрезает rep cohort по per-campaign cap', async () => {
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
            leadCount: 500,
            cap: expect.objectContaining({ trimmed: 400 }),
          }),
        ]),
      }),
    );
  });

  it('возвращает rolling 24h capacity в retarget preview', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(529);
    vi.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({
      id: 'campaign-1',
      name: 'TT master Sheet AN 04/22/2026',
      messageTemplate: 'Hello {{firstName}}',
      numberPoolId: null,
      sendingSpeed: 30,
      dailyLimit: 400,
      createdById: 'rep-1',
    } as never);
    vi.spyOn(prisma.campaignLead, 'findMany').mockResolvedValue([
      {
        status: 'DELIVERED',
        leadId: 'lead-1',
        lead: { id: 'lead-1', phone: '+15550000001', status: 'NEW', optedOut: false, isSuppressed: false },
      },
      {
        status: 'DELIVERED',
        leadId: 'lead-2',
        lead: { id: 'lead-2', phone: '+15550000002', status: 'NEW', optedOut: false, isSuppressed: false },
      },
    ] as never);
    vi.spyOn(prisma.message, 'findMany')
      .mockResolvedValueOnce([
        {
          status: 'DELIVERED',
          sentAt: new Date('2026-05-05T10:00:00.000Z'),
          createdAt: new Date('2026-05-05T10:00:00.000Z'),
          conversation: { leadId: 'lead-1' },
        },
        {
          status: 'DELIVERED',
          sentAt: new Date('2026-05-05T10:05:00.000Z'),
          createdAt: new Date('2026-05-05T10:05:00.000Z'),
          conversation: { leadId: 'lead-2' },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          createdAt: new Date('2026-05-05T10:30:00.000Z'),
          conversation: { leadId: 'lead-1' },
        },
      ] as never);
    vi.spyOn(prisma.suppressionEntry, 'findMany').mockResolvedValue([] as never);

    const response = createResponse();

    await CampaignController.retargetPreview(
      createRequest({
        params: { id: 'campaign-1' },
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
        summary: expect.objectContaining({
          totalDelivered: 2,
          replied: 1,
          failedBlocked: 0,
          dncFiltered: 0,
          willReceive: 1,
        }),
        capacity: expect.objectContaining({
          campaignCap: 500,
          dailyCap: 800,
          dailyUsed: 529,
          dailyRemaining: 271,
        }),
      }),
    );
  });

  it('использует capacity активных assigned numbers в retarget preview для rep', async () => {
    vi.spyOn(twilioConfig, 'getActiveMessagingServiceSid').mockResolvedValue('MG123');
    vi.spyOn(prisma.numberAssignment, 'findMany').mockResolvedValue([
      {
        phoneNumber: {
          id: 'num-1',
          messagingServiceSid: 'MG123',
          dailySentCount: 143,
          dailyLimit: 400,
          isRamping: false,
          rampDay: 8,
          status: 'ACTIVE',
          coolingUntil: null,
        },
      },
      {
        phoneNumber: {
          id: 'num-2',
          messagingServiceSid: 'MG123',
          dailySentCount: 144,
          dailyLimit: 400,
          isRamping: false,
          rampDay: 8,
          status: 'ACTIVE',
          coolingUntil: null,
        },
      },
      {
        phoneNumber: {
          id: 'num-3',
          messagingServiceSid: 'MG123',
          dailySentCount: 143,
          dailyLimit: 400,
          isRamping: false,
          rampDay: 8,
          status: 'ACTIVE',
          coolingUntil: null,
        },
      },
      {
        phoneNumber: {
          id: 'num-4',
          messagingServiceSid: 'MG123',
          dailySentCount: 144,
          dailyLimit: 400,
          isRamping: false,
          rampDay: 8,
          status: 'ACTIVE',
          coolingUntil: null,
        },
      },
    ] as never);
    vi.spyOn(prisma.message, 'groupBy').mockResolvedValue([
      { phoneNumberId: 'num-1', _count: { id: 143 } },
      { phoneNumberId: 'num-2', _count: { id: 144 } },
      { phoneNumberId: 'num-3', _count: { id: 143 } },
      { phoneNumberId: 'num-4', _count: { id: 144 } },
    ] as never);
    vi.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({
      id: 'campaign-1',
      name: 'Spidey LLP Pt 3 AN',
      messageTemplate: 'Hello {{firstName}}',
      numberPoolId: null,
      sendingSpeed: 30,
      dailyLimit: 400,
      createdById: 'rep-1',
    } as never);
    vi.spyOn(prisma.campaignLead, 'findMany').mockResolvedValue(
      Array.from({ length: 301 }, (_, index) => ({
        status: index < 286 ? 'DELIVERED' : 'BLOCKED',
        leadId: `lead-${index}`,
        lead: {
          id: `lead-${index}`,
          phone: `+1555000${String(index).padStart(4, '0')}`,
          status: 'NEW',
          optedOut: false,
          isSuppressed: false,
        },
      })) as never,
    );
    vi.spyOn(prisma.message, 'findMany')
      .mockResolvedValueOnce(
        Array.from({ length: 286 }, (_, index) => ({
          status: 'DELIVERED',
          sentAt: new Date(`2026-05-05T10:${String(index % 60).padStart(2, '0')}:00.000Z`),
          createdAt: new Date(`2026-05-05T10:${String(index % 60).padStart(2, '0')}:00.000Z`),
          conversation: { leadId: `lead-${index}` },
        })) as never,
      )
      .mockResolvedValueOnce([] as never);
    vi.spyOn(prisma.suppressionEntry, 'findMany').mockResolvedValue([] as never);

    const response = createResponse();

    await CampaignController.retargetPreview(
      createRequest({
        params: { id: 'campaign-1' },
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
        summary: expect.objectContaining({
          totalDelivered: 286,
          replied: 0,
          failedBlocked: 0,
          dncFiltered: 0,
          willReceive: 286,
        }),
        capacity: expect.objectContaining({
          campaignCap: 1600,
          dailyCap: 1600,
          dailyUsed: 574,
          dailyRemaining: 1026,
        }),
      }),
    );
  });

  it('создает draft campaign из AI cohort без auto-send', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([
      { id: 'lead-1', firstName: 'Ana', conversations: [] },
      { id: 'lead-2', firstName: 'Ben', conversations: [] },
    ] as never);
    vi.spyOn(OutboundGateService, 'ensureCanLaunchOutbound').mockResolvedValue(undefined);
    const campaignCreate = vi.fn().mockResolvedValue({ id: 'campaign-ai', name: 'AI Retarget — Cross-rep' });
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
          description: 'AI Cohort · 2 leads · ~1 funded expected',
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

  it('использует активный LeadCohort cache и не регенерирует AI reasoning', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.campaign, 'count').mockResolvedValue(3);
    vi.spyOn(prisma.lead, 'count')
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(20)
      .mockResolvedValueOnce(5)
      .mockResolvedValueOnce(5);
    const leadFindMany = vi.spyOn(prisma.lead, 'findMany');
    const response = createResponse();

    await CampaignController.listAiCohorts(createRequest(), response);

    expect(AIService.generateCohortReasoning).not.toHaveBeenCalled();
    expect(leadFindMany).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        cohorts: expect.arrayContaining([
          expect.objectContaining({ reasoningText: 'Cached cohort reasoning from LeadCohort snapshot.' }),
        ]),
      }),
    );
  });

  it('создает 24h LeadCohort snapshot с критериями и Anthropic reasoning при cache miss', async () => {
    vi.mocked(prisma.leadCohort.findFirst).mockResolvedValueOnce(null);
    vi.mocked(AIService.generateCohortReasoning).mockResolvedValueOnce({
      text: 'Generated Sonnet 4.5 cohort reasoning based on funded history and sample leads.',
      model: 'claude-sonnet-4-5',
    });
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.lead, 'count').mockResolvedValueOnce(2).mockResolvedValueOnce(2);
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([
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
        historicalAnchor: expect.stringContaining('Last cross-rep retarget'),
        sampleLeads: expect.arrayContaining([
          expect.objectContaining({ company: 'Restaurant Group', revenue: 95000, assignedRepInitials: 'AN' }),
        ]),
      }),
    );
    expect(prisma.leadCohort.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          cohortType: 'multi-retarget',
          title: expect.stringContaining('Cross-rep retarget'),
          queryJson: expect.objectContaining({ revenueMin: 80000, requiresInboundReply: true }),
          predictedReplyRate: 14,
          expectedFundedCount: 1,
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

  it('блокирует manual campaign create при превышении per-campaign cap', async () => {
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

  it('разрешает rep manual campaign create выше базового 500 cap, когда assigned number capacity выше', async () => {
    vi.spyOn(NumberService, 'getAssignedNumberCapacity').mockResolvedValue({
      phoneNumberIds: ['number-1', 'number-2', 'number-3'],
      dailyCap: 1200,
      dailyUsed: 0,
      dailyRemaining: 1200,
    });
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue(
      Array.from({ length: 830 }, (_, index) => ({ id: `lead-${index}` })) as never,
    );
    vi.spyOn(prisma.campaignLead, 'createMany').mockResolvedValue({ count: 830 } as never);
    const campaignCreate = vi.spyOn(prisma.campaign, 'create').mockResolvedValue({ id: 'campaign-1' } as never);
    vi.spyOn(prisma.campaign, 'update').mockResolvedValue({ id: 'campaign-1', totalLeads: 830 } as never);
    const response = createResponse();

    await CampaignController.create(
      createRequest({
        user: {
          id: 'rep-1',
          email: 'rep@sclcapital.io',
          role: 'REP',
          firstName: 'Rep',
          lastName: 'One',
        },
        body: {
          name: 'Rep campaign with expanded capacity',
          messageTemplate: 'Hi {{firstName}}',
          leadIds: ['lead-1'],
        },
      }),
      response,
    );

    expect(campaignCreate).toHaveBeenCalled();
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        campaign: expect.objectContaining({ id: 'campaign-1' }),
      }),
    );
  });

  it('блокирует manual campaign create при превышении rolling daily cap', async () => {
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
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'Daily capacity: 4495 of 4500 already used. Adding 10 would push over. Remaining capacity: 5.',
      }),
    );
    expect(campaignCreate).not.toHaveBeenCalled();
  });

  it('возвращает детальную ошибку, когда rolling daily cap исчерпан', async () => {
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
