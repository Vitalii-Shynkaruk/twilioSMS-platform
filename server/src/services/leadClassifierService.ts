import { Prisma } from '@prisma/client';
import prisma from '../config/database';
import logger from '../config/logger';

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function readSignalIndustry(signals: Record<string, unknown> | null): string | null {
  const industry = signals?.industry;
  return typeof industry === 'string' && industry.trim() ? industry.trim().slice(0, 100) : null;
}

function readSignalRevenue(signals: Record<string, unknown> | null): number | null {
  const revenue = signals?.revenueMonthly;
  if (typeof revenue === 'number' && Number.isFinite(revenue) && revenue > 0) return Math.round(revenue);
  if (typeof revenue !== 'string') return null;

  const numeric = Number(revenue.replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(numeric) || numeric <= 0) return null;
  const multiplier = revenue.toLowerCase().includes('m') ? 1_000_000 : revenue.toLowerCase().includes('k') ? 1_000 : 1;
  return Math.round(numeric * multiplier);
}

export class LeadClassifierService {
  static async syncAiSignalsToLead(conversationId: string): Promise<void> {
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        leadId: true,
        extractedIndustry: true,
        extractedRevenue: true,
        aiSignals: true,
        lead: {
          select: {
            id: true,
            industry: true,
            monthlyRevenue: true,
            monthlyRevenueSource: true,
          },
        },
      },
    });

    if (!conversation?.lead) return;

    const signals = asRecord(conversation.aiSignals);
    const industry =
      (conversation.extractedIndustry?.trim() ? conversation.extractedIndustry.trim().slice(0, 100) : null) ||
      readSignalIndustry(signals);
    const monthlyRevenue = conversation.extractedRevenue || readSignalRevenue(signals);
    const updateData: Prisma.LeadUpdateInput = {};

    if (industry && !conversation.lead.industry) {
      updateData.industry = industry;
    }

    const source = String(conversation.lead.monthlyRevenueSource || '').toLowerCase();
    const hasMonthlyRevenue = conversation.lead.monthlyRevenue !== null;
    if (monthlyRevenue && !hasMonthlyRevenue && source !== 'manual') {
      updateData.monthlyRevenue = new Prisma.Decimal(monthlyRevenue);
      updateData.monthlyRevenueSource = 'ai_extracted';
    }

    if (Object.keys(updateData).length === 0) return;

    await prisma.lead.update({
      where: { id: conversation.lead.id },
      data: {
        ...updateData,
        aiSignalsSyncedAt: new Date(),
      },
    });

    logger.info('Lead AI signals synced from conversation', {
      conversationId,
      leadId: conversation.lead.id,
      industrySynced: Boolean(updateData.industry),
      revenueSynced: Boolean(updateData.monthlyRevenue),
    });
  }
}
