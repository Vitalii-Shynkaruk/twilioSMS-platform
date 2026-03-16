import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import { Campaign, CampaignStatus } from '../types';
import {
  ArrowLeft,
  Play,
  Pause,
  XCircle,
  Trash2,
  Send,
  CheckCircle,
  Clock,
  Users,
  TrendingUp,
  AlertTriangle,
  MessageSquare,
  Ban,
  Edit3,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';

interface CampaignLead {
  id: string;
  status: string;
  sentAt?: string;
  deliveredAt?: string;
  lead: {
    id: string;
    firstName: string;
    lastName?: string;
    phone: string;
    status: string;
  };
}

interface CampaignDetail extends Campaign {
  leads: CampaignLead[];
  numberPool?: { id: string; name: string } | null;
}

interface AnalyticsData {
  campaign: Pick<Campaign, 'id' | 'name' | 'status' | 'totalLeads' | 'totalSent' | 'totalDelivered' | 'totalFailed' | 'totalBlocked' | 'totalReplied' | 'totalOptedOut' | 'startedAt' | 'completedAt'>;
  leadStatuses: { status: string; count: number }[];
  deliveryRate: string;
  replyRate: string;
}

export default function CampaignDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showEdit, setShowEdit] = useState(false);

  const { data: campaignData, isLoading } = useQuery({
    queryKey: ['campaign', id],
    queryFn: async () => {
      const { data } = await api.get(`/campaigns/${id}`);
      return data.campaign as CampaignDetail;
    },
    enabled: !!id,
  });

  const { data: analytics } = useQuery({
    queryKey: ['campaign-analytics', id],
    queryFn: async () => {
      const { data } = await api.get(`/campaigns/${id}/analytics`);
      return data as AnalyticsData;
    },
    enabled: !!id,
    refetchInterval: campaignData?.status === 'SENDING' ? 5000 : false,
  });

  const startMutation = useMutation({
    mutationFn: () => api.post(`/campaigns/${id}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      queryClient.invalidateQueries({ queryKey: ['campaign-analytics', id] });
      toast.success('Campaign started!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to start'),
  });

  const pauseMutation = useMutation({
    mutationFn: () => api.post(`/campaigns/${id}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      toast.success('Campaign paused');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to pause'),
  });

  const cancelMutation = useMutation({
    mutationFn: () => api.post(`/campaigns/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      toast.success('Campaign cancelled');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to cancel'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted');
      navigate('/campaigns');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const updateMutation = useMutation({
    mutationFn: (body: any) => api.put(`/campaigns/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaign', id] });
      toast.success('Campaign updated');
      setShowEdit(false);
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update'),
  });

  const campaign = campaignData;
  const stats = analytics;

  if (isLoading) {
    return (
      <div className="p-8 max-w-[1600px]">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-6 w-24 bg-dark-700 rounded animate-pulse" />
          <div className="h-8 w-64 bg-dark-700 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-4 gap-4 mb-6">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="card p-4"><div className="h-16 bg-dark-700 rounded animate-pulse" /></div>
          ))}
        </div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-dark-500 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-dark-200 mb-2">Campaign Not Found</h2>
        <p className="text-dark-400 mb-4">This campaign may have been deleted.</p>
        <button onClick={() => navigate('/campaigns')} className="btn-primary">
          Back to Campaigns
        </button>
      </div>
    );
  }

  const deliveryRate = parseFloat(stats?.deliveryRate || '0');
  const replyRate = parseFloat(stats?.replyRate || '0');
  const progress = campaign.totalLeads > 0 ? (campaign.totalSent / campaign.totalLeads) * 100 : 0;

  return (
    <div className="p-8 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/campaigns')}
            className="btn-ghost p-2"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-dark-50">{campaign.name}</h1>
              <CampaignStatusBadge status={campaign.status} />
            </div>
            {campaign.description && (
              <p className="text-sm text-dark-400 mt-1">{campaign.description}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {['DRAFT', 'SCHEDULED'].includes(campaign.status) && (
            <button
              onClick={() => setShowEdit(true)}
              className="btn-ghost flex items-center gap-2 text-sm"
            >
              <Edit3 className="w-4 h-4" /> Edit
            </button>
          )}
          {['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status) && (
            <button
              onClick={() => startMutation.mutate()}
              disabled={startMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <Play className="w-4 h-4" /> Start
            </button>
          )}
          {campaign.status === 'SENDING' && (
            <button
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="px-4 py-2 rounded-lg bg-yellow-600/20 text-yellow-400 hover:bg-yellow-600/30 text-sm font-medium flex items-center gap-2 transition-colors"
            >
              <Pause className="w-4 h-4" /> Pause
            </button>
          )}
          {['SENDING', 'PAUSED', 'SCHEDULED'].includes(campaign.status) && (
            <button
              onClick={() => { if (window.confirm('Cancel this campaign?')) cancelMutation.mutate(); }}
              className="btn-ghost text-red-400 hover:text-red-300 flex items-center gap-2 text-sm"
            >
              <XCircle className="w-4 h-4" /> Cancel
            </button>
          )}
          {['DRAFT', 'COMPLETED', 'CANCELLED'].includes(campaign.status) && (
            <button
              onClick={() => { if (window.confirm('Delete this campaign permanently?')) deleteMutation.mutate(); }}
              className="btn-ghost text-red-400 hover:text-red-300 flex items-center gap-2 text-sm"
            >
              <Trash2 className="w-4 h-4" /> Delete
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar (for sending campaigns) */}
      {campaign.status === 'SENDING' && (
        <div className="card p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-dark-300">Sending Progress</span>
            <span className="text-sm font-mono text-dark-200">{campaign.totalSent} / {campaign.totalLeads}</span>
          </div>
          <div className="w-full h-2 bg-dark-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-scl-500 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <p className="text-xs text-dark-500 mt-1">{progress.toFixed(1)}% complete</p>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Total Leads" value={campaign.totalLeads.toLocaleString()} icon={<Users className="w-5 h-5" />} color="bg-scl-500/20 text-scl-400" />
        <StatCard label="Sent" value={campaign.totalSent.toLocaleString()} icon={<Send className="w-5 h-5" />} color="bg-blue-500/20 text-blue-400" />
        <StatCard label="Delivered" value={campaign.totalDelivered.toLocaleString()} icon={<CheckCircle className="w-5 h-5" />} color="bg-emerald-500/20 text-emerald-400" />
        <StatCard label="Failed" value={campaign.totalFailed.toLocaleString()} icon={<AlertTriangle className="w-5 h-5" />} color="bg-red-500/20 text-red-400" />
        <StatCard label="Blocked" value={campaign.totalBlocked.toLocaleString()} icon={<Ban className="w-5 h-5" />} color="bg-yellow-500/20 text-yellow-400" />
        <StatCard label="Replied" value={campaign.totalReplied.toLocaleString()} icon={<MessageSquare className="w-5 h-5" />} color="bg-purple-500/20 text-purple-400" />
        <StatCard
          label="Delivery Rate"
          value={`${deliveryRate}%`}
          icon={<TrendingUp className="w-5 h-5" />}
          color={deliveryRate >= 80 ? 'bg-emerald-500/20 text-emerald-400' : deliveryRate >= 50 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-red-500/20 text-red-400'}
        />
        <StatCard
          label="Reply Rate"
          value={`${replyRate}%`}
          icon={<MessageSquare className="w-5 h-5" />}
          color={replyRate >= 5 ? 'bg-emerald-500/20 text-emerald-400' : 'bg-dark-600/50 text-dark-400'}
        />
      </div>

      {/* Info & Template */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Campaign Info */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">Campaign Info</h3>
          <div className="space-y-3">
            <InfoRow label="Created" value={format(new Date(campaign.createdAt), 'MMM d, yyyy HH:mm')} />
            {campaign.startedAt && <InfoRow label="Started" value={format(new Date(campaign.startedAt), 'MMM d, yyyy HH:mm')} />}
            {campaign.completedAt && <InfoRow label="Completed" value={format(new Date(campaign.completedAt), 'MMM d, yyyy HH:mm')} />}
            {campaign.scheduledAt && <InfoRow label="Scheduled" value={format(new Date(campaign.scheduledAt), 'MMM d, yyyy HH:mm')} />}
            <InfoRow label="Sending Speed" value={`${campaign.sendingSpeed} / min`} />
            {campaign.numberPool && <InfoRow label="Number Pool" value={campaign.numberPool.name} />}
          </div>
        </div>

        {/* Message Template */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">Message Template</h3>
          <div className="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
            <pre className="text-sm text-dark-200 whitespace-pre-wrap font-sans leading-relaxed">
              {campaign.messageTemplate}
            </pre>
          </div>
        </div>
      </div>

      {/* Lead Status Breakdown */}
      {stats?.leadStatuses && stats.leadStatuses.length > 0 && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider mb-4">Lead Status Breakdown</h3>
          <div className="flex flex-wrap gap-3">
            {stats.leadStatuses.map((s) => (
              <div key={s.status} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-dark-800/50 border border-dark-700/50">
                <LeadStatusDot status={s.status} />
                <span className="text-sm text-dark-300">{s.status}</span>
                <span className="text-sm font-bold text-dark-100">{s.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Leads Table */}
      <div className="card overflow-hidden">
        <div className="px-5 py-4 border-b border-dark-800/50 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-dark-300 uppercase tracking-wider">
            Campaign Leads ({campaign.leads?.length || 0}{campaign.totalLeads > 100 ? ` of ${campaign.totalLeads}` : ''})
          </h3>
        </div>
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Lead</th>
              <th className="table-header">Phone</th>
              <th className="table-header">Lead Status</th>
              <th className="table-header">Send Status</th>
              <th className="table-header">Sent At</th>
            </tr>
          </thead>
          <tbody>
            {(!campaign.leads || campaign.leads.length === 0) && (
              <tr>
                <td colSpan={5} className="p-8 text-center text-dark-500">
                  <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No leads attached to this campaign</p>
                </td>
              </tr>
            )}
            {campaign.leads?.map((cl) => (
              <tr key={cl.id} className="border-b border-dark-800/30 hover:bg-dark-800/20 transition-colors">
                <td className="table-td">
                  <span className="text-sm text-dark-200">
                    {cl.lead.firstName} {cl.lead.lastName || ''}
                  </span>
                </td>
                <td className="table-td">
                  <span className="text-sm text-dark-400 font-mono">{cl.lead.phone}</span>
                </td>
                <td className="table-td">
                  <span className="badge bg-dark-700 text-dark-400 text-[10px]">{cl.lead.status}</span>
                </td>
                <td className="table-td">
                  <CampaignLeadStatusBadge status={cl.status} />
                </td>
                <td className="table-td text-xs text-dark-500">
                  {cl.sentAt ? format(new Date(cl.sentAt), 'MMM d, HH:mm') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Edit Modal */}
      {showEdit && campaign && (
        <EditCampaignModal
          campaign={campaign}
          onClose={() => setShowEdit(false)}
          onSave={(data) => updateMutation.mutate(data)}
          isPending={updateMutation.isPending}
        />
      )}
    </div>
  );
}

/* ── Helper Components ─────────────────────────────────── */

function StatCard({ label, value, icon, color }: { label: string; value: string; icon: React.ReactNode; color: string }) {
  return (
    <div className="card p-4 flex items-center gap-3">
      <div className={clsx('w-9 h-9 rounded-lg flex items-center justify-center', color)}>
        {icon}
      </div>
      <div>
        <p className="text-lg font-bold text-dark-100">{value}</p>
        <p className="text-[11px] text-dark-500 uppercase tracking-wider">{label}</p>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-dark-500">{label}</span>
      <span className="text-sm text-dark-200">{value}</span>
    </div>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: any; cls: string }> = {
    DRAFT: { icon: Clock, cls: 'bg-dark-600/50 text-dark-300' },
    SCHEDULED: { icon: Clock, cls: 'bg-blue-500/20 text-blue-400' },
    SENDING: { icon: Send, cls: 'bg-yellow-500/20 text-yellow-400' },
    PAUSED: { icon: Pause, cls: 'bg-orange-500/20 text-orange-400' },
    COMPLETED: { icon: CheckCircle, cls: 'bg-green-500/20 text-green-400' },
    CANCELLED: { icon: XCircle, cls: 'bg-red-500/20 text-red-400' },
  };
  const cfg = config[status] || config.DRAFT;
  const Icon = cfg.icon;
  return (
    <span className={clsx('badge', cfg.cls)}>
      <Icon className="w-3 h-3 mr-1" />
      {status}
    </span>
  );
}

function CampaignLeadStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-dark-700 text-dark-400',
    SENT: 'bg-blue-500/20 text-blue-400',
    DELIVERED: 'bg-emerald-500/20 text-emerald-400',
    FAILED: 'bg-red-500/20 text-red-400',
    SKIPPED: 'bg-dark-600/50 text-dark-500',
    OPTED_OUT: 'bg-orange-500/20 text-orange-400',
  };
  return <span className={clsx('badge text-[10px]', styles[status] || 'bg-dark-700 text-dark-400')}>{status}</span>;
}

function LeadStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    PENDING: 'bg-dark-500',
    SENT: 'bg-blue-400',
    DELIVERED: 'bg-emerald-400',
    FAILED: 'bg-red-400',
    SKIPPED: 'bg-dark-600',
    OPTED_OUT: 'bg-orange-400',
  };
  return <div className={clsx('w-2 h-2 rounded-full', colors[status] || 'bg-dark-500')} />;
}

function EditCampaignModal({
  campaign,
  onClose,
  onSave,
  isPending,
}: {
  campaign: CampaignDetail;
  onClose: () => void;
  onSave: (data: any) => void;
  isPending: boolean;
}) {
  const [name, setName] = useState(campaign.name);
  const [description, setDescription] = useState(campaign.description || '');
  const [messageTemplate, setMessageTemplate] = useState(campaign.messageTemplate);
  const [sendingSpeed, setSendingSpeed] = useState(campaign.sendingSpeed);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({ name, description, messageTemplate, sendingSpeed });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="card w-full max-w-lg p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-bold text-dark-50">Edit Campaign</h3>
          <button onClick={onClose} className="btn-ghost p-1">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="label">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input w-full" required />
          </div>
          <div>
            <label className="label">Description</label>
            <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} className="input w-full" />
          </div>
          <div>
            <label className="label">Message Template</label>
            <textarea
              value={messageTemplate}
              onChange={(e) => setMessageTemplate(e.target.value)}
              className="input w-full min-h-[100px] resize-y"
              required
            />
          </div>
          <div>
            <label className="label">Sending Speed</label>
            <select value={sendingSpeed} onChange={(e) => setSendingSpeed(Number(e.target.value))} className="input w-full">
              <option value="30">30 / min (Slow)</option>
              <option value="60">60 / min (Normal)</option>
              <option value="120">120 / min (Fast)</option>
              <option value="300">300 / min (Max)</option>
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={isPending} className="btn-primary flex items-center gap-2">
              {isPending ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Edit3 className="w-4 h-4" />}
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
