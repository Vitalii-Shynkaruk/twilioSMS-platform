import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

/**
 * Phase 2 Seed: Adds 7 SCL reps and team goals per BuildSpec.
 * Safe to run multiple times — uses upsert.
 */
async function seedPhase2() {
  console.log('🌱 Seeding Phase 2 data...');

  const defaultPassword = await bcrypt.hash('SCLRep2026!', 12);

  // 7 reps per spec: JB (admin), AN, AR, HB, SB, MC, JJ
  const reps = [
    {
      firstName: 'JB',
      lastName: '',
      email: 'jb@sclcapital.io',
      initials: 'JB',
      role: 'ADMIN' as const,
      avatarColor: '#6366f1',
    },
    {
      firstName: 'Ariel',
      lastName: 'N',
      email: 'an@sclcapital.io',
      initials: 'AN',
      role: 'REP' as const,
      avatarColor: '#3b82f6',
    },
    {
      firstName: 'Alex',
      lastName: 'R',
      email: 'ar@sclcapital.io',
      initials: 'AR',
      role: 'REP' as const,
      avatarColor: '#8b5cf6',
    },
    {
      firstName: 'Henry',
      lastName: 'B',
      email: 'hb@sclcapital.io',
      initials: 'HB',
      role: 'REP' as const,
      avatarColor: '#f59e0b',
    },
    {
      firstName: 'Sam',
      lastName: 'B',
      email: 'sb@sclcapital.io',
      initials: 'SB',
      role: 'REP' as const,
      avatarColor: '#10b981',
    },
    {
      firstName: 'Mike',
      lastName: 'C',
      email: 'mc@sclcapital.io',
      initials: 'MC',
      role: 'REP' as const,
      avatarColor: '#ef4444',
    },
    {
      firstName: 'John',
      lastName: 'J',
      email: 'jj@sclcapital.io',
      initials: 'JJ',
      role: 'REP' as const,
      avatarColor: '#f97316',
    },
  ];

  for (const rep of reps) {
    const user = await prisma.user.upsert({
      where: { email: rep.email },
      update: {
        initials: rep.initials,
        avatarColor: rep.avatarColor,
        monthlyGoal: 150000,
        annualGoal: 1800000,
      },
      create: {
        firstName: rep.firstName,
        lastName: rep.lastName,
        email: rep.email,
        passwordHash: defaultPassword,
        initials: rep.initials,
        role: rep.role,
        avatarColor: rep.avatarColor,
        monthlyGoal: 150000,
        annualGoal: 1800000,
      },
    });
    console.log(`  ✅ Rep ${rep.initials} (${rep.email}) — ${user.id}`);
  }

  // Team goal
  await prisma.goal.upsert({
    where: { entityType_entityId: { entityType: 'team', entityId: 'team' } },
    update: { monthlyGoal: 1000000, annualGoal: 12000000 },
    create: { entityType: 'team', entityId: 'team', monthlyGoal: 1000000, annualGoal: 12000000 },
  });
  console.log('  ✅ Team goal set: $1M/month, $12M/year');

  console.log('\n✅ Phase 2 seed complete!');
  console.log('Rep password for all new reps: SCLRep2026!');
}

seedPhase2()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
