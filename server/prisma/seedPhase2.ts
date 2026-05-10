import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

type Phase2User = {
  email: string;
  firstName: string;
  lastName: string;
  initials: string;
  role: 'ADMIN' | 'REP';
  monthlyGoal: number;
  annualGoal: number;
  avatarColor: string;
};

const PHASE2_USERS: Phase2User[] = [
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

async function seedPhase2() {
  console.log('🌱 Seeding Phase 2 team users...');

  const defaultPassword = await bcrypt.hash(process.env.DEFAULT_TEAM_USER_PASSWORD || 'SCLRep2026!', 12);

  for (const user of PHASE2_USERS) {
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
      console.log(`  ✅ Updated ${user.initials} (${existing.email})`);
      continue;
    }

    await prisma.user.create({
      data: {
        email: user.email,
        passwordHash: defaultPassword,
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
    console.log(`  ✅ Created ${user.initials} (${user.email})`);
  }

  await prisma.goal.upsert({
    where: { entityType_entityId: { entityType: 'team', entityId: 'team' } },
    update: { monthlyGoal: 5_800_000, annualGoal: 69_600_000 },
    create: { entityType: 'team', entityId: 'team', monthlyGoal: 5_800_000, annualGoal: 69_600_000 },
  });
  console.log('  ✅ Team goal set: $5.8M/month, $69.6M/year');

  console.log('\n✅ Phase 2 seed complete!');
}

seedPhase2()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

