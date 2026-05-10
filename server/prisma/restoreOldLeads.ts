import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

const OLD_LEADS = [
  { firstName: 'John', lastName: 'Smith', phone: '+12125551001', email: 'john.smith@acmecorp.com', company: 'Acme Corp', source: 'Website', repInitials: 'JB' },
  { firstName: 'Maria', lastName: 'Garcia', phone: '+13055552002', email: 'maria.garcia@sunrisellc.com', company: 'Sunrise LLC', source: 'Referral', repInitials: 'JB' },
  { firstName: 'James', lastName: 'Johnson', phone: '+17865553003', email: 'james.j@techstartup.io', company: 'Tech Startup Inc', source: 'LinkedIn', repInitials: 'JB' },
  { firstName: 'Emily', lastName: 'Williams', phone: '+14155554004', email: 'emily.w@greenleaf.com', company: 'GreenLeaf Solutions', source: 'Facebook Ad', repInitials: 'JB' },
  { firstName: 'Robert', lastName: 'Brown', phone: '+12815555005', email: 'robert.brown@coastalgroup.com', company: 'Coastal Group', source: 'Cold List', repInitials: 'JB' },

  { firstName: 'Sarah', lastName: 'Davis', phone: '+13215556006', email: 'sarah.d@nextstep.co', company: 'NextStep Financial', source: 'Google Ad', repInitials: 'AN' },
  { firstName: 'Michael', lastName: 'Wilson', phone: '+14695557007', email: 'm.wilson@blueocean.com', company: 'Blue Ocean Ventures', source: 'Website', repInitials: 'AN' },
  { firstName: 'Jennifer', lastName: 'Martinez', phone: '+17025558008', email: 'jen.martinez@primeservices.com', company: 'Prime Services', source: 'Referral', repInitials: 'AN' },
  { firstName: 'David', lastName: 'Anderson', phone: '+14045559009', email: 'd.anderson@eagleinv.com', company: 'Eagle Investments', source: 'Trade Show', repInitials: 'AN' },
  { firstName: 'Lisa', lastName: 'Taylor', phone: '+16175550010', email: 'lisa.t@horizonllc.com', company: 'Horizon LLC', source: 'LinkedIn', repInitials: 'AN' },
  { firstName: 'Daniel', lastName: 'Thomas', phone: '+15125550011', email: 'd.thomas@apexcap.com', company: 'Apex Capital', source: 'Website', repInitials: 'AN' },

  { firstName: 'Amanda', lastName: 'Clark', phone: '+14805550012', email: 'amanda.c@silverline.com', company: 'Silverline Partners', source: 'Referral', repInitials: 'AR' },
  { firstName: 'Kevin', lastName: 'Lewis', phone: '+19725550013', email: 'kevin.l@brightpath.io', company: 'BrightPath Inc', source: 'LinkedIn', repInitials: 'AR' },
  { firstName: 'Rachel', lastName: 'Walker', phone: '+13035550014', email: 'rachel.w@summitgrp.com', company: 'Summit Group', source: 'Cold List', repInitials: 'AR' },
  { firstName: 'Brandon', lastName: 'Hall', phone: '+16025550015', email: 'b.hall@redrock.co', company: 'Red Rock Advisors', source: 'Google Ad', repInitials: 'AR' },
];

async function main() {
  console.log('📋 RESTORING OLD DEMO LEADS...\n');

  const users = await prisma.user.findMany({ select: { id: true, initials: true } });
  const repMap: Record<string, string> = {};
  for (const u of users) {
    if (u.initials) repMap[u.initials] = u.id;
  }

  let created = 0;
  let skipped = 0;

  for (const lead of OLD_LEADS) {
    const existing = await prisma.lead.findFirst({ where: { phone: lead.phone } });
    if (existing) {
      console.log(`  ⏭  ${lead.company} (${lead.phone}) — already exists`);
      skipped++;
      continue;
    }

    const repId = repMap[lead.repInitials] || repMap['JB'] || users[0].id;

    await prisma.lead.create({
      data: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        phone: lead.phone,
        email: lead.email,
        company: lead.company,
        source: lead.source as any,
        status: 'NEW',
        assignedRepId: repId,
      },
    });

    console.log(`  ✅ ${lead.company} — ${lead.firstName} ${lead.lastName} (${lead.repInitials})`);
    created++;
  }

  const totalLeads = await prisma.lead.count();
  console.log(`\n✅ Done! Created: ${created}, Skipped: ${skipped}, Total leads: ${totalLeads}`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
