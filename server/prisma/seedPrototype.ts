import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

// ────────────────────────────────────────
// USERS (reps from prototype top bar)
// ────────────────────────────────────────
const KEEP_EMAILS = [
  'admin@securecreditlines.com', // Main admin
  'mduong@pmfus.com',            // Michael Duong
];

const TEAM_USERS = [
  { email: 'jb@securecreditlines.com', firstName: 'Jonathan', lastName: 'Baker', initials: 'JB', role: 'ADMIN' as const, avatarColor: '#c9a227' },
  { email: 'anunez@pmfus.com',         firstName: 'Alex',     lastName: 'Nunez',   initials: 'AN', role: 'REP' as const,   avatarColor: '#4a9eff' },
  { email: 'arack@pmfus.com',          firstName: 'Anthony',  lastName: 'Rack',    initials: 'AR', role: 'REP' as const,   avatarColor: '#9b72e8' },
  { email: 'hammad@pmfus.com',         firstName: 'Hammad',   lastName: 'Bhatti',  initials: 'HB', role: 'REP' as const,   avatarColor: '#d06828' },
  { email: 'sbenitez@pmfus.com',       firstName: 'Stuart',   lastName: 'Benitez', initials: 'SB', role: 'REP' as const,   avatarColor: '#3ab97a' },
  { email: 'mcruz@pmfus.com',          firstName: 'Marcos',   lastName: 'Cruz',    initials: 'MC', role: 'REP' as const,   avatarColor: '#ff5722' },
  { email: 'jj@securecreditlines.com', firstName: 'Javon',    lastName: 'Jones',   initials: 'JJ', role: 'REP' as const,   avatarColor: '#64b5d4' },
  { email: 'mduong@pmfus.com',         firstName: 'Michael',  lastName: 'Duong',   initials: 'MD', role: 'REP' as const,   avatarColor: '#00bcd4' },
  { email: 'jsmith@pmfus.com',         firstName: 'John',     lastName: 'Smith',   initials: 'JS', role: 'REP' as const,   avatarColor: '#e91e63' },
];

// ────────────────────────────────────────
// DEAL DATA (from prototype screenshots)
// ────────────────────────────────────────
type DealSeed = {
  businessName: string;
  contactName: string;
  phone: string;
  email?: string;
  stage: string;
  nextAction?: string;
  dueDays?: number;     // relative to now: -1=overdue, 0=today, 1=tomorrow, etc.
  dueDate?: string;     // absolute date YYYY-MM-DD
  isHot?: boolean;
  appSubmitted?: boolean;
  lenderEngaged?: boolean;
  productType?: string;
  dealAmount?: number;
  // For FUNDED deals
  fundedAmount?: number;
  funder?: string;
  fundedTerm?: number;
  fundedRate?: string;
  fundedProduct?: string;
  fundedDate?: string;
  // For NURTURE deals
  prevOffer?: number;
  followUpType?: string;
  followUpNote?: string;
  // For APPROVED deals (offers)
  offers?: Array<{ lender: string; amount: number; terms?: string; product?: string; isAccepted?: boolean }>;
  // Notes
  notes?: string;
  clientNotes?: string;
  repInitials: string;
};

