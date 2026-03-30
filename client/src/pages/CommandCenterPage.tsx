import { useQuery, useQueryClient } from '@tanstack/react-query';
import { commandCenterApi, repApi, dealApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import type { CommandCenterMetrics, Rep, Deal } from '../types';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import '../styles/command-center.css';

// ── Helpers ──

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  ENGAGED_INTERESTED: 'Engaged / Interested',
  QUALIFIED: 'Qualified',
  SUBMITTED_IN_REVIEW: 'Submitted (In Review)',
  APPROVED_OFFERS: 'Approved / Offers',
  COMMITTED_FUNDING: 'Committed (Funding)',
  FUNDED: 'Funded',
  NURTURE: 'Nurture',
  CLOSED: 'Closed',
};

const PM_COLORS: Record<string, string> = {
  MCA: '#c9a227',
  SBA: '#4a9eff',
  EQUIPMENT: '#3fb950',
  HELOC: '#a371f7',
  LOC: '#4a9eff',
  CRE: '#e07b54',
  BRIDGE: '#64b5d4',
  OTHER: '#666',
};

function fmtCurrency(n: number | null | undefined): string {
  if (n == null) return '$0';
  if (n >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
  if (n >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
  return '$' + Math.round(n);
}

function timeAgo(d: string | null | undefined): string {
  if (!d) return 'never';
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  return days + 'd ago';
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

const REP_COLORS: Record<string, string> = {
  JB: 'var(--gold)', SB: '#3fb950', MC: '#e07b54', AN: '#a371f7',
  AR: '#4a9eff', HB: '#64b5d4', JJ: '#c9a227',
};

function repAvatarColor(initials: string): string {
  return REP_COLORS[initials] || 'var(--faint)';
}

function getActionButtonStyle(action: string): string {
  switch (action) {
    case 'Call Now':
      return 'oqa-call';
    case 'Send Offer':
      return 'oqa-offer';
    case 'Follow Up':
      return 'oqa-follow';
    case 'Request Docs':
      return 'oqa-docs';
    default:
      return 'oqa-follow';
  }
}

function getExecColor(score: number): string {
  if (score >= 70) return 'var(--green2)';
  if (score >= 40) return 'var(--amber)';
  return 'var(--red)';
}

function getExecClass(score: number): string {
  if (score >= 70) return 'strong';
  if (score >= 40) return 'mid';
  return 'weak';
}

// ── Counter animation hook ──

function useCounterAnimation(target: number, duration = 1200): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    if (target === prevTarget.current) return;
    prevTarget.current = target;
    const start = performance.now();
    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }, [target, duration]);

  return value;
}

// ── Live clock hook ──

