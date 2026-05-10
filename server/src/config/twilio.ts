import Twilio from 'twilio';
import { config } from './index';
import prisma from './database';
import redis from './redis';

let _client: ReturnType<typeof Twilio> | null = null;
let _testClient: ReturnType<typeof Twilio> | null = null;
let _liveSid: string | null = null;
let _liveToken: string | null = null;

export async function getLiveCredentials(): Promise<{ sid: string; token: string } | null> {
  try {
    const cachedSid = await redis.get('setting:twilioAccountSid');
    const cachedToken = await redis.get('setting:twilioAuthToken');

    if (cachedSid && cachedToken) {
      return { sid: cachedSid, token: cachedToken };
    }

    const [sidSetting, tokenSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'twilioAccountSid' } }),
      prisma.systemSetting.findUnique({ where: { key: 'twilioAuthToken' } }),
    ]);

    const sid = (typeof sidSetting?.value === 'string' ? sidSetting.value : '') as string;
    const token = (typeof tokenSetting?.value === 'string' ? tokenSetting.value : '') as string;

    if (sid && token) {
      await redis.set('setting:twilioAccountSid', sid, 'EX', 30);
      await redis.set('setting:twilioAuthToken', token, 'EX', 30);
      return { sid, token };
    }

    const envSid = config.twilio.accountSid;
    const envToken = config.twilio.authToken;
    if (envSid && envToken) {
      return { sid: envSid, token: envToken };
    }

    return null;
  } catch {
    const envSid = config.twilio.accountSid;
    const envToken = config.twilio.authToken;
    if (envSid && envToken) {
      return { sid: envSid, token: envToken };
    }
    return null;
  }
}

export async function getActiveMessagingServiceSid(): Promise<string | null> {
  try {
    const cached = await redis.get('setting:twilioMessagingServiceSid');
    if (cached !== null) {
      const sid = cached.trim();
      return sid || null;
    }

    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'twilioMessagingServiceSid' },
    });
    const sid = typeof setting?.value === 'string' ? setting.value.trim() : '';
    if (sid) {
      await redis.set('setting:twilioMessagingServiceSid', sid, 'EX', 30);
      return sid;
    }

    const envSid = config.twilio.messagingServiceSid?.trim();
    return envSid || null;
  } catch {
    const envSid = config.twilio.messagingServiceSid?.trim();
    return envSid || null;
  }
}

function getTwilioClient() {
  if (!_client) {
    const sid = _liveSid || config.twilio.accountSid;
    const token = _liveToken || config.twilio.authToken;
    if (!sid || !sid.startsWith('AC') || !token) {
      console.warn('⚠️  Twilio credentials not configured – SMS sending disabled');
      return null;
    }
    _client = Twilio(sid, token);
  }
  return _client;
}

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

async function isTwilioTestMode(): Promise<boolean> {
  return (await getSmsMode()) === 'twilio_test';
}

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

async function getActiveTwilioClient(): Promise<ReturnType<typeof Twilio> | null> {
  const testMode = await isTwilioTestMode();

  if (testMode) {
    const creds = await getTestCredentials();
    if (creds && creds.sid.startsWith('AC') && creds.token) {
      if (!_testClient) {
        _testClient = Twilio(creds.sid, creds.token);
      }
      return _testClient;
    }
    console.warn('⚠️  Twilio Test Mode enabled but test credentials not configured — falling back to live');
  }

  const liveCreds = await getLiveCredentials();
  if (liveCreds && liveCreds.sid.startsWith('AC') && liveCreds.token) {
    if (_liveSid !== liveCreds.sid || _liveToken !== liveCreds.token) {
      _liveSid = liveCreds.sid;
      _liveToken = liveCreds.token;
      _client = null;
    }
    if (!_client) {
      _client = Twilio(liveCreds.sid, liveCreds.token);
    }
    return _client;
  }

  return getTwilioClient();
}

function resetTwilioClients() {
  _client = null;
  _testClient = null;
  _liveSid = null;
  _liveToken = null;
}

export default getTwilioClient;
export { getActiveTwilioClient, getSmsMode, isTwilioTestMode, resetTwilioClients };
