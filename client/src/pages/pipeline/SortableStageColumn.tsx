import { useMemo, useState } from 'react';
import { SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { GripHorizontal, MoreVertical, Edit3, Palette, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import type { PipelineStage, PipelineCard, ViewMode } from './types';
import { hexToRgba } from './utils';
import SortableCard from './SortableCard';

interface Props {
  stage: PipelineStage;
  allStages?: PipelineStage[];
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  menuRef?: React.RefObject<HTMLDivElement | null>;
  onEdit: () => void;
  onDelete: () => void;
  onContextMenu: (e: React.MouseEvent, type: 'card' | 'stage', item: PipelineCard | PipelineStage) => void;
  isAnyDragging: boolean;
  viewMode: ViewMode;
}

export default function SortableStageColumn({
  stage,
  allStages,
  isMenuOpen,
  onToggleMenu,
  menuRef,
  onEdit,
  onDelete,
  onContextMenu,
  isAnyDragging,
  viewMode,
}: Props) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `stage-${stage.id}`,
    data: { type: 'stage', stage },
  });

  const { setNodeRef: setDroppableRef, isOver } = useDroppable({
    id: stage.id,
    data: { stageId: stage.id },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition: transition || 'transform 200ms cubic-bezier(0.25, 1, 0.5, 1)',
  };

  const cardIds = useMemo(() => stage.cards.map((c) => c.id), [stage.cards]);

  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        backgroundColor: hexToRgba(stage.color, 0.04),
        borderColor: hexToRgba(stage.color, 0.12),
      }}
      className={clsx(
        'flex flex-col rounded-xl transition-opacity duration-200 border',
        viewMode === 'board' ? 'w-[300px] shrink-0' : 'w-full',
        viewMode !== 'board' && 'min-h-[250px] max-h-[600px]',
        isDragging && 'opacity-30 scale-[0.98]',
      )}
      onContextMenu={(e) => onContextMenu(e, 'stage', stage)}
    >
      <div style={{ padding: '0 0 8px', marginBottom: 6, borderBottom: `2px solid ${stage.color}` }}>
        <div className="flex items-center justify-between px-3 pt-2 group/header">
          <div className="flex items-center gap-2">
            <button
              className="cursor-grab active:cursor-grabbing transition-colors touch-none"
              style={{ color: 'var(--scl-text-g)' }}
              {...listeners}
              {...attributes}
            >
              <GripHorizontal className="w-4 h-4" />
            </button>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
              <span
                style={{
                  fontSize: 10,
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
                {stage._count?.cards ?? stage.cards.length}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <div className="relative">
              <button
                onClick={onToggleMenu}
                className="p-1 opacity-0 group-hover/header:opacity-100 transition-opacity"
                style={{ color: 'var(--scl-text-g)' }}
              >
                <MoreVertical className="w-4 h-4" />
              </button>
              {isMenuOpen && (
                <div
                  ref={menuRef as React.RefObject<HTMLDivElement>}
                  className="absolute right-0 top-full mt-1 w-44 rounded-lg shadow-xl z-50 py-1"
                  style={{ backgroundColor: 'var(--scl-card)', border: '1px solid var(--scl-border)' }}
                >
                  <button
                    onClick={onEdit}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:opacity-80"
                    style={{ color: 'var(--scl-text-b)' }}
                  >
                    <Edit3 className="w-3.5 h-3.5" /> Rename Stage
                  </button>
                  <button
                    onClick={onEdit}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:opacity-80"
                    style={{ color: 'var(--scl-text-b)' }}
                  >
                    <Palette className="w-3.5 h-3.5" /> Change Color
                  </button>
                  <div style={{ borderTop: '1px solid var(--scl-border)', margin: '4px 0' }} />
                  <button
                    onClick={onDelete}
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2 hover:opacity-80"
                    style={{ color: 'var(--scl-red)' }}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Stage
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        <ColumnMetrics stage={stage} allStages={allStages} />
      </div>

      <div
        ref={setDroppableRef}
        className={clsx(
          'flex-1 rounded-b-xl p-2 space-y-2 overflow-y-auto overflow-x-hidden transition-all duration-200',
          isOver ? 'ring-2 ring-offset-2 ring-offset-dark-900' : '',
          isAnyDragging && !isOver && 'bg-dark-800/10',
        )}
        style={{
          backgroundColor: isOver ? hexToRgba(stage.color, 0.12) : hexToRgba(stage.color, 0.03),
          ...(isOver && {
            boxShadow: `0 0 0 2px ${hexToRgba(stage.color, 0.5)}, 0 0 20px ${hexToRgba(stage.color, 0.15)}`,
            borderColor: stage.color,
          }),
        }}
      >
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {stage.cards.map((card) => (
            <SortableCard key={card.id} card={card} stageColor={stage.color} onContextMenu={onContextMenu} />
          ))}
        </SortableContext>
        {stage.cards.length === 0 && (
          <div
            className="text-center py-8 text-xs rounded-lg border border-dashed transition-colors duration-200"
            style={{
              borderColor: isOver ? hexToRgba(stage.color, 0.4) : 'rgba(255,255,255,0.06)',
              color: isOver ? stage.color : 'rgba(255,255,255,0.25)',
            }}
          >
            Drop leads here
          </div>
        )}
      </div>
    </div>
  );
}

function ColumnMetrics({ stage, allStages }: { stage: PipelineStage; allStages?: PipelineStage[] }) {
  const nameLower = stage.name.toLowerCase();
  const metricStyle = { fontSize: 10, color: 'var(--scl-text-g)' } as const;
  const valStyle = { color: 'var(--scl-text-m)' } as const;

  const [now] = useState(() => Date.now());

  const avgAge = useMemo(() => {
    if (stage.cards.length === 0) return 0;
    const totalDays = stage.cards.reduce((sum, c) => {
      const created = (c as any).createdAt ? new Date((c as any).createdAt).getTime() : now;
      return sum + (now - created) / 86400000;
    }, 0);
    return Math.round(totalDays / stage.cards.length);
  }, [stage.cards, now]);

  const staleCount = useMemo(() => {
    return stage.cards.filter((c) => {
      const created = (c as any).createdAt ? new Date((c as any).createdAt).getTime() : now;
      return (now - created) / 86400000 >= 7;
    }).length;
  }, [stage.cards, now]);

  if (nameLower.includes('new')) {
    return (
      <div className="flex gap-2 px-3" style={metricStyle}>
        <span>
          Avg age: <span style={valStyle}>{avgAge}d</span>
        </span>
        <span>
          Stale: <span style={{ color: staleCount > 0 ? 'var(--scl-red)' : 'var(--scl-text-m)' }}>{staleCount}</span>
        </span>
      </div>
    );
  }

  if (nameLower.includes('contact')) {
    const repliedStage = allStages?.find((s) => s.name.toLowerCase().includes('repl'));
    const repliedCount = repliedStage?.cards.length || 0;
    const total = stage.cards.length + repliedCount;
    const convPct = total > 0 ? Math.round((repliedCount / total) * 100) : 0;
    return (
      <div className="flex gap-2 px-3" style={metricStyle}>
        <span>
          Conv: <span style={valStyle}>{convPct}%</span>
        </span>
        <span>
          Avg age: <span style={valStyle}>{avgAge}d</span>
        </span>
      </div>
    );
  }

  if (nameLower.includes('repl')) {
    return (
      <div className="flex gap-2 px-3" style={metricStyle}>
        <span style={{ color: 'var(--scl-green)' }}>Same-day action req.</span>
      </div>
    );
  }

  if (nameLower.includes('interest')) {
    return (
      <div className="flex gap-2 px-3" style={metricStyle}>
        <span>
          Leads: <span style={valStyle}>{stage.cards.length}</span>
        </span>
      </div>
    );
  }

  if (nameLower.includes('doc')) {
    return (
      <div className="flex gap-2 px-3" style={metricStyle}>
        <span style={{ color: 'var(--scl-green)' }}>Ready to fund</span>
      </div>
    );
  }

  return (
    <div className="flex gap-2 px-3" style={metricStyle}>
      <span>
        Leads: <span style={valStyle}>{stage.cards.length}</span>
      </span>
    </div>
  );
}
