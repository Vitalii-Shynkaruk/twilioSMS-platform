import { describe, expect, it } from 'vitest';
import { getProductionEnvValidationIssues } from '../src/config/env';

describe('getProductionEnvValidationIssues', () => {
  it('returns no issues outside production', () => {
    const issues = getProductionEnvValidationIssues({
      NODE_ENV: 'development',
      CLIENT_URL: 'http://localhost:5173',
      WEBHOOK_BASE_URL: 'http://localhost:3001',
    });

    expect(issues).toEqual([]);
  });

  it('returns issues for localhost urls in production', () => {
    const issues = getProductionEnvValidationIssues({
      NODE_ENV: 'production',
      CLIENT_URL: 'http://localhost:5173',
      WEBHOOK_BASE_URL: 'http://127.0.0.1:3001',
    });

    expect(issues).toHaveLength(2);
    expect(issues[0]).toContain('CLIENT_URL');
    expect(issues[1]).toContain('WEBHOOK_BASE_URL');
  });

  it('accepts non-local production urls', () => {
    const issues = getProductionEnvValidationIssues({
      NODE_ENV: 'production',
      CLIENT_URL: 'https://app.sclcapital.io',
      WEBHOOK_BASE_URL: 'https://api.sclcapital.io',
    });

    expect(issues).toEqual([]);
  });
});
