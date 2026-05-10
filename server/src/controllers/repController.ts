import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import bcrypt from 'bcryptjs';
import { OutboundGateService } from '../services/outboundGateService';

export class RepController {
  static async getTeamGoals(req: AuthRequest, res: Response) {
    const goal = await prisma.goal.findUnique({
      where: { entityType_entityId: { entityType: 'team', entityId: 'team' } },
      select: { monthlyGoal: true, annualGoal: true, updatedAt: true },
    });

    res.json({
      monthlyGoal: goal?.monthlyGoal || 0,
      annualGoal: goal?.annualGoal || 0,
      updatedAt: goal?.updatedAt || null,
    });
  }

  static async getReps(req: AuthRequest, res: Response) {
    const { activeOnly } = req.query;
    const where: any = {};
    if (activeOnly === 'true') where.isActive = true;

    const reps = await prisma.user.findMany({
      where,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        initials: true,
        role: true,
        isActive: true,
        monthlyGoal: true,
        annualGoal: true,
        avatarColor: true,
        lastLoginAt: true,
        createdAt: true,
      },
      orderBy: { firstName: 'asc' },
    });

    const thresholdSettings = await prisma.systemSetting.findMany({
      where: { key: { startsWith: OutboundGateService.THRESHOLD_KEY_PREFIX } },
      select: { key: true, value: true },
    });
    const thresholdByRepId = new Map<string, number>();
    for (const setting of thresholdSettings) {
      const repId = setting.key.replace(OutboundGateService.THRESHOLD_KEY_PREFIX, '');
      thresholdByRepId.set(repId, OutboundGateService.parseThreshold(setting.value));
    }

    const repsWithThreshold = reps.map((rep) => ({
      ...rep,
      smsOutboundThreshold: thresholdByRepId.get(rep.id) ?? OutboundGateService.DEFAULT_THRESHOLD,
    }));

    res.json(repsWithThreshold);
  }

  static async getRep(req: AuthRequest, res: Response) {
    const { id } = req.params;

    const rep = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        initials: true,
        role: true,
        isActive: true,
        monthlyGoal: true,
        annualGoal: true,
        avatarColor: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    if (!rep) return res.status(404).json({ error: 'Rep not found' });
    const smsOutboundThreshold = await OutboundGateService.getThresholdForRep(rep.id);
    res.json({ ...rep, smsOutboundThreshold });
  }

  static async createRep(req: AuthRequest, res: Response) {
    const { firstName, lastName, email, initials, role, monthlyGoal, annualGoal, avatarColor, password, smsOutboundThreshold } =
      req.body;

    if (!firstName || !email || !initials) {
      return res.status(400).json({ error: 'firstName, email, and initials are required' });
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { initials }] },
    });
    if (existing) {
      return res
        .status(400)
        .json({ error: existing.email === email ? 'Email already exists' : 'Initials already taken' });
    }

    const passwordHash = await bcrypt.hash(password || 'TempPass123!', 12);

    const rep = await prisma.user.create({
      data: {
        firstName,
        lastName: lastName || '',
        email,
        passwordHash,
        initials: initials.toUpperCase(),
        role: role || 'REP',
        monthlyGoal: monthlyGoal ? parseFloat(monthlyGoal) : 0,
        annualGoal: annualGoal ? parseFloat(annualGoal) : 0,
        avatarColor:
          avatarColor ||
          `#${Math.floor(Math.random() * 16777215)
            .toString(16)
            .padStart(6, '0')}`,
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        initials: true,
        role: true,
        isActive: true,
        monthlyGoal: true,
        annualGoal: true,
        avatarColor: true,
      },
    });

    const normalizedThreshold =
      smsOutboundThreshold !== undefined
        ? OutboundGateService.parseThreshold(smsOutboundThreshold)
        : OutboundGateService.DEFAULT_THRESHOLD;
    await OutboundGateService.setThresholdForRep(rep.id, normalizedThreshold);

    res.status(201).json({ ...rep, smsOutboundThreshold: normalizedThreshold });
  }

  static async updateRep(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { firstName, lastName, email, initials, role, monthlyGoal, annualGoal, avatarColor, isActive, smsOutboundThreshold } =
      req.body;

    if (id === req.user?.id && role && role !== req.user.role) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    if (id === req.user?.id && isActive === false) {
      return res.status(400).json({ error: 'Cannot deactivate your own account' });
    }

    const updateData: any = {};
    if (firstName !== undefined) updateData.firstName = firstName;
    if (lastName !== undefined) updateData.lastName = lastName;
    if (email !== undefined) updateData.email = email;
    if (initials !== undefined) updateData.initials = initials.toUpperCase();
    if (role !== undefined) updateData.role = role;
    if (monthlyGoal !== undefined) updateData.monthlyGoal = parseFloat(monthlyGoal);
    if (annualGoal !== undefined) updateData.annualGoal = parseFloat(annualGoal);
    if (avatarColor !== undefined) updateData.avatarColor = avatarColor;
    if (isActive !== undefined) updateData.isActive = isActive;

    const rep = await prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        initials: true,
        role: true,
        isActive: true,
        monthlyGoal: true,
        annualGoal: true,
        avatarColor: true,
      },
    });

    if (smsOutboundThreshold !== undefined) {
      await OutboundGateService.setThresholdForRep(id, OutboundGateService.parseThreshold(smsOutboundThreshold));
    }
    const resolvedThreshold = await OutboundGateService.getThresholdForRep(id);

    res.json({ ...rep, smsOutboundThreshold: resolvedThreshold });
  }

  static async updateGoals(req: AuthRequest, res: Response) {
    const { id } = req.params;
    const { monthlyGoal, annualGoal } = req.body;

    const rep = await prisma.user.update({
      where: { id },
      data: {
        monthlyGoal: monthlyGoal !== undefined ? parseFloat(monthlyGoal) : undefined,
        annualGoal: annualGoal !== undefined ? parseFloat(annualGoal) : undefined,
      },
      select: { id: true, firstName: true, lastName: true, initials: true, monthlyGoal: true, annualGoal: true },
    });

    res.json(rep);
  }

  static async updateTeamGoals(req: AuthRequest, res: Response) {
    const { monthlyGoal, annualGoal } = req.body;

    const goal = await prisma.goal.upsert({
      where: { entityType_entityId: { entityType: 'team', entityId: 'team' } },
      update: { monthlyGoal: parseFloat(monthlyGoal), annualGoal: parseFloat(annualGoal) },
      create: {
        entityType: 'team',
        entityId: 'team',
        monthlyGoal: parseFloat(monthlyGoal),
        annualGoal: parseFloat(annualGoal),
      },
    });

    res.json(goal);
  }
}
