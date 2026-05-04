import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { CampaignController } from '../src/controllers/campaignController';
import { LeadController } from '../src/controllers/leadController';
import prisma from '../src/config/database';
import type { AuthRequest } from '../src/middleware/auth';

function createRequest(overrides: Partial<AuthRequest> = {}): AuthRequest {
  return {
    query: {},
    params: {},
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

describe('M2.1 lead/campaign scope policy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('scopes campaign list to campaigns created by the current rep', async () => {
    const findMany = vi.spyOn(prisma.campaign, 'findMany').mockResolvedValue([]);
    const count = vi.spyOn(prisma.campaign, 'count').mockResolvedValue(0);
    const response = createResponse();

    await CampaignController.list(createRequest(), response);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { createdById: 'rep-1' },
      }),
    );
    expect(count).toHaveBeenCalledWith({ where: { createdById: 'rep-1' } });
  });

  it('blocks a rep from opening another rep campaign', async () => {
    vi.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({ id: 'campaign-1', createdById: 'rep-2' } as never);

    await expect(
      CampaignController.get(createRequest({ params: { id: 'campaign-1' } }), createResponse()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('blocks a rep from starting another rep campaign before queueing', async () => {
    vi.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({
      id: 'campaign-1',
      createdById: 'rep-2',
      status: 'DRAFT',
      _count: { leads: 1 },
    } as never);

    await expect(
      CampaignController.start(createRequest({ params: { id: 'campaign-1' } }), createResponse()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('blocks a rep from opening another rep campaign analytics', async () => {
    vi.spyOn(prisma.campaign, 'findUnique').mockResolvedValue({
      id: 'campaign-1',
      name: 'Other rep campaign',
      createdById: 'rep-2',
      status: 'DRAFT',
      totalLeads: 1,
      totalSent: 0,
      totalDelivered: 0,
      totalFailed: 0,
      totalBlocked: 0,
      totalReplied: 0,
      totalOptedOut: 0,
      startedAt: null,
      completedAt: null,
    } as never);

    await expect(
      CampaignController.getAnalytics(createRequest({ params: { id: 'campaign-1' } }), createResponse()),
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('filters campaign lead selection to the current rep leads', async () => {
    vi.spyOn(prisma.campaignLead, 'count').mockResolvedValue(0);
    vi.spyOn(prisma.campaign, 'create').mockResolvedValue({ id: 'campaign-1', totalLeads: 0 } as never);
    const findMany = vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([{ id: 'lead-1' }] as never);
    vi.spyOn(prisma.campaignLead, 'createMany').mockResolvedValue({ count: 1 } as never);
    vi.spyOn(prisma.campaign, 'update').mockResolvedValue({ id: 'campaign-1', totalLeads: 1 } as never);
    const response = createResponse();

    await CampaignController.create(
      createRequest({
        body: {
          name: 'Rep campaign',
          messageTemplate: 'Hi {{firstName}}',
          leadIds: ['lead-1', 'lead-2'],
        },
      }),
      response,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ['lead-1', 'lead-2'] },
          assignedRepId: 'rep-1',
        }),
      }),
    );
  });

  it('assigns newly imported mapped CSV leads to the current rep and filters eligible IDs by rep scope', async () => {
    vi.spyOn(prisma.pipelineStage, 'findFirst').mockResolvedValue(null);
    const leadFindMany = vi
      .spyOn(prisma.lead, 'findMany')
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([{ id: 'lead-new' }] as never);
    const upsert = vi
      .spyOn(prisma.lead, 'upsert')
      .mockReturnValue(Promise.resolve({ id: 'lead-new', phone: '+15551234567', assignedRepId: 'rep-1' }) as never);
    vi.spyOn(prisma, '$transaction').mockResolvedValue([
      { id: 'lead-new', phone: '+15551234567', assignedRepId: 'rep-1' },
    ] as never);
    vi.spyOn(prisma.tag, 'upsert').mockResolvedValue({ id: 'tag-1', name: 'May Leads' } as never);
    vi.spyOn(prisma.leadTag, 'createMany').mockResolvedValue({ count: 1 } as never);
    const response = createResponse();

    await LeadController.importMappedCSV(
      createRequest({
        body: {
          listName: 'May Leads',
          mapping: JSON.stringify({ phone: 'phone', firstName: 'firstName' }),
        },
        file: {
          buffer: Buffer.from('phone,firstName\n5551234567,Ana\n'),
        } as Express.Multer.File,
      }),
      response,
    );

    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          assignedRepId: 'rep-1',
          source: 'May Leads',
        }),
      }),
    );
    expect(leadFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: expect.objectContaining({
          assignedRepId: 'rep-1',
          id: { in: ['lead-new'] },
        }),
      }),
    );
  });
});
