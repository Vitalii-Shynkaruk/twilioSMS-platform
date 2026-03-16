import { useQuery } from '@tanstack/react-query';
import api from '../services/api';
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Users,
  MessageSquare,
  Send,
  Target,
  Phone,
  Bot,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Download,
  RefreshCw,
  Clock,
  Zap,
  ShieldCheck,
  AlertTriangle,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
} from 'recharts';
import { useState } from 'react';
import { useThemeStore } from '../stores/themeStore';
import { clsx } from 'clsx';

const COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6'];
const STATUS_COLORS: Record<string, string> = {
  NEW: '#6366f1',
  CONTACTED: '#06b6d4',
  REPLIED: '#10b981',
  INTERESTED: '#f59e0b',
  DOCS_REQUESTED: '#8b5cf6',
  SUBMITTED: '#ec4899',
  FUNDED: '#22c55e',
  NOT_INTERESTED: '#94a3b8',
  DNC: '#ef4444',
};

function KPICard({ label, value, trend, icon: Icon, color = 'indigo' }: {
  label: string;
  value: string | number;
  trend?: number;
  icon: any;
  color?: string;
}) {
  const colorMap: Record<string, string> = {
    indigo: 'from-indigo-500/20 to-indigo-500/5 text-indigo-400',
    cyan: 'from-cyan-500/20 to-cyan-500/5 text-cyan-400',
    green: 'from-green-500/20 to-green-500/5 text-green-400',
    amber: 'from-amber-500/20 to-amber-500/5 text-amber-400',
    rose: 'from-rose-500/20 to-rose-500/5 text-rose-400',
    purple: 'from-purple-500/20 to-purple-500/5 text-purple-400',
  };

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-2">
        <div className={clsx('p-2 rounded-lg bg-gradient-to-br', colorMap[color])}>
          <Icon className="w-4 h-4" />
        </div>
        {trend !== undefined && trend !== 0 && (
          <div className={clsx('flex items-center gap-1 text-xs font-medium',
            trend > 0 ? 'text-green-400' : 'text-red-400')}>
            {trend > 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {Math.abs(trend)}%
          </div>
        )}
        {trend === 0 && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Minus className="w-3 h-3" /> 0%
          </div>
        )}
      </div>
      <div className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{value}</div>
      <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>{label}</div>
    </div>
  );
}

function SectionHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h2>
      {subtitle && <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>{subtitle}</p>}
    </div>
  );
}

