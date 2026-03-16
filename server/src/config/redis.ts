import Redis from 'ioredis';
import { config } from './index';
import logger from './logger';

export const redis = new Redis(config.redis.url, {
  maxRetriesPerRequest: null, // Required for BullMQ
  enableReadyCheck: false,
  retryStrategy(times) {
    // Exponential backoff: 50ms, 100ms, 200ms... up to 30s
    const delay = Math.min(times * 50, 30_000);
    logger.warn(`Redis reconnecting in ${delay}ms (attempt ${times})`);
    return delay;
  },
  reconnectOnError(err) {
    // Reconnect on READONLY errors (failover scenario)
    return err.message.includes('READONLY');
  },
});

redis.on('error', (err) => {
  logger.error('Redis connection error:', { error: err.message });
});

redis.on('connect', () => {
  logger.info('✅ Redis connected');
});

redis.on('close', () => {
  logger.warn('Redis connection closed');
});

export default redis;
