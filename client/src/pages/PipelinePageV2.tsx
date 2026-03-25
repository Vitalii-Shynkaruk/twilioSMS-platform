import { useState, useMemo, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealApi, repApi } from '../services/api';
import {
  Search,
  Plus,
  Flame,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  Zap,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  FileText,
  RefreshCw,
  Phone,
  CheckCircle,
} from 'lucide-react';
import { clsx } from 'clsx';
import { useAuthStore } from '../stores/authStore';
import DealCard, { STAGE_COLORS, formatCurrency } from '../components/pipeline/DealCard';
import DealPanel from '../components/pipeline/DealPanel';
import CreateDealModal from '../components/pipeline/CreateDealModal';
import type { Deal, DealStage, DealBoard, DealStats, Rep } from '../types';
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import toast from 'react-hot-toast';

const STAGES: { value: DealStage; label: string; short: string }[] = [
  { value: 'NEW_LEAD', label: 'New Lead', short: 'New' },
  { value: 'ENGAGED_INTERESTED', label: 'Engaged / Interested', short: 'Engaged' },
  { value: 'QUALIFIED', label: 'Qualified', short: 'Qualified' },
  { value: 'SUBMITTED_IN_REVIEW', label: 'Submitted (In Review)', short: 'Submitted' },
  { value: 'APPROVED_OFFERS', label: 'Approved / Offers', short: 'Offers' },
  { value: 'COMMITTED_FUNDING', label: 'Committed → Funding', short: 'Committed' },
  { value: 'FUNDED', label: 'Funded', short: 'Funded' },
  { value: 'NURTURE', label: 'Nurture (Lost)', short: 'Nurture' },
  { value: 'CLOSED', label: 'Closed (DQ)', short: 'Closed' },
];

type QuickFilter = 'all' | 'mine' | 'overdue' | 'hot' | 'neglected' | 'this_week';
type ViewTab = 'board' | 'revive';

