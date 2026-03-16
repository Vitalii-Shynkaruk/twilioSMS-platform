import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Phone, GripVertical } from 'lucide-react';
import { clsx } from 'clsx';
import type { PipelineCard, PipelineStage } from './types';
import { hexToRgba } from './utils';

interface Props {
  card: PipelineCard;
  stageColor: string;
  onContextMenu: (e: React.MouseEvent, type: 'card' | 'stage', item: PipelineCard | PipelineStage) => void;
}

export default function SortableCard({ card, stageColor, onContextMenu }: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { type: 'card', card },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'bg-dark-850 rounded-lg p-3 border border-dark-700/50 hover:border-dark-600',
        'transition-all duration-150 cursor-grab active:cursor-grabbing group/card',
        'hover:shadow-lg hover:shadow-black/20 hover:-translate-y-[1px]',
        isDragging && 'opacity-30 scale-[0.97] shadow-none'
      )}
      onContextMenu={(e) => onContextMenu(e, 'card', card)}
      {...listeners}
      {...attributes}
    >
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div
            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0"
            style={{
              backgroundColor: hexToRgba(stageColor, 0.15),
              color: stageColor,
            }}
          >
            {card.lead.firstName[0]}{card.lead.lastName?.[0] || ''}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium text-dark-200 leading-tight truncate">
              {card.lead.firstName} {card.lead.lastName || ''}
            </p>
            <p className="text-[11px] text-dark-500 flex items-center gap-1 mt-0.5">
              <Phone className="w-3 h-3 shrink-0" />
              <span className="truncate">{card.lead.phone}</span>
            </p>
          </div>
        </div>
        <GripVertical className="w-4 h-4 text-dark-600 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0" />
      </div>

      {card.lead.company && (
        <p className="text-[11px] text-dark-500 mt-1.5 truncate">{card.lead.company}</p>
      )}

      {card.lead.tags && card.lead.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {card.lead.tags.map((lt) => (
            <span
              key={lt.tag.id}
              className="text-[10px] px-1.5 py-0.5 rounded"
              style={{
                backgroundColor: lt.tag.color + '33',
                color: lt.tag.color,
              }}
            >
              {lt.tag.name}
            </span>
          ))}
        </div>
      )}

      {(card.lead.notes || card.notes) && (
        <p className="text-xs text-dark-500 mt-2 line-clamp-2 flex items-start gap-1">
          <span className="shrink-0">📝</span>
          <span>{card.lead.notes || card.notes}</span>
        </p>
      )}
    </div>
  );
}
