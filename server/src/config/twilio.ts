import Twilio from 'twilio';
import { config } from './index';
import prisma from './database';
import redis from './redis';

let _client: ReturnType<typeof Twilio> | null = null;
let _testClient: ReturnType<typeof Twilio> | null = null;

/**
 * Get the standard (live) Twilio client.
 * Uses credentials from .env / config.
 */
function getTwilioClient() {
  if (!_client) {
    const sid = config.twilio.accountSid;
    const token = config.twilio.authToken;
    if (!sid || !sid.startsWith('AC') || !token) {
      console.warn('⚠️  Twilio credentials not configured – SMS sending disabled');
      return null;
    }
    _client = Twilio(sid, token);
  }
  return _client;
}

/**
 * Get current SMS mode from DB/Redis: 'live' | 'twilio_test' | 'simulation'
 */
async function getSmsMode(): Promise<string> {
  try {
    const cached = await redis.get('setting:smsMode');
    if (cached !== null) return cached;

    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'smsMode' },
    });
    const value = (typeof setting?.value === 'string' ? setting.value : 'live') as string;
    await redis.set('setting:smsMode', value, 'EX', 30);
    return value;
  } catch {
    return 'live';
  }
}

/**
 * Check if Twilio Test Mode is enabled.
 */
async function isTwilioTestMode(): Promise<boolean> {
  return (await getSmsMode()) === 'twilio_test';
}

/**
 * Get test credentials from DB settings (with Redis cache).
 */
async function getTestCredentials(): Promise<{ sid: string; token: string } | null> {
  try {
    const cachedSid = await redis.get('setting:twilioTestAccountSid');
    const cachedToken = await redis.get('setting:twilioTestAuthToken');

    if (cachedSid && cachedToken) {
      return { sid: cachedSid, token: cachedToken };
    }

    const [sidSetting, tokenSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'twilioTestAccountSid' } }),
      prisma.systemSetting.findUnique({ where: { key: 'twilioTestAuthToken' } }),
    ]);

    const sid = (typeof sidSetting?.value === 'string' ? sidSetting.value : '') as string;
    const token = (typeof tokenSetting?.value === 'string' ? tokenSetting.value : '') as string;

    if (sid && token) {
      await redis.set('setting:twilioTestAccountSid', sid, 'EX', 30);
      await redis.set('setting:twilioTestAuthToken', token, 'EX', 30);
      return { sid, token };
    }

    // Fallback to .env
    const envSid = process.env.TWILIO_TEST_ACCOUNT_SID || '';
    const envToken = process.env.TWILIO_TEST_AUTH_TOKEN || '';
    if (envSid && envToken) {
      return { sid: envSid, token: envToken };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Get the active Twilio client — returns test client when twilioTestMode is enabled.
 * Falls back to live client if test credentials are unavailable.
 */
async function getActiveTwilioClient(): Promise<ReturnType<typeof Twilio> | null> {
  const testMode = await isTwilioTestMode();

  if (testMode) {
    const creds = await getTestCredentials();
    if (creds && creds.sid.startsWith('AC') && creds.token) {
      // Re-create test client if credentials changed
      if (!_testClient) {
        _testClient = Twilio(creds.sid, creds.token);
      }
      return _testClient;
    }
    console.warn('⚠️  Twilio Test Mode enabled but test credentials not configured — falling back to live');
  }

  return getTwilioClient();
}

/** Reset cached clients (call when credentials change) */
function resetTwilioClients() {
  _client = null;
  _testClient = null;
}

export default getTwilioClient;
export { getActiveTwilioClient, isTwilioTestMode, getSmsMode, resetTwilioClients };
