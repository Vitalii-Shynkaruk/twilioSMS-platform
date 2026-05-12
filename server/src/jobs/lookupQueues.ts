import { Queue } from 'bullmq';
import redis from '../config/redis';

export interface LookupRetryJobData {
  leadId: string;
  phone: string;
  requestedByUserId?: string | null;
}

export interface CsvImportJobData {
  importJobId: string;
}

export const lookupErrorQueue = new Queue<LookupRetryJobData>('lookup-error-retry', {
  connection: redis,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'fixed', delay: 24 * 60 * 60 * 1000 },
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 10000 },
    removeOnFail: { age: 30 * 24 * 60 * 60 },
  },
});

export const csvImportQueue = new Queue<CsvImportJobData>('csv-import', {
  connection: redis,
  defaultJobOptions: {
    attempts: 1,
    removeOnComplete: { age: 7 * 24 * 60 * 60, count: 1000 },
    removeOnFail: { age: 30 * 24 * 60 * 60 },
  },
});
