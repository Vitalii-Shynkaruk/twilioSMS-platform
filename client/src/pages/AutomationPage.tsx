import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import {
  Zap,
  Plus,
  Trash2,
  Edit3,
  Clock,
  MessageSquare,
  Target,
  ArrowRight,
  X,
  Play,
  Pause,
  ChevronDown,
  ChevronUp,
  Copy,
  AlertCircle,
  Calendar,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { clsx } from 'clsx';
import { format, formatDistanceToNow } from 'date-fns';

/* ─── Types ─── */
interface AutomationTemplate {
  id: string;
  sequenceOrder: number;
  delayDays: number;
  messageTemplate: string;
}

interface AutomationRule {
  id: string;
  name: string;
  type: string;
  isActive: boolean;
  triggerConfig: Record<string, any>;
  actionConfig: Record<string, any>;
  sendAfterHour: number;
  sendBeforeHour: number;
  sendOnWeekends: boolean;
  templates: AutomationTemplate[];
  _count: { runs: number };
  createdAt: string;
}

/* ─── Constants ─── */
const LEAD_STATUSES = ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'DOCS_REQUESTED', 'SUBMITTED', 'FUNDED', 'NOT_INTERESTED', 'DNC'];

const TYPE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  LEAD_CREATED: { label: 'Lead Created', color: 'text-blue-300', bg: 'bg-blue-500/20' },
  STATUS_CHANGED: { label: 'Status Changed', color: 'text-yellow-300', bg: 'bg-yellow-500/20' },
  KEYWORD_RECEIVED: { label: 'Keyword Match', color: 'text-purple-300', bg: 'bg-purple-500/20' },
  NO_REPLY: { label: 'No Reply', color: 'text-orange-300', bg: 'bg-orange-500/20' },
  MANUAL: { label: 'Manual', color: 'text-dark-300', bg: 'bg-dark-600' },
  TAG_RULE: { label: 'Tag Rule', color: 'text-emerald-300', bg: 'bg-emerald-500/20' },
  FOLLOW_UP_SEQUENCE: { label: 'Follow-Up Sequence', color: 'text-cyan-300', bg: 'bg-cyan-500/20' },
};

const TEMPLATE_VARS = [
  { key: '{{firstName}}', label: 'First Name' },
  { key: '{{lastName}}', label: 'Last Name' },
  { key: '{{company}}', label: 'Company' },
  { key: '{{phone}}', label: 'Phone' },
  { key: '{{city}}', label: 'City' },
  { key: '{{state}}', label: 'State' },
];

