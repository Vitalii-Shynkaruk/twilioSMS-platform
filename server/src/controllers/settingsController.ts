import { Response } from 'express';
import prisma from '../config/database';
import redis from '../config/redis';
import logger from '../config/logger';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { resetTwilioClients } from '../config/twilio';

export class SettingsController {
  private static readonly ALLOWED_KEYS = new Set([
    'smsMode',
    'quietHoursStart',
    'quietHoursEnd',
    'quietHoursTimezone',
    'businessHoursStart',
    'businessHoursEnd',
    'maxDailySmsPerNumber',
    'globalDailyLimit',
    'defaultSendingSpeed',
    'rampUpEnabled',
    'rampUpDailyIncrease',
    'rampUpStartLimit',
    'coolingThreshold',
    'coolingDurationHours',
    'optOutMessage',
    'helpMessage',
    'companyName',
    'companyPhone',
    'autoTagEnabled',
    'aiAutoReplyEnabled',
    'aiModel',
    'twilioAccountSid',
    'twilioAuthToken',
    'twilioMessagingServiceSid',
    'webhookBaseUrl',
    'twilioTestAccountSid',
    'twilioTestAuthToken',
    'smtpFromEmail',
    'smtpHost',
    'smtpPort',
    'smtpUser',
    'smtpPassword',
    'smtpSecure',
    'openaiApiKey',
    'openaiModel',
    'anthropicApiKey',
    'anthropicModel',
    'aiProvider',
    'hotAlertFromNumber',
    'webhookUrl',
    'webhookSecret',
    'webhookOnReply',
    'webhookOnOptOut',
    'webhookOnStageChange',
    'brandPrimaryColor',
    'brandLogoUrl',
  ]);

  private static readonly SENSITIVE_KEYS = new Set([
    'twilioAuthToken',
    'twilioTestAuthToken',
    'smtpPassword',
    'openaiApiKey',
    'anthropicApiKey',
    'webhookSecret',
  ]);


