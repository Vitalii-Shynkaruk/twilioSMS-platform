import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { dealApi, repApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import DealCard, { formatCurrency, PRODUCT_ICONS } from '../components/pipeline/DealCard';
import DealPanel, { NQCloseModal, ScheduleFollowUpModal } from '../components/pipeline/DealPanel';
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
  { value: 'NEW_LEAD', label: 'New Lead', short: 'New Lead', color: '#4A9EE8', opacity: 0.32 },
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
    opacity: 0.55,
  },
  {
    value: 'SUBMITTED_IN_REVIEW',
    label: 'Submitted (In Review)',
    short: 'Submitted (In Review)',
    color: '#4A9EE8',
    opacity: 0.7,
  },
  {
    value: 'APPROVED_OFFERS',
    label: 'Approved / Offers',
    short: 'Approved / Offers',
    color: '#FF8C00',
    opacity: 1,
    colClass: 'nb-col',
    stageClass: 'pipe',
  },
  {
    value: 'COMMITTED_FUNDING',
    label: 'Committed (Funding)',
    short: 'Committed (Funding)',
    color: '#3AB97A',
    opacity: 0.85,
    colClass: 'nb-col',
    stageClass: 'pipe',
  },
  { value: 'FUNDED', label: 'Funded', short: 'Funded', color: '#3AB97A', opacity: 0.7, stageClass: 'pipe' },
  { value: 'NURTURE', label: 'Nurture', short: 'Nurture', color: '#4A9EE8', opacity: 0.3 },
  { value: 'CLOSED', label: 'Closed', short: 'Closed', color: '#536070', opacity: 0.28, stageClass: 'closed-s' },
];

const STAGE_LABELS: Record<string, string> = Object.fromEntries(STAGES.map((s) => [s.value, s.short]));
const SUBMITTED_TOTAL_PRODUCTS = new Set(['SBA', 'CRE', 'EQUIPMENT']);

function isDealHot(deal: Deal): boolean {
  if (['FUNDED', 'NURTURE', 'CLOSED'].includes(deal.stage)) return false;
  if (deal.stage === 'APPROVED_OFFERS' || deal.stage === 'COMMITTED_FUNDING') return true;
  if (deal.lenderEngaged && deal.appSubmitted) return true;
  if (deal.lastReplyAt) {
    const hours = (Date.now() - new Date(deal.lastReplyAt).getTime()) / 3600000;
    if (hours <= 48) return true;
  }
  return !!deal.isHot;
}

function getCurrentMonthRange(base = new Date()) {
  const start = new Date(base.getFullYear(), base.getMonth(), 1);
  const end = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  return { start, end };
}

