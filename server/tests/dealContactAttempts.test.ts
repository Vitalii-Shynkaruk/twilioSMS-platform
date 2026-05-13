import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { DealController } from '../src/controllers/dealController';
import { resetDealEngagementForConversation } from '../src/services/dealEngagementService';
import prisma from '../src/config/database';
import type { AuthRequest } from '../src/middleware/auth';

function createRequest(
  body: Record<string, unknown>,
  params: Record<string, string> = { id: 'deal-1' },
  role = 'REP',
): AuthRequest {
  return {
    params,
    body,
    query: {},
    app: {},
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
  } as unknown as Response;
}

function createDealFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 'deal-1',
    clientId: 'client-1',
    assignedRepId: 'rep-1',
    assistingRepIds: [],
    leadId: 'lead-1',
    stage: 'ENGAGED_INTERESTED',
    stageLabel: 'Engaged / Interested',
    contactAttempts: 2,
    contactAttemptThreshold: 10,
    lastEngagementAt: null,
    lastReplyAt: null,
    lenderEngaged: false,
    appSubmitted: false,
    followUpType: null,
    followUpDate: null,
    client: { id: 'client-1', businessName: 'Ana Cafe' },
    ...overrides,
  };
}

describe('M1.5 deal contact attempts', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('инкрементирует quick-log attempts для no_answer', async () => {
    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue(createDealFixture() as never);
    const update = vi
      .spyOn(prisma.deal, 'update')
      .mockResolvedValue(createDealFixture({ contactAttempts: 3 }) as never);
    const eventCreate = vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);
    const response = createResponse();

    await DealController.logAttempt(createRequest({ kind: 'no_answer' }), response);

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactAttempts: 3 }),
      }),
    );
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'contact_attempt_logged',
          metadata: expect.objectContaining({ kind: 'no_answer', previousAttempts: 2, contactAttempts: 3 }),
        }),
      }),
    );
    expect(response.json).toHaveBeenCalled();
  });

  it.each(['no_answer', 'texted', 'voicemail'] as const)(
    'переносит overdue nextActionDue на следующий business day при quick-log attempt %s',
    async (kind) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-05-08T16:00:00.000Z'));

      vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue(
        createDealFixture({ nextActionDue: new Date('2026-05-01T12:00:00.000Z') }) as never,
      );
      const update = vi.spyOn(prisma.deal, 'update').mockResolvedValue(
        createDealFixture({
          contactAttempts: 3,
          nextActionDue: new Date('2026-05-11T12:00:00.000Z'),
        }) as never,
      );
      vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);

      await DealController.logAttempt(createRequest({ kind }), createResponse());

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            contactAttempts: 3,
            nextActionDue: new Date('2026-05-11T12:00:00.000Z'),
          }),
        }),
      );
    },
  );

  it('автоматически переносит в Nurture при достижении threshold', async () => {
    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue(
      createDealFixture({ contactAttempts: 9, contactAttemptThreshold: 10 }) as never,
    );
    const update = vi
      .spyOn(prisma.deal, 'update')
      .mockResolvedValue(createDealFixture({ contactAttempts: 10, stage: 'NURTURE', stageLabel: 'Nurture' }) as never);
    const eventCreate = vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);
    const leadUpdate = vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: 'lead-1' } as never);

    await DealController.logAttempt(createRequest({ kind: 'voicemail' }), createResponse());

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactAttempts: 10,
          stage: 'NURTURE',
          lostReason: 'Auto-nurture after 10 contact attempts',
          followUpType: 'reengage',
        }),
      }),
    );
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: 'auto_nurture_attempt_threshold', toStage: 'NURTURE' }),
      }),
    );
    expect(leadUpdate).toHaveBeenCalledWith({ where: { id: 'lead-1' }, data: { status: 'NOT_INTERESTED' } });
  });

  it('connected сбрасывает attempts, due date и обновляет engagement timestamp', async () => {
    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue(
      createDealFixture({ contactAttempts: 4, nextActionDue: new Date('2026-05-01T12:00:00.000Z') }) as never,
    );
    const update = vi
      .spyOn(prisma.deal, 'update')
      .mockResolvedValue(
        createDealFixture({ contactAttempts: 0, lastEngagementAt: new Date('2026-05-02T10:00:00.000Z') }) as never,
      );
    vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);

    await DealController.logAttempt(createRequest({ kind: 'connected' }), createResponse());

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactAttempts: 0, lastEngagementAt: expect.any(Date), nextActionDue: null }),
      }),
    );
  });

  it('not_interested переносит в Nurture без инкремента counter', async () => {
    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue(createDealFixture({ contactAttempts: 4 }) as never);
    const update = vi
      .spyOn(prisma.deal, 'update')
      .mockResolvedValue(createDealFixture({ contactAttempts: 0, stage: 'NURTURE', stageLabel: 'Nurture' }) as never);
    vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);
    vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: 'lead-1' } as never);

    await DealController.logAttempt(createRequest({ kind: 'not_interested' }), createResponse());

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactAttempts: 0, stage: 'NURTURE', lostReason: 'Not interested' }),
      }),
    );
  });

  it('сбрасывает attempts при forward stage move', async () => {
    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue(createDealFixture({ contactAttempts: 4 }) as never);
    const update = vi
      .spyOn(prisma.deal, 'update')
      .mockResolvedValue(
        createDealFixture({ contactAttempts: 0, stage: 'QUALIFIED', stageLabel: 'Qualified' }) as never,
      );
    const eventCreate = vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);
    vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: 'lead-1' } as never);

    await DealController.moveDeal(createRequest({ stage: 'QUALIFIED' }), createResponse());

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ contactAttempts: 0, lastEngagementAt: expect.any(Date) }),
      }),
    );
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'engagement_reset',
          metadata: expect.objectContaining({ reason: 'forward_stage_move', previousAttempts: 4, contactAttempts: 0 }),
        }),
      }),
    );
  });

  it('сбрасывает attempts для active deals на inbound SMS conversation', async () => {
    vi.spyOn(prisma.deal, 'findMany').mockResolvedValue([{ id: 'deal-1' }] as never);
    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue(createDealFixture({ contactAttempts: 5 }) as never);
    const update = vi
      .spyOn(prisma.deal, 'update')
      .mockResolvedValue(
        createDealFixture({ contactAttempts: 0, lastEngagementAt: new Date(), lastReplyAt: new Date() }) as never,
      );
    const eventCreate = vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);

    const resetDeals = await resetDealEngagementForConversation({
      conversationId: 'conversation-1',
      leadId: 'lead-1',
      reason: 'inbound_sms',
    });

    expect(resetDeals).toHaveLength(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactAttempts: 0,
          lastEngagementAt: expect.any(Date),
          lastReplyAt: expect.any(Date),
        }),
      }),
    );
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'engagement_reset',
          metadata: expect.objectContaining({ reason: 'inbound_sms', previousAttempts: 5, contactAttempts: 0 }),
        }),
      }),
    );
  });

  it('разрешает admin manual override и пишет audit event', async () => {
    vi.spyOn(prisma.deal, 'findUnique').mockResolvedValue(createDealFixture({ contactAttempts: 6 }) as never);
    const update = vi
      .spyOn(prisma.deal, 'update')
      .mockResolvedValue(createDealFixture({ contactAttempts: 0, lastEngagementAt: new Date() }) as never);
    const eventCreate = vi.spyOn(prisma.dealEvent, 'create').mockResolvedValue({ id: 'event-1' } as never);

    await DealController.updateDeal(
      createRequest({ contactAttempts: 0, contactAttemptThreshold: 12 }, { id: 'deal-1' }, 'ADMIN'),
      createResponse(),
    );

    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          contactAttempts: 0,
          contactAttemptThreshold: 12,
          lastEngagementAt: expect.any(Date),
        }),
      }),
    );
    expect(eventCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: 'engagement_reset',
          metadata: expect.objectContaining({ reason: 'manual_override', previousAttempts: 6, contactAttempts: 0 }),
        }),
      }),
    );
  });

  it('сохраняет Revive Queue compatibility для canonical reengage follow-up', async () => {
    const dueDeal = createDealFixture({
      id: 'deal-revive',
      stage: 'NURTURE',
      followUpType: 'reengage',
      followUpDate: new Date('2026-05-01T10:00:00.000Z'),
      dealAmount: 50000,
    });
    vi.spyOn(prisma.deal, 'findMany')
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([] as never)
      .mockResolvedValueOnce([dueDeal] as never)
      .mockResolvedValueOnce([] as never);
    const response = createResponse();

    await DealController.getReviveQueue(createRequest({}, {}, 'ADMIN'), response);

    expect(response.json).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'deal-revive', followUpType: 'reengage', reviveSource: 'follow_up' }),
    ]);
  });
});
