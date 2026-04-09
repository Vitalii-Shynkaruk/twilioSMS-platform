import { Response } from 'express';
import prisma from '../config/database';
import { AuthRequest } from '../middleware/auth';
import { AppError } from '../middleware/errorHandler';
import { NumberService } from '../services/numberService';
import { getActiveMessagingServiceSid, getActiveTwilioClient } from '../config/twilio';
import logger from '../config/logger';

export class NumberController {
  static async list(req: AuthRequest, res: Response): Promise<void> {
    const health = await NumberService.getNumberHealthOverview();

    // REP users only see their assigned numbers
    if (req.user?.role === 'REP') {
      const userId = req.user.id;
      const myNumbers = health.numbers.filter((n: any) => n.assignments?.some((a: any) => a.user?.id === userId));
      const summary = {
        total: myNumbers.length,
        active: myNumbers.filter((n: any) => n.status === 'ACTIVE').length,
        warming: myNumbers.filter((n: any) => n.status === 'WARMING').length,
        cooling: myNumbers.filter((n: any) => n.status === 'COOLING').length,
        suspended: myNumbers.filter((n: any) => n.status === 'SUSPENDED').length,
        totalCapacity: myNumbers.reduce((sum: number, n: any) => sum + n.dailyLimit, 0),
        totalUsed: myNumbers.reduce((sum: number, n: any) => sum + n.dailySentCount, 0),
        avgDeliveryRate:
          myNumbers.length > 0
            ? myNumbers.reduce((sum: number, n: any) => sum + n.deliveryRate, 0) / myNumbers.length
            : 0,
      };
      res.json({ numbers: myNumbers, summary });
      return;
    }

    res.json(health);
  }

  static async assignToRep(req: AuthRequest, res: Response): Promise<void> {
    const { repId, phoneNumberIds } = req.body;

    if (!repId || !phoneNumberIds?.length) {
      throw new AppError('Rep ID and phone number IDs are required', 400);
    }

    await NumberService.assignNumbersToRep(repId, phoneNumberIds);
    res.json({ message: 'Numbers assigned' });
  }

  static async coolDown(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { reason, hours = 24 } = req.body;

    await NumberService.coolNumber(id, reason || 'Manual cooldown', hours);
    res.json({ message: 'Number cooled down' });
  }

