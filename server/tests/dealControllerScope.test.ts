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
});
