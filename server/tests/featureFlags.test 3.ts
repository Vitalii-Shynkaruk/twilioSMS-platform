import { describe, expect, it } from 'vitest';
import { isFeatureFlagEnabled } from '../src/config/featureFlags';

describe('isFeatureFlagEnabled', () => {
  it('returns default when value is missing', () => {
    expect(isFeatureFlagEnabled(undefined, false)).toBe(false);
    expect(isFeatureFlagEnabled(undefined, true)).toBe(true);
  });

  it('parses enabled values', () => {
    expect(isFeatureFlagEnabled('true')).toBe(true);
    expect(isFeatureFlagEnabled('1')).toBe(true);
    expect(isFeatureFlagEnabled('YES')).toBe(true);
    expect(isFeatureFlagEnabled('on')).toBe(true);
  });

  it('parses disabled values', () => {
    expect(isFeatureFlagEnabled('false', true)).toBe(false);
    expect(isFeatureFlagEnabled('0', true)).toBe(false);
    expect(isFeatureFlagEnabled('off', true)).toBe(false);
  });
});
