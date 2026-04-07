import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { Campaign, CampaignStatus } from '../types';
import { useDebounce } from '../hooks/useDebounce';
import { SmsCounter } from '../components/SmsCounter';
import {
  Plus,
  Search,
  Play,
  Pause,
  XCircle,
  BarChart3,
  Send,
  Clock,
  CheckCircle,
  AlertTriangle,
  ChevronRight,
  Filter,
  Trash2,
  Users,
  Copy,
  Eye,
  Upload,
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useAuthStore } from '../stores/authStore';

export default function CampaignsPage() {
  const { user } = useAuthStore();
  const canManage = user?.role === 'ADMIN' || user?.role === 'MANAGER' || user?.role === 'REP';
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; campaign: Campaign } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  // Close context menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
    };
    if (ctxMenu) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [ctxMenu]);

  const { data, isLoading } = useQuery({
    queryKey: ['campaigns', statusFilter, debouncedSearch, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '20');
      if (statusFilter) params.set('status', statusFilter);
      if (debouncedSearch) params.set('search', debouncedSearch);
      const { data } = await api.get(`/campaigns?${params}`);
      return data;
    },
  });

  const totalPages = data?.pagination?.pages || 1;
  const total = data?.pagination?.total || 0;

  const startMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign started!');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to start'),
  });

  const pauseMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/pause`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign paused');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to pause'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.post(`/campaigns/${id}/cancel`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign cancelled');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to cancel'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign deleted');
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to delete'),
  });

  const statuses: CampaignStatus[] = ['DRAFT', 'SCHEDULED', 'SENDING', 'PAUSED', 'COMPLETED', 'CANCELLED'];

  return (
    <div className="p-8 space-y-6 max-w-[1600px]">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50">Campaigns</h1>
          <p className="text-sm text-dark-400 mt-1">Manage your SMS campaigns</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreateModal(true)} className="btn-primary">
            <Plus className="w-4 h-4" />
            New Campaign
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search campaigns..."
            className="input pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatusFilter('')}
            className={`badge cursor-pointer ${!statusFilter ? 'bg-scl-600/30 text-scl-300' : 'bg-dark-700 text-dark-400 hover:text-dark-300'}`}
          >
            All
          </button>
          {statuses.map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`badge cursor-pointer ${statusFilter === s ? 'bg-scl-600/30 text-scl-300' : 'bg-dark-700 text-dark-400 hover:text-dark-300'}`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Campaign List */}
      <div className="card overflow-hidden">
        <table className="w-full">
          <thead>
            <tr>
              <th className="table-header">Campaign</th>
              <th className="table-header">Status</th>
              <th className="table-header text-center">Sent</th>
              <th className="table-header text-center">Delivered</th>
              <th className="table-header text-center">Failed</th>
              <th className="table-header text-center">Blocked</th>
              <th className="table-header text-center">Replied</th>
              <th className="table-header text-center">Rate</th>
              <th className="table-header">Created</th>
              {canManage && <th className="table-header">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={10} className="p-8 text-center text-dark-500">
                  Loading campaigns...
                </td>
              </tr>
            )}
            {data?.campaigns?.length === 0 && (
              <tr>
                <td colSpan={10} className="p-12 text-center text-dark-500">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-14 h-14 rounded-2xl bg-dark-800/80 flex items-center justify-center">
                      <Send className="w-7 h-7 opacity-40" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-dark-300">No campaigns yet</p>
                      <p className="text-xs mt-1">Create your first campaign to start reaching leads</p>
                    </div>
                    <button
                      onClick={() => setShowCreateModal(true)}
                      className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5 mt-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> New Campaign
                    </button>
                  </div>
                </td>
              </tr>
            )}
            {data?.campaigns?.map((campaign: Campaign) => {
              const deliveryRate =
                campaign.totalSent > 0 ? ((campaign.totalDelivered / campaign.totalSent) * 100).toFixed(1) : null;

              return (
                <tr
                  key={campaign.id}
                  className="table-row cursor-context-menu"
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({ x: e.clientX, y: e.clientY, campaign });
                  }}
                >
                  <td className="table-cell">
                    <div>
                      <p className="font-medium text-dark-200">{campaign.name}</p>
                      <p className="text-xs text-dark-500 mt-0.5">{campaign.totalLeads} leads</p>
                    </div>
                  </td>
                  <td className="table-cell">
                    <CampaignStatusBadge status={campaign.status} />
                  </td>
                  <CampaignSentTooltip campaign={campaign} />
                  <td className="table-cell text-center font-mono text-green-400">
                    {campaign.totalDelivered.toLocaleString()}
                  </td>
                  <td className="table-cell text-center font-mono text-red-400">
                    {campaign.totalFailed.toLocaleString()}
                  </td>
                  <td className="table-cell text-center font-mono text-yellow-400">
                    {campaign.totalBlocked.toLocaleString()}
                  </td>
                  <td className="table-cell text-center font-mono text-purple-400">
                    {campaign.totalReplied.toLocaleString()}
                  </td>
                  <td className="table-cell text-center">
                    {deliveryRate !== null ? (
                      <span
                        className={`text-xs font-medium ${
                          parseFloat(deliveryRate) >= 80
                            ? 'text-green-400'
                            : parseFloat(deliveryRate) >= 50
                              ? 'text-yellow-400'
                              : 'text-red-400'
                        }`}
                      >
                        {deliveryRate}%
                      </span>
                    ) : (
                      <span className="text-xs text-dark-500">—</span>
                    )}
                  </td>
                  <td className="table-cell text-dark-500 text-xs">
                    {format(new Date(campaign.createdAt), 'MMM d, yyyy')}
                  </td>
                  {canManage && (
                    <td className="table-cell">
                      <div className="flex items-center gap-1">
                        {['DRAFT', 'SCHEDULED', 'PAUSED'].includes(campaign.status) && (
                          <button
                            onClick={() => startMutation.mutate(campaign.id)}
                            className="p-1.5 hover:bg-green-600/20 rounded text-dark-400 hover:text-green-400 transition-colors"
                            title="Start"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {campaign.status === 'SENDING' && (
                          <button
                            onClick={() => pauseMutation.mutate(campaign.id)}
                            className="p-1.5 hover:bg-yellow-600/20 rounded text-dark-400 hover:text-yellow-400 transition-colors"
                            title="Pause"
                          >
                            <Pause className="w-4 h-4" />
                          </button>
                        )}
                        {['SENDING', 'PAUSED', 'SCHEDULED'].includes(campaign.status) && (
                          <button
                            onClick={() => {
                              if (window.confirm('Cancel this campaign?')) cancelMutation.mutate(campaign.id);
                            }}
                            className="p-1.5 hover:bg-red-600/20 rounded text-dark-400 hover:text-red-400 transition-colors"
                            title="Cancel"
                          >
                            <XCircle className="w-4 h-4" />
                          </button>
                        )}
                        {['DRAFT', 'COMPLETED', 'CANCELLED'].includes(campaign.status) && (
                          <button
                            onClick={() => {
                              if (window.confirm('Delete this campaign?')) deleteMutation.mutate(campaign.id);
                            }}
                            className="p-1.5 hover:bg-red-600/20 rounded text-dark-400 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
            <p className="text-xs text-dark-500">{total} campaigns total</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="btn-ghost py-1 px-2 text-xs disabled:opacity-30"
              >
                Previous
              </button>
              <span className="text-xs text-dark-400">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="btn-ghost py-1 px-2 text-xs disabled:opacity-30"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Right-Click Context Menu */}
      {ctxMenu && (
        <div
          ref={ctxMenuRef}
          className="fixed z-[100] w-52 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl py-1 animate-in fade-in"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
        >
          <button
            onClick={() => {
              navigate(`/campaigns/${ctxMenu.campaign.id}`);
              setCtxMenu(null);
            }}
            className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
          >
            <Eye className="w-3.5 h-3.5" /> View Campaign
          </button>
          <button
            onClick={() => {
              navigator.clipboard.writeText(ctxMenu.campaign.name);
              toast.success('Name copied');
              setCtxMenu(null);
            }}
            className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
          >
            <Copy className="w-3.5 h-3.5" /> Copy Name
          </button>
          {canManage && (
            <>
              <div className="border-t border-dark-700 my-1" />
              {['DRAFT', 'SCHEDULED', 'PAUSED'].includes(ctxMenu.campaign.status) && (
                <button
                  onClick={() => {
                    startMutation.mutate(ctxMenu.campaign.id);
                    setCtxMenu(null);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-green-400 hover:bg-dark-700/50 flex items-center gap-2"
                >
                  <Play className="w-3.5 h-3.5" /> Start Campaign
                </button>
              )}
              {ctxMenu.campaign.status === 'SENDING' && (
                <button
                  onClick={() => {
                    pauseMutation.mutate(ctxMenu.campaign.id);
                    setCtxMenu(null);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-yellow-400 hover:bg-dark-700/50 flex items-center gap-2"
                >
                  <Pause className="w-3.5 h-3.5" /> Pause Campaign
                </button>
              )}
              {['SENDING', 'PAUSED', 'SCHEDULED'].includes(ctxMenu.campaign.status) && (
                <button
                  onClick={() => {
                    setCtxMenu(null);
                    if (window.confirm('Cancel this campaign?')) cancelMutation.mutate(ctxMenu.campaign.id);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-dark-700/50 flex items-center gap-2"
                >
                  <XCircle className="w-3.5 h-3.5" /> Cancel Campaign
                </button>
              )}
              {['DRAFT', 'COMPLETED', 'CANCELLED'].includes(ctxMenu.campaign.status) && (
                <>
                  <div className="border-t border-dark-700 my-1" />
                  <button
                    onClick={() => {
                      setCtxMenu(null);
                      if (window.confirm('Delete this campaign?')) deleteMutation.mutate(ctxMenu.campaign.id);
                    }}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-dark-700/50 flex items-center gap-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Delete Campaign
                  </button>
                </>
              )}
            </>
          )}
        </div>
      )}

      {/* Create Campaign Modal */}
      {showCreateModal && <CreateCampaignModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}

function CreateCampaignModal({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    messageTemplate: '',
    sendingSpeed: 4,
    dailyLimit: 0,
    scheduledAt: '',
  });
  const [leadFilter, setLeadFilter] = useState({ status: '', search: '', source: '', state: '', tag: '' });
  const [selectedLeadIds, setSelectedLeadIds] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);
  const [leadSource, setLeadSource] = useState<'lists' | 'select' | 'csv'>('lists');
  const [selectedLists, setSelectedLists] = useState<Set<string>>(new Set());
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvPreview, setCsvPreview] = useState<any>(null);
  const [csvMapping, setCsvMapping] = useState<Record<string, string>>({});
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvImported, setCsvImported] = useState<{ ids: string[]; count: number } | null>(null);
  const [csvListName, setCsvListName] = useState('');

  // Load available import lists for selection
  const { data: tagsData } = useQuery({
    queryKey: ['import-lists'],
    queryFn: async () => {
      const { data } = await api.get('/settings/tags?type=importList');
      return data;
    },
  });
  const availableTags = tagsData?.tags || [];

  // Load available leads for selection
  const { data: leadsData } = useQuery({
    queryKey: [
      'campaign-leads',
      leadFilter.status,
      leadFilter.search,
      leadFilter.source,
      leadFilter.state,
      leadFilter.tag,
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '200');
      if (leadFilter.status) params.set('status', leadFilter.status);
      if (leadFilter.search) params.set('search', leadFilter.search);
      if (leadFilter.source) params.set('source', leadFilter.source);
      if (leadFilter.state) params.set('state', leadFilter.state);
      if (leadFilter.tag) params.set('tags', leadFilter.tag);
      const { data } = await api.get(`/leads?${params}`);
      return data;
    },
  });

  const availableLeads = leadsData?.leads || [];
  const totalAvailable = leadsData?.pagination?.total || 0;

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/campaigns', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['campaigns'] });
      toast.success('Campaign created!');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to create'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      ...formData,
      dailyLimit: formData.dailyLimit || null,
      scheduledAt: formData.scheduledAt || null,
    };
    if (leadSource === 'csv' && csvImported) {
      createMutation.mutate({
        ...payload,
        leadIds: csvImported.ids,
      });
    } else if (leadSource === 'lists' && selectedLists.size > 0) {
      createMutation.mutate({
        ...payload,
        filterTags: Array.from(selectedLists),
      });
    } else if (selectAll) {
      // Server-side filtering — no 200-lead cap
      createMutation.mutate({
        ...payload,
        filterStatus: leadFilter.status ? [leadFilter.status] : undefined,
        filterSource: leadFilter.source || undefined,
        filterState: leadFilter.state || undefined,
        filterTags: leadFilter.tag ? [leadFilter.tag] : undefined,
      });
    } else {
      createMutation.mutate({
        ...payload,
        leadIds: Array.from(selectedLeadIds),
      });
    }
  };

  const handleCsvSelect = async (file: File) => {
    setCsvFile(file);
    setCsvImported(null);
    // Auto-fill list name from filename (without .csv extension)
    if (!csvListName) setCsvListName(file.name.replace(/\.csv$/i, ''));
    const fd = new FormData();
    fd.append('file', file);
    try {
      const { data } = await api.post('/leads/preview', fd);
      setCsvPreview(data);
      setCsvMapping(data.mappingSuggestions || {});
    } catch {
      toast.error('Failed to parse CSV');
    }
  };

  const handleCsvImport = async () => {
    if (!csvFile || !csvMapping.phone) return;
    setCsvUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', csvFile);
      fd.append('mapping', JSON.stringify(csvMapping));
      if (csvListName.trim()) fd.append('listName', csvListName.trim());
      const { data } = await api.post('/leads/import-mapped', fd);
      const ids = data.leadIds || [];
      setCsvImported({ ids, count: ids.length });
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success(`${data.imported} leads imported, ${data.duplicates} duplicates updated`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Import failed');
    } finally {
      setCsvUploading(false);
    }
  };

  const toggleLead = (id: string) => {
    setSelectedLeadIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    setSelectAll(false);
  };

  const toggleAllVisible = () => {
    if (selectedLeadIds.size === availableLeads.length) {
      setSelectedLeadIds(new Set());
    } else {
      setSelectedLeadIds(new Set(availableLeads.map((l: any) => l.id)));
    }
  };

  const toggleList = (tagId: string) => {
    setSelectedLists((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const selectedListsLeadCount = availableTags
    .filter((t: any) => selectedLists.has(t.id))
    .reduce((sum: number, t: any) => sum + (t._count?.leads || 0), 0);

  const leadCount =
    leadSource === 'csv'
      ? csvImported?.count || 0
      : leadSource === 'lists'
        ? selectedListsLeadCount
        : selectAll
          ? totalAvailable
          : selectedLeadIds.size;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-8">
      <div className="card w-full max-w-2xl mx-4 animate-fade-in">
        <div className="card-header flex items-center justify-between">
          <h3 className="text-lg font-semibold text-dark-100">New Campaign</h3>
          <button onClick={onClose} className="text-dark-500 hover:text-dark-300">
            <XCircle className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="card-body space-y-4">
          <div>
            <label className="label">Campaign Name</label>
            <input
              type="text"
              className="input"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="e.g., February Follow-Up"
              required
            />
          </div>
          <div>
            <label className="label">Message Template</label>
            <textarea
              className="input min-h-[100px] resize-y"
              value={formData.messageTemplate}
              onChange={(e) => setFormData({ ...formData, messageTemplate: e.target.value })}
              placeholder="Hi {{firstName}}, this is SCL..."
              required
            />
            <div className="flex justify-between items-center mt-1">
              <p className="text-xs text-dark-500">
                Available variables: {'{{firstName}}'}, {'{{lastName}}'}, {'{{company}}'}
              </p>
              <SmsCounter text={formData.messageTemplate} />
            </div>
          </div>

          {/* Lead Selection */}
          <div>
            <label className="label flex items-center gap-2">
              <Users className="w-4 h-4" />
              Leads ({leadCount} selected)
            </label>
            {/* Tabs: Lists / Select / Upload CSV */}
            <div className="flex gap-1 mb-2">
              <button
                type="button"
                onClick={() => setLeadSource('lists')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${leadSource === 'lists' ? 'bg-scl-600/20 text-scl-400 font-medium' : 'text-dark-400 hover:text-dark-200'}`}
              >
                Select Lists
              </button>
              <button
                type="button"
                onClick={() => setLeadSource('select')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${leadSource === 'select' ? 'bg-scl-600/20 text-scl-400 font-medium' : 'text-dark-400 hover:text-dark-200'}`}
              >
                Select Leads
              </button>
              <button
                type="button"
                onClick={() => setLeadSource('csv')}
                className={`px-3 py-1.5 text-sm rounded-lg transition-colors ${leadSource === 'csv' ? 'bg-scl-600/20 text-scl-400 font-medium' : 'text-dark-400 hover:text-dark-200'}`}
              >
                Upload CSV
              </button>
            </div>

            {leadSource === 'lists' ? (
              <div className="bg-dark-800/50 rounded-lg border border-dark-700/50 p-3 space-y-2">
                {availableTags.length === 0 ? (
                  <p className="text-sm text-dark-500 text-center py-4">
                    No lists yet. Import a CSV with a list name to create one.
                  </p>
                ) : (
                  <div className="max-h-[250px] overflow-y-auto space-y-1">
                    {availableTags.map((tag: any) => (
                      <label
                        key={tag.id}
                        className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-dark-700/50 cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLists.has(tag.id)}
                          onChange={() => toggleList(tag.id)}
                          className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-scl-500 focus:ring-scl-500"
                        />
                        <div className="flex-1">
                          <span className="text-sm text-dark-200 font-medium">{tag.name}</span>
                        </div>
                        <span className="text-xs text-dark-500">{tag._count?.leads || 0} leads</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ) : leadSource === 'select' ? (
              <div className="bg-dark-800/50 rounded-lg border border-dark-700/50 p-3 space-y-3">
                {/* Lead filters */}
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    className="input py-1.5 text-sm flex-1 min-w-[140px]"
                    placeholder="Search leads..."
                    value={leadFilter.search}
                    onChange={(e) => setLeadFilter((f) => ({ ...f, search: e.target.value }))}
                  />
                  <select
                    className="input py-1.5 text-sm w-auto"
                    value={leadFilter.status}
                    onChange={(e) => setLeadFilter((f) => ({ ...f, status: e.target.value }))}
                  >
                    <option value="">All Statuses</option>
                    <option value="NEW">NEW</option>
                    <option value="CONTACTED">CONTACTED</option>
                    <option value="REPLIED">REPLIED</option>
                    <option value="INTERESTED">INTERESTED</option>
                    <option value="DOCS_REQUESTED">DOCS_REQUESTED</option>
                    <option value="SUBMITTED">SUBMITTED</option>
                    <option value="FUNDED">FUNDED</option>
                    <option value="NOT_INTERESTED">NOT_INTERESTED</option>
                    <option value="DNC">DNC</option>
                  </select>
                  <select
                    className="input py-1.5 text-sm w-auto"
                    value={leadFilter.tag}
                    onChange={(e) => setLeadFilter((f) => ({ ...f, tag: e.target.value }))}
                  >
                    <option value="">All Lists</option>
                    {availableTags.map((t: any) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    className="input py-1.5 text-sm w-[120px]"
                    placeholder="Source..."
                    value={leadFilter.source}
                    onChange={(e) => setLeadFilter((f) => ({ ...f, source: e.target.value }))}
                  />
                  <input
                    type="text"
                    className="input py-1.5 text-sm w-[80px]"
                    placeholder="State..."
                    value={leadFilter.state}
                    onChange={(e) => setLeadFilter((f) => ({ ...f, state: e.target.value }))}
                  />
                </div>
                {/* Select all toggle */}
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 text-sm text-dark-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectAll}
                      onChange={(e) => {
                        setSelectAll(e.target.checked);
                        if (e.target.checked) setSelectedLeadIds(new Set());
                      }}
                      className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-scl-500 focus:ring-scl-500"
                    />
                    Select all {totalAvailable} matching leads
                  </label>
                  {!selectAll && (
                    <button
                      type="button"
                      onClick={toggleAllVisible}
                      className="text-xs text-scl-400 hover:text-scl-300"
                    >
                      {selectedLeadIds.size === availableLeads.length ? 'Deselect all' : 'Select visible'}
                    </button>
                  )}
                </div>
                {/* Lead list */}
                {!selectAll && (
                  <div className="max-h-[200px] overflow-y-auto space-y-1">
                    {availableLeads.map((lead: any) => (
                      <label
                        key={lead.id}
                        className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-dark-700/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedLeadIds.has(lead.id)}
                          onChange={() => toggleLead(lead.id)}
                          className="w-3.5 h-3.5 rounded border-dark-600 bg-dark-800 text-scl-500 focus:ring-scl-500"
                        />
                        <span className="text-sm text-dark-200 flex-1">
                          {lead.firstName} {lead.lastName || ''}
                        </span>
                        <span className="text-xs text-dark-500 font-mono">{lead.phone}</span>
                      </label>
                    ))}
                    {availableLeads.length === 0 && (
                      <p className="text-sm text-dark-500 text-center py-4">No leads found</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-dark-800/50 rounded-lg border border-dark-700/50 p-3 space-y-3">
                {!csvImported ? (
                  <>
                    {/* File drop zone */}
                    <label className="flex flex-col items-center justify-center border-2 border-dashed border-dark-600 rounded-lg p-4 cursor-pointer hover:border-scl-500/50 transition-colors">
                      <Upload className="w-6 h-6 text-dark-500 mb-2" />
                      <span className="text-sm text-dark-400">
                        {csvFile ? csvFile.name : 'Drop CSV file here or click to browse'}
                      </span>
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleCsvSelect(f);
                        }}
                      />
                    </label>

                    {/* Column mapping */}
                    {csvPreview && (
                      <div className="space-y-2">
                        <p className="text-xs text-dark-400">{csvPreview.totalRows} rows found. Map columns:</p>
                        <div className="grid grid-cols-2 gap-2">
                          {['phone', 'firstName', 'lastName', 'email', 'company', 'state'].map((field) => (
                            <div key={field} className="flex items-center gap-2">
                              <span className="text-xs text-dark-400 w-20 shrink-0 capitalize">
                                {field === 'firstName' ? 'First Name' : field === 'lastName' ? 'Last Name' : field}
                                {field === 'phone' ? ' *' : ''}
                              </span>
                              <select
                                className="input py-1 text-xs flex-1"
                                value={csvMapping[field] || ''}
                                onChange={(e) => setCsvMapping((m) => ({ ...m, [field]: e.target.value }))}
                              >
                                <option value="">-- skip --</option>
                                {csvPreview.columns.map((col: string) => (
                                  <option key={col} value={col}>
                                    {col}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ))}
                        </div>
                        {/* Preview table */}
                        <div className="max-h-[120px] overflow-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b border-dark-700">
                                {csvPreview.columns.slice(0, 5).map((col: string) => (
                                  <th key={col} className="px-2 py-1 text-left text-dark-500 font-medium">
                                    {col}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {csvPreview.previewRows.slice(0, 3).map((row: any, i: number) => (
                                <tr key={i} className="border-b border-dark-700/30">
                                  {csvPreview.columns.slice(0, 5).map((col: string) => (
                                    <td key={col} className="px-2 py-1 text-dark-300 truncate max-w-[120px]">
                                      {row[col]}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div>
                          <label className="text-xs text-dark-400 mb-1 block">
                            List Name (will appear in &quot;Select Lists&quot; tab)
                          </label>
                          <input
                            type="text"
                            className="input py-1.5 text-sm w-full"
                            placeholder="e.g., March Marketing List"
                            value={csvListName}
                            onChange={(e) => setCsvListName(e.target.value)}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={handleCsvImport}
                          disabled={!csvMapping.phone || csvUploading}
                          className="btn-primary w-full text-sm"
                        >
                          {csvUploading ? 'Importing...' : `Import ${csvPreview.totalRows} Leads`}
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-4">
                    <CheckCircle className="w-8 h-8 text-green-400 mx-auto mb-2" />
                    <p className="text-sm text-dark-200 font-medium">{csvImported.count} leads ready</p>
                    <p className="text-xs text-dark-500 mt-1">Leads imported and will be added to this campaign</p>
                    <button
                      type="button"
                      onClick={() => {
                        setCsvImported(null);
                        setCsvFile(null);
                        setCsvPreview(null);
                      }}
                      className="text-xs text-scl-400 hover:text-scl-300 mt-2"
                    >
                      Upload different file
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="label">Sending Speed</label>
              <select
                className="input"
                value={formData.sendingSpeed}
                onChange={(e) => setFormData({ ...formData, sendingSpeed: parseInt(e.target.value) })}
              >
                <option value="1">1 / min (Safest)</option>
                <option value="2">2 / min</option>
                <option value="4">4 / min</option>
                <option value="10">10 / min</option>
                <option value="30">30 / min (Slow)</option>
                <option value="60">60 / min (Normal)</option>
                <option value="120">120 / min (Fast)</option>
                <option value="300">300 / min (Max)</option>
              </select>
            </div>
            <div>
              <label className="label">Daily Limit</label>
              <input
                type="number"
                className="input"
                min="0"
                value={formData.dailyLimit}
                onChange={(e) => setFormData({ ...formData, dailyLimit: parseInt(e.target.value) || 0 })}
                placeholder="0 = no limit"
              />
              <p className="text-xs text-dark-500 mt-1">0 = no limit</p>
            </div>
            <div>
              <label className="label">Schedule (Optional)</label>
              <input
                type="datetime-local"
                className="input"
                value={formData.scheduledAt}
                onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="btn-secondary">
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={createMutation.isPending || leadCount === 0}>
              {createMutation.isPending ? 'Creating...' : 'Create Campaign'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function CampaignStatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: any; class: string }> = {
    DRAFT: { icon: Clock, class: 'bg-dark-600/50 text-dark-300' },
    SCHEDULED: { icon: Clock, class: 'bg-blue-500/20 text-blue-400' },
    SENDING: { icon: Send, class: 'bg-yellow-500/20 text-yellow-400' },
    PAUSED: { icon: Pause, class: 'bg-orange-500/20 text-orange-400' },
    COMPLETED: { icon: CheckCircle, class: 'bg-green-500/20 text-green-400' },
    CANCELLED: { icon: XCircle, class: 'bg-red-500/20 text-red-400' },
  };

  const cfg = config[status] || config.DRAFT;
  const Icon = cfg.icon;

  return (
    <span className={`badge ${cfg.class}`}>
      <Icon className="w-3 h-3 mr-1" />
      {status}
    </span>
  );
}

/* ── Тултип разбивки Sent для кампаний ── */
function CampaignSentTooltip({ campaign }: { campaign: Campaign }) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState<{ x: number; y: number; flip: boolean }>({ x: 0, y: 0, flip: false });
  const triggerRef = useRef<HTMLTableCellElement>(null);
  const bd = campaign.sentBreakdown;
  const total = campaign.totalSent;

  const handleEnter = useCallback(() => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const flip = rect.top < 300;
      setPos({
        x: rect.left + rect.width / 2,
        y: flip ? rect.bottom : rect.top,
        flip,
      });
    }
    setShow(true);
  }, []);

  return (
    <td
      ref={triggerRef}
      className="table-cell text-center font-mono cursor-default"
      onMouseEnter={handleEnter}
      onMouseLeave={() => setShow(false)}
    >
      {total.toLocaleString()}

      {show && bd && total > 0 && (
        <div
          className="fixed z-[9999] bg-dark-800 border border-dark-600 rounded-lg shadow-xl p-4 pointer-events-none w-64 text-left"
          style={{
            left: pos.x,
            top: pos.y,
            transform: pos.flip
              ? 'translate(-50%, 0) translateY(8px)'
              : 'translate(-50%, -100%) translateY(-8px)',
          }}
        >
          <p className="text-[11px] font-semibold text-dark-300 uppercase tracking-wider mb-3">
            Campaign Breakdown
          </p>

          {/* Статусы */}
          <div className="space-y-1 mb-3">
            {[
              { label: 'Delivered', value: campaign.totalDelivered, color: '#10b981' },
              { label: 'Sent', value: campaign.totalSent - campaign.totalDelivered - campaign.totalFailed - campaign.totalBlocked, color: '#3b82f6' },
              { label: 'Failed', value: campaign.totalFailed, color: '#ef4444' },
              { label: 'Blocked', value: campaign.totalBlocked, color: '#a855f7' },
            ]
              .filter((s) => s.value > 0)
              .map((s) => (
                <div key={s.label} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                    <span className="text-dark-400">{s.label}</span>
                  </div>
                  <span className="text-dark-300 font-medium">
                    {s.value.toLocaleString()} ({total > 0 ? ((s.value / total) * 100).toFixed(0) : 0}%)
                  </span>
                </div>
              ))}
          </div>

          {/* По номерам */}
          {bd.numbers.length > 0 && (
            <div className="border-t border-dark-700 pt-2 mb-3">
              <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-1.5">By Number</p>
              <div className="space-y-1">
                {bd.numbers.map((n) => (
                  <div key={n.number} className="flex items-center justify-between text-[11px]">
                    <span className="text-dark-400 font-mono text-[10px]">📱 {n.number}</span>
                    <span className="text-dark-300 font-medium">{n.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* По репам */}
          {bd.reps.length > 0 && (
            <div className="border-t border-dark-700 pt-2">
              <p className="text-[10px] text-dark-500 uppercase tracking-wider mb-1.5">By Rep</p>
              <div className="space-y-1">
                {bd.reps.map((r) => (
                  <div key={r.name} className="flex items-center justify-between text-[11px]">
                    <span className="text-dark-400">👤 {r.name}</span>
                    <span className="text-dark-300 font-medium">{r.count.toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Пояснение */}
          <p className="text-[10px] text-dark-500 mt-3 leading-tight border-t border-dark-700 pt-2">
            Messages are distributed across all numbers in the pool by the sending engine.
          </p>

          {/* Стрелочка */}
          <div
            className={`absolute left-1/2 -translate-x-1/2 w-0 h-0 border-x-[6px] border-x-transparent ${
              pos.flip
                ? 'bottom-full border-b-[6px] border-b-dark-600'
                : 'top-full border-t-[6px] border-t-dark-600'
            }`}
          />
        </div>
      )}
    </td>
  );
}
