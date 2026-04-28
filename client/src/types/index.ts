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
  createdAt?: string;
  updatedAt?: string;
  assignedRepId?: string;
  assignedRep?: User;
  stickyNumberId?: string;
  twilioNumberId?: string;
  twilioNumber?: { id: string; phoneNumber: string; friendlyName?: string | null };
  stickyNumber?: { id: string; phoneNumber: string; friendlyName?: string | null };
  lastMessageAt?: string;
  lastDirection?: string;
  unreadCount: number;
  isActive: boolean;
  messages?: Message[];
  // Phase 1: Расширенные поля
  hotLead?: boolean;
  leadStatus?: string | null;
  nextFollowupAt?: string | null;
  followupTime?: string | null;
  followupReason?: string | null;
  followupSetBy?: string | null;
  followupSetAt?: string | null;
  followupStatus?: 'scheduled' | 'due_now' | 'completed' | 'cleared' | null;
  emailReceived?: boolean;
  notes?: ConversationNote[];
  deals?: Array<{
    id: string;
    stage: string;
    stageLabel?: string;
    createdAt: string;
    createdFromSms?: boolean;
    productType?: string | null;
    assignedRepId?: string;
  }>;
  fromNumber?: string;
  fromNumberFriendlyName?: string | null;
  unreadDot?: boolean;
  isInPipeline?: boolean;
  statusStrip?: {
    hotLead: boolean;
    pipelineState: 'in_pipeline' | 'not_in_pipeline';
    pipelineLabel: string;
    fromNumber: string;
    fromNumberFriendlyName?: string | null;
    assignedRep?: string | null;
    followUpAt?: string | null;
  };
  contactInfo?: {
    email?: string;
    phone?: string;
    company?: string;
    source?: string;
    product?: string;
    assignedRep?: string;
    conversationNumber?: string;
    createdAt?: string;
    lastTemplateUsed?: string;
  };
  activity?: ConversationActivity[];
  // Phase 1 AI Inbox
  aiClassification?: 'HOT' | 'WARM' | 'NURTURE' | null;
  aiSignals?: AISignals | null;
  aiSuggestions?: AISuggestion[] | null;
  extractedIndustry?: string | null;
  helocFitFlag?: boolean | null;
  extractedRevenue?: number | null;
  extractedAsk?: string | null;
  isCaliforniaNumber?: boolean;
  aiLeadScore?: number;
  aiClassifiedAt?: string | null;
}

export interface AISignals {
  revenue?: string | null;
  ask?: string | null;
  urgency?: string | null;
  product?: string | null;
  industry?: string | null;
  objections?: string | null;
  revenueMonthly?: number | null;
  revenueAnnual?: number | null;
  revenueConfidence?: 'stated' | 'inferred' | null;
  helocFitFlag?: boolean | null;
  staleState?: 'active' | 'stale' | 'ghosted' | null;
  suggestedReply?: string | null;
  suggestedFollowupTime?: string | null;
  suggestedFollowupReason?: string | null;
  suggestedFollowupStatus?: 'scheduled' | 'due_now' | 'completed' | 'cleared' | null;
  suggestedReengageMessage?: string | null;
  repBehavior?: string | null;
}

export interface AISuggestion {
  type?: 'agg' | 'soft' | 'doc' | 'reschedule' | 'block';
  lbl?: string;
  text: string;
  cta?: string;
  blocked?: boolean;
}

export interface ConversationActivity {
  id: string;
  type: string;
  text: string;
  at: string;
  tone?: 'default' | 'teal' | 'gold';
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

// Phase 1: SMS Шаблоны
export interface SmsTemplate {
  id: string;
  name: string;
  body: string;
  category?: string;
  visibility: 'PRIVATE' | 'TEAM' | 'GLOBAL';
  createdById: string;
  usageCount: number;
  lastUsedAt?: string;
  isActive: boolean;
  isFavorite?: boolean;
  ownerName?: string;
  createdAt: string;
  updatedAt: string;
}

// Phase 1: Заметки к разговору
export interface ConversationNote {
  id: string;
  conversationId: string;
  dealId?: string;
  body: string;
  createdById: string;
  createdAt: string;
  authorName?: string;
  authorInitials?: string;
  authorRole?: string;
}

// Phase 1: Отложенные сообщения
export interface ScheduledMessage {
  id: string;
  conversationId: string;
  body: string;
  scheduledAt: string;
  status: 'PENDING' | 'SENT' | 'CANCELLED';
  createdById: string;
  fromNumber: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  status: CampaignStatus;
  isRetarget?: boolean;
  sourceCampaignId?: string | null;
  sourceCampaignName?: string | null;
  messageTemplate: string;
  scheduledAt?: string;
  startedAt?: string;
  completedAt?: string;
  numberPoolId?: string;
  createdById?: string;
  sendingSpeed: number;
  totalLeads: number;
  totalSent: number;
  totalDelivered: number;
  totalFailed: number;
  totalBlocked: number;
  totalReplied: number;
  totalOptedOut: number;
  createdAt: string;
  sentBreakdown?: {
    numbers: Array<{ number: string; count: number }>;
    reps: Array<{ name: string; count: number }>;
  };
  failedBreakdown?: {
    reasons: Array<{ code: string; message?: string; count: number }>;
  };
  leadBreakdown?: {
    pending: number;
    skipped: number;
    delivered: number;
    failed: number;
    replied: number;
  };
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
    totalValue: number;
    avgValue: number;
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
  monthlyRevenue?: string;
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
  submittedAmount?: number;
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
  clientNotes?: string;
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
  coRepIds?: string[];
  nurtureType?: string;
  priorityScore?: number;
  scoreReason?: string;
  scoreColor?: 'green' | 'amber' | 'red';
  primaryAction?: string;
  suggestNurture?: boolean;
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
  smsOutboundThreshold?: number;
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
  fundedThisMonthCount: number;
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
  lifetimeFunded: number;
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
  noNextAction: number;
  idleRepsCount: number;
  futureNext7: number;
  futureNext30: number;
  futureTotal: number;
  futureNext7Value: number;
  futureNext30Value: number;
  renewalsDue: number;
  conversionRate: number;
  fundedDealCount: number;
  fundedRepCount: number;
  totalActiveDeals: number;
}

export interface Goal {
  id: string;
  entityType: string;
  entityId: string;
  monthlyGoal: number;
  annualGoal: number;
}
