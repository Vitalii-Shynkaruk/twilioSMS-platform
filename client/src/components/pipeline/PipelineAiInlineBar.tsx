import type { PipelineAiSignals } from '../../types';
import StackingChip from './StackingChip';
import { formatPipelineAiAge, formatPipelineAiMoney, formatUseOfFundsDisplayValue } from './pipelineAiSignals';

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
  const ask = signals?.skip_reason ? '' : formatPipelineAiMoney(signals?.requested_amount);
  const useOfFunds = signals?.skip_reason ? '' : signals ? formatUseOfFundsDisplayValue(signals) : '';
  const useOfFundsTitle = signals?.use_of_funds?.detail ? `Use of funds: ${signals.use_of_funds.detail}` : undefined;
  const askTitle = ask ? `Ask: ${ask}` : undefined;

  return (
    <div className="pipeline-ai-inline-bar" aria-label="Pipeline AI extracted deal signals">
      <span className="pipeline-ai-inline-label">AI</span>
      <InlineChip label="Industry" value={industry} tone="industry" />
      <InlineChip label="Revenue" value={revenue} tone="revenue" />
      <InlineChip label="Ask" value={ask} tone="ask" title={askTitle} />
      <InlineChip label="Use" value={useOfFunds} tone="use" title={useOfFundsTitle} />
      <StackingChip signals={signals} className="pipeline-ai-inline-stacking" />
      {signals?.skip_reason ? <span className="pipeline-ai-inline-skip">Skipped · {signals.skip_reason}</span> : null}
      <span className="pipeline-ai-inline-source">{formatPipelineAiAge(updatedAt)}</span>
    </div>
  );
}
