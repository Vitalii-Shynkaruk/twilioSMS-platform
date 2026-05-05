// © BuyReadySite.com — AI расширения для inbox card (HOT badge, signal chips, score bar)
import { clsx } from 'clsx';
import type { AISignals, Conversation } from '../../types';
import { PHASE1_LEAN } from '../../config/featureFlags';

type ConvSlice = Pick<
  Conversation,
  | 'aiClassification'
  | 'aiSignals'
  | 'aiLeadScore'
  | 'nextFollowupAt'
  | 'followupTime'
  | 'extractedRevenue'
  | 'extractedAsk'
  | 'extractedIndustry'
  | 'helocFitFlag'
>;

interface AICardProps {
  conversation: ConvSlice;
}

function isMeaningfulSignalLabel(value: unknown): value is string {
  return (
    typeof value === 'string'
    && value.trim().length > 0
    && !['unknown', 'n/a', 'na', '—'].includes(value.trim().toLowerCase())
  );
}

function formatRevenueLabel(monthlyRevenue: number | null): string | null {
  if (monthlyRevenue == null || !Number.isFinite(monthlyRevenue) || monthlyRevenue <= 0) return null;
  if (monthlyRevenue >= 1_000_000) {
    return `$${(monthlyRevenue / 1_000_000).toFixed(monthlyRevenue % 1_000_000 === 0 ? 0 : 1)}M/mo`;
  }
  if (monthlyRevenue >= 1_000) {
    return `$${Math.round(monthlyRevenue / 1_000)}k/mo`;
  }
  return `$${Math.round(monthlyRevenue)}/mo`;
}

/**
 * Chips на карточке inbox.
 * PHASE1_LEAN=true (23.04): только revenue chip.
 * PHASE1_LEAN=false (Phase 2): HOT + revenue + ask + urgency.
 */
export function InboxCardAIChips({ conversation }: AICardProps) {
  const cls = conversation.aiClassification;
  const signals = (conversation.aiSignals || {}) as AISignals;
  const isHot = cls === 'HOT';
  const revenueMonthly =
    typeof signals.revenueMonthly === 'number'
      ? Math.round(signals.revenueMonthly)
      : conversation.extractedRevenue || null;
  const revenueLabel = signals.revenue || formatRevenueLabel(revenueMonthly);
  const askLabel = signals.ask || conversation.extractedAsk || null;
  const industryLabel = signals.industry || conversation.extractedIndustry || null;
  const creditProfileLabel = isMeaningfulSignalLabel(signals.creditProfile) ? signals.creditProfile.trim() : null;
  const propertyOwnershipLabel = isMeaningfulSignalLabel(signals.propertyOwnership)
    ? signals.propertyOwnership.trim()
    : null;
  const helocFitValue =
    typeof signals.helocFitFlag === 'boolean'
      ? signals.helocFitFlag
      : typeof conversation.helocFitFlag === 'boolean'
        ? conversation.helocFitFlag
        : null;
  const hasRevenue = !!revenueLabel;
  const hasAsk = !!askLabel;
  const hasCredit = !!creditProfileLabel;
  const hasProperty = !!propertyOwnershipLabel;
  const hasUrgency = !!signals.urgency;
  const hasIndustry = !!industryLabel;
  const hasHelocFit = typeof helocFitValue === 'boolean';
  const followupAt = conversation.followupTime || conversation.nextFollowupAt;
  const followupLabel =
    (typeof signals.suggestedFollowupReason === 'string' && signals.suggestedFollowupReason.trim()) ||
    (followupAt ? 'scheduled' : '');

  if (PHASE1_LEAN) {
    if (!hasRevenue) return null;
    return (
      <div className="ai-card-chips" aria-label="AI revenue signal">
        <span className="chip rev" title="Monthly revenue (extracted)">
          💰<strong>{revenueLabel}</strong>
        </span>
      </div>
    );
  }

  if (!isHot && !hasRevenue && !hasAsk && !hasCredit && !hasProperty && !hasUrgency && !hasIndustry && !hasHelocFit && !followupLabel) {
    return null;
  }

  return (
    <div className="ai-card-chips" aria-label="AI signals">
      {isHot && <span className="badge-hot">🔥 HOT</span>}
      {hasRevenue && (
        <span className="chip rev" title="Monthly revenue (extracted)">
          💰<strong>{revenueLabel}</strong>
        </span>
      )}
      {hasAsk && (
        <span className="chip" title="Capital ask (extracted)">
          📊<strong>{askLabel}</strong>
        </span>
      )}
      {hasCredit && (
        <span className="chip" title="Credit profile">
          💳<strong>{/credit/i.test(creditProfileLabel || '') ? creditProfileLabel : `${creditProfileLabel} credit`}</strong>
        </span>
      )}
      {hasProperty && (
        <span className="chip" title="Property ownership">
          🏠<strong>{propertyOwnershipLabel}</strong>
        </span>
      )}
      {hasUrgency && (
        <span className="chip" title="Urgency cue">
          ⚡{signals.urgency}
        </span>
      )}
      {hasIndustry && (
        <span className="chip" title="Industry">
          🏗{industryLabel}
        </span>
      )}
      {hasHelocFit && (
        <span className="chip" title="HELOC fit">
          {helocFitValue ? '🏦HELOC fit' : '🏦No HELOC fit'}
        </span>
      )}
      {followupLabel && (
        <span className="chip" title="Follow-up">
          ⏱{followupLabel}
        </span>
      )}
    </div>
  );
}

/**
 * Тонкая score bar — без числа. Скрыта в PHASE1_LEAN, возвращается в Phase 2.
 */
export function InboxCardScoreBar({ conversation }: AICardProps) {
  if (PHASE1_LEAN) return null;
  const score = Math.max(0, Math.min(100, Number(conversation.aiLeadScore || 0)));
  if (score <= 0) return null;
  const tier = score >= 80 ? 'high' : score >= 50 ? 'mid' : 'low';
  return (
    <div
      className="ai-score-bar"
      role="progressbar"
      aria-label="AI lead score"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
    >
      <div className={clsx('fill', tier)} style={{ width: `${score}%` }} />
    </div>
  );
}
