import { DealStage, ProductType } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import prisma from '../src/config/database';
import {
  buildPipelineAiPayload,
  canUserAccessPipelineDeal,
  enqueuePipelineExtraction,
  findPipelineExtractionTargetsForInboundSms,
  getPipelineAiLocalSkipReason,
  type PipelineAiSignals,
} from '../src/services/pipelineAiService';

const emptySignals: PipelineAiSignals = {
  _extraction_scope: 'lead_only',
  skip_reason: null,
  industry: '',
  monthly_revenue: null,
  use_of_funds: null,
  requested_amount: null,
  product_interest: [],
  pending_actions: [],
  has_stacked_history: false,
  current_active_positions: null,
  recent_stacking_activity: { active: false, window: null },
};

function createUser(id: string, role = 'REP') {
  return {
    id,
    email: `${id}@sclcapital.io`,
    role,
    firstName: 'Test',
    lastName: 'User',
  };
}

describe('M1.4 Pipeline AI service', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('собирает payload в canonical handoff format', () => {
    const payload = buildPipelineAiPayload({
      existingSignals: { industry: 'Logistics', product_interest: ['MCA'] },
      inputType: 'rep_note',
      text: 'Line one\nLine two',
      stageAtTime: DealStage.QUALIFIED,
      productAtTime: ProductType.MCA,
    });

    expect(payload).toBe(
      [
        '[EXISTING SIGNALS]',
        JSON.stringify({ industry: 'Logistics', product_interest: ['MCA'] }),
        '',
        '[NEW INPUT]',
        'type: rep_note',
        'stage_at_time: QUALIFIED',
        'product_at_time: MCA',
        'text: |',
        '  Line one',
        '  Line two',
      ].join('\n'),
    );
  });

  it('возвращает локальные skip reasons до LLM вызова', () => {
    expect(getPipelineAiLocalSkipReason('[EMAIL]')).toBe('contact_info_only');
    expect(getPipelineAiLocalSkipReason('Have not received yet')).toBe('too_short');
    expect(getPipelineAiLocalSkipReason('Trucking business does $80k a month and wants equipment')).toBeNull();
  });

  it('сохраняет Pipeline access: admin/manager все, rep primary или assisting', () => {
    const deal = { assignedRepId: 'rep-1', assistingRepIds: ['rep-2'] };

    expect(canUserAccessPipelineDeal(createUser('admin-1', 'ADMIN'), deal)).toBe(true);
    expect(canUserAccessPipelineDeal(createUser('manager-1', 'MANAGER'), deal)).toBe(true);
    expect(canUserAccessPipelineDeal(createUser('rep-1'), deal)).toBe(true);
    expect(canUserAccessPipelineDeal(createUser('rep-2'), deal)).toBe(true);
    expect(canUserAccessPipelineDeal(createUser('rep-3'), deal)).toBe(false);
  });

  it('выбирает inbound SMS targets только по активным post-intake deals', async () => {
    const findMany = vi.spyOn(prisma.deal, 'findMany').mockResolvedValue([
      { id: 'deal-qualified', stage: DealStage.QUALIFIED, productType: ProductType.MCA },
      { id: 'deal-qualified', stage: DealStage.QUALIFIED, productType: ProductType.MCA },
      { id: 'deal-approved', stage: DealStage.APPROVED_OFFERS, productType: ProductType.HELOC },
    ] as never);

    const result = await findPipelineExtractionTargetsForInboundSms({
      conversationId: 'conversation-1',
      leadId: 'lead-1',
      dealIds: ['deal-qualified', 'deal-qualified'],
      text: 'I do about 90k monthly and need 60k for inventory',
    });

    expect(findMany).toHaveBeenCalledWith({
      where: {
        OR: [{ smsConversationId: 'conversation-1' }, { leadId: 'lead-1' }, { id: { in: ['deal-qualified'] } }],
        stage: { notIn: [DealStage.NEW_LEAD, DealStage.ENGAGED_INTERESTED, DealStage.FUNDED, DealStage.CLOSED] },
      },
      select: { id: true, stage: true, productType: true },
    });
    expect(result.deals).toEqual([
      { id: 'deal-qualified', stage: DealStage.QUALIFIED, productType: ProductType.MCA },
      { id: 'deal-approved', stage: DealStage.APPROVED_OFFERS, productType: ProductType.HELOC },
    ]);
  });

  it('сериализует extraction queue per deal', async () => {
    const order: string[] = [];
    let markFirstStarted: (() => void) | null = null;
    let releaseFirst: (() => void) | null = null;
    const firstStarted = new Promise<void>((resolve) => {
      markFirstStarted = resolve;
    });
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = enqueuePipelineExtraction('deal-queue', async () => {
      order.push('first:start');
      markFirstStarted?.();
      await firstGate;
      order.push('first:end');
      return emptySignals;
    });
    const second = enqueuePipelineExtraction('deal-queue', async () => {
      order.push('second:start');
      return { ...emptySignals, industry: 'trucking' };
    });

    await firstStarted;
    expect(order).toEqual(['first:start']);
    releaseFirst?.();

    await expect(Promise.all([first, second])).resolves.toEqual([
      emptySignals,
      { ...emptySignals, industry: 'trucking' },
    ]);
    expect(order).toEqual(['first:start', 'first:end', 'second:start']);
  });
});
