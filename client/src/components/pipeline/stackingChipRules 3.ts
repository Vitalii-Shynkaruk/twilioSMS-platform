import type { PipelineAiSignals } from '../../types';

export type StackingChipTone = 'first' | 'one' | 'two' | 'stacked' | 'history';

export interface StackingChipConfig {
  label: string;
  tone: StackingChipTone;
  isActive: boolean;
  title: string;
}

function hasSignalKey(signals: PipelineAiSignals, key: keyof PipelineAiSignals): boolean {
  return Object.prototype.hasOwnProperty.call(signals, key);
}

function formatDebtUsd(value: number): string {
  if (value >= 1000000) {
    const millions = value / 1000000;
    return `$${Number.isInteger(millions) ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `$${Math.round(value / 1000)}k`;
  }

  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function normalizeCount(count?: number | null): number | null {
  return typeof count === 'number' && Number.isFinite(count) ? count : null;
}

function resolveBaseChip(signals: PipelineAiSignals): Omit<StackingChipConfig, 'isActive'> | null {
  const currentPositions = signals.current_active_positions ?? null;
  const count = normalizeCount(currentPositions?.count);
  const isExplicitlyClean =
    hasSignalKey(signals, 'has_stacked_history') &&
    signals.has_stacked_history === false &&
    hasSignalKey(signals, 'current_active_positions') &&
    signals.current_active_positions === null;

  if (count !== null) {
    if (count >= 3) {
      return {
        label: `${count}-STACKED`,
        tone: 'stacked',
        title: `${count} active funding positions. Highest stacking urgency.`,
      };
    }

    if (count === 2) {
      return {
        label: '2-POSITIONS',
        tone: 'two',
        title: 'Two active funding positions. Monitor stacking pressure.',
      };
    }

    if (count === 1) {
      return {
        label: '1-POSITION',
        tone: 'one',
        title: 'One active funding position.',
      };
    }
  }

  if (isExplicitlyClean) {
    return {
      label: '1ST POSITION',
      tone: 'first',
      title: 'No stacking history detected. Clean first-position borrower.',
    };
  }

  if (currentPositions && typeof currentPositions.total_debt_usd === 'number') {
    return {
      label: 'POSITIONS',
      tone: 'two',
      title: 'Active funding positions detected; exact count is not available.',
    };
  }

  if (signals.has_stacked_history === true) {
    return {
      label: 'STACKED BEFORE',
      tone: 'history',
      title: 'Stacking history detected, with no active position count.',
    };
  }

  return null;
}

export function resolveStackingChip(signals?: PipelineAiSignals | null): StackingChipConfig | null {
  if (!signals) return null;

  const baseChip = resolveBaseChip(signals);
  const isActive = signals.recent_stacking_activity?.active === true;
  if (!baseChip && !isActive) return null;

  const currentPositions = signals.current_active_positions ?? null;
  const count = normalizeCount(currentPositions?.count);
  const debtLabel =
    count !== null && count >= 2 && typeof currentPositions?.total_debt_usd === 'number'
      ? ` · ${formatDebtUsd(currentPositions.total_debt_usd)}`
      : '';
  const activeLabel = isActive ? ' · ACTIVE' : '';

  if (!baseChip) {
    return {
      label: `STACKING${activeLabel}`,
      tone: 'stacked',
      isActive,
      title: 'Recent stacking activity detected.',
    };
  }

  return {
    label: `${baseChip.label}${debtLabel}${activeLabel}`,
    tone: isActive ? 'stacked' : baseChip.tone,
    isActive,
    title: baseChip.title,
  };
}