export default function PipelinePage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const qc = useQueryClient();

  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const [search, setSearch] = useState('');
  const [repFilter, setRepFilter] = useState<string>('');
  const [viewMode, setViewMode] = useState<'simple' | 'execution'>('simple');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [activeTab, setActiveTab] = useState<ViewTab>('board');
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // Fetch board data
  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ['deals', 'board', repFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (repFilter) params.repId = repFilter;
      if (isAdmin) params.teamView = 'true';
      const { data } = await dealApi.getBoard(params);
      return data as DealBoard;
    },
    refetchInterval: 30000,
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['deals', 'stats', repFilter],
    queryFn: async () => {
      const params: Record<string, string> = {};
      if (repFilter) params.repId = repFilter;
      const { data } = await dealApi.getStats(params);
      return data as DealStats;
    },
    refetchInterval: 30000,
  });

  // Fetch reps for filter
  const { data: reps } = useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps({ activeOnly: 'true' });
      return data as Rep[];
    },
    enabled: isAdmin,
  });

  // Revive queue
  const { data: reviveQueue } = useQuery({
    queryKey: ['deals', 'revive'],
    queryFn: async () => {
      const { data } = await dealApi.getReviveQueue();
      return data as Deal[];
    },
    enabled: activeTab === 'revive',
  });

  // Move mutation for DnD
  const moveMutation = useMutation({
    mutationFn: ({ dealId, stage }: { dealId: string; stage: string }) => dealApi.moveDeal(dealId, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal moved');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Move failed — validation required'),
  });

  // Filter deals by search + quick filter
  const filteredBoard = useMemo(() => {
    if (!board?.stages) return board;
    const q = search.toLowerCase();
    const now = new Date();
    return {
      ...board,
      stages: board.stages.map((s: any) => ({
        ...s,
        deals: s.deals.filter((d: Deal) => {
          // Text search
          if (
            q &&
            !(
              d.client?.businessName?.toLowerCase().includes(q) ||
              d.client?.contactName?.toLowerCase().includes(q) ||
              d.productType?.toLowerCase().includes(q)
            )
          )
            return false;
          // Quick filters
          if (quickFilter === 'mine' && d.assignedRepId !== user?.id) return false;
          if (quickFilter === 'overdue' && (!d.nextActionDue || new Date(d.nextActionDue) >= now)) return false;
          if (quickFilter === 'hot' && !d.isHot) return false;
          if (quickFilter === 'neglected' && (d.staleDays || 0) < 2) return false;
          if (quickFilter === 'this_week') {
            const weekEnd = new Date();
            weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
            if (!d.nextActionDue || new Date(d.nextActionDue) > weekEnd) return false;
          }
          return true;
        }),
      })),
    };
  }, [board, search, quickFilter, user?.id]);

  const handleDragEnd = useCallback(
    (event: any) => {
      const { active, over } = event;
      setActiveDragId(null);
      if (!over || !active) return;
      const dealId = active.id as string;
      const targetStage = over.id as string;
      // Find current stage of the deal
      const currentStage = board?.stages?.find((s: any) => s.deals.some((d: Deal) => d.id === dealId))?.stage;
      if (currentStage === targetStage) return;
      // Nurture + Closed need extra fields — open panel instead
      if (targetStage === 'NURTURE' || targetStage === 'CLOSED') {
        setSelectedDealId(dealId);
        toast('Open panel to set required fields for this stage', { icon: 'ℹ️' });
        return;
      }
      moveMutation.mutate({ dealId, stage: targetStage });
    },
    [board, moveMutation],
  );

  // Find dragged deal for overlay
  const draggedDeal = useMemo(() => {
    if (!activeDragId || !board?.stages) return null;
    for (const s of board.stages) {
      const deal = s.deals.find((d: Deal) => d.id === activeDragId);
      if (deal) return deal;
    }
    return null;
  }, [activeDragId, board]);

  return (
    <div className="h-full flex flex-col">
      {/* Stats bar */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 pb-0">
          <StatCard
            icon={DollarSign}
            label="Pipeline Value"
            value={formatCurrency(stats.pipelineValue)}
            color="text-scl-500"
          />
          <StatCard
            icon={TrendingUp}
            label="Funded MTD"
            value={formatCurrency(stats.fundedMTD)}
            color="text-green-400"
          />
          <StatCard icon={Flame} label="Hot Deals" value={String(stats.hotCount)} color="text-orange-400" />
          <StatCard icon={AlertTriangle} label="At Risk" value={String(stats.atRisk)} color="text-red-400" />
          <StatCard
            icon={Zap}
            label="Active"
            value={String(stats.activeCount ?? stats.activePipeline)}
            color="text-blue-400"
          />
        </div>
      )}

      {/* Tab row: Board | Revive Queue */}
      <div className="flex items-center gap-4 px-4 pt-3">
        <button
          onClick={() => setActiveTab('board')}
          className={clsx(
            'text-sm font-medium pb-1 border-b-2 transition',
            activeTab === 'board'
              ? 'text-scl-500 border-scl-500'
              : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]',
          )}
        >
          Pipeline Board
        </button>
        <button
          onClick={() => setActiveTab('revive')}
          className={clsx(
            'text-sm font-medium pb-1 border-b-2 transition',
            activeTab === 'revive'
              ? 'text-scl-500 border-scl-500'
              : 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-secondary)]',
          )}
        >
          <RotateCcw className="w-3.5 h-3.5 inline mr-1" />
          Revive Queue
        </button>
      </div>

      {activeTab === 'board' ? (
        <>
          {/* Toolbar */}
          <div className="flex flex-wrap items-center gap-3 p-4">
            {/* Search */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deals..."
                className="w-full pl-9 pr-3 py-2 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)]"
              />
            </div>

            {/* Quick filters */}
            <div className="flex gap-1">
              {(
                [
                  { key: 'all', label: 'All' },
                  { key: 'mine', label: 'Mine' },
                  { key: 'hot', label: 'Hot' },
                  { key: 'overdue', label: 'Overdue' },
                  { key: 'neglected', label: 'Neglected' },
                  { key: 'this_week', label: 'This Week' },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  onClick={() => setQuickFilter(f.key)}
                  className={clsx(
                    'px-2.5 py-1 text-[10px] font-medium rounded-full transition',
                    quickFilter === f.key
                      ? 'bg-scl-500 text-white'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {/* Rep filter */}
            {isAdmin && reps && (
              <select
                value={repFilter}
                onChange={(e) => setRepFilter(e.target.value)}
                className="px-3 py-2 text-sm rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              >
                <option value="">All Reps</option>
                {reps.map((rep: Rep) => (
                  <option key={rep.id} value={rep.id}>
                    {rep.firstName} {rep.lastName || ''} {rep.initials ? `(${rep.initials})` : ''}
                  </option>
                ))}
              </select>
            )}

            {/* View toggle */}
            <div className="flex rounded-lg border border-[var(--border-primary)] overflow-hidden">
              <button
                onClick={() => setViewMode('simple')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium transition',
                  viewMode === 'simple' ? 'bg-scl-500 text-white' : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
                )}
              >
                Simple
              </button>
              <button
                onClick={() => setViewMode('execution')}
                className={clsx(
                  'px-3 py-1.5 text-xs font-medium transition',
                  viewMode === 'execution'
                    ? 'bg-scl-500 text-white'
                    : 'bg-[var(--bg-secondary)] text-[var(--text-muted)]',
                )}
              >
                Execution
              </button>
            </div>

            {/* Create deal */}
            <button
              onClick={() => setShowCreateDeal(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg bg-scl-500 text-white hover:bg-scl-600 transition"
            >
              <Plus className="w-4 h-4" />
              New Deal
            </button>
          </div>

          {/* Board with DnD */}
          <div className="flex-1 overflow-x-auto overflow-y-hidden p-4 pt-0">
            {boardLoading ? (
              <div className="flex items-center justify-center h-64">
                <div className="w-8 h-8 border-2 border-scl-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={(e) => setActiveDragId(e.active.id as string)}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDragId(null)}
              >
                <div className="flex gap-3 h-full min-w-max">
                  {STAGES.map((stageDef) => {
                    const stageData = filteredBoard?.stages?.find((s: any) => s.stage === stageDef.value);
                    const deals = stageData?.deals || [];
                    const count = stageData?.count || deals.length;
                    const value = stageData?.value || 0;
                    return (
                      <StageColumn
                        key={stageDef.value}
                        stage={stageDef}
                        deals={deals}
                        count={count}
                        value={value}
                        viewMode={viewMode}
                        onDealClick={(id) => setSelectedDealId(id)}
                      />
                    );
                  })}
                </div>
                <DragOverlay>
                  {draggedDeal && <DealCard deal={draggedDeal} compact={viewMode === 'simple'} />}
                </DragOverlay>
              </DndContext>
            )}
          </div>
        </>
      ) : (
        /* Revive Queue — one-card-at-a-time */
        <ReviveQueueView deals={reviveQueue || []} onDealClick={(id) => setSelectedDealId(id)} />
      )}

      {/* Deal Panel */}
      {selectedDealId && <DealPanel dealId={selectedDealId} onClose={() => setSelectedDealId(null)} />}
      {showCreateDeal && <CreateDealModal onClose={() => setShowCreateDeal(false)} />}
    </div>
  );
}

// ─── Stage Column (droppable) ───
function StageColumn({
  stage,
  deals,
  count,
  value,
  viewMode,
  onDealClick,
}: {
  stage: { value: DealStage; label: string; short: string };
  deals: Deal[];
  count: number;
  value: number;
  viewMode: string;
  onDealClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.value });
  const color = STAGE_COLORS[stage.value] || '#6366f1';

  return (
    <div
      ref={setNodeRef}
      className={clsx(
        'w-[220px] flex-shrink-0 flex flex-col rounded-xl border transition-colors',
        isOver ? 'bg-scl-500/10 border-scl-500/40' : 'bg-[var(--bg-secondary)]/50 border-[var(--border-primary)]',
      )}
    >
      <div className="p-3 border-b border-[var(--border-primary)]">
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
          <h3 className="text-xs font-semibold text-[var(--text-primary)] truncate">{stage.short}</h3>
          <span className="ml-auto text-[10px] font-medium bg-[var(--bg-tertiary)] text-[var(--text-muted)] px-1.5 py-0.5 rounded-full">
            {count}
          </span>
        </div>
        {viewMode === 'execution' && stage.value !== 'SUBMITTED_IN_REVIEW' && value > 0 && (
          <p className="text-[10px] text-[var(--text-muted)]">{formatCurrency(value)}</p>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-[100px]">
        {deals.length === 0 ? (
          <p className="text-[10px] text-[var(--text-muted)] text-center py-4">No deals</p>
        ) : (
          deals.map((deal: Deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              compact={viewMode === 'simple'}
              onClick={() => onDealClick(deal.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Draggable Deal Card ───
function DraggableDealCard({ deal, compact, onClick }: { deal: Deal; compact: boolean; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` } : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} className={clsx(isDragging && 'opacity-30')}>
      <DealCard deal={deal} onClick={onClick} compact={compact} />
    </div>
  );
}

// ─── Revive Queue — one-card-at-a-time ───
function ReviveQueueView({ deals, onDealClick }: { deals: Deal[]; onDealClick: (id: string) => void }) {
  const [idx, setIdx] = useState(0);
  const qc = useQueryClient();

  const reopenMutation = useMutation({
    mutationFn: (dealId: string) => dealApi.moveDeal(dealId, { stage: 'ENGAGED_INTERESTED' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal reopened → Engaged');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Reopen failed'),
  });

  const completeMutation = useMutation({
    mutationFn: (dealId: string) => dealApi.completeAction(dealId, { outcome: 'completed' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Action completed');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Complete failed'),
  });

  if (deals.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <RotateCcw className="w-12 h-12 text-[var(--text-muted)] mx-auto mb-3" />
          <p className="text-sm text-[var(--text-muted)]">No deals in the revive queue</p>
          <p className="text-xs text-[var(--text-muted)] mt-1">Deals appear here when they need re-engagement</p>
        </div>
      </div>
    );
  }

  const deal = deals[Math.min(idx, deals.length - 1)];

  return (
    <div className="flex-1 flex items-center justify-center p-8">
      <div className="w-full max-w-lg">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs text-[var(--text-muted)]">
            {idx + 1} of {deals.length}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => setIdx(Math.max(0, idx - 1))}
              disabled={idx === 0}
              className="p-2 rounded-lg border border-[var(--border-primary)] disabled:opacity-30 hover:bg-[var(--bg-tertiary)] transition"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setIdx(Math.min(deals.length - 1, idx + 1))}
              disabled={idx >= deals.length - 1}
              className="p-2 rounded-lg border border-[var(--border-primary)] disabled:opacity-30 hover:bg-[var(--bg-tertiary)] transition"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-6 space-y-4">
          <div>
            <h2 className="text-xl font-bold text-[var(--text-primary)]">{deal.client?.businessName}</h2>
            <div className="flex items-center gap-3 mt-1">
              {deal.dealAmount && (
                <span className="text-lg font-semibold text-[var(--text-primary)]">
                  {formatCurrency(deal.dealAmount)}
                </span>
              )}
              {deal.productType && (
                <span className="text-xs px-2 py-0.5 rounded bg-[var(--bg-tertiary)] text-[var(--text-secondary)]">
                  {deal.productType}
                </span>
              )}
              <span className="text-xs text-[var(--text-muted)]">Stage: {deal.stage.replace(/_/g, ' ')}</span>
            </div>
            {deal.lostReason && <p className="text-xs text-amber-400 mt-2">Lost: {deal.lostReason}</p>}
            {deal.followUpDate && (
              <p className="text-xs text-[var(--text-muted)] mt-1">
                Follow-up: {new Date(deal.followUpDate).toLocaleDateString()}
              </p>
            )}
          </div>

          {/* Primary actions */}
          <div className="flex gap-2">
            <button
              onClick={() => onDealClick(deal.id)}
              className="flex-1 px-4 py-2.5 text-sm font-medium rounded-lg bg-scl-500 text-white hover:bg-scl-600 transition"
            >
              <FileText className="w-4 h-4 inline mr-1" />
              Open Deal
            </button>
            <button
              onClick={() => setIdx(Math.min(deals.length - 1, idx + 1))}
              className="px-4 py-2.5 text-sm font-medium rounded-lg border border-[var(--border-primary)] text-[var(--text-muted)] hover:bg-[var(--bg-tertiary)] transition"
            >
              <SkipForward className="w-4 h-4 inline mr-1" />
              Skip
            </button>
          </div>

          {/* Quick actions */}
          <div className="flex gap-2 pt-1 border-t border-[var(--border-primary)]">
            <button
              onClick={() => reopenMutation.mutate(deal.id)}
              disabled={reopenMutation.isPending}
              className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-green-600/20 text-green-400 hover:bg-green-600/30 disabled:opacity-50 transition"
            >
              <RefreshCw className="w-3.5 h-3.5 inline mr-1" />
              Reopen
            </button>
            {deal.client?.phone && (
              <a
                href={`tel:${deal.client.phone}`}
                className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 transition text-center"
              >
                <Phone className="w-3.5 h-3.5 inline mr-1" />
                Call Now
              </a>
            )}
            <button
              onClick={() => completeMutation.mutate(deal.id)}
              disabled={completeMutation.isPending}
              className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-amber-600/20 text-amber-400 hover:bg-amber-600/30 disabled:opacity-50 transition"
            >
              <CheckCircle className="w-3.5 h-3.5 inline mr-1" />
              Complete
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Stat Card ───
function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: string }) {
  return (
    <div className="p-3 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
      <div className="flex items-center gap-2">
        <Icon className={clsx('w-4 h-4', color)} />
        <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase">{label}</span>
      </div>
      <p className="text-lg font-bold text-[var(--text-primary)] mt-1">{value}</p>
    </div>
  );
}
