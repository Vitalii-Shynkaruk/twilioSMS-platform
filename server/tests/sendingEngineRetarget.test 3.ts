import { afterEach, describe, expect, it, vi } from 'vitest';

import prisma from '../src/config/database';
import { ComplianceService } from '../src/services/complianceService';
import { SendingEngine, smsQueue } from '../src/services/sendingEngine';

describe('SendingEngine retarget suppression', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('должен пропускать retarget lead с входящим ответом за последние 7 дней', async () => {
    vi.spyOn(prisma.suppressionEntry, 'findMany').mockResolvedValue([] as never);
    vi.spyOn(prisma.lead, 'findMany')
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([
        {
          id: 'lead-1',
          assignedRepId: 'rep-1',
          lastRepliedAt: new Date(),
        },
      ] as never);
    vi.spyOn(ComplianceService, 'isQuietHours').mockResolvedValue(false);
    vi.spyOn(prisma.conversation, 'findMany').mockResolvedValue([
      {
        id: 'conv-1',
        leadId: 'lead-1',
        assignedRepId: 'rep-1',
        _count: { messages: 1 },
      },
    ] as never);
    const updateMany = vi.spyOn(prisma.campaignLead, 'updateMany').mockResolvedValue({ count: 1 } as never);
    const messageCreate = vi.spyOn(prisma.message, 'create');
    const addBulk = vi.spyOn(smsQueue, 'addBulk');

    const result = await SendingEngine.queueBulkSend({
      campaignId: 'campaign-1',
      sentByUserId: 'rep-1',
      isRetarget: true,
      leads: [
        {
          leadId: 'lead-1',
          phone: '+15551234567',
          firstName: 'Ana',
        },
      ],
      messageTemplate: 'Hi {{firstName}}, quick follow up from SCL.',
    });

    expect(result).toEqual({
      queued: 0,
      skipped: 1,
      errors: ['Lead lead-1: Retarget suppressed (inbound within last 7 days)'],
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { campaignId: 'campaign-1', leadId: { in: ['lead-1'] } },
      data: { status: 'SKIPPED' },
    });
    expect(messageCreate).not.toHaveBeenCalled();
    expect(addBulk).not.toHaveBeenCalled();
  });
});
