const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const batches = await p.deal.groupBy({
    by: ['importBatch'],
    where: { importBatch: { not: null } },
    _count: true,
    _sum: { dealAmount: true },
    orderBy: { _count: { importBatch: 'desc' } }
  });
  console.log('Import batches:');
  batches.forEach(b => console.log(' ', b.importBatch, '- count:', b._count, 'sum:', b._sum.dealAmount));

  if (batches.length > 0) {
    const latest = batches[0].importBatch;
    const samples = await p.deal.findMany({
      where: { importBatch: latest },
      take: 10,
      select: { id: true, dealAmount: true, fundedDate: true, lender: true, client: { select: { businessName: true } } }
    });
    console.log('\nLatest batch samples:');
    samples.forEach(s => console.log(' ', s.client?.businessName, '|', s.dealAmount, '|', s.fundedDate?.toISOString()?.slice(0,10), '|', s.lender));

    const zeros = await p.deal.count({ where: { importBatch: latest, dealAmount: 0 } });
    const total = await p.deal.count({ where: { importBatch: latest } });
    console.log('\nDeals with amount=0:', zeros, 'of', total);
  }
  await p.$disconnect();
})();
