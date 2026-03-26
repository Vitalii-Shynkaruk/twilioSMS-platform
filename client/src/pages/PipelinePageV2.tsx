import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { dealApi, repApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import DealCard, { formatCurrency } from '../components/pipeline/DealCard';
import DealPanel from '../components/pipeline/DealPanel';
import CreateDealModal from '../components/pipeline/CreateDealModal';
import type { Deal, DealStage, DealBoard, DealStats, Rep } from '../types';
import { DndContext, DragOverlay, closestCorners, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { useDraggable, useDroppable } from '@dnd-kit/core';
import toast from 'react-hot-toast';
import '../styles/pipeline.css';

// ─── Stage configuration ───

interface StageConfig {
  value: DealStage;
  label: string;
  short: string;
  color: string;
  opacity: number;
  colClass?: string;
  stageClass?: string;
}

const STAGES: StageConfig[] = [
  { value: 'NEW_LEAD', label: 'New Lead', short: 'New Lead', color: '#4A9EE8', opacity: 0.28 },
  { value: 'ENGAGED_INTERESTED', label: 'Engaged / Interested', short: 'Engaged', color: '#9B72E8', opacity: 0.38 },
  {
    value: 'QUALIFIED',
    label: 'Qualified',
    short: 'Qualified',
    color: '#C9952A',
    opacity: 0.45,
  },
  { value: 'SUBMITTED_IN_REVIEW', label: 'Submitted (In Review)', short: 'Submitted', color: '#4A9EE8', opacity: 0.55 },
  {
    value: 'APPROVED_OFFERS',
    label: 'Approved / Offers',
    short: 'Approved / Offers',
    color: '#FF8C00',
    opacity: 0.85,
    colClass: 'nb-col',
    stageClass: 'pipe',
  },
  {
    value: 'COMMITTED_FUNDING',
    label: 'Committed (Funding)',
    short: 'Committed',
    color: '#3AB97A',
    opacity: 0.95,
    colClass: 'nb-col',
    stageClass: 'pipe',
  },
  { value: 'FUNDED', label: 'Funded', short: 'Funded', color: '#3AB97A', opacity: 1, stageClass: 'pipe' },
  { value: 'NURTURE', label: 'Nurture', short: 'Nurture', color: '#4A9EE8', opacity: 0.3 },
  { value: 'CLOSED', label: 'Closed', short: 'Closed', color: '#536070', opacity: 0.28, stageClass: 'closed-s' },
];

const STAGE_LABELS: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.value, s.short]));

type QuickFilter = 'all' | 'mine' | 'overdue' | 'hot' | 'neglected' | 'this_week';
type ViewTab = 'pipeline' | 'team' | 'queue';
type ViewMode = 'simple' | 'execution';
type PipelineScope = 'mine' | 'all';

const FILTERS: { key: QuickFilter; label: string; activeCls: string }[] = [
  { key: 'all', label: 'All', activeCls: 'act' },
  { key: 'mine', label: 'Mine', activeCls: 'act' },
  { key: 'overdue', label: 'Overdue', activeCls: 'urg' },
  { key: 'hot', label: '🔥 Hot', activeCls: 'fire' },
  { key: 'neglected', label: 'Neglected', activeCls: 'urg' },
  { key: 'this_week', label: '📅 This Week', activeCls: 'week-act' },
];

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════

