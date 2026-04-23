// © BuyReadySite.com — AI-расширения для карточки conversation в inbox-листе
import { clsx } from 'clsx';
import type { AISignals, Conversation } from '../../types';

interface InboxCardAIProps {
  conversation: Pick<Conversation, 'aiClassification' | 'aiSignals' | 'aiLeadScore'>;
}

const TOP_SIGNALS: Array<{ key: keyof AISignals; icon: string }> = [
  { key: 'revenue', icon: '💰' },
  { key: 'ask', icon: '📊' },
  { key: 'urgency', icon: '⚡' },
];

export function InboxCardAIChips({ conversation }: InboxCardAIProps) {
  const signals = (conversation.aiSignals || {}) as AISignals;
  const isHot = conversation.aiClassification === 'HOT';
  const chips = TOP_SIGNALS.map((s) => {
    const v = signals[s.key];
    if (!v) return null;
    return (
      <span
        key={s.key}
        className={clsx(
          'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono',
          s.key === 'revenue'
            ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/25'
            : 'bg-dark-700/80 text-dark-200 border border-dark-600/60',
        )}
      >
        <span>{s.icon}</span>
        <span className="font-medium">{v}</span>
      </span>
    );
  }).filter(Boolean);

  if (!isHot && chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1 mt-1">
      {isHot && (
        <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-wider bg-red-500/20 text-red-300 border border-red-500/40">
          🔥 HOT
        </span>
      )}
      {chips}
    </div>
  );
}

export function InboxCardScoreBar({ conversation }: InboxCardAIProps) {
  const score = conversation.aiLeadScore ?? 0;
  if (score <= 0) return null;
  // Цвет полосы (число НЕ показываем — только полоса, согласно прототипу)
  const colorCls = score >= 80 ? 'bg-red-500' : score >= 50 ? 'bg-amber-500' : 'bg-dark-600';
  const widthPct = Math.min(100, Math.max(2, score));
  return (
    <div
      className="h-[3px] w-full bg-dark-800/60 mt-2 rounded-sm overflow-hidden"
      aria-label={`Lead score ${score}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={score}
    >
      <div className={clsx('h-full transition-all duration-500', colorCls)} style={{ width: `${widthPct}%` }} />
    </div>
  );
}
