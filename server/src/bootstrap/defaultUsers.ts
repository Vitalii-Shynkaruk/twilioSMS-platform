import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import logger from '../config/logger';

type DefaultUser = {
  email: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: 'ADMIN' | 'REP';
  monthlyGoal: number;
  annualGoal: number;
  avatarColor: string;
};

const DEFAULT_TEAM_USERS: DefaultUser[] = [
  {
    email: 'jb@securecreditlines.com',
    firstName: 'Jonathan',
    lastName: 'Baker',
    initials: 'JB',
    role: 'ADMIN',
    monthlyGoal: 2_500_000,
    annualGoal: 30_000_000,
    avatarColor: '#c9a227',
  },
  {
    email: 'an@securecreditlines.com',
    firstName: 'Alex',
    lastName: 'Nunez',
    initials: 'AN',
    role: 'REP',
    monthlyGoal: 0,
    annualGoal: 0,
    avatarColor: '#4a9eff',
  },
  {
    email: 'ar@securecreditlines.com',
    firstName: 'Anthony',
    lastName: 'Rack',
    initials: 'AR',
    role: 'REP',
    monthlyGoal: 0,
    annualGoal: 0,
    avatarColor: '#9b72e8',
  },
  {
    email: 'hb@securecreditlines.com',
    firstName: 'Hammad',
    lastName: 'Bhatti',
    initials: 'HB',
    role: 'REP',
    monthlyGoal: 0,
    annualGoal: 0,
    avatarColor: '#d06828',
  },
  {
    email: 'sb@securecreditlines.com',
    firstName: 'Stuart',
    lastName: 'Benitez',
    initials: 'SB',
    role: 'REP',
    monthlyGoal: 0,
    annualGoal: 0,
    avatarColor: '#3ab97a',
  },
  {
    email: 'mc@securecreditlines.com',
    firstName: 'Marcos',
    lastName: 'Cruz',
    initials: 'MC',
    role: 'REP',
    monthlyGoal: 0,
    annualGoal: 0,
    avatarColor: '#ff5722',
  },
  {
    email: 'jj@securecreditlines.com',
    firstName: 'Javon',
    lastName: 'Jones',
    initials: 'JJ',
    role: 'REP',
    monthlyGoal: 0,
    annualGoal: 0,
    avatarColor: '#64b5d4',
  },
];

export async function ensureDefaultTeamUsers() {
  if (process.env.SEED_DEFAULT_TEAM_USERS === 'false') {
    logger.info('Skipping default team user seed (SEED_DEFAULT_TEAM_USERS=false)');
    return;
  }

  const defaultPassword = process.env.DEFAULT_TEAM_USER_PASSWORD || 'SCLRep2026!';
  const passwordHash = await bcrypt.hash(defaultPassword, 12);

  for (const user of DEFAULT_TEAM_USERS) {
    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ initials: user.initials }, { email: user.email }],
      },
      select: {
        id: true,
        email: true,
        monthlyGoal: true,
        annualGoal: true,
        avatarColor: true,
      },
    });

    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: {
          firstName: user.firstName,
          lastName: user.lastName,
          role: user.role,
          initials: user.initials,
          isActive: true,
          avatarColor: existing.avatarColor || user.avatarColor,
          monthlyGoal: existing.monthlyGoal > 0 ? existing.monthlyGoal : user.monthlyGoal,
          annualGoal: existing.annualGoal > 0 ? existing.annualGoal : user.annualGoal,
        },
      });
      logger.info(`👥 Default team user ensured: ${user.initials} (${existing.email})`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: user.email,
        passwordHash,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        initials: user.initials,
        monthlyGoal: user.monthlyGoal,
        annualGoal: user.annualGoal,
        avatarColor: user.avatarColor,
        isActive: true,
      },
    });
    logger.info(`👥 Default team user created: ${user.initials} (${user.email})`);
  }
}

