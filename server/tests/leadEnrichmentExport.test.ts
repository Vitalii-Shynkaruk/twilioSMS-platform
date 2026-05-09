import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { LeadController } from '../src/controllers/leadController';
import prisma from '../src/config/database';
import type { AuthRequest } from '../src/middleware/auth';

function createRequest(query: AuthRequest['query'] = {}, role = 'REP'): AuthRequest {
  return {
    query,
    user: {
      id: 'rep-1',
      email: 'rep@sclcapital.io',
      role,
      firstName: 'Rep',
      lastName: 'One',
    },
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

function createLeadFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'lead-1',
    firstName: 'Ana',
    lastName: 'Rivera',
    phone: '+15551234567',
    email: 'ana@example.com',
    company: 'Ana Cafe',
    state: 'CA',
    source: 'CJ 10.8 12K',
    status: 'REPLIED',
    customFields: { monthlyRevenue: '82k' },
    assignedRepId: 'rep-1',
    assignedRep: { id: 'rep-1', firstName: 'Jordan', lastName: 'Baker', initials: 'JB' },
    tags: [{ tag: { id: 'tag-1', name: 'Verizon list', color: '#3b82f6', isImportList: true } }],
    deal: { id: 'deal-1', stage: 'QUALIFIED', stageLabel: 'Qualified', dealAmount: 0, isHot: false, client: null },
    conversations: [
      {
        id: 'conv-1',
        lastMessageAt: new Date('2026-05-02T12:00:00.000Z'),
        extractedIndustry: 'Restaurants',
        extractedRevenue: 91000,
        aiSignals: { industry: 'Food service', revenueMonthly: 91000 },
        assignedRep: { id: 'rep-1', firstName: 'Jordan', lastName: 'Baker', initials: 'JB' },
        messages: [
          {
            id: 'msg-1',
            direction: 'OUTBOUND',
            createdAt: new Date('2026-05-02T12:00:00.000Z'),
            sentByUser: { id: 'rep-1', firstName: 'Jordan', lastName: 'Baker', initials: 'JB' },
          },
        ],
      },
    ],
    campaignLeads: [{ campaign: { id: 'campaign-1', name: 'Spring outreach', isRetarget: false } }],
    _count: { conversations: 1 },
    createdAt: new Date('2026-05-01T10:00:00.000Z'),
    updatedAt: new Date('2026-05-02T12:00:00.000Z'),
    lastContactedAt: new Date('2026-05-02T12:00:00.000Z'),
    lastRepliedAt: null,
    ...overrides,
  };
}

