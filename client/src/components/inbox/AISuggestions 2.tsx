// © BuyReadySite.com — AI Suggestions BEST + ALT (pixel-perfect)
import { clsx } from 'clsx';
import type { AISuggestion, AISignals } from '../../types';

interface AISuggestionsProps {
  suggestions?: AISuggestion[] | null;
  signals?: AISignals | null;
  onUseSuggestion: (text: string) => void;
  onEditSuggestion: (text: string) => void;
  onSkipSuggestion: (text: string) => void;
  onOpenSuggestionCta?: () => void;
  canOpenSuggestionCta?: boolean;
  suggestionCtaDisabledTitle?: string;
}

function renderText(text: string) {
  return text.split(/(\$[\d,.]+[kKmM]?)/g).map((part, i) =>
    /^\$[\d,.]+[kKmM]?$/.test(part) ? (
      <span key={i} className="hl">
        {part}
      </span>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function classForType(type: string | undefined, isBest: boolean): string {
  if (isBest) return 'con';
  switch (type) {
    case 'agg':
      return 'agg';
    case 'soft':
      return 'soft';
    case 'doc':
      return 'doc';
    case 'reschedule':
      return 'reschedule';
    case 'block':
      return 'block';
    default:
      return 'soft';
  }
}

export default function AISuggestions({
  suggestions,
  signals,
  onUseSuggestion,
  onEditSuggestion,
  onSkipSuggestion,
  onOpenSuggestionCta,
  canOpenSuggestionCta = false,
  suggestionCtaDisabledTitle = 'No email on file yet',
}: AISuggestionsProps) {
  const shown = (suggestions || []).slice(0, 1);
  if (shown.length === 0) return null;
  const best = shown[0];

  const sigStr = signals ? Object.values(signals).filter(Boolean).slice(0, 4).join(' · ') : '';

  const renderCard = (s: AISuggestion, isBest: boolean) => {
    const blocked = !!s.blocked;
    const variant = classForType(s.type, isBest);
    const label = s.lbl || (isBest ? '⚡ BEST APPROACH' : 'ALT');
    const ctaText = s.cta?.trim();
    const shouldRenderCtaButton = !!ctaText && !!onOpenSuggestionCta;
    const ctaDisabled = blocked || !canOpenSuggestionCta;
    const ctaTitle = blocked
      ? 'Blocked by compliance'
      : ctaDisabled
        ? suggestionCtaDisabledTitle
        : 'Open PMF Gmail compose';
    const ctaLabel = !blocked && ctaDisabled ? `${ctaText} · (no email on file)` : ctaText;

    return (
      <div className={clsx('sug-card', variant)}>
        <button
          type="button"
          disabled={blocked}
          onClick={() => !blocked && onUseSuggestion(s.text)}
          className="sug-card-main"
          title={blocked ? 'Blocked by compliance' : 'Click to insert into compose'}
        >
          <div className="sug-type">
            <span>{label}</span>
            {isBest && <span className="sug-best-badge">BEST</span>}
          </div>
          <div className="sug-text">{renderText(s.text)}</div>
        </button>
        {ctaText &&
          (shouldRenderCtaButton ? (
            <button
              type="button"
              className="suggest-cta-btn"
              disabled={ctaDisabled}
              title={ctaTitle}
              onClick={() => {
                if (!ctaDisabled) {
                  onOpenSuggestionCta();
                }
              }}
            >
              {ctaLabel}
            </button>
          ) : (
            <div className="sug-cta">{ctaText}</div>
          ))}
      </div>
    );
  };

  return (
    <div className="suggestions-area">
      <div className="sug-header">
        <span className="sug-label">✦ AI SUGGESTION</span>
        {sigStr && <span className="sug-context">{sigStr}</span>}
      </div>
      <div className="sug-cards">{renderCard(best, true)}</div>
      {!best.blocked && (
        <div className="sug-actions" role="group" aria-label="Suggested reply actions">
          <button type="button" className="sug-action primary" onClick={() => onUseSuggestion(best.text)}>
            Use
          </button>
          <button type="button" className="sug-action" onClick={() => onEditSuggestion(best.text)}>
            Edit
          </button>
          <button type="button" className="sug-action danger" onClick={() => onSkipSuggestion(best.text)}>
            Skip
          </button>
        </div>
      )}
    </div>
  );
}
