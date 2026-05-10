import { AutomationService } from '../services/automationService';
import { NumberService } from '../services/numberService';
import { ScheduledMessageService } from '../services/scheduledMessageService';
import { config } from '../config';
import logger from '../config/logger';
import redis from '../config/redis';


const AUTOMATION_CHECK_INTERVAL = 60_000;

const DAILY_RESET_CHECK_INTERVAL = 300_000;

const LOCK_KEY = 'lock:automation-worker';
const LOCK_TTL = 55; // seconds — just under interval

function getBusinessDateKey(date: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: config.compliance.timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  return `${map.get('year')}-${map.get('month')}-${map.get('day')}`;
}

let lastResetDate = getBusinessDateKey(); // Init to today (business timezone)

async function acquireLock(key: string, ttl: number): Promise<boolean> {
  try {
    const result = await redis.set(key, process.pid.toString(), 'EX', ttl, 'NX');
    return result === 'OK';
  } catch {
    return true;
  }
}

async function releaseLock(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch {
  }
}

async function checkAndProcessAutomations(): Promise<void> {
  const locked = await acquireLock(LOCK_KEY, LOCK_TTL);
  if (!locked) {
    logger.debug('Automation lock held by another instance, skipping');
    return;
  }
  try {
    await AutomationService.processScheduledAutomations();
    await ScheduledMessageService.processDueMessages(100);
  } catch (error: any) {
    logger.error('Automation processing error:', { error: error.message });
  } finally {
    await releaseLock(LOCK_KEY);
  }
}

async function checkDailyReset(): Promise<void> {
  const today = getBusinessDateKey();

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

const automationInterval = setInterval(checkAndProcessAutomations, AUTOMATION_CHECK_INTERVAL);

const resetInterval = setInterval(checkDailyReset, DAILY_RESET_CHECK_INTERVAL);

NumberService.recalculateDailyCounts().catch((err) =>
  logger.error('Startup daily count recalculation failed:', { error: err.message }),
);

logger.info('🤖 Automation Worker started');
logger.info(`  Checking automations every ${AUTOMATION_CHECK_INTERVAL / 1000}s`);
logger.info(`  Checking daily reset every ${DAILY_RESET_CHECK_INTERVAL / 1000}s`);

export function stopAutomationWorker(): void {
  clearInterval(automationInterval);
  clearInterval(resetInterval);
  logger.info('Automation Worker stopped');
}

if (require.main === module) {
  process.on('SIGTERM', () => {
    logger.info('Shutting down automation worker...');
    stopAutomationWorker();
    process.exit(0);
  });
}
