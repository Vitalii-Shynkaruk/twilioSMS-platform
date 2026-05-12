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

  it('должен quarantine 30003 после 3 попаданий за rolling 30 days', async () => {
    vi.spyOn(prisma.systemSetting, 'findUnique').mockResolvedValue({
      key: 'transientQuarantineStartedAt',
      value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    } as never);
    vi.spyOn(prisma.message, 'count').mockResolvedValue(3);
    vi.spyOn(prisma.lead, 'findMany').mockResolvedValue([
      {
        id: 'lead-30003',
        optedOut: false,
        isSuppressed: false,
        suppressReason: null,
      },
    ] as never);
    vi.spyOn(prisma.suppressionEntry, 'findUnique').mockResolvedValue(null as never);
    const updateMany = vi.spyOn(prisma.lead, 'updateMany').mockReturnValue({} as never);
    const upsertEntry = vi.spyOn(prisma.suppressionEntry, 'upsert').mockReturnValue({} as never);
    vi.spyOn(prisma.activityLog, 'create').mockReturnValue({} as never);
    const transaction = vi.spyOn(prisma, '$transaction').mockResolvedValue([] as never);
    const invalidateCache = vi.spyOn(ComplianceService, 'invalidateCache').mockResolvedValue();

    const result = await ComplianceService.handleTransientDeliveryFailure('+15553000300', '30003', {
      errorMessage: 'Unreachable destination handset',
      source: 'test_status_callback',
    });

    expect(result).toBe(true);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: { in: ['lead-30003'] } },
      data: {
        isSuppressed: true,
        suppressedAt: expect.any(Date),
        suppressReason: 'QUARANTINE_TRANSIENT',
      },
    });
    expect(upsertEntry).toHaveBeenCalledWith({
      where: { phone: '+15553000300' },
      create: { phone: '+15553000300', reason: 'QUARANTINE_TRANSIENT', source: 'test_status_callback' },
      update: { reason: 'QUARANTINE_TRANSIENT', source: 'test_status_callback' },
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(invalidateCache).toHaveBeenCalledWith('+15553000300');
  });

  it('не должен quarantine 30003 до 3 попаданий', async () => {
    vi.spyOn(prisma.systemSetting, 'findUnique').mockResolvedValue({
      key: 'transientQuarantineStartedAt',
      value: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    } as never);
    vi.spyOn(prisma.message, 'count').mockResolvedValue(2);
    const updateMany = vi.spyOn(prisma.lead, 'updateMany').mockReturnValue({} as never);
    const upsertEntry = vi.spyOn(prisma.suppressionEntry, 'upsert').mockReturnValue({} as never);

    const result = await ComplianceService.handleTransientDeliveryFailure('+15553000301', '30003');

    expect(result).toBe(false);
    expect(updateMany).not.toHaveBeenCalled();
    expect(upsertEntry).not.toHaveBeenCalled();
  });

  it('должен очищать только auto-generated suppression через admin override', async () => {
    vi.spyOn(prisma.lead, 'findUnique').mockResolvedValue({
      id: 'lead-override',
      phone: '+15550001111',
      status: 'NEW',
      optedOut: false,
      isSuppressed: true,
      suppressReason: 'LOOKUP_INVALID',
    } as never);
    vi.spyOn(prisma.suppressionEntry, 'findUnique').mockResolvedValue({ reason: 'LOOKUP_INVALID' } as never);
    vi.spyOn(prisma.lead, 'update').mockReturnValue({} as never);
    vi.spyOn(prisma.suppressionEntry, 'deleteMany').mockReturnValue({} as never);
    vi.spyOn(prisma.activityLog, 'create').mockReturnValue({} as never);
    const transaction = vi.spyOn(prisma, '$transaction').mockResolvedValue([] as never);
    const invalidateCache = vi.spyOn(ComplianceService, 'invalidateCache').mockResolvedValue();

    const result = await ComplianceService.overrideAutoSuppression('lead-override', 'admin-1');

    expect(result).toEqual({
      phone: '+15550001111',
      clearedReason: 'LOOKUP_INVALID',
      deletedSuppressionEntry: true,
    });
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(invalidateCache).toHaveBeenCalledWith('+15550001111');
  });

  it('не должен override STOP/DNC/NOT_INTERESTED', async () => {
    vi.spyOn(prisma.lead, 'findUnique').mockResolvedValue({
      id: 'lead-stop',
      phone: '+15550002222',
      status: 'DNC',
      optedOut: true,
      isSuppressed: true,
      suppressReason: 'STOP',
    } as never);
    vi.spyOn(prisma.suppressionEntry, 'findUnique').mockResolvedValue({ reason: 'STOP' } as never);

    await expect(ComplianceService.overrideAutoSuppression('lead-stop', 'admin-1')).rejects.toThrow(
      'Suppression override is locked',
    );
  });
});
