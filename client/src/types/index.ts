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

// ─── Phase 2: Deal Pipeline & Command Center ───

export type DealStage =
  | 'NEW_LEAD'
  | 'ENGAGED_INTERESTED'
  | 'QUALIFIED'
  | 'SUBMITTED_IN_REVIEW'
  | 'APPROVED_OFFERS'
  | 'COMMITTED_FUNDING'
  | 'FUNDED'
  | 'NURTURE'
  | 'CLOSED';

export type ProductType = 'MCA' | 'LOC' | 'EQUIPMENT' | 'HELOC' | 'SBA' | 'CRE' | 'BRIDGE';

export type CommitSubStatus = 'DOCS_REQUESTED' | 'DOCS_SIGNED' | 'FUNDING';

export type RenewalTaskStatus = 'PENDING' | 'COMPLETED' | 'OVERDUE' | 'SKIPPED';

export interface Client {
  id: string;
  businessName: string;
  contactName?: string;
  phone?: string;
  email?: string;
  state?: string;
  totalFunded: number;
  fundingCount: number;
  lastFundedDate?: string;
}

export interface Deal {
  id: string;
  clientId: string;
  assignedRepId: string;
  assistingRepIds?: string[];
  stage: DealStage;
  stageLabel: string;
  productType?: ProductType;
  dealAmount?: number;
  needsAmount: boolean;
  nextAction?: string;
  nextActionDue?: string;
  lastActivityAt: string;
  lastReplyAt?: string;
  daysInStage: number;
  staleDays: number;
  appSubmitted: boolean;
  lenderEngaged: boolean;
  commitSubStatus?: CommitSubStatus;
  daysInSubStatus: number;
  fundedDate?: string;
  cycleTime?: number;
  prevOffer?: number;
  lostReason?: string;
  disqualReason?: string;
  followUpDate?: string;
  followUpType?: string;
  followUpNote?: string;
  externalFundedDate?: string;
  importBatch?: string;
  originatorName?: string;
  lender?: string;
  notes?: string;
  isHot: boolean;
  createdAt: string;
  updatedAt: string;
  // Relations
  client?: Client;
  assignedRep?: Rep;
  offers?: Offer[];
  fundingEvents?: FundingEvent[];
  dealEvents?: DealEvent[];
  renewalTasks?: RenewalTask[];
}

export interface Offer {
  id: string;
  dealId: string;
  lenderName: string;
  amount: number;
  terms?: string;
  expiryDays?: number;
  productType?: ProductType;
  isAccepted: boolean;
  createdAt: string;
}

export interface FundingEvent {
  id: string;
  dealId: string;
  repId?: string;
  amountFunded: number;
  lender?: string;
  productType?: ProductType;
  fundedDate?: string;
  notes?: string;
  createdAt: string;
}

export interface DealEvent {
  id: string;
  dealId: string;
  repId?: string;
  eventType: string;
  fromStage?: string;
  toStage?: string;
  note?: string;
  metadata?: any;
  createdAt: string;
  rep?: { firstName: string; lastName: string };
}

export interface RenewalTask {
  id: string;
  dealId: string;
  repId?: string;
  taskType: string;
  dueDate: string;
  status: RenewalTaskStatus;
  completedAt?: string;
  notes?: string;
}

export interface Rep {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  initials?: string;
  role: 'ADMIN' | 'MANAGER' | 'REP';
  isActive: boolean;
  monthlyGoal?: number;
  annualGoal?: number;
  avatarColor?: string;
  lastLoginAt?: string;
}

export interface DealBoard {
  stages: {
    stage: DealStage;
    label: string;
    color: string;
    deals: Deal[];
    count: number;
    value: number;
  }[];
  total: number;
}

export interface DealStats {
  activePipeline: number;
  activeCount: number;
  fundedMTD: number;
  lifetimeFunded: number;
  monthlyGoal: number;
  atRisk: number;
  hotCount: number;
  noNextAction: number;
  queueToday: number;
  pipelineValue: number;
  renewalsDue: number;
  committedValue: number;
  avgCycleTime: number;
  dealsByStage: { stage: string; count: number; value: number }[];
}

export interface CommandCenterMetrics {
  fundedMTD: number;
  pipelineValue: number;
  committedValue: number;
  atRisk: number;
  goalProgress: number;
  projectedMonthEnd: number;
  monthlyGoal: number;
  hotCount: number;
  staleCount: number;
  staleRevenue: number;
  overdueCount: number;
  futureNext7: number;
  futureNext30: number;
  futureTotal: number;
  renewalsDue: number;
}

export interface Goal {
  id: string;
  entityType: string;
  entityId: string;
  monthlyGoal: number;
  annualGoal: number;
}