function parseDateSafe(value?: string | Date | null): Date | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getStartOfToday(): Date {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

function isPastDueDate(value?: string | Date | null): boolean {
  const due = parseDateSafe(value);
  if (!due) return false;
  return due < getStartOfToday();
}

function isDateInRange(date: Date | null, start: Date, end: Date): boolean {
  return !!date && date >= start && date < end;
}

function isDealFundedInRange(deal: Deal, start: Date, end: Date): boolean {
  if (isDateInRange(parseDateSafe(deal.fundedDate), start, end)) return true;
  return (deal.fundingEvents || []).some((event) =>
    isDateInRange(parseDateSafe(event.fundedDate) || parseDateSafe(event.createdAt), start, end),
  );
}

function getDealFundedAmountInRange(deal: Deal, start: Date, end: Date): number {
  const monthEvents = (deal.fundingEvents || []).filter((event) =>
    isDateInRange(parseDateSafe(event.fundedDate) || parseDateSafe(event.createdAt), start, end),
  );
  const eventSum = monthEvents.reduce((sum, event) => sum + (event.amountFunded || 0), 0);
  if (eventSum > 0) return eventSum;
  if (isDateInRange(parseDateSafe(deal.fundedDate), start, end)) {
    return deal.dealAmount || deal.fundingEvents?.[0]?.amountFunded || 0;
  }
  return 0;
}

function isRepInvolvedInDeal(deal: Deal, repId: string): boolean {
  const assistingIds = ((deal.assistingRepIds as string[]) || []).filter(Boolean);
  return deal.assignedRepId === repId || assistingIds.includes(repId);
}

function getRepFundedAmountInRange(deals: Deal[], repId: string, start: Date, end: Date): number {
  const seenDealIds = new Set<string>();
  return deals.reduce((sum, deal) => {
    if (!isRepInvolvedInDeal(deal, repId)) return sum;
    if (seenDealIds.has(deal.id)) return sum;
    seenDealIds.add(deal.id);
    return sum + getDealFundedAmountInRange(deal, start, end);
  }, 0);
}

function getRepFundedUnitsInRange(deals: Deal[], repId: string, start: Date, end: Date): number {
  const seenDealIds = new Set<string>();
  return deals.reduce((count, deal) => {
    if (!isRepInvolvedInDeal(deal, repId)) return count;
    if (!isDealFundedInRange(deal, start, end)) return count;
    if (seenDealIds.has(deal.id)) return count;
    seenDealIds.add(deal.id);
    return count + 1;
  }, 0);
}

function getDealApprovedCommittedAmount(deal: Deal): number {
  if (deal.offers?.length) {
    const highestOffer = deal.offers.reduce((a, b) => (a.amount > b.amount ? a : b));
    return highestOffer?.amount || 0;
  }
  return deal.dealAmount || 0;
}

type QuickFilter = 'all' | 'mine' | 'overdue' | 'hot' | 'neglected' | 'ghost_offer' | 'this_week' | 'shared';
type ViewTab = 'pipeline' | 'team' | 'queue';
type ViewMode = 'simple' | 'execution';
type PipelineScope = 'mine' | 'all';

const FILTERS: { key: QuickFilter; label: string; activeCls: string; passiveCls: string }[] = [
  { key: 'all', label: 'All', activeCls: 'act', passiveCls: '' },
  { key: 'mine', label: 'Mine', activeCls: 'act', passiveCls: '' },
  { key: 'shared', label: '👥 Shared', activeCls: 'act', passiveCls: '' },
  { key: 'overdue', label: 'Overdue', activeCls: 'act', passiveCls: 'urg' },
  { key: 'hot', label: '🔥 Hot', activeCls: 'fire act', passiveCls: 'fire' },
  { key: 'neglected', label: 'Neglected', activeCls: 'act', passiveCls: 'urg' },
  { key: 'ghost_offer', label: 'Ghosted with Offer', activeCls: 'ghost-act', passiveCls: 'ghost' },
  { key: 'this_week', label: '📅 This Week', activeCls: 'week-act', passiveCls: '' },
];

const PIPELINE_VISUAL_MODE_KEY = 'scl_pipeline_visual_mode';

interface CreatedPipelineDeal {
  id: string;
  clientId?: string;
  assignedRepId?: string | null;
  stage?: string;
}

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
  const [visualMode, setVisualMode] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem(PIPELINE_VISUAL_MODE_KEY);
    return saved === 'light' ? 'light' : 'dark';
  });
  const [repFilter, setRepFilter] = useState('');
  const [selectedDealId, setSelectedDealId] = useState<string | null>(initialDealId);
  const [showCreateDeal, setShowCreateDeal] = useState(initialNewDeal === '1');
  const [showGoals, setShowGoals] = useState(false);
  const [showImportLeads, setShowImportLeads] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [addOfferCtx, setAddOfferCtx] = useState<{
    dealId: string;
    clientId?: string;
    businessName?: string;
    productType?: string;
    assignedRepId?: string;
  } | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [ctxMenu, setCtxMenu] = useState<{
    x: number;
    y: number;
    dealId: string;
    dealName: string;
    assignedRepId: string;
    stage: string;
    productType?: string;
    clientId?: string;
  } | null>(null);
  const [sharePopover, setSharePopover] = useState<{ dealId: string; x: number; y: number } | null>(null);
  const [transferPopover, setTransferPopover] = useState<{
    dealId: string;
    assignedRepId: string;
    x: number;
    y: number;
  } | null>(null);
  const [nqFromContext, setNqFromContext] = useState<{ deal: Deal; mode: 'lost' | 'disq' } | null>(null);
  const [hoverTooltip, setHoverTooltip] = useState<{ deal: Deal; x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!ctxMenu && !sharePopover && !transferPopover) return;
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setCtxMenu(null);
        setSharePopover(null);
        setTransferPopover(null);
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [ctxMenu, sharePopover, transferPopover]);

  useEffect(() => {
    localStorage.setItem(PIPELINE_VISUAL_MODE_KEY, visualMode);
  }, [visualMode]);

  useEffect(
    () => () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    },
    [],
  );

  useEffect(() => {
    if (!hoverTooltip) return;
    const clear = () => setHoverTooltip(null);
    window.addEventListener('scroll', clear, true);
    window.addEventListener('resize', clear);
    return () => {
      window.removeEventListener('scroll', clear, true);
      window.removeEventListener('resize', clear);
    };
  }, [hoverTooltip]);

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

  // ─── Pipeline занимает всё пространство, блокируем вертикальный скролл parent ───
  const pipelineRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrapper = pipelineRef.current?.parentElement;
    if (wrapper) {
      wrapper.style.overflow = 'hidden';
      wrapper.style.display = 'flex';
      wrapper.style.flexDirection = 'column';
      return () => {
        wrapper.style.overflow = '';
        wrapper.style.display = '';
        wrapper.style.flexDirection = '';
      };
    }
  }, []);

  // ─── DnD ───
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }));

  // ─── Data fetching ───
  const userId = user?.id;

  const { data: reps } = useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps({ activeOnly: 'true' });
      return data as Rep[];
    },
  });

  const activeUsers = useMemo(() => (reps || []).filter((r) => r.isActive), [reps]);
  const displayReps = useMemo(() => {
    const roleReps = activeUsers.filter((r) => r.role === 'REP');
    const nonRepWithGoals = activeUsers.filter((r) => {
      if (r.role === 'REP') return false;
      const monthlyGoal = Number(r.monthlyGoal || 0);
      const annualGoal = Number(r.annualGoal || 0);
      return monthlyGoal > 0 || annualGoal > 0;
    });

    if (roleReps.length > 0) {
      const merged = [...roleReps];
      nonRepWithGoals.forEach((rep) => {
        if (!merged.some((existing) => existing.id === rep.id)) {
          merged.push(rep);
        }
      });
      return merged;
    }

    return activeUsers.filter((r) => r.role !== 'MANAGER');
  }, [activeUsers]);

  // Reset filter when selected rep no longer in display list
  const effectiveRepFilter = useMemo(() => {
    if (repFilter && !displayReps.some((r) => r.id === repFilter)) return '';
    return repFilter;
  }, [repFilter, displayReps]);

  const boardParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (viewTab === 'team') {
      params.teamView = 'true';
      // Top KPI in Team view: scoped to selected rep (admin) or current rep (non-admin)
      if (effectiveRepFilter) {
        params.repId = effectiveRepFilter;
      } else if (!isAdmin && userId) {
        params.repId = userId;
      }
      return params;
    }

    params.primaryOnly = 'false';

    if (effectiveRepFilter) {
      params.repId = effectiveRepFilter;
    } else if (pipelineScope === 'mine' && !isAdmin && userId) {
      params.repId = userId;
    }
    if (isAdmin) params.teamView = 'true';
    return params;
  }, [effectiveRepFilter, pipelineScope, isAdmin, userId, viewTab, quickFilter]);

  const { data: board, isLoading: boardLoading } = useQuery({
    queryKey: ['deals', 'board', boardParams],
    queryFn: async () => {
      const { data } = await dealApi.getBoard(boardParams);
      return data as DealBoard;
    },
    refetchInterval: 30000,
  });

  const needsTeamSectionsBoard = viewTab === 'team' && (!!effectiveRepFilter || (!isAdmin && !!userId));
  const { data: teamBoard } = useQuery({
    queryKey: ['deals', 'board', { teamView: 'true', scope: 'team-sections' }],
    queryFn: async () => {
      const { data } = await dealApi.getBoard({ teamView: 'true' });
      return data as DealBoard;
    },
    enabled: needsTeamSectionsBoard,
    refetchInterval: 30000,
  });
  const teamSectionsBoard = viewTab === 'team' ? (needsTeamSectionsBoard ? teamBoard : board) : board;

  const { data: stats } = useQuery({
    queryKey: ['deals', 'stats', boardParams],
    queryFn: async () => {
      const { data } = await dealApi.getStats(boardParams);
      return data as DealStats;
    },
    refetchInterval: 30000,
  });

  const { data: teamStats } = useQuery({
    queryKey: ['deals', 'stats', { teamView: 'true', scope: 'team-total' }],
    queryFn: async () => {
      const { data } = await dealApi.getStats({ teamView: 'true' });
      return data as DealStats;
    },
    enabled: viewTab === 'team',
    refetchInterval: 30000,
  });

  const reviveQueueParams = useMemo(() => {
    const params: Record<string, string> = {};
    if (effectiveRepFilter) {
      params.repId = effectiveRepFilter;
      params.primaryOnly = 'true';
    } else if (!isAdmin && userId) {
      params.repId = userId;
      params.primaryOnly = 'true';
    } else if (pipelineScope === 'mine' && userId) {
      params.repId = userId;
      params.primaryOnly = 'true';
    }
    return params;
  }, [effectiveRepFilter, isAdmin, pipelineScope, userId]);

  const { data: reviveQueue } = useQuery({
    queryKey: ['deals', 'revive', reviveQueueParams],
    queryFn: async () => {
      const { data } = await dealApi.getReviveQueue(
        Object.keys(reviveQueueParams).length ? reviveQueueParams : undefined,
      );
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
  const NO_AMOUNT_STAGES = ['NEW_LEAD', 'ENGAGED_INTERESTED', 'QUALIFIED'];
  const filteredBoard = useMemo(() => {
    if (!board?.stages) return board;
    const now = new Date();
    const term = searchTerm.toLowerCase().trim();
    return {
      ...board,
      stages: board.stages.map((s: any) => {
        const filteredDeals = s.deals.filter((d: Deal) => {
          // Поиск по Business Name и Contact Name
          if (term) {
            const biz = (d.client?.businessName || '').toLowerCase();
            const contact = (d.client?.contactName || '').toLowerCase();
            if (!biz.includes(term) && !contact.includes(term)) return false;
          }
          if (quickFilter === 'mine' && d.assignedRepId !== user?.id) return false;
          if (quickFilter === 'shared') {
            const assistIds = ((d.assistingRepIds as string[]) || []).filter(Boolean);
            if (isAdmin) {
              if (assistIds.length === 0) return false;
            } else if (!assistIds.includes(user?.id || '')) {
              return false;
            }
          }
          if (quickFilter === 'overdue') {
            if (['FUNDED', 'CLOSED'].includes(d.stage)) return false;
            if (!isPastDueDate(d.nextActionDue)) return false;
          }
          if (quickFilter === 'hot' && !isDealHot(d)) return false;
          if (quickFilter === 'neglected' && (d.staleDays || 0) < 7) return false;
          if (quickFilter === 'ghost_offer' && !(d.stage === 'NURTURE' && (d.prevOffer || 0) > 0)) return false;
          if (quickFilter === 'this_week') {
            const weekEnd = new Date();
            weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));
            if (!d.nextActionDue || new Date(d.nextActionDue) > weekEnd) return false;
          }
          return true;
        });

        // Recalculate value based on filtered deals
        let value = 0;
        const prevOfferSubtotal =
          s.stage === 'NURTURE' ? filteredDeals.reduce((sum: number, d: Deal) => sum + (d.prevOffer || 0), 0) : 0;
        if (!NO_AMOUNT_STAGES.includes(s.stage)) {
          if (s.stage === 'FUNDED') {
            value = filteredDeals.reduce((sum: number, d: Deal) => sum + (d.dealAmount || 0), 0);
          } else if (s.stage === 'NURTURE') {
            value = 0;
          } else if (s.stage === 'SUBMITTED_IN_REVIEW') {
            value = filteredDeals.reduce((sum: number, d: Deal) => {
              if (!d.productType || !SUBMITTED_TOTAL_PRODUCTS.has(d.productType)) return sum;
              return sum + (d.submittedAmount || d.dealAmount || 0);
            }, 0);
          } else {
            value = filteredDeals.reduce((sum: number, d: Deal) => {
              const best = d.offers?.reduce(
                (a: any, b: any) => ((a?.amount || 0) > (b?.amount || 0) ? a : b),
                d.offers[0],
              );
              return sum + (best?.amount || d.dealAmount || 0);
            }, 0);
          }
        }

        return { ...s, deals: filteredDeals, count: filteredDeals.length, value, prevOfferSubtotal };
      }),
    };
  }, [board, quickFilter, user?.id, searchTerm, isAdmin]);

  const visibleStageDefs = useMemo(
    () => (viewMode === 'simple' ? STAGES.filter((stage) => stage.value !== 'CLOSED') : STAGES),
    [viewMode],
  );

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
        toast(
          targetStage === 'NURTURE'
            ? 'Click the deal panel → set Lost Reason + Follow-up to move to Nurture'
            : 'Click the deal panel → set Disqualification Reason to close',
          { icon: 'ℹ️' },
        );
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
  const currentMonthRange = getCurrentMonthRange();

  // ─── Filter counts (computed from unfiltered board) ───
  const filterCounts = useMemo(() => {
    if (!board?.stages) return { overdue: 0, hot: 0, neglected: 0, ghost_offer: 0, this_week: 0, shared: 0 };
    const allDeals: Deal[] = board.stages.flatMap((s: any) => s.deals);
    const now = new Date();
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + (7 - weekEnd.getDay()));

    const overdue = allDeals.filter(
      (d) => !['FUNDED', 'CLOSED'].includes(d.stage) && isPastDueDate(d.nextActionDue),
    ).length;
    const hot = allDeals.filter((d) => isDealHot(d)).length;
    const neglected = allDeals.filter((d) => (d.staleDays || 0) >= 7 && !['FUNDED', 'CLOSED'].includes(d.stage)).length;
    const ghost_offer = allDeals.filter((d) => d.stage === 'NURTURE' && (d.prevOffer || 0) > 0).length;
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
    const shared = allDeals.filter((d) => {
      const assistIds = ((d.assistingRepIds as string[]) || []).filter(Boolean);
      if (isAdmin) return assistIds.length > 0;
      return assistIds.includes(user?.id || '');
    }).length;
    return { overdue, hot, neglected, ghost_offer, this_week, shared };
  }, [board, user?.id, isAdmin]);

  // ─── Filter labels with counts ───
  const filterLabels = useMemo(
    () => ({
      all: 'All',
      mine: 'Mine',
      shared: filterCounts.shared ? `👥 Shared (${filterCounts.shared})` : '👥 Shared',
      overdue: filterCounts.overdue ? `Overdue (${filterCounts.overdue})` : 'Overdue',
      hot: filterCounts.hot ? `🔥 Hot (${filterCounts.hot})` : '🔥 Hot',
      neglected: filterCounts.neglected ? `Neglected (${filterCounts.neglected})` : 'Neglected',
      ghost_offer: filterCounts.ghost_offer ? `Ghosted with Offer (${filterCounts.ghost_offer})` : 'Ghosted with Offer',
      this_week: filterCounts.this_week ? `📅 This Week (${filterCounts.this_week})` : '📅 This Week',
    }),
    [filterCounts],
  );

  const dealById = useMemo(() => {
    const map = new Map<string, Deal>();
    for (const stage of board?.stages || []) {
      for (const d of stage.deals || []) {
        map.set(d.id, d);
      }
    }
    return map;
  }, [board]);

  const openNQFromContextMenu = useCallback(
    (mode: 'lost' | 'disq') => {
      if (!ctxMenu) return;
      const deal = dealById.get(ctxMenu.dealId);
      if (!deal) {
        toast.error('Unable to open modal for this deal');
        return;
      }
      setNqFromContext({ deal, mode });
      setCtxMenu(null);
    },
    [ctxMenu, dealById],
  );

  const toggleVisualMode = useCallback(() => {
    setVisualMode((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  const clearHoverTooltip = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setHoverTooltip(null);
  }, []);

  const scheduleHoverTooltip = useCallback(
    (deal: Deal, anchorRect: DOMRect) => {
      if (viewMode !== 'execution' || deal.stage === 'CLOSED') return;
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => {
        setHoverTooltip({
          deal,
          x: anchorRect.left + anchorRect.width / 2,
          y: anchorRect.top,
        });
      }, 600);
    },
    [viewMode],
  );

  const handleViewTab = (tab: ViewTab, scope?: PipelineScope) => {
    setViewTab(tab);
    if (scope) setPipelineScope(scope);
  };

  const revealCreatedDeal = useCallback(
    (deal: CreatedPipelineDeal) => {
      setViewTab('pipeline');
      setQuickFilter('all');
      setSearchTerm('');
      if (isAdmin) {
        setPipelineScope('all');
        setRepFilter('');
      }
      setSelectedDealId(deal.id);
    },
    [isAdmin],
  );

  useEffect(() => {
    const handleDealCreated = (event: Event) => {
      const createdDeal = (event as CustomEvent<CreatedPipelineDeal>).detail;
      if (createdDeal?.id) revealCreatedDeal(createdDeal);
    };

    window.addEventListener('scl:deal-created', handleDealCreated);
    return () => window.removeEventListener('scl:deal-created', handleDealCreated);
  }, [revealCreatedDeal]);

  // ═══ RENDER ═══
  return (
    <div ref={pipelineRef} className={`pipeline-root ${visualMode === 'light' ? 'light-mode' : 'dark-mode'}`}>
      {/* ═══ TOPBAR ═══ */}
      <div className="topbar">
        <div className="logo">
          <svg width="17" height="17" viewBox="0 0 17 17" fill="none">
            <rect x="1.5" y="1.5" width="14" height="14" rx="3" stroke="#C9952A" strokeWidth="1.4" />
            <path d="M5.5 8.5h6M8.5 5.5v6" stroke="#C9952A" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          SCL <em>Pipeline</em>
        </div>

        {/* Поиск по deal-карточкам */}
        <div className="pipeline-search">
          <input
            type="text"
            placeholder="Search deals..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pipeline-search-input"
          />
          {searchTerm && (
            <button className="pipeline-search-clear" onClick={() => setSearchTerm('')}>
              ✕
            </button>
          )}
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
                <button key={f.key} className={`fp ${cls}`} onClick={() => setQuickFilter(f.key)}>
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
        {viewTab !== 'team' && (
          <button
            className="add-btn"
            style={{ background: 'var(--surface3)', color: 'var(--text)' }}
            onClick={() => setShowImportLeads(true)}
          >
            ⬆ Import CSV
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
          ⚡MCA/🔄LOC: flag 2d · 🔧Equipment: 5d · 🏡HELOC: 30d · 🏛SBA/🏢CRE: 60d review clocks
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
              {quickFilter === 'ghost_offer' ? ' · Ghosted with Offer' : ''}
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
            <span className="btext">Primary + shared deals</span>
          </>
        ) : (
          <>
            <span
              className="vb"
              style={{ background: 'var(--info-bg)', color: 'var(--info)', border: '1px solid var(--info-b)' }}
            >
              My Pipeline
            </span>
            <span className="btext">Primary + shared deals</span>
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
                onDragStart={(e) => {
                  clearHoverTooltip();
                  setActiveDragId(e.active.id as string);
                }}
                onDragEnd={handleDragEnd}
                onDragCancel={() => {
                  clearHoverTooltip();
                  setActiveDragId(null);
                }}
              >
                <div className="board">
                  {visibleStageDefs.map((stageDef) => {
                    const stageData = filteredBoard?.stages?.find((s: any) => s.stage === stageDef.value);
                    const deals = stageData?.deals || [];
                    const count = stageData?.count || deals.length;
                    const value = stageData?.value || 0;
                    const prevOfferSubtotal = stageData?.prevOfferSubtotal || 0;
                    return (
                      <StageColumn
                        key={stageDef.value}
                        config={stageDef}
                        deals={deals}
                        count={count}
                        value={value}
                        prevOfferSubtotal={prevOfferSubtotal}
                        viewMode={viewMode}
                        searchTerm={searchTerm}
                        onDealClick={(id) => setSelectedDealId(id)}
                        onCardContextMenu={(e, deal) => {
                          e.preventDefault();
                          const assistIds = (deal.assistingRepIds as string[]) || [];
                          const canOpenContext =
                            isAdmin || deal.assignedRepId === user?.id || (!!user?.id && assistIds.includes(user.id));
                          if (!canOpenContext) return;
                          clearHoverTooltip();
                          setCtxMenu({
                            x: e.clientX,
                            y: e.clientY,
                            dealId: deal.id,
                            dealName: deal.client?.businessName || 'this deal',
                            assignedRepId: deal.assignedRepId,
                            stage: deal.stage,
                            productType: deal.productType,
                            clientId: deal.clientId,
                          });
                        }}
                        onCardMouseEnter={(deal, rect) => scheduleHoverTooltip(deal, rect)}
                        onCardMouseLeave={clearHoverTooltip}
                      />
                    );
                  })}
                </div>
                <DragOverlay>
                  {draggedDeal && <DealCard deal={draggedDeal} viewMode={viewMode} highlightTerm={searchTerm} />}
                </DragOverlay>
              </DndContext>
            )}
          </div>

          {/* Manager bar (hidden in simple via CSS) */}
          {isAdmin && stats && displayReps.length > 0 && (
            <div className="mgr-bar">
              {/* Header row */}
              <div className="mgr-head">
                <div className="mh" style={{ flex: 1.5 }}>
                  Rep
                </div>
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
                  const overdue = repDeals.filter(
                    (d: Deal) => !['FUNDED', 'CLOSED'].includes(d.stage) && isPastDueDate(d.nextActionDue),
                  ).length;
                  const hot = repDeals.filter((d: Deal) => isDealHot(d)).length;
                  const pipeline =
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
                  const monthFundedDeals =
                    board?.stages
                      ?.find((s: any) => s.stage === 'FUNDED')
                      ?.deals.filter((d: Deal) =>
                        isDealFundedInRange(d, currentMonthRange.start, currentMonthRange.end),
                      ) || [];
                  const funded = getRepFundedAmountInRange(
                    monthFundedDeals,
                    rep.id,
                    currentMonthRange.start,
                    currentMonthRange.end,
                  );
                  const shared =
                    board?.stages?.reduce(
                      (acc: number, s: any) =>
                        acc +
                        s.deals.filter((d: Deal) => d.assistingRepIds?.includes(rep.id) && d.assignedRepId !== rep.id)
                          .length,
                      0,
                    ) || 0;
                  const goal = rep.monthlyGoal || 0;
                  const pct = goal ? Math.round((funded / goal) * 100) : 0;
                  const barColor = pct >= 75 ? 'var(--good)' : pct >= 50 ? 'var(--watch)' : 'var(--urgent)';

                  return (
                    <div key={rep.id} className="mgr-row">
                      <div className="mgr-cell" style={{ flex: 1.5 }}>
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
                      <div className="mgr-cell" data-label="Active">
                        <span className="mgr-val" style={{ color: active ? 'var(--text)' : 'var(--text3)' }}>
                          {active}
                        </span>
                      </div>
                      <div className="mgr-cell" data-label="Overdue">
                        <span className="mgr-val" style={{ color: overdue ? 'var(--urgent)' : 'var(--text3)' }}>
                          {overdue}
                        </span>
                      </div>
                      <div className="mgr-cell" data-label="Hot">
                        <span className="mgr-val" style={{ color: hot ? 'var(--hot)' : 'var(--text3)' }}>
                          {hot}
                        </span>
                      </div>
                      <div className="mgr-cell" data-label="Pipeline">
                        <span className="mgr-val" style={{ color: pipeline ? 'var(--good)' : 'var(--text3)' }}>
                          {pipeline ? formatCurrency(pipeline) : '$0'}
                        </span>
                      </div>
                      <div className="mgr-cell" data-label="Funded">
                        <span className="mgr-val" style={{ color: funded ? 'var(--good)' : 'var(--text3)' }}>
                          {funded ? formatCurrency(funded) : '$0'}
                        </span>
                      </div>
                      <div className="mgr-cell" data-label="Shared">
                        <span className="mgr-val" style={{ color: shared ? 'var(--info)' : 'var(--text3)' }}>
                          {shared}
                        </span>
                      </div>
                      <div className="mgr-cell" data-label="Goal">
                        {!goal ? (
                          <span className="mgr-val" style={{ color: 'var(--text3)' }}>
                            —
                          </span>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
        <TeamView
          stats={stats}
          teamStats={teamStats}
          scopedBoard={board}
          teamBoard={teamSectionsBoard}
          reps={displayReps}
          onDealClick={(id) => setSelectedDealId(id)}
        />
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
      {showImportLeads && (
        <ImportLeadsModal onClose={() => setShowImportLeads(false)} isAdmin={isAdmin} reps={displayReps} />
      )}
      {addOfferCtx && (
        <AddOfferModal
          dealId={addOfferCtx.dealId}
          businessName={addOfferCtx.businessName}
          existingProductType={addOfferCtx.productType}
          clientId={addOfferCtx.clientId}
          assignedRepId={addOfferCtx.assignedRepId}
          onClose={() => setAddOfferCtx(null)}
        />
      )}

      {/* RIGHT-CLICK CONTEXT MENU */}
      {ctxMenu && (
        <>
          <div
            className="ctx-overlay"
            onClick={() => setCtxMenu(null)}
            onContextMenu={(e) => {
              e.preventDefault();
              setCtxMenu(null);
            }}
          />
          <div className="ctx-menu" style={{ left: ctxMenu.x, top: ctxMenu.y }}>
            <button
              className="ctx-item ctx-open"
              onClick={() => {
                setSelectedDealId(ctxMenu.dealId);
                setCtxMenu(null);
              }}
            >
              📋 Open Deal
            </button>
            {(isAdmin || user?.id === ctxMenu.assignedRepId) && ctxMenu.stage !== 'CLOSED' && (
              <button
                className="ctx-item"
                onClick={() => {
                  setSharePopover({ dealId: ctxMenu.dealId, x: ctxMenu.x, y: ctxMenu.y });
                  setCtxMenu(null);
                }}
              >
                👥 Share Deal
              </button>
            )}
            {(isAdmin || user?.id === ctxMenu.assignedRepId) &&
              !['CLOSED', 'FUNDED', 'NURTURE'].includes(ctxMenu.stage) && (
                <button className="ctx-item" onClick={() => openNQFromContextMenu('lost')}>
                  🌱 Move to Nurture
                </button>
              )}
            {(isAdmin || user?.id === ctxMenu.assignedRepId) && ctxMenu.stage !== 'CLOSED' && (
              <button className="ctx-item" onClick={() => openNQFromContextMenu('disq')}>
                ⛔ Close / NQ Deal
              </button>
            )}
            {(isAdmin || user?.id === ctxMenu.assignedRepId) &&
              ctxMenu.stage !== 'CLOSED' &&
              ctxMenu.stage !== 'FUNDED' && (
                <button
                  className="ctx-item"
                  onClick={() => {
                    setAddOfferCtx({
                      dealId: ctxMenu.dealId,
                      businessName: ctxMenu.dealName,
                      productType: ctxMenu.productType,
                      clientId: ctxMenu.clientId,
                      assignedRepId: ctxMenu.assignedRepId,
                    });
                    setCtxMenu(null);
                  }}
                >
                  💰 Add Offer / New Product
                </button>
              )}
            {isAdmin && (
              <button
                className="ctx-item"
                onClick={() => {
                  setTransferPopover({
                    dealId: ctxMenu.dealId,
                    assignedRepId: ctxMenu.assignedRepId,
                    x: ctxMenu.x,
                    y: ctxMenu.y,
                  });
                  setCtxMenu(null);
                }}
              >
                🔁 Transfer Ownership
              </button>
            )}
            {isAdmin && ctxMenu.stage !== 'FUNDED' && (
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
            )}
          </div>
        </>
      )}

      {/* SHARE POPOVER (right-click share shortcut) */}
      {sharePopover && (
        <SharePopover
          dealId={sharePopover.dealId}
          x={sharePopover.x}
          y={sharePopover.y}
          onClose={() => setSharePopover(null)}
        />
      )}

      {transferPopover && (
        <TransferOwnershipPopover
          dealId={transferPopover.dealId}
          assignedRepId={transferPopover.assignedRepId}
          x={transferPopover.x}
          y={transferPopover.y}
          onClose={() => setTransferPopover(null)}
        />
      )}

      {nqFromContext && (
        <NQCloseModal
          deal={nqFromContext.deal}
          initialCloseType={nqFromContext.mode}
          onClose={() => setNqFromContext(null)}
          onSubmit={async (data: any) => {
            try {
              await dealApi.moveDeal(nqFromContext.deal.id, data);
              toast.success(data.stage === 'NURTURE' ? 'Moved to Nurture' : 'Deal closed');
              qc.invalidateQueries({ queryKey: ['deals'] });
            } catch (err: any) {
              toast.error(err.response?.data?.error || 'Failed to update stage');
            } finally {
              setNqFromContext(null);
            }
          }}
        />
      )}

      {hoverTooltip && viewMode === 'execution' && (
        <DealHoverTooltip deal={hoverTooltip.deal} x={hoverTooltip.x} y={hoverTooltip.y} />
      )}

      <button
        className="pipe-theme-toggle"
        onClick={toggleVisualMode}
        title={visualMode === 'dark' ? 'Enable light mode' : 'Enable dark mode'}
      >
        {visualMode === 'dark' ? '◐' : '◑'}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════
// CARD SORT PRIORITY (matches prototype)
// ═══════════════════════════════════════
function sortPri(d: Deal): number {
  const now = new Date();
  const overdue = isPastDueDate(d.nextActionDue);
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
  prevOfferSubtotal,
  viewMode,
  searchTerm,
  onDealClick,
  onCardContextMenu,
  onCardMouseEnter,
  onCardMouseLeave,
}: {
  config: StageConfig;
  deals: Deal[];
  count: number;
  value: number;
  prevOfferSubtotal: number;
  viewMode: ViewMode;
  searchTerm?: string;
  onDealClick: (id: string) => void;
  onCardContextMenu?: (e: React.MouseEvent, deal: Deal) => void;
  onCardMouseEnter?: (deal: Deal, rect: DOMRect) => void;
  onCardMouseLeave?: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: config.value });
  const urgentCount = deals.filter(
    (d) => isPastDueDate(d.nextActionDue) || d.renewalTasks?.some((t) => t.status === 'PENDING'),
  ).length;
  const dealCountLabel = `${count} ${count === 1 ? 'deal' : 'deals'}`;
  const activeTotalLabel =
    count === 0 ? '— · 0 deals' : value ? `${formatCurrency(value)} · ${dealCountLabel}` : `${dealCountLabel} · no $`;

  return (
    <div ref={setNodeRef} className={`col ${config.colClass || ''}`}>
      <div className="col-head">
        {viewMode === 'simple' ? (
          <>
            <div
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '2px' }}
            >
              <div className={`sc-col-title ${config.stageClass || ''}`}>{config.short}</div>
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
            <div className={`col-vol ${value ? '' : 'dim'}`}>{activeTotalLabel}</div>
            {prevOfferSubtotal > 0 && (
              <div className="col-prev-total">{formatCurrency(prevOfferSubtotal)} prev offers</div>
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
        {deals.length === 0 && config.value === 'NEW_LEAD' && (
          <div className="col-empty-state">
            Empty by default. Manually-assigned leads from admin land here. Reps move to Engaged on first contact.
          </div>
        )}
        {[...deals]
          .sort((a, b) => {
            // Shared (assist) deals sort below primary-owned deals
            const aAssist =
              a.assignedRepId !== useAuthStore.getState().user?.id &&
              ((a.assistingRepIds as string[]) || []).includes(useAuthStore.getState().user?.id || '')
                ? 1
                : 0;
            const bAssist =
              b.assignedRepId !== useAuthStore.getState().user?.id &&
              ((b.assistingRepIds as string[]) || []).includes(useAuthStore.getState().user?.id || '')
                ? 1
                : 0;
            if (aAssist !== bAssist) return aAssist - bAssist;
            return sortPri(a) - sortPri(b) || (a.staleDays || 0) - (b.staleDays || 0);
          })
          .map((deal) => (
            <DraggableDealCard
              key={deal.id}
              deal={deal}
              viewMode={viewMode}
              onClick={() => onDealClick(deal.id)}
              onContextMenu={onCardContextMenu ? (e) => onCardContextMenu(e, deal) : undefined}
              onMouseEnter={onCardMouseEnter ? (rect) => onCardMouseEnter(deal, rect) : undefined}
              onMouseLeave={onCardMouseLeave}
              highlightTerm={searchTerm}
            />
          ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// DRAGGABLE CARD WRAPPER
// ═══════════════════════════════════════

function DraggableDealCard({
  deal,
  viewMode,
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  highlightTerm,
}: {
  deal: Deal;
  viewMode: ViewMode;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  onMouseEnter?: (rect: DOMRect) => void;
  onMouseLeave?: () => void;
  highlightTerm?: string;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: deal.id });
  const textPointerDownRef = useRef(false);
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, opacity: isDragging ? 0.25 : 1 }
    : undefined;

  const handlePointerDownCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    textPointerDownRef.current = !!target?.closest('.c-name,.c-biz,.sc-name');
  };

  const handleClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
    const hasSelection = !!window.getSelection()?.toString().trim();
    if (textPointerDownRef.current || hasSelection) {
      event.stopPropagation();
      textPointerDownRef.current = false;
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onPointerDownCapture={handlePointerDownCapture}
      onClickCapture={handleClickCapture}
      onContextMenu={onContextMenu}
      onMouseEnter={(e) => onMouseEnter?.((e.currentTarget as HTMLDivElement).getBoundingClientRect())}
      onMouseLeave={onMouseLeave}
    >
      <DealCard deal={deal} onClick={onClick} viewMode={viewMode} highlightTerm={highlightTerm} />
    </div>
  );
}

// ═══════════════════════════════════════
// TEAM VIEW
// ═══════════════════════════════════════

const TEAM_PRODUCT_TAG: Record<string, { cls: string; icon: string; label: string }> = {
  MCA: { cls: 't-mca', icon: PRODUCT_ICONS.MCA, label: 'MCA' },
  LOC: { cls: 't-con', icon: PRODUCT_ICONS.LOC, label: 'LOC' },
  EQUIPMENT: { cls: 't-eq', icon: PRODUCT_ICONS.EQUIPMENT, label: 'Equipment' },
  HELOC: { cls: 't-hel', icon: PRODUCT_ICONS.HELOC, label: 'HELOC' },
  SBA: { cls: 't-sba', icon: PRODUCT_ICONS.SBA, label: 'SBA' },
  CRE: { cls: 't-sba', icon: PRODUCT_ICONS.CRE, label: 'CRE' },
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
  if (coIds.length === 0)
    return (
      <span className="dt-rep-primary" style={{ color: repColor }}>
        {name}
      </span>
    );
  const coRep = reps.find((r) => coIds.includes(r.id));
  const coName = coRep ? `${coRep.firstName} ${(coRep.lastName || '')[0] || ''}`.trim() : null;
  return (
    <>
      <span className="dt-rep-primary" style={{ color: repColor }}>
        {name}
      </span>
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
  teamStats,
  scopedBoard,
  teamBoard,
  reps,
  onDealClick,
}: {
  stats?: DealStats;
  teamStats?: DealStats;
  scopedBoard?: DealBoard;
  teamBoard?: DealBoard;
  reps: Rep[];
  onDealClick: (id: string) => void;
}) {
  const currentMonthRange = getCurrentMonthRange();
  const topAllFundedDeals = scopedBoard?.stages?.find((s) => s.stage === 'FUNDED')?.deals || [];
  const topFundedDeals = topAllFundedDeals.filter((d) =>
    isDealFundedInRange(d, currentMonthRange.start, currentMonthRange.end),
  );

  const topActiveOfferDeals =
    scopedBoard?.stages
      ?.filter((s) => ['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(s.stage))
      .flatMap((s) => s.deals) || [];
  const topNurtureDeals = scopedBoard?.stages?.find((s) => s.stage === 'NURTURE')?.deals || [];
  const topSubmittedDeals = scopedBoard?.stages?.find((s) => s.stage === 'SUBMITTED_IN_REVIEW')?.deals || [];
  const topNurtureValue = topNurtureDeals.reduce((sum, d) => sum + (d.prevOffer || d.dealAmount || 0), 0);
  const topActiveDealsCount =
    scopedBoard?.stages
      ?.filter((s) => !['FUNDED', 'CLOSED', 'NURTURE'].includes(s.stage))
      .reduce((sum, s) => sum + s.deals.length, 0) || 0;
  const topTotalSubmittedAndBeyond = topSubmittedDeals.length + topActiveOfferDeals.length + topFundedDeals.length;
  const topConversionPct =
    topTotalSubmittedAndBeyond > 0 ? (topFundedDeals.length / topTotalSubmittedAndBeyond) * 100 : 0;
  const convColor = topConversionPct >= 60 ? 'var(--good)' : topConversionPct >= 40 ? 'var(--watch)' : 'var(--urgent)';

  const allFundedDeals = teamBoard?.stages?.find((s) => s.stage === 'FUNDED')?.deals || [];
  const fundedDeals = allFundedDeals.filter((d) =>
    isDealFundedInRange(d, currentMonthRange.start, currentMonthRange.end),
  );
  const activeOfferDeals =
    teamBoard?.stages
      ?.filter((s) => ['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(s.stage))
      .flatMap((s) => s.deals) || [];
  const nurtureDeals = teamBoard?.stages?.find((s) => s.stage === 'NURTURE')?.deals || [];
  const activeOfferValue = activeOfferDeals.reduce((sum, d) => sum + (d.dealAmount || 0), 0);
  const nurtureValue = nurtureDeals.reduce((sum, d) => sum + (d.prevOffer || d.dealAmount || 0), 0);
  const individualFundedMTD = stats?.fundedMTD || 0;
  const individualMonthlyGoal = stats?.monthlyGoal || 0;
  const individualGoalPct = individualMonthlyGoal > 0 ? (individualFundedMTD / individualMonthlyGoal) * 100 : 0;
  const teamFundedMTD = teamStats?.fundedMTD ?? stats?.fundedMTD ?? 0;
  const teamMonthlyGoal = teamStats?.monthlyGoal ?? stats?.monthlyGoal ?? 0;
  const teamGoalPct = teamMonthlyGoal > 0 ? (teamFundedMTD / teamMonthlyGoal) * 100 : 0;

  return (
    <div className="team-view">
      {/* Title */}
      <div style={{ marginBottom: '14px' }}>
        <div style={{ fontSize: '16px', fontWeight: 700, marginBottom: '2px' }}>SCL Team Pipeline</div>
        <div style={{ fontSize: '11px', color: 'var(--text2)' }}>All stages · no contact info</div>
      </div>

      {/* Stat cards — 6 cards matching prototype */}
      <div className="team-stat-cards">
        <div className="team-stat-card">
          <div className="stat-label">My Funded MTD</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--good)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(individualFundedMTD)}
          </div>
          <div className="stat-sub">
            {individualMonthlyGoal > 0
              ? `Goal: ${formatCurrency(individualMonthlyGoal)} · ${individualGoalPct.toFixed(0)}%`
              : 'Goal not set'}
          </div>
          <div className="stat-sub">Team Funded MTD: {formatCurrency(teamFundedMTD)}</div>
        </div>
        <div className="team-stat-card">
          <div className="stat-label">Active Pipeline $</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--gold)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(stats?.activePipeline)}
          </div>
          <div className="stat-sub">Approved + Committed</div>
        </div>
        <div className="team-stat-card">
          <div className="stat-label">Active Deals</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--info)', fontVariantNumeric: 'tabular-nums' }}>
            {topActiveDealsCount}
          </div>
          <div className="stat-sub">All stages excl. funded</div>
        </div>
        <div className="team-stat-card">
          <div className="stat-label">Nurture Pool</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--text2)', fontVariantNumeric: 'tabular-nums' }}>
            {formatCurrency(topNurtureValue)}
          </div>
          <div className="stat-sub">{topNurtureDeals.length} deals · prev offer totals</div>
        </div>
        <div className="team-stat-card">
          <div className="stat-label">Deals Funded</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: 'var(--good)', fontVariantNumeric: 'tabular-nums' }}>
            {(stats as any)?.fundedThisMonthCount ?? topFundedDeals.length}
          </div>
          <div className="stat-sub">This month</div>
        </div>
        <div className="team-stat-card">
          <div className="stat-label">Conversion</div>
          <div style={{ fontSize: '20px', fontWeight: 800, color: convColor, fontVariantNumeric: 'tabular-nums' }}>
            {topConversionPct.toFixed(0)}%
          </div>
          <div className="stat-sub">Funded / submitted+</div>
        </div>
      </div>

      {/* Team goal progress — in container like prototype */}
      {teamMonthlyGoal > 0 && (
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
              {teamGoalPct.toFixed(0)}% of {formatCurrency(teamMonthlyGoal)} monthly team goal
            </div>
          </div>
        </div>
      )}

      {/* Rep scoreboard — flex layout like prototype */}
      {teamBoard &&
        reps.length > 0 &&
        (() => {
          const activeReps = reps.filter((r) => r.isActive);
          const repOnly = activeReps.filter((r) => r.role === 'REP');
          const nonRepWithGoals = activeReps.filter((r) => {
            if (r.role === 'REP') return false;
            const monthlyGoal = Number(r.monthlyGoal || 0);
            const annualGoal = Number(r.annualGoal || 0);
            return monthlyGoal > 0 || annualGoal > 0;
          });
          const scoreboardReps =
            repOnly.length > 0
              ? [...repOnly, ...nonRepWithGoals.filter((r) => !repOnly.some((rep) => rep.id === r.id))]
              : activeReps.filter((r) => r.role !== 'MANAGER');
          const sortedRepRows = scoreboardReps
            .map((rep) => {
              const repFundedUnits = getRepFundedUnitsInRange(
                fundedDeals,
                rep.id,
                currentMonthRange.start,
                currentMonthRange.end,
              );
              const repApprovedCommittedAmount = activeOfferDeals.reduce((sum, deal) => {
                if (!isRepInvolvedInDeal(deal, rep.id)) return sum;
                return sum + getDealApprovedCommittedAmount(deal);
              }, 0);
              const repFundedTotal = getRepFundedAmountInRange(
                fundedDeals,
                rep.id,
                currentMonthRange.start,
                currentMonthRange.end,
              );

              return {
                rep,
                repFundedUnits,
                repApprovedCommittedAmount,
                repFundedTotal,
              };
            })
            .sort((a, b) => {
              if (b.repFundedTotal !== a.repFundedTotal) return b.repFundedTotal - a.repFundedTotal;
              return `${a.rep.firstName} ${a.rep.lastName}`.localeCompare(`${b.rep.firstName} ${b.rep.lastName}`);
            });
          return sortedRepRows.length > 0 ? (
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
              <div className="rep-scoreboard">
                {sortedRepRows.map(({ rep, repFundedUnits, repApprovedCommittedAmount, repFundedTotal }) => {
                  const goalPct = rep.monthlyGoal && rep.monthlyGoal > 0 ? repFundedTotal / rep.monthlyGoal : 0;
                  const goalBg = goalPct >= 0.8 ? 'var(--good)' : goalPct >= 0.5 ? 'var(--watch)' : 'var(--urgent)';

                  return (
                    <div key={rep.id} className="rep-score-card">
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
                          <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: '1px' }}>Units</div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--info)' }}>
                            {repFundedUnits}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: '9px', color: 'var(--text3)', marginBottom: '1px' }}>
                            Approved + Committed $
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text2)' }}>
                            {formatCurrency(repApprovedCommittedAmount)}
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

  const getQueueDueDate = (deal: Deal): Date | null => {
    if (deal.nextActionDue) return new Date(deal.nextActionDue);
    if (deal.followUpDate) return new Date(deal.followUpDate);
    return null;
  };

  // Categorize deals into sections
  const overdue: Deal[] = [];
  const dueToday: Deal[] = [];
  const thisWeek: Deal[] = [];
  const upcoming: Deal[] = [];
  const renewalOpps: Deal[] = [];

  deals.forEach((d) => {
    const fu = getQueueDueDate(d);
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
    const fu = getQueueDueDate(d);
    if (!fu) {
      entry.upcoming++;
      return;
    }
    if (fu < startOfToday) entry.overdue++;
    else if (fu < endOfToday) entry.today++;
    else entry.upcoming++;
  });

  function getDueLabel(d: Deal): { text: string; cls: string } {
    const fu = getQueueDueDate(d);
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
                <div
                  className="av"
                  style={{ background: rep.avatarColor || 'var(--gold)', width: 16, height: 16, fontSize: 7 }}
                >
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
          <div style={{ fontSize: '11px' }}>
            No scheduled follow-ups due. Schedule one on any Nurture or Closed deal.
          </div>
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
  const allFundedDeals = board?.stages?.find((s: any) => s.stage === 'FUNDED')?.deals || [];
  const currentMonthRange = getCurrentMonthRange();
  const fundedDeals = allFundedDeals.filter((d: Deal) =>
    isDealFundedInRange(d, currentMonthRange.start, currentMonthRange.end),
  );
  const pipelineDeals =
    board?.stages
      ?.filter((s: any) => ['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(s.stage))
      .flatMap((s: any) => s.deals) || [];
  const now = new Date();

  return (
    <div className="mgr-bar">
      <div className="mgr-head">
        <div className="mh" style={{ flex: 1.5 }}>
          Rep
        </div>
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
          const active = allDeals.filter(
            (d: Deal) => d.assignedRepId === rep.id && !['FUNDED', 'CLOSED'].includes(d.stage),
          ).length;
          const overdue = allDeals.filter(
            (d: Deal) =>
              d.assignedRepId === rep.id && !['FUNDED', 'CLOSED'].includes(d.stage) && isPastDueDate(d.nextActionDue),
          ).length;
          const hot = allDeals.filter((d: Deal) => d.assignedRepId === rep.id && isDealHot(d)).length;
          const pipeline = pipelineDeals
            .filter((d: Deal) => d.assignedRepId === rep.id)
            .reduce((sum: number, d: Deal) => {
              const best = d.offers?.length ? d.offers.reduce((a, b) => (a.amount > b.amount ? a : b)).amount : 0;
              return sum + best;
            }, 0);
          const funded = getRepFundedAmountInRange(fundedDeals, rep.id, currentMonthRange.start, currentMonthRange.end);
          const shared = allDeals.filter(
            (d: Deal) => d.assistingRepIds?.includes(rep.id) && d.assignedRepId !== rep.id,
          ).length;
          const goal = rep.monthlyGoal || 0;
          const pct = goal ? Math.round((funded / goal) * 100) : 0;
          const barColor = pct >= 75 ? 'var(--good)' : pct >= 50 ? 'var(--watch)' : 'var(--urgent)';

          return (
            <div key={rep.id} className="mgr-row">
              <div className="mgr-cell" style={{ flex: 1.5 }}>
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
              <div className="mgr-cell" data-label="Active">
                <span className="mgr-val" style={{ color: active ? 'var(--text)' : 'var(--text3)' }}>
                  {active}
                </span>
              </div>
              <div className="mgr-cell" data-label="Overdue">
                <span className="mgr-val" style={{ color: overdue ? 'var(--urgent)' : 'var(--text3)' }}>
                  {overdue}
                </span>
              </div>
              <div className="mgr-cell" data-label="Hot">
                <span className="mgr-val" style={{ color: hot ? 'var(--hot)' : 'var(--text3)' }}>
                  {hot}
                </span>
              </div>
              <div className="mgr-cell" data-label="Pipeline">
                <span className="mgr-val" style={{ color: pipeline ? 'var(--good)' : 'var(--text3)' }}>
                  {pipeline ? formatCurrency(pipeline) : '$0'}
                </span>
              </div>
              <div className="mgr-cell" data-label="Funded">
                <span className="mgr-val" style={{ color: funded ? 'var(--good)' : 'var(--text3)' }}>
                  {funded ? formatCurrency(funded) : '$0'}
                </span>
              </div>
              <div className="mgr-cell" data-label="Shared">
                <span className="mgr-val" style={{ color: shared ? 'var(--info)' : 'var(--text3)' }}>
                  {shared}
                </span>
              </div>
              <div className="mgr-cell" data-label="Goal">
                {!goal ? (
                  <span className="mgr-val" style={{ color: 'var(--text3)' }}>
                    —
                  </span>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
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
  const [teamMonthlyInput, setTeamMonthlyInput] = useState<string | null>(null);
  const [teamAnnualInput, setTeamAnnualInput] = useState<string | null>(null);

  const { data: teamGoalsData } = useQuery({
    queryKey: ['reps', 'team-goals'],
    queryFn: async () => {
      const { data } = await repApi.getTeamGoals();
      return data as { monthlyGoal: number; annualGoal: number; updatedAt?: string | null };
    },
  });

  const teamMonthly = teamMonthlyInput ?? (teamGoalsData?.monthlyGoal ? String(teamGoalsData.monthlyGoal) : '');
  const teamAnnual = teamAnnualInput ?? (teamGoalsData?.annualGoal ? String(teamGoalsData.annualGoal) : '');

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
      qc.invalidateQueries({ queryKey: ['reps', 'team-goals'] });
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
              onChange={(e) => setTeamMonthlyInput(e.target.value)}
              placeholder="$5,800,000"
            />
          </div>
          <div style={{ flex: 1, marginLeft: '8px' }}>
            <div className="goal-inp-label">Annual Target</div>
            <input
              className="goal-inp"
              value={teamAnnual}
              onChange={(e) => setTeamAnnualInput(e.target.value)}
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

// ═══════════════════════════════════════
// SHARE POPOVER (right-click quick share)
// ═══════════════════════════════════════

function SharePopover({ dealId, x, y, onClose }: { dealId: string; x: number; y: number; onClose: () => void }) {
  const qc = useQueryClient();

  const { data: deal } = useQuery({
    queryKey: ['deal', dealId],
    queryFn: async () => {
      const { data } = await dealApi.getDeal(dealId);
      return data as Deal;
    },
  });

  const { data: reps } = useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps({ activeOnly: 'true' });
      return ((data as any).reps || data) as Rep[];
    },
    staleTime: 60_000,
  });

  const shareMutation = useMutation({
    mutationFn: (data: any) => dealApi.shareDeal(dealId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['deal', dealId] });
    },
  });

  if (!deal || !reps) return null;

  const assistIds: string[] = (deal.assistingRepIds as string[]) || [];
  const availableReps = reps.filter((r) => r.id !== deal.assignedRepId && r.isActive !== false);

  function toggleRep(repId: string) {
    const newAssists = assistIds.includes(repId) ? assistIds.filter((id) => id !== repId) : [...assistIds, repId];
    shareMutation.mutate({ assistingRepIds: newAssists });
  }

  return (
    <>
      <div className="ctx-overlay" onClick={onClose} />
      <div className="ctx-menu" style={{ left: x, top: y, minWidth: 220, maxWidth: 280, padding: '8px 0' }}>
        <div
          style={{
            padding: '4px 12px 8px',
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--text-primary)',
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          Share this deal with:
        </div>
        {availableReps.map((rep) => {
          const isAssisting = assistIds.includes(rep.id);
          return (
            <button
              key={rep.id}
              className="ctx-item"
              onClick={() => toggleRep(rep.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '6px 12px',
                width: '100%',
                background: isAssisting ? 'rgba(74,158,232,0.1)' : undefined,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 9,
                  fontWeight: 700,
                  background: `${rep.avatarColor || '#6366f1'}2e`,
                  color: rep.avatarColor || '#6366f1',
                }}
              >
                {rep.initials || `${rep.firstName[0]}${rep.lastName?.[0] || ''}`}
              </div>
              <span style={{ flex: 1, textAlign: 'left' }}>
                {rep.firstName} {rep.lastName}
              </span>
              {isAssisting && <span style={{ color: 'var(--good)', fontSize: 12 }}>✓</span>}
            </button>
          );
        })}
        {assistIds.length > 0 && (
          <div
            style={{
              padding: '6px 12px',
              fontSize: 10,
              color: 'var(--info)',
              borderTop: '1px solid var(--border-primary)',
              marginTop: 4,
            }}
          >
            👥 Shared with {assistIds.length} rep{assistIds.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>
    </>
  );
}

function TransferOwnershipPopover({
  dealId,
  assignedRepId,
  x,
  y,
  onClose,
}: {
  dealId: string;
  assignedRepId: string;
  x: number;
  y: number;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data: reps } = useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps({ activeOnly: 'true' });
      return ((data as any).reps || data) as Rep[];
    },
    staleTime: 60_000,
  });

  const transferMutation = useMutation({
    mutationFn: (newRepId: string) => dealApi.shareDeal(dealId, { assignedRepId: newRepId }),
    onSuccess: () => {
      toast.success('Ownership transferred');
      qc.invalidateQueries({ queryKey: ['deals'] });
      qc.invalidateQueries({ queryKey: ['deal', dealId] });
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Transfer failed'),
  });

  if (!reps) return null;

  const availableReps = reps.filter((r) => r.id !== assignedRepId && r.isActive !== false);

  return (
    <>
      <div className="ctx-overlay" onClick={onClose} />
      <div className="ctx-menu" style={{ left: x, top: y, minWidth: 230, maxWidth: 300, padding: '8px 0' }}>
        <div
          style={{
            padding: '4px 12px 8px',
            fontSize: 11,
            fontWeight: 600,
            borderBottom: '1px solid var(--border-primary)',
          }}
        >
          Transfer ownership to:
        </div>
        {availableReps.map((rep) => (
          <button
            key={rep.id}
            className="ctx-item"
            onClick={() => transferMutation.mutate(rep.id)}
            disabled={transferMutation.isPending}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}
          >
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 9,
                fontWeight: 700,
                background: `${rep.avatarColor || '#64748b'}2e`,
                color: rep.avatarColor || '#64748b',
              }}
            >
              {rep.initials || `${rep.firstName[0]}${rep.lastName?.[0] || ''}`}
            </div>
            <span style={{ flex: 1, textAlign: 'left' }}>
              {rep.firstName} {rep.lastName}
            </span>
          </button>
        ))}
      </div>
    </>
  );
}

function DealHoverTooltip({ deal, x, y }: { deal: Deal; x: number; y: number }) {
  const { user } = useAuthStore();
  const assistIds = (deal.assistingRepIds as string[]) || [];
  const canViewContact =
    user?.role === 'ADMIN' ||
    user?.role === 'MANAGER' ||
    deal.assignedRepId === user?.id ||
    (!!user?.id && assistIds.includes(user.id));
  const notePreview = deal.notes?.trim() ? deal.notes.slice(0, 120) : 'No notes yet';
  const primaryName = deal.assignedRep
    ? `${deal.assignedRep.firstName} ${deal.assignedRep.lastName || ''}`.trim()
    : 'Unassigned';
  const primaryInit =
    deal.assignedRep?.initials ||
    primaryName
      .split(' ')
      .map((p) => p[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
  /* eslint-disable react-hooks/purity -- window/Date access safe in tooltip */
  const showBelow = typeof window !== 'undefined' ? y < window.innerHeight * 0.45 : false;
  const touchedDays = deal.lastActivityAt
    ? Math.max(0, Math.floor((Date.now() - new Date(deal.lastActivityAt).getTime()) / 86400000))
    : null;
  /* eslint-enable react-hooks/purity */
  const touchedLabel =
    touchedDays === null ? 'Touched recently' : touchedDays === 0 ? 'Touched today' : `Touched ${touchedDays}d ago`;

  return (
    <div
      style={{
        position: 'fixed',
        left: Math.min(Math.max(12, x - 140), (typeof window !== 'undefined' ? window.innerWidth : x) - 292),
        top: showBelow ? y + 14 : y - 14,
        transform: showBelow ? 'none' : 'translateY(-100%)',
        width: 280,
        maxWidth: 'calc(100vw - 24px)',
        background: 'var(--bg3)',
        border: '1px solid var(--border2)',
        borderRadius: 8,
        boxShadow: '0 12px 28px rgba(0,0,0,.38)',
        padding: '10px 11px',
        zIndex: 2500,
        pointerEvents: 'none',
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>{deal.client?.businessName || 'Unknown'}</div>
      {canViewContact && (
        <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4 }}>
          {[deal.client?.contactName, deal.client?.phone].filter(Boolean).join(' · ') || 'No contact'}
          {deal.client?.email ? ` · ${deal.client.email}` : ''}
        </div>
      )}
      {!canViewContact && <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 4 }}>Contact hidden</div>}
      <div style={{ fontSize: 10, marginBottom: 3 }}>
        <span style={{ color: 'var(--text3)' }}>Product: </span>
        <span>{deal.productType || '—'}</span>
      </div>
      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 4, lineHeight: 1.35 }}>
        <span style={{ color: 'var(--text3)' }}>Last note: </span>
        {notePreview}
      </div>
      <div style={{ fontSize: 10, color: 'var(--info)', marginBottom: 5 }}>{touchedLabel}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text2)' }}>
        <div
          style={{
            width: 18,
            height: 18,
            borderRadius: '50%',
            background: deal.assignedRep?.avatarColor || 'var(--gold)',
            color: '#fff',
            fontWeight: 700,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 8,
          }}
        >
          {primaryInit || '?'}
        </div>
        Primary rep: {primaryName}
      </div>
    </div>
  );
}

// ═══ IMPORT LEADS MODAL ═══
function ImportLeadsModal({ onClose, isAdmin, reps }: { onClose: () => void; isAdmin: boolean; reps: Rep[] }) {
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'add_to_existing'>('skip');
  const [assignToRepId, setAssignToRepId] = useState('');
  const [result, setResult] = useState<{
    imported: number;
    duplicates: number;
    skipped: number;
    total: number;
    errors: string[];
  } | null>(null);
  const qc = useQueryClient();

  const handleImport = async () => {
    if (!file) return;
    setImporting(true);
    try {
      const resp = await dealApi.importLeads(file, {
        duplicateMode,
        ...(isAdmin && assignToRepId ? { assignToRepId } : {}),
      });
      setResult(resp.data);
      qc.invalidateQueries({ queryKey: ['deals'] });
      toast.success(`Imported ${resp.data.imported} leads`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: 24,
          width: 420,
          maxWidth: '90vw',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          ⬆ Import Engaged / Interested Leads
        </div>
        <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 16 }}>
          Item 9 scope. Upload CSV contacts and create deals in Engaged / Interested.
        </div>

        {isAdmin && (
          <div
            style={{
              background: 'var(--surface2)',
              borderRadius: 8,
              padding: 10,
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 9,
                letterSpacing: '.08em',
                textTransform: 'uppercase',
                color: 'var(--info)',
                marginBottom: 6,
                fontWeight: 700,
              }}
            >
              Assign imported deals
            </div>
            <select
              value={assignToRepId}
              onChange={(e) => setAssignToRepId(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 8px',
                borderRadius: 6,
                border: '1px solid var(--border-primary)',
                background: 'var(--surface3)',
                color: 'var(--text)',
                fontSize: 11,
              }}
            >
              <option value="">Auto: assign to me</option>
              {reps.map((rep) => (
                <option key={rep.id} value={rep.id}>
                  {rep.firstName} {rep.lastName} ({rep.initials || '—'})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Format help */}
        <div
          style={{
            background: 'var(--surface2)',
            borderRadius: 8,
            padding: 10,
            marginBottom: 14,
            fontSize: 10,
            lineHeight: '18px',
            color: 'var(--muted)',
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--info)',
              marginBottom: 4,
              fontWeight: 700,
            }}
          >
            CSV Format (auto-detected)
          </div>
          <div>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>business_name</span> — required
          </div>
          <div>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>contact_name</span> — required
          </div>
          <div>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>phone</span> — required (duplicate detection + SMS)
          </div>
          <div>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>email</span>,{' '}
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>product_type</span>,{' '}
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>monthly_revenue</span>,{' '}
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>source</span>,{' '}
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>notes</span>,{' '}
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>next_action</span> — optional
          </div>
          <div>
            <span style={{ color: 'var(--text)', fontWeight: 600 }}>stage</span> — optional (defaults to
            Engaged/Interested)
          </div>
        </div>

        <div
          style={{
            background: 'var(--surface2)',
            borderRadius: 8,
            padding: 10,
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: 9,
              letterSpacing: '.08em',
              textTransform: 'uppercase',
              color: 'var(--info)',
              marginBottom: 6,
              fontWeight: 700,
            }}
          >
            Duplicate handling
          </div>
          <select
            value={duplicateMode}
            onChange={(e) => setDuplicateMode(e.target.value as 'skip' | 'add_to_existing')}
            style={{
              width: '100%',
              padding: '7px 8px',
              borderRadius: 6,
              border: '1px solid var(--border-primary)',
              background: 'var(--surface3)',
              color: 'var(--text)',
              fontSize: 11,
            }}
          >
            <option value="skip">Skip duplicates (same phone + active deal)</option>
            <option value="add_to_existing">Create a new deal on existing client</option>
          </select>
        </div>

        {/* Drop zone */}
        <div
          style={{
            border: '2px dashed var(--border-primary)',
            borderRadius: 8,
            padding: 20,
            textAlign: 'center',
            cursor: 'pointer',
            marginBottom: 14,
            transition: 'border-color 0.2s',
            background: file ? 'rgba(74,158,232,0.05)' : undefined,
          }}
          onClick={() => {
            const inp = document.createElement('input');
            inp.type = 'file';
            inp.accept = '.csv';
            inp.onchange = () => {
              if (inp.files?.[0]) setFile(inp.files[0]);
            };
            inp.click();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f?.name.endsWith('.csv')) setFile(f);
          }}
        >
          <div style={{ fontSize: 24, marginBottom: 4 }}>{file ? '✅' : '📄'}</div>
          <div style={{ fontSize: 11, color: 'var(--text)', fontWeight: 600 }}>
            {file ? file.name : 'Drop CSV here or click to browse'}
          </div>
          <div style={{ fontSize: 10, color: 'var(--muted)' }}>
            {file ? `${(file.size / 1024).toFixed(1)} KB` : '.csv files only'}
          </div>
        </div>

        {/* Results */}
        {result && (
          <div
            style={{
              background: 'rgba(58,185,122,0.08)',
              border: '1px solid var(--good)',
              borderRadius: 8,
              padding: 10,
              marginBottom: 14,
              fontSize: 11,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--good)', marginBottom: 4 }}>Import Complete</div>
            <div>
              ✅ Imported: {result.imported} &nbsp; 🔄 Duplicates: {result.duplicates} &nbsp; ⏭ Skipped:{' '}
              {result.skipped}
            </div>
            {result.errors.length > 0 && (
              <div style={{ marginTop: 4, fontSize: 10, color: 'var(--muted)' }}>
                {result.errors.slice(0, 5).map((e, i) => (
                  <div key={i}>⚠ {e}</div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '8px 16px',
              borderRadius: 6,
              border: '1px solid var(--border-primary)',
              background: 'var(--surface2)',
              color: 'var(--text)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleImport}
              disabled={!file || importing}
              style={{
                padding: '8px 20px',
                borderRadius: 6,
                border: 'none',
                background: !file || importing ? 'var(--surface3)' : 'var(--cta)',
                color: !file || importing ? 'var(--muted)' : '#fff',
                fontSize: 12,
                fontWeight: 700,
                cursor: !file || importing ? 'not-allowed' : 'pointer',
              }}
            >
              {importing ? 'Importing…' : 'Import Leads'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ═══ ADD OFFER / NEW PRODUCT MODAL ═══
const PRODUCT_TYPES = ['MCA', 'LOC', 'EQUIPMENT', 'HELOC', 'SBA', 'CRE', 'BRIDGE'] as const;

function AddOfferModal({
  dealId,
  businessName,
  existingProductType,
  clientId,
  assignedRepId,
  onClose,
}: {
  dealId: string;
  businessName?: string;
  existingProductType?: string;
  clientId?: string;
  assignedRepId?: string;
  onClose: () => void;
}) {
  const [step, setStep] = useState<'product' | 'offer'>(existingProductType ? 'product' : 'product');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [lenderName, setLenderName] = useState('');
  const [amount, setAmount] = useState('');
  const [termMonths, setTermMonths] = useState('');
  const [rateOrFactor, setRateOrFactor] = useState('');
  const [expiryDays, setExpiryDays] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const qc = useQueryClient();

  // Same product = add offer to existing deal; different product = create new deal + offer
  const isSameProduct = selectedProduct && existingProductType && selectedProduct === existingProductType;

  const handleSelectProduct = (pt: string) => {
    setSelectedProduct(pt);
    setStep('offer');
  };

  const handleSubmit = async () => {
    if (!lenderName || !amount || !termMonths || !rateOrFactor) return;
    setSaving(true);
    try {
      const offerAmount = parseFloat(amount.replace(/[$,]/g, ''));
      const parsedTermMonths = parseInt(String(termMonths), 10);
      const parsedRate = parseFloat(String(rateOrFactor).replace(/[^0-9.]/g, ''));
      const offerPayload = {
        lenderName: lenderName.trim(),
        amount: offerAmount,
        termMonths: Number.isFinite(parsedTermMonths) ? parsedTermMonths : undefined,
        rateFactor: Number.isFinite(parsedRate) ? parsedRate : undefined,
        terms: `${termMonths} mo · ${rateOrFactor}` + (notes.trim() ? ` · ${notes.trim()}` : ''),
        expiryDays: expiryDays || undefined,
        notes: notes.trim() || undefined,
        productType: selectedProduct,
      };

      if (isSameProduct) {
        // Add offer to existing deal
        await dealApi.addOffer(dealId, offerPayload);
        toast.success('Offer added to existing deal');
      } else {
        // Create new deal for same client, then add offer
        const { data: newDeal } = await dealApi.createDeal({
          clientId,
          productType: selectedProduct,
          dealAmount: offerAmount,
          assignedRepId,
        });
        await dealApi.addOffer(newDeal.id, offerPayload);
        toast.success(`New ${selectedProduct} deal created with offer`);
      }
      qc.invalidateQueries({ queryKey: ['deals'] });
      onClose();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    borderRadius: 6,
    border: '1px solid var(--border-primary)',
    background: 'var(--surface2)',
    color: 'var(--text)',
    fontSize: 12,
    outline: 'none',
  };

  const productEmoji: Record<string, string> = {
    MCA: PRODUCT_ICONS.MCA,
    LOC: PRODUCT_ICONS.LOC,
    EQUIPMENT: PRODUCT_ICONS.EQUIPMENT,
    HELOC: PRODUCT_ICONS.HELOC,
    SBA: PRODUCT_ICONS.SBA,
    CRE: PRODUCT_ICONS.CRE,
    BRIDGE: '🌉',
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border-primary)',
          borderRadius: 12,
          padding: 24,
          width: 420,
          maxWidth: '90vw',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          💰 {businessName || 'Add Offer'}
        </div>

        {step === 'product' ? (
          <>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 14 }}>
              What type of offer did you receive?
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PRODUCT_TYPES.map((pt) => (
                <button
                  key={pt}
                  onClick={() => handleSelectProduct(pt)}
                  style={{
                    padding: '10px 8px',
                    borderRadius: 8,
                    border: '1px solid var(--border-primary)',
                    background: 'var(--surface2)',
                    color: 'var(--text)',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    justifyContent: 'center',
                    transition: 'all 0.15s',
                  }}
                  onMouseEnter={(e) => {
                    (e.target as HTMLElement).style.borderColor = 'var(--cta)';
                    (e.target as HTMLElement).style.background = 'rgba(74,158,232,0.08)';
                  }}
                  onMouseLeave={(e) => {
                    (e.target as HTMLElement).style.borderColor = 'var(--border-primary)';
                    (e.target as HTMLElement).style.background = 'var(--surface2)';
                  }}
                >
                  {productEmoji[pt] || ''} {pt}
                </button>
              ))}
            </div>
            {existingProductType && (
              <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 10, textAlign: 'center' }}>
                Current deal product: <strong>{existingProductType}</strong> — same product adds to this deal, different
                creates new deal
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 14 }}>
              <button
                onClick={onClose}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 6 }}>
              {isSameProduct
                ? `Adding offer to existing ${selectedProduct} deal`
                : `Creating new ${selectedProduct} deal for ${businessName || 'this client'}`}
            </div>
            <div
              style={{
                fontSize: 10,
                padding: '6px 10px',
                borderRadius: 6,
                marginBottom: 12,
                background: isSameProduct ? 'rgba(58,185,122,0.08)' : 'rgba(74,158,232,0.08)',
                color: isSameProduct ? 'var(--good)' : 'var(--info)',
                fontWeight: 600,
              }}
            >
              {isSameProduct
                ? '📋 Same product → offer added to existing deal'
                : '🆕 Different product → new deal will be created'}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <label
                  style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3, display: 'block' }}
                >
                  Lender Name *
                </label>
                <input
                  value={lenderName}
                  onChange={(e) => setLenderName(e.target.value)}
                  style={inputStyle}
                  placeholder="e.g. OnDeck, Rapid Finance"
                />
              </div>
              <div>
                <label
                  style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3, display: 'block' }}
                >
                  Offer Amount *
                </label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  style={inputStyle}
                  placeholder="50000"
                  type="number"
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label
                    style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3, display: 'block' }}
                  >
                    Term (months) *
                  </label>
                  <input
                    value={termMonths}
                    onChange={(e) => setTermMonths(e.target.value)}
                    style={inputStyle}
                    placeholder="12"
                    type="number"
                  />
                </div>
                <div>
                  <label
                    style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3, display: 'block' }}
                  >
                    Rate / Factor *
                  </label>
                  <input
                    value={rateOrFactor}
                    onChange={(e) => setRateOrFactor(e.target.value)}
                    style={inputStyle}
                    placeholder="1.29 factor or 7.2%"
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label
                    style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3, display: 'block' }}
                  >
                    Expiry (days)
                  </label>
                  <input
                    value={expiryDays}
                    onChange={(e) => setExpiryDays(e.target.value)}
                    style={inputStyle}
                    placeholder="7"
                    type="number"
                  />
                </div>
                <div>
                  <label
                    style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginBottom: 3, display: 'block' }}
                  >
                    Notes
                  </label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    style={inputStyle}
                    placeholder="Optional offer context"
                  />
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button
                onClick={() => {
                  setStep('product');
                  setSelectedProduct('');
                }}
                style={{
                  padding: '8px 16px',
                  borderRadius: 6,
                  border: '1px solid var(--border-primary)',
                  background: 'var(--surface2)',
                  color: 'var(--text)',
                  fontSize: 12,
                  cursor: 'pointer',
                }}
              >
                ← Back
              </button>
              <button
                onClick={handleSubmit}
                disabled={saving || !lenderName || !amount || !termMonths || !rateOrFactor}
                style={{
                  padding: '8px 20px',
                  borderRadius: 6,
                  border: 'none',
                  background:
                    saving || !lenderName || !amount || !termMonths || !rateOrFactor ? 'var(--surface3)' : 'var(--cta)',
                  color: saving || !lenderName || !amount || !termMonths || !rateOrFactor ? 'var(--muted)' : '#fff',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: saving ? 'not-allowed' : 'pointer',
                }}
              >
                {saving ? 'Saving…' : isSameProduct ? 'Add Offer' : `Create ${selectedProduct} Deal`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