const DEALS: DealSeed[] = [
  // ═══════════ NEW LEAD (5) ═══════════
  { businessName: 'K&R Logistics',           contactName: 'Kevin Ramos',      phone: '+13125551001', stage: 'NEW_LEAD', isHot: false, repInitials: 'HB' },
  { businessName: 'Peak Auto Group',         contactName: 'Derek Palmer',     phone: '+14155551002', stage: 'NEW_LEAD', isHot: true,  nextAction: 'Call back — qualify now', dueDays: 0, repInitials: 'AN' },
  { businessName: 'Grant Day Spa & Wellness',contactName: 'Lisa Grant',       phone: '+17135551003', stage: 'NEW_LEAD', isHot: true,  nextAction: 'Call today — warm referral', dueDays: 0, repInitials: 'MC' },

  // ═══════════ ENGAGED / INTERESTED (3) ═══════════
  { businessName: 'Norton Trucking',         contactName: 'Dave Norton',      phone: '+12145551006', stage: 'ENGAGED_INTERESTED', nextAction: 'Final follow up — move to nurture', dueDays: -3, repInitials: 'AR' },
  { businessName: 'Bloom Wellness',          contactName: 'Rachel Bloom',     phone: '+15105551007', stage: 'ENGAGED_INTERESTED', isHot: true, nextAction: 'Schedule call — she replied', dueDays: 0, repInitials: 'AN' },
  { businessName: 'Russell Painting Co.',    contactName: 'Mike Russell',     phone: '+19725551008', stage: 'ENGAGED_INTERESTED', nextAction: 'Text client — voicemail 3x', dueDays: 1, repInitials: 'SB' },

  // ═══════════ QUALIFIED (1) ═══════════
  { businessName: 'Morrison Dental Group',   contactName: 'Dr. James Morrison', phone: '+14695551009', stage: 'QUALIFIED', isHot: true, nextAction: 'Send app link', dueDays: 0, repInitials: 'MC' },

  // ═══════════ SUBMITTED (IN REVIEW) (4) ═══════════
  { businessName: 'Arguello Group',          contactName: 'Carlos Arguello',  phone: '+13055551010', stage: 'SUBMITTED_IN_REVIEW', appSubmitted: true, nextAction: 'Call client — get app done', dueDays: -2, repInitials: 'AN' },
  { businessName: 'Manco Equipment',         contactName: 'Tony Manco',       phone: '+14435551011', stage: 'SUBMITTED_IN_REVIEW', isHot: true, appSubmitted: true, nextAction: 'Follow up lender — app Mar 18', dueDays: 0, repInitials: 'HB' },
  { businessName: 'J&A Transport',           contactName: 'Jorge Alvarez',    phone: '+16195551012', stage: 'SUBMITTED_IN_REVIEW', appSubmitted: true, nextAction: 'Follow up lender — app in review', dueDays: 1, repInitials: 'AR' },
  { businessName: 'Park Beauty Supply',      contactName: 'Sandra Park',      phone: '+12135551013', stage: 'SUBMITTED_IN_REVIEW', isHot: true, appSubmitted: true, nextAction: 'App sent — check in if not heard', dueDays: 0, repInitials: 'AN' },

  // ═══════════ APPROVED / OFFERS (2) ═══════════
  {
    businessName: 'AutoLift Co.',
    contactName: 'Marcus White',
    phone: '+17705551014',
    stage: 'APPROVED_OFFERS',
    isHot: true,
    appSubmitted: true,
    lenderEngaged: true,
    nextAction: 'Call to close — SBA offer received',
    dueDays: 0,
    productType: 'SBA',
    dealAmount: 300000,
    repInitials: 'JB',
    offers: [
      { lender: 'Live Oak Bank', amount: 300000, product: 'SBA', terms: 'SBA 7(a) — 10yr, 11.5%', isAccepted: false },
    ],
    notes: 'Strong application. Live Oak approved $300k SBA. Client reviewing terms.',
  },
  {
    businessName: 'Williams HVAC Solutions',
    contactName: 'Brian Williams',
    phone: '+16025551015',
    stage: 'APPROVED_OFFERS',
    isHot: true,
    appSubmitted: true,
    lenderEngaged: true,
    nextAction: 'Call client — present offer to client',
    dueDays: 0,
    productType: 'MCA',
    dealAmount: 175000,
    repInitials: 'AN',
    offers: [
      { lender: 'Credibly', amount: 175000, product: 'MCA', terms: '12mo, 1.29 factor', isAccepted: false },
    ],
  },

  // ═══════════ FUNDED (7) ═══════════
  {
    businessName: 'Horizon Auto Group',
    contactName: 'Ray Castillo',
    phone: '+12145551016',
    stage: 'FUNDED',
    isHot: true,
    appSubmitted: true,
    lenderEngaged: true,
    nextAction: 'Call client — renewal opportunity',
    dueDays: -2,
    productType: 'MCA',
    fundedAmount: 500000,
    funder: 'OnDeck',
    fundedTerm: 12,
    fundedRate: '1.35',
    fundedProduct: 'MCA',
    fundedDate: '2025-12-15',
    repInitials: 'JB',
    notes: 'Returning client. 2nd funding. Very responsive.',
    clientNotes: 'Excellent repeat client. Always sends docs quickly.',
  },
  {
    businessName: 'Titan Ventures',
    contactName: 'Bill Johnson',
    phone: '+18015551017',
    email: 'bill@titanventures.com',
    stage: 'FUNDED',
    isHot: true,
    appSubmitted: true,
    lenderEngaged: true,
    nextAction: 'Request referral — 2 contacts pending',
    dueDays: 3,
    productType: 'SBA',
    fundedAmount: 350000,
    funder: 'First National Bank',
    fundedTerm: 12,
    fundedRate: '7.2%',
    fundedProduct: 'SBA',
    fundedDate: '2026-03-15',
    repInitials: 'JB',
    notes: 'Bill funded $350k SBA Mar 15. Already sent one referral. He mentioned two more contacts — follow up this week.',
    clientNotes: 'Top referral source. Sent us 3 deals. Always answers. Best relationship in the book.',
  },
  {
    businessName: 'Gulf Coast Logistics',
    contactName: 'Wayne Phillips',
    phone: '+12815551018',
    stage: 'FUNDED',
    appSubmitted: true,
    lenderEngaged: true,
    nextAction: 'Send thank you — referral follow up',
    dueDays: 5,
    productType: 'MCA',
    fundedAmount: 350000,
    funder: 'Kabbage',
    fundedTerm: 18,
    fundedRate: '1.28',
    fundedProduct: 'MCA',
    fundedDate: '2026-02-20',
    repInitials: 'MC',
  },
  {
    businessName: 'Reeves Construction',
    contactName: 'Tom Reeves',
    phone: '+19185551019',
    stage: 'FUNDED',
    appSubmitted: true,
    lenderEngaged: true,
    nextAction: 'Call client — equipment Q2',
    dueDate: '2026-04-01',
    productType: 'EQUIPMENT',
    fundedAmount: 280000,
    funder: 'Balboa Capital',
    fundedTerm: 24,
    fundedRate: '8.9%',
    fundedProduct: 'EQUIPMENT',
    fundedDate: '2026-01-10',
    repInitials: 'HB',
  },
  {
    businessName: 'Pacific Rim Restaurant Group',
    contactName: 'Kenneth Chao',
    phone: '+15035551020',
    stage: 'FUNDED',
    appSubmitted: true,
    lenderEngaged: true,
    nextAction: 'Call Apr 14 — 4th location',
    dueDate: '2026-04-14',
    productType: 'SBA',
    fundedAmount: 195000,
    funder: 'Live Oak Bank',
    fundedTerm: 10,
    fundedRate: '11%',
    fundedProduct: 'SBA',
    fundedDate: '2025-11-01',
    repInitials: 'AN',
  },
  {
    businessName: 'Carter Medical Staffing',
    contactName: 'Angela Carter',
    phone: '+14049551021',
    stage: 'FUNDED',
    appSubmitted: true,
    lenderEngaged: true,
    nextAction: 'Send renewal proposal',
    dueDays: -4,
    productType: 'LOC',
    fundedAmount: 375000,
    funder: 'Fundbox',
    fundedTerm: 12,
    fundedRate: '15%',
    fundedProduct: 'LOC',
    fundedDate: '2025-10-01',
    repInitials: 'AR',
  },
  {
    businessName: 'Yellow Rooster LLC',
    contactName: 'Danny Tran',
    phone: '+17025551022',
    stage: 'FUNDED',
    appSubmitted: true,
    lenderEngaged: true,
    nextAction: 'Check-in — 30d post-funding',
    dueDays: -1,
    productType: 'MCA',
    fundedAmount: 350000,
    funder: 'Credibly',
    fundedTerm: 12,
    fundedRate: '1.32',
    fundedProduct: 'MCA',
    fundedDate: '2026-02-25',
    repInitials: 'SB',
  },

  // ═══════════ NURTURE (5) ═══════════
  {
    businessName: 'Olson Retail Group',
    contactName: 'Karen Olson',
    phone: '+16125551023',
    stage: 'NURTURE',
    prevOffer: 200000,
    nextAction: 'Reschedule check-in',
    dueDays: -5,
    followUpType: 'renewal',
    followUpNote: 'Client funded elsewhere 6 months ago. Renewal window approaching.',
    repInitials: 'JB',
  },
  {
    businessName: 'Dupree Catering & Events',
    contactName: 'Marie Dupree',
    phone: '+12025551024',
    stage: 'NURTURE',
    prevOffer: 95000,
    nextAction: 'Call now — event season',
    dueDays: 0,
    followUpType: 'reengage',
    followUpNote: 'Peak season starting. Good time to re-engage.',
    repInitials: 'AN',
  },
  {
    businessName: 'Cascade Services',
    contactName: 'Rob Caldwell',
    phone: '+15415551025',
    stage: 'NURTURE',
    prevOffer: 120000,
    nextAction: 'Re-engage check-in',
    dueDate: '2026-04-28',
    followUpType: 'reengage',
    followUpNote: 'Lost to timing. Check back end of April.',
    repInitials: 'MC',
  },
  {
    businessName: 'Pryce Beauty Bar',
    contactName: 'Diana Pryce',
    phone: '+17135551026',
    stage: 'NURTURE',
    prevOffer: 75000,
    nextAction: 'Call Apr 1 — expansion ready',
    dueDate: '2026-04-01',
    followUpType: 'timing',
    followUpNote: 'Opening 2nd location. Will need capital.',
    repInitials: 'SB',
  },
  {
    businessName: 'Navarro Auto Body',
    contactName: 'Eddie Navarro',
    phone: '+12105551027',
    stage: 'NURTURE',
    prevOffer: 85000,
    nextAction: 'Call May — after tax lien clears',
    dueDate: '2026-05-01',
    followUpType: 'timing',
    followUpNote: 'Tax lien on file. Should resolve by end of April.',
    repInitials: 'HB',
  },
];