  static async listTags(req: AuthRequest, res: Response): Promise<void> {
    const where: any = {};
    if (req.user?.role !== 'ADMIN') {
      where.createdById = req.user!.id;
    }
    if (req.query.type === 'importList') {
      where.isImportList = true;
    }
    const tags = await prisma.tag.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { leads: true } },
        createdBy: { select: { firstName: true, lastName: true } },
      },
    });
    res.json({ tags });
  }

  static async createTag(req: AuthRequest, res: Response): Promise<void> {
    const { name, color } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new AppError('Tag name is required', 400);
    }

    if (name.trim().length > 50) {
      throw new AppError('Tag name must be 50 characters or fewer', 400);
    }

    const existing = await prisma.tag.findFirst({
      where: { name: { equals: name.trim() }, createdById: req.user!.id },
    });
    if (existing) {
      throw new AppError('A tag with this name already exists', 409);
    }

    const tag = await prisma.tag.create({
      data: {
        name: name.trim(),
        color: color || '#6366f1',
        createdById: req.user!.id,
      },
    });

    logger.info('Tag created', { tagId: tag.id, name: tag.name, userId: req.user?.id });

    res.status(201).json({ tag });
  }

  static async updateTag(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { name, color } = req.body;

    const tag = await prisma.tag.findUnique({ where: { id } });
    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    const updateData: any = {};
    if (name !== undefined) {
      if (typeof name !== 'string' || name.trim().length === 0) {
        throw new AppError('Tag name cannot be empty', 400);
      }
      updateData.name = name.trim();
    }
    if (color !== undefined) {
      updateData.color = color;
    }

    const updated = await prisma.tag.update({
      where: { id },
      data: updateData,
    });

    logger.info('Tag updated', { tagId: id, userId: req.user?.id });

    res.json({ tag: updated });
  }

  static async deleteTag(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const tag = await prisma.tag.findUnique({ where: { id } });
    if (!tag) {
      throw new AppError('Tag not found', 404);
    }

    if (req.user?.role !== 'ADMIN' && tag.createdById !== req.user?.id) {
      throw new AppError('You can only delete your own lists', 403);
    }

    if (tag.isImportList) {
      const leadTags = await prisma.leadTag.findMany({
        where: { tagId: id },
        select: { leadId: true },
      });
      const leadIds = leadTags.map((lt) => lt.leadId);
      if (leadIds.length > 0) {
        await prisma.lead.updateMany({
          where: { id: { in: leadIds } },
          data: { deletedAt: new Date() },
        });
      }
    }

    await prisma.leadTag.deleteMany({ where: { tagId: id } });
    await prisma.tag.delete({ where: { id } });

    logger.info('Tag deleted', { tagId: id, tagName: tag.name, isImportList: tag.isImportList, userId: req.user?.id });

    res.json({ message: 'Tag deleted' });
  }


  static async getSettings(req: AuthRequest, res: Response): Promise<void> {
    const reveal = req.query.reveal === 'true';
    const settings = await prisma.systemSetting.findMany();
    const settingsMap: Record<string, unknown> = {};

    for (const s of settings) {
      if (!reveal && SettingsController.SENSITIVE_KEYS.has(s.key)) {
        const strVal = String(s.value || '');
        settingsMap[s.key] = strVal.length > 4 ? '****' + strVal.slice(-4) : '****';
      } else {
        settingsMap[s.key] = s.value;
      }
    }

    res.json({ settings: settingsMap });
  }

  static async updateSetting(req: AuthRequest, res: Response): Promise<void> {
    const { key } = req.params;
    const { value } = req.body;

    if (!SettingsController.ALLOWED_KEYS.has(key)) {
      throw new AppError(`Unknown setting key: ${key}`, 400);
    }

    if (SettingsController.SENSITIVE_KEYS.has(key) && typeof value === 'string' && value.startsWith('****')) {
      throw new AppError('Cannot save masked value. Please enter the actual credential.', 400);
    }

    SettingsController.validateSettingValue(key, value);

    const setting = await prisma.systemSetting.upsert({
      where: { key },
      create: { key, value },
      update: { value },
    });

    await SettingsController.invalidateSettingCache(key);

    await SettingsController.logActivity(req.user?.id, 'setting_updated', {
      key,
      value: SettingsController.SENSITIVE_KEYS.has(key) ? '****' : value,
    });

    logger.info('Setting updated', { key, userId: req.user?.id });

    res.json({ setting });
  }

  static async bulkUpdateSettings(req: AuthRequest, res: Response): Promise<void> {
    const { settings } = req.body;

    if (!settings || typeof settings !== 'object') {
      throw new AppError('Settings object is required', 400);
    }

    const results: Array<{ key: string; success: boolean; error?: string }> = [];

    for (const [key, value] of Object.entries(settings)) {
      if (!SettingsController.ALLOWED_KEYS.has(key)) {
        results.push({ key, success: false, error: `Unknown setting key` });
        continue;
      }

      try {
        if (SettingsController.SENSITIVE_KEYS.has(key) && typeof value === 'string' && value.startsWith('****')) {
          results.push({ key, success: false, error: 'Cannot save masked value' });
          continue;
        }

        SettingsController.validateSettingValue(key, value);

        await prisma.systemSetting.upsert({
          where: { key },
          create: { key, value: value as any },
          update: { value: value as any },
        });

        await SettingsController.invalidateSettingCache(key);
        results.push({ key, success: true });
      } catch (err: any) {
        results.push({ key, success: false, error: err.message });
      }
    }

    await SettingsController.logActivity(req.user?.id, 'settings_bulk_updated', {
      keys: Object.keys(settings),
      successCount: results.filter((r) => r.success).length,
    });

    logger.info('Bulk settings update', {
      count: results.length,
      success: results.filter((r) => r.success).length,
      userId: req.user?.id,
    });

    res.json({ results });
  }

  static async exportSettings(req: AuthRequest, res: Response): Promise<void> {
    const settings = await prisma.systemSetting.findMany();
    const tags = await prisma.tag.findMany({ orderBy: { name: 'asc' } });

    const exportData = {
      exportedAt: new Date().toISOString(),
      settings: Object.fromEntries(settings.map((s) => [s.key, s.value])),
      tags: tags.map((t) => ({ name: t.name, color: t.color })),
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename=scl-settings-${Date.now()}.json`);
    res.json(exportData);
  }


  static async listSuppression(req: AuthRequest, res: Response): Promise<void> {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
    const skip = (page - 1) * limit;
    const search = req.query.search as string;

    const where: any = {};
    if (search) {
      where.phone = { contains: search };
    }

    const [entries, total] = await Promise.all([
      prisma.suppressionEntry.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.suppressionEntry.count({ where }),
    ]);

    res.json({
      entries,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
    });
  }

  static async addSuppression(req: AuthRequest, res: Response): Promise<void> {
    const { phone, reason } = req.body;

    if (!phone || typeof phone !== 'string') {
      throw new AppError('Phone number is required', 400);
    }

    const cleanPhone = phone.trim();

    const entry = await prisma.suppressionEntry.upsert({
      where: { phone: cleanPhone },
      create: {
        phone: cleanPhone,
        reason: reason || 'manual',
        source: 'admin',
      },
      update: {
        reason: reason || 'manual',
      },
    });

    await redis.del(`compliance:${cleanPhone}`).catch(() => {});

    logger.info('Suppression entry added', { phone: cleanPhone, userId: req.user?.id });

    res.json({ entry });
  }

  static async bulkAddSuppression(req: AuthRequest, res: Response): Promise<void> {
    const { phones, reason } = req.body;

    if (!Array.isArray(phones) || phones.length === 0) {
      throw new AppError('Array of phone numbers is required', 400);
    }

    if (phones.length > 10000) {
      throw new AppError('Maximum 10,000 phones per bulk import', 400);
    }

    const cleanPhones = phones.map((p: string) => p.trim()).filter((p: string) => p.length > 0);

    const result = await prisma.suppressionEntry.createMany({
      data: cleanPhones.map((phone: string) => ({
        phone,
        reason: reason || 'bulk_import',
        source: 'admin',
      })),
      skipDuplicates: true,
    });

    const pipeline = redis.pipeline();
    for (const phone of cleanPhones) {
      pipeline.del(`compliance:${phone}`);
    }
    await pipeline.exec().catch(() => {});

    logger.info('Bulk suppression import', {
      submitted: cleanPhones.length,
      added: result.count,
      userId: req.user?.id,
    });

    res.json({
      message: `Added ${result.count} to suppression list`,
      added: result.count,
      duplicates: cleanPhones.length - result.count,
    });
  }

  static async removeSuppression(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const entry = await prisma.suppressionEntry.findUnique({ where: { id } });
    if (!entry) {
      throw new AppError('Suppression entry not found', 404);
    }

    await prisma.suppressionEntry.delete({ where: { id } });

    await redis.del(`compliance:${entry.phone}`).catch(() => {});

    logger.info('Suppression entry removed', { phone: entry.phone, userId: req.user?.id });

    res.json({ message: 'Removed from suppression list' });
  }

  static async exportSuppression(req: AuthRequest, res: Response): Promise<void> {
    const entries = await prisma.suppressionEntry.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const csv = [
      'phone,reason,source,createdAt',
      ...entries.map((e) => `${e.phone},${e.reason},${e.source},${e.createdAt.toISOString()}`),
    ].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=suppression-list-${Date.now()}.csv`);
    res.send(csv);
  }


  static async getActivityLog(req: AuthRequest, res: Response): Promise<void> {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

    const logs = await prisma.activityLog.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true },
        },
      },
    });

    res.json({ logs });
  }


  private static validateSettingValue(key: string, value: any): void {
    const numericKeys: Record<string, { min: number; max: number }> = {
      quietHoursStart: { min: 0, max: 23 },
      quietHoursEnd: { min: 0, max: 23 },
      maxDailySmsPerNumber: { min: 1, max: 10000 },
      globalDailyLimit: { min: 1, max: 1000000 },
      defaultSendingSpeed: { min: 1, max: 60 },
      smtpPort: { min: 1, max: 65535 },
      rampUpDailyIncrease: { min: 1, max: 500 },
      rampUpStartLimit: { min: 1, max: 1000 },
      coolingThreshold: { min: 1, max: 100 },
      coolingDurationHours: { min: 1, max: 168 },
    };

    if (numericKeys[key]) {
      const num = typeof value === 'string' ? parseInt(value, 10) : value;
      if (isNaN(num) || num < numericKeys[key].min || num > numericKeys[key].max) {
        throw new AppError(`${key} must be between ${numericKeys[key].min} and ${numericKeys[key].max}`, 400);
      }
    }

    const booleanKeys = ['autoTagEnabled', 'aiAutoReplyEnabled', 'rampUpEnabled', 'smtpSecure'];
    if (booleanKeys.includes(key)) {
      if (value !== true && value !== false && value !== 'true' && value !== 'false') {
        throw new AppError(`${key} must be a boolean value`, 400);
      }
    }

    if (key === 'smsMode') {
      const allowed = ['live', 'twilio_test', 'simulation'];
      if (!allowed.includes(value as string)) {
        throw new AppError(`smsMode must be one of: ${allowed.join(', ')}`, 400);
      }
    }

    if (key === 'smtpFromEmail' && typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(trimmed)) {
        throw new AppError('smtpFromEmail must be a valid email address', 400);
      }
    }
  }

  private static async invalidateSettingCache(key: string): Promise<void> {
    const pipeline = redis.pipeline();

    pipeline.del(`setting:${key}`);

    if (key.startsWith('quietHours')) {
      pipeline.del('compliance:quiet_hours_config');
    }

    if (key.startsWith('twilio')) {
      resetTwilioClients();
    }

    await pipeline.exec().catch((err) => {
      logger.warn('Failed to invalidate setting cache', { key, error: (err as Error).message });
    });
  }

  private static async logActivity(
    userId: string | undefined,
    action: string,
    details: Record<string, any>,
  ): Promise<void> {
    try {
      await prisma.activityLog.create({
        data: {
          userId: userId || null,
          action,
          entityType: 'settings',
          metadata: details,
        },
      });
    } catch (err) {
      logger.warn('Failed to log activity', { action, error: (err as Error).message });
    }
  }
}