export default function PipelinePage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const qc = useQueryClient();

  // ─── State ───
  const [viewMode, setViewMode] = useState<ViewMode>('simple');
  const [viewTab, setViewTab] = useState<ViewTab>('pipeline');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [pipelineScope, setPipelineScope] = useState<PipelineScope>(isAdmin ? 'all' : 'mine');
  const [repFilter, setRepFilter] = useState('');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [showCreateDeal, setShowCreateDeal] = useState(false);
  const [showGoals, setShowGoals] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // ─── Body class for CSS view mode ───
  useEffect(() => {
    const add = viewMode === 'simple' ? 'simple-view' : 'execution-view';
    const remove = viewMode === 'simple' ? 'execution-view' : 'simple-view';
    document.body.classList.add(add);
    document.body.classList.remove(remove);
    return () => {
      document.body.classList.remove('simple-view', 'execution-view');
    };
  }, [viewMode]);

  // ─── DnD ───
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ─── Data fetching ───
  const userId = user?.id;
  const boardParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (repFilter) {
      params.repId = repFilter;
    } else if (pipelineScope === 'mine' && !isAdmin && userId) {
      params.repId = userId;
    }
    if (isAdmin) params.teamView = 'true';
    return params;
  }, [repFilter, pipelineScope, isAdmin, userId]);

  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ['deals', 'board', boardParams],
    queryFn: async () => {
      const { data } = await dealApi.getBoard(boardParams);
      return data as DealBoard;
    },
    refetchInterval: 30000,
  });

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

  const { data: reps } = useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps({ activeOnly: 'true' });
      return data as Rep[];
    },
    enabled: isAdmin,
  });

  const { data: reviveQueue } = useQuery({
    queryKey: ['deals', 'revive'],
    queryFn: async () => {
      const { data } = await dealApi.getReviveQueue();
      return data as Deal[];
    },
  });

  // ─── Move mutation ───
  const moveMutation = useMutation({
    mutationFn: ({ dealId, stage }: { dealId: string; stage: string }) => dealApi.moveDeal(dealId, { stage }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal moved');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Move failed'),
  });

  // ─── Filtered board ───
  const filteredBoard = useMemo(() => {
    if (!board?.stages) return board;
    const now = new Date();
    return {
      ...board,
      stages: board.stages.map((s: any) => ({
        ...s,
        deals: s.deals.filter((d: Deal) => {
          if (quickFilter === 'mine' && d.assignedRepId !== user?.id) return false;
          if (quickFilter === 'overdue' && (!d.nextActionDue || new Date(d.nextActionDue) >= now)) return false;
          if (quickFilter === 'hot' && !d.isHot) return false;
          if (quickFilter === 'neglected' && (d.staleDays || 0) < 7) return false;
          if (quickFilter === 'this_week') {
            const weekEnd = new Date();
            weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
            if (!d.nextActionDue || new Date(d.nextActionDue) > weekEnd) return false;
          }
          return true;
        }),
      })),
    };
  }, [board, quickFilter, user?.id]);

  // ─── DnD handlers ───
  const handleDragEnd = useCallback(
    (event: any) => {
      const { active, over } = event;
      setActiveDragId(null);
      if (!over || !active) return;
      const dealId = active.id as string;
      const targetStage = over.id as string;
      const currentStage = board?.stages?.find((s: any) => s.deals.some((d: Deal) => d.id === dealId))?.stage;
      if (currentStage === targetStage) return;
      if (targetStage === 'NURTURE' || targetStage === 'CLOSED') {
        setSelectedDealId(dealId);
        toast('Open panel to set required fields for this stage', { icon: 'ℹ️' });
        return;
      }
      moveMutation.mutate({ dealId, stage: targetStage });
    },
    [board, moveMutation],
  );

  const draggedDeal = useMemo(() => {
    if (!activeDragId || !board?.stages) return null;
    for (const s of board.stages) {
      const deal = s.deals.find((d: Deal) => d.id === activeDragId);
      if (deal) return deal;
    }
    return null;
  }, [activeDragId, board]);

  const reviveCount = reviveQueue?.length || 0;

  // ─── Filter counts (computed from unfiltered board) ───
  const filterCounts = useMemo(() => {
    if (!board?.stages) return { overdue: 0, hot: 0, neglected: 0, this_week: 0 };
    const allDeals: Deal[] = board.stages.flatMap((s: any) => s.deals);
    const now = new Date();
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));

    const overdue = allDeals.filter((d) => d.nextActionDue && new Date(d.nextActionDue) < now).length;
    const hot = allDeals.filter((d) => d.isHot).length;
    const neglected = allDeals.filter((d) => (d.staleDays || 0) >= 7 && !['FUNDED', 'CLOSED'].includes(d.stage)).length;
    const this_week = allDeals.filter((d) => {
      if (['CLOSED', 'NURTURE'].includes(d.stage)) return false;
      if (['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(d.stage)) return true;
      if (d.nextActionDue && new Date(d.nextActionDue) < now) return true;
      if (d.nextActionDue) {
        const due = new Date(d.nextActionDue);
        if (due <= weekEnd) return true;
      }
      if (d.isHot) return true;
      return false;
    }).length;
    return { overdue, hot, neglected, this_week };
  }, [board]);

  // ─── Filter labels with counts ───
  const filterLabels = useMemo(
    () => ({
      all: 'All',
      mine: 'Mine',
      overdue: filterCounts.overdue ? `Overdue (${filterCounts.overdue})` : 'Overdue',
      hot: filterCounts.hot ? `🔥 Hot (${filterCounts.hot})` : '🔥 Hot',
      neglected: filterCounts.neglected ? `Neglected (${filterCounts.neglected})` : 'Neglected',
      this_week: filterCounts.this_week ? `📅 This Week (${filterCounts.this_week})` : '📅 This Week',
    }),
    [filterCounts],
  );

  const handleViewTab = (tab: ViewTab, scope?: PipelineScope) => {
    setViewTab(tab);
    if (scope) setPipelineScope(scope);
  };

  // ═══ RENDER ═══
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* ═══ TOPBAR ═══ */}
      <div className="topbar">
        <div className="logo">
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <rect x="1.5" y="1.5" width="14" height="14" rx="3" stroke="#C9952A" strokeWidth="1.4" />
            <path d="M5.5 8.5h6M8.5 5.5v6" stroke="#C9952A" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          SCL <em>Pipeline</em>
        </div>

        {/* Role switch (admin) */}
        {isAdmin && reps && (
          <div className="role-sw">
            <button className={`rs ${!repFilter ? 'act' : ''}`} onClick={() => setRepFilter('')}>
              Admin
            </button>
            {reps.slice(0, 4).map((r) => (
              <button key={r.id} className={`rs ${repFilter === r.id ? 'act' : ''}`} onClick={() => setRepFilter(r.id)}>
                {r.initials || `${r.firstName[0]}${r.lastName?.[0] || ''}`}
              </button>
            ))}
          </div>
        )}

        {/* Filter pills */}
        <div className="fp-row">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`fp ${quickFilter === f.key ? f.activeCls : ''}`}
              onClick={() => setQuickFilter(f.key)}
            >
              {filterLabels[f.key]}
            </button>
          ))}
        </div>

        {/* View switches */}
        <div className="view-sw">
          <button
            className={`vs ${viewTab === 'pipeline' && pipelineScope === 'mine' ? 'act' : ''}`}
            onClick={() => handleViewTab('pipeline', 'mine')}
          >
            My Pipeline
          </button>
          <button className={`vs ${viewTab === 'team' ? 'team-act' : ''}`} onClick={() => handleViewTab('team')}>
            Team Pipeline
          </button>
          {isAdmin && (
            <button
              className={`vs ${viewTab === 'pipeline' && pipelineScope === 'all' ? 'act' : ''}`}
              onClick={() => handleViewTab('pipeline', 'all')}
            >
              All Deals
            </button>
          )}
        </div>

        {/* View mode toggle */}
        <div className="view-mode-sw">
          <button
            className={`vms ${viewMode === 'simple' ? 'act' : ''}`}
            id="vms-simple"
            onClick={() => setViewMode('simple')}
          >
            Simple
          </button>
          <button
            className={`vms ${viewMode === 'execution' ? 'act' : ''}`}
            id="vms-power"
            onClick={() => setViewMode('execution')}
          >
            ⚡ Execution
          </button>
        </div>

        {/* Queue button */}
        <div style={{ position: 'relative', display: 'inline-flex' }}>
          <button
            className={`queue-nav-btn ${viewTab === 'queue' ? 'act' : ''}`}
            onClick={() => setViewTab(viewTab === 'queue' ? 'pipeline' : 'queue')}
          >
            🔁 Revive Queue
          </button>
          {reviveCount > 0 && <span className="notif-badge">{reviveCount}</span>}
        </div>

        {/* Goals button (admin) */}
        {isAdmin && (
          <button className="goal-btn" onClick={() => setShowGoals(true)}>
            ⚡ Goals
          </button>
        )}

        {/* Add lead button */}
        <button className="add-btn" onClick={() => setShowCreateDeal(true)}>
          + Add Lead
        </button>
      </div>

      {/* ═══ LEGEND (hidden in simple mode via CSS) ═══ */}
      <div className="legend">
        <div className="li">
          <div className="ld" style={{ background: 'var(--urgent)' }} />
          Red = Urgent / Overdue
        </div>
        <div className="lsep" />
        <div className="li">
          <div className="ld" style={{ background: 'var(--hot)' }} />
          🔥 HOT = Offer received · replied · lender engaged
        </div>
        <div className="lsep" />
        <div className="li">
          <div className="ld" style={{ background: 'var(--attn)' }} />
          Orange = Attention needed
        </div>
        <div className="lsep" />
        <div className="li">
          <div className="ld" style={{ background: 'var(--watch)' }} />
          Amber = Due soon
        </div>
        <div className="lsep" />
        <div className="li">
          <div className="ld" style={{ background: 'var(--good)' }} />
          Green = Good / funded
        </div>
        <div className="lsep" />
        <div className="li" style={{ color: 'var(--text3)', fontStyle: 'italic' }}>
          ⚡MCA/LOC: flag 2d · 🔧Equipment: 5d · 🏠HELOC: 30d · 🏛SBA/🏢CRE: 60d review clocks
        </div>
      </div>

      {/* ═══ BANNER (role + context) ═══ */}
      <div className="banner">
        {isAdmin && !repFilter ? (
          <>
            <span
              className="vb"
              style={{ background: 'var(--gold-bg)', color: 'var(--gold)', border: '1px solid var(--gold-b)' }}
            >
              Admin — Full Access
            </span>
            <span className="btext">
              All reps · all clients · full edit access
              {viewMode === 'execution' ? ' · ⚡ Execution Mode' : ''}
              {quickFilter === 'overdue' ? ' · Overdue only' : ''}
              {quickFilter === 'hot' ? ' · Hot deals' : ''}
              {quickFilter === 'neglected' ? ' · Neglected' : ''}
              {quickFilter === 'this_week' ? ' · 📅 This Week — likely to close' : ''}
            </span>
          </>
        ) : repFilter && reps ? (
          <>
            <span
              className="vb"
              style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-b)' }}
            >
              My Pipeline ({reps.find((r) => r.id === repFilter)?.initials || '?'})
            </span>
            <span className="btext">Your deals only</span>
          </>
        ) : viewTab === 'team' ? (
          <>
            <span
              className="vb"
              style={{ background: 'var(--good-bg)', color: 'var(--good)', border: '1px solid var(--good-b)' }}
            >
              Team Pipeline
            </span>
            <span className="btext">Shared view · Approved/Offers + Committed + Funded only · no contact info</span>
          </>
        ) : (
          <>
            <span
              className="vb"
              style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-b)' }}
            >
              My Pipeline
            </span>
            <span className="btext">Your deals only</span>
          </>
        )}
      </div>

      {/* ═══ MAIN CONTENT ═══ */}

      {viewTab === 'pipeline' && (
        <>
          {/* Board */}
          <div className="board-wrap">
            {boardLoading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: '200px',
                  color: 'var(--text3)',
                }}
              >
                Loading…
              </div>
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCorners}
                onDragStart={(e) => setActiveDragId(e.active.id as string)}
                onDragEnd={handleDragEnd}
                onDragCancel={() => setActiveDragId(null)}
              >
                <div className="board">
                  {STAGES.filter((s) => viewMode !== 'simple' || s.value !== 'CLOSED').map((stageDef) => {
                    const stageData = filteredBoard?.stages?.find((s: any) => s.stage === stageDef.value);
                    const deals = stageData?.deals || [];
                    const count = stageData?.count || deals.length;
                    const value = stageData?.value || 0;
                    return (
                      <StageColumn
                        key={stageDef.value}
                        config={stageDef}
                        deals={deals}
                        count={count}
                        value={value}
                        viewMode={viewMode}
                        onDealClick={(id) => setSelectedDealId(id)}
                      />
                    );
                  })}
                </div>
                <DragOverlay>{draggedDeal && <DealCard deal={draggedDeal} viewMode={viewMode} />}</DragOverlay>
              </DndContext>
            )}
          </div>

          {/* Manager bar (hidden in simple via CSS) */}
          {isAdmin && stats && reps && reps.length > 0 && (
            <div className="mgr-bar">
              {/* Rep names column */}
              <div className="mc">
                <div className="ml">Rep</div>
                <div className="mr2">
                  {reps.map((rep) => (
                    <div key={rep.id} className="mri">
                      <div
                        className="av"
                        style={{
                          width: '15px',
                          height: '15px',
                          background: rep.avatarColor || 'var(--gold)',
                          fontSize: '7px',
                        }}
                      >
                        {rep.initials || rep.firstName[0]}
                      </div>
                      {rep.firstName} {rep.lastName}
                    </div>
                  ))}
                </div>
              </div>
              {/* Active */}
              <div className="mc">
                <div className="ml">Active</div>
                <div className="mr2">
                  {reps.map((rep) => {
                    const v =
                      board?.stages
                        ?.flatMap((s: any) => s.deals)
                        .filter((d: Deal) => d.assignedRepId === rep.id && !['FUNDED', 'CLOSED'].includes(d.stage))
                        .length || 0;
                    return (
                      <div key={rep.id} className="mri">
                        <span className="mgr-val" style={{ color: v ? 'var(--text)' : 'var(--text3)' }}>
                          {v}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Overdue */}
              <div className="mc">
                <div className="ml">Overdue</div>
                <div className="mr2">
                  {reps.map((rep) => {
                    const now = new Date();
                    const v =
                      board?.stages
                        ?.flatMap((s: any) => s.deals)
                        .filter(
                          (d: Deal) => d.assignedRepId === rep.id && d.nextActionDue && new Date(d.nextActionDue) < now,
                        ).length || 0;
                    return (
                      <div key={rep.id} className="mri">
                        <span className="mgr-val" style={{ color: v ? 'var(--urgent)' : 'var(--text3)' }}>
                          {v}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Hot */}
              <div className="mc">
                <div className="ml">🔥 Hot</div>
                <div className="mr2">
                  {reps.map((rep) => {
                    const v =
                      board?.stages
                        ?.flatMap((s: any) => s.deals)
                        .filter((d: Deal) => d.assignedRepId === rep.id && d.isHot).length || 0;
                    return (
                      <div key={rep.id} className="mri">
                        <span className="mgr-val" style={{ color: v ? 'var(--hot)' : 'var(--text3)' }}>
                          {v}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Pipeline $ */}
              <div className="mc">
                <div className="ml">Pipeline $</div>
                <div className="mr2">
                  {reps.map((rep) => {
                    const total =
                      board?.stages
                        ?.filter((s: any) => ['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(s.stage))
                        .flatMap((s: any) => s.deals)
                        .filter((d: Deal) => d.assignedRepId === rep.id)
                        .reduce((sum: number, d: Deal) => {
                          const best = d.offers?.length
                            ? d.offers.reduce((a, b) => (a.amount > b.amount ? a : b)).amount
                            : 0;
                          return sum + best;
                        }, 0) || 0;
                    return (
                      <div key={rep.id} className="mri">
                        <span className="mgr-val" style={{ color: total ? 'var(--good)' : 'var(--text3)' }}>
                          {total ? formatCurrency(total) : '$0'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Funded MTD */}
              <div className="mc">
                <div className="ml">Funded MTD</div>
                <div className="mr2">
                  {reps.map((rep) => {
                    const total =
                      board?.stages
                        ?.find((s: any) => s.stage === 'FUNDED')
                        ?.deals.filter((d: Deal) => d.assignedRepId === rep.id)
                        .reduce((sum: number, d: Deal) => sum + (d.fundingEvents?.[0]?.amountFunded || 0), 0) || 0;
                    return (
                      <div key={rep.id} className="mri">
                        <span className="mgr-val" style={{ color: total ? 'var(--good)' : 'var(--text3)' }}>
                          {total ? formatCurrency(total) : '$0'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* Shared */}
              <div className="mc">
                <div className="ml">Shared</div>
                <div className="mr2">
                  {reps.map((rep) => {
                    const count =
                      board?.stages?.reduce(
                        (acc: number, s: any) =>
                          acc +
                          s.deals.filter((d: Deal) => d.coRepIds?.includes(rep.id) && d.assignedRepId !== rep.id)
                            .length,
                        0,
                      ) || 0;
                    return (
                      <div key={rep.id} className="mri">
                        <span className="mgr-val" style={{ color: count ? 'var(--info)' : 'var(--text3)' }}>
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
              {/* MTD Goal % */}
              <div className="mc">
                <div className="ml">MTD Goal %</div>
                <div className="mr2">
                  {reps.map((rep) => {
                    const funded =
                      board?.stages
                        ?.find((s: any) => s.stage === 'FUNDED')
                        ?.deals.filter((d: Deal) => d.assignedRepId === rep.id)
                        .reduce((sum: number, d: Deal) => sum + (d.fundingEvents?.[0]?.amountFunded || 0), 0) || 0;
                    const goal = rep.monthlyGoal || 0;
                    if (!goal)
                      return (
                        <div key={rep.id} className="mri">
                          <span className="mgr-val" style={{ color: 'var(--text3)' }}>
                            —
                          </span>
                        </div>
                      );
                    const pct = Math.round((funded / goal) * 100);
                    const barColor = pct >= 75 ? 'var(--good)' : pct >= 50 ? 'var(--watch)' : 'var(--urgent)';
                    return (
                      <div
                        key={rep.id}
                        className="mri"
                        style={{ flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}
                      >
                        <span className="mgr-val" style={{ color: barColor }}>
                          {pct}%
                        </span>
                        <div style={{ width: '60px' }}>
                          <div className="goal-bar-track">
                            <div
                              className="goal-bar-fill"
                              style={{ width: `${Math.min(100, pct)}%`, background: barColor }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Summary bar (hidden in simple via CSS) */}
          {stats && (
            <div className="sum-bar">
              <div className="sb2">
                <div className="sl">Active Pipeline</div>
                <div className="sv" style={{ color: 'var(--good)' }}>
                  {formatCurrency(stats.pipelineValue)}
                </div>
                <div className="ss">Approved + Committed</div>
              </div>
              <div className="sb2 goal-block">
                <div className="sl">Funded MTD</div>
                <div className="sv" style={{ color: 'var(--good)' }}>
                  {formatCurrency(stats.fundedMTD)}
                </div>
                <div className="ss">Goal: {formatCurrency(stats.monthlyGoal)}</div>
                {stats.monthlyGoal &&
                  stats.monthlyGoal > 0 &&
                  (() => {
                    const pct = Math.round(((stats.fundedMTD || 0) / stats.monthlyGoal) * 100);
                    const barColor = pct >= 75 ? 'var(--good)' : pct >= 50 ? 'var(--watch)' : 'var(--urgent)';
                    const goalCls = pct >= 75 ? 'on-track' : pct >= 50 ? 'at-risk' : 'behind';
                    return (
                      <div className="goal-bar-wrap">
                        <div className="goal-bar-track">
                          <div
                            className="goal-bar-fill"
                            style={{ width: `${Math.min(100, pct)}%`, background: barColor }}
                          />
                        </div>
                        <div className={`goal-pct ${goalCls}`}>
                          {pct}% of {formatCurrency(stats.monthlyGoal)} monthly goal
                        </div>
                      </div>
                    );
                  })()}
              </div>
              <div className="sb2">
                <div className="sl">Lifetime Funded</div>
                <div className="sv" style={{ color: 'var(--gold)' }}>
                  {formatCurrency(stats.lifetimeFunded)}
                </div>
                <div className="ss">All clients</div>
              </div>
              <div className="sb2">
                <div className="sl">⚠ At Risk</div>
                <div className="sv" style={{ color: (stats.atRisk || 0) > 0 ? 'var(--urgent)' : 'var(--text3)' }}>
                  {formatCurrency(stats.atRisk)}
                </div>
                <div className="ss">Overdue / stale / no action</div>
              </div>
              <div className="sb2">
                <div className="sl">🔥 Hot</div>
                <div className="sv" style={{ color: 'var(--hot)' }}>
                  {stats.hotCount}
                </div>
                <div className="ss">Offer / replied / engaged</div>
              </div>
              <div className="sb2">
                <div className="sl">No Next Action</div>
                <div className="sv" style={{ color: 'var(--urgent)' }}>
                  {stats.noNextAction ?? 0}
                </div>
                <div className="ss">Blocking progress</div>
              </div>
              <div className="sb2">
                <div className="sl">Renewals Due</div>
                <div className="sv" style={{ color: 'var(--good)' }}>
                  {stats.renewalsDue ?? 0}
                </div>
                <div className="ss">Re-engage funded</div>
              </div>
              <div className="sb2">
                <div className="sl">🔁 Queue Today</div>
                <div className="sv" style={{ color: 'var(--info)' }}>
                  {stats.queueToday ?? 0}
                </div>
                <div className="ss">Scheduled follow-ups due</div>
              </div>
            </div>
          )}
        </>
      )}

      {viewTab === 'team' && (
        <TeamView stats={stats} board={board} reps={reps || []} onDealClick={(id) => setSelectedDealId(id)} />
      )}

      {viewTab === 'queue' && <QueueView deals={reviveQueue || []} onDealClick={(id) => setSelectedDealId(id)} />}

      {/* ═══ PANELS & MODALS ═══ */}
      {selectedDealId && <DealPanel dealId={selectedDealId} onClose={() => setSelectedDealId(null)} />}
      {showCreateDeal && <CreateDealModal onClose={() => setShowCreateDeal(false)} />}
      {showGoals && <GoalsModal reps={reps || []} onClose={() => setShowGoals(false)} />}
    </div>
  );
}

// ═══════════════════════════════════════
// CARD SORT PRIORITY (matches prototype)
// ═══════════════════════════════════════
function sortPri(d: Deal): number {
  const now = new Date();
  const overdue = d.nextActionDue && new Date(d.nextActionDue) < now;
  const hasRenewal = d.renewalTasks?.some((t) => t.status === 'PENDING');
  if (overdue || hasRenewal) return 0;
  if (!d.nextAction) return 1; // missing next action
  if (d.stage === 'COMMITTED_FUNDING' && (d.daysInSubStatus || 0) > 5) return 0;
  if (d.stage === 'COMMITTED_FUNDING' && (d.daysInSubStatus || 0) > 3) return 1;
  if (d.isHot) return 2;
  const dueToday = d.nextActionDue && new Date(d.nextActionDue).toDateString() === now.toDateString();
  if (dueToday) return 3;
  if ((d.staleDays || 0) <= 1) return 4;
  return 5;
}

// ═══════════════════════════════════════
// STAGE COLUMN (droppable)
// ═══════════════════════════════════════

function StageColumn({
  config,
  deals,
  count,
  value,
  viewMode,
  onDealClick,
}: {
  config: StageConfig;
  deals: Deal[];
  count: number;
  value: number;
  viewMode: ViewMode;
  onDealClick: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: config.value });
  const urgentCount = deals.filter(
    (d) =>
      (d.nextActionDue && new Date(d.nextActionDue) < new Date()) ||
      d.renewalTasks?.some((t) => t.status === 'PENDING'),
  ).length;

  return (
    <div ref={setNodeRef} className={`col ${config.colClass || ''}`}>
      <div className="col-head">
        {viewMode === 'simple' ? (
          <>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}
            >
              <div className="sc-col-title" style={{ color: config.color }}>
                {config.short}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                <span className="sc-col-count">{count}</span>
                {urgentCount > 0 && (
                  <span
                    style={{
                      background: 'var(--urgent-bg)',
                      color: 'var(--urgent)',
                      border: '1px solid var(--urgent-b)',
                      fontSize: '9px',
                      padding: '1px 6px',
                      borderRadius: '3px',
                      fontWeight: 700,
                    }}
                  >
                    {urgentCount}
                  </span>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            <div className={`col-stage ${config.stageClass || ''}`}>{config.short}</div>
            <div className={`col-vol ${value ? '' : 'dim'}`}>{value ? formatCurrency(value) : '—'}</div>
            <div className="col-ct">
              {count} {count === 1 ? 'deal' : 'deals'}
            </div>
            {(config.value === 'APPROVED_OFFERS' || config.value === 'COMMITTED_FUNDING') &&
              (() => {
                const offerCount = deals.reduce((acc, d) => acc + (d.offers?.length || 0), 0);
                return offerCount > 0 ? (
                  <div className="nb-total">
                    {offerCount} lender offer{offerCount !== 1 ? 's' : ''} in play
                  </div>
                ) : null;
              })()}
          </>
        )}
      </div>
      <div className="col-bar" style={{ background: config.color, opacity: config.opacity }} />
      <div className={`col-cards ${isOver ? 'drag-over' : ''}`}>
        {[...deals]
          .sort((a, b) => sortPri(a) - sortPri(b) || (a.staleDays || 0) - (b.staleDays || 0))
          .map((deal) => (
            <DraggableDealCard key={deal.id} deal={deal} viewMode={viewMode} onClick={() => onDealClick(deal.id)} />
          ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// DRAGGABLE CARD WRAPPER
// ═══════════════════════════════════════

function DraggableDealCard({ deal, viewMode, onClick }: { deal: Deal; viewMode: ViewMode; onClick: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.25 : 1 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <DealCard deal={deal} onClick={onClick} viewMode={viewMode} />
    </div>
  );
}

// ═══════════════════════════════════════
// TEAM VIEW
// ═══════════════════════════════════════

function TeamView({
  stats,
  board,
  reps,
  onDealClick,
}: {
  stats?: DealStats;
  board?: DealBoard;
  reps: Rep[];
  onDealClick: (id: string) => void;
}) {
  const fundedDeals = board?.stages?.find((s) => s.stage === 'FUNDED')?.deals || [];
  const activeOfferDeals =
    board?.stages?.filter((s) => ['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(s.stage)).flatMap((s) => s.deals) ||
    [];
  const nurtureDeals = board?.stages?.find((s) => s.stage === 'NURTURE')?.deals || [];

  return (
    <div className="team-view">
      {/* Stat cards */}
      <div className="team-stats">
        <div className="stat-card">
          <div className="stat-label">Active Pipeline</div>
          <div className="stat-val">{formatCurrency(stats?.pipelineValue)}</div>
          <div className="stat-sub">{stats?.activeCount || 0} active deals</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Funded MTD</div>
          <div className="stat-val" style={{ color: 'var(--good)' }}>
            {formatCurrency(stats?.fundedMTD)}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Hot Deals</div>
          <div className="stat-val" style={{ color: 'var(--hot)' }}>
            {stats?.hotCount || 0}
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-label">Avg Cycle Time</div>
          <div className="stat-val">{stats?.avgCycleTime || '—'}d</div>
        </div>
      </div>

      {/* Rep scoreboard */}
      {reps.length > 0 && (
        <div className="q-section">
          <div className="q-section-head">REP SCOREBOARD</div>
          <div className="team-stats" style={{ gridTemplateColumns: `repeat(${Math.min(reps.length, 4)}, 1fr)` }}>
            {reps.map((rep) => {
              const repDeals = board?.stages?.flatMap((s) => s.deals.filter((d) => d.assignedRepId === rep.id)) || [];
              const repFundedTotal = fundedDeals
                .filter((d) => d.assignedRepId === rep.id)
                .reduce((sum, d) => sum + (d.fundingEvents?.[0]?.amountFunded || 0), 0);
              const goalPct = rep.monthlyGoal && rep.monthlyGoal > 0 ? repFundedTotal / rep.monthlyGoal : 0;
              const goalCls = goalPct >= 0.75 ? 'on-track' : goalPct >= 0.5 ? 'at-risk' : 'behind';
              const goalBg = goalPct >= 0.75 ? 'var(--good)' : goalPct >= 0.5 ? 'var(--watch)' : 'var(--urgent)';

              return (
                <div key={rep.id} className="stat-card">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                    <div className="av" style={{ background: rep.avatarColor || 'var(--gold)' }}>
                      {rep.initials || rep.firstName[0]}
                    </div>
                    <span style={{ fontSize: '12px', fontWeight: 600 }}>
                      {rep.firstName} {rep.lastName}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div>
                      <div className="stat-label">Active</div>
                      <div style={{ fontSize: '14px', fontWeight: 700 }}>{repDeals.length}</div>
                    </div>
                    <div>
                      <div className="stat-label">Funded</div>
                      <div style={{ fontSize: '14px', fontWeight: 700, color: 'var(--good)' }}>
                        {formatCurrency(repFundedTotal)}
                      </div>
                    </div>
                  </div>
                  {rep.monthlyGoal && rep.monthlyGoal > 0 && (
                    <div className="goal-bar-wrap">
                      <div className="goal-bar-track">
                        <div
                          className="goal-bar-fill"
                          style={{
                            width: `${Math.min(100, goalPct * 100)}%`,
                            background: goalBg,
                          }}
                        />
                      </div>
                      <div className={`goal-pct ${goalCls}`}>
                        {(goalPct * 100).toFixed(0)}% of {formatCurrency(rep.monthlyGoal)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active offers */}
      {activeOfferDeals.length > 0 && (
        <div className="q-section">
          <div className="q-section-head">
            ACTIVE OFFERS
            <span style={{ fontWeight: 400 }}>{activeOfferDeals.length}</span>
          </div>
          <div className="team-cards">
            {activeOfferDeals.slice(0, 12).map((deal) => (
              <div
                key={deal.id}
                className="deal-tile nb-tile"
                onClick={() => onDealClick(deal.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="dt-biz">{deal.client?.businessName}</div>
                <div className="dt-offer">
                  {deal.offers?.length
                    ? formatCurrency(deal.offers.reduce((a, b) => (a.amount > b.amount ? a : b)).amount)
                    : formatCurrency(deal.dealAmount)}
                </div>
                <div className="dt-meta">
                  {deal.productType && (
                    <span className={`t ${deal.productType === 'MCA' ? 't-mca' : 't-sba'}`}>{deal.productType}</span>
                  )}
                </div>
                {deal.assignedRep && (
                  <div className="dt-reps">
                    <span className="dt-rep-primary">{deal.assignedRep.firstName}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Funded this month */}
      {fundedDeals.length > 0 && (
        <div className="q-section">
          <div className="q-section-head">
            FUNDED THIS MONTH
            <span style={{ fontWeight: 400 }}>{fundedDeals.length}</span>
          </div>
          <div className="team-cards">
            {fundedDeals.slice(0, 12).map((deal) => (
              <div
                key={deal.id}
                className="deal-tile funded-tile"
                onClick={() => onDealClick(deal.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="dt-biz">{deal.client?.businessName}</div>
                <div className="dt-offer">
                  {formatCurrency(deal.fundingEvents?.[0]?.amountFunded || deal.dealAmount)}
                </div>
                {deal.fundingEvents?.[0]?.lender && (
                  <div className="dt-meta">
                    <span className="t t-sba">{deal.fundingEvents[0].lender}</span>
                  </div>
                )}
                {deal.assignedRep && (
                  <div className="dt-reps">
                    <span className="dt-rep-primary">{deal.assignedRep.firstName}</span>
                  </div>
                )}
                {deal.fundedDate && (
                  <div className="dt-fd">Funded {new Date(deal.fundedDate).toLocaleDateString()}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nurture pool */}
      {nurtureDeals.length > 0 && (
        <div className="q-section">
          <div className="q-section-head">
            NURTURE POOL
            <span style={{ fontWeight: 400 }}>{nurtureDeals.length}</span>
          </div>
          <div className="team-cards">
            {nurtureDeals.slice(0, 8).map((deal) => (
              <div
                key={deal.id}
                className="deal-tile"
                onClick={() => onDealClick(deal.id)}
                style={{ cursor: 'pointer' }}
              >
                <div className="dt-biz">{deal.client?.businessName}</div>
                {deal.prevOffer && (
                  <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text2)' }}>
                    Prev: {formatCurrency(deal.prevOffer)}
                  </div>
                )}
                {deal.lostReason && (
                  <div style={{ fontSize: '9px', color: 'var(--attn)', fontStyle: 'italic', marginTop: '2px' }}>
                    {deal.lostReason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════
// QUEUE VIEW
// ═══════════════════════════════════════

function QueueView({ deals, onDealClick }: { deals: Deal[]; onDealClick: (id: string) => void }) {
  const qc = useQueryClient();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());

  const reopenMutation = useMutation({
    mutationFn: (dealId: string) => dealApi.moveDeal(dealId, { stage: 'ENGAGED_INTERESTED' }),
    onSuccess: (_data, dealId) => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Deal reopened → Engaged');
      markDone(dealId);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Reopen failed'),
  });

  const completeMutation = useMutation({
    mutationFn: (dealId: string) =>
      dealApi.completeAction(dealId, { actionType: 'follow_up', note: 'Completed from Revive Queue' }),
    onSuccess: (_data, dealId) => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success('Action completed');
      markDone(dealId);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Complete failed'),
  });

  // Filter out completed deals for display
  const activeDealsList = deals.filter((d) => !completedIds.has(d.id));
  const total = activeDealsList.length;
  const idx = Math.min(currentIndex, Math.max(0, total - 1));
  const deal = activeDealsList[idx];

  const totalPrev = deals.reduce((s, d) => s + (d.prevOffer || d.dealAmount || 0), 0);
  const renewalCount = deals.filter((d) => d.followUpType === 'renewal').length;
  const now = new Date();
  const overdueCount = deals.filter((d) => d.followUpDate && new Date(d.followUpDate) < now).length;

  function markDone(dealId: string) {
    setCompletedIds((prev) => new Set(prev).add(dealId));
  }

  function getReasonTag(d: Deal): { cls: string; label: string; icon: string } {
    if (d.followUpType === 'renewal') return { cls: 'qr-renewal', label: 'Renewal', icon: '♻' };
    if (d.followUpType === 'statement') return { cls: 'qr-statement', label: 'Statement Refresh', icon: '📄' };
    if (d.followUpType === 'nurture') return { cls: 'qr-reengage', label: 'Nurture', icon: '🌱' };
    if (d.stage === 'NURTURE' || d.stage === 'APPROVED_OFFERS')
      return { cls: 'qr-reengage', label: 'Revive', icon: '↩' };
    if (d.stage === 'SUBMITTED_IN_REVIEW') return { cls: 'qr-statement', label: 'Statement Refresh', icon: '📄' };
    if (d.stage === 'FUNDED') return { cls: 'qr-renewal', label: 'Renewal', icon: '♻' };
    return { cls: 'qr-timing', label: 'Re-engage', icon: '⏰' };
  }

  // All deals done
  if (total === 0 && deals.length > 0) {
    return (
      <div className="queue-view">
        <div className="queue-header">
          <div>
            <div className="queue-title">🔁 Revive Queue</div>
            <div className="queue-sub">All {deals.length} deals processed!</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '28px', marginBottom: '8px' }}>✅</div>
          <div style={{ fontSize: '14px', fontWeight: 600 }}>Queue Complete</div>
          <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--text3)' }}>
            All {deals.length} deals have been processed
          </div>
          <button
            style={{
              marginTop: '14px',
              padding: '6px 16px',
              borderRadius: '6px',
              border: '1px solid var(--border2)',
              background: 'var(--bg4)',
              color: 'var(--text2)',
              fontSize: '11px',
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
            onClick={() => {
              setCompletedIds(new Set());
              setCurrentIndex(0);
            }}
          >
            Reset Queue
          </button>
        </div>
      </div>
    );
  }

  // Empty queue
  if (deals.length === 0) {
    return (
      <div className="queue-view">
        <div className="queue-header">
          <div>
            <div className="queue-title">🔁 Revive Queue</div>
            <div className="queue-sub">Deals awaiting re-engagement</div>
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔁</div>
          <div style={{ fontSize: '13px' }}>No deals in the revive queue</div>
          <div style={{ fontSize: '11px', marginTop: '4px' }}>Deals appear here when they need re-engagement</div>
        </div>
      </div>
    );
  }

  const reason = getReasonTag(deal);
  const followUp = deal.followUpDate ? new Date(deal.followUpDate) : null;
  const isOverdue = followUp ? followUp < now : false;
  const daysSinceActivity = deal.staleDays ?? 0;

  return (
    <div className="queue-view">
      {/* Header with stats */}
      <div className="queue-header">
        <div>
          <div className="queue-title">🔁 Revive Queue</div>
          <div className="queue-sub">One deal at a time · system-prioritized · {deals.length} total</div>
        </div>
      </div>

      <div className="queue-stats">
        <div className="q-stat">
          <div className="q-stat-label">Total Queue</div>
          <div className="q-stat-val">{deals.length}</div>
        </div>
        <div className="q-stat">
          <div className="q-stat-label">Overdue</div>
          <div className="q-stat-val" style={{ color: 'var(--urgent)' }}>
            {overdueCount}
          </div>
        </div>
        <div className="q-stat">
          <div className="q-stat-label">Renewals</div>
          <div className="q-stat-val" style={{ color: 'var(--good)' }}>
            {renewalCount}
          </div>
        </div>
        <div className="q-stat">
          <div className="q-stat-label">Previous Revenue</div>
          <div className="q-stat-val">{formatCurrency(totalPrev)}</div>
        </div>
      </div>

      {/* Progress pills */}
      <div className="rvq-progress-row">
        {activeDealsList.slice(0, 15).map((_, i) => (
          <div key={i} className={`rvq-pill ${i < idx ? 'rvq-done' : i === idx ? 'rvq-current' : 'rvq-pending'}`} />
        ))}
        {total > 15 && <span className="rvq-more">+{total - 15}</span>}
      </div>

      {/* Main carousel card */}
      <div className={`rvq-card ${isOverdue ? 'rvq-overdue' : ''}`}>
        {/* Reason tag */}
        <div className={`q-reason-pill ${reason.cls}`}>
          {reason.icon} {reason.label}
        </div>

        {/* Deal header row */}
        <div className="rvq-deal-header">
          <div>
            <div className="rvq-biz" onClick={() => onDealClick(deal.id)} style={{ cursor: 'pointer' }}>
              {deal.client?.businessName || 'Unknown'}
            </div>
            <div className="rvq-meta-pills">
              {deal.productType && (
                <span className={`p-badge pb-${deal.productType?.toLowerCase()}`}>{deal.productType}</span>
              )}
              <span className="rvq-stage-pill">{STAGE_LABELS[deal.stage] || deal.stage}</span>
              {deal.assignedRep && (
                <span className="rvq-rep-pill">
                  <span
                    className="av"
                    style={{
                      background: deal.assignedRep.avatarColor || 'var(--gold)',
                      width: '14px',
                      height: '14px',
                      fontSize: '7px',
                      display: 'inline-flex',
                      verticalAlign: 'middle',
                    }}
                  >
                    {deal.assignedRep.initials || deal.assignedRep.firstName[0]}
                  </span>{' '}
                  {deal.assignedRep.firstName}
                </span>
              )}
            </div>
          </div>
          <div className="rvq-amount-block">
            <div className="rvq-amount">
              {deal.prevOffer
                ? formatCurrency(deal.prevOffer)
                : deal.dealAmount
                  ? formatCurrency(deal.dealAmount)
                  : 'TBD'}
            </div>
            <div className="rvq-amount-label">{deal.prevOffer ? 'Previous offer' : 'Deal amount'}</div>
          </div>
        </div>

        {/* Detail grid — 3 cells */}
        <div className="rvq-detail-grid">
          <div className="rvq-detail-cell">
            <div className="rvq-detail-lbl">Days Idle</div>
            <div
              className={`rvq-detail-val ${daysSinceActivity > 30 ? 'rvq-warn' : daysSinceActivity > 7 ? 'rvq-watch' : 'rvq-ok'}`}
            >
              {daysSinceActivity}d
            </div>
          </div>
          <div className="rvq-detail-cell">
            <div className="rvq-detail-lbl">Follow-up Due</div>
            <div className={`rvq-detail-val ${isOverdue ? 'rvq-warn' : 'rvq-ok'}`}>
              {followUp
                ? isOverdue
                  ? `${Math.floor((now.getTime() - followUp.getTime()) / 86400000)}d overdue`
                  : followUp.toLocaleDateString()
                : 'Not set'}
            </div>
          </div>
          <div className="rvq-detail-cell">
            <div className="rvq-detail-lbl">Next Action</div>
            <div className="rvq-detail-val">{deal.nextAction || 'None set'}</div>
          </div>
        </div>

        {/* Script / follow-up note */}
        {deal.followUpNote && (
          <div className="rvq-note-box">
            <div className="rvq-note-lbl">Follow-up Notes</div>
            <div className="rvq-note-text">{deal.followUpNote}</div>
          </div>
        )}

        {/* 5 Action buttons */}
        <div className="rvq-actions">
          <button
            className="rvq-btn rvq-btn-stmts"
            onClick={() => toast('Request Statements → ' + (deal.client?.businessName || 'Deal'))}
          >
            📄 Request Statements
          </button>
          <button
            className="rvq-btn rvq-btn-call"
            onClick={() => toast('Call Now → ' + (deal.client?.businessName || 'Deal'))}
          >
            📞 Call Now
          </button>
          <button
            className="rvq-btn rvq-btn-reopen"
            onClick={() => reopenMutation.mutate(deal.id)}
            disabled={reopenMutation.isPending}
          >
            ↩ Reopen
          </button>
          <button
            className="rvq-btn rvq-btn-complete"
            onClick={() => completeMutation.mutate(deal.id)}
            disabled={completeMutation.isPending}
          >
            ✅ Complete
          </button>
          <button className="rvq-btn rvq-btn-skip" onClick={() => setCurrentIndex(Math.min(idx + 1, total - 1))}>
            Skip →
          </button>
        </div>
      </div>

      {/* Navigation row */}
      <div className="rvq-nav">
        <div className="rvq-nav-left">
          <button className="rvq-nav-btn" disabled={idx === 0} onClick={() => setCurrentIndex(idx - 1)}>
            ← Previous
          </button>
          <span className="rvq-nav-pos">
            <strong>{idx + 1}</strong> of <strong>{total}</strong>
          </span>
          <button className="rvq-nav-btn" disabled={idx >= total - 1} onClick={() => setCurrentIndex(idx + 1)}>
            Next →
          </button>
        </div>
        <div className="rvq-nav-right">
          <span style={{ fontSize: '10px', color: 'var(--text3)' }}>{completedIds.size} processed</span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// GOALS MODAL
// ═══════════════════════════════════════

function GoalsModal({ reps, onClose }: { reps: Rep[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [teamMonthly, setTeamMonthly] = useState('');
  const [teamAnnual, setTeamAnnual] = useState('');

  const initialGoals = useMemo(() => {
    const goals: Record<string, { monthly: string; annual: string }> = {};
    reps.forEach((r) => {
      goals[r.id] = {
        monthly: r.monthlyGoal ? String(r.monthlyGoal) : '',
        annual: r.annualGoal ? String(r.annualGoal) : '',
      };
    });
    return goals;
  }, [reps]);
  const [repGoals, setRepGoals] = useState<Record<string, { monthly: string; annual: string }>>(initialGoals);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const promises: Promise<any>[] = [];
      if (teamMonthly || teamAnnual) {
        promises.push(
          repApi.updateTeamGoals({
            monthlyGoal: teamMonthly ? parseFloat(teamMonthly) : undefined,
            annualGoal: teamAnnual ? parseFloat(teamAnnual) : undefined,
          }),
        );
      }
      for (const [repId, goals] of Object.entries(repGoals)) {
        if (goals.monthly || goals.annual) {
          promises.push(
            repApi.updateGoals(repId, {
              monthlyGoal: goals.monthly ? parseFloat(goals.monthly) : undefined,
              annualGoal: goals.annual ? parseFloat(goals.annual) : undefined,
            }),
          );
        }
      }
      return Promise.all(promises);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reps'] });
      toast.success('Goals saved');
      onClose();
    },
    onError: () => toast.error('Failed to save goals'),
  });

  return (
    <div className="modal-ov open" onClick={onClose}>
      <div className="modal goal-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">
          ⚡ Team Goals — Admin Only
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text2)', marginBottom: '14px' }}>
          Set monthly funded targets for each rep and the team. Only you can edit these — reps see their own goal and
          progress.
        </div>

        {/* Team goal */}
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text3)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            marginBottom: '8px',
          }}
        >
          Team Goal
        </div>
        <div className="goal-rep-row">
          <div className="goal-rep-name" style={{ color: 'var(--gold)' }}>
            🏆 Full Team
          </div>
          <div style={{ flex: 1 }}>
            <div className="goal-inp-label">Monthly Target</div>
            <input
              className="goal-inp"
              value={teamMonthly}
              onChange={(e) => setTeamMonthly(e.target.value)}
              placeholder="$5,800,000"
            />
          </div>
          <div style={{ flex: 1, marginLeft: '8px' }}>
            <div className="goal-inp-label">Annual Target</div>
            <input
              className="goal-inp"
              value={teamAnnual}
              onChange={(e) => setTeamAnnual(e.target.value)}
              placeholder="$70,000,000"
            />
          </div>
        </div>

        {/* Per-rep goals */}
        <div
          style={{
            fontSize: '10px',
            color: 'var(--text3)',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '.05em',
            margin: '12px 0 8px',
          }}
        >
          Rep Goals
        </div>
        {reps.map((rep) => (
          <div key={rep.id} className="goal-rep-row">
            <div className="goal-rep-name">
              {rep.firstName} {rep.lastName}
            </div>
            <div style={{ flex: 1 }}>
              <div className="goal-inp-label">Monthly</div>
              <input
                className="goal-inp"
                value={repGoals[rep.id]?.monthly || ''}
                onChange={(e) =>
                  setRepGoals((prev) => ({
                    ...prev,
                    [rep.id]: { ...prev[rep.id], monthly: e.target.value },
                  }))
                }
                placeholder="$0"
              />
            </div>
            <div style={{ flex: 1, marginLeft: '8px' }}>
              <div className="goal-inp-label">Annual</div>
              <input
                className="goal-inp"
                value={repGoals[rep.id]?.annual || ''}
                onChange={(e) =>
                  setRepGoals((prev) => ({
                    ...prev,
                    [rep.id]: { ...prev[rep.id], annual: e.target.value },
                  }))
                }
                placeholder="$0"
              />
            </div>
          </div>
        ))}

        <div className="mfoot">
          <button className="btn-c" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-s" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Save Goals
          </button>
        </div>
      </div>
    </div>
  );
}