function useClock(): string {
  const [time, setTime] = useState('');
  useEffect(() => {
    function tick() {
      setTime(
        new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true,
        }) + ' ET',
      );
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return time;
}

// ── Types for API responses ──

interface ExecScore {
  id: string;
  initials: string;
  avatarColor?: string;
  firstName: string;
  lastName?: string;
  score: number;
  completed: number;
  assigned: number;
  overdue: number;
  touchedToday?: number;
}

interface RepActivity {
  id: string;
  name: string;
  initials: string;
  avatarColor?: string;
  status: string;
  lastTouch: string | null;
  dealsAtRisk: number;
  overdueCount: number;
  fundedMTD: number;
  pipelineValue: number;
  committedValue: number;
  activeDeals: number;
  monthlyGoal?: number;
  submittedCount: number;
  fundedCount: number;
}

interface Bottleneck {
  stage: string;
  count: number;
  value: number;
  reps: Record<string, number>;
}

interface StageSnapshot {
  stage: string;
  label: string;
  count: number;
  volume: number;
  hideDollar: boolean;
}

interface FunnelStep {
  stage: string;
  label: string;
  count: number;
  rate: number;
}

interface IntelligenceData {
  bottlenecks: Bottleneck[];
  repActivity: RepActivity[];
  stageSnapshot: StageSnapshot[];
  conversionFunnel: FunnelStep[];
  pipelineHealth: { withNextAction: number; touched48h: number; properlyStaged: number; totalDeals?: number; withNextActionCount?: number; touchedRecentlyCount?: number };
}

interface ProductMixItem {
  type: string;
  amount: number;
  count: number;
  percentage: number;
}

interface ProductMixData {
  products: ProductMixItem[];
  total: number;
  repBreakdown: Array<{
    id: string;
    name: string;
    initials: string;
    funded: number;
    mix: Array<{ type: string; amount: number; percentage: number; vsTeam: number }>;
  }>;
}

interface SmsMetricsData {
  sent24h: number;
  delivered24h: number;
  totalLeads: number;
  replyRate7d: number;
  errorRate: number;
  activeAutomations: number;
}

interface ActivityEvent {
  id: string;
  eventType: string;
  note?: string;
  fromStage?: string;
  toStage?: string;
  createdAt: string;
  deal?: { id: string; client?: { businessName: string }; stage: string };
  rep?: { id: string; firstName: string; lastName: string; initials: string };
}

interface QueueDeal extends Deal {
  primaryAction: string;
  stageLabel: string;
}

// ══════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════

export default function CommandCenterPage() {
  const { user } = useAuthStore();
  const clock = useClock();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const userIsAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [activeView, setActiveView] = useState<string>(userIsAdmin ? 'admin' : user?.id || 'admin');
  const [execPopupOpen, setExecPopupOpen] = useState<string | null>(null);
  const [execDropdownOpen, setExecDropdownOpen] = useState(false);
  const [repTableSort, setRepTableSort] = useState<{ col: string; asc: boolean }>({ col: 'funded', asc: false });
  const [pmPeriod, setPmPeriod] = useState<'lifetime' | '30d'>('lifetime');
  const [clockMs, setClockMs] = useState(0);
  const [csvModalOpen, setCsvModalOpen] = useState(false);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvAssignRep, setCsvAssignRep] = useState<string>('');
  const [lastImportBatch, setLastImportBatch] = useState<{ batchId: string; count: number } | null>(null);
  const [rrqIndex, setRrqIndex] = useState(0);
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [actionToast, setActionToast] = useState<{ title: string; text: string } | null>(null);
  const actionToastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showActionToast = useCallback((title: string, text: string) => {
    if (actionToastTimer.current) clearTimeout(actionToastTimer.current);
    setActionToast({ title, text });
    actionToastTimer.current = setTimeout(() => setActionToast(null), 3200);
  }, []);

  useEffect(() => {
    function tick() {
      setClockMs(Date.now());
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, []);

  // Close exec dropdown/popup on outside click
  const execBarRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!execDropdownOpen && !execPopupOpen) return;
    const handler = (e: MouseEvent) => {
      if (execBarRef.current && !execBarRef.current.contains(e.target as Node)) {
        setExecDropdownOpen(false);
        setExecPopupOpen(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [execDropdownOpen, execPopupOpen]);

  const sliderRef = useRef<HTMLDivElement>(null);
  const rswRef = useRef<HTMLDivElement>(null);

  const repIdParam = activeView === 'admin' ? undefined : activeView;

  // ── Data queries ──

  const { data: reps } = useQuery<Rep[]>({
    queryKey: ['reps'],
    queryFn: async () => (await repApi.getReps()).data,
    staleTime: 60000,
  });

  const { data: metrics } = useQuery<CommandCenterMetrics>({
    queryKey: ['cc-metrics', repIdParam],
    queryFn: async () => (await commandCenterApi.getMetrics(repIdParam ? { repId: repIdParam } : undefined)).data,
    refetchInterval: 30000,
  });

  const { data: execScores } = useQuery<ExecScore[]>({
    queryKey: ['cc-exec-scores'],
    queryFn: async () => (await commandCenterApi.getExecutionScores()).data,
    staleTime: 30000,
  });

  const { data: operatorQueue } = useQuery<QueueDeal[]>({
    queryKey: ['cc-operator-queue', repIdParam],
    queryFn: async () => (await commandCenterApi.getOperatorQueue(repIdParam ? { repId: repIdParam } : undefined)).data,
    refetchInterval: 30000,
  });

  const { data: hotLeads } = useQuery<Deal[]>({
    queryKey: ['cc-hot-leads', repIdParam],
    queryFn: async () => (await commandCenterApi.getHotLeads(repIdParam ? { repId: repIdParam } : undefined)).data,
    refetchInterval: 30000,
  });

  const { data: staleDeals } = useQuery<Deal[]>({
    queryKey: ['cc-stale-deals', repIdParam],
    queryFn: async () => (await commandCenterApi.getStaleDeals(repIdParam ? { repId: repIdParam } : undefined)).data,
    refetchInterval: 30000,
  });

  const { data: overdueTasks } = useQuery<Deal[]>({
    queryKey: ['cc-overdue-tasks'],
    queryFn: async () => (await commandCenterApi.getOverdueTasks()).data,
    refetchInterval: 30000,
  });

  const { data: intelligence } = useQuery<IntelligenceData>({
    queryKey: ['cc-intelligence'],
    queryFn: async () => (await commandCenterApi.getIntelligence()).data,
    enabled: activeView === 'admin' && userIsAdmin,
    staleTime: 30000,
  });

  const { data: productMix } = useQuery<ProductMixData>({
    queryKey: ['cc-product-mix', repIdParam, pmPeriod],
    queryFn: async () =>
      (
        await commandCenterApi.getProductMix({
          ...(repIdParam ? { repId: repIdParam } : {}),
          ...(pmPeriod === '30d' ? { period: '30d' } : {}),
        })
      ).data,
    staleTime: 30000,
  });

  const { data: activityFeed } = useQuery<ActivityEvent[]>({
    queryKey: ['cc-activity-feed', repIdParam],
    queryFn: async () => (await commandCenterApi.getActivityFeed(repIdParam ? { repId: repIdParam } : undefined)).data,
    refetchInterval: 15000,
  });

  const { data: smsMetrics } = useQuery<SmsMetricsData>({
    queryKey: ['cc-sms-metrics'],
    queryFn: async () => (await commandCenterApi.getSmsMetrics()).data,
    staleTime: 60000,
  });

  const { data: reviveQueue } = useQuery<Deal[]>({
    queryKey: ['cc-revive-queue'],
    queryFn: async () => (await dealApi.getReviveQueue()).data,
    staleTime: 30000,
  });

  // ── Animated values ──

  const animatedFunded = useCounterAnimation(metrics?.fundedMTD ?? 0);

  // ── View helpers ──

  const isAdmin = activeView === 'admin';
  const displayReps = useMemo(() => {
    const active = (reps || []).filter((r) => r.isActive);
    // Sort: ADMIN users first (JB), then REPs alphabetically
    return active.sort((a, b) => {
      if (a.role === 'ADMIN' && b.role !== 'ADMIN') return -1;
      if (a.role !== 'ADMIN' && b.role === 'ADMIN') return 1;
      return a.firstName.localeCompare(b.firstName);
    });
  }, [reps]);

  useEffect(() => {
    if (activeView !== 'admin' && (displayReps.length === 0 || !displayReps.some((r) => r.id === activeView))) {
      if (userIsAdmin) {
        setActiveView('admin');
      } else if (displayReps.length > 0) {
        // REP user: find their own rep entry, or fallback to first rep
        const ownRep = displayReps.find((r) => r.id === user?.id);
        setActiveView(ownRep?.id || displayReps[0].id);
      }
    }
  }, [activeView, displayReps, userIsAdmin, user?.id]);

  const activeRep = useMemo(() => {
    if (isAdmin || displayReps.length === 0) return null;
    return displayReps.find((r) => r.id === activeView) ?? null;
  }, [isAdmin, activeView, displayReps]);

  const activeRepInitials = activeRep
    ? activeRep.initials || (activeRep.firstName[0] + activeRep.lastName[0]).toUpperCase()
    : '';

  // Position slider
  useEffect(() => {
    if (!rswRef.current || !sliderRef.current) return;
    const buttons = rswRef.current.querySelectorAll<HTMLButtonElement>('.rb');
    let activeBtn: HTMLButtonElement | null = null;
    buttons.forEach((b) => {
      if (b.classList.contains('on')) activeBtn = b;
    });
    if (activeBtn) {
      const pr = rswRef.current.getBoundingClientRect();
      const br = (activeBtn as HTMLButtonElement).getBoundingClientRect();
      sliderRef.current.style.left = br.left - pr.left + 'px';
      sliderRef.current.style.width = br.width + 'px';
    }
  }, [activeView]);

  const handleViewSwitch = useCallback((viewId: string) => {
    setActiveView(viewId);
    setPmPeriod('lifetime');
  }, []);

  // ── Stale revenue ──

  const staleRevenue = useMemo(() => {
    if (!staleDeals) return 0;
    return staleDeals
      .filter((d) => ['APPROVED_OFFERS', 'COMMITTED_FUNDING', 'SUBMITTED_IN_REVIEW'].includes(d.stage))
      .reduce((s, d) => s + (d.dealAmount || 0), 0);
  }, [staleDeals]);

  const daysLeft = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate();

  // ── Find selected deal from all data sources ──
  const selectedDeal = useMemo(() => {
    if (!selectedDealId) return null;
    const allDeals: Deal[] = [
      ...(operatorQueue || []),
      ...(hotLeads || []),
      ...(staleDeals || []),
      ...(overdueTasks || []),
      ...(reviveQueue || []),
    ];
    return allDeals.find((d) => d.id === selectedDealId) || null;
  }, [selectedDealId, operatorQueue, hotLeads, staleDeals, overdueTasks, reviveQueue]);

  // ══════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════

  return (
    <div className="cc-root" style={{ background: 'var(--bg)', minHeight: '100vh' }}>
      {/* TOPBAR */}
      <div className="topbar">
        <span className="cc-title-label">Command Center</span>
        <div className="tb-right">
          <span className={`role-label ${isAdmin ? 'rl-admin' : 'rl-rep'}`}>
            {isAdmin
              ? `Operator Mode — ${user?.firstName?.[0] ?? ''}${user?.lastName?.[0] ?? ''}`
              : `Rep View — ${activeRepInitials} Only`}
          </span>

          {/* Execution Score Bar */}
          {execScores &&
            execScores.length > 0 &&
            (() => {
              const ESB_VISIBLE = 3;
              const visible = execScores.slice(0, ESB_VISIBLE);
              const overflow = execScores.slice(ESB_VISIBLE);
              const avgScore = Math.round(execScores.reduce((s, e) => s + e.score, 0) / execScores.length);
              return (
                <div className="exec-score-bar esb-wrap" ref={execBarRef} style={{ position: 'relative' }}>
                  <span className="esb-label">Execution</span>
                  {visible.map((es) => (
                    <div
                      key={es.id}
                      className="esb-rep"
                      style={{ cursor: 'pointer' }}
                      onClick={() => setExecPopupOpen(execPopupOpen === es.id ? null : es.id)}
                    >
                      <span className="esb-init">{es.initials}</span>
                      <div className="esb-track">
                        <div
                          className="esb-fill"
                          style={{ width: es.score + '%', background: getExecColor(es.score) }}
                        />
                      </div>
                      <span className={`esb-pct ${getExecClass(es.score)}`}>{es.score}%</span>
                    </div>
                  ))}
                  {overflow.length > 0 && (
                    <button
                      className="esb-more-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExecDropdownOpen(!execDropdownOpen);
                      }}
                    >
                      +{overflow.length}
                      <span className={`esb-pct ${getExecClass(avgScore)}`} style={{ marginLeft: 3 }}>
                        avg {avgScore}%
                      </span>
                    </button>
                  )}
                  {/* Overflow dropdown */}
                  {execDropdownOpen && overflow.length > 0 && (
                    <div className="esb-dropdown" onClick={(e) => e.stopPropagation()}>
                      <div className="esb-dd-head">
                        <span>All Reps ({execScores.length})</span>
                        <button className="esb-dd-close" onClick={() => setExecDropdownOpen(false)}>
                          {'✕'}
                        </button>
                      </div>
                      {execScores.map((es) => (
                        <div
                          key={es.id}
                          className="esb-dd-row"
                          onClick={() => {
                            setExecPopupOpen(execPopupOpen === es.id ? null : es.id);
                          }}
                        >
                          <span className="esb-dd-init">{es.initials}</span>
                          <span className="esb-dd-name">{es.firstName}</span>
                          <div className="esb-track" style={{ flex: 1 }}>
                            <div
                              className="esb-fill"
                              style={{ width: es.score + '%', background: getExecColor(es.score) }}
                            />
                          </div>
                          <span className={`esb-pct ${getExecClass(es.score)}`}>{es.score}%</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {execPopupOpen && execScores.find((e) => e.id === execPopupOpen) && (
                    <ExecPopup
                      data={execScores.find((e) => e.id === execPopupOpen)!}
                      onClose={() => setExecPopupOpen(null)}
                    />
                  )}
                </div>
              );
            })()}

          {/* Role Switch */}
          <div className="rsw" ref={rswRef}>
            <div className="rsw-slider" ref={sliderRef} />
            {userIsAdmin && (
              <button className={`rb ${isAdmin ? 'on on-admin' : ''}`} onClick={() => handleViewSwitch('admin')}>
                Admin
              </button>
            )}
            {displayReps.filter(r => userIsAdmin || r.id === user?.id).map((rep) => (
              <button
                key={rep.id}
                className={`rb ${activeView === rep.id ? 'on' : ''}`}
                onClick={() => handleViewSwitch(rep.id)}
              >
                Rep ({rep.initials || (rep.firstName[0] + rep.lastName[0]).toUpperCase()})
              </button>
            ))}
          </div>

          <div className="live-pip">
            <div className="lpd" />
            LIVE
          </div>
          <span className="clk">{clock}</span>
          <button className="add-btn" onClick={() => navigate('/pipeline?newDeal=1')}>
            + Add Lead
          </button>
          {userIsAdmin && (
            <button className="add-btn csv-import-btn" onClick={() => setCsvModalOpen(true)}>
              ⬆ Import CSV
            </button>
          )}
        </div>
      </div>

      {/* PAGE */}
      <div className="page">
        {/* ADMIN VIEW */}
        {isAdmin && (
          <div className="view on">
            {/* Money Zone */}
            <div className="zone">
              <div className="zd" style={{ background: 'var(--gold)' }} />
              Money Zone — Team-Wide
            </div>

            {/* Hero */}
            <div className="hero">
              <div className="hero-g">
                <div>
                  <div className="h-eyebrow">{getGreeting()}</div>
                  <div className="h-name">
                    {user?.firstName} {user?.lastName}
                  </div>
                  <div className="h-sub">
                    Admin · All Reps ·{' '}
                    {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <div>
                  <div className="funded-lbl">
                    Total Funded MTD — all reps · stage = &quot;Funded&quot; · current month
                  </div>
                  <div className="funded-n">{fmtCurrency(Math.round(animatedFunded))}</div>
                  <div className="funded-meta">
                    {metrics?.fundedDealCount ?? 0} deals · {metrics?.fundedRepCount ?? 0} reps · {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} · real-time from
                    pipeline
                  </div>
                  <div className="prog">
                    <div className="prog-top">
                      <span className="prog-goal">
                        Team Goal: {(metrics?.monthlyGoal ?? 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} · {daysLeft} days remaining in {new Date().toLocaleDateString('en-US', { month: 'long' })}
                      </span>
                      <span className="prog-pct">{Math.round(metrics?.goalProgress ?? 0)}%</span>
                    </div>
                    <div className="prog-track">
                      <div
                        className="prog-fill"
                        style={{
                          width: Math.min(metrics?.goalProgress ?? 0, 100) + '%',
                        }}
                      />
                    </div>
                    <div className="prog-row2">
                      <span className="proj">
                        Projected month-end: <span className="proj-hi">{fmtCurrency(metrics?.projectedMonthEnd)}</span>{' '}
                        · based on current daily pace
                      </span>
                      <span className="proj-need">
                        Need{' '}
                        {fmtCurrency(
                          Math.max(
                            0,
                            ((metrics?.monthlyGoal ?? 0) - (metrics?.fundedMTD ?? 0)) / Math.max(1, daysLeft),
                          ),
                        )}
                        /day to hit goal
                      </span>
                    </div>
                  </div>
                </div>
                <div className="hboxes">
                  <div className="hbox">
                    <div className="hbl">Pipeline Value</div>
                    <div className="hbv">{fmtCurrency(metrics?.pipelineValue)}</div>
                    <div className="hbs">Approved + Committed + Nurture</div>
                  </div>
                  <div className="hbox">
                    <div className="hbl">Lifetime Funded</div>
                    <div className="hbv" style={{ color: 'var(--gold)' }}>
                      {fmtCurrency(metrics?.lifetimeFunded)}
                    </div>
                    <div className="hbs">all clients</div>
                  </div>
                  <div className="hbox">
                    <div className="hbl">Renewals Due</div>
                    <div className="hbv" style={{ color: 'var(--amber)' }}>
                      {metrics?.renewalsDue ?? 0}
                    </div>
                    <div className="hbs">within 30 days</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Scorecards + Future Opps */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) 180px', gap: 8 }}>
              <div className="sc tg">
                <div className="scl">Funded MTD</div>
                <div className="scv gold">{fmtCurrency(metrics?.fundedMTD)}</div>
                <div className="scd">
                  Goal: {fmtCurrency(metrics?.monthlyGoal)} · {Math.round(metrics?.goalProgress ?? 0)}%
                </div>
              </div>
              <div className="sc tp">
                <div className="scl">Pipeline Value</div>
                <div className="scv purple">{fmtCurrency(metrics?.pipelineValue)}</div>
                <div className="scd up">Approved {fmtCurrency(metrics?.atRisk)} + Nurture prior offers</div>
              </div>
              <div className="sc" style={{ borderTop: '1px solid var(--green2)' }}>
                <div className="scl">Committed (Funding)</div>
                <div className="scv green">{fmtCurrency(metrics?.committedValue)}</div>
                <div className="scd">Client accepted · closing in progress</div>
              </div>
              <div className="sc tor">
                <div className="scl">At Risk</div>
                <div className="scv orange">{fmtCurrency(metrics?.atRisk)}</div>
                <div className="scd dn">{metrics?.overdueCount ?? 0} approved offers · expiring soon</div>
              </div>
              <div className="future-opps">
                <div className="fo-label">Future Opportunities</div>
                <div
                  style={{
                    fontSize: 7,
                    color: 'var(--muted)',
                    marginBottom: 6,
                    lineHeight: 1.4,
                  }}
                >
                  Scheduled follow-ups &amp; renewals expected to re-enter pipeline
                </div>
                <div className="fo-rows">
                  <div className="fo-row">
                    <span className="fo-lbl">Next 7 days</span>
                    <div style={{ textAlign: 'right' }}>
                      <div className="fo-val" style={{ fontSize: 11 }}>
                        {fmtCurrency(metrics?.futureNext7Value)}
                      </div>
                      <div style={{ fontSize: 7, color: 'var(--muted)' }}>{metrics?.futureNext7 ?? 0} deals</div>
                    </div>
                  </div>
                  <div className="fo-row">
                    <span className="fo-lbl">Next 30 days</span>
                    <div style={{ textAlign: 'right' }}>
                      <div className="fo-val" style={{ fontSize: 11 }}>
                        {fmtCurrency(metrics?.futureNext30Value)}
                      </div>
                      <div style={{ fontSize: 7, color: 'var(--muted)' }}>{metrics?.futureNext30 ?? 0} deals</div>
                    </div>
                  </div>
                </div>
                <div className="fo-total">
                  <span className="fo-total-lbl">Total scheduled</span>
                  <span className="fo-total-val">{fmtCurrency((metrics?.futureNext7Value ?? 0) + (metrics?.futureNext30Value ?? 0))}</span>
                </div>
              </div>
            </div>

            {/* Risk Banner */}
            {(metrics?.atRisk ?? 0) > 0 && (
              <div className="risk-banner">
                <div className="rb-left">
                  <div className="rb-icon">{'⚠'}</div>
                  <div>
                    <div className="rb-title">System Revenue at Risk</div>
                    <div className="rb-sub">
                      Approved + Committed deals only · overdue next actions · stalled activity · source: last_activity_at on offers only
                    </div>
                  </div>
                </div>
                <div className="rb-right">
                  <div className="rb-stat">
                    <div className="rb-val">{fmtCurrency(metrics?.atRisk)}</div>
                    <div className="rb-lbl">Approved offers at risk</div>
                  </div>
                  <div className="rb-stat">
                    <div className="rb-val">{metrics?.overdueCount ?? 0}</div>
                    <div className="rb-lbl">Overdue tasks</div>
                  </div>
                  <div className="rb-stat">
                    <div className="rb-val">{metrics?.noNextAction ?? 0}</div>
                    <div className="rb-lbl">No next action</div>
                  </div>
                  <div className="rb-stat">
                    <div className="rb-val">{metrics?.idleRepsCount ?? 0}</div>
                    <div className="rb-lbl">Idle reps (24h)</div>
                  </div>
                </div>
              </div>
            )}

            {/* Execution Zone */}
            <div className="zone">
              <div className="zd" style={{ background: 'var(--orange)' }} />
              Execution Zone — Operator Tools
            </div>

            <OperatorQueue deals={operatorQueue} isAdmin onDealClick={(id) => setSelectedDealId(id)} onToast={showActionToast} />

            <div className="g3">
              <PriorityCard
                type="hot"
                title="Hot Leads"
                subtitle="System-wide · immediate action"
                deals={hotLeads}
                count={metrics?.hotCount ?? hotLeads?.length ?? 0}
                onDealClick={(id) => setSelectedDealId(id)}
                onToast={showActionToast}
              />
              <PriorityCard
                type="stale"
                title="Stale Deals"
                subtitle="last_activity_at < now - 24h"
                deals={staleDeals}
                count={metrics?.staleCount ?? staleDeals?.length ?? 0}
                riskValue={staleRevenue}
                onDealClick={(id) => setSelectedDealId(id)}
                onToast={showActionToast}
              />
              <PriorityCard
                type="over"
                title="Overdue Tasks"
                subtitle="next_action_due_date < now"
                deals={overdueTasks}
                count={metrics?.overdueCount ?? overdueTasks?.length ?? 0}
                onDealClick={(id) => setSelectedDealId(id)}
                onToast={showActionToast}
              />
            </div>

            {reviveQueue && reviveQueue.length > 0 && (
              <RenewalQueueCard deals={reviveQueue} index={rrqIndex} onNav={setRrqIndex} />
            )}

            {/* Intelligence Zone */}
            <div className="zone">
              <div className="zd" style={{ background: 'var(--muted)' }} />
              Intelligence Zone — Operator Oversight
            </div>

            {intelligence && (
              <div className="g2">
                <BottleneckCard bottlenecks={intelligence.bottlenecks} />
                <RepMonitorCard
                  repActivity={intelligence.repActivity}
                  onSwitchRep={handleViewSwitch}
                  clockMs={clockMs}
                />
              </div>
            )}

            {intelligence && (
              <div className="g-3-2">
                <RepPerformanceTable
                  repActivity={intelligence.repActivity}
                  sort={repTableSort}
                  onSort={setRepTableSort}
                />
                <PipelineSnapshotCard stages={intelligence.stageSnapshot} />
                <div className="card">
                  <div className="cl">Product Mix {' — '} quick view</div>
                  <div style={{ fontSize: 9, color: 'var(--muted)', marginBottom: 8 }}>
                    Team funded · lifetime · see full module below
                  </div>
                  {productMix && (
                    <>
                      <SegBar products={productMix.products} />
                      <LegendRow products={productMix.products} />
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="g2">
              {intelligence && <ConversionFunnelCard funnel={intelligence.conversionFunnel} />}
              <ActivityFeedCard events={activityFeed} />
            </div>

            {productMix && (
              <ProductMixModule data={productMix} period={pmPeriod} onPeriodChange={setPmPeriod} isAdmin />
            )}

            {intelligence && (
              <div className="g-2-1">
                <div className="card">
                  <div className="cl">Next 5 Actions {' — '} {activeRepInitials || 'JB'} · ranked by value + urgency + proximity to funded</div>
                  <Next5Actions deals={operatorQueue?.slice(0, 5)} />
                </div>
                <div>
                  <div className="cl" style={{ marginBottom: 6, fontSize: 8, color: 'var(--muted)', letterSpacing: '.12em', textTransform: 'uppercase' as const, fontWeight: 600 }}>
                    Pipeline Health
                  </div>
                  <div className="pipe-health">
                    <div className="ph-cell">
                      <div className="ph-lbl">Next Action Set</div>
                      <div
                        className={`ph-val ${
                          intelligence.pipelineHealth.withNextAction >= 80
                            ? 'ok'
                            : intelligence.pipelineHealth.withNextAction >= 60
                              ? 'warn'
                              : 'bad'
                        }`}
                      >
                        {intelligence.pipelineHealth.withNextAction}%
                      </div>
                      <div className="ph-sub">{intelligence.pipelineHealth.withNextActionCount ?? '?'} of {intelligence.pipelineHealth.totalDeals ?? '?'} deals</div>
                    </div>
                    <div className="ph-cell">
                      <div className="ph-lbl">Touched 48h</div>
                      <div
                        className={`ph-val ${
                          intelligence.pipelineHealth.touched48h >= 80
                            ? 'ok'
                            : intelligence.pipelineHealth.touched48h >= 60
                              ? 'warn'
                              : 'bad'
                        }`}
                      >
                        {intelligence.pipelineHealth.touched48h}%
                      </div>
                      <div className="ph-sub">{intelligence.pipelineHealth.touchedRecentlyCount ?? '?'} of {intelligence.pipelineHealth.totalDeals ?? '?'} deals</div>
                    </div>
                    <div className="ph-cell">
                      <div className="ph-lbl">Properly Staged</div>
                      <div className={`ph-val ${intelligence.pipelineHealth.properlyStaged >= 90 ? 'ok' : 'warn'}`}>
                        {intelligence.pipelineHealth.properlyStaged}%
                      </div>
                      <div className="ph-sub">{intelligence.pipelineHealth.totalDeals ?? '?'} of {intelligence.pipelineHealth.totalDeals ?? '?'} deals</div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {smsMetrics && <SmsBar metrics={smsMetrics} />}
          </div>
        )}

        {/* REP VIEW */}
        {!isAdmin && activeRep && (
          <div className="view on">
            <div className="zone">
              <div className="zd" style={{ background: activeRep.avatarColor || 'var(--gold)' }} />
              My Performance — {activeRepInitials} · owner_id filtered
            </div>

            <div className="rep-hero">
              <div className="rbs" style={{ borderTop: '1px solid var(--gold)' }}>
                <div className="rbs-lbl">My Funded MTD</div>
                <div className="rbs-val gold">{fmtCurrency(metrics?.fundedMTD)}</div>
                <div className="rbs-sub">
                  {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </div>
                <div className="rbs-bar">
                  <div
                    className="rbs-fill"
                    style={{
                      width: Math.min(metrics?.goalProgress ?? 0, 100) + '%',
                      background: 'var(--gold)',
                    }}
                  />
                </div>
                <div style={{ marginTop: 4, fontSize: 9, color: 'var(--muted)' }}>
                  {Math.round(metrics?.goalProgress ?? 0)}% of {fmtCurrency(metrics?.monthlyGoal)} goal
                </div>
              </div>
              <div className="rbs" style={{ borderTop: '1px solid #1f6feb' }}>
                <div className="rbs-lbl">My Pipeline Value</div>
                <div className="rbs-val blue">{fmtCurrency(metrics?.pipelineValue)}</div>
                <div className="rbs-sub">Approved + Committed only</div>
              </div>
              <div className="rbs" style={{ borderTop: '1px solid var(--green2)' }}>
                <div className="rbs-lbl">Committed (Funding)</div>
                <div className="rbs-val green">{fmtCurrency(metrics?.committedValue)}</div>
                <div className="rbs-sub">Client accepted {' · '} closing stage</div>
              </div>
              <div className="rbs" style={{ borderTop: '1px solid var(--green)' }}>
                <div className="rbs-lbl">My Conversion</div>
                <div className="rbs-val green">{metrics?.conversionRate ?? 0}%</div>
                <div className="rbs-sub">Sub → Funded</div>
              </div>
            </div>

            <div className={`pace-banner ${(metrics?.goalProgress ?? 0) >= 50 ? 'pace-good' : 'pace-warn'}`}>
              <span>
                Projected month-end: <strong>{fmtCurrency(metrics?.projectedMonthEnd)}</strong> ·{' '}
                {fmtCurrency(Math.max(0, (metrics?.monthlyGoal ?? 0) - (metrics?.fundedMTD ?? 0)))} remaining to hit{' '}
                {fmtCurrency(metrics?.monthlyGoal)} goal
              </span>
              <span style={{ color: 'var(--muted)' }}>
                {(metrics?.goalProgress ?? 0) >= 50 ? 'On pace' : 'Behind pace — action needed'}
              </span>
            </div>

            <div className="zone" style={{ marginTop: 2 }}>
              <div className="zd" style={{ background: 'var(--orange)' }} />
              Execution Zone — My Deals Only
            </div>

            <OperatorQueue deals={operatorQueue} onDealClick={(id) => setSelectedDealId(id)} onToast={showActionToast} />

            <div className="g3">
              <PriorityCard
                type="hot"
                title="My Hot Leads"
                subtitle={`Your deals only (owner_id = ${activeRepInitials})`}
                deals={hotLeads}
                count={metrics?.hotCount ?? hotLeads?.length ?? 0}
                onDealClick={(id) => setSelectedDealId(id)}
                onToast={showActionToast}
              />
              <PriorityCard
                type="stale"
                title="My Stale Deals"
                subtitle="No contact 24h+ (my deals only)"
                deals={staleDeals}
                count={metrics?.staleCount ?? staleDeals?.length ?? 0}
                riskValue={staleRevenue}
                onDealClick={(id) => setSelectedDealId(id)}
                onToast={showActionToast}
              />
              <PriorityCard
                type="over"
                title="My Overdue Tasks"
                subtitle="next_action_due_date < now"
                deals={overdueTasks}
                count={metrics?.overdueCount ?? overdueTasks?.length ?? 0}
                onDealClick={(id) => setSelectedDealId(id)}
                onToast={showActionToast}
              />
            </div>

            {/* Renewal / Revive Queue */}
            {reviveQueue && reviveQueue.length > 0 && (
              <RenewalQueueCard deals={reviveQueue} index={rrqIndex} onNav={setRrqIndex} />
            )}

            <div className="zone" style={{ marginTop: 2 }}>
              <div className="zd" style={{ background: 'var(--muted)' }} />
              My Intelligence — Personal Metrics
            </div>

            <div className="g-pipe">
              {intelligence ? (
                <PipelineSnapshotCard stages={intelligence.stageSnapshot} title="My Pipeline" />
              ) : (
                <div className="card">
                  <div className="cl">My Pipeline</div>
                  <div style={{ fontSize: 10, color: 'var(--muted)' }}>Loading...</div>
                </div>
              )}

              {intelligence ? (
                <ConversionFunnelCard funnel={intelligence.conversionFunnel} title="My Conversion Funnel" />
              ) : (
                <div className="card">
                  <div className="cl">My Conversion</div>
                </div>
              )}

              <div className="card">
                <div className="cl">My Product Mix — funded</div>
                {productMix && (
                  <>
                    <div className="pb-rows">
                      {productMix.products.map((p) => (
                        <div className="pb-r" key={p.type}>
                          <div className="pb-lbl">
                            {p.type}
                            {p.percentage > 50 && <span className="pb-tag pb-top">TOP</span>}
                          </div>
                          <div className="pb-track">
                            <div
                              className="pb-fill"
                              style={{
                                width: p.percentage + '%',
                                background: PM_COLORS[p.type] || '#666',
                                opacity: 0.5,
                              }}
                            />
                          </div>
                          <div className="pb-val" style={{ color: PM_COLORS[p.type] || 'var(--text)' }}>
                            {fmtCurrency(p.amount)}
                          </div>
                          <div className="pb-pct">{p.percentage}%</div>
                        </div>
                      ))}
                    </div>
                    <div className="pb-foot">
                      <div className="pb-insight">
                        {productMix.products.length > 0 && productMix.products[0].percentage >= 70
                          ? `${productMix.products[0].type} dominant. Diversify to reduce risk.`
                          : 'Balanced product mix.'}
                      </div>
                      <div className="pb-total">{fmtCurrency(productMix.total)}</div>
                    </div>
                  </>
                )}
              </div>

              <ActivityFeedCard events={activityFeed} title="My Activity" />
            </div>

            {productMix && (
              <ProductMixModule
                data={productMix}
                period={pmPeriod}
                onPeriodChange={setPmPeriod}
                isAdmin={false}
                repInitials={activeRepInitials}
              />
            )}

            {smsMetrics && <SmsBar metrics={smsMetrics} label="My SMS" />}
          </div>
        )}
      </div>

      {/* CSV IMPORT MODAL */}
      {csvModalOpen && (
        <CSVImportModal
          file={csvFile}
          importing={csvImporting}
          reps={displayReps}
          assignRepId={csvAssignRep}
          onAssignRepChange={setCsvAssignRep}
          lastImportBatch={lastImportBatch}
          onFileSelect={setCsvFile}
          onImport={async () => {
            if (!csvFile) return;
            setCsvImporting(true);
            try {
              const res = await dealApi.importCSV(csvFile, csvAssignRep || undefined);
              const { imported, skipped, batchId } = res.data;
              toast.success(`Imported ${imported} deals${skipped ? ` (${skipped} skipped)` : ''}`);
              setLastImportBatch({ batchId, count: imported });
              setCsvFile(null);
              queryClient.invalidateQueries({ queryKey: ['deals'] });
              queryClient.invalidateQueries({ queryKey: ['board'] });
            } catch {
              toast.error('Import failed — check file format');
            } finally {
              setCsvImporting(false);
            }
          }}
          onUndoImport={async (batchId: string) => {
            try {
              const res = await dealApi.deleteImportBatch(batchId);
              toast.success(`Deleted ${res.data.deleted} imported deals`);
              setLastImportBatch(null);
              queryClient.invalidateQueries({ queryKey: ['deals'] });
              queryClient.invalidateQueries({ queryKey: ['board'] });
            } catch {
              toast.error('Failed to undo import');
            }
          }}
          onClose={() => {
            setCsvModalOpen(false);
            setCsvFile(null);
            setCsvAssignRep('');
          }}
        />
      )}

      {/* LIVE FEED TOAST */}
      <LiveFeedToast events={activityFeed} />

      {/* ACTION TOAST (click-triggered) */}
      {actionToast && (
        <div className="toast show" style={{ zIndex: 10001 }}>
          <div className="toast-title">{actionToast.title}</div>
          {actionToast.text}
        </div>
      )}

      {/* DEAL DETAIL MODAL */}
      {selectedDeal && (
        <DealDetailModal
          deal={selectedDeal}
          onClose={() => setSelectedDealId(null)}
          onNavigate={() => {
            setSelectedDealId(null);
            navigate(`/pipeline?deal=${selectedDeal.id}`);
          }}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ══════════════════════════════════════════════════════════════

// ── Auto followup suggestions by product type ──
const AUTO_FOLLOWUP: Record<string, Record<string, { next: string; days: number }>> = {
  MCA: { 'Called client': { next: 'Gather docs', days: 0 }, 'Sent documents': { next: 'Review docs', days: 3 }, 'Submitted application': { next: 'Check with lender', days: 1 }, 'Sent offer': { next: 'Follow up on offer', days: 1 }, 'Left voicemail': { next: 'Call again', days: 1 } },
  SBA: { 'Called client': { next: 'Schedule call', days: 1 }, 'Sent documents': { next: 'Review & gather', days: 7 }, 'Submitted application': { next: 'Lender review', days: 14 }, 'Sent offer': { next: 'Follow up on offer', days: 3 }, 'Left voicemail': { next: 'Call again', days: 2 } },
};
const DEFAULT_FOLLOWUP: Record<string, { next: string; days: number }> = {
  'Called client': { next: 'Follow up', days: 1 }, 'Sent documents': { next: 'Review docs', days: 3 }, 'Submitted application': { next: 'Check status', days: 2 }, 'Sent offer': { next: 'Follow up on offer', days: 1 }, 'Left voicemail': { next: 'Call again', days: 1 }, 'Presented offer': { next: 'Awaiting decision', days: 2 }, 'Texted': { next: 'Follow up', days: 1 },
};

const CA_ACTION_TYPES = ['Called client', 'Left voicemail', 'Sent documents', 'Submitted application', 'Sent offer', 'Presented offer', 'Texted'];
const CA_DUE_OPTIONS = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: '+3 days', days: 3 },
  { label: 'Next week', days: 7 },
];

function DealDetailModal({
  deal,
  onClose,
  onNavigate,
}: {
  deal: Deal;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const qc = useQueryClient();
  const repName = deal.assignedRep
    ? `${deal.assignedRep.firstName} ${deal.assignedRep.lastName}`
    : '';
  const stageLabel = STAGE_LABELS[deal.stage] || deal.stage;

  // Sub-modal state
  const [subModal, setSubModal] = useState<'none' | 'complete-action' | 'add-note' | 'lost-nq'>('none');
  const [caStep, setCaStep] = useState(1);
  const [caType, setCaType] = useState('');
  const [caNext, setCaNext] = useState('');
  const [caDue, setCaDue] = useState('');
  const [caNote, setCaNote] = useState('');
  const [caSubmitting, setCaSubmitting] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [noteSubmitting, setNoteSubmitting] = useState(false);
  const [nqMode, setNqMode] = useState<'lost' | 'disqualified'>('lost');
  const [nqReason, setNqReason] = useState('');
  const [nqFollowUp, setNqFollowUp] = useState(30);
  const [nqSubmitting, setNqSubmitting] = useState(false);
  const [internalToast, setInternalToast] = useState<string | null>(null);

  function showInternalToast(msg: string) {
    setInternalToast(msg);
    setTimeout(() => setInternalToast(null), 2500);
  }

  // Build status text
  const statusParts: string[] = [];
  if (deal.offers && deal.offers.length > 0) {
    const offer = deal.offers[0];
    statusParts.push(
      `Offer from ${offer.lenderName || 'lender'} — ${offer.terms || ''} — ${fmtCurrency(offer.amount)}. Offer expires in ${offer.expiryDays ?? '?'} days.`
    );
  }
  if (deal.notes) statusParts.push(deal.notes);
  if (deal.nextAction) statusParts.push(`Action: ${deal.nextAction}`);
  if (deal.isHot) statusParts.push('HOT flag active.');
  const statusText = statusParts.length > 0 ? statusParts.join(' ') : `${stageLabel} — ${deal.productType || 'N/A'}`;

  // Urgency
  const urgencyParts: string[] = [];
  if (deal.staleDays > 2) urgencyParts.push(`${deal.staleDays}d since last activity`);
  if (deal.offers?.some((o) => (o.expiryDays ?? 99) <= 7))
    urgencyParts.push('Offer expiring soon — act now');
  if (deal.isHot) urgencyParts.push('High close probability');

  const dueLabel = deal.nextActionDue
    ? (() => {
        const d = new Date(deal.nextActionDue);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        d.setHours(0, 0, 0, 0);
        const diff = Math.round((d.getTime() - today.getTime()) / 86400000);
        if (diff === 0) return 'Today';
        if (diff === 1) return 'Tomorrow';
        if (diff < 0) return `${Math.abs(diff)}d overdue`;
        return `${diff} days`;
      })()
    : '—';

  // ── Complete Action: pick action type → auto-suggest next ──
  function handleCaTypeSelect(type: string) {
    setCaType(type);
    const pt = deal.productType || '';
    const map = AUTO_FOLLOWUP[pt] || DEFAULT_FOLLOWUP;
    const suggestion = map[type] || DEFAULT_FOLLOWUP[type] || { next: 'Follow up', days: 1 };
    setCaNext(suggestion.next);
    const d = new Date();
    d.setDate(d.getDate() + suggestion.days);
    setCaDue(d.toISOString().slice(0, 10));
    setCaStep(2);
  }

  async function handleCaSubmit() {
    if (!caNext || !caDue) return;
    setCaSubmitting(true);
    try {
      await dealApi.completeAction(deal.id, {
        actionType: caType,
        nextAction: caNext,
        nextActionDue: new Date(caDue).toISOString(),
        note: caNote || undefined,
      });
      qc.invalidateQueries({ queryKey: ['cc-'] });
      showInternalToast(`Action logged — next: ${caNext}`);
      setTimeout(() => { setSubModal('none'); setCaStep(1); setCaType(''); setCaNext(''); setCaDue(''); setCaNote(''); }, 1200);
    } catch {
      toast.error('Failed to complete action');
    } finally {
      setCaSubmitting(false);
    }
  }

  // ── Add Note ──
  async function handleAddNote() {
    if (!noteText.trim()) return;
    setNoteSubmitting(true);
    try {
      await dealApi.updateDeal(deal.id, { notes: (deal.notes ? deal.notes + '\n' : '') + noteText.trim() });
      qc.invalidateQueries({ queryKey: ['cc-'] });
      showInternalToast('Note added');
      setTimeout(() => { setSubModal('none'); setNoteText(''); }, 1200);
    } catch {
      toast.error('Failed to add note');
    } finally {
      setNoteSubmitting(false);
    }
  }

  // ── Lost / NQ ──
  async function handleLostNq() {
    if (!nqReason.trim()) return;
    setNqSubmitting(true);
    try {
      const stage = nqMode === 'lost' ? 'NURTURE' : 'CLOSED';
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + nqFollowUp);
      await dealApi.moveDeal(deal.id, {
        stage,
        ...(nqMode === 'lost'
          ? { lostReason: nqReason.trim(), followUpDate: followUpDate.toISOString(), followUpType: 'nurture' }
          : { disqualReason: nqReason.trim() }),
      });
      qc.invalidateQueries({ queryKey: ['cc-'] });
      showInternalToast(nqMode === 'lost' ? 'Moved to Nurture' : 'Deal closed');
      setTimeout(() => { setSubModal('none'); onClose(); }, 1200);
    } catch {
      toast.error('Failed to update deal');
    } finally {
      setNqSubmitting(false);
    }
  }

  // ── Call with logging ──
  async function handleCall() {
    if (deal.client?.phone) {
      window.open(`tel:${deal.client.phone}`);
      try {
        await dealApi.logCall(deal.id, { note: 'Call initiated from Command Center' });
        qc.invalidateQueries({ queryKey: ['cc-'] });
      } catch { /* silent */ }
    } else {
      showInternalToast('No phone number on file');
    }
  }

  return (
    <div className="deal-modal open" onClick={(e) => { if (e.target === e.currentTarget && subModal === 'none') onClose(); }}>
      <div className="deal-box">
        {/* ── Internal toast ── */}
        {internalToast && (
          <div style={{ position: 'absolute', top: 8, left: '50%', transform: 'translateX(-50)', zIndex: 10, background: 'var(--bg4)', border: '1px solid var(--gold)', borderRadius: 4, padding: '5px 12px', fontSize: 10, color: 'var(--gold)', fontFamily: 'var(--mono)', whiteSpace: 'nowrap' }}>
            {internalToast}
          </div>
        )}

        <div className="dm-head">
          <div>
            <div className="dm-title">{deal.client?.businessName || 'Unknown'}</div>
            <div className="dm-badge">
              <span className={`stage-badge-sm ${deal.stage === 'FUNDED' ? 'sbs-f' : deal.stage === 'APPROVED_OFFERS' ? 'sbs-a' : deal.stage === 'SUBMITTED_IN_REVIEW' ? 'sbs-s' : 'sbs-h'}`}>
                {stageLabel}
              </span>
            </div>
          </div>
          <button className="dm-x" onClick={() => { if (subModal !== 'none') setSubModal('none'); else onClose(); }}>{'✕'}</button>
        </div>

        {/* ── MAIN VIEW ── */}
        {subModal === 'none' && (
          <>
            <div className="dm-sec">
              <div className="dm-sec-lbl">Deal Info</div>
              <div className="dm-row"><span className="dm-k">Amount</span><span className="dm-v gold">{deal.dealAmount ? fmtCurrency(deal.dealAmount) : 'TBD'}</span></div>
              <div className="dm-row"><span className="dm-k">Product</span><span className="dm-v">{deal.productType || '—'}</span></div>
              <div className="dm-row"><span className="dm-k">Stage</span><span className="dm-v">{stageLabel}</span></div>
              <div className="dm-row"><span className="dm-k">Assigned Rep</span><span className="dm-v">{repName || '—'}</span></div>
            </div>

            <div className="dm-sec">
              <div className="dm-sec-lbl">Status</div>
              <div className="dm-note">{statusText}</div>
              {urgencyParts.length > 0 && (
                <div className="dm-urgency">
                  <strong>{deal.dealAmount ? fmtCurrency(deal.dealAmount) + ' deal' : 'Deal'}</strong> {' — '}{urgencyParts.join('. ')}
                </div>
              )}
            </div>

            <div className="dm-sec">
              <div className="dm-sec-lbl">Next Action</div>
              <div className="dm-row"><span className="dm-k">Task</span><span className="dm-v green">{deal.nextAction || '—'}</span></div>
              <div className="dm-row"><span className="dm-k">Due</span><span className="dm-v">{dueLabel}</span></div>
            </div>

            <div className="dm-sec" style={{ marginBottom: 0 }}>
              <div className="dm-sec-lbl">Quick Contact — logs to Twilio</div>
              <div className="dm-comms">
                <button className="dm-comm-btn dm-call" onClick={handleCall}>📞 Call</button>
                <button className="dm-comm-btn dm-text" onClick={onNavigate}>💬 Text</button>
              </div>
            </div>

            <div className="dm-acts">
              <button className="dma dma-p" onClick={() => setSubModal('complete-action')}>Complete Action</button>
              <button className="dma dma-s" onClick={() => setSubModal('add-note')}>Add Note</button>
              <button className="dma dma-d" onClick={() => setSubModal('lost-nq')}>Lost / NQ</button>
            </div>
          </>
        )}

        {/* ── COMPLETE ACTION: Step 1 — action type ── */}
        {subModal === 'complete-action' && caStep === 1 && (
          <div className="dm-sec">
            <div className="dm-sec-lbl">Complete Action — Step 1</div>
            <div style={{ fontSize: 10, color: 'var(--muted)', marginBottom: 8 }}>What did you do?</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {CA_ACTION_TYPES.map((t) => (
                <button key={t} className="dma dma-s" style={{ fontSize: 9, padding: '7px 6px' }} onClick={() => handleCaTypeSelect(t)}>{t}</button>
              ))}
            </div>
          </div>
        )}

        {/* ── COMPLETE ACTION: Step 2 — next action + due ── */}
        {subModal === 'complete-action' && caStep === 2 && (
          <div className="dm-sec">
            <div className="dm-sec-lbl">Complete Action — Step 2</div>
            <div style={{ background: '#1c0c00', border: '1px solid var(--orange2)', borderRadius: 3, padding: '5px 8px', fontSize: 9, color: 'var(--orange)', marginBottom: 8 }}>
              Follow-up auto-set based on {deal.productType || 'product'}
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Next Action</label>
              <input type="text" value={caNext} onChange={(e) => setCaNext(e.target.value)} style={{ width: '100%', background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 3, padding: '5px 7px', fontSize: 10, color: 'var(--text)', fontFamily: 'var(--mono)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Due Date</label>
              <div style={{ display: 'flex', gap: 4, marginBottom: 4 }}>
                {CA_DUE_OPTIONS.map((opt) => {
                  const d = new Date(); d.setDate(d.getDate() + opt.days);
                  const val = d.toISOString().slice(0, 10);
                  return <button key={opt.label} className={`dma ${caDue === val ? 'dma-p' : 'dma-s'}`} style={{ fontSize: 8, padding: '4px 6px', flex: 1 }} onClick={() => setCaDue(val)}>{opt.label}</button>;
                })}
              </div>
              <input type="date" value={caDue} onChange={(e) => setCaDue(e.target.value)} style={{ width: '100%', background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 3, padding: '4px 7px', fontSize: 10, color: 'var(--text)', fontFamily: 'var(--mono)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Note (optional)</label>
              <input type="text" value={caNote} onChange={(e) => setCaNote(e.target.value)} placeholder="Additional context..." style={{ width: '100%', background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 3, padding: '5px 7px', fontSize: 10, color: 'var(--text)', fontFamily: 'var(--mono)', boxSizing: 'border-box' }} />
            </div>
            <div style={{ display: 'flex', gap: 5 }}>
              <button className="dma dma-s" style={{ flex: 1 }} onClick={() => setCaStep(1)}>← Back</button>
              <button className="dma dma-p" style={{ flex: 2, opacity: caSubmitting ? 0.5 : 1 }} disabled={caSubmitting || !caNext || !caDue} onClick={handleCaSubmit}>
                {caSubmitting ? 'Saving...' : 'Submit'}
              </button>
            </div>
          </div>
        )}

        {/* ── ADD NOTE ── */}
        {subModal === 'add-note' && (
          <div className="dm-sec">
            <div className="dm-sec-lbl">Add Note</div>
            <textarea value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Enter note..." rows={4} style={{ width: '100%', background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 3, padding: '6px 8px', fontSize: 10, color: 'var(--text)', fontFamily: 'var(--mono)', resize: 'vertical', boxSizing: 'border-box' }} />
            <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
              <button className="dma dma-s" style={{ flex: 1 }} onClick={() => { setSubModal('none'); setNoteText(''); }}>Cancel</button>
              <button className="dma dma-p" style={{ flex: 2, opacity: noteSubmitting ? 0.5 : 1 }} disabled={noteSubmitting || !noteText.trim()} onClick={handleAddNote}>
                {noteSubmitting ? 'Saving...' : 'Save Note'}
              </button>
            </div>
          </div>
        )}

        {/* ── LOST / NQ ── */}
        {subModal === 'lost-nq' && (
          <div className="dm-sec">
            <div className="dm-sec-lbl">Close Deal</div>
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
              <button className={`dma ${nqMode === 'lost' ? 'dma-p' : 'dma-s'}`} style={{ flex: 1, fontSize: 9 }} onClick={() => setNqMode('lost')}>Lost → Nurture</button>
              <button className={`dma ${nqMode === 'disqualified' ? 'dma-d' : 'dma-s'}`} style={{ flex: 1, fontSize: 9 }} onClick={() => setNqMode('disqualified')}>Disqualified → Closed</button>
            </div>
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>{nqMode === 'lost' ? 'Lost Reason' : 'Disqualification Reason'} *</label>
              <textarea value={nqReason} onChange={(e) => setNqReason(e.target.value)} placeholder={nqMode === 'lost' ? 'Why was this deal lost?' : 'Why is this deal disqualified?'} rows={3} style={{ width: '100%', background: 'var(--bg4)', border: '1px solid var(--border)', borderRadius: 3, padding: '6px 8px', fontSize: 10, color: 'var(--text)', fontFamily: 'var(--mono)', resize: 'vertical', boxSizing: 'border-box' }} />
            </div>
            {nqMode === 'lost' && (
              <div style={{ marginBottom: 6 }}>
                <label style={{ fontSize: 9, color: 'var(--muted)', display: 'block', marginBottom: 3 }}>Follow-up in</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {[{ label: '30d', v: 30 }, { label: '60d', v: 60 }, { label: '90d', v: 90 }].map((opt) => (
                    <button key={opt.v} className={`dma ${nqFollowUp === opt.v ? 'dma-p' : 'dma-s'}`} style={{ flex: 1, fontSize: 8 }} onClick={() => setNqFollowUp(opt.v)}>{opt.label}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
              <button className="dma dma-s" style={{ flex: 1 }} onClick={() => { setSubModal('none'); setNqReason(''); }}>Cancel</button>
              <button className={`dma ${nqMode === 'lost' ? 'dma-p' : 'dma-d'}`} style={{ flex: 2, opacity: nqSubmitting ? 0.5 : 1 }} disabled={nqSubmitting || !nqReason.trim()} onClick={handleLostNq}>
                {nqSubmitting ? 'Saving...' : nqMode === 'lost' ? 'Move to Nurture' : 'Close Deal'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function LiveFeedToast({ events }: { events?: ActivityEvent[] }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState<{ title: string; text: string } | null>(null);
  const idxRef = useRef(0);

  useEffect(() => {
    if (!events || events.length === 0) return;

    function buildItem(ev: ActivityEvent): { title: string; text: string } {
      const biz = ev.deal?.client?.businessName || 'Unknown';
      const rep = ev.rep?.initials || ev.rep?.firstName || '';
      if (ev.toStage === 'FUNDED')
        return { title: 'Live Feed', text: `${rep} closed ${biz} — funded` };
      if (ev.eventType === 'stage_changed')
        return { title: 'Live Feed', text: `${rep}: ${biz} — ${STAGE_LABELS[ev.toStage || ''] || ev.toStage || 'moved'}` };
      if (ev.eventType?.includes('alert') || ev.eventType?.includes('system'))
        return { title: 'System Alert', text: `${biz} (${rep}) — ${ev.note || ev.eventType?.replace(/_/g, ' ') || 'attention needed'}` };
      return { title: 'Live Feed', text: `${rep}: ${biz} — ${ev.note || ev.eventType?.replace(/_/g, ' ') || 'update'}` };
    }

    function showNext() {
      const ev = events![idxRef.current % events!.length];
      idxRef.current++;
      setCurrent(buildItem(ev));
      setVisible(true);
      setTimeout(() => setVisible(false), 3200);
    }

    // Show first after 5s, then every 22s
    const first = setTimeout(showNext, 5000);
    const interval = setInterval(showNext, 22000);
    return () => { clearTimeout(first); clearInterval(interval); };
  }, [events]);

  if (!current) return null;

  return (
    <div className={`toast${visible ? ' show' : ''}`}>
      <div className="toast-title">{current.title}</div>
      {current.text}
    </div>
  );
}

function ExecPopup({ data, onClose: _onClose }: { data: ExecScore; onClose: () => void }) {
  return (
    <div className="esb-popup open" onClick={(e) => e.stopPropagation()}>
      <div className="esb-popup-rep">
        {data.firstName} {data.lastName || ''} {'—'} {data.score}%
      </div>
      <div className="esb-popup-row">
        <span className="esb-popup-key">Actions completed</span>
        <span className="esb-popup-val">
          {data.completed} / {data.assigned}
        </span>
      </div>
      <div className="esb-popup-row">
        <span className="esb-popup-key">Overdue actions</span>
        <span className={`esb-popup-val ${data.overdue > 0 ? 'bad' : 'ok'}`}>{data.overdue}</span>
      </div>
      <div className="esb-popup-row">
        <span className="esb-popup-key">Deals touched today</span>
        <span className="esb-popup-val ok">{data.touchedToday ?? 0}</span>
      </div>
    </div>
  );
}

function OperatorQueue({
  deals,
  isAdmin,
  onDealClick,
  onToast,
}: {
  deals?: QueueDeal[];
  isAdmin?: boolean;
  onDealClick: (id: string) => void;
  onToast?: (title: string, text: string) => void;
}) {
  if (!deals || deals.length === 0) return null;
  return (
    <div className="op-q">
      <div className="oq-head">
        <span style={{ color: 'var(--orange)', fontSize: 13 }}>{'★'}</span>
        <span className="oq-title">
          {isAdmin ? 'Operator Queue — Admin Hit List' : 'Close These Today — My Deals'}
        </span>
        <span className="oq-sub">One action per deal · system-determined by stage + urgency</span>
      </div>
      <div className="oq-list">
        {deals.slice(0, 5).map((deal, i) => (
          <div className="oqi" key={deal.id} onClick={() => onDealClick(deal.id)}>
            <div className="oqi-rank">{i + 1}</div>
            <div className="oqi-info">
              <div className="oqi-name">
                {deal.client?.businessName || 'Unknown'}
                {isAdmin && deal.assignedRep && (
                  <span style={{ fontSize: 10, color: 'var(--muted)', fontWeight: 400 }}>
                    {' · '}
                    {deal.assignedRep.initials ||
                      (deal.assignedRep.firstName[0] + deal.assignedRep.lastName[0]).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="oqi-detail">
                {deal.productType || ''} {STAGE_LABELS[deal.stage] || deal.stage}
                {deal.nextAction ? ` · ${deal.nextAction}` : ''}
              </div>
            </div>
            <div className="oqi-right">
              <div className="oqi-amt">{deal.dealAmount ? fmtCurrency(deal.dealAmount) : 'TBD'}</div>
              <button
                className={`oqi-action ${getActionButtonStyle(deal.primaryAction)}`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (onToast) {
                    const biz = deal.client?.businessName || 'Unknown';
                    const action = (deal.primaryAction || '').toLowerCase();
                    let msg = `${deal.primaryAction}...`;
                    if (action.includes('call')) msg = 'Calling client to present offer...';
                    else if (action.includes('send')) msg = 'Sending offer summary to client...';
                    else if (action.includes('follow')) msg = 'Following up with lender...';
                    onToast(biz, msg);
                  }
                }}
              >
                {deal.primaryAction}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PriorityCard({
  type,
  title,
  subtitle,
  deals,
  count,
  riskValue,
  onDealClick,
  onToast,
}: {
  type: 'hot' | 'stale' | 'over';
  title: string;
  subtitle: string;
  deals?: Deal[];
  count: number;
  riskValue?: number;
  onDealClick: (id: string) => void;
  onToast: (title: string, text: string) => void;
}) {
  const ctaClass = type === 'hot' ? 'cta-h' : type === 'stale' ? 'cta-s' : 'cta-o';

  function getDealCta(deal: Deal): string {
    if (type === 'hot') {
      const na = (deal.nextAction || '').toLowerCase();
      if (na.includes('schedule') || na.includes('callback')) return 'Schedule';
      return 'Call Now';
    }
    if (type === 'over') {
      if (!deal.nextAction) return 'Assign';
      const na = deal.nextAction.toLowerCase();
      if (na.includes('send')) return 'Send Now';
      if (na.includes('call')) return 'Act Now';
      if (na.includes('assign') || !deal.nextAction) return 'Assign';
      return 'Act Now';
    }
    return 'Follow Up';
  }

  function buildToastText(deal: Deal): string {
    const biz = deal.client?.businessName || 'Unknown';
    const rep = deal.assignedRep?.initials || '';
    const stage = STAGE_LABELS[deal.stage] || deal.stage;
    if (type === 'stale') {
      const idle = deal.staleDays > 0 ? `${deal.staleDays}h idle` : 'idle';
      const val = deal.dealAmount ? ` · ${fmtCurrency(deal.dealAmount)}` : '';
      return `${idle}${val} · ${stage}`;
    }
    if (type === 'over') {
      const action = deal.nextAction || 'action needed';
      return `${action} · overdue${rep ? ` (${rep})` : ''}`;
    }
    return `${biz} — ${stage}`;
  }

  function getCtaToastText(deal: Deal, cta: string): string {
    const action = cta.toLowerCase();
    if (action.includes('call')) return 'Calling client...';
    if (action.includes('schedule')) return 'Opening scheduler...';
    if (action.includes('follow')) return 'Following up...';
    if (action.includes('send')) return 'Sending document request...';
    if (action.includes('assign')) return 'Opening assignment...';
    if (action.includes('act')) return 'Acting on deal...';
    return `${cta}...`;
  }

  function handleRowClick(deal: Deal) {
    if (type === 'hot') {
      onDealClick(deal.id);
    } else {
      const biz = deal.client?.businessName || 'Unknown';
      onToast(biz, buildToastText(deal));
    }
  }

  function handleCtaClick(e: React.MouseEvent, deal: Deal, cta: string) {
    e.stopPropagation();
    const biz = deal.client?.businessName || 'Unknown';
    onToast(biz, getCtaToastText(deal, cta));
  }

  const icon =
    type === 'hot' ? (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="var(--orange)">
        <path d="M8 1C5.5 5 3 7.5 3 11a5 5 0 0010 0C13 7.5 10.5 5 8 1z" />
      </svg>
    ) : type === 'stale' ? (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="var(--amber)" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 4v4l2.5 2.5" strokeLinecap="round" />
      </svg>
    ) : (
      <svg width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="var(--red)" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6" />
        <path d="M8 5v3l2 2" strokeLinecap="round" />
        <path d="M5 1.5h6" strokeLinecap="round" />
      </svg>
    );

  return (
    <div className={`pcard ${type}`}>
      <div className="pc-head">
        <div className="pc-hl">
          {icon}
          <div>
            <div className="pc-title">{title}</div>
            <div className="pc-sub">{subtitle}</div>
          </div>
        </div>
        <div className="pc-ct">{count}</div>
      </div>
      <div className="pc-body">
        {deals?.slice(0, 3).map((deal) => {
          const cta = getDealCta(deal);
          return (
            <div className="pdi" key={deal.id} onClick={() => handleRowClick(deal)}>
              <div>
                <div className="pdi-name">
                  {deal.client?.businessName || 'Unknown'}
                  {deal.assignedRep && (
                    <span style={{ fontSize: 9, color: 'var(--muted)' }}>
                      {' '}
                      ({deal.assignedRep.initials || deal.assignedRep.firstName[0]})
                    </span>
                  )}
                </div>
                <div className="pdi-note">
                  {deal.nextAction || STAGE_LABELS[deal.stage] || deal.stage}
                  {deal.staleDays > 0 ? ` · ${deal.staleDays}d idle` : ''}
                </div>
              </div>
              <button className={`cta ${ctaClass}`} onClick={(e) => handleCtaClick(e, deal, cta)}>
                {cta}
              </button>
            </div>
          );
        })}
        {riskValue != null && riskValue > 0 && (
          <div className="pc-risk">
            <span className="pc-risk-lbl">Revenue at risk (48h+)</span>
            <span className="pc-risk-val">{fmtCurrency(riskValue)}</span>
          </div>
        )}
        {(deals?.length ?? 0) > 3 && (
          <div className="pc-more">
            + {(deals?.length ?? 0) - 3} more {'→'}
          </div>
        )}
      </div>
    </div>
  );
}

function BottleneckCard({ bottlenecks }: { bottlenecks: Bottleneck[] }) {
  const total = bottlenecks.reduce((s, b) => s + b.value, 0);

  function getSeverity(b: Bottleneck): string {
    if (b.stage === 'SUBMITTED_IN_REVIEW') return 'crit';
    if (b.stage === 'APPROVED_OFFERS') return 'warn';
    return 'info';
  }

  return (
    <div className="card">
      <div className="cl">
        <span>System Bottlenecks — owner assigned</span>
        <span className="cl-action">Drill Down {'→'}</span>
      </div>
      <div className="bn-list">
        {bottlenecks.slice(0, 5).map((b) => {
          const sev = getSeverity(b);
          return (
            <div className={`bn-item ${sev}`} key={b.stage}>
              <div>
                <div className="bn-lbl">
                  {STAGE_LABELS[b.stage] || b.stage}
                  {Object.entries(b.reps).length > 0 && (
                    <span
                      style={{
                        color: 'var(--amber)',
                        fontSize: 10,
                        fontWeight: 700,
                      }}
                    >
                      {' · '}
                      {Object.entries(b.reps)
                        .map(([init, cnt]) => `${init} (${cnt})`)
                        .join(' · ')}
                    </span>
                  )}
                </div>
                <div className="bn-sub">{b.count} deals</div>
              </div>
              <div>
                <div className={`bn-val ${sev === 'crit' ? 'red' : sev === 'warn' ? 'amber' : 'gold'}`}>
                  {fmtCurrency(b.value)}
                </div>
                <div className="bn-val-sub">{b.count} deals</div>
              </div>
            </div>
          );
        })}
      </div>
      {total > 0 && (
        <div className="bn-total">
          <span className="bn-total-lbl">Total capital blocked or at risk</span>
          <span className="bn-total-val">{fmtCurrency(total)}</span>
        </div>
      )}
    </div>
  );
}

function RepMonitorCard({
  repActivity,
  onSwitchRep,
  clockMs,
}: {
  repActivity: RepActivity[];
  onSwitchRep: (id: string) => void;
  clockMs: number;
}) {
  return (
    <div className="card">
      <div className="cl">
        <span>Rep Activity Monitor</span>
        <span className="cl-live">{'●'} Live</span>
      </div>
      <div className="rm-list">
        {repActivity.map((rep) => {
          const isActive = rep.status === 'active';
          const timeCls = isActive
            ? 'active'
            : rep.lastTouch && clockMs - new Date(rep.lastTouch).getTime() > 48 * 3600000
              ? 'dead'
              : 'warn';
          const flagCls = isActive ? 'af-active' : 'af-dead';
          const flagLabel = isActive ? 'Active' : 'Idle';

          return (
            <div className="rm-item" key={rep.id} onClick={() => onSwitchRep(rep.id)}>
              <div
                className="rm-av"
                style={{
                  background: rep.avatarColor || 'var(--faint)',
                  color: rep.avatarColor ? 'var(--bg)' : 'var(--muted)',
                }}
              >
                {rep.initials}
              </div>
              <div className="rm-info">
                <div className="rm-name">
                  {rep.name} <span className={`act-flag ${flagCls}`}>{flagLabel}</span>
                </div>
                <div className="rm-status">
                  {rep.activeDeals} active deals · {rep.overdueCount} actions due
                </div>
                {(rep.dealsAtRisk > 0 || rep.overdueCount > 0) && (
                  <div
                    style={{
                      fontSize: 9,
                      color: 'var(--amber)',
                      marginTop: 2,
                    }}
                  >
                    Deals at risk: <strong>{fmtCurrency(rep.pipelineValue)}</strong> · Overdue:{' '}
                    <strong>{rep.overdueCount}</strong>
                  </div>
                )}
              </div>
              <div className="rm-right">
                <div className={`rm-time ${timeCls}`}>{timeAgo(rep.lastTouch)}</div>
                <div className="rm-tag">
                  {fmtCurrency(rep.fundedMTD)} MTD · {rep.submittedCount > 0 ? Math.round((rep.fundedCount / rep.submittedCount) * 100) : 0}% conv · <span style={{ color: (() => { const exec = rep.activeDeals > 0 ? Math.round(((rep.activeDeals - rep.overdueCount) / rep.activeDeals) * 100) : 0; return exec >= 75 ? 'var(--green2)' : exec >= 50 ? 'var(--amber)' : 'var(--red)'; })() }}>{rep.activeDeals > 0 ? Math.round(((rep.activeDeals - rep.overdueCount) / rep.activeDeals) * 100) : 0}% exec</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="rm-footer">
        {(() => {
          const topMover = repActivity.filter(r => r.status === 'active').sort((a, b) => b.fundedMTD - a.fundedMTD)[0];
          const inactive = repActivity.filter(r => r.status !== 'active');
          const worstIdle = inactive.sort((a, b) => {
            const at = a.lastTouch ? new Date(a.lastTouch).getTime() : 0;
            const bt = b.lastTouch ? new Date(b.lastTouch).getTime() : 0;
            return at - bt;
          })[0];
          return (
            <>
              {topMover && <>Top mover: <strong style={{ color: 'var(--green2)' }}>{topMover.initials}</strong></>}
              {worstIdle && <> · Inactive: <strong style={{ color: 'var(--red)' }}>{worstIdle.name} — needs attention</strong></>}
            </>
          );
        })()}
      </div>
    </div>
  );
}

function RepPerformanceTable({
  repActivity,
  sort,
  onSort,
}: {
  repActivity: RepActivity[];
  sort: { col: string; asc: boolean };
  onSort: (s: { col: string; asc: boolean }) => void;
}) {
  const sorted = useMemo(() => {
    const arr = [...repActivity];
    arr.sort((a, b) => {
      let av = 0,
        bv = 0;
      switch (sort.col) {
        case 'submitted':
          av = a.submittedCount;
          bv = b.submittedCount;
          break;
        case 'fundedCount':
          av = a.fundedCount;
          bv = b.fundedCount;
          break;
        case 'convRate':
          av = a.submittedCount > 0 ? (a.fundedCount / a.submittedCount) * 100 : 0;
          bv = b.submittedCount > 0 ? (b.fundedCount / b.submittedCount) * 100 : 0;
          break;
        case 'funded':
          av = a.fundedMTD;
          bv = b.fundedMTD;
          break;
        case 'pipeline':
          av = a.pipelineValue;
          bv = b.pipelineValue;
          break;
        case 'committed':
          av = a.committedValue;
          bv = b.committedValue;
          break;
        default:
          av = a.fundedMTD;
          bv = b.fundedMTD;
      }
      return sort.asc ? av - bv : bv - av;
    });
    return arr;
  }, [repActivity, sort]);

  const toggleSort = (col: string) => {
    onSort({ col, asc: sort.col === col ? !sort.asc : false });
  };

  const topFunded = Math.max(...repActivity.map((r) => r.fundedMTD), 1);

  return (
    <div className="card">
      <div className="cl">
        <span>Rep Performance Table</span>
        <span className="cl-action">Click headers to sort {'↕'}</span>
      </div>
      <table className="rep-tbl">
        <thead>
          <tr>
            <th>Rep</th>
            <th className={sort.col === 'submitted' ? 'sorted' : ''} onClick={() => toggleSort('submitted')}>
              Submitted
            </th>
            <th className={sort.col === 'fundedCount' ? 'sorted' : ''} onClick={() => toggleSort('fundedCount')}>
              Funded
            </th>
            <th className={sort.col === 'convRate' ? 'sorted' : ''} onClick={() => toggleSort('convRate')}>
              Conv %
            </th>
            <th className={sort.col === 'funded' ? 'sorted' : ''} onClick={() => toggleSort('funded')}>
              Funded $
            </th>
            <th className={sort.col === 'pipeline' ? 'sorted' : ''} onClick={() => toggleSort('pipeline')}>
              Pipeline $
            </th>
            <th className={sort.col === 'committed' ? 'sorted' : ''} onClick={() => toggleSort('committed')}>
              Committed $
            </th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((rep, i) => {
            const convRate = rep.submittedCount > 0 ? Math.round((rep.fundedCount / rep.submittedCount) * 100) : 0;
            return (
              <tr key={rep.id}>
                <td>
                  <div className="r-nc">
                    <div
                      className="r-av"
                      style={{
                        background: rep.avatarColor || 'var(--faint)',
                        color: rep.avatarColor ? 'var(--bg)' : 'var(--muted)',
                      }}
                    >
                      {rep.initials}
                    </div>
                    {rep.initials}
                    {i === 0 && rep.fundedMTD > 0 && <span className="top-badge">Top</span>}
                  </div>
                </td>
                <td>{rep.submittedCount}</td>
                <td>{rep.fundedCount}</td>
                <td
                  style={{ color: convRate >= 50 ? 'var(--green2)' : convRate >= 30 ? 'var(--amber)' : 'var(--red)' }}
                >
                  {convRate}%
                </td>
                <td>
                  <span style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmtCurrency(rep.fundedMTD)}</span>
                  <div
                    className="vbar"
                    style={{
                      width: (rep.fundedMTD / topFunded) * 100 + '%',
                      background: 'var(--gold)',
                      opacity: 0.3,
                    }}
                  />
                </td>
                <td style={{ color: 'var(--text)' }}>{fmtCurrency(rep.pipelineValue)}</td>
                <td style={{ color: 'var(--green2)', opacity: 0.8 }}>{fmtCurrency(rep.committedValue)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PipelineSnapshotCard({ stages, title }: { stages: StageSnapshot[]; title?: string }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1);
  const pipelineValue = stages
    .filter((s) => ['APPROVED_OFFERS', 'COMMITTED_FUNDING'].includes(s.stage))
    .reduce((s, st) => s + st.volume, 0);
  const fundedValue = stages.find((s) => s.stage === 'FUNDED')?.volume ?? 0;

  const stageColors: Record<string, string> = {
    NEW_LEAD: '#1c2333',
    ENGAGED_INTERESTED: '#1c3a5c',
    QUALIFIED: '#1c3a1c',
    SUBMITTED_IN_REVIEW: '#1f4f9e',
    APPROVED_OFFERS: 'var(--gold)',
    COMMITTED_FUNDING: 'var(--gold)',
    FUNDED: 'var(--gold)',
    NURTURE: '#553098',
    CLOSED: '#333',
  };

  return (
    <div className="card">
      <div className="cl">{title || 'Pipeline Snapshot — all reps · all stages'}</div>
      <div className="pipe-rows">
        {stages
          .filter((s) => s.stage !== 'CLOSED')
          .map((s) => (
            <div className="ps-r" key={s.stage}>
              <div className="ps-n">{s.label}</div>
              <div className="ps-bw">
                <div
                  className="ps-b"
                  style={{
                    width: (s.count / maxCount) * 100 + '%',
                    background: stageColors[s.stage] || '#333',
                    opacity: 0.7,
                  }}
                />
              </div>
              <div
                className="ps-c"
                style={{
                  color:
                    s.stage === 'FUNDED' ? 'var(--green2)' : s.stage === 'APPROVED_OFFERS' ? 'var(--gold)' : undefined,
                }}
              >
                {s.count}
              </div>
              <div className={`ps-v ${!s.hideDollar && s.volume > 0 ? 'live' : ''}`}>
                {s.hideDollar ? 'count only' : s.volume > 0 ? fmtCurrency(s.volume) : '—'}
              </div>
            </div>
          ))}
      </div>
      <div className="pipe-foot">
        <div>
          <div className="pfl">Pipeline Value</div>
          <div className="pfv">{fmtCurrency(pipelineValue)}</div>
        </div>
        <div>
          <div className="pfl">Funded MTD</div>
          <div className="pfv">{fmtCurrency(fundedValue)}</div>
        </div>
      </div>
    </div>
  );
}

function ConversionFunnelCard({ funnel, title }: { funnel: FunnelStep[]; title?: string }) {
  const transitions: Array<{ from: string; to: string; rate: number }> = [];
  for (let i = 0; i < funnel.length - 1; i++) {
    const fromCount = funnel[i].count;
    const toCount = funnel[i + 1].count;
    const rate = fromCount > 0 ? Math.round((toCount / fromCount) * 100) : 0;
    transitions.push({ from: funnel[i].label, to: funnel[i + 1].label, rate });
  }

  return (
    <div className="card">
      <div className="cl">
        {title || 'Conversion Funnel — team-wide · from deal_events stage transitions'}
      </div>
      <div className="cv-rows">
        {transitions.map((t, i) => (
          <div className={`cv-r ${t.rate >= 50 ? 'up' : 'dn'}`} key={i}>
            <div className="cv-lbl">
              {t.from} {'→'} {t.to}
            </div>
            <div className="cv-right">
              <div className="cv-val">{t.rate}%</div>
            </div>
          </div>
        ))}
      </div>
      {transitions.length > 0 &&
        (() => {
          const weakest = transitions.reduce((min, t) => (t.rate < min.rate ? t : min), transitions[0]);
          return weakest.rate < 50 ? (
            <>
              <div className="cv-alert">
                Weakest stage: {weakest.from} {'→'} {weakest.to} at {weakest.rate}%
              </div>
              <div className="cv-rec">
                Leads are reaching reps but not converting to qualified. Recommendation: add revenue + TIB filter at first touch. Review low-conversion reps{'\''}  qualification approach specifically.
              </div>
            </>
          ) : null;
        })()}
    </div>
  );
}

function ActivityFeedCard({ events, title }: { events?: ActivityEvent[]; title?: string }) {
  return (
    <div className="card">
      <div className="cl">
        <span>{title || 'Activity Feed — deal_events · all reps'}</span>
        <span className="cl-live">{'●'} Streaming</span>
      </div>
      <div className="act-list">
        {events?.slice(0, 8).map((event) => (
          <div className="act-i" key={event.id}>
            <div className={`act-pip ${getActivityPipClass(event)}`} />
            <div>
              <div className="act-txt">{getActivityText(event)}</div>
              <div className="act-time">{timeAgo(event.createdAt)}</div>
            </div>
          </div>
        ))}
        {(!events || events.length === 0) && (
          <div style={{ fontSize: 10, color: 'var(--muted)', padding: '8px 0' }}>No recent activity</div>
        )}
      </div>
    </div>
  );
}

function getActivityPipClass(event: ActivityEvent): string {
  if (event.toStage === 'FUNDED') return 'ap-g';
  if (event.eventType === 'stage_changed') return 'ap-b';
  if (event.eventType === 'action_completed') return 'ap-gr';
  if (event.eventType?.includes('alert') || event.eventType?.includes('system')) return 'ap-r';
  if (event.eventType === 'note_added') return 'ap-a';
  return 'ap-b';
}

function getActivityText(event: ActivityEvent): string {
  const biz = event.deal?.client?.businessName || 'Unknown';
  const repInit = event.rep?.initials || event.rep?.firstName || '';
  if (event.toStage === 'FUNDED') return `${repInit} closed ${biz} — funded`;
  if (event.eventType === 'stage_changed')
    return `${repInit} moved ${biz} → ${STAGE_LABELS[event.toStage || ''] || event.toStage || ''}`;
  if (event.eventType === 'action_completed')
    return `${repInit} completed action on ${biz}${event.note ? ` — ${event.note}` : ''}`;
  if (event.eventType === 'note_added') return `${repInit} note on ${biz}${event.note ? ` — ${event.note}` : ''}`;
  return `${repInit}: ${biz} — ${event.eventType?.replace(/_/g, ' ') || 'update'}`;
}

function SegBar({ products }: { products: ProductMixItem[] }) {
  return (
    <div className="pm-seg-bar" style={{ marginBottom: 8 }}>
      {products
        .filter((p) => p.percentage > 0)
        .map((p) => (
          <div
            key={p.type}
            className="pm-seg"
            style={{
              width: p.percentage + '%',
              background: PM_COLORS[p.type] || '#666',
              opacity: 0.75,
            }}
          />
        ))}
    </div>
  );
}

function LegendRow({ products }: { products: ProductMixItem[] }) {
  return (
    <div className="pm-legend">
      {products
        .filter((p) => p.percentage > 0)
        .map((p) => (
          <div key={p.type} className="pm-legend-item">
            <div className="pm-legend-dot" style={{ background: PM_COLORS[p.type] || '#666' }} />
            {p.type} <span style={{ color: 'var(--text)', fontWeight: 600 }}>{p.percentage}%</span>
          </div>
        ))}
    </div>
  );
}

function ProductMixModule({
  data,
  period,
  onPeriodChange,
  isAdmin,
  repInitials,
}: {
  data: ProductMixData;
  period: 'lifetime' | '30d';
  onPeriodChange: (p: 'lifetime' | '30d') => void;
  isAdmin: boolean;
  repInitials?: string;
}) {
  return (
    <div className="pm-wrap">
      <div className="pm-header">
        <span className="pm-title">
          Product Mix{isAdmin ? ' — Team Intelligence' : ` — ${repInitials || ''}`}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div className="pm-toggle">
            <button
              className={`pm-toggle-btn ${period === 'lifetime' ? 'on' : ''}`}
              onClick={() => onPeriodChange('lifetime')}
            >
              Lifetime
            </button>
            <button className={`pm-toggle-btn ${period === '30d' ? 'on' : ''}`} onClick={() => onPeriodChange('30d')}>
              30 Days
            </button>
          </div>
          {isAdmin && (
            <span style={{ fontSize: 8, color: 'var(--muted)' }}>Sort by: <span style={{ color: 'var(--text)', cursor: 'pointer' }}>Funded $ {'↓'}</span></span>
          )}
        </div>
      </div>
      <div style={{ padding: '14px 16px' }}>
        {isAdmin && <div className="pm-section-lbl">Team Aggregate — all reps combined</div>}
        <div className="pm-lifetime">
          <div className="pm-lifetime-val">{fmtCurrency(data.total)}</div>
          <div className="pm-lifetime-lbl">{period === 'lifetime' ? 'Lifetime Funded' : 'Last 30 Days'}</div>
        </div>

        <SegBar products={data.products} />
        <LegendRow products={data.products} />

        <div className="pm-prod-rows" style={{ marginTop: 10 }}>
          {data.products.map((p) => (
            <div className="pm-prod-r" key={p.type}>
              <div className="pm-prod-name">
                <div className="pm-legend-dot" style={{ background: PM_COLORS[p.type] || '#666' }} />
                {p.type}
              </div>
              <div className="pm-prod-bar-w">
                <div
                  className="pm-prod-bar"
                  style={{
                    width: p.percentage + '%',
                    background: PM_COLORS[p.type] || '#666',
                    opacity: 0.7,
                  }}
                />
              </div>
              <div className="pm-prod-pct" style={{ color: PM_COLORS[p.type] || 'var(--text)' }}>
                {p.percentage}%
              </div>
              <div className="pm-prod-amt">{fmtCurrency(p.amount)}</div>
            </div>
          ))}
        </div>

        {data.products.length > 0 && (
          <div className="pm-insight-box" style={{ marginTop: 10 }}>
            {data.products[0].percentage >= 70 ? (
              <>
                <strong>Over-concentrated:</strong> {data.products[0].type} is {data.products[0].percentage}% of funded
                volume — single-product risk. <strong>{'→'} Diversify</strong> into underrepresented products.
              </>
            ) : (
              <>
                <strong>Balanced mix.</strong> Continue diversifying — each product strengthens pipeline
                resilience.
              </>
            )}
          </div>
        )}

        {isAdmin && data.repBreakdown && data.repBreakdown.length > 0 && (
          <>
            <div className="pm-section-divider" />
            <div className="pm-section-lbl" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>Rep Breakdown — vs team average</span>
              <span style={{ fontSize: 8, color: 'var(--muted)' }}>Click column headers to sort</span>
            </div>
            <table className="pm-rep-table">
              <thead>
                <tr>
                  <th>Rep</th>
                  <th>Funded $</th>
                  {data.products.slice(0, 4).map((p) => (
                    <th key={p.type}>{p.type}</th>
                  ))}
                  <th>Top Product</th>
                </tr>
              </thead>
              <tbody>
                {data.repBreakdown.map((rep) => {
                  const topProduct =
                    rep.mix.length > 0
                      ? rep.mix.reduce((a, b) => (a.percentage > b.percentage ? a : b)).type
                      : '—';
                  return (
                    <tr key={rep.id}>
                      <td>
                        <div className="r-nc">
                          <div className="r-av" style={{ background: repAvatarColor(rep.initials), color: repAvatarColor(rep.initials) !== 'var(--faint)' ? 'var(--bg)' : 'var(--muted)' }}>
                            {rep.initials}
                          </div>
                          <span style={{ fontWeight: 600 }}>{rep.initials}</span>
                        </div>
                      </td>
                      <td
                        style={{
                          color: rep.funded > 0 ? 'var(--gold)' : 'var(--muted)',
                          fontWeight: 700,
                        }}
                      >
                        {fmtCurrency(rep.funded)}
                      </td>
                      {data.products.slice(0, 4).map((teamProd) => {
                        const repProd = rep.mix.find((m) => m.type === teamProd.type);
                        const pct = repProd?.percentage ?? 0;
                        return (
                          <td key={teamProd.type}>
                            <div className="pm-pct-cell">
                              <div className="pm-pct-mini">
                                <div
                                  className="pm-pct-mini-fill"
                                  style={{
                                    width: pct + '%',
                                    background: PM_COLORS[teamProd.type] || '#666',
                                  }}
                                />
                              </div>
                              {pct}%
                            </div>
                            {rep.funded > 0 && repProd && (
                              <div
                                className={`pm-vs-team ${
                                  Math.abs(repProd.vsTeam) > 10 ? (repProd.vsTeam > 0 ? 'over' : 'under') : 'ok'
                                }`}
                              >
                                {repProd.vsTeam > 0 ? '+' : ''}
                                {repProd.vsTeam}% vs team
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td style={{ color: 'var(--text)', fontWeight: 600 }}>{topProduct}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}

function Next5Actions({ deals }: { deals?: QueueDeal[] }) {
  if (!deals || deals.length === 0) return <div style={{ fontSize: 10, color: 'var(--muted)' }}>No actions queued</div>;

  function getActionClass(action: string): string {
    switch (action) {
      case 'Call Now':
        return 'n5-call';
      case 'Send Offer':
        return 'n5-send';
      case 'Follow Up':
        return 'n5-follow';
      case 'Request Docs':
        return 'n5-docs';
      default:
        return 'n5-follow';
    }
  }

  function getPriorityClass(deal: QueueDeal): string {
    if (deal.stage === 'APPROVED_OFFERS' || deal.stage === 'COMMITTED_FUNDING') return 'urgent';
    if (deal.isHot) return 'high';
    return 'normal';
  }

  return (
    <div className="n5-list">
      {deals.slice(0, 5).map((deal, i) => (
        <div className={`n5-item ${getPriorityClass(deal)}`} key={deal.id}>
          <div className="n5-rank">{i + 1}</div>
          <div className="n5-name">{deal.client?.businessName || 'Unknown'}</div>
          <div className="n5-amt">{deal.dealAmount ? fmtCurrency(deal.dealAmount) : 'TBD'}</div>
          <button
            className={`n5-action ${getActionClass(deal.primaryAction)}`}
            onClick={() => toast(`${deal.primaryAction}: ${deal.client?.businessName}`)}
          >
            {deal.primaryAction}
          </button>
        </div>
      ))}
    </div>
  );
}

function SmsBar({ metrics, label }: { metrics: SmsMetricsData; label?: string }) {
  const deliveredPct = metrics.sent24h > 0 ? Math.round((metrics.delivered24h / metrics.sent24h) * 100) : 0;
  return (
    <div className="sms-bar">
      <div className="sms-lbl">{label || 'SMS / Outreach — secondary metrics'}</div>
      <div className="sms-items">
        <div>
          <div className="si-v">{metrics.sent24h}</div>
          <div className="si-k">Sent 24h</div>
        </div>
        <div>
          <div className={`si-v ${deliveredPct >= 90 ? 'ok' : ''}`}>{deliveredPct}%</div>
          <div className="si-k">Delivered</div>
        </div>
        <div>
          <div className={`si-v ${metrics.replyRate7d >= 20 ? 'ok' : ''}`}>{metrics.replyRate7d}%</div>
          <div className="si-k">Reply rate 7d</div>
        </div>
        <div>
          <div className={`si-v ${metrics.errorRate === 0 ? 'ok' : ''}`}>{metrics.errorRate}%</div>
          <div className="si-k">Errors</div>
        </div>
        <div>
          <div className="si-v">{metrics.activeAutomations}</div>
          <div className="si-k">Active automations</div>
        </div>
        <div>
          <div className="si-v">{metrics.totalLeads}</div>
          <div className="si-k">Total leads</div>
        </div>
      </div>
    </div>
  );
}

// ── CSV IMPORT MODAL ──

function CSVImportModal({
  file,
  importing,
  reps,
  assignRepId,
  onAssignRepChange,
  lastImportBatch,
  onFileSelect,
  onImport,
  onUndoImport,
  onClose,
}: {
  file: File | null;
  importing: boolean;
  reps: Rep[];
  assignRepId: string;
  onAssignRepChange: (id: string) => void;
  lastImportBatch: { batchId: string; count: number } | null;
  onFileSelect: (f: File | null) => void;
  onImport: () => void;
  onUndoImport: (batchId: string) => void;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files?.[0];
      if (f && f.name.endsWith('.csv')) onFileSelect(f);
    },
    [onFileSelect],
  );

  return (
    <div className="csv-modal open" onClick={onClose}>
      <div className="csv-box" onClick={(e) => e.stopPropagation()}>
        <div className="csv-title">Import Funded Deals</div>
        <div className="csv-sub">
          Upload a CSV with historical funded deals. Supports multiple formats — auto-detects columns.
        </div>
        <div className="csv-schema">
          <div style={{ fontSize: '8px', color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginBottom: '4px' }}>Format 1 — Standard</div>
          <div>
            <span className="field">business_name</span> <span className="type">text</span>{' '}
            <span className="req">required</span>
          </div>
          <div>
            <span className="field">rep_name</span> <span className="type">text (initials or full name)</span>{' '}
            <span className="req">required</span>
          </div>
          <div>
            <span className="field">product_type</span>{' '}
            <span className="type">MCA | SBA | EQUIPMENT | HELOC | CRE | BRIDGE</span>
          </div>
          <div>
            <span className="field">funded_amount</span> <span className="type">number</span>{' '}
            <span className="req">required</span>
          </div>
          <div>
            <span className="field">funded_date</span> <span className="type">YYYY-MM-DD</span>
          </div>
          <div style={{ fontSize: '8px', color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase', marginTop: '8px', marginBottom: '4px' }}>Format 2 — FDR Export</div>
          <div>
            <span className="field">Contact</span> <span className="type">text</span>{' '}
            <span className="req">required</span>
          </div>
          <div>
            <span className="field">FDR Originator</span> <span className="type">rep full name</span>{' '}
            <span className="req">required</span>
          </div>
          <div>
            <span className="field">Funded Amount (last)</span> <span className="type">$number</span>{' '}
            <span className="req">required</span>
          </div>
          <div>
            <span className="field">Contact Phone Number</span> <span className="type">phone</span>
          </div>
          <div>
            <span className="field">Contact Email</span> <span className="type">email</span>
          </div>
          <div>
            <span className="field">FDR Funded By</span> <span className="type">lender name</span>
          </div>
          <div>
            <span className="field">State of Incorporation</span> <span className="type">state</span>
          </div>
        </div>

        {/* ASSIGN TO REP */}
        <div className="csv-assign">
          <label style={{ fontSize: '9px', color: 'var(--muted)', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Assign all deals to rep
          </label>
          <select
            value={assignRepId}
            onChange={e => onAssignRepChange(e.target.value)}
            style={{
              width: '100%', padding: '6px 8px', marginTop: '4px',
              background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--faint)',
              borderRadius: '6px', fontSize: '11px', outline: 'none',
            }}
          >
            <option value="">Auto-detect from CSV (rep_name column)</option>
            {reps.map(r => (
              <option key={r.id} value={r.id}>{r.firstName} {r.lastName} ({r.initials})</option>
            ))}
          </select>
        </div>

        <div
          className="csv-drop"
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="csv-drop-icon">{file ? '✅' : '⬆'}</div>
          <div className="csv-drop-txt">{file ? file.name : 'Drop CSV here or click to browse'}</div>
          <div className="csv-drop-sub">{file ? `${(file.size / 1024).toFixed(1)} KB` : '.csv files only'}</div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv"
          style={{ display: 'none' }}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            onFileSelect(f);
          }}
        />

        {/* UNDO LAST IMPORT */}
        {lastImportBatch && (
          <div style={{
            background: 'rgba(201,162,39,0.1)', border: '1px solid var(--gold)',
            borderRadius: '6px', padding: '8px 10px', marginBottom: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span style={{ fontSize: '10px', color: 'var(--text)' }}>
              Last import: {lastImportBatch.count} deals
            </span>
            <button
              onClick={() => onUndoImport(lastImportBatch.batchId)}
              style={{
                background: 'var(--red)', color: '#fff', border: 'none',
                borderRadius: '4px', padding: '4px 10px', fontSize: '10px',
                cursor: 'pointer', fontWeight: 600,
              }}
            >
              ↩ Undo Import
            </button>
          </div>
        )}

        <div className="csv-acts">
          <button className="csv-btn csv-cancel" onClick={onClose}>
            Cancel
          </button>
          <button className="csv-btn csv-import" disabled={!file || importing} onClick={onImport}>
            {importing ? 'Importing…' : 'Import'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── RENEWAL / REVIVE QUEUE CARD ──

function RenewalQueueCard({ deals, index, onNav }: { deals: Deal[]; index: number; onNav: (i: number) => void }) {
  const clampedIndex = Math.min(index, deals.length - 1);
  const deal = deals[clampedIndex];
  if (!deal) return null;

  function getReasonTag(d: Deal): { cls: string; label: string; icon: string } {
    const src = (d as any).reviveSource as string | undefined;
    if (src === 'renewal' || d.stage === 'FUNDED') return { cls: 'rr-renewal', label: 'Renewal Eligible', icon: '↻' };
    if (src === 'revive' || d.stage === 'APPROVED_OFFERS') return { cls: 'rr-revive', label: 'Revive', icon: '⚡' };
    if (src === 'statement_refresh' || d.stage === 'SUBMITTED_IN_REVIEW') return { cls: 'rr-stmts', label: 'Statement Refresh', icon: '📄' };
    if (d.stage === 'NURTURE') return { cls: 'rr-nurture', label: 'Nurture', icon: '🌱' };
    if (src === 'follow_up') return { cls: 'rr-expired', label: 'Follow-Up Due', icon: '📅' };
    return { cls: 'rr-expired', label: 'Expired', icon: '⏳' };
  }

  function getQueueReason(d: Deal): string {
    const src = (d as any).reviveSource as string | undefined;
    if (src === 'renewal') {
      const days = d.fundedDate ? Math.floor((Date.now() - new Date(d.fundedDate).getTime()) / 86400000) : 0;
      return `Prior funded client — last funded ${days} days ago. ${d.productType || 'MCA'} product with ${fmtCurrency(d.dealAmount || 0)} prior amount. Eligible for renewal outreach.`;
    }
    if (src === 'revive') return `Deal in ${STAGE_LABELS[d.stage] || d.stage} with no activity for ${d.staleDays || 30}+ days. Consider re-engaging or closing.`;
    if (src === 'statement_refresh') return `Submitted ${d.staleDays || 21}+ days ago with no lender update. Request fresh statements or follow up with lender.`;
    if (src === 'follow_up') return `Follow-up was scheduled and is now past due. Contact client to maintain momentum.`;
    return `This deal requires attention based on pipeline analysis.`;
  }

  const reason = getReasonTag(deal);
  const queueReason = getQueueReason(deal);
  const renewalPotential = deal.stage === 'FUNDED' && deal.dealAmount
    ? `~${fmtCurrency(Math.round(deal.dealAmount * 0.8))}–${fmtCurrency(Math.round(deal.dealAmount * 1.2))} renewal`
    : null;

  const lastActivityAgo = deal.lastActivityAt
    ? Math.floor((Date.now() - new Date(deal.lastActivityAt).getTime()) / 86400000)
    : null;

  return (
    <div className="rrq-wrap">
      <div className="rrq-header">
        <div className="rrq-title-row">
          <div className="rrq-icon">
            <svg width="10" height="10" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0110.9-3.5M14 8a6 6 0 01-10.9 3.5M14 4.5v-3h-3M2 11.5v3h3" stroke="#a8b4d8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
          <div>
            <div className="rrq-title">Renewal / Revive Queue</div>
            <div className="rrq-sub">Prior clients · expired offers · nurtures · statement refreshes · derived from pipeline history</div>
          </div>
        </div>
        <div className="rrq-meta-row">
          <div className="rrq-counter">
            0 / <strong>{deals.length}</strong> worked today
          </div>
          <div className="rrq-progress-pills">
            {deals.slice(0, 10).map((_, i) => (
              <div
                key={i}
                className={`rrq-pill ${i < clampedIndex ? 'done' : i === clampedIndex ? 'current' : 'pending'}`}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="rrq-body">
        <div className="rrq-card">
          <div className={`rrq-reason-tag ${reason.cls}`}>{reason.icon} {reason.label}</div>
          <div className="rrq-deal-row">
            <div>
              <div className="rrq-deal-name">{deal.client?.businessName || 'Unknown'}</div>
              <div className="rrq-deal-meta">
                {deal.productType && <span className="rrq-meta-pill highlight">{deal.productType}</span>}
                <span className="rrq-meta-pill">prior funded</span>
                {deal.assignedRep && (
                  <span className="rrq-meta-pill">
                    {deal.assignedRep.initials ||
                      (deal.assignedRep.firstName[0] + deal.assignedRep.lastName[0]).toUpperCase()}
                  </span>
                )}
                {deal.fundedDate && (
                  <span className="rrq-meta-pill">funded {new Date(deal.fundedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                )}
              </div>
            </div>
            <div className="rrq-deal-amounts">
              <div className="rrq-prior-amt">{deal.dealAmount ? fmtCurrency(deal.dealAmount) : 'TBD'}</div>
              <div className="rrq-prior-lbl">Prior amount</div>
              {renewalPotential && <div className="rrq-renewal-potential">{renewalPotential}</div>}
            </div>
          </div>
          <div className="rrq-detail-grid">
            <div className="rrq-detail-cell">
              <div className="rrq-detail-lbl">Queue Reason</div>
              <div className="rrq-detail-val">{reason.label}</div>
            </div>
            <div className="rrq-detail-cell">
              <div className="rrq-detail-lbl">Last Activity</div>
              <div className={`rrq-detail-val ${(lastActivityAgo ?? 0) > 30 ? 'warn' : 'ok'}`}>{lastActivityAgo ?? 0}d ago</div>
            </div>
            <div className="rrq-detail-cell">
              <div className="rrq-detail-lbl">Data Source</div>
              <div className="rrq-detail-val neutral">{(deal as any).reviveSource === 'renewal' ? 'Funded History' : (deal as any).reviveSource === 'statement_refresh' ? 'Pipeline Age' : (deal as any).reviveSource === 'follow_up' ? 'Follow-Up Log' : 'Stage Tracker'}</div>
            </div>
          </div>
          <div className="rrq-reason-box">
            <div className="rrq-reason-lbl">Why this is in your queue</div>
            <div className="rrq-reason-text">{queueReason}</div>
            <div className="rrq-rec">Recommendation: {deal.stage === 'FUNDED' ? 'Call to check renewal interest and request updated statements.' : deal.stage === 'SUBMITTED_IN_REVIEW' ? 'Follow up with lender for status update.' : 'Re-engage client with a check-in call.'}</div>
          </div>
          <div className="rrq-actions">
            <button className="rrq-btn rrq-btn-primary" onClick={() => toast('Request Statements')}>
              Request Statements
            </button>
            <button className="rrq-btn rrq-btn-call" onClick={() => toast('Call Now')}>
              Call Now
            </button>
            <button className="rrq-btn rrq-btn-reopen" onClick={() => toast('Reopen')}>
              Reopen
            </button>
            <button className="rrq-btn rrq-btn-complete" onClick={() => {
              toast('Marked complete');
              onNav(Math.min(clampedIndex + 1, deals.length - 1));
            }}>
              ✓ Complete
            </button>
            <button
              className="rrq-btn rrq-btn-skip"
              onClick={() => onNav(Math.min(clampedIndex + 1, deals.length - 1))}
            >
              Skip
            </button>
          </div>
        </div>
      </div>
      <div className="rrq-nav">
        <div className="rrq-nav-left">
          <button className="rrq-nav-btn" disabled={clampedIndex === 0} onClick={() => onNav(clampedIndex - 1)}>
            ← Prev
          </button>
          <button
            className="rrq-nav-btn"
            disabled={clampedIndex >= deals.length - 1}
            onClick={() => onNav(clampedIndex + 1)}
          >
            Next →
          </button>
          <span className="rrq-nav-pos">
            Item <strong>{clampedIndex + 1}</strong> of {deals.length}
          </span>
        </div>
        <div className="rrq-nav-right">
          <span className="rrq-complete-all" onClick={() => toast('All items marked complete')}>Mark All Complete ✓</span>
        </div>
      </div>
    </div>
  );
}
