/**
 * Enrich demo deals with varied next actions, due dates, hot flags,
 * offers, and redistribute some deals to make the pipeline look realistic.
 *
 * Run from server/: node scripts/enrich-demo-data.js
 */
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysFromNow(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  d.setHours(9, 0, 0, 0);
  return d;
}
function hoursAgo(n) {
  return new Date(Date.now() - n * 3600_000);
}
function cuid() {
  return 'c' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

const ACTIONS = {
  NEW_LEAD: [
    'Call back — qualify now',
    'Call today — warm referral',
    'Send intro text',
    'Research business — prep for call',
    'Verify contact info',
  ],
  ENGAGED_INTERESTED: [
    'Schedule call — she replied',
    'Text client — voicemail 3x',
    'Follow up on docs request',
    'Send rate comparison',
    'Final follow up — move to nurture',
    'Call back — missed call',
    'Review bank statements sent',
    'Check credit pull results',
    'Send pre-approval details',
    'Confirm business revenue',
  ],
  QUALIFIED: [
    'Send app link',
    'Collect remaining docs',
    'Walk through application',
    'Verify business ownership',
  ],
  SUBMITTED_IN_REVIEW: [
    'Call client — get app done',
    'Follow up lender — app sent',
    'Chase missing doc from client',
    'Check lender portal for update',
    'Lender needs updated statement',
    'Waiting on lender decision',
  ],
  APPROVED_OFFERS: [
    'Present offer to client',
    'Client reviewing — follow up',
    'Negotiate better terms',
    'Compare offers for client',
    'Schedule signing call',
  ],
  COMMITTED_FUNDING: [
    'Confirm funding date',
    'Collect signed contract',
    'Wire details pending',
    'Follow up — awaiting deposit',
    'Final verification call',
  ],
};

const PRODUCTS = ['MCA', 'LOC', 'EQUIPMENT', 'HELOC', 'SBA', 'CRE', 'BRIDGE'];
const LENDERS = ['Rapid Finance', 'OnDeck', 'Kabbage', 'BlueVine', 'Fundbox', 'Credibly', 'National Funding', 'Celtic Bank', 'SmartBiz', 'Lendio'];

async function main() {
  // ─── 1. Grab all ENGAGED deals ───
  const engaged = await prisma.deal.findMany({
    where: { stage: 'ENGAGED_INTERESTED' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  console.log(`Found ${engaged.length} ENGAGED deals`);

  // ─── 2. Move some deals to other stages ───
  // SKIP — already moved in previous run
  if (engaged.length > 350) {
    // Only run moves if not already done
    const toQualified = engaged.slice(0, 5).map((d) => d.id);
    const toSubmitted = engaged.slice(5, 15).map((d) => d.id);
    const toApproved = engaged.slice(15, 20).map((d) => d.id);
    const toCommitted = engaged.slice(20, 23).map((d) => d.id);
    const toNurture = engaged.slice(23, 38).map((d) => d.id);

    await prisma.deal.updateMany({ where: { id: { in: toQualified } }, data: { stage: 'QUALIFIED' } });
    console.log(`Moved ${toQualified.length} → QUALIFIED`);

    await prisma.deal.updateMany({ where: { id: { in: toSubmitted } }, data: { stage: 'SUBMITTED_IN_REVIEW', appSubmitted: true } });
    console.log(`Moved ${toSubmitted.length} → SUBMITTED_IN_REVIEW`);

    await prisma.deal.updateMany({ where: { id: { in: toApproved } }, data: { stage: 'APPROVED_OFFERS', appSubmitted: true, lenderEngaged: true } });
    console.log(`Moved ${toApproved.length} → APPROVED_OFFERS`);

    await prisma.deal.updateMany({ where: { id: { in: toCommitted } }, data: { stage: 'COMMITTED_FUNDING', appSubmitted: true, lenderEngaged: true } });
    console.log(`Moved ${toCommitted.length} → COMMITTED_FUNDING`);

    for (const id of toNurture) {
      await prisma.deal.update({
        where: { id },
        data: {
          stage: 'NURTURE',
          prevOffer: randomBetween(15000, 85000),
          followUpDate: daysFromNow(randomBetween(14, 90)),
          followUpType: randomItem(['RENEWAL', 'NURTURE', 'RE_ENGAGE', 'CHECK_TIMING']),
          followUpNote: 'Previous engagement — re-engage when ready',
        },
      });
    }
    console.log(`Moved ${toNurture.length} → NURTURE with prevOffer`);
  } else {
    console.log('Stage moves already done — skipping');
  }

  // ─── 3. Add nextAction to ALL active deals ───
  const allActive = await prisma.deal.findMany({
    where: { stage: { notIn: ['CLOSED'] } },
    select: { id: true, stage: true },
  });

  let hotCount = 0;
  for (const deal of allActive) {
    const actions = ACTIONS[deal.stage] || ACTIONS['ENGAGED_INTERESTED'];
    const action = randomItem(actions);

    // Due date distribution: 30% overdue, 25% today, 15% tomorrow, 30% future
    const roll = Math.random();
    let dueDays;
    if (roll < 0.30) dueDays = randomBetween(-5, -1); // overdue
    else if (roll < 0.55) dueDays = 0; // today
    else if (roll < 0.70) dueDays = 1; // tomorrow
    else dueDays = randomBetween(2, 7); // future

    // Skip nextAction for some FUNDED/NURTURE deals (they can exist without)
    if (['FUNDED', 'NURTURE'].includes(deal.stage) && Math.random() < 0.5) {
      continue;
    }

    // Make some hot: ~15% of deals with recent reply
    const makeHot = Math.random() < 0.15;
    const updateData = {
      nextAction: action,
      nextActionDue: daysFromNow(dueDays),
      productType: randomItem(PRODUCTS),
      ...(makeHot
        ? {
            lastReplyAt: hoursAgo(randomBetween(1, 36)),
            isHot: true,
          }
        : {}),
    };

    if (makeHot) hotCount++;

    await prisma.deal.update({ where: { id: deal.id }, data: updateData });
  }
  console.log(`Set nextAction on ${allActive.length} deals, ${hotCount} made hot`);

  // ─── 4. Add lenderEngaged + appSubmitted to SUBMITTED deals for hot ───
  const submittedDeals = await prisma.deal.findMany({
    where: { stage: 'SUBMITTED_IN_REVIEW' },
    select: { id: true },
  });
  // Half get lenderEngaged
  for (let i = 0; i < submittedDeals.length; i++) {
    if (i % 2 === 0) {
      await prisma.deal.update({
        where: { id: submittedDeals[i].id },
        data: { lenderEngaged: true, appSubmitted: true },
      });
    }
  }

  // ─── 5. Add offers to APPROVED + COMMITTED deals ───
  const approvedCommitted = await prisma.deal.findMany({
    where: { stage: { in: ['APPROVED_OFFERS', 'COMMITTED_FUNDING'] } },
    select: { id: true, dealAmount: true },
  });

  for (const deal of approvedCommitted) {
    const numOffers = randomBetween(1, 3);
    for (let i = 0; i < numOffers; i++) {
      await prisma.offer.create({
        data: {
          id: cuid(),
          dealId: deal.id,
          lenderName: randomItem(LENDERS),
          amount: randomBetween(20000, 150000),
          termMonths: randomItem([6, 12, 18, 24, 36]),
          rateFactor: parseFloat((Math.random() * 0.2 + 0.05).toFixed(4)),
          productType: randomItem(PRODUCTS),
          isAccepted: i === 0,
        },
      });
    }
  }
  console.log(`Added offers to ${approvedCommitted.length} APPROVED/COMMITTED deals`);

  // ─── 6. Ensure FUNDED deals have funding events ───
  const fundedDeals = await prisma.deal.findMany({
    where: { stage: 'FUNDED' },
    select: { id: true, dealAmount: true },
    take: 10,
  });

  for (const deal of fundedDeals) {
    const existing = await prisma.fundingEvent.count({ where: { dealId: deal.id } });
    if (existing === 0) {
      await prisma.fundingEvent.create({
        data: {
          id: cuid(),
          dealId: deal.id,
          amountFunded: deal.dealAmount || randomBetween(25000, 200000),
          funder: randomItem(LENDERS),
          termMonths: randomItem([6, 12, 18, 24]),
          fundedDate: daysFromNow(-randomBetween(1, 25)),
          productType: randomItem(PRODUCTS),
        },
      });
    }
  }
  console.log(`Ensured funding events for ${fundedDeals.length} FUNDED deals`);

  // ─── 7. Final distribution check ───
  const dist = await prisma.deal.groupBy({
    by: ['stage'],
    _count: true,
    orderBy: { stage: 'asc' },
  });
  console.log('\nFinal distribution:');
  for (const s of dist) {
    console.log(`  ${s.stage}: ${s._count}`);
  }

  const actionStats = await prisma.deal.count({ where: { nextAction: { not: null } } });
  const hotStats = await prisma.deal.count({ where: { isHot: true } });
  console.log(`\nDeals with nextAction: ${actionStats}`);
  console.log(`Deals marked hot: ${hotStats}`);

  await prisma.$disconnect();
  console.log('\nDone!');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
