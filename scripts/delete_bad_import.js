const { PrismaClient } = require('./server/node_modules/@prisma/client');
const p = new PrismaClient();

const BATCH_ID = 'import_1774897777942';

(async () => {
  // Find all deals in this batch
  const deals = await p.deal.findMany({
    where: { importBatch: BATCH_ID },
    select: { id: true, clientId: true },
  });
  console.log(`Found ${deals.length} deals in batch ${BATCH_ID}`);

  const dealIds = deals.map(d => d.id);
  const clientIds = [...new Set(deals.map(d => d.clientId))];

  // Delete funding events
  const fe = await p.fundingEvent.deleteMany({ where: { dealId: { in: dealIds } } });
  console.log(`Deleted ${fe.count} funding events`);

  // Delete renewal tasks
  const rt = await p.renewalTask.deleteMany({ where: { dealId: { in: dealIds } } });
  console.log(`Deleted ${rt.count} renewal tasks`);

  // Delete deal events
  const de = await p.dealEvent.deleteMany({ where: { dealId: { in: dealIds } } });
  console.log(`Deleted ${de.count} deal events`);

  // Delete offers
  const of_ = await p.offer.deleteMany({ where: { dealId: { in: dealIds } } });
  console.log(`Deleted ${of_.count} offers`);

  // Delete deals
  const dd = await p.deal.deleteMany({ where: { importBatch: BATCH_ID } });
  console.log(`Deleted ${dd.count} deals`);

  // Delete orphan clients (no remaining deals)
  let orphansDeleted = 0;
  for (const cid of clientIds) {
    const remaining = await p.deal.count({ where: { clientId: cid } });
    if (remaining === 0) {
      await p.client.delete({ where: { id: cid } }).catch(() => {});
      orphansDeleted++;
    }
  }
  console.log(`Deleted ${orphansDeleted} orphan clients`);

  // Verify
  const totalDeals = await p.deal.count({ where: { stage: 'FUNDED' } });
  const totalFE = await p.fundingEvent.count();
  console.log(`\nAfter cleanup: ${totalDeals} funded deals, ${totalFE} funding events remaining`);

  await p.$disconnect();
})();
