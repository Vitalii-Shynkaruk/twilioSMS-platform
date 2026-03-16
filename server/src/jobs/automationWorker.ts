import { AutomationService } from '../services/automationService';
import { NumberService } from '../services/numberService';
import logger from '../config/logger';
import redis from '../config/redis';

/**
 * Automation Worker
 * Runs periodically to:
 * 1. Process due follow-up sequences
 * 2. Reset daily number counters at midnight
 * 3. Execute scheduled automation rules
 * 
 * Uses distributed lock (Redis SETNX) to prevent duplicate processing
 * in multi-instance deployments.
 */

// Automation processing interval (every 60 seconds)
const AUTOMATION_CHECK_INTERVAL = 60_000;

// Daily reset interval check (every 5 minutes)
const DAILY_RESET_CHECK_INTERVAL = 300_000;

const LOCK_KEY = 'lock:automation-worker';
const LOCK_TTL = 55; // seconds — just under interval

let lastResetDate = '';

/** Acquire a distributed lock. Returns true if lock obtained. */
async function acquireLock(key: string, ttl: number): Promise<boolean> {
  try {
    const result = await redis.set(key, process.pid.toString(), 'EX', ttl, 'NX');
    return result === 'OK';
  } catch {
    // Redis down — allow processing as fallback (single-instance safe)
    return true;
  }
}

async function releaseLock(key: string): Promise<void> {
  try { await redis.del(key); } catch { /* non-fatal */ }
}

async function checkAndProcessAutomations(): Promise<void> {
  const locked = await acquireLock(LOCK_KEY, LOCK_TTL);
  if (!locked) {
    logger.debug('Automation lock held by another instance, skipping');
    return;
  }
  try {
    await AutomationService.processScheduledAutomations();
  } catch (error: any) {
    logger.error('Automation processing error:', { error: error.message });
  } finally {
    await releaseLock(LOCK_KEY);
  }
}

async function checkDailyReset(): Promise<void> {
  const today = new Date().toISOString().split('T')[0];

  if (today !== lastResetDate) {
    try {
      await NumberService.resetDailyCounters();
      lastResetDate = today;
      logger.info('Daily counters reset completed');
    } catch (error: any) {
      logger.error('Daily reset error:', { error: error.message });
    }
  }
}

// Start periodic processing
const automationInterval = setInterval(
  checkAndProcessAutomations,
  AUTOMATION_CHECK_INTERVAL
);

const resetInterval = setInterval(
  checkDailyReset,
  DAILY_RESET_CHECK_INTERVAL
);

logger.info('🤖 Automation Worker started');
logger.info(`  Checking automations every ${AUTOMATION_CHECK_INTERVAL / 1000}s`);
logger.info(`  Checking daily reset every ${DAILY_RESET_CHECK_INTERVAL / 1000}s`);

// Export cleanup function so main process can stop intervals on shutdown
export function stopAutomationWorker(): void {
  clearInterval(automationInterval);
  clearInterval(resetInterval);
  logger.info('Automation Worker stopped');
}

// Only handle SIGTERM if running standalone (not imported by index.ts)
if (require.main === module) {
  process.on('SIGTERM', () => {
    logger.info('Shutting down automation worker...');
    stopAutomationWorker();
    process.exit(0);
  });
}
