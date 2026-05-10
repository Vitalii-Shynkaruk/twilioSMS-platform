import prisma from '../config/database';
import logger from '../config/logger';
import { getActiveTwilioClient, getActiveMessagingServiceSid } from '../config/twilio';

export class MobileAlertService {
  private static async getSendOrigin(): Promise<{ messagingServiceSid: string } | { from: string } | null> {
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'hotAlertFromNumber' },
    });
    const fromSetting = typeof setting?.value === 'string' ? setting.value.trim() : '';
    if (fromSetting) return { from: fromSetting };

    const msgSid = await getActiveMessagingServiceSid();
    if (msgSid) return { messagingServiceSid: msgSid };

    const envFrom = (process.env.TWILIO_FROM_NUMBER || '').trim();
    if (envFrom) return { from: envFrom };

    const firstActive = await prisma.phoneNumber.findFirst({
      where: { status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { phoneNumber: true },
    });
    return firstActive ? { from: firstActive.phoneNumber } : null;
  }

  static async sendHotAlert(repId: string, leadName: string, messageBody: string): Promise<boolean> {
    try {
      const rep = await prisma.user.findUnique({
        where: { id: repId },
        select: { id: true, mobilePhone: true, hotAlertsEnabled: true, firstName: true },
      });

      if (!rep) {
        logger.warn('HOT-alert: rep not found', { repId });
        return false;
      }
      if (!rep.hotAlertsEnabled) {
        logger.info('HOT-alert: skipped — hotAlertsEnabled=false', { repId });
        return false;
      }
      if (!rep.mobilePhone || !/^\+?\d{10,15}$/.test(rep.mobilePhone.replace(/\s|-/g, ''))) {
        logger.info('HOT-alert: skipped — invalid/missing mobilePhone', {
          repId,
          mobilePhone: rep.mobilePhone,
        });
        return false;
      }

      const client = await getActiveTwilioClient();
      if (!client) {
        logger.error('HOT-alert: Twilio client unavailable');
        return false;
      }

      const origin = await this.getSendOrigin();
      if (!origin) {
        logger.error('HOT-alert: no "from" number / messaging service configured');
        return false;
      }

      const preview = (messageBody || '').replace(/\s+/g, ' ').trim().slice(0, 60);
      const body = `[SCL HOT] Lead reply from ${leadName}: '${preview}' — open SCL Inbox now`;

      const to = rep.mobilePhone.startsWith('+') ? rep.mobilePhone : `+${rep.mobilePhone.replace(/\D/g, '')}`;

      const msg = await client.messages.create({ to, body, ...origin });

      logger.info('HOT-alert: SMS sent', {
        repId,
        to,
        origin,
        sid: msg.sid,
        status: msg.status,
      });
      return true;
    } catch (err) {
      logger.error('HOT-alert: send failed', {
        repId,
        error: (err as Error).message,
      });
      return false;
    }
  }
}
