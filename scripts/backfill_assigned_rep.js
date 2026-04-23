// Backfill: для всех conversations с assignedRepId=null назначаем rep'а
// который последним отправлял outbound в этом треде.
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const orphaned = await p.conversation.findMany({
    where: { isActive: true, assignedRepId: null },
    select: { id: true, leadId: true },
  });
  console.log('Orphaned conversations (assignedRepId=null):', orphaned.length);

  // Сначала собираем set активных user.id чтобы не упасть на FK
  const activeUsers = await p.user.findMany({ where: { isActive: true }, select: { id: true } });
  const activeIds = new Set(activeUsers.map((u) => u.id));

  let assigned = 0;
  let stillOrphan = 0;
  let skippedInactive = 0;

  for (const c of orphaned) {
    // Берём последний outbound от АКТИВНОГО rep'а
    const lastOutbounds = await p.message.findMany({
      where: { conversationId: c.id, direction: 'OUTBOUND', sentByUserId: { not: null } },
      orderBy: [{ sentAt: 'desc' }, { createdAt: 'desc' }],
      take: 10,
      select: { sentByUserId: true },
    });
    const lastOutbound = lastOutbounds.find((m) => activeIds.has(m.sentByUserId));
    if (lastOutbound?.sentByUserId) {
      await p.conversation.update({
        where: { id: c.id },
        data: { assignedRepId: lastOutbound.sentByUserId },
      });
      // Также фиксируем lead.assignedRepId если он null
      const lead = await p.lead.findUnique({ where: { id: c.leadId }, select: { assignedRepId: true } });
      if (!lead.assignedRepId) {
        await p.lead.update({
          where: { id: c.leadId },
          data: { assignedRepId: lastOutbound.sentByUserId },
        });
      }
      assigned++;
    } else if (lastOutbounds.length > 0) {
      skippedInactive++;
    } else {
      stillOrphan++;
    }
  }

  console.log('Assigned:', assigned);
  console.log('Skipped (only inactive senders):', skippedInactive);
  console.log('Still orphan (no outbound by user):', stillOrphan);

  await p.$disconnect();
})();
