import Anthropic from '@anthropic-ai/sdk';
import { DealStage, ProductType } from '@prisma/client';
import type { AuthRequest } from '../middleware/auth';
import prisma from '../config/database';
import logger from '../config/logger';
import { extractJsonObjectFromLlmResponse } from './aiService';
import { isAdminLike } from './dealScopePolicy';
import { getSocketIO } from '../realtime/socket';

export type PipelineInputType = 'rep_note' | 'client_sms';
export type PipelineSkipReason = 'contact_info_only' | 'too_short' | 'unrelated' | 'unintelligible' | 'no_signal';
export type PipelineProductInterest = 'MCA' | 'LOC' | 'HELOC' | 'SBA' | 'EQUIPMENT' | 'CRE' | 'BRIDGE';

export interface PipelineAiSignals {
  _extraction_scope: 'lead_only';
  skip_reason: PipelineSkipReason | null;
  industry: string;
  monthly_revenue: { value_usd: number; raw: string } | null;
  use_of_funds: {
    category: 'equipment' | 'working_capital' | 'debt_consolidation' | 'real_estate' | 'expansion' | 'unspecified';
    detail: string | null;
  } | null;
  requested_amount: { value_usd: number; raw: string } | null;
  product_interest: PipelineProductInterest[];
  pending_actions: Array<{
    actor: 'rep' | 'lead';
    action: string;
    timing: 'today' | 'this_week' | 'next_week' | 'later' | null;
  }>;
  has_stacked_history: boolean;
  current_active_positions: { count: number | null; total_debt_usd: number | null } | null;
  recent_stacking_activity: {
    active: boolean;
    window: 'last_30d' | 'last_60d' | 'last_90d' | null;
  };
}

interface PipelineAiConfig {
  apiKey: string;
  model: string;
}

interface RelatedPipelineDeal {
  id: string;
  stage: DealStage;
  productType: ProductType | null;
}

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-4-5';

