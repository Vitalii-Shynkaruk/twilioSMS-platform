import prisma from '../config/database';
import logger from '../config/logger';

/**
 * WebhookService - Fires outbound HTTP webhooks on events.
 * Reads webhook URLs from SystemSetting DB table.
 * 
 * Events:
 * - onReply: fires to webhookOnReply URL
 * - onOptOut: fires to webhookOnOptOut URL
 * - onStageChange: fires to webhookOnStageChange URL
 */
export class WebhookService {
  private static async getUrl(key: string): Promise<string | null> {
    const setting = await prisma.systemSetting.findUnique({ where: { key } });
    return setting?.value ? String(setting.value) : null;
  }

  private static async fire(url: string, payload: Record<string, any>): Promise<void> {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          timestamp: new Date().toISOString(),
          source: 'scl-sms-platform',
        }),
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      if (!response.ok) {
        logger.warn(`Webhook ${url} responded with ${response.status}`);
      } else {
        logger.info(`Webhook fired: ${url}`, { event: payload.event });
      }
    } catch (err) {
      logger.error(`Webhook failed: ${url}`, { error: (err as Error).message });
    }
  }

  /**
   * Fired when a lead replies to an SMS
   */
  static async onReply(data: {
    leadId: string;
    phone: string;
    body: string;
    conversationId: string;
  }): Promise<void> {
    const url = await this.getUrl('webhookOnReply');
    if (!url) return;
    await this.fire(url, { event: 'reply', ...data });
  }

  /**
   * Fired when a lead opts out
   */
  static async onOptOut(data: {
    phone: string;
    leadId?: string;
  }): Promise<void> {
    const url = await this.getUrl('webhookOnOptOut');
    if (!url) return;
    await this.fire(url, { event: 'opt_out', ...data });
  }

  /**
   * Fired when a lead's pipeline stage changes
   */
  static async onStageChange(data: {
    leadId: string;
    fromStage: string;
    toStage: string;
  }): Promise<void> {
    const url = await this.getUrl('webhookOnStageChange');
    if (!url) return;
    await this.fire(url, { event: 'stage_change', ...data });
  }
}
