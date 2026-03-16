import prisma from '../config/database';
import logger from '../config/logger';

/**
 * AutoTagService - Automatically applies tags to leads based on events
 * 
 * Events handled:
 * - reply: Tags 'replied', and 'hot-lead' if response was fast (<1h)
 * - opt-out: Tags 'opted-out'
 * - cold: Tags 'cold' for leads with no reply in 7+ days
 * - campaign-sent: Tags 'campaign:<name>'
 */
export class AutoTagService {
  
  /**
   * Ensure a tag exists (create if needed) and return its id
   */
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

  /**
   * Apply a tag to a lead (idempotent — skips if already applied)
   */
  private static async applyTag(leadId: string, tagId: string): Promise<void> {
    const existing = await prisma.leadTag.findFirst({
      where: { leadId, tagId },
    });
    if (!existing) {
      await prisma.leadTag.create({ data: { leadId, tagId } });
    }
  }

  /**
   * Remove a tag from a lead
   */
  private static async removeTag(leadId: string, tagId: string): Promise<void> {
    await prisma.leadTag.deleteMany({ where: { leadId, tagId } });
  }

  /**
   * Called when a lead replies to an SMS
   */
  static async onReply(leadId: string): Promise<void> {
    try {
      const repliedTagId = await this.ensureTag('replied', '#22c55e');
      await this.applyTag(leadId, repliedTagId);

      // Check if this was a fast reply (< 1 hour since last outbound message)
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

      // Remove 'cold' tag if it was applied
      const coldTag = await prisma.tag.findFirst({ where: { name: 'cold' } });
      if (coldTag) {
        await this.removeTag(leadId, coldTag.id);
      }

      logger.info(`Auto-tagged lead ${leadId}: replied`);
    } catch (err) {
      logger.error('AutoTag onReply error', { leadId, error: (err as Error).message });
    }
  }

  /**
   * Called when a lead opts out (STOP)
   */
  static async onOptOut(leadId: string): Promise<void> {
    try {
      const tagId = await this.ensureTag('opted-out', '#ef4444');
      await this.applyTag(leadId, tagId);
      logger.info(`Auto-tagged lead ${leadId}: opted-out`);
    } catch (err) {
      logger.error('AutoTag onOptOut error', { leadId, error: (err as Error).message });
    }
  }

  /**
   * Batch job: tag leads as 'cold' who haven't replied in 7+ days after being contacted
   * OPTIMIZED: Uses batch queries instead of N+1 per lead
   */
  static async tagColdLeads(): Promise<number> {
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const coldTagId = await this.ensureTag('cold', '#6b7280');

      // Find leads that were contacted 7+ days ago with no reply
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

      // Batch: find which leads already have the cold tag
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

  /**
   * Called when a campaign is sent to a lead
   */
  static async onCampaignSent(leadId: string, campaignName: string): Promise<void> {
    try {
      const tagId = await this.ensureTag(`campaign:${campaignName}`, '#8b5cf6');
      await this.applyTag(leadId, tagId);
    } catch (err) {
      logger.error('AutoTag onCampaignSent error', { leadId, error: (err as Error).message });
    }
  }
}
