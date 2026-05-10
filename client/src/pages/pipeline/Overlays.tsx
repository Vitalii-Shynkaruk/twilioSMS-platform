import type { PipelineCard, PipelineStage } from './types';

export function CardOverlay({ card }: { card: PipelineCard }) {
  return (
    <div
      className="w-[280px] rotate-[2deg] shadow-2xl"
      style={{
        borderRadius: 5,
        padding: 12,
        backgroundColor: 'var(--scl-card)',
        border: '2px solid var(--scl-blue)',
        boxShadow: '0 12px 40px rgba(43, 127, 232, 0.2)',
      }}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex items-center justify-center text-[10px] font-semibold"
          style={{
            width: 26,
            height: 26,
            borderRadius: 4,
            backgroundColor: 'var(--scl-blue-dim)',
            color: '#FFFFFF',
          }}
        >
          {card.lead.firstName[0]}
          {card.lead.lastName?.[0] || ''}
        </div>
        <div>
          <p className="text-sm font-medium" style={{ color: 'var(--scl-white)' }}>
            {card.lead.firstName} {card.lead.lastName || ''}
          </p>
          <p className="text-[11px]" style={{ color: 'var(--scl-text-m)' }}>
            {card.lead.phone}
          </p>
        </div>
      </div>
    </div>
  );
}

export function StageOverlay({ stage }: { stage: PipelineStage }) {
  return (
    <div
      className="w-[300px] rounded-xl shadow-2xl p-3 rotate-[1deg]"
      style={{
        borderBottom: `2px solid ${stage.color}`,
        backgroundColor: 'var(--scl-surface)',
        border: `2px solid ${stage.color}`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span
          style={{
            fontSize: 8,
            fontWeight: 500,
            letterSpacing: '0.10em',
            textTransform: 'uppercase',
            color: 'var(--scl-text-m)',
          }}
        >
          {stage.name}
        </span>
        <span
          style={{
            fontSize: 17,
            fontWeight: 500,
            color: 'var(--scl-text-b)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
          }}
        >
          {stage.cards.length}
        </span>
      </div>
      <div className="space-y-1">
        {stage.cards.slice(0, 3).map((card) => (
          <div
            key={card.id}
            className="rounded p-2 text-xs truncate"
            style={{ backgroundColor: 'var(--scl-card)', color: 'var(--scl-text-m)' }}
          >
            {card.lead.firstName} {card.lead.lastName || ''} · {card.lead.phone}
          </div>
        ))}
        {stage.cards.length > 3 && (
          <div className="text-[10px] text-center py-1" style={{ color: 'var(--scl-text-g)' }}>
            +{stage.cards.length - 3} more
          </div>
        )}
      </div>
    </div>
  );
}
