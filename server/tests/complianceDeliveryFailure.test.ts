import { afterEach, describe, expect, it, vi } from 'vitest';

const { redisMock, loggerMock } = vi.hoisted(() => ({
  redisMock: {
    get: vi.fn(),
    setex: vi.fn(),
    del: vi.fn(),
  },
  loggerMock: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

vi.mock('../src/config/redis', () => ({
  default: redisMock,
}));

vi.mock('../src/config/logger', () => ({
  default: loggerMock,
}));

import prisma from '../src/config/database';
import { ComplianceService } from '../src/services/complianceService';

describe('ComplianceService.handleDeliveryFailure', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('должен автоматически suppress invalid destination для 30005', async () => {
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([
      {
        id: 'lead-1',
        optedOut: false,
        isSuppressed: false,
        suppressReason: null,
      },
    ] as never);
    vi.spyOn(prisma.suppressionEntry, 'findUnique').mockResolvedValue(null as never);
    const updateMany = vi.spyOn(prisma.lead, 'updateMany').mockReturnValue({} as never);
    const createEntry = vi.spyOn(prisma.suppressionEntry, 'create').mockReturnValue({} as never);
    const transaction = vi.spyOn(prisma, '$transaction').mockResolvedValue([] as never);
    const invalidateCache = vi.spyOn(ComplianceService, 'invalidateCache').mockResolvedValue();

    const result = await ComplianceService.handleDeliveryFailure('+15551234567', '30005', {
      errorMessage: 'Unknown destination',
      source: 'test_status_callback',
    });

    expect(result).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['lead-1'] },
      },
      data: {
        isSuppressed: true,
        suppressedAt: expect.any(Date),
        suppressReason: 'INVALID_DESTINATION',
      },
    });
    expect(createEntry).toHaveBeenCalledWith({
      data: {
        phone: '+15551234567',
        reason: 'INVALID_DESTINATION',
        source: 'test_status_callback',
      },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(invalidateCache).toHaveBeenCalledWith('+15551234567');
  });

  it('не должен suppress временный 30003', async () => {
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([
      {
        id: 'lead-1',
        optedOut: false,
        isSuppressed: false,
        suppressReason: null,
      },
    ] as never);
    vi.spyOn(prisma.suppressionEntry, 'findUnique').mockResolvedValue(null as never);
    const updateMany = vi.spyOn(prisma.lead, 'updateMany').mockReturnValue({} as never);
    const createEntry = vi.spyOn(prisma.suppressionEntry, 'create').mockReturnValue({} as never);
    const transaction = vi.spyOn(prisma, '$transaction').mockResolvedValue([] as never);
    const invalidateCache = vi.spyOn(ComplianceService, 'invalidateCache').mockResolvedValue();

    const result = await ComplianceService.handleDeliveryFailure('+15557654321', '30003', {
      errorMessage: 'Unreachable destination handset',
      source: 'test_status_callback',
    });

    expect(result).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
    expect(createEntry).not.toHaveBeenCalled();
    expect(transaction).not.toHaveBeenCalled();
    expect(invalidateCache).not.toHaveBeenCalled();
  });
});
