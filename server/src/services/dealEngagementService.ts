import { DealStage } from '@prisma/client';
import prisma from '../config/database';

export type DealEngagementResetReason = 'inbound_sms' | 'forward_stage_move' | 'manual_override';

export interface ResetDealEngagementResult {
  id: string;
  stage: DealStage;
  assignedRepId: string | null;
  assistingRepIds: unknown;
  contactAttempts: number;
  lastEngagementAt: Date | null;
}

const RESET_BLOCKED_STAGES = new Set<DealStage>([DealStage.FUNDED, DealStage.CLOSED]);

export async function resetDealEngagement(args: {
  dealId: string;
  reason: DealEngagementResetReason;
  actorUserId?: string | null;
}): Promise<ResetDealEngagementResult | null> {
  const existing = await prisma.deal.findUnique({
    where: { id: args.dealId },
    select: {
      id: true,
      stage: true,
      assignedRepId: true,
      assistingRepIds: true,
      contactAttempts: true,
    },
  });

  if (!existing || RESET_BLOCKED_STAGES.has(existing.stage)) return null;

  const now = new Date();
  const previousAttempts = existing.contactAttempts || 0;
  const updated = await prisma.deal.update({
    where: { id: args.dealId },
    data: {
      contactAttempts: 0,
      lastEngagementAt: now,
      lastActivityAt: now,
      staleDays: 0,
    },
    select: {
      id: true,
      stage: true,
      assignedRepId: true,
      assistingRepIds: true,
      contactAttempts: true,
      lastEngagementAt: true,
    },
  });

  await prisma.dealEvent.create({
    data: {
      dealId: args.dealId,
      repId: args.actorUserId || null,
      eventType: 'engagement_reset',
      fromStage: existing.stage,
      toStage: existing.stage,
      note: `Contact attempts reset: ${args.reason}`,
      metadata: {
        reason: args.reason,
        previousAttempts,
        contactAttempts: 0,
      },
    },
  });

  return updated;
}

export async function resetDealEngagementForConversation(args: {
  conversationId: string;
  leadId?: string | null;
  reason: DealEngagementResetReason;
}): Promise<ResetDealEngagementResult[]> {
  const orFilters: Array<{ smsConversationId?: string; leadId?: string }> = [
    { smsConversationId: args.conversationId },
  ];
  if (args.leadId) orFilters.push({ leadId: args.leadId });

  const deals = await prisma.deal.findMany({
    where: {
      OR: orFilters,
      stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] },
    },
    select: { id: true },
  });

  const dealIds = Array.from(new Set(deals.map((deal) => deal.id)));
  const resetDeals = await Promise.all(dealIds.map((dealId) => resetDealEngagement({ dealId, reason: args.reason })));

  return resetDeals.filter((deal): deal is ResetDealEngagementResult => !!deal);
}