export default function AnalyticsPage() {
  const { resolved } = useThemeStore();
  const isDark = resolved === 'dark';
  const [messagingDays, setMessagingDays] = useState(30);

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['analytics-overview'],
    queryFn: async () => (await api.get('/analytics/overview')).data,
  });

  const { data: funnel, isLoading: loadingFunnel } = useQuery({
    queryKey: ['analytics-funnel'],
    queryFn: async () => (await api.get('/analytics/lead-funnel')).data,
  });

  const { data: messaging, isLoading: loadingMessaging } = useQuery({
    queryKey: ['analytics-messaging', messagingDays],
    queryFn: async () => (await api.get(`/analytics/messaging?days=${messagingDays}`)).data,
  });

  const { data: campaignData } = useQuery({
    queryKey: ['analytics-campaigns'],
    queryFn: async () => (await api.get('/analytics/campaigns')).data,
  });

  const { data: numberData } = useQuery({
    queryKey: ['analytics-numbers'],
    queryFn: async () => (await api.get('/analytics/numbers')).data,
  });

  const { data: repData } = useQuery({
    queryKey: ['analytics-reps'],
    queryFn: async () => (await api.get('/analytics/rep-performance')).data,
  });

  const { data: automationData } = useQuery({
    queryKey: ['analytics-automation'],
    queryFn: async () => (await api.get('/analytics/automation')).data,
  });

  const kpis = overview?.kpis;

  const chartTextColor = isDark ? '#94a3b8' : '#64748b';
  const chartGridColor = isDark ? 'rgba(148, 163, 184, 0.1)' : 'rgba(148, 163, 184, 0.2)';

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;
    return (
      <div className="card p-3 shadow-lg border" style={{ borderColor: 'var(--border-primary)' }}>
        <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-primary)' }}>{label}</p>
        {payload.map((p: any, i: number) => (
          <p key={i} className="text-xs" style={{ color: p.color }}>
            {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
          </p>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Analytics</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            Comprehensive platform performance metrics
          </p>
        </div>
        <button
          onClick={() => {
            window.open('/api/leads/export', '_blank');
          }}
          className="btn-secondary flex items-center gap-2 text-sm"
        >
          <Download className="w-4 h-4" />
          Export Leads
        </button>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KPICard label="Total Leads" value={kpis.totalLeads.toLocaleString()} trend={kpis.leadsTrend} icon={Users} color="indigo" />
          <KPICard label="New This Week" value={kpis.newLeadsWeek} trend={kpis.leadsTrend} icon={TrendingUp} color="cyan" />
          <KPICard label="Messages Sent (7d)" value={kpis.messagesSentWeek.toLocaleString()} trend={kpis.messagesTrend} icon={Send} color="green" />
          <KPICard label="Delivery Rate" value={`${kpis.deliveryRate}%`} icon={ShieldCheck} color="green" />
          <KPICard label="Reply Rate" value={`${kpis.replyRate}%`} trend={kpis.repliesTrend} icon={MessageSquare} color="amber" />
          <KPICard label="Opt-Outs (7d)" value={kpis.optOutsWeek} icon={AlertTriangle} color="rose" />
        </div>
      )}

      {/* Lead Funnel Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution */}
        <div className="card p-5">
          <SectionHeader title="Lead Status Distribution" subtitle="Current breakdown by status" />
          {funnel?.statusDistribution && (
            <div className="h-64">
              <ResponsiveContainer>
                <PieChart>
                  <Pie
                    data={funnel.statusDistribution}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={90}
                    label={({ status, count }) => `${status} (${count})`}
                    labelLine={false}
                    fontSize={10}
                  >
                    {funnel.statusDistribution.map((entry: any, i: number) => (
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status] || COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Pipeline Funnel */}
        <div className="card p-5">
          <SectionHeader title="Pipeline Funnel" subtitle="Cards per stage" />
          {funnel?.pipelineFunnel && (
            <div className="h-64">
              <ResponsiveContainer>
                <BarChart data={funnel.pipelineFunnel} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                  <XAxis type="number" tick={{ fill: chartTextColor, fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fill: chartTextColor, fontSize: 11 }} width={100} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {funnel.pipelineFunnel.map((entry: any, i: number) => (
                      <Cell key={entry.id} fill={entry.color || COLORS[i % COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Lead Source & Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lead Sources */}
        <div className="card p-5">
          <SectionHeader title="Lead Sources" subtitle="Top 10 sources" />
          {funnel?.sourceDistribution && (
            <div className="space-y-2">
              {funnel.sourceDistribution.map((s: any, i: number) => {
                const max = Math.max(...funnel.sourceDistribution.map((x: any) => x.count));
                return (
                  <div key={s.source} className="flex items-center gap-3">
                    <span className="text-xs w-24 truncate" style={{ color: 'var(--text-muted)' }}>{s.source}</span>
                    <div className="flex-1 h-5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${(s.count / max) * 100}%`, backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                    <span className="text-xs font-medium w-8 text-right" style={{ color: 'var(--text-primary)' }}>{s.count}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lead Timeline */}
        <div className="card p-5">
          <SectionHeader title="New Leads Over Time" subtitle="Last 30 days" />
          {funnel?.leadTimeline && (
            <div className="h-64">
              <ResponsiveContainer>
                <AreaChart data={funnel.leadTimeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                  <XAxis dataKey="date" tick={{ fill: chartTextColor, fontSize: 10 }}
                    tickFormatter={(v) => v.slice(5)} />
                  <YAxis tick={{ fill: chartTextColor, fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="count" stroke="#6366f1" fill="#6366f1" fillOpacity={0.2} name="New Leads" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* Messaging Section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <SectionHeader title="Messaging Analytics" subtitle={`Last ${messagingDays} days`} />
          <div className="flex gap-2">
            {[7, 14, 30].map(d => (
              <button
                key={d}
                onClick={() => setMessagingDays(d)}
                className={clsx('px-3 py-1 text-xs rounded-lg transition-colors',
                  messagingDays === d ? 'bg-indigo-500 text-white' : 'btn-secondary')}
              >
                {d}d
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Daily Volume */}
          <div className="card p-5">
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Daily Message Volume</h3>
            {messaging?.dailyVolume && (
              <div className="h-64">
                <ResponsiveContainer>
                  <AreaChart data={messaging.dailyVolume}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                    <XAxis dataKey="date" tick={{ fill: chartTextColor, fontSize: 10 }}
                      tickFormatter={(v) => v.slice(5)} />
                    <YAxis tick={{ fill: chartTextColor, fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="outbound" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} name="Outbound" />
                    <Area type="monotone" dataKey="inbound" stroke="#10b981" fill="#10b981" fillOpacity={0.15} name="Inbound" />
                    <Area type="monotone" dataKey="failed" stroke="#ef4444" fill="#ef4444" fillOpacity={0.1} name="Failed" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Hourly Pattern */}
          <div className="card p-5">
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Hourly Send Pattern</h3>
            {messaging?.hourlyPattern && (
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={messaging.hourlyPattern}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                    <XAxis dataKey="label" tick={{ fill: chartTextColor, fontSize: 9 }} interval={2} />
                    <YAxis tick={{ fill: chartTextColor, fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="outbound" fill="#6366f1" name="Outbound" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="inbound" fill="#10b981" name="Inbound" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Day of Week Pattern */}
          <div className="card p-5">
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Day of Week Pattern</h3>
            {messaging?.weekdayPattern && (
              <div className="h-64">
                <ResponsiveContainer>
                  <BarChart data={messaging.weekdayPattern}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartGridColor} />
                    <XAxis dataKey="day" tick={{ fill: chartTextColor, fontSize: 11 }} />
                    <YAxis tick={{ fill: chartTextColor, fontSize: 11 }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar dataKey="outbound" fill="#6366f1" name="Outbound" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="inbound" fill="#10b981" name="Inbound" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Response Time & Errors */}
          <div className="card p-5">
            <h3 className="text-sm font-medium mb-3" style={{ color: 'var(--text-primary)' }}>Response Time & Error Codes</h3>
            {messaging?.responseTime && (
              <div className="mb-4 grid grid-cols-3 gap-3">
                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <Clock className="w-4 h-4 mx-auto mb-1 text-indigo-400" />
                  <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {messaging.responseTime.avg_seconds
                      ? `${Math.round(messaging.responseTime.avg_seconds / 60)}m`
                      : 'N/A'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Avg Response</div>
                </div>
                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <Zap className="w-4 h-4 mx-auto mb-1 text-green-400" />
                  <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {messaging.responseTime.min_seconds
                      ? `${Math.round(messaging.responseTime.min_seconds / 60)}m`
                      : 'N/A'}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Fastest</div>
                </div>
                <div className="text-center p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                  <Target className="w-4 h-4 mx-auto mb-1 text-amber-400" />
                  <div className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
                    {messaging.responseTime.total_replies || 0}
                  </div>
                  <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Replies</div>
                </div>
              </div>
            )}
            {messaging?.errorCodes && messaging.errorCodes.length > 0 ? (
              <div className="space-y-1.5">
                <h4 className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Top Error Codes</h4>
                {messaging.errorCodes.slice(0, 5).map((e: any) => (
                  <div key={e.code} className="flex items-center justify-between text-xs py-1">
                    <span className="font-mono text-red-400">{e.code}</span>
                    <span style={{ color: 'var(--text-primary)' }}>{e.count} occurrences</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>No errors in this period</p>
            )}
          </div>
        </div>
      </div>

      {/* Campaign Performance */}
      {campaignData?.campaigns && campaignData.campaigns.length > 0 && (
        <div className="card p-5">
          <SectionHeader title="Campaign Performance" subtitle="Recent campaigns comparison" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  {['Campaign', 'Status', 'Sent', 'Delivered', 'Failed', 'Replied', 'Delivery %', 'Reply %', 'Opt-Out %'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {campaignData.campaigns.slice(0, 10).map((c: any) => (
                  <tr key={c.id} className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
                    <td className="py-2 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>{c.name}</td>
                    <td className="py-2 px-3">
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs', {
                        'bg-green-500/10 text-green-400': c.status === 'COMPLETED',
                        'bg-blue-500/10 text-blue-400': c.status === 'SENDING',
                        'bg-amber-500/10 text-amber-400': c.status === 'SCHEDULED',
                        'bg-gray-500/10 text-gray-400': c.status === 'DRAFT',
                      })}>{c.status}</span>
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{c.totalSent}</td>
                    <td className="py-2 px-3 text-green-400">{c.totalDelivered}</td>
                    <td className="py-2 px-3 text-red-400">{c.totalFailed + c.totalBlocked}</td>
                    <td className="py-2 px-3 text-cyan-400">{c.totalReplied}</td>
                    <td className="py-2 px-3">
                      <span className={clsx(c.deliveryRate >= 90 ? 'text-green-400' : c.deliveryRate >= 70 ? 'text-amber-400' : 'text-red-400')}>
                        {c.deliveryRate}%
                      </span>
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{c.replyRate}%</td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{c.optOutRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Phone Number Performance */}
      {numberData?.numbers && numberData.numbers.length > 0 && (
        <div className="card p-5">
          <SectionHeader title="Phone Number Performance" subtitle="Per-number delivery metrics" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  {['Number', 'Status', 'Sent', 'Delivered', 'Failed', 'Delivery %', 'Today / Limit', 'Utilization', 'Errors'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {numberData.numbers.map((n: any) => (
                  <tr key={n.id} className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
                    <td className="py-2 px-3 font-mono text-xs" style={{ color: 'var(--text-primary)' }}>
                      {n.friendlyName || n.phoneNumber}
                    </td>
                    <td className="py-2 px-3">
                      <span className={clsx('px-2 py-0.5 rounded-full text-xs', {
                        'bg-green-500/10 text-green-400': n.status === 'ACTIVE',
                        'bg-amber-500/10 text-amber-400': n.status === 'WARMING',
                        'bg-blue-500/10 text-blue-400': n.status === 'COOLING',
                        'bg-red-500/10 text-red-400': n.status === 'SUSPENDED',
                      })}>{n.status}</span>
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{n.totalSent}</td>
                    <td className="py-2 px-3 text-green-400">{n.totalDelivered}</td>
                    <td className="py-2 px-3 text-red-400">{n.totalFailed + n.totalBlocked}</td>
                    <td className="py-2 px-3">
                      <span className={clsx(n.deliveryRate >= 90 ? 'text-green-400' : n.deliveryRate >= 70 ? 'text-amber-400' : 'text-red-400')}>
                        {n.deliveryRate.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>
                      {n.dailySentCount} / {n.dailyLimit}
                    </td>
                    <td className="py-2 px-3">
                      <div className="w-16 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                        <div className="h-full rounded-full" style={{
                          width: `${Math.min(n.utilizationPct, 100)}%`,
                          backgroundColor: n.utilizationPct > 90 ? '#ef4444' : n.utilizationPct > 70 ? '#f59e0b' : '#10b981',
                        }} />
                      </div>
                    </td>
                    <td className="py-2 px-3">
                      {n.errorStreak > 0 && (
                        <span className="text-xs text-red-400">{n.errorStreak} streak</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rep Performance */}
      {repData?.reps && repData.reps.length > 0 && (
        <div className="card p-5">
          <SectionHeader title="Rep Performance" subtitle="Last 30 days per user" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {repData.reps.map((rep: any) => (
              <div key={rep.id} className="p-4 rounded-xl" style={{ backgroundColor: 'var(--bg-tertiary)' }}>
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>{rep.name}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{rep.role}</div>
                  </div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400">
                    {rep.totalLeads} leads
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-bold text-indigo-400">{rep.last30d.sent}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Sent</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold text-green-400">{rep.last30d.replies}</div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Replies</div>
                  </div>
                  <div>
                    <div className="text-lg font-bold" style={{ color: rep.last30d.deliveryRate >= 90 ? '#10b981' : '#f59e0b' }}>
                      {rep.last30d.deliveryRate}%
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Delivery</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Automation Performance */}
      {automationData?.rules && automationData.rules.length > 0 && (
        <div className="card p-5">
          <SectionHeader title="Automation Performance" subtitle="Rule execution metrics" />
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
                  {['Rule', 'Type', 'Active', 'Total Runs', 'Active Runs', 'Completed', 'Completion %', 'Send Window'].map(h => (
                    <th key={h} className="text-left py-2 px-3 text-xs font-medium" style={{ color: 'var(--text-muted)' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {automationData.rules.map((r: any) => (
                  <tr key={r.id} className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
                    <td className="py-2 px-3 font-medium" style={{ color: 'var(--text-primary)' }}>{r.name}</td>
                    <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>{r.type}</td>
                    <td className="py-2 px-3">
                      <span className={clsx('w-2 h-2 rounded-full inline-block', r.isActive ? 'bg-green-500' : 'bg-gray-500')} />
                    </td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{r.totalRuns}</td>
                    <td className="py-2 px-3 text-indigo-400">{r.activeRuns}</td>
                    <td className="py-2 px-3 text-green-400">{r.completedRuns}</td>
                    <td className="py-2 px-3" style={{ color: 'var(--text-primary)' }}>{r.completionRate}%</td>
                    <td className="py-2 px-3 text-xs" style={{ color: 'var(--text-muted)' }}>{r.sendWindow}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
