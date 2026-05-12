import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import {
  X,
  Phone,
  Mail,
  Building,
  MapPin,
  Calendar,
  Tag,
  MessageSquare,
  Zap,
  Target,
  Clock,
  ChevronRight,
  User,
  Layers,
  ShieldOff,
} from 'lucide-react';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuthStore } from '../../stores/authStore';

const STATUS_COLORS: Record<string, string> = {
  NEW: 'bg-blue-500/20 text-blue-400',
  CONTACTED: 'bg-cyan-500/20 text-cyan-400',
  REPLIED: 'bg-green-500/20 text-green-400',
  INTERESTED: 'bg-yellow-500/20 text-yellow-400',
  DOCS_REQUESTED: 'bg-purple-500/20 text-purple-400',
  SUBMITTED: 'bg-indigo-500/20 text-indigo-400',
  FUNDED: 'bg-emerald-500/20 text-emerald-400',
  NOT_INTERESTED: 'bg-orange-500/20 text-orange-400',
  DNC: 'bg-red-500/20 text-red-400',
};

const AUTO_OVERRIDE_REASONS = new Set([
  'AUTO_BAD_NUMBER',
  'INVALID_DESTINATION',
  'NON_MOBILE_DESTINATION',
  'LOOKUP_INVALID',
  'LOOKUP_QUARANTINE',
  'LOOKUP_RETRY_PENDING',
  'LOOKUP_FAILED_REVIEW',
  'QUARANTINE_TRANSIENT',
]);

const LOCKED_OVERRIDE_REASONS = new Set(['STOP', 'DNC', 'NOT_INTERESTED']);

interface LeadDetailDrawerProps {
  leadId: string;
  onClose: () => void;
}

