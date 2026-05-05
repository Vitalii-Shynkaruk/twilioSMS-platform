import { describe, expect, it } from 'vitest';
import { resolveClassifierPromptVersion } from '../src/services/aiService';

describe('resolveClassifierPromptVersion', () => {
  it('returns fallback when value is empty', () => {
    expect(resolveClassifierPromptVersion('')).toBe('v4_locked');
    expect(resolveClassifierPromptVersion('   ')).toBe('v4_locked');
    expect(resolveClassifierPromptVersion(null)).toBe('v4_locked');
    expect(resolveClassifierPromptVersion(undefined)).toBe('v4_locked');
  });

  it('returns trimmed configured version', () => {
    expect(resolveClassifierPromptVersion(' v4_LOCKED ')).toBe('v4_LOCKED');
  });
});
