import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { DashboardStats } from '../types';
import {
  Send,
  Users,
  Bot,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  AlertTriangle,
  Plus,
  Upload,
  CheckCircle2,
  TrendingUp,
  Radio,
  FlaskConical,
  Shield,
  Clock,
  Zap,
  XCircle,
  ShieldAlert,
  Server,
  Database,
  Wifi,
  Phone,
  BarChart3,
  Timer,
  AlertOctagon,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { useThemeStore } from '../stores/themeStore';
import { clsx } from 'clsx';

// Compact currency for pipeline values: 1500 → "$1.5K", 2300000 → "$2.3M"
function formatCurrencyCompact(value: number): string {
  if (!value || value <= 0) return '$0';
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

const SMS_MODE_CONFIG: Record<
  string,
  { label: string; desc: string; color: string; bg: string; border: string; icon: any }
> = {
  live: {
    label: 'Live',
    desc: 'Real SMS sent via production Twilio',
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    border: 'border-green-500/30',
    icon: Radio,
  },
  twilio_test: {
    label: 'Twilio Test',
    desc: 'API calls via test credentials — no real delivery',
    color: 'text-cyan-400',
    bg: 'bg-cyan-500/10',
    border: 'border-cyan-500/30',
    icon: Shield,
  },
  simulation: {
    label: 'Simulation',
    desc: 'No API calls — messages simulated locally',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    icon: FlaskConical,
  },
};

export default function DashboardPage() {
  return <DashboardOverview />;
}

export function DashboardOverview() {
  const navigate = useNavigate();
  const isDark = useThemeStore((s) => s.resolved) === 'dark';

  const { data, isLoading, isError } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/stats');
      return data;
    },
    refetchInterval: 30000,
  });

  const { data: diagData } = useQuery({
    queryKey: ['diagnostics'],
    queryFn: async () => {
      const { data } = await api.get('/dashboard/diagnostics');
      return data;
    },
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-dark-800 rounded w-48" />
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-32 bg-dark-800 rounded-xl" />
            ))}
          </div>
          <div className="h-80 bg-dark-800 rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8">
        <div className="card p-12 text-center">
          <AlertTriangle className="w-12 h-12 mx-auto text-red-400 mb-4" />
          <p className="text-dark-300 font-medium">Failed to load dashboard</p>
          <p className="text-sm text-dark-500 mt-1">Check your connection and try refreshing</p>
        </div>
      </div>
    );
  }

  const stats = data;
  const smsMode = diagData?.smsMode || 'live';
  const modeConfig = SMS_MODE_CONFIG[smsMode] || SMS_MODE_CONFIG.live;
  const ModeIcon = modeConfig.icon;
  const diag = diagData || {};
  const d24 = diag.stats24h || {};
  const d7 = diag.stats7d || {};
  const d24ErrorRate = Math.min(100, Math.max(0, Number(d24.errorRate || 0)));
  const d7ErrorRate = Math.min(100, Math.max(0, Number(d7.errorRate || 0)));
  const sending = diag.sending || {};
  const numbers = diag.numbers || {};
  const health = diag.health || {};

  return (
    <div className="p-6 lg:p-8 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-dark-50">Dashboard</h1>
          <p className="text-sm text-dark-400 mt-1">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} &middot; {format(new Date(), 'HH:mm')}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate('/campaigns', { state: { openCreate: true } })}
            className="btn-primary text-sm"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Create Campaign
          </button>
          <button
            onClick={() => navigate('/leads', { state: { openImport: true } })}
            className="btn-ghost text-sm border border-dark-600"
          >
            <Upload className="w-4 h-4 mr-1.5" />
            Import Leads
          </button>
        </div>
      </div>

      {/* SMS Mode Banner */}
      <div
        className={clsx(
          'rounded-xl border p-4 flex items-center justify-between transition-colors',
          modeConfig.bg,
          modeConfig.border,
        )}
      >
        <div className="flex items-center gap-3">
          <div className={clsx('w-10 h-10 rounded-lg flex items-center justify-center', modeConfig.bg)}>
            <ModeIcon className={clsx('w-5 h-5', modeConfig.color)} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className={clsx('text-sm font-semibold', modeConfig.color)}>{modeConfig.label} Mode</span>
              <span
                className={clsx(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider',
                  modeConfig.bg,
                  modeConfig.color,
                )}
              >
                <span
                  className={clsx(
                    'w-1.5 h-1.5 rounded-full animate-pulse',
                    smsMode === 'live' ? 'bg-green-400' : smsMode === 'twilio_test' ? 'bg-cyan-400' : 'bg-amber-400',
                  )}
                />
                Active
              </span>
            </div>
            <p className="text-xs text-dark-400 mt-0.5">{modeConfig.desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {/* System Health Dots */}
          <div className="flex items-center gap-3 text-xs text-dark-400">
            <span className="flex items-center gap-1.5" title="Database">
              <Database className="w-3.5 h-3.5" />
              <span className={clsx('w-2 h-2 rounded-full', health.database ? 'bg-green-500' : 'bg-red-500')} />
            </span>
            <span className="flex items-center gap-1.5" title="Redis">
              <Server className="w-3.5 h-3.5" />
              <span className={clsx('w-2 h-2 rounded-full', health.redis ? 'bg-green-500' : 'bg-red-500')} />
            </span>
            <span className="flex items-center gap-1.5" title="Twilio">
              <Wifi className="w-3.5 h-3.5" />
              <span
                className={clsx(
                  'w-2 h-2 rounded-full',
                  smsMode === 'live' ? 'bg-green-500' : smsMode === 'twilio_test' ? 'bg-cyan-500' : 'bg-dark-500',
                )}
              />
            </span>
          </div>
          <Link to="/settings?tab=system" className="text-xs text-dark-400 hover:text-dark-200 transition-colors">
            Settings →
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Sent (24h)"
          value={stats?.overview.sentLast24h || 0}
          icon={Send}
          color="blue"
          sub={d24.sent > 0 ? `${d24.deliveryRate}% delivered` : undefined}
        />
        <StatCard
          label="Delivered (24h)"
          value={stats?.overview.deliveredLast24h || 0}
          icon={CheckCircle2}
          color="blue"
          sub={d24.failed > 0 ? `${d24.failed} failed` : 'No failures'}
        />
        <StatCard label="Total Leads" value={stats?.overview.totalLeads || 0} icon={Users} color="amber" />
        <StatCard
          label="Reply Rate (7d)"
          value={`${stats?.overview.replyRate || 0}%`}
          icon={TrendingUp}
          color="green"
          sub={d7.sent > 0 ? `${d7.sent.toLocaleString()} sent in 7d` : undefined}
        />
        <StatCard
          label="Active Automations"
          value={stats?.overview.activeAutomations || 0}
          icon={Bot}
          color="purple"
          sub={`${numbers.active || 0} active numbers`}
        />
      </div>

      {/* Sending Activity + Diagnostics Row */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sending Velocity */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-scl-400" />
            <span className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Velocity</span>
          </div>
          <p className="text-3xl font-bold text-dark-100">{sending.velocityPerHour || 0}</p>
          <p className="text-xs text-dark-500 mt-1">messages / last hour</p>
          <div className="mt-3 pt-3 border-t border-dark-700/50">
            <div className="flex items-center justify-between text-xs">
              <span className="text-dark-400">In queue</span>
              <span className="text-dark-200 font-medium">{sending.pendingInQueue || 0}</span>
            </div>
          </div>
        </div>

        {/* 24h Summary */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-dark-300 uppercase tracking-wider">24h Summary</span>
          </div>
          <div className="space-y-2">
            <MiniStat label="Sent" value={d24.sent || 0} color="text-dark-200" />
            <MiniStat label="Delivered" value={d24.delivered || 0} color="text-green-400" />
            <MiniStat label="Failed" value={d24.failed || 0} color="text-red-400" />
            <MiniStat label="Blocked" value={d24.blocked || 0} color="text-yellow-400" />
          </div>
        </div>

        {/* Error Rate — с hover-тултипом */}
        <ErrorRateCard errorRate={d24ErrorRate} breakdown={diag.errorBreakdown || []} total24h={d24} />

        {/* Numbers & Last Activity */}
        <div className="card p-5">
          <div className="flex items-center gap-2 mb-3">
            <Phone className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Numbers</span>
          </div>
          <div className="space-y-2">
            <MiniStat label="Active" value={numbers.active || 0} color="text-green-400" />
            <MiniStat label="Warming" value={numbers.warming || 0} color="text-yellow-400" />
            <MiniStat label="Cooling" value={numbers.cooling || 0} color="text-blue-400" />
            <MiniStat label="Disabled" value={numbers.disabled || 0} color="text-red-400" />
          </div>
          {sending.lastMessageAt && (
            <div className="mt-3 pt-3 border-t border-dark-700/50">
              <div className="flex items-center gap-1.5 text-xs text-dark-400">
                <Timer className="w-3 h-3" />
                <span>Last sent {formatDistanceToNow(new Date(sending.lastMessageAt), { addSuffix: true })}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Volume Chart */}
        <div className="lg:col-span-2 card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-semibold text-dark-200">Send Volume (7 Days)</h3>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-scl-500" />
                Delivered
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500" />
                Failed
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-yellow-500" />
                Blocked
              </span>
            </div>
          </div>
          <div className="p-6">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={stats?.dailyVolume || []}>
                <defs>
                  <linearGradient id="colorDelivered" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2B7FE8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#2B7FE8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1A3050' : '#e2e8f0'} />
                <XAxis
                  dataKey="date"
                  stroke={isDark ? '#5A80A8' : '#94a3b8'}
                  fontSize={12}
                  tickFormatter={(val) => format(new Date(val + 'T12:00:00'), 'MMM d')}
                />
                <YAxis stroke={isDark ? '#5A80A8' : '#94a3b8'} fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: isDark ? '#0D1E35' : '#ffffff',
                    border: isDark ? '1px solid #1A3050' : '1px solid #e2e8f0',
                    borderRadius: '8px',
                    color: isDark ? '#B8D4F0' : '#1e293b',
                    boxShadow: isDark ? undefined : '0 4px 12px rgba(0,0,0,0.08)',
                  }}
                  labelFormatter={(val) => format(new Date(val + 'T12:00:00'), 'MMM d, yyyy')}
                />
                <Area
                  type="monotone"
                  dataKey="delivered"
                  stroke="#2B7FE8"
                  fill="url(#colorDelivered)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey="failed"
                  stroke="#ef4444"
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
                <Area
                  type="monotone"
                  dataKey="blocked"
                  stroke="#f59e0b"
                  fill="none"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pipeline */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-dark-200">Pipeline Snapshot</h3>
              <p className="text-[11px] text-dark-500 mt-0.5">
                Total in pipeline:{' '}
                <span className="text-dark-200 font-semibold">
                  {formatCurrencyCompact(
                    (stats?.pipelineSnapshot || []).reduce((acc, s) => acc + (s.totalValue || 0), 0),
                  )}
                </span>
              </p>
            </div>
            <Link to="/pipeline" className="text-xs text-scl-400 hover:text-scl-300 px-2 py-1.5 rounded -mr-2">
              View →
            </Link>
          </div>
          <div className="p-4 space-y-2">
            {stats?.pipelineSnapshot?.map((stage) => (
              <div key={stage.id} className="flex items-center justify-between py-1">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stage.color }} />
                  <span className="text-sm text-dark-300 truncate">{stage.name}</span>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0">
                  <span className="text-[11px] text-dark-500" title={`Avg ${formatCurrencyCompact(stage.avgValue)}`}>
                    {stage.totalValue > 0 ? formatCurrencyCompact(stage.totalValue) : '—'}
                  </span>
                  <span className="text-sm font-semibold text-dark-100 tabular-nums w-8 text-right">{stage.count}</span>
                </div>
              </div>
            ))}
            {(!stats?.pipelineSnapshot || stats.pipelineSnapshot.length === 0) && (
              <p className="text-sm text-dark-500 text-center py-4">No pipeline stages configured</p>
            )}
          </div>
        </div>
      </div>

      {/* 7-Day Delivery Health */}
      <div className="card">
        <div className="card-header flex items-center justify-between">
          <h3 className="text-sm font-semibold text-dark-200">7-Day Delivery Health</h3>
          <div className="flex items-center gap-4 text-xs text-dark-400">
            {d7.sent > 0 && (
              <>
                <span>
                  Delivery: <strong className="text-green-400">{d7.deliveryRate}%</strong>
                </span>
                <span>
                  Errors:{' '}
                  <strong className={clsx(d7ErrorRate > 5 ? 'text-red-400' : 'text-yellow-400')}>{d7ErrorRate}%</strong>
                </span>
              </>
            )}
          </div>
        </div>
        <div className="p-6">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
            {[
              { label: 'Total Sent', value: d7.sent || 0, color: 'text-dark-200', Icon: Send },
              { label: 'Delivered', value: d7.delivered || 0, color: 'text-green-400', Icon: CheckCircle2 },
              { label: 'Blocked', value: d7.blocked || 0, color: 'text-yellow-400', Icon: ShieldAlert },
              { label: 'Queued', value: d7.queued || 0, color: 'text-blue-400', Icon: Clock },
              { label: 'Sending', value: d7.sending || 0, color: 'text-purple-400', Icon: Activity },
            ].map((m) => (
              <div key={m.label} className="text-center">
                <m.Icon className={clsx('w-5 h-5 mx-auto mb-2', m.color)} />
                <p className={clsx('text-xl font-bold', m.color)}>{(m.value || 0).toLocaleString()}</p>
                <p className="text-[11px] text-dark-500 mt-1">{m.label}</p>
              </div>
            ))}
            {/* Failed — с тултипом */}
            <FailedMetricWithTooltip value={d7.failed || 0} breakdown={diag.errorBreakdown || []} />
          </div>
        </div>
      </div>

      {/* Recent Errors + Campaigns + Number Health */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Errors */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-semibold text-dark-200">Recent Errors (24h)</h3>
            {(diag.recentErrors?.length || 0) > 0 && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400">
                {diag.recentErrors.length}
              </span>
            )}
          </div>
          <div className="divide-y divide-dark-700/30 max-h-[300px] overflow-y-auto">
            {(!diag.recentErrors || diag.recentErrors.length === 0) && (
              <div className="p-6 text-center">
                <CheckCircle2 className="w-8 h-8 mx-auto text-green-400/50 mb-2" />
                <p className="text-sm text-dark-500">No errors in the last 24 hours</p>
              </div>
            )}
            {diag.recentErrors?.map((err: any) => (
              <div key={err.id} className="px-5 py-3">
                <div className="flex items-center justify-between">
                  <span
                    className={clsx(
                      'text-xs font-medium',
                      err.status === 'BLOCKED' ? 'text-yellow-400' : 'text-red-400',
                    )}
                  >
                    {err.status} {err.errorCode && <span className="font-mono ml-1">#{err.errorCode}</span>}
                  </span>
                  <span className="text-[10px] text-dark-500">
                    {formatDistanceToNow(new Date(err.failedAt || err.createdAt), { addSuffix: true })}
                  </span>
                </div>
                {err.errorMessage && <p className="text-xs text-dark-400 mt-1 truncate">{err.errorMessage}</p>}
                {err.phone && <p className="text-[10px] text-dark-500 mt-0.5 font-mono">{err.phone}</p>}
              </div>
            ))}
          </div>
        </div>

        {/* Recent Campaigns */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-semibold text-dark-200">Recent Campaigns</h3>
            <Link to="/campaigns" className="text-xs text-scl-400 hover:text-scl-300">
              View All →
            </Link>
          </div>
          <div className="divide-y divide-dark-700/30">
            {stats?.recentCampaigns?.length === 0 && (
              <div className="p-6 text-center text-sm text-dark-500">No campaigns yet</div>
            )}
            {stats?.recentCampaigns?.map((campaign) => (
              <div key={campaign.id} className="px-5 py-3.5 flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-dark-200 truncate">{campaign.name}</p>
                  <p className="text-xs text-dark-500 mt-0.5">
                    {campaign.totalSent} sent &middot; {campaign.totalDelivered} delivered
                  </p>
                </div>
                <CampaignStatusBadge status={campaign.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Number Health */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <h3 className="text-sm font-semibold text-dark-200">Number Health</h3>
            <Link to="/numbers" className="text-xs text-scl-400 hover:text-scl-300">
              Manage →
            </Link>
          </div>
          <div className="p-5">
            <div className="space-y-3">
              {stats?.numberHealth?.map(({ status, count }) => (
                <div key={status} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div
                      className={clsx(
                        'w-2.5 h-2.5 rounded-full',
                        status === 'ACTIVE'
                          ? 'bg-green-400'
                          : status === 'WARMING'
                            ? 'bg-yellow-400'
                            : status === 'COOLING'
                              ? 'bg-blue-400'
                              : 'bg-red-400',
                      )}
                    />
                    <span className="text-sm text-dark-300">{status}</span>
                  </div>
                  <span className="text-sm font-medium text-dark-200">{count}</span>
                </div>
              ))}
              {(!stats?.numberHealth || stats.numberHealth.length === 0) && (
                <div className="text-center py-4">
                  <Phone className="w-8 h-8 mx-auto text-dark-600 mb-2" />
                  <p className="text-sm text-dark-500">No numbers configured yet</p>
                  <Link to="/numbers" className="text-xs text-scl-400 hover:text-scl-300 mt-2 inline-block">
                    Add numbers →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Components ─── */

function StatCard({
  label,
  value,
  icon: Icon,
  color,
  sub,
  trend,
}: {
  label: string;
  value: string | number;
  icon: any;
  color: string;
  sub?: string;
  trend?: number;
}) {
  const accentMap: Record<string, string> = {
    indigo: '#2B7FE8',
    blue: '#2B7FE8',
    green: '#1A8A5A',
    purple: '#8A5ACA',
    amber: '#D4820A',
    yellow: '#D4820A',
    red: '#C0392B',
  };

  const accent = accentMap[color] || '#2B7FE8';

  return (
    <div
      className="group transition-all duration-200"
      style={{
        background: 'var(--scl-surface)',
        border: '1px solid var(--scl-border)',
        borderTop: `2px solid ${accent}`,
        borderRadius: '0 0 6px 6px',
        padding: '11px 14px',
      }}
    >
      <div className="flex items-center justify-between">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${accent}20`, color: accent }}
        >
          <Icon className="w-5 h-5" />
        </div>
        {trend !== undefined && (
          <div
            className={clsx(
              'flex items-center gap-0.5 text-xs font-medium',
              trend >= 0 ? 'text-green-400' : 'text-red-400',
            )}
          >
            {trend >= 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
            {Math.abs(trend)}%
          </div>
        )}
      </div>
      <div className="mt-3">
        <p
          style={{
            fontSize: 26,
            fontWeight: 500,
            color: color === 'red' ? 'var(--scl-red)' : 'var(--scl-white)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            marginBottom: 4,
          }}
        >
          {typeof value === 'number' ? value.toLocaleString() : value}
        </p>
        <p
          style={{
            fontSize: 10,
            color: 'var(--scl-text-m)',
            textTransform: 'uppercase',
            letterSpacing: '0.10em',
            marginBottom: 6,
          }}
        >
          {label}
        </p>
        {sub && <p style={{ fontSize: 10, color: 'var(--scl-text-b)' }}>{sub}</p>}
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-dark-400">{label}</span>
      <span className={clsx('font-semibold', color)}>{value.toLocaleString()}</span>
    </div>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    DRAFT: 'badge bg-dark-600/50 text-dark-300',
    SCHEDULED: 'badge-info',
    SENDING: 'badge-warning',
    PAUSED: 'badge bg-orange-500/20 text-orange-400',
    COMPLETED: 'badge-success',
    CANCELLED: 'badge-danger',
  };
  return <span className={styles[status] || 'badge'}>{status}</span>;
}

/* ── Цвета для полос разбивки ошибок ── */
const ERROR_COLORS = ['#ef4444', '#f97316', '#eab308', '#a855f7', '#3b82f6', '#14b8a6', '#ec4899', '#6366f1'];

/* ── Общий тултип с разбивкой ошибок ── */
function ErrorBreakdownTooltip({
  breakdown,
  total,
}: {
  breakdown: Array<{ code: string; count: number; label?: string }>;
  total: number;
}) {
  if (!breakdown.length) {
    return <div className="text-xs text-dark-400 p-2">No error data</div>;
  }

  const sorted = [...breakdown].sort((a, b) => b.count - a.count);
  const maxCount = sorted[0]?.count || 1;

  return (
    <div className="w-72 space-y-3">
      <p className="text-[11px] font-semibold text-dark-300 uppercase tracking-wider">
        Error Breakdown ({total.toLocaleString()} total)
      </p>

      {/* Горизонтальные полосы */}
      <div className="space-y-2">
        {sorted.map((e, i) => {
          const pct = total > 0 ? ((e.count / total) * 100).toFixed(1) : '0';
          const barW = Math.max((e.count / maxCount) * 100, 4);
          const color = ERROR_COLORS[i % ERROR_COLORS.length];
          return (
            <div key={e.code}>
              <div className="flex items-center justify-between text-[11px] mb-0.5">
                <span className="text-dark-300 font-medium truncate max-w-[140px]">
                  {e.code === 'internal' ? 'Internal' : `Code ${e.code}`}
                </span>
                <span className="text-dark-400 ml-2 shrink-0">
                  {e.count.toLocaleString()} ({pct}%)
                </span>
              </div>
              <div className="h-2 rounded-full bg-dark-700 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${barW}%`, backgroundColor: color }}
                />
              </div>
              {e.label && <p className="text-[10px] text-dark-500 mt-0.5 leading-tight">{e.label}</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── ErrorRateCard — карточка Error Rate с hover-тултипом ── */
function ErrorRateCard({
  errorRate,
  breakdown,
  total24h,
}: {
  errorRate: number;
  breakdown: Array<{ code: string; count: number; label?: string }>;
  total24h: { sent?: number; failed?: number; blocked?: number };
}) {
  const [show, setShow] = useState(false);
  const totalErrors = (total24h.failed || 0) + (total24h.blocked || 0);

  return (
    <div className="card p-5 relative" onMouseEnter={() => setShow(true)} onMouseLeave={() => setShow(false)}>
      <div className="flex items-center gap-2 mb-3">
        <AlertOctagon className="w-4 h-4 text-red-400" />
        <span className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Error Rate</span>
      </div>
      <p
        className={clsx(
          'text-3xl font-bold',
          errorRate > 10 ? 'text-red-400' : errorRate > 5 ? 'text-yellow-400' : 'text-green-400',
        )}
      >
        {errorRate.toFixed(1)}%
      </p>
      <p className="text-xs text-dark-500 mt-1">
        {totalErrors.toLocaleString()} errors / {(total24h.sent || 0).toLocaleString()} sent
      </p>
      {breakdown.length > 0 && <p className="text-[10px] text-dark-500 mt-2 cursor-default">ⓘ Hover for breakdown</p>}

      {/* Тултип */}
      {show && breakdown.length > 0 && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-dark-800 border border-dark-600 rounded-lg shadow-xl p-4 pointer-events-none">
          <ErrorBreakdownTooltip breakdown={breakdown} total={totalErrors} />
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-dark-600" />
        </div>
      )}
    </div>
  );
}

/* ── FailedMetricWithTooltip — ячейка Failed в 7-Day Health с hover-тултипом ── */
function FailedMetricWithTooltip({
  value,
  breakdown,
}: {
  value: number;
  breakdown: Array<{ code: string; count: number; label?: string }>;
}) {
  const [show, setShow] = useState(false);

  return (
    <div
      className="text-center relative cursor-default"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <XCircle className="w-5 h-5 mx-auto mb-2 text-red-400" />
      <p className="text-xl font-bold text-red-400">{(value || 0).toLocaleString()}</p>
      <p className="text-[11px] text-dark-500 mt-1">Failed</p>

      {/* Тултип */}
      {show && breakdown.length > 0 && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 bg-dark-800 border border-dark-600 rounded-lg shadow-xl p-4 pointer-events-none">
          <ErrorBreakdownTooltip breakdown={breakdown} total={value} />
          <div className="absolute left-1/2 -translate-x-1/2 top-full w-0 h-0 border-x-[6px] border-x-transparent border-t-[6px] border-t-dark-600" />
        </div>
      )}
    </div>
  );
}
