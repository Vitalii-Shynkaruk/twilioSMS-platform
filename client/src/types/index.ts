// Core types for the SCL SMS Platform

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'MANAGER' | 'REP';
  isActive?: boolean;
  lastLoginAt?: string;
  createdAt?: string;
}

export interface Lead {
  id: string;
  firstName: string;
  lastName?: string;
  phone: string;
  email?: string;
  company?: string;
  state?: string;
  source?: string;
  status: LeadStatus;
  assignedRepId?: string;
  assignedRep?: User;
  isSuppressed: boolean;
  optedOut: boolean;
  lastContactedAt?: string;
  lastRepliedAt?: string;
  contactCount: number;
  notes?: string;
  tags?: LeadTag[];
  pipelineCards?: PipelineCard[];
  createdAt: string;
  updatedAt: string;
}

export type LeadStatus =
  | 'NEW'
  | 'CONTACTED'
  | 'REPLIED'
  | 'INTERESTED'
  | 'DOCS_REQUESTED'
  | 'SUBMITTED'
  | 'FUNDED'
  | 'NOT_INTERESTED'
  | 'DNC';

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export interface LeadTag {
  id: string;
  tag: Tag;
}

export interface Conversation {
  id: string;
  leadId: string;
  lead: Lead;
  assignedRepId?: string;
  assignedRep?: User;
  stickyNumberId?: string;
  lastMessageAt?: string;
  lastDirection?: string;
  unreadCount: number;
  isActive: boolean;
  messages?: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  direction: 'OUTBOUND' | 'INBOUND';
  status: MessageStatus;
  fromNumber: string;
  toNumber: string;
  body: string;
  sentAt?: string;
  deliveredAt?: string;
  createdAt: string;
  sentByUser?: { firstName: string; lastName: string };
}

export type MessageStatus =
  | 'QUEUED'
  | 'SENDING'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'UNDELIVERED'
  | 'BLOCKED'
  | 'RECEIVED';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  messageTemplate: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  numberPoolId?: string;
  sendingSpeed: number;
  totalLeads: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalBlocked: number;
  totalReplied: number;
  totalOptedOut: number;
  createdAt: string;
}

export type CampaignStatus = 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'PAUSED' | 'COMPLETED' | 'CANCELLED';

export interface PipelineStage {
  id: string;
  name: string;
  order: number;
  color: string;
  cards: PipelineCard[];
  _count?: { cards: number };
}

export interface PipelineCard {
  id: string;
  leadId: string;
  stageId: string;
  position: number;
  lead: Lead;
  stage?: PipelineStage;
}

export interface PhoneNumber {
  id: string;
  phoneNumber: string;
  status: 'ACTIVE' | 'WARMING' | 'COOLING' | 'SUSPENDED' | 'RETIRED';
  dailySentCount: number;
  dailyLimit: number;
  deliveryRate: number;
  errorStreak: number;
  isRamping: boolean;
  rampDay: number;
  coolingUntil?: string;
  cooldownReason?: string;
}

export interface AutomationRule {
  id: string;
  name: string;
  type: 'FOLLOW_UP_SEQUENCE' | 'KEYWORD_TRIGGER' | 'STATUS_CHANGE' | 'TAG_RULE';
  isActive: boolean;
  triggerConfig: Record<string, any>;
  actionConfig: Record<string, any>;
  sendAfterHour: number;
  sendBeforeHour: number;
  sendOnWeekends: boolean;
  templates?: AutomationTemplate[];
  _count?: { runs: number };
}

export interface AutomationTemplate {
  id: string;
  sequenceOrder: number;
  delayDays: number;
  messageTemplate: string;
}

export interface NumberPool {
  id: string;
  name: string;
  description?: string;
  dailyLimit: number;
  isActive: boolean;
  _count?: { members: number };
}

export interface DashboardStats {
  overview: {
    sentLast24h: number;
    deliveredLast24h: number;
    totalLeads: number;
    replyRate: number;
    activeAutomations: number;
  };
  pipelineSnapshot: Array<{
    id: string;
    name: string;
    color: string;
    count: number;
  }>;
  recentCampaigns: Campaign[];
  numberHealth: Array<{
    status: string;
    count: number;
  }>;
  dailyVolume: Array<{
    date: string;
    sent: number;
    delivered: number;
    failed: number;
    blocked: number;
  }>;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages?: number;
}