export const PIPELINE_AI_SYSTEM_PROMPT = `You extract structured signals from rep notes and inbound client SMS in a small-business lending CRM, to enrich a deal card. You receive (a) any existing signals previously extracted on this deal, and (b) one new note or message. You return a single updated signals object representing the full picture.

ROLE BOUNDARY (lead_only scope):
Extract only facts about the LEAD (the borrower / applicant). Ignore any statements about reps' actions or other reps. Examples of statements to IGNORE because they describe rep activity, not the lead:
- "[NAME] was last to submit 1/3/2025"     (rep submission tracking)
- "[NAME] help"                              (rep handoff)
- "[NAME] brought in last year"              (rep referral)
- "Sent [NAME] a HELOC approval"             (rep action)
- "[NAME] requested the contracts"           (rep action)
- "STAY IN HIS EARR"                         (rep self-instruction)

If the only content of an input is rep-action references, return skip_reason="unrelated" with all extracted fields at empty/default.

INHERITANCE (existing signals as optional input):
- Deals routed from SMS may already carry signals extracted upstream by the SMS Inbox AI. When [EXISTING SIGNALS] is present, treat those signals as starting state — preserve them in your output unless the new input contradicts them.
- Manually-entered deals will have [EXISTING SIGNALS] (none). Extract everything from scratch from the new input.
- Same prompt handles both. Do not assume existing signals are present.

MERGE RULES (combining existing signals with new input):
1. If existing signals are present and the new input does not contradict them, preserve them.
2. If existing signals are present and the new input contradicts them, the new input WINS — but only when:
   - The new input is a rep_note, OR
   - The new input is a client_sms whose contradiction is explicit and unambiguous.
3. When existing signals are absent, extract everything from scratch from the new input.
4. Rep notes outrank prior client SMS on facts about the lead. Client SMS outranks prior signals only when the client states something explicit.
5. Never delete a previously-extracted field unless the new input explicitly invalidates it. Silence is not contradiction.

SKIP CONDITIONS (set skip_reason; return all extracted fields at empty/default):
- "contact_info_only": input is just an email, phone, or other PII placeholder with no other signal (e.g., "[EMAIL]")
- "too_short": fewer than ~5 meaningful words; insufficient signal (e.g., "Have not received yet")
- "unrelated": input is about reps, not the lead, OR off-topic chitchat
- "unintelligible": gibberish, severe typos with no recoverable meaning, or pure profanity
- "no_signal": input is substantive (long enough, on-topic, intelligible) but yields no extractable fields against this schema

When skip_reason is non-null, all extracted fields must be at their empty-default values:
- industry=""
- monthly_revenue=null, use_of_funds=null, requested_amount=null
- product_interest=[], pending_actions=[]
- has_stacked_history=false
- current_active_positions=null
- recent_stacking_activity={"active": false, "window": null}

REDACTION TOKENS:
Bracketed tokens are opaque PII placeholders applied upstream. Treat them as:
- [NAME]      → presence of a person name, value unknown
- [LENDER]    → presence of a lender name, value unknown (counts as a stacking signal when paired with an amount/frequency)
- [BANK]      → presence of a bank name, value unknown
- [BIZ]       → presence of a business name, value unknown
- [EMAIL], [PHONE], [URL], [LOCATION], [EMPLOYER], [NUM] → presence only
Never copy a bracket token into a string field as if it were the underlying value.

NON-NULLABLE FIELDS:
- industry → empty string "" when unknown (freeform string, NOT enum — e.g. "Logistics", "Commercial real estate")
- has_stacked_history → false when no stacking signal is present
- recent_stacking_activity → always present as an object {active, window}; set active=false and window=null when no recent stacking signal

PRODUCT TYPE MAPPING:
Canonical enum: MCA, LOC, HELOC, SBA, EQUIPMENT, CRE, BRIDGE.
product_interest is an array. Multi-product extraction is correct when multiple products are signaled in a single input. Pattern: an SBA application that mentions specific equipment ("roll off truck", "3 vehicles") → ["SBA", "EQUIPMENT"]. The product_at_time context counts as one signal; specific item mentions add additional products. Don't collapse to a single value just because product_at_time is set.
Map common synonyms:
- "data merch" → MCA
- "line of credit" → LOC
- "HELOC", "home equity" → HELOC
- "SBA" → SBA
- "Semi Truck", "daycab", "roll off truck", "vehicles" → EQUIPMENT (and surface specifics in use_of_funds.detail)
- "appraisal" + refi/mortgage language → HELOC
- "weekly" / "daily" payment language without other context → MCA (frequency is canonical MCA signal)

NUMBER CANONICALIZATION:
Money is given in many shapes: "210k", "11K", "1M+", "6m", "50M", "20-30k", "$110k+", "$500,000", "1990", "330.000k", "5k". For any money field, return both:
- value_usd: integer in dollars (e.g., 210000)
- raw: original string
For ranges ("20-30k"), use the midpoint as value_usd and keep the raw string.
For open-ended ("$110k+"), use the floor as value_usd.
For ambiguous ("330.000k" — could be 330k or 330000k), prefer the smaller plausible interpretation.

REQUESTED AMOUNT:
- requested_amount: the dollar amount the borrower is asking for / seeking to borrow. Extract from phrases like "seeking $X", "needs $X", "looking for $X", "asking for $X", "wants $X", "requesting $X", "can use $X", "take $X", "need $X". This is NOT the revenue figure — revenue goes in monthly_revenue. When text contains both a seek amount and a revenue figure ("seeking $100k... grosses $100k monthly"), place each in its correct field. Example: "Contractor seeking $100k to buy land. Grosses $100k monthly." → requested_amount={value_usd:100000, raw:"$100k"}, monthly_revenue={value_usd:100000, raw:"$100k monthly"}. If only one dollar amount appears and context clearly indicates revenue (e.g. "Grosses $X monthly"), requested_amount=null.

USE_OF_FUNDS vs PENDING_ACTIONS:
- use_of_funds.detail: WHAT the funds will be used for — the lead's stated purpose, including future ambitions ("3 more vehicles", "expand to a 2nd location"). Write it as a noun phrase.
- pending_actions: discrete next steps that must happen for the deal to advance, with a named actor and optional timing. Format: { actor: "rep" | "lead", action: "...", timing: "today" | "this_week" | "next_week" | "later" | null }. Examples: { actor: "lead", action: "send last 3 bank statements", timing: null }, { actor: "rep", action: "follow up Monday", timing: "next_week" }. Only set timing when the input names a specific window.
- Future ambition without a discrete next action ("wants 3 more vehicles") goes in use_of_funds.detail, NOT pending_actions.

STACKING DETECTION (three independent fields):
Stacking = the lead carries, currently carries, or has recently taken multiple concurrent funded loan positions (typically MCAs).

1. has_stacked_history (boolean):
   The borrower has stacked at SOME POINT — past or present. Set true on any prior multi-position activity, even if currently paid down. Examples: "had 3 MCAs last year, paid off", "previously stacked", "old [LENDER] balances paid".
   Set false when no stacking signal at all is present. Default: false.

2. current_active_positions (object | null):
   The borrower is CURRENTLY paying multiple positions. Return null if not stacked right now or unknown.
   When set, return:
   - count (integer | null): the explicit number of active positions if stated; null if implied but not numbered
   - total_debt_usd (integer | null): integer dollars of outstanding stacked debt if stated; null otherwise
   Trigger phrases: "X positions", "X-stacked", "X active MCAs", "in Nth position", "Xnd/Xrd/Xth position" (ordinal — e.g. "2nd position" → count=2, "3rd position" → count=3), "has 2 mca", "currently paying [LENDER1] and [LENDER2]", "stacked", lists of [LENDER] - $X frequency entries.
   has_stacked_history MUST be true whenever current_active_positions is non-null.

3. recent_stacking_activity (object, always present):
   The borrower is ACTIVELY stacking — taking new loans on top of existing ones, recently.
   Fields:
   - active (boolean): true if input describes a new loan taken on top of prior positions within roughly 30-90 days; false otherwise
   - window ("last_30d" | "last_60d" | "last_90d" | null): the stated/implied recency window, or null if active but unstated
   Trigger phrases: "took another loan two weeks ago", "got a new MCA last month on top of...", "just signed a 4th position", "recently stacked", "added a position this week".
   When active=true, has_stacked_history MUST be true.

These three fields are independent. Possible combinations:
- All clean: has_stacked_history=false, current_active_positions=null, recent_stacking_activity={active:false, window:null}
- Past stacker, clean now: has_stacked_history=true, current_active_positions=null, recent_stacking_activity={active:false, window:null}
- Currently stacked, no recent change: has_stacked_history=true, current_active_positions={...}, recent_stacking_activity={active:false, window:null}
- Actively stacking: has_stacked_history=true, current_active_positions={...}, recent_stacking_activity={active:true, window:"last_30d"}

OUTPUT:
Return a single JSON object matching the provided schema. Strict JSON. No prose, no markdown fences, no commentary.`;

