import { Worker, Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import redis from '../config/redis';
import prisma from '../config/database';
import { SendingEngine } from '../services/sendingEngine';
import { NumberService } from '../services/numberService';
import logger from '../config/logger';
import { csvImportQueue, lookupErrorQueue, CsvImportJobData, LookupRetryJobData } from './lookupQueues';
import { LeadCsvImportService, CsvImportMapping } from '../services/leadCsvImportService';
import { LookupValidationService } from '../services/lookupValidationService';
import { SUPPRESSION_REASONS } from '../services/suppressionReasons';

/**
 * SMS Queue Worker
 * Processes outbound messages with rate limiting
 * Designed for high throughput: 10k-20k+ messages/day
 */
const smsWorker = new Worker(
  'sms-send',
  async (job: Job) => {
    const { messageId, fromNumber, toNumber, body, phoneNumberId, campaignId, leadId } = job.data;

    // Circuit breaker: check if campaign has too many failures
    if (campaignId) {
      const shouldBreak = await SendingEngine.checkCircuitBreaker(campaignId);
      if (shouldBreak) {
        // Auto-pause the campaign
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'PAUSED' },
        });
        const updated = await prisma.message.updateMany({
          where: { id: messageId, status: { in: ['QUEUED', 'SENDING'] } },
          data: { status: 'FAILED', errorMessage: 'Campaign paused by circuit breaker — high failure rate' },
        });
        if (updated.count > 0) {
          await prisma.campaign.update({
            where: { id: campaignId },
            data: { totalFailed: { increment: 1 } },
          });
          if (leadId) {
            await prisma.campaignLead.updateMany({
              where: { campaignId, leadId },
              data: {
                status: 'FAILED',
                errorCode: 'CIRCUIT_BREAKER',
              },
            });
          }
        }
        logger.warn(`Circuit breaker triggered for campaign ${campaignId} — auto-paused`);
        return;
      }
    }

    logger.debug(`Processing SMS job ${job.id}: ${messageId} → ${toNumber}`);

    await SendingEngine.sendViaTwilio(messageId, fromNumber, toNumber, body, phoneNumberId);
  },
  {
    connection: redis,
    concurrency: 15, // Process 15 messages concurrently (safe for 35+ numbers)
    limiter: {
      max: 300, // 300/min = 5 msg/sec — safe for 35 A2P 10DLC numbers
      duration: 60000,
    },
  },
);

smsWorker.on('completed', async (job: Job) => {
  logger.debug(`SMS job ${job.id} completed`);

  // ── Auto-complete campaign when all messages are processed ──
  const campaignId = job.data?.campaignId;
  if (campaignId) {
    try {
      const pending = await prisma.message.count({
        where: { campaignId, status: { in: ['QUEUED', 'SENDING'] } },
      });
      if (pending === 0) {
        const pendingLeads = await prisma.campaignLead.count({
          where: { campaignId, status: 'PENDING' },
        });
        const campaign = await prisma.campaign.findUnique({
          where: { id: campaignId },
          select: { status: true },
        });
        if (campaign && campaign.status === 'SENDING') {
          if (pendingLeads > 0) {
            await prisma.campaign.update({
              where: { id: campaignId },
              data: { status: 'PAUSED' },
            });
            logger.info(
              `Campaign ${campaignId} paused after queue drain: ${pendingLeads} pending leads remain for manual resume`,
            );
            return;
          }

          const stats = await prisma.message.groupBy({
            by: ['status'],
            where: { campaignId },
            _count: true,
          });
          const delivered = stats.find((s) => s.status === 'DELIVERED')?._count ?? 0;
          const sent = stats.find((s) => s.status === 'SENT')?._count ?? 0;
          const failed =
            (stats.find((s) => s.status === 'FAILED')?._count ?? 0) +
            (stats.find((s) => s.status === 'UNDELIVERED')?._count ?? 0);
          const blocked = stats.find((s) => s.status === 'BLOCKED')?._count ?? 0;

          await prisma.$transaction([
            prisma.campaign.update({
              where: { id: campaignId },
              data: {
                status: 'COMPLETED',
                completedAt: new Date(),
                totalDelivered: delivered,
                totalFailed: failed,
                totalBlocked: blocked,
                totalSent: sent + delivered + failed + blocked,
              },
            }),
          ]);
          logger.info(
            `Campaign ${campaignId} auto-completed: ${sent + delivered + failed + blocked} sent, ${delivered} delivered, ${failed} failed, ${blocked} blocked`,
          );
        }
      }
    } catch (err: any) {
      logger.error(`Campaign completion check error: ${err.message}`);
    }
  }
});

