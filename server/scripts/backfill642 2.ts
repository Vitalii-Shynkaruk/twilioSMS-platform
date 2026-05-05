import 'dotenv/config';
import { readFile, mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { parse } from 'csv-parse/sync';
import prisma from '../src/config/database';
import logger from '../src/config/logger';
import { AIService } from '../src/services/aiService';

type ValidationRow = {
  conversationId: string;
};

function buildAiPersistence(signals: Record<string, unknown>) {
  return {
    extractedIndustry: typeof signals.industry === 'string' && signals.industry.trim() ? signals.industry.trim() : null,
    helocFitFlag: typeof signals.helocFitFlag === 'boolean' ? signals.helocFitFlag : null,
    extractedRevenue: typeof signals.revenueMonthly === 'number' ? Math.round(signals.revenueMonthly) : null,
    extractedAsk: typeof signals.ask === 'string' && signals.ask.trim() ? signals.ask.trim() : null,
  };
}

async function run() {
  const dryRun = process.argv.includes('--dry-run');
  const databaseUrl = process.env.DATABASE_URL || '';
  if (!databaseUrl.startsWith('mysql://')) {
    throw new Error('DATABASE_URL must start with mysql:// for backfill642');
  }
  const validationPath = path.resolve(process.cwd(), '..', 'SCL-HandOff', 'validation_642.csv');
  const outputDir = path.resolve(process.cwd(), '..', 'logs', 'backfill');
  const csv = await readFile(validationPath, 'utf-8');
  const rows = parse(csv, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  }) as ValidationRow[];

  const conversationIds = rows.map((row) => row.conversationId).filter(Boolean);

  const summary = {
    startedAt: new Date().toISOString(),
    dryRun,
    totalRows: conversationIds.length,
    processed: 0,
    classified: 0,
    skipped: 0,
    missing: 0,
    failed: 0,
    failures: [] as Array<{ conversationId: string; error: string }>,
  };

  logger.info('Backfill642 started', { total: conversationIds.length, dryRun });

  for (const conversationId of conversationIds) {
    summary.processed += 1;
    try {
      const existing = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true },
      });
      if (!existing) {
        summary.missing += 1;
        continue;
      }

      if (dryRun) {
        summary.skipped += 1;
        continue;
      }

      const ai = await AIService.classifyInbound(conversationId);
      if (!ai) {
        summary.skipped += 1;
        continue;
      }

      const persistedSignals: Record<string, unknown> = {
        ...(ai.signals as Record<string, unknown>),
        classifierPromptVersion: ai.promptVersion,
        reclassificationReason: 'backfill_642',
      };
      const aiPersistence = buildAiPersistence(persistedSignals);

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          aiClassification: ai.classification,
          aiSignals: persistedSignals as object,
          aiSuggestions: ai.suggestions as object,
          ...aiPersistence,
          isCaliforniaNumber: ai.isCaliforniaNumber,
          aiLeadScore: ai.leadScore,
          aiClassifiedAt: new Date(),
        },
      });

      await prisma.conversationAudit.create({
        data: {
          conversationId,
          eventType: 'ai_state_changed',
          source: 'backfill_642',
          newValue: {
            aiClassification: ai.classification,
            aiLeadScore: ai.leadScore,
            promptVersion: ai.promptVersion,
          },
        },
      });

      summary.classified += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        conversationId,
        error: (error as Error).message,
      });
    }
  }

  summary.startedAt = summary.startedAt;

  await mkdir(outputDir, { recursive: true });
  const filename = `backfill-642-report-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const outputPath = path.join(outputDir, filename);
  await writeFile(outputPath, JSON.stringify(summary, null, 2), 'utf-8');

  logger.info('Backfill642 completed', {
    report: outputPath,
    processed: summary.processed,
    classified: summary.classified,
    skipped: summary.skipped,
    missing: summary.missing,
    failed: summary.failed,
  });

  console.log(JSON.stringify({ report: outputPath, summary }, null, 2));
}

run()
  .catch((error) => {
    logger.error('Backfill642 failed', { error: (error as Error).message });
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
