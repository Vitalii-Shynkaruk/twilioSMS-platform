import { z } from 'zod';

// ─── Common ───
const e164Phone = z.string().regex(/^\+1\d{10}$/, 'Must be E.164 US phone (+1XXXXXXXXXX)');
const cuid = z.string().min(1);
const paginationQuery = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(50),
};

// ─── Auth ───
export const loginSchema = z.object({
  email: z.string().email().transform(s => s.toLowerCase().trim()),
  password: z.string().min(1),
});

export const registerSchema = z.object({
  email: z.string().email().transform(s => s.toLowerCase().trim()),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  role: z.enum(['ADMIN', 'MANAGER', 'REP']).default('REP'),
});

export const updateUserSchema = z.object({
  firstName: z.string().min(1).max(50).trim().optional(),
  lastName: z.string().min(1).max(50).trim().optional(),
  role: z.enum(['ADMIN', 'MANAGER', 'REP']).optional(),
  isActive: z.boolean().optional(),
  email: z.string().email().transform(s => s.toLowerCase().trim()).optional(),
});

// ─── Leads ───
export const createLeadSchema = z.object({
  firstName: z.string().min(1).max(100).trim(),
  lastName: z.string().max(100).trim().optional().default(''),
  phone: e164Phone,
  email: z.string().email().optional().or(z.literal('')),
  company: z.string().max(200).optional().default(''),
  state: z.string().max(50).optional().default(''),
  source: z.string().max(100).optional().default(''),
  status: z.enum(['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'DOCS_REQUESTED', 'SUBMITTED', 'FUNDED', 'NOT_INTERESTED', 'DNC']).optional(),
  notes: z.string().max(5000).optional(),
  customFields: z.record(z.string()).optional(),
});

export const updateLeadSchema = createLeadSchema.partial();

export const leadListQuery = z.object({
  ...paginationQuery,
  search: z.string().optional().default(''),
  status: z.string().optional().default(''),
  source: z.string().optional().default(''),
  state: z.string().optional().default(''),
  tag: z.string().optional().default(''),
  assignedRepId: z.string().optional().default(''),
});

export const bulkActionSchema = z.object({
  action: z.enum(['delete', 'assignRep', 'changeStatus', 'addTag', 'removeTag', 'suppress', 'unsuppress', 'startAutomation']),
  leadIds: z.array(cuid).min(1).max(10000),
  data: z.record(z.unknown()).optional(),
});

// ─── Campaigns ───
export const createCampaignSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(2000).optional().default(''),
  messageTemplate: z.string().min(1).max(1600),
  numberPoolId: z.string().optional().nullable(),
  sendingSpeed: z.number().int().min(1).max(600).default(60),
  dailyLimit: z.number().int().min(1).max(100000).optional().nullable(),
  scheduledAt: z.string().datetime().optional().nullable(),
  leadIds: z.array(cuid).optional(),
  // Targeting filters
  targetStatuses: z.array(z.string()).optional(),
  targetSources: z.array(z.string()).optional(),
  targetStates: z.array(z.string()).optional(),
  targetTags: z.array(cuid).optional(),
});

export const updateCampaignSchema = createCampaignSchema.partial();

// ─── Inbox ───
export const sendReplySchema = z.object({
  body: z.string().min(1).max(1600).trim(),
});

export const assignRepSchema = z.object({
  repId: z.string().min(1),
});

// ─── Numbers ───
export const createNumberSchema = z.object({
  phoneNumber: e164Phone,
  twilioSid: z.string().min(1),
  friendlyName: z.string().max(200).optional().default(''),
  dailyLimit: z.number().int().min(1).max(5000).default(350),
});

export const updateNumberSchema = z.object({
  friendlyName: z.string().max(200).optional(),
  dailyLimit: z.number().int().min(1).max(5000).optional(),
  status: z.enum(['ACTIVE', 'WARMING', 'COOLING', 'SUSPENDED', 'RETIRED']).optional(),
});

export const assignNumberSchema = z.object({
  repId: z.string().min(1),
  phoneNumberIds: z.array(cuid).min(1),
});

export const createPoolSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).optional().default(''),
  dailyLimit: z.number().int().min(1).max(50000).default(300),
  numberIds: z.array(cuid).optional(),
});

// ─── Pipeline ───
export const createStageSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
  order: z.number().int().min(0).optional(),
  mappedStatus: z.string().optional().nullable(),
});

export const moveCardSchema = z.object({
  stageId: z.string().min(1),
  position: z.number().int().min(0),
});

// ─── Automation ───
export const createRuleSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  type: z.enum(['LEAD_CREATED', 'STATUS_CHANGED', 'KEYWORD_RECEIVED', 'NO_REPLY', 'MANUAL', 'TAG_RULE', 'FOLLOW_UP_SEQUENCE']),
  isActive: z.boolean().default(true),
  triggerConfig: z.record(z.unknown()),
  actionConfig: z.record(z.unknown()),
  sendAfterHour: z.number().int().min(0).max(23).default(9),
  sendBeforeHour: z.number().int().min(0).max(23).default(20),
  sendOnWeekends: z.boolean().default(false),
  templates: z.array(z.object({
    sequenceOrder: z.number().int().min(1),
    delayDays: z.number().int().min(0).max(365),
    messageTemplate: z.string().min(1).max(1600),
  })).optional(),
});

export const updateRuleSchema = createRuleSchema.partial();

// ─── Settings ───
export const updateSettingSchema = z.object({
  value: z.unknown(),
});

export const createTagSchema = z.object({
  name: z.string().min(1).max(50).trim(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#6366f1'),
});

export const addSuppressionSchema = z.object({
  phone: e164Phone,
  reason: z.string().min(1).max(200).default('manual'),
});

export const bulkSuppressionSchema = z.object({
  phones: z.array(e164Phone).min(1).max(10000),
  reason: z.string().default('manual'),
});

// ─── Helpers ───
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type CreateRuleInput = z.infer<typeof createRuleSchema>;
