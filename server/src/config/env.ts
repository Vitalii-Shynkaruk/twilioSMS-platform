import { z } from 'zod';

/**
 * Zod-validated environment variables.
 * Fails fast at startup with clear error messages.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3001').transform(Number),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),

  // Database — required
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT — required in production
  JWT_SECRET: z.string().min(1, 'JWT_SECRET is required'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  JWT_REFRESH_SECRET: z.string().min(1, 'JWT_REFRESH_SECRET is required'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('30d'),

  // Twilio — optional in dev
  TWILIO_ACCOUNT_SID: z.string().default(''),
  TWILIO_AUTH_TOKEN: z.string().default(''),
  TWILIO_MESSAGING_SERVICE_SID: z.string().default(''),

  WEBHOOK_BASE_URL: z.string().default('http://localhost:3001'),

  // SMS config
  MAX_DAILY_MESSAGES_PER_NUMBER: z.string().default('350').transform(Number),
  MAX_MESSAGES_PER_MINUTE: z.string().default('300').transform(Number),
  RAMP_UP_ENABLED: z.string().default('false'),
  SMS_JITTER_PERCENT: z.string().default('40').transform(Number),
  SPINTAX_ENABLED: z.string().default('true'),
  CIRCUIT_BREAKER_THRESHOLD: z.string().default('30').transform(Number),
  DELIVERY_RATE_THROTTLE_AT: z.string().default('80').transform(Number),
  TIME_DISTRIBUTION_ENABLED: z.string().default('true'),
  BUSINESS_HOURS_START: z.string().default('9').transform(Number),
  BUSINESS_HOURS_END: z.string().default('18').transform(Number),

  // Compliance
  COMPLIANCE_QUIET_HOURS_START: z.string().default('20').transform(Number),
  COMPLIANCE_QUIET_HOURS_END: z.string().default('9').transform(Number),
  COMPLIANCE_TIMEZONE: z.string().default('America/New_York'),
  SUPPORT_PHONE: z.string().default('(786) 648-7512'),

  // Admin
  ADMIN_EMAIL: z.string().email().default('admin@securecreditlines.com'),
  ADMIN_PASSWORD: z.string().min(1).default('admin123'),
  ADMIN_FIRST_NAME: z.string().default('Admin'),
  ADMIN_LAST_NAME: z.string().default('SCL'),

  LOG_LEVEL: z.string().default(''),
});

function validateEnv() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    console.error('❌ Environment validation failed:');
    for (const issue of result.error.issues) {
      console.error(`   ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(1);
  }
  return result.data;
}

export const env = validateEnv();
