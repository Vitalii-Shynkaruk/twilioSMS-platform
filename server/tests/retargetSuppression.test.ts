import { describe, expect, it } from 'vitest';
import { shouldSuppressRetargetForRecentInbound } from '../src/services/retargetSuppression';

describe('shouldSuppressRetargetForRecentInbound', () => {
  const now = new Date('2026-04-25T12:00:00.000Z');

  it('returns true when inbound happened inside 7-day window', () => {
    const recent = new Date('2026-04-22T10:00:00.000Z');
    expect(shouldSuppressRetargetForRecentInbound(recent, now, 7)).toBe(true);
  });

  it('returns true on exact cutoff boundary', () => {
    const boundary = new Date('2026-04-18T12:00:00.000Z');
    expect(shouldSuppressRetargetForRecentInbound(boundary, now, 7)).toBe(true);
  });

  it('returns false when inbound is older than 7 days', () => {
    const old = new Date('2026-04-17T11:59:59.000Z');
    expect(shouldSuppressRetargetForRecentInbound(old, now, 7)).toBe(false);
  });

  it('returns false for empty or invalid timestamp', () => {
    expect(shouldSuppressRetargetForRecentInbound(null, now, 7)).toBe(false);
    expect(shouldSuppressRetargetForRecentInbound(undefined, now, 7)).toBe(false);
    expect(shouldSuppressRetargetForRecentInbound('not-a-date', now, 7)).toBe(false);
  });
});
