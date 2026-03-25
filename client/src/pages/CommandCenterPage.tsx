import { useQuery } from '@tanstack/react-query';
import { commandCenterApi, repApi } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import {
  DollarSign,
  TrendingUp,
  Flame,
  AlertTriangle,
  Clock,
  Target,
  BarChart3,
  Activity,
  Zap,
  Eye,
} from 'lucide-react';
import { clsx } from 'clsx';
import { formatCurrency } from '../components/pipeline/DealCard';
import type { CommandCenterMetrics, Rep, Deal } from '../types';
import { useState } from 'react';
import DealPanel from '../components/pipeline/DealPanel';

const STAGE_LABELS: Record<string, string> = {
  NEW_LEAD: 'New Lead',
  ENGAGED_INTERESTED: 'Engaged',
  QUALIFIED: 'Qualified',
  SUBMITTED_IN_REVIEW: 'Submitted',
  APPROVED_OFFERS: 'Approved',
  COMMITTED_FUNDING: 'Committed',
  FUNDED: 'Funded',
  NURTURE: 'Nurture',
  CLOSED: 'Closed',
};

const PRODUCT_BAR_COLORS: Record<string, string> = {
  MCA: 'bg-amber-500',
  LOC: 'bg-blue-500',
  EQUIPMENT: 'bg-green-500',
  HELOC: 'bg-purple-500',
  SBA: 'bg-blue-600',
  CRE: 'bg-rose-500',
  BRIDGE: 'bg-teal-500',
};

