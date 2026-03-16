/**
 * API Routes Integration Tests
 * Tests main CRUD endpoints: leads, campaigns, pipeline, inbox.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import prisma from '../src/config/database';
import bcrypt from 'bcryptjs';

let token: string;
let testLeadId: string;
let testCampaignId: string;
let testStageId: string;

describe('API Routes', () => {
  beforeAll(async () => {
    // Create test user and log in
    const hash = await bcrypt.hash('TestPass!1', 12);
    await prisma.user.upsert({
      where: { email: 'test-api@test.com' },
      create: {
        email: 'test-api@test.com',
        passwordHash: hash,
        firstName: 'API',
        lastName: 'Test',
        role: 'ADMIN',
      },
      update: { passwordHash: hash, isActive: true },
    });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'test-api@test.com', password: 'TestPass!1' });
    token = res.body.token;
  });

  afterAll(async () => {
    // Clean up test data in correct order
    if (testLeadId) {
      await prisma.leadTag.deleteMany({ where: { leadId: testLeadId } });
      await prisma.campaignLead.deleteMany({ where: { leadId: testLeadId } });
      await prisma.pipelineCard.deleteMany({ where: { leadId: testLeadId } });
      await prisma.conversation.deleteMany({ where: { leadId: testLeadId } });
      await prisma.lead.deleteMany({ where: { id: testLeadId } });
    }
    if (testCampaignId) {
      await prisma.campaignLead.deleteMany({ where: { campaignId: testCampaignId } });
      await prisma.campaign.deleteMany({ where: { id: testCampaignId } });
    }
    if (testStageId) {
      await prisma.pipelineCard.deleteMany({ where: { stageId: testStageId } });
      await prisma.pipelineStage.deleteMany({ where: { id: testStageId } });
    }
    await prisma.user.deleteMany({ where: { email: 'test-api@test.com' } });
  });

  // ─── LEADS ────────────────────
  describe('Leads API', () => {
    it('POST /api/leads — creates a lead', async () => {
      const res = await request(app)
        .post('/api/leads')
        .set('Authorization', `Bearer ${token}`)
        .send({
          firstName: 'Test',
          lastName: 'Lead',
          phone: '+12025551234',
          email: 'testlead@test.com',
          source: 'api_test',
        });

      expect(res.status).toBe(201);
      expect(res.body.lead).toHaveProperty('id');
      expect(res.body.lead.firstName).toBe('Test');
      testLeadId = res.body.lead.id;
    });

    it('GET /api/leads — lists leads', async () => {
      const res = await request(app)
        .get('/api/leads')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.leads).toBeInstanceOf(Array);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.pagination).toHaveProperty('total');
    });

    it('GET /api/leads/:id — returns lead details', async () => {
      const res = await request(app)
        .get(`/api/leads/${testLeadId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.lead.id).toBe(testLeadId);
    });

    it('PUT /api/leads/:id — updates a lead', async () => {
      const res = await request(app)
        .put(`/api/leads/${testLeadId}`)
        .set('Authorization', `Bearer ${token}`)
        .send({ status: 'CONTACTED' });

      expect(res.status).toBe(200);
      expect(res.body.lead.status).toBe('CONTACTED');
    });
  });

  // ─── CAMPAIGNS ────────────────
  describe('Campaigns API', () => {
    it('POST /api/campaigns — creates a campaign', async () => {
      const res = await request(app)
        .post('/api/campaigns')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: 'Test Campaign',
          messageTemplate: 'Hi {{firstName}}, this is a test!',
        });

      expect(res.status).toBe(201);
      expect(res.body.campaign).toHaveProperty('id');
      expect(res.body.campaign.name).toBe('Test Campaign');
      testCampaignId = res.body.campaign.id;
    });

    it('GET /api/campaigns — lists campaigns', async () => {
      const res = await request(app)
        .get('/api/campaigns')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.campaigns).toBeInstanceOf(Array);
    });

    it('GET /api/campaigns/:id — returns campaign details', async () => {
      const res = await request(app)
        .get(`/api/campaigns/${testCampaignId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.campaign.id).toBe(testCampaignId);
    });
  });

  // ─── PIPELINE ─────────────────
  describe('Pipeline API', () => {
    it('POST /api/pipeline/stages — creates a stage', async () => {
      const res = await request(app)
        .post('/api/pipeline/stages')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: 'Test Stage', color: '#FF5500' });

      expect(res.status).toBe(201);
      expect(res.body.stage).toHaveProperty('id');
      testStageId = res.body.stage.id;
    });

    it('GET /api/pipeline/stages — lists stages', async () => {
      const res = await request(app)
        .get('/api/pipeline/stages')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.stages).toBeInstanceOf(Array);
    });
  });

  // ─── DASHBOARD ────────────────
  describe('Dashboard API', () => {
    it('GET /api/dashboard/stats — returns statistics', async () => {
      const res = await request(app)
        .get('/api/dashboard/stats')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('overview');
      expect(res.body.overview).toHaveProperty('sentLast24h');
      expect(res.body.overview).toHaveProperty('replyRate');
      expect(res.body).toHaveProperty('pipelineSnapshot');
    });
  });

  // ─── SETTINGS ─────────────────
  describe('Settings API', () => {
    it('GET /api/settings/tags — lists tags', async () => {
      const res = await request(app)
        .get('/api/settings/tags')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.tags).toBeInstanceOf(Array);
    });

    it('GET /api/settings/suppression — suppression list', async () => {
      const res = await request(app)
        .get('/api/settings/suppression')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.entries).toBeInstanceOf(Array);
    });
  });

  // ─── AUTOMATION ────────────────
  describe('Automation API', () => {
    it('GET /api/automation/rules — lists rules', async () => {
      const res = await request(app)
        .get('/api/automation/rules')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.rules).toBeInstanceOf(Array);
    });
  });

  // ─── NUMBERS ──────────────────
  describe('Numbers API', () => {
    it('GET /api/numbers — lists numbers', async () => {
      const res = await request(app)
        .get('/api/numbers')
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.numbers).toBeInstanceOf(Array);
    });
  });

  // ─── ACCESS CONTROL ───────────
  describe('Role-Based Access', () => {
    let repToken: string;

    beforeAll(async () => {
      const hash = await bcrypt.hash('RepPass!1', 12);
      await prisma.user.upsert({
        where: { email: 'test-rep-access@test.com' },
        create: {
          email: 'test-rep-access@test.com',
          passwordHash: hash,
          firstName: 'Rep',
          lastName: 'Test',
          role: 'REP',
        },
        update: { passwordHash: hash, isActive: true },
      });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test-rep-access@test.com', password: 'RepPass!1' });
      repToken = res.body.token;
    });

    afterAll(async () => {
      await prisma.user.deleteMany({ where: { email: 'test-rep-access@test.com' } });
    });

    it('REP cannot create a user', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .set('Authorization', `Bearer ${repToken}`)
        .send({
          email: 'new@test.com',
          password: 'Pass!1',
          firstName: 'No',
          lastName: 'Way',
        });

      expect(res.status).toBe(403);
    });

    it('REP cannot view numbers', async () => {
      const res = await request(app)
        .get('/api/numbers')
        .set('Authorization', `Bearer ${repToken}`);

      expect(res.status).toBe(403);
    });
  });
});