describe('M2.2 Leads enrichment/export', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns lead enrichment fields in list responses', async () => {
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([createLeadFixture()] as never);
    vi.spyOn(prisma.lead, 'count').mockResolvedValue(1);
    const response = createResponse();

    await LeadController.list(createRequest(), response);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        leads: [
          expect.objectContaining({
            enrichment: expect.objectContaining({
              industry: 'Restaurants',
              monthlyRevenue: 82000,
              revenueSource: 'CSV',
              lastContactRepInitials: 'JB',
              readableSourcePrimary: 'CJ 10.8 12K',
              readableSourceSecondary: 'Verizon list',
            }),
          }),
        ],
      }),
    );
  });

  it('persists manual industry and monthly revenue on lead update', async () => {
    const existingLead = createLeadFixture({
      status: 'NEW',
      industry: null,
      monthlyRevenue: null,
      monthlyRevenueSource: null,
      deal: { id: 'deal-1', stage: 'NEW_LEAD' },
    });
    vi.spyOn(prisma.lead, 'findUnique').mockResolvedValue(existingLead as never);
    const updateLead = vi.spyOn(prisma.lead, 'update').mockResolvedValue({
      ...existingLead,
      industry: 'Restaurants',
      monthlyRevenue: 80000,
      monthlyRevenueSource: 'manual',
      deal: { id: 'deal-1', stage: 'NEW_LEAD' },
    } as never);
    const response = createResponse();

    await LeadController.update(
      {
        params: { id: 'lead-1' },
        body: { firstName: 'Ana', industry: 'Restaurants', monthlyRevenue: '$80k' },
        user: {
          id: 'rep-1',
          email: 'rep@sclcapital.io',
          role: 'REP',
          firstName: 'Rep',
          lastName: 'One',
        },
      } as AuthRequest,
      response,
    );

    expect(updateLead).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-1' },
        data: expect.objectContaining({
          industry: 'Restaurants',
          monthlyRevenue: 80000,
          monthlyRevenueSource: 'manual',
        }),
      }),
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        lead: expect.objectContaining({ monthlyRevenueSource: 'manual' }),
      }),
    );
  });

  it('exports enrichment columns while preserving rep scope', async () => {
    const findMany = vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([createLeadFixture()] as never);
    const response = createResponse();

    await LeadController.exportCSV(
      createRequest({ search: 'Ana', status: 'REPLIED', tags: 'tag-1', revenueMin: '80000' }),
      response,
    );

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedRepId: 'rep-1',
          tags: { some: { tagId: { in: ['tag-1'] } } },
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.arrayContaining([{ company: { contains: 'Ana' } }]) }),
            expect.objectContaining({ status: { in: ['REPLIED'] } }),
          ]),
        }),
      }),
    );
    expect(response.write).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Last Contact,Last Contact Rep,Industry,Monthly Revenue,Revenue Origin,Readable Source'),
    );
    expect(response.write).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Restaurants,82000,CSV,CJ 10.8 12K,Verizon list'),
    );
    expect(response.end).toHaveBeenCalled();
  });

  it('applies revenueMin to list queries', async () => {
    const findMany = vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([createLeadFixture()] as never);
    const countSpy = vi.spyOn(prisma.lead, 'count');
    const response = createResponse();

    await LeadController.list(createRequest({ revenueMin: '100000' }, 'ADMIN'), response);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
    expect(countSpy).not.toHaveBeenCalled();
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        leads: [],
        pagination: expect.objectContaining({ total: 0 }),
      }),
    );
  });

  it('applies revenueMin using the same fallback revenue sources as the UI', async () => {
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([
      createLeadFixture({
        customFields: null,
        monthlyRevenue: null,
        monthlyRevenueSource: null,
        deal: {
          id: 'deal-1',
          stage: 'QUALIFIED',
          stageLabel: 'Qualified',
          dealAmount: 0,
          isHot: false,
          client: { monthlyRevenue: '$120k/mo' },
        },
        conversations: [
          {
            id: 'conv-1',
            lastMessageAt: new Date('2026-05-02T12:00:00.000Z'),
            extractedIndustry: 'Restaurants',
            extractedRevenue: null,
            aiSignals: { industry: 'Food service' },
            assignedRep: { id: 'rep-1', firstName: 'Jordan', lastName: 'Baker', initials: 'JB' },
            messages: [],
          },
        ],
      }),
    ] as never);
    const response = createResponse();

    await LeadController.list(createRequest({ revenueMin: '100000' }, 'ADMIN'), response);

    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        leads: [expect.objectContaining({ enrichment: expect.objectContaining({ monthlyRevenue: 120000, revenueSource: 'MANUAL' }) })],
        pagination: expect.objectContaining({ total: 1 }),
      }),
    );
  });

  it('combines last-contact filter with search OR conditions', async () => {
    const findMany = vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([createLeadFixture()] as never);
    vi.spyOn(prisma.lead, 'count').mockResolvedValue(1);
    const response = createResponse();

    await LeadController.list(createRequest({ search: 'Ana', lastContactedBefore: '30d' }, 'ADMIN'), response);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          AND: expect.arrayContaining([
            expect.objectContaining({ OR: expect.arrayContaining([{ company: { contains: 'Ana' } }]) }),
            expect.objectContaining({
              OR: expect.arrayContaining([{ lastContactedAt: null }, { lastContactedAt: { lt: expect.any(Date) } }]),
            }),
          ]),
        }),
      }),
    );
  });

  it('returns state filter options without source options in rep scope', async () => {
    vi.spyOn(prisma.lead, 'findMany')
      .mockResolvedValueOnce([createLeadFixture()] as never)
      .mockResolvedValueOnce([{ state: 'CA' }] as never);
    const response = createResponse();

    await LeadController.filterOptions(createRequest(), response);

    expect(prisma.lead.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: expect.objectContaining({ assignedRepId: 'rep-1' }) }),
    );
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        sources: [],
        states: [{ value: 'CA', label: 'CA' }],
      }),
    );
  });
});
