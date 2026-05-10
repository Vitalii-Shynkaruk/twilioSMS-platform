import prisma from '../config/database';
import logger from '../config/logger';

export class AutoTagService {
  
  private static async ensureTag(name: string, color: string): Promise<string> {
    let tag = await prisma.tag.findFirst({ where: { name } });
    if (!tag) {
      tag = await prisma.tag.create({
        data: { name, color },
      });
      logger.info(`Auto-created tag: ${name}`);
    }
    return tag.id;
  }

  private static async applyTag(leadId: string, tagId: string): Promise<void> {
    const existing = await prisma.leadTag.findFirst({
      where: { leadId, tagId },
    });
    if (!existing) {
      await prisma.leadTag.create({ data: { leadId, tagId } });
    }
  }

  private static async removeTag(leadId: string, tagId: string): Promise<void> {
    await prisma.leadTag.deleteMany({ where: { leadId, tagId } });
  }

  static async onReply(leadId: string): Promise<void> {
    try {
      const repliedTagId = await this.ensureTag('replied', '#22c55e');
      await this.applyTag(leadId, repliedTagId);

      const lead = await prisma.lead.findUnique({
        where: { id: leadId },
        include: {
          conversations: {
            include: {
              messages: {
                where: { direction: 'OUTBOUND' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      });

      const lastOutbound = lead?.conversations?.[0]?.messages?.[0];
      if (lastOutbound) {
        const diff = Date.now() - new Date(lastOutbound.createdAt).getTime();
        const oneHour = 60 * 60 * 1000;
        if (diff < oneHour) {
          const hotTagId = await this.ensureTag('hot-lead', '#f59e0b');
          await this.applyTag(leadId, hotTagId);
          logger.info(`Lead ${leadId} tagged as hot-lead (replied in ${Math.round(diff / 60000)}min)`);
        }
      }

      const coldTag = await prisma.tag.findFirst({ where: { name: 'cold' } });
      if (coldTag) {
        await this.removeTag(leadId, coldTag.id);
      }

      logger.info(`Auto-tagged lead ${leadId}: replied`);
    } catch (err) {
      logger.error('AutoTag onReply error', { leadId, error: (err as Error).message });
    }
  }

  static async onOptOut(leadId: string): Promise<void> {
    try {
      const tagId = await this.ensureTag('opted-out', '#ef4444');
      await this.applyTag(leadId, tagId);
      logger.info(`Auto-tagged lead ${leadId}: opted-out`);
    } catch (err) {
      logger.error('AutoTag onOptOut error', { leadId, error: (err as Error).message });
    }
  }

  static async tagColdLeads(): Promise<number> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const coldTagId = await this.ensureTag('cold', '#6b7280');

      const coldLeads = await prisma.lead.findMany({
        where: {
          status: { in: ['CONTACTED', 'NEW'] },
          lastContactedAt: { lt: sevenDaysAgo },
          lastRepliedAt: null,
        },
        select: { id: true },
        take: 500,
      });

      if (coldLeads.length === 0) return 0;

      const leadIds = coldLeads.map(l => l.id);

      const existingTags = await prisma.leadTag.findMany({
        where: { tagId: coldTagId, leadId: { in: leadIds } },
        select: { leadId: true },
      });
      const alreadyTagged = new Set(existingTags.map(t => t.leadId));
      const toTag = leadIds.filter(id => !alreadyTagged.has(id));

      if (toTag.length > 0) {
        await prisma.leadTag.createMany({
          data: toTag.map(leadId => ({ leadId, tagId: coldTagId })),
          skipDuplicates: true,
        });
      }

      if (toTag.length > 0) {
        logger.info(`Auto-tagged ${toTag.length} cold leads`);
      }
      return toTag.length;
    } catch (err) {
      logger.error('AutoTag tagColdLeads error', { error: (err as Error).message });
      return 0;
    }
  }

  static async onCampaignSent(leadId: string, campaignName: string): Promise<void> {
    try {
      const tagId = await this.ensureTag(`campaign:${campaignName}`, '#8b5cf6');
      await this.applyTag(leadId, tagId);
    } catch (err) {
      logger.error('AutoTag onCampaignSent error', { leadId, error: (err as Error).message });
    }
  }
}