export default function LeadDetailDrawer({ leadId, onClose }: LeadDetailDrawerProps) {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['lead-detail', leadId],
    queryFn: async () => {
      const { data } = await api.get(`/leads/${leadId}`);
      return data.lead;
    },
  });

  const lead = data;
  const effectiveSuppressReason = lead?.suppressReason || null;
  const overrideLocked =
    !!lead &&
    (lead.optedOut || lead.status === 'DNC' || LOCKED_OVERRIDE_REASONS.has(String(effectiveSuppressReason || '')));
  const canOverrideSuppression =
    user?.role === 'ADMIN' &&
    !!lead?.isSuppressed &&
    !!effectiveSuppressReason &&
    AUTO_OVERRIDE_REASONS.has(String(effectiveSuppressReason)) &&
    !overrideLocked;

  const overrideMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/leads/${leadId}/override-suppression`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['lead-detail', leadId] });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Suppression cleared');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Override failed'),
  });

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-lg bg-dark-900 border-l border-dark-700/50 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
          <h2 className="text-lg font-bold text-dark-50">Lead Details</h2>
          <button onClick={onClose} className="btn-ghost p-1.5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="h-10 bg-dark-800 rounded animate-pulse" />
              ))}
            </div>
          ) : !lead ? (
            <div className="p-6 text-center text-dark-500">Lead not found</div>
          ) : (
            <div className="divide-y divide-dark-700/50">
              {/* Profile */}
              <div className="p-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-dark-700 flex items-center justify-center text-xl font-bold text-dark-300">
                    {lead.firstName?.[0]}
                    {lead.lastName?.[0] || ''}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xl font-bold text-dark-50 truncate">
                      {lead.firstName} {lead.lastName || ''}
                    </h3>
                    <span className={clsx('badge mt-1', STATUS_COLORS[lead.status] || 'bg-dark-600 text-dark-300')}>
                      {lead.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  <InfoRow icon={Phone} label="Phone" value={lead.phone} mono />
                  {lead.email && <InfoRow icon={Mail} label="Email" value={lead.email} />}
                  {lead.company && <InfoRow icon={Building} label="Company" value={lead.company} />}
                  {lead.state && <InfoRow icon={MapPin} label="State" value={lead.state} />}
                  {lead.source && <InfoRow icon={Layers} label="Source" value={lead.source} />}
                  {lead.lineType && <InfoRow icon={ShieldOff} label="Line" value={lead.lineType} />}
                  {lead.carrierName && <InfoRow icon={Phone} label="Carrier" value={lead.carrierName} />}
                  {lead.validatedAt && (
                    <InfoRow icon={Calendar} label="Lookup" value={format(new Date(lead.validatedAt), 'MMM d, yyyy')} />
                  )}
                  <InfoRow icon={Calendar} label="Added" value={format(new Date(lead.createdAt), 'MMM d, yyyy')} />
                  {lead.assignedRep && (
                    <InfoRow
                      icon={User}
                      label="Rep"
                      value={`${lead.assignedRep.firstName} ${lead.assignedRep.lastName}`}
                    />
                  )}
                </div>

                {(lead.isSuppressed || lead.suppressReason || lead.optedOut) && (
                  <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase text-yellow-200">Suppression</p>
                        <p className="mt-1 text-sm text-yellow-100">
                          {lead.suppressReason || (lead.optedOut ? 'STOP/opt-out' : 'Suppressed')}
                        </p>
                        {overrideLocked && (
                          <p className="mt-1 text-xs text-yellow-300/80">Override locked for legal/business opt-out.</p>
                        )}
                      </div>
                      {canOverrideSuppression && (
                        <button
                          type="button"
                          onClick={() => overrideMutation.mutate()}
                          disabled={overrideMutation.isPending}
                          className="btn-secondary flex items-center gap-2 px-3 py-1.5 text-xs disabled:opacity-50"
                        >
                          <ShieldOff className="h-3.5 w-3.5" />
                          {overrideMutation.isPending ? 'Clearing...' : 'Override'}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {lead.notes && (
                  <div className="bg-dark-800/50 rounded-lg p-3 border border-dark-700/50">
                    <p className="text-xs text-dark-500 mb-1">Notes</p>
                    <p className="text-sm text-dark-300 whitespace-pre-wrap">{lead.notes}</p>
                  </div>
                )}
              </div>

              {/* Tags */}
              {lead.tags && lead.tags.length > 0 && (
                <div className="p-6">
                  <SectionHeader icon={Tag} label="Tags" count={lead.tags.length} />
                  <div className="flex flex-wrap gap-1.5 mt-3">
                    {lead.tags.map((lt: any) => (
                      <span
                        key={lt.tag.id}
                        className="badge text-xs"
                        style={{ backgroundColor: lt.tag.color + '30', color: lt.tag.color }}
                      >
                        {lt.tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Pipeline Position */}
              {lead.pipelineCards && lead.pipelineCards.length > 0 && (
                <div className="p-6">
                  <SectionHeader icon={Target} label="Pipeline" count={lead.pipelineCards.length} />
                  <div className="space-y-2 mt-3">
                    {lead.pipelineCards.map((pc: any) => (
                      <div
                        key={pc.id}
                        className="flex items-center gap-2 bg-dark-800/50 rounded-lg px-3 py-2 border border-dark-700/50"
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: pc.stage?.color || '#6366f1' }}
                        />
                        <span className="text-sm text-dark-200 font-medium">{pc.stage?.name || 'Unknown'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Active Automations */}
              {lead.automationRuns && lead.automationRuns.length > 0 && (
                <div className="p-6">
                  <SectionHeader icon={Zap} label="Active Automations" count={lead.automationRuns.length} />
                  <div className="space-y-2 mt-3">
                    {lead.automationRuns.map((run: any) => (
                      <div
                        key={run.id}
                        className="flex items-center justify-between bg-dark-800/50 rounded-lg px-3 py-2 border border-dark-700/50"
                      >
                        <div className="flex items-center gap-2">
                          <Zap className="w-3.5 h-3.5 text-purple-400" />
                          <span className="text-sm text-dark-200">{run.automationRule?.name || 'Unnamed'}</span>
                        </div>
                        <span className="text-xs text-dark-500">Step {run.currentStep + 1}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Recent Campaigns */}
              {lead.campaignLeads && lead.campaignLeads.length > 0 && (
                <div className="p-6">
                  <SectionHeader icon={MessageSquare} label="Campaigns" count={lead.campaignLeads.length} />
                  <div className="space-y-2 mt-3">
                    {lead.campaignLeads.map((cl: any) => (
                      <div
                        key={cl.id}
                        className="flex items-center justify-between bg-dark-800/50 rounded-lg px-3 py-2 border border-dark-700/50"
                      >
                        <span className="text-sm text-dark-200">{cl.campaign?.name || 'Unknown'}</span>
                        <span
                          className={clsx(
                            'badge text-[10px]',
                            cl.campaign?.status === 'COMPLETED'
                              ? 'bg-green-500/20 text-green-400'
                              : cl.campaign?.status === 'SENDING'
                                ? 'bg-yellow-500/20 text-yellow-400'
                                : 'bg-dark-600 text-dark-400',
                          )}
                        >
                          {cl.campaign?.status || cl.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversations */}
              {lead.conversations && lead.conversations.length > 0 && (
                <div className="p-6">
                  <SectionHeader icon={MessageSquare} label="Conversations" count={lead.conversations.length} />
                  <div className="space-y-2 mt-3">
                    {lead.conversations.map((conv: any) => (
                      <button
                        key={conv.id}
                        onClick={() => navigate(`/inbox?conversation=${conv.id}`)}
                        className="w-full flex items-center justify-between bg-dark-800/50 rounded-lg px-3 py-2 border border-dark-700/50 hover:bg-dark-700/40 transition-colors text-left"
                      >
                        <div className="flex-1 min-w-0">
                          {conv.messages && conv.messages.length > 0 && (
                            <p className="text-sm text-dark-300 truncate">{conv.messages[0].body}</p>
                          )}
                          <p className="text-xs text-dark-500 mt-0.5">{conv.messages?.length || 0} messages</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-dark-500 shrink-0 ml-2" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick Actions */}
              <div className="p-6">
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/inbox?lead=${leadId}`)}
                    className="btn-secondary flex-1 flex items-center justify-center gap-2 text-sm"
                  >
                    <MessageSquare className="w-4 h-4" /> Open Inbox
                  </button>
                  <button
                    onClick={() => navigator.clipboard.writeText(lead.phone).then(() => {})}
                    className="btn-ghost flex items-center justify-center gap-2 text-sm px-4"
                  >
                    <Phone className="w-4 h-4" /> Copy Phone
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

function InfoRow({ icon: Icon, label, value, mono }: { icon: any; label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="w-4 h-4 text-dark-500 shrink-0" />
      <span className="text-xs text-dark-500 w-16 shrink-0">{label}</span>
      <span className={clsx('text-sm text-dark-200 truncate', mono && 'font-mono')}>{value}</span>
    </div>
  );
}

function SectionHeader({ icon: Icon, label, count }: { icon: any; label: string; count: number }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="w-4 h-4 text-dark-400" />
      <span className="text-xs font-semibold text-dark-400 uppercase tracking-wider">{label}</span>
      <span className="text-[10px] badge bg-dark-700 text-dark-400">{count}</span>
    </div>
  );
}
