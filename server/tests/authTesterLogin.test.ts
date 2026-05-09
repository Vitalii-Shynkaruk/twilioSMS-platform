import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { config } from '../src/config';
import prisma from '../src/config/database';
import { AppError } from '../src/middleware/errorHandler';
import {
  AuthTesterLoginService,
  isTesterLoginCodeValid,
  isTesterLoginEnabled,
} from '../src/services/authTesterLoginService';

const rootDir = path.resolve(__dirname, '..', '..');

const readWorkspaceFile = (relativePath: string): string => {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
};

describe('Тестерский login', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    config.testerLogin.enabled = false;
    config.testerLogin.code = '';
  });

  it('должен включаться только явным flag', () => {
    expect(isTesterLoginEnabled({ TESTER_LOGIN_ENABLED: 'true' })).toBe(true);
    expect(isTesterLoginEnabled({ TESTER_LOGIN_ENABLED: 'false' })).toBe(false);
    expect(isTesterLoginEnabled({ TESTER_LOGIN_ENABLED: '' })).toBe(false);
  });

  it('должен принимать только точный tester code', () => {
    expect(isTesterLoginCodeValid('778241', { TESTER_LOGIN_CODE: '778241' })).toBe(true);
    expect(isTesterLoginCodeValid('778242', { TESTER_LOGIN_CODE: '778241' })).toBe(false);
    expect(isTesterLoginCodeValid('', { TESTER_LOGIN_CODE: '778241' })).toBe(false);
    expect(isTesterLoginCodeValid('778241', { TESTER_LOGIN_CODE: '' })).toBe(false);
  });

  it('должен держать backend route и config wiring для tester login', () => {
    const authRoutes = readWorkspaceFile('server/src/routes/auth.ts');
    const configFile = readWorkspaceFile('server/src/config/index.ts');
    const envFile = readWorkspaceFile('server/src/config/env.ts');
    const apiClient = readWorkspaceFile('client/src/services/api.ts');
    const authStore = readWorkspaceFile('client/src/stores/authStore.ts');
    const loginPage = readWorkspaceFile('client/src/pages/LoginPage.tsx');

    expect(authRoutes).toContain("'/tester-login'");
    expect(configFile).toContain('testerLogin');
    expect(envFile).toContain('TESTER_LOGIN_ENABLED');
    expect(envFile).toContain('TESTER_LOGIN_CODE');
    expect(apiClient).toContain("!url.includes('/auth/tester-login')");
    expect(authStore).toContain("'/auth/tester-login'");
    expect(loginPage).toContain('VITE_TESTER_LOGIN_ENABLED');
    expect(loginPage).toContain('Tester login');
  });

  it('должен логинить активного пользователя с валидным password и tester code', async () => {
    config.testerLogin.enabled = true;
    config.testerLogin.code = '778241';

    vi.spyOn(prisma.user, 'findUnique').mockResolvedValue({
      id: 'user-1',
      email: 'tester@sclcapital.io',
      firstName: 'QA',
      lastName: 'Tester',
      role: 'ADMIN',
      passwordHash: 'hash',
      isActive: true,
    } as never);
    vi.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
    vi.spyOn(prisma.user, 'update').mockResolvedValue({ id: 'user-1' } as never);

    await expect(
      AuthTesterLoginService.login({
        email: 'tester@sclcapital.io',
        password: 'TesterPass!2026',
        testerCode: '778241',
        requestId: 'req-1',
        ip: '127.0.0.1',
        userAgent: 'vitest',
      }),
    ).resolves.toMatchObject({
      email: 'tester@sclcapital.io',
      role: 'ADMIN',
    });
  });

  it('должен отклонять неверный tester code до проверки пользователя', async () => {
    config.testerLogin.enabled = true;
    config.testerLogin.code = '778241';

    const findUniqueSpy = vi.spyOn(prisma.user, 'findUnique');

    await expect(
      AuthTesterLoginService.login({
        email: 'tester@sclcapital.io',
        password: 'TesterPass!2026',
        testerCode: '000000',
        requestId: 'req-2',
        ip: '127.0.0.1',
        userAgent: 'vitest',
      }),
    ).rejects.toMatchObject<AppError>({
      message: 'Invalid tester login credentials',
      statusCode: 401,
    });

    expect(findUniqueSpy).not.toHaveBeenCalled();
  });
});
