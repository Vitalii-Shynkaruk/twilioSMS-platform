import prisma from '../config/database';
import logger from '../config/logger';
import { SendingEngine } from './sendingEngine';
import { NumberService } from './numberService';

export class ScheduledMessageService {
  static async processDueMessages(limit = 50): Promise<{ processed: number; failed: number }> {
    const now = new Date();
    const dueItems = await prisma.scheduledMessage.findMany({
      where: {
        status: 'PENDING',
        scheduledAt: { lte: now },
      },
      orderBy: { scheduledAt: 'asc' },
      take: limit,
      include: {
        conversation: {
          include: {
            lead: { select: { id: true, phone: true } },
          },
        },
      },
    });

    let processed = 0;
    let failed = 0;

    for (const item of dueItems) {
      try {
        const conversation = item.conversation;
        if (!conversation?.lead?.phone) {
          await prisma.scheduledMessage.update({
            where: { id: item.id },
            data: { status: 'CANCELLED' },
          });
          failed++;
          continue;
        }

        let senderNumber =
          (conversation.twilioNumberId
            ? await prisma.phoneNumber.findUnique({
                where: { id: conversation.twilioNumberId },
                select: { id: true, phoneNumber: true },
              })
            : null) ||
          (conversation.stickyNumberId
            ? await prisma.phoneNumber.findUnique({
                where: { id: conversation.stickyNumberId },
                select: { id: true, phoneNumber: true },
              })
            : null);

        if (!senderNumber) {
          senderNumber = await NumberService.getStickyNumber(
            conversation.lead.phone,
            conversation.assignedRepId || item.createdById,
          );
        }

        if (!senderNumber) {
          await prisma.scheduledMessage.update({
            where: { id: item.id },
            data: { status: 'CANCELLED' },
          });
          failed++;
          continue;
        }

        if (!conversation.twilioNumberId || conversation.twilioNumberId !== senderNumber.id) {
          await prisma.conversation.update({
            where: { id: conversation.id },
            data: {
              twilioNumberId: senderNumber.id,
              stickyNumberId: conversation.stickyNumberId || senderNumber.id,
            },
          });
        }

        await SendingEngine.queueMessage({
          toNumber: conversation.lead.phone,
          body: item.body,
          leadId: conversation.lead.id,
          sentByUserId: item.createdById,
          preferredNumberId: senderNumber.id,
          priority: 8,
        });

        await prisma.scheduledMessage.update({
          where: { id: item.id },
          data: { status: 'SENT' },
        });
        processed++;
      } catch (error: any) {
        failed++;
        await prisma.scheduledMessage.update({
          where: { id: item.id },
          data: { status: 'CANCELLED' },
        });
        logger.error('Failed to process scheduled message', {
          scheduledMessageId: item.id,
          error: error.message,
        });
      }
    }

    return { processed, failed };
  }
}

