import { afterEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/database';
import { InboxController } from '../src/controllers/inboxController';
import { ComplianceService } from '../src/services/complianceService';
import { SendingEngine } from '../src/services/sendingEngine';

describe('InboxController.sendReply', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('должен запускать AI reclassification после успешной отправки reply', async () => {
    const conversation = {
      id: 'conv-1',
      assignedRepId: 'rep-1',
      twilioNumberId: null,
      stickyNumberId: null,
      lead: {
        id: 'lead-1',
        phone: '+15550001111',
        assignedRepId: 'rep-1',
        status: 'CONTACTED',
      },
    };

    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue(conversation as never);
    vi.spyOn(prisma.conversation, 'update').mockResolvedValue({ id: 'conv-1' } as never);
    vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: 'lead-1' } as never);
    vi.spyOn(prisma.message, 'count').mockResolvedValue(1 as never);
    vi.spyOn(ComplianceService, 'clearNotInterestedSuppression').mockResolvedValue();

    const queueSpy = vi.spyOn(SendingEngine, 'queueMessage').mockResolvedValue('msg-1');
    const triggerSpy = vi
      .spyOn(
        InboxController as unknown as {
          triggerOwnerActionReclassification: (
            req: unknown,
            conversationId: string,
            reason: string,
            repId: string | null,
          ) => void;
        },
        'triggerOwnerActionReclassification',
      )
      .mockImplementation(() => {});

    const emitMock = vi.fn();
    const toMock = vi.fn().mockReturnValue({ emit: emitMock });
    const req = {
      params: { id: 'conv-1' },
      body: { body: 'Thanks for the reply.' },
      user: { id: 'admin-1', role: 'ADMIN' },
      app: { get: vi.fn().mockReturnValue({ to: toMock }) },
    };
    const res = { json: vi.fn() };

    await InboxController.sendReply(req as never, res as never);

    expect(queueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        toNumber: '+15550001111',
        body: 'Thanks for the reply.',
        leadId: 'lead-1',
        sentByUserId: 'admin-1',
      }),
    );
    expect(triggerSpy).toHaveBeenCalledWith(req, 'conv-1', 'reply_sent', 'rep-1');
    expect(toMock).toHaveBeenCalledWith('conversation:conv-1');
    expect(toMock).toHaveBeenCalledWith('inbox:rep-1');
    expect(res.json).toHaveBeenCalledWith({ messageId: 'msg-1', status: 'queued' });
  });

  it('должен использовать replying rep для reclassification, если тред был unassigned', async () => {
    const conversation = {
      id: 'conv-2',
      assignedRepId: null,
      twilioNumberId: null,
      stickyNumberId: null,
      lead: {
        id: 'lead-2',
        phone: '+15550002222',
        assignedRepId: null,
        status: 'CONTACTED',
      },
    };

    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue(conversation as never);
    vi.spyOn(prisma.conversation, 'update').mockResolvedValue({ id: 'conv-2' } as never);
    vi.spyOn(prisma.lead, 'update').mockResolvedValue({ id: 'lead-2' } as never);
    vi.spyOn(prisma.message, 'count').mockResolvedValueOnce(1).mockResolvedValueOnce(1);
    vi.spyOn(ComplianceService, 'clearNotInterestedSuppression').mockResolvedValue();

    const queueSpy = vi.spyOn(SendingEngine, 'queueMessage').mockResolvedValue('msg-2');
    const triggerSpy = vi
      .spyOn(
        InboxController as unknown as {
          triggerOwnerActionReclassification: (
            req: unknown,
            conversationId: string,
            reason: string,
            repId: string | null,
          ) => void;
        },
        'triggerOwnerActionReclassification',
      )
      .mockImplementation(() => {});

    const emitMock = vi.fn();
    const toMock = vi.fn().mockReturnValue({ emit: emitMock });
    const req = {
      params: { id: 'conv-2' },
      body: { body: 'Checking in again.' },
      user: { id: 'rep-42', role: 'REP' },
      app: { get: vi.fn().mockReturnValue({ to: toMock }) },
    };
    const res = { json: vi.fn() };

    await InboxController.sendReply(req as never, res as never);

    expect(queueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        toNumber: '+15550002222',
        body: 'Checking in again.',
        leadId: 'lead-2',
        sentByUserId: 'rep-42',
      }),
    );
    expect(triggerSpy).toHaveBeenCalledWith(req, 'conv-2', 'reply_sent', 'rep-42');
    expect(toMock).toHaveBeenCalledWith('conversation:conv-2');
    expect(toMock).toHaveBeenCalledWith('inbox:rep-42');
    expect(res.json).toHaveBeenCalledWith({ messageId: 'msg-2', status: 'queued' });
  });

  it('должен очищать stale NOT_INTERESTED suppression перед reply в активном треде', async () => {
    const conversation = {
      id: 'conv-3',
      assignedRepId: 'rep-3',
      twilioNumberId: null,
      stickyNumberId: null,
      lead: {
        id: 'lead-3',
        phone: '+15550003333',
        assignedRepId: 'rep-3',
        status: 'INTERESTED',
      },
    };

    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue(conversation as never);
    vi.spyOn(prisma.conversation, 'update').mockResolvedValue({ id: 'conv-3' } as never);
    vi.spyOn(prisma.message, 'count').mockResolvedValue(1 as never);

    const clearSpy = vi.spyOn(ComplianceService, 'clearNotInterestedSuppression').mockResolvedValue();
    const queueSpy = vi.spyOn(SendingEngine, 'queueMessage').mockResolvedValue('msg-3');

    const triggerSpy = vi
      .spyOn(
        InboxController as unknown as {
          triggerOwnerActionReclassification: (
            req: unknown,
            conversationId: string,
            reason: string,
            repId: string | null,
          ) => void;
        },
        'triggerOwnerActionReclassification',
      )
      .mockImplementation(() => {});

    const emitMock = vi.fn();
    const toMock = vi.fn().mockReturnValue({ emit: emitMock });
    const req = {
      params: { id: 'conv-3' },
      body: { body: 'Following up on your message.' },
      user: { id: 'admin-2', role: 'ADMIN' },
      app: { get: vi.fn().mockReturnValue({ to: toMock }) },
    };
    const res = { json: vi.fn() };

    await InboxController.sendReply(req as never, res as never);

    expect(clearSpy).toHaveBeenCalledWith('+15550003333');
    expect(queueSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        toNumber: '+15550003333',
        body: 'Following up on your message.',
        leadId: 'lead-3',
        sentByUserId: 'admin-2',
      }),
    );
    expect(triggerSpy).toHaveBeenCalledWith(req, 'conv-3', 'reply_sent', 'rep-3');
    expect(res.json).toHaveBeenCalledWith({ messageId: 'msg-3', status: 'queued' });
  });
});
