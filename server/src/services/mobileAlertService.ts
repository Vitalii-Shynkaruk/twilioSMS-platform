import prisma from '../config/database';
import logger from '../config/logger';
import { getActiveTwilioClient, getActiveMessagingServiceSid } from '../config/twilio';

/**
 * MobileAlertService — Phase 1 AI Inbox: HOT lead SMS alerts.
 *
 * При классификации входящего как HOT отправляет один SMS на мобильный номер
 * назначенного rep'а (User.mobilePhone), если у него включён hotAlertsEnabled.
 *
 * Источник отправки (следует SCL_AI_INBOX_BUILD_PLAN.md «Twilio SMS service»):
 *   1. SystemSetting.hotAlertFromNumber — явный override
 *   2. Активный Messaging Service SID (основной канал платформы)
 *   3. env TWILIO_FROM_NUMBER
 *   4. Первый ACTIVE PhoneNumber
 *
 * Эскалационная лестница, BullMQ retry и автопереназначение — НЕ в Phase 1.
 */
export class MobileAlertService {
  /**
   * Определяет источник отправки. Возвращает либо { messagingServiceSid }, либо { from }.
   */
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

  /**
   * Отправить HOT-алерт rep'у на мобильный.
   *
   * @param repId — User.id назначенного rep'а
   * @param leadName — отображаемое имя лида (для текста SMS)
   * @param messageBody — текст входящего, обрежется до 60 символов в превью
   * @returns true если SMS реально отправлен, false если пропущен (нет mobilePhone, выключены алерты, ошибка)
   */
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
      const body = `HOT lead reply from ${leadName}: '${preview}' — check SCL now`;

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
