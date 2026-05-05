import { afterEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/database';
import { InboxController } from '../src/controllers/inboxController';

interface InboxControllerPrivate {
  logRepClassificationDisagreement(input: {
    conversationId: string;
    repId: string | null;
    aiClassification: string | null;
    repAction: 'mark_interested' | 'mark_not_interested' | 'mark_dnc' | 'email_rcv' | 'pipeline_added';
    source: string;
  }): Promise<void>;
}

const inboxControllerPrivate = InboxController as unknown as InboxControllerPrivate;

describe('Classification disagreement feedback logging', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('должен логировать disagreement, если rep отмечает Interested при AI WARM', async () => {
    const createSpy = vi.spyOn(prisma.classificationFeedback, 'create').mockResolvedValue({ id: 'fb-1' } as never);

    await inboxControllerPrivate.logRepClassificationDisagreement({
      conversationId: 'conv-1',
      repId: 'rep-1',
      aiClassification: 'WARM',
      repAction: 'mark_interested',
      source: 'test',
    });

    expect(createSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          conversationId: 'conv-1',
          createdById: 'rep-1',
          action: 'rep_mark_interested',
          aiClassification: 'WARM',
        }),
      }),
    );
  });

  it('не должен логировать disagreement, если rep отмечает Interested при AI HOT', async () => {
    const createSpy = vi.spyOn(prisma.classificationFeedback, 'create').mockResolvedValue({ id: 'fb-2' } as never);

    await inboxControllerPrivate.logRepClassificationDisagreement({
      conversationId: 'conv-2',
      repId: 'rep-2',
      aiClassification: 'HOT',
      repAction: 'mark_interested',
      source: 'test',
    });

    expect(createSpy).not.toHaveBeenCalled();
  });
});
