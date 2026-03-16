import type { PipelineCard, PipelineStage } from './types';
import { hexToRgba } from './utils';

/** Lightweight card preview shown in DragOverlay */
export function CardOverlay({ card }: { card: PipelineCard }) {
  return (
    <div className="bg-dark-850 rounded-lg p-3 border-2 border-scl-500/60 shadow-2xl shadow-scl-500/20 w-[280px] rotate-[2deg]">
      <div className="flex items-center gap-2">
        <div className="w-7 h-7 rounded-full bg-scl-500/20 flex items-center justify-center text-[10px] font-semibold text-scl-400">
          {card.lead.firstName[0]}{card.lead.lastName?.[0] || ''}
        </div>
        <div>
          <p className="text-sm font-medium text-dark-200">
            {card.lead.firstName} {card.lead.lastName || ''}
          </p>
          <p className="text-[11px] text-dark-500">{card.lead.phone}</p>
        </div>
      </div>
    </div>
  );
}

/** Lightweight stage preview shown in DragOverlay */
export function StageOverlay({ stage }: { stage: PipelineStage }) {
  return (
    <div
      className="w-[300px] bg-dark-900/95 rounded-xl border-2 shadow-2xl p-3 rotate-[1deg]"
      style={{
        borderColor: stage.color,
        backgroundColor: hexToRgba(stage.color, 0.08),
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color }} />
        <h3 className="text-sm font-semibold text-dark-200">{stage.name}</h3>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full"
          style={{ backgroundColor: hexToRgba(stage.color, 0.15), color: stage.color }}
        >
          {stage.cards.length}
        </span>
      </div>
      <div className="space-y-1">
        {stage.cards.slice(0, 3).map((card) => (
          <div key={card.id} className="bg-dark-800 rounded p-2 text-xs text-dark-400 truncate">
            {card.lead.firstName} {card.lead.lastName || ''} · {card.lead.phone}
          </div>
        ))}
        {stage.cards.length > 3 && (
          <div className="text-[10px] text-dark-500 text-center py-1">
            +{stage.cards.length - 3} more
          </div>
        )}
      </div>
    </div>
  );
}
