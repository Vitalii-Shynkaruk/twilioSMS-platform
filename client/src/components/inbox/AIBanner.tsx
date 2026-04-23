// © BuyReadySite.com — AI Intelligence Banner для Inbox thread
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import type { AISignals, Conversation } from '../../types';

interface AIBannerProps {
  conversation: Pick<
    Conversation,
    'aiClassification' | 'aiSignals' | 'isCaliforniaNumber' | 'aiClassifiedAt' | 'assignedRep'
  > & { assignedRep?: { firstName?: string; lastName?: string } };
}

const SIGNAL_DEFS: Array<{ key: keyof AISignals; icon: string; suffix?: string; quote?: boolean }> = [
  { key: 'revenue', icon: '💰' },
  { key: 'ask', icon: '📊', suffix: ' ask' },
  { key: 'urgency', icon: '⚡', quote: true },
  { key: 'product', icon: '🏦' },
  { key: 'industry', icon: '🏗' },
  { key: 'objections', icon: '⚠' },
];

export default function AIBanner({ conversation }: AIBannerProps) {
  const cls = conversation.aiClassification;
  const isHot = cls === 'HOT';
  const isCa = !!conversation.isCaliforniaNumber;
  const signals = (conversation.aiSignals || {}) as AISignals;
  const rep = conversation.assignedRep
    ? `${conversation.assignedRep.firstName || ''} ${conversation.assignedRep.lastName || ''}`.trim() || '—'
    : 'Unassigned';

  // Live-таймер для HOT (count up с aiClassifiedAt) — хук ДО early return
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isHot || !conversation.aiClassifiedAt) return;
    const start = new Date(conversation.aiClassifiedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isHot, conversation.aiClassifiedAt]);

  // Скрываем баннер если AI ещё не классифицировал conversation
  if (!cls) return null;

  const bannerCls = clsx(
    'px-4 py-2.5 border-b flex flex-col gap-1.5 text-xs',
    isHot && 'border-red-500/30 bg-gradient-to-r from-red-500/10 to-red-500/[0.03]',
    !isHot && isCa && 'border-orange-500/30 bg-gradient-to-r from-orange-500/10 to-orange-500/[0.03]',
    !isHot &&
      !isCa &&
      cls === 'WARM' &&
      'border-amber-500/20 bg-gradient-to-r from-amber-500/[0.06] to-amber-500/[0.02]',
    !isHot &&
      !isCa &&
      cls === 'NURTURE' &&
      'border-blue-500/20 bg-gradient-to-r from-blue-500/[0.06] to-blue-500/[0.02]',
  );

  const stateLabel = isHot
    ? `🔥 HOT${signals.ask ? ` · ${signals.ask} DEAL` : ''}`
    : isCa
      ? '⚠ CA COMPLIANCE · NO APR/RATE DISCUSSION'
      : cls === 'WARM'
        ? '◆ WARM · ENGAGE'
        : '◆ NURTURE · KEEP WARM';

  const stateBadgeCls = clsx(
    'inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold tracking-wide font-mono',
    isHot && 'bg-red-500/20 text-red-300 border border-red-500/40',
    !isHot && isCa && 'bg-orange-500/20 text-orange-300 border border-orange-500/40',
    !isHot && !isCa && cls === 'WARM' && 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
    !isHot && !isCa && cls === 'NURTURE' && 'bg-blue-500/15 text-blue-300 border border-blue-500/30',
  );

  const timerCls = clsx(
    'ml-2 font-mono text-[11px] font-bold px-1.5 py-0.5 rounded',
    elapsed < 120 && 'text-emerald-300 bg-emerald-500/10',
    elapsed >= 120 && elapsed < 300 && 'text-amber-300 bg-amber-500/10',
    elapsed >= 300 && 'text-red-300 bg-red-500/15 animate-pulse',
  );

  const formatElapsed = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${String(sec).padStart(2, '0')}`;
  };

  const chips = SIGNAL_DEFS.map((def) => {
    const v = signals[def.key];
    if (!v) return null;
    const display = def.quote ? `"${v}"` : `${v}${def.suffix || ''}`;
    return (
      <span
        key={def.key}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-dark-800/80 border border-dark-700 text-dark-300"
      >
        <span className="text-[11px]">{def.icon}</span>
        <span className="text-dark-100 font-medium">{display}</span>
      </span>
    );
  }).filter(Boolean);

  return (
    <div className={bannerCls} aria-label="AI intelligence banner">
      <div className="flex items-center gap-2">
        <span className="text-[9px] uppercase tracking-[0.15em] text-dark-400 font-semibold">AI Intelligence</span>
        <span className={stateBadgeCls}>{stateLabel}</span>
        {isHot && conversation.aiClassifiedAt && <span className={timerCls}>{formatElapsed(elapsed)}</span>}
      </div>
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {chips.length > 0 ? (
            chips
          ) : (
            <span className="text-[10px] text-dark-500 italic">No signals extracted yet</span>
          )}
        </div>
        <span className="text-[9px] font-mono text-dark-500 shrink-0">Rep: {rep}</span>
      </div>
    </div>
  );
}