  static async activate(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    await prisma.phoneNumber.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        coolingUntil: null,
        cooldownReason: null,
        errorStreak: 0,
      },
    });

    res.json({ message: 'Number activated' });
  }

  static async getAssignments(req: AuthRequest, res: Response): Promise<void> {
    const assignments = await prisma.numberAssignment.findMany({
      where: {
        isActive: true,
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        phoneNumber: {
          select: {
            id: true,
            phoneNumber: true,
            status: true,
            dailySentCount: true,
            dailyLimit: true,
          },
        },
      },
    });

    res.json({ assignments });
  }

  static async getPools(req: AuthRequest, res: Response): Promise<void> {
    const pools = await prisma.numberPool.findMany({
      include: {
        members: {
          include: {
            phoneNumber: {
              select: {
                id: true,
                phoneNumber: true,
                status: true,
                dailySentCount: true,
              },
            },
          },
        },
        _count: { select: { members: true } },
      },
    });

    res.json({ pools });
  }

  /**
   * Create a phone number manually
   */
  static async create(req: AuthRequest, res: Response): Promise<void> {
    const { phoneNumber, friendlyName, dailyLimit, isRamping } = req.body;

    if (!phoneNumber) {
      throw new AppError('Phone number is required', 400);
    }

    // Validate E.164
    const cleaned = phoneNumber.replace(/[^+\d]/g, '');
    if (!/^\+1\d{10}$/.test(cleaned)) {
      throw new AppError('Invalid phone number. Must be E.164 format (+1XXXXXXXXXX)', 400);
    }

    // Check duplicate
    const existing = await prisma.phoneNumber.findUnique({ where: { phoneNumber: cleaned } });
    if (existing) {
      throw new AppError('Phone number already exists', 409);
    }

    const number = await prisma.phoneNumber.create({
      data: {
        phoneNumber: cleaned,
        twilioSid: `manual_${Date.now()}`,
        friendlyName: friendlyName || cleaned,
        dailyLimit: dailyLimit || 200,
        isRamping: isRamping ?? true,
        rampDay: 1,
        rampStartDate: new Date(),
        status: 'ACTIVE',
      },
    });

    await NumberService.invalidateNumbersCache();
    logger.info('Phone number created', { phoneNumber: cleaned, id: number.id, by: req.user });
    res.status(201).json({ number });
  }

  /**
   * Update a phone number
   */
  static async update(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;
    const { friendlyName, dailyLimit, isRamping, status } = req.body;

    const existing = await prisma.phoneNumber.findUnique({ where: { id } });
    if (!existing) throw new AppError('Phone number not found', 404);

    const data: Record<string, any> = {};
    if (friendlyName !== undefined) data.friendlyName = friendlyName;
    if (dailyLimit !== undefined) data.dailyLimit = Number(dailyLimit);
    if (isRamping !== undefined) data.isRamping = isRamping;
    if (status !== undefined) data.status = status;

    const number = await prisma.phoneNumber.update({ where: { id }, data });

    await NumberService.invalidateNumbersCache();
    logger.info('Phone number updated', { id, changes: Object.keys(data), by: req.user });
    res.json({ number });
  }

  /**
   * Delete a phone number
   */
  static async remove(req: AuthRequest, res: Response): Promise<void> {
    const { id } = req.params;

    const existing = await prisma.phoneNumber.findUnique({ where: { id } });
    if (!existing) throw new AppError('Phone number not found', 404);

    // Delete related records first
    await prisma.numberPoolMembership.deleteMany({ where: { phoneNumberId: id } });
    await prisma.numberAssignment.deleteMany({ where: { phoneNumberId: id } });
    await prisma.phoneNumber.delete({ where: { id } });

    await NumberService.invalidateNumbersCache();
    logger.info('Phone number deleted', { id, phoneNumber: existing.phoneNumber, by: req.user });
    res.json({ message: 'Number deleted' });
  }

  /**
   * Full sync phone numbers from Twilio account.
   * Creates new, updates existing (capabilities, messagingServiceSid, friendlyName),
   * marks numbers removed from Twilio as DISABLED.
   */
  static async syncFromTwilio(req: AuthRequest, res: Response): Promise<void> {
    const client = await getActiveTwilioClient();
    if (!client) {
      throw new AppError('Twilio not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.', 400);
    }

    let twilioNumbers;
    try {
      twilioNumbers = await client.incomingPhoneNumbers.list({ limit: 500 });
    } catch (err: any) {
      if (err.message === 'Authenticate' || err.status === 401 || err.code === 20003) {
        throw new AppError(
          'Twilio authentication failed. Please update your Auth Token in Settings → Integrations.',
          401,
        );
      }
      throw err;
    }
    let created = 0;
    let updated = 0;

    // Build a set of phone number SIDs that belong to the configured Messaging Service.
    // Prefer Settings value; fallback to env if needed.
    const msgSvcSid = await getActiveMessagingServiceSid();
    const a2pPhoneNumberSids = new Set<string>();
    if (msgSvcSid) {
      try {
        const svcNumbers = await client.messaging.v1.services(msgSvcSid).phoneNumbers.list({ limit: 500 });
        for (const sn of svcNumbers) {
          a2pPhoneNumberSids.add(sn.sid);
        }
      } catch (err) {
        logger.warn('Could not list messaging service numbers', { msgSvcSid, err });
      }
    } else {
      logger.warn('Twilio Messaging Service SID is not configured; numbers cannot be tagged as A2P service');
    }

    const twilioSids = new Set<string>();

    for (const tn of twilioNumbers) {
      twilioSids.add(tn.sid);

      const updatePayload: Record<string, any> = {
        friendlyName: tn.friendlyName || tn.phoneNumber,
        smsCapable: tn.capabilities?.sms ?? true,
        mmsCapable: tn.capabilities?.mms ?? false,
        voiceCapable: tn.capabilities?.voice ?? false,
        messagingServiceSid: a2pPhoneNumberSids.has(tn.sid) ? msgSvcSid : null,
      };

      // Check by SID first
      const existsBySid = await prisma.phoneNumber.findUnique({
        where: { twilioSid: tn.sid },
      });

      if (existsBySid) {
        // Always update capabilities and metadata on sync
        await prisma.phoneNumber.update({
          where: { id: existsBySid.id },
          data: updatePayload,
        });
        updated++;
        continue;
      }

      // Check by phone number
      const existsByPhone = await prisma.phoneNumber.findUnique({
        where: { phoneNumber: tn.phoneNumber },
      });
      if (existsByPhone) {
        await prisma.phoneNumber.update({
          where: { id: existsByPhone.id },
          data: { twilioSid: tn.sid, ...updatePayload },
        });
        updated++;
        continue;
      }

      // Create new number
      await prisma.phoneNumber.create({
        data: {
          phoneNumber: tn.phoneNumber,
          twilioSid: tn.sid,
          friendlyName: tn.friendlyName || tn.phoneNumber,
          smsCapable: tn.capabilities?.sms ?? true,
          mmsCapable: tn.capabilities?.mms ?? false,
          voiceCapable: tn.capabilities?.voice ?? false,
          messagingServiceSid: a2pPhoneNumberSids.has(tn.sid) ? msgSvcSid : null,
          dailyLimit: 200,
          isRamping: true,
          rampDay: 1,
          rampStartDate: new Date(),
          status: 'ACTIVE',
        },
      });
      created++;
    }

    // Mark numbers that no longer exist in Twilio as RETIRED
    let retired = 0;
    const dbNumbers = await prisma.phoneNumber.findMany({
      where: { status: { not: 'RETIRED' } },
      select: { id: true, twilioSid: true },
    });
    for (const dbNum of dbNumbers) {
      if (!dbNum.twilioSid.startsWith('manual_') && !twilioSids.has(dbNum.twilioSid)) {
        await prisma.phoneNumber.update({
          where: { id: dbNum.id },
          data: { status: 'RETIRED' },
        });
        retired++;
      }
    }

    await NumberService.invalidateNumbersCache();
    logger.info('Twilio sync completed', {
      created,
      updated,
      retired,
      total: twilioNumbers.length,
      messagingServiceSid: msgSvcSid || null,
      serviceNumberCount: a2pPhoneNumberSids.size,
      by: req.user,
    });
    res.json({
      message: `Synced: ${created} new, ${updated} updated, ${retired} retired. Total in Twilio: ${twilioNumbers.length}`,
      created,
      updated,
      retired,
      twilioTotal: twilioNumbers.length,
      messagingServiceSid: msgSvcSid || null,
      serviceNumberCount: a2pPhoneNumberSids.size,
    });
  }

  /**
   * Unassign all numbers from a rep (deactivate today's assignments)
   */
  static async unassignFromRep(req: AuthRequest, res: Response): Promise<void> {
    const { repId } = req.params;

    const result = await prisma.numberAssignment.updateMany({
      where: { userId: repId, isActive: true },
      data: { isActive: false },
    });

    logger.info('Unassigned numbers from rep', { repId, count: result.count });
    res.json({ message: `Unassigned ${result.count} numbers`, count: result.count });
  }

  static async createPool(req: AuthRequest, res: Response): Promise<void> {
    const { name, description, dailyLimit, phoneNumberIds } = req.body;

    const pool = await prisma.numberPool.create({
      data: {
        name,
        description,
        dailyLimit: dailyLimit || 300,
      },
    });

    if (phoneNumberIds?.length) {
      await prisma.numberPoolMembership.createMany({
        data: phoneNumberIds.map((phoneNumberId: string) => ({
          phoneNumberId,
          poolId: pool.id,
        })),
      });
    }

    res.status(201).json({ pool });
  }
}
