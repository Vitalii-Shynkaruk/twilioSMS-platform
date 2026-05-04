import type { PipelineAiSignals } from '../../types';
import StackingChip from './StackingChip';
import { formatPipelineAiAge, formatUseOfFundsCategory } from './pipelineAiSignals';

interface PipelineAiInlineBarProps {
  signals?: PipelineAiSignals | null;
  updatedAt?: string | null;
}

function InlineChip({ label, value, tone, title }: { label: string; value?: string; tone: string; title?: string }) {
  if (!value) {
    return (
      <span className="pipeline-ai-inline-chip pipeline-ai-inline-chip--empty">
        <span className="pipeline-ai-inline-chip__label">{label}</span>
        <span className="pipeline-ai-inline-chip__value">?</span>
      </span>
    );
  }

  return (
    <span className={`pipeline-ai-inline-chip pipeline-ai-inline-chip--${tone}`} title={title || `${label}: ${value}`}>
      <span className="pipeline-ai-inline-chip__label">{label}</span>
      <span className="pipeline-ai-inline-chip__value">{value}</span>
    </span>
  );
}

export default function PipelineAiInlineBar({ signals, updatedAt }: PipelineAiInlineBarProps) {
  const industry = signals?.skip_reason ? '' : signals?.industry?.trim() || '';
  const revenue = signals?.skip_reason ? '' : signals?.monthly_revenue?.raw || '';
  const useOfFunds = signals?.skip_reason || !signals?.use_of_funds ? '' : formatUseOfFundsCategory(signals.use_of_funds.category);
  const useOfFundsTitle = signals?.use_of_funds?.detail ? `Use of funds: ${signals.use_of_funds.detail}` : undefined;

  return (
    <div className="pipeline-ai-inline-bar" aria-label="Pipeline AI extracted deal signals">
      <span className="pipeline-ai-inline-label">AI</span>
      <InlineChip label="Industry" value={industry} tone="industry" />
      <InlineChip label="Revenue" value={revenue} tone="revenue" />
      <InlineChip label="Use" value={useOfFunds} tone="use" title={useOfFundsTitle} />
      <StackingChip signals={signals} className="pipeline-ai-inline-stacking" />
      {signals?.skip_reason ? <span className="pipeline-ai-inline-skip">Skipped · {signals.skip_reason}</span> : null}
      <span className="pipeline-ai-inline-source">{formatPipelineAiAge(updatedAt)}</span>
    </div>
  );
}