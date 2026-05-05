import type { PipelineAiSignals } from '../../types';
import { resolveStackingChip } from './stackingChipRules';

interface StackingChipProps {
  signals?: PipelineAiSignals | null;
  compact?: boolean;
  className?: string;
}

export default function StackingChip({ signals, compact = false, className = '' }: StackingChipProps) {
  const chip = resolveStackingChip(signals);
  if (!chip) return null;

  const classes = [
    'stacking-chip',
    `stacking-chip--${chip.tone}`,
    chip.isActive ? 'stacking-chip--active' : '',
    compact ? 'stacking-chip--compact' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <span className={classes} title={chip.title} aria-label={`Stacking status: ${chip.label}`}>
      {chip.isActive ? <span className="stacking-chip__pulse" aria-hidden="true" /> : null}
      <span className="stacking-chip__label">{chip.label}</span>
    </span>
  );
}
