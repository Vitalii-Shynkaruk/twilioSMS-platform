const { PrismaClient } = require('./server/node_modules/@prisma/client');
const p = new PrismaClient();

(async () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  console.log('Start of month:', startOfMonth.toISOString());

  // Total funding events
  const total = await p.fundingEvent.aggregate({ _sum: { amountFunded: true }, _count: true });
  console.log('Total funding events:', total._count, '| $' + total._sum.amountFunded);

  // MTD
  const mtd = await p.fundingEvent.aggregate({
    where: { fundedDate: { gte: startOfMonth } },
    _sum: { amountFunded: true }, _count: true
  });
  console.log('MTD (>= start of month):', mtd._count, '| $' + mtd._sum.amountFunded);

  // Check deals in FUNDED stage  
  const fundedDeals = await p.deal.findMany({
    where: { stage: 'FUNDED' },
    select: { id: true, fundedDate: true, dealAmount: true, client: { select: { businessName: true, contactName: true } } },
    orderBy: { fundedDate: 'desc' },
    take: 10
  });
  console.log('\nLast 10 funded deals:');
  for (const d of fundedDeals) {
    console.log(`  ${d.fundedDate?.toISOString()?.slice(0,10) || 'NO DATE'} | $${d.dealAmount} | biz: ${d.client?.businessName} | contact: ${d.client?.contactName}`);
  }

  // Count deals with null fundedDate
  const noDate = await p.deal.count({ where: { stage: 'FUNDED', fundedDate: null } });
  console.log('\nFunded deals with NULL fundedDate:', noDate);

  // Count ALL funded deals 
  const allFunded = await p.deal.count({ where: { stage: 'FUNDED' } });
  console.log('Total funded deals:', allFunded);

  // Check latest import batch
  const latestBatch = await p.deal.findFirst({
    where: { importBatch: { not: null } },
    orderBy: { createdAt: 'desc' },
    select: { importBatch: true, createdAt: true }
  });
  console.log('\nLatest import batch:', latestBatch?.importBatch, latestBatch?.createdAt);

  // Count deals per batch
  const batches = await p.deal.groupBy({
    by: ['importBatch'],
    where: { importBatch: { not: null } },
    _count: true,
    orderBy: { _count: { importBatch: 'desc' } }
  });
  console.log('Import batches:');
  for (const b of batches) {
    console.log(`  ${b.importBatch}: ${b._count} deals`);
  }

  await p.$disconnect();
})();