// ────────────────────────────────────────
// MAIN
// ────────────────────────────────────────
async function main() {
  console.log('🧹 CLEANING DATABASE...\n');

  // 0. Delete message queue
  try { await prisma.messageQueue.deleteMany(); } catch { /* ok */ }
  console.log('  ✅ Message queue cleared');

  // 1. Delete all deal-related data
  await prisma.renewalTask.deleteMany();
  await prisma.dealEvent.deleteMany();
  await prisma.fundingEvent.deleteMany();
  await prisma.offer.deleteMany();
  await prisma.deal.deleteMany();
  console.log('  ✅ Deals, events, offers, funding, renewals deleted');

  // 2. Delete pipeline cards
  await prisma.pipelineCard.deleteMany();
  console.log('  ✅ Pipeline cards deleted');

  // 3. Delete inbox data
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  console.log('  ✅ Messages and conversations deleted');

  // 4. Delete campaign leads first (FK to Lead without cascade)
  try { await prisma.campaignLead.deleteMany(); } catch { /* ok */ }
  try { await prisma.campaign.deleteMany(); } catch { /* ok */ }
  console.log('  ✅ Campaign leads and campaigns deleted');

  // 5. Delete automation runs, lead tags, then leads
  try { await prisma.automationRun.deleteMany(); } catch { /* ok */ }
  await prisma.leadTag.deleteMany();
  await prisma.lead.deleteMany();
  console.log('  ✅ Leads, lead tags, and automation runs deleted');

  // 6. Delete clients
  await prisma.client.deleteMany();
  console.log('  ✅ Clients deleted');

  // 7. Delete activity logs
  try { await prisma.activityLog.deleteMany(); } catch { /* may not exist */ }
  console.log('  ✅ Activity logs deleted');

  // 8. Delete users except protected ones
  const keepEmails = [...KEEP_EMAILS, ...TEAM_USERS.map(u => u.email)];
  const deleted = await prisma.user.deleteMany({
    where: { email: { notIn: keepEmails } },
  });
  console.log(`  ✅ ${deleted.count} extra users deleted`);

  // 9. Ensure all team users exist
  console.log('\n👥 ENSURING TEAM USERS...\n');
  const defaultPw = await bcrypt.hash('SCLRep2026!', 12);

  for (const u of TEAM_USERS) {
    const existing = await prisma.user.findFirst({ where: { email: u.email } });
    if (existing) {
      await prisma.user.update({
        where: { id: existing.id },
        data: { firstName: u.firstName, lastName: u.lastName, initials: u.initials, role: u.role, isActive: true, avatarColor: u.avatarColor },
      });
      console.log(`  ✅ Updated ${u.initials} (${u.email})`);
    } else {
      await prisma.user.create({
        data: {
          email: u.email,
          passwordHash: defaultPw,
          firstName: u.firstName,
          lastName: u.lastName,
          initials: u.initials,
          role: u.role,
          isActive: true,
          avatarColor: u.avatarColor,
        },
      });
      console.log(`  ✅ Created ${u.initials} (${u.email})`);
    }
  }

  // Build rep lookup by initials
  const allUsers = await prisma.user.findMany({ select: { id: true, initials: true, email: true } });
  const repMap: Record<string, string> = {};
  for (const u of allUsers) {
    if (u.initials) repMap[u.initials] = u.id;
  }
  // Fallback: JB as default
  const defaultRepId = repMap['JB'] || allUsers[0].id;

  // 10. Create prototype deals
  console.log('\n📊 CREATING PROTOTYPE DEALS...\n');

  const now = new Date();

  for (const d of DEALS) {
    const repId = repMap[d.repInitials] || defaultRepId;

    // Create client
    const client = await prisma.client.create({
      data: {
        businessName: d.businessName,
        contactName: d.contactName,
        phone: d.phone,
        email: d.email,
      },
    });

    // Calculate due date
    let nextActionDue: Date | undefined;
    if (d.dueDate) {
      nextActionDue = new Date(d.dueDate + 'T12:00:00Z');
    } else if (d.dueDays !== undefined) {
      nextActionDue = new Date(now);
      nextActionDue.setDate(nextActionDue.getDate() + d.dueDays);
    }

    // Calculate funded date for funded deals
    let fundedDate: Date | undefined;
    if (d.fundedDate) {
      fundedDate = new Date(d.fundedDate + 'T12:00:00Z');
    }

    // Follow-up date for nurture
    let followUpDate: Date | undefined;
    if (d.stage === 'NURTURE' && nextActionDue) {
      followUpDate = nextActionDue;
    }

    const deal = await prisma.deal.create({
      data: {
        clientId: client.id,
        assignedRepId: repId,
        stage: d.stage as any,
        stageLabel: stageLabel(d.stage),
        productType: (d.productType as any) || null,
        dealAmount: d.dealAmount || d.fundedAmount || null,
        needsAmount: !d.dealAmount && !d.fundedAmount,
        nextAction: d.nextAction || null,
        nextActionDue: nextActionDue || null,
        appSubmitted: d.appSubmitted || false,
        lenderEngaged: d.lenderEngaged || false,
        isHot: d.isHot || false,
        notes: d.notes || null,
        clientNotes: d.clientNotes || null,
        prevOffer: d.prevOffer || null,
        lostReason: d.stage === 'NURTURE' ? 'timing' : null,
        followUpDate: followUpDate || null,
        followUpType: d.followUpType || null,
        followUpNote: d.followUpNote || null,
        fundedDate: fundedDate || null,
        lastActivityAt: new Date(),
      },
    });

    // Create offers for APPROVED deals
    if (d.offers) {
      for (const o of d.offers) {
        await prisma.offer.create({
          data: {
            dealId: deal.id,
            lenderName: o.lender,
            amount: o.amount,
            terms: o.terms || null,
            productType: o.product || null,
            isAccepted: o.isAccepted || false,
          },
        });
      }
    }

    // Create FundingEvent for FUNDED deals
    if (d.stage === 'FUNDED' && d.fundedAmount) {
      await prisma.fundingEvent.create({
        data: {
          dealId: deal.id,
          repId,
          amountFunded: d.fundedAmount,
          lender: d.funder || null,
          termMonths: d.fundedTerm || null,
          rate: d.fundedRate ? parseFloat(d.fundedRate) : null,
          productType: d.fundedProduct || null,
          fundedDate: fundedDate || now,
          notes: d.notes || null,
        },
      });

      // Update client funding stats
      await prisma.client.update({
        where: { id: client.id },
        data: {
          fundingCount: { increment: 1 },
          totalFunded: { increment: d.fundedAmount },
        },
      });
    }

    // Create deal event
    await prisma.dealEvent.create({
      data: {
        dealId: deal.id,
        repId,
        eventType: 'deal_created',
        toStage: d.stage as any,
        note: `Deal created for ${d.businessName}`,
      },
    });

    console.log(`  ✅ ${stageLabel(d.stage).padEnd(22)} ${d.businessName}${d.fundedAmount ? ` ($${d.fundedAmount / 1000}k)` : ''}`);
  }

  // 11. Update team goals
  try {
    await prisma.goal.upsert({
      where: { entityType_entityId: { entityType: 'team', entityId: 'team' } },
      update: { monthlyGoal: 5_800_000, annualGoal: 69_600_000 },
      create: { entityType: 'team', entityId: 'team', monthlyGoal: 5_800_000, annualGoal: 69_600_000 },
    });
  } catch { /* goal table might not exist */ }

  console.log(`\n✅ DONE! Created ${DEALS.length} deals matching prototype.\n`);

  // Summary
  const summary = await prisma.deal.groupBy({
    by: ['stage'],
    _count: true,
  });
  console.log('📊 Stage Summary:');
  for (const s of summary) {
    console.log(`  ${stageLabel(s.stage).padEnd(25)} ${s._count}`);
  }
}

function stageLabel(stage: string): string {
  const labels: Record<string, string> = {
    NEW_LEAD: 'New Lead',
    ENGAGED_INTERESTED: 'Engaged / Interested',
    QUALIFIED: 'Qualified',
    SUBMITTED_IN_REVIEW: 'Submitted (In Review)',
    APPROVED_OFFERS: 'Approved / Offers',
    COMMITTED_FUNDING: 'Committed → Funding',
    FUNDED: 'Funded',
    NURTURE: 'Nurture (Lost)',
    CLOSED: 'Closed (DQ)',
  };
  return labels[stage] || stage;
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
