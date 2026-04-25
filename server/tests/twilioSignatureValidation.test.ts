import { describe, expect, it, vi } from 'vitest';
import {
  buildTwilioValidationUrl,
  getTwilioSignatureHeader,
  isTwilioSignatureValid,
  shouldSkipTwilioSignatureValidation,
} from '../src/webhooks/twilioSignatureValidation';

describe('twilioSignatureValidation helpers', () => {
  it('skips signature validation only in development without token', () => {
    expect(shouldSkipTwilioSignatureValidation('development', '')).toBe(true);
    expect(shouldSkipTwilioSignatureValidation('development', 'token')).toBe(false);
    expect(shouldSkipTwilioSignatureValidation('production', '')).toBe(false);
  });

  it('normalizes signature header', () => {
    expect(getTwilioSignatureHeader('  abc123  ')).toBe('abc123');
    expect(getTwilioSignatureHeader('   ')).toBeNull();
    expect(getTwilioSignatureHeader(undefined)).toBeNull();
  });

  it('builds validation url from base and original url', () => {
    expect(buildTwilioValidationUrl('https://api.example.com', '/api/webhooks/twilio/inbound')).toBe(
      'https://api.example.com/api/webhooks/twilio/inbound',
    );
  });

  it('calls validator with expected arguments', () => {
    const validator = vi.fn().mockReturnValue(true);

    const result = isTwilioSignatureValid(
      'auth-token',
      'sig-value',
      'https://api.example.com/api/webhooks/twilio/inbound',
      { Body: 'hello' },
      validator,
    );

    expect(result).toBe(true);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(validator).toHaveBeenCalledWith(
      'auth-token',
      'sig-value',
      'https://api.example.com/api/webhooks/twilio/inbound',
      { Body: 'hello' },
    );
  });
});
