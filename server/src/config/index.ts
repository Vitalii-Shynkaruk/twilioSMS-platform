import dotenv from 'dotenv';
dotenv.config();

import { env } from './env';

export const config = {
  env: env.NODE_ENV,
  port: env.PORT,
  clientUrl: env.CLIENT_URL,

  database: {
    url: env.DATABASE_URL,
  },

  redis: {
    url: env.REDIS_URL,
  },

  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
    refreshSecret: env.JWT_REFRESH_SECRET,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  },

  // Alias for backward compatibility
  get jwtSecret() {
    return this.jwt.secret;
  },

  twilio: {
    accountSid: env.TWILIO_ACCOUNT_SID,
    authToken: env.TWILIO_AUTH_TOKEN,
    messagingServiceSid: env.TWILIO_MESSAGING_SERVICE_SID,
  },

  webhookBaseUrl: env.WEBHOOK_BASE_URL,

  sms: {
    maxDailyPerNumber: env.MAX_DAILY_MESSAGES_PER_NUMBER,
    maxPerMinute: env.MAX_MESSAGES_PER_MINUTE,
    rampUpEnabled: env.RAMP_UP_ENABLED === 'true',
    rampSchedule: [
      parseInt(process.env.RAMP_DAY_1_LIMIT || '50', 10),
      parseInt(process.env.RAMP_DAY_2_LIMIT || '100', 10),
      parseInt(process.env.RAMP_DAY_3_LIMIT || '150', 10),
      parseInt(process.env.RAMP_DAY_4_LIMIT || '200', 10),
      parseInt(process.env.RAMP_DAY_5_LIMIT || '250', 10),
      parseInt(process.env.RAMP_DAY_6_LIMIT || '300', 10),
      parseInt(process.env.RAMP_DAY_7_LIMIT || '350', 10),
    ],
    // Anti-blocking features
    jitterPercent: env.SMS_JITTER_PERCENT,
    spintaxEnabled: env.SPINTAX_ENABLED !== 'false',
    circuitBreakerThreshold: env.CIRCUIT_BREAKER_THRESHOLD,
    deliveryRateThrottleAt: env.DELIVERY_RATE_THROTTLE_AT,
    timeDistributionEnabled: env.TIME_DISTRIBUTION_ENABLED !== 'false',
    businessHoursStart: env.BUSINESS_HOURS_START,
    businessHoursEnd: env.BUSINESS_HOURS_END,
  },

  compliance: {
    quietHoursStart: env.COMPLIANCE_QUIET_HOURS_START,
    quietHoursEnd: env.COMPLIANCE_QUIET_HOURS_END,
    timezone: env.COMPLIANCE_TIMEZONE,
    supportPhone: env.SUPPORT_PHONE,
  },

  admin: {
    email: env.ADMIN_EMAIL,
    password: env.ADMIN_PASSWORD,
    firstName: env.ADMIN_FIRST_NAME,
    lastName: env.ADMIN_LAST_NAME,
  },

  logging: {
    level: env.LOG_LEVEL || (env.NODE_ENV === 'production' ? 'info' : 'debug'),
  },
};
