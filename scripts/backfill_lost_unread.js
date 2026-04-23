// Backfill: восстанавливаем unreadCount для conversations где
// lastDirection=inbound но unreadCount=0 — потому что admin открыл и сбросил.
// Считаем сколько INBOUND сообщений после последнего OUTBOUND.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const lost = await p.conversation.findMany({
    where: {
      isActive: true,
      lastDirection: 'inbound',
      unreadCount: 0,
      lead: { optedOut: false, status: { not: 'DNC' } },
      assignedRepId: { not: null },
    },
    select: { id: true, assignedRepId: true,
      assignedRep: { select: { firstName: true } },
      lead: { select: { firstName: true } } },
  });
  console.log('Lost candidates:', lost.length);

  let restored = 0;
  for (const c of lost) {
    const lastOutbound = await p.message.findFirst({
      where: { conversationId: c.id, direction: 'OUTBOUND' },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });
    const inboundCount = await p.message.count({
      where: {
        conversationId: c.id,
        direction: 'INBOUND',
        ...(lastOutbound ? { createdAt: { gt: lastOutbound.createdAt } } : {}),
      },
    });
    if (inboundCount > 0) {
      await p.conversation.update({
        where: { id: c.id },
        data: { unreadCount: inboundCount },
      });
      restored++;
    }
  }
  console.log('Restored unread:', restored);
  await p.$disconnect();
})();
