import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { DealController } from '../src/controllers/dealController';
import prisma from '../src/config/database';
import type { AuthRequest } from '../src/middleware/auth';

function createRequest(query: AuthRequest['query'], role = 'REP'): AuthRequest {
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
  const response = {
    json: vi.fn(),
    status: vi.fn().mockReturnThis(),
  } as unknown as Response;
  return response;
}

function createActionRequest(body: Record<string, unknown>, role = 'REP'): AuthRequest {
  return {
    query: {},
    params: { id: 'deal-1' },
    body,
    app: {},
    user: {
      id: role === 'ADMIN' ? 'admin-1' : 'rep-1',
      email: role === 'ADMIN' ? 'admin@sclcapital.io' : 'rep@sclcapital.io',
      role,
      firstName: role === 'ADMIN' ? 'Admin' : 'Rep',
      lastName: 'One',
    },
  } as AuthRequest;
}

describe('DealController board scope', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('не должен отдавать unscoped team board обычному rep', async () => {
    const findMany = vi.spyOn(prisma.deal, 'findMany').mockResolvedValue([]);
    const response = createResponse();

    await DealController.getBoard(createRequest({ teamView: 'true' }), response);

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          OR: [{ assignedRepId: 'rep-1' }, { assistingRepIds: { array_contains: 'rep-1' } }],
        },
      }),
    );
  });

  it('должен оставлять unscoped team board только для admin', async () => {
    const findMany = vi.spyOn(prisma.deal, 'findMany').mockResolvedValue([]);
    const response = createResponse();

    await DealController.getBoard(createRequest({ teamView: 'true' }, 'ADMIN'), response);

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));
  });

  it('не должен разрешать primary rep удалять deal', async () => {
    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue({
      id: 'deal-1',
      clientId: 'client-1',
      stage: 'NEW_LEAD',
      assignedRepId: 'rep-1',
    } as never);
    const response = createResponse();

    await DealController.deleteDeal({ ...createRequest({}), params: { id: 'deal-1' } } as AuthRequest, response);

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ error: 'Only admin/manager can delete deals' });
  });

  it('не должен разрешать rep переносить чужой deal', async () => {
    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue({
      id: 'deal-2',
      clientId: 'client-2',
      stage: 'NEW_LEAD',
      stageLabel: 'New Lead',
      assignedRepId: 'rep-2',
      assistingRepIds: [],
    } as never);
    const response = createResponse();

    await DealController.moveDeal(
      { ...createRequest({}), params: { id: 'deal-2' }, body: { stage: 'QUALIFIED' } } as AuthRequest,
      response,
    );

    expect(response.status).toHaveBeenCalledWith(403);
    expect(response.json).toHaveBeenCalledWith({ error: 'Access denied' });
  });

  it('должен создавать deal с выбранным admin assigned rep и scoped socket emit', async () => {
    const emitMock = vi.fn();
    const toMock = vi.fn().mockReturnValue({ emit: emitMock });
    const createdDeal = {
      id: 'deal-created-1',
      clientId: 'client-created-1',
      assignedRepId: 'rep-2',
      assistingRepIds: [],
      stage: 'NEW_LEAD',
      stageLabel: 'New Lead',
      productType: 'MCA',
      dealAmount: 50000,
      submittedAmount: null,
      lastReplyAt: null,
      lenderEngaged: false,
      appSubmitted: false,
      client: { id: 'client-created-1', businessName: 'Fresh Deal LLC' },
      assignedRep: { id: 'rep-2', firstName: 'Rep', lastName: 'Two', initials: 'RT' },
    };

    vi.spyOn(prisma.client, 'create').mockResolvedValue({
      id: 'client-created-1',
      businessName: 'Fresh Deal LLC',
    } as never);
    const dealCreate = vi.spyOn(prisma.deal, 'create').mockResolvedValue(createdDeal as never);
    vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);

    const request = {
      ...createActionRequest(
        {
          businessName: 'Fresh Deal LLC',
          contactName: 'Taylor Client',
          email: 'taylor@example.com',
          productType: 'MCA',
          dealAmount: '50000',
          assignedRepId: 'rep-2',
        },
        'ADMIN',
      ),
      app: { io: { to: toMock } },
    } as AuthRequest;
    const response = createResponse();

    await DealController.createDeal(request, response);

    expect(dealCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          assignedRepId: 'rep-2',
          stage: 'NEW_LEAD',
          stageLabel: 'New Lead',
          productType: 'MCA',
          dealAmount: 50000,
          submittedAmount: null,
          nextAction: 'Make first contact within 24h',
        }),
      }),
    );
    expect(toMock).toHaveBeenCalledWith('inbox:rep-2');
    expect(toMock).toHaveBeenCalledWith('inbox:admin-1');
    expect(response.status).toHaveBeenCalledWith(201);
    expect(response.json).toHaveBeenCalledWith(createdDeal);
  });

  it('должен шарить deal и уведомлять нового assisting rep через scoped socket room', async () => {
    const emitMock = vi.fn();
    const toMock = vi.fn().mockReturnValue({ emit: emitMock });
    const existingDeal = {
      id: 'deal-1',
      clientId: 'client-1',
      stage: 'QUALIFIED',
      stageLabel: 'Qualified',
      assignedRepId: 'rep-1',
      assistingRepIds: [],
    };
    const updatedDeal = {
      ...existingDeal,
      assistingRepIds: ['rep-2'],
    };

    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue(existingDeal as never);
    vi.spyOn(prisma.user, 'count').mockResolvedValue(1);
    const update = vi.spyOn(prisma.deal, 'update').mockResolvedValue(updatedDeal as never);
    vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);

    const request = {
      ...createActionRequest({ assistingRepIds: ['rep-2'] }),
      app: { io: { to: toMock } },
    } as AuthRequest;
    const response = createResponse();

    await DealController.shareDeal(request, response);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'deal-1' },
        data: { assistingRepIds: ['rep-2'] },
      }),
    );
    expect(toMock).toHaveBeenCalledWith('inbox:rep-1');
    expect(toMock).toHaveBeenCalledWith('inbox:rep-2');
    expect(response.json).toHaveBeenCalledWith(updatedDeal);
  });
});
