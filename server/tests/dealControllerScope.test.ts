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
});
