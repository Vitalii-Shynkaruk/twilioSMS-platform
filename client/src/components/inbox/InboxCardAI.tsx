// © BuyReadySite.com — AI расширения для inbox card (HOT badge, signal chips, score bar)
import { clsx } from 'clsx';
import type { AISignals, Conversation } from '../../types';
import { PHASE1_LEAN } from '../../config/featureFlags';

type ConvSlice = Pick<Conversation, 'aiClassification' | 'aiSignals' | 'aiLeadScore' | 'nextFollowupAt'>;

interface AICardProps {
  conversation: ConvSlice;
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
  const hasRevenue = !!signals.revenue;
  const hasAsk = !!signals.ask;
  const hasUrgency = !!signals.urgency;
  const hasIndustry = !!signals.industry;
  const hasHelocFit = !!signals.helocFitFlag;
  const followupLabel =
    (typeof signals.suggestedFollowupReason === 'string' && signals.suggestedFollowupReason.trim()) ||
    (conversation.nextFollowupAt ? 'scheduled' : '');

  if (PHASE1_LEAN) {
    if (!hasRevenue) return null;
    return (
      <div className="ai-card-chips" aria-label="AI revenue signal">
        <span className="chip rev" title="Monthly revenue (extracted)">
          💰<strong>{signals.revenue}</strong>
        </span>
      </div>
    );
  }

  if (!isHot && !hasRevenue && !hasAsk && !hasUrgency && !hasIndustry && !hasHelocFit && !followupLabel) return null;

  return (
    <div className="ai-card-chips" aria-label="AI signals">
      {isHot && <span className="badge-hot">🔥 HOT</span>}
      {hasRevenue && (
        <span className="chip rev" title="Monthly revenue (extracted)">
          💰<strong>{signals.revenue}</strong>
        </span>
      )}
      {hasAsk && (
        <span className="chip" title="Capital ask (extracted)">
          📊<strong>{signals.ask}</strong>
        </span>
      )}
      {hasUrgency && (
        <span className="chip" title="Urgency cue">
          ⚡{signals.urgency}
        </span>
      )}
      {hasIndustry && (
        <span className="chip" title="Industry">
          🏗{signals.industry}
        </span>
      )}
      {hasHelocFit && (
        <span className="chip" title="HELOC fit">
          🏦HELOC fit
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