smsWorker.on('failed', (job: Job | undefined, error: Error) => {
  logger.error(`SMS job ${job?.id} failed:`, {
    error: error.message,
    data: job?.data,
    attemptsMade: job?.attemptsMade,
  });
});

smsWorker.on('error', (error: Error) => {
  logger.error('SMS worker error:', { error: error.message });
});

/**
 * Campaign Processing Worker
 * Handles campaign start, pause, resume operations
 */
const campaignWorker = new Worker(
  'campaign-process',
  async (job: Job) => {
    const { action, campaignId, options } = job.data;

    switch (action) {
      case 'start':
        await processCampaignStart(campaignId, options);
        break;
      case 'pause':
        await processCampaignPause(campaignId);
        break;
      default:
        logger.warn(`Unknown campaign action: ${action}`);
    }
  },
  {
    connection: redis,
    concurrency: 2,
  },
);

const csvImportWorker = new Worker<CsvImportJobData>(
  'csv-import',
  async (job) => {
    const { importJobId } = job.data;
    const importJob = await prisma.csvImportJob.findUnique({ where: { id: importJobId } });
    if (!importJob || !importJob.csvContent) return;

    await prisma.csvImportJob.update({
      where: { id: importJobId },
      data: { status: 'PROCESSING', startedAt: new Date(), processedRows: 0, errorMessage: null },
    });

    try {
      const records = LeadCsvImportService.parseCsvContent(importJob.csvContent);
      const mapping = (importJob.mapping || null) as CsvImportMapping | null;
      const user = importJob.userId ? { id: importJob.userId, role: importJob.userRole || 'ADMIN' } : null;
      const result = await LeadCsvImportService.importRecords({
        records,
        mapping,
        listName: importJob.listName || undefined,
        user,
        onProgress: async (processedRows) => {
          await prisma.csvImportJob.update({
            where: { id: importJobId },
            data: { processedRows },
          });
        },
      });

      await prisma.csvImportJob.update({
        where: { id: importJobId },
        data: {
          status: 'COMPLETED',
          processedRows: records.length,
          result: result as unknown as Prisma.InputJsonValue,
          csvContent: null,
          completedAt: new Date(),
        },
      });
    } catch (error: any) {
      await prisma.csvImportJob.update({
        where: { id: importJobId },
        data: {
          status: 'FAILED',
          errorMessage: error?.message || 'CSV import failed',
          completedAt: new Date(),
        },
      });
      throw error;
    }
  },
  {
    connection: redis,
    concurrency: 1,
  },
);

const lookupRetryWorker = new Worker<LookupRetryJobData>(
  'lookup-error-retry',
  async (job) => {
    const { leadId, phone, requestedByUserId } = job.data;
    const decision = await LookupValidationService.validatePhone(phone);

    if (decision.status === 'PASS') {
      await prisma.lead.update({
        where: { id: leadId },
        data: {
          lineType: decision.lineType || null,
          carrierName: decision.carrierName || null,
          validatedAt: decision.validatedAt || new Date(),
        },
      });
      await LookupValidationService.clearLookupSuppression(phone, leadId);
      await prisma.activityLog.create({
        data: {
          userId: requestedByUserId || null,
          action: 'lead.lookup_retry_passed',
          entityType: 'lead',
          entityId: leadId,
          metadata: { phone, lineType: decision.lineType || null, carrierName: decision.carrierName || null },
        },
      });
      return;
    }

    const reason = decision.reason || SUPPRESSION_REASONS.LOOKUP_QUARANTINE;
    const metadata = {
      lineType: decision.lineType || null,
      carrierName: decision.carrierName || null,
      validatedAt: decision.validatedAt || new Date(),
    };

    if (await LookupValidationService.hasProtectedSuppression(phone, leadId)) {
      await prisma.$transaction([
        prisma.lead.update({
          where: { id: leadId },
          data: metadata,
        }),
        prisma.activityLog.create({
          data: {
            userId: requestedByUserId || null,
            action: 'lead.lookup_retry_resolved',
            entityType: 'lead',
            entityId: leadId,
            metadata: {
              phone,
              reason,
              suppressionApplied: false,
              protectedSuppression: true,
              lineType: decision.lineType || null,
              carrierName: decision.carrierName || null,
            },
          },
        }),
      ]);
      return;
    }

    await prisma.$transaction([
      prisma.lead.update({
        where: { id: leadId },
        data: {
          isSuppressed: true,
          suppressedAt: new Date(),
          suppressReason: reason,
          ...metadata,
        },
      }),
      prisma.suppressionEntry.upsert({
        where: { phone },
        create: { phone, reason, source: 'lookup_retry' },
        update: { reason, source: 'lookup_retry' },
      }),
      prisma.activityLog.create({
        data: {
          userId: requestedByUserId || null,
          action: 'lead.lookup_retry_resolved',
          entityType: 'lead',
          entityId: leadId,
          metadata: { phone, reason, lineType: decision.lineType || null, carrierName: decision.carrierName || null },
        },
      }),
    ]);
  },
  {
    connection: redis,
    concurrency: 3,
  },
);

