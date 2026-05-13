import { existsSync } from 'fs';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { DealStage, MessageDirection, PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

import {
  DEAL_LAST_REPLY_BACKFILL_SOURCE,
  type DealLastReplyBackfillSource,
  selectDealLastReplyBackfill,
} from '../src/services/dealLastReplyBackfillService';

const prisma = new PrismaClient();
const INACTIVE_DEAL_STAGES = new Set<DealStage>([DealStage.FUNDED, DealStage.CLOSED]);

for (const envPath of [path.resolve(process.cwd(), '.env'), path.resolve(process.cwd(), '../.env')]) {
  if (!existsSync(envPath)) continue;
  dotenv.config({ path: envPath, override: false });
}

type ScriptOptions = {
  readonly apply: boolean;
  readonly activeOnly: boolean;
  readonly limit: number | null;
  readonly dealId: string | null;
};

type DealRow = {
  id: string;
  stage: DealStage;
  leadId: string | null;
  smsConversationId: string | null;
  client: {
    phone: string | null;
  };
  lead: {
    id: string;
    lastRepliedAt: Date | null;
    conversations: Array<{ id: string }>;
  } | null;
};

type LeadLookupRow = {
  id: string;
  lastRepliedAt: Date | null;
  conversations: Array<{ id: string }>;
};

type ReportSample = {
  readonly dealId: string;
  readonly stage: DealStage;
  readonly source: DealLastReplyBackfillSource;
  readonly lastReplyAt: string;
};

function buildSourceCounts(): Record<DealLastReplyBackfillSource, number> {
  return Object.values(DEAL_LAST_REPLY_BACKFILL_SOURCE).reduce(
    (counts, source) => {
      counts[source] = 0;
      return counts;
    },
    {} as Record<DealLastReplyBackfillSource, number>,
  );
}

function parseArgs(): ScriptOptions {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const activeOnly = args.includes('--active-only');

  const limitArg = args.find((arg) => arg.startsWith('--limit='));
  const dealIdArg = args.find((arg) => arg.startsWith('--deal-id='));

  const limit = limitArg ? Number(limitArg.split('=')[1]) : null;
  const dealId = dealIdArg ? dealIdArg.slice('--deal-id='.length) : null;

  if (limitArg && (!Number.isInteger(limit) || (limit as number) <= 0)) {
    throw new Error('--limit must be a positive integer');
  }

  return {
    apply,
    activeOnly,
    limit,
    dealId,
  };
}

function isActiveDealStage(stage: DealStage): boolean {
  return !INACTIVE_DEAL_STAGES.has(stage);
}

async function findLatestInboundAt(conversationId: string): Promise<Date | null> {
  const latestMessage = await prisma.message.findFirst({
    where: {
      conversationId,
      direction: MessageDirection.INBOUND,
    },
    orderBy: [{ createdAt: 'desc' }],
    select: {
      createdAt: true,
      sentAt: true,
    },
  });

  return latestMessage?.createdAt || latestMessage?.sentAt || null;
}

async function findLeadByPhone(phone: string): Promise<LeadLookupRow | null> {
  return prisma.lead.findUnique({
    where: { phone },
    select: {
      id: true,
      lastRepliedAt: true,
      conversations: {
        take: 1,
        select: { id: true },
      },
    },
  });
}

async function resolveBackfillSelection(deal: DealRow) {
  const candidates = [];

  if (deal.lead?.lastRepliedAt) {
    candidates.push({
      source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_LEAD_LAST_REPLIED_AT,
      at: deal.lead.lastRepliedAt,
    });
  }

  if (deal.smsConversationId) {
    const latestDealConversationInbound = await findLatestInboundAt(deal.smsConversationId);
    candidates.push({
      source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_CONVERSATION_LATEST_INBOUND,
      at: latestDealConversationInbound,
    });
  }

  const linkedLeadConversationId = deal.lead?.conversations[0]?.id || null;
  if (linkedLeadConversationId && linkedLeadConversationId !== deal.smsConversationId) {
    const latestLinkedLeadInbound = await findLatestInboundAt(linkedLeadConversationId);
    candidates.push({
      source: DEAL_LAST_REPLY_BACKFILL_SOURCE.DEAL_CONVERSATION_LATEST_INBOUND,
      at: latestLinkedLeadInbound,
    });
  }

  const clientPhone = deal.client.phone?.trim() || null;
  if (!deal.leadId && clientPhone) {
    const phoneMatchedLead = await findLeadByPhone(clientPhone);

    if (phoneMatchedLead?.lastRepliedAt) {
      candidates.push({
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.PHONE_MATCHED_LEAD_LAST_REPLIED_AT,
        at: phoneMatchedLead.lastRepliedAt,
      });
    }

    const phoneMatchedConversationId = phoneMatchedLead?.conversations[0]?.id || null;
    if (
      phoneMatchedConversationId &&
      phoneMatchedConversationId !== deal.smsConversationId &&
      phoneMatchedConversationId !== linkedLeadConversationId
    ) {
      const latestPhoneMatchedInbound = await findLatestInboundAt(phoneMatchedConversationId);
      candidates.push({
        source: DEAL_LAST_REPLY_BACKFILL_SOURCE.PHONE_MATCHED_LEAD_CONVERSATION_LATEST_INBOUND,
        at: latestPhoneMatchedInbound,
      });
    }
  }

  return selectDealLastReplyBackfill(candidates);
}

async function run(): Promise<void> {
  const options = parseArgs();
  const databaseUrl = process.env.DATABASE_URL || '';

  if (!databaseUrl.startsWith('mysql://')) {
    throw new Error('DATABASE_URL must start with mysql:// for deal lastReplyAt backfill');
  }

  const outputDir = path.resolve(process.cwd(), '..', 'logs', 'backfill');
  const deals = await prisma.deal.findMany({
    where: {
      lastReplyAt: null,
      ...(options.dealId ? { id: options.dealId } : {}),
      ...(options.activeOnly ? { stage: { notIn: [DealStage.FUNDED, DealStage.CLOSED] } } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
    ...(options.limit ? { take: options.limit } : {}),
    select: {
      id: true,
      stage: true,
      leadId: true,
      smsConversationId: true,
      client: {
        select: {
          phone: true,
        },
      },
      lead: {
        select: {
          id: true,
          lastRepliedAt: true,
          conversations: {
            take: 1,
            select: { id: true },
          },
        },
      },
    },
  });

  const summary = {
    startedAt: new Date().toISOString(),
    dryRun: !options.apply,
    activeOnly: options.activeOnly,
    limit: options.limit,
    dealId: options.dealId,
    scanned: deals.length,
    scannedActive: deals.filter((deal) => isActiveDealStage(deal.stage)).length,
    updated: 0,
    updatedActive: 0,
    skippedNoSource: 0,
    skippedRace: 0,
    failed: 0,
    sourceCounts: buildSourceCounts(),
    samples: [] as ReportSample[],
    failures: [] as Array<{ dealId: string; error: string }>,
  };

  console.log(
    JSON.stringify(
      {
        message: 'deal lastReplyAt backfill started',
        dryRun: summary.dryRun,
        scanned: summary.scanned,
        activeOnly: summary.activeOnly,
        limit: summary.limit,
        dealId: summary.dealId,
      },
      null,
      2,
    ),
  );

  for (const deal of deals) {
    try {
      const selection = await resolveBackfillSelection(deal);

      if (!selection) {
        summary.skippedNoSource += 1;
        continue;
      }

      if (summary.samples.length < 25) {
        summary.samples.push({
          dealId: deal.id,
          stage: deal.stage,
          source: selection.source,
          lastReplyAt: selection.at.toISOString(),
        });
      }

      if (!options.apply) {
        summary.updated += 1;
        summary.sourceCounts[selection.source] += 1;
        if (isActiveDealStage(deal.stage)) {
          summary.updatedActive += 1;
        }
        continue;
      }

      const updated = await prisma.deal.updateMany({
        where: {
          id: deal.id,
          lastReplyAt: null,
        },
        data: {
          lastReplyAt: selection.at,
        },
      });

      if (updated.count === 0) {
        summary.skippedRace += 1;
        continue;
      }

      summary.updated += 1;
      summary.sourceCounts[selection.source] += 1;
      if (isActiveDealStage(deal.stage)) {
        summary.updatedActive += 1;
      }
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        dealId: deal.id,
        error: (error as Error).message,
      });
    }
  }

  await mkdir(outputDir, { recursive: true });
  const filename = `deal-last-reply-backfill-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const outputPath = path.join(outputDir, filename);
  await writeFile(outputPath, JSON.stringify(summary, null, 2), 'utf-8');

  console.log(
    JSON.stringify(
      {
        message: 'deal lastReplyAt backfill completed',
        report: outputPath,
        summary,
      },
      null,
      2,
    ),
  );
}

run()
  .catch((error) => {
    console.error('[deal-last-reply-backfill] failed');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
