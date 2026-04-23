// © BuyReadySite.com — AI Suggestions (BEST + ALT) для compose
import { clsx } from 'clsx';
import type { AISuggestion, AISignals } from '../../types';

interface AISuggestionsProps {
  suggestions?: AISuggestion[] | null;
  signals?: AISignals | null;
  onUseSuggestion: (text: string) => void;
}

const TYPE_BORDER: Record<string, string> = {
  agg: 'border-l-yellow-500/60',
  soft: 'border-l-blue-500/40',
  doc: 'border-l-emerald-500/40',
  reschedule: 'border-l-purple-500/40',
  block: 'border-l-rose-500/40',
};

function highlightMoney(text: string) {
  return text.split(/(\$[\d,.]+[kKmM]?)/g).map((part, i) =>
    /^\$[\d,.]+[kKmM]?$/.test(part) ? (
      <span key={i} className="text-yellow-300 font-semibold">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

export default function AISuggestions({ suggestions, signals, onUseSuggestion }: AISuggestionsProps) {
  // Только две карточки: BEST + ALT, никогда 3 (требование прототипа)
  const shown = (suggestions || []).slice(0, 2);
  if (shown.length === 0) return null;

  const sigStr = signals ? Object.values(signals).filter(Boolean).slice(0, 4).join(' · ') : '';

  const renderCard = (s: AISuggestion, isBest: boolean) => {
    const borderCls = isBest ? 'border-l-yellow-500' : TYPE_BORDER[s.type || ''] || 'border-l-dark-600';
    const blocked = !!s.blocked;
    return (
      <button
        type="button"
        disabled={blocked}
        onClick={() => onUseSuggestion(s.text)}
        className={clsx(
          'group relative text-left rounded-lg border border-dark-700/70 bg-dark-800/60 hover:bg-dark-800 transition-colors p-3 border-l-[3px] disabled:opacity-50 disabled:cursor-not-allowed',
          borderCls,
        )}
        title={blocked ? 'Blocked by compliance' : 'Click to insert into compose'}
      >
        <div className="flex items-center justify-between mb-1.5">
          <span
            className={clsx(
              'text-[10px] font-mono font-bold uppercase tracking-wider',
              isBest ? 'text-yellow-300' : 'text-dark-400',
            )}
          >
            {s.lbl || (isBest ? '⚡ BEST' : 'ALT')}
          </span>
          <span
            className={clsx(
              'text-[8px] font-mono font-extrabold px-1.5 py-0.5 rounded',
              isBest ? 'bg-yellow-400 text-black' : 'bg-dark-700 text-dark-400',
            )}
          >
            {isBest ? 'BEST' : 'ALT'}
          </span>
        </div>
        <p className={clsx('text-xs leading-relaxed mb-2', isBest ? 'text-dark-100' : 'text-dark-300')}>
          {highlightMoney(s.text)}
        </p>
        {s.cta && (
          <p
            className={clsx(
              'text-[10px] font-mono font-semibold tracking-wide',
              isBest ? 'text-yellow-300/90' : 'text-dark-500',
            )}
          >
            {s.cta}
          </p>
        )}
      </button>
    );
  };

  return (
    <div className="px-4 pt-3 pb-2 border-t border-dark-700/40 bg-dark-900/40">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-dark-400 font-semibold">
          ✦ AI Suggestions
        </span>
        {sigStr && <span className="text-[10px] text-dark-500 truncate ml-2">{sigStr}</span>}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {renderCard(shown[0], true)}
        {shown[1] && renderCard(shown[1], false)}
      </div>
    </div>
  );
}
