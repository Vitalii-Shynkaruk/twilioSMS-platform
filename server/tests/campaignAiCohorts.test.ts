import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { CampaignController } from '../src/controllers/campaignController';
import prisma from '../src/config/database';
import type { AuthRequest } from '../src/middleware/auth';
import { OutboundGateService } from '../src/services/outboundGateService';

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
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('возвращает admin AI cohorts с capacity и expected funded', async () => {
    vi.spyOn(prisma.message, 'count').mockResolvedValue(125);
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
    vi.spyOn(prisma.message, 'count').mockResolvedValue(0);
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

  it('создает draft campaign из AI cohort без auto-send', async () => {
    vi.spyOn(prisma.message, 'count').mockResolvedValue(0);
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
});
