import { describe, expect, it } from 'vitest';
import { isWithinQuietHoursWindow } from '../src/services/quietHoursWindow';

describe('isWithinQuietHoursWindow', () => {
  it('handles overnight quiet hours window', () => {
    expect(isWithinQuietHoursWindow(21, 20, 9)).toBe(true);
    expect(isWithinQuietHoursWindow(8, 20, 9)).toBe(true);
    expect(isWithinQuietHoursWindow(12, 20, 9)).toBe(false);
  });

  it('handles same-day quiet hours window', () => {
    expect(isWithinQuietHoursWindow(10, 9, 18)).toBe(true);
    expect(isWithinQuietHoursWindow(18, 9, 18)).toBe(false);
    expect(isWithinQuietHoursWindow(7, 9, 18)).toBe(false);
  });

  it('keeps start boundary inclusive and end boundary exclusive', () => {
    expect(isWithinQuietHoursWindow(9, 9, 17)).toBe(true);
    expect(isWithinQuietHoursWindow(17, 9, 17)).toBe(false);
  });
});
