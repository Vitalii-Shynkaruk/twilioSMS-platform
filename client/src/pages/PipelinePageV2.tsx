import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { dealApi, repApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import DealCard, { formatCurrency } from '../components/pipeline/DealCard';
import DealPanel, { ScheduleFollowUpModal } from '../components/pipeline/DealPanel';
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
  {
    value: 'ENGAGED_INTERESTED',
    label: 'Engaged / Interested',
    short: 'Engaged / Interested',
    color: '#9B72E8',
    opacity: 0.38,
  },
  {
    value: 'QUALIFIED',
    label: 'Qualified',
    short: 'Qualified',
    color: '#C9952A',
    opacity: 0.45,
  },
  {
    value: 'SUBMITTED_IN_REVIEW',
    label: 'Submitted (In Review)',
    short: 'Submitted (In Review)',
    color: '#4A9EE8',
    opacity: 0.55,
  },
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
    short: 'Committed (Funding)',
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

function isDealHot(deal: Deal): boolean {
  if (['FUNDED', 'NURTURE', 'CLOSED'].includes(deal.stage)) return false;
  const now = new Date();
  if (deal.nextActionDue && new Date(deal.nextActionDue) < now) return false;
  if (deal.renewalTasks?.some((t) => t.status === 'PENDING')) return false;
  if (deal.stage === 'APPROVED_OFFERS' || deal.stage === 'COMMITTED_FUNDING') return true;
  if ((deal.offers?.length || 0) > 0) return true;
  if (deal.lenderEngaged && deal.appSubmitted) return true;
  if (deal.lastReplyAt) {
    const hours = (Date.now() - new Date(deal.lastReplyAt).getTime()) / 3600000;
    if (hours <= 48) return true;
  }
  return !!deal.isHot;
}

type QuickFilter = 'all' | 'mine' | 'overdue' | 'hot' | 'neglected' | 'this_week';
type ViewTab = 'pipeline' | 'team' | 'queue';
type ViewMode = 'simple' | 'execution';
type PipelineScope = 'mine' | 'all';

const FILTERS: { key: QuickFilter; label: string; activeCls: string; passiveCls: string }[] = [
  { key: 'all', label: 'All', activeCls: 'act', passiveCls: '' },
  { key: 'mine', label: 'Mine', activeCls: 'act', passiveCls: '' },
  { key: 'overdue', label: 'Overdue', activeCls: 'act', passiveCls: 'urg' },
  { key: 'hot', label: '🔥 Hot', activeCls: 'fire act', passiveCls: 'fire' },
  { key: 'neglected', label: 'Neglected', activeCls: 'act', passiveCls: 'urg' },
  { key: 'this_week', label: '📅 This Week', activeCls: 'week-act', passiveCls: '' },
];

// ═══════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════

export default function PipelinePage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const qc = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  // ─── Read URL params once for initial state ───
  const initialDealId = searchParams.get('deal');
  const initialNewDeal = searchParams.get('newDeal');

  // ─── State ───
  const [viewMode, setViewMode] = useState<ViewMode>('simple');
  const [viewTab, setViewTab] = useState<ViewTab>('pipeline');
  const [quickFilter, setQuickFilter] = useState<QuickFilter>('all');
  const [pipelineScope, setPipelineScope] = useState<PipelineScope>(isAdmin ? 'all' : 'mine');
  const [repFilter, setRepFilter] = useState('');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(initialDealId);
  const [showCreateDeal, setShowCreateDeal] = useState(initialNewDeal === '1');
  const [showGoals, setShowGoals] = useState(false);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; dealId: string; dealName: string } | null>(null);

  // ─── Clear URL params after reading ───
  useEffect(() => {
    if (initialDealId || initialNewDeal) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    queryKey: ['deals', 'stats', boardParams],
    queryFn: async () => {
      const { data } = await dealApi.getStats(boardParams);
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

  const activeUsers = useMemo(() => (reps || []).filter((r) => r.isActive), [reps]);
  const displayReps = useMemo(() => {
    const roleReps = activeUsers.filter((r) => r.role === 'REP');
    if (roleReps.length > 0) return roleReps;
    return activeUsers.filter((r) => r.role !== 'MANAGER');
  }, [activeUsers]);

  useEffect(() => {
    if (repFilter && !displayReps.some((r) => r.id === repFilter)) {
      setRepFilter('');
    }
  }, [repFilter, displayReps]);

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
  const NO_AMOUNT_STAGES = ['NEW_LEAD', 'ENGAGED_INTERESTED', 'QUALIFIED', 'SUBMITTED_IN_REVIEW'];
  const filteredBoard = useMemo(() => {
    if (!board?.stages) return board;
    const now = new Date();
    return {
      ...board,
      stages: board.stages.map((s: any) => {
        const filteredDeals = s.deals.filter((d: Deal) => {
          if (quickFilter === 'mine' && d.assignedRepId !== user?.id) return false;
          if (quickFilter === 'overdue' && (!d.nextActionDue || new Date(d.nextActionDue) >= now)) return false;
          if (quickFilter === 'hot' && !isDealHot(d)) return false;
          if (quickFilter === 'neglected' && (d.staleDays || 0) < 7) return false;
          if (quickFilter === 'this_week') {
            const weekEnd = new Date();
            weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
            if (!d.nextActionDue || new Date(d.nextActionDue) > weekEnd) return false;
          }
          return true;
        });

        // Recalculate value based on filtered deals
        let value = 0;
        if (!NO_AMOUNT_STAGES.includes(s.stage)) {
          if (s.stage === 'FUNDED') {
            value = filteredDeals.reduce((sum: number, d: Deal) => sum + (d.dealAmount || 0), 0);
          } else if (s.stage === 'NURTURE') {
            value = filteredDeals.reduce((sum: number, d: Deal) => sum + ((d as any).prevOffer || d.dealAmount || 0), 0);
          } else {
            value = filteredDeals.reduce((sum: number, d: Deal) => {
              const best = d.offers?.reduce((a: any, b: any) => ((a?.amount || 0) > (b?.amount || 0) ? a : b), d.offers[0]);
              return sum + (best?.amount || d.dealAmount || 0);
            }, 0);
          }
        }

        return { ...s, deals: filteredDeals, count: filteredDeals.length, value };
      }),
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
        toast(targetStage === 'NURTURE'
          ? 'Click the deal panel → set Lost Reason + Follow-up to move to Nurture'
          : 'Click the deal panel → set Disqualification Reason to close',
          { icon: 'ℹ️' });
        return;
      }
      if (targetStage === 'FUNDED') {
        setSelectedDealId(dealId);
        toast('Click "🎉 Mark as Funded" in the deal panel to complete funding details', { icon: '💰' });
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
    const hot = allDeals.filter((d) => isDealHot(d)).length;
    const neglected = allDeals.filter((d) => (d.staleDays || 0) >= 7 && !['FUNDED', 'CLOSED'].includes(d.stage)).length;
    const this_week = allDeals.filter((d) => {
      if (['CLOSED', 'NURTURE'].includes(d.stage)) return false;
      if (['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(d.stage)) return true;
      if (d.nextActionDue && new Date(d.nextActionDue) < now) return true;
      if (d.nextActionDue) {
        const due = new Date(d.nextActionDue);
        if (due <= weekEnd) return true;
      }
      if (isDealHot(d)) return true;
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
    <div className="pipeline-root" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
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
            {displayReps.map((r) => (
              <button key={r.id} className={`rs ${repFilter === r.id ? 'act' : ''}`} onClick={() => setRepFilter(r.id)}>
                {r.initials || `${r.firstName[0]}${r.lastName?.[0] || ''}`}
              </button>
            ))}
          </div>
        )}

        {/* Filter pills (hidden in team view) */}
        {viewTab !== 'team' && (
          <div className="fp-row">
            {FILTERS.map((f) => {
              const count = (filterCounts as any)[f.key] || 0;
              const cls = quickFilter === f.key ? f.activeCls : count > 0 ? f.passiveCls : '';
              return (
                <button
                  key={f.key}
                  className={`fp ${cls}`}
                  onClick={() => setQuickFilter(f.key)}
                >
                  {filterLabels[f.key]}
                </button>
              );
            })}
          </div>
        )}

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
            className={`queue-nav-btn ${viewTab === 'queue' ? 'act' : reviveCount > 0 ? 'has-items' : ''}`}
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

        {/* Add lead button (hidden in team view) */}
        {viewTab !== 'team' && (
          <button className="add-btn" onClick={() => setShowCreateDeal(true)}>
            + Add Lead
          </button>
        )}
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
        {viewTab === 'team' ? (
          <>
            <span
              className="vb"
              style={{ background: 'var(--good-bg)', color: 'var(--good)', border: '1px solid var(--good-b)' }}
            >
              Team Pipeline
            </span>
            <span className="btext">Shared view · Approved/Offers + Committed + Funded only · no contact info</span>
          </>
        ) : isAdmin && !repFilter ? (
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
        ) : repFilter && displayReps.length > 0 ? (
          <>
            <span
              className="vb"
              style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-b)' }}
            >
              My Pipeline ({displayReps.find((r) => r.id === repFilter)?.initials || '?'})
            </span>
            <span className="btext">Your deals only</span>
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
                  {(viewMode === 'simple' ? STAGES.filter((s) => s.value !== 'CLOSED') : STAGES).map((stageDef) => {
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
                        onCardContextMenu={(e, deal) => {
                          e.preventDefault();
                          setCtxMenu({ x: e.clientX, y: e.clientY, dealId: deal.id, dealName: deal.client?.businessName || 'this deal' });
                        }}
                      />
                    );
                  })}
                </div>
                <DragOverlay>{draggedDeal && <DealCard deal={draggedDeal} viewMode={viewMode} />}</DragOverlay>
              </DndContext>
            )}
          </div>

          {/* Manager bar (hidden in simple via CSS) */}
          {isAdmin && stats && displayReps.length > 0 && (
            <div className="mgr-bar">
              {/* Header row */}
              <div className="mgr-head">
                <div className="mh" style={{ flex: 1.5 }}>Rep</div>
                <div className="mh">Active</div>
                <div className="mh">Overdue</div>
                <div className="mh">🔥 Hot</div>
                <div className="mh">Pipeline $</div>
                <div className="mh">Funded MTD</div>
                <div className="mh">Shared</div>
                <div className="mh">MTD Goal %</div>
              </div>
              {/* Scrollable body */}
              <div className="mgr-body">
                {displayReps.map((rep) => {
                  const allDeals = board?.stages?.flatMap((s: any) => s.deals) || [];
                  const repDeals = allDeals.filter((d: Deal) => d.assignedRepId === rep.id);
                  const now = new Date();
                  const active = repDeals.filter((d: Deal) => !['FUNDED', 'CLOSED'].includes(d.stage)).length;
                  const overdue = repDeals.filter((d: Deal) => d.nextActionDue && new Date(d.nextActionDue) < now).length;
                  const hot = repDeals.filter((d: Deal) => isDealHot(d)).length;
                  const pipeline = (board?.stages
                    ?.filter((s: any) => ['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(s.stage))
                    .flatMap((s: any) => s.deals)
                    .filter((d: Deal) => d.assignedRepId === rep.id)
                    .reduce((sum: number, d: Deal) => {
                      const best = d.offers?.length ? d.offers.reduce((a, b) => (a.amount > b.amount ? a : b)).amount : 0;
                      return sum + best;
                    }, 0)) || 0;
                  const funded = (board?.stages
                    ?.find((s: any) => s.stage === 'FUNDED')
                    ?.deals.filter((d: Deal) => d.assignedRepId === rep.id)
                    .reduce((sum: number, d: Deal) => sum + (d.fundingEvents?.[0]?.amountFunded || 0), 0)) || 0;
                  const shared = board?.stages?.reduce(
                    (acc: number, s: any) => acc + s.deals.filter((d: Deal) => d.coRepIds?.includes(rep.id) && d.assignedRepId !== rep.id).length,
                    0,
                  ) || 0;
                  const goal = rep.monthlyGoal || 0;
                  const pct = goal ? Math.round((funded / goal) * 100) : 0;
                  const barColor = pct >= 75 ? 'var(--good)' : pct >= 50 ? 'var(--watch)' : 'var(--urgent)';

                  return (
                    <div key={rep.id} className="mgr-row">
                      <div className="mgr-cell" style={{ flex: 1.5 }}>
                        <div className="av" style={{ width: '15px', height: '15px', background: rep.avatarColor || 'var(--gold)', fontSize: '7px' }}>
                          {rep.initials || rep.firstName[0]}
                        </div>
                        {rep.firstName} {rep.lastName}
                      </div>
                      <div className="mgr-cell">
                        <span className="mgr-val" style={{ color: active ? 'var(--text)' : 'var(--text3)' }}>{active}</span>
                      </div>
                      <div className="mgr-cell">
                        <span className="mgr-val" style={{ color: overdue ? 'var(--urgent)' : 'var(--text3)' }}>{overdue}</span>
                      </div>
                      <div className="mgr-cell">
                        <span className="mgr-val" style={{ color: hot ? 'var(--hot)' : 'var(--text3)' }}>{hot}</span>
                      </div>
                      <div className="mgr-cell">
                        <span className="mgr-val" style={{ color: pipeline ? 'var(--good)' : 'var(--text3)' }}>{pipeline ? formatCurrency(pipeline) : '$0'}</span>
                      </div>
                      <div className="mgr-cell">
                        <span className="mgr-val" style={{ color: funded ? 'var(--good)' : 'var(--text3)' }}>{funded ? formatCurrency(funded) : '$0'}</span>
                      </div>
                      <div className="mgr-cell">
                        <span className="mgr-val" style={{ color: shared ? 'var(--info)' : 'var(--text3)' }}>{shared}</span>
                      </div>
                      <div className="mgr-cell">
                        {!goal ? (
                          <span className="mgr-val" style={{ color: 'var(--text3)' }}>—</span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <span className="mgr-val" style={{ color: barColor }}>{pct}%</span>
                            <div style={{ width: '60px' }}>
                              <div className="goal-bar-track">
                                <div className="goal-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
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
                <div className="ss">Approved + Nurture</div>
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
        <TeamView stats={stats} board={board} reps={displayReps} onDealClick={(id) => setSelectedDealId(id)} />
      )}

      {/* Bottom sum-bar for team view (same as pipeline sum-bar) */}
      {viewTab === 'team' && stats && (
        <div className="sum-bar">
          <div className="sb2">
            <div className="sl">Active Pipeline</div>
            <div className="sv" style={{ color: 'var(--good)' }}>
              {formatCurrency(stats.activePipeline)}
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

      {viewTab === 'queue' && (
        <QueueView
          deals={reviveQueue || []}
          reps={displayReps}
          isAdmin={isAdmin}
          board={board}
          stats={stats}
          onDealClick={(id) => setSelectedDealId(id)}
        />
      )}

      {/* ═══ PANELS & MODALS ═══ */}
      {selectedDealId && <DealPanel dealId={selectedDealId} onClose={() => setSelectedDealId(null)} />}
      {showCreateDeal && <CreateDealModal onClose={() => setShowCreateDeal(false)} />}
      {showGoals && <GoalsModal reps={displayReps} onClose={() => setShowGoals(false)} />}

      {/* RIGHT-CLICK CONTEXT MENU */}
      {ctxMenu && isAdmin && (
        <>
          <div className="ctx-overlay" onClick={() => setCtxMenu(null)} onContextMenu={e => { e.preventDefault(); setCtxMenu(null); }} />
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <button
              className="ctx-item ctx-open"
              onClick={() => { setSelectedDealId(ctxMenu.dealId); setCtxMenu(null); }}
            >
              📋 Open Deal
            </button>
            <button
              className="ctx-item ctx-delete"
              onClick={async () => {
                if (!confirm(`Delete "${ctxMenu.dealName}"? This cannot be undone.`)) {
                  setCtxMenu(null);
                  return;
                }
                try {
                  await dealApi.deleteDeal(ctxMenu.dealId);
                  toast.success('Deal deleted');
                  qc.invalidateQueries({ queryKey: ['deals'] });
                } catch {
                  toast.error('Delete failed');
                }
                setCtxMenu(null);
              }}
            >
              🗑 Delete Deal
            </button>
          </div>
        </>
      )}
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
  if (isDealHot(d)) return 2;
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
  onCardContextMenu,
}: {
  config: StageConfig;
  deals: Deal[];
  count: number;
  value: number;
  viewMode: ViewMode;
  onDealClick: (id: string) => void;
  onCardContextMenu?: (e: React.MouseEvent, deal: Deal) => void;
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
              <div className={`sc-col-title ${config.stageClass || ''}`}>
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
            {/* Only show dollar values for stages where lender offers/funding exist */}
            {['APPROVED_OFFERS', 'COMMITTED_FUNDING', 'FUNDED'].includes(config.value) ? (
              <>
                <div className={`col-vol ${value ? '' : 'dim'}`}>
                  {value ? `${formatCurrency(value)}${config.value === 'FUNDED' ? ' total' : ''}` : '—'}
                </div>
                <div className="col-ct">
                  {count} {count === 1 ? 'deal' : 'deals'}
                </div>
              </>
            ) : config.value === 'NURTURE' ? (
              <>
                <div className={`col-vol ${value ? '' : 'dim'}`}>
                  {value ? `${formatCurrency(value)} prev` : '—'}
                </div>
                <div className="col-ct">
                  {count} {count === 1 ? 'deal' : 'deals'} · prev offer totals
                </div>
              </>
            ) : (
              <>
                <div className="col-vol dim">—</div>
                <div className="col-ct">
                  {count} {count === 1 ? 'lead' : 'leads'} · no $
                </div>
              </>
            )}
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
            <DraggableDealCard key={deal.id} deal={deal} viewMode={viewMode} onClick={() => onDealClick(deal.id)} onContextMenu={onCardContextMenu ? (e) => onCardContextMenu(e, deal) : undefined} />
          ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// DRAGGABLE CARD WRAPPER
// ═══════════════════════════════════════

function DraggableDealCard({ deal, viewMode, onClick, onContextMenu }: { deal: Deal; viewMode: ViewMode; onClick: () => void; onContextMenu?: (e: React.MouseEvent) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.25 : 1 }
    : undefined;

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes} onContextMenu={onContextMenu}>
      <DealCard deal={deal} onClick={onClick} viewMode={viewMode} />
    </div>
  );
}

// ═══════════════════════════════════════
// TEAM VIEW
// ═══════════════════════════════════════

const TEAM_PRODUCT_TAG: Record<string, { cls: string; icon: string; label: string }> = {
  MCA: { cls: 't-mca', icon: '⚡', label: 'MCA' },
  LOC: { cls: 't-con', icon: '💳', label: 'LOC' },
  EQUIPMENT: { cls: 't-eq', icon: '🔧', label: 'Equipment' },
  HELOC: { cls: 't-hel', icon: '🏠', label: 'HELOC' },
  SBA: { cls: 't-sba', icon: '🏛', label: 'SBA' },
  CRE: { cls: 't-sba', icon: '🏢', label: 'CRE' },
  BRIDGE: { cls: 't-con', icon: '🌉', label: 'Bridge' },
};

function teamProductTag(productType?: string) {
  if (!productType) return null;
  const tag = TEAM_PRODUCT_TAG[productType] || { cls: 't-mca', icon: '', label: productType };
  return (
    <span className={`t ${tag.cls}`}>
      {tag.icon}
      {tag.label}
    </span>
  );
}

function repFullName(deal: Deal, reps: Rep[]) {
  const primary = deal.assignedRep;
  if (!primary) return null;
  const name = `${primary.firstName} ${primary.lastName || ''}`.trim();
  const repColor = primary.avatarColor || 'var(--text)';
  const coIds = deal.assistingRepIds?.filter((id) => id !== deal.assignedRepId) || [];
  if (coIds.length === 0) return <span className="dt-rep-primary" style={{ color: repColor }}>{name}</span>;
  const coRep = reps.find((r) => coIds.includes(r.id));
  const coName = coRep ? `${coRep.firstName} ${(coRep.lastName || '')[0] || ''}`.trim() : null;
  return (
    <>
      <span className="dt-rep-primary" style={{ color: repColor }}>{name}</span>
      {coName && (
        <span className="dt-co-badge">
          + {coName}
          {coIds.length > 1 ? '…' : ''}
        </span>
      )}
    </>
  );
}

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
  const submittedDeals = board?.stages?.find((s) => s.stage === 'SUBMITTED_IN_REVIEW')?.deals || [];
  const nurtureValue = nurtureDeals.reduce((sum, d) => sum + (d.prevOffer || d.dealAmount || 0), 0);
  const activeDealsCount =
    board?.stages
      ?.filter((s) => !['FUNDED', 'CLOSED', 'NURTURE'].includes(s.stage))
      .reduce((sum, s) => sum + s.deals.length, 0) || 0;
  const activeOfferValue = activeOfferDeals.reduce((sum, d) => sum + (d.dealAmount || 0), 0);
  const totalSubmittedAndBeyond = submittedDeals.length + activeOfferDeals.length + fundedDeals.length;
  const conversionPct = totalSubmittedAndBeyond > 0 ? (fundedDeals.length / totalSubmittedAndBeyond) * 100 : 0;
  const convColor = conversionPct >= 60 ? 'var(--good)' : conversionPct >= 40 ? 'var(--watch)' : 'var(--urgent)';
  const teamGoalPct =
    stats?.monthlyGoal && stats.monthlyGoal > 0 ? ((stats?.fundedMTD || 0) / stats.monthlyGoal) * 100 : 0;

  return (
    <div className="team-view">
      {/* Title */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '2px' }}>SCL Team Pipeline</div>
        <div style={{ fontSize: '11px', color: 'var(--text2)' }}>All stages · no contact info</div>
      </div>

      {/* Stat cards — 6 cards matching prototype */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' as const }}>
        <div style={{ background: 'var(--bg4)', borderRadius: '8px', padding: '10px 14px', flex: 1, minWidth: 0 }}>
          <div className="stat-label">Funded MTD</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--good)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(stats?.fundedMTD)}
          </div>
          <div className="stat-sub">Goal: {formatCurrency(stats?.monthlyGoal)}</div>
        </div>
        <div style={{ background: 'var(--bg4)', borderRadius: '8px', padding: '10px 14px', flex: 1, minWidth: 0 }}>
          <div className="stat-label">Active Pipeline $</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(stats?.activePipeline)}
          </div>
          <div className="stat-sub">Approved + Committed</div>
        </div>
        <div style={{ background: 'var(--bg4)', borderRadius: '8px', padding: '10px 14px', flex: 1, minWidth: 0 }}>
          <div className="stat-label">Active Deals</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--info)', fontVariantNumeric: 'tabular-nums' }}>
            {activeDealsCount}
          </div>
          <div className="stat-sub">All stages excl. funded</div>
        </div>
        <div style={{ background: 'var(--bg4)', borderRadius: '8px', padding: '10px 14px', flex: 1, minWidth: 0 }}>
          <div className="stat-label">Nurture Pool</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(nurtureValue)}
          </div>
          <div className="stat-sub">{nurtureDeals.length} deals · prev offer totals</div>
        </div>
        <div style={{ background: 'var(--bg4)', borderRadius: '8px', padding: '10px 14px', flex: 1, minWidth: 0 }}>
          <div className="stat-label">Deals Funded</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--good)', fontVariantNumeric: 'tabular-nums' }}>
            {fundedDeals.length}
          </div>
          <div className="stat-sub">This month</div>
        </div>
        <div style={{ background: 'var(--bg4)', borderRadius: '8px', padding: '10px 14px', flex: 1, minWidth: 0 }}>
          <div className="stat-label">Conversion</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: convColor, fontVariantNumeric: 'tabular-nums' }}>
            {conversionPct.toFixed(0)}%
          </div>
          <div className="stat-sub">Funded / submitted+</div>
        </div>
      </div>

      {/* Team goal progress — in container like prototype */}
      {stats?.monthlyGoal && stats.monthlyGoal > 0 && (
        <div
          style={{
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r)',
            padding: '10px 16px',
            marginBottom: '12px',
          }}
        >
          <div className="goal-bar-wrap">
            <div className="goal-bar-track">
              <div
                className="goal-bar-fill"
                style={{
                  width: `${Math.min(100, teamGoalPct)}%`,
                  background: teamGoalPct >= 80 ? 'var(--good)' : teamGoalPct >= 50 ? 'var(--watch)' : 'var(--urgent)',
                }}
              />
            </div>
            <div className={`goal-pct ${teamGoalPct >= 80 ? 'on-track' : teamGoalPct >= 50 ? 'at-risk' : 'behind'}`}>
              {teamGoalPct.toFixed(0)}% of {formatCurrency(stats.monthlyGoal)} monthly team goal
            </div>
          </div>
        </div>
      )}

      {/* Rep scoreboard — flex layout like prototype */}
      {reps.length > 0 &&
        (() => {
          const repsWithDeals = reps.filter((rep) =>
            board?.stages?.some((s) => s.deals.some((d) => d.assignedRepId === rep.id)),
          );
          const displayReps = repsWithDeals.length > 0 ? repsWithDeals : reps.filter((r) => r.isActive);
          return displayReps.length > 0 ? (
            <div
              style={{
                background: 'var(--bg3)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--r)',
                marginBottom: '14px',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  padding: '8px 12px',
                  borderBottom: '1px solid var(--border)',
                  fontSize: '9px',
                  fontWeight: 700,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '.05em',
                  color: 'var(--text3)',
                }}
              >
                Rep Scoreboard
              </div>
              <div style={{ display: 'flex' }}>
                {displayReps.map((rep) => {
                  const repActiveDeals =
                    board?.stages
                      ?.filter((s) => !['FUNDED', 'CLOSED', 'NURTURE'].includes(s.stage))
                      .flatMap((s) => s.deals.filter((d) => d.assignedRepId === rep.id)) || [];
                  const repNurtureCount = nurtureDeals.filter((d) => d.assignedRepId === rep.id).length;
                  const repFundedTotal = fundedDeals
                    .filter((d) => d.assignedRepId === rep.id)
                    .reduce((sum, d) => sum + (d.fundingEvents?.[0]?.amountFunded || 0), 0);
                  const goalPct = rep.monthlyGoal && rep.monthlyGoal > 0 ? repFundedTotal / rep.monthlyGoal : 0;
                  const goalBg = goalPct >= 0.8 ? 'var(--good)' : goalPct >= 0.5 ? 'var(--watch)' : 'var(--urgent)';

                  return (
                    <div
                      key={rep.id}
                      style={{ flex: 1, padding: '10px 12px', borderRight: '1px solid var(--border)', minWidth: 0 }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <div
                          className="av"
                          style={{
                            background: rep.avatarColor || 'var(--gold)',
                            width: '20px',
                            height: '20px',
                            fontSize: '9px',
                          }}
                        >
                          {rep.initials || rep.firstName[0]}
                        </div>
                        <span style={{ fontSize: '11px', fontWeight: 600 }}>
                          {rep.firstName} {rep.lastName}
                        </span>
                      </div>
                      <div
                        style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '6px', marginBottom: '5px' }}
                      >
                        <div>
                          <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: '1px' }}>Funded MTD</div>
                          <div
                            style={{
                              fontSize: '14px',
                              fontWeight: 800,
                              color: 'var(--good)',
                              fontVariantNumeric: 'tabular-nums',
                            }}
                          >
                            {formatCurrency(repFundedTotal)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: '1px' }}>Active</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--info)' }}>
                            {repActiveDeals.length}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: '1px' }}>Nurture</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text2)' }}>
                            {repNurtureCount}
                          </div>
                        </div>
                      </div>
                      <div style={{ fontSize: '9px', color: 'var(--text3)' }}>
                        Goal: {formatCurrency(rep.monthlyGoal || 0)}
                        {goalPct > 0 && (
                          <span style={{ color: goalBg, fontWeight: 600 }}> · {(goalPct * 100).toFixed(0)}%</span>
                        )}
                      </div>
                      {rep.monthlyGoal && rep.monthlyGoal > 0 && (
                        <div className="goal-bar-track" style={{ marginTop: '5px' }}>
                          <div
                            className="goal-bar-fill"
                            style={{ width: `${Math.min(100, goalPct * 100)}%`, background: goalBg }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null;
        })()}

      {/* Active offers */}
      {activeOfferDeals.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              letterSpacing: '.05em',
              color: 'var(--text3)',
              marginBottom: '7px',
            }}
          >
            Active Offers — {formatCurrency(activeOfferValue)} in play · {activeOfferDeals.length} deals
          </div>
          <div className="team-cards">
            {activeOfferDeals.slice(0, 12).map((deal, i) => (
              <div
                key={deal.id}
                className={`deal-tile nb-tile${i === 0 ? ' top-tile' : ''}`}
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
                  {teamProductTag(deal.productType)}
                  {(deal.offers?.length || 0) > 1 && (
                    <span className="t" style={{ background: 'var(--good-bg)', color: 'var(--good)' }}>
                      {deal.offers!.length} offers
                    </span>
                  )}
                </div>
                {deal.assignedRep && <div className="dt-reps">{repFullName(deal, reps)}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Funded this month */}
      {fundedDeals.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              letterSpacing: '.05em',
              color: 'var(--text3)',
              marginBottom: '7px',
            }}
          >
            Funded This Month — originating rep shown bold
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
                <div className="dt-meta">{teamProductTag(deal.productType)}</div>
                {deal.assignedRep && <div className="dt-reps">{repFullName(deal, reps)}</div>}
                {deal.fundedDate && (
                  <div className="dt-fd">
                    Funded {new Date(deal.fundedDate).toLocaleDateString()}
                    {deal.fundingEvents?.[0]?.lender ? ` · ${deal.fundingEvents[0].lender}` : ''}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Nurture pool */}
      {nurtureDeals.length > 0 && (
        <div>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              textTransform: 'uppercase' as const,
              letterSpacing: '.05em',
              color: 'var(--text3)',
              marginBottom: '7px',
            }}
          >
            Nurture Pool — {nurtureDeals.length} deals · {formatCurrency(nurtureValue)} prev offer value
          </div>
          <div className="team-cards">
            {nurtureDeals.slice(0, 12).map((deal) => (
              <div
                key={deal.id}
                className="deal-tile"
                onClick={() => onDealClick(deal.id)}
                style={{
                  cursor: 'pointer',
                  borderLeft: '2px solid var(--info-b)',
                  borderRadius: '0 var(--r) var(--r) 0',
                }}
              >
                <div className="dt-biz">{deal.client?.businessName}</div>
                <div
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--text2)',
                    fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {deal.prevOffer ? `${formatCurrency(deal.prevOffer)} prev` : 'No offer'}
                </div>
                <div className="dt-meta">{teamProductTag(deal.productType)}</div>
                {deal.lostReason && (
                  <div style={{ fontSize: '9px', color: 'var(--attn)', marginTop: '3px' }}>{deal.lostReason}</div>
                )}
                {deal.assignedRep && <div className="dt-reps">{repFullName(deal, reps)}</div>}
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

function QueueView({
  deals,
  reps,
  isAdmin,
  board,
  stats,
  onDealClick,
}: {
  deals: Deal[];
  reps: Rep[];
  isAdmin: boolean;
  board?: DealBoard;
  stats?: DealStats;
  onDealClick: (id: string) => void;
}) {
  function getReasonTag(d: Deal): { cls: string; label: string; icon: string } {
    if (d.followUpType === 'renewal') return { cls: 'qr-renewal', label: 'Renewal', icon: '♻️' };
    if (d.followUpType === 'statement') return { cls: 'qr-statement', label: 'Statement Refresh', icon: '📄' };
    if (d.followUpType === 'nurture') return { cls: 'qr-scheduled', label: 'Nurture', icon: '🌱' };
    if (d.followUpType === 'timing') return { cls: 'qr-timing', label: 'Check Timing', icon: '⏰' };
    if (d.followUpType === 'reengage') return { cls: 'qr-reengage', label: 'Re-engage', icon: '↩' };
    if (d.stage === 'NURTURE' || d.stage === 'APPROVED_OFFERS')
      return { cls: 'qr-reengage', label: 'Re-engage', icon: '↩' };
    if (d.stage === 'SUBMITTED_IN_REVIEW') return { cls: 'qr-statement', label: 'Statement Refresh', icon: '📄' };
    if (d.stage === 'FUNDED') return { cls: 'qr-renewal', label: 'Renewal', icon: '♻️' };
    return { cls: 'qr-timing', label: 'Re-engage', icon: '⏰' };
  }

  const qc = useQueryClient();
  const [scheduleDeal, setScheduleDeal] = useState<Deal | null>(null);
  const scheduleFollowUpMutation = useMutation({
    mutationFn: ({ dealId, data }: { dealId: string; data: any }) => dealApi.updateDeal(dealId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['deals', 'revive'] });
      toast.success('Follow-up scheduled');
    },
    onError: (err: any) => toast.error(err?.response?.data?.error || 'Failed to schedule follow-up'),
  });

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfToday = new Date(startOfToday);
  endOfToday.setDate(endOfToday.getDate() + 1);
  const endOfWeek = new Date(startOfToday);
  endOfWeek.setDate(endOfWeek.getDate() + 7);

  // Categorize deals into sections
  const overdue: Deal[] = [];
  const dueToday: Deal[] = [];
  const thisWeek: Deal[] = [];
  const upcoming: Deal[] = [];
  const renewalOpps: Deal[] = [];

  deals.forEach((d) => {
    const fu = d.followUpDate ? new Date(d.followUpDate) : null;
    if (d.followUpType === 'renewal') renewalOpps.push(d);
    if (!fu) {
      upcoming.push(d);
      return;
    }
    if (fu < startOfToday) overdue.push(d);
    else if (fu < endOfToday) dueToday.push(d);
    else if (fu < endOfWeek) thisWeek.push(d);
    else upcoming.push(d);
  });

  // Rep accountability: group deals by rep
  const repMap = new Map<string, { rep: Rep; overdue: number; today: number; upcoming: number }>();
  deals.forEach((d) => {
    if (!d.assignedRepId) return;
    if (!repMap.has(d.assignedRepId)) {
      const rep = reps.find((r) => r.id === d.assignedRepId) || d.assignedRep;
      if (!rep) return;
      repMap.set(d.assignedRepId, { rep, overdue: 0, today: 0, upcoming: 0 });
    }
    const entry = repMap.get(d.assignedRepId)!;
    const fu = d.followUpDate ? new Date(d.followUpDate) : null;
    if (!fu) {
      entry.upcoming++;
      return;
    }
    if (fu < startOfToday) entry.overdue++;
    else if (fu < endOfToday) entry.today++;
    else entry.upcoming++;
  });

  function getDueLabel(d: Deal): { text: string; cls: string } {
    const fu = d.followUpDate ? new Date(d.followUpDate) : null;
    if (!fu) return { text: 'No date set', cls: 'qd-ok' };
    const diffMs = fu.getTime() - startOfToday.getTime();
    const diffDays = Math.round(diffMs / 86400000);
    if (diffDays < 0) return { text: `${Math.abs(diffDays)}d overdue`, cls: 'qd-od' };
    if (diffDays === 0) return { text: 'Due today', cls: 'qd-td' };
    return { text: `Due in ${diffDays}d`, cls: 'qd-ok' };
  }

  function getScheduleTarget(): Deal | null {
    const boardDeals = (board?.stages || []).flatMap((s: any) => s.deals || []) as Deal[];
    const all = [...deals, ...boardDeals].filter((d, i, arr) => arr.findIndex((x) => x.id === d.id) === i);
    return all.find((d) => ['NURTURE', 'CLOSED', 'FUNDED'].includes(d.stage)) || all[0] || null;
  }

  function renderCard(d: Deal, variant: string) {
    const reason = getReasonTag(d);
    const due = getDueLabel(d);
    const rep = reps.find((r) => r.id === d.assignedRepId) || d.assignedRep;
    const pt = d.productType
      ? TEAM_PRODUCT_TAG[d.productType] || { cls: 't-mca', icon: '', label: d.productType }
      : null;
    return (
      <div key={d.id} className={`q-card ${variant}`} onClick={() => onDealClick(d.id)}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 8,
            marginBottom: 4,
          }}
        >
          <div>
            <div className="q-biz">{d.client?.businessName || 'Unknown'}</div>
            <span className={`q-reason-pill ${reason.cls}`}>
              {reason.icon} {reason.label}
            </span>
          </div>
          <button
            className="q-revive-btn"
            onClick={(e) => {
              e.stopPropagation();
              setScheduleDeal(d);
            }}
          >
            Reschedule
          </button>
        </div>
        <div className="q-funding-row">
          {d.prevOffer && (
            <>
              <span>
                Prev offer: <strong>{formatCurrency(d.prevOffer)}</strong>
              </span>
              <span>·</span>
            </>
          )}
          {d.dealAmount && !d.prevOffer && (
            <>
              <span>
                Amount: <strong>{formatCurrency(d.dealAmount)}</strong>
              </span>
              <span>·</span>
            </>
          )}
          {pt && (
            <span className={`prod-badge ${pt.cls}`} style={{ fontSize: 9, padding: '1px 6px', borderRadius: 3 }}>
              {pt.icon} {pt.label}
            </span>
          )}
          {d.staleDays > 0 && (
            <>
              <span>·</span>
              <span style={{ fontWeight: 600 }}>{d.staleDays}d idle</span>
            </>
          )}
        </div>
        {d.lostReason && <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>{d.lostReason}</div>}
        {d.followUpNote && <div className="q-script">💬 &ldquo;{d.followUpNote}&rdquo;</div>}
        <div className="q-meta">
          <div className="q-rep">
            {rep && (
              <>
                <div className="av" style={{ background: rep.avatarColor || 'var(--gold)', width: 16, height: 16, fontSize: 7 }}>
                  {rep.initials || rep.firstName?.[0] || '?'}
                </div>
                {rep.firstName} {rep.lastName}
              </>
            )}
          </div>
          <span className={`q-due ${due.cls}`}>{due.text}</span>
        </div>
      </div>
    );
  }

  function renderSection(emoji: string, title: string, count: number, sectionDeals: Deal[], variant: string) {
    if (sectionDeals.length === 0) return null;
    return (
      <div className="q-section">
        <div className="q-section-head">
          <span>
            {emoji} {title}
          </span>
          <span>
            {count} {count === 1 ? 'deal' : 'deals'}
          </span>
        </div>
        {sectionDeals.map((d) => renderCard(d, variant))}
      </div>
    );
  }

  // Empty queue
  if (deals.length === 0) {
    return (
      <div className="queue-view">
        <div className="queue-header">
          <div className="queue-header-main">
            <div className="queue-title">🔁 Renewal / Revive Queue</div>
            <div className="queue-sub">Time-delayed revenue engine · every scheduled deal is a future close</div>
          </div>
          <button
            className="queue-schedule-bar"
            onClick={() => {
              const target = getScheduleTarget();
              if (!target) {
                toast.error('No deals available for scheduling');
                return;
              }
              setScheduleDeal(target);
            }}
          >
            + Schedule Follow-Up
          </button>
        </div>
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text3)' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>✅</div>
          <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '4px' }}>Queue is clear</div>
          <div style={{ fontSize: '11px' }}>No scheduled follow-ups due. Schedule one on any Nurture or Closed deal.</div>
        </div>
        {scheduleDeal && (
          <ScheduleFollowUpModal
            deal={scheduleDeal}
            onClose={() => setScheduleDeal(null)}
            onSubmit={(data) => {
              scheduleFollowUpMutation.mutate({ dealId: scheduleDeal.id, data });
              setScheduleDeal(null);
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className="queue-view">
      {/* Header */}
      <div className="queue-header">
        <div className="queue-header-main">
          <div className="queue-title">🔁 Renewal / Revive Queue</div>
          <div className="queue-sub">Time-delayed revenue engine · every scheduled deal is a future close</div>
        </div>
        <button
          className="queue-schedule-bar"
          onClick={() => {
            const target = getScheduleTarget();
            if (!target) {
              toast.error('No deals available for scheduling');
              return;
            }
            setScheduleDeal(target);
          }}
        >
          + Schedule Follow-Up
        </button>
      </div>

      {/* Stats row — 5 cards */}
      <div className="queue-stats">
        <div className="q-stat">
          <div className="q-stat-label">Overdue</div>
          <div className="q-stat-val" style={{ color: overdue.length > 0 ? 'var(--urgent)' : 'var(--text3)' }}>
            {overdue.length}
          </div>
          <div className="q-stat-sub">Action required now</div>
        </div>
        <div className="q-stat">
          <div className="q-stat-label">Due Today</div>
          <div className="q-stat-val" style={{ color: dueToday.length > 0 ? 'var(--watch)' : 'var(--text3)' }}>
            {dueToday.length}
          </div>
          <div className="q-stat-sub">Reach out now</div>
        </div>
        <div className="q-stat">
          <div className="q-stat-label">This Week</div>
          <div className="q-stat-val" style={{ color: 'var(--info)' }}>
            {thisWeek.length}
          </div>
          <div className="q-stat-sub">Due in 7 days</div>
        </div>
        <div className="q-stat">
          <div className="q-stat-label">Renewal Opps</div>
          <div className="q-stat-val" style={{ color: 'var(--good)' }}>
            {renewalOpps.length}
          </div>
          <div className="q-stat-sub">Funded elsewhere</div>
        </div>
        <div className="q-stat">
          <div className="q-stat-label">Total Scheduled</div>
          <div className="q-stat-val" style={{ color: 'var(--text)' }}>
            {deals.length}
          </div>
          <div className="q-stat-sub">In pipeline</div>
        </div>
      </div>

      {/* Rep Accountability — admin only */}
      {isAdmin && repMap.size > 0 && (
        <div
          style={{
            background: 'var(--bg3)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--r, 10px)',
            padding: '10px 12px',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '.06em',
              color: 'var(--text3)',
              marginBottom: 8,
            }}
          >
            Rep Accountability
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {Array.from(repMap.values()).map(({ rep, overdue: od, today: td, upcoming: up }) => (
              <div
                key={rep.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  background: 'var(--bg4)',
                  borderRadius: 7,
                }}
              >
                <div
                  className="av"
                  style={{
                    background: rep.avatarColor || 'rgba(201,149,42,0.18)',
                    color: rep.avatarColor ? '#fff' : '#C9952A',
                    width: 22,
                    height: 22,
                    fontSize: 9,
                  }}
                >
                  {rep.initials || rep.firstName?.[0] || '?'}
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, flex: 1 }}>
                  {rep.firstName} {rep.lastName}
                </span>
                {od > 0 && (
                  <span
                    style={{
                      background: 'var(--urgent-bg)',
                      color: 'var(--urgent)',
                      border: '1px solid var(--urgent-b)',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 7px',
                      borderRadius: 3,
                    }}
                  >
                    {od} overdue
                  </span>
                )}
                {td > 0 && (
                  <span
                    style={{
                      background: 'var(--watch-bg)',
                      color: 'var(--watch)',
                      border: '1px solid var(--watch-b)',
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '1px 7px',
                      borderRadius: 3,
                    }}
                  >
                    {td} today
                  </span>
                )}
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{up} upcoming</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Sections */}
      {renderSection('🔴', 'Overdue — Act Now', overdue.length, overdue, 'qc-overdue')}
      {renderSection('🟡', 'Due Today', dueToday.length, dueToday, 'qc-today')}
      {renderSection('📅', 'This Week', thisWeek.length, thisWeek, 'qc-upcoming')}
      {renderSection('⏳', 'Upcoming', upcoming.length, upcoming, 'qc-upcoming')}

      {(stats || (isAdmin && board && reps.length > 0)) && (
        <div className="queue-dock">
          {isAdmin && board && reps.length > 0 && <QueueManagerBar board={board} reps={reps} />}
          {stats && <QueueSummaryBar stats={stats} />}
        </div>
      )}

      {scheduleDeal && (
        <ScheduleFollowUpModal
          deal={scheduleDeal}
          onClose={() => setScheduleDeal(null)}
          onSubmit={(data) => {
            scheduleFollowUpMutation.mutate({ dealId: scheduleDeal.id, data });
            setScheduleDeal(null);
          }}
        />
      )}
    </div>
  );
}

function QueueManagerBar({ board, reps }: { board: DealBoard; reps: Rep[] }) {
  const allDeals = board?.stages?.flatMap((s: any) => s.deals) || [];
  const fundedDeals = board?.stages?.find((s: any) => s.stage === 'FUNDED')?.deals || [];
  const pipelineDeals =
    board?.stages
      ?.filter((s: any) => ['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(s.stage))
      .flatMap((s: any) => s.deals) || [];
  const now = new Date();

  return (
    <div className="mgr-bar">
      <div className="mgr-head">
        <div className="mh" style={{ flex: 1.5 }}>Rep</div>
        <div className="mh">Active</div>
        <div className="mh">Overdue</div>
        <div className="mh">🔥 Hot</div>
        <div className="mh">Pipeline $</div>
        <div className="mh">Funded MTD</div>
        <div className="mh">Shared</div>
        <div className="mh">MTD Goal %</div>
      </div>
      <div className="mgr-body">
        {reps.map((rep) => {
          const active = allDeals.filter((d: Deal) => d.assignedRepId === rep.id && !['FUNDED', 'CLOSED'].includes(d.stage)).length;
          const overdue = allDeals.filter((d: Deal) => d.assignedRepId === rep.id && d.nextActionDue && new Date(d.nextActionDue) < now).length;
          const hot = allDeals.filter((d: Deal) => d.assignedRepId === rep.id && isDealHot(d)).length;
          const pipeline = pipelineDeals
            .filter((d: Deal) => d.assignedRepId === rep.id)
            .reduce((sum: number, d: Deal) => {
              const best = d.offers?.length ? d.offers.reduce((a, b) => (a.amount > b.amount ? a : b)).amount : 0;
              return sum + best;
            }, 0);
          const funded = fundedDeals
            .filter((d: Deal) => d.assignedRepId === rep.id)
            .reduce((sum: number, d: Deal) => sum + (d.fundingEvents?.[0]?.amountFunded || 0), 0);
          const shared = allDeals.filter((d: Deal) => d.coRepIds?.includes(rep.id) && d.assignedRepId !== rep.id).length;
          const goal = rep.monthlyGoal || 0;
          const pct = goal ? Math.round((funded / goal) * 100) : 0;
          const barColor = pct >= 75 ? 'var(--good)' : pct >= 50 ? 'var(--watch)' : 'var(--urgent)';

          return (
            <div key={rep.id} className="mgr-row">
              <div className="mgr-cell" style={{ flex: 1.5 }}>
                <div className="av" style={{ width: '15px', height: '15px', background: rep.avatarColor || 'var(--gold)', fontSize: '7px' }}>
                  {rep.initials || rep.firstName[0]}
                </div>
                {rep.firstName} {rep.lastName}
              </div>
              <div className="mgr-cell">
                <span className="mgr-val" style={{ color: active ? 'var(--text)' : 'var(--text3)' }}>{active}</span>
              </div>
              <div className="mgr-cell">
                <span className="mgr-val" style={{ color: overdue ? 'var(--urgent)' : 'var(--text3)' }}>{overdue}</span>
              </div>
              <div className="mgr-cell">
                <span className="mgr-val" style={{ color: hot ? 'var(--hot)' : 'var(--text3)' }}>{hot}</span>
              </div>
              <div className="mgr-cell">
                <span className="mgr-val" style={{ color: pipeline ? 'var(--good)' : 'var(--text3)' }}>{pipeline ? formatCurrency(pipeline) : '$0'}</span>
              </div>
              <div className="mgr-cell">
                <span className="mgr-val" style={{ color: funded ? 'var(--good)' : 'var(--text3)' }}>{funded ? formatCurrency(funded) : '$0'}</span>
              </div>
              <div className="mgr-cell">
                <span className="mgr-val" style={{ color: shared ? 'var(--info)' : 'var(--text3)' }}>{shared}</span>
              </div>
              <div className="mgr-cell">
                {!goal ? (
                  <span className="mgr-val" style={{ color: 'var(--text3)' }}>—</span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    <span className="mgr-val" style={{ color: barColor }}>{pct}%</span>
                    <div style={{ width: '60px' }}>
                      <div className="goal-bar-track">
                        <div className="goal-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function QueueSummaryBar({ stats }: { stats: DealStats }) {
  return (
    <div className="sum-bar">
      <div className="sb2">
        <div className="sl">Active Pipeline</div>
        <div className="sv" style={{ color: 'var(--good)' }}>
          {formatCurrency(stats.pipelineValue)}
        </div>
        <div className="ss">Approved + Nurture</div>
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
                  <div className="goal-bar-fill" style={{ width: `${Math.min(100, pct)}%`, background: barColor }} />
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
