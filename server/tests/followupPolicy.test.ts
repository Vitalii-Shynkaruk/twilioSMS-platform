import { describe, expect, it } from 'vitest';
import { buildSuggestedFollowup, resolveFollowupStatus } from '../src/services/followupPolicy';

describe('followupPolicy', () => {
  const now = new Date('2026-04-28T15:00:00.000Z');

  it('sets HOT same-day urgency to 2 hours from now', () => {
    const result = buildSuggestedFollowup({
      classification: 'HOT',
      signals: { urgency: 'today', ask: '$250k' },
      now,
    });

    expect(result.time?.toISOString()).toBe('2026-04-28T17:00:00.000Z');
    expect(result.status).toBe('scheduled');
    expect(result.reason).toContain('2 hours');
    expect(result.reason).toContain('$250k');
  });

  it('sets regular HOT to tomorrow 9 AM UTC', () => {
    const result = buildSuggestedFollowup({ classification: 'HOT', signals: { ask: '$250k' }, now });

    expect(result.time?.toISOString()).toBe('2026-04-29T09:00:00.000Z');
    expect(result.status).toBe('scheduled');
  });

  it('sets WARM to next morning when within 24 hours', () => {
    const result = buildSuggestedFollowup({ classification: 'WARM', now });

    expect(result.time?.toISOString()).toBe('2026-04-29T09:00:00.000Z');
    expect(result.status).toBe('scheduled');
  });

  it('sets WARM to 24 hours when next morning is later than 24 hours', () => {
    const early = new Date('2026-04-28T02:00:00.000Z');
    const result = buildSuggestedFollowup({ classification: 'WARM', now: early });

    expect(result.time?.toISOString()).toBe('2026-04-29T02:00:00.000Z');
    expect(result.status).toBe('scheduled');
  });

  it('sets SENSITIVE to next Monday 9 AM UTC', () => {
    const result = buildSuggestedFollowup({ classification: 'HOT', conversationState: 'SENSITIVE', now });

    expect(result.time?.toISOString()).toBe('2026-05-04T09:00:00.000Z');
    expect(result.reason).toContain('Sensitive');
  });

  it('sets NURTURE to 3 days at 9 AM UTC', () => {
    const result = buildSuggestedFollowup({ classification: 'NURTURE', now });

    expect(result.time?.toISOString()).toBe('2026-05-01T09:00:00.000Z');
    expect(result.status).toBe('scheduled');
  });

  it('clears follow-up for DEAD and wrong-number conversations', () => {
    expect(buildSuggestedFollowup({ classification: 'DEAD', now }).status).toBe('cleared');
    expect(buildSuggestedFollowup({ classification: 'WRONG_NUMBER', now }).time).toBeNull();
  });

  it('clears follow-up for null or invalid classifications', () => {
    expect(buildSuggestedFollowup({ classification: null, now }).status).toBe('cleared');
    expect(buildSuggestedFollowup({ classification: 'UNKNOWN', now }).time).toBeNull();
  });

  it('resolves manual follow-up statuses', () => {
    expect(resolveFollowupStatus(new Date('2026-04-28T14:00:00.000Z'), null, now)).toBe('due_now');
    expect(resolveFollowupStatus(new Date('2026-04-28T16:00:00.000Z'), null, now)).toBe('scheduled');
    expect(resolveFollowupStatus(null, null, now)).toBe('cleared');
    expect(resolveFollowupStatus(new Date('2026-04-28T16:00:00.000Z'), 'completed', now)).toBe('completed');
  });
});
