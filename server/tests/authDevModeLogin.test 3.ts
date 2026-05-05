import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isDevModeLoginEnabled, isDevModeLoginKeyValid } from '../src/services/authDevModeLoginService';

const rootDir = path.resolve(__dirname, '..', '..');

const readWorkspaceFile = (relativePath: string): string => {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
};

describe('Безопасный dev mode login', () => {
  it('должен включаться только явным flag и никогда в production', () => {
    expect(isDevModeLoginEnabled({ NODE_ENV: 'development', DEV_MODE_LOGIN_ENABLED: 'true' })).toBe(true);
    expect(isDevModeLoginEnabled({ NODE_ENV: 'test', DEV_MODE_LOGIN_ENABLED: 'true' })).toBe(true);
    expect(isDevModeLoginEnabled({ NODE_ENV: 'development', DEV_MODE_LOGIN_ENABLED: 'false' })).toBe(false);
    expect(isDevModeLoginEnabled({ NODE_ENV: 'production', DEV_MODE_LOGIN_ENABLED: 'true' })).toBe(false);
  });

  it('должен проверять optional dev key когда секрет задан', () => {
    expect(isDevModeLoginKeyValid(undefined, { DEV_MODE_LOGIN_SECRET: '' })).toBe(true);
    expect(isDevModeLoginKeyValid('local-secret', { DEV_MODE_LOGIN_SECRET: 'local-secret' })).toBe(true);
    expect(isDevModeLoginKeyValid('wrong-secret', { DEV_MODE_LOGIN_SECRET: 'local-secret' })).toBe(false);
  });

  it('должен держать backend route, refresh interceptor и frontend UI за dev-only флагом', () => {
    const authRoutes = readWorkspaceFile('server/src/routes/auth.ts');
    const apiClient = readWorkspaceFile('client/src/services/api.ts');
    const authStore = readWorkspaceFile('client/src/stores/authStore.ts');
    const loginPage = readWorkspaceFile('client/src/pages/LoginPage.tsx');

    expect(authRoutes).toContain("'/dev-login'");
    expect(apiClient).toContain("!url.includes('/auth/dev-login')");
    expect(authStore).toContain("'/auth/dev-login'");
    expect(loginPage).toContain('VITE_DEV_MODE_LOGIN_ENABLED');
    expect(loginPage).toContain('!import.meta.env.PROD');
    expect(loginPage).toContain('Dev mode login');
  });
});
