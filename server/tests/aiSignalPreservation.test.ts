import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import prisma from '../src/config/database';
import { InboxController } from '../src/controllers/inboxController';
import { AIService } from '../src/services/aiService';

interface InboxControllerPrivate {
  applyFastOwnerSignalRefresh(req: unknown, conversationId: string): Promise<void>;
  triggerOwnerActionReclassification(
    req: unknown,
    conversationId: string,
    reason: 'status_update' | 'note_added' | 'pipeline_added' | 'reply_sent',
    repId: string | null,
  ): void;
}

const inboxControllerPrivate = InboxController as unknown as InboxControllerPrivate;

describe('AI signal preservation and HELOC tri-state', () => {
  let originalClassificationEnabled = false;

  beforeEach(() => {
    originalClassificationEnabled = config.ai.classificationEnabled;
    (config.ai as { classificationEnabled: boolean }).classificationEnabled = true;
  });

  afterEach(() => {
    (config.ai as { classificationEnabled: boolean }).classificationEnabled = originalClassificationEnabled;
    vi.restoreAllMocks();
  });

  it('должен очищать stale heloc=false в fast-path, если в notes/messages нет явного HELOC-mismatch', async () => {
    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue({
      id: 'conv-heloc-fastpath',
      assignedRepId: 'rep-1',
      aiClassification: 'WARM',
      aiLeadScore: 54,
      aiSignals: {
        helocFitFlag: false,
        staleState: 'active',
      },
      extractedRevenue: null,
      extractedAsk: null,
      extractedIndustry: null,
      helocFitFlag: false,
      notes: [{ body: '$150k monthly gross. Good credit.' }],
      messages: [
        {
          direction: 'OUTBOUND',
          body: 'Would a line of credit help?',
        },
      ],
    } as never);

    const updateSpy = vi.spyOn(prisma.conversation, 'update').mockResolvedValue({ id: 'conv-heloc-fastpath' } as never);
    vi.spyOn(prisma.conversationAudit, 'create').mockResolvedValue({ id: 'audit-1' } as never);

    const req = {
      user: { id: 'admin-1' },
      app: {},
    };

    await inboxControllerPrivate.applyFastOwnerSignalRefresh(req as never, 'conv-heloc-fastpath');

    expect(updateSpy).toHaveBeenCalledTimes(1);
    const updateData = (updateSpy.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    const persistedSignals = updateData.aiSignals as Record<string, unknown>;

    expect(updateData.helocFitFlag).toBeNull();
    expect(persistedSignals.helocFitFlag).toBeUndefined();
    expect(updateData.extractedRevenue).toBe(150000);
    expect(persistedSignals.revenueMonthly).toBe(150000);
  });

  it('должен сохранять существующие ask/revenue/industry при owner reclassify, если новый AI-ответ пустой', async () => {
    vi.spyOn(AIService, 'classifyInbound').mockResolvedValue({
      classification: 'WARM',
      leadScore: 58,
      promptVersion: 'test-prompt',
      isCaliforniaNumber: false,
      signals: {},
      suggestions: [],
    } as never);

    vi.spyOn(prisma.conversation, 'findUnique').mockResolvedValue({
      aiSignals: {
        industry: 'construction',
        ask: '$75k',
        revenueMonthly: 450000,
        helocFitFlag: false,
      },
      extractedIndustry: 'construction',
      helocFitFlag: false,
      extractedRevenue: 450000,
      extractedAsk: '$75k',
    } as never);

    const updateSpy = vi.spyOn(prisma.conversation, 'update').mockResolvedValue({ id: 'conv-preserve-1' } as never);
    vi.spyOn(prisma.conversationAudit, 'create').mockResolvedValue({ id: 'audit-2' } as never);

    const req = {
      user: { id: 'admin-1' },
      app: {},
    };

    inboxControllerPrivate.triggerOwnerActionReclassification(
      req as never,
      'conv-preserve-1',
      'status_update',
      'rep-1',
    );

    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (updateSpy.mock.calls.length > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    expect(updateSpy).toHaveBeenCalledTimes(1);

    const updateData = (updateSpy.mock.calls[0]?.[0] as { data: Record<string, unknown> }).data;
    const persistedSignals = updateData.aiSignals as Record<string, unknown>;

    expect(updateData.extractedIndustry).toBe('construction');
    expect(updateData.extractedAsk).toBe('$75k');
    expect(updateData.extractedRevenue).toBe(450000);
    expect(updateData.helocFitFlag).toBeNull();

    expect(persistedSignals.industry).toBe('construction');
    expect(persistedSignals.ask).toBe('$75k');
    expect(persistedSignals.revenueMonthly).toBe(450000);
    expect(persistedSignals.helocFitFlag).toBeNull();
  });
});
