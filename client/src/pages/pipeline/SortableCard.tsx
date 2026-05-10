import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Phone, GripVertical } from 'lucide-react';
import { clsx } from 'clsx';
import type { PipelineCard, PipelineStage } from './types';

const AVATAR_COLORS = ['#1A4A8A', '#1A5A3A', '#5A3A8A', '#8A5A1A', '#2A4A6A'];

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getUrgencyClass(card: PipelineCard): 'stale' | 'aging' | 'fresh' | '' {
  const lastContact = (card.lead as any).lastContactDate || (card as any).createdAt;
  if (!lastContact) return '';
  const days = (Date.now() - new Date(lastContact).getTime()) / 86400000;
  if (days >= 7) return 'stale';
  if (days >= 4) return 'aging';
  return 'fresh';
}

interface Props {
  card: PipelineCard;
  stageColor: string;
  onContextMenu: (e: React.MouseEvent, type: 'card' | 'stage', item: PipelineCard | PipelineStage) => void;
}

export default function SortableCard({ card, stageColor: _stageColor, onContextMenu }: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: card.id,
    data: { type: 'card', card },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
  };

  const urgency = getUrgencyClass(card);
  const avatarName = `${card.lead.firstName}${card.lead.lastName || ''}`;
  const avatarBg = getAvatarColor(avatarName);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'relative overflow-hidden',
        'transition-all duration-150 cursor-grab active:cursor-grabbing group/card',
        'hover:shadow-lg hover:shadow-black/20 hover:-translate-y-[1px]',
        isDragging && 'opacity-30 scale-[0.97] shadow-none',
      )}
      onContextMenu={(e) => onContextMenu(e, 'card', card)}
      {...listeners}
      {...attributes}
    >
      {urgency && (
        <div
          className="absolute left-0 top-0 bottom-0"
          style={{
            width: 2,
            background:
              urgency === 'stale' ? 'var(--scl-red)' : urgency === 'aging' ? 'var(--scl-amber)' : 'var(--scl-green)',
          }}
        />
      )}

      <div
        style={{
          borderRadius: 5,
          padding: 12,
          backgroundColor: 'var(--scl-card)',
          border: '1px solid var(--scl-border)',
        }}
        className="hover:border-[var(--scl-border-hi)]"
      >
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div
              className="flex items-center justify-center text-[10px] font-semibold shrink-0"
              style={{
                width: 26,
                height: 26,
                borderRadius: 4,
                backgroundColor: avatarBg,
                color: '#FFFFFF',
              }}
            >
              {card.lead.firstName[0]}
              {card.lead.lastName?.[0] || ''}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-medium leading-tight truncate" style={{ color: 'var(--scl-white)' }}>
                {card.lead.firstName} {card.lead.lastName || ''}
              </p>
              <p className="text-[11px] flex items-center gap-1 mt-0.5" style={{ color: 'var(--scl-text-m)' }}>
                <Phone className="w-3 h-3 shrink-0" />
                <span className="truncate">{card.lead.phone}</span>
              </p>
            </div>
          </div>
          <GripVertical
            className="w-4 h-4 opacity-0 group-hover/card:opacity-100 transition-opacity shrink-0"
            style={{ color: 'var(--scl-text-g)' }}
          />
        </div>

        {card.lead.company && (
          <p className="text-[11px] mt-1.5 truncate" style={{ color: 'var(--scl-text-m)' }}>
            {card.lead.company}
          </p>
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
          <p className="text-xs mt-2 line-clamp-2 flex items-start gap-1" style={{ color: 'var(--scl-text-m)' }}>
            <span className="shrink-0">📝</span>
            <span>{card.lead.notes || card.notes}</span>
          </p>
        )}
      </div>
    </div>
  );
}
