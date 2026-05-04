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

  it('должен добавлять enrichment в список лидов', async () => {
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

  it('должен экспортировать enrichment columns и сохранять REP scope', async () => {
    const findMany = vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([createLeadFixture()] as never);
    const response = createResponse();

    await LeadController.exportCSV(createRequest({ search: 'Ana', status: 'REPLIED', tags: 'tag-1' }), response);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          assignedRepId: 'rep-1',
          status: { in: ['REPLIED'] },
          tags: { some: { tagId: { in: ['tag-1'] } } },
          OR: expect.arrayContaining([{ company: { contains: 'Ana' } }]),
        }),
      }),
    );
    expect(response.write).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('Last Contact,Last Contact Rep,Industry,Monthly Revenue,Revenue Source,Readable Source'),
    );
    expect(response.write).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Restaurants,82000,CSV,CJ 10.8 12K,Verizon list'),
    );
    expect(response.end).toHaveBeenCalled();
  });
});
