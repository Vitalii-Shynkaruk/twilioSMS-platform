import { describe, expect, it } from 'vitest';
import { OtpChannel } from '@prisma/client';
import {
  getOtpRateLimitStatus,
  maskOtpDestination,
  normalizeOtpEmail,
  normalizeOtpPhone,
} from '../src/services/authOtpPolicy';

describe('OTP policy', () => {
  it('должен нормализовать email без учета регистра и пробелов', () => {
    expect(normalizeOtpEmail('  Admin@SCLCapital.io ')).toBe('admin@sclcapital.io');
  });

  it('должен приводить американский телефон к E.164', () => {
    expect(normalizeOtpPhone('(310) 555-1212')).toBe('+13105551212');
    expect(normalizeOtpPhone('1 310 555 1212')).toBe('+13105551212');
  });

  it('должен маскировать SMS и email назначения', () => {
    expect(maskOtpDestination(OtpChannel.SMS, '+13105551212')).toBe('*** *** 1212');
    expect(maskOtpDestination(OtpChannel.EMAIL, 'admin@sclcapital.io')).toBe('an***@sclcapital.io');
  });

  it('должен блокировать четвертую отправку кода в пределах часа', () => {
    const now = new Date('2026-05-02T12:30:00.000Z');
    const status = getOtpRateLimitStatus(
      [
        new Date('2026-05-02T12:00:00.000Z'),
        new Date('2026-05-02T12:10:00.000Z'),
        new Date('2026-05-02T12:20:00.000Z'),
      ],
      now,
    );

    expect(status.blocked).toBe(true);
    expect(status.retryAfterSeconds).toBe(1800);
    expect(status.retryAt?.toISOString()).toBe('2026-05-02T13:00:00.000Z');
  });

  it('должен разрешать отправку после часового окна', () => {
    const status = getOtpRateLimitStatus(
      [
        new Date('2026-05-02T12:00:00.000Z'),
        new Date('2026-05-02T12:10:00.000Z'),
        new Date('2026-05-02T12:20:00.000Z'),
      ],
      new Date('2026-05-02T13:01:00.000Z'),
    );

    expect(status.blocked).toBe(false);
  });
});
