// © BuyReadySite.com — Backfill replies attribution с новой логикой
// (latestCampaignOutbound c campaignId IS NOT NULL + 14-day window)
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

const ATTRIBUTION_WINDOW_DAYS = 14;

(async () => {
  const since = new Date(Date.now() - 14 * 86400000);
  const inbound = await prisma.message.findMany({
    where: { direction: "INBOUND", createdAt: { gte: since } },
    select: {
      id: true,
      conversationId: true,
      createdAt: true,
      conversation: { select: { leadId: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  console.log(`Total INBOUND in last 14d: ${inbound.length}`);

  const campaignIncrements = new Map(); // campaignId -> count
  let attributed = 0;
  let skippedNoOutbound = 0;
  let skippedAlreadyReplied = 0;

  for (const inb of inbound) {
    const leadId = inb.conversation?.leadId;
    if (!leadId) continue;

    const cutoff = new Date(inb.createdAt.getTime() - ATTRIBUTION_WINDOW_DAYS * 86400000);
    const lo = await prisma.message.findFirst({
      where: {
        conversationId: inb.conversationId,
        direction: "OUTBOUND",
        campaignId: { not: null },
        OR: [{ sentAt: { gte: cutoff } }, { createdAt: { gte: cutoff } }],
      },
      orderBy: [{ sentAt: "desc" }, { createdAt: "desc" }],
      select: { campaignId: true, sentAt: true, createdAt: true },
    });

    if (!lo?.campaignId) {
      skippedNoOutbound++;
      continue;
    }
    // outbound должен быть ДО inbound
    const loAt = lo.sentAt || lo.createdAt;
    if (loAt > inb.createdAt) continue;

    const upd = await prisma.campaignLead.updateMany({
      where: {
        campaignId: lo.campaignId,
        leadId,
        status: { in: ["SENT", "DELIVERED"] },
      },
      data: {
        status: "REPLIED",
        repliedAt: inb.createdAt,
      },
    });

    if (upd.count > 0) {
      attributed += upd.count;
      campaignIncrements.set(lo.campaignId, (campaignIncrements.get(lo.campaignId) || 0) + upd.count);
    } else {
      skippedAlreadyReplied++;
    }
  }

  console.log(`\nResults:`);
  console.log(`  Attributed (status SENT/DELIVERED → REPLIED): ${attributed}`);
  console.log(`  Skipped (no campaign outbound in 14d): ${skippedNoOutbound}`);
  console.log(`  Skipped (already REPLIED or not found): ${skippedAlreadyReplied}`);
  console.log(`\nUpdating ${campaignIncrements.size} campaigns totalReplied...`);

  for (const [campaignId, inc] of campaignIncrements) {
    await prisma.campaign.update({
      where: { id: campaignId },
      data: { totalReplied: { increment: inc } },
    });
  }
  console.log("Campaign counters updated.");

  // Топ-10 затронутых кампаний
  if (campaignIncrements.size > 0) {
    console.log("\nTop affected campaigns:");
    const top = [...campaignIncrements.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
    for (const [cid, inc] of top) {
      const c = await prisma.campaign.findUnique({
        where: { id: cid },
        select: { name: true, totalSent: true, totalReplied: true },
      });
      console.log(`  +${inc} → ${c?.totalReplied}/${c?.totalSent} — ${c?.name}`);
    }
  }

  await prisma.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