export default function CommandCenterPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [selectedDealId, setSelectedDealId] = useState<string | null>(null);
  const [simRepId, setSimRepId] = useState<string>('');

  const repFilterParam: Record<string, string> = simRepId ? { repId: simRepId } : {};

  const { data: reps } = useQuery({
    queryKey: ['reps'],
    queryFn: async () => {
      const { data } = await repApi.getReps({ activeOnly: 'true' });
      return data as Rep[];
    },
    enabled: isAdmin,
  });

  // Main metrics
  const { data: metrics, isLoading } = useQuery({
    queryKey: ['command-center', 'metrics', simRepId],
    queryFn: async () => {
      const { data } = await commandCenterApi.getMetrics(repFilterParam);
      return data as CommandCenterMetrics;
    },
    refetchInterval: 30000,
  });

  const { data: queue } = useQuery({
    queryKey: ['command-center', 'operator-queue', simRepId],
    queryFn: async () => {
      const { data } = await commandCenterApi.getOperatorQueue(repFilterParam);
      return data as Deal[];
    },
    refetchInterval: 30000,
  });

  const { data: hotLeads } = useQuery({
    queryKey: ['command-center', 'hot-leads', simRepId],
    queryFn: async () => {
      const { data } = await commandCenterApi.getHotLeads(repFilterParam);
      return data as Deal[];
    },
    refetchInterval: 30000,
  });

  const { data: staleDeals } = useQuery({
    queryKey: ['command-center', 'stale-deals', simRepId],
    queryFn: async () => {
      const { data } = await commandCenterApi.getStaleDeals(repFilterParam);
      return data as Deal[];
    },
    refetchInterval: 30000,
  });

  // Intelligence (admin only)
  const { data: intelligence } = useQuery({
    queryKey: ['command-center', 'intelligence'],
    queryFn: async () => {
      const { data } = await commandCenterApi.getIntelligence();
      return data;
    },
    enabled: isAdmin && !simRepId,
    refetchInterval: 60000,
  });

  const { data: execScores } = useQuery({
    queryKey: ['command-center', 'execution-scores'],
    queryFn: async () => {
      const { data } = await commandCenterApi.getExecutionScores();
      return data;
    },
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  const { data: productMix } = useQuery({
    queryKey: ['command-center', 'product-mix'],
    queryFn: async () => {
      const { data } = await commandCenterApi.getProductMix();
      return data;
    },
    enabled: isAdmin,
    refetchInterval: 60000,
  });

  const { data: activityFeed } = useQuery({
    queryKey: ['command-center', 'activity-feed'],
    queryFn: async () => {
      const { data } = await commandCenterApi.getActivityFeed();
      return data;
    },
    refetchInterval: 15000,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-scl-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const mz = metrics?.moneyZone;
  const ez = metrics?.executionZone;

  return (
    <div className="p-4 space-y-6 overflow-y-auto max-h-[calc(100vh-64px)]">
      {/* Header + Admin Sim Mode */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)]">Command Center</h1>
          <p className="text-xs text-[var(--text-muted)]">
            Real-time pipeline intelligence
            <span className="ml-2 text-green-400">● Live</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && reps && (
            <div className="flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5 text-[var(--text-muted)]" />
              <select
                value={simRepId}
                onChange={(e) => setSimRepId(e.target.value)}
                className="text-xs px-2 py-1 rounded bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-[var(--text-primary)]"
              >
                <option value="">Admin View</option>
                {reps.map((r: Rep) => (
                  <option key={r.id} value={r.id}>
                    {r.initials} — {r.firstName} {r.lastName}
                  </option>
                ))}
              </select>
            </div>
          )}
          {isAdmin && execScores && !simRepId && (
            <div className="px-2.5 py-1 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-xs">
              <span className="text-[var(--text-muted)]">Team Score: </span>
              <span
                className={clsx(
                  'font-bold',
                  (execScores as any[]).reduce((a: number, s: any) => a + s.score, 0) /
                    Math.max(1, (execScores as any[]).length) >=
                    75
                    ? 'text-green-400'
                    : (execScores as any[]).reduce((a: number, s: any) => a + s.score, 0) /
                          Math.max(1, (execScores as any[]).length) >=
                        50
                      ? 'text-amber-400'
                      : 'text-red-400',
                )}
              >
                {Math.round(
                  (execScores as any[]).reduce((a: number, s: any) => a + s.score, 0) /
                    Math.max(1, (execScores as any[]).length),
                )}
                %
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Money Zone */}
      <section>
        <h2 className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-3 flex items-center gap-2">
          <DollarSign className="w-3.5 h-3.5" /> Money Zone
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <MetricCard
            label="Funded MTD"
            value={formatCurrency(mz?.fundedMTD)}
            icon={TrendingUp}
            color="text-green-400"
          />
          <MetricCard
            label="Pipeline Value"
            value={formatCurrency(mz?.pipelineValue)}
            icon={DollarSign}
            color="text-scl-500"
          />
          <MetricCard
            label="Committed"
            value={formatCurrency(mz?.committedValue)}
            icon={Target}
            color="text-cyan-400"
          />
          <MetricCard label="At Risk" value={formatCurrency(mz?.atRisk)} icon={AlertTriangle} color="text-red-400" />
          <MetricCard
            label="Goal Progress"
            value={`${Math.round(mz?.goalProgress || 0)}%`}
            icon={BarChart3}
            color={
              mz?.goalProgress && mz.goalProgress >= 80
                ? 'text-green-400'
                : mz?.goalProgress && mz.goalProgress >= 50
                  ? 'text-amber-400'
                  : 'text-red-400'
            }
          />
          <MetricCard
            label="Projected"
            value={formatCurrency(mz?.projectedMonthEnd)}
            icon={TrendingUp}
            color="text-blue-400"
          />
        </div>
        {/* Goal progress bar */}
        {mz?.goalProgress !== undefined && (
          <div className="mt-2 h-2 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all',
                mz.goalProgress >= 80 ? 'bg-green-500' : mz.goalProgress >= 50 ? 'bg-amber-500' : 'bg-red-500',
              )}
              style={{ width: `${Math.min(100, mz.goalProgress)}%` }}
            />
          </div>
        )}
        {/* Future Opportunities */}
        {metrics?.futureOpportunities && typeof metrics.futureOpportunities === 'object' && (
          <div className="grid grid-cols-3 gap-3 mt-3">
            <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-center">
              <p className="text-lg font-bold text-[var(--text-primary)]">{metrics.futureOpportunities.next7d || 0}</p>
              <p className="text-[10px] text-[var(--text-muted)]">Next 7 Days</p>
            </div>
            <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-center">
              <p className="text-lg font-bold text-[var(--text-primary)]">{metrics.futureOpportunities.next30d || 0}</p>
              <p className="text-[10px] text-[var(--text-muted)]">Next 30 Days</p>
            </div>
            <div className="p-2 rounded-lg bg-[var(--bg-secondary)] border border-[var(--border-primary)] text-center">
              <p className="text-lg font-bold text-[var(--text-primary)]">{metrics.futureOpportunities.total || 0}</p>
              <p className="text-[10px] text-[var(--text-muted)]">Total Pipeline</p>
            </div>
          </div>
        )}
      </section>

      {/* Execution Zone */}
      <section>
        <h2 className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-3 flex items-center gap-2">
          <Zap className="w-3.5 h-3.5" /> Execution Zone
        </h2>
        <div className="grid grid-cols-3 gap-3">
          <ExecCard label="Hot Deals" count={ez?.hotCount || 0} color="bg-orange-500" icon={Flame} />
          <ExecCard label="Stale (24h+)" count={ez?.staleCount || 0} color="bg-amber-500" icon={Clock} />
          <ExecCard label="Overdue Tasks" count={ez?.overdueCount || 0} color="bg-red-500" icon={AlertTriangle} />
        </div>
      </section>

      {/* Two-column: Operator Queue + Hot/Stale */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Operator Queue */}
        <section className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-3">Operator Queue</h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {!queue || queue.length === 0 ? (
              <p className="text-xs text-[var(--text-muted)] text-center py-4">No pending actions</p>
            ) : (
              queue.slice(0, 15).map((deal: Deal) => (
                <div
                  key={deal.id}
                  onClick={() => setSelectedDealId(deal.id)}
                  className="flex items-center gap-3 p-2 rounded-lg hover:bg-[var(--bg-tertiary)] cursor-pointer transition"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--text-primary)] truncate">
                      {deal.client?.businessName}
                    </p>
                    <p className="text-[10px] text-[var(--text-muted)]">
                      {deal.nextAction || 'No action set'}{' '}
                      {deal.nextActionDue ? `— due ${new Date(deal.nextActionDue).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  {deal.dealAmount && (
                    <span className="text-xs font-semibold text-[var(--text-secondary)]">
                      {formatCurrency(deal.dealAmount)}
                    </span>
                  )}
                  {deal.isHot && <Flame className="w-3 h-3 text-orange-500 flex-shrink-0" />}
                </div>
              ))
            )}
          </div>
        </section>

        {/* Hot + Stale */}
        <div className="space-y-4">
          <section className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-orange-400 mb-3 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5" /> Hot Deals ({hotLeads?.length || 0})
            </h3>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {hotLeads?.slice(0, 8).map((deal: Deal) => (
                <DealRow key={deal.id} deal={deal} onClick={() => setSelectedDealId(deal.id)} />
              ))}
              {(!hotLeads || hotLeads.length === 0) && (
                <p className="text-xs text-[var(--text-muted)] text-center py-2">No hot deals</p>
              )}
            </div>
          </section>

          <section className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
            <h3 className="text-sm font-semibold text-amber-400 mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> Stale Deals ({staleDeals?.length || 0})
              {staleDeals && staleDeals.length > 0 && (
                <span className="text-[10px] font-normal text-[var(--text-muted)] ml-auto">
                  ${staleDeals.reduce((a: number, d: Deal) => a + (d.dealAmount || 0), 0).toLocaleString()} at risk
                </span>
              )}
            </h3>
            <div className="space-y-1.5 max-h-[180px] overflow-y-auto">
              {staleDeals?.slice(0, 8).map((deal: Deal) => (
                <DealRow key={deal.id} deal={deal} onClick={() => setSelectedDealId(deal.id)} />
              ))}
              {(!staleDeals || staleDeals.length === 0) && (
                <p className="text-xs text-[var(--text-muted)] text-center py-2">No stale deals</p>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Intelligence Zone (Admin only) */}
      {isAdmin && intelligence && !simRepId && (
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Intelligence Zone
          </h2>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Pipeline Snapshot bar chart */}
            {intelligence.stageSnapshot && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 lg:col-span-2">
                <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-3">Pipeline Snapshot</h3>
                <div className="space-y-2">
                  {intelligence.stageSnapshot.map((s: any) => {
                    const maxCount = Math.max(...intelligence.stageSnapshot.map((x: any) => x.count || 0), 1);
                    return (
                      <div key={s.stage} className="flex items-center gap-2">
                        <span className="text-[10px] text-[var(--text-muted)] w-20 text-right truncate">
                          {STAGE_LABELS[s.stage] || s.stage}
                        </span>
                        <div className="flex-1 h-5 bg-[var(--bg-tertiary)] rounded overflow-hidden">
                          <div
                            className="h-full bg-scl-500/60 rounded flex items-center px-1.5"
                            style={{ width: `${Math.max(5, (s.count / maxCount) * 100)}%` }}
                          >
                            <span className="text-[9px] text-white font-medium">{s.count}</span>
                          </div>
                        </div>
                        {s.stage !== 'SUBMITTED_IN_REVIEW' && s.value > 0 && (
                          <span className="text-[10px] text-[var(--text-muted)] w-16 text-right">
                            {formatCurrency(s.value)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conversion Funnel */}
            {intelligence.conversionFunnel && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-3">Conversion Funnel</h3>
                <div className="space-y-1">
                  {intelligence.conversionFunnel.map((step: any, i: number) => {
                    const maxW = Math.max(...intelligence.conversionFunnel.map((x: any) => x.count || 0), 1);
                    const pct = maxW > 0 ? (step.count / maxW) * 100 : 0;
                    return (
                      <div key={step.stage}>
                        <div
                          className="py-1.5 rounded text-center text-[10px] font-medium text-white"
                          style={{
                            width: `${Math.max(30, pct)}%`,
                            backgroundColor: `hsl(${220 + i * 25}, 60%, ${55 - i * 5}%)`,
                            margin: '0 auto',
                          }}
                        >
                          {step.count} {STAGE_LABELS[step.stage] || step.stage}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Row 2: Bottlenecks + Rep Activity + Execution Scores */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
            {/* Bottleneck Analysis */}
            {intelligence.bottlenecks && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-2">Stage Bottlenecks</h3>
                <div className="space-y-2">
                  {intelligence.bottlenecks.slice(0, 5).map((b: any) => (
                    <div key={b.stage} className="flex justify-between text-xs">
                      <span className="text-[var(--text-secondary)]">{STAGE_LABELS[b.stage] || b.stage}</span>
                      <div>
                        <span className="font-medium text-[var(--text-primary)]">{b.count} deals</span>
                        {b.value > 0 && (
                          <span className="text-[var(--text-muted)] ml-1">({formatCurrency(b.value)})</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Rep Activity */}
            {intelligence.repActivity && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-2">Rep Activity</h3>
                <div className="space-y-2">
                  {intelligence.repActivity.map((r: any) => (
                    <div key={r.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ backgroundColor: r.avatarColor || '#6366f1' }}
                        >
                          {r.initials}
                        </div>
                        <span className="text-[var(--text-secondary)]">{r.initials}</span>
                      </div>
                      <span className="font-medium text-[var(--text-primary)]">{r.activeDeals} active</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Execution Scores */}
            {execScores && (
              <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
                <h3 className="text-xs font-semibold text-[var(--text-primary)] mb-2">Execution Scores</h3>
                <div className="space-y-2">
                  {(execScores as any[]).map((s: any) => (
                    <div key={s.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center text-[8px] font-bold text-white"
                          style={{ backgroundColor: s.avatarColor || '#6366f1' }}
                        >
                          {s.initials}
                        </div>
                        <span className="text-[var(--text-secondary)]">{s.initials}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
                          <div
                            className={clsx(
                              'h-full rounded-full',
                              s.score >= 75 ? 'bg-green-500' : s.score >= 50 ? 'bg-amber-500' : 'bg-red-500',
                            )}
                            style={{ width: `${s.score}%` }}
                          />
                        </div>
                        <span
                          className={clsx(
                            'font-bold',
                            s.score >= 75 ? 'text-green-400' : s.score >= 50 ? 'text-amber-400' : 'text-red-400',
                          )}
                        >
                          {Math.round(s.score)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Pipeline Health strip */}
          {intelligence.pipelineHealth && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              <HealthBar label="Has Next Action" value={intelligence.pipelineHealth.withNextAction} />
              <HealthBar label="Touched 48h" value={intelligence.pipelineHealth.touched48h} />
              <HealthBar label="Properly Staged" value={intelligence.pipelineHealth.properlyStaged} />
            </div>
          )}
        </section>
      )}

      {/* Product Mix (Admin) */}
      {isAdmin && productMix && !simRepId && (
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <BarChart3 className="w-3.5 h-3.5" /> Product Mix
          </h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4">
            <div className="h-6 rounded-full overflow-hidden flex">
              {((productMix as any).breakdown || []).map(
                (p: any) =>
                  p.percentage > 0 && (
                    <div
                      key={p.product}
                      className={clsx(
                        'flex items-center justify-center text-[9px] font-bold text-white',
                        PRODUCT_BAR_COLORS[p.product] || 'bg-gray-500',
                      )}
                      style={{ width: `${p.percentage}%` }}
                      title={`${p.product}: ${p.percentage.toFixed(1)}%`}
                    >
                      {p.percentage >= 8 ? p.product : ''}
                    </div>
                  ),
              )}
            </div>
            <div className="flex flex-wrap gap-3 mt-2">
              {((productMix as any).breakdown || []).map((p: any) => (
                <span key={p.product} className="text-[10px] text-[var(--text-muted)]">
                  <span
                    className={clsx(
                      'inline-block w-2 h-2 rounded-full mr-1',
                      PRODUCT_BAR_COLORS[p.product] || 'bg-gray-500',
                    )}
                  />
                  {p.product} {p.percentage.toFixed(0)}%
                </span>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Activity Feed */}
      {activityFeed && (activityFeed as any[]).length > 0 && (
        <section>
          <h2 className="text-xs font-semibold uppercase text-[var(--text-muted)] mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" /> Activity Feed
          </h2>
          <div className="bg-[var(--bg-secondary)] border border-[var(--border-primary)] rounded-xl p-4 max-h-[300px] overflow-y-auto space-y-2">
            {(activityFeed as any[]).slice(0, 20).map((event: any, idx: number) => (
              <div key={event.id || idx} className="flex items-start gap-2 text-xs">
                <div className="w-1.5 h-1.5 rounded-full bg-scl-500 mt-1.5 flex-shrink-0" />
                <div className="flex-1">
                  <span className="font-medium text-[var(--text-primary)]">{event.eventType?.replace(/_/g, ' ')}</span>
                  {event.note && <span className="text-[var(--text-muted)]"> — {event.note}</span>}
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {event.rep?.firstName ? `${event.rep.firstName} ${event.rep.lastName}` : ''} ·{' '}
                    {new Date(event.createdAt).toLocaleString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Deal Panel */}
      {selectedDealId && <DealPanel dealId={selectedDealId} onClose={() => setSelectedDealId(null)} />}
    </div>
  );
}

// ─── Sub-components ───

function MetricCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className={clsx('w-3.5 h-3.5', color)} />
        <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase">{label}</span>
      </div>
      <p className="text-lg font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}

function ExecCard({ label, count, color, icon: Icon }: { label: string; count: number; color: string; icon: any }) {
  return (
    <div className="p-4 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)] flex items-center gap-3">
      <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', color)}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-[var(--text-primary)]">{count}</p>
        <p className="text-[10px] text-[var(--text-muted)]">{label}</p>
      </div>
    </div>
  );
}

function DealRow({ deal, onClick }: { deal: Deal; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className="flex items-center justify-between p-1.5 rounded hover:bg-[var(--bg-tertiary)] cursor-pointer transition"
    >
      <div className="flex-1 min-w-0">
        <span className="text-xs text-[var(--text-primary)] truncate block">{deal.client?.businessName}</span>
      </div>
      {deal.dealAmount && (
        <span className="text-[10px] font-semibold text-[var(--text-secondary)] ml-2">
          {formatCurrency(deal.dealAmount)}
        </span>
      )}
      <span className="text-[10px] text-[var(--text-muted)] ml-2">{deal.staleDays}d</span>
    </div>
  );
}

function HealthBar({ label, value }: { label: string; value?: number }) {
  const pct = value || 0;
  return (
    <div className="p-3 rounded-xl bg-[var(--bg-secondary)] border border-[var(--border-primary)]">
      <div className="flex justify-between text-[10px] text-[var(--text-muted)] mb-1">
        <span>{label}</span>
        <span
          className={clsx('font-bold', pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-amber-400' : 'text-red-400')}
        >
          {pct}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-[var(--bg-tertiary)] overflow-hidden">
        <div
          className={clsx(
            'h-full rounded-full',
            pct >= 80 ? 'bg-green-500' : pct >= 50 ? 'bg-amber-500' : 'bg-red-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
