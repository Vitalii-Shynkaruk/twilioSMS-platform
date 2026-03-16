import { useMemo } from 'react';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  GripHorizontal,
  MoreVertical,
  Edit3,
  Palette,
  Trash2,
} from 'lucide-react';
import { clsx } from 'clsx';
import type { PipelineStage, PipelineCard, ViewMode } from './types';
import { hexToRgba } from './utils';
import SortableCard from './SortableCard';

interface Props {
  stage: PipelineStage;
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
  stage, isMenuOpen, onToggleMenu, menuRef, onEdit, onDelete,
  onContextMenu, isAnyDragging, viewMode,
}: Props) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
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
        isDragging && 'opacity-30 scale-[0.98]'
      )}
      onContextMenu={(e) => onContextMenu(e, 'stage', stage)}
    >
      {/* Stage Header */}
      <div className="relative">
        <div
          className="absolute top-0 left-0 right-0 h-1 rounded-t-xl"
          style={{ backgroundColor: stage.color }}
        />
        <div
          className="flex items-center justify-between px-3 py-2.5 rounded-t-xl group/header"
          style={{ backgroundColor: hexToRgba(stage.color, 0.1) }}
        >
          <div className="flex items-center gap-2">
            <button
              className="cursor-grab active:cursor-grabbing text-dark-500 hover:text-dark-300 transition-colors touch-none"
              {...listeners}
              {...attributes}
            >
              <GripHorizontal className="w-4 h-4" />
            </button>
            <div
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: stage.color, boxShadow: `0 0 0 2px var(--color-dark-900), 0 0 0 3px ${stage.color}` }}
            />
            <h3 className="text-sm font-semibold text-dark-200">{stage.name}</h3>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
              style={{
                backgroundColor: hexToRgba(stage.color, 0.15),
                color: stage.color,
              }}
            >
              {stage.cards.length}
            </span>
          </div>
          <div className="relative">
            <button onClick={onToggleMenu} className="btn-ghost p-1 opacity-0 group-hover/header:opacity-100 transition-opacity">
              <MoreVertical className="w-4 h-4" />
            </button>
            {isMenuOpen && (
              <div
                ref={menuRef as React.RefObject<HTMLDivElement>}
                className="absolute right-0 top-full mt-1 w-44 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 py-1"
              >
                <button onClick={onEdit} className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2">
                  <Edit3 className="w-3.5 h-3.5" /> Rename Stage
                </button>
                <button onClick={onEdit} className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2">
                  <Palette className="w-3.5 h-3.5" /> Change Color
                </button>
                <div className="border-t border-dark-700 my-1" />
                <button onClick={onDelete} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-dark-700/50 flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" /> Delete Stage
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Cards Container */}
      <div
        ref={setDroppableRef}
        className={clsx(
          'flex-1 rounded-b-xl p-2 space-y-2 overflow-y-auto transition-all duration-200',
          isOver ? 'ring-2 ring-offset-2 ring-offset-dark-900' : '',
          isAnyDragging && !isOver && 'bg-dark-800/10'
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
            <SortableCard
              key={card.id}
              card={card}
              stageColor={stage.color}
              onContextMenu={onContextMenu}
            />
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