/* ─── Main Page ─── */
export default function AutomationPage() {
  const [showCreate, setShowCreate] = useState(false);
  const [editingRule, setEditingRule] = useState<AutomationRule | null>(null);
  const [expandedRule, setExpandedRule] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['automations'],
    queryFn: async () => {
      const { data } = await api.get('/automation/rules');
      return data;
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/automation/rules/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to update'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/automation/rules/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Rule deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const duplicateMutation = useMutation({
    mutationFn: async (rule: AutomationRule) => {
      return api.post('/automation/rules', {
        name: `${rule.name} (copy)`,
        type: rule.type,
        triggerConfig: rule.triggerConfig,
        actionConfig: rule.actionConfig,
        sendAfterHour: rule.sendAfterHour,
        sendBeforeHour: rule.sendBeforeHour,
        sendOnWeekends: rule.sendOnWeekends,
        templates: rule.templates.map((t) => ({
          messageTemplate: t.messageTemplate,
          delayDays: t.delayDays,
        })),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Rule duplicated');
    },
  });

  const rules: AutomationRule[] = data?.rules || [];
  const activeRules = rules.filter((r) => r.isActive).length;
  const totalTemplates = rules.reduce((sum, r) => sum + (r.templates?.length || 0), 0);
  const totalRuns = rules.reduce((sum, r) => sum + (r._count?.runs || 0), 0);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50">Automation</h1>
          <p className="text-sm text-dark-400 mt-1">
            Configure follow-up sequences, triggers, and keyword rules
          </p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="btn-primary flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Rule
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark-400">Active Rules</span>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-scl-500/20 text-scl-400">
              <Zap className="w-5 h-5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <p className="text-2xl font-bold text-dark-50">{activeRules}</p>
            <p className="text-sm text-dark-500">/ {rules.length}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark-400">Total Steps</span>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-500/20 text-blue-400">
              <MessageSquare className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-dark-50 mt-2">{totalTemplates}</p>
        </div>
        <div className="stat-card">
          <div className="flex items-center justify-between">
            <span className="text-sm text-dark-400">Active Runs</span>
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/20 text-emerald-400">
              <Target className="w-5 h-5" />
            </div>
          </div>
          <p className="text-2xl font-bold text-dark-50 mt-2">{totalRuns}</p>
        </div>
      </div>

      {/* Rules List */}
      <div className="space-y-3">
        {isLoading &&
          [...Array(3)].map((_, i) => (
            <div key={i} className="card p-6 animate-pulse">
              <div className="h-5 bg-dark-700 rounded w-1/3 mb-3" />
              <div className="h-4 bg-dark-700 rounded w-2/3 mb-2" />
              <div className="h-3 bg-dark-700 rounded w-1/2" />
            </div>
          ))}

        {rules.map((rule) => {
          const isExpanded = expandedRule === rule.id;
          const typeConfig = TYPE_CONFIG[rule.type] || TYPE_CONFIG.MANUAL;

          return (
            <div
              key={rule.id}
              className={clsx(
                'card transition-all duration-200',
                isExpanded ? 'ring-1 ring-scl-600/30' : 'hover:border-dark-600'
              )}
            >
              {/* Rule Header */}
              <div className="p-5">
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-4 flex-1 min-w-0">
                    <button
                      onClick={() =>
                        toggleMutation.mutate({ id: rule.id, isActive: !rule.isActive })
                      }
                      className={clsx(
                        'mt-0.5 w-10 h-5 rounded-full transition-colors relative shrink-0',
                        rule.isActive ? 'bg-scl-600' : 'bg-dark-700'
                      )}
                      title={rule.isActive ? 'Deactivate' : 'Activate'}
                    >
                      <div
                        className={clsx(
                          'w-4 h-4 rounded-full bg-white absolute top-0.5 transition-transform',
                          rule.isActive ? 'translate-x-5' : 'translate-x-0.5'
                        )}
                      />
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-base font-semibold text-dark-100 truncate">
                          {rule.name}
                        </h3>
                        <span className={clsx('badge text-[10px]', typeConfig.bg, typeConfig.color)}>
                          {typeConfig.label}
                        </span>
                        {!rule.isActive && (
                          <span className="badge bg-dark-700 text-dark-500 text-[10px]">Paused</span>
                        )}
                      </div>

                      <div className="flex items-center gap-4 mt-1.5 text-xs text-dark-500">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" />
                          {rule.templates?.length || 0} step{(rule.templates?.length || 0) !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Target className="w-3 h-3" />
                          {rule._count?.runs || 0} run{(rule._count?.runs || 0) !== 1 ? 's' : ''}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {rule.sendAfterHour}:00–{rule.sendBeforeHour}:00
                          {rule.sendOnWeekends ? '' : ' (weekdays)'}
                        </span>
                      </div>

                      {!isExpanded && rule.templates?.length > 0 && (
                        <div className="mt-3 flex items-center gap-1.5 overflow-x-auto pb-1">
                          {rule.templates
                            .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                            .map((t, i) => (
                              <div key={t.id} className="flex items-center gap-1.5 shrink-0">
                                <div className="bg-dark-800/80 rounded-md px-2.5 py-1 text-[11px] text-dark-300 border border-dark-700/50 max-w-[180px] truncate">
                                  <span className="text-dark-500 font-medium mr-1">{i + 1}.</span>
                                  {t.messageTemplate.slice(0, 35)}
                                  {t.messageTemplate.length > 35 ? '…' : ''}
                                  <span className="text-dark-600 ml-1.5">{t.delayDays}d</span>
                                </div>
                                {i < rule.templates.length - 1 && (
                                  <ArrowRight className="w-3 h-3 text-dark-600 shrink-0" />
                                )}
                              </div>
                            ))}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 ml-3 shrink-0">
                    <button
                      onClick={() => setExpandedRule(isExpanded ? null : rule.id)}
                      className="btn-ghost p-2 text-dark-400"
                      title={isExpanded ? 'Collapse' : 'Expand'}
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => duplicateMutation.mutate(rule)}
                      className="btn-ghost p-2 text-dark-400 hover:text-dark-200"
                      title="Duplicate"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setEditingRule(rule)}
                      className="btn-ghost p-2 text-dark-400 hover:text-dark-200"
                      title="Edit"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(`Delete rule "${rule.name}"? This will also stop all active runs.`)) {
                          deleteMutation.mutate(rule.id);
                        }
                      }}
                      className="btn-ghost p-2 text-dark-500 hover:text-red-400"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded: visual sequence pipeline */}
              {isExpanded && (
                <div className="px-5 pb-5 border-t border-dark-700/50 pt-4">
                  <h4 className="text-xs font-semibold text-dark-400 uppercase tracking-wider mb-4">
                    Message Sequence
                  </h4>
                  <div className="space-y-0">
                    {rule.templates
                      .sort((a, b) => a.sequenceOrder - b.sequenceOrder)
                      .map((t, i) => (
                        <div key={t.id}>
                          {i > 0 && (
                            <div className="flex items-center gap-3 ml-5 py-2">
                              <div className="w-px h-4 bg-dark-600" />
                              <div className="flex items-center gap-1.5 text-[10px] text-dark-500 bg-dark-800/50 rounded-full px-2.5 py-0.5">
                                <Clock className="w-3 h-3" />
                                Wait {t.delayDays} day{t.delayDays !== 1 ? 's' : ''}
                              </div>
                            </div>
                          )}
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-lg bg-scl-600/20 flex items-center justify-center text-scl-400 text-sm font-bold shrink-0">
                              {i + 1}
                            </div>
                            <div className="flex-1 bg-dark-800/40 rounded-lg p-3 border border-dark-700/30">
                              <p className="text-sm text-dark-200 whitespace-pre-wrap leading-relaxed">
                                {t.messageTemplate}
                              </p>
                              <div className="flex items-center gap-3 mt-2 text-[10px] text-dark-500">
                                <span>{t.messageTemplate.length} chars</span>
                                {t.messageTemplate.length > 160 && (
                                  <span className="text-amber-400 flex items-center gap-1">
                                    <AlertCircle className="w-3 h-3" />
                                    {Math.ceil(t.messageTemplate.length / 160)} SMS segments
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>

                  {rule.templates.length === 0 && (
                    <p className="text-sm text-dark-500 italic">No message steps configured</p>
                  )}

                  <div className="mt-5 bg-dark-800/30 rounded-lg p-3 border border-dark-700/30">
                    <h5 className="text-[10px] text-dark-500 uppercase tracking-wider font-semibold mb-2">
                      Trigger Configuration
                    </h5>
                    <TriggerDetails type={rule.type} config={rule.triggerConfig} />
                  </div>

                  {/* Runs Panel */}
                  <RunsPanel ruleId={rule.id} />
                </div>
              )}
            </div>
          );
        })}

        {rules.length === 0 && !isLoading && (
          <div className="card p-12 text-center">
            <Zap className="w-12 h-12 mx-auto text-dark-600 mb-4" />
            <p className="text-dark-300 font-medium">No automation rules yet</p>
            <p className="text-sm text-dark-500 mt-1">
              Create follow-up sequences to automatically nurture your leads
            </p>
            <button onClick={() => setShowCreate(true)} className="btn-primary mt-4 mx-auto">
              <Plus className="w-4 h-4 mr-1" /> Create Rule
            </button>
          </div>
        )}
      </div>

      {(showCreate || editingRule) && (
        <AutomationModal
          rule={editingRule}
          onClose={() => { setShowCreate(false); setEditingRule(null); }}
        />
      )}
    </div>
  );
}

/* ─── Trigger Details Display ─── */
function TriggerDetails({ type, config }: { type: string; config: Record<string, any> }) {
  switch (type) {
    case 'STATUS_CHANGED':
      return (
        <p className="text-xs text-dark-300">
          When lead status changes
          {config.fromStatus ? ` from ${config.fromStatus}` : ''}
          {config.toStatus ? ` to ${config.toStatus}` : ''}
          {!config.fromStatus && !config.toStatus && ' (any change)'}
        </p>
      );
    case 'KEYWORD_RECEIVED':
      return (
        <p className="text-xs text-dark-300">
          When incoming message contains: <span className="font-mono text-scl-300">{config.keywords || '(not set)'}</span>
        </p>
      );
    case 'NO_REPLY':
      return (
        <p className="text-xs text-dark-300">
          After <span className="font-bold text-dark-200">{config.daysNoReply || 3}</span> days without reply
        </p>
      );
    case 'LEAD_CREATED':
      return (
        <p className="text-xs text-dark-300">
          When new lead is created{config.source ? ` from source: ${config.source}` : ' (any source)'}
        </p>
      );
    case 'TAG_RULE':
      return (
        <p className="text-xs text-dark-300">
          When tag is applied: <span className="font-mono text-scl-300">{config.tagName || '(any)'}</span>
        </p>
      );
    default:
      return <p className="text-xs text-dark-300">Manually triggered</p>;
  }
}

/* ─── Runs Panel ─── */
function RunsPanel({ ruleId }: { ruleId: string }) {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['automation-runs', ruleId],
    queryFn: async () => {
      const { data } = await api.get(`/automation/rules/${ruleId}`);
      return data;
    },
  });

  const pauseMutation = useMutation({
    mutationFn: (runId: string) => api.post(`/automation/runs/${runId}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-runs', ruleId] });
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Run paused');
    },
    onError: () => toast.error('Failed to pause run'),
  });

  const resumeMutation = useMutation({
    mutationFn: (runId: string) => api.post(`/automation/runs/${runId}/resume`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automation-runs', ruleId] });
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success('Run resumed');
    },
    onError: () => toast.error('Failed to resume run'),
  });

  const runs = data?.rule?.runs || [];

  return (
    <div className="mt-5">
      <h5 className="text-[10px] text-dark-500 uppercase tracking-wider font-semibold mb-3 flex items-center gap-1.5">
        <Users className="w-3 h-3" />
        Active Runs ({runs.length})
      </h5>

      {isLoading && (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="h-10 bg-dark-800/50 rounded animate-pulse" />
          ))}
        </div>
      )}

      {runs.length === 0 && !isLoading && (
        <p className="text-xs text-dark-500 italic bg-dark-800/30 rounded-lg p-3 border border-dark-700/30">
          No leads enrolled yet. Use "Start Automation" from the Leads page to enroll leads.
        </p>
      )}

      {runs.length > 0 && (
        <div className="bg-dark-800/30 rounded-lg border border-dark-700/30 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-dark-700/50 bg-dark-800/50">
                <th className="px-3 py-2 text-left text-dark-500 font-medium">Lead</th>
                <th className="px-3 py-2 text-left text-dark-500 font-medium">Step</th>
                <th className="px-3 py-2 text-left text-dark-500 font-medium">Status</th>
                <th className="px-3 py-2 text-left text-dark-500 font-medium">Next Run</th>
                <th className="px-3 py-2 text-right text-dark-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((run: any) => (
                <tr key={run.id} className="border-b border-dark-700/30 last:border-0">
                  <td className="px-3 py-2">
                    <span className="text-dark-200 font-medium">
                      {run.lead?.firstName} {run.lead?.lastName || ''}
                    </span>
                    <span className="text-dark-500 ml-1.5 font-mono">{run.lead?.phone}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-dark-300">Step {run.currentStep + 1}</span>
                  </td>
                  <td className="px-3 py-2">
                    {run.completedAt ? (
                      <span className="badge bg-green-500/20 text-green-300">Completed</span>
                    ) : run.isPaused ? (
                      <span className="badge bg-yellow-500/20 text-yellow-300">Paused{run.pauseReason ? ` (${run.pauseReason})` : ''}</span>
                    ) : run.isActive ? (
                      <span className="badge bg-scl-500/20 text-scl-300">Active</span>
                    ) : (
                      <span className="badge bg-dark-700 text-dark-400">Stopped</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-dark-400">
                    {run.nextRunAt
                      ? formatDistanceToNow(new Date(run.nextRunAt), { addSuffix: true })
                      : run.completedAt
                        ? format(new Date(run.completedAt), 'MMM d')
                        : '—'}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {run.isActive && !run.completedAt && (
                      run.isPaused ? (
                        <button
                          onClick={() => resumeMutation.mutate(run.id)}
                          className="btn-ghost p-1 text-green-400 hover:text-green-300"
                          title="Resume"
                        >
                          <Play className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <button
                          onClick={() => pauseMutation.mutate(run.id)}
                          className="btn-ghost p-1 text-yellow-400 hover:text-yellow-300"
                          title="Pause"
                        >
                          <Pause className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── Automation Modal (Create/Edit) ─── */
function AutomationModal({ rule, onClose }: { rule?: AutomationRule | null; onClose: () => void }) {
  const isEdit = !!rule;
  const queryClient = useQueryClient();

  const [form, setForm] = useState({
    name: rule?.name || '',
    type: rule?.type || 'LEAD_CREATED',
    triggerConfig: rule?.triggerConfig || {},
    actionConfig: rule?.actionConfig || {},
    isActive: rule?.isActive ?? true,
    sendAfterHour: rule?.sendAfterHour ?? 9,
    sendBeforeHour: rule?.sendBeforeHour ?? 21,
    sendOnWeekends: rule?.sendOnWeekends ?? false,
  });

  const [templates, setTemplates] = useState<{ messageTemplate: string; delayDays: number }[]>(
    rule?.templates
      ?.sort((a, b) => a.sequenceOrder - b.sequenceOrder)
      .map((t) => ({ messageTemplate: t.messageTemplate, delayDays: t.delayDays }))
    || [{ messageTemplate: '', delayDays: 1 }]
  );

  const [activeStep, setActiveStep] = useState(0);
  const [showVarHelper, setShowVarHelper] = useState<number | null>(null);

  const saveMutation = useMutation({
    mutationFn: (data: any) =>
      isEdit ? api.put(`/automation/rules/${rule!.id}`, data) : api.post('/automation/rules', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      toast.success(isEdit ? 'Rule updated' : 'Rule created');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to save'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { toast.error('Rule name is required'); return; }
    const nonEmpty = templates.filter((t) => t.messageTemplate.trim());
    if (nonEmpty.length === 0) { toast.error('Add at least one message step'); return; }
    saveMutation.mutate({
      ...form,
      templates: nonEmpty.map((t, i) => ({ messageTemplate: t.messageTemplate, delayDays: t.delayDays, sequenceOrder: i + 1 })),
    });
  };

  const addStep = () => {
    setTemplates([...templates, { messageTemplate: '', delayDays: 1 }]);
    setActiveStep(templates.length);
  };

  const removeStep = (i: number) => {
    if (templates.length <= 1) return;
    setTemplates(templates.filter((_, idx) => idx !== i));
    if (activeStep >= i && activeStep > 0) setActiveStep(activeStep - 1);
  };

  const moveStep = (from: number, direction: 'up' | 'down') => {
    const to = direction === 'up' ? from - 1 : from + 1;
    if (to < 0 || to >= templates.length) return;
    const next = [...templates];
    [next[from], next[to]] = [next[to], next[from]];
    setTemplates(next);
    setActiveStep(to);
  };

  const insertVariable = (stepIndex: number, variable: string) => {
    const next = [...templates];
    next[stepIndex] = { ...next[stepIndex], messageTemplate: next[stepIndex].messageTemplate + variable };
    setTemplates(next);
    setShowVarHelper(null);
  };

  const previewMessage = (template: string) =>
    template
      .replace(/\{\{firstName\}\}/g, 'John')
      .replace(/\{\{lastName\}\}/g, 'Smith')
      .replace(/\{\{company\}\}/g, 'Acme Corp')
      .replace(/\{\{phone\}\}/g, '+1 (212) 555-1234')
      .replace(/\{\{city\}\}/g, 'New York')
      .replace(/\{\{state\}\}/g, 'NY');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-6">
      <div className="card w-full max-w-3xl mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
          <div>
            <h3 className="text-lg font-bold text-dark-50">
              {isEdit ? 'Edit Automation Rule' : 'New Automation Rule'}
            </h3>
            <p className="text-xs text-dark-500 mt-0.5">Configure trigger, send window, and message sequence</p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1.5"><X className="w-5 h-5" /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="px-6 py-5 space-y-6 max-h-[70vh] overflow-y-auto">
            {/* Rule Name + Type */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label">Rule Name</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g., New Lead Follow-Up" required autoFocus />
              </div>
              <div>
                <label className="label">Trigger Type</label>
                <select className="input" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value, triggerConfig: {} })}>
                  <option value="LEAD_CREATED">Lead Created</option>
                  <option value="STATUS_CHANGED">Status Changed</option>
                  <option value="KEYWORD_RECEIVED">Keyword Received</option>
                  <option value="NO_REPLY">No Reply (timeout)</option>
                  <option value="TAG_RULE">Tag Applied</option>
                  <option value="FOLLOW_UP_SEQUENCE">Follow-Up Sequence</option>
                  <option value="MANUAL">Manual Start</option>
                </select>
              </div>
            </div>

            {/* Trigger Config */}
            <TriggerConfigFields type={form.type} config={form.triggerConfig} onChange={(triggerConfig) => setForm({ ...form, triggerConfig })} />

            {/* Send Window */}
            <div className="bg-dark-800/50 rounded-lg p-4 border border-dark-700/50">
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-4 h-4 text-dark-400" />
                <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider">Send Window</label>
              </div>
              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-dark-400">After</label>
                  <input type="number" className="input w-20 py-1.5 text-sm text-center" min={0} max={23} value={form.sendAfterHour} onChange={(e) => setForm({ ...form, sendAfterHour: parseInt(e.target.value) || 0 })} />
                  <span className="text-xs text-dark-500">:00</span>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs text-dark-400">Before</label>
                  <input type="number" className="input w-20 py-1.5 text-sm text-center" min={0} max={23} value={form.sendBeforeHour} onChange={(e) => setForm({ ...form, sendBeforeHour: parseInt(e.target.value) || 23 })} />
                  <span className="text-xs text-dark-500">:00</span>
                </div>
                <label className="flex items-center gap-2 text-xs text-dark-300 cursor-pointer ml-2">
                  <input type="checkbox" checked={form.sendOnWeekends} onChange={(e) => setForm({ ...form, sendOnWeekends: e.target.checked })} className="w-3.5 h-3.5 rounded border-dark-600 bg-dark-800 text-scl-500" />
                  Include weekends
                </label>
              </div>
            </div>

            {/* Message Sequence Builder */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-dark-400" />
                  <label className="text-xs font-semibold text-dark-300 uppercase tracking-wider">
                    Message Sequence ({templates.length} step{templates.length !== 1 ? 's' : ''})
                  </label>
                </div>
                <button type="button" onClick={addStep} className="text-xs text-scl-400 hover:text-scl-300 flex items-center gap-1 transition-colors">
                  <Plus className="w-3 h-3" /> Add Step
                </button>
              </div>

              <div className="space-y-0">
                {templates.map((tpl, i) => (
                  <div key={i}>
                    {i > 0 && (
                      <div className="flex items-center gap-2 ml-4 py-1.5">
                        <div className="w-px h-3 bg-dark-600" />
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3 h-3 text-dark-500" />
                          <span className="text-[10px] text-dark-500">Wait</span>
                          <input
                            type="number"
                            className="w-14 py-0.5 px-2 text-xs text-center bg-dark-800 border border-dark-700 rounded text-dark-300 focus:border-scl-500 focus:outline-none"
                            value={tpl.delayDays}
                            onChange={(e) => { const next = [...templates]; next[i] = { ...next[i], delayDays: parseInt(e.target.value) || 0 }; setTemplates(next); }}
                            min={0}
                          />
                          <span className="text-[10px] text-dark-500">day{tpl.delayDays !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    )}

                    <div
                      className={clsx(
                        'rounded-lg border transition-colors',
                        activeStep === i ? 'border-scl-600/40 bg-dark-800/60' : 'border-dark-700/30 bg-dark-800/30'
                      )}
                      onClick={() => setActiveStep(i)}
                    >
                      <div className="flex items-center justify-between px-3 py-2 border-b border-dark-700/30">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-scl-600/20 flex items-center justify-center text-scl-400 text-xs font-bold">{i + 1}</div>
                          <span className="text-xs font-medium text-dark-300">
                            Step {i + 1}{i === 0 && templates.length === 1 ? ' (initial message)' : ''}
                          </span>
                        </div>
                        <div className="flex items-center gap-0.5">
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveStep(i, 'up'); }} disabled={i === 0} className="btn-ghost p-1 text-dark-500 hover:text-dark-300 disabled:opacity-30" title="Move up">
                            <ChevronUp className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={(e) => { e.stopPropagation(); moveStep(i, 'down'); }} disabled={i === templates.length - 1} className="btn-ghost p-1 text-dark-500 hover:text-dark-300 disabled:opacity-30" title="Move down">
                            <ChevronDown className="w-3.5 h-3.5" />
                          </button>
                          <div className="relative">
                            <button type="button" onClick={(e) => { e.stopPropagation(); setShowVarHelper(showVarHelper === i ? null : i); }} className="btn-ghost p-1 text-dark-500 hover:text-scl-400" title="Insert variable">
                              <span className="text-[10px] font-mono">{'{}'}</span>
                            </button>
                            {showVarHelper === i && (
                              <div className="absolute right-0 top-full mt-1 z-10 bg-dark-800 border border-dark-600 rounded-lg shadow-xl py-1 min-w-[160px]">
                                {TEMPLATE_VARS.map((v) => (
                                  <button key={v.key} type="button" onClick={(e) => { e.stopPropagation(); insertVariable(i, v.key); }} className="w-full text-left px-3 py-1.5 text-xs hover:bg-dark-700 text-dark-300 flex items-center justify-between">
                                    <span>{v.label}</span>
                                    <span className="font-mono text-dark-500 text-[10px]">{v.key}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                          {templates.length > 1 && (
                            <button type="button" onClick={(e) => { e.stopPropagation(); removeStep(i); }} className="btn-ghost p-1 text-dark-500 hover:text-red-400" title="Remove step">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="p-3">
                        <textarea
                          className="w-full bg-transparent border-none outline-none text-sm text-dark-200 resize-none placeholder:text-dark-600 min-h-[70px]"
                          placeholder="Type your message. Use {{firstName}}, {{company}}, etc."
                          value={tpl.messageTemplate}
                          onChange={(e) => { const next = [...templates]; next[i] = { ...next[i], messageTemplate: e.target.value }; setTemplates(next); }}
                          onFocus={() => setActiveStep(i)}
                        />
                        <div className="flex items-center justify-between text-[10px] text-dark-500 mt-1">
                          <span>{tpl.messageTemplate.length} chars</span>
                          <div className="flex items-center gap-3">
                            {tpl.messageTemplate.length > 160 && (
                              <span className="text-amber-400">{Math.ceil(tpl.messageTemplate.length / 160)} segments</span>
                            )}
                            {i === 0 && <span className="text-dark-600">Sends immediately on trigger</span>}
                          </div>
                        </div>
                        {tpl.messageTemplate.includes('{{') && (
                          <div className="mt-2 pt-2 border-t border-dark-700/30">
                            <p className="text-[10px] text-dark-500 mb-1">Preview:</p>
                            <p className="text-xs text-dark-400 italic">{previewMessage(tpl.messageTemplate)}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {templates.length > 1 && (
                <div className="mt-3 text-xs text-dark-500 flex items-center gap-2">
                  <Clock className="w-3.5 h-3.5" />
                  Total sequence duration: <span className="font-medium text-dark-300">{templates.reduce((sum, t) => sum + t.delayDays, 0)} days</span>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-6 py-4 border-t border-dark-700/50 bg-dark-900/50">
            <div className="text-xs text-dark-500">
              {templates.filter((t) => t.messageTemplate.trim()).length} of {templates.length} steps configured
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
              <button type="submit" disabled={saveMutation.isPending} className="btn-primary">
                {saveMutation.isPending ? 'Saving...' : isEdit ? 'Update Rule' : 'Create Rule'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Trigger Config Fields ─── */
function TriggerConfigFields({ type, config, onChange }: { type: string; config: Record<string, any>; onChange: (config: Record<string, any>) => void }) {
  switch (type) {
    case 'STATUS_CHANGED':
      return (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">From Status</label>
            <select className="input" value={config.fromStatus || ''} onChange={(e) => onChange({ ...config, fromStatus: e.target.value })}>
              <option value="">Any</option>
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">To Status</label>
            <select className="input" value={config.toStatus || ''} onChange={(e) => onChange({ ...config, toStatus: e.target.value })}>
              <option value="">Any</option>
              {LEAD_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
      );
    case 'KEYWORD_RECEIVED':
      return (
        <div>
          <label className="label">Keywords (comma separated)</label>
          <input className="input" placeholder="e.g., interested, more info, pricing, yes" value={config.keywords || ''} onChange={(e) => onChange({ ...config, keywords: e.target.value })} />
          <p className="text-xs text-dark-500 mt-1">Case-insensitive matching. Separate multiple keywords with commas.</p>
        </div>
      );
    case 'NO_REPLY':
      return (
        <div>
          <label className="label">Days without reply</label>
          <div className="flex items-center gap-2">
            <input type="number" className="input w-28" min={1} max={90} value={config.daysNoReply || 3} onChange={(e) => onChange({ ...config, daysNoReply: parseInt(e.target.value) || 3 })} />
            <span className="text-sm text-dark-400">days</span>
          </div>
        </div>
      );
    case 'LEAD_CREATED':
      return (
        <div>
          <label className="label">Source filter (optional)</label>
          <input className="input" placeholder="e.g., Website, CSV Import, API" value={config.source || ''} onChange={(e) => onChange({ ...config, source: e.target.value })} />
          <p className="text-xs text-dark-500 mt-1">Leave empty to trigger for leads from any source</p>
        </div>
      );
    case 'TAG_RULE':
      return (
        <div>
          <label className="label">Tag Name</label>
          <input className="input" placeholder="e.g., Hot Lead, VIP" value={config.tagName || ''} onChange={(e) => onChange({ ...config, tagName: e.target.value })} />
          <p className="text-xs text-dark-500 mt-1">Trigger when this tag is applied to a lead</p>
        </div>
      );
    case 'FOLLOW_UP_SEQUENCE':
      return (
        <div className="space-y-3">
          <div>
            <label className="label">Initial Delay (days)</label>
            <div className="flex items-center gap-2">
              <input type="number" className="input w-28" min={0} max={90} value={config.initialDelayDays || 1} onChange={(e) => onChange({ ...config, initialDelayDays: parseInt(e.target.value) || 1 })} />
              <span className="text-sm text-dark-400">days after enrollment</span>
            </div>
          </div>
          <div>
            <label className="label">Stop on Reply</label>
            <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
              <input type="checkbox" checked={config.stopOnReply !== false} onChange={(e) => onChange({ ...config, stopOnReply: e.target.checked })} className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-scl-500" />
              Stop sequence when lead replies
            </label>
          </div>
        </div>
      );
    default:
      return (
        <div className="bg-dark-800/30 rounded-lg p-3 border border-dark-700/30">
          <p className="text-xs text-dark-400 flex items-center gap-2">
            <Play className="w-3.5 h-3.5" /> This rule must be started manually from the Leads page or via API
          </p>
        </div>
      );
  }
}
