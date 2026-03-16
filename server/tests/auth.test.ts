/**
 * Auth API Integration Tests
 * Tests authentication, authorization, and user management.
 * Runs against a real DB (local PostgreSQL).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import prisma from '../src/config/database';
import bcrypt from 'bcryptjs';

const TEST_ADMIN = {
  email: 'test-admin@test.com',
  password: 'TestPass123!',
  firstName: 'Test',
  lastName: 'Admin',
};

let adminToken: string;
let adminUserId: string;

describe('Auth API', () => {
  beforeAll(async () => {
    // Create test admin
    const hash = await bcrypt.hash(TEST_ADMIN.password, 12);
    const user = await prisma.user.upsert({
      where: { email: TEST_ADMIN.email },
      create: {
        email: TEST_ADMIN.email,
        passwordHash: hash,
        firstName: TEST_ADMIN.firstName,
        lastName: TEST_ADMIN.lastName,
        role: 'ADMIN',
      },
      update: { passwordHash: hash, isActive: true },
    });
    adminUserId = user.id;
  });

  afterAll(async () => {
    // Delete only users created by THIS test file
    const ownEmails = ['test-admin@test.com', 'test-rep@test.com', 'test-manager@test.com', 'test-new@test.com'];
    const testUsers = await prisma.user.findMany({
      where: { email: { in: ownEmails } },
      select: { id: true },
    });
    const userIds = testUsers.map(u => u.id);
    if (userIds.length > 0) {
      await prisma.campaign.deleteMany({ where: { createdById: { in: userIds } } });
    }
    await prisma.user.deleteMany({
      where: { email: { in: ownEmails } },
    });
  });

  describe('POST /api/auth/login', () => {
    it('should login successfully with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_ADMIN.email, password: TEST_ADMIN.password });

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toMatchObject({
        email: TEST_ADMIN.email,
        firstName: TEST_ADMIN.firstName,
        lastName: TEST_ADMIN.lastName,
        role: 'ADMIN',
      });
      expect(res.body.user).not.toHaveProperty('passwordHash');
      adminToken = res.body.token;
    });

    it('should reject wrong password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_ADMIN.email, password: 'WrongPassword' });

      expect(res.status).toBe(401);
      expect(res.body).toHaveProperty('error');
    }, 15000);

    it('should reject non-existent email', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'nonexistent@test.com', password: 'any' });

      expect(res.status).toBe(401);
    });

    it('should reject missing email or password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: TEST_ADMIN.email });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /api/auth/me', () => {
    it('should return current user by token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.user).toMatchObject({
        email: TEST_ADMIN.email,
        role: 'ADMIN',
      });
    });

    it('should reject request without token', async () => {
      const res = await request(app).get('/api/auth/me');

      expect(res.status).toBe(401);
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', 'Bearer invalid-token-here');

      expect(res.status).toBe(401);
    });
  });

  describe('POST /api/auth/register', () => {
    it('should allow admin to create a new user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-rep@test.com',
          password: 'RepPass123!',
          firstName: 'Test',
          lastName: 'Rep',
          role: 'REP',
        });

      expect(res.status).toBe(201);
      expect(res.body.user).toMatchObject({
        email: 'test-rep@test.com',
        role: 'REP',
      });
    });

    it('should reject duplicate email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          email: 'test-rep@test.com',
          password: 'Pass123!',
          firstName: 'Another',
          lastName: 'Rep',
        });

      expect(res.status).toBe(409);
    });

    it('should reject without authorization', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'test-new@test.com',
          password: 'Pass123!',
          firstName: 'New',
          lastName: 'User',
        });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/auth/users', () => {
    it('should allow admin to list users', async () => {
      const res = await request(app)
        .get('/api/auth/users')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.users).toBeInstanceOf(Array);
      expect(res.body.users.length).toBeGreaterThanOrEqual(1);
      // Verify passwords are not leaked
      res.body.users.forEach((u: any) => {
        expect(u).not.toHaveProperty('passwordHash');
      });
    });
  });

  describe('PUT /api/auth/users/:id', () => {
    it('should allow admin to update a user', async () => {
      const res = await request(app)
        .put(`/api/auth/users/${adminUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ firstName: 'Updated' });

      expect(res.status).toBe(200);
      expect(res.body.user.firstName).toBe('Updated');
    });
  });
});

describe('Health Check', () => {
  it('GET /api/health should return ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});
