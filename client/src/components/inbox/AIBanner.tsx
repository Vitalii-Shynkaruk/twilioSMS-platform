// © BuyReadySite.com — AI Intelligence Banner для Inbox thread (pixel-perfect)
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
  { key: 'helocFitFlag', icon: '🟣' },
];

const formatElapsed = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, '0')}`;
};

export default function AIBanner({ conversation }: AIBannerProps) {
  const cls = conversation.aiClassification;
  const isHot = cls === 'HOT';
  const isCa = !!conversation.isCaliforniaNumber;
  const signals = (conversation.aiSignals || {}) as AISignals;
  const rep = conversation.assignedRep
    ? `${conversation.assignedRep.firstName || ''} ${conversation.assignedRep.lastName || ''}`.trim() || '—'
    : 'Unassigned';

  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!isHot || !conversation.aiClassifiedAt) return;
    const start = new Date(conversation.aiClassifiedAt).getTime();
    const tick = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [isHot, conversation.aiClassifiedAt]);

  // FIX (M1): прятать таймер если HOT-классификация старее 60 мин — иначе он растёт до тысяч минут (4783:58)
  const showTimer = isHot && elapsed > 0 && elapsed <= 60 * 60;

  if (!cls) return null;

  const bannerVariant = isHot ? 'hot' : isCa ? 'ca' : cls === 'NURTURE' ? 'nurture' : 'warm';
  const statusVariant = isHot
    ? 'status-hot'
    : isCa
      ? 'status-ca'
      : cls === 'NURTURE'
        ? 'status-nurture'
        : 'status-warm';

  const stateLabel = isHot
    ? `🔥 HOT${signals.ask ? ` · ${signals.ask} DEAL` : ''}`
    : isCa
      ? '⚠ CA COMPLIANCE · NO APR/RATE DISCUSSION'
      : cls === 'NURTURE'
        ? '◆ NURTURE · KEEP WARM'
        : '◆ WARM · ENGAGE';

  const timerCls = clsx(
    'hot-timer',
    elapsed < 120 && 'timer-green',
    elapsed >= 120 && elapsed < 300 && 'timer-yellow',
    elapsed >= 300 && 'timer-red',
  );

  const chips = SIGNAL_DEFS.map((def) => {
    const v = signals[def.key];
    if (!v) return null;
    // helocFitFlag = boolean: показываем в виде фиксированной подписи "HELOC fit"
    const display = def.key === 'helocFitFlag'
      ? 'HELOC fit'
      : def.quote ? `"${v}"` : `${v}${def.suffix || ''}`;
    return (
      <span key={def.key} className="signal-chip">
        <span className="sig-icon">{def.icon}</span>
        <span className="sig-val">{display}</span>
      </span>
    );
  }).filter(Boolean);

  return (
    <div className={clsx('ai-banner', bannerVariant)} aria-label="AI intelligence banner" role="region">
      <div className="banner-top">
        <span className="banner-label">AI INTELLIGENCE</span>
        <div className="banner-status">
          <span className={clsx('status-badge', statusVariant)}>{stateLabel}</span>
        </div>
        {showTimer && conversation.aiClassifiedAt && <div className={timerCls}>{formatElapsed(elapsed)}</div>}
      </div>
      <div className="banner-bottom">
        <div className="signal-chips">{chips.length > 0 ? chips : null}</div>
        <span className="rep-line">Rep: {rep}</span>
      </div>
    </div>
  );
}
