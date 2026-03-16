import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  DragOverEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  MeasuringStrategy,
  UniqueIdentifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  rectSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable';
import api from '../services/api';
import {
  Plus,
  Edit3,
  Trash2,
  X,
  Palette,
  MessageSquare,
  Ban,
  ExternalLink,
  Copy,
  LayoutGrid,
  Columns,
  LayoutList,
  Filter,
  UserPlus,
  StickyNote,
  Send,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import LeadDetailDrawer from '../components/leads/LeadDetailDrawer';

/* ─── Decomposed sub-components ─── */
import type { ViewMode, PipelineStage, PipelineCard, ContextMenuState } from './pipeline/types';
import { getStoredViewMode } from './pipeline/utils';
import SortableStageColumn from './pipeline/SortableStageColumn';
import { CardOverlay, StageOverlay } from './pipeline/Overlays';
import StageModal from './pipeline/StageModal';
import { AssignRepModal, NoteModal } from './pipeline/PipelineModals';

/* ─── Main Component ─── */
export default function PipelinePage() {
  const [activeId, setActiveId] = useState<UniqueIdentifier | null>(null);
  const [activeType, setActiveType] = useState<'card' | 'stage' | null>(null);
  const [openMenuStageId, setOpenMenuStageId] = useState<string | null>(null);
  const [showAddStage, setShowAddStage] = useState(false);
  const [editingStage, setEditingStage] = useState<PipelineStage | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null);
  const [overId, setOverId] = useState<UniqueIdentifier | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>(getStoredViewMode);
  const [filterTag, setFilterTag] = useState<string>('');
  const [filterRep, setFilterRep] = useState<string>('');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [showNoteModal, setShowNoteModal] = useState<PipelineCard | null>(null);
  const [showAssignModal, setShowAssignModal] = useState<PipelineCard | null>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Persist view mode
  const handleViewModeChange = useCallback((mode: ViewMode) => {
    setViewMode(mode);
    localStorage.setItem('pipeline-view-mode', mode);
  }, []);

  // Close menus on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuStageId(null);
      }
      if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Close context menu on scroll/resize
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const { data, isLoading } = useQuery({
    queryKey: ['pipeline'],
    queryFn: async () => {
      const { data } = await api.get('/pipeline/stages');
      return data;
    },
  });

  // Tags + Users for filters
  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => { const { data } = await api.get('/settings/tags'); return data; },
  });
  const { data: usersData } = useQuery({
    queryKey: ['users'],
    queryFn: async () => { const { data } = await api.get('/auth/users'); return data; },
  });
  const allTags: { id: string; name: string; color: string }[] = tagsData?.tags || [];
  const allUsers: { id: string; firstName: string; lastName: string }[] = usersData?.users || [];

  const rawStages: PipelineStage[] = data?.stages || [];

  // Apply filters
  const stages = useMemo(() => {
    if (!filterTag && !filterRep && !filterSearch) return rawStages;
    return rawStages.map(stage => ({
      ...stage,
      cards: stage.cards.filter(card => {
        if (filterTag && !card.lead.tags?.some(t => t.tag.id === filterTag)) return false;
        if (filterRep && card.lead.assignedRepId !== filterRep) return false;
        if (filterSearch) {
          const q = filterSearch.toLowerCase();
          const name = `${card.lead.firstName} ${card.lead.lastName || ''}`.toLowerCase();
          if (!name.includes(q) && !card.lead.phone.includes(q) && !(card.lead.company || '').toLowerCase().includes(q)) return false;
        }
        return true;
      }),
    }));
  }, [rawStages, filterTag, filterRep, filterSearch]);

  const stageIds = useMemo(() => stages.map((s) => `stage-${s.id}`), [stages]);

  const moveCardMutation = useMutation({
    mutationFn: ({ cardId, stageId, position }: { cardId: string; stageId: string; position: number }) =>
      api.put(`/pipeline/cards/${cardId}/move`, { stageId, position }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to move card'),
  });

  const reorderStagesMutation = useMutation({
    mutationFn: (stageOrder: { id: string; order: number }[]) =>
      api.put('/pipeline/stages/reorder', { stageOrder }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pipeline'] }),
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to reorder stages'),
  });

  const deleteStMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/pipeline/stages/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      toast.success('Stage deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete stage'),
  });

  const markDncMutation = useMutation({
    mutationFn: (leadId: string) => api.put(`/leads/${leadId}`, { status: 'DNC' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      toast.success('Marked as DNC');
    },
  });

  const assignRepMutation = useMutation({
    mutationFn: ({ leadId, repId }: { leadId: string; repId: string | null }) =>
      api.put(`/leads/${leadId}`, { assignedRepId: repId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      toast.success('Rep assigned');
      setShowAssignModal(null);
    },
  });

  const saveNoteMutation = useMutation({
    mutationFn: ({ leadId, notes }: { leadId: string; notes: string }) =>
      api.put(`/leads/${leadId}`, { notes }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pipeline'] });
      toast.success('Note saved');
      setShowNoteModal(null);
    },
  });

  /* ─── Find helpers ─── */
  function findCard(cardId: string): PipelineCard | undefined {
    for (const stage of rawStages) {
      const card = stage.cards.find((c) => c.id === cardId);
      if (card) return card;
    }
    return undefined;
  }

  function findStageByCardId(cardId: string): PipelineStage | undefined {
    return rawStages.find((s) => s.cards.some((c) => c.id === cardId));
  }

  /* ─── Drag handlers ─── */
  function handleDragStart(event: DragStartEvent) {
    const id = event.active.id as string;
    if (id.startsWith('stage-')) {
      setActiveType('stage');
      setActiveId(id);
    } else {
      setActiveType('card');
      setActiveId(id);
    }
    setContextMenu(null);
    setOpenMenuStageId(null);
  }

  function handleDragOver(event: DragOverEvent) {
    setOverId(event.over?.id ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    setActiveType(null);
    setOverId(null);

    if (!over) return;

    const activeIdStr = active.id as string;
    const overIdStr = over.id as string;

    // Stage reorder
    if (activeIdStr.startsWith('stage-')) {
      const activeStageId = activeIdStr.replace('stage-', '');

      // Resolve target stage: could be a stage-prefixed id, a raw stage id, or a card inside a stage
      let overStageId: string | undefined;
      if (overIdStr.startsWith('stage-')) {
        overStageId = overIdStr.replace('stage-', '');
      } else {
        // Check if over a raw stage droppable zone
        const directStage = stages.find(s => s.id === overIdStr);
        if (directStage) {
          overStageId = directStage.id;
        } else {
          // Over a card — find which stage it belongs to
          const ownerStage = findStageByCardId(overIdStr);
          overStageId = ownerStage?.id;
        }
      }

      if (!overStageId || activeStageId === overStageId) return;

      const oldIndex = stages.findIndex((s) => s.id === activeStageId);
      const newIndex = stages.findIndex((s) => s.id === overStageId);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(stages, oldIndex, newIndex);
      const stageOrder = reordered.map((s, i) => ({ id: s.id, order: i }));
      reorderStagesMutation.mutate(stageOrder);
      return;
    }

    // Card move
    if (!activeIdStr.startsWith('stage-')) {
      const cardId = activeIdStr;
      let targetStageId: string;

      if (overIdStr.startsWith('stage-')) {
        targetStageId = overIdStr.replace('stage-', '');
      } else {
        // Check if dropped on a stage droppable zone (raw stage ID without prefix)
        const droppedOnStage = stages.find(s => s.id === overIdStr);
        if (droppedOnStage) {
          targetStageId = droppedOnStage.id;
        } else {
          // Dropped on another card — find its stage
          const overCard = findCard(overIdStr);
          const overStage = overCard ? findStageByCardId(overIdStr) : undefined;
          targetStageId = overStage?.id || '';
        }
      }

      if (!targetStageId) return;
      const targetStage = stages.find((s) => s.id === targetStageId);
      if (!targetStage) return;

      // Calculate position
      let position = targetStage.cards.length;
      if (!overIdStr.startsWith('stage-')) {
        const overIndex = targetStage.cards.findIndex((c) => c.id === overIdStr);
        if (overIndex !== -1) position = overIndex;
      }

      moveCardMutation.mutate({ cardId, stageId: targetStageId, position });
    }
  }

  function handleDragCancel() {
    setActiveId(null);
    setActiveType(null);
    setOverId(null);
  }

  /* ─── Context menu handlers ─── */
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, type: 'card' | 'stage', item: PipelineCard | PipelineStage) => {
      e.preventDefault();
      e.stopPropagation();
      if (type === 'card') {
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'card', card: item as PipelineCard });
      } else {
        setContextMenu({ x: e.clientX, y: e.clientY, type: 'stage', stage: item as PipelineStage });
      }
    },
    []
  );

  /* ─── Active items for overlay ─── */
  const activeCard = activeType === 'card' && activeId ? findCard(activeId as string) : null;
  const activeStage = activeType === 'stage' && activeId
    ? stages.find((s) => `stage-${s.id}` === activeId)
    : null;

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 0px)' }}>
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-dark-700/50">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-dark-50">Pipeline</h1>
            <p className="text-sm text-dark-400 mt-1">
              Drag leads between stages · Right-click for actions
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-dark-500">
              {stages.reduce((sum, s) => sum + s.cards.length, 0)} leads
            </span>
            {/* View Mode Toggle */}
            <div className="flex items-center bg-dark-800 rounded-lg p-0.5 border border-dark-700/50">
              <button
                onClick={() => handleViewModeChange('board')}
                className={clsx(
                  'p-1.5 rounded-md transition-all duration-150',
                  viewMode === 'board' ? 'bg-scl-600 text-white shadow-sm' : 'text-dark-400 hover:text-dark-200'
                )}
                title="Board (horizontal)"
              >
                <Columns className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleViewModeChange('grid-2')}
                className={clsx(
                  'p-1.5 rounded-md transition-all duration-150',
                  viewMode === 'grid-2' ? 'bg-scl-600 text-white shadow-sm' : 'text-dark-400 hover:text-dark-200'
                )}
                title="Grid 2 columns"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => handleViewModeChange('grid-3')}
                className={clsx(
                  'p-1.5 rounded-md transition-all duration-150',
                  viewMode === 'grid-3' ? 'bg-scl-600 text-white shadow-sm' : 'text-dark-400 hover:text-dark-200'
                )}
                title="Grid 3 columns"
              >
                <LayoutList className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={() => setShowAddStage(true)}
              className="btn-primary text-sm"
            >
              <Plus className="w-4 h-4" />
              Add Stage
            </button>
          </div>
        </div>
        {/* Filter Bar */}
        <div className="flex items-center gap-3 mt-3">
          <Filter className="w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search leads..."
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            className="input py-1.5 px-3 text-sm w-48"
          />
          <select
            value={filterTag}
            onChange={(e) => setFilterTag(e.target.value)}
            className="input py-1.5 px-3 text-sm w-40"
          >
            <option value="">All Tags</option>
            {allTags.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          <select
            value={filterRep}
            onChange={(e) => setFilterRep(e.target.value)}
            className="input py-1.5 px-3 text-sm w-40"
          >
            <option value="">All Reps</option>
            {allUsers.map(u => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </select>
          {(filterTag || filterRep || filterSearch) && (
            <button
              onClick={() => { setFilterTag(''); setFilterRep(''); setFilterSearch(''); }}
              className="btn-ghost text-xs text-dark-400 hover:text-dark-200"
            >
              <X className="w-3.5 h-3.5 mr-1" /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Board */}
      <div className={clsx(
        'flex-1 p-6',
        viewMode === 'board' ? 'overflow-x-auto' : 'overflow-y-auto'
      )}>
        {isLoading ? (
          <div className={clsx(
            viewMode === 'board'
              ? 'flex gap-4 h-full'
              : `grid gap-4 ${viewMode === 'grid-2' ? 'grid-cols-2' : 'grid-cols-3'}`
          )}>
            {[...Array(5)].map((_, i) => (
              <div key={i} className={clsx(
                'bg-dark-800/50 rounded-xl animate-pulse',
                viewMode === 'board' ? 'w-[300px] shrink-0 h-[400px]' : 'h-[300px]'
              )} />
            ))}
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragOver={handleDragOver}
            onDragEnd={handleDragEnd}
            onDragCancel={handleDragCancel}
            measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          >
            <SortableContext
              items={stageIds}
              strategy={viewMode === 'board' ? horizontalListSortingStrategy : rectSortingStrategy}
            >
              <div className={clsx(
                viewMode === 'board'
                  ? 'flex gap-4 h-full min-h-[500px]'
                  : `grid gap-4 auto-rows-min ${
                      viewMode === 'grid-2' ? 'grid-cols-1 md:grid-cols-2' :
                      'grid-cols-1 md:grid-cols-2 xl:grid-cols-3'
                    }`
              )}>
                {stages.map((stage) => (
                  <SortableStageColumn
                    key={stage.id}
                    stage={stage}
                    isMenuOpen={openMenuStageId === stage.id}
                    onToggleMenu={() => setOpenMenuStageId(openMenuStageId === stage.id ? null : stage.id)}
                    menuRef={openMenuStageId === stage.id ? menuRef : undefined}
                    onEdit={() => { setOpenMenuStageId(null); setEditingStage(stage); }}
                    onDelete={() => {
                      setOpenMenuStageId(null);
                      if (stage.cards.length > 0) {
                        if (!window.confirm(`Delete "${stage.name}"? ${stage.cards.length} cards will be moved to the first stage.`)) return;
                      }
                      deleteStMutation.mutate(stage.id);
                    }}
                    onContextMenu={handleContextMenu}
                    isAnyDragging={!!activeId}
                    viewMode={viewMode}
                  />
                ))}
                {/* Add stage inline card */}
                <button
                  onClick={() => setShowAddStage(true)}
                  className={clsx(
                    'flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-dark-700 hover:border-scl-600/50 hover:bg-dark-800/20 transition-all duration-200 gap-2 text-dark-500 hover:text-scl-400',
                    viewMode === 'board' ? 'w-[300px] shrink-0 min-h-[200px]' : 'min-h-[150px]'
                  )}
                >
                  <Plus className="w-6 h-6" />
                  <span className="text-sm font-medium">Add Stage</span>
                </button>
              </div>
            </SortableContext>

            <DragOverlay dropAnimation={{
              duration: 200,
              easing: 'cubic-bezier(0.25, 1, 0.5, 1)',
            }}>
              {activeCard && <CardOverlay card={activeCard} />}
              {activeStage && <StageOverlay stage={activeStage} />}
            </DragOverlay>
          </DndContext>
        )}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-[100] w-52 bg-dark-800 border border-dark-600 rounded-lg shadow-2xl py-1 animate-in fade-in zoom-in-95 duration-100"
          style={{ left: contextMenu.x, top: contextMenu.y }}
        >
          {contextMenu.type === 'card' && contextMenu.card && (
            <>
              <button
                onClick={() => {
                  navigate(`/inbox?lead=${contextMenu.card!.leadId}`);
                  setContextMenu(null);
                }}
                className="ctx-menu-item"
              >
                <MessageSquare className="w-3.5 h-3.5" /> Open Conversation
              </button>
              <button
                onClick={() => {
                  navigate(`/inbox?lead=${contextMenu.card!.leadId}&reply=true`);
                  setContextMenu(null);
                }}
                className="ctx-menu-item"
              >
                <Send className="w-3.5 h-3.5" /> Send SMS
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(contextMenu.card!.lead.phone);
                  toast.success('Phone copied');
                  setContextMenu(null);
                }}
                className="ctx-menu-item"
              >
                <Copy className="w-3.5 h-3.5" /> Copy Phone
              </button>
              <div className="border-t border-dark-700 my-1" />
              <button
                onClick={() => {
                  setShowAssignModal(contextMenu.card!);
                  setContextMenu(null);
                }}
                className="ctx-menu-item"
              >
                <UserPlus className="w-3.5 h-3.5" /> Assign Rep
              </button>
              <button
                onClick={() => {
                  setShowNoteModal(contextMenu.card!);
                  setContextMenu(null);
                }}
                className="ctx-menu-item"
              >
                <StickyNote className="w-3.5 h-3.5" /> Add Note
              </button>
              <button
                onClick={() => {
                  setDetailLeadId(contextMenu.card!.leadId);
                  setContextMenu(null);
                }}
                className="ctx-menu-item"
              >
                <ExternalLink className="w-3.5 h-3.5" /> View Details
              </button>
              <div className="border-t border-dark-700 my-1" />
              <button
                onClick={() => {
                  markDncMutation.mutate(contextMenu.card!.leadId);
                  setContextMenu(null);
                }}
                className="ctx-menu-item text-red-400 hover:!bg-red-500/10"
              >
                <Ban className="w-3.5 h-3.5" /> Mark DNC
              </button>
            </>
          )}
          {contextMenu.type === 'stage' && contextMenu.stage && (
            <>
              <button
                onClick={() => {
                  setEditingStage(contextMenu.stage!);
                  setContextMenu(null);
                }}
                className="ctx-menu-item"
              >
                <Edit3 className="w-3.5 h-3.5" /> Edit Stage
              </button>
              <button
                onClick={() => {
                  setEditingStage(contextMenu.stage!);
                  setContextMenu(null);
                }}
                className="ctx-menu-item"
              >
                <Palette className="w-3.5 h-3.5" /> Change Color
              </button>
              <div className="border-t border-dark-700 my-1" />
              <button
                onClick={() => {
                  const st = contextMenu.stage!;
                  if (st.cards.length > 0 && !window.confirm(`Delete "${st.name}"? ${st.cards.length} cards will be moved.`)) {
                    setContextMenu(null);
                    return;
                  }
                  deleteStMutation.mutate(st.id);
                  setContextMenu(null);
                }}
                className="ctx-menu-item text-red-400 hover:!bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete Stage
              </button>
            </>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddStage && <StageModal onClose={() => setShowAddStage(false)} />}
      {editingStage && <StageModal stage={editingStage} onClose={() => setEditingStage(null)} />}
      {showAssignModal && (
        <AssignRepModal
          card={showAssignModal}
          users={allUsers}
          onAssign={(repId) => assignRepMutation.mutate({ leadId: showAssignModal.leadId, repId })}
          onClose={() => setShowAssignModal(null)}
        />
      )}
      {showNoteModal && (
        <NoteModal
          card={showNoteModal}
          onSave={(notes) => saveNoteMutation.mutate({ leadId: showNoteModal.leadId, notes })}
          onClose={() => setShowNoteModal(null)}
        />
      )}
      {detailLeadId && (
        <LeadDetailDrawer leadId={detailLeadId} onClose={() => setDetailLeadId(null)} />
      )}
    </div>
  );
}
