import { useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useDebounce } from '../hooks/useDebounce';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
  Search,
  Upload,
  Plus,
  Tag,
  UserPlus,
  Users,
  Trash2,
  MoreHorizontal,
  ChevronDown,
  Phone,
  Mail,
  X,
  ChevronLeft,
  ChevronRight,
  FileSpreadsheet,
  Copy,
  ExternalLink,
  Ban,
  MessageSquare,
  ArrowRightLeft,
  Play,
  Zap,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { clsx } from 'clsx';
import LeadDetailDrawer from '../components/leads/LeadDetailDrawer';

const STATUSES = ['NEW', 'CONTACTED', 'REPLIED', 'INTERESTED', 'DOCS_REQUESTED', 'SUBMITTED', 'FUNDED', 'NOT_INTERESTED', 'DNC'];

export default function LeadsPage() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showImport, setShowImport] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; lead: any } | null>(null);
  const ctxMenuRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [showEnroll, setShowEnroll] = useState(false);
  const [enrollLeadId, setEnrollLeadId] = useState<string | null>(null);
  const [tagPickerLead, setTagPickerLead] = useState<any | null>(null);
  const tagPickerRef = useRef<HTMLDivElement>(null);
  const [detailLeadId, setDetailLeadId] = useState<string | null>(null);

  // Close menu on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenuId(null);
      }
      if (ctxMenuRef.current && !ctxMenuRef.current.contains(e.target as Node)) {
        setCtxMenu(null);
      }
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setTagPickerLead(null);
      }
    };
    if (openMenuId || ctxMenu || tagPickerLead) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [openMenuId, ctxMenu]);

  const { data, isLoading } = useQuery({
    queryKey: ['leads', debouncedSearch, statusFilter, page],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', '50');
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      const { data } = await api.get(`/leads?${params}`);
      return data;
    },
  });

  const leads = data?.leads || [];
  const total = data?.pagination?.total || 0;
  const totalPages = data?.pagination?.pages || 1;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === leads.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(leads.map((l: any) => l.id)));
    }
  };

  const bulkMutation = useMutation({
    mutationFn: (payload: any) => api.post('/leads/bulk', payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setSelected(new Set());
      toast.success('Bulk action completed');
    },
    onError: () => toast.error('Bulk action failed'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/leads/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead deleted');
    },
    onError: () => toast.error('Delete failed'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.put(`/leads/${id}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Status updated');
    },
    onError: () => toast.error('Update failed'),
  });

  const addTagMutation = useMutation({
    mutationFn: ({ leadId, tagId }: { leadId: string; tagId: string }) =>
      api.post(`/leads/${leadId}/tags`, { tagId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Tag added');
      setTagPickerLead(null);
    },
    onError: () => toast.error('Failed to add tag'),
  });

  const removeTagMutation = useMutation({
    mutationFn: ({ leadId, tagId }: { leadId: string; tagId: string }) =>
      api.delete(`/leads/${leadId}/tags/${tagId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Tag removed');
    },
    onError: () => toast.error('Failed to remove tag'),
  });

  const { data: tagsData } = useQuery({
    queryKey: ['tags'],
    queryFn: async () => {
      const { data } = await api.get('/settings/tags');
      return data;
    },
  });
  const allTags = tagsData?.tags || [];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50">Leads</h1>
          <p className="text-sm text-dark-400 mt-1">{total} total leads</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowImport(true)} className="btn-ghost flex items-center gap-2">
            <Upload className="w-4 h-4" />
            Import CSV
          </button>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" />
            Add Lead
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-dark-500" />
          <input
            type="text"
            placeholder="Search by name, phone, email..."
            className="input pl-10"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="input w-auto"
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {/* Bulk Actions Bar */}
      {selected.size > 0 && (
        <div className="flex items-center gap-3 bg-scl-600/10 border border-scl-600/30 rounded-lg px-4 py-2.5">
          <span className="text-sm font-medium text-scl-300">
            {selected.size} selected
          </span>
          <div className="flex items-center gap-2 ml-auto">
            <select
              className="input w-auto text-sm py-1.5"
              defaultValue=""
              onChange={(e) => {
                if (e.target.value) {
                  bulkMutation.mutate({
                    action: 'change_status',
                    leadIds: Array.from(selected),
                    data: { status: e.target.value },
                  });
                }
              }}
            >
              <option value="">Change Status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
            <button
              onClick={() => setShowEnroll(true)}
              className="btn-ghost text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1.5"
            >
              <Zap className="w-4 h-4" />
              Start Automation
            </button>
            <button
              onClick={() =>
                bulkMutation.mutate({
                  action: 'suppress',
                  leadIds: Array.from(selected),
                })
              }
              className="btn-ghost text-sm text-red-400 hover:text-red-300"
            >
              <Trash2 className="w-4 h-4" />
              Suppress
            </button>
            <button
              onClick={() => setSelected(new Set())}
              className="btn-ghost text-sm"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-700/50">
                <th className="table-th w-10">
                  <input
                    type="checkbox"
                    checked={selected.size === leads.length && leads.length > 0}
                    onChange={toggleAll}
                    className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-scl-500 focus:ring-scl-500"
                  />
                </th>
                <th className="table-th">Name</th>
                <th className="table-th">Phone</th>
                <th className="table-th">Status</th>
                <th className="table-th">Source</th>
                <th className="table-th">Tags</th>
                <th className="table-th">Added</th>
                <th className="table-th w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                [...Array(10)].map((_, i) => (
                  <tr key={i}>
                    {[...Array(8)].map((_, j) => (
                      <td key={j} className="table-td">
                        <div className="h-4 bg-dark-700 rounded animate-pulse" />
                      </td>
                    ))}
                  </tr>
                ))}
              {!isLoading && leads.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-14 h-14 rounded-2xl bg-dark-800/80 flex items-center justify-center">
                        <Users className="w-7 h-7 text-dark-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-dark-300">No leads yet</p>
                        <p className="text-xs text-dark-500 mt-1">Add your first lead to get started with campaigns</p>
                      </div>
                      <div className="flex gap-2 mt-1">
                        <button onClick={() => setShowCreate(true)} className="btn-primary text-xs py-1.5 px-3 flex items-center gap-1.5">
                          <Plus className="w-3.5 h-3.5" /> Add Lead
                        </button>
                        <button onClick={() => setShowImport(true)} className="btn-secondary text-xs py-1.5 px-3 flex items-center gap-1.5">
                          <Upload className="w-3.5 h-3.5" /> Import CSV
                        </button>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
              {leads.map((lead: any) => (
                <tr
                  key={lead.id}
                  className="border-b border-dark-800/50 hover:bg-dark-800/30 transition-colors cursor-pointer"
                  onClick={() => setDetailLeadId(lead.id)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setCtxMenu({ x: e.clientX, y: e.clientY, lead });
                    setOpenMenuId(null);
                  }}
                >
                  <td className="table-td">
                    <input
                      type="checkbox"
                      checked={selected.has(lead.id)}
                      onChange={() => toggleSelect(lead.id)}
                      className="w-4 h-4 rounded border-dark-600 bg-dark-800 text-scl-500 focus:ring-scl-500"
                    />
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-dark-700 flex items-center justify-center text-xs font-semibold text-dark-300">
                        {lead.firstName?.[0]}{lead.lastName?.[0] || ''}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-dark-200">
                          {lead.firstName} {lead.lastName || ''}
                        </p>
                        {lead.email && (
                          <p className="text-xs text-dark-500">{lead.email}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="table-td">
                    <span className="text-sm text-dark-300 font-mono">{lead.phone}</span>
                  </td>
                  <td className="table-td">
                    <StatusBadge status={lead.status} />
                  </td>
                  <td className="table-td">
                    <span className="text-sm text-dark-400">{lead.source || '—'}</span>
                  </td>
                  <td className="table-td">
                    <div className="flex items-center gap-1 relative">
                      {lead.tags?.slice(0, 3).map((lt: any) => (
                        <span
                          key={lt.tag.id}
                          className="text-[10px] px-1.5 py-0.5 rounded cursor-pointer group/tag inline-flex items-center gap-0.5"
                          style={{
                            backgroundColor: lt.tag.color + '33',
                            color: lt.tag.color,
                          }}
                          title={`Click to remove "${lt.tag.name}"`}
                          onClick={(e) => { e.stopPropagation(); removeTagMutation.mutate({ leadId: lead.id, tagId: lt.tag.id }); }}
                        >
                          {lt.tag.name}
                          <X className="w-2.5 h-2.5 opacity-0 group-hover/tag:opacity-100 transition-opacity" />
                        </span>
                      ))}
                      <button
                        onClick={(e) => { e.stopPropagation(); setTagPickerLead(tagPickerLead?.id === lead.id ? null : lead); }}
                        className="w-5 h-5 rounded flex items-center justify-center text-dark-500 hover:text-scl-400 hover:bg-scl-600/10 transition-colors"
                        title="Add tag"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                      {tagPickerLead?.id === lead.id && (
                        <div
                          ref={tagPickerRef}
                          className="absolute left-0 top-full mt-1 z-50 w-44 bg-dark-800 border border-dark-700 rounded-lg shadow-xl py-1 max-h-48 overflow-y-auto"
                        >
                          {allTags.length === 0 && (
                            <p className="text-xs text-dark-500 px-3 py-2">No tags found. Create tags in Settings.</p>
                          )}
                          {allTags.filter((t: any) => !lead.tags?.some((lt: any) => lt.tag.id === t.id)).map((tag: any) => (
                            <button
                              key={tag.id}
                              onClick={(e) => { e.stopPropagation(); addTagMutation.mutate({ leadId: lead.id, tagId: tag.id }); }}
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-dark-700/50 flex items-center gap-2"
                            >
                              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: tag.color }} />
                              <span className="text-dark-300">{tag.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="table-td">
                    <span className="text-sm text-dark-400">
                      {format(new Date(lead.createdAt), 'MMM d')}
                    </span>
                  </td>
                  <td className="table-td">
                    <div className="relative">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setOpenMenuId(openMenuId === lead.id ? null : lead.id);
                        }}
                        className="btn-ghost p-1"
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>
                      {openMenuId === lead.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 top-full mt-1 w-48 bg-dark-800 border border-dark-700 rounded-lg shadow-xl z-50 py-1"
                        >
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              statusMutation.mutate({ id: lead.id, status: 'CONTACTED' });
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
                          >
                            <Phone className="w-3.5 h-3.5" /> Mark Contacted
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              statusMutation.mutate({ id: lead.id, status: 'DNC' });
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
                          >
                            <X className="w-3.5 h-3.5" /> Mark DNC
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              navigate(`/inbox?lead=${lead.id}`);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
                          >
                            <Mail className="w-3.5 h-3.5" /> Open Conversation
                          </button>
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              setEnrollLeadId(lead.id);
                              setShowEnroll(true);
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-purple-300 hover:bg-dark-700/50 flex items-center gap-2"
                          >
                            <Zap className="w-3.5 h-3.5" /> Start Automation
                          </button>
                          <div className="border-t border-dark-700 my-1" />
                          <button
                            onClick={() => {
                              setOpenMenuId(null);
                              if (window.confirm('Delete this lead? This action cannot be undone.')) {
                                deleteMutation.mutate(lead.id);
                              }
                            }}
                            className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-dark-700/50 flex items-center gap-2"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete Lead
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Right-Click Context Menu */}
        {ctxMenu && (
          <div
            ref={ctxMenuRef}
            className="fixed z-[100] w-52 bg-dark-800 border border-dark-700 rounded-lg shadow-2xl py-1 animate-in fade-in"
            style={{ left: ctxMenu.x, top: ctxMenu.y }}
          >
            <button
              onClick={() => { navigate(`/inbox?lead=${ctxMenu.lead.id}`); setCtxMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
            >
              <MessageSquare className="w-3.5 h-3.5" /> Open Conversation
            </button>
            <button
              onClick={() => { navigate(`/pipeline?lead=${ctxMenu.lead.id}`); setCtxMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
            >
              <ArrowRightLeft className="w-3.5 h-3.5" /> View in Pipeline
            </button>
            <button
              onClick={() => { navigator.clipboard.writeText(ctxMenu.lead.phone); toast.success('Phone copied'); setCtxMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
            >
              <Copy className="w-3.5 h-3.5" /> Copy Phone
            </button>
            <button
              onClick={() => { setEnrollLeadId(ctxMenu.lead.id); setShowEnroll(true); setCtxMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm text-purple-300 hover:bg-dark-700/50 flex items-center gap-2"
            >
              <Zap className="w-3.5 h-3.5" /> Start Automation
            </button>
            <div className="border-t border-dark-700 my-1" />
            <button
              onClick={() => { statusMutation.mutate({ id: ctxMenu.lead.id, status: 'CONTACTED' }); setCtxMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm text-dark-200 hover:bg-dark-700/50 flex items-center gap-2"
            >
              <Phone className="w-3.5 h-3.5" /> Mark Contacted
            </button>
            <button
              onClick={() => { statusMutation.mutate({ id: ctxMenu.lead.id, status: 'DNC' }); setCtxMenu(null); }}
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-dark-700/50 flex items-center gap-2"
            >
              <Ban className="w-3.5 h-3.5" /> Mark DNC
            </button>
            <div className="border-t border-dark-700 my-1" />
            <button
              onClick={() => {
                setCtxMenu(null);
                if (window.confirm('Delete this lead?')) deleteMutation.mutate(ctxMenu.lead.id);
              }}
              className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-dark-700/50 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Lead
            </button>
          </div>
        )}

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-dark-700/50">
          <p className="text-sm text-dark-500">
            Showing {leads.length} of {total}
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="btn-ghost p-2 disabled:opacity-30"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm text-dark-300">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="btn-ghost p-2 disabled:opacity-30"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Import Modal */}
      {showImport && <ImportModal onClose={() => setShowImport(false)} />}

      {/* Create Modal */}
      {showCreate && <CreateLeadModal onClose={() => setShowCreate(false)} />}

      {/* Enroll Automation Modal */}
      {showEnroll && (
        <EnrollAutomationModal
          leadIds={enrollLeadId ? [enrollLeadId] : Array.from(selected)}
          onClose={() => { setShowEnroll(false); setEnrollLeadId(null); }}
          onSuccess={() => { setSelected(new Set()); setEnrollLeadId(null); }}
        />
      )}

      {/* Lead Detail Drawer */}
      {detailLeadId && (
        <LeadDetailDrawer leadId={detailLeadId} onClose={() => setDetailLeadId(null)} />
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    NEW: 'bg-blue-500/20 text-blue-300',
    CONTACTED: 'bg-yellow-500/20 text-yellow-300',
    REPLIED: 'bg-scl-500/20 text-scl-300',
    INTERESTED: 'bg-emerald-500/20 text-emerald-300',
    DOCS_REQUESTED: 'bg-purple-500/20 text-purple-300',
    SUBMITTED: 'bg-cyan-500/20 text-cyan-300',
    FUNDED: 'bg-green-500/20 text-green-300',
    NOT_INTERESTED: 'bg-dark-700 text-dark-400',
    DNC: 'bg-red-500/20 text-red-300',
  };
  return (
    <span className={clsx('badge', styles[status] || 'badge-info')}>
      {status?.replace(/_/g, ' ')}
    </span>
  );
}

function ImportModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'importing' | 'done'>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const queryClient = useQueryClient();

  // Preview data from backend
  const [previewData, setPreviewData] = useState<{
    totalRows: number;
    columns: string[];
    mappingSuggestions: Record<string, string | null>;
    previewRows: Record<string, string>[];
  } | null>(null);

  // Column mapping (field -> csv column name)
  const [mapping, setMapping] = useState<Record<string, string>>({});

  // Import results
  const [importResult, setImportResult] = useState<{
    imported: number;
    duplicates: number;
    errors: number;
    total: number;
    errorDetails: string[];
  } | null>(null);

  const LEAD_FIELDS = [
    { key: 'phone', label: 'Phone *', required: true },
    { key: 'firstName', label: 'First Name', required: false },
    { key: 'lastName', label: 'Last Name', required: false },
    { key: 'email', label: 'Email', required: false },
    { key: 'company', label: 'Company', required: false },
    { key: 'city', label: 'City', required: false },
    { key: 'state', label: 'State', required: false },
    { key: 'source', label: 'Source', required: false },
  ];

  // Step 1 → Step 2: Upload & preview
  const previewMutation = useMutation({
    mutationFn: (formData: FormData) =>
      api.post('/leads/preview', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: (res) => {
      const data = res.data;
      setPreviewData(data);
      // Apply auto-mapping suggestions
      const autoMapping: Record<string, string> = {};
      for (const [field, col] of Object.entries(data.mappingSuggestions)) {
        if (col) autoMapping[field] = col as string;
      }
      setMapping(autoMapping);
      setStep('mapping');
    },
    onError: () => toast.error('Failed to parse CSV file'),
  });

  // Step 2 → Step 3: Import with mapping
  const importMutation = useMutation({
    mutationFn: (formData: FormData) =>
      api.post('/leads/import-mapped', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      }),
    onSuccess: (res) => {
      setImportResult(res.data);
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      setStep('done');
    },
    onError: () => {
      toast.error('Import failed');
      setStep('mapping');
    },
  });

  const handleUpload = () => {
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    previewMutation.mutate(formData);
  };

  const handleImport = () => {
    if (!file || !mapping.phone) return;
    setStep('importing');
    const formData = new FormData();
    formData.append('file', file);
    formData.append('mapping', JSON.stringify(mapping));
    importMutation.mutate(formData);
  };

  const handleFileDrop = (f: File) => {
    if (f?.name.endsWith('.csv')) {
      setFile(f);
      setStep('upload');
      setPreviewData(null);
      setMapping({});
      setImportResult(null);
    } else {
      toast.error('Please upload a .csv file');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-dark-700/50">
          <div>
            <h3 className="text-lg font-bold text-dark-50">Import Leads</h3>
            <p className="text-xs text-dark-500 mt-0.5">
              {step === 'upload' && 'Step 1 of 3 — Upload CSV file'}
              {step === 'mapping' && 'Step 2 of 3 — Map columns to fields'}
              {step === 'importing' && 'Step 3 of 3 — Importing...'}
              {step === 'done' && 'Import Complete'}
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 px-6 py-3 bg-dark-800/30">
          {['Upload', 'Map Fields', 'Import'].map((label, i) => {
            const stepIdx = ['upload', 'mapping', 'importing', 'done'].indexOf(step);
            const isActive = i <= stepIdx;
            const isCurrent = i === Math.min(stepIdx, 2);
            return (
              <div key={label} className="flex items-center gap-2 flex-1">
                <div className={clsx(
                  'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors',
                  isCurrent ? 'bg-scl-600 text-white' :
                  isActive ? 'bg-scl-600/30 text-scl-300' :
                  'bg-dark-700 text-dark-500'
                )}>
                  {i + 1}
                </div>
                <span className={clsx(
                  'text-xs font-medium',
                  isActive ? 'text-dark-200' : 'text-dark-500'
                )}>{label}</span>
                {i < 2 && (
                  <div className={clsx(
                    'flex-1 h-px',
                    isActive && i < stepIdx ? 'bg-scl-600/50' : 'bg-dark-700'
                  )} />
                )}
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">

          {/* Step 1: Upload */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleFileDrop(f);
                }}
                className={clsx(
                  'border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer',
                  isDragging
                    ? 'border-scl-500 bg-scl-500/10'
                    : 'border-dark-600 hover:border-dark-500'
                )}
                onClick={() => {
                  const input = document.createElement('input');
                  input.type = 'file';
                  input.accept = '.csv';
                  input.onchange = (e) => {
                    const f = (e.target as HTMLInputElement).files?.[0];
                    if (f) handleFileDrop(f);
                  };
                  input.click();
                }}
              >
                <FileSpreadsheet className="w-12 h-12 mx-auto text-dark-500 mb-3" />
                {file ? (
                  <div>
                    <p className="text-sm text-scl-300 font-medium">{file.name}</p>
                    <p className="text-xs text-dark-500 mt-1">
                      {(file.size / 1024).toFixed(1)} KB — Click to change file
                    </p>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-dark-300 font-medium">Drop CSV file here or click to browse</p>
                    <p className="text-xs text-dark-500 mt-1">
                      Required column: phone. Optional: firstName, lastName, email, city, state, source, company
                    </p>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Step 2: Mapping & Preview */}
          {step === 'mapping' && previewData && (
            <div className="space-y-5">
              {/* Column Mapping */}
              <div>
                <h4 className="text-sm font-semibold text-dark-100 mb-3">Column Mapping</h4>
                <p className="text-xs text-dark-400 mb-3">
                  Map your CSV columns to lead fields. Columns were auto-detected where possible.
                </p>
                <div className="grid grid-cols-2 gap-3">
                  {LEAD_FIELDS.map((field) => (
                    <div key={field.key} className="flex items-center gap-2">
                      <label className="text-xs font-medium text-dark-300 w-24 shrink-0">
                        {field.label}
                      </label>
                      <select
                        className="input text-sm py-1.5 flex-1"
                        value={mapping[field.key] || ''}
                        onChange={(e) => setMapping(prev => ({
                          ...prev,
                          [field.key]: e.target.value || '',
                        }))}
                      >
                        <option value="">— Skip —</option>
                        {previewData.columns.map((col) => (
                          <option key={col} value={col}>{col}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>

              {/* Data Preview Table */}
              <div>
                <h4 className="text-sm font-semibold text-dark-100 mb-2">
                  Preview ({previewData.totalRows.toLocaleString()} rows total, showing first {previewData.previewRows.length})
                </h4>
                <div className="overflow-x-auto rounded-lg border border-dark-700/50">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-dark-800/60">
                        <th className="px-3 py-2 text-left text-dark-400 font-medium">#</th>
                        {previewData.columns.map((col) => {
                          const mappedTo = Object.entries(mapping).find(([_, v]) => v === col)?.[0];
                          return (
                            <th key={col} className="px-3 py-2 text-left text-dark-400 font-medium whitespace-nowrap">
                              <span>{col}</span>
                              {mappedTo && (
                                <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-scl-600/20 text-scl-300 font-semibold">
                                  → {mappedTo}
                                </span>
                              )}
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody>
                      {previewData.previewRows.map((row, i) => (
                        <tr key={i} className="border-t border-dark-800/50">
                          <td className="px-3 py-1.5 text-dark-500">{i + 1}</td>
                          {previewData.columns.map((col) => (
                            <td key={col} className="px-3 py-1.5 text-dark-300 whitespace-nowrap max-w-[180px] truncate">
                              {row[col] || '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Importing Progress */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-12 space-y-5">
              <div className="w-16 h-16 rounded-full border-4 border-scl-600/30 border-t-scl-500 animate-spin" />
              <div className="text-center">
                <p className="text-sm font-medium text-dark-200">Importing leads...</p>
                <p className="text-xs text-dark-500 mt-1">
                  Processing {previewData?.totalRows.toLocaleString() || '?'} rows. This may take a moment.
                </p>
              </div>
              {/* Progress bar (indeterminate) */}
              <div className="w-64 h-1.5 bg-dark-700 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-scl-600 to-scl-400 rounded-full"
                  style={{
                    width: '40%',
                    animation: 'shimmer 1.5s infinite ease-in-out',
                    backgroundSize: '200% 100%',
                  }}
                />
              </div>
            </div>
          )}

          {/* Step 4: Done */}
          {step === 'done' && importResult && (
            <div className="flex flex-col items-center py-8 space-y-5">
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center">
                <FileSpreadsheet className="w-7 h-7 text-green-400" />
              </div>
              <div className="text-center">
                <h4 className="text-lg font-bold text-dark-50">Import Complete</h4>
                <p className="text-sm text-dark-400 mt-1">
                  {importResult.total.toLocaleString()} rows processed
                </p>
              </div>
              <div className="grid grid-cols-3 gap-4 w-full max-w-sm">
                <div className="text-center p-3 bg-dark-800/50 rounded-lg">
                  <p className="text-lg font-bold text-green-400">{importResult.imported}</p>
                  <p className="text-xs text-dark-400">Imported</p>
                </div>
                <div className="text-center p-3 bg-dark-800/50 rounded-lg">
                  <p className="text-lg font-bold text-yellow-400">{importResult.duplicates}</p>
                  <p className="text-xs text-dark-400">Duplicates</p>
                </div>
                <div className="text-center p-3 bg-dark-800/50 rounded-lg">
                  <p className="text-lg font-bold text-red-400">{importResult.errors}</p>
                  <p className="text-xs text-dark-400">Errors</p>
                </div>
              </div>
              {importResult.errorDetails.length > 0 && (
                <div className="w-full max-w-sm text-xs text-dark-500 bg-dark-800/30 rounded-lg p-3 space-y-1">
                  <p className="font-medium text-dark-400 mb-1">Error details (first 10):</p>
                  {importResult.errorDetails.map((err, i) => (
                    <p key={i}>• {err}</p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex justify-between items-center px-6 py-4 border-t border-dark-700/50">
          <div>
            {step === 'mapping' && (
              <button onClick={() => setStep('upload')} className="btn-ghost text-sm">
                ← Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-ghost">
              {step === 'done' ? 'Close' : 'Cancel'}
            </button>
            {step === 'upload' && (
              <button
                onClick={handleUpload}
                disabled={!file || previewMutation.isPending}
                className="btn-primary"
              >
                {previewMutation.isPending ? 'Parsing...' : 'Preview & Map →'}
              </button>
            )}
            {step === 'mapping' && (
              <button
                onClick={handleImport}
                disabled={!mapping.phone}
                className="btn-primary"
              >
                Import {previewData?.totalRows.toLocaleString()} Leads
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function CreateLeadModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    city: '',
    state: '',
    source: '',
  });
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/leads', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Lead created');
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.firstName || !form.phone) return;
    createMutation.mutate(form);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-dark-50">Add Lead</h3>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">First Name *</label>
              <input className="input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} required />
            </div>
            <div>
              <label className="label">Last Name</label>
              <input className="input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Phone *</label>
            <input className="input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required placeholder="+1XXXXXXXXXX" />
          </div>
          <div>
            <label className="label">Email</label>
            <input className="input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">City</label>
              <input className="input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <label className="label">State</label>
              <input className="input" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
          </div>
          <div>
            <label className="label">Source</label>
            <input className="input" value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} placeholder="e.g., Website, Referral" />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button type="submit" disabled={createMutation.isPending} className="btn-primary">
              {createMutation.isPending ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Enroll in Automation Modal ─── */
function EnrollAutomationModal({ leadIds, onClose, onSuccess }: { leadIds: string[]; onClose: () => void; onSuccess: () => void }) {
  const [selectedRule, setSelectedRule] = useState<string>('');
  const queryClient = useQueryClient();

  const { data } = useQuery({
    queryKey: ['automation-rules-active'],
    queryFn: async () => {
      const { data } = await api.get('/automation/rules');
      return data;
    },
  });

  const rules = (data?.rules || []).filter((r: any) => r.isActive);

  const startMutation = useMutation({
    mutationFn: () => {
      if (leadIds.length === 1) {
        return api.post('/automation/start', { ruleId: selectedRule, leadId: leadIds[0] });
      }
      return api.post('/automation/start-bulk', { ruleId: selectedRule, leadIds });
    },
    onSuccess: () => {
      const count = leadIds.length;
      toast.success(`Automation started for ${count} lead${count > 1 ? 's' : ''}`);
      queryClient.invalidateQueries({ queryKey: ['automations'] });
      onSuccess();
      onClose();
    },
    onError: (err: any) => toast.error(err.response?.data?.error || 'Failed to start automation'),
  });

  const selected = rules.find((r: any) => r.id === selectedRule);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="card w-full max-w-md p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-bold text-dark-50 flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              Start Automation
            </h3>
            <p className="text-xs text-dark-500 mt-1">
              Enroll {leadIds.length} lead{leadIds.length > 1 ? 's' : ''} in an automation sequence
            </p>
          </div>
          <button onClick={onClose} className="btn-ghost p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="label">Automation Rule</label>
            {rules.length === 0 ? (
              <p className="text-sm text-dark-400 bg-dark-800/50 rounded-lg p-3">
                No active automation rules. Create one on the Automation page first.
              </p>
            ) : (
              <select
                className="input"
                value={selectedRule}
                onChange={(e) => setSelectedRule(e.target.value)}
              >
                <option value="">Select a rule...</option>
                {rules.map((rule: any) => (
                  <option key={rule.id} value={rule.id}>
                    {rule.name} ({rule.type.replace(/_/g, ' ')}) — {rule.templates?.length || 0} steps
                  </option>
                ))}
              </select>
            )}
          </div>

          {selected && (
            <div className="bg-dark-800/50 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-dark-300">{selected.name}</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">
                  {selected.type.replace(/_/g, ' ')}
                </span>
              </div>
              <p className="text-xs text-dark-500">
                {selected.templates?.length || 0} steps · Sends {selected.sendAfterHour}:00–{selected.sendBeforeHour}:00
                {selected.sendOnWeekends ? '' : ' · Weekdays only'}
              </p>
              {selected.templates?.length > 0 && (
                <div className="text-xs text-dark-500 border-t border-dark-700/50 pt-2 mt-2">
                  <p className="text-dark-400 font-medium mb-1">Sequence preview:</p>
                  {selected.templates.slice(0, 3).map((t: any, i: number) => (
                    <p key={i} className="truncate">
                      Step {t.sequenceOrder}: {t.messageTemplate.slice(0, 60)}...
                      {i > 0 && <span className="text-dark-600"> (day {t.delayDays})</span>}
                    </p>
                  ))}
                  {selected.templates.length > 3 && (
                    <p className="text-dark-600">+{selected.templates.length - 3} more steps</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
            <button
              onClick={() => startMutation.mutate()}
              disabled={!selectedRule || startMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              <Play className="w-4 h-4" />
              {startMutation.isPending ? 'Starting...' : `Start for ${leadIds.length} Lead${leadIds.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