export const PIPELINE_AI_OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [
    '_extraction_scope',
    'skip_reason',
    'industry',
    'monthly_revenue',
    'use_of_funds',
    'requested_amount',
    'product_interest',
    'pending_actions',
    'has_stacked_history',
    'current_active_positions',
    'recent_stacking_activity',
  ],
  properties: {
    _extraction_scope: { const: 'lead_only' },
    skip_reason: {
      anyOf: [
        { type: 'null' },
        { type: 'string', enum: ['contact_info_only', 'too_short', 'unrelated', 'unintelligible', 'no_signal'] },
      ],
    },
    industry: { type: 'string' },
    monthly_revenue: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['value_usd', 'raw'],
          properties: {
            value_usd: { type: 'integer' },
            raw: { type: 'string' },
          },
        },
      ],
    },
    use_of_funds: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['category', 'detail'],
          properties: {
            category: {
              enum: ['equipment', 'working_capital', 'debt_consolidation', 'real_estate', 'expansion', 'unspecified'],
            },
            detail: { type: ['string', 'null'] },
          },
        },
      ],
    },
    requested_amount: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['value_usd', 'raw'],
          properties: {
            value_usd: { type: 'integer' },
            raw: { type: 'string' },
          },
        },
      ],
    },
    product_interest: {
      type: 'array',
      items: { enum: ['MCA', 'LOC', 'HELOC', 'SBA', 'EQUIPMENT', 'CRE', 'BRIDGE'] },
    },
    pending_actions: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['actor', 'action', 'timing'],
        properties: {
          actor: { enum: ['rep', 'lead'] },
          action: { type: 'string' },
          timing: {
            anyOf: [{ type: 'null' }, { type: 'string', enum: ['today', 'this_week', 'next_week', 'later'] }],
          },
        },
      },
    },
    has_stacked_history: { type: 'boolean' },
    current_active_positions: {
      anyOf: [
        { type: 'null' },
        {
          type: 'object',
          additionalProperties: false,
          required: ['count', 'total_debt_usd'],
          properties: {
            count: { type: ['integer', 'null'] },
            total_debt_usd: { type: ['integer', 'null'] },
          },
        },
      ],
    },
    recent_stacking_activity: {
      type: 'object',
      additionalProperties: false,
      required: ['active', 'window'],
      properties: {
        active: { type: 'boolean' },
        window: {
          anyOf: [{ type: 'null' }, { type: 'string', enum: ['last_30d', 'last_60d', 'last_90d'] }],
        },
      },
    },
  },
} as const;

