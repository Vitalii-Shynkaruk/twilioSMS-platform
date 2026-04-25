import { describe, expect, it } from 'vitest';
import { isRepOrTestPhoneNumber, parseRepTestPhoneAllowlist } from '../src/services/inboundPhoneSuppression';

describe('inboundPhoneSuppression', () => {
  it('normalizes allowlist with mixed separators and formats', () => {
    const list = parseRepTestPhoneAllowlist('+1 (646) 248-2055, +13105551234\n404-555-9988');
    expect(list).toContain('16462482055');
    expect(list).toContain('6462482055');
    expect(list).toContain('13105551234');
    expect(list).toContain('3105551234');
    expect(list).toContain('4045559988');
    expect(list).toContain('14045559988');
  });

  it('returns false for empty input number', () => {
    expect(isRepOrTestPhoneNumber('', ['16462482055'])).toBe(false);
  });

  it('matches number regardless of +1/local format', () => {
    const suppressed = ['16462482055', '3105551234'];
    expect(isRepOrTestPhoneNumber('+1 (646) 248-2055', suppressed)).toBe(true);
    expect(isRepOrTestPhoneNumber('6462482055', suppressed)).toBe(true);
    expect(isRepOrTestPhoneNumber('+13105551234', suppressed)).toBe(true);
    expect(isRepOrTestPhoneNumber('13105551234', suppressed)).toBe(true);
  });

  it('does not match unrelated numbers', () => {
    const suppressed = ['16462482055', '13105551234'];
    expect(isRepOrTestPhoneNumber('+18005550199', suppressed)).toBe(false);
  });
});