lookupRetryWorker.on('failed', async (job, error) => {
  const attempts = job?.opts.attempts || 3;
  if (!job || job.attemptsMade < attempts) return;

  await LookupValidationService.escalateLookupFailureToReview({
    leadId: job.data.leadId,
    phone: job.data.phone,
    requestedByUserId: job.data.requestedByUserId || null,
    errorMessage: error.message,
  });
});

csvImportWorker.on('failed', (job, error) => {
  logger.error(`CSV import job ${job?.id} failed:`, { error: error.message, data: job?.data });
});

lookupRetryWorker.on('error', (error: Error) => {
  logger.error('Lookup retry worker error:', { error: error.message });
});

csvImportWorker.on('error', (error: Error) => {
  logger.error('CSV import worker error:', { error: error.message });
});

async function processCampaignStart(campaignId: string, options: any): Promise<void> {
  try {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        leads: {
          where: { status: 'PENDING' },
          include: { lead: true },
        },
        _count: {
          select: { leads: true },
        },
      },
    });

    if (!campaign) return;

    // Queue all messages
    const leads = campaign.leads.map((cl) => ({
      leadId: cl.lead.id,
      phone: cl.lead.phone,
      firstName: cl.lead.firstName,
      lastName: cl.lead.lastName || undefined,
      company: cl.lead.company || undefined,
    }));

    // Enforce campaign dailyLimit: only send up to the limit
    const leadsToSend = campaign.dailyLimit && campaign.dailyLimit > 0 ? leads.slice(0, campaign.dailyLimit) : leads;

    if (leadsToSend.length < leads.length) {
      logger.info(
        `Campaign ${campaignId}: dailyLimit=${campaign.dailyLimit}, trimmed ${leads.length} → ${leadsToSend.length} leads`,
      );
      // Keep excess leads in PENDING so campaign can be resumed safely.
    }

    let restrictToPhoneNumberIds: string[] | undefined;
    const creator = await prisma.user.findUnique({
      where: { id: campaign.createdById },
      select: { role: true },
    });
    const assignedActiveNumberIds = await NumberService.getActiveAssignedNumberIds(campaign.createdById);

    if (creator?.role === 'REP') {
      restrictToPhoneNumberIds = assignedActiveNumberIds;
      if (restrictToPhoneNumberIds.length === 0) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: 'DRAFT',
            startedAt: null,
            totalLeads: campaign._count.leads,
            totalSent: 0,
          },
        });
        logger.warn(
          `Campaign ${campaignId} reverted to DRAFT: no active assigned numbers for rep ${campaign.createdById}`,
        );
        return;
      }
    } else if (assignedActiveNumberIds.length > 0) {
      // Admin/manager campaigns are also pinned to assigned active numbers when assignments exist.
      restrictToPhoneNumberIds = assignedActiveNumberIds;
    }

    const result = await SendingEngine.queueBulkSend({
      leads: leadsToSend,
      messageTemplate: campaign.messageTemplate,
      campaignId: campaign.id,
      poolId: campaign.numberPoolId || undefined,
      restrictToPhoneNumberIds,
      sendingSpeed: campaign.sendingSpeed,
      sentByUserId: campaign.createdById,
      // Prisma client type may lag behind schema in some environments.
      // Treat missing field as false to preserve default blast behavior.
      isRetarget: Boolean((campaign as any).isRetarget),
      // Admins and managers can send to leads regardless of conversation ownership.
      bypassOwnershipCheck: creator?.role === 'ADMIN' || creator?.role === 'MANAGER',
    });

    // If no messages were queued in this run, keep campaign state consistent.
    if (result.queued === 0) {
      const remainingPending = await prisma.campaignLead.count({
        where: { campaignId, status: 'PENDING' },
      });
      if (remainingPending > 0) {
        await prisma.campaign.update({
          where: { id: campaignId },
          data: { status: 'PAUSED', startedAt: null },
        });
        logger.warn(`Campaign ${campaignId} paused: 0 queued in this run, ${remainingPending} pending leads remain`);
        return;
      }

      const existingMessages = await prisma.message.count({
        where: { campaignId },
      });

      // Guard against destructive "resume" clicks:
      // if campaign already has processed messages and this run queued 0,
      // do NOT reset it to DRAFT/0-sent.
      if (existingMessages > 0) {
        const [pendingMessages, stats] = await Promise.all([
          prisma.message.count({
            where: { campaignId, status: { in: ['QUEUED', 'SENDING'] } },
          }),
          prisma.message.groupBy({
            by: ['status'],
            where: { campaignId },
            _count: true,
          }),
        ]);

        const delivered = stats.find((s) => s.status === 'DELIVERED')?._count ?? 0;
        const sent = stats.find((s) => s.status === 'SENT')?._count ?? 0;
        const failed =
          (stats.find((s) => s.status === 'FAILED')?._count ?? 0) +
          (stats.find((s) => s.status === 'UNDELIVERED')?._count ?? 0);
        const blocked = stats.find((s) => s.status === 'BLOCKED')?._count ?? 0;

        await prisma.campaign.update({
          where: { id: campaignId },
          data: {
            status: pendingMessages > 0 ? 'PAUSED' : 'COMPLETED',
            completedAt: pendingMessages > 0 ? null : new Date(),
            totalLeads: campaign._count.leads,
            totalSent: sent + delivered + failed + blocked,
            totalDelivered: delivered,
            totalFailed: failed,
            totalBlocked: blocked,
          },
        });
        logger.warn(
          `Campaign ${campaignId} queued 0 in this run; preserved stats from existing messages (${existingMessages})`,
        );
        return;
      }

      const reason =
        result.errors.length > 0
          ? result.errors.join('; ')
          : result.skipped > 0
            ? `All ${result.skipped} leads skipped (compliance/ownership rules)`
            : 'No messages could be queued';
      await prisma.campaign.update({
        where: { id: campaignId },
        data: {
          status: 'DRAFT',
          startedAt: null,
          totalLeads: campaign._count.leads,
          totalSent: 0,
        },
      });
      logger.warn(`Campaign ${campaignId} reverted to DRAFT: ${reason}`);
      return;
    }

    // Update campaign stats
    const totalAttempted = await prisma.message.count({
      where: { campaignId },
    });

    await prisma.campaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENDING',
        startedAt: new Date(),
        totalLeads: campaign._count.leads,
        // Keep this cumulative across resumes/restarts (never reset to only latest batch).
        totalSent: totalAttempted,
      },
    });

    logger.info(`Campaign ${campaignId} started: ${result.queued} queued, ${result.skipped} skipped`);
  } catch (error: any) {
    logger.error(`Campaign ${campaignId} start error:`, { error: error.message });
    throw error;
  }
}

async function processCampaignPause(campaignId: string): Promise<void> {
  await prisma.campaign.update({
    where: { id: campaignId },
    data: { status: 'PAUSED' },
  });

  logger.info(`Campaign ${campaignId} paused`);
}

logger.info('🚀 SMS Queue Worker started');
logger.info('🚀 Campaign Queue Worker started');
logger.info('🚀 CSV Import Queue Worker started');
logger.info('🚀 Lookup Retry Queue Worker started');

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('Shutting down workers...');
  await smsWorker.close();
  await campaignWorker.close();
  await csvImportWorker.close();
  await lookupRetryWorker.close();
  await csvImportQueue.close();
  await lookupErrorQueue.close();
});

export { smsWorker, campaignWorker, csvImportWorker, lookupRetryWorker };