export const PIPELINE_INBOUND_BLOCKED_STAGES = new Set<DealStage>([
  DealStage.NEW_LEAD,
  DealStage.ENGAGED_INTERESTED,
  DealStage.FUNDED,
  DealStage.CLOSED,
]);
const pipelineDealQueues = new Map<string, Promise<PipelineAiSignals | null>>();

function meaningfulWords(text: string): string[] {
  return text
    .replace(/\[[A-Z_]+\]/g, ' ')
    .split(/\s+/u)
    .map((word) => word.replace(/[^a-zA-Z0-9'$-]/g, '').trim())
    .filter((word) => word.length > 1);
}

function hasCompactPipelineSignal(text: string): boolean {
  const normalized = text.toLowerCase();
  const hasMoneyValue = /\$?\s*\d[\d,.]*(?:\s?[km])?\+?\b/i.test(text);
  const hasPipelineContext =
    /\b(monthly|gross|revenue|sales|funding|capital|need|needs|want|wants|looking|seeking|asking|requesting|receive|receiving|borrow|borrowing|equipment|inventory|debt|payroll|mca|heloc|sba|loc|line of credit|working capital|positions?|stacked)\b/.test(
      normalized,
    );

  const hasStackingCount = /\b\d+\s+positions?\b|\b\d+[-\s]stacked\b|\b\d+(?:st|nd|rd|th)\s+positions?\b/i.test(text);

  return (hasMoneyValue && hasPipelineContext) || hasStackingCount;
}

function parsePipelineMoneyToken(amountRaw: string, suffixRaw?: string | null): number | null {
  const normalized = String(amountRaw || '')
    .replace(/,/g, '')
    .trim();
  if (!normalized) return null;

  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const suffix = String(suffixRaw || '')
    .trim()
    .toLowerCase();
  if (suffix === 'm') return Math.round(amount * 1_000_000);
  if (suffix === 'k') return Math.round(amount * 1_000);
  return Math.round(amount);
}

function parsePipelineMoneyLabel(label: string): number | null {
  const normalized = String(label || '').trim();
  if (!normalized) return null;

  const rangeMatch = normalized.match(/^\$?\s*([\d,.]+)\s*([kKmM]?)\s*(?:-|to)\s*\$?\s*([\d,.]+)\s*([kKmM]?)\+?$/);
  if (rangeMatch) {
    const start = parsePipelineMoneyToken(rangeMatch[1], rangeMatch[2]);
    const end = parsePipelineMoneyToken(rangeMatch[3], rangeMatch[4]);
    if (start && end) return Math.round((start + end) / 2);
  }

  const singleMatch = normalized.match(/^\$?\s*([\d,.]+)\s*([kKmM]?)\+?$/);
  if (!singleMatch) return null;
  return parsePipelineMoneyToken(singleMatch[1], singleMatch[2]);
}

export function extractDeterministicRequestedAmount(text: string): { value_usd: number; raw: string } | null {
  const normalized = String(text || '').trim();
  if (!normalized) return null;

  const askMatch = normalized.match(
    /\b(?:seeking|needs?|looking\s+for|looking\s+to\s+receive|looking\s+to\s+get|asking\s+for|wants?|requesting|receive|receiving|can\s+use|could\s+use|take|interested\s+in)\b(?:\s+(?:about|around|roughly))?(?:\s+for)?\s+(\$?\s*[\d,.]+\s*[kKmM]?(?:\s*(?:-|to)\s*\$?\s*[\d,.]+\s*[kKmM]?)?\+?)/i,
  );
  if (!askMatch) return null;

  const raw = askMatch[1].replace(/\s+/g, ' ').trim();
  const valueUsd = parsePipelineMoneyLabel(raw);
  if (!valueUsd || valueUsd < 1000) return null;

  return {
    value_usd: valueUsd,
    raw,
  };
}

function tryDeterministicStackingOverride(
  text: string,
  parsed: PipelineAiSignals,
  existingSignals: PipelineAiSignals | null,
): PipelineAiSignals {
  if (parsed.skip_reason !== 'too_short') return parsed;

  const normalized = text.toLowerCase();

  const buildStackingOverride = (count: number): PipelineAiSignals => ({
    _extraction_scope: 'lead_only',
    skip_reason: null,
    industry: existingSignals?.industry ?? parsed.industry,
    monthly_revenue: existingSignals?.monthly_revenue ?? parsed.monthly_revenue,
    use_of_funds: existingSignals?.use_of_funds ?? parsed.use_of_funds,
    requested_amount: existingSignals?.requested_amount ?? parsed.requested_amount,
    product_interest: existingSignals?.product_interest?.length
      ? existingSignals.product_interest
      : parsed.product_interest,
    pending_actions: existingSignals?.pending_actions?.length
      ? existingSignals.pending_actions
      : parsed.pending_actions,
    has_stacked_history: true,
    current_active_positions: {
      count,
      total_debt_usd: existingSignals?.current_active_positions?.total_debt_usd ?? null,
    },
    recent_stacking_activity: existingSignals?.recent_stacking_activity ?? { active: false, window: null },
  });

  const posMatch = normalized.match(/\b(\d+)\s+positions?\b/);
  if (posMatch) {
    const count = parseInt(posMatch[1], 10);
    if (count >= 1 && count <= 20) return buildStackingOverride(count);
  }

  const stackMatch = normalized.match(/\b(\d+)[-\s]stacked\b/);
  if (stackMatch) {
    const count = parseInt(stackMatch[1], 10);
    if (count >= 1 && count <= 20) return buildStackingOverride(count);
  }

  const ordinalPosMatch = normalized.match(/\b(\d+)(?:st|nd|rd|th)\s+positions?\b/);
  if (ordinalPosMatch) {
    const count = parseInt(ordinalPosMatch[1], 10);
    if (count >= 2 && count <= 20) return buildStackingOverride(count);
  }

  return parsed;
}

function applyDeterministicPipelineOverrides(
  text: string,
  parsed: PipelineAiSignals,
  existingSignals: PipelineAiSignals | null,
): PipelineAiSignals {
  const withStacking = tryDeterministicStackingOverride(text, parsed, existingSignals);
  const requestedAmount = extractDeterministicRequestedAmount(text);
  if (!requestedAmount) return withStacking;

  return {
    ...withStacking,
    skip_reason:
      withStacking.skip_reason === 'too_short' || withStacking.skip_reason === 'no_signal'
        ? null
        : withStacking.skip_reason,
    requested_amount: requestedAmount,
  };
}

export function getPipelineAiLocalSkipReason(text: string | null | undefined): PipelineSkipReason | null {
  const normalized = String(text || '').trim();
  if (!normalized) return 'too_short';

  const contactOnly = /^(?:\[[A-Z_]+\]|[\w.%+-]+@[\w.-]+\.[A-Z]{2,}|\+?[\d\s().-]{7,}|https?:\/\/\S+)$/i.test(
    normalized,
  );
  if (contactOnly) return 'contact_info_only';

  if (hasCompactPipelineSignal(normalized)) return null;

  return meaningfulWords(normalized).length < 5 ? 'too_short' : null;
}

export function canUserAccessPipelineDeal(
  user: AuthRequest['user'],
  deal: { assignedRepId?: string | null; assistingRepIds?: unknown },
): boolean {
  if (isAdminLike(user)) return true;
  if (!user?.id) return false;
  if (deal.assignedRepId === user.id) return true;
  const assistingRepIds = Array.isArray(deal.assistingRepIds)
    ? deal.assistingRepIds.filter((repId): repId is string => typeof repId === 'string')
    : [];
  return assistingRepIds.includes(user.id);
}

export function buildPipelineAiPayload(args: {
  existingSignals?: unknown;
  inputType: PipelineInputType;
  text: string;
  stageAtTime?: DealStage | null;
  productAtTime?: ProductType | null;
}): string {
  const existingSignals = args.existingSignals ? JSON.stringify(args.existingSignals) : '(none)';
  const stageAtTime = args.stageAtTime || '(none)';
  const productAtTime = args.productAtTime || '(none)';
  const indentedText = String(args.text || '')
    .split(/\r?\n/u)
    .map((line) => `  ${line}`)
    .join('\n');

  return [
    '[EXISTING SIGNALS]',
    existingSignals,
    '',
    '[NEW INPUT]',
    `type: ${args.inputType}`,
    `stage_at_time: ${stageAtTime}`,
    `product_at_time: ${productAtTime}`,
    'text: |',
    indentedText,
  ].join('\n');
}

function isPipelineSignals(value: unknown): value is PipelineAiSignals {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const payload = value as Partial<PipelineAiSignals>;
  return (
    payload._extraction_scope === 'lead_only' &&
    (payload.skip_reason === null || typeof payload.skip_reason === 'string') &&
    typeof payload.industry === 'string' &&
    Array.isArray(payload.product_interest) &&
    Array.isArray(payload.pending_actions) &&
    typeof payload.has_stacked_history === 'boolean' &&
    !!payload.recent_stacking_activity &&
    typeof payload.recent_stacking_activity === 'object' &&
    typeof payload.recent_stacking_activity.active === 'boolean'
  );
}

function extractTextFromAnthropicResponse(response: Anthropic.Messages.Message): string | null {
  const parsedOutput = (response as unknown as { parsed_output?: unknown }).parsed_output;
  if (parsedOutput && typeof parsedOutput === 'object') return JSON.stringify(parsedOutput);

  for (const block of response.content) {
    if (block.type === 'text') return block.text.trim();
    const maybeJson = block as unknown as { json?: unknown; data?: unknown };
    if (maybeJson.json && typeof maybeJson.json === 'object') return JSON.stringify(maybeJson.json);
    if (maybeJson.data && typeof maybeJson.data === 'object') return JSON.stringify(maybeJson.data);
  }

  return null;
}

async function getPipelineAiConfig(): Promise<PipelineAiConfig | null> {
  const settings = await prisma.systemSetting.findMany({
    where: { key: { in: ['anthropicApiKey', 'anthropicModel'] } },
  });
  const map = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));
  const apiKey = String(map.anthropicApiKey || '');

  if (!apiKey) {
    logger.warn('AI: Pipeline extraction skipped, Anthropic API key missing');
    return null;
  }

  const configuredModel = String(map.anthropicModel || '');
  const model = configuredModel.includes('claude-sonnet-4-5') ? configuredModel : DEFAULT_ANTHROPIC_MODEL;
  return { apiKey, model };
}

async function readExistingPipelineSignals(deal: {
  pipelineAiSignals?: unknown;
  smsConversationId?: string | null;
  leadId?: string | null;
}): Promise<unknown | null> {
  if (deal.pipelineAiSignals) return deal.pipelineAiSignals;
  const orFilters = [
    ...(deal.smsConversationId ? [{ id: deal.smsConversationId }] : []),
    ...(deal.leadId ? [{ leadId: deal.leadId }] : []),
  ];
  if (orFilters.length === 0) return null;

  const conversations = await prisma.conversation.findMany({
    where: { OR: orFilters },
    orderBy: { updatedAt: 'desc' },
    select: { aiSignals: true },
  });
  const conversation = conversations.find((item) => item.aiSignals);
  return conversation?.aiSignals || null;
}

export function enqueuePipelineExtraction(
  dealId: string,
  task: () => Promise<PipelineAiSignals | null>,
): Promise<PipelineAiSignals | null> {
  const previous = pipelineDealQueues.get(dealId) || Promise.resolve(null);
  const queued = previous.catch(() => null).then(task);
  pipelineDealQueues.set(dealId, queued);
  void queued.finally(() => {
    if (pipelineDealQueues.get(dealId) === queued) pipelineDealQueues.delete(dealId);
  });
  return queued;
}

export async function previewPipelineSignals(args: {
  inputType: PipelineInputType;
  text: string;
  stageAtTime?: DealStage | null;
  productAtTime?: ProductType | null;
}): Promise<PipelineAiSignals | null> {
  const startedAt = Date.now();
  const localSkipReason = getPipelineAiLocalSkipReason(args.text);
  if (localSkipReason) {
    logger.info('AI: previewPipelineSignals skipped by local guard', {
      inputType: args.inputType,
      skipReason: localSkipReason,
      durationMs: Date.now() - startedAt,
    });
    return null;
  }

  try {
    const cfg = await getPipelineAiConfig();
    if (!cfg) return null;

    const payload = buildPipelineAiPayload({
      existingSignals: null,
      inputType: args.inputType,
      text: args.text,
      stageAtTime: args.stageAtTime,
      productAtTime: args.productAtTime,
    });
    const client = new Anthropic({ apiKey: cfg.apiKey });
    const response = await client.messages.create({
      model: cfg.model,
      max_tokens: 2048,
      temperature: 0,
      system: [{ type: 'text', text: PIPELINE_AI_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      output_config: { format: { type: 'json_schema', schema: PIPELINE_AI_OUTPUT_SCHEMA } },
      messages: [{ role: 'user', content: payload }],
    });
    const raw = extractTextFromAnthropicResponse(response);
    const extractedJson = extractJsonObjectFromLlmResponse(raw);
    if (!extractedJson) {
      logger.error('AI: previewPipelineSignals empty response');
      return null;
    }

    const parsed = JSON.parse(extractedJson) as unknown;
    if (!isPipelineSignals(parsed)) {
      logger.error('AI: previewPipelineSignals invalid schema');
      return null;
    }

    const finalParsed = applyDeterministicPipelineOverrides(args.text, parsed, null);
    const usage = response.usage;
    logger.info('AI: previewPipelineSignals complete', {
      model: cfg.model,
      inputType: args.inputType,
      inputTokens: usage?.input_tokens,
      outputTokens: usage?.output_tokens,
      cacheCreationInputTokens: usage?.cache_creation_input_tokens,
      cacheReadInputTokens: usage?.cache_read_input_tokens,
      skipReason: finalParsed.skip_reason,
      durationMs: Date.now() - startedAt,
    });

    return finalParsed;
  } catch (error) {
    logger.error('AI: previewPipelineSignals failed', {
      inputType: args.inputType,
      error: (error as Error).message,
      durationMs: Date.now() - startedAt,
    });
    return null;
  }
}

export async function extractPipelineSignals(args: {
  dealId: string;
  inputType: PipelineInputType;
  text: string;
  stageAtTime?: DealStage | null;
  productAtTime?: ProductType | null;
}): Promise<PipelineAiSignals | null> {
  return enqueuePipelineExtraction(args.dealId, async () => {
    const startedAt = Date.now();
    const localSkipReason = getPipelineAiLocalSkipReason(args.text);
    if (localSkipReason) {
      logger.info('AI: extractPipelineSignals skipped by local guard', {
        dealId: args.dealId,
        inputType: args.inputType,
        skipReason: localSkipReason,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }

    try {
      const cfg = await getPipelineAiConfig();
      if (!cfg) return null;

      const deal = await prisma.deal.findUnique({
        where: { id: args.dealId },
        select: {
          id: true,
          stage: true,
          productType: true,
          pipelineAiSignals: true,
          smsConversationId: true,
          leadId: true,
          assignedRepId: true,
        },
      });

      if (!deal) {
        logger.warn('AI: extractPipelineSignals deal not found', { dealId: args.dealId });
        return null;
      }

      const existingSignals = await readExistingPipelineSignals(deal);
      const payload = buildPipelineAiPayload({
        existingSignals,
        inputType: args.inputType,
        text: args.text,
        stageAtTime: args.stageAtTime ?? deal.stage,
        productAtTime: args.productAtTime ?? deal.productType,
      });
      const client = new Anthropic({ apiKey: cfg.apiKey });
      const response = await client.messages.create({
        model: cfg.model,
        max_tokens: 2048,
        temperature: 0,
        system: [{ type: 'text', text: PIPELINE_AI_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
        output_config: { format: { type: 'json_schema', schema: PIPELINE_AI_OUTPUT_SCHEMA } },
        messages: [{ role: 'user', content: payload }],
      });
      const raw = extractTextFromAnthropicResponse(response);
      const extractedJson = extractJsonObjectFromLlmResponse(raw);
      if (!extractedJson) {
        logger.error('AI: extractPipelineSignals empty response', { dealId: args.dealId });
        return null;
      }

      const parsed = JSON.parse(extractedJson) as unknown;
      if (!isPipelineSignals(parsed)) {
        logger.error('AI: extractPipelineSignals invalid schema', { dealId: args.dealId });
        return null;
      }

      const existingSignalsTyped = isPipelineSignals(existingSignals) ? existingSignals : null;
      const finalParsed = applyDeterministicPipelineOverrides(args.text, parsed, existingSignalsTyped);

      await prisma.deal.update({
        where: { id: args.dealId },
        data: {
          pipelineAiSignals: finalParsed as unknown as object,
          pipelineAiUpdatedAt: new Date(),
        },
      });

      const io = getSocketIO();
      if (io && deal.assignedRepId) {
        io.to(`inbox:${deal.assignedRepId}`).emit('deal:pipeline-updated', { dealId: args.dealId });
      }

      const usage = response.usage;
      logger.info('AI: extractPipelineSignals complete', {
        dealId: args.dealId,
        model: cfg.model,
        inputType: args.inputType,
        inputTokens: usage?.input_tokens,
        outputTokens: usage?.output_tokens,
        cacheCreationInputTokens: usage?.cache_creation_input_tokens,
        cacheReadInputTokens: usage?.cache_read_input_tokens,
        skipReason: finalParsed.skip_reason,
        durationMs: Date.now() - startedAt,
      });

      return finalParsed;
    } catch (error) {
      logger.error('AI: extractPipelineSignals failed', {
        dealId: args.dealId,
        inputType: args.inputType,
        error: (error as Error).message,
        durationMs: Date.now() - startedAt,
      });
      return null;
    }
  });
}

export async function queuePipelineExtractionForInboundSms(args: {
  conversationId?: string | null;
  leadId?: string | null;
  dealIds?: string[];
  text: string;
}): Promise<{ queued: number; skippedReason?: PipelineSkipReason }> {
  const targets = await findPipelineExtractionTargetsForInboundSms(args);
  if (targets.skippedReason) return { queued: 0, skippedReason: targets.skippedReason };

  for (const deal of targets.deals) {
    void extractPipelineSignals({
      dealId: deal.id,
      inputType: 'client_sms',
      text: args.text,
      stageAtTime: deal.stage,
      productAtTime: deal.productType,
    }).catch((error) =>
      logger.error('AI: inbound Pipeline extraction enqueue failed', {
        dealId: deal.id,
        conversationId: args.conversationId || null,
        error: (error as Error).message,
      }),
    );
  }

  return { queued: targets.deals.length };
}

export async function findPipelineExtractionTargetsForInboundSms(args: {
  conversationId?: string | null;
  leadId?: string | null;
  dealIds?: string[];
  text: string;
}): Promise<{ deals: RelatedPipelineDeal[]; skippedReason?: PipelineSkipReason }> {
  const skippedReason = getPipelineAiLocalSkipReason(args.text);
  if (skippedReason) return { deals: [], skippedReason };

  const orFilters: Array<{ smsConversationId?: string; leadId?: string; id?: { in: string[] } }> = [];
  if (args.conversationId) orFilters.push({ smsConversationId: args.conversationId });
  if (args.leadId) orFilters.push({ leadId: args.leadId });
  const dealIds = Array.from(new Set((args.dealIds || []).filter((id) => typeof id === 'string' && id.trim())));
  if (dealIds.length > 0) orFilters.push({ id: { in: dealIds } });
  if (orFilters.length === 0) return { deals: [] };

  const deals = await prisma.deal.findMany({
    where: {
      OR: orFilters,
      stage: { notIn: [...PIPELINE_INBOUND_BLOCKED_STAGES] },
    },
    select: { id: true, stage: true, productType: true },
  });
  const uniqueDeals = Array.from(new Map(deals.map((deal) => [deal.id, deal])).values()) as RelatedPipelineDeal[];

  return { deals: uniqueDeals };
}
