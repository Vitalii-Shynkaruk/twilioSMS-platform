// © BuyReadySite.com — AI расширения для inbox card (HOT badge, signal chips, score bar)
import { clsx } from 'clsx';
import type { AISignals, Conversation } from '../../types';

type ConvSlice = Pick<Conversation, 'aiClassification' | 'aiSignals' | 'aiLeadScore'>;

interface AICardProps {
  conversation: ConvSlice;
}

/* HOT badge + signal chips (revenue / ask / urgency) */
export function InboxCardAIChips({ conversation }: AICardProps) {
  const cls = conversation.aiClassification;
  const signals = (conversation.aiSignals || {}) as AISignals;
  const isHot = cls === 'HOT';
  const hasRevenue = !!signals.revenue;
  const hasAsk = !!signals.ask;
  const hasUrgency = !!signals.urgency;

  if (!isHot && !hasRevenue && !hasAsk && !hasUrgency) return null;

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
    </div>
  );
}

/* Тонкая score bar — без числа (требование прототипа) */
export function InboxCardScoreBar({ conversation }: AICardProps) {
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
