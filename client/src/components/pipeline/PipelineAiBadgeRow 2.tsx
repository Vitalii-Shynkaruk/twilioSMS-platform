import type { PipelineAiSignals } from '../../types';
import { getPipelineAiBadges } from './pipelineAiSignals';

interface PipelineAiBadgeRowProps {
  signals?: PipelineAiSignals | null;
  compact?: boolean;
  className?: string;
}

export default function PipelineAiBadgeRow({ signals, compact = false, className = '' }: PipelineAiBadgeRowProps) {
  const badges = getPipelineAiBadges(signals);
  if (badges.length === 0) return null;

  return (
    <div className={`pipeline-ai-badge-row ${compact ? 'pipeline-ai-badge-row--compact' : ''} ${className}`.trim()}>
      {badges.map((badge) => (
        <span key={badge.key} className={`pipeline-ai-badge pipeline-ai-badge--${badge.key}`} title={badge.title}>
          <span className="pipeline-ai-badge__label">{badge.label}</span>
          <span className="pipeline-ai-badge__value">{badge.value}</span>
        </span>
      ))}
    </div>
  );
}
