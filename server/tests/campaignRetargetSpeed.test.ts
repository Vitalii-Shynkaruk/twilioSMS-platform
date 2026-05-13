import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { CampaignController } from '../src/controllers/campaignController';
import prisma from '../src/config/database';
import type { AuthRequest } from '../src/middleware/auth';
import { ComplianceService } from '../src/services/complianceService';
import { NumberService } from '../src/services/numberService';
import { OutboundGateService } from '../src/services/outboundGateService';
import { campaignQueue } from '../src/services/sendingEngine';

function createRequest(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    query: {},
    params: { id: 'source-campaign-1' },
    body: {},
    user: {
      id: 'rep-1',
      email: 'rep@sclcapital.io',
      role: 'REP',
      firstName: 'Rep',
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

describe('CampaignController retarget speed', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a regular retarget campaign at 4/min by default instead of inheriting the source speed', async () => {
    vi.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({
      id: 'source-campaign-1',
      name: 'Original campaign',
      messageTemplate: 'Original body',
      numberPoolId: 'pool-1',
      sendingSpeed: 60,
      dailyLimit: 200,
      createdById: 'rep-1',
    } as never);
    vi.spyOn(prisma.campaignLead, 'findMany').mockResolvedValue([
      {
        leadId: 'lead-1',
        status: 'DELIVERED',
        lead: {
          id: 'lead-1',
          phone: '+15550001111',
          status: 'NEW',
          optedOut: false,
          isSuppressed: false,
        },
      },
    ] as never);
    vi.spyOn(prisma.message, 'findMany')
      .mockResolvedValueOnce([
        {
          status: 'DELIVERED',
          sentAt: new Date('2026-05-13T10:00:00.000Z'),
          createdAt: new Date('2026-05-13T10:00:00.000Z'),
          conversation: { leadId: 'lead-1' },
        },
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.spyOn(prisma.suppressionEntry, 'findMany').mockResolvedValue([] as never);
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([
      {
        id: 'lead-1',
        phone: '+15550001111',
        status: 'NEW',
        optedOut: false,
        isSuppressed: false,
      },
    ] as never);

    vi.spyOn(OutboundGateService, 'ensureCanLaunchOutbound').mockResolvedValue();
    vi.spyOn(ComplianceService, 'isQuietHours').mockResolvedValue(false);
    vi.spyOn(NumberService, 'getActiveAssignedNumberIds').mockResolvedValue(['number-1']);
    vi.spyOn(NumberService, 'getBestAvailableNumber').mockResolvedValue({ id: 'number-1' } as never);
    vi.spyOn(NumberService, 'getAssignedNumberCapacity').mockResolvedValue({
      phoneNumberIds: ['number-1'],
      dailyCap: 1000,
      dailyUsed: 0,
      dailyRemaining: 1000,
    });

    const campaignCreate = vi.fn().mockResolvedValue({ id: 'retarget-campaign-1' });
    const campaignLeadCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) =>
      callback({
        campaign: { create: campaignCreate },
        campaignLead: { createMany: campaignLeadCreateMany },
      }),
    );
    const queueAdd = vi.spyOn(campaignQueue, 'add').mockResolvedValue({} as never);

    const response = createResponse();

    await CampaignController.retargetCreate(
      createRequest({
        body: {
          name: 'Retarget - safer speed',
          messageTemplate: 'Follow up body',
        },
      }),
      response,
    );

    expect(campaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sendingSpeed: 4,
        }),
      }),
    );
    expect(queueAdd).toHaveBeenCalledWith(
      'campaign-start',
      expect.objectContaining({ campaignId: 'retarget-campaign-1' }),
    );
  });

  it('uses the explicit new retarget speed when the user selects one', async () => {
    vi.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({
      id: 'source-campaign-1',
      name: 'Original campaign',
      messageTemplate: 'Original body',
      numberPoolId: 'pool-1',
      sendingSpeed: 60,
      dailyLimit: 200,
      createdById: 'rep-1',
    } as never);
    vi.spyOn(prisma.campaignLead, 'findMany').mockResolvedValue([
      {
        leadId: 'lead-1',
        status: 'DELIVERED',
        lead: {
          id: 'lead-1',
          phone: '+15550001111',
          status: 'NEW',
          optedOut: false,
          isSuppressed: false,
        },
      },
    ] as never);
    vi.spyOn(prisma.message, 'findMany')
      .mockResolvedValueOnce([
        {
          status: 'DELIVERED',
          sentAt: new Date('2026-05-13T10:00:00.000Z'),
          createdAt: new Date('2026-05-13T10:00:00.000Z'),
          conversation: { leadId: 'lead-1' },
        },
      ] as never)
      .mockResolvedValueOnce([] as never);
    vi.spyOn(prisma.suppressionEntry, 'findMany').mockResolvedValue([] as never);
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([
      {
        id: 'lead-1',
        phone: '+15550001111',
        status: 'NEW',
        optedOut: false,
        isSuppressed: false,
      },
    ] as never);

    vi.spyOn(OutboundGateService, 'ensureCanLaunchOutbound').mockResolvedValue();
    vi.spyOn(ComplianceService, 'isQuietHours').mockResolvedValue(false);
    vi.spyOn(NumberService, 'getActiveAssignedNumberIds').mockResolvedValue(['number-1']);
    vi.spyOn(NumberService, 'getBestAvailableNumber').mockResolvedValue({ id: 'number-1' } as never);
    vi.spyOn(NumberService, 'getAssignedNumberCapacity').mockResolvedValue({
      phoneNumberIds: ['number-1'],
      dailyCap: 1000,
      dailyUsed: 0,
      dailyRemaining: 1000,
    });

    const campaignCreate = vi.fn().mockResolvedValue({ id: 'retarget-campaign-2' });
    const campaignLeadCreateMany = vi.fn().mockResolvedValue({ count: 1 });
    vi.spyOn(prisma, '$transaction').mockImplementation(async (callback: any) =>
      callback({
        campaign: { create: campaignCreate },
        campaignLead: { createMany: campaignLeadCreateMany },
      }),
    );
    vi.spyOn(campaignQueue, 'add').mockResolvedValue({} as never);

    await CampaignController.retargetCreate(
      createRequest({
        body: {
          name: 'Retarget - explicit speed',
          messageTemplate: 'Follow up body',
          sendingSpeed: 10,
        },
      }),
      createResponse(),
    );

    expect(campaignCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          sendingSpeed: 10,
        }),
      }),
    );
  });
});
